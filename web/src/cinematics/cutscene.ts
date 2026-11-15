import { CatmullRomCurve3, Vector3, type PerspectiveCamera } from 'three';
import { h } from '../ui/dom';

/**
 * Scripted in-engine cutscenes: camera shots along splines, letterbox, subtitles / titles, fades and timed cues.
 * Everything renders with the live game scene, so cutscenes always match the world (no pre-rendered video).
 *
 * Theatre.js (director.ts) stays the tool for hand-authoring camera moves in Studio; these cutscenes are built in
 * code because their shots depend on runtime positions (the player, the cave deposit, the outpost floor).
 */
export interface Pose { pos: Vector3; look: Vector3; fov?: number }

export interface Shot {
  duration: number;
  /** One or more poses. The camera travels through them over the shot (centripetal Catmull-Rom). */
  path: Pose[];
  ease?: 'inOut' | 'in' | 'out' | 'linear';
  /** Seconds of fade from black at the start / to black at the end of this shot. */
  fadeIn?: number;
  fadeOut?: number;
  /** Suit lamp on the camera during this shot (dark interiors). */
  lamp?: boolean;
  /** Hand-held camera wobble amplitude in metres (0 = locked off). */
  shake?: number;
}

export interface Caption {
  at: number;
  dur: number;
  text: string;
  /** sub = subtitle line, title = large centred title card, place = lower-third location tag. */
  kind?: 'sub' | 'title' | 'place';
  /** Small line above a title / below a place tag. */
  eyebrow?: string;
}

export interface Cutscene {
  id: string;
  shots: Shot[];
  captions?: Caption[];
  /** One-shot callbacks at a time in seconds (sounds, actor animation changes). Skipped cues do not run. */
  cues?: Array<{ at: number; run: () => void }>;
  /** Per-frame hook (actors, props). `t` is cutscene time in seconds. */
  update?: (t: number, dt: number) => void;
  /** Restores anything the cutscene changed in the world. Runs on finish and on skip. */
  cleanup?: () => void;
  /** Keep the camera on the final pose after the cutscene ends (until `release()`), e.g. under an end card. */
  holdLastFrame?: boolean;
  /** Procedural camera (tracking moving subjects); a returned pose overrides the shot path for that frame. */
  camera?: (t: number) => Pose | null;
  /** Called when the viewer skips (before cleanup), e.g. to stop dialogue. */
  onSkip?: () => void;
  /** Camera the cutscene drives (defaults to the camera passed to update) — e.g. the orbital scene's camera. */
  cam?: PerspectiveCamera;
}

const EASE = {
  linear: (u: number) => u,
  in: (u: number) => u * u,
  out: (u: number) => 1 - (1 - u) * (1 - u),
  inOut: (u: number) => u * u * (3 - 2 * u),
};

interface BuiltShot { shot: Shot; start: number; pos: CatmullRomCurve3 | null; look: CatmullRomCurve3 | null }

const SKIP_FADE = 0.45;
const SKIP_WINDOW = 2.5;

export class CutscenePlayer {
  readonly el: HTMLElement;
  private readonly fadeEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly placeEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private scene: Cutscene | null = null;
  private shots: BuiltShot[] = [];
  private total = 0;
  private onEnd: (() => void) | null = null;
  private cueIdx = 0;
  private active: Array<Caption | null> = [null, null, null];
  private skipArmed = 0;
  private skipping = -1;
  private holdPose: Pose | null = null;
  /** Cutscene time in seconds. */
  t = 0;
  /** Freezes time (automated frame capture via `seek`). */
  paused = false;
  /** Whether the current shot wants the suit lamp. */
  lamp = false;

