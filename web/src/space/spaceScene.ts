import {
  AdditiveBlending, BackSide, BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute,
  Group, LineDashedMaterial, LineLoop, Mesh, MeshStandardMaterial, PerspectiveCamera, Points, Quaternion, Raycaster, RingGeometry,
  Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Sprite, SpriteMaterial, Texture, TextureLoader, TorusGeometry, Vector2, Vector3,
  AmbientLight, DirectionalLight, type WebGLRenderer,
} from 'three';
import { Spacecraft } from './spacecraft';

/**
 * Orbital scene (main menu "Orbital Command" + the space half of the opening cinematic).
 * Mars uses NASA data: the Viking MDIM colour mosaic (NASA 3D Resources) and a normal map derived from MGS MOLA
 * topography (PDS MEGDR, 4 px/deg) — tools/build-space-textures.mjs. Scale: 1 unit = 33.895 km (Mars radius = 100).
 * Moon orbits use real distances; Phobos/Deimos sizes are exaggerated ×4 so they read at menu scale.
 */
export const MARS_R = 100;
const KM = MARS_R / 3389.5;

const marsVert = /* glsl */`
varying vec2 vUv; varying vec3 vN; varying vec3 vT; varying vec3 vWorld; varying vec3 vObj;
void main(){
  vUv = uv; vObj = position;
  vec3 n = normalize(position);
  vec3 t = normalize(vec3(n.z, 0.0, -n.x) + vec3(1e-5,0.0,0.0));
  vN = normalize(mat3(modelMatrix) * n);
  vT = normalize(mat3(modelMatrix) * t);
  vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const NOISE = /* glsl */`
