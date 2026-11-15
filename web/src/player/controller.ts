import { PerspectiveCamera, Vector3 } from 'three';
import { GRAVITY } from '../core/config';
import type { Input } from '../core/input';
import type { WorldData } from '../world/worldData';
import type { ColliderSet } from '../world/colliders';
import type { RockCollider, RockField } from '../world/rocks';
import type { Ground } from '../cave/ground';

const EYE = 1.65;
const RADIUS = 0.38;
const WALK = 3.0;
const SPRINT = 5.4;
const JUMP = 2.9;
const MAX_SLOPE = Math.cos((40 * Math.PI) / 180); // normal.y below this is too steep to climb
const STEP_SNAP = 0.45;

/**
 * First-person controller on the heightfield. The camera is driven directly from this state and is
 * independent of any future astronaut visual rig. Collision: terrain height (bilinear), a slope
 * limit, structure cylinders and nearby large rocks. Simulated at a fixed timestep.
 */
export class PlayerController {
  readonly pos = new Vector3();
  readonly prevPos = new Vector3();
  readonly vel = new Vector3();
  yaw = 0;
  pitch = 0;
  grounded = false;
  sprinting = false;
  moving = false;
  canSprint = true;
  sensitivity = 1;
  invertY = false;
  private bob = 0;
  private landingPitch = 0;
  private landingPitchVelocity = 0;
  private landingRoll = 0;
  private landingRollVelocity = 0;
  private impactOffset = 0;
  private impactOffsetVelocity = 0;
  private rocks: RockCollider[] = [];
  /** Metres fallen in the last landing (for feedback / damage). */
  lastLandingSpeed = 0;
  /** True while in cave air under the hillside. */
  inCave = false;
  /** Distance walked (for footstep audio). */
  stride = 0;

  constructor(private readonly world: WorldData, private readonly colliders: ColliderSet, private readonly rockField: RockField, private readonly ground: Ground) {}

