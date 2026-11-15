import { expect, test } from '@playwright/test';

test('Theatre Studio loads in dev with ?studio and drives the menu camera without errors', async ({ page }) => {
  const errors: string[] = [];
  // Studio checks updates.theatrejs.com for new versions; that request is CORS-blocked on localhost and harmless.
  // The generic "Failed to load resource" line is that same blocked request.
  let updateCheckBlocked = false;
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/updates\.theatrejs\.com/.test(m.text())) { updateCheckBlocked = true; return; }
    if (updateCheckBlocked && /Failed to load resource: net::ERR_FAILED/.test(m.text())) return;
    errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./?shot=menu&studio');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __cf?: { ready?: boolean; pending?: number; studio?: boolean } }).__cf;
    return !!s?.ready && s.pending === 0;
  }, undefined, { timeout: 150_000 });
  expect(await page.evaluate(() => (window as unknown as { __cf: { studio: boolean } }).__cf.studio)).toBe(true);
  // Studio mounts its UI in a dedicated root element.
  await expect(page.locator('#theatrejs-studio-root')).toBeAttached();
  await page.screenshot({ path: 'tools/out/playwright/theatre-studio.png' });
  expect(errors).toEqual([]);
});
