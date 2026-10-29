import { expect, test, type Page } from '@playwright/test';
import { DIRECT, awaitGreeting, send, skipSplash } from './fixtures';

// Big jobs (spec 2026-10-19): North Gate at the Intake (e2e/serve.ts), in a playthrough of its own as Cass, who starts
// Trusted in Karasu (NIX_TEST_REP), so the other specs' player keeps a Nobody's boards. The playthrough it found is put back.
// No dice: the ferry's lean and the Tilt's drink give clues without a check, and NIX_TEST_GIG=clean resolves the route.
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

async function room(page: Page): Promise<{ greetingId: string; errors: string[] }> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await enter(page);
  if ((await scene(page).textContent()) !== 'LOWLIGHT INTAKE') {
    await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
    await expect(scene(page)).toHaveText('LOWLIGHT INTAKE', { timeout: 10_000 });
    // A dev move sends no quest state: load the room again so the board arrives.
    await enter(page);
  }
  const greetingId = (await page.locator('.msg.agent.s-ok').last().getAttribute('data-id'))!;
  return { greetingId, errors };
}

/** Travel by the map's GO, then wait for the room and the scene the job left there. */
async function travel(page: Page, place: string, room: string, story: string): Promise<void> {
  await send(page, { type: 'travel', place });
  await expect(scene(page)).toHaveText(room, { timeout: 15_000 });
  await expect(page.locator('.qc-story')).toContainText(story, { timeout: 15_000 });
}

test('a big job: the ask, legwork at two places, the read, a route into a gig, and the debrief', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  const replies = page.locator('.msg.agent.s-ok');
  const before = await replies.count();

  // The board: a big job row, Trusted, with its pay and stake.
  await page.locator('.hud-quest').click();
  const row = page.locator('.ql-row', { hasText: 'North Gate' });
  await expect(row.locator('.ql-big')).toHaveText('BIG JOB · TRUSTED · 1500–3000 SOL · +15 / −25 REP');
  await row.locator('.ql-start').click();
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  await expect(page.locator('.qc-story')).toContainText('The fixer slides a photo across the counter');

  // Taking it: legwork, the go hour, and the two marked places.
  await page.locator('.qc-card[data-choice="take"]').click();
  await expect(page.locator('.qc-section')).toHaveText('LEGWORK', { timeout: 10_000 });
  await expect(page.locator('.qc-go')).toContainText('GO 05:30');
  await expect(page.locator('.qc-marks li')).toHaveText(['The Ferry Stairs · the courier came through here', 'The Tilt · the guard drinks here']);
  await page.screenshot({ path: 'test-results/big-legwork.png' });

  // The ferry: lean on the deckhand (a false clue).
  await travel(page, 'ferry-stairs', 'THE FERRY STAIRS', 'The last ferry noses in');
  await page.locator('.qc-card[data-choice="lean"]').click();
  await expect(page.locator('.qc-section')).toHaveText('LEGWORK', { timeout: 10_000 });
  await expect(page.locator('details.qc-clues summary')).toHaveText('CLUES · 1');

  // The Tilt: buy the guard a drink.
  await travel(page, 'the-tilt', 'THE TILT', "The guard's off shift");
  await page.locator('.qc-card[data-choice="buy"]').click();
  await expect(page.locator('details.qc-clues summary')).toHaveText('CLUES · 2', { timeout: 10_000 });

  // READ IT NOW: the board, from the words found and the wrong ones.
  await page.locator('.qc-card[data-choice="!read-now"]').click();
  await expect(page.locator('.rb')).toBeVisible({ timeout: 10_000 });
  const chips = page.locator('.rb-chip');
  // The bank: the two clues' words and the read's wrong words, shuffled.
  expect((await chips.allTextContents()).sort()).toEqual(['SDG pay', 'the dock', 'the guard is paid', 'the night shift', 'the river']);
  const fill = async (slot: number, word: string) => {
    await page.locator('.rb-slot').nth(slot).click();
    await chips.getByText(word, { exact: true }).click();
  };
  await fill(0, 'SDG pay');
  await fill(1, 'the river');
  await fill(2, 'the guard is paid');
  await page.screenshot({ path: 'test-results/big-read.png' });
  const afterRead = await replies.count();
  await page.locator('.rb-read').click();
  // She answers the read; the approach shows its routes.
  await expect(replies).toHaveCount(afterRead + 1, { timeout: 10_000 });
  await expect(page.locator('.qc-section')).toHaveText('THE APPROACH', { timeout: 10_000 });
  const wire = page.locator('.qc-card[data-choice="wire"]');
  await expect(wire.locator('.qc-gig')).toHaveText('HACK · MEDIUM');
  // The papers route needs a right first blank: not shown.
  await expect(page.locator('.qc-card[data-choice="paper"]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/big-routes.png' });

  // The wire route: its gig resolves clean (NIX_TEST_GIG), then the debrief and her closing line.
  const afterRoutes = await replies.count();
  await wire.click();
  await expect(page.locator('.db .db-tier')).toHaveText('CLEAN', { timeout: 10_000 });
  await expect(page.locator('.db .db-read')).toHaveText('READ · WRONG');
  await expect(page.locator('.db .db-gig')).toHaveText('HACK · MEDIUM · CLEAN');
  await expect(page.locator('.db .db-clues li')).toHaveCount(2);
  await expect(replies).toHaveCount(afterRoutes + 1, { timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/big-debrief.png' });
  expect(errors).toEqual([]);

  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(replies).toHaveCount(before, { timeout: 10_000 });
});
