import type { PerspectiveCamera, Vector3 } from 'three';

/**
 * Procedural sound design (no audio files). Grounded in what Mars actually sounds like: the thin
 * CO₂ atmosphere carries only quiet, muffled low-frequency wind, so most of what an astronaut hears
 * arrives through the suit itself — footsteps conducted through the boots, breathing, fans and pumps.
 * The cave adds a long generated reverb, sub-bass rumble and occasional ice drips.
 * Starts only after a user gesture (browser autoplay rules).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private reverbIn!: GainNode;
  private reverbWet!: GainNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private caveGain!: GainNode;
  private breathGain!: GainNode;
  private breathFilter!: BiquadFilterNode;
  private drillGain!: GainNode;
  private drillPanner!: PannerNode;
  private breathPhase = 0;
  private gust = 0;
  private dripTimer = 2;
  private lastStride = 0;
  volume = 0.8;

  get started(): boolean {
    return !!this.ctx;
  }

  /** Must be called from a user gesture handler. */
  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    let ctx: AudioContext;
    try { ctx = new AudioContext(); } catch { return; }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);

    // White noise source buffer shared by all noise voices.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // Cave reverb: exponentially decaying stereo noise impulse.
    const conv = ctx.createConvolver();
    const ir = ctx.createBuffer(2, ctx.sampleRate * 3, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.2);
    }
    conv.buffer = ir;
    this.reverbIn = ctx.createGain();
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0;
    this.reverbIn.connect(conv).connect(this.reverbWet).connect(this.master);

    // Wind: heavily low-passed noise with slow gusts.
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 320;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.loopNoise().connect(this.windFilter).connect(this.windGain).connect(this.master);

    // Cave rumble: very low band of noise.
    const caveFilter = ctx.createBiquadFilter();
    caveFilter.type = 'lowpass';
    caveFilter.frequency.value = 85;
    this.caveGain = ctx.createGain();
    this.caveGain.gain.value = 0;
    this.loopNoise().connect(caveFilter).connect(this.caveGain).connect(this.master);

    // Suit: fan/pump hum.
    const hum = ctx.createGain();
    hum.gain.value = 0.012;
    for (const [f, g] of [[118, 1], [236, 0.35], [59, 0.6]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(hum);
      o.start();
    }
    const humLp = ctx.createBiquadFilter();
    humLp.type = 'lowpass';
    humLp.frequency.value = 400;
    hum.connect(humLp).connect(this.master);

    // Breathing inside the helmet.
    this.breathFilter = ctx.createBiquadFilter();
    this.breathFilter.type = 'bandpass';
    this.breathFilter.frequency.value = 700;
    this.breathFilter.Q.value = 0.8;
    this.breathGain = ctx.createGain();
    this.breathGain.gain.value = 0;
    this.loopNoise().connect(this.breathFilter).connect(this.breathGain).connect(this.master);

    // Drill: positional machinery voice.
    this.drillPanner = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 4, maxDistance: 150, rolloffFactor: 1.6 });
    this.drillGain = ctx.createGain();
    this.drillGain.gain.value = 0;
    const drillLp = ctx.createBiquadFilter();
    drillLp.type = 'lowpass';
    drillLp.frequency.value = 500;
    for (const [type, f, g] of [['sawtooth', 43, 0.5], ['square', 86, 0.18], ['triangle', 172, 0.2]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(drillLp);
      o.start();
    }
    const grind = ctx.createBiquadFilter();
    grind.type = 'bandpass';
    grind.frequency.value = 260;
    this.loopNoise().connect(grind).connect(drillLp);
    drillLp.connect(this.drillGain).connect(this.drillPanner).connect(this.master);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  suspend(on: boolean): void {
    if (!this.ctx) return;
    if (on) void this.ctx.suspend(); else void this.ctx.resume();
  }

  private loopNoise(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    s.start(0, Math.random() * 1.5);
    return s;
  }

  /** Short filtered-noise transient (footsteps, impacts). */
  private burst(freq: number, q: number, dur: number, gain: number, wet = 0): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w).connect(this.reverbIn); }
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }

  private tone(f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'sine', wet = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.sfx);
    if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w).connect(this.reverbIn); }
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  ui(kind: 'interact' | 'notice' | 'warn' | 'lamp' | 'complete' | 'scan'): void {
    if (!this.ctx) return;
    switch (kind) {
      case 'interact': this.tone(880, 1320, 0.09, 0.05, 'triangle'); break;
      case 'notice': this.tone(660, 990, 0.12, 0.035, 'sine'); break;
      case 'warn': this.tone(520, 520, 0.18, 0.06, 'square'); setTimeout(() => this.ctx && this.tone(520, 520, 0.18, 0.06, 'square'), 260); break;
      case 'lamp': this.burst(3000, 2, 0.04, 0.08); break;
      case 'complete': [523, 659, 784].forEach((f, i) => setTimeout(() => this.ctx && this.tone(f, f, 0.25, 0.04, 'sine'), i * 110)); break;
      case 'scan': this.tone(1800, 2600, 0.08, 0.025, 'sine'); break;
    }
  }

  /** Per-frame update. `cave` is 0 outside → 1 deep in the cave. */
  update(dt: number, s: { cam: PerspectiveCamera; cave: number; sprinting: boolean; grounded: boolean; stride: number; oxygen: number; drillRunning: boolean; drillPos: Vector3; active: boolean }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const outside = 1 - s.cave;

    // Wind gusts (outside only), muffled.
    this.gust += dt;
    const gust = 0.55 + 0.45 * Math.sin(this.gust * 0.21) * Math.sin(this.gust * 0.077 + 1.3);
    this.windGain.gain.setTargetAtTime((0.05 + 0.13 * gust) * outside, t, 0.4);
    this.windFilter.frequency.setTargetAtTime(220 + 260 * gust, t, 0.6);
    this.caveGain.gain.setTargetAtTime(0.16 * s.cave, t, 0.6);
    this.reverbWet.gain.setTargetAtTime(0.9 * s.cave, t, 0.5);

    // Breathing: faster and louder when sprinting or short of oxygen.
    const rate = s.sprinting ? 0.55 : s.oxygen < 20 ? 0.4 : 0.24;
    this.breathPhase += dt * rate;
    const ph = this.breathPhase % 1;
    const inhale = ph < 0.42 ? Math.sin((ph / 0.42) * Math.PI) : 0;
    const exhale = ph >= 0.5 && ph < 0.95 ? Math.sin(((ph - 0.5) / 0.45) * Math.PI) * 0.8 : 0;
    const bv = (inhale + exhale) * (s.active ? (s.sprinting ? 0.05 : 0.022) : 0);
    this.breathGain.gain.setTargetAtTime(bv, t, 0.05);
    this.breathFilter.frequency.setTargetAtTime(inhale > 0 ? 900 : 620, t, 0.1);

    // Footsteps every ~0.8 m (conducted through the suit: dull crunch).
    if (s.active && s.grounded && s.stride - this.lastStride > (s.sprinting ? 1.05 : 0.8)) {
      this.lastStride = s.stride;
      const v = 0.12 + Math.random() * 0.05;
      this.burst(s.cave > 0.5 ? 700 : 900 + Math.random() * 300, 1.2, 0.11, v, 0.5 * s.cave);
      this.burst(140, 1, 0.08, v * 0.8);
    }
    if (s.stride < this.lastStride) this.lastStride = s.stride;

    // Ice drips deep in the cave.
    if (s.cave > 0.7) {
      this.dripTimer -= dt;
      if (this.dripTimer <= 0) {
        this.dripTimer = 1.8 + Math.random() * 4.5;
        this.tone(1500 + Math.random() * 900, 500, 0.07, 0.03, 'sine', 1.2);
      }
    }

    // Listener + drill.
    const l = ctx.listener;
    const p = s.cam.position;
    const fwd = s.cam.getWorldDirection(s.cam.up.clone());
    if (l.positionX) {
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(fwd.x, t); l.forwardY.setValueAtTime(fwd.y, t); l.forwardZ.setValueAtTime(fwd.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    }
    this.drillPanner.positionX.setValueAtTime(s.drillPos.x, t);
    this.drillPanner.positionY.setValueAtTime(s.drillPos.y + 3, t);
    this.drillPanner.positionZ.setValueAtTime(s.drillPos.z, t);
    this.drillGain.gain.setTargetAtTime(s.drillRunning ? 0.45 : 0, t, 0.3);
  }
}
