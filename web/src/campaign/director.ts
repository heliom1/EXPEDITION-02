import { Vector3, type Group, type Scene, type Texture } from 'three';
import type { Cutscene } from '../cinematics/cutscene';
import type { MissionState } from '../missions/missions';
import { CHAPTERS, OBJECTIVES } from '../missions/missions';
import { RECORDS, type StoryRecord } from '../missions/records';
import type { VoiceDirector } from '../audio/voice';
import type { AudioEngine } from '../audio/audio';
import type { Hud } from '../ui/hud';
import type { InteractionSystem, InteractionVerb } from '../player/interaction';
import type { Inventory } from '../inventory/inventory';
import type { MannedVehicle } from '../vehicles/mannedVehicle';
import type { DrivableRover } from '../vehicles/drivableRover';
import { h } from '../ui/dom';
import { objectiveCine, triggerLength, type CineEnv, type CineSpec } from './cines';
import {
  BeaconProp, ConsoleProp, ElectricalPanelProp, EquipmentCaseProp, FieldStationProp, GarageProp, HoloTableProp, LabStationProp,
  LegacyFacilityProp, OxygenGeneratorProp, WaterRecyclerProp,
} from './props';

/**
 * EXPEDITION 02 campaign director: runs the chaptered objectives from the user's script on top of the existing game.
 * Event-driven (directive Part 5): each objective has an APPROACH moment (proximity or start → dialogue + optional
 * cinematic), gameplay ACTIVATION (interactions, timed processes "hold position", travel, vehicle/rover actions) and a
 * COMPLETION moment (unique cinematic → mission progress). Moments are recorded as mission flags (`appr.<id>`,
 * `done.<id>`, `s.<id>.<step>`), saved with the game, so a cinematic never replays on re-entering an area.
 * Every cinematic can be skipped (Space twice) without affecting progress — completion is applied by the gameplay
 * event, not by the cinematic finishing.
 */
export interface CampaignCtx {
  ui: HTMLElement;
  scene: Scene;
  mission: MissionState;
  voice: VoiceDirector;
  hud: Hud;
  audio: AudioEngine;
  interactions: InteractionSystem;
  inventory: Inventory;
  env: CineEnv;
  playerPos(): Vector3;
  indoors(): boolean;
  inCave(): boolean;
  showRecord(r: StoryRecord): void;
  playCine(c: Cutscene, then?: () => void): void;
  placeInOutpost(g: Group, dx: number, dz: number, yaw: number, r: number, h: number): Vector3;
  placeOnGround(g: Group, x: number, z: number, yaw: number, r?: number, h?: number): Vector3;
  vehicle(): MannedVehicle | null;
  rover(): DrivableRover | null;
  driving(): 'mev' | 'r1' | null;
  sites: { outpost: Vector3; reactor: Vector3; drill: Vector3; caveMouth: Vector3; caveIn: Vector3; caveHall: Vector3; lastBeacon: Vector3; ice: Vector3; ridge: Vector3 };
  facility: { farm: Vector3; locker: Vector3; comms: Vector3; shields: Vector3; terminal: Vector3; baseStatus: Vector3; airlock: Vector3 };
  setOutpostPower(level: number): void;
  setStorm(level: number): void;
  setAirlockLocked(locked: boolean): void;
  mapTexture: Texture | null;
  saveDirty(): void;
  save(): void;
  /** Ice reveal cutscene (camera paths validated against the cave). */
  iceCut(totalSeconds: number): Cutscene;
  /** Final cinematic + end card after the recommendation. */
  finale(choice: 'A' | 'B' | 'C'): void;
}

interface Proc { id: string; at: () => Vector3; range: number; dur: number; t: number; label: string; done: () => void }

const STORM: Record<string, number> = { storm_alert: 0.35, secure: 0.55, storm_mode: 0.75, maintain: 1 };

export class CampaignDirector {
  private proc: Proc | null = null;
  private busy = false;
  private holdTimer = 0;
  private lastChapter = 0;
  private stormLevel = 0;
  private stormTarget = 0;
  readonly props: {
    reactor: ConsoleProp; panel: ElectricalPanelProp; water: WaterRecyclerProp; oxygen: OxygenGeneratorProp; lab: LabStationProp;
    holo: HoloTableProp; garage: GarageProp; survey: BeaconProp; station: FieldStationProp; equip: EquipmentCaseProp; facility: LegacyFacilityProp;
  };
  readonly pos: Record<string, Vector3> = {};
  private readonly chapterEl: HTMLElement;
  private readonly discoveryEl: HTMLElement;
  private readonly archiveEl: HTMLElement;

