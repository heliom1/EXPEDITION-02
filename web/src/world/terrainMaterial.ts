import { DataTexture, LinearFilter, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking, RGBAFormat, Texture, UnsignedByteType, Vector4 } from 'three';
import type { LayerTextures } from '../rendering/textures';
import { CAVE_GLSL } from '../cave/caveGlsl';

/**
 * Terrain shading: per-tile CinderRain splat weights blend five tileable ground layers
 * (dust, dark sand, bedrock, light sediment, gravel). Bedrock is projected triplanar so cliff
 * faces do not stretch, steep slopes are forced to bedrock, and a faint height banding suggests
 * the layered strata seen in the reference images.
 */
const COMMON = /* glsl */ `
uniform sampler2D cfSplat;
uniform vec4 cfTileRect; // xmin, zmax, size, 0
uniform sampler2D cfDustA, cfDarkA, cfBedA, cfSedA, cfGravA, cfDustN, cfRockN;
varying vec3 vCfWorld;
varying vec3 vCfNormal;
vec3 cfLayer(sampler2D t, vec2 p, float s) {
  vec3 a = texture(t, p * s).rgb;
  vec3 b = texture(t, p * s * 0.173 + vec2(0.31, 0.73)).rgb;
  return mix(a, b, 0.42);
}
vec3 cfTri(sampler2D t, vec3 p, vec3 n, float s) {
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  return texture(t, p.zy * s).rgb * w.x + texture(t, p.xz * s).rgb * w.y + texture(t, p.xy * s).rgb * w.z;
}
`;

const MAP = /* glsl */ `
vec3 cfN0 = normalize(vCfNormal);
vec2 cfUV = vec2((vCfWorld.x - cfTileRect.x) / cfTileRect.z, (cfTileRect.y - vCfWorld.z) / cfTileRect.z);
vec4 cfSp = texture(cfSplat, cfUV);
float cfSlope = 1.0 - cfN0.y;
float wDark = cfSp.r, wBed = cfSp.g, wSed = cfSp.b, wGrav = cfSp.a;
wBed = max(wBed, smoothstep(0.3, 0.55, cfSlope));
float wDust = max(0.0, 1.0 - (wDark + wBed + wSed + wGrav));
float cfSum = wDust + wDark + wBed + wSed + wGrav + 1e-4;
wDust /= cfSum; wDark /= cfSum; wBed /= cfSum; wSed /= cfSum; wGrav /= cfSum;
vec2 cfP = vCfWorld.xz;
vec3 cfCol = cfLayer(cfDustA, cfP, 1.0 / 6.0) * wDust
  + cfLayer(cfDarkA, cfP, 1.0 / 5.0) * wDark
  + cfTri(cfBedA, vCfWorld, cfN0, 1.0 / 9.0) * wBed
  + cfLayer(cfSedA, cfP, 1.0 / 7.0) * wSed
  + cfLayer(cfGravA, cfP, 1.0 / 3.0) * wGrav;
float cfMacro = texture(cfDustA, cfP * 0.00071).g;
float cfBand = sin(vCfWorld.y * 0.85 + texture(cfDustA, cfP * 0.0021).r * 7.0);
cfCol *= mix(0.86, 1.12, smoothstep(0.15, 0.45, cfMacro));
cfCol *= 1.0 + wBed * 0.14 * cfBand;
diffuseColor.rgb *= cfCol;
`;

const NORMAL = /* glsl */ `
{
  vec3 nD = texture(cfDustN, cfP / 6.0).xyz * 2.0 - 1.0;
  vec3 nR = texture(cfRockN, cfP / 9.0).xyz * 2.0 - 1.0;
  vec3 nt = normalize(mix(nD, nR, clamp(wBed + wGrav, 0.0, 1.0)));
  vec3 cfWN = normalize(cfN0 + vec3(nt.x, 0.0, -nt.y) * 0.55);
  normal = normalize((viewMatrix * vec4(cfWN, 0.0)).xyz);
}
`;

export function makeSplatTexture(data: Uint8Array, size: number): DataTexture {
  const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export function createTerrainMaterial(layers: LayerTextures, splat: Texture | null, rect: Vector4): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      cfSplat: { value: splat },
      cfTileRect: { value: rect },
      cfDustA: { value: layers.albedo.Dust },
      cfDarkA: { value: layers.albedo.DarkSand },
      cfBedA: { value: layers.albedo.Bedrock },
      cfSedA: { value: layers.albedo.Sediment },
      cfGravA: { value: layers.albedo.Gravel },
      cfDustN: { value: layers.normal.Dust },
      cfRockN: { value: layers.normal.Rock },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCfWorld;\nvarying vec3 vCfNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvCfNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}\n${CAVE_GLSL}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (cfCaveMouth(vCfWorld) < -0.35) discard; // cave entrance')
      .replace('#include <map_fragment>', MAP)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\n${NORMAL}`);
  };
  m.customProgramCacheKey = () => 'cf-terrain-v2';
  return m;
}

/** Shadow-pass material for terrain that also cuts the cave entrance, so sunlight can enter it. */
export function createTerrainDepthMaterial(): MeshDepthMaterial {
  const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCfWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCfWorld;\n${CAVE_GLSL}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (cfCaveMouth(vCfWorld) < -0.35) discard;');
  };
  m.customProgramCacheKey = () => 'cf-terrain-depth-v1';
  return m;
}
