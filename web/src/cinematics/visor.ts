import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, CubeCamera, DodecahedronGeometry, HalfFloatType,
  InstancedMesh, LinearMipmapLinearFilter, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Points, PointsMaterial,
  Quaternion, RepeatWrapping, Vector3, WebGLCubeRenderTarget, type Object3D, type Scene, type WebGLRenderer,
} from 'three';
import { mulberry32 } from '../world/random';

/**
 * Helmet visor realism (directive Part 6).
 *
 * The visor becomes a layered physical material: a dark, almost mirror-like shell with a gold thin-film coating
 * (iridescence) under a clear coat, plus a procedural imperfection map (micro-scratches, dust specks, a smudge) that
 * modulates roughness, so highlights break up like real polycarbonate. Reflections are NOT a texture: a cube camera at
 * the helmet re-renders the actual scene (terrain, sky, sun, debris) while the visor is on screen, so they move with the
 * camera and react to objects passing nearby. Outside close-ups the probe is idle (no cost).
 */
function imperfectionMap(): CanvasTexture {
  const n = 512;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgb(18,18,18)'; // base roughness ≈ 0.07
  g.fillRect(0, 0, n, n);
  const rnd = mulberry32(4242);
  // Micro-scratches: thin, mostly parallel arcs from wiping dust off with a glove.
  for (let i = 0; i < 260; i++) {
    const x = rnd() * n, y = rnd() * n, len = 8 + rnd() * 60, a = -0.35 + rnd() * 0.25 + (rnd() < 0.15 ? 1.4 : 0);
    g.strokeStyle = `rgba(${150 + rnd() * 80},${150 + rnd() * 80},${150 + rnd() * 80},${0.25 + rnd() * 0.45})`;
    g.lineWidth = 0.4 + rnd() * 0.7;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * 6, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  // Dust specks, denser towards the lower edge (settles there).
  for (let i = 0; i < 1800; i++) {
    const x = rnd() * n, y = Math.pow(rnd(), 0.6) * n, r = rnd() < 0.92 ? 0.4 + rnd() * 0.9 : 1.5 + rnd() * 2.2;
    g.fillStyle = `rgba(${170 + rnd() * 60},${120 + rnd() * 40},${90 + rnd() * 30},${0.25 + rnd() * 0.55})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // A faint glove smudge.
  const grad = g.createRadialGradient(n * 0.68, n * 0.35, 4, n * 0.68, n * 0.35, n * 0.18);
  grad.addColorStop(0, 'rgba(110,110,110,0.55)'); grad.addColorStop(1, 'rgba(110,110,110,0)');
  g.fillStyle = grad; g.fillRect(0, 0, n, n);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 8;
  return t;
}

export class VisorRig {
  private readonly target = new WebGLCubeRenderTarget(256, { type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter });
  private readonly probe = new CubeCamera(0.05, 2000, this.target);
  private readonly visors: Mesh[] = [];
  private readonly helmetAnchor: Object3D | null;
  readonly material: MeshPhysicalMaterial;
  active = false;
  private frame = 0;

  constructor(model: Object3D, private readonly scene: Scene) {
    const imperfections = imperfectionMap();
    this.material = new MeshPhysicalMaterial({
      color: new Color(0x0b0b0d), metalness: 0.92, roughness: 0.12, roughnessMap: imperfections,
      clearcoat: 1, clearcoatRoughness: 0.04, clearcoatRoughnessMap: imperfections,
      iridescence: 0.85, iridescenceIOR: 1.6, iridescenceThicknessRange: [380, 620], // gold/amber thin film
      envMap: this.target.texture, envMapIntensity: 1.6, specularIntensity: 1, specularColor: new Color(0xffe2b0),
    });
    model.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const name = (Array.isArray(m.material) ? m.material[0] : m.material)?.name ?? '';
      if (name === 'mat_helmet_glass' || name === 'mat_helmet_glass_cover') { m.material = this.material; this.visors.push(m); }
    });
    this.helmetAnchor = model.getObjectByName('Head_054') ?? null;
    scene.add(this.probe);
  }

  get found(): boolean { return this.visors.length > 0; }

  /** Call every frame; refreshes the reflection probe at the helmet while active (every frame up close). */
  update(renderer: WebGLRenderer): void {
    if (!this.active || !this.helmetAnchor) return;
    if (++this.frame % 2) return; // 30 Hz probe is plenty for a slow push-in
    this.helmetAnchor.getWorldPosition(this.probe.position);
    this.probe.position.y += 0.12;
    for (const v of this.visors) v.visible = false; // the visor must not reflect itself
    this.probe.update(renderer, this.scene);
    for (const v of this.visors) v.visible = true;
  }

  dispose(): void { this.scene.remove(this.probe); this.target.dispose(); }
}

/**
 * Wind-blown debris for the visor shot: rock fragments (instanced, sunlit, casting shadows) and fine dust streaks
 * crossing in front of and around the astronaut. Real scene objects, so the visor probe reflects them.
 */
export class DebrisGust {
  readonly group: Object3D[] = [];
  private readonly rocks: InstancedMesh;
  private readonly dust: Points;
  private readonly seeds: Array<{ p: Vector3; v: Vector3; spin: Vector3; s: number }> = [];
  private readonly dustPos: Float32Array;
  private readonly dustVel: Float32Array;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();

  constructor(private readonly scene: Scene, private readonly centre: Vector3, private readonly wind: Vector3) {
    const rnd = mulberry32(77);
    this.rocks = new InstancedMesh(new DodecahedronGeometry(1, 0), new MeshStandardMaterial({ color: 0x6b4434, roughness: 0.9, flatShading: true }), 46);
    this.rocks.castShadow = true;
    for (let i = 0; i < 46; i++) {
      const p = this.spawn(rnd, true);
      this.seeds.push({ p, v: wind.clone().multiplyScalar(0.7 + rnd() * 0.7).add(new Vector3(0, (rnd() - 0.3) * 0.6, 0)), spin: new Vector3(rnd(), rnd(), rnd()).multiplyScalar(4), s: 0.012 + Math.pow(rnd(), 3) * 0.06 });
    }
    const N = 900;
    this.dustPos = new Float32Array(N * 3);
    this.dustVel = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const p = this.spawn(rnd, true);
      this.dustPos.set([p.x, p.y, p.z], i * 3);
      const v = wind.clone().multiplyScalar(1 + rnd() * 1.2);
      this.dustVel.set([v.x, v.y + (rnd() - 0.5) * 0.4, v.z], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.dustPos, 3));
    const dot = document.createElement('canvas');
    dot.width = dot.height = 32;
    const dg = dot.getContext('2d')!;
    const rg = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.4, 'rgba(255,255,255,0.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    dg.fillStyle = rg; dg.fillRect(0, 0, 32, 32);
    this.dust = new Points(g, new PointsMaterial({ color: 0xd9a37a, size: 0.07, map: new CanvasTexture(dot), transparent: true, opacity: 0.8, depthWrite: false, blending: AdditiveBlending }));
    this.dust.frustumCulled = false;
    this.rocks.frustumCulled = false;
    scene.add(this.rocks, this.dust);
    this.group.push(this.rocks, this.dust);
  }

  /** Upwind of the astronaut, within a 6 m tube around head height. */
  private spawn(rnd: () => number, anywhere: boolean): Vector3 {
    const w = this.wind.clone().normalize();
    const side = new Vector3(-w.z, 0, w.x);
    const along = anywhere ? (rnd() - 0.5) * 12 : -6 - rnd() * 2;
    return this.centre.clone().addScaledVector(w, along).addScaledVector(side, (rnd() - 0.5) * 6).add(new Vector3(0, (rnd() - 0.35) * 2.4, 0));
  }

  update(dt: number, t: number): void {
    const w = this.wind.clone().normalize();
    const rnd = Math.random;
    this.seeds.forEach((s, i) => {
      s.p.addScaledVector(s.v, dt);
      s.v.y -= 3.71 * dt * 0.15; // Mars gravity, mostly held aloft by the gust
      if (s.p.clone().sub(this.centre).dot(w) > 7 || s.p.y < this.centre.y - 2) s.p.copy(this.spawn(rnd, false));
      this.q.setFromAxisAngle(s.spin.clone().normalize(), t * s.spin.length());
      this.m.compose(s.p, this.q, new Vector3(s.s, s.s * 0.8, s.s));
      this.rocks.setMatrixAt(i, this.m);
    });
    this.rocks.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.dustPos.length; i += 3) {
      this.dustPos[i] += this.dustVel[i] * dt; this.dustPos[i + 1] += this.dustVel[i + 1] * dt; this.dustPos[i + 2] += this.dustVel[i + 2] * dt;
      const dx = this.dustPos[i] - this.centre.x, dz = this.dustPos[i + 2] - this.centre.z;
      if (dx * w.x + dz * w.z > 7) { const p = this.spawn(rnd, false); this.dustPos[i] = p.x; this.dustPos[i + 1] = p.y; this.dustPos[i + 2] = p.z; }
    }
    (this.dust.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    for (const o of this.group) this.scene.remove(o);
    this.rocks.geometry.dispose(); (this.rocks.material as MeshStandardMaterial).dispose();
    this.dust.geometry.dispose(); (this.dust.material as PointsMaterial).dispose();
  }
}
