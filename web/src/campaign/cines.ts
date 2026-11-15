import { Vector3 } from 'three';
import type { Caption, Cutscene, Pose, Shot } from '../cinematics/cutscene';
import durations from '../audio/voiceDurations.json';
import script from '../audio/voiceLines.json';

/**
 * Objective cinematics (directive Part 5, script Part 2 "approach / activation / completion").
 * A small library of camera grammars — each objective picks one with its own framing, subject, timing and dialogue,
 * so no two sequences share the same camera move:
 *   push   – from the player's eye toward a subject and back (interiors: always line-of-sight safe)
 *   glance – the eye turns to a subject and settles back (very small tasks; control is barely interrupted)
 *   orbit  – circles a subject (vehicles, structures)
 *   reveal – rises from behind the astronaut to reveal a distant subject
 *   pan    – lateral dolly across a site
 *   crane  – lifts from a subject to show the scale of the terrain
 *   establish – wide establishing frame with a slow drift
 *   track  – dolly that follows the player's line of travel
 * Every shot returns to the player's first-person eye so control resumes without a jump.
 */
export type Grammar = 'push' | 'glance' | 'orbit' | 'reveal' | 'pan' | 'crane' | 'establish' | 'track';

export interface CineSpec {
  grammar: Grammar;
  target: Vector3;
  /** Radius / distance (orbit, pan, establish, crane height). */
  r?: number;
  h?: number;
  /** Start angle offset (radians, relative to the player→target bearing) and sweep. */
  a0?: number;
  arc?: number;
  fov?: number;
  lamp?: boolean;
  /** Seconds; default: length of the trigger's voice lines (+ padding), clamped to the category. */
  dur?: number;
  trigger?: string;
  min?: number;
  max?: number;
  place?: { text: string; eyebrow?: string };
  title?: { text: string; eyebrow?: string };
  /** Interior: keep every pose on the player→subject line (no wide moves through walls). */
  indoor?: boolean;
  cues?: Array<{ at: number; run: () => void }>;
  update?: (t: number, dt: number) => void;
  cleanup?: () => void;
}

export interface CineEnv { eye(): Pose; fov: number; groundY(x: number, z: number, yHint?: number): number }

const D = durations as Record<string, number>;
const LINES = (script as { lines: Array<{ id: string; trigger: string }> }).lines;
/** Total voice length bound to a trigger (lines play back to back with a 0.45 s breath). */
export function triggerLength(trigger: string): number {
  const ls = LINES.filter((l) => l.trigger === trigger);
  return ls.reduce((n, l) => n + (D[l.id] ?? 3) + 0.45, 0);
}

