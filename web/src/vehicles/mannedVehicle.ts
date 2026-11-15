import { Box3, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, SpotLight, Vector3, type Object3D, type Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GRAVITY } from '../core/config';
import type { RoverGround, RoverObstacles } from './drivableRover';

/**
 * MEV-1 — the manned exploration vehicle in the garage (directive Part 8), built on the user's VEHICLE.glb
 * ("CRIMSONAMALTHEA" four-wheeler with separate wheel, door and steering-wheel nodes). Distinct from the remote
 * rover R-1 (ROVER.glb), which is only ever driven through the PDA.
 *
 * Normalisation at load: wheel centres give the wheelbase (scaled to 2.95 m) and the forward axis (rear → front axle,
 * turned to local +Z). Wheels are re-parented onto steer/spin pivots; the driver door onto a hinge pivot.
 * Driving model (kinematic, same ground query as the player): bicycle-model steering (Ackermann-like yaw rate),
 * throttle/brake/drag, Mars-gravity slope term, 4 ground probes → height/pitch/roll, per-wheel suspension travel,
 * collisions against structures and colliders, battery drain + charging in the hangar bay. Gameplay speeds
 * (top 40 km/h); NASA's LTV concepts top out around 15 km/h.
 */
export interface VehicleInput { throttle: number; steer: number; brake: boolean }

export const MEV_CFG = {
  wheelbase: 2.95, maxSpeed: 11, reverseSpeed: 3.5, accel: 2.6, brake: 7, drag: 0.35,
  maxSteer: 0.55, steerRate: 2.2, maxSlopeDeg: 30, drainFull: 0.12, drainIdle: 0.006, chargeRate: 1.6, suspension: 0.18,
};

interface WheelRig { steer: Group; spin: Group; local: Vector3; front: boolean; radius: number; travel: number }

export class MannedVehicle {
  readonly group = new Group();
  private readonly body = new Group();
  private readonly model = new Group();
  private wheels: WheelRig[] = [];
  private door: Group | null = null;
  private doorSign = 1;
  private steeringWheel: Object3D | null = null;
  private readonly lightMats: MeshStandardMaterial[] = [];
  readonly headlamp = new SpotLight(0xfff2dc, 0, 70, 0.55, 0.5, 1.2);
  readonly pos = new Vector3();
  yaw = 0; speed = 0; pitch = 0; roll = 0; steer = 0;
  battery = 62; condition = 88; odometer = 0;
  occupied = false; charging = false; headlights = false;
  /** Systems restored (Ch.3); before that the vehicle cannot be driven. */
  powered = false;
  doorOpen = 0;
  private doorTarget = 0;
  /** Seat (eye) and driver-door exit point in vehicle space. */
  readonly seat = new Vector3(-0.42, 1.55, 0.25);
  readonly exitPoint = new Vector3(-2.1, 0, 0.1);
  length = 4.8; width = 2.1;

  static async load(url: string): Promise<MannedVehicle> {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    const v = new MannedVehicle();
    v.attach(gltf.scene);
    return v;
  }

