import { expect, test } from '@playwright/test';
import { firstPlaythrough, nixAt, skipSplash } from './fixtures';

// The public repo has no restricted sounds (spec 2026-10-28 open-source release §3): the game skips
// what isn't on disk instead of asking for it. Trivially green here; the public export's gate.
test('no sound is asked for that the server does not list', async ({ page }) => {
  const listed = new Set(((await (await page.request.get('/api/sound-present')).json()) as { files: string[] }).files);
  expect(listed.size).toBeGreaterThan(0);
  // Every audio request, checked against the server's list: a /sound/ miss comes back as the page's
  // index.html with a 200 (the app's fallback), so a 404 alone wouldn't show it.
  const missing: string[] = [];
  page.on('request', (req) => {
    const { pathname } = new URL(req.url());
    if (!/^\/(sound|scenes)\/.*\.(ogg|mp3|wav|flac)$/i.test(pathname)) return;
    if (!listed.has(pathname.split('/').map(decodeURIComponent).join('/'))) missing.push(pathname);
  });

  // A room with a bed and an entry sound, then the MAP's cue (a /sound/ file).
  await skipSplash(page);
  await firstPlaythrough(page.request);
  await nixAt(page, 'noodle-stall', 'NOODLE STALL');
  await page.mouse.click(800, 300);
  await page.locator('.hud-map').click();
  await page.waitForTimeout(3000);
  expect(missing).toEqual([]);
});
