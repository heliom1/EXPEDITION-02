import {
  BackSide, Color, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, PMREMGenerator, Scene, SphereGeometry, Vector3,
  type Material, type MeshStandardMaterial, type Object3D, type Texture, type WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PALETTE } from '../core/config';
import { StructureGrid } from '../world/structureGrid';
import type { DoorSpec } from '../world/doors';
import type { WorldData } from '../world/worldData';

/**
 * The user's outpost ("Crimson Amalthea" complete base) â€” `main base (1).glb`, optimised by tools/optimize-models.mjs.
 * Measurements come from tools/inspect-glb.mjs (see docs/ASSET_REGISTER.md):
 *  - metre scale, no rescale; layout already matches the reference plan with +Z = north
 *    (Communications & Shields north, Farm west, Storage east, airlock/Exit south) â†’ no rotation;
 *  - the main dome's centre is at model (0.9, 27.5) in XZ, the base stands on model y â‰ˆ 21.5.
 */
export const OUTPOST_MODEL = {
  file: 'opt/outpost.glb',
  domeCenter: { x: 0.9, z: 27.5 },
  groundY: 21.5,
  /** Whole layout relative to the dome centre (tower, windmill and solar arrays included). */
  footprint: { x0: -69, x1: 62, z0: -126, z1: 63 },
  /** Dome + four modules: the pad height is the mean terrain height here. */
  core: { x0: -32, x1: 34, z0: -16, z1: 40 },
  padBlend: 26,
  /** Pad sits this far below the model's ground plane, so model floors never z-fight with terrain. */
  padSink: 0.06,
  /**
   * Animated doors (System G). `node` is a leaf split out by tools/optimize-models.mjs; positions are relative to the
   * dome centre. The south airlock leaf (4.5 × 4.25 m) sinks into the floor like a blast door.
   */
  doors: [
    { id: 1, node: 'CF_DOOR_south', label: 'South airlock', openOffset: [0, -4.4, 0], trigger: [1.6, -8.5], radius: 4.5 },
  ],
  /**
   * Doorways that the source model closes with thin single-sided panels at the dome/tunnel joints (invisible from the
   * dome side, verified with tools/outpost-grid.mjs). Relative to the dome centre: west (Farm) and east (Storage) mouths.
   */
  openings: [
    { x0: -9.4, x1: -8.0, z0: -1.45, z1: 1.45 },
    { x0: 8.2, x1: 9.8, z0: -1.45, z1: 1.45 },
  ],
} as const;

/** Levels the terrain under the base. Returns the pad height. Call before terrain/rocks are built. */
export function prepareOutpostPad(world: WorldData, cx: number, cz: number): number {
  const { core, footprint: f, padBlend, padSink } = OUTPOST_MODEL;
  const h = world.meanHeight(cx + core.x0, cx + core.x1, cz + core.z0, cz + core.z1);
  world.flattenRect(cx + f.x0, cx + f.x1, cz + f.z0, cz + f.z1, h - padSink, padBlend);
  return h;
}

/** World rectangle covered by the outpost (for keeping rocks out). */
export function outpostKeepOut(cx: number, cz: number, margin = 4): { x0: number; x1: number; z0: number; z1: number } {
  const f = OUTPOST_MODEL.footprint;
  return { x0: cx + f.x0 - margin, x1: cx + f.x1 + margin, z0: cz + f.z0 - margin, z1: cz + f.z1 + margin };
}

/**
 * Distance culling for the base's meshes: interior props and small fittings are hidden when the camera is far away;
 * only large exterior structures cast sun shadows. Thresholds are from the in-game measurement (F3) in DEVELOPMENT_HANDOFF.
 */
export const OUTPOST_LOD = {
  /** Mesh bounding-sphere radius â†’ max visible camera distance (m). Larger meshes are always visible. */
  tiers: [
    { maxRadius: 1.5, farDistance: 45 },
    { maxRadius: 4, farDistance: 110 },
    { maxRadius: 10, farDistance: 400 },
  ],
  /** Meshes with a bounding radius below this do not cast sun shadows (small props, mostly indoors). */
  shadowMinRadius: 4,
} as const;

export interface OutpostModel {
  root: Group;
  grid: StructureGrid;
  /** Per-frame distance culling; returns the number of base meshes currently drawn. */
  update(camera: Vector3): number;
  /** World position of a point given relative to the dome centre at floor level. */
  at(dx: number, dz: number, up?: number): Vector3;
  floorY: number;
  /** Door leaves found in the model, ready for a DoorSystem. */
  doorSpecs: DoorSpec[];
  stats: { meshes: number; triangles: number; materials: number; textures: number };
}

