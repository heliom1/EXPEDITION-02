import { Matrix4, Quaternion, Vector3 } from 'three';
import type { Cutscene, Pose } from './cutscene';
import type { SpaceScene } from '../space/spaceScene';
import type { Spacecraft } from '../space/spacecraft';
import type { LandingDust } from './landingFx';
import type { Actor } from './actor';
import durations from '../audio/voiceDurations.json';

/**
 * EXPEDITION 02 opening (user's script, Part 1 scenes 03–09; directive Part 4 scenes 1–7).
 * Plays only after NEW EXPEDITION → LAUNCH EXPEDITION. Cut to the measured length of each ElevenLabs line.
 *   Space half (orbital scene):  journey (top-down → chase, flip + insertion burn) · orbital reveal (porthole → wide)
 *                                · approach (transit-stage separation) · atmospheric entry (plasma, interference)
 *   Surface half (game terrain): parachutes + heat-shield jettison · powered descent (exterior / landing-gear / cabin /
 *                                ground cameras, altitude call-outs) · touchdown (dust, settling) · hatch + first steps
 */
const D = durations as Record<string, number>;
const dur = (id: string) => D[id] ?? 4;
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerpPose = (a: Pose, b: Pose, k: number): Pose => ({ pos: a.pos.clone().lerp(b.pos, k), look: a.look.clone().lerp(b.look, k), fov: (a.fov ?? 50) + ((b.fov ?? 50) - (a.fov ?? 50)) * k });

export interface OpeningFx {
  say(id: string): void;
  /** Full-screen colour wash 0…1 (entry plasma glow / whiteout). */
  flash(color: string, amount: number): void;
  /** Porthole frame overlay (orbital reveal) / cabin window overlay (descent). */
  frame(kind: 'porthole' | 'cabin' | null): void;
  /** Telemetry read-out (altitude call-outs) or null. */
  hud(lines: string[] | null): void;
  /** Radio interference overlay. */
  interference(on: boolean): void;
  cue(kind: 'swell' | 'whoosh' | 'transmit' | 'reveal'): void;
  /** Continuous sound beds: engine roar / entry rumble 0…1. */
  rumble(level: number): void;
  /** Motion-designed title overlay (HyperFrames render, transparent WebM). Returns false if it cannot play. */
  titleVideo(): boolean;
}

