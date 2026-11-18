import { BackSide, Color, CylinderGeometry, Group, Mesh, NormalBlending, ShaderMaterial, Vector3 } from 'three';

/**
 * Dust-storm "veil": three camera-centred cylinders (≈25 m, 60 m, 140 m) textured with wind-driven fbm dust in world
 * space, so billowing walls of dust roll past and occlude the distance in layers. Depth-tested (nearer objects stay in
 * front) but not depth-writing; fog-coloured so it blends with the exponential fog. Invisible when `amount` is 0.
 */
const vert = /* glsl */ `
varying vec3 vWorld; varying float vH;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz; vH = uv.y;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const frag = /* glsl */ `
uniform float uTime, uAmount, uLayer; uniform vec3 uColor, uLight, uWind;
varying vec3 vWorld; varying float vH;
float hash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.07; a*=0.5; } return s; }
void main() {
  float sc = 0.045 / uLayer;
  vec3 p = vWorld * sc - uWind * uTime * sc * 1.0;
  // billows: domain-warped fbm, stretched along the wind, rolling upward slightly
  vec3 q = vec3(fbm(p + vec3(0.0, uTime*0.05, 0.0)), fbm(p + 5.2), 0.0);
  float d = fbm(p * vec3(0.6, 1.4, 0.6) + q * 1.6 + vec3(0.0, -uTime * 0.08, 0.0));
  float dens = smoothstep(0.35, 0.85, d);
  // thicker near the ground, thinning with height; fade out at the cylinder top/bottom
  float ground = smoothstep(1.0, 0.0, vH) * smoothstep(0.0, 0.06, vH);
  float a = (dens * 0.85 + 0.15) * ground * uAmount * (0.55 + 0.25 * uLayer);
  vec3 col = mix(uColor * 0.75, uLight, d * 0.55);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.92));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class StormVeil {
  readonly group = new Group();
  private readonly mats: ShaderMaterial[] = [];
  private t = 0;

  constructor() {
    this.group.name = 'StormVeil';
    [[25, 1], [60, 1.6], [140, 2.4]].forEach(([r, layer], i) => {
      const m = new ShaderMaterial({
        vertexShader: vert, fragmentShader: frag, side: BackSide, transparent: true, depthWrite: false, blending: NormalBlending,
        uniforms: {
          uTime: { value: 0 }, uAmount: { value: 0 }, uLayer: { value: layer },
          uColor: { value: new Color(0x7a4a30) }, uLight: { value: new Color(0xb07a52) }, uWind: { value: new Vector3(11, 0.5, -5) },
        },
      });
      const mesh = new Mesh(new CylinderGeometry(r, r, r * 0.55, 48, 1, true).translate(0, r * 0.2, 0), m);
      mesh.renderOrder = 3 - i; // far layers first
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.mats.push(m);
    });
    this.group.visible = false;
  }

  /** `amount` 0…1 (storm strength where the camera is). */
  update(dt: number, cam: Vector3, amount: number): void {
    this.t += dt;
    this.group.visible = amount > 0.01;
    if (!this.group.visible) return;
    this.group.position.set(cam.x, cam.y - 6, cam.z);
    for (const m of this.mats) { m.uniforms.uTime.value = this.t; m.uniforms.uAmount.value = amount; }
  }
}
