// 60-second EXPEDITION 02 gameplay trailer v2 (HyperFrames) → assets-src/hf-trailer/index.html.
// Footage: CF_CLEAN=1 CF_CLIPS_DIR=assets-src/hf-trailer/assets/clips node tools/capture-demo.mjs <clips…>
//          (frame-stepped: cutscenes, free-camera dollies and sim-stepped gameplay — all exact 30 fps)
// Audio:   ElevenLabs music + SFX in assets-src/hf-trailer/assets/audio.
// Render:  cd assets-src/hf-trailer && npx --yes hyperframes@0.9.46 render -q delivery -o ../../out-video/EXPEDITION02_trailer.mp4
//
// Structure (cut to the music): cold open (transmission) → space + atmospheric entry → landing → outpost →
// base systems (power · life support · storm) → DISCOVER: vehicle → terrain → rover → cave → ice cave →
// ice reveal + mystery line → sci-fi title.
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dst = join(root, 'assets-src/hf-trailer');
const clipsDir = join(dst, 'assets/clips'), cutsDir = join(dst, 'assets/cuts');
mkdirSync(cutsDir, { recursive: true });
for (const f of ['package.json', 'hyperframes.json']) {
  const src = join(root, 'assets-src/hf-teaser', f);
  if (existsSync(src) && !existsSync(join(dst, f))) copyFileSync(src, join(dst, f));
}
writeFileSync(join(dst, 'meta.json'), JSON.stringify({ id: 'hf-trailer', name: 'EXPEDITION 02 trailer' }, null, 2));

const DUR = 60;
const MUSIC = process.env.TRAILER_MUSIC ?? 'music_v2_a';
/** Beat hits (seconds): cuts get a zoom punch + flash and the frame shakes. */
const HITS = (process.env.TRAILER_HITS ?? '8,16,24,32,34,36,38,40,42,45,47,51.5').split(',').map(Number);
/** Title drop (the music's final hit). */
const TT = 51.5;

/** [clip, start, duration, in-point, punch?] — punch = zoom-in kick on the cut. */
const V = [
  ['space_orbit_craft', 3, 5, 0.5],
  ['space_entry', 8, 2.5, 1.2, true], ['entry_hero', 10.5, 3, 0.4, true], ['entry_meteor', 13.5, 2.5, 1.2],
  ['land_chutes', 16, 2, 0.6, true], ['land_steps', 18, 3, 1.5], ['outpost_aerial', 21, 3, 1.0],
  // base systems — every shot matches its label
  ['panel', 24, 2, 0.8, true], ['reactor', 26, 1.5, 2.5], ['farm_dolly', 27.5, 1.5, 1.5], ['storm', 29, 3, 1.5],
  // DISCOVER (one cut per bar): vehicle → terrain → rover → cave → ice cave
  ['mev_ride', 32, 2, 1.2, true], ['mev_cockpit', 34, 1.5, 1.0, true], ['mev_ride', 35.5, 0.5, 4.4], ['terrain_plain', 36, 2, 0.3, true],
  ['terrain_plain', 38, 1, 4.2, true], ['r1_mast', 39, 2, 0.8], ['r1_drive', 41, 1, 2.0], ['cave_mouth', 42, 3, 1.5, true],
  ['ice_enter', 45, 2, 2.0, true],
  ['ice_crystals', 47, 4.5, 0.3, true], ['outpost_drift', 51.5, 8.5, 0],
];
const FF = process.env.FFMPEG ?? 'ffmpeg';
const cut = (c, inPt, d) => {
  const name = `${c}_${String(inPt).replace('.', 'p')}_${String(d).replace('.', 'p')}.mp4`;
  const out = join(cutsDir, name);
  if (!existsSync(out)) execFileSync(FF, ['-y', '-loglevel', 'error', '-ss', String(inPt), '-i', join(clipsDir, `${c}.mp4`), '-t', String(d), '-vf', 'fps=30', '-c:v', 'libx264', '-crf', '17', '-pix_fmt', 'yuv420p', '-an', out]);
  return `assets/cuts/${name}`;
};
const shots = V.map(([c, s, d, inPt, punch]) => ({ c, s, d, punch: !!punch, src: cut(c, inPt, d) }));

