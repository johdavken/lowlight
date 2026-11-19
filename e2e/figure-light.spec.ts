import { expect, test, type Page } from '@playwright/test';
import { DIRECT, awaitGreeting, skipSplash } from './fixtures';

// The figure light (figure lighting spec 2026-11-16): a sprite figure is lit through its normal map in a
// canvas over its art; without a map, or with SYS → FIGURE LIGHT off, it keeps the flat tint.

test.beforeEach(async ({ page }) => {
  await skipSplash(page);
});

async function openRoom(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
}

const contact = (page: Page) => page.locator('.stage-figure.stage-right');

test('a sprite figure in a room is lit through its map', async ({ page }) => {
  // The figure shader (lighting, finish, breath) compiles: a GLSL error logs `[figure-light]` and leaves her on the tint.
  const shaderErrors: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('[figure-light]')) shaderErrors.push(m.text());
  });
  const maps: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('normal=1')) maps.push(`${r.status()} ${r.headers()['content-type']}`);
  });
  await openRoom(page);
  await expect(contact(page)).toHaveAttribute('data-lit', '', { timeout: 15_000 });
  const canvas = contact(page).locator('.stage-art canvas.stage-lit');
  await expect(canvas).toHaveCount(1);
  const size = await canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height, c.getBoundingClientRect().width]);
  expect(size[0]).toBeGreaterThan(0);
  expect(size[1]).toBeGreaterThan(0);
  expect(size[2]).toBeGreaterThan(0);
  expect(maps.some((m) => m.startsWith('200 image/png'))).toBe(true);
  // She wears the room's finish, so she's drawn at screen resolution (her scanlines land on the room's rows).
  const res = await canvas.evaluate((c: HTMLCanvasElement) => ({ w: c.width, css: c.getBoundingClientRect().width * devicePixelRatio }));
  expect(Math.abs(res.w - res.css)).toBeLessThanOrEqual(2);
  expect(shaderErrors).toEqual([]);
  // Her own art steps aside while the canvas draws her.
  expect(await contact(page).locator('.stage-art').evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none');
});

test('a figure whose map fails keeps the tint', async ({ page }) => {
  await page.route('**/*normal=1*', (route) => route.fulfill({ status: 404, body: '{"error":"no normal map"}' }));
  await openRoom(page);
  await expect(contact(page)).toHaveAttribute('data-kind', 'sprite');
  await page.waitForTimeout(1500);
  await expect(contact(page)).not.toHaveAttribute('data-lit', '');
  await expect(contact(page).locator('canvas.stage-lit')).toHaveCount(0);
  expect(await contact(page).locator('.stage-art').evaluate((el) => getComputedStyle(el).backgroundImage)).not.toBe('none');
});

test('SYS FIGURE LIGHT off puts every figure back on the tint', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lowlight.figureLight', 'off'));
  await openRoom(page);
  await expect(contact(page)).toHaveAttribute('data-kind', 'sprite');
  await page.waitForTimeout(1500);
  await expect(page.locator('.stage-figure[data-lit]')).toHaveCount(0);
});
