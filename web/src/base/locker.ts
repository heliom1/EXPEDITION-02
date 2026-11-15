import { BoxGeometry, Group, Mesh, PointLight, type Material } from 'three';
import { MAT } from '../rendering/materials';

/**
 * Procedural supply locker (directive System F: the base model has no storage furniture with moving parts, so the
 * cabinet is built here to match the base's white-composite / orange-accent hardware). Two hinged doors swing open
 * while the storage screen is in use and close afterwards, with eased motion and an interior light.
 */
export class LockerProp {
  readonly group = new Group();
  private readonly doors: Group[] = [];
  private readonly light: PointLight;
  /** 0 closed … 1 open (target). */
  target = 0;
  private t = 0;

  /** `facing`: yaw (radians) the doors face. Dimensions in metres. */
  constructor(w = 1.3, hgt = 2.05, d = 0.62) {
    const part = (geo: BoxGeometry, mat: Material, x: number, y: number, z: number, parent: Group = this.group) => {
      const m = new Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const wall = 0.04;
    // Carcass: back, sides, top, bottom, plinth, shelves.
    part(new BoxGeometry(w, hgt, wall), MAT.panelDusty, 0, hgt / 2, -d / 2 + wall / 2);
    part(new BoxGeometry(wall, hgt, d), MAT.panel, -w / 2 + wall / 2, hgt / 2, 0);
    part(new BoxGeometry(wall, hgt, d), MAT.panel, w / 2 - wall / 2, hgt / 2, 0);
    part(new BoxGeometry(w, wall, d), MAT.panel, 0, hgt - wall / 2, 0);
    part(new BoxGeometry(w, 0.1, d), MAT.darkMetal, 0, 0.05, 0);
    for (const y of [0.55, 1.05, 1.55]) part(new BoxGeometry(w - 2 * wall, 0.025, d - wall), MAT.metal, 0, y, 0.01);
    part(new BoxGeometry(w + 0.02, 0.08, d + 0.02), MAT.accent, 0, hgt - 0.18, 0);
    // Stock on the shelves (canisters / packs) so the open cabinet reads as a supply locker.
    for (let i = 0; i < 4; i++) part(new BoxGeometry(0.18, 0.32, 0.18), i % 2 ? MAT.accent : MAT.panel, -0.42 + i * 0.28, 0.73, 0);
    for (let i = 0; i < 3; i++) part(new BoxGeometry(0.3, 0.2, 0.35), MAT.darkMetal, -0.38 + i * 0.38, 1.17, 0);
    // Doors hinged on the outer edges.
    for (const side of [-1, 1]) {
      const hinge = new Group();
      hinge.position.set(side * (w / 2), 0, d / 2);
      const leaf = part(new BoxGeometry(w / 2 - 0.01, hgt - 0.14, 0.03), MAT.panel, -side * (w / 4), hgt / 2, 0.015, hinge);
      leaf.name = 'door';
      part(new BoxGeometry(0.03, 0.35, 0.04), MAT.darkMetal, -side * (w / 2 - 0.08), hgt / 2 + 0.05, 0.05, hinge);
      part(new BoxGeometry(w / 2 - 0.12, 0.05, 0.035), MAT.accent, -side * (w / 4), hgt - 0.45, 0.035, hinge);
      this.group.add(hinge);
      this.doors.push(hinge);
    }
    this.light = new PointLight(0xffe0b0, 0, 3.2, 2);
    this.light.position.set(0, hgt - 0.3, 0.05);
    this.group.add(this.light);
    this.group.name = 'SupplyLocker';
  }

  /** Eased door swing (~0.6 s), light fades with it. */
  update(dt: number): void {
    const step = dt / 0.6;
    this.t = this.target > this.t ? Math.min(this.target, this.t + step) : Math.max(this.target, this.t - step);
    const e = this.t * this.t * (3 - 2 * this.t);
    this.doors[0].rotation.y = -e * 1.75;
    this.doors[1].rotation.y = e * 1.75;
    this.light.intensity = e * 6;
  }

  get openness(): number { return this.t; }
}
