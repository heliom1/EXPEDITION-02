/**
 * The cave beneath the escarpment south of DRL-2, as a signed distance field (negative = air).
 * Pure math with no three.js import, so the same code runs in the mesher worker, in player
 * collision, in tests, and (mouth segments only) in the terrain shader that cuts the entrance.
 *
 * Layout (world metres): entrance in the north face of the mesa at about (-209, -330), a throat
 * descending south into a main chamber, a west branch to a side chamber, and a deeper passage to
 * the ice chamber about 140 m in and 17 m below the entrance, under ~150 m of rock.
 */

export interface CaveNode { x: number; z: number; floor: number; r: number }

export const NODES: Record<string, CaveNode> = {
  mouthOut: { x: -208, z: -317, floor: 7.4, r: 6.4 },
  mouthIn: { x: -210, z: -340, floor: 8.6, r: 7.2 },
  throat: { x: -213, z: -362, floor: 6.8, r: 4.4 },
  hall: { x: -222, z: -392, floor: 3.0, r: 10.0 },
  westNeck: { x: -256, z: -401, floor: 4.0, r: 4.0 },
  westRoom: { x: -280, z: -413, floor: 5.0, r: 6.8 },
  deepNeck: { x: -214, z: -424, floor: -2.0, r: 3.9 },
  deepBend: { x: -201, z: -447, floor: -6.0, r: 4.4 },
  iceRoom: { x: -195, z: -474, floor: -9.0, r: 14.0 },
};

/** Tunnel segments, entrance first. Segments 0..1 are the "mouth" mirrored in GLSL. */
export const SEGMENTS: Array<[string, string]> = [
  ['mouthOut', 'mouthIn'],
  ['mouthIn', 'throat'],
  ['throat', 'hall'],
  ['hall', 'westNeck'],
  ['westNeck', 'westRoom'],
  ['hall', 'deepNeck'],
  ['deepNeck', 'deepBend'],
  ['deepBend', 'iceRoom'],
];
export const MOUTH_SEGMENTS = 2;

/** Chambers: flattened spheres that widen the tunnel at nodes. */
export const CHAMBERS: Array<{ node: string; r: number; squash: number }> = [
  { node: 'hall', r: 11.5, squash: 1.45 },
  { node: 'westRoom', r: 7.5, squash: 1.35 },
  { node: 'iceRoom', r: 24.0, squash: 1.55 },
];

/** Centre height above the floor as a fraction of radius: tunnels are taller than half-tubes. */
export const CENTRE_LIFT = 0.55;
/** Vertical stretch of distances (>1 makes passages lower and wider). */
export const Y_STRETCH = 1.15;

/** Entrance reference point used for sky-visibility falloff. */
export const MOUTH = { x: -209.5, y: 12, z: -333 };
/** Centre of the ice deposit. */
export const ICE = { x: -192, y: -8.5, z: -480 };

/** Bounding box of all air (with margin) — mesher domain. */
export const BOUNDS = { min: [-300, -16, -512] as const, max: [-158, 30, -305] as const };

// ---------------------------------------------------------------------------
// Noise: warped sinusoids. Deterministic and cheap; identical in GLSL (see caveGlsl.ts).
export const NOISE_WAVES: Array<[number, number, number, number, number]> = [
  // kx, ky, kz, phase, amplitude
  [0.31, 0.17, 0.23, 1.3, 0.55],
  [-0.19, 0.29, 0.37, 4.1, 0.45],
  [0.53, -0.41, 0.11, 2.2, 0.28],
  [0.07, 0.61, -0.67, 5.7, 0.22],
];

export function wallNoise(x: number, y: number, z: number): number {
  let n = 0;
  for (const [kx, ky, kz, ph, a] of NOISE_WAVES) {
    const warp = 0.9 * Math.sin(x * kz * 1.7 + z * kx * 1.3 + ph * 0.5);
    n += a * Math.sin(x * kx + y * ky + z * kz + ph + warp);
  }
  return n;
}

/** Small-scale relief (JS only; amplitude is below the shader's overlap tolerance). */
function fineNoise(x: number, y: number, z: number): number {
  return 0.12 * Math.sin(x * 1.37 + Math.sin(z * 1.11) * 1.5) * Math.sin(y * 1.53 + Math.sin(x * 0.93)) +
    0.07 * Math.sin(z * 2.9 + y * 2.3 + Math.sin(x * 2.1));
}

function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

