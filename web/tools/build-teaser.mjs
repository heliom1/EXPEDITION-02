// 28-second EXPEDITION 02 teaser cut (HyperFrames) from the demo clips → assets-src/hf-teaser/index.html.
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets-src/hf-demo'), dst = join(root, 'assets-src/hf-teaser');
const DUR = 28;
const V = [['menu_orbit', 0, 2.2], ['space_entry', 2.2, 2.0], ['land_touchdown', 4.2, 1.8], ['outpost_aerial', 6.0, 2.0], ['monitoring', 8.0, 2.0], ['farm_use', 10.0, 1.6], ['reactor', 11.6, 1.6], ['storm', 13.2, 1.6], ['shields', 14.8, 1.6], ['mev_drive', 16.4, 1.6], ['r1_remote', 18.0, 1.6], ['samples', 19.6, 1.6], ['holo', 21.2, 1.6], ['ice_crystals', 22.8, 2.2]];
const L = [['MANAGE THE BASE', 'ELECTRICITY · FOOD · OXYGEN · WATER', 8.1, 3.4], ['SURVIVE MARS', 'REACTOR · DUST STORMS · SHIELDING', 11.7, 4.6], ['DEPLOY ROVERS', 'DRIVE · REMOTE-CONTROL · SCAN', 16.5, 3.0], ['DISCOVER', 'WHAT LIES BENEATH', 19.7, 5.2]];
mkdirSync(join(dst, 'assets/clips'), { recursive: true }); mkdirSync(join(dst, 'assets/vo'), { recursive: true }); mkdirSync(join(dst, 'assets/music'), { recursive: true });
for (const f of ['package.json', 'hyperframes.json', 'meta.json']) if (existsSync(join(src, f))) copyFileSync(join(src, f), join(dst, f));
for (const [c] of V) copyFileSync(join(src, `assets/clips/${c}.mp4`), join(dst, `assets/clips/${c}.mp4`));
for (const v of ['s1', 's8']) copyFileSync(join(src, `assets/vo/${v}.mp3`), join(dst, `assets/vo/${v}.mp3`));
for (const m of ['bed_surface', 'sting_discovery']) copyFileSync(join(src, `assets/music/${m}.mp3`), join(dst, `assets/music/${m}.mp3`));
const T = [];
const tw = (sel, f, t, at) => T.push(`tl.fromTo(${JSON.stringify(sel)}, ${JSON.stringify(f)}, ${JSON.stringify(t)}, ${at});`);
L.forEach((l, i) => { tw(`#l${i} .lt`, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.4, ease: 'power3.out' }, l[2]); tw(`#l${i} .lt`, { opacity: 1 }, { opacity: 0, duration: 0.3 }, l[2] + l[3] - 0.35); });
tw('#title .t', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, 0.2);
tw('#title .t', { opacity: 1 }, { opacity: 0, duration: 0.5 }, 3.4);
tw('#end .e1', { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 1.0, ease: 'power3.out' }, 25.1);
tw('#end .e2', { opacity: 0 }, { opacity: 1, duration: 0.8 }, 25.9);
tw('#end .e3', { opacity: 0 }, { opacity: 1, duration: 0.8 }, 26.5);
tw('#fade', { opacity: 1 }, { opacity: 0, duration: 0.6 }, 0);
const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      :root { --ink: #f6eee6; --muted: #c9b8a8; --accent: #e8742c; --font-display: 'Outfit'; --font-mono: 'IBM Plex Mono'; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #000; }
      #root { position: relative; width: 1920px; height: 1080px; font-family: var(--font-display); color: var(--ink); }
      video { position: absolute; inset: 0; width: 1920px; height: 1080px; object-fit: cover; z-index: 1; }
      .lower { position: absolute; inset: 0; z-index: 5; }
      .lt { position: absolute; left: 120px; bottom: 130px; padding: 16px 26px 18px; background: rgba(10, 6, 4, 0.72); border-left: 4px solid var(--accent); }
      .lt b { display: block; font-size: 40px; letter-spacing: 0.22em; font-weight: 600; }
      .lt span { display: block; margin-top: 8px; font: 500 26px var(--font-mono); letter-spacing: 0.12em; color: #ffd2a8; }
      #title { position: absolute; inset: 0; z-index: 6; display: grid; place-content: center; text-align: center; }
      #title b { display: block; font-size: 130px; font-weight: 300; letter-spacing: 0.26em; text-shadow: 0 4px 40px rgba(0, 0, 0, 0.6); }
      #title em, #end em { font-style: normal; font-weight: 600; color: var(--accent); }
      #title span { display: block; margin-top: 20px; font-size: 32px; letter-spacing: 0.7em; color: var(--muted); }
      #end { position: absolute; inset: 0; z-index: 7; background: radial-gradient(ellipse at 50% 50%, #2b1208 0%, #000 70%); display: grid; place-content: center; text-align: center; }
      #end .e1 { font-size: 150px; font-weight: 300; letter-spacing: 0.24em; }
      #end .e2 { margin-top: 26px; font-size: 40px; letter-spacing: 0.3em; }
      #end .e3 { margin-top: 22px; font-size: 28px; letter-spacing: 0.7em; color: var(--muted); }
      #fade { position: absolute; inset: 0; z-index: 9; background: #000; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="1920" data-height="1080">
${V.map(([c, s, d], i) => `      <video id="v${i}" class="clip" data-start="${s}" data-duration="${d}" data-track-index="1" src="assets/clips/${c}.mp4" muted playsinline></video>`).join('\n')}
${L.map((l, i) => `      <div id="l${i}" class="clip lower" data-start="${l[2]}" data-duration="${l[3]}" data-track-index="5"><div class="lt"><b>${l[0]}</b><span>${l[1]}</span></div></div>`).join('\n')}
      <div id="title" class="clip" data-start="0" data-duration="4" data-track-index="6"><div class="t"><b>EXPEDITION <em>02</em></b><span>SURVIVE. MANAGE. EXPLORE.</span></div></div>
      <div id="end" class="clip" data-start="25" data-duration="3" data-track-index="7"><div class="e1">EXPEDITION <em>02</em></div><div class="e2">YOUR MISSION IS JUST BEGINNING.</div><div class="e3">EXPLORE. DISCOVER. SURVIVE.</div></div>
      <div id="fade" class="clip" data-start="0" data-duration="0.7" data-track-index="8"></div>
      <audio id="vo1" class="clip" data-start="0.3" data-duration="9.6" data-track-index="10" src="assets/vo/s1.mp3" data-volume="1"></audio>
      <audio id="vo8" class="clip" data-start="19.0" data-duration="6.2" data-track-index="10" src="assets/vo/s8.mp3" data-volume="1"></audio>
      <audio id="mus" class="clip" data-start="0" data-duration="22" data-track-index="11" src="assets/music/bed_surface.mp3" data-volume="0.3" data-fade-in="1.5" data-fade-out="2"></audio>
      <audio id="sting" class="clip" data-start="24.8" data-duration="3.2" data-track-index="12" src="assets/music/sting_discovery.mp3" data-volume="0.6"></audio>
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
console.log('teaser written');
