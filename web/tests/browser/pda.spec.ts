import { expect, test } from '@playwright/test';

test('PDA: animated open/close, every tab works, live environment readings and rover mast feed', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/pointer ?lock/i.test(m.text()))) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./?shot=spawn&e2e');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __cf?: { ready?: boolean; pending?: number } }).__cf;
    return !!s?.ready && s.pending === 0;
  }, undefined, { timeout: 150_000 });

  await page.keyboard.press('Tab');
  const overlay = page.locator('.overlay:has(.pda)');
  await expect(overlay).toHaveClass(/pda-opening/);
  await expect(page.locator('.pda')).toBeVisible();

  // Every navigation button switches to real content.
  const tabs: Array<[string, string]> = [['Missions', '.pda .list'], ['Logs', '.pda .list'], ['Inventory', '.pda .inv .grid'], ['Environment', '.pda table.env'], ['Rover R-1', '.pda canvas.feed'], ['Map', '.pda .main canvas']];
  for (const [label, sel] of tabs) {
    await page.locator('.pda nav button').filter({ hasText: new RegExp(`(^|\\s)${label}$`) }).click(); // exact: 'Logs' ≠ 'Audio logs'
    await expect(page.locator(sel).first()).toBeVisible();
  }

  // Environment: real reference values are labelled separately from simulated ones.
  await page.locator('.pda nav button', { hasText: 'Environment' }).click();
  await expect(page.locator('.pda .tag.nasa')).toHaveCount(4);
  expect(await page.locator('.pda .tag.sim').count()).toBeGreaterThanOrEqual(5);
  await expect(page.locator('.pda table.env')).toContainText('95.1%');
  await expect(page.locator('.pda table.env')).toContainText('mSv/day');
  await page.screenshot({ path: 'tools/out/playwright/pda-environment.png' });

  // Rover tab: telemetry + a live mast-camera image (not a blank canvas), refreshed while open.
  await page.locator('.pda nav button', { hasText: 'Rover R-1' }).click();
  await expect(page.locator('.pda table.env')).toContainText('Battery');
  await page.waitForTimeout(1200);
  const stats = await page.evaluate(() => {
    const c = document.querySelector('.pda canvas.feed') as HTMLCanvasElement;
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, min = 255, max = 0;
    for (let i = 0; i < d.length; i += 16) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += v; min = Math.min(min, v); max = Math.max(max, v); }
    return { mean: sum / (d.length / 16), range: max - min };
  });
  expect(stats.mean).toBeGreaterThan(25);
  expect(stats.range).toBeGreaterThan(40); // an actual image, not a flat fill
  await page.screenshot({ path: 'tools/out/playwright/pda-rover.png' });

  await page.keyboard.press('Tab');
  await expect(overlay).toHaveClass(/pda-closing|hidden/);
  await expect(page.locator('.pda')).toBeHidden({ timeout: 2000 });
  expect(errors).toEqual([]);
});
