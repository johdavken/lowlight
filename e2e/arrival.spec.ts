import { expect, test, type Page } from '@playwright/test';
import { DIRECT, arriveGo, awaitGreeting, dialIn, orRequests, pickTitle, send, skipSplash, toTitle } from './fixtures';

const completions = async () => (await orRequests()).filter((r) => r.method === 'POST' && r.url.endsWith('/chat/completions') && r.body.stream !== false);
import { E2E_OPENING } from './serve';

// Each test starts a NEW GAME; the playthrough it found is put back afterwards, so the specs after this
// one in the worker (crew, jobs) don't play in it.
let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
});
test.afterEach(async ({ request }) => {
  if (before) expect((await request.post(`/api/playthroughs/${before}/activate`)).status()).toBe(200);
});

/** Screenshots for a look by eye, when ARRIVAL_SHOTS names a folder (spec 2026-10-27; not part of the check). */
const shot = async (page: Page, name: string) => {
  if (process.env.ARRIVAL_SHOTS) await page.screenshot({ path: `${process.env.ARRIVAL_SHOTS}/${name}.png` });
};

/** A new game with Nix, on the arrival screen's opening, ready for ENTER. */
async function toOpening(page: Page): Promise<void> {
  await skipSplash(page, { intro: true });
  // nix-direct starts at the Lowlight Intake, in Karasu.
  await dialIn(page, DIRECT.id);
  await expect(page.locator('.ar-rule')).toHaveText('OPENING AT');
  await expect(page.locator('.ar-name')).toHaveText('LOWLIGHT INTAKE');
  await expect(page.locator('.ar-sub')).toHaveText('KARASU · Old Town · The Ribbon');
  await expect(page.locator('.ar-with')).toHaveText('NIX COMES WITH YOU');
  // The greeting waits for the screen.
  expect(await page.evaluate(() => window.__nixRoom!.greeting())).toBe('waiting');
  await page.waitForFunction(() => window.__nixRoom?.intro() === 'ready');
}

/** From the room, the map's GO to Hae's Noodles: the arrival screen for it. */
async function goToHaes(page: Page): Promise<void> {
  await page.locator('.hud-map').click();
  await expect(page.locator('.map-strip')).toBeVisible();
  // The map remembers an open district: its band tile shows only while it's closed.
  const place = page.locator('.map-bt.place', { hasText: "Hae's Noodles" });
  if (!(await place.isVisible())) await page.locator('.map-bt.dist[data-id="karasu"]').click();
  await place.click();
  await page.locator('.map-strip .go').click();
  await expect(page.locator('#map')).toBeHidden();
  await expect(page.locator('.ar-rule')).toHaveText('HEADING TO');
  await expect(page.locator('.ar-name')).toHaveText("HAE'S NOODLES");
  await expect(page.locator('.ar-route')).toContainText('LOWLIGHT INTAKE');
  await expect(page.locator('.ar-move')).toHaveText("*Hicks and Nix head from Lowlight Intake to Hae's Noodles.*");
}

test('new game: an opening typed on the arrival screen is the scene card, then her greeting', async ({ page }) => {
  await toOpening(page);
  await page.locator('.ar-box textarea').fill('Rain on the glass, and the intake lights are down to one.');
  await shot(page, 'opening');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ar-root')).toHaveCount(0);
  await awaitGreeting(page);
  await expect(page.locator('.scene-entry .sb-text')).toHaveText('Rain on the glass, and the intake lights are down to one.');
  const greeting = (await completions()).at(-1)!.body.messages![0].content ?? '';
  expect(greeting).toContain('[scene: how this scene opens — "YOUR SCENE": Rain on the glass');
});

