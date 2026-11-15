import { h } from './dom';
import type { Settings } from '../core/settings';
import type { StoryRecord } from '../missions/records';
import { INTRO } from '../missions/records';
import type { SurveyMap, MapMarker } from './minimap';
import { CHAPTERS, OBJECTIVES, type MissionState } from '../missions/missions';
import { RECORDS } from '../missions/records';
import type { Inventory } from '../inventory/inventory';
import { itemDef } from '../inventory/items';
import { inventoryGrid } from './inventoryUi';

export interface EnvReading { label: string; value: string; kind: 'nasa' | 'sim'; source?: string }
export interface RoverPanel { status: string; battery: number; charging: boolean; condition: number; x: number; z: number; distance: number; odometer: number; pitchDeg: number; rollDeg: number; signal: number; linkable: boolean; why?: string }

const wordmark = () => h('div', null, h('div.wordmark', { html: 'EXPEDITION <b>02</b>' }), h('div.tagline', null, 'EXPLORE. DISCOVER. SURVIVE.'));

export class LoadingScreen {
  readonly el: HTMLElement;
  private bar: HTMLElement;
  private status: HTMLElement;
  private err: HTMLElement;

  constructor(parent: HTMLElement) {
    this.bar = h('i');
    this.status = h('div.status', null, 'Initialising');
    this.err = h('div.error');
    this.el = h('div.loading', null, h('div.inner', null, wordmark(), h('div.bar', null, this.bar), this.status, this.err));
    parent.append(this.el);
  }

  set(f: number, text: string): void {
    this.bar.style.width = `${Math.round(f * 100)}%`;
    this.status.textContent = text;
  }

  fail(msg: string): void {
    this.err.textContent = msg;
  }

  remove(): void {
    this.el.remove();
  }
}

export interface MenuHandlers {
  onNewGame(): void;
  onContinue(): void;
  onSettings(s: Settings): void;
  /** LAUNCH EXPEDITION in the Mars sidebar. */
  onLaunch(): void;
  /** Sidebar opened / closed (camera focus, selection animation). */
  onSidebar(open: boolean): void;
  onExit(): void;
}

/** NASA Mars Fact Sheet values (nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html). */
const MARS_FACTS: Array<[string, string]> = [
  ['Diameter', '6,792 km (equatorial)'],
  ['Surface gravity', '3.71 m/s² · 0.38 g'],
  ['Mean temperature', '≈ −63 °C (210 K)'],
  ['Atmosphere', 'CO₂ 95.1% · N₂ 2.6% · Ar 1.9% · O₂ 0.16%'],
  ['Surface pressure', '≈ 6.1 mbar (0.6% of Earth)'],
  ['Distance from Earth', '54.6 – 401 million km'],
  ['Solar day (sol)', '24 h 39 m 35 s'],
];

const CONTROLS: Array<[string, string]> = [
  ['Move', 'W A S D'], ['Look', 'Mouse'], ['Sprint', 'Shift'], ['Jump', 'Space'], ['Interact', 'E'], ['Suit lamp', 'F'],
  ['PDA (map, objectives, logs)', 'Tab'], ['Select tool / item', '1 – 5'], ['Use selected item', 'Q'], ['Pause / release mouse', 'Esc'], ['Developer overlay', 'F3'],
];

/**
 * ORBITAL COMMAND main menu (directive Parts 2–3): the 3D orbital scene renders behind this overlay. Left: wordmark +
 * navigation. Right edge: live orbital telemetry. Clicking Mars (or NEW EXPEDITION) opens the mission sidebar with
 * NASA planetary data and LAUNCH EXPEDITION.
 */
export class MainMenu {
  readonly el: HTMLElement;
  private sheet: HTMLElement;
  private continueBtn: HTMLButtonElement;
  private newBtn: HTMLButtonElement;
  private saveInfo: HTMLElement;
  private sidebar: HTMLElement;
  private telemetry: HTMLElement;
  private hint: HTMLElement;
  private launchBtn: HTMLButtonElement;
  private sideStatus: HTMLElement;
  sidebarOpen = false;

