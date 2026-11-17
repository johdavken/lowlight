// The subtitle chat box (spec 2026-10-16; the room HUD): the line's keys on the box, the scene stack's fold, SYS → CHAT KEYS, and
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
  // CHAT KEYS is on the box's settings key (box-settings.ts).
  await page.locator('.bs-key').click();
  await page.locator('.bs-row[data-row="keys"] i', { hasText: word }).click();
  await page.keyboard.press('Escape');
}

test("the line's keys sit in a row on the head line beside the settings key, always there; the scene stack folds and stays folded across a reload", async ({ page }) => {
  await room(page);
  const line = page.locator('.line-keys');
  const scene = page.locator('.scene-keys');
  // REGENERATE, KEEP GOING, EDIT, DELETE: no BRANCH HERE (playtest 2026-11-11).
  await expect(line.locator('button.key')).toHaveCount(4);
  await expect(line.locator('.fold')).toHaveCount(0);
  const [box, keys] = await Promise.all([page.locator('#feed .feed').boundingBox(), line.boundingBox()]);
  // No pane (B TRACE, 2026-11-15): no glass frame layer; the head line and the rail are drawn on the box itself.
  await expect(page.locator('#feed > .hf')).toHaveCount(0);
  expect(await page.locator('#feed .feed').evaluate((n) => getComputedStyle(n, '::after').backgroundImage)).toContain('linear-gradient');
  // One row, standing on the head line (8px over the box's top edge), in the box's right half.
  const tops = new Set(await line.locator('button.key').evaluateAll((ks) => ks.map((k) => Math.round(k.getBoundingClientRect().top))));
  expect(tops.size).toBe(1);
  expect(Math.abs(keys!.y + keys!.height + 8 - box!.y)).toBeLessThanOrEqual(3);
  expect(keys!.x).toBeGreaterThan(box!.x + box!.width / 2);
  // The name stands on the same line at the left, clear of the keys, and nothing clips it.
  const name = (await page.locator('#feed .msg').last().locator('.meta .name').boundingBox())!;
  expect(name.y + name.height).toBeLessThanOrEqual(box!.y + 2);
  expect(name.x + name.width).toBeLessThan(keys!.x);
  expect(await page.locator('#feed .msg').last().locator('.meta .name').evaluate((n) => { const r = n.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) !== null; })).toBe(true);
  // Always there, the pointer anywhere.
  await page.mouse.move(800, 300);
  expect(await line.evaluate((n) => getComputedStyle(n).opacity)).toBe('1');
  // The box's settings key ends the same row at the box's right end (anchored to it: playtest, it once fell to the corner).
  const bk = (await page.locator('.bs-key').boundingBox())!;
  expect(Math.abs(bk.y - keys!.y)).toBeLessThanOrEqual(2);
  expect(bk.x).toBeGreaterThanOrEqual(keys!.x + keys!.width);
  expect(Math.abs(bk.x + bk.width - (box!.x + box!.width))).toBeLessThanOrEqual(2);
  // The leader from the speaker lands on the head line left of the keys.
  const lead = await page.locator('#feed .sub-leader .sl-line').evaluate((n) => n.getAttribute('points')!.split(' ')[0].split(',').map(Number));
  const k = box!.width / (await page.locator('#feed .feed').evaluate((n) => (n as HTMLElement).offsetWidth));
  expect(lead[0] * k).toBeLessThan(keys!.x);
  await scene.locator('.fold').click();
  await expect(scene).toHaveClass(/\bfolded\b/);
  await page.reload();
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('.scene-keys')).toHaveClass(/\bfolded\b/);
  // Alt+E ends the scene with its stack folded: her goodbye-to-the-scene turn goes out.
  await expect(page.locator('.link')).toHaveAttribute('data-status', 'ok');
  const users = page.locator('#feed .msg.user');
  const before = await users.count();
  await page.keyboard.press('Alt+e');
  await expect(users).toHaveCount(before + 1, { timeout: 10_000 });
});

test('LABELS widens the subtitle (the line keys keep their glyphs); GLYPHS narrows it again', async ({ page }) => {
  await room(page);
  const left = () => page.locator('#feed .feed').evaluate((n) => getComputedStyle(n).left);
  await expect.poll(left).toBe('130px');
  await expect(page.locator('.line-keys .key .glyph').first()).toBeVisible();
  await pickChatKeys(page, 'LABELS');
  await expect.poll(left).toBe('180px');
  // The line's keys keep their glyphs in their corner (words don't fit there); the word is their hover tag.
  await expect(page.locator('.line-keys .key .glyph').first()).toBeVisible();
  expect(await page.locator('.line-keys .key .lb').first().evaluate((n) => getComputedStyle(n).opacity)).toBe('0');
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

test("the box's settings key: a swatch holds the box's colour (not the name's), the speaker line goes, AUTO PAGE turns a page, kept on reload", async ({ page }) => {
  await room(page);
  const hue = () => page.locator('#feed').evaluate((n) => getComputedStyle(n).getPropertyValue('--hf-c').trim());
  const speaker = await hue();
  await page.locator('.bs-key').click();
  const panel = page.locator('.bs-panel');
  await expect(panel).toBeVisible();
  // It rises over the box's right end.
  const [box, p] = await Promise.all([page.locator('#feed .feed').boundingBox(), panel.boundingBox()]);
  expect(p!.y + p!.height).toBeLessThan(box!.y);
  expect(p!.x + p!.width).toBeLessThanOrEqual(box!.x + box!.width);
  await page.locator('.bs-row[data-row="colour"] i[data-colour="cyan"]').click();
  await expect.poll(hue).not.toBe(speaker);
  expect((await hue()).toLowerCase()).toBe('#46e3fc');
  // The name keeps the speaker's colour.
  const name = await page.locator('#feed .msg:not(.hidden-collapsed) .meta .name').evaluate((n) => getComputedStyle(n).getPropertyValue('--pc').trim());
  expect(name.toLowerCase()).not.toBe('#46e3fc');
  await page.locator('.bs-row[data-row="line"] i[data-line="off"]').click();
  await expect(page.locator('#feed > .sub-leader')).toBeHidden();
  await page.locator('.bs-row[data-row="auto"] i[data-auto="fast"]').click();
  // INSTANT, so a page is all there at once and the wait is AUTO PAGE's alone.
  await page.locator('.bs-row[data-row="text"] i[data-speed="instant"]').click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  // A long reply turns its own page once a page has typed out.
  await reply(page, 4200);
  const cont = page.locator('button.continue');
  await expect(cont).toHaveText(/\[CONTINUE ▸ 1\//);
  await expect(cont).toHaveText(/\[CONTINUE ▸ 2\//, { timeout: 8_000 });
  await page.reload();
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lowlight.box') ?? '{}'))).toMatchObject({ colour: 'cyan', line: false, autoPage: 'fast' });
  await expect.poll(hue).toBe('#46e3fc');
});
