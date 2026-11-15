import { PerspectiveCamera, Vector3 } from 'three';
import { h, fmtDistance } from './dom';
import type { SurveyMap, MapMarker } from './minimap';
import type { Objective } from '../missions/missions';

export interface HudState {
  x: number;
  y: number;
  z: number;
  heading: number;
  oxygen: number;
  power: number;
  health: number;
  objective: Objective | null;
  /** Ground height at the objective target, for the world-space waypoint. */
  targetY: number;
  prompt: { verb: string; label: string; status: string | null } | null;
  progress: { label: string; value: number } | null;
  markers: MapMarker[];
}

const SLOTS = [
  { icon: '⌖', name: 'Scanner' },
  { icon: '⛏', name: 'Sample kit' },
  { icon: '✚', name: 'Med kit' },
  { icon: 'O₂', name: 'O₂ canister' },
  { icon: '⚡', name: 'Battery' },
];

/**
 * In-game HUD laid out like reference image 1: objective card (top-left), compass strip (top),
 * circular minimap with distance (top-right), O₂/energy/health (bottom-left), tool bar
 * (bottom-centre), interaction prompt (bottom-right).
 */
export class Hud {
  readonly root: HTMLElement;
  private objTitle: HTMLElement;
  private objDesc: HTMLElement;
  private strip: HTMLElement;
  private compassMark: HTMLElement;
  private mini: CanvasRenderingContext2D;
  private dist: HTMLElement;
  private vit: Record<'o2' | 'pwr' | 'hp', { row: HTMLElement; fill: HTMLElement; pct: HTMLElement }>;
  private prompt: HTMLElement;
  private promptVerb: HTMLElement;
  private promptSub: HTMLElement;
  private cross: HTMLElement;
  private progress: HTMLElement;
  private progLabel: HTMLElement;
  private progFill: HTMLElement;
  private notices: HTMLElement;
  private waypoint: HTMLElement;
  private waypointText: HTMLElement;
  private slots: HTMLElement[] = [];
  private vehicle: HTMLElement;
  private v = new Vector3();
  private miniTimer = 0;

  constructor(parent: HTMLElement, private readonly map: SurveyMap) {
    this.objTitle = h('div.title');
    this.objDesc = h('div.desc');
    const objective = h('div.objective.panel', null, h('div.dia', null, '◆'), h('div', null, h('div.label', null, 'Main Objective'), this.objTitle, this.objDesc));

    this.strip = h('div.strip');
    for (let d = -360; d <= 720; d += 15) {
      const n = ((d % 360) + 360) % 360;
      const names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
      const label = names[n];
      const t = label ? h('div.tick' + (label.length === 1 ? '.cardinal' : ''), null, label) : h('div.tick.minor');
      t.style.left = `${d * 3}px`;
      this.strip.append(t);
    }
    this.compassMark = h('div.mark');
    const compass = h('div.compass', null, this.strip, h('div.center'), this.compassMark);

    const canvas = h<'canvas'>('canvas', { width: 336, height: 336 });
    this.mini = canvas.getContext('2d')!;
    this.dist = h('div.dist.panel', null, '—');
    const minimap = h('div.minimap', null, canvas, this.dist);

    const mk = (icon: string, name: string, color: string) => {
      const fill = h('div.fill', { style: { background: color, width: '100%' } });
      const pct = h('div.pct', null, '100%');
      const row = h('div.vital', null, h('div', { style: { color } }, icon), h('div', null, name), h('div.track', null, fill), pct);
      return { row, fill, pct };
    };
    this.vit = { o2: mk('◍', 'Oxygen', 'var(--o2)'), pwr: mk('⚡', 'Energy', 'var(--energy)'), hp: mk('✚', 'Health', 'var(--health)') };
    const vitals = h('div.vitals.panel', null, this.vit.o2.row, this.vit.pwr.row, this.vit.hp.row);

    const hotbar = h('div.hotbar');
    SLOTS.forEach((s, i) => {
      const el = h('div.slot.panel', { title: s.name }, h('span.n', null, String(i + 1)), h('span.icon', null, s.icon), h('span.c'));
      this.slots.push(el);
      hotbar.append(el);
    });
    this.selectSlot(0);

    this.promptVerb = h('span');
    this.promptSub = h('span.sub');
    this.prompt = h('div.prompt.panel.hidden', null, h('kbd', null, 'E'), this.promptVerb, this.promptSub);
    this.cross = h('div.crosshair');
    this.progLabel = h('div');
    this.progFill = h('div.fill');
    this.progress = h('div.progress.panel.hidden', null, this.progLabel, h('div.track', null, this.progFill));
    this.notices = h('div.notices');
    this.waypointText = h('div');
    this.waypoint = h('div.waypoint.hidden', null, this.waypointText, h('div.d'));
    const hint = h('div.hint-bar', null, h('kbd', null, 'TAB'), ' PDA  ·  ', h('kbd', null, 'E'), ' interact  ·  ', h('kbd', null, '1–5'), ' tools  ·  ', h('kbd', null, 'Q'), ' use item');

    this.vehicle = h('div.vehicle.panel.hidden');
    this.root = h('div.hud.hidden', null, h('div.vignette'), objective, compass, minimap, vitals, hotbar, this.vehicle, this.prompt, this.cross, this.progress, this.notices, this.waypoint, hint);
    parent.append(this.root);
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }

