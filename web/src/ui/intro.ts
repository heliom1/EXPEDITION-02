import { h } from './dom';
import './intro.css';
import { menuMusic, preloadSfx, sfx } from '../audio/menuMusic';

/**
 * Sci-fi intro + loading screen (first thing a player sees).
 *
 * Background (canvas 2D, ~60 fps, stopped on remove): drifting parallax starfield, a slowly rotating holographic
 * wireframe Mars with a scanning terminator, a faint hex grid and a periodic horizontal scan sweep.
 * Title sequence (~3 s, CSS + rAF): a light line splits the dark → HUD brackets draw in → "EXPEDITION" decodes letter by
 * letter from scrambled glyphs → "02" slams in with an RGB glitch and flash → tagline types out. All on an angled,
 * glassy HUD plate. Loader: segmented power bar + percentage, terminal status line with caret, and a systems checklist
 * that ticks as each load stage completes. `finish()` shows ALL SYSTEMS ONLINE, then flashes and dissolves.
 *
 * Same API as the old LoadingScreen (set / fail / remove) so main.ts call sites stay unchanged.
 */

const FONTS: Array<[string, string, string]> = [
  ['Orbitron', 'orbitron.woff2', '400 900'],
  ['Rajdhani', 'rajdhani-600.woff2', '600'],
  ['Share Tech Mono', 'sharetechmono.woff2', '400'],
];
let fontsRequested = false;
/** Bundled OFL fonts (public/assets/fonts) — loaded through the FontFace API so the base path is always right. */
export function loadSciFiFonts(base = import.meta.env.BASE_URL): void {
  if (fontsRequested) return;
  fontsRequested = true;
  for (const [family, file, weight] of FONTS) {
    try {
      const f = new FontFace(family, `url(${base}assets/fonts/${file}) format('woff2')`, { weight, display: 'swap' });
      document.fonts.add(f);
      void f.load().catch(() => { /* falls back to the system font stack */ });
    } catch { /* FontFace unsupported: system fonts */ }
  }
}

/** Load stages shown in the checklist; a stage ticks once progress passes its threshold. */
const STAGES: Array<[number, string]> = [
  [0.62, 'TERRAIN DATA · CINDERRAIN'],
  [0.77, 'SURFACE MATERIALS'],
  [0.82, 'OUTPOST CRIMSON AMALTHEA'],
  [0.88, 'CAVE SYSTEM C-09'],
  [0.95, 'ORBITAL TELEMETRY'],
  [1.0, 'SHADER CORE'],
];
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%/<>[]=+';
const SEGMENTS = 40;

export class LoadingScreen {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly segs: HTMLElement[] = [];
  private readonly pct: HTMLElement;
  private readonly status: HTMLElement;
  private readonly err: HTMLElement;
  private readonly checks: HTMLElement[] = [];
  private readonly letters: HTMLElement[] = [];
  private readonly num: HTMLElement;
  private readonly tagline: HTMLElement;
  private progress = 0;
  private shown = 0;
  private raf = 0;
  private t0 = performance.now();
  private alive = true;
  /** The title sequence (and its sound) starts on the first click / key press — browsers block audio before one. */
  private started = false;
  private startedP: Promise<void>;
  private resolveStarted!: () => void;
  private readonly gate: HTMLElement;
  private readonly gatePct: HTMLElement;
  private timers: number[] = [];

