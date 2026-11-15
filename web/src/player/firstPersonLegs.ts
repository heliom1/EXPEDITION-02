import { BoxGeometry, Group, Mesh, MeshStandardMaterial, type Scene, Vector3 } from 'three';

/** Lightweight suit legs stay in the world so they appear naturally when the player looks down. */
export class FirstPersonLegs {
  readonly root = new Group();
  private readonly material = new MeshStandardMaterial({ color: 0xc7c4b8, roughness: 0.82, transparent: true, opacity: 0 });
  private readonly bootMaterial = new MeshStandardMaterial({ color: 0x292c2d, roughness: 0.9, transparent: true, opacity: 0 });
  private readonly legs: Group[] = [];
  private shown = 0;

  constructor(scene: Scene) {
    scene.add(this.root);
    for (const side of [-1, 1]) {
      const pivot = new Group();
      pivot.position.set(side * 0.13, 0.68, -0.2);
      this.root.add(pivot);
      this.legs.push(pivot);
      const leg = new Mesh(new BoxGeometry(0.19, 0.65, 0.22), this.material);
      leg.position.set(0, -0.19, 0);
      pivot.add(leg);
      const knee = new Mesh(new BoxGeometry(0.22, 0.18, 0.12), this.material);
      knee.position.set(0, -0.34, -0.14);
      pivot.add(knee);
      const boot = new Mesh(new BoxGeometry(0.18, 0.16, 0.34), this.bootMaterial);
      boot.position.set(0, -0.54, -0.19);
      pivot.add(boot);
      const sole = new Mesh(new BoxGeometry(0.19, 0.045, 0.35), this.bootMaterial);
      sole.position.set(0, -0.64, -0.19);
      pivot.add(sole);
    }
    this.root.visible = false;
  }

  update(dt: number, t: number, pos: Vector3, yaw: number, pitch: number, grounded: boolean, moving: boolean, visible: boolean): void {
    const target = visible && pitch < -0.38 ? 1 : 0;
    this.shown += (target - this.shown) * (1 - Math.exp(-dt * 8));
    this.root.visible = this.shown > 0.015;
    if (!this.root.visible) return;
    this.root.position.copy(pos);
    this.root.rotation.y = yaw;
    const gait = grounded && moving ? Math.sin(t * 6.5) * 0.12 : 0;
    this.legs[0].rotation.x = gait;
    this.legs[1].rotation.x = -gait;
    this.root.position.y += grounded ? 0 : -0.05;
    this.material.opacity = this.shown * 0.96;
    this.bootMaterial.opacity = this.shown;
  }
}
