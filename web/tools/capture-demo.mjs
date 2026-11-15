// Records real gameplay clips for the gameplay demonstration (DevTools screencast → JPEG frames → FFmpeg H.264).
// Output: assets-src/hf-demo/assets/clips/<name>.mp4 (1920×1080, 30 fps). Usage: CF_GPU=high node tools/capture-demo.mjs [only…]
import { mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, sleep } from './cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets-src/hf-demo/assets/clips');
const tmp = join(root, '..', '.tmp', 'demo-frames');
mkdirSync(outDir, { recursive: true });
const only = process.argv.slice(2);
const want = (n) => !only.length || only.includes(n);
const base = 'http://localhost:5173/';
const b = await openBrowser({ width: 1920, height: 1080 });
const ev = (e) => b.evaluate(e);
const api = (e) => ev(`window.__cf.api.${e}`);
let frames = [];
b.on('Page.screencastFrame', (p) => { frames.push({ data: p.data, t: p.metadata.timestamp }); b.send('Page.screencastFrameAck', { sessionId: p.sessionId }); });

async function record(name, seconds, during) {
  if (!want(name)) { if (during) await during(); return; }
  frames = [];
  await b.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const t0 = Date.now();
  if (during) await during();
  const left = seconds * 1000 - (Date.now() - t0);
  if (left > 0) await sleep(left);
  await b.send('Page.stopScreencast');
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  frames.forEach((f, i) => writeFileSync(join(tmp, `${String(i).padStart(5, '0')}.jpg`), Buffer.from(f.data, 'base64')));
  const span = frames.length > 1 ? frames[frames.length - 1].t - frames[0].t : seconds;
  const fps = Math.max(5, (frames.length - 1) / Math.max(0.5, span));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', fps.toFixed(3), '-i', join(tmp, '%05d.jpg'), '-vf', 'scale=1920:1080:flags=lanczos,fps=30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-an', join(outDir, `${name}.mp4`)]);
  console.log(`  ${name}: ${frames.length} frames over ${span.toFixed(1)} s (${fps.toFixed(1)} fps source)`);
}

// Smooth free-camera dolly through [pos, look] keyframes over `seconds` (runs in the page, per animation frame).
const DOLLY = `window.__dolly = (keys, seconds) => new Promise((res) => {
  const t0 = performance.now(), ss = (u) => u * u * (3 - 2 * u);
  const step = () => {
    const u = Math.min(1, (performance.now() - t0) / (seconds * 1000)), f = ss(u) * (keys.length - 1);
    const i = Math.min(keys.length - 2, Math.floor(f)), k = f - i;
    const L = (a, b) => a.map((v, j) => v + (b[j] - v) * k);
    window.__cf.api.freeCam(L(keys[i][0], keys[i + 1][0]), L(keys[i][1], keys[i + 1][1]));
    if (u < 1) requestAnimationFrame(step); else res();
  };
  step();
});`;
const dolly = async (keys, s) => { await ev(DOLLY); await ev(`window.__dolly(${JSON.stringify(keys)}, ${s})`); };
/** Cutscene clip by stepping cutscene time (paused) per output frame; cues fire in order as time advances. */
async function recordCut(name, t0, seconds) {
  if (!want(name)) return;
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const N = Math.round(seconds * 30);
  for (let i = 0; i < N; i++) {
    await api(`seekCutscene(${t0 + i / 30}, false, true)`);
    await ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    writeFileSync(join(tmp, `${String(i).padStart(5, '0')}.jpg`), Buffer.from((await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 })).result.data, 'base64'));
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(tmp, '%05d.jpg'), '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p', '-an', join(outDir, `${name}.mp4`)]);
  console.log(`  ${name}: ${N} stepped cutscene frames`);
}
/** Smooth dolly: steps the free camera per output frame and screenshots each one (exact 30 fps, no dropped frames). */
async function recordDolly(name, keys, seconds) {
  if (!want(name)) return;
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const N = Math.round(seconds * 30), ss = (u) => u * u * (3 - 2 * u);
  for (let i = 0; i < N; i++) {
    const f = ss(i / (N - 1)) * (keys.length - 1), j = Math.min(keys.length - 2, Math.floor(f)), k = f - j;
    const L = (a, b) => a.map((v, q) => v + (b[q] - v) * k);
    await api(`freeCam(${JSON.stringify(L(keys[j][0], keys[j + 1][0]))}, ${JSON.stringify(L(keys[j][1], keys[j + 1][1]))})`);
    await ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const shot = (await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 })).result.data;
    writeFileSync(join(tmp, `${String(i).padStart(5, '0')}.jpg`), Buffer.from(shot, 'base64'));
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', join(tmp, '%05d.jpg'), '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-an', join(outDir, `${name}.mp4`)]);
  console.log(`  ${name}: ${N} stepped frames (${seconds} s)`);
}
const release = () => api('freeCam(null)');
const add = (p, d) => p.map((v, i) => v + (d[i] ?? 0));

