import { h } from '../ui/dom';
import type { AudioEngine } from './audio';
import script from './voiceLines.json';
import beds from './soundBeds.json';

/**
 * Dialogue + cinematic background director.
 *
 * Voice lines (ElevenLabs, see src/audio/voiceLines.json) play from gameplay triggers ("objective:rover",
 * "cutscene:ice", "first:sample", …) one at a time from a queue — never overlapping — with subtitles. Story lines play
 * once; played ids are recorded so the PDA can replay them (Audio logs) and so saves remember them (mission flags
 * `vo.<id>`). Warnings ("warn:*") may repeat. Background beds crossfade between surface and cave.
 */
export interface VoiceLine { id: string; speaker: string; trigger: string; text: string }
interface Speaker { name: string; voiceName: string; radio?: boolean; device?: boolean; archive?: boolean }

const LINES = script.lines as VoiceLine[];
const SPEAKERS = script.speakers as Record<string, Speaker>;
const BEDS = beds.beds as Array<{ id: string; loop: boolean; gain: number }>;

export class VoiceDirector {
  readonly played = new Set<string>();
  private queue: VoiceLine[] = [];
  private busy = false;
  private readonly sub: HTMLElement;
  private readonly subWho: HTMLElement;
  private readonly subText: HTMLElement;
  /** Called after a line is first played (to persist it). */
  onPlayed: (id: string) => void = () => {};
  current: VoiceLine | null = null;

  constructor(private readonly audio: AudioEngine, private readonly base: string, parent: HTMLElement) {
    this.subWho = h('div.who');
    this.subText = h('div.txt');
    this.sub = h('div.subtitle.hidden', null, this.subWho, this.subText);
    parent.append(this.sub);
  }

  get lines(): VoiceLine[] { return LINES; }
  speakerOf(line: VoiceLine): Speaker { return SPEAKERS[line.speaker]; }

  /** Plays every not-yet-played line bound to `trigger` (warnings always). */
  trigger(trigger: string): void {
    for (const l of LINES) {
      if (l.trigger !== trigger) continue;
      const repeatable = trigger.startsWith('warn:');
      if (!repeatable && (this.played.has(l.id) || this.queue.includes(l))) continue;
      if (repeatable && (this.current === l || this.queue.includes(l))) continue;
      this.enqueue(l);
    }
  }

  /** Replays a line (PDA audio log); jumps the queue. */
  replay(id: string): void {
    const l = LINES.find((x) => x.id === id);
    if (l) { this.queue.unshift(l); this.pump(); }
  }

  /** Restores played lines from saved flags. */
  restore(ids: Iterable<string>): void {
    this.played.clear();
    for (const id of ids) this.played.add(id);
    this.queue = [];
  }

  private enqueue(l: VoiceLine): void {
    this.queue.push(l);
    this.pump();
  }

  /**
   * Lines that no longer fit the moment (e.g. an objective's arrival line after that objective is already done) are
   * dropped when their turn comes, instead of playing minutes later over an unrelated scene.
   */
  stale: ((line: VoiceLine) => boolean) | null = null;

  private pump(): void {
    if (this.busy || !this.queue.length) return;
    if (!this.audio.started) { setTimeout(() => this.pump(), 300); return; } // wait for the first user gesture
    while (this.queue.length && this.stale?.(this.queue[0])) this.queue.shift();
    if (!this.queue.length) return;
    const line = this.queue.shift()!;
    this.busy = true;
    this.current = line;
    const sp = SPEAKERS[line.speaker];
    const firstTime = !this.played.has(line.id);
    if (!line.trigger.startsWith('warn:')) this.played.add(line.id);
    const treatment = sp.archive ? 'archive' : sp.radio ? 'radio' : sp.device ? 'device' : false;
    const gen = this.gen;
    void this.audio.playVoice(`${this.base}assets/audio/voice/${line.id}.mp3`, treatment, (d) => this.showSub(sp, line.text, d)).then(() => {
      if (gen !== this.gen) return; // flushed meanwhile
      this.hideSub();
      this.current = null;
      if (firstTime && !line.trigger.startsWith('warn:')) this.onPlayed(line.id);
      // A short breath between lines.
      setTimeout(() => { this.busy = false; this.pump(); }, 450);
    });
  }

  private subTimers: number[] = [];
  private gen = 0;

  /** Shows the line sentence by sentence, paced by character count across the audio duration. */
  private showSub(sp: Speaker, text: string, duration = 0): void {
    this.subWho.textContent = sp.archive ? `${sp.name} · archived recording` : sp.radio ? `${sp.name} · radio` : sp.name;
    this.sub.classList.remove('hidden');
    this.sub.classList.toggle('radio', !!sp.radio);
    this.sub.classList.toggle('device', !!sp.device);
    this.subTimers.forEach(clearTimeout); this.subTimers = [];
    const parts = text.match(/[^.!?]+(?:[.!?]+|$)(?:\s+|$)/g)?.map((x) => x.trim()).filter(Boolean) ?? [text];
    // Group short sentences into ~90-character subtitle cards.
    const cards: string[] = [];
    for (const p of parts) { if (cards.length && cards[cards.length - 1].length + p.length < 90) cards[cards.length - 1] += ' ' + p; else cards.push(p); }
    const total = cards.reduce((n, c) => n + c.length, 0) || 1;
    let at = 0;
    for (const c of cards) {
      const show = () => { this.subText.textContent = c; };
      if (at === 0 || duration <= 0) show(); else this.subTimers.push(window.setTimeout(show, at * 1000));
      at += (c.length / total) * duration;
      if (duration <= 0) { this.subText.textContent = text; break; }
    }
  }

  private hideSub(): void { this.sub.classList.add('hidden'); this.subTimers.forEach(clearTimeout); this.subTimers = []; }

  /** Plays one line now-ish (queued behind the current line), even if it was heard before. */
  say(id: string): void {
    const l = LINES.find((x) => x.id === id);
    if (l && this.current !== l && !this.queue.includes(l)) this.enqueue(l);
  }

  /** Drops queued lines and stops the current one (skipped cutscenes). */
  flush(): void {
    this.queue = [];
    this.gen++;
    this.audio.stopVoice();
    this.hideSub();
    this.current = null;
    this.busy = false;
  }

  /** True while a line is playing or waiting. */
  get speaking(): boolean { return this.busy || this.queue.length > 0; }

  /** Lines bound to a trigger (cinematic timing). */
  linesFor(trigger: string): VoiceLine[] { return LINES.filter((l) => l.trigger === trigger); }

  /** Background bed for the current situation: 0 = surface … 1 = deep cave. */
  updateBed(cave: number, enabled: boolean): void {
    const id = !enabled ? null : cave > 0.4 ? 'bed_cave' : 'bed_surface';
    const def = BEDS.find((b) => b.id === id);
    void this.audio.setBed(id, `${this.base}assets/audio/music/${id}.mp3`, def?.gain ?? 0.3);
  }

  sting(id = 'sting_discovery'): void {
    const def = BEDS.find((b) => b.id === id);
    void this.audio.sting(`${this.base}assets/audio/music/${id}.mp3`, def?.gain ?? 0.5);
  }

  get subtitleVisible(): boolean { return !this.sub.classList.contains('hidden'); }
  get subtitleText(): string { return this.subText.textContent ?? ''; }
}
