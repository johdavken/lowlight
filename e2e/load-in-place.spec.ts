import { expect, test } from '@playwright/test';
import type { PlaythroughInfo } from '../shared/types';
import { DIRECT, activeId, awaitGreeting, dialIn, pickTitle, say, skipIntro, skipSplash, toTitle } from './fixtures';

// The whole run shares one server: put back the playthrough that was active.
let before: string | null = null;
test.beforeEach(async ({ page, request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  await skipIntro(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
});
test.afterEach(async ({ request }) => {
  if (before) expect((await request.post(`/api/playthroughs/${before}/activate`)).status()).toBe(200);
});

test('B on a save branches a named new game; the original stays as it was', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await dialIn(page, DIRECT.id);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const original = await activeId(page);
  await say(page, 'KEPT-LINE');
  const saved = await page.request.post(`/api/playthroughs/${original}/saves`, { data: { name: 'fork point' } });
  expect(saved.status()).toBe(200);
  const save = (await saved.json()) as { id: string };
  await say(page, 'ONLY-IN-ORIGINAL');

  await toTitle(page);
  await pickTitle(page, 'load');
  const load = page.locator('.load-screen');
  await expect(load.locator(`.pt.on[data-id="${original}"]`)).toBeVisible();
  const strip = load.locator(`.ss[data-id="${save.id}"]`);
  for (let i = 0; i < 25 && !(await strip.evaluate((n) => n.classList.contains('on'))); i++) await page.keyboard.press('ArrowDown');
  await expect(strip).toHaveClass(/\bon\b/);

  await page.keyboard.press('b');
  const field = page.locator('.save-card .sc-field');
  await expect(page.locator('.save-card .sc-title')).toHaveText('BRANCH');
  await expect(field).toHaveValue(/ — branch \d+$/);
  await field.fill('Side road e2e');
  await field.press('Enter');

  // A new game, named, active, as of the save.
  await page.waitForURL(`**/room/${DIRECT.id}*`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('#feed')).toContainText('KEPT-LINE', { timeout: 10_000 });
  await expect(page.locator('#feed')).not.toContainText('ONLY-IN-ORIGINAL');
  const branch = await activeId(page);
  expect(branch).not.toBe(original);
  const pts = ((await (await page.request.get('/api/playthroughs')).json()) as { playthroughs: PlaythroughInfo[] }).playthroughs;
  expect(pts.find((p) => p.id === branch)).toMatchObject({ name: 'Side road e2e', forkedFrom: { playthrough: original, save: save.id } });

  // The original still ends on its later line (switching to it reloads the open room into it).
  expect((await page.request.post(`/api/playthroughs/${original}/activate`)).status()).toBe(200);
  await expect(page.locator('#feed')).toContainText('ONLY-IN-ORIGINAL', { timeout: 10_000 });

  expect(errors).toEqual([]);
});
