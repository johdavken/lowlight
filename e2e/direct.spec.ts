import { expect, test, type Page } from '@playwright/test';
import type { NixRoomTestHook } from '../web/src/main';
import { arriveGo, DIRECT, SECOND, STUB_OR_LOG_PORT, awaitGreeting, dialIn, lockPlayer, newGame, phase, send, showTile, skipSplash, skipIntro } from './fixtures';
import { E2E_ENCOUNTERS, E2E_GIG, E2E_SUGGESTION, E2E_SUGGESTION_PUSH } from './serve';

// Rooms here skip the district load screen (arrival.spec covers it).
test.beforeEach(async ({ page }) => {
  await skipIntro(page);
});

declare global {
  interface Window {
    __nixRoom?: NixRoomTestHook;
  }
}

type OrRequest = { method: string; url: string; body: { stream?: boolean; model?: string; temperature?: number; messages?: { role: string; content: string | null }[] } };
const orRequests = async (): Promise<OrRequest[]> => (await (await fetch(`http://127.0.0.1:${STUB_OR_LOG_PORT}/`)).json()) as OrRequest[];
// Her turns only: the Residual's and the narrators' calls are non-streaming.
const completions = async () => (await orRequests()).filter((r) => r.method === 'POST' && r.url.endsWith('/chat/completions') && r.body.stream !== false);

test('nix-direct: a reply on GLM, a tool call, switching model, regenerate, a credit notice', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  // Her model is a setting (shared across the suite): start her on her default, GLM.
  expect((await page.request.post(`/api/agents/${DIRECT.id}/model`, { data: { model: null } })).status()).toBe(204);

  // The select screen: her tile is live, her file shows her model, and the model step lists the catalog.
  await skipSplash(page);
  await newGame(page);
  await expect(page.locator(`.tile[data-id="${DIRECT.id}"]`)).not.toHaveClass(/offline/);
  await lockPlayer(page, 'hicks');
  await page.locator(`.tile[data-id="${DIRECT.id}"]`).hover();
  await expect(page.locator('.fighter.p2 .fighter-file')).toContainText('GLM 5.2');
  await page.locator(`.tile[data-id="${DIRECT.id}"]`).click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'model');
  await expect(page.locator('.model-band .mp-row.on .mp-label')).toHaveText('GLM 5.2');
  // Her current model, then the recent ones (the shipped picks aren't in the fake catalog, so they hide).
  await expect(page.locator('.model-band .mp-row')).toHaveCount(DIRECT.models.length);
  await expect(page.locator('.model-band .mb-summary')).toContainText('$9.50');
  await page.keyboard.press('Enter'); // keep GLM
  await expect(phase(page)).toHaveAttribute('data-phase', 'ready');
  await page.keyboard.press('Enter');
  await page.waitForURL(`**/room/${DIRECT.id}*`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  // A first meeting: her greeting lands before the replies this test counts.
  await awaitGreeting(page);
  const box = page.locator('.msg:not(.hidden-collapsed)').last();
  const say = async (text: string) => {
    const before = await page.locator('.msg.agent.s-ok').count();
    await send(page, { type: 'user_message', text });
    await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
  };

  // A reply streams into the box with its model tag; the HUD shows her model.
  await say('hello');
  await expect(box.locator('.text')).toContainText('GLM reply');
  await expect(box.locator('.model-tag')).toHaveText('GLM 5.2');
  await expect(page.locator('.hud-model')).toHaveText('GLM 5.2 ›');
  const first = (await completions()).at(-1)!;
  expect(first.body.model).toBe('z-ai/glm-5.2');
  expect(first.body.messages![0].content).toContain('You are Nix Neon.');

  // A tool call: the lamp goes dark, the result goes back, she answers.
  await say('dim the lamp');
  const afterTool = (await completions()).at(-1)!;
  expect(afterTool.body.messages!.find((m) => m.role === 'tool')!.content).toMatch(/^applied: /);
  expect(afterTool.body.messages!.find((m) => m.role === 'tool')!.content).toMatch(/desk lamp/i);

  // MODEL → Gemini: the next turn uses it.
  await page.locator('.hud-sys').click();
  await page.locator('.sys-row[data-row="model"]').click();
  await expect(page.locator('.sys-menu')).toBeHidden();
  await expect(page.locator('.mm-credit')).toHaveText('$9.50 LEFT');
  await page.locator('.mm-row', { hasText: 'Gemini 3.8 Flash' }).click();
  await expect(page.locator('.hud-model')).toHaveText('GEMINI 3.8 FLASH ›');
  await say('and now?');
  expect((await completions()).at(-1)!.body.model).toBe('google/gemini-3.8-flash');

  // REGENERATE: a second take from the new model, a little warmer.
  await page.locator('.line-keys button.key', { hasText: 'REGENERATE' }).click();
  await expect(box.locator('.takes-n')).toHaveText('2/2', { timeout: 10_000 });
  const regen = (await completions()).at(-1)!;
  expect(regen.body.model).toBe('google/gemini-3.8-flash');
  expect(regen.body.temperature).toBeCloseTo(1.1);

  // Out of credit: a quiet line in the box.
  await send(page, { type: 'user_message', text: 'out of credit' });
  await expect(page.locator('#feed')).toContainText('// OPENROUTER CREDIT IS OUT', { timeout: 10_000 });

  expect(errors).toEqual([]);
});

