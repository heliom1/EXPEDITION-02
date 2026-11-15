import { Group, Matrix4, Vector3, type Mesh, type Object3D } from 'three';

/**
 * The user's drill (drill.glb → opt/handdrill.glb) is authored at an arbitrary diagonal angle and in arbitrary units.
 * This straightens it from its own geometry, with no hand-tuned angles:
 *  - drill axis  = principal axis of the metal bit (largest-variance direction), pointing from the body to the tip;
 *  - handle bar  = principal direction of the rear-most part of the body, perpendicular to the axis.
 * Result: bit along −Z (forward), handle bar along X, origin on the axis at the handle bar, sized in metres, and the
 * metal bit under its own node so it can spin about the axis.
 */
export interface DrillRig {
  /** Straightened drill: −Z forward, X along the handle bar, Y up, metres. */
  root: Group;
  /** Rotate `.rotation.z` to spin the bit about the drill axis. */
  bit: Group;
  /** Centres of the two hand grips, in `root` space. */
  gripLeft: Vector3;
  gripRight: Vector3;
  /** Overall length along the axis (m). */
  length: number;
}

/** Largest-variance direction of a point cloud (power iteration on the covariance matrix). */
function principalAxis(pts: Vector3[], centre: Vector3): Vector3 {
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of pts) {
    const x = p.x - centre.x, y = p.y - centre.y, z = p.z - centre.z;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z;
  }
  const v = new Vector3(1, 0.9, 0.8).normalize();
  for (let i = 0; i < 60; i++) v.set(xx * v.x + xy * v.y + xz * v.z, xy * v.x + yy * v.y + yz * v.z, xz * v.x + yz * v.y + zz * v.z).normalize();
  return v;
}

const centroid = (pts: Vector3[]) => pts.reduce((c, p) => c.add(p), new Vector3()).multiplyScalar(1 / Math.max(1, pts.length));

function worldPoints(o: Object3D): Vector3[] {
  const out: Vector3[] = [];
  o.updateWorldMatrix(true, true);
  o.traverse((c) => {
    const m = c as Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) out.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  });
  return out;
}

/** `length` = wanted overall length in metres. `flipUp` turns the drill over about its axis (handle side up/down). */
export function straightenDrill(model: Object3D, length = 0.62, flipUp = false): DrillRig {
  const metal: Object3D[] = [], rest: Object3D[] = [];
  model.updateWorldMatrix(true, true);
  model.traverse((o) => { if ((o as Mesh).isMesh) (/METAL/i.test(o.name) || /METAL/i.test(((o as Mesh).material as { name?: string }).name ?? '') ? metal : rest).push(o); });
  const metalPts = metal.flatMap(worldPoints), restPts = rest.flatMap(worldPoints);
  const all = [...metalPts, ...restPts];
  const cAll = centroid(all), cMetal = centroid(metalPts.length ? metalPts : all);
  const fwd = principalAxis(metalPts.length ? metalPts : all, cMetal);
  if (fwd.dot(cMetal.clone().sub(centroid(restPts.length ? restPts : all))) < 0) fwd.negate(); // body → tip
  // Extent along the axis, measured from the axis line through the bit's centroid.
  const along = (p: Vector3) => p.clone().sub(cMetal).dot(fwd);
  let lo = Infinity, hi = -Infinity;
  for (const p of all) { const a = along(p); if (a < lo) lo = a; if (a > hi) hi = a; }
  // Handle bar: rear 22 % of the tool, direction of largest spread perpendicular to the axis.
  const rear = (restPts.length ? restPts : all).filter((p) => along(p) < lo + (hi - lo) * 0.22);
  const perp = rear.map((p) => { const d = p.clone().sub(cMetal); return d.addScaledVector(fwd, -d.dot(fwd)); });
  const bar = principalAxis(perp, centroid(perp));
  bar.addScaledVector(fwd, -bar.dot(fwd)).normalize();
  const up = new Vector3().crossVectors(bar, fwd).normalize().negate(); // right-handed: X=bar, Y=up, Z=−fwd
  if (flipUp) { up.negate(); bar.negate(); }
  const k = length / (hi - lo);
  // model space → rig space: p' = R·(p − origin)·k with origin on the axis at the rear end.
  const origin = cMetal.clone().addScaledVector(fwd, lo);
  const basis = new Matrix4().makeBasis(bar, up, fwd.clone().negate()).transpose(); // rows = axes → projects onto them
  const toRig = new Matrix4().makeScale(k, k, k).multiply(basis).multiply(new Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z));

  const root = new Group(), bit = new Group(), body = new Group();
  root.add(body, bit);
  for (const [list, parent] of [[rest, body], [metal, bit]] as const) {
    for (const o of list) {
      const m = toRig.clone().multiply(o.matrixWorld);
      parent.add(o); // re-parent, then express the old world transform in rig space
      o.matrix.copy(m);
      o.matrix.decompose(o.position, o.quaternion, o.scale);
    }
  }
  // Grips: outer ends of the handle bar.
  const rearRig = rear.map((p) => p.clone().applyMatrix4(toRig));
  const maxX = rearRig.reduce((m, p) => Math.max(m, Math.abs(p.x)), 0);
  const gripRight = centroid(rearRig.filter((p) => p.x > maxX * 0.55));
  const gripLeft = centroid(rearRig.filter((p) => p.x < -maxX * 0.55));
  void cAll;
  return { root, bit, gripLeft, gripRight, length };
}
