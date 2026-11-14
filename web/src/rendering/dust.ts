import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three';

/**
 * Fine wind-blown dust drifting through a box around the camera. Purely visual; it reads the wind
 * and gives motion/depth cues in first person without hiding the terrain.
 */
export class DustMotes {
  readonly points: Points;
  private readonly mat: ShaderMaterial;
  private t = 0;

  constructor(count = 1800, box = 36) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = Math.random() * box;
      pos[i * 3 + 1] = Math.random() * box * 0.5;
      pos[i * 3 + 2] = Math.random() * box;
      seed[i] = Math.random();
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('seed', new BufferAttribute(seed, 1));
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uCam: { value: new Vector3() }, uTime: { value: 0 }, uBox: { value: box }, uWind: { value: new Vector3(1.6, 0.05, -0.7) }, uAmount: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform vec3 uCam, uWind; uniform float uTime, uBox, uAmount;
        varying float vA;
        void main() {
          vec3 p = position + uWind * uTime * (0.6 + seed) + vec3(sin(uTime * 0.7 + seed * 40.0), sin(uTime * 0.5 + seed * 17.0) * 0.4, cos(uTime * 0.6 + seed * 23.0)) * 0.6;
          vec3 half_ = vec3(uBox, uBox * 0.5, uBox) * 0.5;
          vec3 rel = mod(p - uCam + half_, vec3(uBox, uBox * 0.5, uBox)) - half_;
          vec4 mv = modelViewMatrix * vec4(uCam + rel, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = length(rel) / (uBox * 0.5);
          vA = (1.0 - smoothstep(0.6, 1.0, d)) * smoothstep(0.3, 1.5, -mv.z) * uAmount * (0.35 + 0.65 * seed);
          gl_PointSize = (1.2 + seed * 2.2) * (60.0 / max(-mv.z, 0.5));
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(c)) * vA * 0.32;
          gl_FragColor = vec4(vec3(0.95, 0.7, 0.5) * a, a);
        }`,
    });
    this.points = new Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.name = 'DustMotes';
  }

  update(dt: number, cam: Vector3): void {
    this.t += dt;
    this.mat.uniforms.uTime.value = this.t;
    this.mat.uniforms.uCam.value.copy(cam);
  }

  setAmount(a: number): void {
    this.mat.uniforms.uAmount.value = a;
  }
}
