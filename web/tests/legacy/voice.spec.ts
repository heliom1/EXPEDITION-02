import { expect, test, type Page } from '@playwright/test';

test.use({
  launchOptions: {
    args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--autoplay-policy=user-gesture-required',
      ...(process.env.CF_GPU === 'high' ? ['--force_high_performance_gpu'] : [])],
  },
});

type State = { mode: string; audio: string; audioDb: number; bed: string | null; voice: string | null; subtitle: string | null; voicePlayed: string[]; readerOpen: boolean; focused: string | null; objective: string | null };
const API = 'window.__cf.api';
const state = (page: Page) => page.evaluate(`${API}.state()`) as Promise<State>;
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

test('voice: narrated arrival, radio comms on objectives, no overlap, PDA audio logs, remembered after reload', async ({ page }) => {
  test.setTimeout(360_000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);

  // New Game → the arrival cutscene is narrated, with subtitles, over the surface bed.
  await page.locator('.menu button', { hasText: 'New Game' }).click();
  const confirm = page.locator('button', { hasText: 'Start new game' });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  let s = await until(page, (st) => st.voice === 'arrival' && st.subtitle !== null); // subtitle appears when playback starts
  expect(s.voice).toBe('arrival');
  expect(s.subtitle).toContain('Mars, twenty forty-three');
  s = await until(page, (st) => st.bed === 'bed_surface', 10000);
  expect(s.bed).toBe('bed_surface');
  s = await until(page, (st) => st.audioDb > -35, 5000); // a single reading can land on the first silent buffer
  expect(s.audioDb).toBeGreaterThan(-35); // actually audible
  await page.screenshot({ path: 'tools/out/playwright/voice-arrival.png' });

  // Let the line finish, skip the rest of the cutscene, begin.
  s = await until(page, (st) => st.voice === null, 30000);
  if (s.mode === 'cutscene') { await page.keyboard.press('Space'); await page.waitForTimeout(250); await page.keyboard.press('Space'); }
  s = await until(page, (st) => st.mode === 'intro');
  await page.locator('button', { hasText: 'Begin' }).click();
  await until(page, (st) => st.mode === 'playing');

  // Check in at the terminal (inside the dome): the dome line and Mission Control's radio line both play, one at a time.
  const A = await page.evaluate(`${API}.anchors()`) as { terminal: number[] };
  const [tx, ty, tz] = A.terminal;
  await page.evaluate(`${API}.standAt(${tx + 1.3}, ${tz - 1.5}, ${tx}, ${ty}, ${tz})`);
  s = await until(page, (st) => st.focused === 'terminal');
  await page.keyboard.press('KeyE');
  await until(page, (st) => st.readerOpen);
  await page.keyboard.press('KeyE');
  s = await until(page, (st) => st.objective === 'rover');
  const seen: string[] = [];
  for (let t = 0; t < 40000; t += 200) {
    s = await state(page);
    if (s.voice && seen[seen.length - 1] !== s.voice) seen.push(s.voice); // one current line at a time by construction
    if (s.voice === 'checkin' && s.subtitle) { expect(s.subtitle).toContain('Rover R-1'); await page.screenshot({ path: 'tools/out/playwright/voice-radio.png' }); }
    if (s.voicePlayed.includes('checkin') && s.voice === null) break;
    await page.waitForTimeout(200);
  }
  expect(seen).toContain('airlock_first');
  expect(seen).toContain('checkin');
  expect(new Set(seen).size).toBe(seen.length); // each played once, sequentially

  // PDA › Audio logs lists heard lines and replays one.
  await page.keyboard.press('Tab');
  await page.locator('.pda nav button', { hasText: 'Audio logs' }).click();
  await expect(page.locator('.pda [data-log="arrival"]')).toBeVisible();
  await expect(page.locator('.pda [data-log="checkin"]')).toContainText('Rover R-1');
  await page.locator('.pda [data-log="airlock_first"]').click();
  s = await until(page, (st) => st.voice === 'airlock_first', 5000);
  expect(s.voice).toBe('airlock_first');
  await page.keyboard.press('Tab');

  // Remembered across save → reload → Continue (story lines are not replayed).
  await until(page, (st) => st.voice === null, 15000);
  await page.evaluate(`${API}.save()`);
  await boot(page);
  await page.locator('.menu button', { hasText: 'Continue' }).click();
  s = await until(page, (st) => st.mode === 'playing');
  expect(s.voicePlayed).toEqual(expect.arrayContaining(['arrival', 'airlock_first', 'checkin']));
  expect(errors).toEqual([]);
});
