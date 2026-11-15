import {
  BufferGeometry, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, Euler, Group, IcosahedronGeometry, Matrix4, Mesh, MeshStandardMaterial,
  Quaternion, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { itemDef } from './items';
import { mulberry32 } from '../world/random';

/**
 * Geological resources (System E): mineable deposits ("MineableOre") that release sample chunks ("OrePickup")
 * which go into the suit inventory ("PlayerOreInventory" = the Inventory class). Deposits are fixed, data-driven
 * sites; their remaining yield and any uncollected samples are saved as world changes.
 */
export type Mineral = 'hematite' | 'olivine' | 'gypsum';

export interface DepositDef { id: string; mineral: Mineral; x: number; z: number; yields: number }

/** World positions (m). Kept off the outpost footprint, on gentle ground near mission sites. */
export const DEPOSITS: DepositDef[] = [
  { id: 'dep_out_e', mineral: 'hematite', x: -1170, z: 1080, yields: 3 },
  { id: 'dep_out_w', mineral: 'olivine', x: -1340, z: 1090, yields: 3 },
  { id: 'dep_out_n', mineral: 'gypsum', x: -1230, z: 1240, yields: 2 },
  { id: 'dep_rover', mineral: 'olivine', x: 175, z: 880, yields: 3 },
  { id: 'dep_drl2', mineral: 'hematite', x: 5, z: -300, yields: 4 },
  { id: 'dep_cliff', mineral: 'gypsum', x: -185, z: -290, yields: 3 },
];

export interface DepositState { def: DepositDef; remaining: number; mesh: Group; pos: Vector3 }
export interface Pickup { id: string; mineral: Mineral; count: number; pos: Vector3; mesh: Mesh }

export interface OreSave { remaining: Record<string, number>; pickups: Array<{ id: string; mineral: Mineral; count: number; x: number; y: number; z: number }> }

const MINERALS: Mineral[] = ['hematite', 'olivine', 'gypsum'];

/** Visual habit per mineral: hematite — stubby dark metallic crystals; olivine — glassy green; gypsum — long pale blades. */
const MINERAL_STYLE: Record<Mineral, { count: number; radius: number; length: number; flat: number; roughness: number; metalness: number; glow: number }> = {
  hematite: { count: 11, radius: 0.085, length: 0.32, flat: 1, roughness: 0.28, metalness: 0.75, glow: 0.04 },
  olivine: { count: 12, radius: 0.075, length: 0.3, flat: 1, roughness: 0.2, metalness: 0.05, glow: 0.12 },
  gypsum: { count: 9, radius: 0.09, length: 0.6, flat: 0.35, roughness: 0.35, metalness: 0.0, glow: 0.1 },
};
const isMineral = (m: unknown): m is Mineral => typeof m === 'string' && (MINERALS as string[]).includes(m);

/** One crystal: hexagonal prism with a pyramidal termination (base at the origin, growing along +Y). */
function crystal(radius: number, length: number, flat: number): BufferGeometry {
  const body = new CylinderGeometry(radius, radius * 1.08, length, 6, 1, false);
  body.translate(0, length / 2, 0);
  const tip = new ConeGeometry(radius, radius * 1.9, 6);
  tip.translate(0, length + radius * 0.95, 0);
  const unindex = (x: BufferGeometry) => (x.index ? x.toNonIndexed() : x);
  const g = mergeGeometries([unindex(body), unindex(tip)])!;
  g.scale(1, 1, flat); // gypsum/selenite grows as flattened blades
  g.computeVertexNormals();
  return g;
}

/** Irregular, half-buried host boulder (noise-displaced icosphere, flat-shaded like the scattered rocks). */
function boulder(rnd: () => number): BufferGeometry {
  const ico = new IcosahedronGeometry(0.85, 2);
  const g = ico.index ? ico.toNonIndexed() : ico; // polyhedra are already non-indexed in current three.js
  const pos = g.getAttribute('position');
  const v = new Vector3();
  const lumps = Array.from({ length: 5 }, () => ({ d: new Vector3(rnd() - 0.5, rnd() - 0.3, rnd() - 0.5).normalize(), k: 0.12 + rnd() * 0.18 }));
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    // Positions shared between faces must move identically: displacement is a pure function of direction.
    let f = 1 + 0.07 * Math.sin(n.x * 9.1 + n.z * 5.3) * Math.cos(n.y * 7.7);
    for (const l of lumps) f += l.k * Math.max(0, n.dot(l.d)) ** 3;
    v.copy(n).multiplyScalar(0.85 * f);
    pos.setXYZ(i, v.x * 1.25, v.y * 0.62, v.z * 1.05);
  }
  g.computeVertexNormals();
  return g;
}

