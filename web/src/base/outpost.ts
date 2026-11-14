import { EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, PointLight, SphereGeometry, Vector3 } from 'three';
import { PartBuilder } from '../rendering/builder';
import { MAT } from '../rendering/materials';
import type { WorldData } from '../world/worldData';
import type { ColliderSet } from '../world/colliders';

export interface OutpostAnchors {
  airlock: Vector3;
  terminal: Vector3;
  baseStatus: Vector3;
  blinkers: Mesh[];
}

/**
 * TEMPORARY PLACEHOLDER for the user's outpost/habitat model (not yet supplied).
 * Composition follows the reference images: white cylindrical habitat modules on legs joined by
 * tunnels, a greenhouse dome for indoor farming, a lattice comms tower, a dish, crates and an
 * airlock with stairs. Built from primitives and merged per material.
 */
export function buildOutpost(world: WorldData, cx: number, cz: number, colliders: ColliderSet): { group: Group; anchors: OutpostAnchors } {
  const g0 = world.heightAt(cx, cz);
  const b = new PartBuilder();
  const R = 3.1; // habitat radius
  const lift = 1.3; // underside above ground
  const habY = g0 + lift + R;
  const ground = (x: number, z: number) => world.heightAt(cx + x, cz + z) - g0;

  const hab = (x: number, z: number, len: number, alongX: boolean) => {
    const rot: [number, number, number] = alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
    b.cyl(MAT.panel, R, R, len, [x, habY - g0, z], rot, 28);
    // End caps.
    for (const s of [-1, 1]) {
      const ex = alongX ? x + (s * len) / 2 : x, ez = alongX ? z : z + (s * len) / 2;
      b.add(new SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.panel, [ex, habY - g0, ez], alongX ? [0, 0, -s * Math.PI / 2] : [s * Math.PI / 2, 0, 0], [1, 0.35, 1]);
    }
    // Accent bands and windows.
    for (const t of [-0.32, 0.32]) {
      const bx = alongX ? x + t * len : x, bz = alongX ? z : z + t * len;
      b.cyl(MAT.accent, R + 0.04, R + 0.04, 0.35, [bx, habY - g0, bz], rot, 28);
    }
    for (let k = -1; k <= 1; k++) {
      const wx = alongX ? x + k * len * 0.18 : x + R * 0.97, wz = alongX ? z - R * 0.97 : z + k * len * 0.18;
      b.box(MAT.window, alongX ? [1.0, 0.55, 0.12] : [0.12, 0.55, 1.0], [wx, habY - g0 + 0.6, wz]);
      const wx2 = alongX ? wx : x - R * 0.97, wz2 = alongX ? z + R * 0.97 : wz;
      b.box(MAT.window, alongX ? [1.0, 0.55, 0.12] : [0.12, 0.55, 1.0], [wx2, habY - g0 + 0.6, wz2]);
    }
    // Legs down to the terrain.
    for (let k = -1; k <= 1; k += 2)
      for (let s = -1; s <= 1; s += 2) {
        const lx = alongX ? x + k * len * 0.35 : x + s * R * 0.7, lz = alongX ? z + s * R * 0.7 : z + k * len * 0.35;
        const top = habY - g0 - R * 0.7, bot = ground(lx, lz) - 0.3;
        b.cyl(MAT.metal, 0.16, 0.2, top - bot, [lx, (top + bot) / 2, lz]);
        b.cyl(MAT.darkMetal, 0.45, 0.5, 0.15, [lx, bot + 0.35, lz]);
      }
    const x0 = alongX ? x - len / 2 - R * 0.35 : x, x1 = alongX ? x + len / 2 + R * 0.35 : x;
    const z0 = alongX ? z : z - len / 2 - R * 0.35, z1 = alongX ? z : z + len / 2 + R * 0.35;
    colliders.addCapsule(cx + x0, cz + z0, cx + x1, cz + z1, R + 0.3, g0 - 5, habY + R);
  };

  hab(0, 0, 14, true); // Hab A (east-west), airlock on its east end
  hab(-12.5, 11, 13, false); // Hab B (north)
  hab(-25, 0, 11, true); // Hab C (west)
  // Hub node joining A, B, C.
  b.cyl(MAT.panel, 3.6, 3.6, 6.4, [-12.5, habY - g0, 0], undefined, 28);
  b.cyl(MAT.accent, 3.65, 3.65, 0.4, [-12.5, habY - g0 + 2.4, 0], undefined, 28);
  b.add(new SphereGeometry(3.6, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.panel, [-12.5, habY - g0 + 3.2, 0], undefined, [1, 0.4, 1]);
  colliders.add(cx - 12.5, cz, 4, g0 - 5, habY + 4);
  for (let k = -1; k <= 1; k += 2) for (let s = -1; s <= 1; s += 2) {
    const lx = -12.5 + k * 2.4, lz = s * 2.4, top = habY - g0 - 3.2, bot = ground(lx, lz) - 0.3;
    b.cyl(MAT.metal, 0.2, 0.24, top - bot, [lx, (top + bot) / 2, lz]);
  }
  // Tunnel from Hab A to the greenhouse.
  b.cyl(MAT.panelDusty, 1.3, 1.3, 7, [3, habY - g0 - 1.2, 6.5], [Math.PI / 2, 0, 0], 16);

  // Airlock on the east end of Hab A, with stairs down to the ground (faces the spawn point).
  const alX = 7 + R * 0.35 + 1.6;
  b.box(MAT.panel, [3.2, 3.4, 3.4], [alX, habY - g0 - 0.2, 0]);
  b.box(MAT.accent, [3.25, 0.3, 3.45], [alX, habY - g0 + 1.5, 0]);
  b.box(MAT.darkMetal, [0.15, 2.3, 1.4], [alX + 1.62, habY - g0 - 0.5, 0]);
  b.box(MAT.lightWarm, [0.1, 0.12, 1.4], [alX + 1.7, habY - g0 + 0.8, 0]);
  const deckY = habY - g0 - 1.9;
  b.box(MAT.metal, [2.2, 0.15, 2.4], [alX + 2.7, deckY, 0]);
  const steps = Math.max(3, Math.round(deckY / 0.32));
  for (let s = 0; s < steps; s++) {
    const t = (s + 1) / steps;
    b.box(MAT.metal, [0.5, 0.08, 1.6], [alX + 3.8 + s * 0.42, deckY - deckY * t + 0.05, 0]);
  }
  b.strut(MAT.metal, new Vector3(alX + 3.7, deckY + 1, 0.85), new Vector3(alX + 3.8 + steps * 0.42, 1, 0.85), 0.06);
  b.strut(MAT.metal, new Vector3(alX + 3.7, deckY + 1, -0.85), new Vector3(alX + 3.8 + steps * 0.42, 1, -0.85), 0.06);
  for (const s of [-1, 1]) {
    const lx = alX + 2.7, lz = s * 1.0, bot = ground(lx, lz) - 0.3;
    b.cyl(MAT.metal, 0.1, 0.1, deckY - bot, [lx, (deckY + bot) / 2, lz]);
  }
  colliders.add(cx + alX, cz, 2.2, g0 - 5, habY + 2);

  // Greenhouse dome (indoor farming): glass shell with geodesic frame and lit plant beds.
  const domeR = 8.5, domeX = 4, domeZ = 16;
  b.cyl(MAT.panel, domeR + 0.3, domeR + 0.5, 1.0, [domeX, ground(domeX, domeZ) + 0.4, domeZ], undefined, 40);
  for (let r = -2; r <= 2; r++) b.box(MAT.plants, [11, 0.6, 1.0], [domeX, ground(domeX, domeZ) + 1.1, domeZ + r * 2.6]);
  for (let r = -2; r <= 2; r++) b.box(MAT.growLight, [10, 0.08, 0.3], [domeX, ground(domeX, domeZ) + 3.6, domeZ + r * 2.6]);
  colliders.add(cx + domeX, cz + domeZ, domeR + 0.4, g0 - 5, g0 + domeR);

  // Comms lattice tower with a red beacon, and a dish on a pylon.
  const tx = -3, tz = -13, tg = ground(tx, tz);
  b.box(MAT.darkMetal, [2.6, 0.5, 2.6], [tx, tg + 0.1, tz]);
  b.lattice(MAT.metal, tx, tz, tg, 24, 2.2, 0.7, 10, 0.1);
  b.cyl(MAT.metal, 0.05, 0.05, 4, [tx, tg + 26, tz]);
  b.box(MAT.panel, [0.6, 0.9, 0.3], [tx + 0.5, tg + 19, tz]);
  b.box(MAT.panel, [0.6, 0.9, 0.3], [tx - 0.5, tg + 15, tz]);
  colliders.add(cx + tx, cz + tz, 1.6, g0 - 5, g0 + 30);
  const dx = -22, dz = -11, dg = ground(dx, dz);
  b.cyl(MAT.metal, 0.25, 0.35, 4, [dx, dg + 2, dz]);
  b.add(new SphereGeometry(3, 28, 10, 0, Math.PI * 2, 0, 0.75), MAT.panel, [dx, dg + 6.2, dz], [-0.9, 0.6, 0], [1, 0.45, 1]);
  b.cyl(MAT.metal, 0.05, 0.05, 2.4, [dx + 0.6, dg + 5.6, dz + 0.9], [-0.9, 0.6, 0]);
  colliders.add(cx + dx, cz + dz, 1.2, g0 - 5, g0 + 8);

  // Crates and a small solar array (backup power; primary power is the fission reactor).
  const crate = (x: number, z: number, s: number, ry: number) => {
    b.box(MAT.panelDusty, [s, s * 0.8, s], [x, ground(x, z) + s * 0.4, z], [0, ry, 0]);
    b.box(MAT.accent, [s * 1.02, s * 0.12, s * 1.02], [x, ground(x, z) + s * 0.55, z], [0, ry, 0]);
    colliders.add(cx + x, cz + z, s * 0.7, g0 - 5, g0 + s);
  };
  crate(14, 5, 1.4, 0.2); crate(15.6, 6.4, 1.0, 0.5); crate(13.6, 7.2, 1.1, -0.3); crate(-31, 8, 1.4, 0.1); crate(-30, 10.2, 1.2, 0.7);
  for (let i = 0; i < 6; i++) {
    const sx = -36 + i * 3.4, sz = -18, sg = ground(sx, sz);
    b.cyl(MAT.metal, 0.08, 0.08, 1.2, [sx, sg + 0.6, sz]);
    b.box(MAT.solar, [3, 0.06, 1.8], [sx, sg + 1.3, sz], [0.6, 0, 0]);
  }

  // Exterior terminal post beside the airlock stairs.
  const termX = alX + 5.6, termZ = -3.2, termG = ground(termX, termZ);
  b.box(MAT.darkMetal, [0.3, 1.2, 0.3], [termX, termG + 0.6, termZ]);
  b.box(MAT.panel, [0.8, 0.55, 0.25], [termX, termG + 1.35, termZ], [-0.4, 0, 0]);
  b.box(MAT.screen, [0.62, 0.38, 0.05], [termX, termG + 1.38, termZ - 0.15], [-0.4, 0, 0]);
  colliders.add(cx + termX, cz + termZ, 0.4, g0 - 5, g0 + 2);
  // Base status panel on the hub.
  const bsX = -12.5 + 3.4, bsZ = -4.6, bsG = ground(bsX, bsZ);
  b.box(MAT.darkMetal, [0.3, 1.2, 0.3], [bsX, bsG + 0.6, bsZ]);
  b.box(MAT.panel, [0.9, 0.6, 0.25], [bsX, bsG + 1.38, bsZ], [-0.4, 0, 0]);
  b.box(MAT.screen, [0.72, 0.42, 0.05], [bsX, bsG + 1.41, bsZ - 0.15], [-0.4, 0, 0]);
  colliders.add(cx + bsX, cz + bsZ, 0.4, g0 - 5, g0 + 2);

  const group = b.build('Outpost_PLACEHOLDER');
  // Dome shell and frame are separate (transparent, not merged).
  const domeGeo = new SphereGeometry(domeR, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const shell = new Mesh(domeGeo, MAT.glass);
  shell.position.set(domeX, ground(domeX, domeZ) + 0.9, domeZ);
  shell.renderOrder = 2;
  const frame = new LineSegments(new EdgesGeometry(new SphereGeometry(domeR + 0.02, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), 1), new LineBasicMaterial({ color: 0xcfc8be }));
  frame.position.copy(shell.position);
  group.add(shell, frame);

  const beacon = new Mesh(new SphereGeometry(0.25, 10, 8), MAT.lightRed.clone());
  beacon.position.set(tx, tg + 28.1, tz);
  group.add(beacon);
  const lamp = new PointLight(0xffc890, 12, 22, 2);
  lamp.position.set(alX + 3, habY - g0 + 1.2, 0);
  group.add(lamp);

  group.position.set(cx, g0, cz);
  group.userData.placeholder = 'Outpost / habitat — PLACEHOLDER (user model pending)';
  group.traverse((o) => { o.matrixAutoUpdate = true; });

  const anchors: OutpostAnchors = {
    airlock: new Vector3(cx + alX + 2.6, g0 + deckY + 1.3, cz),
    terminal: new Vector3(cx + termX, termG + g0 + 1.4, cz + termZ),
    baseStatus: new Vector3(cx + bsX, g0 + ground(bsX, bsZ) + 1.5, cz + bsZ),
    blinkers: [beacon],
  };
  return { group, anchors };
}

/**
 * TEMPORARY PLACEHOLDER for the base's fission power unit: a reactor housing with radiator panels,
 * sited away from the habitat. Represents the story's nuclear fission power system visually only.
 */
export function buildReactor(world: WorldData, cx: number, cz: number, colliders: ColliderSet): Group {
  const g0 = world.heightAt(cx, cz);
  const b = new PartBuilder();
  b.cyl(MAT.panelDusty, 2.2, 2.6, 5, [0, 2.5, 0], undefined, 24);
  b.cyl(MAT.accent, 2.25, 2.25, 0.35, [0, 4.2, 0], undefined, 24);
  b.add(new SphereGeometry(2.2, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.panelDusty, [0, 5, 0], undefined, [1, 0.5, 1]);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 6, z = Math.sin(a) * 6;
    b.box(MAT.radiator, [0.1, 4.5, 6], [x, 3.2, z], [0, -a, 0]);
    b.strut(MAT.metal, new Vector3(Math.cos(a) * 2.4, 3.2, Math.sin(a) * 2.4), new Vector3(Math.cos(a) * 5.9, 3.2, Math.sin(a) * 5.9), 0.2);
    b.cyl(MAT.metal, 0.12, 0.12, 1.2, [x, 0.6, z]);
  }
  colliders.add(cx, cz, 3, g0 - 5, g0 + 7);
  const group = b.build('Reactor_PLACEHOLDER');
  group.position.set(cx, g0, cz);
  group.userData.placeholder = 'Fission power unit — PLACEHOLDER';
  return group;
}
