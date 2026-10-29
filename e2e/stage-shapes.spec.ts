import { expect, test, type Page } from '@playwright/test';
import { DIRECT, awaitGreeting, send, skipSplash } from './fixtures';

// The fixed 16:9 stage (spec 2026-10-16): the room's UI keeps its place on the stage at any window shape
// (a flat room fills the stage; a 480 room keeps whole steps inside it — stageView's unit tests).

test.beforeEach(async ({ page }) => {
  await skipSplash(page);
});

async function openRoom(page: Page, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('.link')).toHaveAttribute('data-status', 'ok');
  await awaitGreeting(page);
  // A long reply another test on this worker's server sent may still be streaming: a line sent now would be dropped.
  await expect(page.locator('.input.busy')).toHaveCount(0, { timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** The box, the top bar and the first figure, as fractions of the stage's rect, once nothing is easing. */
async function placesOnRoom(page: Page): Promise<Record<string, number[]>> {
  // The box eases in and grows; the type cursor blinks forever, so only finite animations are waited for.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
  return page.evaluate(() => {
    const room = document.getElementById('game')!.getBoundingClientRect();
    const on = (sel: string) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return [(r.left - room.left) / room.width, (r.top - room.top) / room.height, r.width / room.width, r.height / room.height];
    };
    return { box: on('.feed'), bar: on('.hud-root'), figure: on('.stage-figure') };
  });
}

async function settle(page: Page, w: number, h: number): Promise<void> {
  await page.setViewportSize({ width: w, height: h });
  // Wait until the stage has refit to the new window.
  await page.waitForFunction(([ww, hh]) => Math.abs(document.getElementById('game')!.getBoundingClientRect().width - 1600 * Math.min(ww / 1600, hh / 900)) < 2, [w, h]);
  await page.waitForTimeout(300);
}

test('the box, the top bar and a figure keep their place on the stage at 16:9, 16:10, 21:9 and tall, and after a resize', async ({ page }) => {
  await openRoom(page, 1600, 900);
  // A short reply, so the box is at rest: a long one left by another test on this worker's server can
  // wrap a line differently at a tiny zoom (the font's metrics at that pixel size), growing the box.
  const replies = page.locator('#feed .msg.agent');
  const before = await replies.count();
  await send(page, { type: 'user_message', text: 'len:40' });
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  await expect(replies.last()).toHaveClass(/s-ok/, { timeout: 10_000 });
  const at169 = await placesOnRoom(page);
  for (const [w, h] of [[1440, 900], [2560, 1080], [900, 1200], [1440, 900]] as const) {
    // The last shape is reached by resizing a loaded room (Review Focus 5).
    await settle(page, w, h);
    const here = await placesOnRoom(page);
    for (const k of Object.keys(at169)) {
      // Within 1.5 stage px (the zoomed stage snaps its layout to whole device px).
      at169[k].forEach((v, i) => expect(Math.abs(here[k][i] - v) * (i % 2 ? 900 : 1600), `${k}[${i}] at ${w}×${h}`).toBeLessThanOrEqual(1.5));
    }
  }
});

test('a tall, small window still takes clicks on the stage: SYS opens (Review Focus 4)', async ({ page }) => {
  await openRoom(page, 900, 1200);
  await page.locator('.hud-sys').click();
  await expect(page.locator('.sys-menu')).toBeVisible();
});

test('TEXT SIZE 150 % pages a reply that fits at 100 %', async ({ page }) => {
  await openRoom(page, 1600, 900);
  const replies = page.locator('#feed .msg.agent');
  const reply = async () => {
    const before = await replies.count();
    await send(page, { type: 'user_message', text: 'len:880' });
    await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
    await expect(replies.last()).toHaveClass(/s-ok/, { timeout: 10_000 });
  };
  await reply();
  await expect(page.locator('button.continue')).toHaveCount(0);

  await page.locator('.hud-sys').click();
  await expect(page.locator('.sys-menu')).toBeVisible();
  for (let i = 0; i < 5 && (await page.locator('.sys-row.on').getAttribute('data-row')) !== 'size'; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('.sys-row.on')).toHaveAttribute('data-row', 'size');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('.sys-size')).toHaveText('‹ 150% ›');
  await page.keyboard.press('Escape');

  await expect(page.locator('button.continue')).toHaveText(/\[CONTINUE ▸ 1\/[2-9]\]/);
  // The setting is kept for the next page load.
  expect(await page.evaluate(() => localStorage.getItem('lowlight.textSize'))).toBe('150');
});