  /** Rover status panel while driving (null hides it). */
  setVehicle(v: { name: string; kmh: number; battery: number; condition: number; pitchDeg: number; rollDeg: number; charging: boolean; camera: string } | null): void {
    this.vehicle.classList.toggle('hidden', !v);
    if (!v) return;
    const bar = (p: number, c: string) => h('div.track', null, h('div.fill', { style: { width: `${Math.max(0, Math.min(100, p))}%`, background: c } }));
    this.vehicle.replaceChildren(
      h('div.vt', null, v.name, h('span', null, v.camera)),
      h('div.vs', null, h('b', null, v.kmh.toFixed(1)), ' km/h'),
      h('div.vr', null, h('span', null, v.charging ? 'Battery ⚡' : 'Battery'), bar(v.battery, v.battery < 20 ? 'var(--warn, #e0a050)' : 'var(--energy)'), h('span', null, `${Math.round(v.battery)}%`)),
      h('div.vr', null, h('span', null, 'Condition'), bar(v.condition, 'var(--health)'), h('span', null, `${Math.round(v.condition)}%`)),
      h('div.vh', null, `Pitch ${v.pitchDeg.toFixed(0)}°  ·  Roll ${v.rollDeg.toFixed(0)}°`),
      h('div.vh', null, h('kbd', null, 'W/S'), ' drive  ', h('kbd', null, 'A/D'), ' steer  ', h('kbd', null, 'Space'), ' brake  ', h('kbd', null, 'C'), ' camera  ', h('kbd', null, 'E'), ' exit'),
    );
  }

  selectSlot(i: number): void {
    this.slots.forEach((s, k) => s.classList.toggle('on', k === i));
  }

  /** Quick-slot contents from the inventory: icon, name and carried count (0 = greyed out; tools show no count). */
  setHotbar(items: Array<{ icon: string; name: string; count: number; tool: boolean } | null>, selected: number): void {
    this.slots.forEach((el, k) => {
      const it = items[k];
      el.title = it ? `${it.name}${it.tool ? '' : ` ×${it.count}`}` : 'Empty';
      (el.querySelector('.icon') as HTMLElement).textContent = it ? it.icon : '';
      (el.querySelector('.c') as HTMLElement).textContent = it && !it.tool ? String(it.count) : '';
      el.classList.toggle('empty', !it || it.count <= 0);
    });
    this.selectSlot(selected);
  }

  notify(text: string, tone: 'info' | 'warn' | 'good' = 'info'): void {
    const n = h('div.notice.panel' + (tone !== 'info' ? `.${tone}` : ''), null, text);
    this.notices.prepend(n);
    while (this.notices.children.length > 4) this.notices.lastChild?.remove();
    setTimeout(() => n.remove(), 6500);
  }

  update(s: HudState, cam: PerspectiveCamera, dt: number): void {
    // Objective card.
    const title = s.objective ? s.objective.title : 'All current objectives complete';
    if (this.objTitle.textContent !== title) {
      this.objTitle.textContent = title;
      this.objDesc.textContent = s.objective ? s.objective.description : 'More of the investigation arrives in later builds.';
    }

    // Compass: 3 px per degree.
    this.strip.style.transform = `translateX(${-s.heading * 3}px)`;
    let dist = 0;
    if (s.objective) {
      const t = s.objective.target;
      const bearing = ((Math.atan2(t.x - s.x, t.z - s.z) * 180) / Math.PI + 360) % 360;
      let rel = bearing - s.heading;
      rel = ((rel + 540) % 360) - 180;
      this.compassMark.style.display = Math.abs(rel) < 100 ? 'block' : 'none';
      this.compassMark.style.left = `calc(50% + ${rel * 3}px)`;
      dist = Math.hypot(t.x - s.x, t.z - s.z);
      this.dist.textContent = `◆ ${t.label} · ${fmtDistance(dist)}`;

      // World-space waypoint marker.
      this.v.set(t.x, s.targetY + 3, t.z);
      this.v.project(cam);
      const onScreen = this.v.z < 1 && Math.abs(this.v.x) < 0.95 && Math.abs(this.v.y) < 0.95;
      this.waypoint.classList.toggle('hidden', !onScreen || dist < 6);
      if (onScreen) {
        this.waypoint.style.left = `${(this.v.x * 0.5 + 0.5) * 100}%`;
        this.waypoint.style.top = `${(-this.v.y * 0.5 + 0.5) * 100}%`;
        this.waypointText.textContent = `${t.label} · ${fmtDistance(dist)}`;
      }
    } else {
      this.compassMark.style.display = 'none';
      this.waypoint.classList.add('hidden');
      this.dist.textContent = `${s.x.toFixed(0)}, ${s.z.toFixed(0)}`;
    }

    this.miniTimer -= dt;
    if (this.miniTimer <= 0) {
      this.miniTimer = 1 / 30;
      this.map.drawMini(this.mini, s.x, s.z, s.heading, s.markers);
    }

    const setV = (k: 'o2' | 'pwr' | 'hp', v: number, low: number) => {
      const e = this.vit[k];
      e.fill.style.width = `${v.toFixed(1)}%`;
      e.pct.textContent = `${Math.round(v)}%`;
      e.row.classList.toggle('low', v < low);
    };
    setV('o2', s.oxygen, 25);
    setV('pwr', s.power, 15);
    setV('hp', s.health, 40);

    this.prompt.classList.toggle('hidden', !s.prompt);
    this.cross.classList.toggle('focus', !!s.prompt);
    if (s.prompt) {
      this.promptVerb.textContent = `${s.prompt.verb} ${s.prompt.label}`;
      this.promptSub.textContent = s.prompt.status ?? '';
    }
    this.progress.classList.toggle('hidden', !s.progress);
    if (s.progress) {
      this.progLabel.textContent = s.progress.label;
      this.progFill.style.width = `${(s.progress.value * 100).toFixed(1)}%`;
    }
  }
}