/** Procedural crystal cluster growing from a host boulder; style per mineral (see MINERAL_STYLE). */
function depositMesh(mineral: Mineral, seed: number): Group {
  const rnd = mulberry32(seed);
  const g = new Group();
  const rock = new Mesh(boulder(rnd), new MeshStandardMaterial({ color: 0x8c5c45, roughness: 0.92, flatShading: true }));
  rock.position.y = 0.05; // partly buried
  rock.castShadow = true; rock.receiveShadow = true;
  g.add(rock);
  const style = MINERAL_STYLE[mineral];
  const parts: BufferGeometry[] = [];
  const m = new Matrix4(), q = new Quaternion(), e = new Euler(), p = new Vector3(), s = new Vector3();
  for (let i = 0; i < style.count; i++) {
    // Crystals sprout from the boulder's upper surface and lean outward from its centre.
    const a = (i / style.count) * Math.PI * 2 + rnd() * 0.8, r = rnd() * 0.55;
    const len = style.length * (0.6 + rnd() * 0.7);
    const geo = crystal(style.radius * (0.7 + rnd() * 0.6), len, style.flat);
    const lean = 0.15 + r * 0.9;
    e.set(Math.sin(a) * lean, rnd() * Math.PI, -Math.cos(a) * lean);
    q.setFromEuler(e);
    p.set(Math.cos(a) * r * 0.9, 0.38 - r * 0.25, Math.sin(a) * r * 0.75);
    s.setScalar(1);
    parts.push(geo.applyMatrix4(m.compose(p, q, s)));
  }
  const color = new Color(itemDef(mineral).color ?? 0x888888);
  const mat = new MeshStandardMaterial({
    color, roughness: style.roughness, metalness: style.metalness, flatShading: true,
    emissive: color, emissiveIntensity: style.glow,
  });
  const crystals = new Mesh(mergeGeometries(parts), mat);
  crystals.castShadow = true;
  crystals.name = 'crystals';
  g.add(crystals);
  return g;
}

function pickupMesh(mineral: Mineral): Mesh {
  const color = new Color(itemDef(mineral).color ?? 0x888888);
  const mesh = new Mesh(new DodecahedronGeometry(0.16, 0), new MeshStandardMaterial({ color, roughness: 0.5, metalness: mineral === 'hematite' ? 0.5 : 0.05, emissive: color, emissiveIntensity: 0.25 }));
  mesh.castShadow = true;
  return mesh;
}

export class OreField {
  readonly group = new Group();
  readonly deposits = new Map<string, DepositState>();
  readonly pickups = new Map<string, Pickup>();
  private nextPickup = 1;

  /** `groundAt(x, z)` returns the walkable surface height there. */
  constructor(private readonly groundAt: (x: number, z: number) => number, defs: DepositDef[] = DEPOSITS) {
    this.group.name = 'OreField';
    defs.forEach((d, i) => {
      const pos = new Vector3(d.x, groundAt(d.x, d.z), d.z);
      const mesh = depositMesh(d.mineral, 7919 * (i + 1));
      mesh.position.copy(pos);
      mesh.rotation.y = i * 1.7;
      mesh.name = `Deposit_${d.id}`;
      this.group.add(mesh);
      this.deposits.set(d.id, { def: d, remaining: d.yields, mesh, pos });
    });
  }

