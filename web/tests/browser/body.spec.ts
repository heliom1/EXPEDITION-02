import { expect, test, type Page } from '@playwright/test';

type State = { mode: string; pos: number[]; camPos: number[]; body: { loaded: boolean; thirdPerson?: boolean; visible?: boolean; rotY?: number } };
const API = 'window.__cf.api';
const state = (page: Page) => page.evaluate(`${API}.state()`) as Promise<State>;
async function until(page: Page, pred: (s: State) => boolean, ms = 20000): Promise<State> {
  let s = await state(page);
  for (let t = 0; t < ms && !pred(s); t += 100) { await page.waitForTimeout(100); s = await state(page); }
  return s;
}

test('astronaut body: V toggles third person, body animates and faces travel, camera clears walls', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/pointer ?lock/i.test(m.text()))) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('./?shot=spawn&e2e');
  await page.waitForFunction(() => {
    const s = (window as unknown as { __cf?: { ready?: boolean; pending?: number } }).__cf;
    return !!s?.ready && s.pending === 0;
  }, undefined, { timeout: 150_000 });
  let s = await until(page, (st) => st.body.loaded);
  expect(s.body.loaded).toBe(true);
  expect(s.body.visible).toBe(false); // first person by default

  await page.keyboard.press('KeyV');
  s = await until(page, (st) => !!st.body.visible);
  expect(s.body.thirdPerson).toBe(true);
  const d = Math.hypot(s.camPos[0] - s.pos[0], s.camPos[2] - s.pos[2]);
  expect(d).toBeGreaterThan(1.2);
  expect(d).toBeLessThan(6.5);

  // Walk: the body turns to face the direction of travel.
  const A = await page.evaluate(`${API}.anchors()`) as { outpost: number[] };
  const [ox, oy, oz] = A.outpost;
  // Open ground (south of the solar array): the camera should sit at its full distance.
  await page.evaluate(`${API}.standAt(${ox + 30}, ${oz - 80}, ${ox + 60}, ${oy + 1.6}, ${oz - 80})`);
  await page.waitForTimeout(800);
  s = await state(page);
  expect(Math.hypot(s.camPos[0] - s.pos[0], s.camPos[2] - s.pos[2])).toBeGreaterThan(2.5);
  await page.screenshot({ path: 'tools/out/playwright/body-open.png' });
  await page.evaluate(`${API}.standAt(${ox + 30}, ${oz - 80}, ${ox + 60}, ${oy + 1.6}, ${oz - 80})`); // face +X
  await page.waitForTimeout(400);
  await page.evaluate(`${API}.walk(2.5)`);
  s = await state(page);
  expect(Math.abs(Math.sin(s.body.rotY!) - 1)).toBeLessThan(0.15); // rotY ≈ +90° = facing +X
  await page.screenshot({ path: 'tools/out/playwright/body-walk.png' });

  // Inside the dome the third-person camera stays inside, clear of the wall.
  await page.evaluate(`${API}.standAt(${ox}, ${oz - 6}, ${ox}, ${oy + 1.6}, ${oz + 8})`);
  await page.waitForTimeout(800);
  s = await state(page);
  expect(Math.hypot(s.camPos[0] - ox, s.camPos[2] - oz)).toBeLessThan(10);
  await page.screenshot({ path: 'tools/out/playwright/body-dome.png' });

  await page.keyboard.press('KeyV');
  s = await until(page, (st) => st.body.visible === false);
  expect(s.body.thirdPerson).toBe(false);
  expect(errors).toEqual([]);
});
