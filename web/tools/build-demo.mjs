// Builds the EXPEDITION 02 gameplay demonstration composition (HyperFrames) → assets-src/hf-demo/index.html.
// Edit decision list below: real gameplay clips (tools/capture-demo.mjs), HyperFrames UI panels for systems that are
// not in the game yet (tagged "CONCEPT UI"), ElevenLabs narration (tools/generate-demo-voice.mjs), music bed, labels.
// Exactly 150 s. Usage: node tools/build-demo.mjs && cd assets-src/hf-demo && npx hyperframes render
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = JSON.parse(readFileSync(join(root, 'assets-src/demo/narration.json'), 'utf8'));
const DUR = 150;
const voDur = (id) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(root, `assets-src/hf-demo/assets/vo/${id}.mp3`)]).toString()).toFixed(2);

// [clip, start, duration]
const V = [
  ['menu_orbit', 0, 2.5], ['space_journey', 2.5, 2.2], ['space_entry', 4.7, 1.7], ['land_touchdown', 6.4, 2.0], ['outpost_walk', 8.4, 1.8],
  ['monitoring', 10.2, 4.8],
  ['farm_dolly', 26.2, 4.6], ['farm_use', 30.8, 3.8],
  ['reactor', 41.0, 4.8], ['storm', 50.5, 5.5], ['shields', 56.0, 3.5],
  ['oxygen', 59.5, 3.9], ['panel', 68.4, 3.2],
  ['garage', 71.6, 4.8], ['mev_drive', 82.4, 2.8],
  ['r1_remote', 85.2, 5.6], ['pda_rover', 97.2, 3.8],
  ['drill', 106.4, 4.8], ['samples', 111.2, 5.4],
  ['holo', 121.8, 3.8], ['station', 125.6, 3.6], ['ice_enter', 133.2, 2.6], ['ice_crystals', 135.8, 2.4],
  ['monitoring', 138.2, 1.0], ['farm_use', 139.2, 1.0], ['reactor', 140.2, 1.0], ['oxygen', 141.2, 1.0], ['r1_remote', 142.2, 1.0], ['samples', 143.2, 1.0], ['ice_crystals', 144.2, 1.0],
];
// Concept UI panels (systems not yet implemented) — [id, start, duration]
const PANELS = [['p_monitor', 15.0, 11.2], ['p_food', 34.6, 6.4], ['p_power', 45.8, 4.7], ['p_oxygen', 63.4, 5.0], ['p_fleet', 76.4, 6.0], ['p_health', 90.8, 6.4], ['p_repair', 101.0, 5.4], ['p_results', 116.6, 5.2], ['p_records', 129.2, 4.0]];
// Lower-third labels — [id, start, duration, title, line]
const LABELS = [
  ['l_base', 10.6, 4.2, 'DAILY BASE CHECK', 'ELECTRICITY · FOOD · OXYGEN · WATER'],
  ['l_food', 26.6, 7.8, 'FOOD PRODUCTION', 'GROW → HARVEST → RECOVER → REUSE'],
  ['l_power', 41.4, 4.2, 'POWER MANAGEMENT', 'GENERATE → DISTRIBUTE → PRIORITIZE'],
  ['l_storm', 50.9, 5.0, 'DUST STORM', 'SOLAR OUTPUT −62% · RUNNING ON REACTOR + BATTERY'],
  ['l_shield', 56.3, 3.0, 'SOLAR EVENT', 'MAGNETIC SHIELDING ACTIVATED'],
  ['l_oxygen', 59.9, 3.3, 'OXYGEN MANAGEMENT', 'PRODUCE → MONITOR → MAINTAIN'],
  ['l_repair', 68.7, 2.8, 'MAINTENANCE', 'FAILED EQUIPMENT MUST BE REPAIRED'],
  ['l_rovers', 72.0, 4.2, '3 EXPLORATION ROVERS', '6 TOTAL EXPEDITIONS'],
  ['l_travel', 82.6, 2.4, 'ROVER DEPLOYED', 'EN ROUTE TO DESTINATION'],
  ['l_monitor', 85.5, 5.0, 'MONITOR → DECIDE → RECALL → RETRIEVE → REPAIR', 'ROVER CONDITION DECLINES ON DIFFICULT TERRAIN'],
  ['l_pda', 97.5, 3.3, 'PDA · ROVER TELEMETRY', 'LIVE STATUS AND CAMERA FEED'],
  ['l_science', 106.8, 9.4, 'SCIENTIFIC DISCOVERY', 'SAMPLES · GEOLOGY · ENVIRONMENTAL DATA'],
  ['l_mystery', 122.2, 6.8, 'FIRST EXPEDITION', 'INCOMPLETE RECORDS · UNEXPLAINED DISCOVERIES'],
  ['l_truth', 133.4, 4.6, 'THE TRUTH REMAINS HIDDEN', ''],
];
const vid = V.map(([c, s, d], i) => `      <video id="v${i}" class="clip" data-start="${s}" data-duration="${d}" data-track-index="1" src="assets/clips/${c}.mp4" muted playsinline></video>`).join('\n');
const vo = N.lines.map((l) => `      <audio id="vo_${l.id}" class="clip" data-start="${l.start}" data-duration="${voDur(l.id)}" data-track-index="10" src="assets/vo/${l.id}.mp3" data-volume="1"></audio>`).join('\n');
const music = [0, 22, 44, 66, 88, 110].map((s, i) => `      <audio id="mus${i}" class="clip" data-start="${s}" data-duration="22" data-track-index="11" src="assets/music/${s >= 121 ? 'bed_cave' : 'bed_surface'}.mp3" data-volume="0.22"${i === 0 ? ' data-fade-in="2"' : ''}></audio>`).join('\n')
  + `\n      <audio id="mus6" class="clip" data-start="121.8" data-duration="22" data-track-index="12" src="assets/music/bed_cave.mp3" data-volume="0.3" data-fade-in="1.5"></audio>`
  + `\n      <audio id="sting1" class="clip" data-start="116.6" data-duration="4.5" data-track-index="13" src="assets/music/sting_discovery.mp3" data-volume="0.5"></audio>`
  + `\n      <audio id="sting2" class="clip" data-start="145.2" data-duration="4.8" data-track-index="13" src="assets/music/sting_discovery.mp3" data-volume="0.6"></audio>`;
