import { AnimationMixer, Box3, Group, LoopRepeat, Vector3, type AnimationAction } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** An animated character for cutscenes (the user's astronaut: clips Walk / Idle / Run). Faces +Z when rotation.y = 0. */
export class Actor {
  readonly root = new Group();
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private current: AnimationAction | null = null;

  private constructor(model: Group, clips: import('three').AnimationClip[], height: number) {
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    model.scale.setScalar(height / size.y);
    model.traverse((o) => { o.castShadow = true; o.frustumCulled = false; });
    this.root.add(model);
    this.root.visible = false;
    this.mixer = new AnimationMixer(model);
    for (const c of clips) this.actions.set(c.name.toLowerCase(), this.mixer.clipAction(c));
  }

  static async load(url: string, height = 1.85): Promise<Actor> {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
    return new Actor(gltf.scene, gltf.animations, height);
  }

  /** Cross-fades to the first clip whose name contains `name` (case-insensitive). */
  play(name: string, fade = 0.35, timeScale = 1): void {
    const key = [...this.actions.keys()].find((k) => k.includes(name.toLowerCase()));
    const next = key ? this.actions.get(key)! : null;
    if (!next || next === this.current) { if (next) next.timeScale = timeScale; return; }
    next.reset().setLoop(LoopRepeat, Infinity).setEffectiveTimeScale(timeScale).setEffectiveWeight(1).play();
    if (this.current) this.current.crossFadeTo(next, fade, false);
    this.current = next;
  }

  /** Places the actor and turns it to face along (dx, dz). */
  place(x: number, y: number, z: number, dx: number, dz: number): void {
    this.root.position.set(x, y, z);
    this.root.rotation.y = Math.atan2(dx, dz);
  }

  update(dt: number): void { if (this.root.visible) this.mixer.update(dt); }
}