// Precomputed segment data.
interface Seg { ax: number; ay: number; az: number; bx: number; by: number; bz: number; ra: number; rb: number; fa: number; fb: number; len2: number }
const SEG: Seg[] = SEGMENTS.map(([a, b]) => {
  const A = NODES[a], B = NODES[b];
  const ay = A.floor + A.r * CENTRE_LIFT, by = B.floor + B.r * CENTRE_LIFT;
  return { ax: A.x, ay, az: A.z, bx: B.x, by, bz: B.z, ra: A.r, rb: B.r, fa: A.floor, fb: B.floor, len2: (B.x - A.x) ** 2 + (by - ay) ** 2 + (B.z - A.z) ** 2 };
});
const CH = CHAMBERS.map((c) => { const n = NODES[c.node]; return { x: n.x, y: n.floor + c.r * 0.45, z: n.z, r: c.r, squash: c.squash, floor: n.floor }; });

/**
 * Signed distance to cave air (negative inside air). `fine` adds sub-metre relief used for meshing
 * and collision; the shader mirror omits it.
 */
export function caveSdf(x: number, y: number, z: number, fine = true, segCount = SEG.length): number {
  let d = 1e9;
  let floor = 0;
  let best = 1e9;
  for (let i = 0; i < segCount; i++) {
    const s = SEG[i];
    const abx = s.bx - s.ax, aby = s.by - s.ay, abz = s.bz - s.az;
    let t = ((x - s.ax) * abx + (y - s.ay) * aby + (z - s.az) * abz) / s.len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = s.ax + abx * t, cy = s.ay + aby * t, cz = s.az + abz * t;
    const dx = x - cx, dy = (y - cy) * Y_STRETCH, dz = z - cz;
    const r = s.ra + (s.rb - s.ra) * t;
    const di = Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
    if (di < best) { best = di; floor = s.fa + (s.fb - s.fa) * t; }
    d = smin(d, di, 3);
  }
  if (segCount === SEG.length)
    for (const c of CH) {
      const dx = x - c.x, dy = (y - c.y) * c.squash, dz = z - c.z;
      const di = Math.sqrt(dx * dx + dy * dy + dz * dz) - c.r;
      if (di < best) { best = di; floor = c.floor; }
      d = smin(d, di, 5);
    }
  const n = wallNoise(x, y, z) + (fine ? fineNoise(x, y, z) : 0);
  d += n * 1.1;
  // Flat-ish floor with gentle rubble undulation; a soft junction to the walls.
  const floorY = floor + 0.35 * Math.sin(x * 0.7 + Math.sin(z * 0.5) * 2) * Math.sin(z * 0.6) + (fine ? 0.08 * Math.sin(x * 3.1 + z * 2.7) : 0);
  return smax(d, floorY - y, 1.2);
}

/** Gradient of the SDF (points from air towards rock). */
export function caveGrad(x: number, y: number, z: number, e = 0.15): [number, number, number] {
  const gx = caveSdf(x + e, y, z) - caveSdf(x - e, y, z);
  const gy = caveSdf(x, y + e, z) - caveSdf(x, y - e, z);
  const gz = caveSdf(x, y, z + e) - caveSdf(x, y, z - e);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}

/** Quick reject: true when (x, z) is nowhere near the cave footprint. */
export function nearCave(x: number, z: number, margin = 2): boolean {
  return x > BOUNDS.min[0] - margin && x < BOUNDS.max[0] + margin && z > BOUNDS.min[2] - margin && z < BOUNDS.max[2] + margin;
}

/**
 * Highest cave floor at or below `yStart` (air above, rock below), searching down `range` metres.
 * Returns null when no floor exists (e.g. outside the cave).
 */
export function caveFloorBelow(x: number, yStart: number, z: number, range = 8): number | null {
  if (!nearCave(x, z)) return null;
  let prev = caveSdf(x, yStart, z);
  if (prev > 0) return null; // start point is in rock
  const step = 0.3;
  for (let y = yStart - step; y >= yStart - range; y -= step) {
    const d = caveSdf(x, y, z);
    if (d > 0) {
      // Bisection between y (rock) and y + step (air).
      let lo = y, hi = y + step;
      for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2; if (caveSdf(x, m, z) > 0) lo = m; else hi = m; }
      return (lo + hi) / 2;
    }
    prev = d;
  }
  return null;
}

/** 0 at the entrance → 1 deep inside: how much daylight is blocked. Mirrored in GLSL. */
export function caveDepthFactor(x: number, y: number, z: number): number {
  const d = Math.hypot(x - MOUTH.x, (y - MOUTH.y) * 0.6, z - MOUTH.z);
  const t = Math.min(1, Math.max(0, (d - 5) / 24));
  return t * t * (3 - 2 * t);
}
