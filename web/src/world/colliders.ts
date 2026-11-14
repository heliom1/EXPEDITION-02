/** Static vertical-cylinder colliders for structures (player collision is resolved in XZ). */
export interface CircleCollider { x: number; z: number; r: number; bottom: number; top: number }

export class ColliderSet {
  readonly circles: CircleCollider[] = [];

  add(x: number, z: number, r: number, bottom: number, top: number): void {
    this.circles.push({ x, z, r, bottom, top });
  }

  /** A row of circles approximating a horizontal capsule (e.g. a habitat module). */
  addCapsule(x0: number, z0: number, x1: number, z1: number, r: number, bottom: number, top: number): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(2, Math.ceil(len / r) + 1);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      this.add(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, r, bottom, top);
    }
  }
}
