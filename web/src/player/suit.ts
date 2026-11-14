import { events } from '../core/events';

/**
 * Suit life support for the vertical slice: oxygen and suit power drain over time (faster when
 * sprinting) and are restored at the outpost airlock. Health falls only when oxygen is exhausted.
 * Thresholds raise warnings well before failure; failure is recoverable (return to the outpost).
 */
export class SuitSystem {
  oxygen = 100;
  power = 100;
  health = 100;
  private warned = { o2: false, o2crit: false, pwr: false };

  /** Full oxygen lasts ~22 minutes walking; suit power ~30 minutes. */
  update(dt: number, sprinting: boolean, lamp = false): 'ok' | 'failed' {
    const o2Rate = 100 / (22 * 60) * (sprinting ? 1.6 : 1);
    const pwrRate = 100 / (30 * 60) * (sprinting ? 2 : 1) * (lamp ? 1.4 : 1);
    this.oxygen = Math.max(0, this.oxygen - o2Rate * dt);
    this.power = Math.max(0, this.power - pwrRate * dt);
    if (this.oxygen <= 0) this.health = Math.max(0, this.health - 4 * dt);

    if (this.oxygen < 30 && !this.warned.o2) { this.warned.o2 = true; events.emit('notice', { text: 'Oxygen below 30% — return to the outpost airlock to recharge.', tone: 'warn' }); }
    if (this.oxygen < 10 && !this.warned.o2crit) { this.warned.o2crit = true; events.emit('notice', { text: 'OXYGEN CRITICAL', tone: 'warn' }); }
    if (this.power < 20 && !this.warned.pwr) { this.warned.pwr = true; events.emit('notice', { text: 'Suit power low — sprint assist disabled at 0%.', tone: 'warn' }); }
    return this.health <= 0 ? 'failed' : 'ok';
  }

  recharge(): void {
    this.oxygen = 100;
    this.power = 100;
    this.health = Math.max(this.health, 100);
    this.warned = { o2: false, o2crit: false, pwr: false };
  }
}
