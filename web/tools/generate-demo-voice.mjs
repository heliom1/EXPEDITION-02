// Generates the gameplay-demo narration (assets-src/demo/narration.json) with ElevenLabs → assets-src/hf-demo/assets/vo/.
// Skips existing files. Prints each clip's duration (ffprobe) so the edit can be cut to the voice.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const n = JSON.parse(readFileSync(join(root, 'assets-src/demo/narration.json'), 'utf8'));
const out = join(root, 'assets-src/hf-demo/assets/vo');
mkdirSync(out, { recursive: true });
const key = process.env.ELEVENLABS_API_KEY;
for (const l of n.lines) {
  const f = join(out, `${l.id}.mp3`);
  if (!existsSync(f)) {
    if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${n.voice.id}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: l.text, model_id: 'eleven_multilingual_v2', voice_settings: n.voice.settings }),
    });
    if (!res.ok) { console.error(l.id, res.status, await res.text()); process.exit(1); }
    writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  }
  const d = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
  console.log(`${l.id}\tstart ${l.start}\tdur ${d.toFixed(2)}\tends ${(l.start + d).toFixed(2)}`);
}
