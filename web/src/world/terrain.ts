import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, Vector4 } from 'three';
import type { WorldData } from './worldData';
import type { LayerTextures } from '../rendering/textures';
import { createTerrainMaterial, makeSplatTexture } from './terrainMaterial';

export const CHUNK_SIZE = 256;
const COARSE_SEGS = 64; // 16 m spacing for whole far tiles

export interface TerrainQuality {
  /** Chebyshev chunk distance within which a tile is split into chunks. */
  splitRadius: number;
  /** [maxChunkDistance, segments] from fine to coarse. */
  lods: Array<[number, number]>;
}

export const QUALITY_HIGH: TerrainQuality = { splitRadius: 4, lods: [[1, 128], [2, 64], [4, 32], [99, 16]] };
export const QUALITY_LOW: TerrainQuality = { splitRadius: 3, lods: [[1, 64], [2, 32], [99, 16]] };

interface ChunkEntry { mesh: Mesh; segs: number }
interface TileEntry { coarse: Mesh | null; chunks: Map<number, ChunkEntry>; material: MeshStandardMaterial }

export type ChunkListener = (key: string, x0: number, z0: number, size: number, segs: number, built: boolean) => void;

/**
 * Streams the CinderRain heightfield as LOD meshes. Every tile always has geometry (coarse when far),
 * so there are never holes; tiles near the player are replaced by 4×4 chunks whose resolution falls
 * off with distance. Skirts hide cracks between neighbouring LODs. Geometry is built on the main
 * thread from the precomputed heightfield under a per-frame time budget (no procedural noise at runtime).
 */
export class Terrain {
  readonly group = new Group();
  private tiles: TileEntry[] = [];
  private indexCache = new Map<number, Uint32Array>();
  private queue: Array<() => void> = [];
  private lastKey = '';
  private readonly cpt: number; // chunks per tile
  private readonly NT: number;
  quality: TerrainQuality = QUALITY_HIGH;
  onChunk: ChunkListener | null = null;
  stats = { chunks: 0, coarse: 0, queued: 0 };

  constructor(private readonly world: WorldData, layers: LayerTextures) {
    const m = world.meta;
    this.NT = m.tilesPerSide;
    this.cpt = Math.round(m.tile / CHUNK_SIZE);
    this.group.name = 'Terrain';
    for (let tz = 0; tz < this.NT; tz++)
      for (let tx = 0; tx < this.NT; tx++) {
        const xmin = -m.extent + tx * m.tile, zmin = -m.extent + tz * m.tile;
        const splat = makeSplatTexture(world.splats[tz * this.NT + tx], m.alphaRes);
        const material = createTerrainMaterial(layers, splat, new Vector4(xmin, zmin + m.tile, m.tile, 0));
        const tile: TileEntry = { coarse: null, chunks: new Map(), material };
        this.tiles.push(tile);
        tile.coarse = this.buildMesh(xmin, zmin, m.tile, COARSE_SEGS, material);
        this.group.add(tile.coarse);
      }
  }