  constructor(private readonly c: CampaignCtx, places: { garage: { x: number; z: number; yaw: number }; survey: { x: number; z: number }; station: { x: number; z: number }; facility: { x: number; z: number; yaw: number } }) {
    const p = this.props = {
      reactor: new ConsoleProp(true), panel: new ElectricalPanelProp(), water: new WaterRecyclerProp(), oxygen: new OxygenGeneratorProp(),
      lab: new LabStationProp(), holo: new HoloTableProp(c.mapTexture), garage: new GarageProp(), survey: new BeaconProp(0x4ad0ff),
      station: new FieldStationProp(), equip: new EquipmentCaseProp(), facility: new LegacyFacilityProp(),
    };
    // ---- placement (outpost-relative props were checked against the collision map: tools/outpost-grid.mjs) ----
    c.placeInOutpost(p.panel.group, -4.6, -6.0, Math.PI / 2, 0.35, 2.2);
    c.placeInOutpost(p.water.group, -28.2, -6.2, Math.PI / 2, 0.5, 2);
    c.placeInOutpost(p.oxygen.group, -28.3, -9.6, Math.PI / 2, 0.55, 1.4);
    c.placeInOutpost(p.lab.group, 2.6, 31.2, Math.PI, 0.7, 1.4);
    c.placeInOutpost(p.holo.group, -0.6, 31.0, 0, 0.8, 1.2);
    const rq = c.sites.reactor;
    c.placeOnGround(p.reactor.group, rq.x + 6, rq.z - 6, Math.atan2(c.sites.outpost.x - rq.x, c.sites.outpost.z - rq.z), 0.5, 1.6);
    c.placeOnGround(p.garage.group, places.garage.x, places.garage.z, places.garage.yaw);
    c.placeOnGround(p.survey.group, places.survey.x, places.survey.z, 0, 0.2, 2.3);
    c.placeOnGround(p.station.group, places.station.x, places.station.z, 0.8, 1.2, 2.5);
    const cm = c.sites.caveMouth;
    c.placeOnGround(p.equip.group, cm.x + 3.5, cm.z + 7, 2.6, 0.6, 0.6);
    c.placeOnGround(p.facility.group, places.facility.x, places.facility.z, places.facility.yaw);
    p.reactor.screen.draw(['REACTOR CONTROL', 'FSP-1  STANDBY', 'DIAGNOSTIC REQUIRED'], '#ffcf9a');
    p.lab.screen.draw(['LAB ANALYSIS', 'CHAMBER EMPTY'], '#bfe8ff', '#06121a');
    p.garage.terminal.screen.draw(['MEV-1 MAINTENANCE', 'SYSTEMS DORMANT', 'DIAGNOSTIC REQUIRED'], '#ffcf9a');
    const P = this.pos;
    P.reactor = p.reactor.worldPoint('use'); P.panel = p.panel.worldPoint('use'); P.water = p.water.worldPoint('use'); P.oxygen = p.oxygen.worldPoint('use');
    P.lab = p.lab.worldPoint('use'); P.chamber = p.lab.worldPoint('chamber'); P.holo = p.holo.worldPoint('use');
    P.garage = p.garage.worldPoint('entrance'); P.garageTerm = p.garage.worldPoint('terminal'); P.garageBay = p.garage.worldPoint('vehicle');
    P.survey = p.survey.worldPoint('use'); P.station = p.station.worldPoint('use'); P.equip = p.equip.worldPoint('use');
    P.facility = p.facility.worldPoint('front'); P.facTerm = p.facility.worldPoint('use'); P.cell = p.facility.worldPoint('cell'); P.breaker = p.facility.worldPoint('breaker');
    for (let i = 0; i < 3; i++) P[`ch${i}`] = p.panel.worldPoint(`ch${i}`);
    this.retarget();

    this.chapterEl = h('div.chapter-card');
    this.discoveryEl = h('div.discovery-card');
    this.archiveEl = h('div.archive-video', null, h('div.rec', null, '● REC  EXPEDITION 1  ·  2035-08-14'), h('div.scan'));
    c.ui.append(this.chapterEl, this.discoveryEl, this.archiveEl);
    this.registerInteractables();
  }

  // ------------------------------------------------------------------ helpers
  private get cur(): string | null { return this.c.mission.current?.id ?? null; }
  private flag(f: string): boolean { return this.c.mission.flags.has(f); }
  private set(f: string): void { this.c.mission.flags.add(f); this.c.saveDirty(); }
  private dist(p: Vector3): number { const q = this.c.playerPos(); return Math.hypot(q.x - p.x, q.z - p.z) + Math.max(0, Math.abs(q.y - p.y) - 3); }
  private near(p: Vector3, r: number): boolean { return this.dist(p) < r; }
  private steps(id: string): number { let n = 0; for (const f of this.c.mission.flags) if (f.startsWith(`s.${id}.`)) n++; return n; }

  /** Points every objective marker at its real prop / site. */
  private retarget(): void {
    const P = this.pos, S = this.c.sites, F = this.c.facility;
    const tg: Record<string, Vector3> = {
      locate_outpost: S.outpost, airlock: F.airlock, emergency_power: F.terminal, inspect_habitat: F.farm, reactor: P.reactor, electrical: P.panel,
      water: P.water, oxygen: P.oxygen, food: F.farm, restoration: F.terminal, garage: P.garage, inspect_vehicle: P.garageBay, restore_vehicle: P.garageTerm,
      first_deploy: P.survey, storm_alert: F.terminal, secure: P.garageBay, storm_mode: F.terminal, maintain: F.baseStatus, transmission1: F.comms,
      long_prep: P.garageTerm, travel: S.drill, samples: S.drill, formation: S.drill, recorder: P.station, cave_entrance: S.caveMouth, cave_prep: P.equip,
      enter_cave: S.caveHall, subsurface: S.lastBeacon, ice: S.ice, ice_sample: S.ice, return: S.outpost, lab_transfer: P.chamber, analyze: P.lab,
      review: F.terminal, reconstruct: P.holo, earth: F.comms, facility: P.facility, aux: P.cell, records: P.facTerm, final_recording: P.facTerm,
      survey: P.facTerm, final_report: F.terminal, assessment: F.terminal, choice: F.terminal,
    };
    for (const o of OBJECTIVES) { const t = tg[o.id]; if (t) { o.target.x = t.x; o.target.z = t.z; } }
    const r1 = this.c.rover();
    const ro = OBJECTIVES.find((o) => o.id === 'r1_link');
    if (r1 && ro) { ro.target.x = r1.pos.x; ro.target.z = r1.pos.z; }
  }

  /** Marker height for underground / elevated targets. */
  targetY(id: string): number | null {
    const S = this.c.sites;
    if (id === 'enter_cave') return S.caveHall.y;
    if (id === 'subsurface') return S.lastBeacon.y;
    if (id === 'ice' || id === 'ice_sample') return S.ice.y;
    return null;
  }

  /** HUD progress bar for a running timed process. */
  get progress(): { label: string; value: number } | null { return this.proc ? { label: this.proc.label, value: this.proc.t / this.proc.dur } : null; }

  private start(id: string, at: () => Vector3, dur: number, label: string, done: () => void, range = 4.5): void {
    if (this.proc) return;
    this.proc = { id, at, range, dur, t: 0, label, done };
    this.c.audio.ui('scan');
    this.c.hud.notify(`${label.replace('…', '')} — hold position.`);
  }

  private cine(spec: CineSpec, then?: () => void): void {
    this.busy = true;
    this.c.playCine(objectiveCine(this.c.env, spec), () => { this.busy = false; then?.(); });
  }

  private approach(id: string, spec?: CineSpec | null): void {
    if (this.flag(`appr.${id}`)) return;
    this.set(`appr.${id}`);
    this.c.voice.trigger(`obj:${id}:approach`);
    if (spec) this.cine({ trigger: `obj:${id}:approach`, max: 10, ...spec });
  }

  /** Completion moment: dialogue + unique cinematic, then mission progress (applied even if the cinematic is skipped). */
  complete(id: string, spec?: CineSpec | null, after?: () => void): void {
    if (this.cur !== id || this.flag(`done.${id}`)) return;
    this.proc = null;
    this.c.voice.trigger(`obj:${id}:done`);
    this.c.voice.trigger(`obj:${id}:after`);
    this.c.audio.ui('complete');
    const fin = () => { this.c.mission.completeObjective(id); after?.(); this.c.save(); };
    if (spec) this.cine({ trigger: `obj:${id}:done`, min: 5, max: 14, ...spec }, fin);
    else fin();
  }

