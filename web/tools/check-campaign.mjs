// Full EXPEDITION 02 campaign run in headless Chrome: every objective from landing to the epilogue choice, driven
// through the real interactables (api.use = the same handler the E key calls), skipping cinematics like a player.
// Verifies the objective order, that each objective completes, and that no console errors occur.
// Usage: CF_GPU=high node tools/check-campaign.mjs [baseUrl] [--shots]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, sleep } from './cdp.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });
const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5173/';
const shots = args.includes('--shots');
const b = await openBrowser();
const ev = (e) => b.evaluate(e);
const api = (e) => ev(`window.__cf.api.${e}`);
const C = async () => JSON.parse(await ev('JSON.stringify(window.__cf.api.campaign())'));
const S = async () => JSON.parse(await ev('JSON.stringify(window.__cf.api.state())'));
const results = [];
let failed = 0;
const shot = async (name) => { if (shots) writeFileSync(join(out, `campaign_${name}.png`), await b.screenshot()); };

/** Lets cinematics/records/overlays finish (skipping cutscenes), until gameplay resumes. */
async function settle(ms = 400) {
  for (let i = 0; i < 160; i++) {
    await sleep(ms);
    const mode = await ev('window.__cf.mode');
    if (mode === 'cutscene') { await shot(`cine_${(await C()).cur}_${i}`); await api('seekCutscene(1e9, true)'); continue; }
    if (mode === 'reading') { await b.key('KeyE', 'e'); continue; }
    if (mode === 'intro') { await ev("document.querySelector('.overlay button')?.click()"); continue; }
    if (mode === 'playing' || mode === 'driving' || mode === 'end') return mode;
  }
  return ev('window.__cf.mode');
}
const stand = async (p, look, dy = 0) => { await api(`standAt(${p[0]}, ${p[2]}, ${look[0]}, ${look[1]}, ${look[2]}, ${p[1] + dy})`); await sleep(350); await settle(); };
const use = async (id, tries = 6) => { for (let k = 0; k < tries; k++) { if (await api(`use(${JSON.stringify(id)})`)) { await sleep(250); return true; } await sleep(300); await settle(); } return false; };
const ff = async () => { await api('fastForwardProc()'); await sleep(500); await settle(); };
async function step(expect, fn) {
  const before = (await C()).cur;
  if (before !== expect) { results.push(`✗ expected ${expect}, at ${before}`); failed++; throw new Error(`order: expected ${expect}, got ${before}`); }
  await fn();
  await settle();
  for (let i = 0; i < 20 && (await C()).cur === expect; i++) await sleep(300);
  const after = (await C()).cur;
  const ok = after !== expect;
  results.push(`${ok ? '✓' : '✗'} ${expect}${ok ? '' : ' (did not complete)'}`);
  if (!ok) { failed++; const c = await C(), st = await S(); console.log('  debug:', JSON.stringify({ cur: c.cur, mode: await ev('window.__cf.mode'), pos: st.pos, flags: c.flags.filter((f) => f.includes(expect)), progress: c.progress })); throw new Error(`${expect} did not complete`); }
}

