// First-person body check: arms + drill, legs when looking down, footprints, third person.
// Usage: CF_GPU=high node tools/check-body.mjs [tag]
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, sleep } from './cdp.mjs';
const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
const tag = process.argv[2] ?? 'body';
const b = await openBrowser();
const api = (e) => b.evaluate(`window.__cf.api.${e}`);
const shot = async (n) => writeFileSync(join(out, `${tag}_${n}.png`), await b.screenshot());
try {
  await b.goto((process.env.CF_URL ?? 'http://localhost:5173/') + '?shot=menu&e2e&nocine');
  await b.evaluate("[...document.querySelectorAll('.menu button')].find((x) => x.textContent.includes('New Expedition')).click()");
  await sleep(1000);
  await b.evaluate("document.querySelector('.mission-sidebar .launch').click()");
  await sleep(2500);
  await b.evaluate("document.querySelector('.overlay button')?.click()");
  await sleep(2500);
  console.log('state', await b.evaluate('JSON.stringify((({mode,selected,pos,body})=>({mode,selected,pos,body}))(window.__cf.api.state()))'));
  await api('look(null, -0.05)'); await sleep(900); await shot('1_forward');
  for (const [n, pos] of [['a_right', [0.9, -0.1, -0.55]], ['b_top', [0.09, 0.7, -0.5]], ['c_front', [0.09, -0.1, -1.6]], ['d_left', [-0.7, -0.05, -0.45]]]) { await api(`toolView(${JSON.stringify(pos)})`); await sleep(500); await shot('1' + n); }
  await api('toolView(null)');
  await api('look(null, -0.75)'); await sleep(900); await shot('2_down');
  await api('look(null, -1.35)'); await sleep(900); await shot('3_feet');
  await api('look(null, -0.9)'); await api('walk(2.2)'); await sleep(1200); await shot('4_walking_down');
  await sleep(1500);
  await b.evaluate('window.__cf.api.look(window.__cf.api.state().yaw ?? null, -0.6)');
  // turn round to look at the trail just walked
  await b.evaluate('(() => { const a = window.__cf.api; a.look((a.yawNow?.() ?? 0) + Math.PI, -0.55); })()'); await sleep(900); await shot('5_trail');
  console.log('prints', await b.evaluate('window.__cf.api.state().footprints'));
  await b.key('Digit2'); await sleep(700); await api('look(null, -1.2)'); await sleep(600); await shot('5b_feet_notool');
  await api('walk(1.2)'); await sleep(600); await shot('5c_feet_walking'); await sleep(900);
  await b.evaluate('(() => { const a = window.__cf.api; a.look(a.yawNow() + Math.PI, -0.7); })()'); await sleep(900); await shot('5d_trail_notool');
  await b.key('Digit1');
  await api('thirdPerson(true)'); await api('look(null, -0.25)'); await sleep(1500); await shot('6_third');
} catch (err) { console.error(err); }
console.log(b.logs.slice(0, 12).join('\n'));
b.close();
