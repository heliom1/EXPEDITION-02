import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorldData, type WorldMeta } from '../src/world/worldData';
import { NODES, SEGMENTS, CENTRE_LIFT, caveSdf, caveFloorBelow, caveGrad, BOUNDS } from '../src/cave/caveDef';
import { meshCave, type TerrainPatch, type CaveMeshData } from '../src/cave/caveMesher';

const W = join(__dirname, '..', 'public', 'world');
const meta = JSON.parse(readFileSync(join(W, 'world.json'), 'utf8')) as WorldMeta;
let world: WorldData;
let patch: TerrainPatch;
let mesh: CaveMeshData;

export function terrainPatch(w: WorldData): TerrainPatch {
  const cell = 2, x0 = BOUNDS.min[0] - 4, z0 = BOUNDS.min[2] - 4;
  const nx = Math.ceil((BOUNDS.max[0] + 4 - x0) / cell) + 1, nz = Math.ceil((BOUNDS.max[2] + 4 - z0) / cell) + 1;
  const h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = w.heightAt(x0 + i * cell, z0 + j * cell);
  return { x0, z0, cell, nx, nz, h };
}

beforeAll(() => {
  world = new WorldData(meta);
  for (let tz = 0; tz < meta.tilesPerSide; tz++)
    for (let tx = 0; tx < meta.tilesPerSide; tx++) {
      const b = readFileSync(join(W, 'tiles', `h_${tx}_${tz}.r16`));
      world.placeTile(tx, tz, new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
    }
  patch = terrainPatch(world);
  mesh = meshCave(patch, 0.7);
}, 60000);

describe('cave layout', () => {
  it('every passage has a walkable floor and >= 2.1 m headroom', () => {
    const problems: string[] = [];
    for (const [a, b] of SEGMENTS) {
      const A = NODES[a], B = NODES[b];
      let prev: number | null = null;
      const n = Math.ceil(Math.hypot(B.x - A.x, B.z - A.z) / 0.5);
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
        const c = A.floor + (B.floor - A.floor) * t + Math.min(A.r, B.r) * CENTRE_LIFT;
        const f = caveFloorBelow(x, c, z, 12);
        if (f === null) { problems.push(`${a}->${b} t=${t.toFixed(2)} no floor`); continue; }
        // Headroom: air from the floor up 2.1 m (unless outside the hill, where the sky is open).
        const open = f + 2.1 > world.heightAt(x, z);
        for (let hgt = 0.3; hgt <= 2.1 && !open; hgt += 0.3) if (caveSdf(x, f + hgt, z) > 0) { problems.push(`${a}->${b} t=${t.toFixed(2)} headroom ${hgt.toFixed(1)}`); break; }
        if (prev !== null && Math.abs(f - prev) / 0.5 > Math.tan((40 * Math.PI) / 180) * 1.6) problems.push(`${a}->${b} t=${t.toFixed(2)} step ${(f - prev).toFixed(2)}`);
        prev = f;
      }
    }
    expect(problems.slice(0, 8)).toEqual([]);
  });

  it('the entrance opens to the outside and the deep cave is sealed under rock', () => {
    const m = NODES.mouthOut;
    const fo = caveFloorBelow(m.x, m.floor + 3, m.z, 6)!;
    expect(fo).not.toBeNull();
    // Floor at the mouth is close to the outside ground.
    expect(Math.abs(fo - world.heightAt(m.x, m.z))).toBeLessThan(2.5);
    // Deep chambers lie far below the mesa surface.
    for (const k of ['hall', 'westRoom', 'iceRoom'] as const) {
      const n = NODES[k];
      expect(world.heightAt(n.x, n.z) - (n.floor + n.r * 1.6)).toBeGreaterThan(60);
    }
  });
});

describe('cave mesh', () => {
  it('builds a reasonably sized mesh', () => {
    expect(mesh.stats.triangles).toBeGreaterThan(20000);
    expect(mesh.stats.triangles).toBeLessThan(400000);
    console.log('cave mesh', mesh.stats);
  });

  it('front faces point into the air', () => {
    const p = mesh.positions, idx = mesh.indices;
    let agree = 0, total = 0;
    for (let t = 0; t < idx.length; t += 3 * 37) {
      const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const g = caveGrad((p[a] + p[b] + p[c]) / 3, (p[a + 1] + p[b + 1] + p[c + 1]) / 3, (p[a + 2] + p[b + 2] + p[c + 2]) / 3);
      if (Math.hypot(nx, ny, nz) < 1e-6) continue;
      total++;
      if (-(nx * g[0] + ny * g[1] + nz * g[2]) > 0) agree++;
    }
    expect(agree / total).toBeGreaterThan(0.97);
  });

  it('has valid normals and AO', () => {
    for (let i = 0; i < mesh.ao.length; i += 101) {
      expect(mesh.ao[i]).toBeGreaterThanOrEqual(0.25);
      expect(mesh.ao[i]).toBeLessThanOrEqual(1);
      const l = Math.hypot(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]);
      expect(l).toBeCloseTo(1, 3);
    }
  });
});
