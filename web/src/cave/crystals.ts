import {
  BufferGeometry, Color, ConeGeometry, CylinderGeometry, Group, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial,
  Quaternion, Vector3, type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Ice crystal chamber (user reference: Blender "ICE CAVES" scene — huge faceted, translucent hexagonal crystal clusters
 * growing out of layered red rock, with dark rock stalactites/stalagmites).
 * Crystals are hexagonal prisms with pyramidal tips, flat-shaded so every facet catches the lamp, merged per cluster
 * (a handful of draw calls). Material: physical ice (IOR 1.31) with transmission, clear-coat and a faint cold glow so
 * the clusters read in the dark chamber.
 */
export interface CrystalSite { at: Vector3; dir: Vector3; scale: number; count: number; spread: number }

function prism(radius: number, length: number): BufferGeometry {
  const body = new CylinderGeometry(radius, radius * 1.08, length, 6, 1, false).translate(0, length / 2, 0);
  const tipH = radius * (1.4 + Math.random() * 0.8);
  const tip = new ConeGeometry(radius, tipH, 6, 1, false).translate(0, length + tipH / 2, 0);
  const g = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()]);
  g.computeVertexNormals();
  return g;
}

export function crystalMaterials(): { ice: Material; frost: Material; rock: Material } {
  const ice = new MeshPhysicalMaterial({
    color: new Color(0xeaf7ff), roughness: 0.06, metalness: 0, transmission: 0.55, thickness: 1.2, ior: 1.31,
    attenuationColor: new Color(0x9fd8ff), attenuationDistance: 3.5, clearcoat: 1, clearcoatRoughness: 0.05,
    emissive: new Color(0x5cb6ff), emissiveIntensity: 0.07, flatShading: true, transparent: true, opacity: 0.94,
  });
  const frost = new MeshPhysicalMaterial({ color: new Color(0xd8ecf6), roughness: 0.35, clearcoat: 0.6, emissive: new Color(0x6fc0ff), emissiveIntensity: 0.04, flatShading: true });
  const rock = new MeshStandardMaterial({ color: new Color(0x3b1d15), roughness: 0.95, flatShading: true });
  return { ice, frost, rock };
}

/** One radiating cluster, merged into a single mesh. `dir` = growth axis (wall normal / up). */
export function crystalCluster(site: CrystalSite, mat: Material, rnd: () => number): Mesh {
  const parts: BufferGeometry[] = [];
  const up = new Vector3(0, 1, 0);
  const base = new Quaternion().setFromUnitVectors(up, site.dir.clone().normalize());
  for (let k = 0; k < site.count; k++) {
    const big = k < Math.max(1, site.count * 0.2);
    const len = site.scale * (big ? 0.75 + rnd() * 0.5 : 0.2 + rnd() * 0.55);
    const rad = len * (0.09 + rnd() * 0.05);
    const g = prism(rad, len);
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(rnd() - 0.5, 0, rnd() - 0.5).normalize(), (big ? 0.15 : 0.35) + rnd() * site.spread);
    const spin = new Quaternion().setFromAxisAngle(up, rnd() * Math.PI * 2);
    const q = base.clone().multiply(tilt).multiply(spin);
    const off = new Vector3((rnd() - 0.5) * site.scale * 0.25, 0, (rnd() - 0.5) * site.scale * 0.25).applyQuaternion(base);
    g.applyMatrix4(new Matrix4().compose(off, q, new Vector3(1, 1, 1)));
    parts.push(g);
  }
  const mesh = new Mesh(mergeGeometries(parts), mat);
  mesh.position.copy(site.at);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/** Irregular rock column (stalactite / stalagmite), flat-shaded. */
export function rockColumn(length: number, radius: number, hang: boolean, mat: Material, rnd: () => number): Mesh {
  const g = new ConeGeometry(radius, length, 7, 6, false);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = 1 + 0.25 * Math.sin(y * 3.1 + i) * (rnd() * 0.6 + 0.4);
    p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const m = new Mesh(g, mat);
  if (hang) m.rotation.x = Math.PI;
  m.castShadow = false; m.receiveShadow = true;
  return m;
}

export class CrystalField {
  readonly group = new Group();
}
