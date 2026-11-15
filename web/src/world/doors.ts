import { Vector3, type Object3D } from 'three';
import type { StructureGrid } from './structureGrid';

/**
 * Reusable door system (directive System G). A door is any object (e.g. a door leaf split out of the user's model)
 * that moves by `openOffset` between closed and open with eased motion. Doors open automatically when the player is
 * within `radius` of the trigger point, stay open while the player is near, and close `holdSeconds` after they leave.
 * While a door is not (almost) fully open its cells in the structure grid block movement, so collision always matches
 * what is drawn. Pure state + transforms; sound/UI are reported through `onMove`.
 */
export interface DoorSpec {
  /** Grid door id (1..255) assigned to the leaf's cells when the grid was built. */
  id: number;
  label: string;
  leaf: Object3D;
  /** Local-space offset of the leaf when fully open. */
  openOffset: Vector3;
  /** World point the player must approach (both sides of the door are covered by the radius). */
  trigger: Vector3;
  radius: number;
  duration?: number;
  holdSeconds?: number;
  /** Doors that can be locked by gameplay (e.g. a power failure) start locked when false. */
  powered?: boolean;
}

export type DoorState = 'closed' | 'opening' | 'open' | 'closing';

export class Door {
  state: DoorState = 'closed';
  /** 0 = closed, 1 = open (linear; eased when applied). */
  t = 0;
  powered: boolean;
  /** Seconds the player has been away while the door is open. */
  holdTimer = 0;
  private readonly closedPos: Vector3;

  constructor(readonly spec: DoorSpec) {
    this.closedPos = spec.leaf.position.clone();
    this.powered = spec.powered ?? true;
  }

  /** Eased leaf travel (smootherstep): no snapping at either end. */
  get eased(): number { const t = this.t; return t * t * t * (t * (t * 6 - 15) + 10); }

  /** Blocks unless the leaf is nearly fully out of the way. */
  get blocking(): boolean { return this.t < 0.9; }

  apply(): void {
    this.spec.leaf.position.copy(this.closedPos).addScaledVector(this.spec.openOffset, this.eased);
  }
}

export class DoorSystem {
  readonly doors: Door[] = [];

  constructor(private readonly grid: StructureGrid, private readonly onMove: (door: Door, opening: boolean) => void = () => {}) {}

  add(spec: DoorSpec): Door {
    const d = new Door(spec);
    this.doors.push(d);
    this.grid.doorBlocking[spec.id] = true;
    return d;
  }

  get(label: string): Door | undefined { return this.doors.find((d) => d.spec.label === label); }

  /** Locks (unpowered) or unlocks every door — e.g. the airlock before the ID scan. */
  setPowered(on: boolean): void { for (const d of this.doors) d.powered = on; }

  update(dt: number, player: Vector3): void {
    for (const d of this.doors) {
      const s = d.spec;
      const near = d.powered && Math.hypot(player.x - s.trigger.x, player.z - s.trigger.z) < s.radius && Math.abs(player.y - s.trigger.y) < 4;
      const rate = dt / (s.duration ?? 1.6);
      if (near) {
        d.holdTimer = 0;
        if (d.state === 'closed' || d.state === 'closing') { d.state = 'opening'; this.onMove(d, true); }
      } else if (d.state === 'open') {
        d.holdTimer += dt;
        if (d.holdTimer > (s.holdSeconds ?? 1.5)) { d.state = 'closing'; this.onMove(d, false); }
      }
      if (d.state === 'opening') { d.t = Math.min(1, d.t + rate); if (d.t >= 1) { d.state = 'open'; d.holdTimer = 0; } }
      else if (d.state === 'closing') { d.t = Math.max(0, d.t - rate); if (d.t <= 0) d.state = 'closed'; }
      d.apply();
      this.grid.doorBlocking[s.id] = d.blocking;
    }
  }

  /** Save/restore: doors are restored closed (the player is never saved inside a door leaf). */
  reset(): void { for (const d of this.doors) { d.state = 'closed'; d.t = 0; d.apply(); this.grid.doorBlocking[d.spec.id] = true; } }
}
