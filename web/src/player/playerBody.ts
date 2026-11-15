import { MathUtils, MeshBasicMaterial, Vector3, type Material, type Object3D, type PerspectiveCamera, type SkinnedMesh } from 'three';
import { LEG_BONES, partMeshes } from './bodyParts';
import { Actor } from '../cinematics/actor';
import { AstronautMotion } from './astronautMotion';

/**
 * The astronaut's body in the world (directive System A, "astronaut integration"): the user's rigged astronaut
 * (opt/astronaut.glb, Mixamo Idle / Walk / Running) driven by the real player controller.
 *
 * - First person (default): the astronaut's own legs and boots (cut from the same model, same walk/run animation)
 *   are visible when the player looks down; the rest of the body only casts its shadow.
 * - Third person (V): body visible; over-the-shoulder camera that orbits with the mouse and is pulled in front of
 *   walls/terrain so it never clips. Animation follows measured ground speed: idle → walk → run, with playback rate
 *   matched to stride so feet do not slide.
 *
 * Reuses the cutscene `Actor` (separate instance) without changing its API.
 */
export interface CameraBlocker { blocked(x: number, y: number, z: number): boolean; groundAt(x: number, z: number, yRef: number): number }

export class PlayerBody {
  thirdPerson = false;
  private facing = 0;
  private dist = 3.4;
  private readonly camPos = new Vector3();
  private initialised = false;
  /** Set when walls force the camera within ~1.2 m of the head: the body is hidden rather than filling the view. */
  private tooClose = false;

  /** Procedural layer: relaxed arms, breathing, weight shift, head look, randomized idle behaviours. */
  readonly motion: AstronautMotion;
  /** Set by the game while the player is interacting / reading (idle behaviours wait). */
  busy = false;

  /** Full-body meshes and the legs-only copies shown in first person. */
  private readonly full: SkinnedMesh[] = [];
  private readonly legs: SkinnedMesh[];
  private readonly fullMaterials = new Map<SkinnedMesh, Material | Material[]>();
  /** Draws nothing but still casts the body's shadow (first person). */
  private readonly shadowOnly = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  private fpShown: boolean | null = null;

