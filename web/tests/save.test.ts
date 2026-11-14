import { describe, expect, it } from 'vitest';
import { upgrade, validate, SAVE_VERSION, type SaveData } from '../src/save/saveSystem';

const good = (): SaveData => ({
  version: SAVE_VERSION,
  savedAt: 1,
  player: { x: -1200, y: -48, z: 1120, yaw: 1.2, pitch: 0.1 },
  suit: { oxygen: 80, power: 70, health: 100, lamp: true },
  mission: { index: 3, records: ['assignment', 'rover_log'], flags: ['done.checkin'] },
  world: { drill: 'done', drillProgress: 1, iceScanned: false },
  playSeconds: 600,
});

describe('save schema', () => {
  it('accepts a current, valid save', () => {
    expect(validate(good())).toBeNull();
    const r = upgrade(good());
    expect(r.status).toBe('ok');
  });

  it('reports a missing save as none', () => {
    expect(upgrade(undefined).status).toBe('none');
  });

  it('migrates a v1 save (no lamp / ice flags) to the current version', () => {
    const v1 = JSON.parse(JSON.stringify(good()));
    v1.version = 1;
    delete v1.suit.lamp;
    delete v1.world.iceScanned;
    const r = upgrade(v1);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.migratedFrom).toBe(1);
      expect(r.data.version).toBe(SAVE_VERSION);
      expect(r.data.suit.lamp).toBe(false);
      expect(r.data.world.iceScanned).toBe(false);
    }
  });

  it('rejects corrupt data without throwing', () => {
    for (const bad of [42, 'x', { version: 99 }, { ...good(), player: { x: NaN, y: 0, z: 0, yaw: 0, pitch: 0 } }, { ...good(), suit: { oxygen: 500, power: 1, health: 1, lamp: false } }, { ...good(), world: { drill: 'exploded' } }]) {
      const r = upgrade(bad);
      expect(r.status).toBe('corrupt');
    }
  });
});
