import { Vector3 } from 'three';
import { caveSdf } from '../cave/caveDef';
import type { Actor } from './actor';
import type { Cutscene, Pose } from './cutscene';

/**
 * The game's cutscenes. Caption text is taken from the briefing and records (src/missions/records.ts) so the
 * cutscenes say nothing the story documents do not; see NARRATIVE_SOURCE_OF_TRUTH.md before adding lines.
 */
export interface CutsceneWorld {
  /** Terrain (or outpost pad) height at a point. */
  groundY(x: number, z: number, yHint?: number): number;
  outpost: { x: number; z: number; floorY: number };
  /** The player's current first-person eye pose (the shot a cutscene hands back to). */
  eye(): Pose;
  ice: Vector3;
  actor: Actor | null;
  cue(kind: 'swell' | 'whoosh' | 'transmit' | 'reveal'): void;
  /** Gameplay field of view, so the last shot matches the first-person view exactly. */
  fov: number;
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const flat = (a: Vector3, b: Vector3) => { const d = v(b.x - a.x, 0, b.z - a.z); return d.normalize(); };

/** New game: Mars wide shot → glide to the outpost → the astronaut walks up to the airlock → first person. */
export function arrivalCutscene(w: CutsceneWorld): Cutscene {
  const O = w.outpost;
  const eye = w.eye();
  const air = (dx: number, dz: number, hAbove: number) => v(O.x + dx, Math.max(w.groundY(O.x + dx, O.z + dz), O.floorY) + hAbove, O.z + dz);
  const at = (dx: number, dy: number, dz: number) => v(O.x + dx, O.floorY + dy, O.z + dz);

  // Walk-up line: towards the dome along the player's spawn view, ending just short of the spawn point.
  const fwd = flat(eye.pos, eye.look);
  const side = v(-fwd.z, 0, fwd.x); // the sun-lit side of the walker
  const feet = v(eye.pos.x, 0, eye.pos.z);
  const walkFrom = feet.clone().addScaledVector(fwd, -12), walkTo = feet.clone().addScaledVector(fwd, -0.8);
  const gy = (p: Vector3) => w.groundY(p.x, p.z, eye.pos.y);
  const actorAt = (u: number) => { const p = walkFrom.clone().lerp(walkTo, u); p.y = gy(p); return p; };
  const camBeside = (u: number, ahead: number, out: number, up: number): Pose => {
    const a = actorAt(u);
    const pos = a.clone().addScaledVector(fwd, ahead).addScaledVector(side, out);
    pos.y = Math.max(gy(pos), a.y) + up;
    return { pos, look: a.clone().add(v(0, 1.15, 0)), fov: 48 };
  };

  const A = 16, B = 8, C = 3.6;
  const walkStart = A, walkDur = B - 0.6;
  const actor = w.actor;
  return {
    id: 'arrival',
    shots: [
      {
        duration: A, fadeIn: 2.2, path: [
          { pos: air(330, -300, 85), look: at(0, 8, 0), fov: 46 },
          { pos: air(250, -225, 64), look: at(0, 8, 0), fov: 48 },
          { pos: air(160, -150, 40), look: at(0, 7, 0), fov: 50 },
          { pos: air(85, -95, 21), look: at(0, 5, -4), fov: 52 },
          { pos: air(40, -62, 11), look: at(1.6, 3, -14), fov: 52 },
        ],
      },
      { duration: B, ease: 'linear', shake: 0.03, path: [camBeside(0, 5, 3.4, 1.25), camBeside(0.5, 1.5, 4.2, 1.4), camBeside(1, -1.2, 3.6, 1.6)] },
      { duration: C, fadeIn: 0.9, ease: 'out', path: [{ pos: eye.pos.clone().addScaledVector(fwd, -0.9).add(v(0, 0.12, 0)), look: eye.look, fov: w.fov - 4 }, { ...eye, fov: w.fov }] },
    ],
    captions: [
      { at: 1.6, dur: 5.2, kind: 'title', eyebrow: 'CINDERFALL 2', text: 'MARS, 2043' },
      { at: 7.2, dur: 3.9, text: 'Ten years after the first human expedition arrived on Mars…' },
      { at: 11.3, dur: 4.0, text: '…you are the second astronaut sent to the planet.' },
      { at: 10.8, dur: 5.0, kind: 'place', text: 'EXPEDITION 1 OUTPOST' },
      { at: A + 0.4, dur: 3.7, text: 'Maintain the base. Repair and monitor the rovers.' },
      { at: A + 4.3, dur: 3.6, text: 'Document the environment — and whether it could support human life.' },
      { at: A + B + 0.5, dur: 3.0, text: 'Could Mars one day become a destination for human settlement?' },
    ],
    cues: [
      { at: 0.1, run: () => w.cue('swell') },
      { at: A - 3.2, run: () => w.cue('whoosh') },
      { at: A, run: () => { if (actor) { actor.root.visible = true; actor.play('walk', 0); } } },
      { at: walkStart + walkDur, run: () => actor?.play('idle', 0.5) },
      { at: A + B, run: () => { if (actor) actor.root.visible = false; } },
    ],
    update: (t, dt) => {
      if (!actor?.root.visible) return;
      const u = Math.min(1, Math.max(0, (t - walkStart) / walkDur));
      const p = actorAt(u);
      actor.place(p.x, p.y, p.z, fwd.x, fwd.z);
      actor.update(dt);
    },
    cleanup: () => { if (actor) actor.root.visible = false; },
  };
}

/**
 * Pulls a cave camera position back towards `safe` (known open air, e.g. the player's eye) until it has at least
 * `clear` metres of air around it, so shots never end up inside rock.
 */
function inAir(p: Vector3, safe: Vector3, clear = 0.9): Vector3 {
  for (let i = 0; i <= 12; i++) {
    const q = p.clone().lerp(safe, i / 12);
    if (caveSdf(q.x, q.y, q.z, false) < -clear) return q;
  }
  return safe.clone();
}

/**
 * The ice chamber reveal (script Ch.6 major event): the suit lamp catches reflective crystals, a wide shot from the
 * chamber entrance reveals the whole crystal hall, a slow orbit of the giant cluster, then the camera pulls away to show
 * the astronaut standing before it, and hands back to first person.
 */
export function iceCutscene(w: CutsceneWorld): Cutscene {
  const eye = w.eye();
  const I = w.ice.clone();
  const focus = I.clone().add(v(0, 2.2, 0));
  const a0 = Math.atan2(eye.pos.z - I.z, eye.pos.x - I.x);
  const r = Math.min(16, Math.max(12, Math.hypot(eye.pos.x - I.x, eye.pos.z - I.z) * 1.1));
  const orbit = (da: number, up: number, rr = r): Pose => ({
    pos: inAir(v(I.x + Math.cos(a0 + da) * rr, I.y + up, I.z + Math.sin(a0 + da) * rr), eye.pos),
    look: focus, fov: 46,
  });
  // Wide establishing frame from high in the chamber, on the player's side.
  const wideFrom = inAir(eye.pos.clone().add(v(Math.cos(a0) * 6, 7, Math.sin(a0) * 6)), eye.pos, 1.2);
  const wideTo = inAir(eye.pos.clone().add(v(Math.cos(a0) * 3, 5, Math.sin(a0) * 3)), eye.pos, 1.2);
  const lampLook = eye.pos.clone().lerp(I, 0.6).add(v(0, 1.4, 0));
  const actorAt = eye.pos.clone().add(v(0, -1.65, 0));
  const pullFrom = orbit(1.6, 5.0, r);
  const pullTo: Pose = { pos: inAir(actorAt.clone().add(v(Math.cos(a0) * 6, 4.5, Math.sin(a0) * 6)), eye.pos, 1.2), look: focus.clone().lerp(actorAt, 0.25), fov: 50 };
  return {
    id: 'ice',
    shots: [
      { duration: 3.8, lamp: true, shake: 0.02, path: [{ ...eye, fov: w.fov }, { pos: eye.pos.clone().lerp(I, 0.12), look: lampLook, fov: 50 }] },
      { duration: 5.5, lamp: true, ease: 'inOut', path: [{ pos: wideFrom, look: focus, fov: 58 }, { pos: wideTo, look: focus, fov: 52 }] },
      { duration: 7.0, lamp: true, ease: 'linear', path: [orbit(0.4, 2.6, r), orbit(0.9, 3.8, r), orbit(1.4, 4.8, r)] },
      { duration: 5.0, lamp: true, ease: 'inOut', path: [pullFrom, pullTo] },
      { duration: 2.4, lamp: true, path: [pullTo, { ...eye, fov: w.fov }] },
    ],
    captions: [
      { at: 9.6, dur: 4.2, kind: 'title', eyebrow: 'SUBSURFACE · LOWER CHAMBER', text: 'WATER ICE' },
    ],
    cues: [
      { at: 0.2, run: () => w.cue('reveal') },
      { at: 3.8, run: () => w.cue('swell') },
      { at: 16.2, run: () => { if (w.actor) { w.actor.root.visible = true; w.actor.place(actorAt.x, actorAt.y, actorAt.z, I.x - actorAt.x, I.z - actorAt.z); w.actor.play('idle', 0.2); } } },
    ],
    update: (_t, dt) => { if (w.actor?.root.visible) w.actor.update(dt); },
    cleanup: () => { if (w.actor) w.actor.root.visible = false; },
  };
}

/** Findings transmitted: the terminal, then the outpost from outside as the signal goes out; holds under the end card. */
export function transmissionCutscene(w: CutsceneWorld): Cutscene {
  const O = w.outpost;
  const eye = w.eye();
  const air = (dx: number, dz: number, hAbove: number) => v(O.x + dx, Math.max(w.groundY(O.x + dx, O.z + dz), O.floorY) + hAbove, O.z + dz);
  const at = (dx: number, dy: number, dz: number) => v(O.x + dx, O.floorY + dy, O.z + dz);
  return {
    id: 'transmission',
    holdLastFrame: true,
    shots: [
      { duration: 3.2, fadeOut: 0.9, path: [{ ...eye, fov: w.fov }, { pos: eye.pos.clone().lerp(eye.look, 0.04), look: eye.look, fov: w.fov - 12 }] },
      { duration: 6.8, fadeIn: 1.0, ease: 'out', path: [{ pos: air(28, 72, 3.5), look: at(0, 9, 22), fov: 50 }, { pos: air(44, 96, 16), look: at(0, 6, 18), fov: 50 }] },
      {
        duration: 8.5, ease: 'inOut', path: [
          { pos: air(52, 120, 24), look: at(0, 5, 10), fov: 50 },
          { pos: air(95, 190, 48), look: at(-10, 12, 0), fov: 48 },
          { pos: air(140, 260, 72), look: at(-40, 40, -60), fov: 46 },
        ],
      },
    ],
    captions: [
      { at: 0.4, dur: 2.6, text: 'Transmitting findings…' },
      { at: 3.6, dur: 3.3, text: 'Rover R-1 survey log. Core sample DRL-2. Cave survey. Deposit analysis.' },
      { at: 7.1, dur: 2.7, text: 'Awaiting acknowledgement.' },
      { at: 10.3, dur: 3.6, text: 'The first expedition reached this cave and mapped a route to the ice…' },
      { at: 14.1, dur: 4.2, text: '…yet their official report lists the site as never investigated.' },
    ],
    cues: [
      { at: 0.3, run: () => w.cue('transmit') },
      { at: 3.3, run: () => w.cue('swell') },
    ],
  };
}

export const CUTSCENE_IDS = ['arrival', 'ice', 'transmission'] as const;
export type CutsceneId = typeof CUTSCENE_IDS[number];
export const buildCutscene = (id: CutsceneId, w: CutsceneWorld): Cutscene =>
  id === 'arrival' ? arrivalCutscene(w) : id === 'ice' ? iceCutscene(w) : transmissionCutscene(w);
