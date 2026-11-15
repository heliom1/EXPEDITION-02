import {
  AdditiveBlending, BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group,
  LatheGeometry, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, PointLight, ShaderMaterial, SphereGeometry,
  SpotLight, TorusGeometry, Vector2, Vector3, type Object3D, type Texture,
} from 'three';
import { chuteTexture, foilTexture, hullTexture, noiseTexture, shieldTexture, solarTexture } from './textures';

/**
 * EXPEDITION 02 spacecraft — one consistent vehicle used by the menu, the opening cinematic and the landing site.
 * Architecture (Mars entry, descent and landing; plausible, simplified):
 *   transit stage (service module: tanks, main engine, solar wings, radiators)
 *   └ aeroshell = 70° sphere-cone heat shield + backshell with parachute canister
 *       └ crew lander HORIZON (cabin, 4 deployable legs, 4 throttleable descent engines, landing lights, hatch + ladder)
 * Stages: 'cruise' → 'entry' (transit stage jettisoned) → 'chute' (3 main parachutes) → 'powered' (heat shield and
 * backshell gone, legs out, engines firing) → 'landed'.
 * Model space: metres, +Y = "up" for the lander (heat-shield nose at −Y). `root` faces +Z = direction of travel when
 * `travelMode` is on (nose first, for the space shots); otherwise the lander stands upright.
 */
export type CraftStage = 'cruise' | 'entry' | 'chute' | 'powered' | 'landed';

