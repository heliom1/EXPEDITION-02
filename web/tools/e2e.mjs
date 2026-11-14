// End-to-end mission run in a real (headless) browser.
// Drives the actual input → interaction → mission path with synthetic key presses, walks into the
// cave with the real controller, and verifies save → reload → Continue.
// Usage: node tools/e2e.mjs [baseUrl]     (dev server or `npm run preview` must be running)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, sleep } from './cdp.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });
const base = process.argv[2] ?? 'http://localhost:5173/';
const b = await openBrowser();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const api = (expr) => b.evaluate(`window.__cf.api.${expr}`);
const state = () => api('state()');
const shot = async (n) => writeFileSync(join(out, `e2e_${n}.png`), await b.screenshot());
const press = async (code, key = '') => { await b.key(code, key); await sleep(350); };
const brief = (s) => JSON.stringify({ mode: s.mode, objective: s.objective, focused: s.focused, records: s.records.length, inCave: s.inCave });

try {
  const ms = await b.goto(`${base}?shot=spawn&e2e&save`);
  check('game loads (terrain streamed, cave meshed)', true, `${ms} ms`);
  const A = await api('anchors()');
  let s = await state();
  check('starts on objective "checkin"', s.objective === 'checkin' && s.mode === 'playing', brief(s));

  // 1. Mission terminal.
  const [tx, ty, tz] = A.terminal;
  await api(`standAt(${tx + 1.3}, ${tz - 1.5}, ${tx}, ${ty}, ${tz})`);
  await sleep(400);
  s = await state();
  check('terminal is focused when looked at', s.focused === 'terminal', `focused=${s.focused}`);
  await press('KeyE', 'e');
  s = await state();
  check('E opens the assignment record; objective → rover', s.readerOpen && s.objective === 'rover', brief(s));
  await press('KeyE', 'e');
  s = await state();
  check('E closes the record', !s.readerOpen && s.mode === 'playing', `mode=${s.mode}`);

  // 2. Airlock.
  const [ax, ay, az] = A.airlock;
  await api(`standAt(${ax + 2.0}, ${az + 1.6}, ${ax}, ${ay}, ${az})`);
  await sleep(400);
  s = await state();
  check('airlock recharge is focusable', s.focused === 'airlock', `focused=${s.focused}`);

  // 3. Rover.
  const [rx, ry, rz] = A.rover;
  await api(`standAt(${rx + 1.6}, ${rz + 0.6}, ${rx}, ${ry}, ${rz})`);
  await sleep(500);
  await press('KeyE', 'e');
  s = await state();
  check('rover log read; objective → drill', s.objective === 'drill' && s.records.includes('rover_log'), brief(s));
  await press('KeyE', 'e');

  // PDA.
  await press('Tab');
  s = await state();
  check('Tab opens the PDA', s.mode === 'pda', `mode=${s.mode}`);
  await press('Tab');
  s = await state();
  check('Tab closes the PDA', s.mode === 'playing', `mode=${s.mode}`);

  // 4. Drill.
  const [dx, dy, dz] = A.drill;
  const vx = dx - -20, vz = dz - -320, vl = Math.hypot(vx, vz);
  await api(`standAt(${dx + (vx / vl) * 1.6}, ${dz + (vz / vl) * 1.6}, ${dx}, ${dy}, ${dz})`);
  await sleep(500);
  await press('KeyE', 'e');
  await sleep(800);
  s = await state();
  check('drill starts running', s.drill === 'running', `drill=${s.drill}`);
  await api('fastForwardDrill()');
  await sleep(1500);
  s = await state();
  check('drill completes; objective → cliff', s.drill === 'done' && s.objective === 'cliff', brief(s));

  // 5. Cliff base → cave.
  const N = A.nodes;
  await api(`standAt(${N.mouthOut.x + 3}, ${N.mouthOut.z + 18}, ${N.mouthIn.x}, 10, ${N.mouthIn.z})`);
  await sleep(800);
  s = await state();
  check('reaching the cliff base logs the survey; objective → cave', s.objective === 'cave' && s.records.includes('cliff_survey'), brief(s));
  await press('KeyE', 'e');
  await shot('5_mouth');

  // Walk into the cave with the real controller.
  await api(`standAt(${N.mouthOut.x}, ${N.mouthOut.z + 4}, ${N.throat.x}, 8, ${N.throat.z})`);
  await sleep(300);
  await api('walk(9)');
  await sleep(400);
  s = await state();
  check('walking south enters the cave (collision + floor work)', s.inCave && s.grounded && s.pos[2] < N.mouthIn.z + 2, `pos=${s.pos.map((v) => v.toFixed(1))} inCave=${s.inCave}`);
  await press('KeyF', 'f');
  s = await state();
  check('F toggles the suit lamp', s.lamp === true, `lamp=${s.lamp}`);
  await sleep(1500);
  await shot('6_tunnel');

  // 6. Last beacon.
  const [bx, by, bz] = A.beacon;
  await api(`standAt(${bx + 1.2}, ${bz + 1.4}, ${bx}, ${by}, ${bz}, ${by})`);
  await sleep(500);
  s = await state();
  check('last survey beacon is focusable underground', s.focused === 'beacon', `focused=${s.focused} pos=${s.pos.map((v) => v.toFixed(1))}`);
  await press('KeyE', 'e');
  s = await state();
  check('beacon log read; objective → ice', s.objective === 'ice' && s.records.includes('beacon_log'), brief(s));
  await press('KeyE', 'e');

  // 7. Ice deposit.
  const [ix, iy, iz] = A.ice;
  await api(`standAt(${ix + 1.5}, ${iz + 3.2}, ${ix}, ${iy}, ${iz}, ${iy})`);
  await sleep(600);
  s = await state();
  check('deposit is focusable', s.focused === 'ice', `focused=${s.focused} pos=${s.pos.map((v) => v.toFixed(1))}`);
  await press('KeyE', 'e');
  await sleep(500);
  s = await state();
  check('spectrometer scan runs', s.scan === 'scanning', `scan=${s.scan}`);
  await shot('7_scan');
  await api('fastForwardScan()');
  await sleep(1200);
  s = await state();
  check('scan completes; ice record; objective → report', s.scan === 'done' && s.records.includes('ice_discovery') && s.objective === 'report', brief(s));
  await shot('8_ice_record');
  await press('KeyE', 'e');

  // 8. Report at the outpost.
  await api(`standAt(${tx + 1.3}, ${tz - 1.5}, ${tx}, ${ty}, ${tz})`);
  await sleep(500);
  await press('KeyE', 'e');
  await sleep(900);
  s = await state();
  check('transmission completes the build; end card shown', s.objective === null && s.mode === 'end' && s.overlay === 'Water on Mars', brief(s) + ` overlay=${s.overlay}`);
  await shot('9_end');

  // 9. Save → reload → Continue.
  await api('save()');
  await b.goto(`${base}?shot=menu&e2e&save`);
  await sleep(800);
  const cont = await b.evaluate(`(() => { const btn = [...document.querySelectorAll('.menu button')].find((x) => x.textContent.includes('Continue')); return btn ? { disabled: btn.disabled, info: btn.nextElementSibling?.textContent ?? '' } : null; })()`);
  check('Continue is enabled after reload and describes the save', cont && !cont.disabled, JSON.stringify(cont));
  await b.evaluate(`[...document.querySelectorAll('.menu button')].find((x) => x.textContent.includes('Continue')).click()`);
  await sleep(1200);
  s = await state();
  check('Continue restores mission progress and position', s.mode === 'playing' && s.records.includes('ice_discovery') && s.index === 7 && Math.abs(s.pos[0] - (tx + 1.3)) < 3, brief(s) + ` index=${s.index}`);
} catch (e) {
  check('run completed without exceptions', false, String(e));
}
const errs = b.logs.filter((l) => !/pointer ?lock/i.test(l));
check('no console errors or warnings', errs.length === 0, errs.slice(0, 5).join(' | '));
writeFileSync(join(out, 'e2e_report.json'), JSON.stringify({ browser: b.version?.Browser, results, logs: b.logs }, null, 2));
b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
