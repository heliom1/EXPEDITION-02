import { expect, test, type Page } from '@playwright/test';

// Real-browser autoplay rule: audio may only start inside a user gesture (as in normal desktop Chrome).
test.use({
  launchOptions: {
    args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--autoplay-policy=user-gesture-required',
      ...(process.env.CF_GPU === 'high' ? ['--force_high_performance_gpu'] : [])],
  },
});

type State = { mode: string; audio: string };
const state = (page: Page) => page.evaluate('window.__cf.api.state()') as Promise<State>;
async function until(page: Page, pred: (s: State) => boolean, ms = 30000): Promise<State> {
  let s = await state(page);
  for (let t = 0; t < ms && !pred(s); t += 150) { await page.waitForTimeout(150); s = await state(page); }
  return s;
}
async function boot(page: Page) {
  await page.goto('./?e2e');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __cf?: { ready?: boolean; pending?: number } }).__cf;
    return !!s?.ready && s.pending === 0;
  }, undefined, { timeout: 150_000 });
}

test('audio starts from real menu clicks: New Expedition (opening), and Continue Mission after reload', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);
  expect((await state(page)).audio).toBe('none'); // nothing plays before the player interacts

  // New Expedition → Mars sidebar (Mission Control briefing) → Launch → the opening must already be audible.
  await page.locator('.menu button', { hasText: 'New Expedition' }).click();
  const confirm = page.locator('button', { hasText: 'Start new expedition' });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.locator('.mission-sidebar .launch').click();
  let s = await until(page, (st) => st.mode === 'cutscene');
  expect(s.audio).toBe('running');

  // Skip each opening segment (prologue, orbital journey, landing) with Space ×2, like a player.
  for (let i = 0; i < 6 && s.mode === 'cutscene'; i++) {
    await page.keyboard.press('Space'); await page.waitForTimeout(250); await page.keyboard.press('Space');
    s = await until(page, (st) => st.mode !== 'cutscene' || true);
    await page.waitForTimeout(1500);
    s = await state(page);
  }
  s = await until(page, (st) => st.mode === 'playing' || st.mode === 'paused');
  expect(s.audio).toBe('running');
  await page.evaluate('window.__cf.api.save()');

  // Reload → Continue (starts after an IndexedDB read — the path that used to stay silent).
  await boot(page);
  await page.locator('.menu button', { hasText: 'Continue' }).click();
  s = await until(page, (st) => st.mode === 'playing' || st.mode === 'paused');
  expect(s.audio).toBe('running');
  expect(errors).toEqual([]);
});
