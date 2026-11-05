import { expect, test, type Page } from '@playwright/test';
import { firstPlaythrough, settleCostStep, goIn, nixAt, questRow, questTab, send, skipSplash, startQuest } from './fixtures';

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
  const row = questRow(page, 'Back Door');
  await expect(row.locator('.ql-mission')).toHaveText('MISSION · TIER 1 · 350–450 SOL');
  // The fixer at this board: a burner you can buy.
  await questTab(page, 'fixer');
  await expect(page.locator('.ql-fixer .ql-item', { hasText: 'Burner' }).locator('.ql-buy')).toBeEnabled();
});

test('a job with a drawn complication, a red check and a crack ends in a debrief', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  const replies = page.locator('.msg.agent.s-ok');
  const before = await replies.count();
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Back Door');
  await goIn(page);
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });

  // The door as drawn (either version), its strip, and the talk card marked ONE SHOT.
  await expect(page.locator('.tb-prose')).toContainText('A steel door behind the stall.');
  await expect(page.locator('.tb-strip .tb-pay')).toHaveText('PAY 350–450 SOL');
  await expect(page.locator('.tb-card[data-choice="talk"] .tb-flag.red')).toHaveText('ONE SHOT');
  await page.screenshot({ path: 'test-results/jobs-cards.png' });

  // Waiting out the shift costs no roll; the ledger is a crack.
  await page.locator('.tb-card[data-choice="wait"]').click();
  const grab = page.locator('.tb-card[data-choice="grab"]');
  await expect(grab.locator('.tb-flag')).toContainText('CRACK · 6 LETTERS', { timeout: 10_000 });
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
  await expect(page.locator('.db-roll')).toContainText('LOCKED OUT');
  // The ALARM it left with became HEAT (tier template spec §2).
  await expect(page.locator('.db .db-heat')).toHaveText(/^HEAT [A-Z ]+ \+[1-9]/);
  await expect(replies).toHaveCount(before + 2, { timeout: 10_000 });
  await page.waitForTimeout(800);
  // The line's keys step out for the report: its rolls run down where they stand.
  await expect(page.locator('.line-keys')).toBeHidden();
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
  await questTab(page, 'fixer');
  await page.locator('.ql-fixer .ql-item', { hasText: 'Burner' }).locator('.ql-buy').click();
  await expect.poll(async () => ((await (await page.request.get('/api/kit')).json()) as { kit: { cover: { burner: number } } }).kit.cover.burner).toBe(1);

  // The list stays open after BUY.
  await startQuest(page, 'Back Door');
  await goIn(page);
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  // Kicking the door in blows it: the cover cards come up before any row.
  await page.locator('.tb-card[data-choice="kick"]').click();
  await expect(page.locator('.tb-card[data-choice="!burner"] .tb-line')).toHaveText('USE BURNER (−5 INSTEAD OF −10)', { timeout: 10_000 });
  await expect(page.locator('.tb-head .tb-flag.red')).toHaveText('BLOWN');
  await page.screenshot({ path: 'test-results/jobs-cover.png' });
  await page.locator('.tb-card[data-choice="!burner"]').click();

  await expect(page.locator('.db .db-tier')).toHaveText('BLOWN', { timeout: 10_000 });
  await expect(page.locator('.db .db-cover')).toHaveText('A BURNER TOOK HALF');
  await expect(page.locator('.db .db-rep')).toHaveText(/^REP KARASU \d+ → \d+$/);
  await expect(replies).toHaveCount(before + 2, { timeout: 10_000 });
  await expect.poll(async () => ((await (await page.request.get('/api/kit')).json()) as { kit: { cover: { burner: number } } }).kit.cover.burner).toBe(0);
  expect(errors).toEqual([]);
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(replies).toHaveCount(before, { timeout: 10_000 });
});

