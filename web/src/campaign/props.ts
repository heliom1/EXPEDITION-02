import {
  AdditiveBlending, BoxGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial,
  PlaneGeometry, PointLight, RingGeometry, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3, type Material, type Texture,
} from 'three';

/**
 * Procedural campaign props (EXPEDITION 02 chapters 1–8). Everything is built in code from simple solids with
 * canvas-drawn screens, so props match the outpost's palette and need no external assets. Each prop exposes
 * `points` (local interaction positions) — use `worldPoint(name)` after placing the group.
 */
const mat = (color: number, rough = 0.6, metal = 0.3, extra: Partial<MeshStandardMaterial> = {}) => new MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const M = {
  white: mat(0xd9d6cf, 0.55, 0.15), grey: mat(0x6b6e73, 0.5, 0.6), dark: mat(0x26282c, 0.6, 0.5), steel: mat(0xa8acb2, 0.35, 0.85),
  dusty: mat(0xb48f74, 0.9, 0.1), orange: mat(0xd9652a, 0.5, 0.2), glass: mat(0x9fd3ff, 0.05, 0.1, { transparent: true, opacity: 0.25 }),
  foil: mat(0xc9a14a, 0.3, 0.9), panel: mat(0x1d2a4e, 0.35, 0.4, { side: DoubleSide }),
};

/** Positions a mesh (Object3D.position is read-only, so Object.assign cannot set it). */
function placed<T extends Mesh>(m: T, x: number, y: number, z: number): T { m.position.set(x, y, z); return m; }

function box(w: number, h: number, d: number, m: Material, x = 0, y = 0, z = 0): Mesh {
  const o = new Mesh(new BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o;
}
function cyl(rt: number, rb: number, h: number, m: Material, x = 0, y = 0, z = 0, seg = 20): Mesh {
  const o = new Mesh(new CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o;
}

/** A canvas screen whose text can be redrawn; emissive so it reads in dark rooms. */
export class Screen {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: Texture;
  private readonly m: MeshStandardMaterial;
  private last = '';
  constructor(w: number, h: number, px = 256) {
    this.canvas.width = px; this.canvas.height = Math.round((px * h) / w);
    this.tex = new CanvasTexture(this.canvas); this.tex.colorSpace = SRGBColorSpace;
    this.m = new MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 1.2, roughness: 0.3 });
    this.mesh = new Mesh(new PlaneGeometry(w, h), this.m);
    this.draw(['OFFLINE'], '#3a1c10', '#6b2f17');
  }
  /** Lines of text, text colour, background. */
  draw(lines: string[], fg = '#ffd2a8', bg = '#120a07'): void {
    const key = lines.join('|') + fg + bg;
    if (key === this.last) return;
    this.last = key;
    const g = this.canvas.getContext('2d')!, W = this.canvas.width, H = this.canvas.height;
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.04)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    g.fillStyle = fg; g.font = `${Math.round(H / 9)}px monospace`;
    lines.slice(0, 7).forEach((l, i) => g.fillText(l, W * 0.05, H * (0.18 + i * 0.13)));
    this.tex.needsUpdate = true;
  }
  set power(on: boolean) { this.m.emissiveIntensity = on ? 1.2 : 0.15; }
}

abstract class Prop {
  readonly group = new Group();
  protected readonly points: Record<string, Vector3> = {};
  worldPoint(name: string): Vector3 { this.group.updateMatrixWorld(true); return this.group.localToWorld((this.points[name] ?? new Vector3(0, 1, 0)).clone()); }
  update(_dt: number, _t: number): void { /* animated props override */ }
}

