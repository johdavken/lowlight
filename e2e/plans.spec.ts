import { expect, test, type Page } from '@playwright/test';
import type { AroundEntry, ContactEntry } from '../shared/types';
import { DIRECT, awaitGreeting, send, skipSplash } from './fixtures';

// Her plans (spec 2026-10-21 §5): a line about her going home makes the fake residual record a going plan; the card
// comes up. LET HER GO: her goodbye, then /solo with her row showing where she went. GO WITH HER: the card goes and
// you walk to her place together. Each in a playthrough of its own; the one it found is put back.
test.describe.configure({ mode: 'serial' });

let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  expect((await request.post('/api/playthroughs', { data: { player: 'cass', startContact: DIRECT.id } })).status()).toBe(200);
});
test.afterEach(async ({ request }) => {
  if (before) expect((await request.post(`/api/playthroughs/${before}/activate`)).status()).toBe(200);
});

/** Her room as the active playthrough's databases have it. */
async function herScene(page: Page): Promise<string | undefined> {
  const list = (await (await page.request.get('/api/playthroughs/active/contacts')).json()) as ContactEntry[];
  return list.find((c) => c.id === DIRECT.id)?.sceneId;
}

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

test('GO WITH HER: the card goes and you walk to her place together', async ({ page }) => {
  const card = await cardUp(page);
  const from = await herScene(page);
  await card.locator('.pcd-stay').click();
  await expect(card).toHaveCount(0);
  await expect.poll(() => herScene(page), { timeout: 15_000 }).not.toBe(from);
  await page.reload();
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('.plan-card')).toHaveCount(0);
  expect(page.url()).toContain(`/room/${DIRECT.id}`);
});

test('a named person turns up: her row has the meeting, and she is there for the hour', async ({ page, request }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await send(page, { type: 'user_message', text: 'Meet Ember and me there at three.', mode: 'rp' });
  const ember = async () => ((await (await request.get('/api/playthroughs/active/around')).json()) as AroundEntry[]).find((e) => e.contactId === 'ember');
  await expect.poll(async () => (await ember())?.planTail ?? null, { timeout: 15_000 }).toMatch(/ 03:00$/);
  const before = (await ember())!.sceneId;
  expect((await request.post('/api/playthroughs/active/wait', { data: { until: '03:10' } })).status()).toBe(200);
  const there = (await ember())!;
  expect(there.sceneId).not.toBe(before);
  expect(there.planTail).toBe(`${there.placeName} 03:00`);
});
