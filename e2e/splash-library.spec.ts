import { expect, test } from '@playwright/test';

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