  teleport(x: number, z: number, yaw: number, yHint?: number): void {
    this.pos.set(x, yHint === undefined ? this.world.heightAt(x, z) : this.ground.at(x, z, yHint).h, z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.landingPitch = this.landingPitchVelocity = 0;
    this.landingRoll = this.landingRollVelocity = 0;
    this.impactOffset = this.impactOffsetVelocity = 0;
  }

  look(input: Input): void {
    const [dx, dy] = input.takeMouse();
    const k = 0.0022 * this.sensitivity;
    this.yaw -= dx * k;
    this.pitch -= dy * k * (this.invertY ? -1 : 1);
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  step(dt: number, input: Input): void {
    this.prevPos.copy(this.pos);
    const fwd = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    const strafe = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * strafe, wz = -cos * fwd - sin * strafe;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    this.moving = wl > 0;
    this.sprinting = this.moving && fwd > 0 && this.canSprint && input.down('ShiftLeft');
    const speed = this.sprinting ? SPRINT : WALK;

    const accel = this.grounded ? 14 : 2.2;
    const tvx = wx * speed, tvz = wz * speed;
    const ax = tvx - this.vel.x, az = tvz - this.vel.z;
    const al = Math.hypot(ax, az), maxA = accel * dt;
    if (al > maxA) { this.vel.x += (ax / al) * maxA; this.vel.z += (az / al) * maxA; } else { this.vel.x = tvx; this.vel.z = tvz; }

    if (this.grounded && input.consume('Space')) {
      this.vel.y = JUMP;
      this.grounded = false;
    }
    this.vel.y -= GRAVITY * dt;

    // Helmet and suit mass keep moving briefly after an impact, then settle with a damped spring.
    this.landingPitchVelocity += (-90 * this.landingPitch - 18 * this.landingPitchVelocity) * dt;
    this.landingRollVelocity += (-80 * this.landingRoll - 17 * this.landingRollVelocity) * dt;
    this.impactOffsetVelocity += (-100 * this.impactOffset - 19 * this.impactOffsetVelocity) * dt;
    this.landingPitch += this.landingPitchVelocity * dt;
    this.landingRoll += this.landingRollVelocity * dt;
    this.impactOffset += this.impactOffsetVelocity * dt;

    // Slope limit: remove the uphill component on terrain steeper than MAX_SLOPE.
    const ahead = this.ground.at(this.pos.x + this.vel.x * 0.15, this.pos.z + this.vel.z * 0.15, this.pos.y + 0.3).n;
    if (ahead[1] < MAX_SLOPE) {
      const nx = ahead[0], nz = ahead[2], nl = Math.hypot(nx, nz) || 1;
      const into = (this.vel.x * nx + this.vel.z * nz) / nl;
      if (into < 0) { this.vel.x -= (into * nx) / nl; this.vel.z -= (into * nz) / nl; }
    }

    this.pos.addScaledVector(this.vel, dt);
    this.resolveColliders();
    if (this.ground.resolveWalls(this.pos, RADIUS, EYE + 0.15) && this.vel.y > 0) this.vel.y = 0;

    const e = this.world.meta.extent - 6;
    this.pos.x = Math.max(-e, Math.min(e, this.pos.x));
    this.pos.z = Math.max(-e, Math.min(e, this.pos.z));

    const hit = this.ground.at(this.pos.x, this.pos.z, this.pos.y);
    const ground = hit.h;
    const n = hit.n;
    if (this.pos.y <= ground || (this.grounded && this.vel.y <= 0 && this.pos.y - ground < STEP_SNAP)) {
      if (!this.grounded) {
        this.lastLandingSpeed = -this.vel.y;
        const impact = Math.max(0, Math.min(1, (this.lastLandingSpeed - 1.2) / 7.5));
        this.landingPitchVelocity += impact * 1.15;
        this.impactOffsetVelocity -= impact * 0.42;
        const lateral = this.vel.x * Math.cos(this.yaw) + this.vel.z * Math.sin(this.yaw);
        this.landingRollVelocity += Math.max(-1, Math.min(1, lateral * 0.22)) * impact;
      }
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
      // Slide down slopes that are too steep to stand on.
      if (n[1] < MAX_SLOPE) {
        this.vel.x += n[0] * GRAVITY * dt * 2.5;
        this.vel.z += n[2] * GRAVITY * dt * 2.5;
      }
    } else {
      this.grounded = false;
    }

    // Fall/NaN recovery.
    if (!Number.isFinite(this.pos.x + this.pos.y + this.pos.z) || this.pos.y < ground - 3) {
      this.pos.set(Number.isFinite(this.prevPos.x) ? this.prevPos.x : 0, 0, Number.isFinite(this.prevPos.z) ? this.prevPos.z : 0);
      this.pos.y = this.ground.at(this.pos.x, this.pos.z, this.prevPos.y + 1).h;
      this.vel.set(0, 0, 0);
    }
    this.inCave = this.ground.insideCave(this.pos.x, this.pos.y + 1, this.pos.z);
    if (this.grounded) this.stride += Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z);

    if (this.grounded && this.moving) this.bob += dt * (this.sprinting ? 9.5 : 6.5);
  }

  private resolveColliders(): void {
    const p = this.pos;
    for (const c of this.colliders.circles) this.pushOut(c.x, c.z, c.r, c.bottom, c.top);
    for (const s of this.ground.structures) s.resolve(p, RADIUS, this.vel);
    this.rockField.collidersNear(p.x, p.z, this.rocks);
    for (const r of this.rocks) this.pushOut(r.x, r.z, r.r, -1e9, r.top);
  }

  private pushOut(cx: number, cz: number, r: number, bottom: number, top: number): void {
    const p = this.pos;
    if (p.y > top - 0.25 || p.y + EYE < bottom) return;
    const dx = p.x - cx, dz = p.z - cz;
    const min = r + RADIUS;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return;
    const d = Math.sqrt(d2) || 1e-4;
    const push = min - d;
    p.x += (dx / d) * push;
    p.z += (dz / d) * push;
    const vn = (this.vel.x * dx + this.vel.z * dz) / d;
    if (vn < 0) { this.vel.x -= (vn * dx) / d; this.vel.z -= (vn * dz) / d; }
  }

  /** Writes the interpolated eye transform into the camera. */
  applyCamera(cam: PerspectiveCamera, alpha: number): void {
    cam.position.lerpVectors(this.prevPos, this.pos, alpha);
    const amp = this.sprinting ? 0.05 : 0.03;
    cam.position.y += EYE + Math.sin(this.bob * 2) * amp * (this.moving && this.grounded ? 1 : 0) + this.impactOffset;
    // Never let the near plane dip into steep ground in front of the eye.
    const g = this.ground.at(cam.position.x, cam.position.z, cam.position.y - 0.4).h + 0.35;
    if (cam.position.y < g) cam.position.y = g;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch - this.landingPitch, this.yaw, this.landingRoll);
  }

  /** Compass heading in degrees (0 = north/+Z, 90 = east/+X). */
  get heading(): number {
    const h = (Math.atan2(-Math.sin(this.yaw), -Math.cos(this.yaw)) * 180) / Math.PI;
    return (h + 360) % 360;
  }
}
