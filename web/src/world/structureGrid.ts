import { Matrix4, Mesh, Vector3, type Object3D } from 'three';

/**
 * Walkable floors and solid cells derived from a structure's own triangles (e.g. the outpost model), so collision
 * always matches the art: walls, glass, tunnels, doorways and furniture, with no hand-placed colliders.
 *
 *  - floor: highest upward-facing surface per cell within [baseY − 1, baseY + floorMax] (single-level structures).
 *  - solid: any triangle passing through the body band [baseY + bandLo, baseY + bandHi] marks its cells solid.
 *    Surfaces lower than bandLo (thresholds, steps) are walked over; overhangs above bandHi are walked under.
 *
 * Pure data + math (no rendering); built once at load.
 */
export interface StructureGridOptions {
  cell?: number;
  bandLo?: number;
  bandHi?: number;
  floorMax?: number;
  /** Meshes for which this returns false are ignored (e.g. invisible helpers). */
  filter?: (m: Mesh) => boolean;
  /** Door id (1..255) for meshes that are door leaves; their cells block only while that door is closed. */
  doorOf?: (m: Mesh) => number;
}

export class StructureGrid {
  readonly floor: Float32Array;
  readonly solid: Uint8Array;
  /** Cells explicitly opened (doorways), never solid even if geometry crosses them. */
  readonly open: Uint8Array;
  /** Index+1 into `meshes` of the first mesh that made each cell solid (diagnostics). */
  readonly owner: Uint16Array;
  /** Door id per cell (0 = none). A door cell blocks while `doorBlocking[id]` is true. */
  readonly doorCell: Uint8Array;
  readonly doorBlocking: boolean[] = [];
  meshes: Mesh[] = [];
  stats = { triangles: 0, solidCells: 0, floorCells: 0, ms: 0 };

  constructor(readonly x0: number, readonly z0: number, readonly cell: number, readonly nx: number, readonly nz: number, readonly baseY: number) {
    this.floor = new Float32Array(nx * nz).fill(Number.NaN);
    this.solid = new Uint8Array(nx * nz);
    this.open = new Uint8Array(nx * nz);
    this.owner = new Uint16Array(nx * nz);
    this.doorCell = new Uint8Array(nx * nz);
  }

  static fromObject(root: Object3D, baseY: number, opts: StructureGridOptions = {}): StructureGrid {
    const t0 = performance.now();
    const cell = opts.cell ?? 0.25, bandLo = baseY + (opts.bandLo ?? 0.45), bandHi = baseY + (opts.bandHi ?? 1.85);
    const floorTop = baseY + (opts.floorMax ?? 0.6), floorBottom = baseY - 1;
    root.updateWorldMatrix(true, true);
    // World bounds of all included meshes.
    const meshes: Mesh[] = [];
    root.traverse((o) => { if ((o as Mesh).isMesh && (!opts.filter || opts.filter(o as Mesh))) meshes.push(o as Mesh); });
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const m of meshes) {
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
      minX = Math.min(minX, b.min.x); minZ = Math.min(minZ, b.min.z); maxX = Math.max(maxX, b.max.x); maxZ = Math.max(maxZ, b.max.z);
    }
    const nx = Math.ceil((maxX - minX) / cell) + 2, nz = Math.ceil((maxZ - minZ) / cell) + 2;
    const g = new StructureGrid(minX - cell, minZ - cell, cell, nx, nz, baseY);
    g.meshes = meshes;

