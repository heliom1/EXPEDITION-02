// Measures every voice line (ffprobe) → src/audio/voiceDurations.json, so cinematics are cut to the real audio length.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const j = JSON.parse(readFileSync(join(root, 'src/audio/voiceLines.json'), 'utf8'));
const out = {};
for (const l of j.lines) {
  const f = join(root, 'public/assets/audio/voice', `${l.id}.mp3`);
  if (!existsSync(f)) continue;
  out[l.id] = +parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString()).toFixed(2);
}
writeFileSync(join(root, 'src/audio/voiceDurations.json'), JSON.stringify(out, null, 1) + '\n');
console.log(Object.keys(out).length, 'durations; total', Object.values(out).reduce((a, b) => a + b, 0).toFixed(0), 's');
