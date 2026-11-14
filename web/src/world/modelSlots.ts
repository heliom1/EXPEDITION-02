import { Box3, Group, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Integration points for the user's own models. When a file exists at
 * public/assets/models/<slot>.glb it replaces the labelled placeholder at the same transform.
 * Scale/rotation/offset defaults are 1/0/0 because the models' units and orientation are not yet
 * known; adjust per slot in SLOT_TRANSFORMS once the files are supplied (see docs/ASSET_REGISTER.md).
 */
export type ModelSlot = 'outpost' | 'rover' | 'drill' | 'astronaut';

export const SLOT_TRANSFORMS: Record<ModelSlot, { scale: number; rotateY: number; offset: [number, number, number] }> = {
  outpost: { scale: 1, rotateY: 0, offset: [0, 0, 0] },
  rover: { scale: 1, rotateY: 0, offset: [0, 0, 0] },
  drill: { scale: 1, rotateY: 0, offset: [0, 0, 0] },
  astronaut: { scale: 1, rotateY: 0, offset: [0, 0, 0] },
};

export interface SlotResult { slot: ModelSlot; status: 'placeholder' | 'loaded' | 'error'; detail?: string }

export async function tryLoadSlot(base: string, slot: ModelSlot, placeholder: Object3D): Promise<SlotResult> {
  const url = `${base}${slot}.glb`;
  try {
    const head = await fetch(url, { method: 'HEAD' });
    const type = head.headers.get('content-type') ?? '';
    // Dev servers answer unknown paths with index.html; treat that as "not supplied".
    if (!head.ok || type.includes('text/html')) return { slot, status: 'placeholder' };
    const gltf = await new GLTFLoader().loadAsync(url);
    const t = SLOT_TRANSFORMS[slot];
    const model: Group = gltf.scene;
    model.scale.setScalar(t.scale);
    model.rotation.y = t.rotateY;
    model.position.set(...t.offset);
    model.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
    // Keep the placeholder's world transform; hide its own meshes.
    placeholder.children.forEach((c) => (c.visible = false));
    placeholder.add(model);
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    return { slot, status: 'loaded', detail: `bounds ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)} m` };
  } catch (e) {
    return { slot, status: 'error', detail: String(e) };
  }
}
