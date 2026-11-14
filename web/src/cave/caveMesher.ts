import { BOUNDS, caveSdf } from './caveDef';

export interface TerrainPatch {
  /** Heights on a regular grid covering [x0, x0 + (nx-1)·cell] × [z0, …]. */
  x0: number; z0: number; cell: number; nx: number; nz: number; h: Float32Array;
}

export interface CaveMeshData {
  positions: Float32Array;
  normals: Float32Array;
  ao: Float32Array;
  indices: Uint32Array;
  stats: { cells: number; exactEvals: number; vertices: number; triangles: number; ms: number };
}

function patchHeight(p: TerrainPatch, x: number, z: number): number {
  const fx = Math.min(p.nx - 1.001, Math.max(0, (x - p.x0) / p.cell));
  const fz = Math.min(p.nz - 1.001, Math.max(0, (z - p.z0) / p.cell));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = p.h[j * p.nx + i], b = p.h[j * p.nx + i + 1], c = p.h[(j + 1) * p.nx + i], d = p.h[(j + 1) * p.nx + i + 1];
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/**
 * Surface-nets isosurface of the cave SDF. Only geometry inside the hill is kept (the open air
 * outside the cliff is drawn by the terrain); the terrain shader cuts the matching hole.
 */
export function meshCave(terrain: TerrainPatch, voxel = 0.7): CaveMeshData {
  const t0 = performance.now();
  const [x0, y0, z0] = BOUNDS.min;
  const nx = Math.ceil((BOUNDS.max[0] - x0) / voxel) + 1;
  const ny = Math.ceil((BOUNDS.max[1] - y0) / voxel) + 1;
  const nz = Math.ceil((BOUNDS.max[2] - z0) / voxel) + 1;
  const idx = (i: number, j: number, k: number) => (k * ny + j) * nx + i;

  // 1. Coarse pass (4 voxels) to find where the surface can be.
  const C = 4;
  const cx = Math.ceil(nx / C) + 1, cy = Math.ceil(ny / C) + 1, cz = Math.ceil(nz / C) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++)
    coarse[(k * cy + j) * cx + i] = caveSdf(x0 + i * C * voxel, y0 + j * C * voxel, z0 + k * C * voxel, false);
  const near = C * voxel * 1.8 + 2.5;

  // 2. Fine samples: exact near the surface, coarse sign elsewhere.
  const field = new Float32Array(nx * ny * nz);
  let exact = 0;
  for (let k = 0; k < nz; k++) {
    const ck = Math.min(cz - 2, Math.floor(k / C));
    for (let j = 0; j < ny; j++) {
      const cj = Math.min(cy - 2, Math.floor(j / C));
      for (let i = 0; i < nx; i++) {
        const ci = Math.min(cx - 2, Math.floor(i / C));
        let minAbs = Infinity, sum = 0;
        for (let c = 0; c < 8; c++) {
          const v = coarse[((ck + (c >> 2)) * cy + cj + ((c >> 1) & 1)) * cx + ci + (c & 1)];
          sum += v;
          const a = Math.abs(v);
          if (a < minAbs) minAbs = a;
        }
        if (minAbs < near) { field[idx(i, j, k)] = caveSdf(x0 + i * voxel, y0 + j * voxel, z0 + k * voxel); exact++; }
        else field[idx(i, j, k)] = sum / 8;
      }
    }
  }
  // Seal the domain: everything on the boundary is rock.
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    if (i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1) field[idx(i, j, k)] = Math.max(field[idx(i, j, k)], 0.5);

  // 3. One vertex per sign-changing cell.
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const pos: number[] = [];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) {
      const v = field[idx(i + (c & 1), j + ((c >> 1) & 1), k + (c >> 2))];
      cv[c] = v;
      if (v < 0) inside++;
    }
    if (inside === 0 || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = cv[a], vb = cv[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += (a & 1) + (((b & 1) - (a & 1)) * t);
      sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t);
      sz += (a >> 2) + (((b >> 2) - (a >> 2)) * t);
      n++;
    }
    cellVert[idx(i, j, k)] = pos.length / 3;
    pos.push(x0 + (i + sx / n) * voxel, y0 + (j + sy / n) * voxel, z0 + (k + sz / n) * voxel);
  }

  // 4. Quads across sign-changing grid edges. Winding: front faces look into the air.
  const tri: number[] = [];
  const keep = (a: number, b: number, c: number) => {
    // Drop triangles entirely above the hillside (open air outside the cliff).
    for (const v of [a, b, c]) if (pos[v * 3 + 1] < patchHeight(terrain, pos[v * 3], pos[v * 3 + 2]) + 0.6) return true;
    return false;
  };
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { if (keep(a, c, b)) tri.push(a, c, b); if (keep(a, d, c)) tri.push(a, d, c); }
    else { if (keep(a, b, c)) tri.push(a, b, c); if (keep(a, c, d)) tri.push(a, c, d); }
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = field[idx(i, j, k)];
    const air0 = v0 < 0;
    if ((field[idx(i + 1, j, k)] < 0) !== air0)
      quad(cellVert[idx(i, j - 1, k - 1)], cellVert[idx(i, j, k - 1)], cellVert[idx(i, j, k)], cellVert[idx(i, j - 1, k)], air0);
    if ((field[idx(i, j + 1, k)] < 0) !== air0)
      quad(cellVert[idx(i - 1, j, k - 1)], cellVert[idx(i - 1, j, k)], cellVert[idx(i, j, k)], cellVert[idx(i, j, k - 1)], air0);
    if ((field[idx(i, j, k + 1)] < 0) !== air0)
      quad(cellVert[idx(i - 1, j - 1, k)], cellVert[idx(i, j - 1, k)], cellVert[idx(i, j, k)], cellVert[idx(i - 1, j, k)], air0);
  }

  // 5. Compact used vertices; normals from the SDF gradient; baked ambient occlusion.
  const vCount = pos.length / 3;
  const remap = new Int32Array(vCount).fill(-1);
  let used = 0;
  for (const v of tri) if (remap[v] < 0) remap[v] = used++;
  const positions = new Float32Array(used * 3), normals = new Float32Array(used * 3), ao = new Float32Array(used);
  for (let v = 0; v < vCount; v++) {
    const r = remap[v];
    if (r < 0) continue;
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    positions.set([x, y, z], r * 3);
    const e = 0.2;
    let gx = caveSdf(x + e, y, z) - caveSdf(x - e, y, z);
    let gy = caveSdf(x, y + e, z) - caveSdf(x, y - e, z);
    let gz = caveSdf(x, y, z + e) - caveSdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    gx = -gx / l; gy = -gy / l; gz = -gz / l; // into the air
    normals.set([gx, gy, gz], r * 3);
    let occ = 0;
    for (const [hDist, w] of [[0.6, 0.5], [1.6, 0.3], [3.5, 0.2]] as const) {
      const free = -caveSdf(x + gx * hDist, y + gy * hDist, z + gz * hDist, false);
      occ += w * Math.max(0, Math.min(1, (hDist - free) / hDist));
    }
    ao[r] = Math.max(0.25, 1 - occ * 1.15);
  }
  const indices = new Uint32Array(tri.length);
  for (let n = 0; n < tri.length; n++) indices[n] = remap[tri[n]];
  return {
    positions, normals, ao, indices,
    stats: { cells: nx * ny * nz, exactEvals: exact, vertices: used, triangles: indices.length / 3, ms: performance.now() - t0 },
  };
}
