import { expect, test } from '@playwright/test';
import { DIRECT, awaitGreeting, skipSplash } from './fixtures';

// The deck (spec 2026-10-23): texting from a phone-sized screen, in a playthrough of its own as Cass. The
// playthrough it found is put back.
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 375, height: 812 } });

let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  expect((await request.post('/api/playthroughs', { data: { player: 'cass', startContact: DIRECT.id } })).status()).toBe(200);
});
test.afterEach(async ({ request }) => {
  if (before) expect((await request.post(`/api/playthroughs/${before}/activate`)).status()).toBe(200);
});

const active = async (request: import('@playwright/test').APIRequestContext) => {
  const list = (await (await request.get('/api/playthroughs')).json()) as { active: string; playthroughs: { id: string; location: unknown; solo?: boolean }[] };
  return list.playthroughs.find((p) => p.id === list.active)!;
};

test('texts Nix from the deck; you stay where you were', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const was = await active(request);
  await page.goto('/deck');
  const nix = page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() });
  await expect(nix).toBeVisible();
  await expect(page.locator('.dk-bar')).toContainText('CORTEX//RELAY');
  await nix.click();
  await expect(page.locator('.dk-name')).toHaveText(DIRECT.name.toUpperCase());
  await page.locator('.dk-box').fill('you on shift?');
  await page.locator('.dk-send').click();
  await expect(page.locator('.dk-me')).toHaveText('you on shift?');
  await expect(page.locator('.dk-her')).toHaveText(['till four', 'slow night', 'roof. 4:15']);
  await expect(page.locator('.dk-typing')).toHaveCount(0);
  const now = await active(request);
  expect(now.location).toEqual(was.location);
  expect(now.solo ?? false).toBe(was.solo ?? false);
  expect(errors).toEqual([]);
});

test('back returns to the list, with her last text on her row', async ({ page }) => {
  await page.goto('/deck');
  await page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() }).click();
  await page.locator('.dk-box').fill('hey');
  await page.locator('.dk-send').click();
  await expect(page.locator('.dk-her')).toHaveCount(3);
  await page.goBack();
  await expect(page.locator('.dk-title')).toHaveText('MESSAGES');
  await expect(page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() }).locator('.dk-rlast')).toHaveText('roof. 4:15');
});

test('a draft typed while she replies survives her reply, focus and all (final review I1)', async ({ page }) => {
  await page.goto('/deck');
  await page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() }).click();
  const box = page.locator('.dk-box');
  await box.fill('first');
  await page.locator('.dk-send').click();
  await box.focus();
  await box.pressSequentially('half a tho');
  await expect(page.locator('.dk-her')).toHaveCount(3);
  await expect(box).toHaveValue('half a tho');
  await expect(box).toBeFocused();
});

test('the input stays inside the screen with the keyboard up', async ({ page }) => {
  await page.goto('/deck');
  await page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() }).click();
  // A phone keyboard: the visual viewport shrinks to 420 px.
  await page.evaluate(() => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: Object.assign(new EventTarget(), { height: 420, width: 375 }) });
  });
  await page.locator('.dk-box').focus();
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  const box = await page.locator('.dk-input').boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(420);
});

test("with her: the thread is read-only, SHE'S RIGHT HERE", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/deck');
  await page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() }).click();
  await expect(page.locator('.dk-ro-why')).toHaveText("SHE'S RIGHT HERE");
  await expect(page.locator('.dk-input')).toHaveCount(0);
  // STEP OUT: her goodbye in the scene, then you're on your own and can text her.
  await page.locator('.dk-stepout').click();
  await expect(page.locator('.dk-box')).toBeVisible({ timeout: 15_000 });
  await page.locator('.dk-box').fill('miss me?');
  await page.locator('.dk-send').click();
  await expect(page.locator('.dk-her')).toHaveText(['till four', 'slow night', 'roof. 4:15']);
});

