import { loadSettings } from '../core/settings';

/**
 * Front-end audio: the looping sci-fi theme that plays from the intro (after the first click / key press — browsers
 * block audio before a user gesture) through the main menu, plus one-shot interface sound effects. Plain
 * HTMLAudioElements so it works before the game's WebAudio engine exists. Files: public/assets/audio/ui/.
 */
const BASE = `${import.meta.env.BASE_URL}assets/audio/ui/`;
const MUSIC_LEVEL = 0.5;

class MenuMusic {
  private el: HTMLAudioElement | null = null;
  private target = 0;
  private master = loadSettings().volume;
  private timer = 0;

  /** Master volume 0…1 (Settings). */
  setVolume(v: number): void {
    this.master = v;
    if (this.el && this.target > 0 && !this.timer) this.el.volume = MUSIC_LEVEL * v;
  }

  /** Fades the theme in (no-op if already playing). */
  play(): void {
    if (!this.el) {
      this.el = new Audio(`${BASE}menu_theme.mp3`);
      this.el.loop = true;
      this.el.volume = 0;
      this.el.preload = 'auto';
    }
    this.target = 1;
    void this.el.play().catch(() => { /* blocked until a user gesture */ });
    this.fade(2.5);
  }

  /** Fades the theme out and pauses it. */
  stop(seconds = 1.5): void {
    if (!this.el || this.target === 0) return;
    this.target = 0;
    this.fade(seconds);
  }

  private fade(seconds: number): void {
    const el = this.el!;
    clearInterval(this.timer);
    const from = el.volume, t0 = performance.now();
    this.timer = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / (seconds * 1000));
      el.volume = Math.max(0, Math.min(1, from + (this.target * MUSIC_LEVEL * this.master - from) * k));
      if (k >= 1) {
        clearInterval(this.timer); this.timer = 0;
        if (this.target === 0) el.pause();
      }
    }, 50);
  }
}

export const menuMusic = new MenuMusic();

const cache = new Map<string, HTMLAudioElement>();
/** Preloads interface sounds so the first play is instant. */
export function preloadSfx(names: string[]): void {
  for (const n of names) if (!cache.has(n)) { const a = new Audio(`${BASE}${n}.mp3`); a.preload = 'auto'; cache.set(n, a); }
}
/** Plays a one-shot interface sound (overlapping plays allowed). */
export function sfx(name: string, volume = 0.8): void {
  let base = cache.get(name);
  if (!base) { base = new Audio(`${BASE}${name}.mp3`); cache.set(name, base); }
  const a = base.cloneNode(true) as HTMLAudioElement;
  a.volume = Math.max(0, Math.min(1, volume * loadSettings().volume));
  void a.play().catch(() => { /* blocked before a user gesture */ });
}