/** Standing console: cabinet, angled screen, status lamp. Point "use" in front of the screen. */
export class ConsoleProp extends Prop {
  readonly screen = new Screen(0.72, 0.45);
  private readonly lamp: MeshStandardMaterial;
  constructor(dusty = false) {
    super();
    const body = dusty ? M.dusty : M.white;
    this.group.add(box(0.8, 1.0, 0.5, body, 0, 0.5, 0), box(0.82, 0.08, 0.6, M.dark, 0, 1.02, 0.02));
    const head = new Group(); head.position.set(0, 1.25, -0.05); head.rotation.x = -0.45;
    head.add(box(0.82, 0.55, 0.08, M.dark, 0, 0, -0.03));
    this.screen.mesh.position.z = 0.015; head.add(this.screen.mesh);
    this.group.add(head);
    this.lamp = mat(0x331100, 0.4, 0, { emissive: new Color(0xff6a2a), emissiveIntensity: 0.4 });
    this.group.add(placed(new Mesh(new SphereGeometry(0.035, 10, 8), this.lamp), 0.33, 1.08, 0.24));
    this.points.use = new Vector3(0, 1.2, 0.45);
  }
  status(state: 'off' | 'idle' | 'busy' | 'ok'): void {
    const c = state === 'ok' ? 0x5cff7a : state === 'busy' ? 0xffc34a : state === 'idle' ? 0xff6a2a : 0x221100;
    this.lamp.emissive.set(c); this.lamp.emissiveIntensity = state === 'off' ? 0 : 2.2;
    this.screen.power = state !== 'off';
  }
}

/** Wall electrical distribution panel with three breaker levers + channel lamps. */
export class ElectricalPanelProp extends Prop {
  private readonly levers: Group[] = [];
  private readonly lamps: MeshStandardMaterial[] = [];
  readonly on = [false, false, false];
  constructor() {
    super();
    this.group.add(box(1.2, 1.4, 0.22, M.grey, 0, 1.4, 0), box(1.1, 0.25, 0.05, M.dark, 0, 2.0, 0.12));
    for (let i = 0; i < 3; i++) {
      const x = -0.35 + i * 0.35;
      const lever = new Group(); lever.position.set(x, 1.3, 0.14);
      lever.add(box(0.07, 0.32, 0.06, M.orange, 0, 0.14, 0.03));
      this.group.add(box(0.2, 0.42, 0.06, M.dark, x, 1.3, 0.11), lever);
      this.levers.push(lever);
      const l = mat(0x220000, 0.4, 0, { emissive: new Color(0xff3020), emissiveIntensity: 1.5 });
      this.lamps.push(l);
      this.group.add(placed(new Mesh(new SphereGeometry(0.03, 8, 6), l), x, 1.72, 0.14));
      this.points[`ch${i}`] = new Vector3(x, 1.3, 0.5);
    }
    this.points.use = new Vector3(0, 1.4, 0.55);
    this.set(0, false); this.set(1, false); this.set(2, false);
  }
  set(i: number, on: boolean): void {
    this.on[i] = on;
    this.levers[i].rotation.x = on ? -0.9 : 0.9;
    this.lamps[i].emissive.set(on ? 0x3cff6a : 0xff3020);
  }
}

/** Water recycler: tall processing tank, filter housing (removable cartridge), pipework, flow lamp. */
export class WaterRecyclerProp extends Prop {
  readonly cartridge: Mesh;
  private readonly flow: MeshStandardMaterial;
  running = false;
  private t = 0;
  constructor() {
    super();
    this.group.add(cyl(0.38, 0.38, 1.9, M.white, 0, 0.95, 0), cyl(0.4, 0.4, 0.08, M.grey, 0, 1.92, 0), cyl(0.4, 0.4, 0.08, M.grey, 0, 0.04, 0));
    this.group.add(box(0.36, 0.5, 0.3, M.grey, 0.0, 0.9, 0.42));
    this.cartridge = cyl(0.09, 0.09, 0.42, mat(0x5aa0c8, 0.4, 0.2), 0, 0.9, 0.6);
    this.group.add(this.cartridge);
    for (const y of [0.4, 1.5]) { const p = cyl(0.05, 0.05, 0.7, M.steel, 0.42, y, 0); p.rotation.z = Math.PI / 2; this.group.add(p); }
    this.flow = mat(0x001122, 0.2, 0, { emissive: new Color(0x2a8cff), emissiveIntensity: 0 });
    this.group.add(placed(new Mesh(new BoxGeometry(0.05, 1.2, 0.02), this.flow), -0.2, 1.0, 0.37));
    this.points.use = new Vector3(0, 1.0, 0.9);
  }
  update(dt: number): void { this.t += dt; this.flow.emissiveIntensity = this.running ? 1.2 + Math.sin(this.t * 4) * 0.5 : 0; }
}

