import { expect, test, type Page } from '@playwright/test';

/** Waits until the game reports ready and terrain streaming has finished. */
async function bootGame(page: Page, query: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/pointer ?lock/i.test(m.text()))) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`./?${query}`);
  await page.waitForFunction(() => {
    const s = (window as unknown as { __cf?: { ready?: boolean; pending?: number } }).__cf;
    return !!s?.ready && s.pending === 0;
  }, undefined, { timeout: 150_000 });
  return errors;
}

test('game boots to the main menu with the outpost model and no console errors', async ({ page }) => {
  const errors = await bootGame(page, 'shot=menu');
  await expect(page.locator('.menu')).toBeVisible();
  await expect(page.locator('.menu button', { hasText: 'New Expedition' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('player walks through the south airlock into the main dome (real controller and doors)', async ({ page }) => {
  const errors = await bootGame(page, 'shot=spawn&e2e');
  const api = 'window.__cf.api';
  const [ox, oy, oz] = await page.evaluate(`${api}.anchors().outpost`) as number[];
  await page.evaluate(`${api}.standAt(${ox + 1.6}, ${oz - 19}, ${ox + 1.6}, ${oy + 1.6}, ${oz})`);
  await page.evaluate(`${api}.walk(6.5)`);
  const s = await page.evaluate(`${api}.state()`) as { pos: number[]; grounded: boolean; doors: Record<string, string> };
  expect(Math.hypot(s.pos[0] - ox, s.pos[2] - oz)).toBeLessThan(8);
  expect(s.grounded).toBe(true);
  expect(s.doors['South airlock']).toMatch(/^(open|closing)/);
  await page.screenshot({ path: 'tools/out/playwright/dome.png' });
  expect(errors).toEqual([]);
});