float hash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }`;
/**
 * Procedural craters for close approach (the colour/normal maps are only 4 px/deg and turn to mush near the surface).
 * Cellular: each cell holds one crater (bowl + raised rim + faint ejecta) with an analytic height gradient, so the
 * relief lights correctly. Returns gradient in xyz, height in w.
 */
const CRATERS = /* glsl */`
vec3 hash3(vec3 p){ p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6))); return fract(sin(p)*43758.5453); }
vec4 craterLayer(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 grad = vec3(0.0); float h = 0.0;
  for (int z=-1; z<=1; z++) for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++) {
    vec3 g = vec3(float(x), float(y), float(z)); vec3 o = hash3(i + g);
    if (o.z > 0.62) continue;                             // not every cell has a crater
    float r = 0.18 + 0.32*o.x;
    vec3 v = f - (g + o); float len = length(v) + 1e-5; float d = len / r;
    if (d > 1.8) continue;
    float depth = 0.6 + 0.8*o.y;
    // profile: parabolic bowl inside, sharp rim at d=1, exponential ejecta falloff outside
    float hb = d < 1.0 ? (d*d - 1.0) : 0.0;
    float rim = exp(-pow((d - 1.0)*5.0, 2.0));
    float ej = d > 1.0 ? exp(-(d - 1.0)*3.0)*0.25 : 0.0;
    float hp = (hb*0.7 + rim*0.45 + ej) * depth;
    float dh = (d < 1.0 ? 2.0*d*0.7 : -3.0*ej/0.25*0.25) + rim*(-50.0*(d - 1.0))*0.45;
    h += hp;
    grad += dh * depth * (v / (len * r));
  }
  return vec4(grad, h);
}`;
const marsFrag = /* glsl */`
uniform sampler2D uColor, uNormal; uniform vec3 uSun, uCam; uniform float uGrid, uTime, uDetail, uSelect; uniform vec2 uSite;
varying vec2 vUv; varying vec3 vN; varying vec3 vT; varying vec3 vWorld; varying vec3 vObj;
${NOISE}
${CRATERS}
void main(){
  vec3 N0 = normalize(vN), T = normalize(vT - N0*dot(vT,N0)), B = cross(N0, T);
  vec3 nm = texture2D(uNormal, vUv).xyz*2.0-1.0;
  // close-orbit micro relief (shader noise beyond the 4 px/deg data)
  float d = fbm(vObj*0.9) - 0.5, d2 = fbm(vObj*6.0) - 0.5;
  nm.xy += vec2(d2, fbm(vObj*6.0+17.0)-0.5) * 0.12 * uDetail + vec2(d, fbm(vObj*0.9+5.0)-0.5) * 0.04;
  vec3 N = normalize(T*nm.x + B*nm.y + N0*nm.z);
  vec3 L = normalize(uSun), V = normalize(uCam - vWorld);
  vec3 alb = texture2D(uColor, vUv).rgb;
  alb *= 0.92 + 0.16*(fbm(vObj*2.5)) ;
  float craterH = 0.0;
  if (uDetail > 0.01) {
    // three crater scales (~56, 19, 6 km cells) fade in with proximity; perturb the normal with their gradient
    vec4 c1 = craterLayer(vObj*0.6), c2 = craterLayer(vObj*1.8 + 11.0), c3 = craterLayer(vObj*5.4 + 23.0);
    vec3 gsum = c1.xyz*0.6 + c2.xyz*1.8*0.45 + c3.xyz*5.4*0.22;
    vec3 gt = gsum - N0*dot(gsum, N0);
    N = normalize(N - gt * 0.022 * uDetail);
    craterH = (c1.w + c2.w*0.6 + c3.w*0.35) * uDetail;
    // albedo: dark basalt plains vs bright dust, wind streaks, darker crater floors and bright rims
    float basalt = smoothstep(0.42, 0.62, fbm(vObj*0.35 + 3.0));
    float streak = fbm(vec3(vObj.x*3.0, vObj.y*0.6, vObj.z*3.0) + 9.0);
    vec3 detailAlb = alb * mix(vec3(1.06, 0.98, 0.92), vec3(0.62, 0.5, 0.44), basalt * 0.7);
    detailAlb *= 0.86 + 0.28*streak;
    detailAlb *= clamp(1.0 + craterH*0.22, 0.7, 1.25);
    detailAlb *= 0.85 + 0.3*fbm(vObj*14.0);
    alb = mix(alb, detailAlb, uDetail);
  }
  // richer rust instead of washed-out beige: slight gamma + red bias
  alb = pow(alb, vec3(1.18)) * vec3(1.1, 0.93, 0.8);
  float geo = dot(N0, L);
  float lam = max(dot(N, L), 0.0);
  // soft terminator + Minnaert-style limb darkening for a dusty regolith
  float day = smoothstep(-0.08, 0.18, geo);
  float minn = pow(max(dot(N0,V),0.0), 0.25);
  vec3 col = alb * lam * day * minn * mix(3.1, 2.7, uDetail);
  col *= mix(vec3(1.0), vec3(1.25,0.72,0.48), smoothstep(0.35, 0.0, geo) * day); // reddened light at low sun
  col += alb * 0.012;                                                          // faint night-side fill
  float rim = pow(1.0 - max(dot(N0, V), 0.0), 3.0);
  col += vec3(0.93,0.70,0.52) * rim * smoothstep(-0.2, 0.4, geo) * 0.28;        // dusty haze at the limb
  // holographic survey grid + landing site during selection
  float lat = (vUv.y-0.5)*180.0, lon = (vUv.x-0.5)*360.0;
  float g = max(1.0 - smoothstep(0.0, 0.12, abs(fract(lat/15.0+0.5)-0.5)*15.0), 1.0 - smoothstep(0.0, 0.12, abs(fract(lon/15.0+0.5)-0.5)*15.0*cos(radians(lat))));
  float scan = smoothstep(0.02, 0.0, abs(fract(vUv.y*1.0 - uTime*0.08) - 0.5) - 0.0) ;
  col += vec3(1.0,0.66,0.38) * g * uGrid * (0.06 + 0.12*scan) * (0.3 + 0.7*day);
  vec2 ds = vec2((lon-uSite.x)*cos(radians(lat)), lat-uSite.y);
  float r = length(ds);
  float ring = smoothstep(0.7, 0.0, abs(r - 2.2 - 0.8*sin(uTime*3.0))) + smoothstep(0.9,0.0,r)*0.8;
  col += vec3(1.0,0.82,0.5) * ring * uSelect * 1.6;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const atmoVert = /* glsl */`
varying vec3 vN; varying vec3 vWorld;
void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const atmoFrag = /* glsl */`
uniform vec3 uSun, uCam, uCenter; uniform float uStrength; varying vec3 vN; varying vec3 vWorld;
void main(){
  vec3 V = normalize(uCam - vWorld), N = normalize(vN), L = normalize(uSun);
  vec3 up = normalize(vWorld - uCenter);
  float facing = dot(V, -N);              // back faces: 1 at the centre of the disc, 0 at the shell's silhouette
  float edge = pow(clamp(1.0 - facing, 0.0, 1.0), 1.0);
  float glow = pow(smoothstep(0.0, 1.0, 1.0 - abs(facing - 0.195)/0.5), 5.0) * step(facing, 0.2);
  float lit = smoothstep(-0.35, 0.35, dot(up, L));
  float fwd = pow(max(dot(-V, L), 0.0), 8.0);  // forward scattering when looking towards the sun past the limb
  vec3 c = mix(vec3(1.0,0.72,0.5), vec3(0.75,0.8,1.0), 0.3*edge);
  float a = glow * (lit + fwd*0.6) * uStrength;
  gl_FragColor = vec4(c * a, a);
}`;
const skyFrag = /* glsl */`
uniform sampler2D uStars; uniform float uTime; varying vec3 vDir; varying vec2 vUv;
${NOISE}
void main(){
  vec3 s = texture2D(uStars, vUv).rgb;
  s = pow(s, vec3(1.35)) * 1.6;
  vec3 d = normalize(vDir);
  float neb = fbm(d*3.0 + vec3(0.0,0.0,uTime*0.002)) * fbm(d*7.0+11.0);
  float band = exp(-pow(dot(d, normalize(vec3(0.3,0.9,-0.3)))*2.4, 2.0));
  vec3 nc = mix(vec3(0.35,0.12,0.22), vec3(0.12,0.2,0.42), fbm(d*2.0+3.0));
  vec3 col = s + nc * pow(neb, 2.2) * band * 0.55;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const skyVert = /* glsl */`
varying vec3 vDir; varying vec2 vUv;
void main(){ vDir = position; vUv = uv; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0);
#ifdef USE_REVERSED_DEPTH_BUFFER
  gl_Position = vec4(p.xy, 0.0, p.w); // far plane (reversed-Z: depth 0 = far)
#else
  gl_Position = p.xyww;
#endif
}`;
const starVert = /* glsl */`
attribute float aSize; attribute vec3 aColor; attribute float aPhase; uniform float uTime; varying vec3 vC; varying float vA;
void main(){ vC = aColor; vA = 0.65 + 0.35*sin(uTime*(1.0+aPhase*3.0) + aPhase*40.0);
  vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = aSize; gl_Position = projectionMatrix*mv;
#ifdef USE_REVERSED_DEPTH_BUFFER
  gl_Position.z = gl_Position.w*0.0001;
#else
  gl_Position.z = gl_Position.w*0.9999;
#endif
}`;
const starFrag = /* glsl */`
varying vec3 vC; varying float vA;
void main(){ vec2 p = gl_PointCoord*2.0-1.0; float r = dot(p,p); if (r>1.0) discard; float a = exp(-r*4.0)*vA; gl_FragColor = vec4(vC*a, a); }`;

function glowTexture(inner: string, outer: string): Texture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, inner); grd.addColorStop(0.12, inner); grd.addColorStop(0.35, outer); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

export interface SpacePose { pos: Vector3; look: Vector3; fov: number }

export class SpaceScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(45, 1, 0.002, 60000);
  readonly mars: Mesh;
  readonly marsSpin = new Group();
  readonly craft = new Spacecraft();
  readonly station = new Group();
  readonly sunDir = new Vector3(1, 0.18, 0.45).normalize();
  private readonly marsMat: ShaderMaterial;
  private readonly atmoMat: ShaderMaterial;
  private readonly skyMat: ShaderMaterial;
  private readonly starMat: ShaderMaterial;
  private readonly moons: Array<{ mesh: Mesh; r: number; period: number; incl: number; phase: number }> = [];
  private readonly sats: Array<{ g: Group; r: number; period: number; q: Quaternion; phase: number }> = [];
  private readonly dust: Points;
  private readonly selectRing: Mesh;
  private t = 0;
  /** 0…1 hover highlight, 0…1 selection (grid, landing-site ring). */
  hover = 0;
  selected = 0;
  /** Whether the menu flight path animates the craft around Mars (off during the opening cinematic). */
  menuCraft = true;
  /** Camera rig: the menu blends between `idle` and `focus` poses; cinematics write `camera` directly. */
  focus = 0;
  /** Planet-relative landing site (longitude, latitude in degrees) — Arcadia Planitia, a NASA subsurface-ice mapping target. */
  readonly site = new Vector2(-150, 46);
  ready: Promise<void>;

  constructor(base: string) {
    const loader = new TextureLoader();
    const load = (f: string, srgb: boolean) => new Promise<Texture>((res, rej) => loader.load(`${base}assets/space/${f}`, (t) => { if (srgb) t.colorSpace = SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, rej));
    this.marsMat = new ShaderMaterial({
      vertexShader: marsVert, fragmentShader: marsFrag,
      uniforms: { uColor: { value: null }, uNormal: { value: null }, uSun: { value: this.sunDir }, uCam: { value: new Vector3() }, uGrid: { value: 0 }, uTime: { value: 0 }, uDetail: { value: 0 }, uSelect: { value: 0 }, uSite: { value: this.site } },
    });
    this.mars = new Mesh(new SphereGeometry(MARS_R, 160, 96), this.marsMat);
    this.marsSpin.rotation.z = (25.19 * Math.PI) / 180; // axial tilt
    this.marsSpin.add(this.mars);
    this.scene.add(this.marsSpin);
    this.atmoMat = new ShaderMaterial({
      vertexShader: atmoVert, fragmentShader: atmoFrag, transparent: true, depthWrite: false, blending: AdditiveBlending, side: BackSide,
      uniforms: { uSun: { value: this.sunDir }, uCam: { value: new Vector3() }, uCenter: { value: new Vector3() }, uStrength: { value: 0.8 } },
    });
    this.scene.add(new Mesh(new SphereGeometry(MARS_R * 1.02, 96, 64), this.atmoMat));

    // Sky: NASA Tycho star map + faint procedural nebula, then twinkling foreground stars
    this.skyMat = new ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, side: BackSide, depthWrite: false, uniforms: { uStars: { value: null }, uTime: { value: 0 } } });
    const sky = new Mesh(new SphereGeometry(30000, 64, 32), this.skyMat);
    sky.renderOrder = -10; sky.frustumCulled = false;
    this.scene.add(sky);
    const N = 6000, pos: number[] = [], col: number[] = [], size: number[] = [], ph: number[] = [];
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      pos.push(Math.cos(a) * s * 25000, u * 25000, Math.sin(a) * s * 25000);
      const k = Math.random(); const c = k < 0.15 ? [0.7, 0.8, 1] : k < 0.85 ? [1, 0.97, 0.92] : [1, 0.75, 0.55];
      const b = 0.4 + Math.pow(Math.random(), 6) * 1.6; col.push(c[0] * b, c[1] * b, c[2] * b);
      size.push(1 + Math.pow(Math.random(), 8) * 3.5); ph.push(Math.random());
    }
    const sg = new BufferGeometry();
    sg.setAttribute('position', new Float32BufferAttribute(pos, 3));
    sg.setAttribute('aColor', new Float32BufferAttribute(col, 3));
    sg.setAttribute('aSize', new Float32BufferAttribute(size, 1));
    sg.setAttribute('aPhase', new Float32BufferAttribute(ph, 1));
    this.starMat = new ShaderMaterial({ vertexShader: starVert, fragmentShader: starFrag, transparent: true, depthWrite: false, blending: AdditiveBlending, uniforms: { uTime: { value: 0 } } });
    const stars = new Points(sg, this.starMat); stars.frustumCulled = false; stars.renderOrder = -9;
    this.scene.add(stars);

    // Sun + Earth (distant celestial bodies)
    const sun = new Sprite(new SpriteMaterial({ map: glowTexture('rgba(255,250,235,1)', 'rgba(255,190,120,0.25)'), blending: AdditiveBlending, depthWrite: false, transparent: true }));
    sun.position.copy(this.sunDir).multiplyScalar(20000); sun.scale.setScalar(2600);
    const earth = new Sprite(new SpriteMaterial({ map: glowTexture('rgba(190,215,255,1)', 'rgba(90,140,255,0.15)'), blending: AdditiveBlending, depthWrite: false, transparent: true }));
    earth.position.copy(new Vector3(0.82, 0.27, 0.5).normalize()).multiplyScalar(20000); earth.scale.setScalar(160);
    this.scene.add(sun, earth);

    // Light for the spacecraft / satellites / station (Mars uses its own shader lighting)
    const key = new DirectionalLight(0xfff1de, 3.2); key.position.copy(this.sunDir).multiplyScalar(500);
    const fill = new AmbientLight(0x8a5a40, 0.12);
    this.scene.add(key, key.target, fill);

    // Moons: Phobos 9,376 km / 7.65 h, Deimos 23,463 km / 30.3 h (time sped up for the menu)
    const moonMat = (f: string) => { const m = new MeshStandardMaterial({ color: 0x8a7a6c, roughness: 1 }); void load(f, true).then((t) => { m.map = t; m.color.set(0xffffff); m.needsUpdate = true; }); return m; };
    const phobos = new Mesh(new SphereGeometry(11.1 * KM * 4, 32, 16), moonMat('phobos.webp')); phobos.scale.set(1.2, 0.95, 0.85);
    const deimos = new Mesh(new SphereGeometry(6.2 * KM * 4, 24, 12), moonMat('deimos.webp')); deimos.scale.set(1.15, 0.9, 0.8);
    this.moons.push({ mesh: phobos, r: 9376 * KM, period: 140, incl: 0.019, phase: 2.2 }, { mesh: deimos, r: 23463 * KM, period: 560, incl: 0.03, phase: 4.1 });
    for (const m of this.moons) this.scene.add(m.mesh);

    // Communication / relay satellites with dashed orbit paths
    const satBody = new MeshStandardMaterial({ color: 0xd8d6d0, roughness: 0.5, metalness: 0.4 });
    const satFoil = new MeshStandardMaterial({ color: 0xd4a640, roughness: 0.3, metalness: 0.9 });
    const satPanel = new MeshStandardMaterial({ color: 0x1b2a55, roughness: 0.35, metalness: 0.5, side: DoubleSide });
    const orbits: Array<[number, number, number, number]> = [[118, 46, 0.5, 0.3], [134, 70, -0.35, 1.7], [152, 95, 1.05, 4.0]];
    for (const [r, period, incl, phase] of orbits) {
      const g = new Group();
      g.add(new Mesh(new BoxGeometry(0.5, 0.5, 0.7), satFoil));
      for (const s of [-1, 1]) { const p = new Mesh(new BoxGeometry(1.6, 0.03, 0.5), satPanel); p.position.x = s * 1.1; g.add(p); }
      const dish = new Mesh(new SphereGeometry(0.28, 12, 6, 0, Math.PI * 2, 0, 0.8), satBody); dish.position.z = 0.45; dish.rotation.x = Math.PI / 2; g.add(dish);
      g.scale.setScalar(0.55);
      const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0.3).normalize(), incl);
      this.sats.push({ g, r, period, q, phase });
      this.scene.add(g);
      const pts: number[] = [];
      for (let i = 0; i < 256; i++) { const a = (i / 256) * Math.PI * 2; const v = new Vector3(Math.cos(a) * r, 0, Math.sin(a) * r).applyQuaternion(q); pts.push(v.x, v.y, v.z); }
      const lg = new BufferGeometry(); lg.setAttribute('position', new Float32BufferAttribute(pts, 3));
      const line = new LineLoop(lg, new LineDashedMaterial({ color: 0xe8a070, dashSize: 2.2, gapSize: 2.6, transparent: true, opacity: 0.32, depthWrite: false }));
      line.computeLineDistances();
      this.scene.add(line);
    }

    // Orbital station (Expedition logistics node): hub, ring habitat on spokes, truss with arrays
    const st = this.station;
    const hub = new Mesh(new CylinderGeometry(0.9, 0.9, 5, 24), satBody); hub.rotation.x = Math.PI / 2; st.add(hub);
    const ring = new Mesh(new TorusGeometry(4.2, 0.55, 14, 64), satBody); st.add(ring);
    for (let i = 0; i < 4; i++) { const sp = new Mesh(new CylinderGeometry(0.12, 0.12, 4.2, 8), satBody); sp.rotation.z = (i * Math.PI) / 2; sp.position.set(Math.cos((i * Math.PI) / 2) * 2.1, Math.sin((i * Math.PI) / 2) * 2.1, 0); sp.rotation.z = (i * Math.PI) / 2 + Math.PI / 2; st.add(sp); }
    const truss = new Mesh(new BoxGeometry(0.4, 0.4, 14), satFoil); truss.position.z = -6; st.add(truss);
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { const p = new Mesh(new BoxGeometry(5, 0.05, 2.2), satPanel); p.position.set(s * 3.2, 0, -9 - k * 2.6); st.add(p); }
    const winMat = new MeshStandardMaterial({ color: 0x111111, emissive: new Color(0xffc38a), emissiveIntensity: 1.4 });
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const w = new Mesh(new BoxGeometry(0.25, 0.12, 0.05), winMat); w.position.set(Math.cos(a) * 4.2, Math.sin(a) * 4.2, 0.56); st.add(w); }
    st.scale.setScalar(0.35);
    this.scene.add(st);

    // Expedition 02 spacecraft (the same vehicle the opening cinematic flies)
    this.craft.travelMode = true;
    this.craft.root.scale.setScalar(0.03);
    this.scene.add(this.craft.root);

    // Selection ring (screen-facing, around the planet)
    this.selectRing = new Mesh(new RingGeometry(MARS_R * 1.12, MARS_R * 1.125, 160), new ShaderMaterial({
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
      uniforms: { uA: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: 'uniform float uA, uTime; varying vec2 vP; void main(){ float a = atan(vP.y, vP.x); float tick = step(0.5, fract(a*24.0/6.2831853 + uTime*0.05)); gl_FragColor = vec4(vec3(1.0,0.7,0.45)*uA*(0.55+0.45*tick), uA*(0.55+0.45*tick)); }',
    }));
    this.scene.add(this.selectRing);

    // Drifting space particles near the camera
    const dp: number[] = [];
    for (let i = 0; i < 400; i++) dp.push((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
    const dg = new BufferGeometry(); dg.setAttribute('position', new Float32BufferAttribute(dp, 3));
    const dCol: number[] = []; const dSize: number[] = []; const dPh: number[] = [];
    for (let i = 0; i < 400; i++) { dCol.push(0.35, 0.3, 0.27); dSize.push(1.5); dPh.push(Math.random()); }
    dg.setAttribute('aColor', new Float32BufferAttribute(dCol, 3)); dg.setAttribute('aSize', new Float32BufferAttribute(dSize, 1)); dg.setAttribute('aPhase', new Float32BufferAttribute(dPh, 1));
    this.dust = new Points(dg, new ShaderMaterial({ vertexShader: starVert.replace(/#ifdef USE_REVERSED_DEPTH_BUFFER[\s\S]*?#endif/, ''), fragmentShader: starFrag, transparent: true, depthWrite: false, blending: AdditiveBlending, uniforms: { uTime: { value: 0 } } }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    this.ready = Promise.all([load('mars_color.webp', true), load('mars_normal.png', false), load('stars.webp', true)]).then(([c, n, s]) => {
      this.marsMat.uniforms.uColor.value = c; this.marsMat.uniforms.uNormal.value = n; this.skyMat.uniforms.uStars.value = s;
    });
    this.camera.position.set(0, 60, 420);
  }

  /** Menu camera: idle wide drift (Mars right of centre, station foreground) ↔ focus (Mars left, sidebar on the right). */
  menuPose(out: SpacePose): SpacePose {
    const a = this.t * 0.012;
    const idle = { pos: new Vector3(-150 + Math.sin(a) * 12, 38 + Math.sin(a * 0.7) * 6, 330), look: new Vector3(-60, 6, 0), fov: 40 };
    const foc = { pos: new Vector3(-95, 34, 330), look: new Vector3(72, 2, 0), fov: 38 };
    const f = this.focus * this.focus * (3 - 2 * this.focus);
    out.pos.lerpVectors(idle.pos, foc.pos, f); out.look.lerpVectors(idle.look, foc.look, f); out.fov = idle.fov + (foc.fov - idle.fov) * f;
    return out;
  }

  /** World position of a planet surface point (lon/lat in degrees) at radius factor k. */
  surfacePoint(lonDeg: number, latDeg: number, k = 1): Vector3 {
    // Inverse of SphereGeometry's UV mapping: u = (lon+180)/360, v = (lat+90)/180
    const phi = ((lonDeg + 180) / 360) * Math.PI * 2, theta = (1 - (latDeg + 90) / 180) * Math.PI;
    const v = new Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)).multiplyScalar(MARS_R * k);
    return this.mars.localToWorld(v);
  }

  /** Ray–planet test for clicks (NDC coordinates). */
  hitMars(ndcX: number, ndcY: number): boolean {
    const rc = new Raycaster();
    rc.setFromCamera(new Vector2(ndcX, ndcY), this.camera);
    return rc.ray.distanceSqToPoint(new Vector3()) < (MARS_R * 1.04) ** 2 && rc.ray.direction.dot(new Vector3().sub(rc.ray.origin)) > 0;
  }

  /** Clears hover/selection visuals at once (opening cinematic). */
  resetSelection(): void {
    this.hover = 0; this.selected = 0; this.focus = 0;
    this.marsMat.uniforms.uGrid.value = 0; this.marsMat.uniforms.uSelect.value = 0;
    (this.selectRing.material as ShaderMaterial).uniforms.uA.value = 0;
  }

  /** Planet rotation in radians (one sol ≈ 24.6 h, shown much faster in the menu). */
  spinRate = 0.01;

  update(dt: number): void {
    this.t += dt;
    this.mars.rotation.y += dt * this.spinRate;
    const u = this.marsMat.uniforms;
    u.uTime.value = this.t;
    u.uCam.value.copy(this.camera.position);
    u.uGrid.value += ((this.selected > 0.5 ? 1 : 0) - u.uGrid.value) * Math.min(1, dt * 2);
    u.uSelect.value = this.selected;
    u.uDetail.value = Math.min(1, Math.max(0, (260 - this.camera.position.length()) / 120));
    this.atmoMat.uniforms.uCam.value.copy(this.camera.position);
    this.skyMat.uniforms.uTime.value = this.t;
    this.starMat.uniforms.uTime.value = this.t;
    (this.dust.material as ShaderMaterial).uniforms.uTime.value = this.t;
    this.dust.position.copy(this.camera.position);
    for (const m of this.moons) {
      const a = m.phase + (this.t / m.period) * Math.PI * 2;
      m.mesh.position.set(Math.cos(a) * m.r, Math.sin(a) * m.r * m.incl, Math.sin(a) * m.r);
      m.mesh.rotation.y = -a; // tidally locked
    }
    for (const s of this.sats) {
      const a = s.phase + (this.t / s.period) * Math.PI * 2;
      s.g.position.set(Math.cos(a) * s.r, 0, Math.sin(a) * s.r).applyQuaternion(s.q);
      s.g.lookAt(0, 0, 0);
    }
    // station + craft in the foreground orbit
    const sa = 2.35 + this.t * 0.004;
    this.station.position.set(Math.cos(sa) * 175, 18, Math.sin(sa) * 175 + 60);
    this.station.rotation.set(0.3, this.t * 0.03, this.t * 0.05);
    if (this.menuCraft) {
      const ca = this.t * 0.03 + 1.2;
      const p = new Vector3(Math.cos(ca) * 128, 10 + Math.sin(ca * 2) * 3, Math.sin(ca) * 128);
      const ahead = new Vector3(Math.cos(ca + 0.05) * 128, 10 + Math.sin((ca + 0.05) * 2) * 3, Math.sin(ca + 0.05) * 128);
      this.craft.root.position.copy(p);
      this.craft.root.lookAt(ahead);
      this.craft.root.scale.setScalar(0.06);
      this.craft.setStage('cruise');
      this.craft.mainThrottle = 0;
    }
    this.craft.update(dt);
    // selection ring faces the camera
    this.selectRing.quaternion.copy(this.camera.quaternion);
    const ra = Math.max(this.hover * 0.6, this.selected);
    const rm = this.selectRing.material as ShaderMaterial;
    rm.uniforms.uA.value += (ra - rm.uniforms.uA.value) * Math.min(1, dt * 6);
    rm.uniforms.uTime.value = this.t;
    this.selectRing.scale.setScalar(1 + (1 - this.selected) * 0.04 + Math.sin(this.t * 2) * 0.004);
  }

  render(renderer: WebGLRenderer): void {
    const exp = renderer.toneMappingExposure;
    renderer.toneMappingExposure = 1.0;
    renderer.render(this.scene, this.camera);
    renderer.toneMappingExposure = exp;
  }

  resize(w: number, h: number): void { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
}