test("Hae at the noodle stall: a tile in the who's-here strip, her own page, on the map, gone at the rooftop", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=hicks`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const greetingId = (await page.locator('.msg.agent.s-ok').last().getAttribute('data-id'))!;
  const hae = page.locator('#whos-here .wh-tile[data-id="hae"]');

  // Walk to the stall: her row joins the party window, in full colour.
  await page.locator('.hud-map').click();
  // It opens on the whole city with no card (map pins spec §1); a pin's click opens its card.
  const world = page.locator('.map-world');
  await expect(page.locator('#map .pin.here')).toBeAttached();
  await expect(world).toHaveAttribute('style', /scale\(1\)/);
  await expect(page.locator('.map-strip')).toHaveCount(0);
  await page.locator('.city-map .pin[data-place="haes-noodles"]').dispatchEvent('click');
  const strip = page.locator('.map-strip');
  await expect(strip).toContainText('HAE');
  await expect(strip).toContainText('FIXED');
  // GO rides on the picked pin's name tag.
  await page.locator('.map-go .go').click();
  await expect(page.locator('#map')).toBeHidden();
  await arriveGo(page);
  await expect(hae).toBeVisible({ timeout: 10_000 });
  await expect(hae).toContainText('HAE');
  await expect(hae).not.toHaveClass(/wh-lit/);
  await expect(hae.locator('.wh-role')).toHaveText('WORKS HERE');
  await expect(page.locator('.stage-centre')).toHaveCount(0);
  await expect(page.locator('.msg.agent.s-ok')).not.toHaveCount(0, { timeout: 10_000 });

  // She's in the prompt there.
  const before = await page.locator('.msg.agent.s-ok').count();
  await send(page, { type: 'user_message', text: 'a bowl, Hae' });
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
  const sent = (await completions()).at(-1)!;
  expect(sent.body.messages![0].content).toContain('Hae (she) is here');

  // Nix's beat first, then Hae's own page with her nameplate, lit.
  const box = page.locator('.msg:not(.hidden-collapsed)').last();
  await expect(box.locator('.meta .name')).toHaveText('NIX');
  await expect(page.locator('.stage-right')).toHaveClass(/speaking/);
  await expect(box.locator('button.continue')).toHaveText('[CONTINUE ▸ 1/2]');
  // While her page is still typing, the first click finishes it; the next turns to Hae's page.
  // Her page is the last: once there, the button is gone, so click only until her name shows.
  await expect(async () => {
    if ((await box.locator('.meta .name').textContent()) !== 'HAE') await box.locator('button.continue').click({ timeout: 1_000 });
    await expect(box.locator('.meta .name')).toHaveText('HAE', { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await expect(box.locator('button.continue')).toHaveCount(0);
  await expect(box.locator('.beat[data-who="other"]')).toContainText('Pork broth');
  await expect(hae).toHaveClass(/wh-lit/);
  await expect(page.locator('.stage-right')).not.toHaveClass(/speaking/);
  // Speaking, her row in the party window gets the lit border and the speaker icon.
  await expect(hae.locator('.wh-speaker')).toBeVisible();
  await expect(page.locator('#whos-here .wh-speaker')).toHaveCount(1);
  // Every face fills its frame and stays inside it (a 208×240 thumb once hung 8px below the border).
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('#whos-here .wh-face img')].every((i) => i.complete));
  const faces = await page.locator('#whos-here .wh-face').evaluateAll((els) =>
    els.flatMap((f) => {
      const img = f.querySelector('img');
      if (!img) return [];
      const a = f.getBoundingClientRect();
      const b = img.getBoundingClientRect();
      return [{ top: b.top - a.top, bottom: a.bottom - b.bottom, left: b.left - a.left, right: a.right - b.right }];
    }),
  );
  expect(faces.length).toBeGreaterThan(0);
  for (const gap of faces) {
    for (const v of Object.values(gap)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(2);
    }
  }
  await page.locator('#whos-here').screenshot({ path: test.info().outputPath('party-hae-speaking.png') });

  // The rooftop has no resident: her row goes; you and your contact stay.
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'ribbon-rooftop', transition: 'fade' } });
  await expect(hae).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('#whos-here .wh-tile[data-id="party:contact"]')).toBeVisible();

  expect(errors).toEqual([]);
  // Put the worker's playthrough back for the specs after this one: her greeting, at the intake (quests, jobs, exits).
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(page.locator('.msg.agent.s-ok').last()).toHaveAttribute('data-id', greetingId, { timeout: 10_000 });
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'karasu/lowlight-intake' } });
  await expect(page.locator('.hud-left .scene')).toHaveText('LOWLIGHT INTAKE', { timeout: 10_000 });
});

test('open city: Alpha (no rooms of her own) walks to the noodle stall and meets Hae', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await dialIn(page, SECOND.id, 'hicks');
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);

  // Alpha starts in the neutral workspace, which isn't on the map: open the Ribbon's district and GO.
  await page.locator('.hud-map').click();
  await page.locator('.city-map .pin[data-place="haes-noodles"]').dispatchEvent('click');
  await page.keyboard.press('Enter');
  await expect(page.locator('#map')).toBeHidden();
  await arriveGo(page);
  await expect(page.locator('#feed .msg.travel').last()).toContainText("Hicks and Alpha head to Hae's Noodles.");
  await expect(page.locator('#whos-here .wh-tile[data-id="hae"]')).toBeVisible({ timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('encounter: draw, play, she reacts, and the courier gets his own page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=hicks`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await expect(page.locator('button.draw')).toBeEnabled();

  // Alt+D: three events from the narrator, the first bringing a courier.
  await page.keyboard.press('Alt+d');
  await expect(page.locator('.encounter-host .sp-card')).toHaveCount(3, { timeout: 15_000 });
  await expect(page.locator('.encounter-host .sp-card.on .sp-title')).toContainText(E2E_ENCOUNTERS[0].title);
  await expect(page.locator('.encounter-host .sp-card.on .ep-who')).toContainText('+ COURIER');
  // DRAW's kinds, in order; the stranger's card shows his face.
  await expect(page.locator('.encounter-host .sp-sub-what')).toHaveText(['STRANGER', 'THE CITY', 'PERSONAL']);
  await expect(page.locator('.encounter-host .sp-card.on .sp-art')).toHaveAttribute('style', /\/api\/extras\/local-01/);
  const before = await page.locator('.msg.agent.s-ok').count();
  await page.keyboard.press('Enter');

  // The panel closes, the event's card is up, and she reacts.
  await expect(page.locator('.encounter-host')).toHaveCount(0);
  await expect(page.locator('.encounter-banner .eb-title')).toHaveText(`◆ ENCOUNTER · ${E2E_ENCOUNTERS[0].title.toUpperCase()}`);
  await expect(page.locator('.encounter-banner .eb-arrives')).toHaveText('COURIER ARRIVES');
  // Played, he's here with his face: a stranger in the who's-here window.
  await expect(page.locator('#whos-here .wh-tile', { hasText: 'Courier' }).locator('.wh-face img')).toHaveAttribute('src', '/api/extras/local-01');
  await expect(page.locator('#whos-here .wh-role', { hasText: 'STRANGER' })).toHaveCount(1);
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
  const sent = (await completions()).at(-1)!;
  // The stranger's block rides in the latest message (cache-friendly order).
  expect(sent.body.messages![0].content).not.toContain('Courier is here');
  expect(sent.body.messages!.at(-1)!.content).toContain('Courier is here');
  expect(sent.body.messages!.at(-1)!.content).toContain(`[event: "${E2E_ENCOUNTERS[0].title}"`);

  // Her beat first, then the courier's own page with his nameplate.
  const box = page.locator('.msg:not(.hidden-collapsed)').last();
  await expect(box.locator('.meta .name')).toHaveText('NIX');
  await expect(async () => {
    if ((await box.locator('.meta .name').textContent()) !== 'COURIER') await box.locator('button.continue').click({ timeout: 1_000 });
    await expect(box.locator('.meta .name')).toHaveText('COURIER', { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await expect(box).toHaveClass(/stranger-page/);
  // He has no figure: she isn't the speaker on his page, as on Hae's.
  await expect(page.locator('.stage-right')).not.toHaveClass(/speaking/);
  await expect(box.locator('.beat[data-who="stranger"]')).toContainText('Print here');

  expect(errors).toEqual([]);
});

test('suggest: Alt+G opens three drafts of his line on the cards panel; Esc keeps the box, E edits, Enter sends', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=hicks`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const box = page.locator('.input textarea');
  const panel = page.locator('.encounter-host.suggest-host');
  const cards = panel.locator('.sp-card');
  const asks = async () => (await orRequests()).filter((r) => r.body.stream === false && r.body.messages?.[0]?.content?.startsWith('You help the user play')).length;
  const sentBefore = await page.locator('#feed .msg.user').count();
  await expect(page.locator('button.suggest')).toBeEnabled();

  // An empty box: three drafts, his name cleaned off, nothing sent.
  await page.keyboard.press('Alt+g');
  await expect(panel.locator('.ep-title')).toHaveText('YOUR LINE');
  await expect(cards).toHaveCount(3, { timeout: 10_000 });
  await expect(cards.locator('.sp-title')).toHaveText([/^PLAIN/, /^PUSH/, /^TURN/]);
  await expect(cards.nth(0).locator('.sp-card-text')).toHaveText(E2E_SUGGESTION.replace(/\*/g, ''));
  const asked = (await orRequests()).filter((r) => r.body.stream === false && r.body.messages?.[0]?.content?.startsWith('You help the user play')).at(-1)!;
  expect(asked.body.messages![0].content).toMatch(/Write only .+'s next line in this scene/);
  expect(asked.body.messages!.at(-1)!.content).toContain('What just happened:');

  // Esc: the box as it was. A steer typed, then SUGGEST again: a new set (the steer changed); E puts PUSH in the box.
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await box.fill('tell her no');
  const askedSoFar = await asks();
  await page.locator('button.suggest').click();
  await expect(panel.locator('.sp-note')).toHaveText('STEER: tell her no');
  await expect(cards).toHaveCount(3, { timeout: 10_000 });
  expect(await asks()).toBe(askedSoFar + 1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('e');
  await expect(panel).toHaveCount(0);
  await expect(box).toHaveValue(E2E_SUGGESTION_PUSH);
  await expect(page.locator('#feed .msg.user')).toHaveCount(sentBefore);

  // Out of character, it waits.
  await page.keyboard.press('Alt+m');
  await expect(page.locator('button.suggest')).toBeDisabled();
  await page.keyboard.press('Alt+m');

  // The box cleared, SUGGEST again with no steer, Enter: PLAIN goes as his line and the box empties.
  await box.fill('');
  await page.keyboard.press('Alt+g');
  await expect(cards).toHaveCount(3, { timeout: 10_000 });
  await page.keyboard.press('Enter');
  await expect(panel).toHaveCount(0);
  await expect(page.locator('#feed .msg.user')).toHaveCount(sentBefore + 1);
  await expect(page.locator('#feed .msg.user').last()).toContainText('E2E suggested line.');
  await expect(box).toHaveValue('');
  expect(errors).toEqual([]);
});

test("encounter: the panel keeps its keys — typing doesn't leak, Alt+S waits, Alt+M closes it (final review I3)", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=hicks`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await page.keyboard.press('Alt+d');
  await expect(page.locator('.encounter-host .sp-card')).toHaveCount(3, { timeout: 15_000 });
  // Typing while it's up goes nowhere: not into the prompt behind it.
  await page.keyboard.type('hello');
  await expect(page.locator('.input textarea')).toHaveValue('');
  // The save prompt waits for it to close.
  await page.keyboard.press('Alt+s');
  await expect(page.locator('.save-card')).toHaveCount(0);
  // Esc cancels it, with focus on the prompt behind it; DRAW deals the same set again for free.
  await page.keyboard.press('Escape');
  await expect(page.locator('.encounter-host')).toHaveCount(0);
  await page.keyboard.press('Alt+d');
  await expect(page.locator('.encounter-host .sp-card')).toHaveCount(3);
  // The stage can't be scrolled, whatever is focused or scrolled into view under the panel.
  await page.locator('button.end-scene').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => { const g = document.getElementById('game')!; g.scrollTop = 200; return g.scrollTop; })).toBe(0);
  // Switching to OOC closes it (events are for roleplay).
  await page.keyboard.press('Alt+m');
  await expect(page.locator('.encounter-host')).toHaveCount(0);
  await expect(page.locator('button.draw')).toBeDisabled();
  await page.keyboard.press('Alt+m');
  await expect(page.locator('button.draw')).toBeEnabled();
});