  constructor(parent: HTMLElement, private settings: Settings, private readonly handlers: MenuHandlers) {
    this.sheet = h('div.sheet.panel.interactive.hidden');
    const item = (label: string, fn: () => void, primary = false) =>
      h<'button'>('button' + (primary ? '.primary' : ''), { onclick: fn }, h('span.ico'), label);
    this.continueBtn = item('Continue Mission', () => handlers.onContinue());
    this.continueBtn.disabled = true;
    this.continueBtn.title = 'No saved mission yet';
    this.saveInfo = h('div.saveinfo');
    this.newBtn = item('New Expedition', () => handlers.onNewGame(), true);
    const items = h('div.items.interactive', null,
      this.newBtn,
      this.continueBtn,
      this.saveInfo,
      item('Settings', () => this.showSettings()),
      item('Credits', () => this.showCredits()),
      item('Exit', () => handlers.onExit()),
    );
    this.telemetry = h('div.orbit-telemetry');
    this.hint = h('div.orbit-hint', null, h('span.ring'), 'SELECT MARS TO REVIEW THE MISSION');
    this.launchBtn = h<'button'>('button.launch', { onclick: () => handlers.onLaunch() }, h('span', null, 'LAUNCH EXPEDITION'), h('i'));
    this.sideStatus = h('span.status-ready', null, 'READY FOR DEPLOYMENT');
    this.sidebar = h('aside.mission-sidebar.interactive', null,
      h('button.close', { onclick: () => this.showSidebar(false), title: 'Back to orbital view' }, '×'),
      h('div.eyebrow', null, 'DESTINATION'),
      h('div.planet', null, 'MARS'),
      h('div.sub', null, 'SOL SYSTEM · FOURTH PLANET'),
      h('dl.meta', null,
        h('dt', null, 'Mission designation'), h('dd', null, 'EXPEDITION 02'),
        h('dt', null, 'Mission status'), h('dd', null, this.sideStatus),
        h('dt', null, 'Landing region'), h('dd', null, 'Arcadia Planitia · 46° N 150° W', h('small', null, 'Region: NASA subsurface-ice mapping target (SWIM). Local terrain in-game: fictional (CinderRain).'))),
      h('div.eyebrow', null, 'MISSION OVERVIEW'),
      h('p.overview', null, "Humanity's next great exploration frontier awaits. Journey to the Martian surface, investigate its geological formations, analyze its environment, and uncover discoveries that could change our understanding of the Red Planet."),
      h('div.eyebrow', null, 'PLANETARY DATA', h('span.src', null, 'NASA Mars Fact Sheet')),
      h('table.facts', null, ...MARS_FACTS.map(([k, v]) => h('tr', null, h('td', null, k), h('td', null, v)))),
      this.launchBtn,
    );
    this.el = h('div.menu.orbital', null,
      h('div.left', null, wordmark(), items),
      this.telemetry,
      this.hint,
      this.sidebar,
      this.sheet,
      h('div.build', null, 'ORBITAL COMMAND · Browser build v0.3 · Mars data: NASA / MGS MOLA / Viking MDIM'),
    );
    parent.append(this.el);
  }

  /** Enables Continue when a save exists; `detail` describes it (or why it could not be read). */
  setSave(available: boolean, detail: string): void {
    this.continueBtn.disabled = !available;
    this.continueBtn.title = available ? 'Continue from your last save' : 'No saved mission';
    this.saveInfo.textContent = detail;
  }

  show(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
    if (!on) { this.sheet.classList.add('hidden'); this.showSidebar(false, true); }
  }

  /** Mission sidebar (Mars selected). */
  showSidebar(on: boolean, silent = false): void {
    if (on === this.sidebarOpen) return;
    this.sidebarOpen = on;
    this.el.classList.toggle('focused', on);
    if (on) this.sheet.classList.add('hidden');
    if (!silent) this.handlers.onSidebar(on);
  }

  /** Planet hover (cursor over Mars). */
  setHover(on: boolean): void { this.el.classList.toggle('hover-mars', on); }

  /** Live orbital read-out (right edge). */
  setTelemetry(lines: string[]): void {
    if (this.telemetry.childElementCount !== lines.length) this.telemetry.replaceChildren(...lines.map(() => h('div')));
    lines.forEach((l, i) => { (this.telemetry.children[i] as HTMLElement).textContent = l; });
  }

