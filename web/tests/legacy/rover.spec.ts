import { expect, test, type Page } from '@playwright/test';

type Rover = { pos: number[]; yaw: number; speed: number; battery: number; condition: number; pitch: number; roll: number; occupied: boolean; cam: string; wheelsSpin: number[] };
type State = { mode: string; focused: string | null; objective: string | null; readerOpen: boolean; pos: number[]; rover: Rover | null; camPos: number[]; camFov: number };
const API = 'window.__cf.api';

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
async function key(page: Page, code: string) { await page.keyboard.press(code); await page.waitForTimeout(200); }
const dist2 = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[2] - b[2]);

test('rover R-1: diagnostic → board → drive/steer → cameras → exit → persists', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await boot(page, 'shot=spawn&e2e&save', errors);
  let A = await page.evaluate(`${API}.anchors()`) as { terminal: number[]; rover: number[]; roverBoard: number[] };
  expect(A.roverBoard).not.toBeNull();

  // Boarding is refused until the service-panel diagnostic has been run (story gate).
  let [bx, by, bz] = A.roverBoard;
  await page.evaluate(`${API}.standAt(${bx - 1.2}, ${bz}, ${bx}, ${by}, ${bz})`);
  let s = await until(page, (st) => st.focused === 'roverBoard');
  expect(s.focused).toBe('roverBoard');
  await key(page, 'KeyE');
  expect((await state(page)).mode).toBe('playing');

  // Check in, then run the diagnostic (objective "rover").
  const [tx, ty, tz] = A.terminal;
  await page.evaluate(`${API}.standAt(${tx + 1.3}, ${tz - 1.5}, ${tx}, ${ty}, ${tz})`);
  await until(page, (st) => st.focused === 'terminal');
  await key(page, 'KeyE'); await until(page, (st) => st.readerOpen); await key(page, 'KeyE');
  const [rx, ry, rz] = A.rover;
  await page.evaluate(`${API}.standAt(${rx + 1.3}, ${rz}, ${rx}, ${ry}, ${rz})`);
  s = await until(page, (st) => st.focused === 'rover');
  expect(s.focused).toBe('rover');
  await key(page, 'KeyE'); await until(page, (st) => st.readerOpen); await key(page, 'KeyE');
  s = await until(page, (st) => st.objective === 'drill');
  expect(s.objective).toBe('drill');

  // Board.
  A = await page.evaluate(`${API}.anchors()`) as typeof A;
  [bx, by, bz] = A.roverBoard;
  await page.evaluate(`${API}.standAt(${bx - 1.2}, ${bz}, ${bx}, ${by}, ${bz})`);
  await until(page, (st) => st.focused === 'roverBoard');
  await key(page, 'KeyE');
  s = await until(page, (st) => st.mode === 'driving');
  expect(s.mode).toBe('driving');
  expect(s.rover!.occupied).toBe(true);
  const start = s.rover!;

  // Drive forward: the rover moves, wheels turn, battery drains, camera follows.
  await page.evaluate(`${API}.hold(['KeyW'], 4)`);
  s = await state(page);
  expect(dist2(s.rover!.pos, start.pos)).toBeGreaterThan(6);
  expect(s.rover!.wheelsSpin.some((w, i) => Math.abs(w - start.wheelsSpin[i]) > 1)).toBe(true);
  expect(s.rover!.battery).toBeLessThan(start.battery);
  expect(dist2(s.camPos, s.rover!.pos)).toBeLessThan(25);
  await page.screenshot({ path: 'tools/out/playwright/rover-chase.png' });

  // Steer while driving.
  const yaw0 = s.rover!.yaw;
  await page.evaluate(`${API}.hold(['KeyW', 'KeyD'], 2)`);
  s = await state(page);
  expect(Math.abs(s.rover!.yaw - yaw0)).toBeGreaterThan(0.3);

  // Brake to a stop.
  await page.evaluate(`${API}.hold(['Space'], 2)`);
  s = await state(page);
  expect(Math.abs(s.rover!.speed)).toBeLessThan(0.3);

  // Mast camera: first-person from the mast head, zoomable.
  await key(page, 'KeyC');
  s = await state(page);
  expect(s.rover!.cam).toBe('mast');
  expect(s.camPos[1]).toBeGreaterThan(s.rover!.pos[1] + 1.5);
  await page.screenshot({ path: 'tools/out/playwright/rover-mast.png' });
  await key(page, 'KeyC');
  expect((await state(page)).rover!.cam).toBe('chase');

  // Exit beside the rover.
  await key(page, 'KeyE');
  s = await until(page, (st) => st.mode === 'playing');
  expect(s.mode).toBe('playing');
  expect(s.rover!.occupied).toBe(false);
  expect(dist2(s.pos, s.rover!.pos)).toBeLessThan(4.5);
  expect(dist2(s.pos, s.rover!.pos)).toBeGreaterThan(1.4); // not inside the rover
  const parked = s.rover!;

  // Persistence.
  await page.evaluate(`${API}.save()`);
  await page.goto('./?shot=menu&e2e&save');
  await page.waitForFunction(() => !!(window as unknown as { __cf?: { ready?: boolean } }).__cf?.ready, undefined, { timeout: 150_000 });
  await page.locator('.menu button', { hasText: 'Continue' }).click();
  s = await until(page, (st) => st.mode === 'playing');
  expect(dist2(s.rover!.pos, parked.pos)).toBeLessThan(0.5);
  expect(Math.abs(s.rover!.battery - parked.battery)).toBeLessThan(1);
  expect(errors).toEqual([]);
});
