// Copies the prepared CinderRain world data and generated textures from the
// repository root (produced offline by ../Tools/python) into public/ so Vite serves them.
// Usage: npm run sync-assets
import { cpSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = join(web, '..');
const out = join(web, 'public');

const copy = (from, to) => {
  if (!existsSync(from)) throw new Error(`missing source: ${from}`);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
};

copy(join(root, 'WorldData', 'world.json'), join(out, 'world', 'world.json'));
copy(join(root, 'WorldData', 'backdrop_h.r16'), join(out, 'world', 'backdrop_h.r16'));
copy(join(root, 'WorldData', 'tiles'), join(out, 'world', 'tiles'));
copy(join(root, 'Assets', 'Cinderfall', 'Resources', 'Map', 'survey_map.png'), join(out, 'world', 'survey_map.png'));
const texDir = join(root, 'Assets', 'Cinderfall', 'Art', 'Textures', 'Generated');
for (const f of readdirSync(texDir).filter((f) => f.endsWith('.png'))) copy(join(texDir, f), join(out, 'textures', f));
console.log('assets synced to', out);
