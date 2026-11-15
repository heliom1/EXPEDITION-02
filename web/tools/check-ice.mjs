// Ice crystal chamber check: free-camera views of the chamber and frames of the reveal cutscene → tools/out/ice_*.png
// Usage: CF_GPU=high node tools/check-ice.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, sleep } from './cdp.mjs';
const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
const b = await openBrowser();
const api = (e) => b.evaluate(`window.__cf.api.${e}`);
const shot = async (n) => writeFileSync(join(out, `ice_${n}.png`), await b.screenshot());
try {
  await b.goto('http://localhost:5173/?shot=menu&e2e&start=ice');
  await b.evaluate("[...document.querySelectorAll('.menu button')].find((x) => x.textContent.includes('New Expedition')).click()");
  await sleep(800);
  await b.evaluate("document.querySelector('.mission-sidebar .launch').click()");
  await sleep(2500);
  await b.evaluate("document.querySelector('.overlay button')?.click()");
  await sleep(1500);
  const A = await api('anchors()');
  const I = A.ice, n = A.nodes;
  console.log('cur', JSON.parse(await b.evaluate('JSON.stringify(window.__cf.api.campaign().cur)')));
  await api(`freeCam([${n.deepBend.x}, ${n.deepBend.floor + 6}, ${n.deepBend.z - 6}], [${I[0]}, ${I[1] + 2}, ${I[2]}])`); await sleep(2500); await shot('entry');
  await api(`freeCam([${I[0] + 12}, ${I[1] + 7}, ${I[2] + 10}], [${I[0]}, ${I[1] + 2}, ${I[2]}])`); await sleep(1500); await shot('wide');
  await api(`freeCam([${I[0] - 5}, ${I[1] + 2}, ${I[2] + 6}], [${I[0]}, ${I[1] + 4}, ${I[2]}])`); await sleep(1500); await shot('close');
  await api('freeCam(null)');
  // walk into reveal range → the cutscene; capture a frame per shot
  await api(`standAt(${I[0] + 4}, ${I[2] + 10}, ${I[0]}, ${I[1] + 1}, ${I[2]}, ${I[1] + 1})`);
  for (let i = 0; i < 20; i++) { await sleep(300); if (await b.evaluate('window.__cf.mode') === 'cutscene') break; }
  for (const t of [1.5, 6, 12, 18, 23]) { await api(`seekCutscene(${t}, false, true)`); await sleep(900); await shot(`cut_${t}`); }
} catch (e) { console.error(e); }
console.log(b.logs.slice(0, 10).join('\n'));
b.close();
