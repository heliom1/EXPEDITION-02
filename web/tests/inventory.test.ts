import { describe, expect, it } from 'vitest';
import { Hotbar, Inventory } from '../src/inventory/inventory';
import { OreField, type DepositDef } from '../src/inventory/ore';
import { discoveryRecord } from '../src/inventory/discoveries';
import { Vector3 } from 'three';

describe('Inventory', () => {
  it('stacks up to the item limit and spills into new slots', () => {
    const inv = new Inventory(3);
    expect(inv.add('hematite', 25)).toBe(0); // stack 20 → 20 + 5
    expect(inv.slots[0]).toEqual({ id: 'hematite', count: 20 });
    expect(inv.slots[1]).toEqual({ id: 'hematite', count: 5 });
    expect(inv.count('hematite')).toBe(25);
  });

  it('reports overflow when full and never exceeds capacity', () => {
    const inv = new Inventory(1);
    expect(inv.add('hand_drill', 1)).toBe(0);
    expect(inv.add('scanner', 1)).toBe(1); // non-stackable, no free slot
    expect(inv.spaceFor('scanner')).toBe(0);
  });

  it('removes from stacks and frees empty slots', () => {
    const inv = new Inventory(4);
    inv.add('o2_canister', 3);
    expect(inv.remove('o2_canister', 2)).toBe(2);
    expect(inv.count('o2_canister')).toBe(1);
    expect(inv.remove('o2_canister', 5)).toBe(1);
    expect(inv.slots.every((s) => s === null)).toBe(true);
  });

  it('moves a stack between containers (deposit / retrieve) and notifies listeners', () => {
    const suit = new Inventory(4), locker = new Inventory(4);
    let changes = 0;
    suit.onChange = () => changes++;
    suit.add('gypsum', 6);
    expect(suit.moveSlot(0, locker)).toBe(6);
    expect(locker.count('gypsum')).toBe(6);
    expect(suit.count('gypsum')).toBe(0);
    expect(changes).toBe(2);
  });

  it('round-trips through save data and drops unknown or invalid entries', () => {
    const inv = new Inventory(4);
    inv.add('battery', 2); inv.add('olivine', 7);
    const copy = new Inventory(4);
    copy.load(JSON.parse(JSON.stringify(inv.toJSON())));
    expect(copy.toJSON()).toEqual(inv.toJSON());
    copy.load([{ id: 'plutonium', count: 1 }, { id: 'battery', count: -3 }, null, { id: 'medkit', count: 99 }]);
    expect(copy.slots[0]).toBeNull();
    expect(copy.slots[1]).toBeNull();
    expect(copy.slots[3]).toEqual({ id: 'medkit', count: 5 }); // clamped to stack size
  });
});

describe('Hotbar', () => {
  it('selects quick slots and restores safely', () => {
    const hb = new Hotbar(5, ['hand_drill', 'scanner']);
    hb.select(1);
    expect(hb.selectedItem).toBe('scanner');
    hb.select(9);
    expect(hb.selected).toBe(1);
    hb.assign('battery');
    expect(hb.slots[2]).toBe('battery');
    hb.load(['medkit', 'bogus', 3], 7);
    expect(hb.slots.slice(0, 3)).toEqual(['medkit', null, null]);
    expect(hb.selected).toBe(0);
  });
});

describe('OreField (MineableOre / OrePickup)', () => {
  const defs: DepositDef[] = [{ id: 'd1', mineral: 'hematite', x: 0, z: 0, yields: 2 }];

  it('mines samples until depleted, and pickups are collected exactly once', () => {
    const ore = new OreField(() => 0, defs);
    const p1 = ore.mine('d1', new Vector3(5, 0, 0))!;
    expect(p1.mineral).toBe('hematite');
    expect(p1.pos.x).toBeGreaterThan(0); // dropped toward the player
    expect(ore.mine('d1')).not.toBeNull();
    expect(ore.mine('d1')).toBeNull(); // depleted
    expect(ore.collect(p1.id)?.count).toBe(1);
    expect(ore.collect(p1.id)).toBeNull();
  });

  it('persists remaining yield and uncollected samples', () => {
    const ore = new OreField(() => 0, defs);
    const p = ore.mine('d1')!;
    const saved = JSON.parse(JSON.stringify(ore.toJSON()));
    const again = new OreField(() => 0, defs);
    again.load(saved);
    expect(again.deposits.get('d1')!.remaining).toBe(1);
    expect(again.pickups.has(p.id)).toBe(true);
    // A new pickup id never collides with a restored one.
    const p2 = again.mine('d1')!;
    expect(p2.id).not.toBe(p.id);
  });
});

describe('Discovery records', () => {
  it('include identity, description, location and mission time', () => {
    const r = discoveryRecord({ id: 'geo_gypsum', item: 'gypsum', x: -1230, z: 1240, missionSeconds: 3725 });
    expect(r.id).toBe('geo_gypsum');
    expect(r.title).toBe('Gypsum identified');
    expect(r.body).toContain('CaSO₄');
    expect(r.body).toContain('E -1230 m · N 1240 m');
    expect(r.body).toContain('Sol 1, 01:02');
  });
});