/** HUD text cards: [id, start, dur, eyebrow, line] */
const CARDS = [
  ['k0', 0.25, 2.6, 'INCOMING TRANSMISSION · DSN-43', 'EXPEDITION 1 · LAST CONTACT 2033'],
  ['k1', 18.2, 2.7, 'SOL 1 · ARCADIA PLANITIA', '2043. YOU ARE NEXT.'],
  ['k2', 21.2, 2.7, 'OUTPOST CRIMSON AMALTHEA', 'TEN YEARS OF SILENCE'],
];
/** Section slams: [id, start, dur, big word, system label] on the beat. */
const SLAMS = [
  ['p0', 24.05, 1.9, 'RESTORE POWER', '01 · BASE SYSTEMS'], ['p1', 27.55, 1.4, 'SUSTAIN LIFE', '02 · LIFE SUPPORT'], ['p2', 29.6, 2.3, 'SURVIVE THE STORM', '03 · ENVIRONMENT'],
  ['d0', 32.05, 1.9, 'DRIVE', '04 · MEV-1 VEHICLE'], ['d1', 36.05, 1.9, 'EXPLORE', '05 · TERRAIN'], ['d2', 39.05, 1.9, 'DEPLOY', '06 · ROVER R-1'],
  ['d3', 42.05, 2.0, 'DESCEND', '07 · CAVE C-09'], ['d4', 45.05, 1.9, 'DISCOVER', '08 · SUBSURFACE'],
];

/** Audio: [id, file, start, duration, volume, fadeIn, fadeOut] — cues whose file is missing are skipped. */
const AUD = [
  ['mus', MUSIC, 0, 60, 0.9, 0, 1.0],
  ['glitch0', 'glitch_a', 0.1, 2.0, 0.55, 0, 0.3], ['radio', 'static_a', 0.6, 2.2, 0.35, 0, 0.3], ['hud0', 'hud_a', 2.4, 1.5, 0.35, 0, 0.2],
  ['braam1', 'braam_a', 8, 6, 0.6, 0, 1.5], ['reentry', 'reentry_a', 8, 8, 0.8, 0.3, 0.8], ['wh0', 'whoosh_a', 15.6, 2, 0.7, 0, 0],
  ['wind', 'wind_b', 16, 8, 0.35, 0.3, 1.5], ['breath', 'breath_a', 18, 4, 0.4, 0.5, 0.8],
  ['ui1', 'hud_a', 24, 1.5, 0.45, 0, 0.2], ['power', 'power_a', 24, 4, 0.5, 0, 1.2], ['storm', 'storm_a', 29, 3, 0.8, 0.2, 0.6],
  ['engine', 'rover_a', 32, 4, 0.55, 0.1, 0.6], ['wh1', 'whoosh_b', 35.8, 2, 0.6, 0, 0], ['wh2', 'whoosh_a', 37.8, 2, 0.6, 0, 0],
  ['rover', 'rover_a', 39.1, 2.6, 0.4, 0.1, 0.6], ['ui2', 'hud_a', 41, 1.5, 0.4, 0, 0.2], ['wh3', 'whoosh_b', 41.8, 2, 0.6, 0, 0],
  ['riser', 'riser_a', 43, 4, 0.5, 0.3, 0],
  ['boom1', 'boom_b', 47, 6, 0.8, 0, 1.5], ['heart2', 'heart_b', 49.3, 2.4, 0.7, 0.2, 0.4],
  ['glitch1', 'glitch_a', TT - 0.1, 1.2, 0.5, 0, 0.2], ['braam2', 'braam_a', TT, 7, 0.95, 0, 3],
];
const AUDIO_DIR = join(dst, 'assets/audio');
const audio = AUD.filter(([, f]) => existsSync(join(AUDIO_DIR, `${f}.mp3`)));
const missing = [...new Set(AUD.filter(([, f]) => !existsSync(join(AUDIO_DIR, `${f}.mp3`))).map(([, f]) => f))];
if (missing.length) console.warn('audio not found (skipped):', missing.join(', '));

