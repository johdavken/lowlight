import { expect, test, type Page } from '@playwright/test';
import { DIRECT, awaitGreeting, send, skipSplash } from './fixtures';

// The arrangement (spec 2026-10-20): a cut-down Chair, then a job with Nix at the Tilt (e2e/serve.ts), in a playthrough of
// its own as Cass, who starts at high trust with Nix (NIX_TEST_TRUST). Cass has no sol, so the retainer goes unpaid.
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

test('the Chair strikes a deal; a job with her shows the unpaid retainer, and the next job is capped', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await enter(page);
  if ((await scene(page).textContent()) !== 'THE TILT') {
    await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'the-tilt', transition: 'fade' } });
    await expect(scene(page)).toHaveText('THE TILT', { timeout: 10_000 });
    await enter(page);
  }
  const replies = page.locator('.msg.agent.s-ok');
  const greetingId = (await replies.last().getAttribute('data-id'))!;
  const start = await replies.count();

  // The Chair: name it.
  await page.locator('.hud-quest').click();
  await page.locator('.ql-row', { hasText: 'Chair Test' }).locator('.ql-start').click();
  await page.locator('.qc-card[data-choice="deal"]').click();
  await expect(page.locator('.qc-story')).toContainText('She writes it in the ledger.', { timeout: 10_000 });
  // Her line on starting the Chair, then on the deal.
  await expect(replies).toHaveCount(start + 2, { timeout: 10_000 });
  const afterDeal = start + 2;

  // A job with her: no rolls (wait, then skim to CLEAN). Cass has no sol: the retainer goes unpaid.
  await page.locator('.hud-quest').click();
  await page.locator('.ql-row', { hasText: 'Chair Job' }).first().locator('.ql-start').click();
  await expect(replies).toHaveCount(afterDeal + 1, { timeout: 10_000 });
  await page.locator('.qc-card[data-choice="wait"]').click();
  await page.locator('.qc-card[data-choice="skim"]').click();
  await expect(page.locator('.db .db-tier')).toHaveText('CLEAN', { timeout: 10_000 });
  await expect(page.locator('.db .db-unpaid')).toHaveText("NIX WASN'T PAID");
  await expect(replies).toHaveCount(afterDeal + 2, { timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/arrangement-debrief.png' });

  // One job a night: the other is greyed.
  await page.locator('.hud-quest').click();
  const other = page.locator('.ql-row.ql-capped');
  await expect(other.locator('.ql-capped-note')).toHaveText('NIX IS DONE TONIGHT');
  await expect(other.locator('.ql-start')).toBeDisabled();
  await page.screenshot({ path: 'test-results/arrangement-capped.png' });
  expect(errors).toEqual([]);

  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(replies).toHaveCount(start, { timeout: 10_000 });
});
