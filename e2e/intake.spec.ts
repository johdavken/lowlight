import { expect, test } from '@playwright/test';
import { firstPlaythrough, goIn, nixAt, questRow, send, skipSplash } from './fixtures';

// The Intake board (spec 2026-10-20): one of Nix's own clients' jobs (e2e/serve.ts puts it at Hae's), trust its stake.
test.describe.configure({ mode: 'serial' });

test("a client's job with Nix: her row, a clean end, and her word in the debrief", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  // The worker's first playthrough: its player is the one e2e/serve.ts seeds Nix's trust for.
  await firstPlaythrough(page.request);
  await nixAt(page, 'noodle-stall', 'NOODLE STALL');
  const replies = page.locator('.msg.agent.s-ok');
  const greetingId = (await replies.last().getAttribute('data-id'))!;
  const before = await replies.count();

  await page.locator('.hud-quest').click();
  const row = questRow(page, 'Client Test');
  await expect(row.locator('.ql-mission')).toHaveText(/^NIX'S CLIENT · \d+–\d+ SOL · TRUST$/);
  await row.click();
  await page.locator('.ql-file .ql-start').click();
  await goIn(page);
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });

  // No rolls: wait out the door, then skim (CLEAN in this fixture).
  await page.locator('.tb-card[data-choice="wait"]').click();
  // The stairs (a quiet beat: TAKE fills on the no-roll path, the table spec §2).
  await page.locator('.tb-card[data-choice="go"]').click();
  await page.locator('.tb-card[data-choice="skim"]').click();
  await expect(page.locator('.db .db-tier')).toHaveText('CLEAN', { timeout: 10_000 });
  await expect(page.locator('.db .db-trust')).toHaveText(/^NIX · .+ → .+$/);
  await expect(page.locator('.db .db-rep')).toHaveCount(0);
  await expect(replies).toHaveCount(before + 2, { timeout: 10_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/intake-debrief.png' });
  expect(errors).toEqual([]);

  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(replies).toHaveCount(before, { timeout: 10_000 });
});
