import { BoxGeometry, BufferGeometry, CylinderGeometry, Euler, Group, Material, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Collects primitive parts per material and merges them into one mesh per material, so a
 * placeholder structure made of hundreds of parts costs only a handful of draw calls.
 */
export class PartBuilder {
  private parts = new Map<Material, BufferGeometry[]>();
  private m = new Matrix4();
  private q = new Quaternion();

  add(geo: BufferGeometry, mat: Material, pos: Vector3 | [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]): this {
    const p = Array.isArray(pos) ? new Vector3(...pos) : pos;
    this.q.setFromEuler(new Euler(...rot));
    this.m.compose(p, this.q, new Vector3(...scale));
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(this.m);
    g.deleteAttribute('uv1');
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
    return this;
  }

  box(mat: Material, size: [number, number, number], pos: [number, number, number], rot?: [number, number, number]): this {
    return this.add(new BoxGeometry(...size), mat, pos, rot);
  }

  cyl(mat: Material, rTop: number, rBot: number, h: number, pos: [number, number, number], rot?: [number, number, number], seg = 16): this {
    return this.add(new CylinderGeometry(rTop, rBot, h, seg), mat, pos, rot);
  }

  /** A thin strut between two points. */
  strut(mat: Material, a: Vector3, b: Vector3, thick: number): this {
    const len = a.distanceTo(b);
    const g = new BoxGeometry(thick, len, thick);
    const dir = b.clone().sub(a).normalize();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
    const m = new Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new Vector3(1, 1, 1));
    const geo = g.toNonIndexed().applyMatrix4(m);
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(geo);
    return this;
  }

  /** Square lattice tower (legs, rings and X-bracing) from y=y0 to y0+height. */
  lattice(mat: Material, cx: number, cz: number, y0: number, height: number, w0: number, w1: number, bays: number, thick = 0.12): this {
    const corner = (t: number, k: number) => {
      const w = (w0 + (w1 - w0) * t) / 2;
      const sx = k === 0 || k === 3 ? -w : w, sz = k < 2 ? -w : w;
      return new Vector3(cx + sx, y0 + height * t, cz + sz);
    };
    for (let k = 0; k < 4; k++) this.strut(mat, corner(0, k), corner(1, k), thick * 1.4);
    for (let b = 0; b <= bays; b++) {
      const t = b / bays;
      for (let k = 0; k < 4; k++) {
        this.strut(mat, corner(t, k), corner(t, (k + 1) % 4), thick);
        if (b < bays) this.strut(mat, corner(t, k), corner((b + 1) / bays, (k + 1) % 4), thick * 0.8);
      }
    }
    return this;
  }

  build(name: string, castShadow = true): Group {
    const g = new Group();
    g.name = name;
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new Mesh(merged, mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      g.add(mesh);
      list.forEach((x) => x.dispose());
    }
    this.parts.clear();
    return g;
  }
}
