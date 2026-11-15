import { expect, test, type Page } from '@playwright/test';

type Bed = { stage: string; growth: number; water: number };
type State = {
  focused: string | null; inventory: Array<{ id: string; count: number } | null>; locker: Array<{ id: string; count: number } | null>;
  base: { beds: Bed[]; shields: boolean; shieldLevel: number; credits: number; dropEta: number; reports: number; dose: number; farmHealth: number;
    power: { demand: number; output: number; lightsOn: boolean }; bedPos: number[][]; commsPos: number[]; shieldPos: number[] };
};
const API = 'window.__cf.api';
const count = (slots: State['inventory'], id: string) => slots.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);
const state = (page: Page) => page.evaluate(`${API}.state()`) as Promise<State>;
async function until(page: Page, pred: (s: State) => boolean, ms = 8000): Promise<State> {
  let s = await state(page);
  for (let t = 0; t < ms && !pred(s); t += 100) { await page.waitForTimeout(100); s = await state(page); }
  return s;
}
/** Stands 1.6 m from a target on the +X/−X/+Z side (in the open aisle) and looks at it. */
async function face(page: Page, p: number[], off: [number, number], id: string): Promise<State> {
  await page.evaluate(`${API}.standAt(${p[0] + off[0]}, ${p[2] + off[1]}, ${p[0]}, ${p[1]}, ${p[2]})`);
  return until(page, (s) => s.focused === id);
}
async function press(page: Page) { await page.keyboard.press('KeyE'); await page.waitForTimeout(250); }

test('outpost facilities: farm plant/water/harvest, shields + power, comms report + supply drop', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./?shot=spawn&e2e');
  await page.waitForFunction(() => { const s = (window as unknown as { __cf?: { ready?: boolean; pending?: number } }).__cf; return !!s?.ready && s.pending === 0; }, undefined, { timeout: 150_000 });

  let s = await state(page);
  expect(s.base.beds[0].stage).toBe('growing'); // the first crew left one bed growing
  // Take seed packs from the locker (new-game stock) into the suit.
  await page.evaluate(`${API}.giveItem?.('seed_pack', 2)`);
  s = await state(page);
  const seeds = count(s.inventory, 'seed_pack');

  // Plant bed 2 (index 1): beds at x 21.3 face the aisle on +X.
  s = await face(page, s.base.bedPos[1], [1.4, 0], 'bed:1');
  expect(s.focused).toBe('bed:1');
  if (seeds > 0) {
    await press(page);
    s = await state(page);
    expect(s.base.beds[1].stage).toBe('growing');
    expect(count(s.inventory, 'seed_pack')).toBe(seeds - 1);
  }

  // Bed 1 grows; let it dry a little, water it, fast-forward to harvest.
  await page.evaluate(`${API}.baseTick(30)`);
  s = await face(page, s.base.bedPos[0], [1.4, 0], 'bed:0');
  await press(page);
  expect((await state(page)).base.beds[0].water).toBeGreaterThan(0.95);
  await page.evaluate(`${API}.baseTick(80)`);
  s = await until(page, (st) => st.base.beds[0].stage === 'ready');
  expect(s.base.beds[0].stage).toBe('ready');
  await page.screenshot({ path: 'tools/out/farm_ready.png' });
  const rations = count(s.inventory, 'ration');
  await press(page);
  s = await state(page);
  expect(s.base.beds[0].stage).toBe('empty');
  expect(count(s.inventory, 'ration') + count(s.locker, 'ration')).toBeGreaterThan(rations);

  // Shields: on → spins up, dose drops, demand rises.
  const before = s.base.power.demand;
  s = await face(page, s.base.shieldPos, [-1.5, 0], 'shields');
  expect(s.focused).toBe('shields');
  await press(page);
  await page.evaluate(`${API}.baseTick(5)`);
  s = await state(page);
  expect(s.base.shields).toBe(true);
  expect(s.base.shieldLevel).toBe(1);
  expect(s.base.dose).toBeLessThan(0.4);
  expect(s.base.power.demand).toBeGreaterThan(before);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tools/out/shields_on.png' });

  // Comms: no new findings yet → spend the starting credit on a supply drop; it lands in the locker.
  s = await face(page, s.base.commsPos, [1.5, 0], 'comms');
  expect(s.focused).toBe('comms');
  await page.screenshot({ path: 'tools/out/comms.png' });
  const o2 = count(s.locker, 'o2_canister');
  await press(page);
  s = await state(page);
  expect(s.base.dropEta).toBeGreaterThan(0);
  expect(s.base.credits).toBe(0);
  await page.evaluate(`${API}.baseTick(50)`);
  s = await state(page);
  expect(s.base.dropEta).toBe(-1);
  expect(count(s.locker, 'o2_canister')).toBe(o2 + 2);

  expect(errors).toEqual([]);
});