  private chapterCard(ch: number): void {
    const title = CHAPTERS[ch];
    if (!title) return;
    this.chapterEl.replaceChildren(h('div.eyebrow', null, ch === 9 ? 'EPILOGUE' : `CHAPTER ${String(ch).padStart(2, '0')}`), h('div.title', null, title));
    this.chapterEl.classList.remove('on'); void this.chapterEl.offsetWidth; this.chapterEl.classList.add('on');
    this.c.audio.cue('swell');
    setTimeout(() => this.chapterEl.classList.remove('on'), 5200);
  }

  // ------------------------------------------------------------------ interactables
  private registerInteractables(): void {
    const P = this.pos, p = this.props;
    const add = (id: string, label: string, verb: InteractionVerb, at: Vector3 | (() => Vector3), when: () => boolean, interact: () => void, status?: () => string | null, range = 2.8) => {
      const pos = typeof at === 'function' ? at() : at;
      const it = { id, label, verb, position: pos, range, enabled: when, interact, status };
      if (typeof at === 'function') Object.defineProperty(it, 'position', { get: at });
      this.c.interactions.add(it);
    };
    const is = (...ids: string[]) => () => !!this.cur && ids.includes(this.cur) && !this.busy;
    add('c_airlock', 'ID card reader', 'Access', this.c.facility.airlock, () => this.cur === 'airlock' && !this.flag('s.airlock.scan'), () => {
      this.set('s.airlock.scan');
      this.c.setAirlockLocked(false);
      this.c.audio.ui('door');
      this.c.hud.notify('Identification accepted — airlock cycling: outer door, pressure equalization, inner door.', 'good');
      this.cine({ grammar: 'push', target: this.c.facility.airlock.clone().add(new Vector3(0, 0.6, 0)), dur: 3.4, r: 1.6, indoor: true });
    }, () => 'scan identification card', 3.4);
    add('c_reactor', 'Reactor control console', 'Activate', P.reactor, is('reactor'), () => this.start('reactor', () => P.reactor, 6, 'Running reactor diagnostic…', () => {
      p.reactor.status('ok'); p.reactor.screen.draw(['REACTOR CONTROL', 'FSP-1  ONLINE', 'OUTPUT 40.2 kWe'], '#b8ffb0');
      this.complete('reactor', { grammar: 'orbit', target: this.c.sites.reactor.clone().add(new Vector3(0, 3, 0)), r: 16, h: 6, a0: -0.4, arc: 1.2, place: { text: 'FISSION SURFACE POWER', eyebrow: 'Primary power system · online' } }, () => this.c.showRecord(RECORDS.reactor_diag));
    }), () => (this.cur === 'reactor' ? 'run diagnostic' : 'online'));
    for (let i = 0; i < 3; i++) add(`c_ch${i}`, `Distribution channel ${i + 1}`, 'Activate', P[`ch${i}`], () => this.cur === 'electrical' && !p.panel.on[i] && !this.busy, () => {
      p.panel.set(i, true); this.set(`s.electrical.${i}`); this.c.audio.ui('interact');
      const n = p.panel.on.filter(Boolean).length;
      this.c.hud.notify(`Channel ${i + 1} reconnected (${n}/3).`, 'good');
      if (n === 3) this.complete('electrical', { grammar: 'push', target: P.panel.clone().add(new Vector3(0, 0.35, 0)), r: 0.9, indoor: true, cues: [{ at: 1.2, run: () => this.c.setOutpostPower(1) }] });
    }, () => 'reconnect', 2.2);
    add('c_water', 'Water recycler', 'Repair', P.water, is('water'), () => {
      if (!this.flag('s.water.filter')) {
        this.set('s.water.filter'); p.water.cartridge.position.y = 0.95; this.c.audio.ui('interact');
        this.c.hud.notify('Filter cartridge replaced. Verify the processing cycle [E].', 'good');
        return;
      }
      this.start('water', () => P.water, 5, 'Verifying water-processing cycle…', () => { p.water.running = true; this.complete('water', { grammar: 'push', target: P.water.clone().add(new Vector3(0, 0.3, 0)), r: 1.2, indoor: true }); });
    }, () => (!this.flag('s.water.filter') ? 'replace filter cartridge' : 'verify processing cycle'));
    add('c_oxygen', 'Oxygen generator', 'Activate', P.oxygen, () => !this.busy && (this.cur === 'oxygen' || (this.cur === 'maintain' && !this.flag('s.maintain.o2'))), () => {
      if (this.cur === 'maintain') { this.set('s.maintain.o2'); this.c.hud.notify('O₂ generator: output 2.1 kg/sol — stable.', 'good'); this.c.audio.ui('interact'); return; }
      this.start('oxygen', () => P.oxygen, 5, 'Oxygen-generation operational test…', () => { p.oxygen.running = true; this.complete('oxygen', { grammar: 'glance', target: P.oxygen, dur: 4.5 }); });
    }, () => (this.cur === 'maintain' ? 'check output' : 'run operational test'));
    add('c_garage_term', 'Hangar maintenance terminal', 'Access', P.garageTerm, is('restore_vehicle', 'long_prep'), () => {
      if (this.cur === 'long_prep') {
        this.start('long_prep', () => P.garageTerm, 6, 'Deployment checks: condition, navigation, comms, instruments…', () => this.complete('long_prep', { grammar: 'orbit', target: P.garageBay.clone().add(new Vector3(0, 1.2, 0)), r: 5.5, h: 1.6, a0: 2.2, arc: -1.1, dur: 6 }));
        return;
      }
      const names = ['electrical', 'navigation', 'scientific instrumentation'];
      const k = this.steps('restore_vehicle');
      this.start('restore_vehicle', () => P.garageTerm, 2.8, `Inspecting ${names[k]} systems…`, () => {
        this.set(`s.restore_vehicle.${k}`);
        p.garage.terminal.screen.draw(['MEV-1 MAINTENANCE', ...names.slice(0, k + 1).map((n) => `${n.toUpperCase().slice(0, 18)} ... OK`)], '#b8ffb0');
        if (k + 1 < 3) { this.c.hud.notify(`${names[k][0].toUpperCase() + names[k].slice(1)} systems restored (${k + 1}/3). Next check [E].`, 'good'); return; }
        const v = this.c.vehicle();
        this.complete('restore_vehicle', {
          grammar: 'orbit', target: P.garageBay.clone().add(new Vector3(0, 1.1, 0)), r: 6, h: 1.4, a0: 0.9, arc: 1.4, place: { text: 'MEV-1 ONLINE', eyebrow: 'Manned exploration vehicle' },
          cues: [{ at: 0.8, run: () => { p.garage.powered = true; if (v) { v.powered = true; v.headlights = true; } } }],
        }, () => { this.c.showRecord(RECORDS.vehicle_diag); p.garage.wall.draw(['MAINTENANCE BAY 1', 'MEV-1  READY', 'BATTERY  CHARGING', 'CHARGER  ONLINE'], '#b8ffb0'); });
      });
    }, () => (this.cur === 'long_prep' ? 'run deployment checks' : `system check ${this.steps('restore_vehicle') + 1}/3`));
    add('c_vehicle_inspect', 'MEV-1', 'Inspect', () => (this.c.vehicle()?.toWorld(new Vector3(0, 1.4, 0)) ?? P.garageBay), is('inspect_vehicle'), () => {
      this.complete('inspect_vehicle', { grammar: 'push', target: this.c.vehicle()?.toWorld(new Vector3(0, 1.2, 1.8)) ?? P.garageBay, r: 2.5, dur: 4.5 });
    }, () => 'vehicle diagnostic', 4.2);
    add('c_station', 'Expedition 1 data recorder', 'Collect', P.station, is('recorder'), () => {
      p.station.recorder.visible = false;
      this.complete('recorder', { grammar: 'glance', target: P.station, dur: 4 }, () => this.c.showRecord(RECORDS.recorder_e1));
    }, () => 'retrieve recorder');
    add('c_equip', 'Expedition 1 equipment case', 'Inspect', P.equip, is('cave_prep'), () => this.start('cave_prep', () => P.equip, 4.5, 'Checking lighting, sensors and scanner…', () => this.complete('cave_prep', null)), () => 'check equipment');
    add('c_lab_chamber', 'Analysis chamber', 'Access', P.chamber, is('lab_transfer'), () => {
      if (this.c.inventory.count('ice_core') < 1) { this.c.hud.notify('No ice sample in your inventory.', 'warn'); return; }
      this.c.inventory.remove('ice_core', 1);
      p.lab.sample.visible = true;
      p.lab.screen.draw(['LAB ANALYSIS', 'SAMPLE: ICE CORE C-09', 'READY'], '#bfe8ff', '#06121a');
      this.complete('lab_transfer', { grammar: 'push', target: P.chamber.clone().add(new Vector3(0, -0.1, -0.5)), r: 0.6, indoor: true, place: { text: 'ANALYSIS CHAMBER', eyebrow: 'Sample secured' } });
    }, () => 'secure ice sample', 2.4);
    add('c_lab', 'Laboratory analysis terminal', 'Activate', P.lab, is('analyze'), () => {
      p.lab.analyzing = 1;
      this.c.voice.trigger('obj:analyze:approach');
      this.start('analyze', () => P.lab, 8, 'Analyzing composition, purity, geology…', () => {
        p.lab.analyzing = 0;
        p.lab.screen.draw(['ANALYSIS COMPLETE', 'H₂O ICE  CONFIRMED', 'PURITY  ~92 %', 'DUST BANDS  YES'], '#b8ffb0', '#06121a');
        this.complete('analyze', { grammar: 'push', target: P.lab.clone().add(new Vector3(0, 0.1, -0.6)), r: 0.7, indoor: true, title: { text: 'WATER ICE CONFIRMED', eyebrow: 'Laboratory analysis' } }, () => this.c.showRecord(RECORDS.lab_analysis));
      });
    }, () => 'run analysis', 2.4);
    add('c_holo', 'Holographic mapping table', 'Activate', P.holo, is('reconstruct'), () => {
      p.holo.active = true;
      this.start('reconstruct', () => P.holo, 5, 'Combining geological records…', () => this.complete('reconstruct', {
        grammar: 'push', target: P.holo.clone().add(new Vector3(0, -0.2, -1.0)), r: 1.2, indoor: true, dur: 8,
        update: (t) => { p.holo.expand = Math.min(1, t / 5); },
      }, () => this.c.showRecord(RECORDS.reconstruction)));
    }, () => 'reconstruct survey', 2.6);
    add('c_cell', 'Auxiliary power cell', 'Repair', P.cell, () => this.cur === 'aux' && !p.facility.cellSeated && !this.busy, () => {
      p.facility.cellSeated = true; this.set('s.aux.cell'); this.c.audio.ui('interact'); this.c.hud.notify('Power cell seated. Close the main breaker.', 'good');
    }, () => 'seat power cell');
    add('c_breaker', 'Facility main breaker', 'Activate', P.breaker, () => this.cur === 'aux' && p.facility.cellSeated && !p.facility.breakerOn && !this.busy, () => {
      p.facility.breakerOn = true; this.set('s.aux.breaker');
      this.complete('aux', { grammar: 'orbit', target: P.facility.clone().add(new Vector3(0, 2.5, -6)), r: 16, h: 4, a0: 0.2, arc: 0.9, cues: [{ at: 1.0, run: () => { p.facility.powered = true; } }] }, () => this.c.hud.notify('Research archive accessible.', 'good'));
    }, () => 'close breaker');
    add('c_fac_term', 'Expedition 1 research terminal', 'Access', P.facTerm, is('records', 'final_recording', 'survey'), () => {
      const cur = this.cur;
      if (cur === 'records') this.start('records', () => P.facTerm, 6, 'Recovering and synchronizing research files…', () => this.complete('records', { grammar: 'push', target: P.facTerm, r: 0.9, dur: 6 }));
      else if (cur === 'final_recording') this.playArchive();
      else if (cur === 'survey') this.start('survey', () => P.facTerm, 5, 'Consolidating Expedition 1 + 2 data…', () => this.complete('survey', { grammar: 'glance', target: P.facTerm, dur: 5 }, () => this.c.showRecord(RECORDS.geo_assessment)));
    }, () => (this.cur === 'final_recording' ? 'play final recording' : this.cur === 'survey' ? 'combine survey data' : 'recover records'));
  }

