// Diagnostics: connected components of one material's mesh, grouped by proximity (as the game's wheel splitter does),
// with each group's centre and size. Usage: node tools/glb-clusters.mjs <file.glb> <materialName> [groupDistance]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const matName = process.argv[3], gd = Number(process.argv[4] ?? 0.55);
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMaterial()?.getName() !== matName) continue;
    const m = node.getWorldMatrix();
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices().getArray();
    const v = [0, 0, 0], P = [];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); P.push([0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r])); }
    const parent = new Int32Array(P.length).map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const key = new Map();
    P.forEach((p, i) => { const k = p.map((x) => x.toFixed(4)).join(','); if (key.has(k)) parent[find(i)] = find(key.get(k)); else key.set(k, i); });
    for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]); parent[find(idx[t + 1])] = a; parent[find(idx[t + 2])] = a; }
    const comps = new Map();
    for (let t = 0; t < idx.length; t += 3) {
      const r = find(idx[t]);
      let c = comps.get(r);
      if (!c) comps.set(r, (c = { tris: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }));
      c.tris++;
      for (let k = 0; k < 3; k++) { const p = P[idx[t + k]]; for (let a = 0; a < 3; a++) { c.lo[a] = Math.min(c.lo[a], p[a]); c.hi[a] = Math.max(c.hi[a], p[a]); } }
    }
    const groups = [];
    for (const c of comps.values()) {
      const cx = (c.lo[0] + c.hi[0]) / 2, cz = (c.lo[2] + c.hi[2]) / 2;
      const g = groups.find((q) => Math.hypot(q.cx - cx, q.cz - cz) < gd);
      if (g) { g.tris += c.tris; g.lo = g.lo.map((x, a) => Math.min(x, c.lo[a])); g.hi = g.hi.map((x, a) => Math.max(x, c.hi[a])); g.parts++; }
      else groups.push({ cx, cz, tris: c.tris, lo: [...c.lo], hi: [...c.hi], parts: 1 });
    }
    console.log(`${node.getName()} / ${matName}: ${comps.size} components → ${groups.length} groups (distance ${gd} m)`);
    for (const g of groups.sort((a, b) => a.cz - b.cz || a.cx - b.cx)) console.log(`  centre x=${((g.lo[0] + g.hi[0]) / 2).toFixed(2)} y=${((g.lo[1] + g.hi[1]) / 2).toFixed(2)} z=${((g.lo[2] + g.hi[2]) / 2).toFixed(2)}  size ${g.hi.map((x, a) => (x - g.lo[a]).toFixed(2)).join('×')}  parts=${g.parts} tris=${g.tris}`);
  }
}