const labels = LABELS.map(([id, s, d, t, l]) => `      <div id="${id}" class="clip lower" data-start="${s}" data-duration="${d}" data-track-index="5"><div class="lt"><b>${t}</b>${l ? `<span>${l}</span>` : ''}</div></div>`).join('\n');
const tag = '<div class="concept">CONCEPT UI · SYSTEM IN DEVELOPMENT</div>';
const bar = (id, name, v, cls = '') => `<div class="res ${cls}"><div class="rn">${name}</div><div class="rb"><i id="${id}" style="width:${v}%"></i></div><div class="rv" id="${id}v">${v}%</div></div>`;
const panelHtml = {
  p_monitor: `<div class="ph">CENTRAL MONITORING SYSTEM <small>SOL 14 · 07:02</small></div>
    <div class="grid2">${bar('b_el', 'ELECTRICITY', 86)}${bar('b_fo', 'FOOD', 64)}${bar('b_ox', 'OXYGEN', 91, 'warnable')}${bar('b_wa', 'WATER', 72)}</div>
    <div class="alert" id="m_alert">⚠ OXYGEN FILTER EFFICIENCY 41% — MAINTENANCE REQUIRED</div>
    <div class="btns"><span class="btn" id="m_btn">RESPOND</span><span class="btn ghost">LOG</span></div>
    <div class="cursor" id="m_cur"></div>`,
  p_food: `<div class="ph">FOOD PRODUCTION LOOP</div>
    <div class="loop"><div class="node" id="f1"><b>INDOOR FARM</b><span>Lettuce · potato · soy<br>Harvest in 2 sols</span></div><div class="arr">→</div>
    <div class="node" id="f2"><b>FUNGAL CULTIVATION</b><span>Mycoprotein trays<br>Growth 74%</span></div><div class="arr">→</div>
    <div class="node" id="f3"><b>ORGANIC LEFTOVERS</b><span>Collected 3.2 kg</span></div><div class="arr">→</div>
    <div class="node" id="f4"><b>BIOPROCESSING</b><span>Nutrients recovered<br>N · P · K → farm</span></div></div>`,
  p_power: `<div class="ph">POWER DISTRIBUTION <small>REACTOR 40.2 kW · SOLAR 3.1 kW · BATTERY 78%</small></div>
    <div class="prio"><div class="pr on">1 · LIFE SUPPORT<span>31.5 kW</span></div><div class="pr on">2 · OXYGEN GENERATION<span>4.0 kW</span></div><div class="pr on">3 · FARM LIGHTING<span>2.4 kW</span></div><div class="pr off" id="pw_off">4 · LABORATORY<span>SHED</span></div><div class="pr" id="pw_sh">5 · MAGNETIC SHIELD<span>STANDBY → +6 kW</span></div></div>`,
  p_oxygen: `<div class="ph">OXYGEN PRODUCTION · MOXIE-CLASS SOLID-OXIDE ELECTROLYSIS</div>
    <div class="loop"><div class="node"><b>MARTIAN CO₂</b><span>Intake 6.1 mbar</span></div><div class="arr">→</div><div class="node" id="o2"><b>ELECTROLYSIS 800 °C</b><span>2 CO₂ → 2 CO + O₂</span></div><div class="arr">→</div><div class="node"><b>O₂ STORAGE</b><span>Purity 99.6%<br>Tank 68%</span></div></div>
    <div class="grid2">${bar('b_o2p', 'PRODUCTION', 82)}${bar('b_o2w', 'POWER DRAW', 46)}</div>`,
  p_fleet: `<div class="ph">ROVER MANAGEMENT · SELECT DESTINATION</div>
    <div class="fleet">${[['ROVER A', 'Valles Rim', 'Ancient Delta'], ['ROVER B', 'Basalt Plains', 'Dune Field'], ['ROVER C', 'Cliff Base', 'Polar Margin']].map(([r, e1, e2], i) => `<div class="rov" id="rov${i}"><b>${r}</b><div class="ex ${i === 2 ? 'sel' : ''}" id="ex${i}a">EXP ${i * 2 + 1} · ${e1}</div><div class="ex" id="ex${i}b">EXP ${i * 2 + 2} · ${e2}</div></div>`).join('')}</div>
    <div class="btns"><span class="btn" id="dep_btn">DEPLOY ROVER C</span></div><div class="cursor" id="f_cur"></div>`,
  p_health: `<div class="ph">ROVER C · EXPEDITION 5 · CLIFF BASE <small>AUTONOMOUS</small></div>
    <div class="grid2">${bar('h_hp', 'CONDITION', 92, 'warnable')}${bar('h_bt', 'BATTERY', 74)}${bar('h_cm', 'SIGNAL', 88)}${bar('h_pr', 'PROGRESS', 35)}</div>
    <div class="alert" id="h_alert">⚠ WHEEL 4 DAMAGE · CONDITION FALLING</div>
    <div class="btns"><span class="btn ghost">CONTINUE</span><span class="btn" id="rc_btn">RECALL</span></div><div class="cursor" id="h_cur"></div>`,
  p_repair: `<div class="ph">REPAIR · ROVER C RETRIEVED <small>FAILURE: DRIVE ACTUATOR</small></div>
    <div class="repair"><div class="slot" id="rp1">OLD ACTUATOR</div><div class="arr">⇄</div><div class="slot new" id="rp2">REPLACEMENT PART</div></div>
    <div class="grid2">${bar('rp_b', 'REPAIR', 0)}</div><div class="ok" id="rp_ok">✓ ROVER C OPERATIONAL</div>`,
  p_results: `<div class="big1" id="r1">EXPEDITION COMPLETED</div><div class="big2" id="r2">SCIENTIFIC DISCOVERY UNLOCKED</div><div class="big3" id="r3">NEW DESTINATION AVAILABLE</div>`,
  p_records: `<div class="ph">EXPEDITION 1 ARCHIVE</div>
    <div class="recs"><div class="rec" id="rc1">SURVEY LOG 214 · <i>[RECORD TRUNCATED]</i></div><div class="rec" id="rc2">TRANSMISSION 2035 · <i>[SIGNAL LOST]</i></div><div class="rec" id="rc3">CORE DRL-2 · HYDROGEN ANOMALY</div><div class="rec" id="rc4">SITE C-09 · STATUS: INCOMPLETE</div></div>
    <div class="link" id="rc_link">● ● ● → NEW UNEXPLORED DESTINATION</div>`,
};
const panels = PANELS.map(([id, s, d]) => `      <div id="${id}" class="clip panel-host" data-start="${s}" data-duration="${d}" data-track-index="3"><div class="panel" id="${id}_in">${tag}${panelHtml[id]}</div></div>`).join('\n');

