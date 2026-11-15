import { decodePng } from './png';

export interface WorldMeta {
  extent: number;
  cell: number;
  tile: number;
  tilesPerSide: number;
  tileRes: number;
  alphaRes: number;
  heightBase: number;
  heightSize: number;
  backdrop: { res: number; extent: number; base: number; size: number };
  minHeight: number;
  maxHeight: number;
}

/**
 * The CinderRain surface: a 2 m heightfield over [-extent, extent]² assembled from 513² r16 tiles,
 * per-tile splat weights, and a coarse backdrop grid for the horizon.
 * Packed splat layout per texel (RGBA): dark sand, bedrock, light sediment, gravel. Dust = 1 - sum.
 * Splat rows run north (row 0) to south.
 */
export class WorldData {
  readonly n: number;
  readonly heights: Uint16Array;
  readonly splats: Uint8Array[] = [];
  backdrop!: Uint16Array;

  constructor(readonly meta: WorldMeta) {
    this.n = meta.tilesPerSide * (meta.tileRes - 1) + 1;
    this.heights = new Uint16Array(this.n * this.n);
  }

  static async load(base: string, onProgress: (f: number) => void): Promise<WorldData> {
    const meta = (await (await fetchOk(`${base}world.json`)).json()) as WorldMeta;
    const w = new WorldData(meta);
    const NT = meta.tilesPerSide;
    const total = NT * NT * 3 + 1;
    let done = 0;
    const tick = () => onProgress(++done / total);

    const jobs: Promise<void>[] = [];
    for (let tz = 0; tz < NT; tz++)
      for (let tx = 0; tx < NT; tx++) {
        jobs.push(fetchOk(`${base}tiles/h_${tx}_${tz}.r16`).then(async (r) => { w.placeTile(tx, tz, new Uint16Array(await r.arrayBuffer())); tick(); }));
        jobs.push(w.loadSplat(base, tx, tz, tick));
      }
    jobs.push(fetchOk(`${base}backdrop_h.r16`).then(async (r) => { w.backdrop = new Uint16Array(await r.arrayBuffer()); tick(); }));
    await Promise.all(jobs);
    return w;
  }

  placeTile(tx: number, tz: number, data: Uint16Array): void {
    const R = this.meta.tileRes;
    if (data.length !== R * R) throw new Error(`tile ${tx},${tz} has ${data.length} samples, expected ${R * R}`);
    for (let j = 0; j < R; j++) {
      const dst = (tz * (R - 1) + j) * this.n + tx * (R - 1);
      this.heights.set(data.subarray(j * R, j * R + R), dst);
    }
  }

  private async loadSplat(base: string, tx: number, tz: number, tick: () => void): Promise<void> {
    const [a, b] = await Promise.all([0, 1].map(async (k) => {
      const png = await decodePng(await (await fetchOk(`${base}tiles/s_${tx}_${tz}_${k}.png`)).arrayBuffer());
      tick();
      return png;
    }));
    const A = this.meta.alphaRes;
    const out = new Uint8Array(A * A * 4);
    for (let i = 0; i < A * A; i++) {
      out[i * 4] = a.data[i * a.channels + 1]; // dark sand
      out[i * 4 + 1] = a.data[i * a.channels + 2]; // bedrock
      out[i * 4 + 2] = a.channels > 3 ? a.data[i * a.channels + 3] : 0; // light sediment
      out[i * 4 + 3] = b.data[i * b.channels]; // gravel
    }
    this.splats[tz * this.meta.tilesPerSide + tx] = out;
  }

  /** Mean terrain height over an axis-aligned world rectangle, sampled every `step` metres. */
  meanHeight(x0: number, x1: number, z0: number, z1: number, step = 2): number {
    let s = 0, c = 0;
    for (let x = x0; x <= x1; x += step) for (let z = z0; z <= z1; z += step) { s += this.heightAt(x, z); c++; }
    return c ? s / c : 0;
  }

