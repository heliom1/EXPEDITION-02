import { Group, Matrix4, Mesh, PointLight, Quaternion, SphereGeometry, Vector3 } from 'three';
import { PartBuilder } from '../rendering/builder';
import { MAT } from '../rendering/materials';
import type { WorldData } from '../world/worldData';
import type { ColliderSet } from '../world/colliders';

/**
 * TEMPORARY PLACEHOLDER for the user's rover model (not yet supplied).
 * Six-wheel rocker-bogie survey rover, white body with orange accents and a roof light bar,
 * matching the reference images. Static in this build; driving arrives with the rover phase.
 */
export function buildRover(world: WorldData, x: number, z: number, heading: number, colliders: ColliderSet): { group: Group; servicePanel: Vector3; lights: Mesh[] } {
  const b = new PartBuilder();
  const wheelR = 0.5, track = 1.25, base = 1.7;
  // Chassis and body (local +X forward).
  b.box(MAT.panel, [3.4, 0.7, 1.9], [0, 1.45, 0]);
  b.box(MAT.panelDusty, [2.0, 0.55, 1.7], [-0.4, 2.05, 0]);
  b.box(MAT.window, [0.08, 0.35, 1.4], [0.62, 2.1, 0]);
  b.box(MAT.accent, [3.42, 0.14, 1.92], [0, 1.72, 0]);
  b.box(MAT.darkMetal, [3.0, 0.25, 1.6], [0, 1.0, 0]);
  b.box(MAT.solar, [1.9, 0.05, 1.6], [-0.4, 2.35, 0]);
  // Mast with sensor head.
  b.cyl(MAT.metal, 0.06, 0.07, 1.3, [1.2, 2.45, 0.55]);
  b.box(MAT.panel, [0.35, 0.25, 0.5], [1.25, 3.15, 0.55]);
  b.box(MAT.darkMetal, [0.05, 0.12, 0.35], [1.43, 3.15, 0.55]);
  // Light bar.
  b.box(MAT.darkMetal, [0.15, 0.12, 1.5], [0.5, 2.38, 0]);
  // Front bumper / sample arm.
  b.box(MAT.metal, [0.2, 0.2, 1.7], [1.8, 1.2, 0]);
  b.strut(MAT.metal, new Vector3(1.8, 1.3, -0.5), new Vector3(2.4, 0.8, -0.6), 0.08);
  // Rocker-bogie arms and wheels.
  for (const s of [-1, 1]) {
    const zz = s * track;
    b.strut(MAT.metal, new Vector3(0.2, 1.35, s * 0.95), new Vector3(base, wheelR, zz), 0.12);
    b.strut(MAT.metal, new Vector3(0.2, 1.35, s * 0.95), new Vector3(-0.5, 0.95, zz), 0.12);
    b.strut(MAT.metal, new Vector3(-0.5, 0.95, zz), new Vector3(0, wheelR, zz), 0.1);
    b.strut(MAT.metal, new Vector3(-0.5, 0.95, zz), new Vector3(-base, wheelR, zz), 0.1);
    for (const wx of [base, 0, -base]) {
      b.cyl(MAT.rubber, wheelR, wheelR, 0.42, [wx, wheelR, zz], [Math.PI / 2, 0, 0], 18);
      b.cyl(MAT.metal, wheelR * 0.55, wheelR * 0.55, 0.44, [wx, wheelR, zz], [Math.PI / 2, 0, 0], 12);
    }
  }
  // Rear service panel (interaction point).
  b.box(MAT.accent, [0.06, 0.45, 0.7], [-1.72, 1.45, 0]);
  const group = b.build('Rover_PLACEHOLDER');
  const lights: Mesh[] = [];
  for (const s of [-0.5, -0.17, 0.17, 0.5]) {
    const l = new Mesh(new SphereGeometry(0.07, 8, 6), MAT.lightWarm);
    l.position.set(0.59, 2.38, s);
    group.add(l);
    lights.push(l);
  }
  const head = new PointLight(0xffe0b0, 0, 18, 2);
  head.position.set(1.0, 2.3, 0);
  group.add(head);

  // Sit on the terrain: average the wheel contact heights and tilt to the ground normal.
  const n = new Vector3(...world.normalAt(x, z, 2.5));
  let gy = 0;
  for (const wx of [base, 0, -base]) for (const s of [-1, 1]) {
    const lx = Math.cos(heading) * wx - Math.sin(heading) * s * track;
    const lz = -Math.sin(heading) * wx - Math.cos(heading) * s * track;
    gy += world.heightAt(x + lx, z + lz);
  }
  gy /= 6;
  const qYaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), heading);
  const qTilt = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n);
  group.quaternion.copy(qTilt.multiply(qYaw));
  group.position.set(x, gy - 0.05, z);
  group.userData.placeholder = 'Rover — PLACEHOLDER (user model pending)';
  group.updateMatrixWorld(true);
  colliders.add(x, z, 2.3, gy - 2, gy + 3);
  const servicePanel = new Vector3(-1.9, 1.45, 0).applyMatrix4(new Matrix4().copy(group.matrixWorld));
  return { group, servicePanel, lights };
}
