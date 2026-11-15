// Splits one node's mesh into connected components (after welding) and prints each component's bounds. Read-only.
// Used to find the moving parts (e.g. door panels) inside a single fused mesh.
// Usage: node --max-old-space-size=12000 tools/glb-components.mjs <file.glb> <exact node name>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const node = doc.getRoot().listNodes().find((n) => n.getName() === process.argv[3]);
if (!node?.getMesh()) throw new Error('node with mesh not found');
await doc.transform(weld());
const m = node.getWorldMatrix();
const xf = (p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
for (const prim of node.getMesh().listPrimitives()) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray();
  const n = pos.getCount(), parent = new Int32Array(n).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  // Union by position too (UV seams leave duplicate vertices after weld).
  const key = new Map(), v = [0, 0, 0];
  for (let i = 0; i < n; i++) { pos.getElement(i, v); const k = v.map((x) => x.toFixed(4)).join(','); if (key.has(k)) parent[find(i)] = find(key.get(k)); else key.set(k, i); }
  for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]); parent[find(idx[t + 1])] = a; parent[find(idx[t + 2])] = a; }
  const comps = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const r = find(idx[t]);
    let c = comps.get(r);
    if (!c) { c = { tris: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }; comps.set(r, c); }
    c.tris++;
    for (let k = 0; k < 3; k++) { pos.getElement(idx[t + k], v); const w = xf(v); for (let a = 0; a < 3; a++) { c.lo[a] = Math.min(c.lo[a], w[a]); c.hi[a] = Math.max(c.hi[a], w[a]); } }
  }
  const list = [...comps.values()].sort((a, b) => b.tris - a.tris);
  console.log(`${list.length} components`);
  for (const c of list.slice(0, 40)) console.log(`${String(c.tris).padStart(6)} tris  size=${c.hi.map((x, a) => (x - c.lo[a]).toFixed(2)).join('x')}  min=${c.lo.map((x) => x.toFixed(2))}  max=${c.hi.map((x) => x.toFixed(2))}`);
}
