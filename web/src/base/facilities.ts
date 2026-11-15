/**
 * Outpost facilities as working systems (gameplay numbers, not engineering specifications):
 *
 *  - Farm: hydroponic grow beds. Plant a seed pack → water keeps it growing → harvest food rations (+ a seed back).
 *    A bed without water stops growing and wilts; long neglect kills the crop.
 *  - Power: the base output is shared by life support, the shield generator and the grow lights. In a power deficit the
 *    grow lights are shed first (crops pause), so turning the shields on while every bed is growing has a cost.
 *  - Shields: the radiation shield generator cuts the habitat dose rate further, at a power cost; it spins up/down.
 *  - Comms: transmit field reports (each new discovery / sample batch since the last report) to Mission Control; each
 *    report earns a supply credit that can be spent on a supply drop delivered to the outpost locker after an uplink delay.
 *
 * Pure state + logic (no three.js) so it is unit-tested and saved as plain JSON.
 */
export type BedStage = 'empty' | 'growing' | 'ready' | 'dead';

export interface BedState { stage: BedStage; growth: number; water: number; dry: number }

export interface FacilitiesState {
  beds: BedState[];
  shields: boolean;
  /** 0 … 1 spin-up of the shield field. */
  shieldLevel: number;
  credits: number;
  reported: string[];
  reportedSamples: number;
  reports: number;
  /** Seconds until a requested supply drop lands (−1 = none pending). */
  dropEta: number;
  /** Mission seconds when the next drop may be requested. */
  dropCooldownUntil: number;
}

export const FACILITY = {
  beds: 4,
  growSeconds: 150,
  waterSeconds: 100, // full tank → empty
  wiltSeconds: 120, // dry this long → crop dies
  harvestRations: 2,
  seedBackChance: 0.6,
  baseOutput: 40.2, // kW
  lifeSupport: 31.5,
  shieldDraw: 6.0,
  lightDraw: 1.2, // per growing bed
  doseInside: 0.4, // habitat shielding factor
  doseShields: 0.15, // with the shield field up
  dropDelay: 45,
  dropCooldown: 180,
  dropContents: [['o2_canister', 2], ['battery', 1], ['seed_pack', 2], ['ration', 1]] as Array<[string, number]>,
  samplesPerReport: 3,
} as const;

export const newFacilities = (): FacilitiesState => ({
  beds: Array.from({ length: FACILITY.beds }, (_, i) => (i === 0 ? { stage: 'growing', growth: 0.55, water: 0.6, dry: 0 } : { stage: 'empty', growth: 0, water: 0, dry: 0 })),
  shields: false, shieldLevel: 0, credits: 1, reported: [], reportedSamples: 0, reports: 0, dropEta: -1, dropCooldownUntil: 0,
});

/** Accepts saved state (tolerant of missing or malformed fields). */
export function loadFacilities(raw: unknown): FacilitiesState {
  const d = newFacilities();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<FacilitiesState>;
  if (Array.isArray(r.beds)) {
    d.beds = d.beds.map((b, i) => {
      const s = r.beds![i];
      if (!s || !['empty', 'growing', 'ready', 'dead'].includes(s.stage)) return b;
      const n = (v: unknown, lo = 0, hi = 1) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);
      return { stage: s.stage, growth: n(s.growth), water: n(s.water), dry: n(s.dry, 0, 1e6) };
    });
  }
  d.shields = !!r.shields;
  d.shieldLevel = d.shields ? 1 : 0;
  for (const k of ['credits', 'reportedSamples', 'reports', 'dropEta', 'dropCooldownUntil'] as const) if (typeof r[k] === 'number' && Number.isFinite(r[k])) d[k] = r[k] as number;
  if (Array.isArray(r.reported)) d.reported = r.reported.filter((x) => typeof x === 'string');
  return d;
}

export interface PowerBudget { output: number; demand: number; lightsOn: boolean; deficit: boolean }

export function power(s: FacilitiesState, wobble = 0): PowerBudget {
  const growing = s.beds.filter((b) => b.stage === 'growing').length;
  const core = FACILITY.lifeSupport + wobble + FACILITY.shieldDraw * s.shieldLevel;
  const output = FACILITY.baseOutput;
  const lightsOn = core + growing * FACILITY.lightDraw <= output;
  const demand = core + (lightsOn ? growing * FACILITY.lightDraw : 0);
  return { output, demand, lightsOn, deficit: !lightsOn && growing > 0 };
}

/** Events produced by a simulation step (for HUD notices). */
export type FacilityEvent = 'ready' | 'wilting' | 'dead' | 'drop' | 'deficit' | 'powerRestored';

export class Facilities {
  s: FacilitiesState = newFacilities();
  private wasDeficit = false;

  load(raw: unknown): void { this.s = loadFacilities(raw); this.wasDeficit = false; }
  toJSON(): FacilitiesState { return JSON.parse(JSON.stringify(this.s)) as FacilitiesState; }

  get power(): PowerBudget { return power(this.s); }

