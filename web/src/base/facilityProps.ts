import {
  BoxGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PointLight,
  SphereGeometry, TorusGeometry, type Material,
} from 'three';
import { MAT } from '../rendering/materials';
import type { BedState } from './facilities';

/**
 * Procedural props for the working facilities, built in the base's white-composite / orange-accent hardware style
 * (the outpost model has no per-bed, console or generator parts that could be driven individually).
 */
const box = (g: Group, w: number, h: number, d: number, mat: Material, x: number, y: number, z: number) => {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  return m;
};

const LEAF_HEALTHY = new Color(0x4f8a2c), LEAF_DRY = new Color(0x8a6a2c), LEAF_DEAD = new Color(0x4a3a2a), LEAF_RIPE = new Color(0x6aa23a);

/** Hydroponic bed (0.8 × 2.4 m, long axis along local Z) with a grow-light bar and 12 plants that scale with growth. */
export class GrowBedProp {
  readonly group = new Group();
  private readonly plants: Mesh[] = [];
  private readonly fruit: Mesh[] = [];
  private readonly leafMat = new MeshStandardMaterial({ color: LEAF_HEALTHY, roughness: 0.75 });
  private readonly waterMat = new MeshStandardMaterial({ color: 0x2c5a6a, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 });
  private readonly lightMat = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xff7fd0, emissiveIntensity: 0 });
  private readonly water: Mesh;
  private readonly lamp = new PointLight(0xff9ad8, 0, 3.2, 2);
  private sway = Math.random() * 10;

  constructor() {
    const g = this.group;
    box(g, 0.84, 0.06, 2.44, MAT.darkMetal, 0, 0.62, 0); // tray floor
    for (const s of [-1, 1]) box(g, 0.04, 0.2, 2.44, MAT.panel, s * 0.42, 0.72, 0);
    for (const s of [-1, 1]) box(g, 0.84, 0.2, 0.04, MAT.panel, 0, 0.72, s * 1.2);
    for (const [x, z] of [[-0.38, -1.15], [0.38, -1.15], [-0.38, 1.15], [0.38, 1.15]]) box(g, 0.05, 0.62, 0.05, MAT.metal, x, 0.31, z);
    box(g, 0.86, 0.04, 0.06, MAT.accent, 0, 0.83, 1.22);
    this.water = box(g, 0.78, 0.1, 2.36, this.waterMat, 0, 0.7, 0);
    // Grow-light gantry.
    for (const s of [-1, 1]) box(g, 0.04, 1.0, 0.04, MAT.metal, 0, 1.3, s * 1.15);
    box(g, 0.2, 0.05, 2.34, MAT.darkMetal, 0, 1.8, 0);
    box(g, 0.12, 0.02, 2.2, this.lightMat, 0, 1.77, 0);
    this.lamp.position.set(0, 1.6, 0);
    g.add(this.lamp);
    // Plants: two rows of six (low-poly leaf clusters), hidden until planted.
    const leaf = new SphereGeometry(0.11, 7, 5);
    const fruitGeo = new SphereGeometry(0.03, 6, 4);
    const fruitMat = new MeshStandardMaterial({ color: 0xc8402a, roughness: 0.5 });
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) {
      const p = new Mesh(leaf, this.leafMat);
      p.position.set(r ? 0.18 : -0.18, 0.78, -0.95 + i * 0.38);
      p.scale.set(1, 0.7, 1);
      p.castShadow = true;
      g.add(p);
      this.plants.push(p);
      for (let k = 0; k < 2; k++) {
        const f = new Mesh(fruitGeo, fruitMat);
        f.position.set(p.position.x + (k ? 0.06 : -0.05), 0.86, p.position.z + (k ? -0.04 : 0.05));
        g.add(f);
        this.fruit.push(f);
      }
    }
    g.name = 'GrowBed';
  }

  /** Shows a bed state; `lights` = grow lights powered. */
  update(dt: number, b: BedState, lights: boolean): void {
    this.sway += dt;
    const planted = b.stage !== 'empty';
    const g = b.stage === 'ready' ? 1 : b.stage === 'dead' ? 0.55 : b.growth;
    const wilt = b.stage === 'dead' ? 1 : Math.min(1, b.dry / 60);
    this.plants.forEach((p, i) => {
      p.visible = planted;
      const s = 0.15 + g * (0.95 + ((i * 37) % 7) * 0.03);
      p.scale.set(s, s * (0.7 + g * 0.6) * (1 - wilt * 0.45), s);
      p.position.y = 0.76 + s * 0.06;
      p.rotation.z = Math.sin(this.sway * 0.8 + i) * 0.04 * (1 - wilt);
    });
    for (const f of this.fruit) f.visible = b.stage === 'ready';
    const c = b.stage === 'dead' ? LEAF_DEAD : b.stage === 'ready' ? LEAF_RIPE : LEAF_HEALTHY;
    this.leafMat.color.copy(c).lerp(LEAF_DRY, b.stage === 'dead' ? 0 : wilt);
    this.water.scale.y = Math.max(0.05, b.water);
    this.water.visible = planted && b.water > 0.02;
    const on = lights && b.stage === 'growing' ? 1 : b.stage === 'ready' ? 0.35 : 0;
    this.lightMat.emissiveIntensity += (on * 2.4 - this.lightMat.emissiveIntensity) * Math.min(1, dt * 4);
    this.lamp.intensity = this.lightMat.emissiveIntensity * 1.6;
  }
}