    const a = new Vector3(), b = new Vector3(), c = new Vector3();
    const poly: number[] = [], tmp: number[] = [];
    const mw = new Matrix4();
    for (let mi = 0; mi < meshes.length; mi++) {
      const m = meshes[mi];
      g.curOwner = mi + 1;
      g.curDoor = opts.doorOf?.(m) ?? 0;
      if (g.curDoor) g.doorBlocking[g.curDoor] = true;
      const pos = m.geometry.getAttribute('position');
      const idx = m.geometry.getIndex();
      mw.copy(m.matrixWorld);
      const triCount = (idx ? idx.count : pos.count) / 3;
      g.stats.triangles += triCount;
      for (let t = 0; t < triCount; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, i0).applyMatrix4(mw);
        b.fromBufferAttribute(pos, i1).applyMatrix4(mw);
        c.fromBufferAttribute(pos, i2).applyMatrix4(mw);
        const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y);
        if (hi < floorBottom || lo > bandHi) continue;
        // Normal (unnormalised): only the vertical component's sign/size matters.
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, wx = c.x - a.x, wy = c.y - a.y, wz = c.z - a.z;
        const nxv = uy * wz - uz * wy, nyv = uz * wx - ux * wz, nzv = ux * wy - uy * wx;
        const nl = Math.hypot(nxv, nyv, nzv);
        if (nl < 1e-9) continue;
        const ny = nyv / nl;
        // Floors: gently sloped, facing up (either winding — some exports are double-sided/flipped), low enough to stand on.
        if (Math.abs(ny) > 0.8 && hi <= floorTop && !g.curDoor) g.rasterFloor(a, b, c);
        // Solid: any part inside the body band.
        if (hi >= bandLo && lo <= bandHi) {
          poly.length = 0;
          poly.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
          clipY(poly, tmp, bandLo, 1);
          clipY(poly, tmp, bandHi, -1);
          if (poly.length >= 9) g.rasterSolid(poly);
        }
      }
    }
    for (let k = 0; k < g.solid.length; k++) { if (g.solid[k]) g.stats.solidCells++; if (!Number.isNaN(g.floor[k])) g.stats.floorCells++; }
    g.stats.ms = Math.round(performance.now() - t0);
    return g;
  }

  private curOwner = 0;
  private curDoor = 0;

  /** Diagnostics: ASCII map of a world rectangle ('#' solid, 'o' opened, '.' floor, ' ' none) and the meshes owning solid cells. */
  describe(x0: number, x1: number, z0: number, z1: number, step = this.cell): { rows: string[]; owners: Record<string, number> } {
    const rows: string[] = [], owners: Record<string, number> = {};
    for (let z = z1; z >= z0; z -= step) {
      let row = '';
      for (let x = x0; x <= x1; x += step) {
        const k = this.index(x, z);
        if (k < 0) { row += ' '; continue; }
        if (this.solid[k]) {
          row += this.open[k] ? 'o' : '#';
          const m = this.meshes[this.owner[k] - 1];
          const mat = m ? (Array.isArray(m.material) ? m.material[0] : m.material) : null;
          const key = m ? `${m.name}|${mat?.name ?? ''}` : '?';
          owners[key] = (owners[key] ?? 0) + 1;
        } else row += Number.isNaN(this.floor[k]) ? ' ' : '.';
      }
      rows.push(row);
    }
    return { rows, owners };
  }

  private rasterFloor(a: Vector3, b: Vector3, c: Vector3): void {
    const { x0, z0, cell, nx, nz } = this;
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - x0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z, c.z) - z0) / cell)), j1 = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - z0) / cell));
    const den = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
    if (Math.abs(den) < 1e-12) return;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = x0 + (i + 0.5) * cell, pz = z0 + (j + 0.5) * cell;
      const l1 = ((b.z - c.z) * (px - c.x) + (c.x - b.x) * (pz - c.z)) / den;
      const l2 = ((c.z - a.z) * (px - c.x) + (a.x - c.x) * (pz - c.z)) / den;
      const l3 = 1 - l1 - l2;
      const e = -0.02; // tiny tolerance closes hairline gaps between floor triangles
      if (l1 < e || l2 < e || l3 < e) continue;
      const y = l1 * a.y + l2 * b.y + l3 * c.y;
      const k = j * nx + i;
      if (Number.isNaN(this.floor[k]) || y > this.floor[k]) this.floor[k] = y;
    }
  }

  /** poly: flat xyz list of the triangle clipped to the body band. Marks cells within half a cell of its XZ footprint. */
  private rasterSolid(poly: number[]): void {
    const { x0, z0, cell, nx, nz } = this;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let k = 0; k < poly.length; k += 3) { minX = Math.min(minX, poly[k]); maxX = Math.max(maxX, poly[k]); minZ = Math.min(minZ, poly[k + 2]); maxZ = Math.max(maxZ, poly[k + 2]); }
    const r = cell * 0.5;
    const i0 = Math.max(0, Math.floor((minX - r - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((maxX + r - x0) / cell));
    const j0 = Math.max(0, Math.floor((minZ - r - z0) / cell)), j1 = Math.min(nz - 1, Math.floor((maxZ + r - z0) / cell));
    const count = poly.length / 3;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * nx + i;
      if (this.curDoor ? this.doorCell[k] === this.curDoor : this.solid[k]) continue;
      const px = x0 + (i + 0.5) * cell, pz = z0 + (j + 0.5) * cell;
      let inside = false, d2 = Infinity;
      for (let p = 0, q = count - 1; p < count; q = p++) {
        const ax = poly[p * 3], az = poly[p * 3 + 2], bx = poly[q * 3], bz = poly[q * 3 + 2];
        if ((az > pz) !== (bz > pz) && px < ((bx - ax) * (pz - az)) / (bz - az) + ax) inside = !inside;
        d2 = Math.min(d2, segDist2(px, pz, ax, az, bx, bz));
      }
      if (!(inside || d2 <= r * r)) continue;
      if (this.curDoor) this.doorCell[k] = this.curDoor;
      else { this.solid[k] = 1; this.owner[k] = this.curOwner; }
    }
  }

  /** Marks a world rectangle as always open (doorway); used where doors are animated or the model has a closed panel. */
  openRect(x0: number, x1: number, z0: number, z1: number): void {
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const px = this.x0 + (i + 0.5) * this.cell, pz = this.z0 + (j + 0.5) * this.cell;
      if (px >= x0 && px <= x1 && pz >= z0 && pz <= z1) this.open[j * this.nx + i] = 1;
    }
  }

  private index(x: number, z: number): number {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i;
  }

  contains(x: number, z: number): boolean { return this.index(x, z) >= 0; }

  /** Structure floor height at (x, z), or null where the structure has no floor. */
  floorAt(x: number, z: number): number | null {
    const k = this.index(x, z);
    if (k < 0) return null;
    const f = this.floor[k];
    return Number.isNaN(f) ? null : f;
  }

  /** True when cell k currently blocks movement: static geometry (unless opened) or a closed door leaf. */
  private blocks(k: number): boolean {
    if (this.solid[k] && !this.open[k]) return true;
    const d = this.doorCell[k];
    return d !== 0 && this.doorBlocking[d] === true;
  }

  isSolid(x: number, z: number): boolean {
    const k = this.index(x, z);
    return k >= 0 && this.blocks(k);
  }

  /**
   * Pushes a vertical capsule (feet at p.y) out of solid cells. Only applies within the structure's height range.
   * Returns true if a push happened; `vel` loses its into-wall component.
   */
  resolve(p: { x: number; y: number; z: number }, radius: number, vel?: { x: number; z: number }): boolean {
    if (p.y > this.baseY + 1.6 || p.y < this.baseY - 2) return false;
    if (this.index(p.x, p.z) < 0 && this.index(p.x + radius, p.z + radius) < 0 && this.index(p.x - radius, p.z - radius) < 0) return false;
    let pushed = false;
    for (let iter = 0; iter < 3; iter++) {
      let best = 0, bx = 0, bz = 0;
      const { cell } = this;
      const i0 = Math.floor((p.x - radius - this.x0) / cell), i1 = Math.floor((p.x + radius - this.x0) / cell);
      const j0 = Math.floor((p.z - radius - this.z0) / cell), j1 = Math.floor((p.z + radius - this.z0) / cell);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
        const k = j * this.nx + i;
        if (!this.blocks(k)) continue;
        const cx0 = this.x0 + i * cell, cz0 = this.z0 + j * cell;
        const qx = Math.max(cx0, Math.min(p.x, cx0 + cell)), qz = Math.max(cz0, Math.min(p.z, cz0 + cell));
        let dx = p.x - qx, dz = p.z - qz;
        let d = Math.hypot(dx, dz);
        if (d >= radius) continue;
        if (d < 1e-6) { dx = p.x - (cx0 + cell / 2); dz = p.z - (cz0 + cell / 2); d = Math.hypot(dx, dz) || 1; const pen = radius + cell * 0.71 - d; if (pen > best) { best = pen; bx = dx / d; bz = dz / d; } continue; }
        const pen = radius - d;
        if (pen > best) { best = pen; bx = dx / d; bz = dz / d; }
      }
      if (best <= 0) break;
      p.x += bx * best; p.z += bz * best;
      if (vel) { const vn = vel.x * bx + vel.z * bz; if (vn < 0) { vel.x -= vn * bx; vel.z -= vn * bz; } }
      pushed = true;
    }
    return pushed;
  }
}

/** Sutherland–Hodgman clip of a polygon (flat xyz list) against the plane y = h, keeping side sign*(y − h) ≥ 0. */
function clipY(poly: number[], tmp: number[], h: number, sign: 1 | -1): void {
  tmp.length = 0;
  const n = poly.length / 3;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ay = poly[i * 3 + 1], by = poly[j * 3 + 1];
    const ain = sign * (ay - h) >= 0, bin = sign * (by - h) >= 0;
    if (ain) tmp.push(poly[i * 3], ay, poly[i * 3 + 2]);
    if (ain !== bin) {
      const t = (h - ay) / (by - ay);
      tmp.push(poly[i * 3] + (poly[j * 3] - poly[i * 3]) * t, h, poly[i * 3 + 2] + (poly[j * 3 + 2] - poly[i * 3 + 2]) * t);
    }
  }
  poly.length = 0;
  for (const v of tmp) poly.push(v);
}

function segDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
  const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
  return dx * dx + dz * dz;
}
