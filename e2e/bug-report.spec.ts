import { expect, test } from '@playwright/test';
import { BUG_RELAY_PORT, DIRECT, awaitGreeting, pickTitle, skipSplash, toTitle, skipIntro } from './fixtures';

// Rooms here skip the district load screen (arrival.spec covers it).
test.beforeEach(async ({ page }) => {
  await skipIntro(page);
});

/** The bug report (spec 2026-10-11): F8 in a scene, REPORT A BUG on the title; e2e's relay is a fake that keeps what it gets. */

const relayed = async (page: import('@playwright/test').Page) =>
  (await (await page.request.get(`http://127.0.0.1:${BUG_RELAY_PORT}/`)).json()) as { subject: string; text: string }[];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
});

test('F8 in a scene opens the panel; SEND reaches the relay once', async ({ page }) => {
  const before = (await relayed(page)).length;
  await page.goto(`/room/${DIRECT.id}?as=hicks`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  // As played: the room's prompt has focus.
  await expect(page.locator('#input textarea, #input input').first()).toBeFocused();
  await page.keyboard.press('F8');
  const panel = page.locator('.bug-report');
  await expect(panel).toBeVisible();
  // A browser can't take a screenshot: no box for one.
  await expect(panel.locator('.bug-shot')).toHaveCount(0);
  await expect(panel.locator('.bug-turns')).toContainText('The last 10 turns of this scene');
  await panel.locator('.bug-desc').fill('E2E: the noodles went cold');
  await panel.locator('.bug-send').click();
  await expect(panel.locator('.bug-status')).toHaveText('Sent — thanks. Bug reports go straight to the developer.');
  const after = await relayed(page);
  expect(after).toHaveLength(before + 1);
  expect(after.at(-1)!.text).toContain('E2E: the noodles went cold');
  await expect(panel).toHaveCount(0, { timeout: 5000 });
});

test('REPORT A BUG on the title: no screenshot box, the tip, and Esc goes back', async ({ page }) => {
  await page.goto('/');
  await toTitle(page);
  await pickTitle(page, 'report');
  const panel = page.locator('.bug-report');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.bug-shot')).toHaveCount(0);
  await expect(panel.locator('.bug-tip')).toHaveText('Tip: press F8 in a scene to report from there, with a screenshot.');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.title-menu .tile[data-id="report"]')).toHaveClass(/\bon\b/);
});
