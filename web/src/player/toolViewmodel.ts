import {
  DirectionalLight, Group, HemisphereLight, PerspectiveCamera, PointLight, Quaternion, Scene, Vector3, type Bone, type Object3D, type SkinnedMesh, type Texture, type WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { PALETTE } from '../core/config';
import { aim, turn } from './astronautMotion';
import { ARM_BONES, partMeshes } from './bodyParts';
import { straightenDrill, type DrillRig } from './drillModel';

/**
 * First-person tool presentation: the user's drill held in both of the astronaut's own hands.
 *
 * - Drill: drill.glb (opt/handdrill.glb), straightened from its own geometry (`straightenDrill`), bit forward, the
 *   twin grips left/right; the metal bit is a separate node and really spins while drilling.
 * - Arms: cut from the astronaut model (same meshes, materials and rig as the third-person body). Each arm is posed
 *   once with two-bone IK so the wrist lands on its grip, the palm faces the handle and the fingers wrap around it.
 *
 * Rendered in its own pass (own scene, camera and lights, depth cleared) like most first-person games, so it never
 * clips into walls and is not blown out by the helmet lamp. Its lights follow the world: sun direction, daylight
 * fading in the cave, and a soft fill when the suit lamp is on.
 * Procedural animation: walk sway, raise/lower on (de)select, bit spin-up/-down, torque judder + push-in while drilling.
 */
const DRILL_LENGTH = 0.62;
/** Where the drill's rear end sits relative to the eye (m): right-of-centre, low, in front. */
const HOLD = new Vector3(0.13, -0.165, -0.5);

export class ToolViewmodel {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(60, 1, 0.02, 10);
  /** Follows the player's eye; the tool, arms and lights hang off it. The camera normally sits exactly on it. */
  private readonly rig = new Group();
  readonly root = new Group();
  /** Diagnostics: view the held tool from outside (camera position and look-at point in eye space). */
  debugView: { pos: Vector3; look: Vector3 } | null = null;
  private drill: DrillRig | null = null;
  private readonly drillHolder = new Group();
  private armsModel: Object3D | null = null;
  private posed = false;
  private readonly handSpring = new Vector3();
  private readonly handSpringVelocity = new Vector3();
  private shown = 0;
  private spinRate = 0;
  private readonly sun = new DirectionalLight(PALETTE.sun, 2.4);
  private readonly sky = new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.9);
  private readonly lamp = new PointLight(0xfff0dc, 0, 2, 2);
  visible = false;
  drilling = false;

  constructor() {
    this.scene.add(this.rig, this.sky);
    this.rig.add(this.camera, this.root, this.sun, this.sun.target, this.lamp);
    this.lamp.position.set(0.1, 0.05, 0.1);
    this.drillHolder.position.copy(HOLD);
    this.drillHolder.rotation.set(0.06, 0.24, 0); // bit a touch down and towards the centre of the view
    this.root.add(this.drillHolder);
    this.root.visible = false;
  }

  /** Soft reflections for the metal parts (the same studio environment the vehicles use). */
  setEnvironment(env: Texture): void { this.scene.environment = env; this.scene.environmentIntensity = 0.45; }

  async load(url: string): Promise<void> {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    gltf.scene.traverse((o) => { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; });
    this.drill = straightenDrill(gltf.scene, DRILL_LENGTH);
    this.drillHolder.add(this.drill.root);
    this.pose();
  }

  /** Gives the viewmodel the astronaut's arms. `model` = the rigged astronaut (already scaled to body height). */
  setArms(model: Object3D): void {
    const copy = cloneSkinned(model);
    const originals: SkinnedMesh[] = [];
    copy.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh) originals.push(o as SkinnedMesh); });
    const arms = partMeshes(copy, (n) => ARM_BONES.test(n), 3); // whole triangles only: no straps stretched back to the torso
    for (const m of originals) m.removeFromParent();
    for (const m of arms) { m.castShadow = false; m.receiveShadow = false; m.visible = true; }
    copy.visible = true;
    copy.rotation.y = Math.PI; // the astronaut faces +Z; the view looks down −Z
    this.armsModel = copy;
    this.root.add(copy);
    this.pose();
  }

  /** Poses both arms on the drill's grips (once, when the drill and the arms are both loaded). */
  private pose(): void {
    const drill = this.drill, arms = this.armsModel;
    if (!drill || !arms || this.posed) return;
    this.posed = true;
    // Solve in a neutral frame: camera and sway group at identity (they are rigid above everything posed here).
    const camP = this.rig.position.clone(), camQ = this.rig.quaternion.clone();
    this.rig.position.set(0, 0, 0); this.rig.quaternion.identity();
    this.root.position.set(0, 0, 0); this.root.rotation.set(0, 0, 0);
    this.scene.updateMatrixWorld(true);
    const bone = (n: string) => arms.getObjectByName(n) as Bone | undefined;
    const wp = (o: Object3D) => { o.updateWorldMatrix(true, false); return o.getWorldPosition(new Vector3()); };
    const grips = { Right: drill.root.localToWorld(drill.gripRight.clone()), Left: drill.root.localToWorld(drill.gripLeft.clone()) };
    // Put the shoulders where they give a relaxed elbow bend: above and behind the grips.
    const sR = bone('RightArm_016'), sL = bone('LeftArm_035');
    if (!sR || !sL) return;
    const shoulders = wp(sR).add(wp(sL)).multiplyScalar(0.5);
    const want = grips.Right.clone().add(grips.Left).multiplyScalar(0.5).add(new Vector3(0.02, 0.1, 0.44));
    arms.position.add(want.sub(shoulders));
    this.scene.updateMatrixWorld(true);

    const holdQ = this.drillHolder.getWorldQuaternion(new Quaternion());
    const ids: Record<'Right' | 'Left', Record<string, string>> = {
      Right: { arm: 'RightArm_016', fore: 'RightForeArm_017', hand: 'RightHand_018', f: 'RightHand', n: '019,020,021,022,023,024,025,026,027,028,029,030,031,032,033' },
      Left: { arm: 'LeftArm_035', fore: 'LeftForeArm_036', hand: 'LeftHand_037', f: 'LeftHand', n: '038,039,040,041,042,043,044,045,046,047,048,049,050,051,052' },
    };
    for (const side of ['Right', 'Left'] as const) {
      const id = ids[side], num = id.n.split(',');
      const armB = bone(id.arm), fore = bone(id.fore), hand = bone(id.hand);
      const finger = (name: string, k: number) => bone(`${id.f}${name}${k + 1}_${num[['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'].indexOf(name) * 3 + k]}`);
      const idx = finger('Index', 0), mid = finger('Middle', 0), pky = finger('Pinky', 0);
      if (!armB || !fore || !hand || !idx || !mid || !pky) continue;
      const sx = side === 'Right' ? 1 : -1;
      // Palm side from the hand's own anatomy (wrist→index × wrist→pinky points out of a right palm, into a left one).
      const palm = () => { const w = wp(hand); return wp(idx).sub(w).cross(wp(pky).sub(w)).normalize().multiplyScalar(sx); };
      // Grip: hand points up and slightly outwards from below, palm facing the handle (inwards).
      const handDir = new Vector3(sx * 0.22, 1, -0.12).normalize().applyQuaternion(holdQ);
      const palmDir = new Vector3(-sx, 0.1, 0).normalize().applyQuaternion(holdQ);
      const handLen = wp(mid).distanceTo(wp(hand));
      const wrist = grips[side].clone().addScaledVector(handDir, -handLen * 0.98).addScaledVector(palmDir, -0.034);
      // Two-bone IK: shoulder → elbow → wrist, elbow dropping down and out.
      const S = wp(armB), l1 = wp(fore).distanceTo(S), l2 = wp(hand).distanceTo(wp(fore));
      const to = wrist.clone().sub(S);
      const d = Math.min(Math.max(to.length(), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.005);
      to.normalize();
      const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const pole = new Vector3(sx * 0.75, -1, 0.25);
      pole.addScaledVector(to, -pole.dot(to)).normalize();
      const elbow = S.clone().addScaledVector(to, a).addScaledVector(pole, h);
      aim(armB, fore, elbow.clone().sub(S), 1);
      aim(fore, hand, wrist.clone().sub(wp(fore)), 1);
      // Hand: point along handDir, then roll about it until the palm faces the handle.
      aim(hand, mid, handDir, 1);
      const f = wp(mid).sub(wp(hand)).normalize();
      const flat = (v: Vector3) => v.clone().addScaledVector(f, -v.dot(f)).normalize();
      const p0 = flat(palm()), p1 = flat(palmDir);
      turn(hand, f, Math.atan2(new Vector3().crossVectors(p0, p1).dot(f), p0.dot(p1)));
      // Fingers wrap around the handle: curl each joint about the knuckle line, towards the palm.
      const n = palm();
      const knuckles = wp(idx).sub(wp(pky)).normalize();
      const curlAxis = knuckles.clone().multiplyScalar(new Vector3().crossVectors(knuckles, f).dot(n) > 0 ? 1 : -1);
      for (const name of ['Index', 'Middle', 'Ring', 'Pinky']) {
        [1.05, 1.3, 0.8].forEach((angle, k) => { const b = finger(name, k); if (b) turn(b, curlAxis, angle); });
      }
      // Thumb closes over the fingers from the other side of the handle.
      const t1 = finger('Thumb', 0), t2 = finger('Thumb', 1), t3 = finger('Thumb', 2);
      if (t1 && t2) {
        const tDir = wp(t2).sub(wp(t1)).normalize();
        turn(t1, f, (new Vector3().crossVectors(f, tDir).dot(n) > 0 ? 1 : -1) * 0.75);
        turn(t2, curlAxis, 0.45);
        if (t3) turn(t3, curlAxis, 0.5);
      }
    }
    this.rig.position.copy(camP); this.rig.quaternion.copy(camQ);
    this.scene.updateMatrixWorld(true);
  }

  /**
   * Draws the tool over the already-rendered world. `sunDir` is the world direction towards the sun, `daylight`
   * 0 (deep cave) … 1 (surface), `lampOn` the helmet lamp.
   */
  render(renderer: WebGLRenderer, world: PerspectiveCamera, sunDir: Vector3, daylight: number, lampOn: boolean): void {
    if (!this.drill || !this.root.visible) return;
    this.rig.position.copy(world.position);
    this.rig.quaternion.copy(world.quaternion);
    if (this.debugView) { this.camera.position.copy(this.debugView.pos); this.camera.lookAt(this.rig.localToWorld(this.debugView.look.clone())); }
    else { this.camera.position.set(0, 0, 0); this.camera.quaternion.identity(); }
    this.camera.aspect = world.aspect;
    this.camera.fov = world.fov;
    this.camera.updateProjectionMatrix();
    this.rig.updateMatrixWorld(true);
    if (this.debugView) { this.camera.lookAt(this.rig.localToWorld(this.debugView.look.clone())); this.camera.updateMatrixWorld(true); }
    // Sun: place the light along the world sun direction relative to the camera (directional, so only direction matters).
    const local = sunDir.clone().applyQuaternion(_q.copy(this.rig.quaternion).invert());
    this.sun.position.copy(local).multiplyScalar(5);
    this.sun.target.position.set(0, 0, 0);
    this.sun.intensity = 2.4 * daylight;
    this.sky.intensity = 0.25 + 0.85 * daylight;
    this.lamp.intensity = lampOn ? 0.6 : 0;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  /** Called every render frame. `moving` adds walk sway. */
  update(dt: number, t: number, moving: boolean): void {
    if (!this.drill) return;
    const target = this.visible ? 1 : 0;
    this.shown += (target - this.shown) * Math.min(1, dt * 8);
    this.root.visible = this.shown > 0.02;
    // The bit spins up quickly and coasts down.
    this.spinRate += ((this.drilling ? 46 : 0) - this.spinRate) * Math.min(1, dt * (this.drilling ? 9 : 2.2));
    this.drill.bit.rotation.z -= this.spinRate * dt;
    if (!this.root.visible) return;
    const sway = moving ? 1 : 0.25;
    const lower = (1 - this.shown) * 0.42;
    // Springy lag behind the walk cycle: the tool has weight.
    const targetX = Math.sin(t * 6.5) * 0.011 * sway;
    const targetY = Math.abs(Math.cos(t * 6.5)) * 0.012 * sway;
    this.handSpringVelocity.x += (targetX - this.handSpring.x) * 52 * dt - this.handSpringVelocity.x * 13 * dt;
    this.handSpringVelocity.y += (targetY - this.handSpring.y) * 52 * dt - this.handSpringVelocity.y * 13 * dt;
    this.handSpring.addScaledVector(this.handSpringVelocity, dt);
    this.root.position.set(this.handSpring.x, -lower + this.handSpring.y, 0);
    this.root.rotation.set(this.handSpring.y * 0.9, 0, -this.handSpring.x * 1.6);
    if (this.drilling) {
      this.root.position.x += Math.sin(t * 91) * 0.0022;
      this.root.position.y += Math.cos(t * 113) * 0.0022;
      this.root.position.z -= 0.05;
      this.root.rotation.z += Math.sin(t * 61) * 0.006;
    }
  }
}

const _q = new Quaternion();
