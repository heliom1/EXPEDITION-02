// Generates browser-sized copies of the user's GLB models.
// Sources (never modified): assets-src/models/*.glb  ->  outputs: public/assets/models/opt/<slot>.glb
// Usage: npm run optimize-models [-- <slot> ...]
// Pipeline: dedup -> prune -> cull strays -> weld -> simplify heavy meshes -> flatten/join -> targeted post-join simplify
// -> palette (untextured materials) + join again -> resize/WebP textures -> meshopt compression.
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, flatten, join, weld, simplifyPrimitive, textureCompress, meshopt, resample, palette } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';

const SRC = 'assets-src/models/';
const OUT = 'public/assets/models/opt/';

/** Per-slot settings. `cullBelowY`: drop meshes whose world bounds lie entirely below this height (stray fragments). */
const MODELS = {
  // Solar-array screws (548 k tris, invisible at the array's 72 m scale) are dropped; the arrays' other materials are made of
  // thousands of small cell meshes, so they are simplified again after joining (only those materials). 149 textures at 1024²
  // would need ~830 MB VRAM, so the base uses 512².
  outpost: { src: 'main base (1).glb', texSize: 512, heavyTris: 15000, heavyError: 0.004, cullBelowY: 15, dropTransmission: true,
    palette: true, dropMaterials: ['Metal_Screws'],
    // The south airlock's door panel is fused with its frame in the source; split it out so it can open (System G).
    splitParts: [{ node: 'door_003_01 - Default_0', as: 'CF_DOOR_south' }], postJoin: { minTris: 15000, error: 0.01, sloppyAbove: 30000, sloppyTarget: 20000,
      materials: ['Galvanised_Metal', 'Roofing', 'Shed_Cable', 'PVC_Pipe', 'Skylight_Clear_Panels'] } },
  astronaut: { src: 'mercenary_astronaut.glb', texSize: 1024, heavyTris: 8000, heavyError: 0.002 },
  // Vehicles keep their node hierarchy so wheels/doors stay separate parts for procedural animation.
  rover: { src: 'ROVER.glb', texSize: 1024, heavyTris: 20000, heavyError: 0.001, keepParts: true },
  vehicle: { src: 'VEHICLE.glb', texSize: 1024, heavyTris: 1e9, heavyError: 0, keepParts: true },
  handdrill: { src: 'drill.glb', texSize: 1024, heavyTris: 15000, heavyError: 0.002 },
};

function stats(doc) {
  const root = doc.getRoot();
  let tris = 0, prims = 0;
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
    prims++;
    const idx = p.getIndices();
    const n = idx ? idx.getCount() : p.getAttribute('POSITION')?.getCount() ?? 0;
    if (p.getMode() === 4) tris += n / 3;
  }
  const meshNodes = root.listNodes().filter((n) => n.getMesh()).length;
  const texBytes = root.listTextures().reduce((s, t) => s + (t.getImage()?.byteLength ?? 0), 0);
  return { meshNodes, primitives: prims, tris: Math.round(tris), materials: root.listMaterials().length, textures: root.listTextures().length, textureMB: +(texBytes / 1048576).toFixed(1), animations: root.listAnimations().length, skins: root.listSkins().length };
}

/** Remove mesh nodes whose world-space bounds are entirely below `y` (e.g. fragments left far under the floor). */
function cullBelow(y) {
  return (doc) => {
    let removed = 0;
    for (const node of doc.getRoot().listNodes()) {
      if (!node.getMesh() || node.getSkin()) continue;
      const b = getBounds(node);
      if (Number.isFinite(b.max[1]) && b.max[1] < y) { node.dispose(); removed++; }
    }
    console.log(`  culled ${removed} stray mesh nodes below y=${y}`);
  };
}

/** join() filter: nodes named CF_* (animated parts split out for gameplay) are never merged. */
const keepCF = (node) => !node.getName().startsWith('CF_');

const triCount = (prim) => { const i = prim.getIndices(); return (i ? i.getCount() : prim.getAttribute('POSITION').getCount()) / 3; };

/**
 * Simplify only primitives above a triangle threshold; small props keep full detail.
 * Topology-preserving simplification first; meshes made of thousands of disconnected pieces (e.g. solar-array cells)
 * barely reduce that way, so anything still above `sloppyAbove` triangles gets meshoptimizer's sloppy simplifier,
 * which merges vertices regardless of topology, down to `sloppyTarget` triangles.
 */
function simplifyHeavy(minTris, error, sloppyAbove = 60000, sloppyTarget = 30000, materials = null) {
  return (doc) => {
    if (!(error > 0)) return;
    let before = 0, after = 0, count = 0, sloppy = 0;
    for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
      const t = triCount(prim);
      if (t < minTris || prim.getMode() !== 4) continue;
      if (materials && !materials.includes(prim.getMaterial()?.getName())) continue;
      before += t;
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0, error, lockBorder: false });
      const pos = prim.getAttribute('POSITION');
      if (triCount(prim) > sloppyAbove && prim.getIndices() && pos.getArray() instanceof Float32Array) {
        const idx = Uint32Array.from(prim.getIndices().getArray());
        const [out] = MeshoptSimplifier.simplifySloppy(idx, pos.getArray(), 3, null, Math.floor(sloppyTarget) * 3, error * 4);
        if (out.length >= 3) {
          const acc = prim.getIndices();
          acc.setArray(pos.getCount() > 65535 ? out : Uint16Array.from(out));
          sloppy++;
        }
      }
      after += triCount(prim);
      count++;
    }
    console.log(`  simplified ${count} heavy primitives (${sloppy} sloppy): ${Math.round(before)} -> ${Math.round(after)} tris`);
  };
}

