import {
  BufferGeometry, CanvasTexture, Color, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, Matrix4, NormalBlending,
  PlaneGeometry, Points, ShaderMaterial, Vector3, type Scene,
} from 'three';
import { GRAVITY } from '../core/config';

/**
 * Boot prints and kicked-up dust (the ground reacting to the player).
 *
 * - Prints: every stride presses a tread-patterned boot print into the regolith, alternating left/right, lying on
 *   the local slope. They stay (nothing erodes them in minutes on Mars), the oldest fade and are reused.
 * - Dust: each footfall throws a few grains outward and up; they arc back under Mars gravity (3.72 m/s²) with a
 *   little air drag. Landing from a jump throws a ring, harder landings a bigger one.
 */
const MAX_PRINTS = 260;
const MAX_DUST = 420;

function bootTexture(): CanvasTexture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 128);
  // Sole outline: broad forefoot, narrower waist, rounded heel (toe at the top).
  g.fillStyle = 'rgba(255,255,255,1)';
  g.beginPath();
  g.moveTo(32, 4);
  g.bezierCurveTo(54, 4, 58, 30, 54, 54);
  g.bezierCurveTo(50, 70, 50, 78, 52, 96);
  g.bezierCurveTo(54, 116, 44, 124, 32, 124);
  g.bezierCurveTo(20, 124, 10, 116, 12, 96);
  g.bezierCurveTo(14, 78, 14, 70, 10, 54);
  g.bezierCurveTo(6, 30, 10, 4, 32, 4);
  g.fill();
  // Tread: lugs stay raised (lighter), the channels between them press deeper.
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,0.55)';
  for (let y = 12; y < 70; y += 11) g.fillRect(8, y, 48, 4);
  for (let y = 92; y < 120; y += 10) g.fillRect(10, y, 44, 4);
  g.fillRect(8, 74, 48, 9); // instep barely touches
  g.globalCompositeOperation = 'source-over';
  const t = new CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function puffTexture(): CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 48;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 48, 48);
  return new CanvasTexture(c);
}

const printVert = /* glsl */`
attribute float aAlpha; varying float vA; varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main(){ vA = aAlpha; vUv = uv; vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;
#include <logdepthbuf_vertex>
#include <fog_vertex>
}`;
const printFrag = /* glsl */`
uniform sampler2D uTex; uniform vec3 uColor; varying float vA; varying vec2 vUv;
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
void main(){
#include <logdepthbuf_fragment>
float a = texture2D(uTex, vUv).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(uColor, a);
#include <fog_fragment>
}`;
const dustVert = /* glsl */`
attribute float aSize; attribute float aAlpha; varying float vA;
#include <common>
#include <logdepthbuf_pars_vertex>
void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * 900.0 / max(0.3, -mv.z); gl_Position = projectionMatrix * mv;
#include <logdepthbuf_vertex>
}`;
const dustFrag = /* glsl */`
uniform sampler2D uTex; uniform vec3 uColor; varying float vA;
#include <logdepthbuf_pars_fragment>
void main(){
#include <logdepthbuf_fragment>
float a = texture2D(uTex, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(uColor, a); }`;

export class Footprints {
  private readonly prints: InstancedMesh;
  private readonly printAlpha = new Float32Array(MAX_PRINTS);
  private readonly printAge = new Float32Array(MAX_PRINTS).fill(-1);
  private nextPrint = 0;
  private left = false;
  private lastStride = 0;

  private readonly dust: Points;
  private readonly pos = new Float32Array(MAX_DUST * 3);
  private readonly vel = new Float32Array(MAX_DUST * 3);
  private readonly life = new Float32Array(MAX_DUST);
  private readonly maxLife = new Float32Array(MAX_DUST);
  private readonly size = new Float32Array(MAX_DUST);
  private readonly alpha = new Float32Array(MAX_DUST);
  private nextDust = 0;
  private wasGrounded = true;
  private fallSpeed = 0;
  /** Number of prints laid down (diagnostics / tests). */
  count = 0;