/** Warm, dim gradient environment so the base's metal/PBR materials are not black (applied to outpost materials only). */
function marsEnvironment(renderer: WebGLRenderer): Texture {
  const s = new Scene();
  const geo = new SphereGeometry(10, 32, 16);
  const top = new Color(PALETTE.skyZenith), hor = new Color(PALETTE.skyHorizon), gnd = new Color(PALETTE.hemiGround);
  const cols: number[] = [];
  const p = geo.getAttribute('position');
  const c = new Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 10;
    if (y >= 0) c.copy(hor).lerp(top, Math.pow(y, 0.6)); else c.copy(hor).lerp(gnd, Math.min(1, -y * 3));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new Float32BufferAttribute(cols, 3));
  s.add(new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));
  const pm = new PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.04).texture;
  pm.dispose();
  geo.dispose();
  return tex;
}

export async function loadOutpostModel(modelsBase: string, renderer: WebGLRenderer, cx: number, cz: number, padY: number): Promise<OutpostModel> {
  const url = `${modelsBase}${OUTPOST_MODEL.file}`;
  const head = await fetch(url, { method: 'HEAD' });
  // Dev servers answer unknown paths with index.html; treat that as "not supplied".
  if (!head.ok || (head.headers.get('content-type') ?? '').includes('text/html')) throw new Error(`${OUTPOST_MODEL.file} not found (run npm run optimize-models)`);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const model = gltf.scene;
  const root = new Group();
  root.name = 'Outpost_CrimsonAmalthea';
  // Model ground (y 21.5) on the pad; dome centre on the site.
  model.position.set(-OUTPOST_MODEL.domeCenter.x, padY - OUTPOST_MODEL.groundY, -OUTPOST_MODEL.domeCenter.z);
  root.add(model);
  root.position.set(cx, 0, cz);

  const env = marsEnvironment(renderer);
  const mats = new Set<Material>();
  let meshes = 0, triangles = 0;
  const texSet = new Set<Texture>();
  model.traverse((o: Object3D) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    const list = Array.isArray(m.material) ? m.material : [m.material];
    let transparent = false;
    for (const mat of list) {
      mats.add(mat);
      const sm = mat as MeshStandardMaterial;
      if (sm.isMeshStandardMaterial) {
        sm.envMap = env;
        sm.envMapIntensity = 0.55;
        for (const t of [sm.map, sm.normalMap, sm.roughnessMap, sm.metalnessMap, sm.emissiveMap, sm.aoMap]) if (t) { t.anisotropy = 4; texSet.add(t); }
      }
      if (mat.transparent) { mat.depthWrite = false; transparent = true; }
    }
    m.receiveShadow = true;
    m.userData.transparent = transparent;
  });

  root.updateMatrixWorld(true);
  // Distance culling records (world-space bounding spheres; the base never moves).
  const lod: Array<{ mesh: Mesh; c: Vector3; far2: number }> = [];
  model.traverse((o: Object3D) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.computeBoundingSphere();
    const s = m.geometry.boundingSphere!.clone().applyMatrix4(m.matrixWorld);
    m.castShadow = !m.userData.transparent && s.radius >= OUTPOST_LOD.shadowMinRadius;
    const tier = OUTPOST_LOD.tiers.find((t) => s.radius <= t.maxRadius);
    if (tier) lod.push({ mesh: m, c: s.center, far2: (tier.farDistance + s.radius) ** 2 });
  });
  const alwaysOn = meshes - lod.length;
  const floorY = padY - OUTPOST_MODEL.groundY + OUTPOST_MODEL.groundY; // = padY (model ground plane)
  // Door leaves split out of the model by the optimiser.
  const doorSpecs: DoorSpec[] = [];
  const doorIds = new Map<string, number>();
  for (const d of OUTPOST_MODEL.doors) {
    const leaf = model.getObjectByName(d.node);
    if (!leaf) { console.warn(`outpost door leaf ${d.node} not found (re-run npm run optimize-models)`); continue; }
    doorIds.set(leaf.uuid, d.id);
    leaf.traverse((o) => doorIds.set(o.uuid, d.id));
    doorSpecs.push({
      id: d.id, label: d.label, leaf, openOffset: new Vector3(...d.openOffset),
      trigger: new Vector3(cx + d.trigger[0], floorY, cz + d.trigger[1]), radius: d.radius,
    });
  }
  // Collision from the art itself. The skinned/animated sign boards hang overhead and are excluded.
  const grid = StructureGrid.fromObject(root, floorY, {
    cell: 0.25,
    filter: (m) => !(m as Mesh & { isSkinnedMesh?: boolean }).isSkinnedMesh,
    doorOf: (m) => doorIds.get(m.uuid) ?? 0,
  });
  for (const o of OUTPOST_MODEL.openings) grid.openRect(cx + o.x0, cx + o.x1, cz + o.z0, cz + o.z1);

  return {
    root, grid, floorY, doorSpecs,
    update: (cam) => {
      let on = alwaysOn;
      for (const r of lod) { const v = r.c.distanceToSquared(cam) <= r.far2; r.mesh.visible = v; if (v) on++; }
      return on;
    },
    at: (dx, dz, up = 0) => {
      const fy = grid.floorAt(cx + dx, cz + dz);
      return new Vector3(cx + dx, (fy ?? floorY) + up, cz + dz);
    },
    stats: { meshes, triangles: Math.round(triangles), materials: mats.size, textures: texSet.size },
  };
}
