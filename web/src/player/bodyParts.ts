import { BufferGeometry, SkinnedMesh, type Object3D } from 'three';

/**
 * Cuts body parts out of a rigged character without touching its files: for every skinned mesh, keeps only the
 * triangles that are mainly driven by the wanted bones (legs, arms …). The new meshes share the original vertex
 * buffers, materials and skeleton, so they cost almost no memory and animate exactly like the full body.
 */
/** Legs plus hips and waist, so looking down shows a closed suit rather than open leg tops. */
export const LEG_BONES = /UpLeg|Leg_|Foot|Toe|Ankle|Hips|Spine_011|Spine1_/;
/** Forearms and hands (the upper arms would sit against the first-person camera). */
export const ARM_BONES = /(Left|Right)(ForeArm|Hand)/;

/** `minVerts` = how many of a triangle's 3 vertices must belong to the part (3 = no triangles reaching outside it). */
export function partMeshes(model: Object3D, wanted: (boneName: string) => boolean, minVerts = 2): SkinnedMesh[] {
  const sources: SkinnedMesh[] = [];
  model.traverse((o) => { if ((o as SkinnedMesh).isSkinnedMesh) sources.push(o as SkinnedMesh); });
  const out: SkinnedMesh[] = [];
  for (const src of sources) {
    const g = src.geometry;
    const si = g.getAttribute('skinIndex'), sw = g.getAttribute('skinWeight'), pos = g.getAttribute('position');
    if (!si || !sw) continue;
    const boneOk = src.skeleton.bones.map((b) => wanted(b.name));
    // Per vertex: does the wanted bone set carry most of the weight?
    const keep = new Uint8Array(pos.count);
    for (let v = 0; v < pos.count; v++) {
      let inW = 0, all = 0;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(v, k);
        all += w;
        if (boneOk[si.getComponent(v, k)]) inW += w;
      }
      keep[v] = inW > all * 0.5 ? 1 : 0;
    }
    const index = g.getIndex();
    const count = index ? index.count : pos.count;
    const at = (i: number) => (index ? index.getX(i) : i);
    const tris: number[] = [];
    for (let i = 0; i < count; i += 3) {
      const a = at(i), b = at(i + 1), c = at(i + 2);
      if (keep[a] + keep[b] + keep[c] >= minVerts) tris.push(a, b, c);
    }
    if (!tris.length) continue;
    const part = new BufferGeometry();
    for (const name of Object.keys(g.attributes)) part.setAttribute(name, g.getAttribute(name));
    part.setIndex(tris);
    const mesh = new SkinnedMesh(part, src.material);
    mesh.name = `${src.name}_part`;
    mesh.position.copy(src.position); mesh.quaternion.copy(src.quaternion); mesh.scale.copy(src.scale);
    mesh.bind(src.skeleton, src.bindMatrix);
    mesh.frustumCulled = false;
    src.parent?.add(mesh);
    out.push(mesh);
  }
  return out;
}
