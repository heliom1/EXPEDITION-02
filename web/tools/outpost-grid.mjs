// Diagnostics: prints the outpost collision map around a point (relative to the dome centre, +Z north = up) and which
// meshes own the solid cells. Usage: node tools/outpost-grid.mjs [baseUrl] dx0 dx1 dz0 dz1 [step]
import { openBrowser } from './cdp.mjs';

const args = process.argv.slice(2);
const base = args[0]?.startsWith('http') ? args.shift() : 'http://localhost:5173/';
const [dx0, dx1, dz0, dz1, step = 0.25] = args.map(Number);
const b = await openBrowser();
try {
  await b.goto(`${base}?shot=spawn&e2e`);
  const r = await b.evaluate(`window.__cf.api.outpostGrid(${dx0}, ${dx1}, ${dz0}, ${dz1}, ${step})`);
  console.log(`x ${dx0}..${dx1} (left→right), z ${dz1}..${dz0} (top→bottom), ${step} m cells`);
  for (const row of r.rows) console.log(`|${row}|`);
  console.log('solid cells by mesh|material:', r.owners);
} finally {
  b.close();
}