  constructor(parent: HTMLElement, opts: { autoStart?: boolean } = {}) {
    loadSciFiFonts();
    preloadSfx(['power_up', 'whoosh_a', 'glitch_a', 'braam_a', 'hud_a', 'ui_tick', 'online', 'whoosh_b']);
    this.startedP = new Promise((r) => { this.resolveStarted = r; });
    this.canvas = h<'canvas'>('canvas.intro-bg');
    const word = 'EXPEDITION';
    const wordEl = h('div.intro-word');
    for (const ch of word) { const s = h('span', null, ch); s.dataset.final = ch; this.letters.push(s); wordEl.append(s); }
    this.num = h('div.intro-num', null, h('span.r', null, '02'), h('span.c', null, '02'), h('span.m', null, '02'));
    this.tagline = h('div.intro-tag', null, 'EXPLORE · DISCOVER · SURVIVE');
    const plate = h('div.intro-plate', null,
      h('i.br.tl'), h('i.br.tr'), h('i.br.bl'), h('i.br.brr'),
      h('div.intro-eyebrow', null, h('span.dot'), 'ORBITAL COMMAND // MARS · 2043'),
      h('div.intro-title', null, wordEl, this.num),
      h('div.intro-rule'),
      this.tagline,
      h('div.intro-sweep'),
    );
    const bar = h('div.intro-bar');
    for (let i = 0; i < SEGMENTS; i++) { const s = h('i'); this.segs.push(s); bar.append(s); }
    this.pct = h('div.intro-pct', null, '000', h('small', null, '%'));
    this.status = h('div.intro-status', null, '> INITIALISING');
    this.err = h('div.intro-error');
    const list = h('div.intro-checks');
    for (const [, label] of STAGES) { const row = h('div.intro-check', null, h('b', null, '○'), label); this.checks.push(row); list.append(row); }
    const loader = h('div.intro-loader', null,
      h('div.intro-row', null, h('div.intro-ring', null, h('i'), h('i')), h('div.intro-meter', null, bar, h('div.intro-statusrow', null, this.status, this.pct))),
      list,
      this.err,
    );
    const corner = (cls: string, txt: string) => h(`div.intro-tele.${cls}`, null, txt);
    this.el = h('div.intro', null,
      this.canvas,
      h('div.intro-scan'),
      h('div.intro-split'),
      h('div.intro-center', null, plate, loader),
      corner('tl', 'DSN-43 · UPLINK ESTABLISHED'), corner('tr', 'LAT 46.7°N · LON 150.4°W'),
      corner('bl', 'EXP-02 · CREW 01'), corner('brr', 'BUILD 0.3 · BROWSER'),
      h('div.intro-flash'),
    );
    this.gatePct = h('span', null, '0%');
    this.gate = h('div.intro-gate', null,
      h('button.intro-gate-btn', { type: 'button' }, h('span.ring'), h('span.ring.r2'), h('b', null, 'INITIALIZE UPLINK')),
      h('div.intro-gate-hint', null, 'CLICK OR PRESS ANY KEY  ·  AUDIO ON'),
      h('div.intro-gate-load', null, 'RECEIVING DATA  ', this.gatePct),
    );
    this.el.append(this.gate);
    parent.append(this.el);
    if (opts.autoStart) this.start(false);
    else {
      this.gate.addEventListener('pointerdown', this.onGesture);
      window.addEventListener('keydown', this.onGesture, true);
    }
    this.resize();
    window.addEventListener('resize', this.resize);
    this.raf = requestAnimationFrame(this.frame);
  }

  private onGesture = (): void => this.start(true);

  /** Plays the title sequence; with `sound`, the sci-fi cues and the menu theme start too. */
  private start(sound: boolean): void {
    if (this.started) return;
    this.started = true;
    this.gate.removeEventListener('pointerdown', this.onGesture);
    window.removeEventListener('keydown', this.onGesture, true);
    this.t0 = performance.now();
    this.el.classList.add('started');
    if (sound) {
      menuMusic.play();
      const at = (s: number, f: () => void) => this.timers.push(window.setTimeout(f, s * 1000));
      at(0, () => sfx('power_up', 0.75));
      at(0.15, () => sfx('whoosh_a', 0.55));
      at(0.6, () => sfx('glitch_a', 0.45));
      at(1.95, () => { sfx('braam_a', 0.7); sfx('glitch_a', 0.5); });
      at(2.35, () => sfx('hud_a', 0.45));
    }
    this.resolveStarted();
  }

  set(f: number, text: string): void {
    this.progress = Math.max(this.progress, Math.min(1, f));
    this.status.textContent = `> ${text.toUpperCase()}`;
  }

  fail(msg: string): void {
    this.err.textContent = msg;
    this.el.classList.add('failed');
    this.status.textContent = '> SYSTEM FAULT';
  }

  /** Completes the bar, shows ALL SYSTEMS ONLINE, then flashes and dissolves (resolves when gone). */
  async finish(onLeave?: () => void): Promise<void> {
    this.progress = 1;
    this.gate.classList.add('ready');
    await this.startedP;
    // let the counter and the title intro land before leaving (first-time visitors see the full intro)
    const minIntro = 3.4 - (performance.now() - this.t0) / 1000;
    await new Promise((r) => setTimeout(r, Math.max(0, minIntro) * 1000 + 450));
    this.status.textContent = '> ALL SYSTEMS ONLINE';
    this.el.classList.add('online');
    sfx('online', 0.7);
    await new Promise((r) => setTimeout(r, 750));
    this.el.classList.add('leaving');
    onLeave?.();
    sfx('whoosh_b', 0.6);
    await new Promise((r) => setTimeout(r, 900));
    this.remove();
  }

