import { expect, test, type Page } from '@playwright/test';
import { DIRECT, awaitGreeting, send, skipSplash } from './fixtures';

// Comms (spec 2026-10-20): in a playthrough of its own as Cass (high trust with Nix, NIX_TEST_TRUST), strike the deal with
// Chair Test at the Tilt, go ON COMMS to the Ferry Stairs, then HANG UP and walk out. The playthrough it found is put back.
test.describe.configure({ mode: 'serial' });

let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  expect((await request.post('/api/playthroughs', { data: { player: 'cass', startContact: DIRECT.id } })).status()).toBe(200);
});
test.afterEach(async ({ request }) => {
  if (before) expect((await request.post(`/api/playthroughs/${before}/activate`)).status()).toBe(200);
});

const scene = (page: Page) => page.locator('.hud-left .scene');
async function enter(page: Page): Promise<void> {
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await expect(scene(page)).not.toHaveText('——');
}

test('on comms: you go, she stays on the line; HANG UP ends it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await enter(page);
  if ((await scene(page).textContent()) !== 'THE TILT') {
    await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'the-tilt', transition: 'fade' } });
    await expect(scene(page)).toHaveText('THE TILT', { timeout: 10_000 });
    await enter(page);
  }
  const replies = page.locator('.msg.agent.s-ok');
  const start = await replies.count();

  // The deal.
  await page.locator('.hud-quest').click();
  await page.locator('.ql-row', { hasText: 'Chair Test' }).locator('.ql-start').click();
  await page.locator('.qc-card[data-choice="deal"]').click();
  await expect(replies).toHaveCount(start + 2, { timeout: 10_000 });

  // The map offers both ways to go: WITH HER and ON COMMS (a look at the pair).
  await page.locator('.hud-map').click();
  await page.locator('.city-map .map-bt.place', { hasText: /second socket/i }).click();
  await expect(page.locator('.map-strip .go-pair .go')).toHaveText('WITH HER');
  await expect(page.locator('.map-strip .go-pair .go-comms')).toHaveText('ON COMMS');
  // Esc closes the place's strip, then the map.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('#map')).toBeHidden();

  // ON COMMS to the Ferry Stairs: the room is yours, she's on the monitor.
  await send(page, { type: 'travel', place: 'ferry-stairs', comms: true });
  await expect(scene(page)).toHaveText('THE FERRY STAIRS', { timeout: 15_000 });
  await expect(replies).toHaveCount(start + 3, { timeout: 10_000 });
  await expect(page.locator('#stage-figures.on-comms')).toHaveCount(1);
  await expect(page.locator('.ci .ci-cap')).toHaveText(/^ON COMMS · .+$/);
  await expect(page.locator('#whos-here .wh-role', { hasText: 'ON COMMS' })).toHaveCount(1);
  await expect(page.locator('.key[data-key="leave"] .lb')).toHaveText('HANG UP');
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/comms-on.png' });

  // HANG UP: her sign-off, then straight to /solo (no STAY with her: she isn't here).
  await page.locator('.key[data-key="leave"]').click();
  await page.waitForURL('**/solo', { timeout: 15_000 });
  expect(errors).toEqual([]);
  // Leave no tab behind to follow the playthrough switch in afterEach into the other specs' world.
  await page.goto('about:blank');
});
