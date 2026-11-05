import { expect, test, type Page } from '@playwright/test';
import { DIRECT, SECOND, nixSharesAlpha, skipIntro, skipSplash } from './fixtures';

// TEXTS (in-game texts spec 2026-10-29): the deck in the room, as a holo pane. A new game with Nix, who shares Alpha;
// then you go to Alpha, so Nix is someone you can text.
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await skipIntro(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await skipSplash(page);
});

async function atAlpha(page: Page): Promise<void> {
  await nixSharesAlpha(page);
  await page.locator('.hud-people').click();
  const panel = page.locator('.people-screen');
  await panel.locator('.pe-tile', { has: page.locator('.pe-tile-name', { hasText: 'ALPHA' }) }).click();
  await panel.locator('.pe-file .pe-go').click();
  await page.waitForURL(`**/room/${SECOND.id}*`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
}

const pane = (page: Page) => page.locator('.tx-pane');
const row = (page: Page, name: string) => pane(page).locator('.dk-row', { hasText: name.toUpperCase() });

test('Alt+X opens TEXTS; a text to Nix from Alpha\'s room gets her bubbles', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await atAlpha(page);
  await page.keyboard.press('Alt+x');
  await expect(pane(page)).toBeVisible();
  await expect(page.locator('.hud-tx')).toHaveClass(/\bopen\b/);
  await row(page, DIRECT.name).click();
  await pane(page).locator('.dk-box').fill('you on shift?');
  await pane(page).locator('.dk-box').press('Enter');
  await expect(pane(page).locator('.dk-me')).toHaveText('you on shift?');
  await expect(pane(page).locator('.dk-her')).toHaveText(['till four', 'slow night', 'roof. 4:15']);
  expect(errors).toEqual([]);
});

test("the one you're with is read-only", async ({ page }) => {
  await atAlpha(page);
  await page.keyboard.press('Alt+x');
  await row(page, SECOND.name).click();
  await expect(pane(page).locator('.dk-ro-why')).toHaveText("SHE'S RIGHT HERE");
  await expect(pane(page).locator('.dk-box')).toHaveCount(0);
});

test('Tab goes on to the next screen (QUEST when it is on the bar, else CREW) and Shift+Tab back; Esc closes and you stay in the room', async ({ page }) => {
  await atAlpha(page);
  await page.keyboard.press('Alt+x');
  await row(page, DIRECT.name).click();
  await pane(page).locator('.dk-box').focus();
  const quest = await page.locator('.hud-quest').isVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator(quest ? '.ql-pane' : '.crew-screen')).toBeVisible();
  await expect(page.locator('.tx-root')).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await expect(pane(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tx-root')).toHaveCount(0);
  expect(page.url()).toContain(`/room/${SECOND.id}`);
});

test('an unread text: the notice and the dot; the notice opens her thread, and both clear', async ({ page, request }) => {
  await atAlpha(page);
  await page.keyboard.press('Alt+x');
  await row(page, DIRECT.name).click();
  await pane(page).locator('.dk-box').fill('text me in an hour');
  await pane(page).locator('.dk-box').press('Enter');
  await expect(pane(page).locator('.dk-her')).toHaveCount(3);
  // The Residual runs after her reply: give it a moment to record the promise.
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await expect(page.locator('.tx-root')).toHaveCount(0);
  expect((await request.post('/api/playthroughs/active/wait', { data: { minutes: 240 } })).status()).toBe(200);
  await expect(page.locator('.hud-texts')).toHaveText(`${DIRECT.name.toUpperCase()} · 1 TEXT`, { timeout: 15_000 });
  await expect(page.locator('.hud-tx')).toHaveClass(/\btexts-new\b/);
  await page.locator('.hud-texts').click();
  await expect(pane(page).locator('.dk-her')).toHaveCount(6);
  await expect(page.locator('.hud-texts')).toBeHidden();
  await expect(page.locator('.hud-tx')).not.toHaveClass(/\btexts-new\b/);
});
