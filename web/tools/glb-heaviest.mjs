// Lists the heaviest primitives of an (optimised) GLB with material and world bounds. Read-only.
// Usage: node tools/glb-heaviest.mjs <file.glb> [count]
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const rows = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const b = getBounds(node);
  for (const p of mesh.listPrimitives()) {
    const i = p.getIndices();
    const tris = (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    const tex = p.getMaterial()?.getBaseColorTexture()?.getSize();
    rows.push({ tris, node: node.getName(), mat: p.getMaterial()?.getName() ?? '-', tex: tex ? tex.join('x') : '-', size: b.max.map((v, k) => (v - b.min[k]).toFixed(1)).join('x'), centre: b.max.map((v, k) => ((v + b.min[k]) / 2).toFixed(1)).join(',') });
  }
}
rows.sort((a, b) => b.tris - a.tris);
for (const r of rows.slice(0, Number(process.argv[3] ?? 20))) console.log(`${String(Math.round(r.tris)).padStart(8)}  ${r.mat.slice(0, 34).padEnd(34)} tex=${r.tex.padEnd(10)} size=${r.size.padEnd(18)} c=${r.centre}  ${r.node}`);
const texSizes = {};
for (const t of doc.getRoot().listTextures()) { const s = t.getSize()?.join('x') ?? '?'; texSizes[s] = (texSizes[s] ?? 0) + 1; }
console.log('texture sizes:', texSizes);