  /** Disables Launch while the launch transition runs. */
  setLaunchBusy(busy: boolean): void { this.launchBtn.disabled = busy; this.sideStatus.textContent = busy ? 'LAUNCH SEQUENCE INITIATED' : 'READY FOR DEPLOYMENT'; }

  private open(title: string, ...body: Array<Node | string>): void {
    this.sheet.replaceChildren(h('h3', null, title), ...body);
    this.sheet.classList.remove('hidden');
  }

  showControls(): void {
    this.showSidebar(false);
    this.open('CONTROLS', h('table', null, ...CONTROLS.map(([a, k]) => h('tr', null, h('td', null, a), h('td', null, h('kbd', null, k))))));
  }

  showCredits(): void {
    this.showSidebar(false);
    this.open('CREDITS',
      h('p', null, 'EXPEDITION 02 — story, concept, cinematic script, CinderRain terrain and the outpost, astronaut, rover, vehicle and drill models by the EXPEDITION 02 team. Opening narration recorded by the team.'),
      h('p', null, 'Voices generated with ElevenLabs (elevenlabs.io, free tier: non-commercial, attribution required): Daniel (Mission Control), Will (Astronaut), Sarah (suit companion), River (rover system), Lily (Expedition One researcher). PDA voice: Kokoro-82M "af_heart" (hexgrad, Apache-2.0), generated offline.'),
      h('p', null, 'Mars data: NASA 3D Resources colour mosaic (Viking MDIM), Phobos, Deimos and Tycho star map; MGS MOLA MEGDR topography (NASA PDS Geosciences Node). Environmental values: NASA Mars Fact Sheet; Curiosity RAD and REMS. Spacecraft, lander and parachutes are procedural in-engine models.'),
      h('p', null, 'Rendering: three.js (MIT). Cinematic tooling: Theatre.js (Apache-2.0). Physics: Rapier (Apache-2.0). Built with Vite and TypeScript.'),
    );
  }

  showSettings(): void {
    this.showSidebar(false);
    const s = this.settings;
    const sens = h<'input'>('input', { type: 'range', min: '0.2', max: '3', step: '0.05', value: String(s.sensitivity) });
    const sensVal = h('span', null, s.sensitivity.toFixed(2));
    sens.addEventListener('input', () => { s.sensitivity = parseFloat(sens.value); sensVal.textContent = s.sensitivity.toFixed(2); this.handlers.onSettings(s); });
    const inv = h<'input'>('input', { type: 'checkbox' });
    inv.checked = s.invertY;
    inv.addEventListener('change', () => { s.invertY = inv.checked; this.handlers.onSettings(s); });
    const q = h('div.seg');
    const mkQ = (v: Settings['quality'], label: string) => {
      const b = h<'button'>('button' + (s.quality === v ? '.on' : ''), { onclick: () => { s.quality = v; q.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); this.handlers.onSettings(s); } }, label);
      return b;
    };
    q.append(mkQ('high', 'High'), mkQ('low', 'Low'));
    const vol = h<'input'>('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(s.volume) });
    const volVal = h('span', null, `${Math.round(s.volume * 100)}%`);
    vol.addEventListener('input', () => { s.volume = parseFloat(vol.value); volVal.textContent = `${Math.round(s.volume * 100)}%`; this.handlers.onSettings(s); });
    this.open('SETTINGS',
      h('div.row', null, 'Mouse sensitivity', h('span', null, sens, ' ', sensVal)),
      h('div.row', null, 'Volume', h('span', null, vol, ' ', volVal)),
      h('div.row', null, 'Invert mouse Y', inv),
      h('div.row', null, 'Graphics quality', q),
      h('p', { style: { color: 'var(--muted)', fontSize: '12.5px', marginTop: '12px' } }, 'Low: no sun shadows, 1× pixel ratio, shorter high-detail terrain radius.'),
      h('h3', { style: { marginTop: '18px' } }, 'CONTROLS'),
      h('table', null, ...CONTROLS.map(([a, k]) => h('tr', null, h('td', null, a), h('td', null, h('kbd', null, k))))),
    );
  }
}

