import { CylinderGeometry, Group, Mesh, SphereGeometry, Vector3 } from 'three';
import { PartBuilder } from '../rendering/builder';
import { MAT } from '../rendering/materials';
import type { WorldData } from '../world/worldData';
import type { ColliderSet } from '../world/colliders';

export type DrillState = 'idle' | 'running' | 'done';

/**
 * TEMPORARY PLACEHOLDER for the user's drilling machine (not yet supplied): tracked chassis,
 * operator cab, lattice derrick and pipe rack, as in the references. The spinning drill string and
 * blinking beacon are TEMPORARY placeholder animation.
 */
export class DrillRig {
  readonly group: Group;
  readonly console: Vector3;
  state: DrillState = 'idle';
  progress = 0;
  readonly duration = 14; // seconds of drilling
  private readonly string: Mesh;
  private readonly beacon: Mesh;
  private t = 0;
  private readonly stringBaseY: number;

  constructor(world: WorldData, x: number, z: number, heading: number, colliders: ColliderSet) {
    const g0 = world.heightAt(x, z);
    const b = new PartBuilder();
    // Tracks.
    for (const s of [-1, 1]) {
      b.box(MAT.rubber, [6.2, 0.9, 0.9], [0, 0.45, s * 1.5]);
      b.box(MAT.darkMetal, [5.6, 0.3, 0.95], [0, 0.95, s * 1.5]);
    }
    b.box(MAT.yellow, [6.0, 0.9, 2.8], [0, 1.5, 0]);
    b.box(MAT.yellow, [1.8, 1.6, 2.0], [-2.0, 2.75, 0.2]);
    b.box(MAT.window, [0.08, 0.7, 1.5], [-1.08, 2.95, 0.2]);
    b.box(MAT.darkMetal, [2.4, 0.9, 2.2], [0.4, 2.4, 0]);
    // Pipe rack.
    for (let i = 0; i < 5; i++) b.cyl(MAT.metal, 0.11, 0.11, 4.2, [0.7, 2.95 + (i % 2) * 0.22, -0.6 + i * 0.3], [0, 0, Math.PI / 2], 8);
    // Derrick at the rear end.
    b.box(MAT.darkMetal, [1.8, 0.35, 1.8], [2.4, 2.1, 0]);
    b.lattice(MAT.yellow, 2.4, 0, 2.2, 13, 1.6, 0.6, 8, 0.1);
    b.box(MAT.darkMetal, [0.9, 0.6, 0.9], [2.4, 15.4, 0]);
    b.cyl(MAT.metal, 0.06, 0.06, 13, [2.4, 8.7, 0.45], undefined, 6);
    // Outriggers.
    for (const s of [-1, 1]) {
      b.strut(MAT.metal, new Vector3(2.4, 1.7, s * 1.4), new Vector3(3.4, 0.2, s * 2.6), 0.18);
      b.cyl(MAT.darkMetal, 0.45, 0.5, 0.2, [3.4, 0.1, s * 2.6]);
    }
    // Console post beside the cab (interaction point).
    b.box(MAT.darkMetal, [0.25, 1.1, 0.25], [-2.2, 0.55, 2.4]);
    b.box(MAT.panel, [0.7, 0.5, 0.25], [-2.2, 1.25, 2.4], [0.4, 0, 0]);
    b.box(MAT.screen, [0.55, 0.34, 0.05], [-2.2, 1.27, 2.56], [0.4, 0, 0]);
    this.group = b.build('Drill_PLACEHOLDER');

    this.string = new Mesh(new CylinderGeometry(0.16, 0.16, 12, 10), MAT.metal);
    this.stringBaseY = 8.2;
    this.string.position.set(2.4, this.stringBaseY, 0);
    this.string.castShadow = true;
    this.group.add(this.string);
    const bit = new Mesh(new CylinderGeometry(0.3, 0.05, 0.6, 10), MAT.darkMetal);
    bit.position.y = -6.2;
    this.string.add(bit);
    this.beacon = new Mesh(new SphereGeometry(0.18, 10, 8), MAT.lightWarm.clone());
    this.beacon.position.set(-2.0, 3.65, 0.2);
    this.group.add(this.beacon);

    this.group.rotation.y = heading;
    this.group.position.set(x, g0 - 0.1, z);
    this.group.userData.placeholder = 'Drilling machine — PLACEHOLDER (user model pending)';
    this.group.updateMatrixWorld(true);
    this.console = new Vector3(-2.2, 1.3, 2.75).applyMatrix4(this.group.matrixWorld);
    colliders.addCapsule(x - Math.cos(heading) * 3, z + Math.sin(heading) * 3, x + Math.cos(heading) * 3.4, z - Math.sin(heading) * 3.4, 2.1, g0 - 3, g0 + 16);
  }

  start(): boolean {
    if (this.state !== 'idle') return false;
    this.state = 'running';
    this.progress = 0;
    return true;
  }

  /** Advances the drill; returns true on the tick it completes. */
  update(dt: number): boolean {
    this.t += dt;
    const mat = this.beacon.material as typeof MAT.lightWarm;
    if (this.state === 'running') {
      this.progress = Math.min(1, this.progress + dt / this.duration);
      this.string.rotation.y += dt * 9;
      this.string.position.y = this.stringBaseY - this.progress * 1.6 + Math.sin(this.t * 30) * 0.015;
      mat.emissiveIntensity = Math.sin(this.t * 8) > 0 ? 6 : 0.3;
      if (this.progress >= 1) {
        this.state = 'done';
        return true;
      }
    } else {
      mat.emissiveIntensity = this.state === 'done' ? 2.5 : 0.4;
    }
    return false;
  }
}
