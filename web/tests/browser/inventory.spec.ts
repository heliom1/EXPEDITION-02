import { expect, test, type Page } from '@playwright/test';

type State = {
  mode: string; focused: string | null; records: string[]; inventory: Array<{ id: string; count: number } | null>; selected: string | null;
  locker: Array<{ id: string; count: number } | null>; storageOpen: boolean; mining: number | null; pickups: Array<{ id: string; pos: number[] }>;
  suit: { oxygen: number; power: number; health: number }; optionalDone: boolean; hotbarText: string[]; readerOpen: boolean;
};
const API = 'window.__cf.api';
const count = (slots: State['inventory'], id: string) => slots.reduce((n, s) => n + (s && s.id === id ? s.count : 0), 0);

async function boot(page: Page, query: string, errors: string[]): Promise<void> {
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/pointer ?lock/i.test(m.text()))) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`./?${query}`);
  await page.waitForFunction(() => {
    const s = (window as unknown as { __cf?: { ready?: boolean; pending?: number } }).__cf;
    return !!s?.ready && s.pending === 0;
  }, undefined, { timeout: 150_000 });
}
const state = (page: Page) => page.evaluate(`${API}.state()`) as Promise<State>;
async function until(page: Page, pred: (s: State) => boolean, ms = 8000): Promise<State> {
  let s = await state(page);
  for (let t = 0; t < ms && !pred(s); t += 100) { await page.waitForTimeout(100); s = await state(page); }
  return s;
}
async function key(page: Page, code: string) { await page.keyboard.press(code); await page.waitForTimeout(150); }

