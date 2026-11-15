import { describe, expect, it } from 'vitest';
import { FACILITY, Facilities, loadFacilities, power } from '../src/base/facilities';

const run = (f: Facilities, seconds: number, now = 0) => { const ev: string[] = []; for (let i = 0; i < seconds; i++) ev.push(...f.step(1, now + i)); return ev; };

describe('farm', () => {
  it('plant → water → grow → harvest', () => {
    const f = new Facilities();
    expect(f.bedAction(1, 0).ok).toBe(false);
    expect(f.bedAction(1, 2)).toMatchObject({ verb: 'Plant', ok: true });
    f.plant(1);
    let ev = run(f, 90);
    expect(f.s.beds[1].stage).toBe('growing');
    f.water(1);
    ev = run(f, FACILITY.growSeconds);
    expect(ev).toContain('ready');
    expect(f.s.beds[1].stage).toBe('ready');
    expect(f.harvest(1, () => 0)).toEqual([FACILITY.harvestRations, 1]);
    expect(f.s.beds[1].stage).toBe('empty');
  });

  it('a dry bed stops growing, warns, then dies', () => {
    const f = new Facilities();
    f.plant(2);
    run(f, FACILITY.waterSeconds);
    const g = f.s.beds[2].growth;
    const ev = run(f, FACILITY.wiltSeconds + 2);
    expect(f.s.beds[2].growth).toBe(g);
    expect(ev).toContain('wilting');
    expect(ev).toContain('dead');
    expect(f.bedAction(2, 0).verb).toBe('Clear');
  });
});

describe('power and shields', () => {
  it('shields cost power and shed grow lights when every bed grows', () => {
    const f = new Facilities();
    for (let i = 0; i < 4; i++) f.plant(i);
    expect(f.power.lightsOn).toBe(true);
    f.toggleShields();
    const ev = run(f, 5);
    expect(f.s.shieldLevel).toBe(1);
    expect(ev).toContain('deficit');
    const g = f.s.beds[0].growth;
    run(f, 10);
    expect(f.s.beds[0].growth).toBe(g); // lights shed → no growth
    expect(f.habitatDose).toBeCloseTo(FACILITY.doseShields);
    f.toggleShields();
    expect(run(f, 3)).toContain('powerRestored');
    expect(power(f.s).demand).toBeLessThanOrEqual(FACILITY.baseOutput);
  });
});

describe('comms', () => {
  it('reports earn credits once; drops are delayed and rate-limited', () => {
    const f = new Facilities();
    f.s.credits = 0;
    expect(f.transmit([], 2)).toBe(0);
    expect(f.transmit(['d1', 'd2'], 6)).toBe(4);
    expect(f.transmit(['d1', 'd2'], 6)).toBe(0);
    expect(f.requestDrop(0)).toBe(true);
    expect(f.canRequestDrop(1).ok).toBe(false);
    expect(run(f, FACILITY.dropDelay + 1)).toContain('drop');
    expect(f.canRequestDrop(60).ok).toBe(false); // cooldown
    expect(f.canRequestDrop(FACILITY.dropCooldown + 1).ok).toBe(true);
  });
});

describe('save', () => {
  it('round-trips and tolerates junk', () => {
    const f = new Facilities();
    f.plant(3); f.toggleShields(); f.s.credits = 5;
    const back = loadFacilities(JSON.parse(JSON.stringify(f.toJSON())));
    expect(back.beds[3].stage).toBe('growing');
    expect(back.shields).toBe(true);
    expect(back.credits).toBe(5);
    const junk = loadFacilities({ beds: [{ stage: 'banana' }, null], credits: 'x', shields: 1 });
    expect(junk.beds).toHaveLength(FACILITY.beds);
    expect(junk.credits).toBe(1);
  });
});
