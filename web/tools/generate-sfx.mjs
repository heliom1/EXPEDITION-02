// Generates cinematic background beds / stings with ElevenLabs sound effects from src/audio/soundBeds.json
// → public/assets/audio/music/<id>.mp3. Only missing files are generated. Key from ELEVENLABS_API_KEY (never stored).
// Usage: node tools/generate-sfx.mjs [id ...]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { beds } = JSON.parse(readFileSync(join(root, 'src/audio/soundBeds.json'), 'utf8'));
const out = join(root, 'public/assets/audio/music');
mkdirSync(out, { recursive: true });
const only = process.argv.slice(2);
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('ELEVENLABS_API_KEY is not set'); process.exit(1); }
for (const b of beds.filter((x) => (!only.length || only.includes(x.id)) && !existsSync(join(out, `${x.id}.mp3`)))) {
  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: b.prompt, duration_seconds: b.duration, prompt_influence: 0.45, loop: b.loop }),
  });
  if (!res.ok) { console.error(`${b.id}: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(out, `${b.id}.mp3`), buf);
  console.log(`${b.id}: ${(buf.length / 1024).toFixed(0)} KB`);
}