/**
 * Moves the moving part of a fused mesh into its own node so the game can animate it (e.g. a door panel that the source
 * modelled in the same mesh as its frame). Connected components are found after welding positions; every component
 * except the largest (the frame) moves to a new node named `as`. Nodes named CF_* are kept out of join().
 */
function splitMovingParts(parts) {
  return (doc) => {
    for (const { node: name, as } of parts) {
      const node = doc.getRoot().listNodes().find((n) => n.getName() === name);
      const mesh = node?.getMesh();
      if (!mesh) { console.warn(`  split: node "${name}" not found`); continue; }
      const prim = mesh.listPrimitives()[0];
      const pos = prim.getAttribute('POSITION'), indices = prim.getIndices();
      const idx = indices.getArray(), n = pos.getCount();
      const parent = new Int32Array(n).map((_, i) => i);
      const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      const key = new Map(), v = [0, 0, 0];
      for (let i = 0; i < n; i++) { pos.getElement(i, v); const k = v.map((x) => x.toFixed(4)).join(','); if (key.has(k)) parent[find(i)] = find(key.get(k)); else key.set(k, i); }
      for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]); parent[find(idx[t + 1])] = a; parent[find(idx[t + 2])] = a; }
      const count = new Map();
      for (let t = 0; t < idx.length; t += 3) { const r = find(idx[t]); count.set(r, (count.get(r) ?? 0) + 1); }
      const largest = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const keep = [], moved = [];
      for (let t = 0; t < idx.length; t += 3) (find(idx[t]) === largest ? keep : moved).push(idx[t], idx[t + 1], idx[t + 2]);
      if (!moved.length) { console.warn(`  split: "${name}" has a single component`); continue; }
      const Arr = n > 65535 ? Uint32Array : Uint16Array;
      indices.setArray(new Arr(keep));
      const prim2 = prim.clone();
      prim2.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Arr(moved)).setBuffer(indices.getBuffer()));
      const mesh2 = doc.createMesh(as).addPrimitive(prim2);
      const node2 = doc.createNode(as).setMesh(mesh2).setMatrix(node.getWorldMatrix());
      doc.getRoot().listScenes()[0].addChild(node2);
      console.log(`  split "${name}": ${moved.length / 3} tris -> ${as}, frame keeps ${keep.length / 3}`);
    }
  };
}

/** Remove every primitive using one of the named materials (invisible micro-detail). */
function dropMaterials(names) {
  return (doc) => {
    let n = 0, tris = 0;
    for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
      if (names.includes(prim.getMaterial()?.getName())) { tris += triCount(prim); prim.dispose(); n++; }
    }
    console.log(`  dropped ${n} primitives (${Math.round(tris)} tris) using ${names.join(', ')}`);
  };
}

/** Transmission needs a second scene render in three.js; the base's glass reads fine as plain alpha blending. */
function transmissionToAlpha(doc) {
  let n = 0;
  for (const mat of doc.getRoot().listMaterials()) {
    const tr = mat.getExtension('KHR_materials_transmission');
    if (!tr) continue;
    const t = tr.getTransmissionFactor();
    mat.setExtension('KHR_materials_transmission', null);
    mat.setAlphaMode('BLEND');
    const c = mat.getBaseColorFactor();
    mat.setBaseColorFactor([c[0], c[1], c[2], Math.min(c[3], Math.max(0.18, 1 - t * 0.85))]);
    mat.setDoubleSided(true);
    n++;
  }
  doc.getRoot().listExtensionsUsed().filter((e) => e.extensionName === 'KHR_materials_transmission').forEach((e) => e.dispose());
  console.log(`  converted ${n} transmission materials to alpha blending`);
}

async function run(slot) {
  const cfg = MODELS[slot];
  await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const t0 = Date.now();
  console.log(`\n[${slot}] reading ${cfg.src}`);
  const doc = await io.read(SRC + cfg.src);
  console.log('  before', stats(doc));
  const steps = [dedup(), prune()];
  if (cfg.cullBelowY !== undefined) steps.push(cullBelow(cfg.cullBelowY));
  if (cfg.dropTransmission) steps.push(transmissionToAlpha);
  if (cfg.dropMaterials) steps.push(dropMaterials(cfg.dropMaterials));
  if (cfg.splitParts) steps.push(splitMovingParts(cfg.splitParts));
  steps.push(
    resample(),
    weld(),
    // Simplify per original mesh, before joining, so small props are never caught in a big merged primitive.
    simplifyHeavy(cfg.heavyTris, cfg.heavyError, cfg.sloppyAbove, cfg.sloppyTarget),
    ...(cfg.keepParts ? [] : [flatten(), join({ keepNamed: false, filter: keepCF })]),
    ...(cfg.postJoin ? [simplifyHeavy(cfg.postJoin.minTris, cfg.postJoin.error, cfg.postJoin.sloppyAbove, cfg.postJoin.sloppyTarget, cfg.postJoin.materials)] : []),
    // Untextured materials -> shared palette textures, then join again: far fewer draw calls.
    ...(cfg.palette ? [palette({ min: 5 }), join({ keepNamed: false, filter: keepCF })] : []),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [cfg.texSize, cfg.texSize], quality: 82 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await doc.transform(...steps);
  console.log('  after ', stats(doc));
  mkdirSync(OUT, { recursive: true });
  const out = `${OUT}${slot}.glb`;
  await io.write(out, doc);
  console.log(`  wrote ${out} (${(statSync(out).size / 1048576).toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
for (const slot of wanted.length ? wanted : Object.keys(MODELS)) {
  if (!MODELS[slot]) { console.error(`unknown slot ${slot}; known: ${Object.keys(MODELS).join(', ')}`); process.exit(1); }
  await run(slot);
}