test('gig: sit down at The Tilt, walk away from the desk, she reacts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=hicks&gigSeed=12345`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);

  // The map, Karasu's panel, The Tilt: GIGS (no travel).
  const openTilt = async () => {
    await page.locator('.hud-map').click();
    // The Tilt's pin carries the gig ring; its card has GIGS.
    await expect(page.locator('.city-map .pin[data-place="the-tilt"] .gig-ring')).toHaveCount(1);
    await page.locator('.city-map .pin[data-place="the-tilt"]').dispatchEvent('click');
    await page.locator('.map-strip .gig-open').click();
    await expect(page.locator('.gig-window')).toBeVisible();
  };
  await openTilt();
  // One papers card: hack and slip are gone.
  await expect(page.locator('.gig-job-title')).toHaveText([E2E_GIG.title]);
  await expect(page.locator('.gig-job-go')).toHaveText('SIT DOWN');
  await page.keyboard.press('Enter');
  await expect(page.locator('.gig-where')).toContainText('◢ DESK // THE TILT');

  // WALK AWAY: turned back; LEAVE THE DESK sends it to the room, the window and map close, she answers.
  await page.keyboard.press('Escape');
  await page.locator('.gig-confirm-go').click();
  await expect(page.locator('.gig-result-big')).toHaveText('TURNED BACK');
  const before = await page.locator('.msg.agent.s-ok').count();
  await page.keyboard.press('Enter');
  await expect(page.locator('.gig-window')).toHaveCount(0);
  await expect(page.locator('#map')).toBeHidden();
  await expect(page.locator('#feed .gig-row .gig-head').last()).toHaveText(`◢ GIG · DESK · ${E2E_GIG.title.toUpperCase()} · EASY`);
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
  const last = (await completions()).at(-1)!.body.messages!.at(-1)!.content ?? '';
  expect(last).toMatch(/\[gig: \S+ just forged papers for a Ferrymen client/);

  // Shrunk to phone width with the window open, it scrolls inside itself: no sideways page scroll.
  await openTilt();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.gig-job').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.gig-window')).toHaveCount(0);
  await expect(page.locator('#map')).toBeVisible();
  expect(errors).toEqual([]);
});

