import { expect, test } from '@playwright/test';
import { firstPlaythrough, nixAt, send, skipSplash } from './fixtures';

test('mission: a MISSION row, odds on a card, a failed roll rerolled with EDGE, the pay on YOU', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  // The worker's first playthrough, with Nix at the Intake, where Night Shift starts.
  await firstPlaythrough(page.request);
  await nixAt(page, 'lowlight-intake', 'LOWLIGHT INTAKE');
  const replies = page.locator('.msg.agent.s-ok');

  // The odds follow its player's kit.
  type Kit = { deck: { bonus: number } | null; sol: number; edgeLeft: number; stats: { tech: number } };
  const kit = ((await (await page.request.get('/api/kit')).json()) as { kit: Kit }).kit;
  const chance = Math.min(95, Math.max(5, 45 + (kit.stats.tech - 5) * 7 + (kit.deck ? kit.deck.bonus : -25)));
  await page.locator('.hud-quest').click();
  const row = page.locator('.ql-row', { hasText: 'Night Shift' });
  await expect(row.locator('.ql-mission')).toHaveText('MISSION · TIER 1 · 400 SOL');
  const before = await replies.count();
  // Her greeting: rewound to at the end, so the specs after this one in the worker meet a room with no mission in it.
  const greetingId = (await replies.last().getAttribute('data-id'))!;
  await row.locator('.ql-start').click();
  // Her one opening line, and the first beat's cards with their odds.
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  await expect(page.locator('.qc-card[data-choice="roof"] .qc-odds')).toHaveText(`· TECH ${chance}%${kit.deck ? '' : ' · NO DECK'}`);
  // Its picture, muted, above the title.
  await expect(page.locator('#quest-cards .qc-art, .qc-art').first()).toBeVisible();
  await expect.poll(() => page.locator('.qc-art').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/missions-cards.png' });

  // The roll is 80: a fail, so REROLL and TAKE IT; the reroll is 3, and it's clean. No reply between beats.
  await page.locator('.qc-card[data-choice="roof"]').click();
  await expect(page.locator('.qc-card[data-choice="!reroll"] .qc-line')).toHaveText(`REROLL (EDGE ${kit.edgeLeft} LEFT)`, { timeout: 10_000 });
  await page.locator('.qc-card[data-choice="!reroll"]').click();
  await expect(page.locator('.qc-card[data-choice="wipe"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#feed')).toContainText(`TECH ${chance}% — clean.`);
  await expect(replies).toHaveCount(before + 1);

  // The last check (3 again) pays; her closing line ends it.
  await page.locator('.qc-card[data-choice="wipe"]').click();
  await expect(replies).toHaveCount(before + 2, { timeout: 10_000 });

  // YOU shows the pay and the deck it gave, fetched as it opens (a WAIT since the last quest move would have cooled the heat).
  const fresh = page.waitForRequest((r) => r.url().endsWith('/api/kit'), { timeout: 5_000 });
  await page.keyboard.press('Alt+y');
  await fresh;
  await expect(page.locator('.cs-wallet.live .cs-amt')).toHaveText(`${kit.sol + 400}sol`, { timeout: 10_000 });
  await expect(page.locator('.cs-sec[data-section="gear"]')).toContainText('Deaf Meridian · +18 GRID · HEAT 1');
  await page.waitForTimeout(1200); // past the glitch-in, for the screenshot
  await page.screenshot({ path: 'test-results/missions-you.png' });
  expect(errors).toEqual([]);
  await page.keyboard.press('Escape');
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(replies).toHaveCount(before, { timeout: 10_000 });
});
