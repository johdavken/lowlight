import { expect, test } from '@playwright/test';
import { awaitGreeting, DIRECT, goIn, skipSplash, startQuest } from './fixtures';

// Her reply over the line (2026-11-11): on a comms beat she rides along on, her answer to a pick reads in the JOB column
// under the beat, not in the box; the next beat keeps it at its head. An Ember playthrough of its own: the fixture job is
// for: ember, so no other spec meets it.
let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  expect((await request.post('/api/playthroughs', { data: { player: 'ember', startContact: DIRECT.id } })).status()).toBe(200);
});
test.afterEach(async ({ request }) => {
  if (before) await expect.poll(async () => (await request.post(`/api/playthroughs/${before}/activate`)).status(), { timeout: 15_000 }).toBe(200);
});

test('a pick on a comms beat: her answer decodes in the JOB column, not the box, and heads the next beat', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=ember`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Line Test');
  await goIn(page);

  // The yard: the written line in CRT, and her line as you go in under it, not in the box.
  const body = page.locator('.jc-body');
  const shownInBox = page.locator('#feed .msg:not(.hidden-collapsed)');
  await expect(body.locator('.jc-line').first()).toContainText('"Two men by the gate,"');
  await expect(body.locator('.jc-reply')).toHaveCount(1, { timeout: 20_000 });
  await expect(body.locator('.jc-reply')).toContainText(/GLM reply #\d+/);
  await expect(shownInBox).toHaveCount(0);
  await page.locator('.tb-card[data-choice="left"]').click();

  // Her answer: in the column (decoded to the fake model's reply), hidden in the box.
  const reply = body.locator('.jc-reply');
  await expect(reply).toHaveAttribute('data-who', /\(ON COMMS\)$/);
  await expect(reply).toContainText(/GLM reply #\d+/, { timeout: 20_000 });
  await expect(shownInBox).toHaveCount(0);

  // The next beat: her line first, then the hut.
  await expect(body).toContainText('The hut, one lit window.', { timeout: 20_000 });
  await expect(body.locator(':scope > :first-child')).toHaveClass(/jc-reply/);

  // Your typed answer, and hers, under the beat.
  await page.locator('#input textarea').fill('Who is he?');
  await page.keyboard.press('Enter');
  await expect(body.locator('.jc-you')).toContainText('Who is he?');
  await expect(body.locator('.jc-reply')).toHaveCount(2, { timeout: 20_000 });
  await expect(body.locator(':scope > :last-child')).toContainText(/GLM reply #\d+/);
  await expect(shownInBox).toHaveCount(0);
  await page.screenshot({ path: 'test-results/job-line.png' });

  // The next move clears it, and her last line doesn't come back in the box while the next one is on its way (playtest).
  const earlier = await body.locator('.jc-reply').allTextContents();
  await page.locator('.tb-card[data-choice="grab"]').click();
  for (let i = 0; i < 6; i++) {
    expect(await shownInBox.count()).toBe(0);
    await page.waitForTimeout(150);
  }
  await expect.poll(async () => (await body.locator('.jc-reply').allTextContents()).some((t) => earlier.includes(t))).toBe(false);
  expect(errors).toEqual([]);
});