  /** Cuts one sample from a deposit: spawns a pickup beside it. Returns the pickup, or null if depleted. */
  mine(depositId: string, toward?: Vector3): Pickup | null {
    const d = this.deposits.get(depositId);
    if (!d || d.remaining <= 0) return null;
    d.remaining--;
    this.updateDeposit(d);
    // Drop the sample on the side facing the player so it is in view.
    const dir = toward ? new Vector3(toward.x - d.pos.x, 0, toward.z - d.pos.z).normalize() : new Vector3(1, 0, 0);
    const x = d.pos.x + dir.x * 1.35, z = d.pos.z + dir.z * 1.35;
    return this.spawnPickup(d.def.mineral, 1, new Vector3(x, this.groundAt(x, z) + 0.14, z));
  }

  spawnPickup(mineral: Mineral, count: number, pos: Vector3, id = `pk${this.nextPickup++}`): Pickup {
    const mesh = pickupMesh(mineral);
    mesh.position.copy(pos);
    mesh.name = `OrePickup_${id}`;
    this.group.add(mesh);
    const p: Pickup = { id, mineral, count, pos: pos.clone(), mesh };
    this.pickups.set(id, p);
    return p;
  }

  /** Removes a pickup from the world and returns what it held. */
  collect(id: string): Pickup | null {
    const p = this.pickups.get(id);
    if (!p) return null;
    this.pickups.delete(id);
    this.group.remove(p.mesh);
    p.mesh.geometry.dispose();
    (p.mesh.material as MeshStandardMaterial).dispose();
    return p;
  }

  /** Gentle bob/spin so dropped samples read as collectable. */
  update(t: number): void {
    for (const p of this.pickups.values()) { p.mesh.rotation.y = t * 1.2; p.mesh.position.y = p.pos.y + Math.sin(t * 2.4) * 0.03; }
  }

  private updateDeposit(d: DepositState): void {
    const crystals = d.mesh.getObjectByName('crystals');
    if (crystals) {
      const f = d.remaining / d.def.yields;
      crystals.visible = d.remaining > 0;
      crystals.scale.setScalar(0.45 + 0.55 * f);
    }
  }

  toJSON(): OreSave {
    return {
      remaining: Object.fromEntries([...this.deposits].map(([id, d]) => [id, d.remaining])),
      pickups: [...this.pickups.values()].map((p) => ({ id: p.id, mineral: p.mineral, count: p.count, x: p.pos.x, y: p.pos.y, z: p.pos.z })),
    };
  }

  /** Restores yields and uncollected samples; tolerant of bad data. */
  load(data: unknown): void {
    for (const id of [...this.pickups.keys()]) this.collect(id);
    for (const d of this.deposits.values()) { d.remaining = d.def.yields; this.updateDeposit(d); }
    if (!data || typeof data !== 'object') return;
    const s = data as Partial<OreSave>;
    for (const [id, n] of Object.entries(s.remaining ?? {})) {
      const d = this.deposits.get(id);
      if (d && Number.isInteger(n)) { d.remaining = Math.max(0, Math.min(d.def.yields, n)); this.updateDeposit(d); }
    }
    for (const p of s.pickups ?? []) {
      if (isMineral(p.mineral) && [p.x, p.y, p.z].every(Number.isFinite) && Number.isInteger(p.count) && p.count > 0) this.spawnPickup(p.mineral, p.count, new Vector3(p.x, p.y, p.z), p.id);
    }
    this.nextPickup = 1 + Math.max(0, ...[...this.pickups.keys()].map((k) => Number(k.replace(/^pk/, '')) || 0));
  }
}