  constructor(parent: HTMLElement) {
    this.fadeEl = h('div.cine-fade');
    this.subEl = h('div.cine-sub');
    this.titleEl = h('div.cine-title');
    this.placeEl = h('div.cine-place');
    this.hintEl = h('div.cine-skip', null, 'Press ', h('kbd', null, 'Space'), ' again to skip');
    this.el = h('div.cine.hidden', null, h('div.cine-bar.top'), h('div.cine-bar.bottom'), this.titleEl, this.placeEl, this.subEl, this.fadeEl, this.hintEl);
    parent.append(this.el);
  }

  get playing(): boolean { return this.scene !== null; }
  get id(): string | null { return this.scene?.id ?? null; }
  get duration(): number { return this.total; }
  /** True after a `holdLastFrame` cutscene ended, until `release()`. */
  get holding(): boolean { return this.holdPose !== null; }

  play(scene: Cutscene, onEnd: () => void): void {
    if (this.scene) this.finish(false);
    this.scene = scene;
    this.onEnd = onEnd;
    this.holdPose = null;
    this.t = 0;
    this.cueIdx = 0;
    this.skipArmed = 0;
    this.skipping = -1;
    this.paused = false;
    this.shots = [];
    let start = 0;
    for (const shot of scene.shots) {
      const many = shot.path.length > 1;
      this.shots.push({
        shot, start,
        pos: many ? new CatmullRomCurve3(shot.path.map((p) => p.pos), false, 'centripetal') : null,
        look: many ? new CatmullRomCurve3(shot.path.map((p) => p.look), false, 'centripetal') : null,
      });
      start += shot.duration;
    }
    this.total = start;
    scene.cues?.sort((a, b) => a.at - b.at);
    for (const el of [this.subEl, this.titleEl, this.placeEl]) el.classList.remove('on');
    this.active = [null, null, null];
    this.hintEl.classList.remove('on');
    this.el.classList.remove('hidden');
    this.fadeEl.style.opacity = '1';
    // Next frame: bars slide in (CSS transition).
    requestAnimationFrame(() => this.el.classList.add('on'));
  }

  /** First press arms the skip and shows a hint; a second press within the window skips. */
  pressSkip(): void {
    if (!this.scene || this.skipping >= 0) return;
    if (this.skipArmed > 0) { this.skipping = 0; this.hintEl.classList.remove('on'); return; }
    this.skipArmed = SKIP_WINDOW;
    this.hintEl.classList.add('on');
  }

  /** Jumps to a time and freezes playback there (frame capture / tests). Cues before `t` are not run. */
  seek(t: number, runCues = false): void {
    if (!this.scene) return;
    this.t = Math.max(0, Math.min(this.total - 1e-3, t));
    this.paused = true;
    while (this.cueIdx < (this.scene.cues?.length ?? 0) && this.scene.cues![this.cueIdx].at <= this.t) {
      const c = this.scene.cues![this.cueIdx++];
      if (runCues) c.run();
    }
  }

  /** Lets the camera go after a held final frame. */
  release(): void { this.holdPose = null; }