/** Comms console: desk, angled screen (canvas-rendered status), a mast with a blinking beacon. */
export class CommsConsoleProp {
  readonly group = new Group();
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private readonly beacon = new MeshStandardMaterial({ color: 0x401010, emissive: 0xff3010, emissiveIntensity: 0 });
  private t = 0;
  private lastText = '';

  constructor() {
    const g = this.group;
    box(g, 1.4, 0.08, 0.7, MAT.panel, 0, 0.92, 0);
    box(g, 1.3, 0.88, 0.6, MAT.panelDusty, 0, 0.44, -0.02);
    box(g, 1.42, 0.05, 0.05, MAT.accent, 0, 0.97, 0.34);
    this.canvas.width = 512; this.canvas.height = 288;
    this.tex = new CanvasTexture(this.canvas);
    const screen = new Mesh(new BoxGeometry(1.1, 0.62, 0.03), [MAT.darkMetal, MAT.darkMetal, MAT.darkMetal, MAT.darkMetal,
      new MeshStandardMaterial({ map: this.tex, emissiveMap: this.tex, emissive: 0xffffff, emissiveIntensity: 1.1, color: 0x000000 }), MAT.darkMetal]);
    screen.position.set(0, 1.38, -0.18);
    screen.rotation.x = -0.25;
    g.add(screen);
    box(g, 0.08, 0.4, 0.08, MAT.metal, 0, 1.08, -0.24);
    // Keyboard and a small dish on a mast.
    box(g, 0.6, 0.03, 0.2, MAT.darkMetal, 0, 0.97, 0.16);
    const mast = new Mesh(new CylinderGeometry(0.025, 0.025, 1.2, 8), MAT.metal);
    mast.position.set(0.58, 1.55, -0.25);
    g.add(mast);
    const dish = new Mesh(new ConeGeometry(0.16, 0.08, 16, 1, true), MAT.panel);
    dish.position.set(0.58, 2.12, -0.2); dish.rotation.x = -1.1;
    g.add(dish);
    const b = new Mesh(new SphereGeometry(0.03, 8, 6), this.beacon);
    b.position.set(0.58, 2.18, -0.25);
    g.add(b);
    g.name = 'CommsConsole';
  }

  /** Redraws the screen when the text changes. `busy` blinks the beacon fast (uplink). */
  update(dt: number, lines: string[], busy: boolean): void {
    this.t += dt;
    this.beacon.emissiveIntensity = (Math.sin(this.t * (busy ? 14 : 3)) > 0.6 ? 3 : 0.2);
    const text = lines.join('\n');
    if (text === this.lastText) return;
    this.lastText = text;
    const c = this.canvas.getContext('2d')!;
    c.fillStyle = '#04080c'; c.fillRect(0, 0, 512, 288);
    c.fillStyle = '#5ad0ff'; c.font = 'bold 26px monospace';
    c.fillText('EXPEDITION 02 · COMMS UPLINK', 18, 40);
    c.fillRect(18, 52, 476, 2);
    c.font = '22px monospace';
    lines.forEach((l, i) => { c.fillStyle = l.startsWith('!') ? '#ffb070' : '#bfe9ff'; c.fillText(l.replace(/^!/, ''), 18, 92 + i * 34); });
    this.tex.needsUpdate = true;
  }
}

/** Radiation shield generator: housing with counter-rotating field rings; glow tracks the field level. */
export class ShieldGeneratorProp {
  readonly group = new Group();
  private readonly rings: Mesh[] = [];
  private readonly glow = new MeshStandardMaterial({ color: 0x0a1820, emissive: 0x6fd8ff, emissiveIntensity: 0, transparent: true, opacity: 0.9 });
  private readonly light = new PointLight(0x7fdcff, 0, 6, 2);
  private spin = 0;

  constructor() {
    const g = this.group;
    const base = new Mesh(new CylinderGeometry(0.62, 0.7, 0.3, 24), MAT.darkMetal);
    base.position.y = 0.15; base.castShadow = true; g.add(base);
    const core = new Mesh(new CylinderGeometry(0.22, 0.22, 1.6, 20), this.glow);
    core.position.y = 1.1; g.add(core);
    for (const y of [0.4, 1.9]) { const cap = new Mesh(new CylinderGeometry(0.42, 0.42, 0.12, 24), MAT.panel); cap.position.y = y; cap.castShadow = true; g.add(cap); }
    for (const [i, r] of [0.42, 0.55].entries()) {
      const ring = new Mesh(new TorusGeometry(r, 0.03, 8, 40), i ? MAT.accent : MAT.metal);
      ring.position.y = 1.1;
      g.add(ring);
      this.rings.push(ring);
    }
    for (const a of [0, 2.1, 4.2]) box(g, 0.06, 1.5, 0.06, MAT.metal, Math.cos(a) * 0.4, 1.15, Math.sin(a) * 0.4);
    this.light.position.y = 1.2;
    g.add(this.light);
    g.name = 'ShieldGenerator';
  }

  update(dt: number, level: number): void {
    this.spin += dt * (0.2 + level * 3.5);
    this.rings[0].rotation.set(Math.PI / 2 + Math.sin(this.spin) * 0.5, this.spin, 0);
    this.rings[1].rotation.set(Math.PI / 2 - Math.sin(this.spin * 0.8) * 0.5, -this.spin * 0.7, 0);
    this.glow.emissiveIntensity = 0.15 + level * (2.2 + Math.sin(this.spin * 4) * 0.25);
    this.light.intensity = level * 5;
  }
}
