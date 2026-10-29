import { expect, test, type Page } from '@playwright/test';
import { DIRECT, SECOND, activeId, awaitGreeting, dialIn, pickTitle, send, skipSplash, toTitle, skipIntro } from './fixtures';

// Rooms here skip the district load screen (arrival.spec covers it).
test.beforeEach(async ({ page }) => {
  await skipIntro(page);
});

/** Says `text` in the room and waits for her reply to finish. */
async function say(page: Page, text: string): Promise<void> {
  const before = await page.locator('.msg.agent.s-ok').count();
  await send(page, { type: 'user_message', text });
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
}

/** A room whose history has loaded: the feed shows `line`. */
async function inRoomWith(page: Page, contact: string, line: string): Promise<void> {
  await page.waitForURL(`**/room/${contact}*`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('#feed')).toContainText(line, { timeout: 10_000 });
}

/** A new game with Nix, who shares Alpha (the fake OpenRouter's share_contact). */
async function nixSharesAlpha(page: Page): Promise<void> {
  await dialIn(page, DIRECT.id);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await say(page, 'where do I find Alpha?');
  await expect(page.locator('#feed .tool', { hasText: 'Nix shared a contact: ALPHA' })).toHaveCount(1);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
});

test('new game, save, talk, load forks back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await dialIn(page, DIRECT.id);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const original = await activeId(page);
  await say(page, 'EARLY-LINE');

  // SAVE as `before`.
  await page.locator('.hud-sys').click();
  await page.locator('.sys-row[data-row="save"]').click();
  const field = page.locator('.save-card .sc-field');
  await expect(field).toBeFocused();
  await field.fill('before');
  await field.press('Enter');
  await expect(page.locator('.save-card')).toHaveCount(0);
  await expect(page.locator('#feed')).toContainText('Saved: before');

  await say(page, 'LATER-LINE');

  // TITLE → LOAD → the timeline → Enter on `before`.
  await page.locator('.hud-back').click();
  await toTitle(page);
  await pickTitle(page, 'load');
  const load = page.locator('.load-screen');
  await expect(load.locator(`.pt.on[data-id="${original}"]`)).toBeVisible();
  await expect(load.locator('.tile[data-id="now"].on')).toBeVisible();
  // The manual save named `before`: its tile carries the ★ tag; its id is the API's.
  const saves = (await (await page.request.get(`/api/playthroughs/${original}/saves`)).json()) as { id: string; name: string }[];
  const before = saves.find((s) => s.name.startsWith('before'))!;
  const save = load.locator(`.tile[data-id="${before.id}"]`);
  await expect(save).toHaveCount(1);
  await expect(save.locator('.band-tag')).toHaveText('★');
  for (let i = 0; i < 25 && !(await save.evaluate((n) => n.classList.contains('on'))); i++) await page.keyboard.press('ArrowRight');
  await expect(save).toHaveClass(/\bon\b/);
  await page.keyboard.press('Enter');

  // The fork: the line before the save is there, the later one isn't.
  await inRoomWith(page, DIRECT.id, 'EARLY-LINE');
  await expect(page.locator('#feed')).not.toContainText('LATER-LINE');
  const forked = await activeId(page);
  expect(forked).not.toBe(original);

  // The original is still in LOAD, and continuing it brings the later line back.
  await page.locator('.hud-back').click();
  await toTitle(page);
  await pickTitle(page, 'load');
  // The fork is active (and newest), so selected: its file says where it came from.
  await expect(load.locator(`.pt.on[data-id="${forked}"]`)).toBeVisible();
  await expect(load.locator('.fighter.p1 .fighter-file > p')).toContainText('forked from');
  const row = load.locator(`.pt[data-id="${original}"]`);
  for (let i = 0; i < 25 && !(await row.evaluate((n) => n.classList.contains('on'))); i++) await page.keyboard.press('ArrowDown');
  await expect(row).toHaveClass(/\bon\b/);
  await expect(load.locator('.tile[data-id="now"].on')).toBeVisible();
  await page.keyboard.press('Enter');
  await inRoomWith(page, DIRECT.id, 'LATER-LINE');
  expect(await activeId(page)).toBe(original);

  expect(errors).toEqual([]);
});

test('contacts panel switches contact', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await nixSharesAlpha(page);

  await page.locator('.hud-people').click();
  const panel = page.locator('.people-screen');
  await expect(panel.locator('.pe-tile.on .pe-tile-name')).toContainText('NIX');
  await expect(panel.locator('.pe-tile.on .pe-here')).toHaveText('● HERE');
  const alpha = panel.locator('.pe-tile', { has: page.locator('.pe-tile-name', { hasText: 'ALPHA' }) });
  await alpha.click();
  await expect(panel.locator('.pe-file .pe-where')).toContainText('heard from Nix');
  // Her file (spec 2026-10-28 §4), heard of or not.
  await expect(panel.locator('.pe-file .pe-bio')).toHaveText(SECOND.bio);
  await expect(panel.locator('.pe-file .pe-facts dt')).toHaveText(SECOND.fact.label);
  await panel.locator('.pe-file .pe-go').click();
  await page.waitForURL(`**/room/${SECOND.id}*`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);

  expect(errors).toEqual([]);
});

test('continue cycles known contacts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await nixSharesAlpha(page);

  await page.locator('.hud-back').click();
  await toTitle(page);
  const cont = page.locator('.title-menu .tile[data-id="continue"]');
  await expect(cont).toHaveClass(/\bon\b/);
  const who = page.locator('.title-menu .fighter.p2 .name');
  await expect(who).toHaveText(/^nix$/i);
  await page.keyboard.press('ArrowDown');
  await expect(who).toHaveText(/^alpha$/i);
  // Enter on CONTINUE goes to the contact shown.
  await page.keyboard.press('Enter');
  await page.waitForURL(`**/room/${SECOND.id}*`);

  expect(errors).toEqual([]);
});