  // ------------------------------------------------------------------ hooks from the game (main.ts)
  /** Shared interactables owned by main (terminal, comms, beacon, ice, baseStatus): returns true if the campaign used it. */
  handle(what: 'terminal' | 'comms' | 'beacon' | 'ice' | 'baseStatus'): boolean {
    const cur = this.cur;
    const F = this.c.facility;
    if (this.busy) return true;
    if (what === 'terminal') {
      if (cur === 'emergency_power') {
        this.complete('emergency_power', { grammar: 'push', target: F.terminal.clone().add(new Vector3(0, 0.2, 0)), r: 1.0, indoor: true, dur: 7, cues: [
          { at: 1.4, run: () => this.c.setOutpostPower(0.35) }, { at: 2.4, run: () => this.c.setOutpostPower(0.6) }, { at: 3.4, run: () => this.c.setOutpostPower(0.85) },
        ] });
        return true;
      }
      if (cur === 'restoration') {
        this.complete('restoration', { grammar: 'push', target: F.terminal.clone().add(new Vector3(0, 0.3, 0)), r: 1.2, indoor: true, dur: 9 }, () => {
          this.c.showRecord(RECORDS.c09);
          this.c.voice.trigger('hook:c09');
        });
        return true;
      }
      if (cur === 'storm_mode') { this.complete('storm_mode', { grammar: 'glance', target: F.terminal, dur: 5, cues: [{ at: 1, run: () => { this.c.setOutpostPower(0.7); this.stormTarget = 1; } }] }); return true; }
      if (cur === 'review') { this.complete('review', { grammar: 'glance', target: F.terminal, dur: 5 }, () => this.c.showRecord(RECORDS.e1_surveys)); return true; }
      if (cur === 'final_report') { this.complete('final_report', { grammar: 'push', target: F.terminal, r: 1.0, indoor: true, dur: 7 }, () => this.c.showRecord(RECORDS.final_report)); return true; }
      if (cur === 'assessment') { this.showAssessment(); return true; }
      if (cur === 'choice') { this.showChoice(); return true; }
      return false;
    }
    if (what === 'baseStatus' && cur === 'maintain' && !this.flag('s.maintain.panel')) {
      this.set('s.maintain.panel'); this.c.hud.notify('Power 40.2 kW · life support 91 % · storm load nominal. Hold conditions until the storm passes.', 'good');
      return false; // also show the systems record
    }
    if (what === 'comms') {
      if (cur === 'transmission1') {
        this.start('transmission1', () => F.comms, 4, 'Restoring damaged transmission…', () => this.complete('transmission1', { grammar: 'push', target: F.comms.clone().add(new Vector3(0, 0.2, 0)), r: 1.0, indoor: true, min: 12, max: 22 }, () => this.c.showRecord(RECORDS.transmission_e1)));
        return true;
      }
      if (cur === 'earth') {
        this.c.mission.addRecord('transmission');
        this.complete('earth', { grammar: 'push', target: F.comms.clone().add(new Vector3(0, 0.2, 0)), r: 1.0, indoor: true, min: 12, max: 20, cues: [{ at: 0.3, run: () => this.c.audio.cue('transmit') }] });
        return true;
      }
      return false;
    }
    if (what === 'beacon') {
      if (cur === 'subsurface') {
        this.start('subsurface', () => this.c.sites.lastBeacon, 5, 'Geological scan…', () => {
          this.c.mission.addRecord('beacon_log');
          this.complete('subsurface', { grammar: 'push', target: this.c.sites.lastBeacon, r: 1.4, lamp: true, dur: 6 });
        }, 6);
        return true;
      }
      return false;
    }
    if (what === 'ice') {
      if (cur === 'ice') { this.iceReveal(); return true; }
      if (cur === 'ice_sample') {
        this.start('ice_sample', () => this.c.sites.ice, 4.5, 'Cutting a controlled ice sample…', () => {
          this.c.inventory.add('ice_core', 1);
          this.complete('ice_sample', { grammar: 'push', target: this.c.sites.ice, r: 1.6, lamp: true, title: { text: 'SAMPLE SECURED', eyebrow: 'ICE CORE C-09 · SEALED' } });
        }, 7);
        return true;
      }
    }
    return false;
  }