  /** Updates the desired LOD layout around (x, z) and processes queued builds within `budgetMs`. */
  update(x: number, z: number, budgetMs: number): void {
    const m = this.world.meta;
    const pcx = Math.floor((x + m.extent) / CHUNK_SIZE);
    const pcz = Math.floor((z + m.extent) / CHUNK_SIZE);
    const key = `${pcx},${pcz},${this.quality.splitRadius}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.plan(pcx, pcz);
    }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) this.queue.shift()!();
    this.stats.queued = this.queue.length;
  }

  /** Builds everything pending (used during loading screens). */
  flush(): void {
    while (this.queue.length) this.queue.shift()!();
    this.stats.queued = 0;
  }

  get pending(): number {
    return this.queue.length;
  }

  private plan(pcx: number, pcz: number): void {
    const cpt = this.cpt;
    const jobs: Array<{ d: number; run: () => void }> = [];
    for (let tz = 0; tz < this.NT; tz++)
      for (let tx = 0; tx < this.NT; tx++) {
        const tile = this.tiles[tz * this.NT + tx];
        // Chebyshev distance from the player chunk to the nearest chunk of this tile.
        const dx = Math.max(tx * cpt - pcx, 0, pcx - (tx * cpt + cpt - 1));
        const dz = Math.max(tz * cpt - pcz, 0, pcz - (tz * cpt + cpt - 1));
        const split = Math.max(dx, dz) <= this.quality.splitRadius;
        if (split) {
          let missing = 0;
          for (let cz = 0; cz < cpt; cz++)
            for (let cx = 0; cx < cpt; cx++) {
              const gcx = tx * cpt + cx, gcz = tz * cpt + cz;
              const d = Math.max(Math.abs(gcx - pcx), Math.abs(gcz - pcz));
              const segs = this.segsFor(d);
              const id = cz * cpt + cx;
              const cur = tile.chunks.get(id);
              if (cur && cur.segs === segs) continue;
              if (!cur) missing++;
              jobs.push({ d, run: () => this.buildChunk(tile, tx, tz, cx, cz, segs) });
            }
          if (tile.coarse && missing === 0) this.dropCoarse(tile);
        } else if (tile.chunks.size) {
          jobs.push({ d: 50, run: () => this.collapse(tile, tx, tz) });
        }
      }
    jobs.sort((a, b) => a.d - b.d);
    this.queue = jobs.map((j) => j.run);
  }

  private segsFor(d: number): number {
    for (const [maxD, segs] of this.quality.lods) if (d <= maxD) return segs;
    return 16;
  }

  private buildChunk(tile: TileEntry, tx: number, tz: number, cx: number, cz: number, segs: number): void {
    const m = this.world.meta;
    const id = cz * this.cpt + cx;
    const cur = tile.chunks.get(id);
    if (cur && cur.segs === segs) return;
    const x0 = -m.extent + tx * m.tile + cx * CHUNK_SIZE, z0 = -m.extent + tz * m.tile + cz * CHUNK_SIZE;
    const mesh = this.buildMesh(x0, z0, CHUNK_SIZE, segs, tile.material);
    mesh.castShadow = segs >= 64;
    this.group.add(mesh);
    const key = `${tx * this.cpt + cx},${tz * this.cpt + cz}`;
    if (cur) {
      this.disposeMesh(cur.mesh);
      this.onChunk?.(key, x0, z0, CHUNK_SIZE, cur.segs, false);
    }
    tile.chunks.set(id, { mesh, segs });
    this.onChunk?.(key, x0, z0, CHUNK_SIZE, segs, true);
    if (tile.coarse && tile.chunks.size === this.cpt * this.cpt) this.dropCoarse(tile);
    this.countStats();
  }

  private dropCoarse(tile: TileEntry): void {
    if (!tile.coarse) return;
    this.disposeMesh(tile.coarse);
    tile.coarse = null;
    this.countStats();
  }

  private collapse(tile: TileEntry, tx: number, tz: number): void {
    const m = this.world.meta;
    if (!tile.coarse) {
      tile.coarse = this.buildMesh(-m.extent + tx * m.tile, -m.extent + tz * m.tile, m.tile, COARSE_SEGS, tile.material);
      this.group.add(tile.coarse);
    }
    for (const [id, c] of tile.chunks) {
      const cx = id % this.cpt, cz = Math.floor(id / this.cpt);
      this.disposeMesh(c.mesh);
      this.onChunk?.(`${tx * this.cpt + cx},${tz * this.cpt + cz}`, 0, 0, CHUNK_SIZE, c.segs, false);
    }
    tile.chunks.clear();
    this.countStats();
  }

  private countStats(): void {
    let chunks = 0, coarse = 0;
    for (const t of this.tiles) { chunks += t.chunks.size; if (t.coarse) coarse++; }
    this.stats.chunks = chunks;
    this.stats.coarse = coarse;
  }

  private disposeMesh(mesh: Mesh): void {
    this.group.remove(mesh);
    mesh.geometry.dispose();
  }

  /** Grid mesh sampled exactly on heightfield points, with analytic normals and double-wound skirts. */
  buildMesh(x0: number, z0: number, size: number, segs: number, material: MeshStandardMaterial): Mesh {
    const w = this.world;
    const { extent, cell } = w.meta;
    const n1 = segs + 1;
    const stepCells = Math.round(size / segs / cell);
    const step = stepCells * cell;
    const i0 = Math.round((x0 + extent) / cell), j0 = Math.round((z0 + extent) / cell);
    const skirtDepth = 1.5 + step * 1.5;
    const vCount = n1 * n1 + 4 * n1;
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    let v = 0;
    for (let j = 0; j < n1; j++)
      for (let i = 0; i < n1; i++, v++) {
        const gi = i0 + i * stepCells, gj = j0 + j * stepCells;
        pos[v * 3] = x0 + i * step;
        pos[v * 3 + 1] = w.sample(gi, gj);
        pos[v * 3 + 2] = z0 + j * step;
        const dx = (w.sample(gi + stepCells, gj) - w.sample(gi - stepCells, gj)) / (2 * step);
        const dz = (w.sample(gi, gj + stepCells) - w.sample(gi, gj - stepCells)) / (2 * step);
        const l = Math.hypot(dx, 1, dz);
        nor[v * 3] = -dx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = -dz / l;
      }
    // Skirt vertices: copies of each edge, lowered.
    const edge = (k: number, e: number) => (e === 0 ? k : e === 1 ? segs * n1 + k : e === 2 ? k * n1 : k * n1 + segs);
    for (let e = 0; e < 4; e++)
      for (let k = 0; k < n1; k++, v++) {
        const src = edge(k, e);
        pos[v * 3] = pos[src * 3];
        pos[v * 3 + 1] = pos[src * 3 + 1] - skirtDepth;
        pos[v * 3 + 2] = pos[src * 3 + 2];
        nor[v * 3] = nor[src * 3]; nor[v * 3 + 1] = nor[src * 3 + 1]; nor[v * 3 + 2] = nor[src * 3 + 2];
      }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('normal', new BufferAttribute(nor, 3));
    g.setIndex(new BufferAttribute(this.indices(segs), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const mesh = new Mesh(g, material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  private indices(segs: number): Uint32Array {
    const cached = this.indexCache.get(segs);
    if (cached) return cached;
    const n1 = segs + 1;
    const grid = segs * segs * 6;
    const skirt = 4 * segs * 12;
    const idx = new Uint32Array(grid + skirt);
    let p = 0;
    for (let j = 0; j < segs; j++)
      for (let i = 0; i < segs; i++) {
        const a = j * n1 + i, b = a + 1, c = a + n1, d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = b;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    const edge = (k: number, e: number) => (e === 0 ? k : e === 1 ? segs * n1 + k : e === 2 ? k * n1 : k * n1 + segs);
    const base = n1 * n1;
    for (let e = 0; e < 4; e++)
      for (let k = 0; k < segs; k++) {
        const a = edge(k, e), b = edge(k + 1, e);
        const sa = base + e * n1 + k, sb = sa + 1;
        // Both windings so the skirt is visible from either side without DoubleSide on the terrain.
        idx[p++] = a; idx[p++] = sa; idx[p++] = b;
        idx[p++] = b; idx[p++] = sa; idx[p++] = sb;
        idx[p++] = a; idx[p++] = b; idx[p++] = sa;
        idx[p++] = b; idx[p++] = sb; idx[p++] = sa;
      }
    this.indexCache.set(segs, idx);
    return idx;
  }
}
