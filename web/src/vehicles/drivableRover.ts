import {
  Box3, BufferAttribute, BufferGeometry, Group, Mesh, MathUtils, PerspectiveCamera, Quaternion, Vector3, type Object3D,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * Rover R-1 (directive System N): the user's ROVER.glb (Perseverance-class six-wheeler, 2.8 × 3.9 m, metre scale,
 * forward = +Z) made drivable.
 *
 * The model's six wheels are one fused mesh, so they are split at load time into connected components and grouped
 * into six wheels, each re-pivoted on its own centre so it can spin and articulate.
 *
 * Driving model (kinematic, on the same ground query as the player): throttle/brake/drag, speed-dependent steering
 * with in-place pivot turns, corner-wheel steering like Perseverance, six ground probes → chassis height/pitch/roll,
 * per-wheel suspension travel (rocker-bogie look), slope limit, collisions with structures. Speeds are gameplay values:
 * the real Perseverance tops out at ~0.12 km/h. Rapier is reserved for loose physics props (see DEVELOPMENT_HANDOFF).
 */
export interface RoverGround { height(x: number, z: number, yRef: number): number }
export interface RoverObstacles { blocked(x: number, z: number, y: number, radius: number): boolean }
export interface RoverInput { throttle: number; steer: number; brake: boolean }

export const ROVER_CFG = {
  maxSpeed: 6.5, reverseSpeed: 2.5, accel: 2.2, brake: 6, drag: 0.6,
  turnRate: 0.7, pivotTurnRate: 0.45, maxSlopeDeg: 28,
  /** Battery use per second at full throttle (% of capacity); idle draw; charge rate on the outpost pad. */
  drainFull: 0.22, drainIdle: 0.01, chargeRate: 1.2,
  radius: 1.7, suspension: 0.22,
};

interface Wheel { mesh: Mesh; base: Vector3; radius: number; row: number; side: number; travel: number }

/** Copy of a geometry with every attribute expanded to plain float32 (denormalised, de-interleaved). */
function dequantize(src: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, a] of Object.entries(src.attributes)) {
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    g.setAttribute(name, new BufferAttribute(out, a.itemSize));
  }
  if (src.index) g.setIndex(src.index.clone());
  return g;
}

/** Splits a fused multi-wheel mesh into per-wheel meshes (connected components grouped by proximity). */
function splitWheels(src: Mesh, expected = 6): Mesh[] {
  const g = src.geometry;
  const pos = g.getAttribute('position');
  const index = g.getIndex();
  const triCount = (index ? index.count : pos.count) / 3;
  const vi = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);
  // Union-find over vertices; vertices at identical positions are merged (UV seams).
  const parent = new Int32Array(pos.count).map((_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const keyOf = new Map<string, number>();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const j = keyOf.get(k);
    if (j === undefined) keyOf.set(k, i); else parent[find(i)] = find(j);
  }
  for (let t = 0; t < triCount; t++) { const a = find(vi(t, 0)); parent[find(vi(t, 1))] = a; parent[find(vi(t, 2))] = a; }
  // Component bounding boxes (XZ). Bounding-box centres are used, not vertex averages: lopsided parts such as half
  // spokes would otherwise land off-centre and not join their wheel (verified with tools/glb-clusters.mjs).
  const comps = new Map<number, { tris: number[]; x0: number; x1: number; z0: number; z1: number }>();
  for (let t = 0; t < triCount; t++) {
    const r = find(vi(t, 0));
    let c = comps.get(r);
    if (!c) comps.set(r, (c = { tris: [], x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }));
    c.tris.push(t);
    for (let k = 0; k < 3; k++) {
      const x = pos.getX(vi(t, k)), z = pos.getZ(vi(t, k));
      c.x0 = Math.min(c.x0, x); c.x1 = Math.max(c.x1, x); c.z0 = Math.min(c.z0, z); c.z1 = Math.max(c.z1, z);
    }
  }
  // Group components whose centres lie within 0.55 m in XZ (rim, tyre and hub parts of one wheel).
  const groups: Array<{ tris: number[]; x: number; z: number }> = [];
  for (const c of comps.values()) {
    const x = (c.x0 + c.x1) / 2, z = (c.z0 + c.z1) / 2;
    const gq = groups.find((q) => Math.hypot(q.x - x, q.z - z) < 0.55);
    if (gq) gq.tris.push(...c.tris);
    else groups.push({ tris: [...c.tris], x, z });
  }
  if (groups.length !== expected) throw new Error(`wheel split found ${groups.length} groups, expected ${expected}`);
  return groups.map((q, i) => {
    const idx: number[] = [];
    for (const t of q.tris) idx.push(vi(t, 0), vi(t, 1), vi(t, 2));
    const geo = new BufferGeometry();
    for (const name of Object.keys(g.attributes)) geo.setAttribute(name, g.getAttribute(name) as BufferAttribute);
    geo.setIndex(idx);
    const compact = geo.toNonIndexed(); // own vertices so each wheel can be re-centred
    compact.computeBoundingBox();
    const centre = compact.boundingBox!.getCenter(new Vector3());
    compact.translate(-centre.x, -centre.y, -centre.z);
    const m = new Mesh(compact, src.material);
    m.name = `RoverWheel_${i}`;
    m.position.copy(centre);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  });
}

