import { describe, expect, it } from 'vitest';
import { WorldData, type WorldMeta } from '../src/world/worldData';
import { ColliderSet } from '../src/world/colliders';
import { PlayerController } from '../src/player/controller';
import { Ground } from '../src/cave/ground';
import { MissionState, OBJECTIVES } from '../src/missions/missions';
import { events } from '../src/core/events';
import { SuitSystem } from '../src/player/suit';
import type { Input } from '../src/core/input';
import type { RockField } from '../src/world/rocks';

/** Synthetic 1 tile world: flat at 0 for x < 0, a 60° ramp for x > 0. */
function makeWorld(): WorldData {
  const meta: WorldMeta = {
    extent: 64, cell: 2, tile: 128, tilesPerSide: 1, tileRes: 65, alphaRes: 64,
    heightBase: -100, heightSize: 400, backdrop: { res: 2, extent: 1, base: 0, size: 1 }, minHeight: -100, maxHeight: 300,
  };
  const w = new WorldData(meta);
  const data = new Uint16Array(65 * 65);
  for (let j = 0; j < 65; j++)
    for (let i = 0; i < 65; i++) {
      const x = -64 + i * 2;
      const h = x > 0 ? x * Math.tan((60 * Math.PI) / 180) : 0;
      data[j * 65 + i] = Math.round(((h + 100) / 400) * 65535);
    }
  w.placeTile(0, 0, data);
  return w;
}

const keys = (held: string[]): Input => ({
  down: (c: string) => held.includes(c), consume: () => false, takeMouse: () => [0, 0],
} as unknown as Input);
const noRocks = { collidersNear: (_x: number, _z: number, out: unknown[]) => { out.length = 0; } } as unknown as RockField;
const mkPlayer = (c: ColliderSet) => { const w = makeWorld(); return new PlayerController(w, c, noRocks, new Ground(w)); };

describe('PlayerController', () => {
  it('walks on flat ground at walking speed and stays grounded', () => {
    const p = mkPlayer(new ColliderSet());
    p.teleport(-40, 0, Math.PI / 2); // facing -X (west)
    for (let i = 0; i < 120; i++) p.step(1 / 60, keys(['KeyW']));
    expect(p.grounded).toBe(true);
    expect(p.pos.y).toBeCloseTo(0, 1);
    expect(p.pos.x).toBeLessThan(-44);
    expect(p.pos.x).toBeGreaterThan(-47);
  });

  it('cannot climb a slope steeper than the limit', () => {
    const p = mkPlayer(new ColliderSet());
    p.teleport(-6, 0, -Math.PI / 2); // facing +X, towards the 60° ramp
    for (let i = 0; i < 600; i++) p.step(1 / 60, keys(['KeyW', 'ShiftLeft']));
    expect(p.pos.y).toBeLessThan(2);
  });

  it('is pushed out of structure colliders', () => {
    const c = new ColliderSet();
    c.add(-30, 0, 3, -10, 10);
    const p = mkPlayer(c);
    p.teleport(-40, 0, -Math.PI / 2); // walk east into the cylinder
    for (let i = 0; i < 300; i++) p.step(1 / 60, keys(['KeyW']));
    expect(Math.hypot(p.pos.x + 30, p.pos.z)).toBeGreaterThanOrEqual(3 + 0.38 - 1e-3);
  });

  it('reports compass heading with north = +Z, east = +X', () => {
    const p = mkPlayer(new ColliderSet());
    p.yaw = Math.PI; expect(p.heading).toBeCloseTo(0, 3);
    p.yaw = -Math.PI / 2; expect(p.heading).toBeCloseTo(90, 3);
  });
});

describe('MissionState', () => {
  it('advances only in order and signals the end of the build', () => {
    const m = new MissionState();
    let ended = false;
    const off = events.on('endOfBuild', () => { ended = true; });
    expect(m.completeObjective('rover')).toBe(false);
    for (const o of OBJECTIVES) expect(m.completeObjective(o.id)).toBe(true);
    expect(m.complete).toBe(true);
    expect(m.current).toBeNull();
    expect(ended).toBe(true);
    off();
  });

  it('does not duplicate records', () => {
    const m = new MissionState();
    m.addRecord('assignment'); m.addRecord('assignment');
    expect(m.records).toEqual(['assignment']);
  });
});

describe('SuitSystem', () => {
  it('warns before oxygen runs out and fails only after depletion', () => {
    const s = new SuitSystem();
    const notices: string[] = [];
    const off = events.on('notice', (n) => notices.push(n.text));
    let result = 'ok';
    let t = 0;
    while (result === 'ok' && t < 3600) { result = s.update(1, false); t++; }
    expect(notices.some((n) => n.includes('Oxygen below 30%'))).toBe(true);
    expect(t).toBeGreaterThan(22 * 60);
    s.recharge();
    expect(s.oxygen).toBe(100);
    off();
  });
});