  /**
   * Levels the terrain to height `h` inside a world rectangle, blending back to the original surface over
   * `blend` metres with a smoothstep. Must run before terrain, rocks and colliders are built. Used for the
   * outpost pad so the base model sits on level ground (CinderRain is not modified on disk).
   */
  flattenRect(x0: number, x1: number, z0: number, z1: number, h: number, blend: number): void {
    const { extent, cell, heightBase, heightSize } = this.meta;
    const n = this.n;
    const q = Math.round(((h - heightBase) / heightSize) * 65535);
    const i0 = Math.max(0, Math.floor((x0 - blend + extent) / cell)), i1 = Math.min(n - 1, Math.ceil((x1 + blend + extent) / cell));
    const j0 = Math.max(0, Math.floor((z0 - blend + extent) / cell)), j1 = Math.min(n - 1, Math.ceil((z1 + blend + extent) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = j * cell - extent;
      const dz = Math.max(z0 - z, 0, z - z1);
      for (let i = i0; i <= i1; i++) {
        const x = i * cell - extent;
        const dx = Math.max(x0 - x, 0, x - x1);
        const d = Math.hypot(dx, dz);
        if (d >= blend) continue;
        const t = d / blend, w = 1 - t * t * (3 - 2 * t); // 1 inside, smooth falloff to 0
        const k = j * n + i;
        this.heights[k] = Math.round(this.heights[k] * (1 - w) + q * w);
      }
    }
  }

  /**
   * Adds a smooth elongated rise (an old dune ridge) centred on (cx, cz): half-length `len` along `angle`
   * (radians from +X), half-width `width`, peak `height` metres, with low-frequency waviness on the crest.
   * Like flattenRect it must run before terrain, rocks and colliders are built.
   */
  raiseRidge(cx: number, cz: number, len: number, width: number, height: number, angle: number): void {
    const { extent, cell, heightSize } = this.meta;
    const n = this.n, r = Math.max(len, width) + 4;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const i0 = Math.max(0, Math.floor((cx - r + extent) / cell)), i1 = Math.min(n - 1, Math.ceil((cx + r + extent) / cell));
    const j0 = Math.max(0, Math.floor((cz - r + extent) / cell)), j1 = Math.min(n - 1, Math.ceil((cz + r + extent) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i * cell - extent - cx, z = j * cell - extent - cz;
      const u = (x * ca + z * sa) / len, v = (-x * sa + z * ca) / width;
      const d2 = u * u + v * v;
      if (d2 >= 1) continue;
      const w = Math.pow(1 - d2, 2) * (0.85 + 0.15 * Math.sin(u * 7.3 + 1.1));
      const k = j * n + i;
      this.heights[k] = Math.min(65535, Math.round(this.heights[k] + (height * w / heightSize) * 65535));
    }
  }

  /** Height at global grid index (clamped to the world). */
  sample(i: number, j: number): number {
    const n = this.n;
    i = i < 0 ? 0 : i >= n ? n - 1 : i;
    j = j < 0 ? 0 : j >= n ? n - 1 : j;
    return this.meta.heightBase + (this.heights[j * n + i] / 65535) * this.meta.heightSize;
  }

  /** Bilinear height in metres at world (x, z). */
  heightAt(x: number, z: number): number {
    const { extent, cell } = this.meta;
    const fx = (x + extent) / cell, fz = (z + extent) / cell;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const h00 = this.sample(i, j), h10 = this.sample(i + 1, j), h01 = this.sample(i, j + 1), h11 = this.sample(i + 1, j + 1);
    return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
  }

  /** Unit surface normal (x, y, z) at a world position, from central differences over `e` metres. */
  normalAt(x: number, z: number, e = 1): [number, number, number] {
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    const l = Math.hypot(dx, 1, dz);
    return [-dx / l, 1 / l, -dz / l];
  }

  /** Splat weights [dust, darkSand, bedrock, sediment, gravel] (0..1) at a world position. */
  splatAt(x: number, z: number): [number, number, number, number, number] {
    const { extent, tile, tilesPerSide: NT, alphaRes: A } = this.meta;
    const gx = x + extent, gz = z + extent;
    const tx = Math.min(NT - 1, Math.max(0, Math.floor(gx / tile)));
    const tz = Math.min(NT - 1, Math.max(0, Math.floor(gz / tile)));
    const s = this.splats[tz * NT + tx];
    if (!s) return [1, 0, 0, 0, 0];
    const px = Math.min(A - 1, Math.max(0, Math.floor(((gx - tx * tile) / tile) * A)));
    const py = Math.min(A - 1, Math.max(0, Math.floor((1 - (gz - tz * tile) / tile) * A)));
    const o = (py * A + px) * 4;
    const d = s[o] / 255, b = s[o + 1] / 255, se = s[o + 2] / 255, g = s[o + 3] / 255;
    return [Math.max(0, 1 - d - b - se - g), d, b, se, g];
  }

  inside(x: number, z: number, margin = 0): boolean {
    const e = this.meta.extent - margin;
    return x > -e && x < e && z > -e && z < e;
  }
}

async function fetchOk(url: string): Promise<Response> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`failed to load ${url} (${r.status})`);
  return r;
}