test('a lore word in the JOB column shows its street card on hover', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  const replies = page.locator('.msg.agent.s-ok');
  const before = await replies.count();
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Back Door');
  await goIn(page);
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  const word = page.locator('.jc-body .lore-word', { hasText: 'steel door' });
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

test('press on twice: the pot shows, the second push loses it, the debrief shows PRESSED rows and halved pay', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await firstPlaythrough(page.request);
  // Push Test sits alone on Second Socket's board (e2e/serve.ts), with no dice.
  await nixAt(page, 'second-socket', 'SECOND SOCKET');
  const replies = page.locator('.msg.agent.s-ok');
  const greetingId = (await replies.last().getAttribute('data-id'))!;
  const before = await replies.count();
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Push Test');
  await goIn(page);
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });

  // Two quiet beats and the take fill TAKE (3), then the card: WALK with what it keeps, and PRESS ON.
  await page.locator('.tb-card[data-choice="duck"]').click();
  await page.locator('.tb-card[data-choice="listen"]').click();
  await page.locator('.tb-card[data-choice="take"]').click();
  await expect(page.locator('.tb-head .tb-flag')).toHaveText('PRESS ON?', { timeout: 10_000 });
  await expect(page.locator('.tb-card[data-choice="!walk"] .tb-panel-sub')).toHaveText('400 SOL · HEAT +0');
  await page.locator('.tb-card[data-choice="!press"]').click();
  await page.locator('.tb-card[data-choice="lift"]').click();
  // A won push: the pot on the strip, and WALK keeps it.
  await expect(page.locator('.tb-strip .tb-pot')).toHaveText('POT +100 SOL', { timeout: 10_000 });
  await expect(page.locator('.tb-card[data-choice="!walk"] .tb-panel-sub')).toHaveText('500 SOL · HEAT +0');
  await page.screenshot({ path: 'test-results/jobs-push-card.png' });
  await page.locator('.tb-card[data-choice="!press"]').click();
  await page.locator('.tb-card[data-choice="grab"]').click();

  // Lost: the pot gone, half the pay back, the take down a tier.
  await expect(page.locator('.db .db-tier')).toHaveText('MESSY', { timeout: 10_000 });
  await expect(page.locator('.db-push-head')).toHaveText('PRESSED');
  await expect(page.locator('.db-push .db-line')).toHaveText(['Lift the second box.', 'Grab the till as well.']);
  await expect(page.locator('.db-push .db-gain')).toHaveText(['+100 SOL', 'LOST']);
  await expect(page.locator('.db .db-sol')).toHaveText('200 SOL', { timeout: 10_000 });
  await expect(replies).toHaveCount(before + 2, { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/jobs-push-debrief.png' });
  expect(errors).toEqual([]);
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(replies).toHaveCount(before, { timeout: 10_000 });
});

test('a full ALARM: GET OUT with RUN and WALK IT OFF on the wire; the job ends either way', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await firstPlaythrough(page.request);
  // Getaway Test sits on Second Socket's board (e2e/serve.ts): four loud beats, no dice, ALARM +1 each.
  await nixAt(page, 'second-socket', 'SECOND SOCKET');
  const replies = page.locator('.msg.agent.s-ok');
  const greetingId = (await replies.last().getAttribute('data-id'))!;
  const before = await replies.count();
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Getaway Test');
  await goIn(page);
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  // Every beat's cards share their ids: wait for each beat's own text before its click.
  for (const beat of ['door', 'hall', 'stairs', 'office']) {
    await expect(page.locator('.tb-prose')).toContainText(`The ${beat}.`, { timeout: 10_000 });
    await page.locator('.tb-card[data-choice="bang"]').click();
  }
  // The stock getaway (the table spec §2).
  await expect(page.locator('.tb-head .tb-flag.red')).toHaveText('GET OUT', { timeout: 10_000 });
  await expect(page.locator('.tb-alarm .tb-stack i.f')).toHaveCount(4);
  await expect(page.locator('.tb-card[data-choice="run"] .tb-odds')).toContainText('ON THE WIRE');
  await expect(page.locator('.tb-card[data-choice="walk"] .tb-line')).toHaveText('Walk it off like you belong here.');
  await page.screenshot({ path: 'test-results/jobs-getaway.png' });
  await page.locator('.tb-card[data-choice="run"]').click();
  // A costly roll's costs (picked and taken), or TAKE IT on the cover cards of a blown job (a burner from an earlier
  // spec in this worker), until her closing line ends the job.
  const take = page.locator('.tb-card[data-choice="!take"]');
  await expect
    .poll(
      async () => {
        if (!(await settleCostStep(page)) && (await take.isVisible())) await take.click();
        return replies.count();
      },
      { timeout: 15_000, intervals: [500] },
    )
    .toBe(before + 2);
  await expect(page.locator('.db .db-tier').last()).toHaveText(/MESSY|BLOWN/);
  await page.screenshot({ path: 'test-results/jobs-getaway-debrief.png' });
  expect(errors).toEqual([]);
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(replies).toHaveCount(before, { timeout: 10_000 });
});
