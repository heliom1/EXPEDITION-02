import { BufferAttribute, BufferGeometry, Color, Mesh, MeshStandardMaterial } from 'three';
import type { WorldData } from './worldData';
import type { LayerTextures } from '../rendering/textures';

/**
 * Non-walkable horizon terrain (CinderRain rings A/B, 112 m grid over ±14.3 km). Fragments inside
 * the playable square are discarded so the streamed terrain is always the visible surface there.
 */
export function createBackdrop(world: WorldData, layers: LayerTextures): Mesh {
  const { res, extent, base, size } = world.meta.backdrop;
  const step = (2 * extent) / (res - 1);
  const h = (i: number, j: number) => {
    i = Math.max(0, Math.min(res - 1, i));
    j = Math.max(0, Math.min(res - 1, j));
    return base + (world.backdrop[j * res + i] / 65535) * size;
  };
  const pos = new Float32Array(res * res * 3);
  const nor = new Float32Array(res * res * 3);
  const col = new Float32Array(res * res * 3);
  const dust = new Color(0xb4683f), rock = new Color(0x6e3a26), c = new Color();
  for (let j = 0; j < res; j++)
    for (let i = 0; i < res; i++) {
      const v = j * res + i;
      pos[v * 3] = -extent + i * step;
      pos[v * 3 + 1] = h(i, j) - 1.5;
      pos[v * 3 + 2] = -extent + j * step;
      const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * step), dz = (h(i, j + 1) - h(i, j - 1)) / (2 * step);
      const l = Math.hypot(dx, 1, dz);
      nor[v * 3] = -dx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = -dz / l;
      c.copy(dust).lerp(rock, Math.min(1, Math.max(0, (1 - 1 / l) * 3)));
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
  const idx = new Uint32Array((res - 1) * (res - 1) * 6);
  let p = 0;
  for (let j = 0; j < res - 1; j++)
    for (let i = 0; i < res - 1; i++) {
      const a = j * res + i, b = a + 1, cc = a + res, d = cc + 1;
      idx[p++] = a; idx[p++] = cc; idx[p++] = b; idx[p++] = b; idx[p++] = cc; idx[p++] = d;
    }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeBoundingSphere();

  const inner = world.meta.extent - 1;
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.cfInner = { value: inner };
    shader.uniforms.cfRock = { value: layers.albedo.Bedrock };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCfWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCfWorld;\nuniform float cfInner;\nuniform sampler2D cfRock;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (abs(vCfWorld.x) < cfInner && abs(vCfWorld.z) < cfInner) discard;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(1.0), texture(cfRock, vCfWorld.xz / 60.0).rgb * 2.2, 0.35);');
  };
  m.customProgramCacheKey = () => 'cf-backdrop-v1';
  const mesh = new Mesh(g, m);
  mesh.name = 'Backdrop';
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