  /** Overall farm health 0 … 100 for the base status board. */
  get farmHealth(): number {
    const b = this.s.beds;
    const score = b.reduce((n, x) => n + (x.stage === 'dead' ? 0 : x.stage === 'empty' ? 0.6 : x.stage === 'ready' ? 1 : 0.5 + 0.5 * Math.min(1, x.water * 2)), 0);
    return Math.round((score / b.length) * 100);
  }

  /** Habitat dose multiplier (relative to the surface). */
  get habitatDose(): number { return FACILITY.doseInside + (FACILITY.doseShields - FACILITY.doseInside) * this.s.shieldLevel; }

  step(dt: number, now: number): FacilityEvent[] {
    const ev: FacilityEvent[] = [];
    const s = this.s;
    s.shieldLevel = Math.min(1, Math.max(0, s.shieldLevel + (s.shields ? dt / 4 : -dt / 2)));
    const p = power(s);
    if (p.deficit !== this.wasDeficit) { ev.push(p.deficit ? 'deficit' : 'powerRestored'); this.wasDeficit = p.deficit; }
    for (const b of s.beds) {
      if (b.stage !== 'growing') continue;
      if (b.water > 0) {
        b.water = Math.max(0, b.water - dt / FACILITY.waterSeconds);
        b.dry = 0;
        if (p.lightsOn) b.growth = Math.min(1, b.growth + dt / FACILITY.growSeconds);
        if (b.growth >= 1) { b.stage = 'ready'; ev.push('ready'); }
      } else {
        const before = b.dry;
        b.dry += dt;
        if (before < 1 && b.dry >= 1) ev.push('wilting');
        if (b.dry >= FACILITY.wiltSeconds) { b.stage = 'dead'; ev.push('dead'); }
      }
    }
    if (s.dropEta >= 0) {
      s.dropEta -= dt;
      if (s.dropEta < 0) { s.dropEta = -1; ev.push('drop'); }
    }
    void now;
    return ev;
  }

  /** What pressing E on bed `i` would do. */
  bedAction(i: number, seeds: number): { verb: string; ok: boolean; why?: string } {
    const b = this.s.beds[i];
    switch (b.stage) {
      case 'empty': return seeds > 0 ? { verb: 'Plant', ok: true } : { verb: 'Plant', ok: false, why: 'No seed packs — the supply locker or a supply drop has more.' };
      case 'growing': return b.water < 0.95 ? { verb: 'Water', ok: true } : { verb: 'Water', ok: false, why: 'Reservoir full.' };
      case 'ready': return { verb: 'Harvest', ok: true };
      case 'dead': return { verb: 'Clear', ok: true };
    }
  }

  plant(i: number): void { this.s.beds[i] = { stage: 'growing', growth: 0, water: 1, dry: 0 }; }
  water(i: number): void { const b = this.s.beds[i]; if (b.stage === 'growing') { b.water = 1; b.dry = 0; } }
  clear(i: number): void { this.s.beds[i] = { stage: 'empty', growth: 0, water: 0, dry: 0 }; }
  /** Returns [rations, seeds back]. */
  harvest(i: number, rnd = Math.random): [number, number] {
    if (this.s.beds[i].stage !== 'ready') return [0, 0];
    this.clear(i);
    return [FACILITY.harvestRations, rnd() < FACILITY.seedBackChance ? 1 : 0];
  }

  toggleShields(): boolean { this.s.shields = !this.s.shields; return this.s.shields; }

  /** New, unreported findings: discovery ids not yet sent plus sample batches. */
  pendingReport(discoveryIds: string[], samples: number): { discoveries: string[]; batches: number } {
    return {
      discoveries: discoveryIds.filter((d) => !this.s.reported.includes(d)),
      batches: Math.floor(Math.max(0, samples - this.s.reportedSamples) / FACILITY.samplesPerReport),
    };
  }

  /** Sends the report; returns the supply credits earned (0 when there was nothing new). */
  transmit(discoveryIds: string[], samples: number): number {
    const p = this.pendingReport(discoveryIds, samples);
    const earned = p.discoveries.length + p.batches;
    if (!earned) return 0;
    this.s.reported.push(...p.discoveries);
    this.s.reportedSamples += p.batches * FACILITY.samplesPerReport;
    this.s.credits += earned;
    this.s.reports++;
    return earned;
  }

  canRequestDrop(now: number): { ok: boolean; why?: string } {
    if (this.s.dropEta >= 0) return { ok: false, why: `Supply drop inbound — ${Math.ceil(this.s.dropEta)} s` };
    if (this.s.credits < 1) return { ok: false, why: 'No supply credits — transmit new findings to earn one.' };
    if (now < this.s.dropCooldownUntil) return { ok: false, why: `Uplink window opens in ${Math.ceil(this.s.dropCooldownUntil - now)} s` };
    return { ok: true };
  }

  requestDrop(now: number): boolean {
    if (!this.canRequestDrop(now).ok) return false;
    this.s.credits--;
    this.s.dropEta = FACILITY.dropDelay;
    this.s.dropCooldownUntil = now + FACILITY.dropCooldown;
    return true;
  }
}