export class DrivableRover {
  readonly group = new Group();
  /** Chassis (everything except wheels) — tilts with pitch/roll. */
  private readonly body = new Group();
  private wheels: Wheel[] = [];
  readonly pos = new Vector3();
  yaw = 0;
  speed = 0;
  pitch = 0;
  roll = 0;
  battery = 100;
  condition = 100;
  odometer = 0;
  occupied = false;
  charging = false;
  /** Mast camera head position in chassis space (Perseverance-style remote-sensing mast). */
  readonly mastHead = new Vector3(0.45, 2.1, 1.95);
  private steerVis = 0;

  static async load(url: string): Promise<DrivableRover> {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    const r = new DrivableRover();
    r.attachModel(gltf.scene);
    return r;
  }

  private attachModel(model: Object3D): void {
    model.updateMatrixWorld(true);
    let wheelMesh: Mesh | null = null;
    model.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.castShadow = true; m.receiveShadow = true;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      if (mat?.name === 'wheels') wheelMesh = m;
    });
    // Bake the model's node transforms so wheel meshes live in rover space (model is static apart from wheels).
    // Meshopt-optimised files store attributes quantised (normalised int16/int8); transforming those in place would
    // clamp to ±1, so attributes are expanded to float32 first.
    const bakeRoot = new Group();
    model.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const geo = dequantize(m.geometry).applyMatrix4(m.matrixWorld);
      const baked = new Mesh(geo, m.material);
      baked.castShadow = true; baked.receiveShadow = true;
      if (m === wheelMesh) {
        for (const w of splitWheels(baked)) {
          const box = new Box3().setFromObject(w);
          const size = box.getSize(new Vector3());
          this.wheels.push({ mesh: w, base: w.position.clone(), radius: size.y / 2, row: 0, side: Math.sign(w.position.x), travel: 0 });
          this.group.add(w);
        }
      } else bakeRoot.add(baked);
    });
    if (this.wheels.length !== 6) throw new Error('rover wheels not found');
    // Rows: front (+Z) = 1, middle = 0, rear = −1.
    const zs = [...new Set(this.wheels.map((w) => Math.round(w.base.z * 10) / 10))].sort((a, b) => a - b);
    for (const w of this.wheels) { const z = w.base.z; w.row = z > zs[zs.length - 1] - 0.4 ? 1 : z < zs[0] + 0.4 ? -1 : 0; }
    this.body.add(bakeRoot);
    this.group.add(this.body);
    this.group.name = 'RoverR1';
  }

  /** Places the rover on the ground at (x, z) facing `yaw` (yaw = rotation about +Y; forward = local +Z). */
  place(x: number, z: number, yaw: number, ground: RoverGround): void {
    this.pos.set(x, ground.height(x, z, 1e4), z);
    this.yaw = yaw;
    this.speed = 0;
    this.settle(ground, 0, true);
  }

  get forward(): Vector3 { return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get kmh(): number { return Math.abs(this.speed) * 3.6; }

  /** One simulation step. Returns true when the rover hit something this step. */
  step(dt: number, input: RoverInput, ground: RoverGround, obstacles: RoverObstacles, chargingPad: Vector3 | null): boolean {
    const c = ROVER_CFG;
    const powered = this.battery > 0;
    const thr = powered ? input.throttle : 0;
    // Longitudinal: throttle towards a target speed, brake, rolling drag; slope gravity component.
    const target = thr > 0 ? thr * c.maxSpeed : thr < 0 ? thr * c.reverseSpeed : 0;
    if (input.brake) this.speed = MathUtils.damp(this.speed, 0, c.brake, dt);
    else if (thr !== 0) this.speed += MathUtils.clamp(target - this.speed, -c.accel * dt, c.accel * dt);
    else this.speed = MathUtils.damp(this.speed, 0, c.drag, dt);
    this.speed += -Math.sin(this.pitch) * 3.721 * dt * 0.6; // Mars gravity along the slope
    // Steering: speed-scaled turning; pivot turn in place when (nearly) stopped.
    const sAbs = Math.abs(this.speed);
    const rate = sAbs < 0.4 ? c.pivotTurnRate : c.turnRate * Math.min(1, sAbs / 2.5);
    if (powered) this.yaw -= input.steer * rate * dt * (this.speed < -0.05 ? -1 : 1);
    this.steerVis = MathUtils.damp(this.steerVis, powered ? input.steer : 0, 8, dt);

    const f = this.forward;
    const nx = this.pos.x + f.x * this.speed * dt, nz = this.pos.z + f.z * this.speed * dt;
    // Slope limit: refuse to climb steeper than maxSlope.
    const hNow = ground.height(this.pos.x, this.pos.z, this.pos.y + 2), hNext = ground.height(nx, nz, this.pos.y + 2);
    const climb = (hNext - hNow) / Math.max(1e-3, Math.hypot(nx - this.pos.x, nz - this.pos.z));
    let hit = false;
    if (climb > Math.tan((c.maxSlopeDeg * Math.PI) / 180) && this.speed * Math.sign(this.speed) > 0) { this.speed *= 0.5; hit = true; }
    else if (obstacles.blocked(nx + f.x * c.radius * Math.sign(this.speed || 1), nz + f.z * c.radius * Math.sign(this.speed || 1), this.pos.y, 0.6)) {
      this.speed = -this.speed * 0.25;
      this.condition = Math.max(0, this.condition - Math.min(5, sAbs * 0.8));
      hit = true;
    } else {
      this.odometer += Math.hypot(nx - this.pos.x, nz - this.pos.z);
      this.pos.x = nx; this.pos.z = nz;
    }
    // Battery: drain with throttle; charge when parked on the outpost pad.
    this.charging = !!chargingPad && sAbs < 0.2 && Math.hypot(this.pos.x - chargingPad.x, this.pos.z - chargingPad.z) < 12;
    if (this.charging) this.battery = Math.min(100, this.battery + c.chargeRate * dt);
    else this.battery = Math.max(0, this.battery - (c.drainIdle + c.drainFull * Math.abs(thr)) * dt);
    this.settle(ground, dt, false);
    return hit;
  }

  /** Fits the chassis to the ground under the six wheels and animates wheels/suspension. */
  private settle(ground: RoverGround, dt: number, snap: boolean): void {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), this.yaw);
    const yRef = this.pos.y + 2;
    const hs = this.wheels.map((w) => {
      const p = w.base.clone().applyQuaternion(q);
      return ground.height(this.pos.x + p.x, this.pos.z + p.z, yRef);
    });
    const avg = (sel: (w: Wheel) => boolean) => { let s = 0, n = 0; this.wheels.forEach((w, i) => { if (sel(w)) { s += hs[i]; n++; } }); return n ? s / n : 0; };
    const front = avg((w) => w.row === 1), rear = avg((w) => w.row === -1), left = avg((w) => w.side > 0), right = avg((w) => w.side < 0);
    const wb = Math.max(1, Math.abs(this.wheels.find((w) => w.row === 1)!.base.z - this.wheels.find((w) => w.row === -1)!.base.z));
    const track = Math.max(1, Math.abs(this.wheels.find((w) => w.side > 0)!.base.x - this.wheels.find((w) => w.side < 0)!.base.x));
    const pitchT = Math.atan2(front - rear, wb), rollT = Math.atan2(left - right, track);
    const groundY = (front + rear + left + right) / 4;
    const k = snap ? 1 : 1 - Math.exp(-10 * dt);
    this.pitch += (pitchT - this.pitch) * k;
    this.roll += (rollT - this.roll) * k;
    this.pos.y += (groundY - this.pos.y) * k;
    this.group.position.copy(this.pos);
    this.group.quaternion.copy(q).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -this.pitch)).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), this.roll));
    // Wheels: spin by distance travelled, corner wheels steer, each wheel follows its own ground (suspension travel).
    const spin = (this.speed * dt) / 0.25;
    this.wheels.forEach((w, i) => {
      const plane = this.pos.y + w.base.z * Math.sin(this.pitch) + w.base.x * Math.sin(this.roll);
      const travel = MathUtils.clamp(hs[i] - plane, -ROVER_CFG.suspension, ROVER_CFG.suspension);
      w.travel += (travel - w.travel) * (snap ? 1 : 1 - Math.exp(-14 * dt));
      w.mesh.position.set(w.base.x, w.base.y + w.travel, w.base.z);
      w.mesh.rotation.order = 'YXZ';
      w.mesh.rotation.y = w.row === 0 ? 0 : -this.steerVis * 0.45 * w.row;
      w.mesh.rotation.x += w.radius > 0.05 ? (spin * 0.25) / w.radius : 0;
    });
  }

  /** World transform of a point given in chassis space (e.g. the mast head or the exit point). */
  toWorld(local: Vector3): Vector3 { return local.clone().applyMatrix4(this.group.matrixWorld); }

  /** Chase camera (third person) and mast camera (first person); `look` = mouse pan/tilt offsets, `zoom` 0.5…2.5. */
  applyCamera(cam: PerspectiveCamera, mode: 'chase' | 'mast', look: { yaw: number; pitch: number }, zoom: number, dt: number, ground: RoverGround): void {
    this.group.updateMatrixWorld(true);
    if (mode === 'mast') {
      const head = this.toWorld(this.mastHead);
      cam.position.copy(head);
      cam.rotation.order = 'YXZ';
      cam.rotation.set(-this.pitch * 0.5 + look.pitch, this.yaw + Math.PI + look.yaw, 0);
      const fov = MathUtils.clamp(55 / zoom, 12, 75);
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      return;
    }
    if (Math.abs(cam.fov - 70) > 0.01) { cam.fov = 70; cam.updateProjectionMatrix(); }
    const dist = 8.5 * zoom, height = 3.4 * zoom;
    const a = this.yaw + Math.PI + look.yaw;
    // a = yaw + π points backwards along the rover, so the camera sits behind it.
    const want = new Vector3(this.pos.x + Math.sin(a) * dist, 0, this.pos.z + Math.cos(a) * dist);
    want.y = Math.max(this.pos.y + height + look.pitch * 4, ground.height(want.x, want.z, this.pos.y + 20) + 1.2);
    const k = 1 - Math.exp(-6 * dt);
    cam.position.lerp(want, cam.position.distanceTo(want) > 30 ? 1 : k);
    cam.lookAt(this.pos.x, this.pos.y + 1.4, this.pos.z);
  }
}