test('new game: an empty box is the plain greeting', async ({ page }) => {
  await toOpening(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.ar-root')).toHaveCount(0);
  await awaitGreeting(page);
  await expect(page.locator('.scene-entry')).toHaveCount(0);
  await expect(page.locator('#hud')).toBeVisible();
});

test('SUGGEST at the opening fills the box from the narrator', async ({ page }) => {
  await toOpening(page);
  await page.locator('.ar-suggest').click();
  await expect(page.locator('.ar-box textarea')).toHaveValue(E2E_OPENING.text, { timeout: 10_000 });
});

test('GO with a line: one travel row with both, and the room changes; BACK changes nothing', async ({ page }) => {
  await toOpening(page);
  await page.keyboard.press('Enter');
  await awaitGreeting(page);

  // BACK first: same room, no new row.
  const rows = await page.locator('#feed .msg').count();
  await goToHaes(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ar-root')).toHaveCount(0);
  await expect(page.locator('#feed .msg')).toHaveCount(rows);
  await expect(page.locator('.hud-left .scene')).toHaveText('LOWLIGHT INTAKE');

  // Then GO with a line.
  await goToHaes(page);
  await shot(page, 'travel');
  await arriveGo(page, 'Come on. Hae owes me a bowl.');
  const row = page.locator('#feed .msg.travel').last();
  await expect(row).toContainText("Hicks and Nix head from Lowlight Intake to Hae's Noodles.");
  await expect(row).toContainText('Come on. Hae owes me a bowl.');
  await expect(page.locator('#feed .msg.agent:visible .text').last()).toContainText(DIRECT.reply, { timeout: 10_000 });
  await expect(page.locator('.hud-left .scene')).toHaveText('NOODLE STALL');
});

test('CONTINUE: BACK AT, no box', async ({ page }) => {
  await toOpening(page);
  await page.keyboard.press('Enter');
  await awaitGreeting(page);
  await page.goto('/');
  await toTitle(page);
  await pickTitle(page, 'continue');
  await page.waitForURL(`**/room/${DIRECT.id}*`);
  await expect(page.locator('.ar-rule')).toHaveText('BACK AT');
  await expect(page.locator('.ar-box')).toHaveCount(0);
  await expect(page.locator('.ar-lore')).toContainText("Lowlight's oldest district");
  await shot(page, 'resume');
  await page.waitForFunction(() => window.__nixRoom?.intro() === 'ready');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ar-root')).toHaveCount(0);
});

test('GO refused while she is busy: the notice shows on the screen, the line stays, and GO goes again', async ({ page }) => {
  await toOpening(page);
  await page.keyboard.press('Enter');
  await awaitGreeting(page);
  await goToHaes(page);
  await page.locator('.ar-box textarea').fill('Come on. Hae owes me a bowl.');
  // She starts a reply held open for a few seconds (another tab, say) while the screen is up: the map's GO
  // was free when pressed, so the server is the one that refuses ("wait for her to finish").
  await send(page, { type: 'user_message', text: 'len:400 chunk:20 every:300' });
  await expect(page.locator('.input.busy')).toHaveCount(1, { timeout: 10_000 });
  await page.locator('.ar-go').click();
  await expect(page.locator('.ar-notice')).toHaveText('wait for her to finish');
  await expect(page.locator('.ar-root')).not.toHaveClass(/ar-moving/);
  await expect(page.locator('.ar-box textarea')).toHaveValue('Come on. Hae owes me a bowl.');
  await expect(page.locator('.ar-back')).toBeEnabled();
  await expect(page.locator('.hud-left .scene')).toHaveText('LOWLIGHT INTAKE');
  await shot(page, 'refused');
  // Once her reply is in, the same GO moves you, with the line kept.
  await expect(page.locator('.input.busy')).toHaveCount(0, { timeout: 30_000 });
  await page.locator('.ar-go').click();
  await expect(page.locator('.ar-root')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('#feed .msg.travel').last()).toContainText('Come on. Hae owes me a bowl.');
  await expect(page.locator('.hud-left .scene')).toHaveText('NOODLE STALL');
});

test('new game: a reconnect before ENTER still sends the opening, with the one greeting', async ({ page }) => {
  // Every room socket the page opens, so the test can drop one as a network blip would.
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    const rooms: WebSocket[] = [];
    (window as unknown as { __roomSockets: WebSocket[] }).__roomSockets = rooms;
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (String(url).includes('/ws/')) rooms.push(this);
      }
    };
  });
  await toOpening(page);
  await page.locator('.ar-box textarea').fill('Rain on the glass, and the intake lights are down to one.');
  await page.evaluate(() => (window as unknown as { __roomSockets: WebSocket[] }).__roomSockets[0].close());
  await page.waitForFunction(() => (window as unknown as { __roomSockets: WebSocket[] }).__roomSockets.length === 2 && window.__nixRoom!.connected());
  // The screen is still the opening, the line kept, and the greeting still waits for it.
  await expect(page.locator('.ar-rule')).toHaveText('OPENING AT');
  await expect(page.locator('.ar-box textarea')).toHaveValue('Rain on the glass, and the intake lights are down to one.');
  expect(await page.evaluate(() => window.__nixRoom!.greeting())).toBe('waiting');
  const before = (await completions()).length;
  await page.keyboard.press('Enter');
  await expect(page.locator('.ar-root')).toHaveCount(0);
  await awaitGreeting(page);
  await expect(page.locator('.scene-entry .sb-text')).toHaveText('Rain on the glass, and the intake lights are down to one.');
  const greetings = (await completions()).slice(before).filter((r) => (r.body.messages?.[0].content ?? '').includes('[scene: how this scene opens'));
  expect(greetings).toHaveLength(1);
  await expect(page.locator('#feed .msg.greet')).toHaveCount(1);
});

test("GO's screen keeps the clock: a WAIT while it's up shows the new time", async ({ page }) => {
  await toOpening(page);
  await page.keyboard.press('Enter');
  await awaitGreeting(page);
  await goToHaes(page);
  const shown = await page.locator('.ar-meta').textContent();
  expect(shown).not.toBe('');
  await page.evaluate(async () => {
    const r = await fetch('/api/playthroughs/active/wait', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ minutes: 90 }) });
    if (!r.ok) throw new Error(`wait: ${r.status}`);
  });
  await expect(page.locator('.ar-meta')).not.toHaveText(shown!);
});
