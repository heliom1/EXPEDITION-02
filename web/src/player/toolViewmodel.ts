import {
  Box3, BoxGeometry, CylinderGeometry, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PointLight, Scene, Vector3, type Object3D, type WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PALETTE } from '../core/config';

/**
 * First-person tool presentation: the user's hand drill (drill.glb, optimised to opt/handdrill.glb) at the lower right.
 *
 * Rendered in its own pass (own scene, camera and lights, depth cleared) like most first-person games, so it never
 * clips into walls and is not blown out by the helmet lamp sitting 0.4 m behind it. Its lights follow the world: sun
 * direction, daylight fading in the cave, and a soft fill when the suit lamp is on.
 * Procedural animation: walk sway, raise/lower on (de)select, torque judder + push-in while drilling.
 */
export class ToolViewmodel {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(60, 1, 0.02, 10);
  readonly root = new Group();
  private model: Object3D | null = null;
  private pivot: Object3D | null = null;
  private readonly hand = new Group();
  private readonly handSpring = new Vector3();
  private readonly handSpringVelocity = new Vector3();
  private shown = 0;
  private spin = 0;
  private readonly sun = new DirectionalLight(PALETTE.sun, 2.4);
  private readonly sky = new HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.9);
  private readonly lamp = new PointLight(0xfff0dc, 0, 2, 2);
  visible = false;
  drilling = false;

  constructor() {
    this.scene.add(this.camera, this.sky);
    this.camera.add(this.root, this.sun, this.sun.target, this.lamp);
    this.lamp.position.set(0.1, 0.05, 0.1);
    const glove = new MeshStandardMaterial({ color: 0xd8d5c8, roughness: 0.88 });
    const cuff = new MeshStandardMaterial({ color: 0x9a4d28, roughness: 0.82 });
    const sleeve = new Mesh(new CylinderGeometry(0.047, 0.066, 0.22, 10), glove);
    sleeve.rotation.z = -0.52;
    sleeve.position.set(-0.105, 0.12, 0.035);
    this.hand.add(sleeve);
    const cuffMesh = new Mesh(new CylinderGeometry(0.052, 0.052, 0.07, 10), cuff);
    cuffMesh.rotation.z = -0.52;
    cuffMesh.position.set(-0.055, 0.045, 0.035);
    this.hand.add(cuffMesh);
    const palm = new Mesh(new BoxGeometry(0.105, 0.075, 0.065), glove);
    palm.position.set(0.012, -0.025, 0.012);
    this.hand.add(palm);
    for (let i = 0; i < 3; i++) {
      const finger = new Mesh(new CylinderGeometry(0.012, 0.014, 0.09, 7), glove);
      finger.rotation.x = Math.PI / 2;
      finger.position.set(0.038 - i * 0.032, -0.047, -0.035);
      this.hand.add(finger);
    }
    const thumb = new Mesh(new CylinderGeometry(0.013, 0.016, 0.075, 7), glove);
    thumb.rotation.set(0.5, 0, -0.85);
    thumb.position.set(0.075, -0.015, 0.005);
    this.hand.add(thumb);
    this.hand.position.set(0.01, 0.03, 0.015);
    this.root.add(this.hand);
  }

  async load(url: string): Promise<void> {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    const model = gltf.scene;
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3()), centre = box.getCenter(new Vector3());
    const k = 0.34 / Math.max(size.x, size.y, size.z); // longest axis 34 cm in view
    model.scale.setScalar(k);
    model.position.copy(centre).multiplyScalar(-k);
    model.traverse((o) => { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; });
    const pivot = new Group();
    pivot.add(model);
    if (size.z < Math.max(size.x, size.y)) pivot.rotation.y = size.x > size.y ? Math.PI / 2 : 0;
    this.pivot = pivot;
    this.model = model;
    this.root.add(pivot);
    this.root.visible = false;
  }

  /**
   * Draws the tool over the already-rendered world. `sunDir` is the world direction towards the sun, `daylight`
   * 0 (deep cave) … 1 (surface), `lampOn` the helmet lamp.
   */
  render(renderer: WebGLRenderer, world: PerspectiveCamera, sunDir: Vector3, daylight: number, lampOn: boolean): void {
    if (!this.model || !this.root.visible) return;
    this.camera.position.copy(world.position);
    this.camera.quaternion.copy(world.quaternion);
    this.camera.aspect = world.aspect;
    this.camera.fov = world.fov;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // Sun: place the light along the world sun direction relative to the camera (directional, so only direction matters).
    const local = sunDir.clone().applyQuaternion(this.camera.quaternion.clone().invert());
    this.sun.position.copy(local).multiplyScalar(5);
    this.sun.target.position.set(0, 0, 0);
    this.sun.intensity = 2.4 * daylight;
    this.sky.intensity = 0.15 + 0.75 * daylight;
    this.lamp.intensity = lampOn ? 0.6 : 0;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  /** Called every render frame. `moving` adds walk sway. */
  update(dt: number, t: number, moving: boolean): void {
    if (!this.model) return;
    const target = this.visible ? 1 : 0;
    this.shown += (target - this.shown) * Math.min(1, dt * 8);
    this.root.visible = this.shown > 0.02;
    if (!this.root.visible) return;
    const sway = moving ? 1 : 0.25;
    const lower = (1 - this.shown) * 0.35;
    this.root.position.set(0.25 + Math.sin(t * 6.5) * 0.007 * sway, -0.24 - lower + Math.abs(Math.cos(t * 6.5)) * 0.009 * sway, -0.5);
    this.root.rotation.set(0.06, -0.14, 0);
    const targetX = Math.sin(t * 6.5) * 0.025 * sway;
    const targetY = Math.abs(Math.cos(t * 6.5)) * 0.012 * sway;
    this.handSpringVelocity.x += (targetX - this.handSpring.x) * 52 * dt - this.handSpringVelocity.x * 13 * dt;
    this.handSpringVelocity.y += (targetY - this.handSpring.y) * 52 * dt - this.handSpringVelocity.y * 13 * dt;
    this.handSpring.addScaledVector(this.handSpringVelocity, dt);
    this.hand.rotation.x = this.handSpring.x;
    this.hand.position.y = 0.03 + this.handSpring.y;
    if (this.drilling) {
      this.spin += dt * 28;
      this.root.position.x += Math.sin(t * 91) * 0.002;
      this.root.position.y += Math.cos(t * 113) * 0.002;
      this.root.position.z -= 0.04;
    }
    // The optimised model has no separate bit, so drilling reads as torque judder rather than spinning the whole tool.
    if (this.pivot) this.pivot.rotation.z = this.drilling ? Math.sin(this.spin * 3) * 0.02 : 0;
  }
}