// GSAP timeline (deterministic; absolute times)
const T = [];
const tw = (sel, from, to, at) => T.push(`tl.fromTo(${JSON.stringify(sel)}, ${JSON.stringify(from)}, ${JSON.stringify(to)}, ${at});`);
for (const [id, s, d] of PANELS) { tw(`#${id}_in`, { opacity: 0, y: 24, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out' }, s + 0.05); tw(`#${id}_in`, { opacity: 1 }, { opacity: 0, duration: 0.35, ease: 'power2.in' }, s + d - 0.4); }
for (const [id, s, d] of LABELS) { tw(`#${id} .lt`, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.45, ease: 'power3.out' }, s); tw(`#${id} .lt`, { opacity: 1 }, { opacity: 0, duration: 0.35 }, s + d - 0.4); }
// monitor: bars settle, oxygen warning, cursor → respond
tw('#b_ox', { width: '91%' }, { width: '58%', duration: 2.2, ease: 'power1.inOut' }, 17.5);
tw('#m_alert', { opacity: 0 }, { opacity: 1, duration: 0.3, repeat: 4, yoyo: true }, 19.6);
tw('#m_cur', { x: 900, y: 500, opacity: 0 }, { x: 140, y: 404, opacity: 1, duration: 1.4, ease: 'power2.inOut' }, 22.2);
tw('#m_btn', { scale: 1 }, { scale: 0.92, duration: 0.12, yoyo: true, repeat: 1 }, 23.7);
tw('#b_ox', { width: '58%' }, { width: '88%', duration: 1.6, ease: 'power2.out' }, 24.0);
// food loop nodes light in sequence
['#f1', '#f2', '#f3', '#f4'].forEach((s, i) => tw(s, { opacity: 0.25, y: 10 }, { opacity: 1, y: 0, duration: 0.5 }, 35.0 + i * 1.2));
tw('#pw_sh', { backgroundColor: 'rgba(255,255,255,0.03)' }, { backgroundColor: 'rgba(120,200,255,0.25)', duration: 0.5 }, 48.0);
tw('#o2', { boxShadow: '0 0 0px rgba(232,116,44,0)' }, { boxShadow: '0 0 40px rgba(232,116,44,0.7)', duration: 0.8, yoyo: true, repeat: 3 }, 64.0);
// fleet: select + deploy
tw('#f_cur', { x: 1000, y: 520, opacity: 0 }, { x: 760, y: 236, opacity: 1, duration: 1.2, ease: 'power2.inOut' }, 77.6);
tw('#ex2a', { backgroundColor: 'rgba(232,116,44,0.08)' }, { backgroundColor: 'rgba(232,116,44,0.45)', duration: 0.25 }, 78.9);
tw('#f_cur', { x: 760, y: 236 }, { x: 420, y: 420, duration: 1.0, ease: 'power2.inOut' }, 79.6);
tw('#dep_btn', { scale: 1 }, { scale: 0.9, duration: 0.12, yoyo: true, repeat: 1 }, 80.7);
// health decline → recall
tw('#h_hp', { width: '92%' }, { width: '31%', duration: 3.2, ease: 'power1.in' }, 91.4);
tw('#h_pr', { width: '35%' }, { width: '61%', duration: 3.2 }, 91.4);
tw('#h_alert', { opacity: 0 }, { opacity: 1, duration: 0.25, repeat: 4, yoyo: true }, 93.6);
tw('#h_cur', { x: 1000, y: 520, opacity: 0 }, { x: 500, y: 404, opacity: 1, duration: 1.0, ease: 'power2.inOut' }, 94.8);
tw('#rc_btn', { scale: 1 }, { scale: 0.9, duration: 0.12, yoyo: true, repeat: 1 }, 95.9);
// repair
tw('#rp1', { x: 0, opacity: 1 }, { x: -60, opacity: 0.25, duration: 0.8 }, 102.0);
tw('#rp2', { x: 60, opacity: 0.3 }, { x: 0, opacity: 1, duration: 0.8 }, 102.4);
tw('#rp_b', { width: '0%' }, { width: '100%', duration: 2.0, ease: 'power1.inOut' }, 102.8);
tw('#rp_ok', { opacity: 0 }, { opacity: 1, duration: 0.4 }, 104.9);
// results
['#r1', '#r2', '#r3'].forEach((s, i) => tw(s, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 116.9 + i * 1.3));
['#rc1', '#rc2', '#rc3', '#rc4'].forEach((s, i) => tw(s, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.4 }, 129.5 + i * 0.5));
tw('#rc_link', { opacity: 0 }, { opacity: 1, duration: 0.5 }, 131.8);
// titles
tw('#title1 .t', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 1.0, ease: 'power3.out' }, 0.3);
tw('#title1 .t', { opacity: 1 }, { opacity: 0, duration: 0.6 }, 4.0);
tw('#endcard .e1', { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 1.2, ease: 'power3.out' }, 145.4);
tw('#endcard .e2', { opacity: 0 }, { opacity: 1, duration: 1.0 }, 146.6);
tw('#endcard .e3', { opacity: 0 }, { opacity: 1, duration: 1.0 }, 147.4);
tw('#fade', { opacity: 1 }, { opacity: 0, duration: 0.8 }, 0);
tw('#flash', { opacity: 0 }, { opacity: 0.6, duration: 0.08, yoyo: true, repeat: 1 }, 145.2);

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      :root { --ink: #f6eee6; --muted: #c9b8a8; --accent: #e8742c; --cool: #8fd6ff; --font-display: 'Outfit'; --font-mono: 'IBM Plex Mono'; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: #000; }
      #root { position: relative; width: 1920px; height: 1080px; font-family: var(--font-display); color: var(--ink); }
      video { position: absolute; inset: 0; width: 1920px; height: 1080px; object-fit: cover; z-index: 1; }
      .panel-host { position: absolute; inset: 0; z-index: 3; background: radial-gradient(ellipse at 50% 40%, #2a1209 0%, #0b0605 70%); }
      .panel { position: absolute; left: 260px; top: 170px; width: 1400px; min-height: 560px; padding: 44px 56px; background: rgba(18, 11, 9, 0.88); border: 1px solid rgba(232, 116, 44, 0.35); border-top: 3px solid var(--accent); }
      .concept { position: absolute; right: 20px; top: -34px; font: 500 18px var(--font-mono); letter-spacing: 0.18em; color: rgba(255, 210, 170, 0.55); }
      .ph { font-size: 34px; letter-spacing: 0.2em; font-weight: 500; margin-bottom: 36px; }
      .ph small { font: 400 20px var(--font-mono); letter-spacing: 0.1em; color: var(--muted); margin-left: 24px; }
      .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 26px 60px; margin: 18px 0 26px; }
      .res { display: grid; grid-template-columns: 210px 1fr 90px; align-items: center; gap: 18px; font: 500 22px var(--font-mono); letter-spacing: 0.1em; }
      .rb { height: 14px; background: rgba(255, 255, 255, 0.08); }
      .rb i { display: block; height: 100%; background: linear-gradient(90deg, #6cc24a, #a8e070); }
      .warnable .rb i { background: linear-gradient(90deg, #3fa4e8, #8fd6ff); }
      .rv { color: var(--muted); text-align: right; }
      .alert { margin-top: 10px; padding: 16px 22px; font: 600 24px var(--font-mono); letter-spacing: 0.08em; color: #ffd0b0; background: rgba(255, 90, 54, 0.18); border-left: 4px solid #ff5a36; }
      .btns { display: flex; gap: 24px; margin-top: 30px; }
      .btn { display: inline-block; padding: 14px 34px; font: 600 24px var(--font-display); letter-spacing: 0.24em; border: 2px solid var(--accent); background: rgba(232, 116, 44, 0.25); }
      .btn.ghost { background: none; border-color: rgba(255, 255, 255, 0.25); color: var(--muted); }
      .cursor { position: absolute; left: 0; top: 0; width: 26px; height: 26px; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 0 12px rgba(255, 255, 255, 0.7); }
      .loop { display: flex; align-items: stretch; gap: 18px; margin: 20px 0 30px; }
      .node { flex: 1; padding: 24px; border: 1px solid rgba(232, 116, 44, 0.4); background: rgba(232, 116, 44, 0.07); }
      .node b { display: block; font-size: 24px; letter-spacing: 0.12em; margin-bottom: 12px; }
      .node span { font: 400 20px/1.5 var(--font-mono); color: var(--muted); }
      .arr { align-self: center; font-size: 40px; color: var(--accent); }
      .prio { display: grid; gap: 14px; }
      .pr { display: flex; justify-content: space-between; padding: 16px 24px; font: 600 24px var(--font-mono); letter-spacing: 0.1em; background: rgba(255, 255, 255, 0.03); border-left: 4px solid #6cc24a; }
      .pr span { color: var(--muted); }
      .pr.off { border-left-color: #ff5a36; opacity: 0.6; }
      .fleet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; }
      .rov { padding: 24px; border: 1px solid rgba(255, 255, 255, 0.15); }
      .rov b { display: block; font-size: 28px; letter-spacing: 0.2em; margin-bottom: 16px; }
      .ex { padding: 14px 16px; margin-top: 10px; font: 500 21px var(--font-mono); background: rgba(232, 116, 44, 0.08); }
      .repair { display: flex; align-items: center; justify-content: center; gap: 50px; margin: 40px 0; }
      .slot { width: 420px; padding: 50px 20px; text-align: center; font: 600 26px var(--font-mono); letter-spacing: 0.12em; border: 2px dashed rgba(255, 90, 54, 0.6); }
      .slot.new { border: 2px solid #6cc24a; color: #c8f5b0; }
      .ok { font: 700 34px var(--font-display); letter-spacing: 0.2em; color: #9fe08a; text-align: center; }
      .big1, .big2, .big3 { text-align: center; font-weight: 300; letter-spacing: 0.24em; margin: 34px 0; }
      .big1 { font-size: 64px; color: #fff; } .big2 { font-size: 46px; color: var(--cool); } .big3 { font-size: 46px; color: var(--accent); }
      .recs { display: grid; gap: 18px; }
      .rec { padding: 18px 26px; font: 500 26px var(--font-mono); letter-spacing: 0.08em; border-left: 4px solid var(--accent); background: rgba(255, 255, 255, 0.04); }
      .rec i { color: #ff8a6a; font-style: normal; }
      .link { margin-top: 34px; font: 600 28px var(--font-mono); letter-spacing: 0.16em; color: var(--cool); }
      .lower { position: absolute; inset: 0; z-index: 5; pointer-events: none; }
      .lt { position: absolute; left: 120px; bottom: 120px; padding: 16px 26px 18px; background: rgba(10, 6, 4, 0.72); border-left: 4px solid var(--accent); }
      .lt b { display: block; font-size: 34px; letter-spacing: 0.22em; font-weight: 600; }
      .lt span { display: block; margin-top: 8px; font: 500 24px var(--font-mono); letter-spacing: 0.12em; color: #ffd2a8; }
      #title1 { position: absolute; inset: 0; z-index: 6; display: grid; place-content: center; text-align: center; }
      #title1 .t b { display: block; font-size: 130px; font-weight: 300; letter-spacing: 0.26em; text-shadow: 0 4px 40px rgba(0, 0, 0, 0.6); }
      #title1 .t b em { font-style: normal; font-weight: 600; color: var(--accent); }
      #title1 .t span { display: block; margin-top: 20px; font-size: 32px; letter-spacing: 0.7em; color: var(--muted); }
      #endcard { position: absolute; inset: 0; z-index: 7; background: radial-gradient(ellipse at 50% 50%, #2b1208 0%, #000 70%); display: grid; place-content: center; text-align: center; }
      #endcard .e1 { font-size: 150px; font-weight: 300; letter-spacing: 0.24em; }
      #endcard .e1 em { font-style: normal; font-weight: 600; color: var(--accent); }
      #endcard .e2 { margin-top: 26px; font-size: 40px; letter-spacing: 0.3em; }
      #endcard .e3 { margin-top: 22px; font-size: 28px; letter-spacing: 0.7em; color: var(--muted); }
      #fade, #flash { position: absolute; inset: 0; z-index: 9; }
      #fade { background: #000; } #flash { background: #fff; opacity: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="1920" data-height="1080">
${vid}
${panels}
${labels}
      <div id="title1" class="clip" data-start="0" data-duration="4.8" data-track-index="6"><div class="t"><b>EXPEDITION <em>02</em></b><span>SURVIVE. MANAGE. EXPLORE.</span></div></div>
      <div id="endcard" class="clip" data-start="145.2" data-duration="4.8" data-track-index="7"><div class="e1">EXPEDITION <em>02</em></div><div class="e2">YOUR MISSION IS JUST BEGINNING.</div><div class="e3">EXPLORE. DISCOVER. SURVIVE.</div></div>
      <div id="fade" class="clip" data-start="0" data-duration="1" data-track-index="8"></div>
      <div id="flash" class="clip" data-start="145.1" data-duration="0.4" data-track-index="8"></div>
${vo}
${music}
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
writeFileSync(join(root, 'assets-src/hf-demo/index.html'), html);
console.log('wrote index.html', V.length, 'clips', PANELS.length, 'panels', N.lines.length, 'voice lines');