test('inventory loop: drill → collect → discovery → use item → locker → PDA → persists after reload', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'shot=spawn&e2e&save', errors);
  const A = await page.evaluate(`${API}.anchors()`) as { deposits: Array<{ id: string; mineral: string; pos: number[] }>; locker: number[] };

  // New game kit on the hotbar.
  let s = await state(page);
  expect(count(s.inventory, 'hand_drill')).toBe(1);
  expect(s.hotbarText.join(' ')).toContain('⛏');

  // Drilling needs the rock drill selected.
  const dep = A.deposits.find((d) => d.id === 'dep_out_e')!;
  const [dx, dy, dz] = dep.pos;
  await key(page, 'Digit2');
  await page.evaluate(`${API}.standAt(${dx + 2.2}, ${dz}, ${dx}, ${dy + 0.5}, ${dz})`);
  s = await until(page, (st) => st.focused === 'deposit:dep_out_e');
  expect(s.focused).toBe('deposit:dep_out_e');
  await key(page, 'KeyE');
  s = await state(page);
  expect(s.mining).toBeNull(); // scanner selected → refused
  await key(page, 'Digit1');
  expect((await state(page)).selected).toBe('hand_drill');

  // Cut three samples and collect each one.
  for (let i = 0; i < 3; i++) {
    await page.evaluate(`${API}.standAt(${dx + 2.2}, ${dz}, ${dx}, ${dy + 0.5}, ${dz})`);
    await until(page, (st) => st.focused === 'deposit:dep_out_e');
    await key(page, 'KeyE');
    s = await until(page, (st) => st.mining !== null);
    expect(s.mining).not.toBeNull();
    await page.evaluate(`${API}.fastForwardMining()`);
    s = await until(page, (st) => st.mining === null && st.pickups.length > 0);
    const pk = s.pickups[s.pickups.length - 1];
    await page.evaluate(`${API}.standAt(${pk.pos[0] + 1.4}, ${pk.pos[2]}, ${pk.pos[0]}, ${pk.pos[1]}, ${pk.pos[2]})`);
    s = await until(page, (st) => st.focused === `pickup:${pk.id}`);
    expect(s.focused).toBe(`pickup:${pk.id}`);
    await key(page, 'KeyE');
    s = await until(page, (st) => count(st.inventory, 'hematite') === i + 1);
    expect(count(s.inventory, 'hematite')).toBe(i + 1);
  }
  expect(s.records).toContain('geo_hematite'); // discovery logged once
  expect(s.records.filter((r) => r === 'geo_hematite').length).toBe(1);
  expect(s.optionalDone).toBe(true);
  expect(s.pickups.length).toBe(0);
  await page.screenshot({ path: 'tools/out/playwright/inventory-deposit.png' });

  // Use an O₂ canister from quick slot 4 (Q).
  await page.evaluate(`${API}.setSuit(50, 80, 100)`);
  await key(page, 'Digit4');
  await key(page, 'KeyQ');
  s = await state(page);
  expect(s.suit.oxygen).toBeGreaterThan(84);
  expect(count(s.inventory, 'o2_canister')).toBe(0);

  // Supply locker: deposit the samples, retrieve a canister.
  const [lx, ly, lz] = A.locker;
  await page.evaluate(`${API}.standAt(${lx + 1.6}, ${lz}, ${lx - 0.4}, ${ly}, ${lz})`); // locker doors face +X
  s = await until(page, (st) => st.focused === 'locker');
  expect(s.focused).toBe('locker');
  await key(page, 'KeyE');
  s = await until(page, (st) => st.storageOpen);
  expect(s.mode).toBe('storage');
  expect(await page.evaluate(`${API}.storageClick('suit', 'hematite')`)).toBe(true);
  expect(await page.evaluate(`${API}.storageClick('locker', 'o2_canister')`)).toBe(true);
  s = await state(page);
  expect(count(s.locker, 'hematite')).toBe(3);
  expect(count(s.inventory, 'hematite')).toBe(0);
  expect(count(s.inventory, 'o2_canister')).toBe(3); // whole stack of 3 moved back to the suit
  await page.screenshot({ path: 'tools/out/playwright/inventory-locker.png' });
  await page.evaluate(() => (document.querySelector('.overlay:not(.hidden) .store') as HTMLElement | null)?.parentElement?.style.setProperty('opacity', '0'));
  await page.waitForTimeout(800); // doors finish swinging open
  await page.screenshot({ path: 'tools/out/playwright/inventory-locker-open.png' });
  await page.evaluate(() => (document.querySelector('.overlay:not(.hidden) .store') as HTMLElement | null)?.parentElement?.style.removeProperty('opacity'));
  await key(page, 'KeyE');
  s = await until(page, (st) => !st.storageOpen);
  expect(s.mode).toBe('playing');

  // PDA inventory tab shows the suit's items.
  await key(page, 'Tab');
  await page.locator('.pda nav button', { hasText: 'Inventory' }).click();
  await expect(page.locator('.pda .inv .cell[data-item="hand_drill"]')).toBeVisible();
  await page.locator('.pda .inv .cell[data-item="o2_canister"]').hover();
  await expect(page.locator('.pda .inv .desc')).toContainText('Restores 35% oxygen');
  await page.screenshot({ path: 'tools/out/playwright/inventory-pda.png' });
  await key(page, 'Tab');

  // Save → reload → Continue restores inventory, locker, deposit yield and discoveries.
  await page.evaluate(`${API}.save()`);
  await page.goto('./?shot=menu&e2e&save');
  await page.waitForFunction(() => !!(window as unknown as { __cf?: { ready?: boolean } }).__cf?.ready, undefined, { timeout: 150_000 });
  await page.locator('.menu button', { hasText: 'Continue' }).click();
  s = await until(page, (st) => st.mode === 'playing');
  expect(count(s.inventory, 'o2_canister')).toBe(3);
  expect(count(s.locker, 'hematite')).toBe(3);
  expect(s.records).toContain('geo_hematite');
  expect(s.optionalDone).toBe(true);
  const anchors = await page.evaluate(`${API}.anchors()`) as typeof A;
  expect(anchors.deposits.length).toBe(A.deposits.length);
  expect(errors).toEqual([]);
});
