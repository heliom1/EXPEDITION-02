import { BufferGeometry, Color, DynamicDrawUsage, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3, Euler } from 'three';
import type { WorldData } from './worldData';
import type { LayerTextures } from '../rendering/textures';
import { mulberry32 } from './random';

export interface RockCollider { x: number; z: number; r: number; top: number }

interface ChunkRocks { shape: Uint8Array; mats: Float32Array; tints: Float32Array; colliders: RockCollider[] }

const SHAPES = 6;
const CAPACITY = 24000;

/**
 * Instanced rock scatter. Each nearby terrain chunk gets a deterministic set of rocks whose density
 * follows the CinderRain splat weights (gravel and bedrock fields, talus below steep ground) with
 * clustered noise, and a power-law size distribution (many pebbles, few boulders). All chunks share
 * one InstancedMesh per rock shape, so the whole scatter costs SHAPES draw calls.
 */
export class RockField {
  readonly meshes: InstancedMesh[] = [];
  private chunks = new Map<string, ChunkRocks>();
  private dirty = false;
  /** Rocks are scattered only on chunks at (or finer than) this terrain resolution. */
  minSegs = 128;

  constructor(private readonly world: WorldData, layers: LayerTextures) {
    const mat = new MeshStandardMaterial({ map: layers.albedo.Rock, normalMap: layers.normal.Rock, roughness: 0.9, metalness: 0 });
    for (let s = 0; s < SHAPES; s++) {
      const im = new InstancedMesh(makeRockGeometry(1000 + s * 77), mat, CAPACITY);
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.count = 0;
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      im.name = `Rocks_${s}`;
      this.meshes.push(im);
    }
  }

  /** Called by the terrain when a chunk is built (built=true) or removed. Rocks exist on fine chunks only. */
  onChunk(key: string, x0: number, z0: number, size: number, segs: number, built: boolean): void {
    if (!built) {
      if (this.chunks.delete(key)) this.dirty = true;
      return;
    }
    if (segs < this.minSegs) {
      if (this.chunks.delete(key)) this.dirty = true;
      return;
    }
    if (this.chunks.has(key)) return;
    this.chunks.set(key, this.scatter(x0, z0, size));
    this.dirty = true;
  }

  /** Rebuilds instance buffers after chunk changes. */
  commit(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const counts = new Array(SHAPES).fill(0);
    const c = new Color();
    for (const ch of this.chunks.values()) {
      for (let i = 0; i < ch.shape.length; i++) {
        const s = ch.shape[i];
        const im = this.meshes[s];
        const k = counts[s];
        if (k >= CAPACITY) continue;
        im.instanceMatrix.array.set(ch.mats.subarray(i * 16, i * 16 + 16), k * 16);
        c.setRGB(ch.tints[i * 3], ch.tints[i * 3 + 1], ch.tints[i * 3 + 2]);
        im.setColorAt(k, c);
        counts[s] = k + 1;
      }
    }
    this.meshes.forEach((im, s) => {
      im.count = counts[s];
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    });
  }

  /** Collision candidates near (x, z). */
  collidersNear(x: number, z: number, out: RockCollider[]): void {
    out.length = 0;
    for (const ch of this.chunks.values())
      for (const r of ch.colliders) if (Math.abs(r.x - x) < 6 && Math.abs(r.z - z) < 6) out.push(r);
  }

  get instanceCount(): number {
    return this.meshes.reduce((a, m) => a + m.count, 0);
  }

  private scatter(x0: number, z0: number, size: number): ChunkRocks {
    const w = this.world;
    const rnd = mulberry32(((Math.round(x0) * 73856093) ^ (Math.round(z0) * 19349663)) >>> 0);
    const cellSize = 2.6;
    const n = Math.floor(size / cellSize);
    const shape: number[] = [], mats: number[] = [], tints: number[] = [], colliders: RockCollider[] = [];
    const m = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3();
    const basalt = new Color(0x8a6254), rust = new Color(0xc98a62), ochre = new Color(0xd6a272), tint = new Color();
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = x0 + (i + rnd()) * cellSize, z = z0 + (j + rnd()) * cellSize;
        if (!w.inside(x, z, 4)) { rnd(); continue; }
        const [, dark, bed, , grav] = w.splatAt(x, z);
        const cluster = 0.5 + 0.5 * Math.sin(x * 0.043 + Math.sin(z * 0.031) * 2.1) * Math.sin(z * 0.051 + Math.sin(x * 0.027) * 1.7);
        const base = 0.012 + 0.22 * grav + 0.12 * bed + 0.03 * dark;
        const clusterF = 0.35 + 1.1 * cluster * cluster;
        const roll = rnd();
        if (roll > (base + 0.18) * clusterF) continue; // cheap upper bound before slope sampling
        const slope = 1 - w.normalAt(x, z, 3)[1];
        if (slope > 0.45) continue;
        // Talus: more rocks where the ground a few metres uphill is steep.
        const talus = Math.min(1, slope * 4 + (1 - w.normalAt(x, z, 10)[1]) * 3);
        if (roll > (base + 0.18 * talus) * clusterF) continue;
        const u = rnd();
        let scale = 0.12 + 1.15 * u * u * u * u;
        if (rnd() < 0.03 + talus * 0.05) scale = 1.2 + rnd() * 2.2; // occasional boulder
        const sh = Math.floor(rnd() * SHAPES);
        const flat = 0.5 + rnd() * 0.35;
        const y = w.heightAt(x, z) - scale * flat * 0.35;
        e.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.5);
        q.setFromEuler(e);
        s.set(scale * (0.8 + rnd() * 0.5), scale * flat, scale * (0.8 + rnd() * 0.5));
        p.set(x, y, z);
        m.compose(p, q, s);
        shape.push(sh);
        mats.push(...m.elements);
        const r = rnd();
        tint.copy(basalt).lerp(r < 0.5 ? rust : ochre, Math.min(1, dark * 0.5 + r)).multiplyScalar(0.85 + rnd() * 0.3);
        tints.push(tint.r, tint.g, tint.b);
        if (scale > 0.45) colliders.push({ x, z, r: scale * 0.85, top: y + scale * flat * 0.9 });
      }
    return { shape: Uint8Array.from(shape), mats: Float32Array.from(mats), tints: Float32Array.from(tints), colliders };
  }
}

/** Irregular rock: displaced icosahedron with a few planar fractures, flat-shaded. */
function makeRockGeometry(seed: number): BufferGeometry {
  const rnd = mulberry32(seed);
  const g = new IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position');
  const waves = Array.from({ length: 5 }, () => ({
    k: new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(1.5 + rnd() * 3),
    a: 0.05 + rnd() * 0.1,
    ph: rnd() * 6.28,
  }));
  const cuts = Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => ({
    n: new Vector3(rnd() - 0.5, rnd() - 0.2, rnd() - 0.5).normalize(),
    c: 0.55 + rnd() * 0.3,
  }));
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 1;
    for (const w of waves) r += w.a * Math.sin(v.dot(w.k) + w.ph);
    v.multiplyScalar(r);
    for (const c of cuts) {
      const d = v.dot(c.n);
      if (d > c.c) v.addScaledVector(c.n, c.c - d);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