const plumeVert = /* glsl */`
varying vec2 vUv; varying float vY;
void main(){ vUv = uv; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const plumeFrag = /* glsl */`
uniform float uTime, uPower; uniform vec3 uCore, uEdge; uniform sampler2D uNoise; varying vec2 vUv;
void main(){
  float along = 1.0 - vUv.y;                       // 0 at the nozzle, 1 at the tail
  float n = texture2D(uNoise, vec2(vUv.x*2.0, along*1.5 - uTime*3.0)).r;
  float shock = 0.6 + 0.4*sin(along*38.0 - uTime*40.0);
  float a = pow(1.0-along, 1.6) * (0.55 + 0.45*n) * mix(1.0, shock, 0.35) * uPower;
  vec3 c = mix(uCore, uEdge, smoothstep(0.0, 0.7, along));
  gl_FragColor = vec4(c * a * 6.0, a);
}`;
const plasmaFrag = /* glsl */`
uniform float uTime, uPower; uniform sampler2D uNoise; varying vec2 vUv;
void main(){
  float along = vUv.y;
  float n = texture2D(uNoise, vec2(vUv.x*3.0 + uTime*0.4, along*2.0 - uTime*2.5)).r;
  float a = pow(1.0-along, 1.2) * (0.35 + 0.65*n) * uPower;
  vec3 c = mix(vec3(1.0,0.92,0.75), vec3(1.0,0.32,0.06), smoothstep(0.0,0.6,along));
  c = mix(c, vec3(0.55,0.25,1.0), smoothstep(0.75,1.0,along)*0.4);
  gl_FragColor = vec4(c * a * 2.5, a);
}`;

function additive(frag: string, noise: Texture, extra: Record<string, { value: unknown }> = {}): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: plumeVert, fragmentShader: frag, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uNoise: { value: noise }, uCore: { value: new Color(0xdfe8ff) }, uEdge: { value: new Color(0xff8a3a) }, ...extra },
  });
}

export class Spacecraft {
  readonly root = new Group();
  /** Upright lander frame (+Y up). Rotated nose-first inside `root` while travelling. */
  readonly body = new Group();
  readonly transit = new Group();
  readonly aeroshell = new Group();
  readonly heatShield = new Group();
  readonly backshell = new Group();
  readonly lander = new Group();
  readonly chutes = new Group();
  readonly hatch = new Group();
  private readonly legs: Group[] = [];
  private readonly plumes: Mesh[] = [];
  private readonly mainPlume: Mesh;
  private readonly plasma: Mesh;
  private readonly plasmaWake: Mesh;
  private readonly engineLight: PointLight;
  private readonly descentLight: PointLight;
  readonly landingLights: SpotLight[] = [];
  private readonly windowMat: MeshStandardMaterial;
  private readonly navLamps: Mesh[] = [];
  stage: CraftStage = 'cruise';
  /** 0…1 legs deployed. */
  legDeploy = 0;
  /** 0…1 descent-engine throttle. */
  throttle = 0;
  /** 0…1 transit main engine. */
  mainThrottle = 0;
  /** 0…1 entry heating (plasma glow). */
  heat = 0;
  /** 0…1 hatch open. */
  hatchOpen = 0;
  /** Touchdown compression of the legs (m). */
  compress = 0;
  /** Seconds since the parachutes opened (inflation animation). */
  chuteT = -1;
  private t = 0;

  /** lights: 'full' (orbital scene), 'minimal' (one descent glow light — game scene), 'none'. */
  constructor(lights: 'full' | 'minimal' | 'none' = 'full') {
    const noise = noiseTexture();
    const hull = new MeshStandardMaterial({ map: hullTexture(), roughness: 0.5, metalness: 0.08 });
    const hullDark = new MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.5 });
    const metal = new MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.35, metalness: 0.85 });
    const foil = new MeshStandardMaterial({ map: foilTexture(), roughness: 0.28, metalness: 0.9 });
    const solar = new MeshStandardMaterial({ map: solarTexture(), roughness: 0.3, metalness: 0.4, side: DoubleSide });
    const shield = new MeshStandardMaterial({ map: shieldTexture(), roughness: 0.95, metalness: 0 });
    const radiator = new MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7, side: DoubleSide });
    const bell = new MeshStandardMaterial({ color: 0x2b2522, roughness: 0.45, metalness: 0.75, side: DoubleSide });
    this.windowMat = new MeshStandardMaterial({ color: 0x0b1118, roughness: 0.05, metalness: 0.9, emissive: new Color(0xffc89a), emissiveIntensity: 0.15 });
    const mk = (g: BufferGeometry, m: MeshStandardMaterial | ShaderMaterial, parent: Object3D, x = 0, y = 0, z = 0) => {
      const o = new Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = !(m instanceof ShaderMaterial); parent.add(o); return o;
    };
    const lathe = (pts: Array<[number, number]>, seg = 48) => new LatheGeometry(pts.map(([r, y]) => new Vector2(r, y)), seg);

    // ---- crew lander HORIZON ----
    mk(lathe([[0.01, 0.8], [2.05, 0.8], [2.1, 1.0], [2.1, 4.3], [1.95, 4.6], [1.15, 6.4], [0.62, 6.85], [0.55, 7.05], [0.01, 7.05]]), hull, this.lander);
    mk(new TorusGeometry(0.6, 0.07, 10, 40), metal, this.lander, 0, 6.95, 0).rotation.x = Math.PI / 2;
    mk(new CylinderGeometry(2.14, 2.14, 0.22, 48, 1, true), hullDark, this.lander, 0, 2.6, 0);
    mk(new CylinderGeometry(2.14, 2.14, 0.12, 48, 1, true), new MeshStandardMaterial({ color: 0xb5341f, roughness: 0.6 }), this.lander, 0, 4.1, 0);
    for (let i = 0; i < 5; i++) { // window band
      const a = -0.55 + i * 0.27;
      const w = mk(new BoxGeometry(0.42, 0.34, 0.12), this.windowMat, this.lander, Math.sin(a) * 1.72, 5.1, Math.cos(a) * 1.72);
      w.rotation.y = a; w.rotation.x = -0.38;
    }
    // hatch + ladder on +Z
    mk(new BoxGeometry(1.05, 1.9, 0.1), hullDark, this.lander, 0, 2.05, 2.08);
    const door = mk(new BoxGeometry(0.95, 1.8, 0.08), hull, this.hatch, 0.475, 0, 0);
    door.castShadow = true;
    this.hatch.position.set(-0.475, 2.05, 2.16);
    this.lander.add(this.hatch);
    for (const s of [-0.32, 0.32]) mk(new CylinderGeometry(0.03, 0.03, 1.5, 6), metal, this.lander, s, 0.55, 2.35).rotation.x = 0.35;
    for (let k = 0; k < 4; k++) mk(new BoxGeometry(0.66, 0.04, 0.06), metal, this.lander, 0, 0.05 + k * 0.33, 2.15 + (0.24 - k * 0.08) * 1.2);
    // RCS quads + antennas
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const q = mk(new BoxGeometry(0.3, 0.3, 0.3), hullDark, this.lander, Math.sin(a) * 1.6, 5.7, Math.cos(a) * 1.6);
      q.rotation.y = a;
    }
    mk(new CylinderGeometry(0.02, 0.02, 1.2, 6), metal, this.lander, 0.8, 7.4, 0.2);
    const dish = mk(new SphereGeometry(0.35, 16, 8, 0, Math.PI * 2, 0, 0.9), metal, this.lander, -0.9, 6.6, -0.5);
    dish.rotation.x = -0.9;
    // nav lamps
    for (const [x, c] of [[2.12, 0x22ff55], [-2.12, 0xff2222]] as const) {
      const l = mk(new SphereGeometry(0.06, 8, 6), new MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 3 }), this.lander, x, 4.25, 0);
      this.navLamps.push(l);
    }
    // landing legs (pivot at the cabin shoulder)
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const pivot = new Group();
      pivot.position.set(Math.sin(a) * 1.9, 1.5, Math.cos(a) * 1.9);
      pivot.rotation.y = a;
      const strut = mk(new CylinderGeometry(0.09, 0.07, 2.2, 8), metal, pivot, 0, -1.0, 0.55);
      strut.rotation.x = 0.5;
      const pad = mk(new CylinderGeometry(0.42, 0.5, 0.12, 16), hullDark, pivot, 0, -1.98, 1.1);
      pad.userData.pad = true;
      mk(new CylinderGeometry(0.05, 0.05, 1.5, 6), metal, pivot, 0, -1.2, 0.2).rotation.x = -0.3;
      this.lander.add(pivot);
      this.legs.push(pivot);
    }
    // descent engines + plumes + landing lights
    const plumeGeo = new ConeGeometry(0.55, 7, 24, 1, true).translate(0, -3.5, 0);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const x = Math.sin(a) * 1.15, z = Math.cos(a) * 1.15;
      mk(new CylinderGeometry(0.18, 0.42, 0.7, 20, 1, true), bell, this.lander, x, 0.5, z);
      const p = mk(plumeGeo, additive(plumeFrag, noise), this.lander, x, 0.15, z);
      p.renderOrder = 5;
      this.plumes.push(p);
      if (lights === 'full') {
        const s = new SpotLight(0xfff3e0, 0, 60, 0.6, 0.6, 1.4);
        s.position.set(Math.sin(a + Math.PI / 4) * 2.0, 0.9, Math.cos(a + Math.PI / 4) * 2.0);
        s.target.position.set(s.position.x * 1.6, -10, s.position.z * 1.6);
        this.lander.add(s, s.target);
        this.landingLights.push(s);
      }
    }
    this.descentLight = new PointLight(0xffb070, 0, 40, 2);
    this.descentLight.position.set(0, -1.2, 0);
    if (lights !== 'none') this.lander.add(this.descentLight);

    // ---- aeroshell ----
    // 70° sphere-cone heat shield, nose at −0.9, rim r=3.25 at y=0.2
    mk(lathe([[0.001, -0.95], [0.6, -0.9], [1.3, -0.62], [3.15, 0.08], [3.25, 0.2], [3.2, 0.3], [0.001, 0.3]], 64), shield, this.heatShield);
    this.aeroshell.add(this.heatShield);
    mk(lathe([[3.22, 0.3], [3.0, 0.9], [2.0, 5.6], [1.5, 7.6], [1.45, 8.0], [0.001, 8.0]], 64), hull, this.backshell);
    mk(new CylinderGeometry(0.9, 0.9, 0.9, 32), hullDark, this.backshell, 0, 8.4, 0); // parachute canister
    mk(new CylinderGeometry(3.24, 3.24, 0.12, 64, 1, true), foil, this.backshell, 0, 0.36, 0);
    this.aeroshell.add(this.backshell);
    // entry plasma: a cap over the shield + wake behind it (in −Y→+Y, i.e. trailing above the backshell when nose-first)
    const cap = lathe([[0.001, -1.35], [0.9, -1.25], [1.8, -0.85], [3.75, 0.15], [4.0, 0.5]], 48);
    this.plasma = mk(cap, additive(plasmaFrag, noise), this.aeroshell);
    const wakeGeo = new CylinderGeometry(4.6, 3.6, 26, 32, 1, true).translate(0, 13.5, 0);
    this.plasmaWake = mk(wakeGeo, additive(plasmaFrag, noise), this.aeroshell);
    this.plasma.renderOrder = this.plasmaWake.renderOrder = 6;

    // ---- transit stage (above the backshell, engine pointing +Y) ----
    mk(new CylinderGeometry(1.9, 1.9, 0.6, 40), hullDark, this.transit, 0, 9.2, 0);
    mk(new CylinderGeometry(2.0, 2.0, 7, 40), foil, this.transit, 0, 13, 0);
    for (let i = 0; i < 3; i++) mk(new CylinderGeometry(2.04, 2.04, 0.18, 40, 1, true), metal, this.transit, 0, 10.2 + i * 2.6, 0);
    mk(new SphereGeometry(1.95, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), foil, this.transit, 0, 16.5, 0);
    mk(new CylinderGeometry(0.45, 1.35, 2.6, 32, 1, true), bell, this.transit, 0, 18.4, 0);
    this.mainPlume = mk(new ConeGeometry(1.3, 22, 24, 1, true).translate(0, -11, 0), additive(plumeFrag, noise), this.transit, 0, 19.6, 0);
    this.mainPlume.rotation.x = Math.PI;
    this.mainPlume.renderOrder = 5;
    this.engineLight = new PointLight(0x9fc4ff, 0, 60, 2);
    this.engineLight.position.set(0, 22, 0);
    if (lights === 'full') this.transit.add(this.engineLight);
    for (const side of [-1, 1]) { // solar wings
      const arm = mk(new CylinderGeometry(0.08, 0.08, 2.4, 8), metal, this.transit, side * 3.1, 13.5, 0);
      arm.rotation.z = Math.PI / 2;
      for (let k = 0; k < 3; k++) {
        const panel = mk(new BoxGeometry(3.0, 0.05, 4.2), solar, this.transit, side * (5.9 + k * 3.15), 13.5, 0);
        panel.rotation.x = 0.05;
      }
    }
    for (const side of [-1, 1]) mk(new BoxGeometry(0.04, 4.5, 2.6), radiator, this.transit, 0, 13, side * 3.4);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; mk(new BoxGeometry(0.4, 0.4, 0.4), hullDark, this.transit, Math.sin(a) * 2.1, 10, Math.cos(a) * 2.1).rotation.y = a; }
    const hga = mk(new SphereGeometry(1.1, 24, 8, 0, Math.PI * 2, 0, 0.7), metal, this.transit, 0, 15, -2.9);
    hga.rotation.x = -Math.PI / 2;

    // ---- parachutes ----
    const chuteMat = new MeshStandardMaterial({ map: chuteTexture(), roughness: 0.85, side: DoubleSide });
    const canopy = new SphereGeometry(7, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.42);
    canopy.scale(1, 0.62, 1);
    const linePts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const c = mk(canopy, chuteMat, this.chutes, Math.sin(a) * 6.5, 38, Math.cos(a) * 6.5);
      c.rotation.z = Math.sin(a) * 0.22; c.rotation.x = -Math.cos(a) * 0.22;
      c.castShadow = false;
      for (let k = 0; k < 12; k++) {
        const b = (k / 12) * Math.PI * 2, r = 7 * Math.sin(Math.PI * 0.42);
        linePts.push(Math.sin(a) * 6.5 + Math.sin(b) * r, 38 - 7 * 0.62 * Math.cos(Math.PI * 0.42), Math.cos(a) * 6.5 + Math.cos(b) * r, 0, 12, 0);
      }
      linePts.push(0, 12, 0, 0, 8.8, 0);
    }
    const lg = new BufferGeometry(); lg.setAttribute('position', new Float32BufferAttribute(linePts, 3));
    this.chutes.add(new LineSegments(lg, new LineBasicMaterial({ color: 0xd9d2c4, transparent: true, opacity: 0.7 })));
    this.chutes.visible = false;

    this.body.add(this.lander, this.aeroshell, this.transit, this.chutes);
    this.root.add(this.body);
    this.setStage('cruise');
  }

  /** Image-based lighting so the metallic hull parts and foil read correctly. */
  setEnvironment(env: import('three').Texture): void {
    this.root.traverse((o) => {
      const m = (o as Mesh).material as MeshStandardMaterial | undefined;
      if (m && m.isMeshStandardMaterial) { m.envMap = env; m.envMapIntensity = 0.7; m.needsUpdate = true; }
    });
  }

  /** Nose-first orientation for flight (heat shield leads along +Z of `root`) or upright for descent/landing. */
  set travelMode(on: boolean) { this.body.rotation.set(on ? -Math.PI / 2 : 0, 0, 0); }

  setStage(s: CraftStage): void {
    this.stage = s;
    this.transit.visible = s === 'cruise';
    this.aeroshell.visible = s === 'cruise' || s === 'entry' || s === 'chute';
    this.heatShield.visible = this.aeroshell.visible;
    this.backshell.visible = this.aeroshell.visible;
    this.lander.visible = s === 'powered' || s === 'landed' || s === 'chute';
    this.chutes.visible = s === 'chute';
    if (s === 'chute' && this.chuteT < 0) this.chuteT = 0;
    if (s !== 'chute') this.chuteT = -1;
    if (s === 'landed') { this.throttle = 0; this.legDeploy = 1; }
  }

  /** World position of a landing-leg foot pad (for dust emitters). */
  footPads(out: Vector3[] = []): Vector3[] {
    out.length = 0;
    for (const l of this.legs) l.traverse((o) => { if (o.userData.pad) out.push(o.getWorldPosition(new Vector3())); });
    return out;
  }

  update(dt: number): void {
    this.t += dt;
    const flick = 0.85 + 0.15 * Math.sin(this.t * 53) * Math.sin(this.t * 31);
    for (const p of this.plumes) {
      const m = p.material as ShaderMaterial;
      m.uniforms.uTime.value = this.t; m.uniforms.uPower.value = this.throttle * flick;
      p.visible = this.throttle > 0.01;
      p.scale.set(0.9 + this.throttle * 0.5, 0.6 + this.throttle * 1.1, 0.9 + this.throttle * 0.5);
    }
    const mp = this.mainPlume.material as ShaderMaterial;
    mp.uniforms.uTime.value = this.t; mp.uniforms.uPower.value = this.mainThrottle * flick;
    this.mainPlume.visible = this.mainThrottle > 0.01;
    this.engineLight.intensity = this.mainThrottle * 600 * flick;
    this.descentLight.intensity = this.throttle * 900 * flick;
    for (const pm of [this.plasma, this.plasmaWake]) {
      const m = pm.material as ShaderMaterial;
      m.uniforms.uTime.value = this.t; m.uniforms.uPower.value = this.heat;
      pm.visible = this.heat > 0.01 && this.aeroshell.visible;
    }
    this.plasmaWake.scale.set(1, 0.4 + this.heat * 0.9, 1);
    // legs: stowed (folded up against the cabin) → deployed
    const d = this.legDeploy * this.legDeploy * (3 - 2 * this.legDeploy);
    for (const l of this.legs) l.rotation.x = (1 - d) * -1.15;
    this.lander.position.y = -this.compress;
    this.hatch.rotation.y = -this.hatchOpen * 1.75;
    this.windowMat.emissiveIntensity = 0.15 + (this.stage === 'landed' ? 0.6 : 0.25);
    for (const n of this.navLamps) n.visible = (this.t % 1.4) < 0.18;
    // parachute inflation + sway
    if (this.chuteT >= 0) {
      this.chuteT += dt;
      const inf = Math.min(1, this.chuteT / 1.4);
      const k = inf < 1 ? 0.15 + 0.85 * (1 - Math.pow(1 - inf, 3)) * (1 + 0.12 * Math.sin(inf * 14) * (1 - inf)) : 1;
      this.chutes.scale.set(k, 0.4 + 0.6 * Math.min(1, this.chuteT / 0.8), k);
      this.chutes.rotation.z = Math.sin(this.t * 0.7) * 0.05;
      this.chutes.rotation.x = Math.cos(this.t * 0.53) * 0.04;
    }
  }
}
