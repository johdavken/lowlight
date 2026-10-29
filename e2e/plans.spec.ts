import { expect, test, type Page } from '@playwright/test';
import { DIRECT, awaitGreeting, send, skipSplash } from './fixtures';

// Her plans (spec 2026-10-21 §5): a line about her going home makes the fake scribe record a going plan; the card
// comes up. LET HER GO: her goodbye, then /solo with her row showing where she went. GO WITH HER: the card goes and
// the scene stays. Each in a playthrough of its own; the one it found is put back.
test.describe.configure({ mode: 'serial' });

let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  expect((await request.post('/api/playthroughs', { data: { player: 'cass', startContact: DIRECT.id } })).status()).toBe(200);
});
test.afterEach(async ({ request }) => {
  if (before) expect((await request.post(`/api/playthroughs/${before}/activate`)).status()).toBe(200);
});

async function cardUp(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await send(page, { type: 'user_message', text: 'Fine. Go home and shower first.', mode: 'rp' });
  const card = page.locator('.plan-card');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.locator('.pcd-title')).toHaveText(/^NIX IS HEADING .+/);
  return card;
}

test('LET HER GO: her goodbye, then on your own, her row says where she went', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const card = await cardUp(page);
  const going = ((await card.locator('.pcd-title').textContent()) ?? '').replace(/^NIX IS HEADING /, '');
  await card.locator('.pcd-go').click();
  await page.waitForURL('**/solo', { timeout: 15_000 });
  const row = page.locator(`.solo-row[data-id="${DIRECT.id}"]`);
  await expect(row).toBeVisible();
  expect(((await row.textContent()) ?? '').toUpperCase()).toContain(going);
  expect(errors).toEqual([]);
});

test('GO WITH HER: the card goes and the scene stays', async ({ page }) => {
  const card = await cardUp(page);
  await card.locator('.pcd-stay').click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('.plan-card')).toHaveCount(0);
  expect(page.url()).toContain(`/room/${DIRECT.id}`);
});
