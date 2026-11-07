import { expect, test, type Page } from '@playwright/test';
import { ANT_KEY, ANT_REPLY, BAD_KEY, DIRECT, GOOD_KEY, awaitGreeting, lockPlayer, newGame, phase, send, showTile, skipSplash, skipIntro } from './fixtures';

// Rooms here skip the district load screen (arrival.spec covers it).
test.beforeEach(async ({ page }) => {
  await skipIntro(page);
});

/**
 * The in-game link (spec 2026-10-08): the OpenRouter key and her model are set at select. Tests that
 * unlink put the e2e key back afterwards (the suite runs one worker, so the next test finds it linked).
 */

const relink = (page: Page) => page.request.put('/api/link/openrouter', { data: { apiKey: GOOD_KEY } });

/** P1 Hicks, then her tile: the model step. */
async function toModelStep(page: Page): Promise<void> {
  await newGame(page);
  await lockPlayer(page, 'hicks');
  await showTile(page, DIRECT.id);
  await page.locator(`.tile[data-id="${DIRECT.id}"]`).click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'model');
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
});
test.afterEach(async ({ page }) => {
  expect((await relink(page)).ok()).toBe(true);
  // The Anthropic test's leftovers: its key, and her model back to her default.
  expect((await page.request.delete('/api/link/anthropic')).status()).toBe(204);
  expect((await page.request.post(`/api/agents/${DIRECT.id}/model`, { data: { model: null } })).ok()).toBe(true);
});

test('no key: NO LINK, a rejected key, then linking wakes her up', async ({ page }) => {
  expect((await page.request.delete('/api/link/openrouter')).status()).toBe(204);
  await page.reload();
  await newGame(page);
  const tile = page.locator(`.tile[data-id="${DIRECT.id}"]`);
  await showTile(page, DIRECT.id);
  await expect(tile.locator('.tile-chip')).toHaveText('NO LINK');
  await expect(tile).not.toHaveClass(/offline/);

  await lockPlayer(page, 'hicks');
  await tile.click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'model');
  const panel = page.locator('.model-band .lp-field');
  await expect(panel).toBeVisible();
  await expect(page.locator('.select-title')).toHaveText('LINK A MIND');
  // She stays up with her file, the band over her legs.
  await expect(page.locator('.fighter.p2 .fighter-art').first()).toBeVisible();
  await expect(page.locator('.fighter.p2 .fighter-file')).toBeVisible();

  const field = panel.locator('.lp-key');
  await expect(field).toBeFocused();
  await field.fill(BAD_KEY);
  await page.keyboard.press('Enter');
  await expect(panel.locator('.lp-msg')).toHaveText("key rejected — OpenRouter didn't accept that key. Check you copied all of it.");

  await field.fill(GOOD_KEY);
  await page.keyboard.press('Enter');
  await expect(page.locator('.model-band[data-tab="her"]')).toBeVisible();
  await expect(page.locator('.select-title')).toHaveText('CHOOSE HER MIND');
  await page.keyboard.press('Enter'); // her current model
  await expect(phase(page)).toHaveAttribute('data-phase', 'ready');
  await page.keyboard.press('Enter');
  await page.waitForURL(`**/room/${DIRECT.id}*`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const before = await page.locator('.msg.agent.s-ok').count();
  await send(page, { type: 'user_message', text: 'hello' });
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
});