try {
  await b.goto(`${base}?shot=menu&e2e&nocine`);
  await ev("[...document.querySelectorAll('.menu button')].find((x) => x.textContent.includes('New Expedition')).click()");
  await sleep(1200);
  await ev("document.querySelector('.mission-sidebar .launch').click()");
  await sleep(1500);
  await settle();
  const st = await S();
  const P = (await C()).pos;
  const A = await api('anchors()');
  const base0 = st.base;
  console.log('start', (await C()).cur, 'at', st.pos.map((v) => v.toFixed(0)).join(','));
  const out0 = A.outpost;
  const near = (p, dx = 1.2, dz = 1.2) => [p[0] + dx, p[1], p[2] + dz];

  await step('locate_outpost', async () => { await stand([out0[0] + 20, out0[1], out0[2] - 85], out0); await stand([out0[0] + 4, out0[1], out0[2] - 36], out0); });
  await step('airlock', async () => { await stand(near(A.airlock, 0, -1.6), A.airlock); await use('c_airlock'); await settle(); await stand([out0[0], out0[1], out0[2]], A.terminal); });
  await step('emergency_power', async () => { await stand(near(A.terminal, 0.6, -1.2), A.terminal); await use('terminal'); });
  await step('inspect_habitat', async () => {
    for (const p of [base0.bedPos[0], A.locker, base0.commsPos, base0.shieldPos]) { await stand(near(p, 0.4, 0.4), p); }
  });
  await step('reactor', async () => { await stand(near(P.reactor, 0, 0.6), P.reactor); await use('c_reactor'); await ff(); });
  await step('electrical', async () => { await stand(near(P.panel, 0.4, 0), P.panel); for (const k of [0, 1, 2]) await use(`c_ch${k}`); });
  await step('water', async () => { await stand(near(P.water, 0.3, 0), P.water); await use('c_water'); await use('c_water'); await ff(); });
  await step('oxygen', async () => { await stand(near(P.oxygen, 0.3, 0), P.oxygen); await use('c_oxygen'); await ff(); });
  await step('food', async () => { await api("giveItem('seed_pack', 2)"); await stand(near(base0.bedPos[1], 0.3, 0), base0.bedPos[1]); for (const k of [1, 2, 3, 0]) if (await use(`bed:${k}`, 1)) break; });
  await step('restoration', async () => { await stand(near(A.terminal, 0.6, -1.2), A.terminal); await use('terminal'); });
  await step('garage', async () => { await stand([P.garage[0], P.garage[1], P.garage[2] - 30], P.garage); await stand(near(P.garage, 0, -3), P.garage); });
  await step('inspect_vehicle', async () => { await stand(near(P.garageBay, 2.6, 2.6), P.garageBay); await use('c_vehicle_inspect'); });
  await step('restore_vehicle', async () => { await stand(near(P.garageTerm, -0.6, 0), P.garageTerm); for (let k = 0; k < 3; k++) { await use('c_garage_term'); await ff(); } });
  await step('first_deploy', async () => {
    await stand(near(P.garageBay, 2.6, 2.6), P.garageBay);
    await api('boardMev()'); await sleep(1200); await settle();
    await shot('mev_chase');
    await api('hold(["KeyW"], 1.5)'); await sleep(500);
    console.log('  mev after 1.5 s throttle:', JSON.stringify((await C()).mev));
    await api(`placeMev(${P.survey[0] + 4}, ${P.survey[2] + 4}, 0)`); await sleep(800);
    await api('fastForwardProc()'); await sleep(800);
  });
  await step('r1_link', async () => { await api('exitMev()'); await settle(); await api('remote()'); await sleep(800); await shot('r1_remote'); await api('remoteScan()'); await sleep(400); await settle(); await b.key('KeyE', 'e'); await settle(); });
  await step('storm_alert', async () => { await stand([out0[0], out0[1], out0[2]], A.terminal); });
  await step('secure', async () => { await api(`placeMev(${P.garageBay[0]}, ${P.garageBay[2]}, Math.PI)`); await sleep(500); });
  await step('storm_mode', async () => { await shot('storm'); await stand(near(A.terminal, 0.6, -1.2), A.terminal); await use('terminal'); });
  await step('maintain', async () => { await use('baseStatus'); await settle(); await stand(near(P.oxygen, 0.3, 0), P.oxygen); await use('c_oxygen'); await sleep(300); await api('fastForwardProc()'); await sleep(1200); await settle(); });
  await step('transmission1', async () => { await stand(near(base0.commsPos, 0.5, 0), base0.commsPos); await use('comms'); await ff(); });
  await step('long_prep', async () => { await stand(near(P.garageTerm, -0.6, 0), P.garageTerm); await use('c_garage_term'); await ff(); });
  await step('travel', async () => { await stand(near(A.drill, 10, 10), A.drill); });
  await step('samples', async () => {
    const deps = A.deposits.map((d) => ({ ...d, dist: Math.hypot(d.pos[0] - A.drill[0], d.pos[2] - A.drill[2]) })).sort((a, c) => a.dist - c.dist);
    await b.key('Digit1', '1');
    for (let n = 0; n < 2; n++) {
      const d = deps[0];
      await stand(near(d.pos, 1.2, 1.2), d.pos);
      await b.key('Digit1', '1');
      await use(`deposit:${d.id}`); await sleep(300); await api('fastForwardMining()'); await sleep(900);
      for (const pid of await api('pickups()')) { await stand(near(d.pos, 1.0, 1.0), d.pos); if (await use(`pickup:${pid}`, 1)) break; }
      await settle();
    }
  });
  await step('formation', async () => { await stand(near(A.drill, 1.4, 1.4), A.drill); await use('drill'); await sleep(300); await api('fastForwardDrill()'); await sleep(1500); });
  await step('recorder', async () => { await stand(near(P.station, 0, 1.2), P.station); await use('c_station'); });
  await step('cave_entrance', async () => { const m = A.nodes.mouthOut; await stand([m.x + 2, m.floor, m.z + 18], [m.x, m.floor + 2, m.z]); });
  await step('cave_prep', async () => { await stand(near(P.equip, 0, 0.6), P.equip); await use('c_equip'); await ff(); });
  await step('enter_cave', async () => { const n = A.nodes; await stand([n.mouthIn.x, n.mouthIn.floor, n.mouthIn.z], [n.hall.x, n.hall.floor, n.hall.z], 1); await stand([n.hall.x, n.hall.floor, n.hall.z], [n.hall.x, n.hall.floor, n.hall.z - 5], 1); });
  await step('subsurface', async () => { await stand(near(A.beacon, 1.0, 1.0), A.beacon, 0.5); await use('beacon'); await ff(); });
  await step('ice', async () => { await stand([A.ice[0] + 3, A.ice[1], A.ice[2] + 8], A.ice, 1); await shot('ice_reveal'); await sleep(1500); await settle(); });
  await step('ice_sample', async () => { await stand([A.ice[0] + 1.5, A.ice[1], A.ice[2] + 3], A.ice, 1); await use('ice'); await ff(); });
  await step('return', async () => { await stand([out0[0] + 4, out0[1], out0[2] - 36], out0); });
  await step('lab_transfer', async () => { await stand(near(P.chamber, 0, -0.4), P.chamber); console.log('  ice cores:', (await C()).inv); await use('c_lab_chamber'); });
  await step('analyze', async () => { await stand(near(P.lab, 0, -0.4), P.lab); await use('c_lab'); await ff(); });
  await step('review', async () => { await stand(near(A.terminal, 0.6, -1.2), A.terminal); await use('terminal'); });
  await step('reconstruct', async () => { await stand(near(P.holo, 0, 0.2), P.holo); await use('c_holo'); await ff(); });
  await step('earth', async () => { await stand(near(base0.commsPos, 0.5, 0), base0.commsPos); await use('comms'); });
  await step('facility', async () => { await stand([P.facility[0] - 60, P.facility[1], P.facility[2]], P.facility); await stand([P.facility[0] - 8, P.facility[1], P.facility[2]], P.facility); });
  await step('aux', async () => { await stand(near(P.cell, -0.6, 0), P.cell); await use('c_cell'); await stand(near(P.breaker, -0.6, 0), P.breaker); await use('c_breaker'); });
  await step('records', async () => { await stand(near(P.facTerm, -0.6, 0), P.facTerm); await use('c_fac_term'); await ff(); });
  await step('final_recording', async () => { await use('c_fac_term'); await sleep(2000); await shot('archive'); for (let i = 0; i < 90 && (await C()).cur === 'final_recording'; i++) await sleep(500); });
  await step('survey', async () => { await use('c_fac_term'); await ff(); });
  await step('final_report', async () => { await stand(near(A.terminal, 0.6, -1.2), A.terminal); await use('terminal'); });
  await step('assessment', async () => { await use('terminal'); await sleep(500); await shot('assessment'); await ev("[...document.querySelectorAll('.overlay button')].find((x) => x.textContent.includes('Submit')).click()"); });
  await step('choice', async () => { await use('terminal'); await sleep(500); await shot('choice'); await ev("document.querySelector('.overlay .choice').click()"); await sleep(1500); await shot('finale'); });
  const end = await settle();
  results.push(`${end === 'end' ? '✓' : '✗'} finale → end card (${end})`);
  if (end !== 'end') failed++;
  await shot('endcard');
} catch (e) { console.error('STOPPED:', e.message); failed++; }
console.log(results.join('\n'));
const errs = b.logs.filter((l) => !/Theatre|DevTools|GPU stall|WebGL: INVALID|favicon/i.test(l));
console.log(`console errors/warnings: ${errs.length}`);
console.log(errs.slice(0, 20).join('\n'));
console.log(failed ? `FAILED (${failed})` : 'ALL OBJECTIVES COMPLETED');
b.close();
process.exit(failed ? 1 : 0);
