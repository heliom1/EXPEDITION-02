// Visual check of ORBITAL COMMAND and the opening cinematic: screenshots to tools/out/orbital_*.png.
// Usage: CF_GPU=high node tools/check-orbital.mjs [baseUrl] [--opening]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, sleep } from './cdp.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });
const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5173/';
const b = await openBrowser();
const shot = async (name) => { writeFileSync(join(out, `orbital_${name}.png`), await b.screenshot()); console.log('  shot', name); };
try {
  await b.goto(`${base}?e2e`);
  await sleep(2500);
  await shot('menu');
  const st = JSON.parse(await b.evaluate('JSON.stringify({ mode: window.__cf.mode, orbital: window.__cf.orbital, fps: window.__cf.fps })'));
  console.log('state', st);
  // Click the planet (Mars sits right of centre in the idle pose): sweep a few points until the sidebar opens.
  for (const [x, y] of [[1000, 420], [1050, 450], [950, 470], [1100, 400]]) {
    await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(300);
    if (await b.evaluate("document.querySelector('.menu').classList.contains('focused')")) { console.log('  Mars clicked at', x, y); break; }
  }
  await sleep(2600);
  await shot('sidebar');
  if (args.includes('--opening')) {
    await b.evaluate("document.querySelector('.mission-sidebar .launch').click()");
    const waitCut = async (id) => { for (let i = 0; i < 80; i++) { const c = await b.evaluate('window.__cf.api.state().cutId'); if (id ? c === id : c) return c; await sleep(250); } throw new Error('no cutscene ' + id); };
    const first = await waitCut();
    console.log('  first cutscene:', first);
    if (first !== 'opening_space') { await b.evaluate('window.__cf.api.seekCutscene(1e9, true)'); await waitCut('opening_space'); }
    for (const t of [3, 12, 22, 28, 34, 45, 52, 58, 64]) {
      await b.evaluate(`window.__cf.api.seekCutscene(${t}, false, true)`);
      await sleep(900);
      await shot(`space_${t}`);
    }
    await b.evaluate('window.__cf.api.seekCutscene(1e9, true)');
    await waitCut('opening_landing');
    for (const t of [3, 8, 13, 17, 21, 24, 28, 33, 40, 46]) {
      await b.evaluate(`window.__cf.api.seekCutscene(${t}, false, true)`);
      await sleep(900);
      await shot(`land_${t}`);
    }
    await b.evaluate('window.__cf.api.seekCutscene(1e9, true)');
    await sleep(3000);
    console.log('  after opening:', await b.evaluate('JSON.stringify({mode: window.__cf.mode, pos: window.__cf.api.state().pos})'));
    await shot('gameplay_start');
  }
} catch (e) { console.error(e); }
console.log(b.logs.slice(0, 15).join('\n'));
b.close();