/** Oxygen generator: solid-oxide electrolysis stacks (MOXIE-like) in a frame, intake fan, status lamp. */
export class OxygenGeneratorProp extends Prop {
  private readonly fan: Mesh;
  private readonly glow: MeshStandardMaterial;
  running = false;
  constructor() {
    super();
    this.group.add(box(1.0, 1.3, 0.6, M.white, 0, 0.65, 0));
    for (let i = 0; i < 4; i++) this.group.add(box(0.18, 0.7, 0.05, M.foil, -0.33 + i * 0.22, 0.75, 0.31));
    this.fan = new Mesh(new TorusGeometry(0.14, 0.02, 6, 16), M.dark); this.fan.position.set(0.3, 1.1, 0.32); this.group.add(this.fan);
    const blade = box(0.26, 0.04, 0.01, M.grey), blade2 = box(0.26, 0.04, 0.01, M.grey);
    blade2.rotation.z = Math.PI / 2;
    this.fan.add(blade, blade2);
    this.glow = mat(0x110000, 0.3, 0, { emissive: new Color(0xff8a3a), emissiveIntensity: 0 });
    this.group.add(placed(new Mesh(new BoxGeometry(0.8, 0.04, 0.02), this.glow), 0, 0.3, 0.31));
    this.points.use = new Vector3(0, 1.0, 0.75);
  }
  update(dt: number): void { if (this.running) this.fan.rotation.z += dt * 18; this.glow.emissiveIntensity = this.running ? 2 : 0; }
}

/** Laboratory bench with a glass analysis chamber and a terminal. */
export class LabStationProp extends Prop {
  readonly sample: Mesh;
  readonly screen = new Screen(0.6, 0.38);
  private readonly beam: MeshStandardMaterial;
  analyzing = 0;
  constructor() {
    super();
    this.group.add(box(1.6, 0.06, 0.7, M.white, 0, 0.92, 0), box(1.5, 0.9, 0.62, M.grey, 0, 0.45, 0));
    this.group.add(box(0.5, 0.5, 0.45, M.glass, -0.35, 1.2, 0), box(0.52, 0.04, 0.47, M.dark, -0.35, 1.46, 0));
    this.sample = cyl(0.05, 0.05, 0.16, mat(0xdff3ff, 0.1, 0, { emissive: new Color(0x88d8ff), emissiveIntensity: 0.25 }), -0.35, 1.03, 0);
    this.sample.visible = false;
    this.group.add(this.sample);
    this.beam = mat(0x000000, 0.2, 0, { emissive: new Color(0x5ad0ff), emissiveIntensity: 0, transparent: true, opacity: 0.6 });
    this.group.add(placed(new Mesh(new BoxGeometry(0.44, 0.01, 0.4), this.beam), -0.35, 1.2, 0));
    const head = new Group(); head.position.set(0.4, 1.25, -0.1); head.rotation.x = -0.3;
    head.add(box(0.66, 0.44, 0.04, M.dark, 0, 0, -0.03)); this.screen.mesh.position.z = 0.0; head.add(this.screen.mesh);
    this.group.add(head);
    this.points.chamber = new Vector3(-0.35, 1.15, 0.6);
    this.points.use = new Vector3(0.4, 1.2, 0.6);
  }
  update(_dt: number, t: number): void {
    this.beam.emissiveIntensity = this.analyzing > 0 ? 2 : 0;
    if (this.analyzing > 0) (this.beam as unknown as { opacity: number }).opacity = 0.3 + 0.3 * Math.sin(t * 9);
  }
}

