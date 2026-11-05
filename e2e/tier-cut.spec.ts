import { expect, test, type Page } from '@playwright/test';
import { awaitGreeting, DIRECT, goIn, send, skipSplash, startQuest } from './fixtures';

// The tier cut (spec 2026-11-03): Two Step at the Intake (e2e/serve.ts), in a playthrough of its own as Cass, who starts
// Trusted in Karasu (NIX_TEST_REP), so the other specs' player keeps a Nobody's boards. The playthrough it found is put back.
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

async function room(page: Page): Promise<{ greetingId: string; errors: string[] }> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await enter(page);
  if ((await scene(page).textContent()) !== 'LOWLIGHT INTAKE') {
    await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
    await expect(scene(page)).toHaveText('LOWLIGHT INTAKE', { timeout: 10_000 });
    // A dev move sends no quest state: load the room again so the board arrives.
    await enter(page);
  }
  const greetingId = (await page.locator('.msg.agent.s-ok').last().getAttribute('data-id'))!;
  return { greetingId, errors };
}

test('tier 2: SETUP says so, a card shows the cut, a called recruit lifts it (tier effect spec)', async ({ page }) => {
  await room(page);
  // Trusted rep hires HAND or PRO at the Intake: either matches tier 2.
  await page.keyboard.press('Alt+KeyK');
  await expect(page.locator('.crew-screen')).toBeVisible();
  await page.locator('.cr-tab[data-tab="hire"]').click();
  await page.locator('.cr-card:not(.locked)').first().locator('.cr-btn', { hasText: 'HIRE' }).click();
  await page.locator('.cr-tab[data-tab="roster"]').click();
  const rid = (await page.locator('.cr-tiles > .cr-tile[data-id]').first().getAttribute('data-id'))!;
  await page.keyboard.press('Escape');
  await expect(page.locator('.crew-screen')).toBeHidden();

  await page.locator('.hud-quest').click();
  await startQuest(page, 'Two Step');
  await expect(page.locator('.ts-tierline')).toContainText('TIER 2');
  await page.screenshot({ path: 'test-results/tier-setup.png' });
  await page.locator(`.ts-ready .tb-slot[data-id="${rid}"]`).click();
  await goIn(page);

  const talk = page.locator('.tb-card[data-choice="talk"]');
  await expect(talk.locator('.tb-tag.tier')).toHaveText('TIER 2 −1', { timeout: 10_000 });
  await expect(talk.locator('.tb-eff')).toHaveText('SMALL');
  await page.locator(`.g-people .tb-slot[data-id="${rid}"]`).click();
  await expect(talk.locator('.tb-tag.tier.lifted')).toHaveText(/ · (HAND|PRO)$/);
  await expect(talk.locator('.tb-eff')).toHaveText('FAIR');
  await page.screenshot({ path: 'test-results/tier-cut.png' });

  // Hover info: rest on a card and it says what the roll would do; a click closes it.
  const panel = page.locator('.tb-info');
  await expect(panel).toBeHidden();
  await talk.hover();
  await expect(panel).toBeVisible({ timeout: 3_000 });
  await expect(panel).toContainText('Tier cut lifted by');
  await expect(panel).toContainText('FAIR: a crit fills 3 TAKE');
  await page.screenshot({ path: 'test-results/card-info.png' });
  // It sits beside the card, never over it.
  const [a, b] = [(await talk.boundingBox())!, (await panel.boundingBox())!];
  expect(b.x >= a.x + a.width || b.x + b.width <= a.x).toBe(true);
  await page.mouse.move(5, 5);
  await expect(panel).toBeHidden();
});
