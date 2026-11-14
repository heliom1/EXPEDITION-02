import {
  BufferAttribute, BufferGeometry, CircleGeometry, Color, ConeGeometry, Group, IcosahedronGeometry, InstancedMesh, Matrix4,
  Mesh, MeshPhysicalMaterial, MeshStandardMaterial, PointLight, Quaternion, SphereGeometry, Vector3, Euler,
} from 'three';
import type { LayerTextures } from '../rendering/textures';
import type { WorldData } from '../world/worldData';
import type { ColliderSet } from '../world/colliders';
import { makeRockGeometry } from '../world/rocks';
import { mulberry32 } from '../world/random';
import { PartBuilder } from '../rendering/builder';
import { BOUNDS, ICE, NODES, SEGMENTS, CENTRE_LIFT, caveFloorBelow, caveSdf } from './caveDef';
import { patchCaveLighting } from './caveGlsl';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CaveMeshData, TerrainPatch } from './caveMesher';

/** Rock material for cave walls: triplanar cave rock, dust on up-facing ledges, frost near the ice, baked AO. */
function caveRockMaterial(layers: LayerTextures): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      cfRockA: { value: layers.albedo.CaveRock },
      cfRockB: { value: layers.albedo.Bedrock },
      cfDustA: { value: layers.albedo.Dust },
      cfIceA: { value: layers.albedo.Ice },
      cfRockN: { value: layers.normal.CaveRock },
      cfIce: { value: new Vector3(ICE.x, ICE.y, ICE.z) },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float ao;\nvarying float vAo;\nvarying vec3 vCfWorld;\nvarying vec3 vCfN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAo = ao;\nvCfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvCfN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vAo; varying vec3 vCfWorld; varying vec3 vCfN;
uniform sampler2D cfRockA, cfRockB, cfDustA, cfIceA, cfRockN; uniform vec3 cfIce;
vec3 cfTri(sampler2D t, vec3 p, vec3 n, float s) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  return texture(t, p.zy * s).rgb * w.x + texture(t, p.xz * s).rgb * w.y + texture(t, p.xy * s).rgb * w.z;
}`)
      .replace('#include <map_fragment>', `