// The game itself is vitest's (dice-tray, dice-room, chat-relay dice): here only that the tray opens and Esc closes it.
test('dice: DICE opens the tray, Esc closes it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=hicks`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);

  await page.locator('.scene-keys button.dice').click();
  await expect(page.locator('.dice-tray')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.dice-tray')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('YOU, PEOPLE, TEXTS, QUEST, CREW and MAP: a bar word switches between them, and Tab cycles YOU → PEOPLE → TEXTS → QUEST → CREW → MAP → BOOK', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=hicks`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await page.locator('.hud-you').click();
  await expect(page.locator('.character-sheet')).toBeVisible();
  // Clicking PEOPLE from YOU switches: YOU is gone at once.
  await page.locator('.hud-people').click();
  await expect(page.locator('.people-screen')).toBeVisible();
  await expect(page.locator('.character-sheet')).toHaveCount(0);
  await expect(page.locator('.pe-tab[data-tab="journal"]')).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(page.locator('.pe-tab.on')).toHaveText('JOURNAL');
  await page.keyboard.press('Tab');
  await expect(page.locator('.tx-pane')).toBeVisible();
  await expect(page.locator('.people-screen')).toHaveCount(0);
  await expect(page.locator('.hud-quest')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('.ql-pane')).toBeVisible();
  await expect(page.locator('.tx-root')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(page.locator('.crew-screen')).toBeVisible();
  await expect(page.locator('.ql-pane')).toBeHidden();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.ql-pane')).toBeVisible();
  await expect(page.locator('.crew-screen')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('.crew-screen')).toHaveCount(0);
  // Clicking QUEST from MAP switches too: the map goes.
  await page.locator('.hud-quest').click();
  await expect(page.locator('.ql-pane')).toBeVisible();
  await expect(page.locator('#map')).toBeHidden();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.locator('#map')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('.lb-root')).toBeVisible();
  await expect(page.locator('#map')).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(page.locator('.character-sheet')).toBeVisible();
  await expect(page.locator('.lb-root')).toBeHidden();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.lb-root')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#map')).toBeVisible();
  // The map opens on the whole city with no card once its data loads (map pins spec §1), so one Esc closes it.
  await expect(page.locator('#map .pin.here')).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(page.locator('#map')).toBeHidden();
});
