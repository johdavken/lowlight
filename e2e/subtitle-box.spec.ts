// The subtitle chat box (spec 2026-10-16): the corner stacks, their folds, SYS → CHAT KEYS, and
// paging under both. The unit tests cover what each key does; here only the real layout and storage.
import { expect, test, type Page } from '@playwright/test';
import { DIRECT, awaitGreeting, send, skipIntro } from './fixtures';

test.beforeEach(async ({ page }) => {
  await skipIntro(page);
});

async function room(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('.link')).toHaveAttribute('data-status', 'ok');
  await awaitGreeting(page);
}

/** Sends `len:N` and waits for her whole reply. */
async function reply(page: Page, n: number) {
  const replies = page.locator('#feed .msg.agent');
  const before = await replies.count();
  await send(page, { type: 'user_message', text: `len:${n}` });
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  const last = replies.last();
  await expect(last).toHaveClass(/s-ok/, { timeout: 10_000 });
  return last;
}

async function pickChatKeys(page: Page, word: 'GLYPHS' | 'LABELS'): Promise<void> {
  await page.locator('.hud-sys').click();
  await page.locator('.sys-row[data-row="keys"] i', { hasText: word }).click();
  await page.keyboard.press('Escape');
}

test('both stacks fold, stay folded across a reload, and the shortcuts still work', async ({ page }) => {
  await room(page);
  const line = page.locator('.line-keys');
  const scene = page.locator('.scene-keys');
  await expect(line.locator('button.key')).toHaveCount(5);
  await line.locator('.fold').click();
  await scene.locator('.fold').click();
  await expect(line).toHaveClass(/\bfolded\b/);
  await expect(scene).toHaveClass(/\bfolded\b/);
  await expect(line.locator('button.key').first()).toBeHidden();
  await page.reload();
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('.line-keys')).toHaveClass(/\bfolded\b/);
  await expect(page.locator('.scene-keys')).toHaveClass(/\bfolded\b/);
  // Alt+E ends the scene with its stack folded: her goodbye-to-the-scene turn goes out.
  await expect(page.locator('.link')).toHaveAttribute('data-status', 'ok');
  const users = page.locator('#feed .msg.user');
  const before = await users.count();
  await page.keyboard.press('Alt+e');
  await expect(users).toHaveCount(before + 1, { timeout: 10_000 });
});

test('LABELS shows words and widens the subtitle; GLYPHS narrows it again', async ({ page }) => {
  await room(page);
  const left = () => page.locator('#feed .feed').evaluate((n) => getComputedStyle(n).left);
  await expect.poll(left).toBe('130px');
  await expect(page.locator('.line-keys .key .glyph').first()).toBeVisible();
  await pickChatKeys(page, 'LABELS');
  await expect.poll(left).toBe('180px');
  await expect(page.locator('.line-keys .key .glyph').first()).toBeHidden();
  await expect(page.locator('.line-keys .key .lb').first()).toBeVisible();
  await pickChatKeys(page, 'GLYPHS');
  await expect.poll(left).toBe('130px');
});

test('switching to LABELS mid-page keeps the reply paged and the reader on their page (Review Focus 1)', async ({ page }) => {
  await room(page);
  await reply(page, 4200);
  const cont = page.locator('button.continue');
  await expect(cont).toHaveText(/\[CONTINUE ▸ 1\/[3-9]\]/);
  // A click while she types only finishes the page; the next turns it. Click until page 2 shows.
  for (let i = 0; i < 4 && !/▸ 2\//.test((await cont.textContent()) ?? ''); i++) {
    await cont.click();
    await page.waitForTimeout(150);
  }
  await expect(cont).toHaveText(/\[CONTINUE ▸ 2\//);
  await pickChatKeys(page, 'LABELS');
  await expect(cont).toHaveText(/\[CONTINUE ▸ [2-9]\//);
  // Turn to the end: the button goes once the last page shows.
  for (let i = 0; i < 12 && (await cont.count()) > 0; i++) await cont.click();
  await expect(cont).toHaveCount(0);
});

test('the archive hides both stacks and keeps the prompt line; Esc brings them back', async ({ page }) => {
  await room(page);
  await page.keyboard.press('PageUp');
  await expect(page.locator('#feed')).toHaveClass(/\bexpanded\b/);
  await expect(page.locator('.line-keys')).toBeHidden();
  await expect(page.locator('.scene-keys')).toBeHidden();
  await expect(page.locator('.input')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.line-keys')).toBeVisible();
  await expect(page.locator('.scene-keys')).toBeVisible();
});

test('a very long reply never grows the band past its cap', async ({ page }) => {
  await room(page);
  await reply(page, 6000);
  const heights = await page.locator('#feed .feed').evaluate((n) => ({ h: n.getBoundingClientRect().height, max: parseFloat(getComputedStyle(n).maxHeight) }));
  expect(heights.h).toBeLessThanOrEqual(heights.max + 0.5);
});