  /** Gameplay events from main.ts. */
  notify(e: 'bed' | 'sample' | 'drill:done' | 'remote:start' | 'remote:scan' | 'vehicle:board' | 'vehicle:exit'): void {
    const cur = this.cur;
    if (e === 'bed' && cur === 'food') this.complete('food', { grammar: 'push', target: this.c.facility.farm.clone().add(new Vector3(0, 0.3, 0)), r: 2.0, indoor: true });
    if (e === 'sample' && cur === 'samples') {
      this.set(`s.samples.${this.steps('samples')}`);
      const n = this.steps('samples');
      this.c.hud.notify(`Geological sample catalogued (${n}/2).`, 'good');
      if (n >= 2) this.complete('samples', { grammar: 'glance', target: this.c.sites.drill, dur: 4 });
    }
    if (e === 'drill:done' && cur === 'formation') {
      this.c.mission.addRecord('core_drl2');
      this.complete('formation', { grammar: 'crane', target: this.c.sites.drill.clone().add(new Vector3(0, 2, 0)), r: 16, h: 30, a0: 0.8 }, () => this.c.showRecord(RECORDS.core_drl2));
    }
    if (e === 'remote:start') this.c.voice.trigger('first:remote');
    if (e === 'remote:scan' && cur === 'r1_link') {
      this.c.mission.addRecord('rover_log');
      this.complete('r1_link', null, () => this.c.showRecord(RECORDS.rover_log));
    }
    if (e === 'vehicle:board' && cur === 'first_deploy') this.approach('first_deploy', null);
  }

  /** Whether the DRL-2 drill may run (story gate). */
  get drillUnlocked(): boolean { const i = OBJECTIVES.findIndex((o) => o.id === 'formation'); return this.c.mission.complete || this.c.mission.index >= i; }
  /** Whether MEV-1 may be boarded / R-1 remote-controlled. */
  get vehicleUnlocked(): boolean { return this.flag('done.restore_vehicle') || this.c.mission.complete; }
  get remoteUnlocked(): boolean { return this.flag('done.first_deploy') || this.c.mission.complete; }

