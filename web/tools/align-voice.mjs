// Times subtitles to the user's own narration with ElevenLabs forced alignment (word timestamps for a known transcript).
// Input:  public/assets/audio/voice/custom/<name>.(mp3|wav|m4a|ogg) + <name>.txt (the transcript)
// Output: public/assets/audio/voice/custom/<name>.json  { audio, duration, cues: [{ at, dur, text }] }
// Key from ELEVENLABS_API_KEY (never stored). Usage: node tools/align-voice.mjs [name=intro]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public/assets/audio/voice/custom');
const name = process.argv[2] ?? 'intro';
const audio = ['mp3', 'wav', 'm4a', 'ogg'].map((e) => `${name}.${e}`).find((f) => existsSync(join(dir, f)));
const txtPath = join(dir, `${name}.txt`);
if (!audio) { console.error(`No ${name}.mp3/.wav/.m4a/.ogg in ${dir}`); process.exit(1); }
if (!existsSync(txtPath)) { console.error(`No transcript ${txtPath}`); process.exit(1); }
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('ELEVENLABS_API_KEY is not set'); process.exit(1); }
const text = readFileSync(txtPath, 'utf8').replace(/\s+/g, ' ').trim();

const form = new FormData();
form.append('file', new Blob([readFileSync(join(dir, audio))]), audio);
form.append('text', text);
const res = await fetch('https://api.elevenlabs.io/v1/forced-alignment', { method: 'POST', headers: { 'xi-api-key': key }, body: form });
if (!res.ok) { console.error(`forced alignment failed: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
const { words } = await res.json();
const ws = words.filter((w) => w.text.trim());

// Group words into subtitle cues: break at sentence ends, at pauses > 0.55 s, or past ~84 characters.
const cues = [];
let cur = null;
for (let i = 0; i < ws.length; i++) {
  const w = ws[i], next = ws[i + 1];
  if (!cur) cur = { at: w.start, end: w.end, text: w.text.trim() };
  else { cur.text += ` ${w.text.trim()}`; cur.end = w.end; }
  const sentenceEnd = /[.!?…]["')\]]?$/.test(w.text.trim());
  const pause = next ? next.start - w.end : 99;
  const long = cur.text.length > 70 && /[,;:—]$/.test(w.text.trim());
  if (!next || sentenceEnd || pause > 0.55 || long || cur.text.length > 84) {
    cues.push({ at: +cur.at.toFixed(2), dur: +Math.max(1.2, cur.end - cur.at + 0.25).toFixed(2), text: cur.text });
    cur = null;
  }
}
const duration = ws.length ? ws[ws.length - 1].end : 0;
writeFileSync(join(dir, `${name}.json`), JSON.stringify({ audio, duration: +duration.toFixed(2), aligned: true, cues }, null, 2));
console.log(`${cues.length} subtitle cues over ${duration.toFixed(1)} s → ${name}.json`);