  remove(): void {
    if (!this.alive) return;
    this.alive = false;
    cancelAnimationFrame(this.raf);
    for (const id of this.timers) clearTimeout(id);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onGesture, true);
    this.el.remove();
  }

  // ------------------------------------------------------------------ animation
  private stars: Array<{ x: number; y: number; z: number; tw: number }> = Array.from({ length: 420 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), tw: Math.random() * 6.28 }));

  /** Static hex grid, drawn once per size (it was hundreds of strokes every frame). */
  private hexLayer: HTMLCanvasElement | null = null;

  private resize = (): void => {
    // 1.5× cap: the background is soft and full-screen; this keeps it cheap while the 3D menu renders underneath
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.hexLayer = null;
  };

  private hexes(W: number, H: number): HTMLCanvasElement {
    if (this.hexLayer) return this.hexLayer;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const hs = 34 * (W / 1600);
    g.strokeStyle = 'rgba(120, 220, 255, 0.045)'; g.lineWidth = 1;
    g.beginPath();
    for (let row = 0; row * hs * 0.86 < H; row++) for (let col = 0; col * hs * 1.5 < W * 0.55; col++) {
      const x = col * hs * 1.5, y = row * hs * 1.73 + (col % 2) * hs * 0.86;
      for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI * 2; const px = x + Math.cos(a) * hs * 0.5, py = y + Math.sin(a) * hs * 0.5; if (k) g.lineTo(px, py); else g.moveTo(px, py); }
    }
    g.stroke();
    this.hexLayer = c;
    return c;
  }

  private frame = (now: number): void => {
    if (!this.alive) return;
    const t = (now - this.t0) / 1000;
    // once dissolving, the last background frame is kept (no redraw while the 3D menu fades in underneath)
    if (!this.el.classList.contains('leaving')) this.drawBackground(t);
    this.animateTitle(this.started ? t : -1);
    this.gatePct.textContent = `${Math.round(this.progress * 100)}%`;
    // progress display eases toward the real value
    this.shown += (this.progress - this.shown) * 0.08;
    if (this.progress - this.shown < 0.001) this.shown = this.progress;
    const lit = Math.round(this.shown * SEGMENTS);
    this.segs.forEach((s, i) => s.classList.toggle('on', i < lit));
    (this.pct.firstChild as Text).textContent = String(Math.round(this.shown * 100)).padStart(3, '0');
    STAGES.forEach(([th], i) => {
      const done = this.shown >= th - 0.001, active = !done && (i === 0 || this.shown >= STAGES[i - 1][0] - 0.001);
      const row = this.checks[i];
      if (row.classList.contains('done') !== done) {
        row.classList.toggle('done', done); (row.firstChild as HTMLElement).textContent = done ? '■' : '○';
        if (done && this.started && t > 2.6) sfx('ui_tick', 0.5);
      }
      row.classList.toggle('active', active);
    });
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Letter decode for EXPEDITION (0.7–1.9 s), then hold; idle micro-glitches afterwards. */
  private animateTitle(t: number): void {
    this.letters.forEach((s, i) => {
      const lockAt = 0.75 + i * 0.11;
      const final = s.dataset.final!;
      if (t < 0.6) { s.textContent = ' '; s.className = ''; return; }
      if (t < lockAt) { s.textContent = GLYPHS[Math.floor((t * 30 + i * 7) % GLYPHS.length)]; s.className = 'scr'; return; }
      // rare idle glitch on one letter
      const g = Math.sin(t * 1.7 + i * 3.1) > 0.995 && t > 3;
      s.textContent = g ? GLYPHS[Math.floor(t * 40) % GLYPHS.length] : final;
      s.className = t < lockAt + 0.15 ? 'lock' : g ? 'scr' : '';
    });
  }

  private drawBackground(t: number): void {
    const c = this.canvas, g = c.getContext('2d');
    if (!g) return;
    const W = c.width, H = c.height, S = Math.min(W, H);
    g.fillStyle = '#04060a';
    g.fillRect(0, 0, W, H);
    // nebula glow
    const neb = g.createRadialGradient(W * 0.72, H * 0.62, 0, W * 0.72, H * 0.62, S * 0.8);
    neb.addColorStop(0, 'rgba(120, 48, 20, 0.35)'); neb.addColorStop(0.5, 'rgba(40, 20, 40, 0.18)'); neb.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = neb; g.fillRect(0, 0, W, H);
    // stars (parallax drift to the left, twinkle)
    for (const st of this.stars) {
      const x = ((st.x - t * 0.004 * (0.3 + st.z)) % 1 + 1) % 1 * W, y = st.y * H;
      const a = (0.25 + 0.75 * st.z) * (0.6 + 0.4 * Math.sin(t * 2 + st.tw));
      g.fillStyle = `rgba(220, 235, 255, ${a.toFixed(3)})`;
      const r = (0.4 + st.z * 1.3) * (W / 1600);
      g.fillRect(x, y, r, r);
    }
    // holographic wireframe Mars (right side), rotating
    const cx = W * 0.74, cy = H * 0.58, R = S * 0.34, rot = t * 0.12, tilt = 0.42;
    const glow = g.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.25);
    glow.addColorStop(0, 'rgba(255, 110, 40, 0.10)'); glow.addColorStop(1, 'rgba(255, 110, 40, 0)');
    g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, R * 1.25, 0, Math.PI * 2); g.fill();
    const disc = g.createRadialGradient(cx - R * 0.35, cy - R * 0.3, R * 0.1, cx, cy, R);
    disc.addColorStop(0, 'rgba(150, 60, 25, 0.55)'); disc.addColorStop(1, 'rgba(30, 10, 6, 0.85)');
    g.fillStyle = disc; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    const proj = (lat: number, lon: number) => {
      const x = Math.cos(lat) * Math.sin(lon + rot), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon + rot);
      const y2 = y * Math.cos(tilt) - z * Math.sin(tilt), z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
      return [cx + x * R, cy - y2 * R, z2] as const;
    };
    g.lineWidth = Math.max(1, W / 1600);
    // all segments go into two paths (near side bright, far side faint) — two strokes instead of ~1200
    const front = new Path2D(), back = new Path2D();
    const line = (pts: Array<readonly [number, number, number]>) => {
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0, z0] = pts[i - 1], [x1, y1, z1] = pts[i];
        const p = z0 + z1 > 0 ? front : back;
        p.moveTo(x0, y0); p.lineTo(x1, y1);
      }
    };
    for (let la = -75; la <= 75; la += 15) {
      const pts = []; for (let lo = 0; lo <= 360; lo += 6) pts.push(proj((la * Math.PI) / 180, (lo * Math.PI) / 180));
      line(pts);
    }
    for (let lo = 0; lo < 360; lo += 20) {
      const pts = []; for (let la = -90; la <= 90; la += 6) pts.push(proj((la * Math.PI) / 180, (lo * Math.PI) / 180));
      line(pts);
    }
    g.strokeStyle = 'rgba(255, 150, 80, 0.06)'; g.stroke(back);
    g.strokeStyle = 'rgba(255, 150, 80, 0.3)'; g.stroke(front);
    // landing-site marker pulsing on the globe (Arcadia Planitia)
    const [mx, my, mz] = proj((46.7 * Math.PI) / 180, (-150.4 * Math.PI) / 180);
    if (mz > 0) {
      const p = (t * 0.8) % 1;
      g.strokeStyle = `rgba(120, 220, 255, ${(1 - p).toFixed(3)})`; g.lineWidth = 2 * (W / 1600);
      g.beginPath(); g.arc(mx, my, (4 + p * 26) * (W / 1600), 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(160, 235, 255, 0.95)'; g.beginPath(); g.arc(mx, my, 3 * (W / 1600), 0, Math.PI * 2); g.fill();
    }
    // orbit ring
    g.strokeStyle = 'rgba(120, 220, 255, 0.22)'; g.lineWidth = Math.max(1, W / 1600);
    g.beginPath(); g.ellipse(cx, cy, R * 1.45, R * 0.36, -0.2, 0, Math.PI * 2); g.stroke();
    const oa = t * 0.5;
    const ox = cx + Math.cos(oa) * R * 1.45 * Math.cos(-0.2) - Math.sin(oa) * R * 0.36 * Math.sin(-0.2);
    const oy = cy + Math.cos(oa) * R * 1.45 * Math.sin(-0.2) + Math.sin(oa) * R * 0.36 * Math.cos(-0.2);
    g.fillStyle = 'rgba(160, 235, 255, 0.9)'; g.fillRect(ox - 2, oy - 2, 4, 4);
    // hex grid (faint, left side) — cached
    g.drawImage(this.hexes(W, H), 0, 0);
  }
}