  constructor(scene: Scene, fog: { color: Color; density: number }) {
    const quad = new PlaneGeometry(0.135, 0.31);
    quad.setAttribute('aAlpha', new InstancedBufferAttribute(this.printAlpha, 1).setUsage(DynamicDrawUsage));
    this.prints = new InstancedMesh(quad, new ShaderMaterial({
      vertexShader: printVert, fragmentShader: printFrag, transparent: true, depthWrite: false, fog: true,
      uniforms: { uTex: { value: bootTexture() }, uColor: { value: new Color(0x2b0f07) }, fogColor: { value: fog.color }, fogDensity: { value: fog.density } },
    }), MAX_PRINTS);
    this.prints.instanceMatrix.setUsage(DynamicDrawUsage);
    this.prints.frustumCulled = false;
    this.prints.renderOrder = 2;
    const zero = new Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_PRINTS; i++) this.prints.setMatrixAt(i, zero);
    this.fog = fog;
    scene.add(this.prints);

    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new Float32BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new Float32BufferAttribute(this.alpha, 1));
    this.dust = new Points(g, new ShaderMaterial({
      vertexShader: dustVert, fragmentShader: dustFrag, transparent: true, depthWrite: false, blending: NormalBlending,
      uniforms: { uTex: { value: puffTexture() }, uColor: { value: new Color(0xb9734b) } },
    }));
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 4;
    scene.add(this.dust);
  }
  private readonly fog: { color: Color; density: number };

  /** Presses one boot print at (x, z) heading `yaw` (view yaw: forward = (−sin, −cos)). */
  private stamp(x: number, y: number, z: number, n: readonly [number, number, number], yaw: number): void {
    const up = _n.set(n[0], n[1], n[2]).normalize();
    const fwd = _f.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    const right = _r.crossVectors(fwd, up).normalize();
    _m.makeBasis(right, fwd, up).setPosition(x + up.x * 0.02, y + up.y * 0.02, z + up.z * 0.02);
    const i = this.nextPrint; this.nextPrint = (this.nextPrint + 1) % MAX_PRINTS;
    this.prints.setMatrixAt(i, _m);
    this.prints.instanceMatrix.needsUpdate = true;
    this.printAge[i] = 0;
    this.count++;
  }

  private puff(x: number, y: number, z: number, count: number, speed: number, dirX = 0, dirZ = 0): void {
    for (let k = 0; k < count; k++) {
      const i = this.nextDust; this.nextDust = (this.nextDust + 1) % MAX_DUST;
      const a = Math.random() * Math.PI * 2, sp = speed * (0.35 + Math.random() * 0.65);
      this.pos[i * 3] = x + Math.cos(a) * 0.07; this.pos[i * 3 + 1] = y + 0.03; this.pos[i * 3 + 2] = z + Math.sin(a) * 0.07;
      this.vel[i * 3] = Math.cos(a) * sp + dirX; this.vel[i * 3 + 1] = (0.5 + Math.random() * 0.9) * speed; this.vel[i * 3 + 2] = Math.sin(a) * sp + dirZ;
      this.life[i] = 0; this.maxLife[i] = 0.9 + Math.random() * 1.1;
      this.size[i] = 0.05 + Math.random() * 0.06;
    }
  }

  /**
   * Per frame. `stride` = total distance walked on the ground (m); `surface` returns the walkable surface under a
   * point, or null where prints make no sense (metal floors). `vy` = vertical speed (for landing dust).
   */
  update(
    dt: number, pos: Vector3, velX: number, velZ: number, vy: number, yaw: number, grounded: boolean, sprinting: boolean, stride: number,
    surface: (x: number, z: number) => { h: number; n: readonly [number, number, number] } | null,
  ): void {
    // Landing: a ring of dust, bigger for harder landings.
    if (!grounded) this.fallSpeed = Math.max(this.fallSpeed, -vy);
    if (grounded && !this.wasGrounded) {
      const s = surface(pos.x, pos.z);
      if (s) {
        const hard = Math.min(1, this.fallSpeed / 6);
        this.puff(pos.x, s.h, pos.z, 10 + Math.round(26 * hard), 0.7 + 1.3 * hard, velX * 0.25, velZ * 0.25);
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        for (const side of [-1, 1]) { const px = pos.x + rx * 0.11 * side, pz = pos.z + rz * 0.11 * side; const sp = surface(px, pz); if (sp) this.stamp(px, sp.h, pz, sp.n, yaw); }
      }
      this.fallSpeed = 0;
      this.lastStride = stride;
    }
    this.wasGrounded = grounded;
    // Strides: one print per step, alternating feet.
    const stepLen = sprinting ? 1.05 : 0.68;
    if (grounded && stride - this.lastStride >= stepLen) {
      this.lastStride = stride;
      this.left = !this.left;
      const speed = Math.hypot(velX, velZ);
      const heading = speed > 0.3 ? Math.atan2(-velX, -velZ) : yaw; // prints point the way the boots travel
      const rx = Math.cos(heading), rz = -Math.sin(heading), side = this.left ? -1 : 1;
      const px = pos.x + rx * 0.105 * side, pz = pos.z + rz * 0.105 * side;
      const s = surface(px, pz);
      if (s) {
        this.stamp(px, s.h, pz, s.n, heading + side * 0.09);
        this.puff(px, s.h, pz, sprinting ? 7 : 4, sprinting ? 0.75 : 0.45, velX * 0.2, velZ * 0.2);
      }
    } else if (stride < this.lastStride) this.lastStride = stride;

    // Prints: fade in as the boot lifts, the oldest fade out before their slot is reused.
    let dirty = false;
    for (let i = 0; i < MAX_PRINTS; i++) {
      if (this.printAge[i] < 0) continue;
      this.printAge[i] += dt;
      const order = (this.nextPrint - 1 - i + MAX_PRINTS) % MAX_PRINTS; // 0 = newest
      const a = Math.min(1, this.printAge[i] * 5) * Math.min(1, (MAX_PRINTS - order) / 40) * 0.62;
      if (Math.abs(a - this.printAlpha[i]) > 0.004) { this.printAlpha[i] = a; dirty = true; }
    }
    if (dirty) (this.prints.geometry.getAttribute('aAlpha') as InstancedBufferAttribute).needsUpdate = true;
    (this.prints.material as ShaderMaterial).uniforms.fogDensity.value = this.fog.density;

    // Dust grains: ballistic under Mars gravity with light drag; they vanish on touching the ground again.
    const drag = Math.exp(-dt * 1.4);
    let live = false;
    for (let i = 0; i < MAX_DUST; i++) {
      if (this.life[i] >= this.maxLife[i]) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; live = true; } continue; }
      live = true;
      this.life[i] += dt;
      const t = this.life[i] / this.maxLife[i];
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.vel[i * 3 + 1] -= GRAVITY * 0.55 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = Math.min(1, this.life[i] * 12) * (1 - t) * (1 - t) * 0.5;
      this.size[i] += dt * 0.11;
    }
    if (live) {
      const g = this.dust.geometry;
      g.attributes.position.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true;
    }
  }

  clear(): void {
    this.printAge.fill(-1); this.printAlpha.fill(0);
    (this.prints.geometry.getAttribute('aAlpha') as InstancedBufferAttribute).needsUpdate = true;
    this.life.fill(0); this.maxLife.fill(0); this.alpha.fill(0);
  }
}

const _n = new Vector3(), _f = new Vector3(), _r = new Vector3(), _m = new Matrix4();