test('PASS TIME from the clock moves the story clock', async ({ page }) => {
  await page.goto('/deck');
  await page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() }).click();
  const clock = page.locator('.dk-clock');
  await expect(clock).not.toHaveText('PASS TIME');
  const before = await clock.textContent();
  await clock.click();
  await page.locator('.dk-wait', { hasText: '+1 HOUR' }).click();
  await expect(page.locator('.dk-sheet')).toHaveCount(0);
  await expect(clock).not.toHaveText(before!);
  const [h, m] = before!.match(/\d\d:\d\d/)![0].split(':').map(Number);
  await expect(clock).toContainText(`${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
});

test("she texts when she said she would: unread on the deck, NIX · 1 TEXT in the room (promised texts)", async ({ page, context }) => {
  await page.goto('/deck');
  await page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() }).click();
  await page.locator('.dk-box').fill('text me in an hour');
  await page.locator('.dk-send').click();
  await expect(page.locator('.dk-her')).toHaveCount(3);
  // The scribe runs after her reply: give it a moment to record the promise.
  await page.waitForTimeout(1500);
  await page.goBack();
  await expect(page.locator('.dk-title')).toHaveText('MESSAGES');
  await page.locator('.dk-clock').click();
  await page.locator('.dk-wait', { hasText: '+4 HOURS' }).click();
  const row = page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() });
  await expect(row.locator('.dk-unread')).toBeVisible({ timeout: 15_000 });
  // The desktop room hears it.
  const room = await context.newPage();
  await room.setViewportSize({ width: 1600, height: 900 });
  await skipSplash(room);
  await room.goto(`/room/${DIRECT.id}`);
  await expect(room.locator('.hud-texts')).toHaveText(`${DIRECT.name.toUpperCase()} · 1 TEXT`);
  // Opening her thread reads it: her text sits an hour after yours, before the clock you jumped to.
  await row.click();
  await expect(page.locator('.dk-her')).toHaveCount(6);
  const dividers = await page.locator('.dk-divider').allTextContents();
  expect(dividers.length).toBeGreaterThanOrEqual(2);
  await expect(room.locator('.hud-texts')).toBeHidden();
  await room.close();
});

test('REGEN gives her a second take; swipe back to the first (deck controls)', async ({ page }) => {
  await page.goto('/deck');
  await page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() }).click();
  await page.locator('.dk-box').fill('hey');
  await page.locator('.dk-send').click();
  await expect(page.locator('.dk-her')).toHaveCount(3);
  await page.locator('.dk-her').last().click({ button: 'right' });
  await page.locator('.dk-m-regen').click();
  await page.waitForTimeout(500);
  await page.locator('.dk-her').last().click({ button: 'right' });
  await expect(page.locator('.dk-takes')).toHaveText('2/2');
  await page.locator('.dk-prev').click();
  await page.locator('.dk-her').last().click({ button: 'right' });
  await expect(page.locator('.dk-takes')).toHaveText('1/2');
});

test('DELETE a text and the ones after it, after asking (deck controls)', async ({ page }) => {
  await page.goto('/deck');
  await page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() }).click();
  for (const t of ['first one', 'second one']) {
    await page.locator('.dk-box').fill(t);
    await page.locator('.dk-send').click();
    await expect(page.locator('.dk-me', { hasText: t })).toBeVisible();
    await expect(page.locator('.dk-typing')).toHaveCount(0);
  }
  await page.locator('.dk-me', { hasText: 'first one' }).click({ button: 'right' });
  await page.locator('.dk-m-delete').click();
  await expect(page.locator('.dk-confirm')).toContainText('DELETE THIS AND 3 AFTER?');
  await page.locator('.dk-yes').click();
  await expect(page.locator('.dk-me', { hasText: 'first one' })).toHaveCount(0);
  await expect(page.locator('.dk-me', { hasText: 'second one' })).toHaveCount(0);
});

test('she texts when she gets home: the place path (deck controls)', async ({ page }) => {
  await page.goto('/deck');
  await page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() }).click();
  await page.locator('.dk-box').fill("text me when you're home");
  await page.locator('.dk-send').click();
  await expect(page.locator('.dk-her')).toHaveCount(3);
  await page.goBack();
  const row = page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() });
  // Pass time until her text lands (the scribe records the promise just after her reply).
  await expect
    .poll(
      async () => {
        await page.locator('.dk-clock').click();
        await page.locator('.dk-until').fill('06:00');
        await page.locator('.dk-until-go').click();
        return row.locator('.dk-unread').count();
      },
      { timeout: 15_000, intervals: [500, 1000, 2000] },
    )
    .toBe(1);
  await row.click();
  // Stamped 05:xx, when she got home — not 06:00.
  await expect(page.locator('.dk-divider').last()).toContainText(' 05:');
});


test('PASS TIME on the list moves the clock shown there too', async ({ page }) => {
  await page.goto('/deck');
  await page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() }).click();
  await expect(page.locator('.dk-clock')).not.toHaveText('PASS TIME');
  await page.goBack();
  const clock = page.locator('.dk-clock');
  const before = (await clock.textContent())!;
  await clock.click();
  await page.locator('.dk-wait', { hasText: '+1 HOUR' }).click();
  await expect(clock).not.toHaveText(before);
});

test('she texts a photo: the bubble shows it, a tap opens it full screen (photos spec §8)', async ({ page }) => {
  await page.goto('/deck');
  await page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() }).click();
  await page.locator('.dk-box').fill('send a pic');
  await page.locator('.dk-send').click();
  const img = page.locator('.dk-photo img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await page.locator('.dk-photo').click();
  await expect(page.locator('.dk-viewer img')).toBeVisible();
  await page.locator('.dk-viewer').click();
  await expect(page.locator('.dk-viewer')).toHaveCount(0);
  await page.goBack();
  await expect(page.locator('.dk-row', { hasText: DIRECT.name.toUpperCase() }).locator('.dk-rlast')).toContainText('PHOTO');
});