let seq = 0;
export function objectiveCine(env: CineEnv, s: CineSpec): Cutscene {
  const eye = env.eye();
  const E: Pose = { pos: eye.pos.clone(), look: eye.look.clone(), fov: env.fov };
  const T = s.target.clone();
  const voice = s.trigger ? triggerLength(s.trigger) : 0;
  const dur = s.dur ?? Math.max(s.min ?? 4.5, Math.min(s.max ?? 12, voice + 1.4));
  const fov = s.fov ?? 48;
  const bearing = Math.atan2(E.pos.z - T.z, E.pos.x - T.x); // angle from target to player
  const clear = (p: Vector3, m = 0.9) => { if (!s.indoor) p.y = Math.max(p.y, env.groundY(p.x, p.z, p.y + 3) + m); return p; };
  const around = (a: number, r: number, h: number) => clear(new Vector3(T.x + Math.cos(bearing + a) * r, T.y + h, T.z + Math.sin(bearing + a) * r));
  const ret = Math.min(2.2, dur * 0.25);
  const body = dur - ret;
  let shots: Shot[];
  switch (s.grammar) {
    case 'glance': {
      const look = E.pos.clone().lerp(T, 0.9);
      shots = [{ duration: dur, path: [E, { pos: E.pos.clone(), look, fov: env.fov - 6 }, { pos: E.pos.clone(), look, fov: env.fov - 8 }, E] }];
      break;
    }
    case 'push': {
      const near = E.pos.clone().lerp(T, Math.min(0.55, 1 - (s.r ?? 1.1) / Math.max(1.5, E.pos.distanceTo(T))));
      const side = new Vector3(-(T.z - E.pos.z), 0, T.x - E.pos.x).normalize().multiplyScalar(s.indoor ? 0.25 : 0.8);
      shots = [
        { duration: body, ease: 'inOut', lamp: s.lamp, path: [E, { pos: near.clone().add(side), look: T, fov }, { pos: near.clone().add(side.multiplyScalar(-0.6)), look: T, fov: fov - 6 }] },
        { duration: ret, lamp: s.lamp, path: [{ pos: near, look: T, fov: fov - 6 }, E] },
      ];
      break;
    }
    case 'orbit': {
      const r = s.r ?? 7, h = s.h ?? 2.2, a0 = s.a0 ?? 0.5, arc = s.arc ?? 1.6;
      const pts: Pose[] = [];
      for (let i = 0; i <= 4; i++) pts.push({ pos: around(a0 + (arc * i) / 4, r, h + Math.sin((i / 4) * Math.PI) * 0.6), look: T, fov });
      shots = [{ duration: body, ease: 'linear', lamp: s.lamp, path: [E, ...pts] }, { duration: ret, path: [pts[4], E] }];
      break;
    }
    case 'reveal': {
      const fwd = new Vector3(T.x - E.pos.x, 0, T.z - E.pos.z).normalize();
      const low = clear(E.pos.clone().addScaledVector(fwd, -3.2).add(new Vector3(0, -0.6, 0)), 0.6);
      const high = clear(E.pos.clone().addScaledVector(fwd, -1.0).add(new Vector3(0, s.h ?? 6, 0)));
      shots = [
        { duration: body * 0.45, ease: 'out', path: [{ pos: low, look: E.pos.clone().addScaledVector(fwd, 4).add(new Vector3(0, -1, 0)), fov: 52 }, { pos: E.pos.clone().addScaledVector(fwd, -2).add(new Vector3(0, 1.5, 0)), look: T, fov: 44 }] },
        { duration: body * 0.55, ease: 'inOut', path: [{ pos: E.pos.clone().addScaledVector(fwd, -2).add(new Vector3(0, 1.5, 0)), look: T, fov: 44 }, { pos: high, look: T, fov: s.fov ?? 34 }] },
        { duration: ret, path: [{ pos: high, look: T, fov: s.fov ?? 34 }, E] },
      ];
      break;
    }
    case 'pan': {
      const r = s.r ?? 30, h = s.h ?? 6, a0 = s.a0 ?? 0, arc = s.arc ?? 0.9;
      const a = around(a0 - arc / 2, r, h), b = around(a0 + arc / 2, r, h * 0.8);
      shots = [{ duration: body, ease: 'linear', path: [{ pos: a, look: T, fov }, { pos: b, look: T, fov: fov - 4 }] }, { duration: ret, path: [{ pos: b, look: T, fov: fov - 4 }, E] }];
      break;
    }
    case 'crane': {
      const r = s.r ?? 10, h = s.h ?? 45;
      const p0 = around(s.a0 ?? 0.3, r * 0.4, 1.6), p1 = around((s.a0 ?? 0.3) + 0.5, r, h);
      shots = [{ duration: body, ease: 'inOut', path: [{ pos: p0, look: T, fov: 50 }, { pos: p1, look: T.clone().add(new Vector3(0, -2, 0)), fov: 42 }] }, { duration: ret, path: [{ pos: p1, look: T, fov: 42 }, E] }];
      break;
    }
    case 'establish': {
      const r = s.r ?? 40, h = s.h ?? 8;
      const p0 = around(s.a0 ?? 0.6, r, h), p1 = around((s.a0 ?? 0.6) + 0.18, r * 0.9, h * 0.9);
      shots = [{ duration: body, ease: 'linear', path: [{ pos: p0, look: T, fov: s.fov ?? 40 }, { pos: p1, look: T, fov: (s.fov ?? 40) - 3 }] }, { duration: ret, path: [{ pos: p1, look: T, fov: 38 }, E] }];
      break;
    }
    case 'track': {
      const fwd = new Vector3(T.x - E.pos.x, 0, T.z - E.pos.z).normalize();
      const behind = clear(E.pos.clone().addScaledVector(fwd, -(s.r ?? 5)).add(new Vector3(0, s.h ?? 1.2, 0)));
      const ahead = clear(E.pos.clone().addScaledVector(fwd, 1.5).add(new Vector3(0, (s.h ?? 1.2) * 0.6, 0)));
      shots = [{ duration: body, ease: 'inOut', lamp: s.lamp, path: [{ pos: behind, look: T, fov }, { pos: ahead, look: T, fov: fov - 4 }] }, { duration: ret, lamp: s.lamp, path: [{ pos: ahead, look: T, fov: fov - 4 }, E] }];
      break;
    }
  }
  const captions: Caption[] = [];
  if (s.place) captions.push({ at: 0.6, dur: Math.min(5, dur - 1), text: s.place.text, eyebrow: s.place.eyebrow, kind: 'place' });
  if (s.title) captions.push({ at: 0.8, dur: Math.min(4.5, dur - 1.2), text: s.title.text, eyebrow: s.title.eyebrow, kind: 'title' });
  return { id: `obj_${++seq}`, shots, captions, cues: s.cues, update: s.update, cleanup: s.cleanup };
}
