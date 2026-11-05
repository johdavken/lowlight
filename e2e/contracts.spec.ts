import { expect, test, type Page } from '@playwright/test';
import { awaitGreeting, DIRECT, send, skipSplash } from './fixtures';

// Contracts (spec 2026-11-04): The Test Contract at the Intake (e2e/serve.ts), in a playthrough of its own as Cass, whose
// Trusted rep offers it (NIX_TEST_REP). The playthrough it found is put back.
test.describe.configure({ mode: 'serial' });

let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  expect((await request.post('/api/playthroughs', { data: { player: 'cass', startContact: DIRECT.id } })).status()).toBe(200);
});
test.afterEach(async ({ request }) => {
  if (before) expect((await request.post(`/api/playthroughs/${before}/activate`)).status()).toBe(200);
});

const scene = (page: Page) => page.locator('.hud-left .scene');

async function enter(page: Page): Promise<void> {
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await expect(scene(page)).not.toHaveText('——');
}

test('RUMORS: the rumor, START, the offer, then its pieces wait on ELSEWHERE', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await enter(page);
  if ((await scene(page).textContent()) !== 'LOWLIGHT INTAKE') {
    await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
    await expect(scene(page)).toHaveText('LOWLIGHT INTAKE', { timeout: 10_000 });
    await enter(page);
  }
  await page.keyboard.press('Alt+KeyQ');
  await page.locator('.ql-tab[data-tab="rumors"]').click();
  await expect(page.locator('.ql-file .ql-pitch')).toHaveText('Mother Rot has been asking after you.');
  await page.screenshot({ path: 'test-results/contract-rumor.png' });
  await page.locator('.ql-file .ql-goto').click();
  const take = page.locator('.qc-card[data-choice="take"], .tb-card[data-choice="take"]').first();
  await expect(take).toBeVisible({ timeout: 10_000 });
  await take.click();
  await expect(page.locator('.qc-card:visible, .tb-card:visible')).toHaveCount(0, { timeout: 15_000 });
  await page.keyboard.press('Alt+KeyQ');
  await page.locator('.ql-tab[data-tab="away"]').click();
  await expect(page.locator('.ql-piece')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/contract-waiting.png' });
  await page.keyboard.press('Escape');
  // CREW → ERRANDS: all three pieces with their lines; sending one leaves the others listed.
  await page.keyboard.press('Alt+KeyK');
  await page.locator('.cr-tab[data-tab="hire"]').click();
  await page.locator('.cr-card:not(.locked)').first().locator('.cr-btn', { hasText: 'HIRE' }).click();
  await page.locator('.cr-tab[data-tab="assign"]').click();
  await expect(page.locator('.cr-grp.hot')).toHaveText('THE TEST CONTRACT · 3 NIGHTS LEFT');
  await expect(page.locator('.cr-errand', { hasText: 'The boat' })).toContainText('MUSCLE');
  await expect(page.locator('.cr-brief h2')).toHaveText('THE BOAT');
  await expect(page.locator('.cr-blurb')).toContainText('Her skiff');
  await expect(page.locator('.cr-meta')).toContainText('SUITS MUSCLE');
  await page.locator('.cr-send').click();
  await expect(page.locator('.cr-errand', { hasText: 'The boat' })).toContainText('OUT ·');
  await expect(page.locator('.cr-errand', { hasText: 'The roof' })).toContainText('WAITS · ONE A NIGHT');
  await expect(page.locator('.cr-recall')).toBeVisible();
  expect(errors).toEqual([]);
});