  // ------------------------------------------------------------------ per-frame
  update(dt: number, playing: boolean): void {
    for (const pr of Object.values(this.props)) pr.update(dt, performance.now() / 1000);
    // storm weather follows the story (ch.4) and eases between levels
    const cur = this.cur;
    if (cur && STORM[cur] !== undefined && this.stormTarget < STORM[cur] && !this.flag('done.maintain')) this.stormTarget = STORM[cur];
    if (this.flag('done.maintain') && this.stormTarget > 0 && cur !== 'maintain') this.stormTarget = 0;
    this.stormLevel += (this.stormTarget - this.stormLevel) * Math.min(1, dt * 0.12);
    this.c.setStorm(this.stormLevel);
    this.props.garage.doorClosed += ((this.flag('done.secure') && !this.flag('done.maintain') ? 1 : 0) - this.props.garage.doorClosed) * Math.min(1, dt * 0.8);
    if (!playing || !cur) return;
    const ch = OBJECTIVES.find((o) => o.id === cur)?.chapter ?? 0;
    if (ch !== this.lastChapter) { if (this.lastChapter && !this.busy) this.chapterCard(ch); if (!this.busy) this.lastChapter = ch; }
    if (this.busy) return;
    // timed process ("hold position")
    if (this.proc) {
      const pr = this.proc;
      if (this.dist(pr.at()) > pr.range + 1.5) { this.proc = null; this.c.hud.notify('Interrupted — moved out of range.', 'warn'); }
      else {
        const before = pr.t;
        pr.t = Math.min(pr.dur, pr.t + dt);
        if (Math.floor(before) !== Math.floor(pr.t)) this.c.audio.ui('scan');
        if (pr.t >= pr.dur) { this.proc = null; pr.done(); }
      }
    }
    this.objective(cur, dt);
  }

