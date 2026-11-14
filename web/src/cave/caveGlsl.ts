import { ShaderChunk } from 'three';
import { NODES, SEGMENTS, MOUTH_SEGMENTS, CENTRE_LIFT, Y_STRETCH, MOUTH, BOUNDS, NOISE_WAVES } from './caveDef';

/**
 * GLSL generated from caveDef.ts so the shader mirror cannot drift from the JS SDF:
 * - cfCaveMouth(p): the mouth segments of the cave SDF (no fine noise) used to cut the terrain;
 * - cfCaveDepth(p): 0 at the entrance → 1 deep inside, used to block daylight in cave materials.
 */
const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

const segs = SEGMENTS.slice(0, MOUTH_SEGMENTS).map(([a, b]) => {
  const A = NODES[a], B = NODES[b];
  return `cfSeg(p, vec3(${f(A.x)}, ${f(A.floor + A.r * CENTRE_LIFT)}, ${f(A.z)}), vec3(${f(B.x)}, ${f(B.floor + B.r * CENTRE_LIFT)}, ${f(B.z)}), ${f(A.r)}, ${f(B.r)}, ${f(A.floor)}, ${f(B.floor)}, d, fl, best);`;
});
const waves = NOISE_WAVES.map(([kx, ky, kz, ph, a]) =>
  `n += ${f(a)} * sin(p.x * ${f(kx)} + p.y * ${f(ky)} + p.z * ${f(kz)} + ${f(ph)} + 0.9 * sin(p.x * ${f(kz * 1.7)} + p.z * ${f(kx * 1.3)} + ${f(ph * 0.5)}));`);

export const CAVE_GLSL = /* glsl */ `
float cfSmin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
float cfWallNoise(vec3 p) {
  float n = 0.0;
  ${waves.join('\n  ')}
  return n;
}
void cfSeg(vec3 p, vec3 a, vec3 b, float ra, float rb, float fa, float fb, inout float d, inout float fl, inout float best) {
  vec3 ab = b - a;
  float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  vec3 q = p - (a + ab * t);
  q.y *= ${f(Y_STRETCH)};
  float di = length(q) - mix(ra, rb, t);
  if (di < best) { best = di; fl = mix(fa, fb, t); }
  d = cfSmin(d, di, 3.0);
}
float cfCaveMouth(vec3 p) {
  if (p.x < ${f(BOUNDS.min[0])} || p.x > ${f(BOUNDS.max[0])} || p.z < ${f(BOUNDS.min[2])} || p.z > ${f(BOUNDS.max[2])}) return 1e5;
  float d = 1e5, fl = 0.0, best = 1e5;
  ${segs.join('\n  ')}
  d += cfWallNoise(p) * 1.1;
  float floorY = fl + 0.35 * sin(p.x * 0.7 + sin(p.z * 0.5) * 2.0) * sin(p.z * 0.6);
  return -cfSmin(-d, -(floorY - p.y), 1.2);
}
float cfCaveDepth(vec3 p) {
  float d = length(vec3(p.x - ${f(MOUTH.x)}, (p.y - ${f(MOUTH.y)}) * 0.6, p.z - ${f(MOUTH.z)}));
  return smoothstep(0.0, 1.0, clamp((d - 5.0) / 24.0, 0.0, 1.0));
}
`;

const DIR = 'getDirectionalLightInfo( directionalLight, directLight );';
const HEMI = 'irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );';

/** The light-accumulation chunk with daylight scaled by cave depth (point/spot lights untouched). */
export function caveLightsChunk(): string {
  const src = ShaderChunk.lights_fragment_begin;
  if (!src.includes(DIR) || !src.includes(HEMI)) throw new Error('three.js light chunk changed; update caveGlsl.ts');
  return 'float cfSkyVis = 1.0 - cfCaveDepth(vCfWorld) * 0.985;\n' +
    src.replace(DIR, `${DIR}\n\t\tdirectLight.color *= cfSkyVis;`).replace(HEMI, HEMI.replace(');', ') * cfSkyVis * cfSkyVis;'));
}

/**
 * Makes a lit material "cave aware": sunlight and sky light are scaled by daylight visibility
 * (1 at the entrance, ~0 deep inside) while point/spot lights — suit lamp, beacons — are unaffected.
 */
export function patchCaveLighting(shader: { vertexShader: string; fragmentShader: string }, opts: { declareWorld: boolean }): void {
  if (opts.declareWorld) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCfWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCfWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCfWorld;');
  }
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${CAVE_GLSL}`)
    .replace('#include <lights_fragment_begin>', caveLightsChunk());
}
