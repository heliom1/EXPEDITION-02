// Read-only GLB inspector: reads only the 20-byte header and the JSON chunk, never the binary payload,
// so even very large files are cheap to inspect. Usage: node tools/inspect-glb.mjs <file.glb> [--tree] [--json out.json]
import { openSync, readSync, closeSync, statSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const showTree = args.includes('--tree');
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
if (!file) { console.error('usage: node tools/inspect-glb.mjs <file.glb> [--tree] [--json out.json]'); process.exit(1); }

const fd = openSync(file, 'r');
const head = Buffer.alloc(20);
readSync(fd, head, 0, 20, 0);
if (head.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
const version = head.readUInt32LE(4);
const jsonLen = head.readUInt32LE(12);
if (head.readUInt32LE(16) !== 0x4e4f534a) throw new Error('first chunk is not JSON');
const jbuf = Buffer.alloc(jsonLen);
readSync(fd, jbuf, 0, jsonLen, 20);
closeSync(fd);
const g = JSON.parse(jbuf.toString('utf8'));

// ---- math (column-major 4x4) ----
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0,
    (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0,
    (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const xf = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);

const acc = g.accessors ?? [];
const meshes = g.meshes ?? [];
const nodes = g.nodes ?? [];
function meshStats(mi) {
  let tris = 0, verts = 0;
  for (const p of meshes[mi].primitives) {
    const pos = acc[p.attributes.POSITION];
    verts += pos?.count ?? 0;
    const mode = p.mode ?? 4;
    const n = p.indices !== undefined ? acc[p.indices].count : pos?.count ?? 0;
    if (mode === 4) tris += n / 3;
  }
  return { tris, verts };
}
function meshBox(mi, m) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of meshes[mi].primitives) {
    const a = acc[p.attributes.POSITION];
    if (!a?.min || !a?.max) continue;
    for (let i = 0; i < 8; i++) {
      const c = [i & 1 ? a.max[0] : a.min[0], i & 2 ? a.max[1] : a.min[1], i & 4 ? a.max[2] : a.min[2]];
      const w = xf(m, c);
      for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); }
    }
  }
  return { lo, hi };
}
const merge = (A, B) => ({ lo: A.lo.map((v, k) => Math.min(v, B.lo[k])), hi: A.hi.map((v, k) => Math.max(v, B.hi[k])) });
const empty = () => ({ lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] });

// ---- traverse ----
const sceneIdx = g.scene ?? 0;
const roots = g.scenes?.[sceneIdx]?.nodes ?? [];
let total = empty(), totalTris = 0, meshNodes = 0;
const topLevel = [];
const lines = [];
function walk(ni, parent, depth, top) {
  const n = nodes[ni];
  const m = mul(parent, trs(n));
  let box = empty(), tris = 0;
  if (n.mesh !== undefined) {
    box = meshBox(n.mesh, m);
    tris = meshStats(n.mesh).tris;
    meshNodes++;
  }
  const kids = [];
  for (const c of n.children ?? []) {
    const r = walk(c, m, depth + 1, top);
    box = merge(box, r.box); tris += r.tris;
  }
  if (showTree && depth < 4) {
    const size = box.hi[0] > -Infinity ? box.hi.map((v, k) => (v - box.lo[k]).toFixed(2)).join('×') : '-';
    lines.push(`${'  '.repeat(depth)}${n.name ?? `node${ni}`}${n.mesh !== undefined ? ' [mesh]' : ''}${n.skin !== undefined ? ' [skinned]' : ''}  tris=${Math.round(tris)} size=${size}`);
  }
  return { box, tris, kids };
}
for (const r of roots) {
  const res = walk(r, ident(), 0);
  total = merge(total, res.box); totalTris += res.tris;
  topLevel.push({ name: nodes[r].name, tris: Math.round(res.tris), box: res.box });
}
// second level detail for single-root files (common Blender export: one root with many children)
const groups = [];
const groupRoots = roots.length === 1 && (nodes[roots[0]].children?.length ?? 0) > 1 ? nodes[roots[0]].children : roots;
const rootM = roots.length === 1 && groupRoots !== roots ? trs(nodes[roots[0]]) : ident();
for (const gi of groupRoots) {
  const r = walk(gi, rootM, 99);
  groups.push({ name: nodes[gi].name ?? `node${gi}`, tris: Math.round(r.tris), center: r.box.lo.map((v, k) => +((v + r.box.hi[k]) / 2).toFixed(2)), size: r.box.lo.map((v, k) => +(r.box.hi[k] - v).toFixed(2)) });
}

const bv = g.bufferViews ?? [];
const images = (g.images ?? []).map((im, i) => ({ i, name: im.name ?? im.uri ?? `image${i}`, mime: im.mimeType, MB: im.bufferView !== undefined ? +(bv[im.bufferView].byteLength / 1048576).toFixed(2) : null }));
const report = {
  file: basename(file),
  fileMB: +(statSync(file).size / 1048576).toFixed(2),
  gltfVersion: g.asset?.version, generator: g.asset?.generator, glbContainer: version,
  extensionsUsed: g.extensionsUsed ?? [], extensionsRequired: g.extensionsRequired ?? [],
  counts: { nodes: nodes.length, meshNodes, meshes: meshes.length, materials: (g.materials ?? []).length, textures: (g.textures ?? []).length, images: images.length, animations: (g.animations ?? []).length, skins: (g.skins ?? []).length, cameras: (g.cameras ?? []).length },
  triangles: Math.round(totalTris),
  bounds: { min: total.lo.map((v) => +v.toFixed(3)), max: total.hi.map((v) => +v.toFixed(3)), size: total.lo.map((v, k) => +(total.hi[k] - v).toFixed(3)) },
  rootNodes: topLevel.map((t) => t.name),
  groups: groups.sort((a, b) => b.tris - a.tris),
  materials: (g.materials ?? []).map((m) => m.name),
  imagesTotalMB: +images.reduce((s, i) => s + (i.MB ?? 0), 0).toFixed(2),
  largestImages: images.filter((i) => i.MB).sort((a, b) => b.MB - a.MB).slice(0, 8),
  animations: (g.animations ?? []).map((a) => ({ name: a.name, channels: a.channels.length })),
  skins: (g.skins ?? []).map((s) => ({ name: s.name, joints: s.joints.length })),
};
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, groups: report.groups.slice(0, 40) }, null, 1));
if (showTree) console.log('\n--- tree (depth<4) ---\n' + lines.reverse().join('\n'));