vec3 cfN = normalize(vCfN);
vec3 rockA = cfTri(cfRockA, vCfWorld, cfN, 1.0 / 4.0);
vec3 rockB = cfTri(cfRockB, vCfWorld, cfN, 1.0 / 7.0);
float strata = 0.5 + 0.5 * sin(vCfWorld.y * 1.3 + sin(vCfWorld.x * 0.11 + vCfWorld.z * 0.07) * 3.0);
vec3 col = mix(rockA, rockB * vec3(1.05, 0.85, 0.75), strata * 0.55);
col *= mix(vec3(0.55, 0.42, 0.38), vec3(1.0), smoothstep(-0.2, 0.8, sin(vCfWorld.x * 0.05 + vCfWorld.z * 0.09)));
float up = smoothstep(0.45, 0.85, cfN.y);
col = mix(col, texture(cfDustA, vCfWorld.xz / 5.0).rgb * 0.9, up * 0.75);
float iceD = length(vCfWorld - cfIce);
float frost = smoothstep(19.0, 7.0, iceD) * smoothstep(0.35, 0.75, texture(cfIceA, vCfWorld.xz / 3.0 + vCfWorld.y * 0.1).r + 0.25 * cfN.y);
col = mix(col, vec3(0.78, 0.86, 0.92), frost * 0.85);
diffuseColor.rgb *= col * mix(1.0, vAo, 0.85);
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, 0.35, frost);')
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
{
  vec3 w = pow(abs(cfN), vec3(4.0)); w /= (w.x + w.y + w.z);
  vec3 nx = texture(cfRockN, vCfWorld.zy / 4.0).xyz * 2.0 - 1.0;
  vec3 ny = texture(cfRockN, vCfWorld.xz / 4.0).xyz * 2.0 - 1.0;
  vec3 nz = texture(cfRockN, vCfWorld.xy / 4.0).xyz * 2.0 - 1.0;
  vec3 pert = vec3(0.0, nx.y, nx.x) * w.x + vec3(ny.x, 0.0, ny.y) * w.y + vec3(nz.x, nz.y, 0.0) * w.z;
  normal = normalize((viewMatrix * vec4(normalize(cfN + pert * (0.55 - 0.35 * smoothstep(0.45, 0.85, cfN.y))), 0.0)).xyz);
}`);
    patchCaveLighting(shader, { declareWorld: false });
  };
  m.customProgramCacheKey = () => 'cf-cave-rock-v1';
  return m;
}

/** Wraps any standard material so daylight fades inside the cave. */
export function caveAware<T extends MeshStandardMaterial>(m: T, key: string): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev?.call(m, shader, r);
    patchCaveLighting(shader, { declareWorld: true });
  };
  m.customProgramCacheKey = () => `cf-cave-${key}`;
  return m;
}

export interface CaveInteractables {
  beacons: Vector3[];
  lastBeacon: Vector3;
  ice: Vector3;
  cache: Vector3;
}

/** Point on the tunnel floor `t` of the way along segment `a`→`b`. */
function floorPoint(a: string, b: string, t: number, side = 0): Vector3 {
  const A = NODES[a], B = NODES[b];
  const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz);
  const x = A.x + dx * t + (-dz / l) * side, z = A.z + dz * t + (dx / l) * side;
  const c = A.floor + (B.floor - A.floor) * t + Math.min(A.r, B.r) * CENTRE_LIFT;
  const f = caveFloorBelow(x, c, z, 12) ?? A.floor;
  return new Vector3(x, f, z);
}

export class Cave {
  readonly group = new Group();
  readonly interact: CaveInteractables;
  readonly iceLight: PointLight;
  private beaconLeds: MeshStandardMaterial[] = [];
  private t = 0;
  ready = false;
  stats: CaveMeshData['stats'] | null = null;

  constructor(private readonly world: WorldData, private readonly layers: LayerTextures, colliders: ColliderSet) {
    this.group.name = 'Cave';
    const rnd = mulberry32(4242);

    // --- Survey beacons left by the first expedition (environmental evidence). ---
    const beaconSpots: Array<[string, string, number, number]> = [
      ['mouthOut', 'mouthIn', 0.7, 2.2], ['mouthIn', 'throat', 0.8, -1.6], ['throat', 'hall', 0.85, 2.0],
      ['hall', 'deepNeck', 0.55, 1.4], ['deepNeck', 'deepBend', 0.8, -1.3],
    ];
    const beacons = beaconSpots.map(([a, b, t, s]) => floorPoint(a, b, t, s));
    const metal = caveAware(new MeshStandardMaterial({ color: 0x8d8780, roughness: 0.5, metalness: 0.6 }), 'metal');
    const casing = caveAware(new MeshStandardMaterial({ color: 0xd8d3ca, roughness: 0.6, metalness: 0.1 }), 'casing');
    const accent = caveAware(new MeshStandardMaterial({ color: 0xd2652a, roughness: 0.5 }), 'accent');
    beacons.forEach((p, i) => {
      const b = new PartBuilder();
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        b.strut(metal, new Vector3(0, 1.05, 0), new Vector3(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45), 0.03);
      }
      b.box(casing, [0.22, 0.28, 0.22], [0, 1.18, 0]);
      b.box(accent, [0.23, 0.05, 0.23], [0, 1.1, 0]);
      const g = b.build(`SurveyBeacon_${i}`);
      const led = new MeshStandardMaterial({ color: 0x113344, emissive: 0x6fd8ff, emissiveIntensity: 2 });
      this.beaconLeds.push(led);
      const ledMesh = new Mesh(new SphereGeometry(0.06, 10, 8), led);
      ledMesh.position.set(0, 1.38, 0);
      g.add(ledMesh);
      g.position.copy(p);
      g.rotation.y = rnd() * 6.28;
      this.group.add(g);
    });

    // --- Ice deposit in the deep chamber: layered ice mound, frozen pool, ice columns and icicles. ---
    const iceFloor = caveFloorBelow(ICE.x, ICE.y + 4, ICE.z, 10) ?? ICE.y;
    const iceMat = caveAware(new MeshPhysicalMaterial({
      color: 0xcfe6f2, map: layers.albedo.Ice, normalMap: layers.normal.Ice, roughness: 0.18, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.3, sheenColor: new Color(0x9fd6ff),
    }), 'ice');
    const dustyIce = caveAware(new MeshPhysicalMaterial({ color: 0xb9c4c8, map: layers.albedo.Ice, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.3 }), 'dusty-ice');
    const mound = new Group();
    mound.name = 'IceDeposit';
    for (let k = 0; k < 7; k++) {
      // Merge duplicated vertices so the mound shades smoothly (glazed ice, not faceted crystal).
      const geo = mergeVertices(new IcosahedronGeometry(1, 4).deleteAttribute('normal'));
      const pos = geo.getAttribute('position');
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
        const n = 1 + 0.08 * Math.sin(x * 5 + k) * Math.sin(z * 4 - k) + 0.04 * Math.sin(y * 9);
        pos.setXYZ(v, x * n, y * n, z * n);
      }
      geo.computeVertexNormals();
      const m = new Mesh(geo, k % 3 === 2 ? dustyIce : iceMat);
      const a = rnd() * 6.28, r = 1 + rnd() * 3.2;
      m.position.set(Math.cos(a) * r, -0.3 + k * 0.08, Math.sin(a) * r - 1);
      m.scale.set(2.2 + rnd() * 1.8, 0.7 + rnd() * 0.9, 1.6 + rnd() * 1.4);
      m.rotation.y = rnd() * 3;
      m.castShadow = false;
      m.receiveShadow = true;
      mound.add(m);
    }
    mound.position.set(ICE.x, iceFloor, ICE.z);
    this.group.add(mound);
    colliders.add(ICE.x, ICE.z - 1, 3.2, iceFloor - 2, iceFloor + 1.4);
    const pool = new Mesh(new CircleGeometry(4.5, 40), iceMat);
    pool.rotation.x = -Math.PI / 2;
    const poolFloor = caveFloorBelow(ICE.x + 2.5, ICE.y + 4, ICE.z + 6, 10) ?? iceFloor;
    pool.position.set(ICE.x + 2.5, poolFloor + 0.06, ICE.z + 6);
    this.group.add(pool);

    // Columns and icicles around the deposit.
    const coneGeo = new ConeGeometry(0.35, 1, 9, 4);
    const cones = new InstancedMesh(coneGeo, iceMat, 60);
    let ci = 0;
    const m4 = new Matrix4(), q = new Quaternion();
    for (let k = 0; k < 140 && ci < 60; k++) {
      const a = rnd() * 6.28, r = 3 + rnd() * 9;
      const x = ICE.x + Math.cos(a) * r, z = ICE.z + 3 + Math.sin(a) * r * 0.8;
      const f = caveFloorBelow(x, ICE.y + 6, z, 12);
      if (f === null) continue;
      // Ceiling above this point.
      let ceil = f + 0.5;
      while (ceil < f + 20 && caveSdf(x, ceil, z) < 0) ceil += 0.4;
      const hang = rnd() < 0.55 && ceil - f > 3;
      const len = hang ? 0.6 + rnd() * 2.2 : 0.4 + rnd() * 1.6;
      const w = 0.4 + rnd() * 0.9;
      if (hang) { q.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI); m4.compose(new Vector3(x, ceil - len / 2 + 0.1, z), q, new Vector3(w, len, w)); }
      else { q.identity(); m4.compose(new Vector3(x, f + len / 2 - 0.05, z), q, new Vector3(w, len, w)); }
      cones.setMatrixAt(ci++, m4);
    }
    cones.count = ci;
    this.group.add(cones);

    // The first expedition's survey lamp beside the deposit: the only light in the chamber.
    const lampPos = new Vector3(ICE.x - 4.5, 0, ICE.z + 3.5);
    lampPos.y = caveFloorBelow(lampPos.x, ICE.y + 4, lampPos.z, 10) ?? iceFloor;
    const lb = new PartBuilder();
    for (let k = 0; k < 3; k++) { const a = (k / 3) * 6.28; lb.strut(metal, new Vector3(0, 1.5, 0), new Vector3(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6), 0.035); }
    lb.box(casing, [0.35, 0.22, 0.25], [0, 1.6, 0], [0.5, 0.6, 0]);
    const lamp = lb.build('Exp1SurveyLamp');
    const lampFace = new Mesh(new CircleGeometry(0.09, 16), new MeshStandardMaterial({ color: 0xffffff, emissive: 0xbfe8ff, emissiveIntensity: 6 }));
    lampFace.position.set(0.12, 1.62, 0.1);
    lampFace.rotation.set(-0.5, 0.9, 0);
    lamp.add(lampFace);
    lamp.position.copy(lampPos);
    this.group.add(lamp);
    this.iceLight = new PointLight(0xa9dcff, 26, 26, 1.8);
    this.iceLight.position.set(lampPos.x + 0.4, lampPos.y + 1.7, lampPos.z - 0.3);
    this.group.add(this.iceLight);

    // --- Equipment case in the west room (optional discovery). ---
    const cachePos = floorPoint('westNeck', 'westRoom', 0.85, 1.5);
    const cb = new PartBuilder();
    cb.box(casing, [0.9, 0.45, 0.55], [0, 0.22, 0], [0, 0.4, 0]);
    cb.box(accent, [0.92, 0.06, 0.57], [0, 0.4, 0], [0, 0.4, 0]);
    for (let k = 0; k < 6; k++) cb.cyl(metal, 0.04, 0.04, 0.5, [0.55 + (k % 3) * 0.1, 0.25, -0.1 + Math.floor(k / 3) * 0.12], undefined, 8);
    const cache = cb.build('Exp1EquipmentCase');
    cache.position.copy(cachePos);
    this.group.add(cache);

    // --- Breakdown debris on the cave floor (keeps a walkable corridor on the centre line). ---
    const rockMat = caveAware(new MeshStandardMaterial({ map: layers.albedo.CaveRock, normalMap: layers.normal.CaveRock, roughness: 0.9 }), 'debris');
    const geos = [makeRockGeometry(77), makeRockGeometry(91), makeRockGeometry(103)];
    const debris = geos.map((g) => { const im = new InstancedMesh(g, rockMat, 260); im.count = 0; im.receiveShadow = true; this.group.add(im); return im; });
    const tint = new Color();
    for (const [a, b] of SEGMENTS) {
      const A = NODES[a], B = NODES[b];
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      const n = Math.floor(len * 2.2);
      for (let k = 0; k < n; k++) {
        const t = rnd();
        const r = Math.min(A.r, B.r) + (Math.max(A.r, B.r) - Math.min(A.r, B.r)) * (A.r > B.r ? 1 - t : t);
        const side = (rnd() < 0.5 ? -1 : 1) * (1.4 + rnd() * r * 0.95);
        const p = floorPoint(a, b, t, side);
        if (caveSdf(p.x, p.y + 0.3, p.z) > -0.1) continue;
        const big = rnd() < 0.08;
        const s = big ? 0.9 + rnd() * 1.4 : 0.12 + Math.pow(rnd(), 3) * 0.7;
        const im = debris[Math.floor(rnd() * debris.length)];
        if (im.count >= 260) continue;
        m4.compose(new Vector3(p.x, p.y + s * 0.15, p.z), q.setFromEuler(new Euler(rnd() * 0.6, rnd() * 6.28, rnd() * 0.6)), new Vector3(s * (0.9 + rnd() * 0.4), s * (0.5 + rnd() * 0.4), s));
        im.setMatrixAt(im.count, m4);
        im.setColorAt(im.count, tint.setHSL(0.04 + rnd() * 0.03, 0.3 + rnd() * 0.2, 0.62 + rnd() * 0.2));
        im.count++;
        if (s > 0.6) colliders.add(p.x, p.z, s * 0.8, p.y - 1, p.y + s * 0.7);
      }
    }
    debris.forEach((im) => { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });

    // --- Talus boulders fallen from the cliff, framing the entrance outside. ---
    const outsideMat = new MeshStandardMaterial({ map: layers.albedo.Rock, normalMap: layers.normal.Rock, roughness: 0.92, color: 0xd9a688 });
    const talus = new InstancedMesh(makeRockGeometry(311), outsideMat, 24);
    talus.count = 0;
    talus.castShadow = true;
    talus.receiveShadow = true;
    const mo = NODES.mouthOut;
    for (let k = 0; k < 60 && talus.count < 24; k++) {
      const side = rnd() < 0.5 ? -1 : 1;
      const x = mo.x + side * (8 + rnd() * 14), z = mo.z + 2 + rnd() * 22;
      const gy = world.heightAt(x, z);
      if (caveSdf(x, gy, z, false) < 1.5) continue;
      const s = 0.8 + Math.pow(rnd(), 2) * 3.2;
      m4.compose(new Vector3(x, gy + s * 0.2, z), q.setFromEuler(new Euler(rnd() * 0.5, rnd() * 6.28, rnd() * 0.5)), new Vector3(s * (1 + rnd() * 0.5), s * (0.6 + rnd() * 0.4), s));
      talus.setMatrixAt(talus.count++, m4);
      if (s > 1) colliders.add(x, z, s * 0.9, gy - 1, gy + s);
    }
    talus.instanceMatrix.needsUpdate = true;
    this.group.add(talus);

    this.interact = {
      beacons,
      lastBeacon: beacons[beacons.length - 1].clone().add(new Vector3(0, 1.2, 0)),
      ice: new Vector3(ICE.x, iceFloor + 1.0, ICE.z + 1.5),
      cache: cachePos.clone().add(new Vector3(0, 0.4, 0)),
    };
  }

  /** Meshes the cave walls in a worker. */
  async build(): Promise<void> {
    const cell = 2, x0 = BOUNDS.min[0] - 4, z0 = BOUNDS.min[2] - 4;
    const nx = Math.ceil((BOUNDS.max[0] + 4 - x0) / cell) + 1, nz = Math.ceil((BOUNDS.max[2] + 4 - z0) / cell) + 1;
    const h = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = this.world.heightAt(x0 + i * cell, z0 + j * cell);
    const terrain: TerrainPatch = { x0, z0, cell, nx, nz, h };
    const worker = new Worker(new URL('./caveMesher.worker.ts', import.meta.url), { type: 'module' });
    const data = await new Promise<CaveMeshData>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<CaveMeshData>) => resolve(e.data);
      worker.onerror = (e) => reject(new Error(`cave mesher failed: ${e.message}`));
      worker.postMessage({ terrain, voxel: 0.7 });
    });
    worker.terminate();
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(data.positions, 3));
    g.setAttribute('normal', new BufferAttribute(data.normals, 3));
    g.setAttribute('ao', new BufferAttribute(data.ao, 1));
    g.setIndex(new BufferAttribute(data.indices, 1));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, caveRockMaterial(this.layers));
    mesh.name = 'CaveWalls';
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    this.stats = data.stats;
    this.ready = true;
  }

  update(dt: number): void {
    this.t += dt;
    // Beacons pulse in sequence, leading deeper into the cave.
    this.beaconLeds.forEach((m, i) => {
      const phase = (this.t * 0.8 - i * 0.18) % 1.6;
      m.emissiveIntensity = phase > 0 && phase < 0.15 ? 9 : 0.6;
    });
    // Slight flicker of the old survey lamp.
    this.iceLight.intensity = 26 * (0.94 + 0.06 * Math.sin(this.t * 13) * Math.sin(this.t * 3.1));
  }
}
