import { describe, expect, it } from 'vitest';
import { defaultInventoryState, upgrade, validate, SAVE_VERSION, type SaveData } from '../src/save/saveSystem';
import { LEGACY_OBJECTIVES, OBJECTIVES } from '../src/missions/missions';

const good = (): SaveData => ({
  version: SAVE_VERSION,
  savedAt: 1,
  player: { x: -1200, y: -48, z: 1120, yaw: 1.2, pitch: 0.1 },
  suit: { oxygen: 80, power: 70, health: 100, lamp: true },
  mission: { index: 3, records: ['assignment', 'rover_log'], flags: ['done.checkin'] },
  world: { drill: 'done', drillProgress: 1, iceScanned: false },
  playSeconds: 600,
  ...defaultInventoryState(),
});

/** Strips the v3 fields to produce an older-format save. */
const asV2 = () => {
  const s = JSON.parse(JSON.stringify(good()));
  s.version = 2;
  for (const k of ['inventory', 'hotbar', 'storage', 'ore', 'discoveries']) delete s[k];
  return s;
};

describe('save schema', () => {
  it('accepts a current, valid save', () => {
    expect(validate(good())).toBeNull();
    const r = upgrade(good());
    expect(r.status).toBe('ok');
  });

  it('reports a missing save as none', () => {
    expect(upgrade(undefined).status).toBe('none');
  });

  it('migrates a v1 save (no lamp / ice flags, no inventory) to the current version', () => {
    const v1 = asV2();
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
      expect(r.data.inventory.length).toBeGreaterThan(0);
    }
  });

  it('migrates a v2 save to v3 with the starting kit, a stocked locker and an untouched world', () => {
    const r = upgrade(asV2());
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.migratedFrom).toBe(2);
      expect(r.data.inventory.some((s) => s?.id === 'hand_drill')).toBe(true);
      expect(r.data.hotbar.slots[0]).toBe('hand_drill');
      expect(r.data.storage.locker_main.length).toBeGreaterThan(0);
      expect(r.data.ore.pickups).toEqual([]);
      expect(r.data.discoveries).toEqual([]);
      // progress kept: legacy objective 3 maps to the same story point in the chaptered campaign (v3 → v4)
      expect(r.data.mission.index).toBe(OBJECTIVES.findIndex((o) => o.id === LEGACY_OBJECTIVES[3]));
    }
  });

  it('rejects corrupt data without throwing', () => {
    for (const bad of [42, 'x', { version: 99 }, { ...good(), player: { x: NaN, y: 0, z: 0, yaw: 0, pitch: 0 } }, { ...good(), suit: { oxygen: 500, power: 1, health: 1, lamp: false } }, { ...good(), world: { drill: 'exploded' } }, { ...good(), inventory: 'lots' }, { ...good(), hotbar: { slots: [], selected: 42 } }]) {
      const r = upgrade(bad);
      expect(r.status).toBe('corrupt');
    }
  });
});
