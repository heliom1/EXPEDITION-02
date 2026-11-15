import { MathUtils, Quaternion, Vector3, type Bone, type Object3D } from 'three';

/**
 * Procedural motion layer for the astronaut (directive Part 4), applied AFTER the clip mixer each frame.
 *
 * Limbs are posed with aim-IK: each segment (upper arm, forearm) is turned so it points along a target direction
 * given in the astronaut's own frame (F = forward, R = right, U = up); the rotation is solved in world space and
 * converted to the bone's local space, so it works regardless of the rig's local axis conventions. Head look and
 * wrist twists are world-axis rotations for the same reason. Every pose is weight-blended (slerp) with the clip.
 *
 *  - Relaxed arms at rest (no more arms locked in front of the body), softly bent elbows.
 *  - Breathing, occasional weight shifts, head following the view direction within neck limits.
 *  - Randomised idle behaviours with cooldowns after a few seconds standing still, eased in/out:
 *    check wrist computer, check palm, adjust glove, look around, glance at suit status, roll a wrist.
 *  - Behaviours yield immediately to movement, interaction and cutscenes.
 */
type Dir = [number, number, number]; // weights on [F, R, U]
interface ArmPose { arm: Dir; fore: Dir; twist?: number }
interface Behaviour { dur: number; cooldown: number; left?: ArmPose; right?: ArmPose; headPitch?: number; headYaw?: number; sweep?: number; chest?: number }

const RELAX_L: ArmPose = { arm: [-0.05, -0.17, -1], fore: [0.38, -0.04, -1] };
const RELAX_R: ArmPose = { arm: [-0.05, 0.17, -1], fore: [0.38, 0.04, -1] };

export const IDLES: Record<string, Behaviour> = {
  // Raise the left forearm across the chest, palm up, and look down at the wrist computer.
  checkWrist: { dur: 3.6, cooldown: 22, left: { arm: [0.45, -0.25, -0.85], fore: [0.35, 0.9, 0.3], twist: 1.1 }, headPitch: 0.5, headYaw: -0.35 },
  // Bring the right hand up in front, palm up, and study it.
  checkPalm: { dur: 3.0, cooldown: 26, right: { arm: [0.55, 0.2, -0.7], fore: [0.85, -0.3, 0.45], twist: -1.2 }, headPitch: 0.45, headYaw: 0.25 },
  // Left wrist across the body, right hand tugging at the left glove cuff.
  adjustGlove: { dur: 2.8, cooldown: 30, left: { arm: [0.4, -0.2, -0.9], fore: [0.45, 0.85, 0.1] }, right: { arm: [0.55, 0.05, -0.8], fore: [0.55, -0.8, 0.15], twist: 0.6 }, headPitch: 0.4 },
  // Slow look left and right across the landscape.
  lookAround: { dur: 4.5, cooldown: 14, sweep: 0.85 },
  // Chin down to the chest display.
  suitStatus: { dur: 2.4, cooldown: 24, headPitch: 0.6, chest: 0.06 },
  // Small wrist roll on the right hand.
  wristRoll: { dur: 2.0, cooldown: 12, right: { arm: RELAX_R.arm, fore: [0.6, 0.05, -0.8], twist: 0.8 } },
};

const ease = (u: number) => u * u * (3 - 2 * u);
const _q = new Quaternion(), _q2 = new Quaternion(), _pw = new Quaternion(), _a = new Vector3(), _b = new Vector3(), _c = new Vector3();

/** Rotates `bone` (in world space) so the bone→child segment points along `dir`, blended by `w`. */
function aim(bone: Bone, child: Object3D, dir: Vector3, w: number): void {
  if (w <= 0) return;
  bone.updateWorldMatrix(true, false);
  child.updateWorldMatrix(false, false);
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  const cur = _b.sub(_a).normalize();
  const delta = _q.setFromUnitVectors(cur, _c.copy(dir).normalize());
  applyWorldDelta(bone, delta, w);
}

/** Rotates `bone` about a world axis by `angle` (radians), blended by `w`. */
function turn(bone: Bone, axis: Vector3, angle: number, w = 1): void {
  if (angle === 0 || w <= 0) return;
  bone.updateWorldMatrix(true, false);
  applyWorldDelta(bone, _q.setFromAxisAngle(_c.copy(axis).normalize(), angle), w);
}

function applyWorldDelta(bone: Bone, deltaWorld: Quaternion, w: number): void {
  // local' = parentWorld⁻¹ · delta · parentWorld · local
  const parent = bone.parent!;
  parent.getWorldQuaternion(_pw);
  const d = _q2.copy(_pw).invert().multiply(deltaWorld).multiply(_pw);
  if (w < 1) d.slerp(_q.identity(), 1 - w);
  bone.quaternion.premultiply(d);
}

export class AstronautMotion {
  private readonly b: Record<string, Bone | undefined> = {};
  private t = 0;
  private stillFor = 0;
  private relaxW = 0;
  private action: { name: string; t: number } | null = null;
  private readonly cool = new Map<string, number>();
  private nextIdleAt = 4 + Math.random() * 3;
  private shift = 0;
  private shiftTarget = 0;
  private nextShiftAt = 3;
  private headYaw = 0;
  lastAction: string | null = null;

