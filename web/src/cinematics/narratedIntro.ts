import { Vector3 } from 'three';
import type { Caption, Cutscene, Pose, Shot } from './cutscene';

/**
 * Narrated opening: the user's own recorded narration (public/assets/audio/voice/custom/) over a directed tour of the
 * expedition's world. The cut is built to the recording's exact length: eight shots share the running time by fixed
 * proportions, subtitles come from the aligned transcript (tools/align-voice.mjs) or, without alignment, from
 * sentence lengths spread across the audio.
 */
export interface NarrationCue { at: number; dur: number; text: string }

export interface IntroWorld {
  groundY(x: number, z: number, yHint?: number): number;
  outpost: { x: number; z: number; floorY: number };
  caveOut: Vector3; caveIn: Vector3; hall: Vector3; ice: Vector3;
  rover: Vector3; drill: Vector3;
  eye(): Pose;
  fov: number;
  /** Visor close-up hooks: place the astronaut + debris and run the reflection probe (optional). */
  visor?: { begin(at: Vector3, faceToward: Vector3, wind: Vector3): void; update(dt: number, t: number): void; end(): void };
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/**
 * Shot plan: [start as a share of the running time, place tag]. Starts follow the narration (designed on the 2:05 cut:
 * vista 0:00, escarpment 0:18, cave 0:30, ice 0:39, rover 0:57, visor 1:11.5 on \"You are one of them\", drill 1:21,
 * outpost 1:33, airlock 1:53) and scale with any other recording length.
 */
const PLAN: Array<[number, string]> = [
  [0 / 125, 'THE PLAINS'],
  [18 / 125, 'THE ESCARPMENT'],
  [30 / 125, 'CLIFF BASE · CAVE'],
  [39 / 125, 'BENEATH THE MESA'],
  [57 / 125, 'ROVER R-1'],
  [71.5 / 125, ''],
  [81 / 125, 'DRILL SITE DRL-2'],
  [93 / 125, 'EXPEDITION 1 OUTPOST'],
  [113 / 125, ''],
];

export function narratedIntro(w: IntroWorld, total: number, cues: NarrationCue[]): Cutscene {
  const T = Math.max(24, total + 1.5); // a little air after the last word
  const starts = PLAN.map(([f]) => f * T);
  const d = starts.map((s, i) => Math.max(3, (i + 1 < starts.length ? starts[i + 1] : T) - s));
  const g = (x: number, z: number, up: number) => v(x, w.groundY(x, z) + up, z);
  const O = w.outpost;
  const out = w.caveOut.clone().sub(w.caveIn).setY(0).normalize(); // direction out of the cave mouth
  const R = w.rover, D = w.drill;
  const eye = w.eye();
  const fwd = v(eye.look.x - eye.pos.x, 0, eye.look.z - eye.pos.z).normalize();
  // Visor shot staging: astronaut on the open plain beside Rover R-1 (rover behind them in frame), camera to the west.
  const V = g(R.x - 7, R.z + 2, 0);
  const head = V.clone().add(v(0, 1.62, 0));
  const camDir = v(-0.85, 0, 0.3).normalize();
  const camSide = v(-camDir.z, 0, camDir.x);
  const wind = camSide.clone().multiplyScalar(4.5).add(v(0, 0.15, 0));

  const shots: Shot[] = [
    // 1 — Vista: high above the plains, slow pan across the horizon towards the mesas.
    { duration: d[0], fadeIn: 3, ease: 'inOut', path: [
      { pos: g(O.x + 700, O.z - 650, 280), look: g(O.x - 400, O.z + 300, 40), fov: 52 },
      { pos: g(O.x + 560, O.z - 700, 240), look: g(w.caveOut.x, w.caveOut.z, 60), fov: 48 },
    ] },
    // 2 — Low glide over the ground towards the escarpment.
    { duration: d[1], ease: 'linear', path: [
      { pos: g(w.caveOut.x + out.x * 420, w.caveOut.z + out.z * 420, 34), look: g(w.caveOut.x, w.caveOut.z, 14), fov: 56 },
      { pos: g(w.caveOut.x + out.x * 160, w.caveOut.z + out.z * 160, 16), look: g(w.caveOut.x, w.caveOut.z, 10), fov: 54 },
      { pos: g(w.caveOut.x + out.x * 60, w.caveOut.z + out.z * 60, 8), look: g(w.caveIn.x, w.caveIn.z, 4), fov: 50 },
    ] },
    // 3 — Push into the cave mouth; daylight gives way to the lamp.
    { duration: d[2], ease: 'inOut', lamp: true, shake: 0.02, path: [
      { pos: v(w.caveOut.x + out.x * 22, w.caveOut.y + 3, w.caveOut.z + out.z * 22), look: v(w.caveIn.x, w.caveIn.y + 1.5, w.caveIn.z), fov: 50 },
      { pos: v(w.caveIn.x + out.x * 2, w.caveIn.y + 1.7, w.caveIn.z + out.z * 2), look: v(w.hall.x, w.hall.y + 1.4, w.hall.z), fov: 56 },
    ] },
    // 4 — Through the hall to the ice: the reveal.
    { duration: d[3], ease: 'out', lamp: true, path: [
      { pos: v(w.hall.x, w.hall.y + 1.8, w.hall.z), look: v(w.ice.x, w.ice.y + 1, w.ice.z), fov: 58 },
      { pos: w.ice.clone().add(v(4.5, 2.6, 11)), look: w.ice.clone().add(v(0, 0.8, 0)), fov: 50 },
      // Stay ≥ 8 m back: closer than that the helmet lamp blows the ice out to white.
      { pos: w.ice.clone().add(v(3.2, 2.2, 8.2)), look: w.ice.clone().add(v(0, 0.6, 0)), fov: 44 },
    ] },
    // 5 — Rover R-1 waiting on the plain: slow orbit.
    { duration: d[4], fadeIn: 0.8, ease: 'linear', path: [0, 1, 2, 3].map((k) => {
      const a = 0.4 + k * 0.55;
      return { pos: g(R.x + Math.cos(a) * 9, R.z + Math.sin(a) * 9, 2.6), look: v(R.x, R.y + 1.1, R.z), fov: 44 };
    }) },
    // 6 — Visor: "You are one of them". Slow push-in on the astronaut's helmet, debris gusting across the frame;
    //     the visor reflects the real landscape and the debris through a live reflection probe.
    { duration: d[5], fadeIn: 0.6, ease: 'out', path: [
      { pos: head.clone().addScaledVector(camDir, 4.2).addScaledVector(camSide, -0.6).add(v(0, 0.2, 0)), look: head, fov: 38 },
      { pos: head.clone().addScaledVector(camDir, 1.9).addScaledVector(camSide, 0.35).add(v(0, 0.08, 0)), look: head, fov: 32 },
      { pos: head.clone().addScaledVector(camDir, 0.78).addScaledVector(camSide, 0.08).add(v(0, 0.02, 0)), look: head.clone().addScaledVector(camDir, 0.1), fov: 26 },
    ] },
    // 7 — DRL-2: crane down from above the drill site.
    { duration: d[6], ease: 'inOut', path: [
      { pos: g(D.x + 34, D.z + 28, 30), look: v(D.x, D.y + 4, D.z), fov: 50 },
      { pos: g(D.x + 13, D.z + 10, 5), look: v(D.x, D.y + 5, D.z), fov: 48 },
    ] },
    // 8 — Late light: the long approach to the outpost.
    { duration: d[7], fadeIn: 0.8, ease: 'inOut', path: [
      { pos: g(O.x + 520, O.z - 430, 120), look: v(O.x, O.floorY + 8, O.z), fov: 44 },
      { pos: g(O.x + 210, O.z - 200, 55), look: v(O.x, O.floorY + 7, O.z), fov: 46 },
      { pos: g(O.x + 70, O.z - 85, 18), look: v(O.x, O.floorY + 5, O.z - 4), fov: 50 },
    ] },
    // 9 — Down to the airlock and into the astronaut's eyes.
    { duration: d[8], ease: 'out', path: [
      { pos: g(O.x + 30, O.z - 55, 9), look: v(O.x + 1.6, O.floorY + 3, O.z - 12), fov: 52 },
      { pos: eye.pos.clone().addScaledVector(fwd, -1.2).add(v(0, 0.3, 0)), look: eye.look, fov: w.fov - 4 },
      { ...eye, fov: w.fov },
    ] },
  ];

  // Place tags at the start of each shot (only when shots are long enough to read them).
  const captions: Caption[] = [];
  let t = 0;
  PLAN.forEach(([, place], i) => {
    if (place && d[i] >= 5) captions.push({ at: t + 1.2, dur: Math.min(4.5, d[i] - 1.5), kind: 'place', text: place });
    t += d[i];
  });
  // The narration audio runs slightly ahead of the aligned cues, so pull subtitles earlier to match.
  const SUB_LEAD = 2.6;
  for (const c of cues) captions.push({ at: Math.max(0, c.at - SUB_LEAD), dur: Math.max(1.2, c.dur), text: c.text });
  const visorStart = starts[5], visorEnd = starts[6];
  let visorOn = false;
  return {
    id: 'narrated', shots, captions,
    cues: w.visor ? [
      { at: Math.max(0, visorStart - 0.3), run: () => { visorOn = true; w.visor!.begin(V, head.clone().addScaledVector(camDir, 4), wind); } },
      { at: visorEnd + 0.2, run: () => { if (visorOn) { visorOn = false; w.visor!.end(); } } },
    ] : [],
    update: (t, dt) => { if (visorOn) w.visor!.update(dt, t); },
    cleanup: () => { if (visorOn) { visorOn = false; w.visor!.end(); } },
  };
}

/** Splits a transcript into subtitle-sized phrases (sentence ends, then commas, max ~84 characters). */
export function phrases(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+/)) {
    let cur = '';
    for (const part of sentence.split(/(?<=[,;:—])\s+/)) {
      if (cur && (cur + ' ' + part).length > 84) { out.push(cur); cur = part; } else cur = cur ? `${cur} ${part}` : part;
    }
    while (cur.length > 84) { const cut = cur.lastIndexOf(' ', 84); out.push(cur.slice(0, cut)); cur = cur.slice(cut + 1); }
    if (cur) out.push(cur);
  }
  return out.filter(Boolean);
}

/** Without alignment data: spread phrases over the recording in proportion to their length. */
export function estimateCues(text: string, duration: number): NarrationCue[] {
  const ps = phrases(text);
  const chars = ps.reduce((n, p) => n + p.length, 0) || 1;
  const lead = Math.min(0.6, duration * 0.02), span = duration - lead * 2;
  let t = lead;
  return ps.map((p) => { const dur = (p.length / chars) * span; const c = { at: t, dur: dur - 0.15, text: p }; t += dur; return c; });
}
