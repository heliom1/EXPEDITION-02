import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { PALETTE } from '../core/config';

/**
 * Mars daytime sky as in the references: butterscotch overhead, pale salmon at the horizon,
 * a small washed-out sun with a broad warm halo, and a faint blue tint very close to the sun
 * (Martian forward scattering). Rendered first, without depth, centred on the camera.
 */
export function createSky(sunDir: Vector3): Mesh {
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uSun: { value: sunDir.clone() },
      uZenith: { value: new Color(PALETTE.skyZenith) },
      uHorizon: { value: new Color(PALETTE.skyHorizon) },
      uDust: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun, uZenith, uHorizon;
      uniform float uDust;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float up = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));
        // Ground haze below the horizon line blends into fog.
        col = mix(col, uHorizon * 0.92, smoothstep(0.0, -0.08, d.y));
        float c = max(dot(d, normalize(uSun)), 0.0);
        col += vec3(1.0, 0.82, 0.62) * pow(c, 8.0) * 0.35;      // broad halo
        col += vec3(1.0, 0.9, 0.78) * pow(c, 90.0) * 0.6;        // inner glow
        col = mix(col, vec3(0.78, 0.84, 0.92), pow(c, 400.0) * 0.5); // bluish aureole
        col += vec3(1.0) * smoothstep(0.99955, 0.99975, c) * 3.0 * (1.0 - uDust * 0.85); // sun disc
        // dust storm: brown-orange murk, darker overhead, the sun only a dim smudge
        vec3 storm = mix(vec3(0.5, 0.31, 0.19), vec3(0.27, 0.16, 0.1), pow(up, 0.5));
        storm += vec3(0.9, 0.6, 0.35) * pow(c, 30.0) * 0.35;
        col = mix(col, storm, uDust);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new Mesh(new SphereGeometry(1000, 48, 24), mat);
  sky.name = 'Sky';
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  return sky;
}
