// Lists nodes whose name matches a regex, with mesh triangle count, material(s) and world bounds. Read-only.
// Usage: node --max-old-space-size=12000 tools/glb-find.mjs <file.glb> <regex>
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const re = new RegExp(process.argv[3], 'i');
const path = (n) => { const parts = []; let p = n; while (p) { parts.unshift(p.getName()); p = p.getParentNode(); } return parts.join(' / '); };
for (const node of doc.getRoot().listNodes()) {
  if (!re.test(node.getName())) continue;
  const b = getBounds(node);
  const mesh = node.getMesh();
  const tris = mesh ? mesh.listPrimitives().reduce((s, p) => s + (p.getIndices()?.getCount() ?? 0) / 3, 0) : 0;
  const mats = mesh ? [...new Set(mesh.listPrimitives().map((p) => p.getMaterial()?.getName()))].join(',') : '-';
  const f = (v) => v.map((x) => x.toFixed(2)).join(',');
  console.log(`${path(node)}\n    mesh=${mesh ? mesh.getName() : '-'} tris=${tris} mats=${mats} children=${node.listChildren().length} min=(${f(b.min)}) max=(${f(b.max)})`);
}
