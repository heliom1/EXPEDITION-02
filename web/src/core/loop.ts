/** Fixed-timestep simulation with a variable-rate render callback. */
export class GameLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  readonly step: number;

  constructor(hz: number, private readonly sim: (dt: number) => void, private readonly render: (dt: number, alpha: number) => void) {
    this.step = 1 / hz;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      // Clamp long frames (tab switches, breakpoints) so the simulation never spirals.
      const dt = Math.min((now - this.last) / 1000, 0.25);
      this.last = now;
      this.acc += dt;
      let n = 0;
      while (this.acc >= this.step && n < 8) {
        this.sim(this.step);
        this.acc -= this.step;
        n++;
      }
      if (n === 8) this.acc = 0;
      this.render(dt, this.acc / this.step);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