/** Generic centred card (intro, pause, failure, end of build). */
export function card(parent: HTMLElement, eyebrow: string, title: string, paragraphs: string[], actions: Array<{ label: string; primary?: boolean; fn: () => void }>, hint?: string): HTMLElement {
  const el = h('div.overlay.interactive', null,
    h('div.card', null,
      h('div.eyebrow', null, eyebrow),
      h('h2', null, title),
      ...paragraphs.map((p) => h('p', null, p)),
      h('div.actions', null, ...actions.map((a) => h('button.btn' + (a.primary ? '.primary' : ''), { onclick: a.fn }, a.label))),
      hint ? h('div.hint', null, hint) : null,
    ));
  parent.append(el);
  return el;
}

export function introCard(parent: HTMLElement, onBegin: () => void): HTMLElement {
  return card(parent, 'MISSION BRIEFING', INTRO.heading, INTRO.body, [{ label: 'Begin', primary: true, fn: onBegin }], 'Click Begin to capture the mouse. Esc releases it.');
}

export class RecordReader {
  readonly el: HTMLElement;
  open = false;

  constructor(parent: HTMLElement) {
    this.el = h('div.overlay.hidden');
    parent.append(this.el);
  }

  show(r: StoryRecord): void {
    this.el.replaceChildren(h('div.reader.card', { style: { padding: '0' } },
      h('div.head', null, h('div.meta', null, `${r.kind.toUpperCase()} · ${r.source}`), h('h2', null, r.title)),
      h('pre', null, r.body),
      h('div.foot', null, h('span', null, h('kbd', null, 'E'), ' / ', h('kbd', null, 'Esc'), ' close'), r.draft ? h('span.draft', null, 'Draft text — pending authoritative story') : h('span')),
    ));
    this.el.classList.remove('hidden');
    this.open = true;
  }

  close(): void {
    this.el.classList.add('hidden');
    this.open = false;
  }
}

/** PDA: map / objectives / logs, laid out like the reference PDA (nav, map, mission panel). */
export class Pda {
  readonly el: HTMLElement;
  open = false;
  private tab: 'map' | 'missions' | 'logs' | 'audio' | 'inventory' | 'environment' | 'rover' = 'map';
  /** Heard voice lines (set by the game) and a replay handler — the PDA "Audio logs" tab. */
  audioLogs: (() => Array<{ id: string; who: string; text: string }>) | null = null;
  onReplay: ((id: string) => void) | null = null;
  /** Live environmental readings (set by the game); each is labelled NASA reference or simulated. */
  environment: (() => EnvReading[]) | null = null;
  /** Rover status and a mast-camera snapshot provider (set by the game when a rover exists). */
  rover: (() => RoverPanel | null) | null = null;
  roverFeed: (() => HTMLCanvasElement | null) | null = null;
  /** Take remote control of R-1 (the rover is only ever driven through the PDA). */
  onRemote: (() => void) | null = null;
  private refresh: number | null = null;
  private last: [number, number, number, MapMarker[]] = [0, 0, 0, []];
  /** Suit inventory shown on the Inventory tab (set by the game). */
  inventory: Inventory | null = null;
  /** Optional objectives shown under Missions (set by the game). */
  optional: Array<{ title: string; description: string; progress: string; done: boolean }> = [];
  private main: HTMLElement;
  private side: HTMLElement;
  private nav: HTMLElement;
  private canvas: HTMLCanvasElement;

  constructor(parent: HTMLElement, private readonly map: SurveyMap, private readonly mission: MissionState, private readonly onRead: (id: string) => void) {
    this.canvas = h<'canvas'>('canvas', { width: 1100, height: 1100 });
    this.main = h('div.main');
    this.side = h('div.side');
    this.nav = h('nav');
    this.el = h('div.overlay.interactive.hidden', null, h('div.pda.card', { style: { padding: '0' } }, this.nav, this.main, this.side));
    parent.append(this.el);
  }

  show(px: number, pz: number, heading: number, markers: MapMarker[]): void {
    this.open = true;
    this.last = [px, pz, heading, markers];
    this.el.classList.remove('hidden', 'pda-closing');
    this.el.classList.add('pda-opening');
    this.render(px, pz, heading, markers);
    // Live tabs (environment, rover) refresh twice a second while the PDA is open.
    if (this.refresh === null) this.refresh = window.setInterval(() => { if (this.open && (this.tab === 'environment' || this.tab === 'rover')) this.render(...this.last); }, 500);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    if (this.refresh !== null) { clearInterval(this.refresh); this.refresh = null; }
    // Holographic fold-away (180 ms), then hide.
    this.el.classList.remove('pda-opening');
    this.el.classList.add('pda-closing');
    window.setTimeout(() => { if (!this.open) this.el.classList.add('hidden'); this.el.classList.remove('pda-closing'); }, 180);
  }