/** Holographic mapping table: survey map hologram with Expedition 1 sites; `expand` 0…1 raises the reconstruction. */
export class HoloTableProp extends Prop {
  private readonly holo: Mesh;
  private readonly ring: Mesh;
  private readonly markers: Mesh[] = [];
  expand = 0;
  active = false;
  constructor(map: Texture | null) {
    super();
    this.group.add(cyl(0.75, 0.6, 0.85, M.grey, 0, 0.42, 0, 32), cyl(0.8, 0.8, 0.06, M.dark, 0, 0.87, 0, 32));
    const hm = new MeshStandardMaterial({ color: 0x000000, emissive: 0x6fd8ff, ...(map ? { emissiveMap: map } : {}), emissiveIntensity: 0, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    this.holo = new Mesh(new PlaneGeometry(1.3, 1.3), hm); this.holo.rotation.x = -Math.PI / 2; this.holo.position.y = 1.0; this.group.add(this.holo);
    this.ring = new Mesh(new RingGeometry(0.66, 0.7, 48), new MeshStandardMaterial({ color: 0x000000, emissive: 0x6fd8ff, emissiveIntensity: 0, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.92; this.group.add(this.ring);
    for (let i = 0; i < 6; i++) {
      const m = new Mesh(new CylinderGeometry(0.012, 0.012, 0.3, 6), new MeshStandardMaterial({ color: 0x000000, emissive: i < 3 ? 0xffb35a : 0x6fd8ff, emissiveIntensity: 0, transparent: true, blending: AdditiveBlending, depthWrite: false }));
      const a = i * 1.7, r = 0.18 + (i % 3) * 0.14;
      m.position.set(Math.cos(a) * r, 1.15, Math.sin(a) * r); this.group.add(m); this.markers.push(m);
    }
    this.points.use = new Vector3(0, 1.2, 1.05);
  }
  update(_dt: number, t: number): void {
    const on = this.active ? 1 : 0;
    (this.holo.material as MeshStandardMaterial).emissiveIntensity = on * (0.9 + 0.1 * Math.sin(t * 7));
    (this.ring.material as MeshStandardMaterial).emissiveIntensity = on * 1.5;
    this.holo.position.y = 1.0 + this.expand * 0.08;
    this.holo.scale.setScalar(1 + this.expand * 0.25);
    this.markers.forEach((m, i) => {
      const show = i < 3 ? on : on * this.expand;
      (m.material as MeshStandardMaterial).emissiveIntensity = show * (1.5 + Math.sin(t * 3 + i));
      m.scale.y = 0.3 + show * (0.7 + 0.3 * Math.sin(t * 2 + i));
    });
  }
}

/**
 * Maintenance hangar for MEV-1 on the west apron: arched shell (open both ends), rolling front door, interior light
 * strips, workbench, charging pad, wall display. Local +Z = door side; vehicle bay centred at origin.
 */
export class GarageProp extends Prop {
  readonly door = new Group();
  readonly light = new PointLight(0xffe3c4, 0, 22, 1.6);
  private readonly strips: MeshStandardMaterial;
  readonly terminal = new ConsoleProp();
  doorClosed = 0;
  powered = false;
  /** Half extents of the bay (local metres) — used to test "vehicle in protected storage". */
  readonly bay = { x: 3.6, z: 5.5 };
  constructor() {
    super();
    const shellM = mat(0xc9c2b8, 0.7, 0.2, { side: DoubleSide });
    const shell = new Mesh(new CylinderGeometry(4.6, 4.6, 12, 32, 1, true, -Math.PI / 2, Math.PI), shellM);
    shell.rotation.x = Math.PI / 2; shell.position.y = 0; shell.castShadow = shell.receiveShadow = true;
    this.group.add(shell);
    for (let k = -2; k <= 2; k++) {
      const rib = new Mesh(new TorusGeometry(4.65, 0.08, 6, 32, Math.PI), M.grey); rib.position.set(0, 0, k * 2.9); this.group.add(rib);
    }
    this.group.add(box(9.4, 0.12, 12.4, mat(0x8a8580, 0.85, 0.1), 0, 0.06, 0)); // floor slab
    this.group.add(box(0.2, 4.6, 12, M.grey, -4.5, 2.3, 0), box(0.2, 4.6, 12, M.grey, 4.5, 2.3, 0)); // side walls (inner)
    this.group.add(box(9.2, 4.6, 0.2, M.grey, 0, 2.3, -6.0)); // back wall
    this.strips = mat(0x221a12, 0.3, 0, { emissive: new Color(0xffe0b8), emissiveIntensity: 0.05 });
    for (let k = -1; k <= 1; k++) this.group.add(box(0.12, 0.05, 9, this.strips, k * 1.8, 4.45 - Math.abs(k) * 0.5, 0));
    this.light.position.set(0, 3.8, 0); this.group.add(this.light);
    // rolling door (slats) — raised by default
    for (let i = 0; i < 8; i++) this.door.add(box(8.8, 0.52, 0.08, mat(0xb0aaa0, 0.6, 0.4), 0, 0.26 + i * 0.55, 0));
    this.door.position.set(0, 0, 6.05);
    this.group.add(this.door);
    this.group.add(box(1.8, 0.9, 0.7, M.grey, -3.4, 0.45, -4.6), box(1.9, 0.06, 0.75, M.white, -3.4, 0.92, -4.6)); // workbench
    this.group.add(box(3.4, 0.03, 5.2, mat(0x2a2c2f, 0.5, 0.4, { emissive: new Color(0x2a6cff), emissiveIntensity: 0.15 }), 0, 0.13, -0.6)); // charging pad
    const wall = new Screen(1.6, 0.9, 384); wall.mesh.position.set(-4.38, 2.4, -1); wall.mesh.rotation.y = Math.PI / 2; this.group.add(wall.mesh);
    wall.draw(['MAINTENANCE BAY 1', 'MEV-1  MANNED EXPLORATION VEHICLE', 'STATUS  DORMANT · 3,652 SOLS', 'BATTERY  ——', 'CHARGER  OFFLINE'], '#ffcc99');
    this.wall = wall;
    this.terminal.group.position.set(3.4, 0.12, -3.6); this.terminal.group.rotation.y = -Math.PI / 2;
    this.group.add(this.terminal.group);
    this.points.entrance = new Vector3(0, 1.4, 6.5);
    this.points.terminal = new Vector3(2.9, 1.3, -3.6);
    this.points.vehicle = new Vector3(0, 0.14, -0.6);
  }
  readonly wall: Screen;
  update(dt: number): void {
    const up = 1 - this.doorClosed;
    this.door.children.forEach((s, i) => { s.position.y = 0.26 + i * 0.55 * Math.max(0.02, this.doorClosed) + up * 4.2; s.visible = this.doorClosed > 0.02 || i === 7; });
    this.light.intensity += ((this.powered ? 28 : 0) - this.light.intensity) * Math.min(1, dt * 3);
    this.strips.emissiveIntensity = this.powered ? 2.2 : 0.05;
  }
  /** Whether a world point lies inside the bay. */
  inBay(p: Vector3): boolean {
    const l = this.group.worldToLocal(p.clone());
    return Math.abs(l.x) < this.bay.x && Math.abs(l.z) < this.bay.z;
  }
}

/** Survey beacon pole with a blinking light (survey points, sites). */
export class BeaconProp extends Prop {
  private readonly lamp: MeshStandardMaterial;
  private t = Math.random() * 3;
  constructor(color = 0xff7a2a) {
    super();
    this.group.add(cyl(0.04, 0.05, 2.2, M.steel, 0, 1.1, 0, 8), box(0.3, 0.2, 0.3, M.orange, 0, 0.1, 0));
    this.lamp = mat(0x110000, 0.3, 0, { emissive: new Color(color), emissiveIntensity: 3 });
    this.group.add(placed(new Mesh(new SphereGeometry(0.08, 10, 8), this.lamp), 0, 2.25, 0));
    this.points.use = new Vector3(0, 1.1, 0.6);
  }
  update(dt: number): void { this.t += dt; this.lamp.emissiveIntensity = (this.t % 1.5) < 0.2 ? 6 : 0.3; }
}

/** Abandoned Expedition 1 survey station: tripod mast, dusty solar panel, instrument crate with a data recorder. */
export class FieldStationProp extends Prop {
  readonly recorder: Mesh;
  constructor() {
    super();
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const leg = cyl(0.03, 0.03, 2.3, M.steel, Math.cos(a) * 0.45, 1.1, Math.sin(a) * 0.45, 6); leg.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); this.group.add(leg); }
    this.group.add(cyl(0.03, 0.03, 1.6, M.steel, 0, 2.9, 0, 6), box(1.2, 0.03, 0.8, M.panel, 0, 2.2, 0.2).rotateX(-0.6) as Mesh);
    const dust = mat(0xa07a5c, 0.95, 0.05);
    this.group.add(box(0.9, 0.5, 0.6, dust, 1.2, 0.25, 0.1), box(0.5, 0.35, 0.4, dust, 1.6, 0.17, -0.7));
    this.recorder = box(0.28, 0.12, 0.2, mat(0x3a3530, 0.7, 0.4, { emissive: new Color(0xff3a1a), emissiveIntensity: 0.6 }), 1.2, 0.56, 0.1);
    this.group.add(this.recorder);
    this.points.use = new Vector3(1.2, 0.8, 0.9);
  }
}

/** Expedition 1 equipment case (lamps, sensors, scanner) left at the cave mouth. */
export class EquipmentCaseProp extends Prop {
  constructor() {
    super();
    this.group.add(box(1.0, 0.45, 0.6, M.orange, 0, 0.22, 0), box(1.02, 0.06, 0.62, M.dark, 0, 0.47, 0));
    this.group.add(cyl(0.06, 0.06, 0.3, M.white, 0.65, 0.15, 0.1), box(0.2, 0.12, 0.3, M.grey, -0.7, 0.06, 0.2));
    this.points.use = new Vector3(0, 0.7, 0.8);
  }
}

/**
 * Original Expedition 1 research facility: a horizontal habitat module on legs, awning-covered exterior terminal,
 * auxiliary power-cell slot and breaker box, mast antenna and solar wings — all dust-covered. Local +Z = front.
 */
export class LegacyFacilityProp extends Prop {
  readonly terminal = new ConsoleProp(true);
  readonly cell: Mesh;
  readonly breaker = new Group();
  private readonly windowM: MeshStandardMaterial;
  powered = false;
  cellSeated = false;
  breakerOn = false;
  constructor() {
    super();
    const hull = mat(0xc8b29c, 0.85, 0.1);
    const mod = cyl(2.2, 2.2, 9, hull, 0, 3.2, -2.5, 28); mod.rotation.z = Math.PI / 2; this.group.add(mod);
    for (const x of [-4.6, 4.6]) { const cap = new Mesh(new SphereGeometry(2.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), hull); cap.rotation.z = x > 0 ? -Math.PI / 2 : Math.PI / 2; cap.position.set(x, 3.2, -2.5); this.group.add(cap); }
    for (const x of [-3.2, 3.2]) for (const z of [-4, -1]) this.group.add(cyl(0.12, 0.15, 1.3, M.steel, x, 0.65, z, 8));
    this.windowM = mat(0x0b0d10, 0.1, 0.8, { emissive: new Color(0xffb070), emissiveIntensity: 0 });
    for (let i = -2; i <= 2; i++) this.group.add(box(0.6, 0.35, 0.1, this.windowM, i * 1.4, 3.9, -0.35));
    this.group.add(box(1.2, 2.0, 0.3, mat(0x6f655c, 0.7, 0.4), 0, 2.2, -0.4)); // door
    this.group.add(box(3.4, 0.06, 1.6, hull, 2.6, 2.6, 0.6)); // awning
    this.terminal.group.position.set(2.0, 0, 0.6); this.group.add(this.terminal.group);
    // power cell slot + breaker box
    this.group.add(box(0.7, 1.0, 0.4, M.grey, 3.6, 0.9, 0.2));
    this.cell = cyl(0.12, 0.12, 0.5, mat(0x3a8cff, 0.4, 0.3, { emissive: new Color(0x2a6cff), emissiveIntensity: 0 }), 4.5, 0.25, 1.2);
    this.group.add(this.cell);
    this.group.add(box(0.5, 0.6, 0.2, M.grey, 3.6, 1.8, 0.3));
    this.breaker.add(box(0.06, 0.25, 0.06, M.orange, 0, 0.1, 0)); this.breaker.position.set(3.6, 1.8, 0.44); this.breaker.rotation.x = 0.9;
    this.group.add(this.breaker);
    this.group.add(cyl(0.04, 0.04, 5, M.steel, -3.5, 5.5, -2.5, 6), box(2.6, 0.04, 1.4, M.panel, -6.8, 1.6, -1.0).rotateZ(0.4) as Mesh);
    this.points.use = new Vector3(2.0, 1.2, 1.1);
    this.points.cell = new Vector3(3.6, 1.0, 0.8);
    this.points.breaker = new Vector3(3.6, 1.8, 0.9);
    this.points.front = new Vector3(0, 1.5, 4.5);
  }
  update(): void {
    this.cell.position.set(this.cellSeated ? 3.6 : 4.5, this.cellSeated ? 0.95 : 0.25, this.cellSeated ? 0.2 : 1.2);
    (this.cell.material as MeshStandardMaterial).emissiveIntensity = this.cellSeated ? 1.5 : 0;
    this.breaker.rotation.x = this.breakerOn ? -0.9 : 0.9;
    this.windowM.emissiveIntensity = this.powered ? 1.4 : 0;
    this.terminal.status(this.powered ? 'idle' : 'off');
  }
}

/** Reactor control console set (kept separate from the procedural reactor building). */
export class ReactorConsoleProp extends ConsoleProp {}
