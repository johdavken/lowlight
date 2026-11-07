import { expect, test, type Page } from '@playwright/test';
import { DIRECT, awaitGreeting, skipIntro } from './fixtures';

test.beforeEach(async ({ page }) => {
  await skipIntro(page);
});

/** The renderer's cap: a headless frame rate alone can sit under any cap, so this reads the cap itself. */
const cap = (page: Page) => page.evaluate(() => window.__nixRoom!.maxFps());

const pick = async (page: Page, word: string) => {
  await page.locator('.sys-row[data-row="fps"] i', { hasText: word }).click();
  await expect(page.locator('.sys-row[data-row="fps"] i.on')).toHaveText(word);
};

test('SYS → FRAME RATE starts at 60, caps the room live and stays picked over a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('.link')).toHaveAttribute('data-status', 'ok');
  await awaitGreeting(page);
  await page.locator('.hud-sys').click();
  await expect(page.locator('.sys-row[data-row="fps"] i.on')).toHaveText('60');
  await expect.poll(() => cap(page)).toBe(60);
  // The whole menu stays on the 900-tall stage with every row out.
  const box = await page.locator('.sys-menu').boundingBox();
  const stage = await page.locator('#game').boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(stage!.y + stage!.height);

  await pick(page, 'UNCAPPED');
  expect(await cap(page)).toBe(0);
  await pick(page, '30');
  expect(await cap(page)).toBe(30);

  // Under the map the room draws less; closing puts the pick back.
  await pick(page, '60');
  await page.keyboard.press('Escape');
  await page.locator('.hud-map').click();
  await expect(page.locator('.map-screen')).toBeVisible();
  await expect.poll(() => cap(page)).toBe(10);
  // The CRT's loops sit paused between the clock's ticks, and still move.
  const roll = () =>
    page.evaluate(() => {
      const a = document.querySelector('.map-roll')!.getAnimations()[0];
      return { state: a.playState, at: Number(a.currentTime) };
    });
  await expect.poll(async () => (await roll()).state).toBe('paused');
  const before = (await roll()).at;
  await expect.poll(async () => (await roll()).at).not.toBe(before);
  await page.keyboard.press('Escape');
  await expect.poll(() => cap(page)).toBe(60);
  await expect(page.locator('.map-screen')).toBeHidden();

  await page.locator('.hud-sys').click();
  await pick(page, '30');
  await page.reload();
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await page.locator('.hud-sys').click();
  await expect(page.locator('.sys-row[data-row="fps"] i.on')).toHaveText('30');
  await expect.poll(() => cap(page)).toBe(30);

  // The dev panel's FPS reads frames drawn, not monitor ticks: Pixi's own FPS read the ticks the cap skips.
  await page.waitForTimeout(1200);
  const reads: number[] = [];
  for (let i = 0; i < 10; i++) {
    reads.push(await page.evaluate(() => window.__nixRoom!.fps()));
    await page.waitForTimeout(97);
  }
  expect(Math.max(...reads)).toBeLessThanOrEqual(34);
  expect(Math.max(...reads)).toBeGreaterThan(0);
});