const T = [];
const tw = (sel, f, t, at) => T.push(`tl.fromTo(${JSON.stringify(sel)}, ${JSON.stringify(f)}, ${JSON.stringify({ immediateRender: false, ...t })}, ${at});`);
// Shots: punch-in kick on hit cuts, slow drift on the rest; a short blur-whip into every cut.
shots.forEach((sh, i) => {
  if (sh.punch) tw(`#v${i}`, { scale: 1.16 }, { scale: 1.02, duration: 0.45, ease: 'expo.out' }, sh.s);
  else tw(`#v${i}`, { scale: 1.0 }, { scale: sh.d >= 3 ? 1.07 : 1.04, duration: sh.d, ease: 'none' }, sh.s);
  if (i > 0) tw(`#v${i}`, { filter: 'blur(14px) contrast(1.1) saturate(1.1)' }, { filter: 'blur(0px) contrast(1.1) saturate(1.1)', duration: 0.18, ease: 'power2.out' }, sh.s);
});
// Beat hits: white flash + camera shake on the whole stage.
for (const h of HITS) {
  tw('#flash', { opacity: 0.75 }, { opacity: 0, duration: 0.3, ease: 'power2.out' }, h);
  T.push(`tl.fromTo('#stage', { x: 0, y: 0 }, { keyframes: [{ x: -14, y: 8, duration: 0.04 }, { x: 11, y: -9, duration: 0.04 }, { x: -7, y: 6, duration: 0.05 }, { x: 4, y: -3, duration: 0.05 }, { x: 0, y: 0, duration: 0.06 }], immediateRender: false }, ${h});`);
}
// Entry whiteout into the landing.
tw('#white', { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.in' }, 15.5);
tw('#white', { opacity: 1 }, { opacity: 0, duration: 0.6, ease: 'power2.out' }, 16.0);
// HUD cards: type-on eyebrow + glitch-in line.
for (const [id, s, d] of CARDS) {
  tw(`#${id} .eb`, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'steps(24)' }, s);
  tw(`#${id} .ln`, { opacity: 0, x: -30, filter: 'blur(6px)' }, { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.35, ease: 'power3.out' }, s + 0.25);
  tw(`#${id} .ln .r`, { x: -10 }, { x: 0, duration: 0.5, ease: 'steps(6)' }, s + 0.25);
  tw(`#${id} .ln .c`, { x: 10 }, { x: 0, duration: 0.5, ease: 'steps(6)' }, s + 0.25);
  tw(`#${id} .br`, { scale: 1.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'power3.out' }, s);
  tw(`#${id}`, { opacity: 1 }, { opacity: 0, duration: 0.3 }, s + d - 0.3);
}
// Slams: big word smashes in with an RGB split, label slides; quick exit.
for (const [id, s, d] of SLAMS) {
  tw(`#${id} .w`, { scaleX: 2.2, scaleY: 1.5, opacity: 0 }, { scaleX: 1, scaleY: 1, opacity: 1, duration: 0.22, ease: 'expo.out' }, s);
  tw(`#${id} .w .r`, { x: -18 }, { x: 0, duration: 0.4, ease: 'steps(5)' }, s);
  tw(`#${id} .w .c`, { x: 18 }, { x: 0, duration: 0.4, ease: 'steps(5)' }, s);
  tw(`#${id} .lb`, { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.3, ease: 'power3.out' }, s + 0.08);
  tw(`#${id} .bar2`, { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: 'expo.out' }, s + 0.05);
  tw(`#${id}`, { opacity: 1 }, { opacity: 0, duration: 0.18 }, s + d - 0.18);
}
// Mystery line (HUD, glitch).
tw('#ask .ln', { opacity: 0, scaleX: 1.35 }, { opacity: 1, scaleX: 1, duration: 1.0, ease: 'power2.out' }, 49.4);
tw('#ask .ln .r', { x: -12 }, { x: 0, duration: 0.9, ease: 'steps(9)' }, 49.4);
tw('#ask .ln .c', { x: 12 }, { x: 0, duration: 0.9, ease: 'steps(9)' }, 49.4);
tw('#ask', { opacity: 1 }, { opacity: 0, duration: 0.25 }, TT - 0.25);
// ---------------- Sci-fi title: boot → scan → glitch → lock ----------------
tw('#dim', { opacity: 0 }, { opacity: 0.78, duration: 0.8 }, TT - 0.20);
tw('#scan', { y: -560, opacity: 1 }, { y: 560, opacity: 1, duration: 0.7, ease: 'power1.inOut' }, TT + 0.00);
tw('#scan', { opacity: 1 }, { opacity: 0, duration: 0.2 }, TT + 0.70);
tw('#title .corner', { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'expo.out', stagger: 0.05 }, TT + 0.05);
// glitch: slices of the logo jump sideways in steps while the RGB copies jitter, then everything locks at 53.2
T.push(`tl.fromTo('#title .slice', { opacity: 1 }, { opacity: 0, duration: 0.01, immediateRender: false }, ${TT + 1.20});`);
T.push(`tl.set('#title .slice', { opacity: 1 }, ${TT + 0.25});`);
T.push(`tl.set('#title .logo .m', { opacity: 0 }, ${TT + 0.00});`);
T.push(`tl.set('#title .logo .m', { opacity: 1 }, ${TT + 1.20});`);
['s0', 's1', 's2', 's3'].forEach((s, i) => {
  T.push(`tl.fromTo('#title .${s}', { x: ${[60, -90, 40, -50][i]} }, { keyframes: [{ x: ${[-40, 70, -60, 30][i]}, duration: 0.07 }, { x: ${[25, -30, 50, -70][i]}, duration: 0.07 }, { x: ${[-12, 18, -20, 10][i]}, duration: 0.08 }, { x: 0, duration: 0.08 }], immediateRender: false }, ${TT + 0.25 + i * 0.12});`);
});
tw('#title .logo .r', { x: -22, opacity: 0.9 }, { x: -2, opacity: 0.55, duration: 0.95, ease: 'steps(10)' }, TT + 0.25);
tw('#title .logo .c', { x: 22, opacity: 0.9 }, { x: 2, opacity: 0.55, duration: 0.95, ease: 'steps(10)' }, TT + 0.25);
tw('#title .flare', { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.25, ease: 'expo.out' }, TT + 1.20);
tw('#title .flare', { opacity: 1 }, { opacity: 0.25, duration: 1.8, ease: 'power2.out' }, TT + 1.45);
tw('#title .rule', { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'expo.out' }, TT + 1.25);
tw('#title .sub', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.9, ease: 'steps(18)' }, TT + 1.60);
tw('#title .tele', { opacity: 0 }, { opacity: 0.85, duration: 0.25, stagger: 0.12 }, TT + 1.90);
tw('#title .logo', { scale: 1.0 }, { scale: 1.04, duration: 6.5, ease: 'none' }, TT + 1.20);
T.push(`tl.fromTo('#title .logo .m', { textShadow: '0 0 60px rgba(120,220,255,1), 0 0 18px rgba(255,255,255,1)' }, { textShadow: '0 0 26px rgba(120,220,255,0.55), 0 0 6px rgba(255,255,255,0.6)', duration: 2.2, ease: 'power2.out', immediateRender: false }, ${TT + 1.20});`);
// Cold-open and close fades; grain jitter.
tw('#fade', { opacity: 1 }, { opacity: 0, duration: 0.4 }, 2.8);
tw('#fadeout', { opacity: 0 }, { opacity: 1, duration: 1.4, ease: 'power1.in' }, 58.5);
T.push(`tl.to('#grain', { backgroundPosition: '173px 97px', duration: 0.08, repeat: ${Math.round(DUR / 0.08)}, ease: 'steps(1)' }, 0);`);

