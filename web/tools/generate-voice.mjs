// Generates the game's voice lines with ElevenLabs from src/audio/voiceLines.json → public/assets/audio/voice/<id>.mp3.
// Only missing files are generated (re-run safely; delete a file to regenerate it). The API key is read from the
// ELEVENLABS_API_KEY environment variable and never written anywhere. Spends ElevenLabs character credits.
// Usage: node tools/generate-voice.mjs [id ...]     (--dry-run lists what would be generated and the character cost)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = JSON.parse(readFileSync(join(root, 'src/audio/voiceLines.json'), 'utf8'));
const out = join(root, 'public/assets/audio/voice');
mkdirSync(out, { recursive: true });
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const only = args.filter((a) => !a.startsWith('--'));
const key = process.env.ELEVENLABS_API_KEY;
if (!key && !dry) { console.error('ELEVENLABS_API_KEY is not set'); process.exit(1); }

const todo = script.lines.filter((l) => script.speakers[l.speaker].engine !== 'kokoro' && (!only.length || only.includes(l.id)) && !existsSync(join(out, `${l.id}.mp3`)));
console.log(`${todo.length} line(s) to generate, ${todo.reduce((n, l) => n + l.text.length, 0)} characters`);
for (const line of todo) {
  const sp = script.speakers[line.speaker];
  if (dry) { console.log(`  ${line.id} (${sp.voiceName}, ${line.text.length} chars)`); continue; }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${sp.voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: line.text, model_id: 'eleven_multilingual_v2', voice_settings: sp.settings }),
  });
  if (!res.ok) { console.error(`  ${line.id}: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(out, `${line.id}.mp3`), buf);
  console.log(`  ${line.id}: ${(buf.length / 1024).toFixed(0)} KB (${sp.voiceName})`);
}
