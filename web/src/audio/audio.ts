import type { PerspectiveCamera, Vector3 } from 'three';

/**
 * Procedural sound design (no audio files). Grounded in what Mars actually sounds like: the thin
 * CO₂ atmosphere carries only quiet, muffled low-frequency wind, so most of what an astronaut hears
 * arrives through the suit itself — footsteps conducted through the boots, breathing, fans and pumps.
 * The cave adds a long generated reverb, sub-bass rumble and occasional ice drips.
 * Starts only after a user gesture (browser autoplay rules).
 */
/** Master make-up gain (×4 ≈ +12 dB) applied before the output limiter. */
export const MASTER_MAKEUP = 4;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  /** Read-only tap on the master output (diagnostics: F3 overlay and tests). */
  private meter: AnalyserNode | null = null;
  private meterBuf: Float32Array<ArrayBuffer> | null = null;
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
  private rumbleGain: GainNode | null = null;
  private rumbleSub: GainNode | null = null;
  private rumbleOsc: OscillatorNode | null = null;
  /** Extra wind for dust storms (0…1), added to the surface wind. */
  storm = 0;
  private gust = 0;
  private dripTimer = 2;
  private lastStride = 0;
  volume = 0.8;

  get started(): boolean {
    return !!this.ctx;
  }

  /** Current master output level in dBFS (RMS over ~43 ms); −Infinity when silent or not started. */
  levelDb(): number {
    if (!this.meter || !this.meterBuf) return -Infinity;
    this.meter.getFloatTimeDomainData(this.meterBuf);
    let sum = 0;
    for (const v of this.meterBuf) sum += v * v;
    const rms = Math.sqrt(sum / this.meterBuf.length);
    return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  }

  /** 'none' before the first start(), else the AudioContext state ('running' | 'suspended' | 'closed'). */
  get state(): string {
    return this.ctx?.state ?? 'none';
  }

  /** Must be called from a user gesture handler. */
  start(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    let ctx: AudioContext;
    try { ctx = new AudioContext(); } catch { return; }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    // Master stage: the procedural mix was authored ~15–20 dB too quiet (measured −32…−38 dBFS RMS; typical game mixes
    // sit around −20…−14). Make-up gain brings it up; a compressor/limiter keeps door hisses and cutscene swells from
    // clipping. The meter reads after the limiter, i.e. what the player hears.
    const makeup = ctx.createGain();
    makeup.gain.value = MASTER_MAKEUP;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 10;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    this.master.connect(makeup);
    makeup.connect(limiter);
    limiter.connect(ctx.destination);
    this.meter = ctx.createAnalyser();
    this.meter.fftSize = 2048;
    this.meterBuf = new Float32Array(this.meter.fftSize);
    limiter.connect(this.meter);
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

    // Engine / entry rumble (cinematics, vehicles): low band-passed noise + a sub oscillator, driven by setRumble().
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 160; rf.Q.value = 0.9;
    this.rumbleGain = ctx.createGain(); this.rumbleGain.gain.value = 0;
    this.loopNoise().connect(rf).connect(this.rumbleGain).connect(this.master);
    const sub = ctx.createOscillator(); sub.type = 'sawtooth'; sub.frequency.value = 38;
    const subF = ctx.createBiquadFilter(); subF.type = 'lowpass'; subF.frequency.value = 90;
    this.rumbleSub = ctx.createGain(); this.rumbleSub.gain.value = 0;
    sub.connect(subF).connect(this.rumbleSub).connect(this.master); sub.start();
    this.rumbleOsc = sub;

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

  /** Continuous engine / entry / motor rumble, 0…1 (pitch rises with level). */
  setRumble(level: number, pitch = 1): void {
    if (!this.ctx || !this.rumbleGain || !this.rumbleSub || !this.rumbleOsc) return;
    const t = this.ctx.currentTime;
    this.rumbleGain.gain.setTargetAtTime(level * 0.22, t, 0.15);
    this.rumbleSub.gain.setTargetAtTime(level * 0.05, t, 0.15);
    this.rumbleOsc.frequency.setTargetAtTime((32 + level * 22) * pitch, t, 0.2);
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

  /** Slow pad voice: oscillators with a long attack and release (cutscene beds). */
  private pad(freqs: number[], attack: number, hold: number, release: number, gain: number, type: OscillatorType = 'sine', wet = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0003, t + attack + hold + release);
    g.connect(this.sfx);
    if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w).connect(this.reverbIn); }
    const end = t + attack + hold + release + 0.1;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = (i % 2 ? 1 : -1) * 6;
      o.connect(g);
      o.start(t);
      o.stop(end);
    });
  }

  /** Cutscene sound cues. */
  cue(kind: 'swell' | 'whoosh' | 'transmit' | 'reveal'): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    switch (kind) {
      // Low, wide drone that rises under an establishing shot.
      case 'swell': this.pad([55, 82.4, 110], 3.5, 3, 5, 0.035, 'sine', 0.4); this.pad([164.8], 4, 2, 4, 0.008, 'triangle', 0.6); break;
      // Air rushing past as the camera dives in (band-passed noise sweep).
      case 'whoosh': {
        const s = ctx.createBufferSource();
        s.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 1.2;
        const g = ctx.createGain();
        const t = ctx.currentTime;
        f.frequency.setValueAtTime(260, t);
        f.frequency.exponentialRampToValueAtTime(1700, t + 1.6);
        f.frequency.exponentialRampToValueAtTime(380, t + 3);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.06, t + 1.5);
        g.gain.exponentialRampToValueAtTime(0.0005, t + 3);
        s.connect(f).connect(g).connect(this.sfx);
        s.start(t, Math.random(), 3.1);
        break;
      }
      // Data burst: a carrier with quick chirps.
      case 'transmit': {
        this.pad([1180], 0.05, 1.9, 0.3, 0.008, 'sine');
        for (let i = 0; i < 24; i++) setTimeout(() => this.ctx && this.tone(1300 + Math.random() * 1300, 1300 + Math.random() * 1300, 0.05, 0.018, 'square'), i * 85);
        break;
      }
      // Discovery: a bright, open chord that blooms in the cave reverb.
      case 'reveal': this.pad([220, 329.6, 440, 554.4], 1.6, 2.5, 5, 0.014, 'sine', 0.9); this.pad([110], 2, 2, 4, 0.02, 'sine', 0.5); break;
    }
  }

  ui(kind: 'interact' | 'notice' | 'warn' | 'lamp' | 'complete' | 'scan' | 'door' | 'grind'): void {
    if (!this.ctx) return;
    switch (kind) {
      // Rock drill biting into stone (played every ~0.2 s while drilling).
      case 'grind': this.burst(1500 + Math.random() * 600, 1.1, 0.13, 0.05); this.tone(170, 150, 0.13, 0.025, 'sawtooth'); break;
      // Airlock door: pressure-seal hiss, then a low servo drive while the leaf moves (~1.6 s).
      case 'door': this.burst(2600, 1.4, 0.45, 0.05); this.tone(95, 70, 1.5, 0.05, 'sawtooth'); this.tone(190, 140, 1.5, 0.018, 'triangle'); break;
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
    this.windGain.gain.setTargetAtTime((0.05 + 0.13 * gust + this.storm * (0.32 + 0.12 * gust)) * Math.max(outside, this.storm * 0.35), t, 0.4);
    this.windFilter.frequency.setTargetAtTime(220 + 260 * gust + this.storm * 700, t, 0.6);
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

  // ---------- recorded media: dialogue (ElevenLabs), cinematic beds, stings ----------
  private voiceBus: GainNode | null = null;
  private bedBus: GainNode | null = null;
  /** Everything except dialogue passes through this; it dips while someone is speaking. */
  private duckBus: GainNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private bed: { id: string; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private speaking = 0;

  private mediaReady(): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    if (!this.voiceBus) {
      this.duckBus = ctx.createGain();
      this.duckBus.connect(this.master);
      this.sfx.disconnect();
      this.sfx.connect(this.duckBus);
      this.bedBus = ctx.createGain();
      this.bedBus.connect(this.duckBus);
      this.voiceBus = ctx.createGain();
      this.voiceBus.gain.value = 1.15;
      this.voiceBus.connect(this.master);
    }
    return true;
  }

  /** Fetches and decodes an audio file once (cached). Resolves null if missing/undecodable. */
  load(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return Promise.resolve(null);
    let p = this.buffers.get(url);
    if (!p) {
      const ctx = this.ctx;
      p = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`)))).then((b) => ctx.decodeAudioData(b)).catch(() => null);
      this.buffers.set(url, p);
    }
    return p;
  }

  /**
   * Plays a dialogue line; resolves when it ends (or immediately if unavailable). `radio` = Mission Control treatment:
   * telephone band-pass, light saturation and a static click at each end. Background is ducked meanwhile.
   */
  async playVoice(url: string, treatment: boolean | 'radio' | 'device' | 'archive', onStart?: (duration: number) => void): Promise<void> {
    const radio = treatment === true || treatment === 'radio' || treatment === 'archive';
    if (!this.mediaReady()) return;
    const buf = await this.load(url);
    const ctx = this.ctx!;
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    let tail: AudioNode = src;
    if (radio) {
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3300;
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) { const x = (i / 511.5) - 1; curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
      shaper.curve = curve;
      src.connect(hp); hp.connect(lp); lp.connect(shaper);
      tail = shaper;
      if (treatment === 'archive') { // older recording: narrower band, more hiss
        lp.frequency.value = 2600;
        for (let k = 0; k < Math.ceil(buf.duration / 0.9); k++) setTimeout(() => this.ctx && this.burst(4000, 0.5, 0.012, 0.9), k * 900);
      }
      this.burst(2500, 0.8, 0.09, 0.05); // squelch in
      setTimeout(() => this.ctx && this.burst(2500, 0.8, 0.12, 0.05), (buf.duration + 0.05) * 1000); // squelch out
    }
    if (treatment === 'device') { // PDA / onboard computer: clean, slightly band-limited, presence lift
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 170;
      const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 2600; pk.Q.value = 0.9; pk.gain.value = 3;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7600;
      tail.connect(hp); hp.connect(pk); pk.connect(lp);
      tail = lp;
    }
    tail.connect(this.voiceBus!);
    this.setDuck(true);
    this.voiceSources.add(src);
    onStart?.(buf.duration);
    await new Promise<void>((resolve) => { src.onended = () => resolve(); src.start(); });
    this.voiceSources.delete(src);
    this.setDuck(false);
  }

  private readonly voiceSources = new Set<AudioBufferSourceNode>();

  /** Stops any dialogue currently playing (e.g. when a narrated cutscene is skipped). */
  stopVoice(): void {
    for (const s of this.voiceSources) { try { s.stop(); } catch { /* not started */ } }
  }

  private setDuck(on: boolean): void {
    if (!this.duckBus || !this.ctx) return;
    this.speaking = Math.max(0, this.speaking + (on ? 1 : -1));
    this.duckBus.gain.setTargetAtTime(this.speaking > 0 ? 0.32 : 1, this.ctx.currentTime, this.speaking > 0 ? 0.12 : 0.6);
  }

  /** Crossfades to a looping background bed (null = fade out). Same id = no-op. */
  async setBed(id: string | null, url: string, gain: number, fade = 3): Promise<void> {
    if (!this.mediaReady()) return;
    if ((this.bed?.id ?? null) === id) return;
    const ctx = this.ctx!;
    const old = this.bed;
    this.bed = null;
    if (old) { old.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); setTimeout(() => { try { old.src.stop(); } catch { /* already stopped */ } }, fade * 1500); }
    if (!id) return;
    const buf = await this.load(url);
    if (!buf || this.bed) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(gain, ctx.currentTime, fade / 3);
    src.connect(g); g.connect(this.bedBus!);
    src.start();
    this.bed = { id, src, gain: g };
  }

  /** One-shot cinematic sting (e.g. a discovery). */
  async sting(url: string, gain: number): Promise<void> {
    if (!this.mediaReady()) return;
    const buf = await this.load(url);
    if (!buf || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g); g.connect(this.bedBus!);
    src.start();
  }

  get currentBed(): string | null { return this.bed?.id ?? null; }
}
