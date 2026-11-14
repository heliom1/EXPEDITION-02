/** Keyboard + pointer-lock mouse input. Movement input is ignored while a UI layer has focus. */
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  uiFocus = false;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMouseMove);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.target;
  }

  requestLock(): void {
    if (this.locked) return;
    try {
      const r = this.target.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => undefined);
    } catch {
      /* the caller shows a click-to-resume prompt */
    }
  }

  releaseLock(): void {
    if (this.locked) document.exitPointerLock();
  }

  down(code: string): boolean {
    return !this.uiFocus && this.keys.has(code);
  }

  /** True once per physical key press (consumed). Works regardless of UI focus. */
  consume(code: string): boolean {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  takeMouse(): [number, number] {
    const d: [number, number] = [this.mouseDX, this.mouseDY];
    this.mouseDX = this.mouseDY = 0;
    return d;
  }

  clearPressed(): void {
    this.pressed.clear();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('F')) {
      if (e.code !== 'F11' && e.code !== 'F12') e.preventDefault();
    }
    if (!e.repeat) this.pressed.add(e.code);
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);

  private onBlur = () => this.keys.clear();

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    // Guard against the large spikes some browsers emit when pointer lock engages.
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMouseMove);
  }
}