const NOISE = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.55 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>');
const rgb = (txt) => `<span class="r">${txt}</span><span class="c">${txt}</span><span class="m">${txt}</span>`;
const LOGO = 'EXPEDITION <em>02</em>';

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;700&family=Share+Tech+Mono&display=block" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      :root { --ink: #eaf6ff; --cy: #78dcff; --accent: #ff7a2e; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #000; }
      #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; color: var(--ink); font-family: 'Rajdhani', sans-serif; }
      #stage { position: absolute; left: -30px; top: -30px; width: 1980px; height: 1140px; }
      video { position: absolute; left: 30px; top: 30px; width: 1920px; height: 1080px; object-fit: cover; z-index: 1; transform-origin: 50% 50%; filter: contrast(1.1) saturate(1.1); }
      .rgbt { position: relative; display: inline-block; }
      .rgbt .r, .rgbt .c { position: absolute; left: 0; top: 0; mix-blend-mode: screen; opacity: 0.6; white-space: nowrap; }
      .rgbt .r { color: #ff2a4a; } .rgbt .c { color: #2af0ff; }
      .rgbt .m { position: relative; white-space: nowrap; }
      .hud { position: absolute; z-index: 5; }
      .hud .eb { font: 400 24px 'Share Tech Mono', monospace; letter-spacing: 0.32em; color: var(--cy); display: block; }
      .hud .ln { margin-top: 10px; font: 700 60px 'Orbitron', sans-serif; letter-spacing: 0.14em; text-shadow: 0 2px 24px rgba(0,0,0,0.9); }
      .hud .br { position: absolute; left: -34px; top: -18px; width: 22px; height: 120px; border: 2px solid var(--cy); border-right: none; opacity: 0.9; }
      .card { left: 160px; bottom: 210px; padding: 18px 30px; background: linear-gradient(90deg, rgba(0,10,20,0.62), rgba(0,10,20,0)); }
      .card.center { left: 0; right: 0; bottom: auto; top: 450px; text-align: center; background: none; }
      .card.center .br { display: none; }
      .slam { inset: 0; display: grid; place-content: center; text-align: center; }
      .slam .w { font: 900 140px 'Orbitron', sans-serif; letter-spacing: 0.22em; color: #fff; text-shadow: 0 0 34px rgba(120,220,255,0.55), 0 6px 30px rgba(0,0,0,0.9); }
      .slam .lb { display: inline-block; margin: 14px auto 0; padding: 6px 18px; font: 400 28px 'Share Tech Mono', monospace; letter-spacing: 0.4em; color: #9fe8ff; background: rgba(0, 8, 16, 0.72); text-shadow: 0 2px 14px rgba(0,0,0,0.9); }
      .slam .w { transform-origin: 50% 50%; }
      #ask .ln { transform-origin: 50% 50%; }
      .slam .bar2 { margin: 18px auto 0; width: 520px; height: 3px; background: linear-gradient(90deg, rgba(120,220,255,0), var(--cy), rgba(120,220,255,0)); transform-origin: 50% 50%; }
      #ask { inset: 0; display: grid; place-content: center; text-align: center; background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0) 70%); }
      #ask .ln { font: 700 70px 'Orbitron', sans-serif; letter-spacing: 0.42em; }
      #dim { position: absolute; inset: 0; z-index: 6; background: #000; opacity: 0; }
      #title { position: absolute; inset: 0; z-index: 7; display: grid; place-content: center; text-align: center; }
      #title .frame { position: relative; padding: 70px 120px; }
      #title .corner { position: absolute; width: 60px; height: 60px; border-color: var(--cy); border-style: solid; opacity: 0; }
      #title .tl { left: 0; top: 0; border-width: 3px 0 0 3px; } #title .tr { right: 0; top: 0; border-width: 3px 3px 0 0; }
      #title .bl { left: 0; bottom: 0; border-width: 0 0 3px 3px; } #title .brc { right: 0; bottom: 0; border-width: 0 3px 3px 0; }
      #title .logo { position: relative; font: 900 150px 'Orbitron', sans-serif; letter-spacing: 0.14em; color: #fff; transform-origin: 50% 50%; }
      #title em { font-style: normal; color: var(--accent); }
      #title .slice { position: absolute; left: 120px; top: 70px; font: 900 150px 'Orbitron', sans-serif; letter-spacing: 0.14em; white-space: nowrap; color: #fff; opacity: 0; }
      #title .s0 { clip-path: inset(0 0 78% 0); } #title .s1 { clip-path: inset(24% 0 52% 0); } #title .s2 { clip-path: inset(50% 0 26% 0); } #title .s3 { clip-path: inset(76% 0 0 0); }
      #title .rule { margin: 28px auto 0; width: 980px; height: 2px; background: linear-gradient(90deg, rgba(120,220,255,0), var(--cy), rgba(120,220,255,0)); transform-origin: 50% 50%; }
      #title .sub { margin-top: 22px; font: 400 34px 'Share Tech Mono', monospace; letter-spacing: 0.7em; color: var(--cy); }
      #title .flare { position: absolute; left: -400px; right: -400px; top: 50%; height: 6px; margin-top: -40px; background: radial-gradient(ellipse at 50% 50%, rgba(200,240,255,0.95) 0%, rgba(120,220,255,0.5) 18%, rgba(120,220,255,0) 60%); filter: blur(2px); transform-origin: 50% 50%; opacity: 0; }
      #title .tele { position: absolute; font: 400 20px 'Share Tech Mono', monospace; letter-spacing: 0.2em; color: rgba(120,220,255,0.85); opacity: 0; white-space: nowrap; }
      #scan { position: absolute; left: 0; right: 0; top: 50%; height: 3px; z-index: 8; background: linear-gradient(90deg, rgba(120,220,255,0), rgba(160,235,255,1), rgba(120,220,255,0)); box-shadow: 0 0 30px 8px rgba(120,220,255,0.45); opacity: 0; }
      #grain { position: absolute; inset: 0; z-index: 9; pointer-events: none; opacity: 0.07; background-image: url("${NOISE}"); mix-blend-mode: screen; }
      #lines { position: absolute; inset: 0; z-index: 9; pointer-events: none; opacity: 0.08; background: repeating-linear-gradient(0deg, rgba(0,0,0,0.6) 0px, rgba(0,0,0,0.6) 1px, rgba(0,0,0,0) 2px, rgba(0,0,0,0) 4px); }
      #vignette { position: absolute; inset: 0; z-index: 9; pointer-events: none; background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.6) 100%); }
      .bar { position: absolute; left: 0; width: 1920px; height: 130px; background: #000; z-index: 11; }
      #flash { position: absolute; inset: 0; z-index: 10; background: #fff; opacity: 0; mix-blend-mode: screen; }
      #white { position: absolute; inset: 0; z-index: 10; background: #fff4e6; opacity: 0; }
      #fade, #fadeout { position: absolute; inset: 0; z-index: 12; background: #000; }
      #fade { opacity: 1; z-index: 4; } #fadeout { opacity: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="1920" data-height="1080">
      <div id="stage">
${shots.map((sh, i) => `        <video id="v${i}" class="clip" data-start="${sh.s}" data-duration="${sh.d}" data-track-index="1" src="${sh.src}" muted playsinline></video>`).join('\n')}
      </div>
${CARDS.map(([id, s, d, eb, ln], i) => `      <div id="${id}" class="clip hud card${i === 0 ? ' center' : ''}" data-start="${s}" data-duration="${d}" data-track-index="5"><div class="br"></div><span class="eb">${eb}</span><div class="ln rgbt">${rgb(ln)}</div></div>`).join('\n')}
${SLAMS.map(([id, s, d, w, lb]) => `      <div id="${id}" class="clip hud slam" data-start="${s}" data-duration="${d}" data-track-index="5"><div class="w rgbt" style="font-size:${w.length > 14 ? 92 : w.length > 10 ? 116 : 140}px">${rgb(w)}</div><div class="bar2"></div><div class="lb">${lb}</div></div>`).join('\n')}
      <div id="ask" class="clip hud" data-start="49.3" data-duration="2.3" data-track-index="5"><div class="ln rgbt">${rgb('WHAT DID THEY FIND?')}</div></div>
      <div id="dim" class="clip" data-start="${TT - 0.2}" data-duration="${DUR - TT + 0.2}" data-track-index="6"></div>
      <div id="title" class="clip" data-start="${TT}" data-duration="${DUR - TT}" data-track-index="7">
        <div class="frame">
          <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner brc"></div>
          <div class="flare"></div>
          <div class="logo rgbt">${rgb(LOGO)}</div>
          <div class="slice s0">${LOGO}</div><div class="slice s1">${LOGO}</div><div class="slice s2">${LOGO}</div><div class="slice s3">${LOGO}</div>
          <div class="rule"></div>
          <div class="sub">MARS · 2043</div>
          <div class="tele" style="left:76px; top:14px">ARCADIA PLANITIA 46.7°N 150.4°W</div>
          <div class="tele" style="right:76px; top:14px">SIGNAL ACQUIRED ▮▮▮▮▯</div>
          <div class="tele" style="left:76px; bottom:14px">CREW 01 · SOL 001</div>
          <div class="tele" style="right:76px; bottom:14px">MISSION STATUS · ACTIVE</div>
        </div>
      </div>
      <div id="scan" class="clip" data-start="${TT - 0.1}" data-duration="1" data-track-index="8"></div>
      <div id="grain" class="clip" data-start="0" data-duration="${DUR}" data-track-index="9"></div>
      <div id="lines" class="clip" data-start="0" data-duration="${DUR}" data-track-index="9"></div>
      <div id="vignette" class="clip" data-start="0" data-duration="${DUR}" data-track-index="9"></div>
      <div id="flash" class="clip" data-start="0" data-duration="${DUR}" data-track-index="10"></div>
      <div id="white" class="clip" data-start="15" data-duration="1.8" data-track-index="10"></div>
      <div class="clip bar" style="top:0" data-start="0" data-duration="${DUR}" data-track-index="11"></div>
      <div class="clip bar" style="bottom:0" data-start="0" data-duration="${DUR}" data-track-index="11"></div>
      <div id="fade" class="clip" data-start="0" data-duration="3.3" data-track-index="12"></div>
      <div id="fadeout" class="clip" data-start="58" data-duration="2" data-track-index="12"></div>
${audio.map(([id, f, s, d, v, fi, fo], i) => `      <audio id="${id}" class="clip" data-start="${s}" data-duration="${d}" data-track-index="${20 + i}" src="assets/audio/${f}.mp3" data-volume="${v}"${fi ? ` data-fade-in="${fi}"` : ''}${fo ? ` data-fade-out="${fo}"` : ''}></audio>`).join('\n')}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      ${T.join('\n      ')}
      window.__timelines['main'] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
writeFileSync(join(dst, 'index.html'), html);
console.log(`trailer v2 written: ${shots.length} shots, ${CARDS.length + SLAMS.length + 1} text cards, ${audio.length} audio cues (music: ${MUSIC})`);
