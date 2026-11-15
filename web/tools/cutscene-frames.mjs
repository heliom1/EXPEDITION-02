// Captures frames from each cutscene at fixed times (frozen with seekCutscene) for visual review.
// Usage: node tools/cutscene-frames.mjs [baseUrl] [id ...]      → tools/out/cutscene_<id>_<t>.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, sleep } from './cdp.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
mkdirSync(out, { recursive: true });
const base = process.argv[2] ?? 'http://localhost:5173/';
const ids = process.argv.slice(3).length ? process.argv.slice(3) : ['arrival', 'ice', 'transmission'];
const times = {
  arrival: [0.5, 3, 8, 12, 15.5, 17, 20, 23.5, 25.2, 27.5],
  ice: [1, 3.8, 6, 8.5, 10.6, 12.5],
  transmission: [1, 2.9, 4.5, 8, 11, 14, 17.5],
};
const b = await openBrowser();
try {
  await b.goto(`${base}?shot=menu&e2e`);
  for (const id of ids) {
    await b.evaluate(`window.__cf.api.playCutscene('${id}')`);
    await sleep(300);
    for (const t of times[id]) {
      await b.evaluate(`window.__cf.api.seekCutscene(${t})`);
      for (let i = 0; i < 60; i++) { await sleep(150); if ((await b.evaluate('window.__cf.pending')) === 0) break; }
      await sleep(900); // caption transitions settle
      writeFileSync(join(out, `cutscene_${id}_${String(t).replace('.', '_')}.png`), await b.screenshot());
      console.log(id, t, JSON.stringify(await b.evaluate('window.__cf.api.cutscene()')));
    }
  }
  const errs = b.logs.filter((l) => !/pointer ?lock/i.test(l));
  console.log(errs.length ? `console: ${errs.slice(0, 5).join(' | ')}` : 'no console errors');
} finally { b.close(); }
