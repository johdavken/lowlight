import { expect, test } from '@playwright/test';
import { skipOpeningCard } from './fixtures';

// The game's splash from the library (spec 2026-10-09 splash library §4). The e2e server's library
// (e2e/serve.ts) has the Nix image on and a second copy off.
test('splash library: the splash shows an image that is on, and the built-in when none is', async ({ browser }) => {
  const fresh = await browser.newContext();
  const page = await fresh.newPage();
  await page.goto('/');
  await expect(page.locator('img.splash-art')).toHaveAttribute('src', '/api/splash-art/nix-wall.webp');
  await expect(page.locator('.splash-mark')).toHaveCSS('left', '67px');
  await fresh.close();

  // Every image off (the list comes back empty): the built-in Nix image.
  const off = await browser.newContext();
  const page2 = await off.newPage();
  await page2.route('**/api/splashes', (r) => r.fulfill({ json: { splashes: [] } }));
  await page2.goto('/');
  await expect(page2.locator('img.splash-art')).toHaveAttribute('src', '/splash/nix-wall.webp');
  await off.close();
});

test('splash notice: shows at its panel, keys scroll it, a click on it stays, Enter goes on', async ({ browser }) => {
  const fresh = await browser.newContext();
  const page = await fresh.newPage();
  const text = Array.from({ length: 30 }, (_, i) => `Entry ${i}. Some words about entry ${i} that run on for a line or two in the panel.`).join('\n\n');
  await page.route('**/api/splashes', async (r) => {
    const body = await (await r.fetch()).json();
    body.notice = { title: "What's new", tag: 'PREVIEW 5', text: `Features\n\n${text}` };
    for (const s of body.splashes) s.panel = { x: 62, y: 556, width: 440, height: 340 };
    await r.fulfill({ json: body });
  });
  await page.goto('/');
  await skipOpeningCard(page);
  const scroll = page.locator('.sn-scroll');
  await expect(page.locator('.sn-title')).toHaveText("What's new");
  await expect(page.locator('.sn-rail i')).toHaveCount(30);
  await page.locator('.sn-wrap').click();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => scroll.evaluate((n) => n.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('End');
  await expect(page.locator('.sn-body')).toHaveClass(/at-end/);
  await expect(page.locator('.splash')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.splash')).toHaveCount(0);
  await fresh.close();
});
