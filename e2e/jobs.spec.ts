import { expect, test, type Page } from '@playwright/test';
import { firstPlaythrough, nixAt, send, skipSplash } from './fixtures';

// Small jobs (spec 2026-10-19): Back Door at the Intake (e2e/serve.ts), played without dice — the roll list belongs to missions.spec.
test.describe.configure({ mode: 'serial' });

async function room(page: Page): Promise<{ greetingId: string; errors: string[] }> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  // As Hicks in the worker's first playthrough (played by the default player, who holds no deck), at the Intake's board.
  await firstPlaythrough(page.request);
  await nixAt(page, 'lowlight-intake', 'LOWLIGHT INTAKE');
  const greetingId = (await page.locator('.msg.agent.s-ok').last().getAttribute('data-id'))!;
  return { greetingId, errors };
}

test("a board shows tonight's jobs", async ({ page }) => {
  await room(page);
  await page.locator('.hud-quest').click();
  const row = page.locator('.ql-row', { hasText: 'Back Door' });
  await expect(row.locator('.ql-mission')).toHaveText('MISSION · TIER 1 · 350–450 SOL');
  // The fixer at this board: a burner you can buy.
  await expect(page.locator('.ql-fixer .ql-item', { hasText: 'Burner' }).locator('.ql-buy')).toBeEnabled();
});

test('a job with a drawn complication, a red check and a crack ends in a debrief', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  const replies = page.locator('.msg.agent.s-ok');
  const before = await replies.count();
  await page.locator('.hud-quest').click();
  await page.locator('.ql-row', { hasText: 'Back Door' }).locator('.ql-start').click();
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });

  // The door as drawn (either version), its strip, and the talk card marked ONE SHOT.
  await expect(page.locator('.qc-story')).toContainText('A steel door behind the stall.');
  await expect(page.locator('.qc-strip .qc-pay')).toHaveText('PAY 350–450 SOL');
  await expect(page.locator('.qc-card[data-choice="talk"] .qc-red')).toHaveText('ONE SHOT');
  await page.screenshot({ path: 'test-results/jobs-cards.png' });

  // Waiting out the shift costs no roll; the ledger is a crack.
  await page.locator('.qc-card[data-choice="wait"]').click();
  const grab = page.locator('.qc-card[data-choice="grab"]');
  await expect(grab.locator('.qc-crack')).toContainText('CRACK · 6 LETTERS', { timeout: 10_000 });
  await grab.click();
  await expect(page.locator('.ct-window')).toBeVisible();
  await expect(page.locator('.ct-dump .ct-row')).toHaveCount(32);
  // A corporate terminal (deck skins spec §3): the CORP look, the deck it linked (none here), the job's ALARM.
  await expect(page.locator('.ct-window')).toHaveClass(/ct-skin-corp/);
  await expect(page.locator('.ct-linked')).toHaveText('LINKED · NO DECK');
  await expect(page.locator('.ct-alarm i')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/jobs-terminal.png' });
  // LEAVE walks away: a lockout, ALARM +1, and the part outcome.
  await page.locator('.ct-leave').click();
  await expect(page.locator('.ct-window')).toHaveCount(0);

  // The debrief, then her closing line.
  await expect(page.locator('.db .db-tier')).toHaveText('MESSY', { timeout: 10_000 });
  await expect(page.locator('.db .db-roll')).toContainText('LOCKED OUT');
  await expect(replies).toHaveCount(before + 2, { timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/jobs-debrief.png' });
  expect(errors).toEqual([]);
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(replies).toHaveCount(before, { timeout: 10_000 });
});

test('buy a burner, blow a job, use the burner: the halved loss and the tier line show', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  const replies = page.locator('.msg.agent.s-ok');
  const before = await replies.count();
  await page.locator('.hud-quest').click();
  await page.locator('.ql-fixer .ql-item', { hasText: 'Burner' }).locator('.ql-buy').click();
  await expect.poll(async () => ((await (await page.request.get('/api/kit')).json()) as { kit: { cover: { burner: number } } }).kit.cover.burner).toBe(1);

  // The list stays open after BUY.
  await page.locator('.ql-row', { hasText: 'Back Door' }).locator('.ql-start').click();
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  // Kicking the door in blows it: the cover cards come up before any row.
  await page.locator('.qc-card[data-choice="kick"]').click();
  await expect(page.locator('.qc-card[data-choice="!burner"] .qc-line')).toHaveText('USE BURNER (−5 INSTEAD OF −10)', { timeout: 10_000 });
  await expect(page.locator('.qc-head .qc-blown')).toHaveText('BLOWN');
  await page.screenshot({ path: 'test-results/jobs-cover.png' });
  await page.locator('.qc-card[data-choice="!burner"]').click();

  await expect(page.locator('.db .db-tier')).toHaveText('BLOWN', { timeout: 10_000 });
  await expect(page.locator('.db .db-cover')).toHaveText('A BURNER TOOK HALF');
  await expect(page.locator('.db .db-rep')).toHaveText(/^REP KARASU \d+ → \d+$/);
  await expect(replies).toHaveCount(before + 2, { timeout: 10_000 });
  await expect.poll(async () => ((await (await page.request.get('/api/kit')).json()) as { kit: { cover: { burner: number } } }).kit.cover.burner).toBe(0);
  expect(errors).toEqual([]);
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(replies).toHaveCount(before, { timeout: 10_000 });
});

test('a lore word in the quest panel shows its street card on hover', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  const replies = page.locator('.msg.agent.s-ok');
  const before = await replies.count();
  await page.locator('.hud-quest').click();
  await page.locator('.ql-row', { hasText: 'Back Door' }).locator('.ql-start').click();
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  const word = page.locator('.qc-story .lore-word', { hasText: 'steel door' });
  await word.hover();
  const card = page.locator('.lore-card');
  await expect(card).toBeVisible();
  await expect(card.locator('.lore-card-title')).toHaveText('Steel Doors');
  await expect(card.locator('.lore-card-text')).toHaveText('Every stall on the Ribbon has one. Nobody asks where they came from.');
  await page.screenshot({ path: 'test-results/lore-hover.png' });
  expect(errors).toEqual([]);
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(replies).toHaveCount(before, { timeout: 10_000 });
});