  private attach(src: Object3D): void {
    src.updateMatrixWorld(true);
    const find = (re: RegExp) => { let f: Object3D | null = null; src.traverse((o) => { if (!f && re.test(o.name)) f = o; }); return f as Object3D | null; };
    const centre = (o: Object3D) => new Box3().setFromObject(o).getCenter(new Vector3());
    const wheelNodes = { fl: find(/^wheel_fl/), fr: find(/^wheel_fr/), rl: find(/^wheel_(lr|rl)/), rr: find(/^wheel_rr/) };
    if (!wheelNodes.fl || !wheelNodes.fr || !wheelNodes.rl || !wheelNodes.rr) throw new Error('MEV wheels not found');
    const c = { fl: centre(wheelNodes.fl), fr: centre(wheelNodes.fr), rl: centre(wheelNodes.rl), rr: centre(wheelNodes.rr) };
    const front = c.fl.clone().add(c.fr).multiplyScalar(0.5), rear = c.rl.clone().add(c.rr).multiplyScalar(0.5);
    const fwd = front.clone().sub(rear); fwd.y = 0;
    const wheelbase = fwd.length(); fwd.normalize();
    const s = MEV_CFG.wheelbase / wheelbase;
    const mid = front.clone().add(rear).multiplyScalar(0.5);
    const wheelR = new Box3().setFromObject(wheelNodes.fl).getSize(new Vector3()).y / 2;
    // model space: centre between the axles at axle height, forward → +Z, scaled to metres
    this.model.add(src);
    this.model.scale.setScalar(s);
    this.model.rotation.y = -Math.atan2(fwd.x, fwd.z);
    this.model.updateMatrixWorld(true);
    const midW = mid.clone().applyMatrix4(this.model.matrixWorld);
    this.model.position.set(-midW.x, -midW.y + wheelR * s, -midW.z);
    this.body.add(this.model);
    this.group.add(this.body);
    this.group.updateMatrixWorld(true);
    // wheel pivots (steer → spin → wheel + disk)
    for (const [k, node] of Object.entries(wheelNodes) as Array<[string, Object3D]>) {
      const w = centre(node);
      const local = this.body.worldToLocal(w.clone());
      const steer = new Group(), spin = new Group();
      steer.position.copy(local); steer.add(spin); this.body.add(steer);
      this.body.updateMatrixWorld(true);
      spin.attach(node);
      const disk = find(new RegExp(`^disk_${k === 'rl' ? 'rl' : k}`));
      if (disk) steer.attach(disk);
      this.wheels.push({ steer, spin, local, front: k.startsWith('f'), radius: wheelR * s, travel: 0 });
    }
    // driver door: the door nearest the steering wheel, hinged on its front edge, swinging outward
    this.steeringWheel = find(/^steeringwheel/);
    const sw = this.steeringWheel ? this.body.worldToLocal(centre(this.steeringWheel)) : new Vector3(-0.4, 1.2, 0.6);
    const doors = [find(/^leftdoor_/), find(/^rightdoor_/)].filter(Boolean) as Object3D[];
    const pick = doors.sort((a, b) => this.body.worldToLocal(centre(a)).distanceTo(sw) - this.body.worldToLocal(centre(b)).distanceTo(sw))[0];
    if (pick) {
      const bb = new Box3().setFromObject(pick);
      const lo = this.body.worldToLocal(bb.min.clone()), hi = this.body.worldToLocal(bb.max.clone());
      const dc = this.body.worldToLocal(bb.getCenter(new Vector3()));
      const hinge = new Group();
      hinge.position.set(dc.x, dc.y, Math.max(lo.z, hi.z));
      this.body.add(hinge); this.body.updateMatrixWorld(true);
      hinge.attach(pick);
      const win = find(new RegExp(`^${pick.name.startsWith('left') ? 'leftdoorwindow' : 'rightdoorwindow'}`));
      if (win) hinge.attach(win);
      this.door = hinge;
      this.doorSign = dc.x < 0 ? -1 : 1;
      this.seat.set(sw.x, sw.y + 0.42, sw.z - 0.5);
      this.exitPoint.set(dc.x + Math.sign(dc.x || -1) * 1.5, 0, dc.z);
    }
    const size = new Box3().setFromObject(this.model).getSize(new Vector3());
    this.length = size.z; this.width = size.x;
    // lights
    this.group.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      m.castShadow = true; m.receiveShadow = true;
      const mt = m.material as MeshStandardMaterial;
      if (mt && /light_glass|highbeam|dippedbeam/.test(mt.name + o.name) && mt.isMeshStandardMaterial) { const cl = mt.clone(); m.material = cl; this.lightMats.push(cl); }
    });
    this.headlamp.position.set(0, 1.0, this.length * 0.48);
    this.headlamp.target.position.set(0, -0.6, this.length * 0.48 + 12);
    this.body.add(this.headlamp, this.headlamp.target);
    this.group.name = 'MEV1';
  }

  /**
   * Image-based lighting for the vehicle only (the source materials are near-black and partly metallic, which renders
   * as a silhouette without an environment): a PMREM room environment, body lifted to dark graphite with a clear-coat look.
   */
  setEnvironment(env: Texture): void {
    this.group.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (!m || !m.isMeshStandardMaterial) return;
      m.envMap = env; m.envMapIntensity = 0.85;
      if (/body_metal|fenders/.test(m.name)) { m.color.setRGB(0.07, 0.07, 0.075); m.metalness = 0.55; m.roughness = Math.max(0.28, m.roughness); }
      if (/bumper_metal/.test(m.name)) { m.color.setRGB(0.12, 0.12, 0.12); m.roughness = 0.5; }
      if (/glass/.test(m.name) && m.opacity >= 1) { m.metalness = 0.6; m.roughness = 0.15; }
      m.needsUpdate = true;
    });
  }

  toWorld(v: Vector3): Vector3 { this.group.updateMatrixWorld(true); return this.body.localToWorld(v.clone()); }
  get kmh(): number { return Math.abs(this.speed) * 3.6; }
  get forward(): Vector3 { return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  place(x: number, z: number, yaw: number, ground: RoverGround, yRef = 1e4): void {
    this.pos.set(x, ground.height(x, z, yRef), z);
    this.yaw = yaw; this.speed = 0; this.steer = 0;
    this.settle(ground, 0, true);
  }

  openDoor(open: boolean): void { this.doorTarget = open ? 1 : 0; }

  /** Driver-door exit point on the ground (world). */
  exitWorld(ground: RoverGround): Vector3 {
    const p = this.toWorld(this.exitPoint);
    p.y = ground.height(p.x, p.z, this.pos.y + 2);
    return p;
  }

  /** Advances the vehicle; returns true on a collision. */
  step(dt: number, input: VehicleInput, ground: RoverGround, obstacles: RoverObstacles, charger: ((p: Vector3) => boolean) | null): boolean {
    const C = MEV_CFG;
    const can = this.powered && this.battery > 0 && this.condition > 0;
    const thr = can ? input.throttle : 0;
    if (input.brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), C.brake * dt);
    else if (thr > 0) this.speed += (this.speed < 0 ? C.brake : C.accel) * thr * dt;
    else if (thr < 0) this.speed += (this.speed > 0 ? -C.brake : -C.accel * 0.7) * -thr * dt;
    this.speed -= this.speed * C.drag * dt;
    if (!thr && Math.abs(this.speed) < 0.05) this.speed = 0;
    this.speed -= GRAVITY * Math.sin(this.pitch) * dt; // Mars gravity along the slope
    this.speed = Math.max(-C.reverseSpeed, Math.min(C.maxSpeed, this.speed));
    const steerMax = C.maxSteer * (1 - 0.55 * Math.min(1, Math.abs(this.speed) / C.maxSpeed));
    this.steer += (input.steer * steerMax - this.steer) * Math.min(1, dt * C.steerRate);
    this.yaw -= (this.speed / C.wheelbase) * Math.tan(this.steer) * dt;
    const step = this.forward.multiplyScalar(this.speed * dt);
    const nx = this.pos.x + step.x, nz = this.pos.z + step.z;
    let hit = false;
    const half = this.length * 0.32, r = Math.max(1.05, this.width * 0.5);
    const f = this.forward;
    const probe = (x: number, z: number) => obstacles.blocked(x + f.x * half * Math.sign(this.speed || 1), z + f.z * half * Math.sign(this.speed || 1), this.pos.y, r);
    const slopeOk = () => {
      const h0 = ground.height(this.pos.x, this.pos.z, this.pos.y + 2), h1 = ground.height(nx, nz, this.pos.y + 2);
      return Math.atan2(h1 - h0, Math.hypot(step.x, step.z) || 1e-6) < (C.maxSlopeDeg * Math.PI) / 180 || this.speed < 0;
    };
    if (Math.abs(this.speed) > 1e-3 && !probe(nx, nz) && slopeOk()) { this.pos.x = nx; this.pos.z = nz; this.odometer += Math.abs(this.speed * dt); }
    else if (Math.abs(this.speed) > 0.3) { hit = Math.abs(this.speed) > 2; if (hit) this.condition = Math.max(0, this.condition - Math.abs(this.speed) * 0.8); this.speed *= -0.25; }
    const drain = (Math.abs(thr) * C.drainFull + C.drainIdle + (this.headlights ? 0.004 : 0)) * dt;
    this.charging = !!charger && charger(this.pos) && Math.abs(this.speed) < 0.2;
    if (this.powered) this.battery = Math.max(0, Math.min(100, this.battery - drain + (this.charging ? C.chargeRate * dt : 0)));
    this.settle(ground, dt, false);
    return hit;
  }

  /** Height/pitch/roll from four wheel probes + visual suspension, spin and steering. */
  private settle(ground: RoverGround, dt: number, snap: boolean): void {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const hs = this.wheels.map((w) => {
      const x = this.pos.x + w.local.x * cy + w.local.z * sy, z = this.pos.z - w.local.x * sy + w.local.z * cy;
      return ground.height(x, z, this.pos.y + 2);
    });
    const front = (hs[0] + hs[1]) / 2, rear = (hs[2] + hs[3]) / 2, left = (hs[0] + hs[2]) / 2, right = (hs[1] + hs[3]) / 2;
    const wb = Math.abs(this.wheels[0].local.z - this.wheels[2].local.z) || 2.9;
    const track = Math.abs(this.wheels[0].local.x - this.wheels[1].local.x) || 1.7;
    const tp = Math.atan2(front - rear, wb), tr = Math.atan2(left - right, track) * Math.sign(this.wheels[1].local.x - this.wheels[0].local.x || 1);
    const k = snap ? 1 : Math.min(1, dt * 8);
    this.pitch += (tp - this.pitch) * k; this.roll += (tr - this.roll) * k;
    const avg = hs.reduce((a, b) => a + b, 0) / 4;
    this.pos.y += (avg - this.pos.y) * (snap ? 1 : Math.min(1, dt * 10));
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, this.yaw, 0);
    this.body.rotation.set(-this.pitch, 0, this.roll, 'YXZ');
    const plane = (w: WheelRig) => avg + (w.front ? 1 : -1) * (front - rear) / 2 + (w.local.x < 0 ? 1 : -1) * (left - right) / 2 * Math.sign(this.wheels[1].local.x - this.wheels[0].local.x || 1);
    this.wheels.forEach((w, i) => {
      w.travel = Math.max(-MEV_CFG.suspension, Math.min(MEV_CFG.suspension, hs[i] - plane(w)));
      w.steer.position.y = w.local.y + w.travel;
      w.steer.rotation.y = w.front ? -this.steer : 0;
      w.spin.rotation.x += (this.speed * dt) / (w.radius || 0.4);
    });
    if (this.steeringWheel) this.steeringWheel.rotation.z = this.steer * 2.4;
  }

  update(dt: number): void {
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, dt * 4);
    if (this.door) this.door.rotation.y = this.doorSign * this.doorOpen * 1.15;
    this.headlamp.intensity = this.headlights && this.powered ? 90 : 0;
    for (const m of this.lightMats) { m.emissive.set(0xfff0d8); m.emissiveIntensity = this.headlights && this.powered ? 3 : this.powered ? 0.3 : 0; }
  }

  /** Chase (collision-aware, suspension-coupled) or cockpit camera. */
  applyCamera(cam: PerspectiveCamera, mode: 'chase' | 'cockpit', look: { yaw: number; pitch: number }, zoom: number, dt: number, ground: RoverGround, blocked?: (x: number, y: number, z: number) => boolean): void {
    if (mode === 'cockpit') {
      const eye = this.toWorld(this.seat);
      cam.position.copy(eye);
      const dir = new Vector3(Math.sin(this.yaw + look.yaw), Math.sin(look.pitch - this.pitch * 0.6), Math.cos(this.yaw + look.yaw));
      cam.lookAt(eye.clone().add(dir));
      return;
    }
    const dist = 8.5 * zoom, height = 2.6 + 1.2 * zoom;
    const a = this.yaw + look.yaw + Math.PI;
    const target = this.pos.clone().add(new Vector3(0, 1.4, 0));
    let d = dist;
    const want = new Vector3();
    for (; d > 2.5; d -= 0.5) {
      want.set(target.x + Math.sin(a) * d, target.y + height * (d / dist) + look.pitch * 3, target.z + Math.cos(a) * d);
      if (!blocked || !blocked(want.x, want.y, want.z)) break;
    }
    want.y = Math.max(want.y, ground.height(want.x, want.z, want.y + 3) + 0.8);
    cam.position.lerp(want, Math.min(1, dt * 5));
    const bob = new Vector3(0, Math.sin(this.odometer * 2.1) * 0.03 * Math.min(1, Math.abs(this.speed) / 4), 0);
    cam.lookAt(target.add(bob));
  }
}
