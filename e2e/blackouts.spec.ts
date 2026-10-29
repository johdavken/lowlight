import { expect, test } from '@playwright/test';
import { DIRECT, awaitGreeting, send, skipSplash } from './fixtures';

// Blackouts phase 3 §3–§4: in a playthrough of its own (POWER OUT needs a story clock), the admin panel's POWER OUT
// darkens the room's district; the room, the HUD and the map follow. The playthrough it found is put back.
test.describe.configure({ mode: 'serial' });

let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  expect((await request.post('/api/playthroughs', { data: { player: 'cass', startContact: DIRECT.id } })).status()).toBe(200);
});
test.afterEach(async ({ request }) => {
  if (before) expect((await request.post(`/api/playthroughs/${before}/activate`)).status()).toBe(200);
});

test('POWER OUT darkens the room, says so on the HUD, and the map hears it', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const hudScene = page.locator('.hud-left .scene');
  await expect(hudScene).not.toHaveText('——');
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'noodle-stall', transition: 'fade' } });
  await expect(hudScene).toHaveText(/NOODLE/);
  await expect(page.locator('.hud-power')).toBeHidden();
  await send(page, { type: 'dev_action', tool: 'power_out', args: {} });
  await expect(page.locator('.hud-power')).toHaveText('KARASU · POWER OUT');
  await page.keyboard.press('Backquote');
  await expect(page.locator('.dp-light-row[data-light-id="stall_lantern"] .dp-light-intensity')).toHaveValue('0');
  // The admin panel is open, so its switches own the map; closing it brings the story's back.
  await page.keyboard.press('Backquote');
  await expect.poll(() => page.evaluate(() => window.__nixRoom!.mapDark!())).toEqual(['karasu']);
});