  private constructor(readonly actor: Actor) {
    this.motion = new AstronautMotion(actor.root);
    actor.root.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh) { this.full.push(o as SkinnedMesh); this.fullMaterials.set(o as SkinnedMesh, (o as SkinnedMesh).material); } });
    this.legs = partMeshes(actor.root, (n) => LEG_BONES.test(n));
    for (const m of this.legs) { m.visible = false; m.castShadow = false; m.receiveShadow = true; }
  }

  /** The rigged model (scaled to the astronaut's height) — source for the first-person arms. */
  get model(): Object3D { return this.actor.root.children[0]; }

  private setFirstPerson(fp: boolean): void {
    if (this.fpShown === fp) return;
    this.fpShown = fp;
    for (const m of this.full) m.material = fp ? this.shadowOnly : this.fullMaterials.get(m)!;
    for (const m of this.legs) m.visible = fp;
  }

  static async load(url: string): Promise<PlayerBody> {
    return new PlayerBody(await Actor.load(url, 1.85));
  }

  get root() { return this.actor.root; }

  /**
   * Per render frame. `pos` = feet, `vel` = controller velocity, `yaw` = view yaw (camera forward = (−sin, −cos)),
   * `visible` = whether gameplay currently shows the astronaut at all.
   */
  update(dt: number, pos: Vector3, vel: Vector3, yaw: number, grounded: boolean, visible: boolean, pitch = 0, firstPerson = false): void {
    const fp = firstPerson && !this.thirdPerson;
    this.actor.root.visible = fp || (visible && this.thirdPerson && !this.tooClose);
    if (!this.actor.root.visible) return;
    this.setFirstPerson(fp);
    const speed = Math.hypot(vel.x, vel.z);
    if (fp) {
      // Legs stay under the view: face where the player looks, and slide back a little as the head tilts down so
      // the boots and knees are in view instead of the inside of the suit.
      const viewFacing = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
      this.facing = viewFacing; this.initialised = true;
      const back = 0.24 + 0.08 * MathUtils.clamp(-pitch / 1.4, 0, 1);
      this.actor.root.position.set(pos.x + Math.sin(yaw) * back, pos.y, pos.z + Math.cos(yaw) * back);
      this.actor.root.rotation.y = this.facing;
      // Walking backwards plays the stride in reverse.
      const dir = vel.x * -Math.sin(yaw) + vel.z * -Math.cos(yaw) < -0.2 ? -1 : 1;
      if (!grounded) this.actor.play('idle', 0.25, 0.4);
      else if (speed < 0.3) this.actor.play('idle', 0.35, 1);
      else if (speed < 4.2) this.actor.play('walk', 0.3, dir * MathUtils.clamp(speed / 1.6, 0.6, 1.8));
      else this.actor.play('run', 0.25, dir * MathUtils.clamp(speed / 5, 0.8, 1.4));
      this.actor.update(dt);
      return;
    }
    // Face the direction of travel when moving, otherwise ease towards the view direction.
    const target = speed > 0.3 ? Math.atan2(vel.x, vel.z) : Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
    if (!this.initialised) { this.facing = target; this.initialised = true; }
    let d = target - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * Math.min(1, dt * (speed > 0.3 ? 10 : 3));
    this.actor.root.position.copy(pos);
    this.actor.root.rotation.y = this.facing;
    // Clip choice and stride-matched playback (Mixamo walk ≈ 1.4 m/s, run ≈ 4.5 m/s at timeScale 1; Mars gravity
    // gives a slightly longer, floatier gait, so rates are capped).
    if (!grounded) this.actor.play('idle', 0.25, 0.4);
    else if (speed < 0.3) this.actor.play('idle', 0.35, 1);
    else if (speed < 4.2) this.actor.play('walk', 0.3, MathUtils.clamp(speed / 1.6, 0.6, 1.8));
    else this.actor.play('run', 0.25, MathUtils.clamp(speed / 5, 0.8, 1.4));
    this.actor.update(dt);
    const viewFacing = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
    this.motion.update(dt, this.facing, speed, viewFacing - this.facing, this.busy || !grounded);
  }

  /** Over-the-shoulder camera; never passes through walls or terrain. `zoom` from the mouse wheel (1.5…6 m). */
  applyCamera(cam: PerspectiveCamera, pos: Vector3, yaw: number, pitch: number, dt: number, blocker: CameraBlocker): void {
    const head = new Vector3(pos.x, pos.y + 1.6, pos.z);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw); // right of view
    const back = Math.cos(pitch);
    const want = new Vector3(
      head.x - fx * this.dist * back + rx * 0.55,
      head.y - Math.sin(pitch) * this.dist + 0.25,
      head.z - fz * this.dist * back + rz * 0.55,
    );
    // March from the head to the desired point; stop just before the first wall or ground hit.
    const steps = 24;
    const p = new Vector3();
    let free = 1;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      p.lerpVectors(head, want, t);
      if (blocker.blocked(p.x, p.y, p.z) || p.y < blocker.groundAt(p.x, p.z, p.y + 0.5) + 0.25) { free = Math.max(0.12, (i - 1.5) / steps); break; }
    }
    p.lerpVectors(head, want, free);
    const k = 1 - Math.exp(-14 * dt);
    if (this.camPos.distanceTo(p) > 6) this.camPos.copy(p); else this.camPos.lerp(p, k);
    cam.position.copy(this.camPos);
    this.tooClose = this.camPos.distanceTo(head) < 1.2;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(pitch, yaw, 0);
  }

  zoom(delta: number): void { this.dist = MathUtils.clamp(this.dist * (delta > 0 ? 1.12 : 1 / 1.12), 1.5, 6); }

  /** Snap the smoothed camera next frame (after teleports / mode changes). */
  resetCamera(): void { this.camPos.set(1e9, 1e9, 1e9); }
}
