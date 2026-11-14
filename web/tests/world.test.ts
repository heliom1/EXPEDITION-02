import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng } from '../src/world/png';
import { WorldData, type WorldMeta } from '../src/world/worldData';

const W = join(__dirname, '..', 'public', 'world');
const meta = JSON.parse(readFileSync(join(W, 'world.json'), 'utf8')) as WorldMeta;
const buf = (p: string) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

let world: WorldData;
beforeAll(() => {
  world = new WorldData(meta);
  for (let tz = 0; tz < meta.tilesPerSide; tz++)
    for (let tx = 0; tx < meta.tilesPerSide; tx++) {
      const b = readFileSync(join(W, 'tiles', `h_${tx}_${tz}.r16`));
      world.placeTile(tx, tz, new Uint16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
    }
});

describe('PNG decoder', () => {
  it('decodes a splat tile with exact, normalised weights', async () => {
    const a = await decodePng(buf(join(W, 'tiles', 's_2_2_0.png')));
    const b = await decodePng(buf(join(W, 'tiles', 's_2_2_1.png')));
    expect(a.width).toBe(meta.alphaRes);
    expect(a.channels).toBe(4);
    // Five weights should sum to ~1 everywhere (8-bit rounding tolerance).
    let worst = 0;
    for (let i = 0; i < a.width * a.height; i += 97) {
      const sum = a.data[i * 4] + a.data[i * 4 + 1] + a.data[i * 4 + 2] + a.data[i * 4 + 3] + b.data[i * b.channels];
      worst = Math.max(worst, Math.abs(sum - 255));
    }
    expect(worst).toBeLessThanOrEqual(4);
  });
});

describe('Heightfield', () => {
  it('stays inside the metadata height range', () => {
    let min = Infinity, max = -Infinity;
    for (let j = 0; j < world.n; j += 7) for (let i = 0; i < world.n; i += 7) { const h = world.sample(i, j); min = Math.min(min, h); max = Math.max(max, h); }
    expect(min).toBeGreaterThanOrEqual(meta.minHeight - 0.5);
    expect(max).toBeLessThanOrEqual(meta.maxHeight + 0.5);
  });

  it('bilinear height equals samples at grid points and is continuous', () => {
    const x = -1250, z = 1150;
    const i = (x + meta.extent) / meta.cell, j = (z + meta.extent) / meta.cell;
    expect(world.heightAt(x, z)).toBeCloseTo(world.sample(i, j), 5);
    const a = world.heightAt(x + 0.999, z), b = world.heightAt(x + 1.001, z);
    expect(Math.abs(a - b)).toBeLessThan(0.05);
  });

  it('adjacent tiles share identical border samples (no seams)', () => {
    const R = meta.tileRes;
    for (const [ta, tb] of [[[0, 0], [1, 0]], [[2, 3], [2, 4]]] as const) {
      const ra = readFileSync(join(W, 'tiles', `h_${ta[0]}_${ta[1]}.r16`)), rb = readFileSync(join(W, 'tiles', `h_${tb[0]}_${tb[1]}.r16`));
      const A = new Uint16Array(ra.buffer.slice(ra.byteOffset, ra.byteOffset + ra.byteLength)), B = new Uint16Array(rb.buffer.slice(rb.byteOffset, rb.byteOffset + rb.byteLength));
      let maxDiff = 0;
      for (let k = 0; k < R; k++) {
        const va = ta[0] !== tb[0] ? A[k * R + (R - 1)] : A[(R - 1) * R + k];
        const vb = ta[0] !== tb[0] ? B[k * R] : B[k];
        maxDiff = Math.max(maxDiff, Math.abs(va - vb));
      }
      expect(maxDiff).toBeLessThanOrEqual(1);
    }
  });

  it('mission sites are on walkable ground', () => {
    for (const [x, z] of [[-1250, 1150], [150, 900], [-20, -320], [-190, -305]]) {
      const n = world.normalAt(x, z, 2);
      expect(n[1]).toBeGreaterThan(Math.cos((25 * Math.PI) / 180));
    }
  });
});
