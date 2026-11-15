import { BufferGeometry, CanvasTexture, Color, Float32BufferAttribute, NormalBlending, Points, ShaderMaterial, Vector3, type Scene } from 'three';
import { GRAVITY } from '../core/config';

/**
 * Landing dust: descent-engine exhaust lifts regolith into a radial sheet that billows outward, rises a little,
 * slows in the thin air and falls back under Mars gravity (3.72 m/s²). Particles are emitted by `emit()` from a
 * ground point with an engine strength; a gust of Martian wind drifts the whole cloud. Soft, depth-tested sprites.
 */
const vert = /* glsl */`
attribute float aSize; attribute float aAlpha; varying float vA;
void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * 380.0 / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`;
const frag = /* glsl */`
uniform sampler2D uTex; uniform vec3 uColor; varying float vA;
void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(uColor * (0.85 + 0.3*t.g), t.a * vA); if (gl_FragColor.a < 0.01) discard; }`;

function puff(): CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  for (let k = 0; k < 6; k++) {
    const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24, r = 14 + Math.random() * 16;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}

export class LandingDust {
  readonly points: Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private next = 0;
  wind = new Vector3(1.6, 0, 0.6);

  constructor(scene: Scene, n = 5000, color = 0xb27a55) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.maxLife = new Float32Array(n).fill(1);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new Float32BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new Float32BufferAttribute(this.alpha, 1));
    this.points = new Points(g, new ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending: NormalBlending,
      uniforms: { uTex: { value: puff() }, uColor: { value: new Color(color) } },
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    scene.add(this.points);
  }

  /** Emits `count` particles from ground point `at` (radial sheet), strength 0…1. */
  emit(at: Vector3, count: number, strength: number): void {
    for (let k = 0; k < count; k++) {
      const i = this.next; this.next = (this.next + 1) % this.n;
      const a = Math.random() * Math.PI * 2, sp = (6 + Math.random() * 16) * strength;
      this.pos[i * 3] = at.x + Math.cos(a) * 0.8; this.pos[i * 3 + 1] = at.y + 0.2; this.pos[i * 3 + 2] = at.z + Math.sin(a) * 0.8;
      this.vel[i * 3] = Math.cos(a) * sp; this.vel[i * 3 + 1] = 0.5 + Math.random() * 3.5 * strength; this.vel[i * 3 + 2] = Math.sin(a) * sp;
      this.life[i] = 0; this.maxLife[i] = 5 + Math.random() * 6;
    }
  }

  /** Sudden burst (touchdown, a heavy object landing). */
  burst(at: Vector3, count = 500): void { this.emit(at, count, 1.15); }

  update(dt: number, groundY: (x: number, z: number) => number): void {
    const drag = Math.exp(-dt * 0.9);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] >= this.maxLife[i]) { this.alpha[i] = 0; continue; }
      this.life[i] += dt;
      const t = this.life[i] / this.maxLife[i];
      for (let c = 0; c < 3; c++) this.vel[i * 3 + c] *= drag;
      this.vel[i * 3 + 1] -= GRAVITY * 0.18 * dt; // fine dust: mostly suspended, slowly settling
      this.pos[i * 3] += (this.vel[i * 3] + this.wind.x * t) * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + this.wind.z * t) * dt;
      const gy = groundY(this.pos[i * 3], this.pos[i * 3 + 2]) + 0.15;
      if (this.pos[i * 3 + 1] < gy) { this.pos[i * 3 + 1] = gy; this.vel[i * 3 + 1] = 0; }
      this.size[i] = 1.6 + t * 10;
      this.alpha[i] = Math.min(1, this.life[i] * 4) * (1 - t) * 0.7;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true;
  }

  get active(): boolean { for (let i = 0; i < this.n; i++) if (this.life[i] < this.maxLife[i]) return true; return false; }

  clear(): void { this.life.fill(0); this.maxLife.fill(0); this.alpha.fill(0); }

  dispose(): void { this.points.removeFromParent(); this.points.geometry.dispose(); (this.points.material as ShaderMaterial).dispose(); }
}
