import { expect, test, type Page } from '@playwright/test';
import { DIRECT, SECOND, activeId, awaitGreeting, dialIn, nixSharesAlpha, pickTitle, say, send, skipSplash, toTitle, skipIntro } from './fixtures';

// Rooms here skip the district load screen (arrival.spec covers it).
test.beforeEach(async ({ page }) => {
  await skipIntro(page);
});

/** A room whose history has loaded: the feed shows `line`. */
async function inRoomWith(page: Page, contact: string, line: string): Promise<void> {
  await page.waitForURL(`**/room/${contact}*`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('#feed')).toContainText(line, { timeout: 10_000 });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
});

test('new game, save, talk, load goes back in the same game, BEFORE LOAD comes forward again', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await dialIn(page, DIRECT.id);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const original = await activeId(page);
  await say(page, 'EARLY-LINE');

  // SAVE as `before`, from the pause menu (Esc).
  await page.keyboard.press('Escape');
  await page.locator('.pause-row[data-row="save"]').click();
  const field = page.locator('.save-card .sc-field');
  await expect(field).toBeFocused();
  await field.fill('before');
  await field.press('Enter');
  await expect(page.locator('.save-card')).toHaveCount(0);
  await expect(page.locator('#feed')).toContainText('Saved: before');

  await say(page, 'LATER-LINE');

  // TITLE → LOAD → the saves → Enter on `before`.
  await page.locator('.hud-back').click();
  await toTitle(page);
  await pickTitle(page, 'load');
  const load = page.locator('.load-screen');
  await expect(load.locator(`.pt.on[data-id="${original}"]`)).toBeVisible();
  await expect(load.locator('.ss[data-id="now"].on')).toBeVisible();
  // The manual save named `before`: its strip shows the name, under SAVES; its id is the API's.
  const saves = (await (await page.request.get(`/api/playthroughs/${original}/saves`)).json()) as { id: string; name: string }[];
  const before = saves.find((s) => s.name.startsWith('before'))!;
  const save = load.locator(`.ss[data-id="${before.id}"]`);
  await expect(save).toHaveCount(1);
  await expect(save.locator('.ss-name')).toHaveText(before.name);
  await expect(save.locator('.ss-kind')).toHaveText('★ SAVE');
  for (let i = 0; i < 25 && !(await save.evaluate((n) => n.classList.contains('on'))); i++) await page.keyboard.press('ArrowDown');
  await expect(save).toHaveClass(/\bon\b/);
  await page.keyboard.press('Enter');

  // Back in the same game: the line before the save is there, the later one isn't.
  await inRoomWith(page, DIRECT.id, 'EARLY-LINE');
  await expect(page.locator('#feed')).not.toContainText('LATER-LINE');
  expect(await activeId(page)).toBe(original);

  // Where you were is kept as BEFORE LOAD; loading it brings the later line back, still the same game.
  await page.locator('.hud-back').click();
  await toTitle(page);
  await pickTitle(page, 'load');
  await expect(load.locator(`.pt.on[data-id="${original}"]`)).toBeVisible();
  const after = (await (await page.request.get(`/api/playthroughs/${original}/saves`)).json()) as { id: string; name: string; trigger: string }[];
  const back = after.find((s) => s.trigger === 'load')!;
  expect(back.name).toBe(`Before loading ${before.name}`);
  const backStrip = load.locator(`.ss[data-id="${back.id}"]`);
  await expect(backStrip.locator('.ss-kind')).toHaveText('⤺ BEFORE LOAD');
  for (let i = 0; i < 25 && !(await backStrip.evaluate((n) => n.classList.contains('on'))); i++) await page.keyboard.press('ArrowDown');
  await expect(backStrip).toHaveClass(/\bon\b/);
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

test('Esc pauses: LOAD over the room renames a save and comes back; SETTINGS opens SYS; Esc resumes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await dialIn(page, DIRECT.id);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const pt = await activeId(page);

  // SAVE from PAUSED: the card shows the strip, its name following the field.
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-menu')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const field = page.locator('.save-card .sc-field');
  await expect(field).toBeFocused();
  await field.fill('first look');
  await expect(page.locator('.save-card .sc-strip .ss-name')).toHaveText('first look');
  await field.press('Enter');
  await expect(page.locator('#feed')).toContainText('Saved: first look');

  // LOAD over the room: the save sits under SAVES; R renames it in its strip.
  await page.keyboard.press('Escape');
  await page.locator('.pause-row[data-row="load"]').click();
  const load = page.locator('.pause-load .load-screen');
  await expect(load.locator(`.pt.on[data-id="${pt}"]`)).toBeVisible();
  const saves = (await (await page.request.get(`/api/playthroughs/${pt}/saves`)).json()) as { id: string; name: string }[];
  const mine = saves.find((s) => s.name === 'first look')!;
  const strip = load.locator(`.ss[data-id="${mine.id}"]`);
  await expect(strip.locator('.ss-name')).toHaveText('first look');
  for (let i = 0; i < 25 && !(await strip.evaluate((n) => n.classList.contains('on'))); i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('r');
  const name = strip.locator('input');
  await name.fill('a better name');
  await name.press('Enter');
  await expect(strip.locator('.ss-name')).toHaveText('a better name');
  // Typed keys never reached the chat prompt.
  await expect(page.locator('#input textarea')).toHaveValue('');

  // Esc: back to PAUSED, then SETTINGS opens SYS; Esc closes it and the room is as it was.
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-load')).toHaveCount(0);
  await expect(page.locator('.pause-menu')).toBeVisible();
  await page.locator('.pause-row[data-row="settings"]').click();
  await expect(page.locator('.sys-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sys-menu')).toBeHidden();
  await expect(page.locator('.pause-menu')).toHaveCount(0);
  expect(page.url()).toContain(`/room/${DIRECT.id}`);

  // Without a keyboard: SYS → MENU opens it too.
  await page.locator('.hud-sys').click();
  await page.locator('.sys-row[data-row="pause"]').click();
  await expect(page.locator('.pause-menu')).toBeVisible();
  await page.locator('.pause-row[data-row="resume"]').click();
  await expect(page.locator('.pause-menu')).toHaveCount(0);
  expect(errors).toEqual([]);
});