export function spaceOpening(space: SpaceScene, fx: OpeningFx): Cutscene {
  const craft = space.craft;
  const L1 = dur('o_journey') + 4.5;
  const L2 = dur('o_reveal1') + 1.8 + dur('o_reveal2') + 2.8;
  const L3 = dur('o_approach') + 1.2 + dur('o_copy') + 3.2;
  const L4 = dur('o_entry1') + 1.4 + dur('o_entry2') + 3.4;
  const T2 = L1, T3 = T2 + L2, T4 = T3 + L3;

  const up = new Vector3(0, 1, 0);
  const c = new Vector3(), fwd = new Vector3(), side = new Vector3(), toMars = new Vector3();
  // Journey: straight approach towards the planet; orbit: low circular arc; entry: grazing dive.
  const p0 = new Vector3(-300, 60, 330), aim = new Vector3(40, 10, 165);
  const dir0 = aim.clone().sub(p0).normalize();
  const orbitAt = (a: number, r: number, y: number) => new Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  // Orbit phase: start just short of the sub-solar longitude so the reveal, approach and entry all happen over the day side.
  const A0 = Math.atan2(space.sunDir.z, space.sunDir.x) - 0.55;
  const transitHome = new Matrix4();
  let separated = false;
  const sepVel = new Vector3();
  const q = new Quaternion();

  const place = (t: number) => {
    craft.travelMode = true;
    if (t < T2) { // journey
      c.copy(p0).addScaledVector(dir0, t * 7.5 * (1 - 0.35 * ss(L1 - 6, L1, t)));
      fwd.copy(dir0);
      const flip = ss(L1 - 9.5, L1 - 5.5, t); // turn engine-first for the insertion burn
      const face = fwd.clone().applyAxisAngle(up, Math.PI * flip);
      craft.root.position.copy(c);
      craft.root.lookAt(c.clone().add(face));
      craft.mainThrottle = ss(L1 - 5, L1 - 3.8, t) * (1 - ss(L1 - 0.6, L1, t));
      craft.root.scale.setScalar(0.04);
    } else if (t < T4) { // low orbit (reveal + approach)
      const u = t - T2;
      const a = A0 + u * 0.012;
      c.copy(orbitAt(a, 128 - u * 0.35, 14 - u * 0.25));
      fwd.copy(orbitAt(a + 0.01, 128 - u * 0.35, 14 - u * 0.25)).sub(c).normalize();
      craft.root.position.copy(c);
      craft.root.lookAt(c.clone().add(fwd));
      craft.mainThrottle = 0;
      craft.root.scale.setScalar(0.04);
    } else { // entry: grazing dive into the upper atmosphere
      const u = t - T4;
      const a = A0 + (T4 - T2) * 0.012 + u * 0.004;
      const r = 128 - (T4 - T2) * 0.35 - u * 1.55;
      c.copy(orbitAt(a, Math.max(101.2, r), 4 - u * 0.2));
      fwd.copy(orbitAt(a + 0.004, Math.max(101.2, r - 0.6), 4 - u * 0.2)).sub(c).normalize();
      craft.root.position.copy(c);
      craft.root.lookAt(c.clone().add(fwd));
      craft.root.scale.setScalar(0.04);
    }
    side.crossVectors(fwd, up).normalize();
    toMars.copy(c).negate().normalize();
  };

  const shake = (t: number, amp: number) => new Vector3(Math.sin(t * 37) * Math.sin(t * 13.1), Math.sin(t * 41 + 1.3) * Math.sin(t * 7.7), Math.sin(t * 29 + 2.1)).multiplyScalar(amp);

  return {
    id: 'opening_space',
    cam: space.camera,
    shots: [
      { duration: L1, fadeIn: 2.5, path: [{ pos: new Vector3(), look: new Vector3(0, 0, -1) }] },
      { duration: L2, path: [{ pos: new Vector3(), look: new Vector3(0, 0, -1) }] },
      { duration: L3, path: [{ pos: new Vector3(), look: new Vector3(0, 0, -1) }] },
      { duration: L4, fadeOut: 0.8, path: [{ pos: new Vector3(), look: new Vector3(0, 0, -1) }] },
    ],
    captions: [
      { at: 3, dur: 6, text: 'INTERPLANETARY TRANSFER — DAY 212', kind: 'place', eyebrow: 'Mars approach' },
      { at: T2 + 0.5, dur: 5, text: 'MARS ORBIT', kind: 'place', eyebrow: 'Low orbit · 840 km' },
      { at: T4 + 0.5, dur: 5, text: 'ENTRY INTERFACE', kind: 'place', eyebrow: '125 km · 5.6 km/s' },
    ],
    cues: [
      { at: 0, run: () => { space.menuCraft = false; space.resetSelection(); craft.setStage('cruise'); craft.heat = 0; fx.cue('swell'); } },
      { at: 1.2, run: () => fx.say('o_journey') },
      { at: 1.0, run: () => { fx.titleVideo(); } },
      { at: L1 - 5, run: () => fx.cue('whoosh') },
      { at: T2 + 0.4, run: () => fx.frame('porthole') },
      { at: T2 + 1.0, run: () => fx.say('o_reveal1') },
      { at: T2 + 1.0 + dur('o_reveal1') + 1.6, run: () => fx.say('o_reveal2') },
      { at: T2 + 5.6, run: () => { fx.frame(null); fx.cue('reveal'); } },
      { at: T3 + 0.6, run: () => fx.say('o_approach') },
      { at: T3 + 0.6 + dur('o_approach') + 0.6, run: () => fx.say('o_copy') },
      { at: T3 + 7.5, run: () => { // transit stage separation
        transitHome.copy(craft.transit.matrix);
        space.scene.attach(craft.transit);
        separated = true;
        sepVel.copy(fwd).multiplyScalar(-0.35).addScaledVector(toMars, -0.12);
        fx.cue('whoosh');
      } },
      { at: T4 + 0.3, run: () => { craft.setStage('entry'); fx.say('o_entry1'); fx.cue('swell'); } },
      { at: T4 + 0.3 + dur('o_entry1') + 1.2, run: () => { fx.interference(true); fx.say('o_entry2'); } },
      { at: T4 + 0.3 + dur('o_entry1') + 1.2 + dur('o_entry2') + 0.3, run: () => fx.interference(false) },
    ],
    update: (t, dt) => {
      place(t);
      if (separated) {
        craft.transit.position.addScaledVector(sepVel, dt);
        craft.transit.rotateX(dt * 0.12);
      }
      if (t >= T4) {
        const u = t - T4;
        craft.heat = ss(0.3, 3.2, u) * (0.82 + 0.18 * Math.sin(u * 9) * Math.sin(u * 5.3));
        fx.flash('#ff7a2e', ss(L4 - 4.5, L4 - 0.4, u) * 0.85 + craft.heat * 0.08);
        fx.rumble(0.25 + craft.heat * 0.75);
      } else fx.rumble(craft.mainThrottle * 0.5);
      space.update(dt);
    },
    camera: (t) => {
      place(t);
      if (t < T2) {
        const top: Pose = { pos: c.clone().addScaledVector(up, 2.6).addScaledVector(fwd, -1.0), look: c.clone().addScaledVector(fwd, 3.2), fov: 50 };
        const chase: Pose = { pos: c.clone().addScaledVector(fwd, -3.4).addScaledVector(up, 0.55).addScaledVector(side, 1.0), look: c.clone().addScaledVector(fwd, 60), fov: 42 };
        const p = lerpPose(top, chase, ss(8, 13, t));
        p.pos.add(shake(t, craft.mainThrottle * 0.012));
        return p;
      }
      if (t < T3) {
        const u = t - T2;
        // porthole: from the lander's window, looking down at the limb
        const port: Pose = { pos: c.clone().addScaledVector(toMars, 0.2).addScaledVector(fwd, 0.15), look: c.clone().addScaledVector(toMars, 30).addScaledVector(fwd, 18).addScaledVector(up, 6), fov: 55 };
        const ang = u * 0.05;
        const wideOff = toMars.clone().multiplyScalar(-8.5).addScaledVector(side, 3.5 * Math.cos(ang)).addScaledVector(fwd, -2.5 + Math.sin(ang) * 2).addScaledVector(up, 1.2);
        const wide: Pose = { pos: c.clone().add(wideOff), look: c.clone().addScaledVector(toMars, 1.2), fov: 36 };
        return lerpPose(port, wide, ss(5.2, 7.5, u));
      }
      if (t < T4) {
        const u = t - T3;
        const low: Pose = { pos: c.clone().addScaledVector(toMars, -1.2).addScaledVector(fwd, 2.6).addScaledVector(side, -1.0), look: c.clone().addScaledVector(toMars, 0.8), fov: 46 };
        const track: Pose = { pos: c.clone().addScaledVector(toMars, -4.5).addScaledVector(side, 2.6).addScaledVector(fwd, -1.8), look: c.clone().addScaledVector(fwd, 1.2).addScaledVector(toMars, 2.0), fov: 44 };
        return lerpPose(low, track, ss(5.5, 8.0, u));
      }
      // Atmospheric entry in three beats (cuts, not blends):
      //   1. over-the-shoulder skim toward the curved horizon as the plasma ignites
      //   2. hero shot from just ahead, looking back into the blazing heat shield with the planet filling the frame
      //   3. wide "meteor" shot: a fireball and its long trail streaking across the surface, into the whiteout
      const u = t - T4, k = u / L4;
      let p: Pose;
      if (k < 0.34) {
        const a = k / 0.34;
        // (on this orbit `side` is radial; lateral offsets use `up`, the orbit normal)
        p = { pos: c.clone().addScaledVector(fwd, -1.3 + a * 0.4).addScaledVector(toMars, -0.35).addScaledVector(up, 1.0 - a * 0.25),
          look: c.clone().addScaledVector(fwd, 0.5), fov: 46 - a * 4 };
      } else if (k < 0.66) {
        const a = (k - 0.34) / 0.32;
        p = { pos: c.clone().addScaledVector(fwd, 0.55 - a * 0.15).addScaledVector(toMars, -0.42).addScaledVector(up, 0.75 - a * 0.3),
          look: c.clone().addScaledVector(fwd, -0.12).addScaledVector(toMars, 0.08), fov: 50 - a * 6 };
      } else {
        const a = (k - 0.66) / 0.34;
        // above and ahead, looking down past the fireball so the surface is the backdrop for the trail
        p = { pos: c.clone().addScaledVector(toMars, -4.5).addScaledVector(up, 3.2 - a).addScaledVector(fwd, 4.5 - a * 2.5),
          look: c.clone().addScaledVector(fwd, -1.8 + a * 1.4).addScaledVector(toMars, 0.4), fov: 34 - a * 4 };
      }
      p.pos.add(shake(u, (k < 0.66 ? 0.006 : 0.03) + craft.heat * (k < 0.66 ? 0.03 : 0.08)));
      return p;
    },
    onSkip: () => fx.interference(false),
    cleanup: () => {
      if (separated) { craft.body.add(craft.transit); craft.transit.matrix.copy(transitHome); craft.transit.matrix.decompose(craft.transit.position, craft.transit.quaternion, craft.transit.scale); separated = false; }
      void q;
      craft.heat = 0; craft.mainThrottle = 0; craft.setStage('cruise');
      space.menuCraft = true;
      fx.frame(null); fx.interference(false); fx.rumble(0);
    },
  };
}

