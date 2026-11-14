// End-to-end mission run in a real (headless) browser.
// Drives the actual input → interaction → mission path with synthetic key presses.
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

try {
  const ms = await b.goto(`${base}?shot=spawn&e2e`);
  check('game loads and terrain streams', true, `${ms} ms`);
  const A = await api('anchors()');
  let s = await state();
  check('starts on objective "checkin"', s.objective === 'checkin' && s.mode === 'playing', JSON.stringify(s));

  // 1. Mission terminal.
  const [tx, ty, tz] = A.terminal;
  await api(`standAt(${tx + 1.3}, ${tz - 1.5}, ${tx}, ${ty}, ${tz})`);
  await sleep(400);
  s = await state();
  check('terminal is focused when looked at', s.focused === 'terminal', `focused=${s.focused}`);
  await b.key('KeyE', 'e');
  await sleep(400);
  s = await state();
  check('E opens the assignment record and advances to "rover"', s.readerOpen && s.objective === 'rover' && s.records.includes('assignment'), JSON.stringify(s));
  await shot('1_record');
  await b.key('KeyE', 'e');
  await sleep(300);
  s = await state();
  check('E closes the record and returns to play', !s.readerOpen && s.mode === 'playing', `mode=${s.mode}`);

  // 2. Airlock recharge prompt.
  const [ax, ay, az] = A.airlock;
  await api(`standAt(${ax + 2.0}, ${az + 1.6}, ${ax}, ${ay}, ${az})`);
  await sleep(400);
  s = await state();
  check('airlock recharge is focusable', s.focused === 'airlock', `focused=${s.focused}`);

  // 3. Rover service panel.
  const [rx, ry, rz] = A.rover;
  await api(`standAt(${rx + 1.6}, ${rz + 0.6}, ${rx}, ${ry}, ${rz})`);
  await sleep(500);
  s = await state();
  check('rover service panel is focused', s.focused === 'rover', `focused=${s.focused}`);
  await b.key('KeyE', 'e');
  await sleep(400);
  s = await state();
  check('rover log read; objective advances to "drill"', s.objective === 'drill' && s.records.includes('rover_log'), JSON.stringify(s));
  await b.key('KeyE', 'e');
  await sleep(300);

  // PDA open/close.
  await b.key('Tab');
  await sleep(400);
  s = await state();
  check('Tab opens the PDA', s.mode === 'pda', `mode=${s.mode}`);
  await shot('2_pda');
  await b.key('Tab');
  await sleep(300);
  s = await state();
  check('Tab closes the PDA', s.mode === 'playing', `mode=${s.mode}`);

  // 4. Drill.
  const [dx, dy, dz] = A.drill;
  const [cx, , cz] = A.cave;
  const sx = -20, sz = -320; // drill site centre (SITES.drill)
  const vx = dx - sx, vz = dz - sz, vl = Math.hypot(vx, vz);
  await api(`standAt(${dx + (vx / vl) * 1.6}, ${dz + (vz / vl) * 1.6}, ${dx}, ${dy}, ${dz})`);
  await sleep(500);
  s = await state();
  check('drill console is focused', s.focused === 'drill', `focused=${s.focused}`);
  await b.key('KeyE', 'e');
  await sleep(1200);
  s = await state();
  check('drill starts running', s.drill === 'running', `drill=${s.drill}`);
  await shot('3_drilling');
  await api('fastForwardDrill()');
  await sleep(1500);
  s = await state();
  check('drill completes; core record logged; objective "cliff"', s.drill === 'done' && s.records.includes('core_drl2') && s.objective === 'cliff', JSON.stringify(s));

  // 5. Cliff base.
  await api(`standAt(${cx + 22}, ${cz + 18}, ${cx}, 0, ${cz})`);
  await sleep(1500);
  s = await state();
  check('reaching the cliff base completes the slice', s.complete && s.mode === 'end' && s.records.includes('cliff_survey'), JSON.stringify(s));
  await shot('4_end');
} catch (e) {
  check('run completed without exceptions', false, String(e));
}
const errs = b.logs.filter((l) => !l.includes('pointer lock') && !l.includes('requestPointerLock'));
check('no console errors or warnings', errs.length === 0, errs.slice(0, 5).join(' | '));
writeFileSync(join(out, 'e2e_report.json'), JSON.stringify({ browser: b.version?.Browser, results, logs: b.logs }, null, 2));
b.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