  constructor(root: Object3D) {
    const names: Record<string, string> = {
      hips: 'Hips_01', spine: 'Spine1_012', chest: 'Spine2_013', neck: 'Neck_053', head: 'Head_054',
      lArm: 'LeftArm_035', lFore: 'LeftForeArm_036', lHand: 'LeftHand_037', lMid: 'LeftHandMiddle1_041',
      rArm: 'RightArm_016', rFore: 'RightForeArm_017', rHand: 'RightHand_018', rMid: 'RightHandMiddle1_022',
    };
    for (const [k, n] of Object.entries(names)) this.b[k] = root.getObjectByName(n) as Bone | undefined;
  }

  get ready(): boolean { return !!(this.b.lArm && this.b.lFore && this.b.lHand && this.b.rArm && this.b.rFore && this.b.rHand && this.b.head); }
  get current(): string | null { return this.action?.name ?? null; }

  force(name: string): boolean {
    if (!IDLES[name]) return false;
    this.action = { name, t: 0 };
    this.lastAction = name;
    return true;
  }

  /** After mixer.update. `facing` = body yaw; `viewYawRel` = view yaw relative to the body; `busy` suppresses idles. */
  update(dt: number, facing: number, speed: number, viewYawRel: number, busy: boolean): void {
    if (!this.ready) return;
    this.t += dt;
    const moving = speed > 0.3;
    this.stillFor = moving || busy ? 0 : this.stillFor + dt;
    this.relaxW = MathUtils.damp(this.relaxW, moving ? 0 : 1, 3.5, dt);

    // Behaviour scheduling (random, with cooldowns; cut short by movement or interaction).
    if ((moving || busy) && this.action) { const d = IDLES[this.action.name].dur; if (this.action.t < d - 0.5) this.action.t = d - 0.5; }
    if (!this.action && this.stillFor > this.nextIdleAt) {
      const opts = Object.keys(IDLES).filter((n) => (this.cool.get(n) ?? 0) <= this.t);
      if (opts.length) { const n = opts[Math.floor(Math.random() * opts.length)]; this.action = { name: n, t: 0 }; this.lastAction = n; this.cool.set(n, this.t + IDLES[n].cooldown); }
      this.nextIdleAt = this.stillFor + 5 + Math.random() * 7;
    }
    let aw = 0;
    const act = this.action ? IDLES[this.action.name] : null;
    if (this.action && act) {
      this.action.t += dt;
      const u = this.action.t;
      aw = u < 0.7 ? ease(u / 0.7) : u > act.dur - 0.7 ? ease(Math.max(0, (act.dur - u) / 0.7)) : 1;
      if (u >= act.dur) this.action = null;
    }

    // Body frame.
    const F = new Vector3(Math.sin(facing), 0, Math.cos(facing));
    const U = new Vector3(0, 1, 0);
    const R = new Vector3().crossVectors(F, U); // character's right
    const dir = (d: Dir) => new Vector3().addScaledVector(F, d[0]).addScaledVector(R, d[1]).addScaledVector(U, d[2]).normalize();
    const blendDir = (a: Dir, b: Dir | undefined, w: number) => (b ? dir([a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w]) : dir(a));

    // Weight shift + breathing on the torso.
    if (this.t > this.nextShiftAt) { this.shiftTarget = (Math.random() * 2 - 1) * 0.05; this.nextShiftAt = this.t + 4 + Math.random() * 5; }
    this.shift = MathUtils.damp(this.shift, moving ? 0 : this.shiftTarget, 1.5, dt);
    const breath = Math.sin(this.t * 2 * Math.PI * 0.23);
    if (this.b.hips) turn(this.b.hips, F, this.shift);
    if (this.b.spine) turn(this.b.spine, F, -this.shift * 0.8);
    if (this.b.chest) turn(this.b.chest, R, breath * 0.012 + (act?.chest ?? 0) * aw);

    // Arms: relaxed rest pose, morphing into the behaviour pose. While moving, the walk clip owns the arms.
    const armW = Math.max(this.relaxW, aw);
    const side = (arm: Bone, fore: Bone, hand: Bone, rest: ArmPose, beh: ArmPose | undefined) => {
      const w = beh ? aw : 0;
      aim(arm, fore, blendDir(rest.arm, beh?.arm, w), armW);
      aim(fore, hand, blendDir(rest.fore, beh?.fore, w), armW);
      if (beh?.twist) { fore.updateWorldMatrix(true, false); hand.updateWorldMatrix(false, false); fore.getWorldPosition(_a); hand.getWorldPosition(_b); turn(hand, _b.sub(_a), beh.twist * w); }
    };
    side(this.b.lArm!, this.b.lFore!, this.b.lHand!, RELAX_L, act?.left);
    side(this.b.rArm!, this.b.rFore!, this.b.rHand!, RELAX_R, act?.right);

    // Head: follow the view (neck limits), look-around sweep, or look down at what the hands are doing.
    let yawT = MathUtils.clamp(Math.atan2(Math.sin(viewYawRel), Math.cos(viewYawRel)), -0.95, 0.95) * (moving ? 0.3 : 0.55);
    if (act?.sweep && this.action) yawT = Math.sin((this.action.t / act.dur) * Math.PI * 2) * act.sweep;
    else if (act?.headYaw) yawT = yawT * (1 - aw) + act.headYaw * aw;
    this.headYaw = MathUtils.damp(this.headYaw, yawT, 3, dt);
    const pitch = (act?.headPitch ?? 0) * aw;
    if (this.b.neck) turn(this.b.neck, U, this.headYaw * 0.4);
    turn(this.b.head!, U, this.headYaw * 0.6);
    if (pitch) { const down = new Vector3().crossVectors(F, U).normalize(); turn(this.b.head!, down, -pitch * 0.6); if (this.b.neck) turn(this.b.neck, down, -pitch * 0.4); }
  }
}
