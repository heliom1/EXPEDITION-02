// MEV-1 visual check: hangar exterior, vehicle close-up, chase camera after boarding and while driving.
// Usage: CF_GPU=high node tools/check-vehicle.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, sleep } from './cdp.mjs';
const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
const b = await openBrowser();
const api = (e) => b.evaluate(`window.__cf.api.${e}`);
const shot = async (n) => writeFileSync(join(out, `vehicle_${n}.png`), await b.screenshot());
try {
  await b.goto('http://localhost:5173/?shot=menu&e2e&nocine');
  await b.evaluate("[...document.querySelectorAll('.menu button')].find((x) => x.textContent.includes('New Expedition')).click()");
  await sleep(1000);
  await b.evaluate("document.querySelector('.mission-sidebar .launch').click()");
  await sleep(2500);
  await b.evaluate("document.querySelector('.overlay button')?.click()");
  await sleep(1500);
  const c = JSON.parse(await b.evaluate('JSON.stringify(window.__cf.api.campaign())'));
  const g = c.pos.garageBay, e = c.pos.garage;
  await api(`freeCam([${e[0] + 10}, ${e[1] + 4}, ${e[2] - 14}], [${g[0]}, ${g[1] + 1}, ${g[2]}])`); await sleep(1500); await shot('hangar');
  await api(`freeCam([${g[0] + 3.2}, ${g[1] + 1.8}, ${g[2] - 3.6}], [${g[0]}, ${g[1] + 0.8}, ${g[2]}])`); await sleep(1200); await shot('closeup');
  await api('freeCam(null)');
  console.log('mev', JSON.stringify(c.mev));
  // unlock and board (test hook: mark the restore objective done)
  await b.evaluate("window.__cf.api.campaign() && 0");
  await b.evaluate(`(() => { const s = window.__cf.api; s.placeMev(${g[0]}, ${g[2] - 14}, Math.PI); })()`);
} catch (err) { console.error(err); }
console.log(b.logs.slice(0, 10).join('\n'));
b.close();