  /** Updates position/markers used by live refreshes. */
  track(px: number, pz: number, heading: number, markers: MapMarker[]): void { this.last = [px, pz, heading, markers]; }

  private render(px: number, pz: number, heading: number, markers: MapMarker[]): void {
    const b = (id: typeof this.tab, label: string) => h('button' + (this.tab === id ? '.on' : ''), { onclick: () => { this.tab = id; this.render(px, pz, heading, markers); } }, label);
    this.nav.replaceChildren(h('div.t', null, 'PDA'), b('map', '▦  Map'), b('missions', '◆  Missions'), b('logs', '☰  Logs'), b('audio', '♪  Audio logs'), b('inventory', '▤  Inventory'), b('environment', '◍  Environment'), ...(this.rover?.() ? [b('rover', '⛭  Rover R-1')] : []), h('div', { style: { flex: '1' } }), h('div', { style: { fontSize: '12px', color: 'var(--muted)', padding: '8px 10px' } }, h('kbd', null, 'TAB'), ' close'));
    const cur = this.mission.current;
    this.side.replaceChildren(
      h('h4', null, 'CURRENT MISSION'),
      h('p', null, h('b', null, cur ? cur.title : 'Complete')),
      h('p', null, cur ? cur.description : 'All objectives in this build are complete.'),
      h('h4', null, 'POSITION'),
      h('p', null, `E ${px.toFixed(0)} m · N ${pz.toFixed(0)} m · heading ${heading.toFixed(0)}°`),
      h('h4', null, 'RECORDS'),
      h('p', null, `${this.mission.records.length} recovered`),
    );
    if (this.tab === 'map') {
      const ctx = this.canvas.getContext('2d')!;
      this.map.drawFull(ctx, px, pz, heading, markers);
      this.main.replaceChildren(this.canvas, h('div.coords', null, 'CinderRain survey · 6.1 km × 6.1 km · grid 1.02 km'));
    } else if (this.tab === 'missions') {
      this.main.replaceChildren(h('div.list', null, ...OBJECTIVES.map((o, i) => {
        const done = i < this.mission.index || this.mission.complete;
        const active = !done && i === this.mission.index;
        if (!done && !active) return null;
        const ch = o.chapter === 9 ? 'EPILOGUE' : `CH ${String(o.chapter).padStart(2, '0')} · ${CHAPTERS[o.chapter]?.toUpperCase() ?? ''}`;
        return h('div.item' + (done ? '.done' : ''), null, h('div.k', null, `${ch} · ${done ? 'COMPLETE' : 'ACTIVE'}`), h('div', null, o.title), h('div', { style: { fontSize: '13px', color: 'var(--muted)', marginTop: '3px' } }, o.description));
      }), ...this.optional.map((o) => h('div.item' + (o.done ? '.done' : ''), null, h('div.k', null, o.done ? 'OPTIONAL · COMPLETE' : `OPTIONAL · ${o.progress}`), h('div', null, o.title), h('div', { style: { fontSize: '13px', color: 'var(--muted)', marginTop: '3px' } }, o.description)))));
    } else if (this.tab === 'audio') {
      const logs = this.audioLogs?.() ?? [];
      this.main.replaceChildren(h('div.list', null,
        logs.length ? null : h('p', { style: { color: 'var(--muted)', padding: '12px' } }, 'No transmissions or recordings yet.'),
        ...logs.map((l) => h('div.item', { 'data-log': l.id, onclick: () => this.onReplay?.(l.id) },
          h('div.k', null, `▶  ${l.who.toUpperCase()}`), h('div', { style: { fontSize: '13.5px', marginTop: '3px' } }, l.text)))));
    } else if (this.tab === 'environment') {
      const rows = this.environment?.() ?? [];
      this.main.replaceChildren(h('div.inv', null,
        h('h4.pdah', null, 'ENVIRONMENT · LIVE'),
        h('table.env', null, ...rows.map((r) => h('tr', null, h('td', null, r.label), h('td.v', null, r.value), h('td', null, h('span.tag' + (r.kind === 'nasa' ? '.nasa' : '.sim'), { title: r.source ?? '' }, r.kind === 'nasa' ? 'NASA REF' : 'SIMULATED'))))),
        h('p.note', null, 'NASA REF values are published mission measurements (source on hover). SIMULATED values are game models built around those references, not observations.')));
    } else if (this.tab === 'rover') {
      const r = this.rover?.();
      const feed = this.roverFeed?.();
      this.main.replaceChildren(h('div.inv', null,
        h('h4.pdah', null, 'ROVER R-1 · TELEMETRY'),
        r ? h('table.env', null,
          h('tr', null, h('td', null, 'Status'), h('td.v', null, r.status)),
          h('tr', null, h('td', null, 'Battery'), h('td.v', null, `${Math.round(r.battery)}%${r.charging ? ' · charging' : ''}`)),
          h('tr', null, h('td', null, 'Condition'), h('td.v', null, `${Math.round(r.condition)}%`)),
          h('tr', null, h('td', null, 'Position'), h('td.v', null, `E ${r.x.toFixed(0)} m · N ${r.z.toFixed(0)} m`)),
          h('tr', null, h('td', null, 'Distance from you'), h('td.v', null, `${r.distance.toFixed(0)} m`)),
          h('tr', null, h('td', null, 'Odometer'), h('td.v', null, `${(r.odometer / 1000).toFixed(2)} km`)),
          h('tr', null, h('td', null, 'Tilt'), h('td.v', null, `pitch ${r.pitchDeg.toFixed(0)}° · roll ${r.rollDeg.toFixed(0)}°`)),
          h('tr', null, h('td', null, 'Relay signal'), h('td.v', null, `${Math.round(r.signal * 100)}%`)),
        ) : h('p', null, 'No rover linked.'),
        r ? h<'button'>('button.remote-btn' + (r.linkable ? '' : '.off'), { onclick: () => { if (r.linkable) this.onRemote?.(); }, title: r.why ?? '' }, r.linkable ? '◉  TAKE REMOTE CONTROL' : `◌  ${r.why ?? 'REMOTE LINK UNAVAILABLE'}`) : null,
        h('h4.pdah', { style: { marginTop: '14px' } }, 'MAST CAMERA · LIVE FEED'),
        feed ?? h('p', null, 'Feed unavailable.')));
    } else if (this.tab === 'inventory') {
      const inv = this.inventory;
      const desc = h('div.desc', null, 'Hover an item to inspect it.');
      const inspect = (i: number) => {
        const s = inv?.slots[i];
        if (!s) return;
        const d = itemDef(s.id);
        desc.replaceChildren(h('b', null, d.name), h('span', { style: { color: 'var(--muted)' } }, ` · ${d.category}${d.stack > 1 ? ` · ×${s.count}` : ''}`), h('br'), d.description);
      };
      const samples = inv ? (['hematite', 'olivine', 'gypsum'] as const).map((m) => `${itemDef(m).name.replace(/ sample$/, '')} ${inv.count(m)}`).join(' · ') : '';
      this.main.replaceChildren(h('div.inv', null,
        h('h4', { style: { margin: '0 0 10px', fontSize: '12px', letterSpacing: '0.18em', color: 'var(--accent-2)' } }, `SUIT INVENTORY · ${inv ? inv.slots.filter(Boolean).length : 0}/${inv?.capacity ?? 0} SLOTS`),
        inv ? inventoryGrid(inv, null, inspect) : h('p', null, 'No inventory.'),
        h('p', { style: { fontSize: '13px', color: 'var(--muted)', marginTop: '12px' } }, `Mineral samples: ${samples}`),
        desc));
    } else {
      const items = this.mission.records.map((id) => RECORDS[id] ?? null).filter((r): r is StoryRecord => !!r);
      this.main.replaceChildren(h('div.list', null,
        items.length ? null : h('p', { style: { color: 'var(--muted)', padding: '12px' } }, 'No records recovered yet.'),
        ...items.map((r) => h('div.item', { onclick: () => this.onRead(r.id) }, h('div.k', null, `${r.kind.toUpperCase()} · ${r.source}`), h('div', null, r.title)))));
    }
  }
}