try {
  // ---------------- Session A: menu + opening ----------------
  if (!only.length || only.some((n) => /menu|space|land|steps/.test(n))) {
    await b.goto(`${base}?shot=menu&e2e`);
    await sleep(2000);
    await record('menu_orbit', 5);
    await record('menu_select', 4, async () => {
      await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1200, y: 520 });
      await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1200, y: 520, button: 'left', clickCount: 1 });
      await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1200, y: 520, button: 'left', clickCount: 1 });
    });
    await ev("document.querySelector('.mission-sidebar .launch').click()");
    const waitCut = async (id) => { for (let i = 0; i < 80; i++) { if (await api('state().cutId') === id) return; await sleep(250); } };
    for (let i = 0; i < 40 && !(await api('state().cutId')); i++) await sleep(250);
    if (await api('state().cutId') !== 'opening_space') { await api('seekCutscene(1e9, true)'); await sleep(800); await waitCut('opening_space'); }
    console.log('  at', await api('state().cutId'));
    await api('seekCutscene(4, true, true)'); await sleep(400);
    await record('space_journey', 5);
    await api('seekCutscene(30, true, true)'); await sleep(400);
    await record('space_orbit', 4);
    await api('seekCutscene(55.5, true, true)'); await sleep(400);
    await record('space_entry', 5);
    await api('seekCutscene(1e9, true)'); await waitCut('opening_landing');
    await api('seekCutscene(4, true, true)'); await sleep(400);
    await record('land_chutes', 4);
    await recordCut('land_touchdown', 19.5, 6);
    await recordCut('land_steps', 36, 6);
  }

  // ---------------- Session B: free-roam gameplay ----------------
  await b.goto(`${base}?shot=spawn&e2e`, 150000);
  await sleep(2500);
  const A = await api('anchors()');
  const C = JSON.parse(await ev('JSON.stringify(window.__cf.api.campaign())'));
  const S = JSON.parse(await ev('JSON.stringify(window.__cf.api.state())'));
  const P = C.pos, O = A.outpost, base0 = S.base;
  const stand = async (p, look, dy = 0) => { await api(`standAt(${p[0]}, ${p[2]}, ${look[0]}, ${look[1]}, ${look[2]}, ${p[1] + dy})`); await sleep(500); };

  await recordDolly('outpost_aerial', [[add(O, [-60, 40, -110]), add(O, [0, 2, 0])], [add(O, [-25, 22, -60]), add(O, [0, 4, 0])], [add(O, [10, 9, -34]), add(O, [0, 4, 0])]], 6);
  await release();
  await api('thirdPerson(true)');
  await stand(add(A.airlock, [0, 0, -14]), A.airlock);
  await record('outpost_walk', 5, () => api('hold(["KeyW"], 4.6)'));
  await api('thirdPerson(false)');
  await stand(add(A.terminal, [0.6, 0, -1.2]), A.terminal);
  await record('monitoring', 5, async () => { await sleep(600); await api('use("baseStatus")'); });
  await b.key('KeyE', 'e'); await sleep(400);
  await api('hud(false)');
  const bed = base0.bedPos;
  await recordDolly('farm_dolly', [[add(bed[0], [-2.5, 1.2, -2.6]), add(bed[3], [0, -0.3, 0])], [add(bed[0], [-1.2, 0.8, 1.5]), add(bed[3], [0, -0.2, 0])]], 5);
  await release(); await api('hud(true)');
  await api("giveItem('seed_pack', 3)");
  await stand(add(bed[1], [0.6, 0, 0]), bed[1]);
  await record('farm_use', 4, async () => { await sleep(600); for (const k of [1, 2, 3, 0]) if (await api(`use("bed:${k}")`)) break; await sleep(1200); await api('use("bed:1")'); });
  await api('hud(false)');
  const R = add(P.reactor, [-6, 0, 6]);
  await recordDolly('reactor', [[add(R, [18, 8, -14]), add(R, [0, 3, 0])], [add(R, [6, 4, -20]), add(R, [0, 3, 0])]], 5);
  await recordDolly('panel', [[add(P.panel, [2.2, 0.4, -0.6]), P.panel], [add(P.panel, [1.0, 0.1, 0.4]), P.panel]], 4);
  await release(); await api('hud(true)');
  await stand(add(base0.shieldPos, [0, 0, -2.2]), base0.shieldPos);
  await record('shields', 5, async () => { await sleep(500); await api('use("shields")'); });
  await api('hud(false)');
  await api('forceStorm(1)');
  await recordDolly('storm', [[add(O, [30, 6, -70]), add(O, [0, 4, 0])], [add(O, [18, 4, -45]), add(O, [0, 5, 0])]], 6);
  await api('forceStorm(null)');
  await recordDolly('oxygen', [[add(P.oxygen, [1.8, 0.6, 1.2]), add(P.oxygen, [0, -0.2, 0])], [add(P.oxygen, [1.2, 0.3, -1.0]), add(P.oxygen, [0, -0.2, 0])]], 4);
  await recordDolly('water', [[add(P.water, [1.8, 0.8, 1.0]), add(P.water, [0, 0, 0])], [add(P.water, [1.1, 0.2, -0.9]), add(P.water, [0, 0.2, 0])]], 4);
  await recordDolly('garage', [[add(P.garage, [8, 4, -16]), add(P.garageBay, [0, 1, 0])], [add(P.garage, [1.5, 1.8, -3]), add(P.garageBay, [0, 1, 0])]], 5);
  await release(); await api('hud(true)');
  await api(`placeMev(${P.garage[0] - 6}, ${P.garage[2] - 30}, Math.PI * 0.85)`);
  await stand([P.garage[0] - 3.5, P.garage[1], P.garage[2] - 30], [P.garage[0] - 6, P.garage[1], P.garage[2] - 30]);
  await api('boardMev()'); await sleep(2500);
  await record('mev_drive', 7, () => api('hold(["KeyW"], 6.5)'));
  await api('exitMev()'); await sleep(800);
  await stand(add(O, [6, 0, -40]), O);
  await record('pda_rover', 5, async () => { await api('showPda("rover")'); await sleep(4500); });
  await b.key('Tab', ''); await sleep(500);
  await api('remote()'); await sleep(900);
  await record('r1_remote', 6, async () => { await api('hold(["KeyW"], 3)'); await api('hold(["KeyW", "KeyD"], 2.5)'); });
  await b.key('KeyE', 'e'); await sleep(600);
  await stand(add(A.drill, [1.6, 0, 1.6]), A.drill);
  await api('use("drill")');
  await api('hud(false)');
  await recordDolly('drill', [[add(A.drill, [9, 4, 7]), add(A.drill, [0, 1.5, 0])], [add(A.drill, [4, 2, -6]), add(A.drill, [0, 1.5, 0])]], 5);
  await release(); await api('hud(true)');
  const dep = A.deposits.map((d) => ({ ...d, dist: Math.hypot(d.pos[0] - A.drill[0], d.pos[2] - A.drill[2]) })).sort((a, c) => a.dist - c.dist)[0];
  await stand(add(dep.pos, [1.3, 0, 1.3]), dep.pos);
  await b.key('Digit1', '1');
  await record('samples', 6, async () => {
    await api(`use("deposit:${dep.id}")`); await sleep(1600); await api('fastForwardMining()'); await sleep(1400);
    for (const id of await api('pickups()')) if (await api(`use("pickup:${id}")`)) break;
  });
  await api('hud(false)');
  await recordDolly('station', [[add(P.station, [5, 2.5, 4]), P.station], [add(P.station, [2, 1.4, -3]), P.station]], 4);
  await recordDolly('facility', [[add(P.facility, [-40, 12, 20]), add(P.facility, [0, 2, -6])], [add(P.facility, [-14, 4, 8]), add(P.facility, [0, 2, -6])]], 5);
  await recordDolly('lab', [[add(P.lab, [1.6, 0.5, -1.4]), add(P.lab, [-0.4, -0.2, 0.6])], [add(P.lab, [0.6, 0.2, -1.0]), add(P.chamber, [0, -0.1, 0.5])]], 4);
  await recordDolly('holo', [[add(P.holo, [1.5, 0.6, 0.4]), add(P.holo, [0, -0.3, -1.0])], [add(P.holo, [-1.2, 0.5, 0.6]), add(P.holo, [0, -0.3, -1.0])]], 4);
  const I = A.ice, nd = A.nodes;
  await recordDolly('ice_enter', [[[nd.deepBend.x, nd.deepBend.floor + 2, nd.deepBend.z], add(I, [0, 2, 0])], [[nd.deepBend.x + 2, nd.deepBend.floor + 6, nd.deepBend.z - 14], add(I, [0, 3, 0])]], 6);
  await recordDolly('ice_crystals', [[add(I, [14, 6, 10]), add(I, [0, 3, 0])], [add(I, [-10, 8, 12]), add(I, [0, 3, 0])]], 6);
  await release();
} catch (e) { console.error(e); }
console.log(b.logs.filter((l) => !/Theatre/.test(l)).slice(0, 10).join('\n'));
b.close();
console.log(readdirSync(outDir).join(' '));