  private objective(id: string, dt: number): void {
    const c = this.c, S = c.sites, F = c.facility, P = this.pos;
    const driving = c.driving();
    switch (id) {
      case 'locate_outpost':
        if (this.near(S.ridge, 22) || this.near(S.outpost, 95)) this.approach(id, { grammar: 'reveal', target: S.outpost.clone().add(new Vector3(0, 6, 0)), h: 7, fov: 30, max: 10 });
        if (this.near(S.outpost, 40)) this.complete(id, { grammar: 'pan', target: S.outpost.clone().add(new Vector3(0, 5, 0)), r: 48, h: 9, a0: -0.25, arc: 1.15, place: { text: 'EXPEDITION 1 RESEARCH OUTPOST', eyebrow: 'Established 2033 · ten years on Mars' } });
        break;
      case 'airlock':
        if (this.near(F.airlock, 14)) this.approach(id, { grammar: 'glance', target: F.airlock.clone().add(new Vector3(0, 0.8, 0)), dur: 4 });
        if (this.flag('s.airlock.scan') && c.indoors()) this.complete(id, null);
        break;
      case 'emergency_power':
        if (c.indoors() && this.near(F.terminal, 9)) this.approach(id, { grammar: 'glance', target: F.terminal, dur: 5 });
        break;
      case 'inspect_habitat': {
        if (c.indoors()) this.approach(id, null);
        const spots: Array<[string, Vector3, string]> = [['farm', F.farm, 'Farm module'], ['storage', F.locker, 'Storage wing'], ['comms', F.comms, 'Communications'], ['shields', F.shields, 'Shield generator']];
        for (const [k, at, name] of spots) if (!this.flag(`s.inspect_habitat.${k}`) && this.near(at, 3.6)) {
          this.set(`s.inspect_habitat.${k}`);
          c.audio.ui('scan');
          c.hud.notify(`${name} assessed — restoration required (${this.steps('inspect_habitat')}/4).`, 'good');
        }
        if (this.steps('inspect_habitat') >= 4) this.complete(id, { grammar: 'glance', target: F.terminal, dur: 5 });
        break;
      }
      case 'reactor': if (this.near(P.reactor, 16)) this.approach(id, { grammar: 'orbit', target: S.reactor.clone().add(new Vector3(0, 2.5, 0)), r: 14, h: 4, a0: 0.6, arc: 0.8, dur: 7 }); break;
      case 'electrical': if (this.near(P.panel, 6)) this.approach(id, null); break;
      case 'water': if (this.near(P.water, 6)) this.approach(id, null); break;
      case 'oxygen': if (this.near(P.oxygen, 6)) this.approach(id, null); break;
      case 'food': if (this.near(F.farm, 8)) this.approach(id, { grammar: 'push', target: F.farm.clone().add(new Vector3(0, 0.4, 0)), r: 3, indoor: true, max: 9 }); break;
      case 'restoration': if (this.near(F.terminal, 7)) this.approach(id, null); break;
      case 'garage':
        if (this.near(P.garage, 45)) this.approach(id, { grammar: 'establish', target: P.garage.clone().add(new Vector3(0, 1.5, 0)), r: 26, h: 5, a0: 0.5, dur: 6 });
        if (this.near(P.garage, 9)) this.complete(id, null);
        break;
      case 'inspect_vehicle': if (this.near(P.garageBay, 8)) this.approach(id, { grammar: 'orbit', target: P.garageBay.clone().add(new Vector3(0, 1.0, 0)), r: 5.2, h: 1.6, a0: 0.4, arc: 2.6, dur: 9, place: { text: 'MEV-1', eyebrow: 'Dormant 3,652 sols' } }); break;
      case 'restore_vehicle': if (this.near(P.garageTerm, 5)) this.approach(id, null); break;
      case 'first_deploy': {
        const v = c.vehicle();
        if (driving === 'mev' && v && Math.hypot(v.pos.x - P.survey.x, v.pos.z - P.survey.z) < 20 && Math.abs(v.speed) < 0.6) {
          this.holdTimer += dt;
          if (this.holdTimer > 8) { this.holdTimer = 0; c.mission.addRecord('survey1'); this.complete(id, { grammar: 'crane', target: v.pos.clone().add(new Vector3(0, 1, 0)), r: 12, h: 26, a0: 1.2 }, () => c.showRecord(RECORDS.survey1)); }
        } else this.holdTimer = 0;
        break;
      }
      case 'storm_alert':
        if (c.indoors()) {
          if (!this.flag('appr.storm_alert')) { for (let k = 0; k < 4; k++) setTimeout(() => c.audio.ui('warn'), k * 650); }
          this.approach(id, { grammar: 'push', target: S.outpost.clone().add(new Vector3(0, 3, -60)), r: 40, indoor: true, dur: 9, title: { text: 'ENVIRONMENTAL ALERT', eyebrow: 'Severe dust storm approaching' } });
          if (this.flag('appr.storm_alert') && !this.busy) this.complete(id, null);
        }
        break;
      case 'secure': {
        this.approach(id, null);
        const v = c.vehicle();
        if (v && driving !== 'mev' && this.props.garage.inBay(v.pos)) this.complete(id, { grammar: 'establish', target: P.garage.clone().add(new Vector3(0, 2, 0)), r: 24, h: 4, a0: 0.3, dur: 7 });
        break;
      }
      case 'storm_mode': if (this.near(F.terminal, 7)) this.approach(id, null); break;
      case 'maintain':
        this.approach(id, null);
        if (this.flag('s.maintain.panel') && this.flag('s.maintain.o2') && c.indoors()) {
          this.holdTimer += dt;
          if (this.holdTimer > 40) {
            this.holdTimer = 0;
            this.complete(id, { grammar: 'glance', target: S.outpost.clone().add(new Vector3(0, 4, -60)), dur: 10, title: { text: 'THE STORM PASSES', eyebrow: 'Monitoring period · 31 hours' }, update: (t) => { this.stormLevel = Math.max(0, 1 - t / 8); this.stormTarget = 0; } });
          }
        }
        break;
      case 'transmission1': if (this.near(F.comms, 7)) this.approach(id, null); break;
      case 'long_prep': if (this.near(P.garageTerm, 6)) this.approach(id, null); break;
      case 'travel':
        this.approach(id, null);
        if (this.near(S.drill, 45)) this.complete(id, { grammar: 'crane', target: S.drill.clone().add(new Vector3(0, 1, 0)), r: 20, h: 40, a0: -0.6, place: { text: 'SURVEY POINT DRL-2', eyebrow: 'Archived Expedition 1 coordinates' } });
        break;
      case 'samples': this.approach(id, null); break;
      case 'formation': if (this.near(S.drill, 14)) this.approach(id, { grammar: 'orbit', target: S.drill.clone().add(new Vector3(0, 2, 0)), r: 9, h: 3, a0: 0.3, arc: 1.0, dur: 7 }); break;
      case 'recorder': if (this.near(P.station, 16)) this.approach(id, { grammar: 'push', target: P.station, r: 2.2, max: 8 }); break;
      case 'cave_entrance':
        this.approach(id, null);
        if (this.near(S.caveMouth, 32)) {
          c.mission.addRecord('cliff_survey');
          this.complete(id, { grammar: 'establish', target: S.caveMouth.clone().add(new Vector3(0, 2, 0)), r: 38, h: 7, a0: 0.4, place: { text: 'CAVE SYSTEM C-09', eyebrow: 'Escarpment · north face' } });
        }
        break;
      case 'cave_prep': this.approach(id, null); break;
      case 'enter_cave':
        if (this.near(S.caveIn, 9)) this.approach(id, { grammar: 'track', target: S.caveHall, r: 4, h: 0.6, lamp: true, max: 10 });
        if (this.near(S.caveHall, 10)) this.complete(id, null);
        break;
      case 'subsurface': if (this.near(S.lastBeacon, 10)) this.approach(id, null); break;
      case 'ice':
        if (this.near(S.ice, 28)) this.approach(id, null);
        if (this.near(S.ice, 12.5)) this.iceReveal();
        break;
      case 'ice_sample': this.approach(id, null); break;
      case 'return':
        if (!c.inCave()) this.approach(id, null);
        if (this.near(S.outpost, 45)) this.complete(id, { grammar: 'pan', target: S.outpost.clone().add(new Vector3(0, 5, 0)), r: 60, h: 10, a0: 0.9, arc: 0.8, place: { text: 'RESEARCH OUTPOST', eyebrow: 'Sol 9 · sunset' } });
        break;
      case 'lab_transfer': if (this.near(P.chamber, 6)) this.approach(id, null); break;
      case 'review': if (this.near(F.terminal, 7)) this.approach(id, null); break;
      case 'reconstruct': if (this.near(P.holo, 5)) this.approach(id, null); break;
      case 'earth': if (this.near(F.comms, 7)) this.approach(id, null); break;
      case 'facility':
        if (this.near(P.facility, 90)) this.approach(id, { grammar: 'establish', target: P.facility.clone().add(new Vector3(0, 3, -4)), r: 46, h: 9, a0: 0.5, dur: 8, place: { text: 'UNDOCUMENTED FACILITY', eyebrow: 'Expedition 1 · signatures match' } });
        if (this.near(P.facility, 16)) this.complete(id, null);
        break;
      case 'aux': this.approach(id, null); break;
      case 'records': if (this.near(P.facTerm, 6)) this.approach(id, null); break;
      case 'final_recording': this.approach(id, null); break;
      case 'survey': this.approach(id, null); break;
      case 'final_report': this.approach(id, null); break;
      case 'assessment': if (this.near(F.terminal, 8)) this.approach(id, null); break;
      case 'choice': this.approach(id, null); break;
    }
  }

  // ------------------------------------------------------------------ major sequences
  /** Ch.6 MAJOR CINEMATIC EVENT: the physical discovery of the ice chamber (never a PDA notification). */
  private iceReveal(): void {
    if (this.cur !== 'ice' || this.flag('done.ice') || this.busy) return;
    const lines = ['reveal:ice:1', 'reveal:ice:2', 'reveal:ice:3', 'reveal:ice:4', 'reveal:ice:5', 'reveal:ice:6', 'reveal:ice:7'];
    const durs = this.c.voice.lines.filter((l) => lines.includes(l.trigger));
    void durs;
    const cut = this.c.iceCut(0);
    let at = 0.8;
    const cues = [] as Array<{ at: number; run: () => void }>;
    cues.push({ at: 0.2, run: () => this.c.audio.cue('reveal') });
    for (const tr of lines) { const t = at; cues.push({ at: t, run: () => this.c.voice.trigger(tr) }); at += 0.2; }
    cut.cues = [...(cut.cues ?? []), ...cues];
    this.busy = true;
    this.c.voice.trigger('obj:ice:approach');
    this.c.playCine(cut, () => {
      this.busy = false;
      this.c.mission.addRecord('ice_discovery');
      this.showDiscovery();
      this.c.mission.completeObjective('ice');
      this.c.save();
    });
  }

