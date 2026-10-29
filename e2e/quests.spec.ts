import { expect, test } from '@playwright/test';
import { DIRECT, awaitGreeting, send, skipSplash } from './fixtures';

// Each test plays from her greeting and rewinds to it at the end (the write log undoes the runs and the clock):
// on one worker the second would otherwise find Paper Trail still at a beat from the first.

// Each test a playthrough of its own as Hicks, so neither meets the other's Paper Trail half played (or the clock it waited
// to): a test lands on whatever server slot is free, so the ones before it vary run to run. Then the worker's own comes back.
let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  expect((await request.post('/api/playthroughs', { data: { player: 'hicks', startContact: DIRECT.id } })).status()).toBe(200);
});
test.afterEach(async ({ request }) => {
  // Her last line may still be streaming (409 busy) for a moment.
  if (before) await expect.poll(async () => (await request.post(`/api/playthroughs/${before}/activate`)).status(), { timeout: 15_000 }).toBe(200);
});

test('quest: QUEST at the Intake, a beat and its cards, a typed choice held, JUST TALKING, THAT\'S MY CHOICE', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=hicks`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const greetingId = (await page.locator('.msg.agent.s-ok').last().getAttribute('data-id'))!;
  const replies = page.locator('.msg.agent.s-ok');

  // QUEST glows for quests that can start here, until the list is opened.
  await expect(page.locator('.hud-quest.quest-new')).toBeVisible({ timeout: 10_000 });
  // QUEST lists Paper Trail; START plays its first beat and pins the cards.
  await page.locator('.hud-quest').click();
  await expect(page.locator('.hud-quest.quest-new')).toHaveCount(0);
  await expect(page.locator('.ql-row .ql-title')).toHaveText(['Back Door', 'Night Shift', 'Paper Trail', 'Ready Test']);
  await expect(page.locator('.ql-row', { hasText: 'Paper Trail' }).locator('.ql-pitch')).toHaveText('A Sentinel wants one page from the ledger.');
  await expect(page.locator('.ql-row', { hasText: 'Paper Trail' }).locator('.ql-timed')).toHaveText('HAS A DEADLINE');
  const before = await replies.count();
  await page.locator('.ql-row', { hasText: 'Paper Trail' }).locator('.ql-start').click();
  await expect(page.locator('.qc-card')).toHaveCount(3, { timeout: 10_000 });
  await expect(page.locator('.qc-story')).toContainText('Boots on the stairs.');
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  // Nothing else can start while it runs (QUEST itself stays for the Intake's fixer, e2e/serve.ts's stock).
  await expect(page.locator('.ql-row .ql-start')).toHaveCount(0);
  await expect(page.locator('.qc-hint')).toContainText('Talk it over with');
  // Venn has a face: his framed bust stands beside the subtitles while he's here, and the panel has none.
  await expect(page.locator('.sp-portrait[data-name="Arlo Venn"]:not(.sp-leaving) img')).toBeVisible();
  await expect(page.locator('#feed')).toHaveClass(/has-portrait/);
  await expect(page.locator('.qc-who')).toHaveCount(0);

  // A line that acts out STALL is held: no reply, the card lit, the line back in the field.
  const input = page.locator('#input textarea');
  await input.fill('Come back in the morning, Sentinel.');
  await input.press('Enter');
  await expect(page.locator('.qc-card.qc-lit[data-choice="stall"]')).toBeVisible({ timeout: 10_000 });
  await expect(input).toHaveValue('Come back in the morning, Sentinel.');
  await expect(replies).toHaveCount(before + 1);

  // SEND AS TALK: it goes to her as chat.
  await page.locator('.qc-talk').click();
  await expect(replies).toHaveCount(before + 2, { timeout: 10_000 });
  await expect(page.locator('.qc-lit')).toHaveCount(0);

  // Again, and CONFIRM: one quest row with the typed line, the outcome and the next beat's two cards.
  await input.fill('Come back in the morning, Sentinel.');
  await input.press('Enter');
  await expect(page.locator('.qc-confirm')).toBeVisible({ timeout: 10_000 });
  const confirmed = await replies.count();
  await page.locator('.qc-confirm').click();
  await expect(page.locator('.qc-card')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator('.qc-story')).toContainText('He nods and goes.');
  await expect(input).toHaveValue('');
  await expect(page.locator('#feed .msg.quest-row .qr-pick').last()).toHaveText('Come back in the morning, Sentinel.');
  // Her reply to the beat finishes before the rewind: one sent mid-turn is refused (busy) and the reply lands after it.
  await expect(replies).toHaveCount(confirmed + 1, { timeout: 10_000 });
  expect(errors).toEqual([]);
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(page.locator('.msg.agent.s-ok').last()).toHaveAttribute('data-id', greetingId, { timeout: 10_000 });
});

test('quest waits: HAND parks the story until morning at the Intake; WAIT UNTIL plays the beat; CONTINUE plays a ready one', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=hicks`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const greetingId = (await page.locator('.msg.agent.s-ok').last().getAttribute('data-id'))!;

  await page.locator('.hud-quest').click();
  await page.locator('.ql-row', { hasText: 'Paper Trail' }).locator('.ql-start').click();
  await expect(page.locator('.qc-card')).toHaveCount(3, { timeout: 10_000 });
  await page.locator('.qc-card[data-choice="hand"]').click();

  // The story waits: no cards, the next step, where and by when.
  await expect(page.locator('.qc-next')).toHaveText('The Sentinel said morning. Be at the Intake.', { timeout: 10_000 });
  await expect(page.locator('.qc-card')).toHaveCount(0);
  await expect(page.locator('.qc-when')).toContainText('by 12:00');

  // WAIT UNTIL 06:00 in the panel: the return plays, in its version for those who handed the page over.
  await expect(page.locator('.qc-wait')).toHaveText('WAIT UNTIL 06:00');
  await page.locator('.qc-wait').click();
  await expect(page.locator('.qc-card')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator('.qc-story')).toContainText('Venn is back, with the page.');
  await page.locator('.qc-card[data-choice="out2"]').click();
  await expect(page.locator('.qc-end')).toBeVisible({ timeout: 10_000 });
  // The ending row has no stranger: his bust goes and the line takes its room back.
  await expect(page.locator('.sp-portrait')).toHaveCount(0);
  await expect(page.locator('#feed')).not.toHaveClass(/has-portrait/);
  await page.locator('.qc-close').click();

  // A ready wait: CONTINUE plays the next beat.
  await page.locator('.hud-quest').click();
  await page.locator('.ql-row', { hasText: 'Ready Test' }).locator('.ql-start').click();
  await expect(page.locator('.qc-card')).toHaveCount(2, { timeout: 10_000 });
  await page.locator('.qc-card[data-choice="go"]').click();
  await expect(page.locator('.qc-continue')).toBeVisible({ timeout: 10_000 });
  const replies = page.locator('.msg.agent.s-ok');
  const continued = await replies.count();
  await page.locator('.qc-continue').click();
  await expect(page.locator('.qc-story')).toContainText('The second beat.', { timeout: 10_000 });
  // Her reply to the beat finishes before the rewind: one sent mid-turn is refused (busy) and the reply lands after it.
  await expect(replies).toHaveCount(continued + 1, { timeout: 10_000 });
  expect(errors).toEqual([]);
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(page.locator('.msg.agent.s-ok').last()).toHaveAttribute('data-id', greetingId, { timeout: 10_000 });
});