  /** Advances the cutscene and writes the camera. Call every render frame while playing (or holding). */
  update(dt: number, cam: PerspectiveCamera): void {
    if (!this.scene) {
      if (this.holdPose) this.write(cam, this.holdPose.pos, this.holdPose.look, this.holdPose.fov);
      return;
    }
    const sc = this.scene;
    if (!this.paused) this.t += dt;
    if (this.skipArmed > 0) { this.skipArmed -= dt; if (this.skipArmed <= 0) this.hintEl.classList.remove('on'); }
    const cues = sc.cues ?? [];
    while (this.cueIdx < cues.length && cues[this.cueIdx].at <= this.t) cues[this.cueIdx++].run();
    sc.update?.(this.t, this.paused ? 0 : dt);

    const t = Math.min(this.t, this.total);
    let b = this.shots[0];
    for (const s of this.shots) if (t >= s.start) b = s;
    const s = b.shot;
    const local = t - b.start;
    const u = EASE[s.ease ?? 'inOut'](Math.min(1, Math.max(0, local / s.duration)));
    const pos = b.pos ? b.pos.getPoint(u) : s.path[0].pos.clone();
    const look = b.look ? b.look.getPoint(u) : s.path[0].look.clone();
    if (s.shake) {
      const a = s.shake;
      pos.x += (Math.sin(t * 1.7) + Math.sin(t * 2.9 + 1.3) * 0.5) * a;
      pos.y += (Math.sin(t * 2.3 + 0.7) + Math.sin(t * 3.7) * 0.4) * a * 0.7;
      look.x += Math.sin(t * 1.1 + 2.1) * a * 1.5;
    }
    const fovs = s.path.map((p) => p.fov ?? 60);
    const fi = u * (fovs.length - 1), i0 = Math.floor(fi), i1 = Math.min(fovs.length - 1, i0 + 1);
    const fov = fovs[i0] + (fovs[i1] - fovs[i0]) * (fi - i0);
    const proc = sc.camera?.(t);
    if (proc) this.write(sc.cam ?? cam, proc.pos, proc.look, proc.fov ?? fov);
    else this.write(sc.cam ?? cam, pos, look, fov);
    this.lamp = !!s.lamp;

    // Fade: shot edges, the very start, and a skip.
    let black = 0;
    if (s.fadeIn) black = Math.max(black, 1 - local / s.fadeIn);
    if (s.fadeOut) black = Math.max(black, 1 - (s.duration - local) / s.fadeOut);
    if (this.skipping >= 0) {
      if (!this.paused) this.skipping += dt;
      black = Math.max(black, this.skipping / SKIP_FADE);
    }
    this.fadeEl.style.opacity = String(Math.min(1, Math.max(0, black)));

    // Captions: one slot per kind, so a title and a subtitle can overlap.
    const kinds: Array<NonNullable<Caption['kind']>> = ['sub', 'title', 'place'];
    kinds.forEach((k, ki) => {
      const cap = (sc.captions ?? []).find((c) => (c.kind ?? 'sub') === k && t >= c.at && t < c.at + c.dur) ?? null;
      if (cap === this.active[ki]) return;
      this.active[ki] = cap;
      const el = k === 'sub' ? this.subEl : k === 'title' ? this.titleEl : this.placeEl;
      if (!cap) { el.classList.remove('on'); return; }
      el.replaceChildren(...(cap.eyebrow && k === 'title' ? [h('div.eyebrow', null, cap.eyebrow)] : []), h('div.text', null, cap.text), ...(cap.eyebrow && k === 'place' ? [h('div.eyebrow', null, cap.eyebrow)] : []));
      el.classList.remove('on');
      void el.offsetWidth; // restart the transition when one caption replaces another
      el.classList.add('on');
    });

    if (this.skipping >= SKIP_FADE) sc.onSkip?.();
    if (this.t >= this.total || this.skipping >= SKIP_FADE) {
      if (sc.holdLastFrame) {
        const last = this.shots[this.shots.length - 1];
        const lp = last.shot.path[last.shot.path.length - 1];
        this.holdPose = { pos: lp.pos.clone(), look: lp.look.clone(), fov: lp.fov };
      }
      this.finish(true);
    }
  }

  private write(cam: PerspectiveCamera, pos: Vector3, look: Vector3, fov = 60): void {
    cam.position.copy(pos);
    cam.lookAt(look);
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  private finish(callEnd: boolean): void {
    const sc = this.scene, end = this.onEnd;
    this.scene = null;
    this.onEnd = null;
    this.lamp = false;
    this.el.classList.remove('on');
    this.fadeEl.style.opacity = '0';
    this.hintEl.classList.remove('on');
    for (const el of [this.subEl, this.titleEl, this.placeEl]) el.classList.remove('on');
    setTimeout(() => { if (!this.scene) this.el.classList.add('hidden'); }, 700);
    sc?.cleanup?.();
    if (callEnd) end?.();
  }
}