  private showDiscovery(): void {
    this.discoveryEl.replaceChildren(
      h('div.eyebrow', null, 'SCIENTIFIC DISCOVERY CONFIRMED'),
      h('div.big', null, 'WATER ICE DETECTED'),
      h('dl', null,
        h('dt', null, 'Location'), h('dd', null, 'Subsurface geological formation (C-09)'),
        h('dt', null, 'Classification'), h('dd', null, 'Water ice'),
        h('dt', null, 'Research status'), h('dd', null, 'Preliminary confirmation — laboratory analysis pending'),
        h('dt', null, 'Scientific importance'), h('dd', null, 'High')),
      h('div.reg', null, 'NEW DISCOVERY REGISTERED · Subsurface Water Ice Deposits — Expedition 02'),
    );
    this.discoveryEl.classList.add('on');
    this.c.audio.cue('reveal');
    setTimeout(() => this.discoveryEl.classList.remove('on'), 9000);
  }

  /** Ch.8.4 archived video: an old recording with the researcher's voice. */
  private playArchive(): void {
    this.busy = true;
    this.archiveEl.classList.add('on');
    this.c.voice.trigger('archive:final:1');
    this.c.voice.trigger('archive:final:2');
    const deadline = performance.now() + (triggerLength('archive:final:1') + triggerLength('archive:final:2') + 4) * 1000;
    const wait = () => {
      if (this.c.voice.speaking && performance.now() < deadline) { setTimeout(wait, 400); return; }
      this.archiveEl.classList.remove('on'); this.busy = false;
      this.complete('final_recording', null, () => this.c.showRecord(RECORDS.e1_final));
    };
    setTimeout(wait, 1500);
  }

  /** Epilogue E.1: final mission assessment overlay. */
  private showAssessment(): void {
    const f = (k: string) => this.flag(`done.${k}`);
    const ok = (b: boolean) => (b ? 'OPERATIONAL' : 'INCOMPLETE');
    const rows: Array<[string, string]> = [
      ['Habitat', ok(f('restoration'))], ['Food production', ok(f('food'))], ['Power generation', ok(f('reactor') && f('electrical'))],
      ['Water and oxygen', ok(f('water') && f('oxygen'))], ['Rover exploration data', f('r1_link') ? 'R-1 LOG RECOVERED · MEV-1 SURVEYS' : 'INCOMPLETE'],
      ['Underground water ice', f('analyze') ? 'CONFIRMED (LAB)' : 'PRELIMINARY'], ['Geological archive', f('survey') ? 'CONSOLIDATED' : 'PARTIAL'],
    ];
    this.busy = true;
    const el = h('div.overlay.interactive', null, h('div.card.assessment', null,
      h('div.eyebrow', null, 'FINAL MISSION ASSESSMENT'), h('h2', null, 'Expedition 02 — status'),
      h('table', null, ...rows.map(([a, b]) => h('tr', null, h('td', null, a), h('td', null, b)))),
      h('div.actions', null, h('button.btn.primary', { onclick: () => { el.remove(); this.busy = false; this.complete('assessment', null); } }, 'Submit assessment'))));
    this.c.ui.append(el);
    document.exitPointerLock?.();
  }

  /** Epilogue E.2: three recommendations, then the final cinematic. */
  private showChoice(): void {
    this.busy = true;
    const pick = (k: 'A' | 'B' | 'C') => { el.remove(); this.busy = false; this.set(`choice.${k}`); this.c.mission.completeObjective('choice'); this.c.save(); this.c.finale(k); };
    const opt = (k: 'A' | 'B' | 'C', t: string, d: string) => h('button.choice', { onclick: () => pick(k) }, h('b', null, `${k} — ${t}`), h('span', null, d));
    const el = h('div.overlay.interactive', null, h('div.card.choices', null,
      h('div.eyebrow', null, "HUMANITY'S NEXT STEP"), h('h2', null, 'Your recommendation'),
      opt('A', 'Recommend expansion', 'Establish additional research facilities near confirmed ice deposits.'),
      opt('B', 'Recommend further research', 'More geological surveys and environmental testing before expansion.'),
      opt('C', 'Preserve the findings', 'Preserve the current station and submit all findings for international scientific review.')));
    this.c.ui.append(el);
    document.exitPointerLock?.();
  }

  /** Resets prop states for a new game / restores them from saved flags. */
  restore(): void {
    const f = (k: string) => this.flag(k), p = this.props;
    for (let i = 0; i < 3; i++) p.panel.set(i, f('done.electrical') || f(`s.electrical.${i}`));
    p.water.running = f('done.water'); p.water.cartridge.position.y = f('s.water.filter') || f('done.water') ? 0.95 : 0.9;
    p.oxygen.running = f('done.oxygen');
    p.reactor.status(f('done.reactor') ? 'ok' : 'idle');
    p.garage.powered = f('done.restore_vehicle');
    p.station.recorder.visible = !f('done.recorder');
    p.facility.cellSeated = f('s.aux.cell') || f('done.aux'); p.facility.breakerOn = f('done.aux'); p.facility.powered = f('done.aux');
    p.lab.sample.visible = f('done.lab_transfer');
    p.holo.active = f('done.reconstruct'); p.holo.expand = f('done.reconstruct') ? 1 : 0;
    const v = this.c.vehicle(); if (v) { v.powered = f('done.restore_vehicle') || this.c.mission.complete; v.headlights = false; }
    this.c.setAirlockLocked(!(f('s.airlock.scan') || f('done.airlock')));
    this.c.setOutpostPower(f('done.storm_mode') && !f('done.maintain') ? 0.7 : f('done.electrical') ? 1 : f('done.emergency_power') ? 0.85 : 0);
    const cur = this.cur;
    this.stormTarget = this.stormLevel = cur && STORM[cur] !== undefined && !f('done.maintain') ? (f('done.storm_mode') ? 1 : STORM[cur]) : 0;
    this.proc = null; this.busy = false; this.holdTimer = 0;
    this.lastChapter = OBJECTIVES.find((o) => o.id === cur)?.chapter ?? 0;
    this.retarget();
  }

  /** Completes the running timed process at once (automated tests). */
  fastForward(): void { if (this.proc) this.proc.t = this.proc.dur - 0.01; this.holdTimer = Math.max(this.holdTimer, 39.9); }

  /** Keeps the R-1 marker on the (moving) rover. */
  tickTargets(): void { const r1 = this.c.rover(); const ro = OBJECTIVES.find((o) => o.id === 'r1_link'); if (r1 && ro) { ro.target.x = r1.pos.x; ro.target.z = r1.pos.z; } }
}