test('CHANGE KEY then Esc leaves her list unchanged', async ({ page }) => {
  await toModelStep(page);
  // Her model is a setting another test may have changed: whatever it is, it's the same after.
  const current = page.locator('.model-band .mp-row.on .mp-label');
  await expect(current).toBeVisible();
  const before = await current.textContent();
  await page.locator('.mb-tab[data-tab="keys"]').click();
  await expect(page.locator('.select-title')).toHaveText('KEYS');
  await expect(page.locator('.mp-link[data-provider="openrouter"]')).toContainText('…-e2e');
  await page.locator('.mp-link[data-provider="openrouter"] .mp-change').click();
  await expect(page.locator('.lp-field')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.lp-field')).toHaveCount(0);
  await page.locator('.mb-tab[data-tab="her"]').click();
  await expect(current).toHaveText(before!);
});

test('browsing: a vendor, a search, no model that lacks tools; a row picks', async ({ page }) => {
  await toModelStep(page);
  await expect(page.locator('.model-band .mp-row.on')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.mb-tab[data-tab="all"]')).toHaveText(`ALL MODELS ${DIRECT.models.length}`);
  await expect(page.locator('.mb-main .mp-row')).toHaveCount(DIRECT.models.length);
  await expect(page.locator('.mb-main')).not.toContainText('No Tools');
  await expect(page.locator('.mb-main .mp-mem').first()).toHaveText('131K');
  await page.locator('.mb-ven[data-vendor="google"]').click();
  await expect(page.locator('.mb-main .mp-row')).toHaveCount(1);
  await page.locator('.mb-ven[data-vendor=""]').click();

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('gemini');
  await expect(page.locator('.model-band')).toHaveAttribute('data-tab', 'all');
  await expect(page.locator('.mb-main .mp-row .mp-label')).toHaveText(['Gemini 3.8 Flash']);
  await page.keyboard.press('Enter');
  await expect(phase(page)).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('.fighter.p2 .models .m.on')).toHaveText('Gemini 3.8 Flash');
});

test('UNLINK with no key left asks for one; backing out shows the NO LINK tag again', async ({ page }) => {
  await toModelStep(page);
  await page.locator('.mb-tab[data-tab="keys"]').click();
  const unlink = page.locator('.mp-link[data-provider="openrouter"] .mp-unlink');
  await unlink.click();
  await expect(unlink).toHaveText('UNLINK? CLICK AGAIN');
  await unlink.click();
  await expect(page.locator('.select-title')).toHaveText('LINK A MIND');
  await expect(page.locator('.lp-field')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(phase(page)).toHaveAttribute('data-phase', 'p2');
  await expect(page.locator(`.tile[data-id="${DIRECT.id}"] .tile-chip`)).toHaveText('NO LINK');
});

test('only an Anthropic key: LINK A MIND on ANTHROPIC, Claude picks only, and her reply comes through it (Anthropic backend spec)', async ({ page }) => {
  expect((await page.request.delete('/api/link/openrouter')).status()).toBe(204);
  await page.reload();
  await newGame(page);
  await lockPlayer(page, 'hicks');
  await showTile(page, DIRECT.id);
  await page.locator(`.tile[data-id="${DIRECT.id}"]`).click();
  const panel = page.locator('.model-band');
  await expect(panel.locator('.lp-field')).toBeVisible();

  await panel.locator('.mp-link[data-provider="anthropic"] .mp-add').click();
  const field = panel.locator('.lp-key');
  await expect(field).toHaveAttribute('aria-label', 'ANTHROPIC KEY');
  await field.fill('sk-ant-wrong-e2e');
  await page.keyboard.press('Enter');
  await expect(panel.locator('.lp-msg')).toHaveText("key rejected — Anthropic didn't accept that key. Check you copied all of it.");
  await field.fill(ANT_KEY);
  await page.keyboard.press('Enter');

  const list = page.locator('.model-band[data-tab="her"]');
  await expect(list).toBeVisible();
  await page.locator('.mb-tab[data-tab="keys"]').click();
  await expect(panel.locator('.mp-link[data-provider="anthropic"]')).toContainText('ANTHROPIC …good');
  await expect(panel.locator('.mp-link[data-provider="openrouter"] .mp-add')).toHaveText('+ LINK OPENROUTER');
  await page.locator('.mb-tab[data-tab="her"]').click();
  // Her GLM can't run on this key, so CURRENT is the Sonnet her route runs (cf217eb3), not repeated under picks.
  await expect(list.locator('.mp-current .mp-label')).toContainText('Claude Sonnet 5.5');
  await expect(list.locator('.mp-current .mp-via')).toHaveText('via your Anthropic key');
  await expect(list.locator('.mp-pick')).toHaveCount(0);
  await list.locator('.mp-current').click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'ready');
  await page.keyboard.press('Enter');
  await page.waitForURL(`**/room/${DIRECT.id}*`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const before = await page.locator('.msg.agent.s-ok').count();
  await send(page, { type: 'user_message', text: 'hello' });
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
  await expect(page.locator('.msg.agent.s-ok').last()).toContainText(ANT_REPLY);
});
