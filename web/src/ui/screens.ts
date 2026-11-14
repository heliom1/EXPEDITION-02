import { h } from './dom';
import type { Settings } from '../core/settings';
import type { StoryRecord } from '../missions/records';
import { INTRO } from '../missions/records';
import type { SurveyMap, MapMarker } from './minimap';
import { OBJECTIVES, type MissionState } from '../missions/missions';
import { RECORDS } from '../missions/records';

const wordmark = () => h('div', null, h('div.wordmark', { html: 'CINDERFALL <b>2</b>' }), h('div.tagline', null, 'EXPLORE · SURVIVE · UNCOVER'));

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
}

const CONTROLS: Array<[string, string]> = [
  ['Move', 'W A S D'], ['Look', 'Mouse'], ['Sprint', 'Shift'], ['Jump', 'Space'], ['Interact', 'E'],
  ['PDA (map, objectives, logs)', 'Tab'], ['Tool bar', '1 – 5'], ['Pause / release mouse', 'Esc'], ['Developer overlay', 'F3'],
];

/** Main menu laid out like reference image 2: wordmark and vertical list on the left, tagline bottom-right. */
export class MainMenu {
  readonly el: HTMLElement;
  private sheet: HTMLElement;
  private continueBtn: HTMLButtonElement;

  constructor(parent: HTMLElement, private settings: Settings, private readonly handlers: MenuHandlers) {
    this.sheet = h('div.sheet.panel.interactive.hidden');
    const item = (icon: string, label: string, fn: () => void, primary = false) =>
      h<'button'>('button' + (primary ? '.primary' : ''), { onclick: fn }, h('span.ico', null, icon), label);
    this.continueBtn = item('▶', 'Continue', () => handlers.onContinue());
    this.continueBtn.disabled = true;
    this.continueBtn.title = 'Saving arrives in a later build';
    const items = h('div.items.interactive', null,
      this.continueBtn,
      item('▷', 'New Game', () => handlers.onNewGame(), true),
      item('⚙', 'Settings', () => this.showSettings()),
      item('⌨', 'Controls', () => this.showControls()),
      item('ⓘ', 'Credits', () => this.showCredits()),
    );
    this.el = h('div.menu', null,
      h('div.left', null, wordmark(), items),
      this.sheet,
      h('div.footer', null, 'The Red Planet Awaits…'),
      h('div.build', null, 'Vertical slice · v0.1 · Browser build'),
    );
    parent.append(this.el);
  }

  show(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
    if (!on) this.sheet.classList.add('hidden');
  }

  private open(title: string, ...body: Array<Node | string>): void {
    this.sheet.replaceChildren(h('h3', null, title), ...body);
    this.sheet.classList.remove('hidden');
  }

  showControls(): void {
    this.open('CONTROLS', h('table', null, ...CONTROLS.map(([a, k]) => h('tr', null, h('td', null, a), h('td', null, h('kbd', null, k))))));
  }

  showCredits(): void {
    this.open('CREDITS',
      h('p', null, 'Cinderfall 2 — story, concept, CinderRain terrain and 3D models by the Cinderfall 2 team.'),
      h('p', null, 'Rendering: three.js (MIT licence). Built with Vite and TypeScript.'),
      h('p', null, 'Rover, outpost, drilling machine and astronaut shown in this build are temporary placeholders until the team\'s models are integrated.'),
    );
  }

  showSettings(): void {
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
    this.open('SETTINGS',
      h('div.row', null, 'Mouse sensitivity', h('span', null, sens, ' ', sensVal)),
      h('div.row', null, 'Invert mouse Y', inv),
      h('div.row', null, 'Graphics quality', q),
      h('p', { style: { color: 'var(--muted)', fontSize: '12.5px', marginTop: '12px' } }, 'Low: no sun shadows, 1× pixel ratio, shorter high-detail terrain radius.'),
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
  private tab: 'map' | 'missions' | 'logs' = 'map';
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
    this.el.classList.remove('hidden');
    this.render(px, pz, heading, markers);
  }

  close(): void {
    this.open = false;
    this.el.classList.add('hidden');
  }

  private render(px: number, pz: number, heading: number, markers: MapMarker[]): void {
    const b = (id: typeof this.tab, label: string) => h('button' + (this.tab === id ? '.on' : ''), { onclick: () => { this.tab = id; this.render(px, pz, heading, markers); } }, label);
    this.nav.replaceChildren(h('div.t', null, 'PDA'), b('map', '▦  Map'), b('missions', '◆  Missions'), b('logs', '☰  Logs'), h('div', { style: { flex: '1' } }), h('div', { style: { fontSize: '12px', color: 'var(--muted)', padding: '8px 10px' } }, h('kbd', null, 'TAB'), ' close'));
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
        return h('div.item' + (done ? '.done' : ''), null, h('div.k', null, done ? 'COMPLETE' : 'ACTIVE'), h('div', null, o.title), h('div', { style: { fontSize: '13px', color: 'var(--muted)', marginTop: '3px' } }, o.description));
      })));
    } else {
      const items = this.mission.records.map((id) => RECORDS[id] ?? null).filter((r): r is StoryRecord => !!r);
      this.main.replaceChildren(h('div.list', null,
        items.length ? null : h('p', { style: { color: 'var(--muted)', padding: '12px' } }, 'No records recovered yet.'),
        ...items.map((r) => h('div.item', { onclick: () => this.onRead(r.id) }, h('div.k', null, `${r.kind.toUpperCase()} · ${r.source}`), h('div', null, r.title)))));
    }
  }
}