export interface LandingWorld {
  /** Lander + a second craft used as the jettisoned backshell/parachutes (both already in the scene, upright). */
  lander: Spacecraft;
  shell: Spacecraft;
  /** Ground point of the landing site and the lander's heading (hatch side faces +Z rotated by yaw). */
  site: Vector3;
  yaw: number;
  groundY(x: number, z: number): number;
  dust: LandingDust;
  actor: Actor | null;
  /** Player's first-person eye pose at the start position (camera hands over to gameplay). */
  eye(): Pose;
  fov: number;
}

export function landingCutscene(w: LandingWorld, fx: OpeningFx): Cutscene {
  const L1 = dur('o_chute') + 4.2;
  const L2 = 14;
  const L3 = 1.6 + dur('o_touch') + 3.4;
  const L4 = 2.6 + dur('o_steps1') + 1.2 + dur('o_steps2') + 1.0 + dur('o_steps3') + 2.4;
  const T2 = L1, T3 = T2 + L2, T4 = T3 + L3, END = T4 + L4;
  const { lander, shell, site } = w;
  const fwd = new Vector3(Math.sin(w.yaw), 0, Math.cos(w.yaw)); // hatch side
  const right = new Vector3(fwd.z, 0, -fwd.x);
  const up = new Vector3(0, 1, 0);
  const approach = fwd.clone().multiplyScalar(-1).applyAxisAngle(up, 0.5); // drift in from behind-left
  const P = new Vector3();
  let alt = 900, vs = 0;
  const shieldHome = new Matrix4();
  let shieldDropped = false;
  const shieldVel = new Vector3();
  const shellPos = new Vector3(), shellVel = new Vector3();
  const pads: Vector3[] = [];
  let lastAlt = 900;
  const actorStart = new Vector3(), actorEnd = new Vector3();

  const altAt = (t: number) => {
    if (t < T2) return 1150 - (t / L1) * 480;             // under parachutes ≈ 48 m/s
    if (t < T3) { const s = Math.min(1, (t - T2) / (L2 - 0.5)); return 520 * (1 - s) * (1 - s); }
    return 0;
  };
  const place = (t: number) => {
    alt = altAt(t);
    const horiz = t < T3 ? Math.max(0, alt) * 0.22 : 0;
    P.copy(site).addScaledVector(approach, horiz);
    P.y = site.y + alt;
    lander.root.position.copy(P);
    lander.root.rotation.set(0, w.yaw, 0);
    if (t < T2) { lander.root.rotation.z = Math.sin(t * 0.8) * 0.05; lander.root.rotation.x = Math.cos(t * 0.6) * 0.04; }
  };

  return {
    id: 'opening_landing',
    shots: [
      { duration: L1, fadeIn: 1.4, path: [{ pos: new Vector3(), look: new Vector3(0, 0, -1) }] },
      { duration: L2, path: [{ pos: new Vector3(), look: new Vector3(0, 0, -1) }] },
      { duration: L3, path: [{ pos: new Vector3(), look: new Vector3(0, 0, -1) }] },
      { duration: L4, path: [{ pos: new Vector3(), look: new Vector3(0, 0, -1) }] },
    ],
    captions: [
      { at: 0.8, dur: 5, text: 'ARCADIA PLANITIA', kind: 'place', eyebrow: 'Descent · 11 km' },
      { at: T4 + 1.5, dur: 6, text: 'EXPEDITION 1 SETTLEMENT — 190 M NORTH', kind: 'place', eyebrow: 'Sol 1 · 15:04 local' },
    ],
    cues: [
      { at: 0.05, run: () => {
        fx.flash('#ff7a2e', 0); lander.setStage('chute'); lander.chuteT = 0.6; lander.legDeploy = 0; lander.compress = 0; lander.hatchOpen = 0; lander.throttle = 0;
        lander.travelMode = false; shell.travelMode = false; shell.root.visible = false; lander.root.visible = true; w.dust.clear();
        fx.rumble(0.35);
      } },
      { at: 0.6, run: () => fx.say('o_chute') },
      { at: 2.6, run: () => { // heat shield jettison
        shieldHome.copy(lander.heatShield.matrix);
        lander.root.parent!.attach(lander.heatShield);
        shieldDropped = true; shieldVel.set(0.6, -8, 0.4); fx.cue('whoosh');
      } },
      { at: T2, run: () => { // backshell + parachutes cut away; powered descent
        shell.root.visible = true; shell.setStage('chute'); shell.chuteT = 2; shell.lander.visible = false; shell.heatShield.visible = false;
        shellPos.copy(lander.root.position); shellVel.set(0, -18, 0);
        lander.setStage('powered'); lander.backshell.visible = false; lander.heatShield.visible = false; lander.throttle = 0.9;
        fx.cue('whoosh'); fx.rumble(0.85);
      } },
      { at: T2 + 1.0, run: () => fx.say('o_alt1') },
      { at: T2 + 8.0, run: () => fx.say('o_alt2') },
      { at: T2 + 9.0, run: () => fx.frame('cabin') },
      { at: T2 + 11.5, run: () => fx.frame(null) },
      { at: T3, run: () => { // touchdown
        lander.throttle = 0; lander.setStage('landed'); fx.rumble(0); fx.hud(null);
        w.dust.burst(site, 1400);
      } },
      { at: T3 + 1.6, run: () => fx.say('o_touch') },
      { at: T4 + 0.2, run: () => fx.cue('swell') },
      { at: T4 + 2.4, run: () => {
        if (!w.actor) return;
        lander.root.updateMatrixWorld(true);
        actorStart.copy(site).addScaledVector(fwd, 2.6); actorStart.y = site.y + 1.05;
        actorEnd.copy(site).addScaledVector(fwd, 6.5).addScaledVector(right, 1.2); actorEnd.y = w.groundY(actorEnd.x, actorEnd.z);
        w.actor.root.visible = true;
        w.actor.place(actorStart.x, actorStart.y, actorStart.z, fwd.x, fwd.z);
        w.actor.play('walk', 0.2, 0.8);
      } },
      { at: T4 + 2.6, run: () => fx.say('o_steps1') },
      { at: T4 + 2.6 + dur('o_steps1') + 1.2, run: () => fx.say('o_steps2') },
      { at: T4 + 2.6 + dur('o_steps1') + 1.2 + dur('o_steps2') + 1.0, run: () => fx.say('o_steps3') },
      { at: T4 + 7.2, run: () => w.actor?.play('idle', 0.6) },
    ],
    update: (t, dt) => {
      place(t);
      vs = (alt - lastAlt) / Math.max(dt, 1e-3); lastAlt = alt;
      if (t < T2 + 3) lander.legDeploy = t < T2 ? 0 : ss(T2 + 0.8, T2 + 3, t);
      if (t >= T2 && t < T3) {
        lander.throttle = 0.92 - 0.3 * ss(T2 + 9, T3, t) + 0.06 * Math.sin(t * 11);
        fx.hud([`ALT  ${Math.max(0, alt).toFixed(0).padStart(4)} m`, `V/S  ${vs.toFixed(1).padStart(5)} m/s`, `THR  ${(lander.throttle * 100).toFixed(0)}%`, 'MODE  POWERED DESCENT · TERRAIN-RELATIVE NAV']);
        if (alt < 60) w.dust.emit(site, Math.ceil(dt * 900 * (1 - alt / 60) * lander.throttle), 0.8 + 0.6 * (1 - alt / 60));
      }
      if (t >= T3 && t < T3 + 1.2) lander.compress = 0.16 * Math.exp(-(t - T3) * 3) * Math.cos((t - T3) * 14) + 0.06 * ss(T3, T3 + 0.6, t);
      if (t >= T4) lander.hatchOpen = ss(T4, T4 + 2.2, t);
      if (shieldDropped) {
        shieldVel.y -= 3.72 * dt;
        lander.heatShield.position.addScaledVector(shieldVel, dt);
        lander.heatShield.rotateX(dt * 0.6);
        if (t > T2) lander.heatShield.visible = false;
      }
      if (shell.root.visible) {
        shellVel.y = -18 + 4 * Math.min(1, (t - T2));
        shellPos.addScaledVector(shellVel, dt);
        shell.root.position.copy(shellPos).addScaledVector(approach, (t - T2) * 6);
        shell.root.rotation.set(0, w.yaw, 0);
        if (t > T2 + 7) shell.root.visible = false;
      }
      if (w.actor && t >= T4 + 2.4) {
        const k = ss(T4 + 2.4, T4 + 7.2, t);
        const p = actorStart.clone().lerp(actorEnd, k);
        p.y = k < 0.3 ? actorStart.y + (w.groundY(p.x, p.z) - actorStart.y) * ss(0, 0.3, k) : w.groundY(p.x, p.z);
        const face = actorEnd.clone().sub(actorStart);
        w.actor.place(p.x, p.y, p.z, face.x, face.z);
        w.actor.update(dt);
      }
      lander.update(dt); shell.update(dt);
      w.dust.update(dt, w.groundY);
    },
    camera: (t) => {
      place(t);
      if (t < T2) { // beside the capsule under its three canopies
        const u = t / L1;
        return { pos: P.clone().addScaledVector(right, 34).addScaledVector(fwd, 22).add(new Vector3(0, -10 + u * 6, 0)), look: P.clone().add(new Vector3(0, 20 - u * 24, 0)), fov: 58 };
      }
      if (t < T3) {
        const u = t - T2;
        if (u < 5) return { pos: P.clone().addScaledVector(right, 26).addScaledVector(fwd, -18).add(new Vector3(0, 9 - u, 0)), look: P.clone().add(new Vector3(0, -3, 0)), fov: 44 };
        if (u < 9) { // landing-gear camera
          lander.root.updateMatrixWorld(true);
          lander.footPads(pads);
          const pad = pads[0] ?? P;
          const out = pad.clone().sub(P).setY(0).normalize();
          return { pos: pad.clone().addScaledVector(out, 0.5).add(new Vector3(0, 0.45, 0)), look: pad.clone().addScaledVector(out, 7).add(new Vector3(0, -12, 0)), fov: 70 };
        }
        if (u < 11.5) { // inside the cabin, through the window
          return { pos: P.clone().add(new Vector3(0, 5.0, 0)).addScaledVector(fwd, 1.25), look: P.clone().addScaledVector(fwd, 40).add(new Vector3(0, -26, 0)), fov: 62 };
        }
        const g = site.clone().addScaledVector(fwd, 30).addScaledVector(right, -14);
        g.y = w.groundY(g.x, g.z) + 1.3;
        return { pos: g, look: P.clone().add(new Vector3(0, 3, 0)), fov: 40 };
      }
      if (t < T4) { // low orbit round the settling lander
        const u = (t - T3) / L3;
        const a = -0.6 + u * 0.9;
        const o = fwd.clone().applyAxisAngle(up, a).multiplyScalar(17);
        const g = site.clone().add(o); g.y = w.groundY(g.x, g.z) + 1.6;
        return { pos: g, look: site.clone().add(new Vector3(0, 3.2, 0)), fov: 42 };
      }
      // first steps: over the shoulder, out across the plain towards the settlement
      const u = t - T4;
      const a = w.actor?.root.position ?? site.clone().addScaledVector(fwd, 5);
      const behind: Pose = { pos: site.clone().addScaledVector(fwd, 9).addScaledVector(right, 5).add(new Vector3(0, 2.2, 0)), look: site.clone().add(new Vector3(0, 2.4, 0)), fov: 44 };
      const shoulder: Pose = { pos: a.clone().addScaledVector(fwd, -3.0).addScaledVector(right, 0.9).add(new Vector3(0, 2.0, 0)), look: a.clone().addScaledVector(fwd, 60).add(new Vector3(0, 3, 0)), fov: 46 };
      const eye = w.eye();
      const p = lerpPose(behind, shoulder, ss(2.6, 6.5, u));
      return lerpPose(p, eye, ss(L4 - 2.2, L4, u));
    },
    onSkip: () => { fx.hud(null); fx.frame(null); },
    cleanup: () => {
      if (shieldDropped) {
        lander.aeroshell.add(lander.heatShield);
        shieldHome.decompose(lander.heatShield.position, lander.heatShield.quaternion, lander.heatShield.scale);
        shieldDropped = false;
      }
      shell.root.visible = false;
      lander.root.position.copy(site); lander.root.rotation.set(0, w.yaw, 0);
      lander.setStage('landed'); lander.legDeploy = 1; lander.hatchOpen = 1; lander.compress = 0.06; lander.throttle = 0;
      lander.update(0);
      if (w.actor) w.actor.root.visible = false;
      fx.hud(null); fx.frame(null); fx.rumble(0);
      void END;
    },
  };
}
