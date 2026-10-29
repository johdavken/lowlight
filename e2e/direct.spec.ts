import { expect, test, type Page } from '@playwright/test';
import type { NixRoomTestHook } from '../web/src/main';
import { arriveGo, DIRECT, SECOND, STUB_OR_LOG_PORT, awaitGreeting, dialIn, lockPlayer, newGame, phase, send, showTile, skipSplash, skipIntro } from './fixtures';
import { E2E_ENCOUNTERS, E2E_GIG, E2E_SLIP, E2E_SUGGESTION } from './serve';

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
  await expect(page.locator('.model-panel .mp-row.on .mp-label')).toHaveText('GLM 5.2');
  // Her current model, then the recent ones (the shipped picks aren't in the fake catalog, so they hide).
  await expect(page.locator('.model-panel .mp-row')).toHaveCount(DIRECT.models.length);
  await expect(page.locator('.model-panel .mp-link')).toContainText('$9.50');
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
  // It opens on the whole city with your district open (no auto zoom); Esc closes the district, then its band tile reopens it.
  const world = page.locator('.map-world');
  await expect(page.locator('.map-strip')).toBeVisible();
  await expect(world).toHaveAttribute('style', /scale\(1\)/);
  await page.keyboard.press('Escape');
  await expect(world).toHaveAttribute('style', /scale\(1\)/);
  await expect(page.locator('#map')).toBeVisible();
  await page.locator('.map-bt.dist[data-id="karasu"]').click();
  await page.locator('.map-bt.place', { hasText: "Hae's Noodles" }).click();
  const strip = page.locator('.map-strip');
  await expect(strip).toContainText('HAE');
  await expect(strip).toContainText('FIXED');
  await strip.locator('.go').click();
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
  await page.locator('.map-bt.dist[data-id="karasu"]').click();
  await page.locator('.map-bt.place', { hasText: "Hae's Noodles" }).click();
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
  await expect(page.locator('.encounter-host .sp-card.on .sp-title')).toHaveText(E2E_ENCOUNTERS[0].title);
  await expect(page.locator('.encounter-host .sp-card.on .ep-who')).toContainText('+ COURIER');
  const before = await page.locator('.msg.agent.s-ok').count();
  await page.keyboard.press('Enter');

  // The panel closes, the event's card is up, and she reacts.
  await expect(page.locator('.encounter-host')).toHaveCount(0);
  await expect(page.locator('.encounter-banner .eb-title')).toHaveText(`◆ ENCOUNTER · ${E2E_ENCOUNTERS[0].title.toUpperCase()}`);
  await expect(page.locator('.encounter-banner .eb-arrives')).toHaveText('COURIER ARRIVES');
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

test('suggest: Alt+G drafts his next line into the box, unsent; what is typed steers it and is replaced', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=hicks`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const box = page.locator('.input textarea');
  const sentBefore = await page.locator('#feed .msg.user').count();
  await expect(page.locator('button.suggest')).toBeEnabled();

  // An empty box: a free draft, his name cleaned off, nothing sent.
  await page.keyboard.press('Alt+g');
  await expect(box).toHaveValue(E2E_SUGGESTION, { timeout: 10_000 });
  await expect(page.locator('#feed .msg.user')).toHaveCount(sentBefore);
  const asked = (await orRequests()).filter((r) => r.body.stream === false && r.body.messages?.[0]?.content?.startsWith('You help the user play')).at(-1)!;
  // The player's name is the world's ("You" when no NEW GAME picked one).
  expect(asked.body.messages![0].content).toMatch(/Write only .+'s next line in this scene/);
  expect(asked.body.messages!.at(-1)!.content).toContain('What just happened:');

  // A steer typed in the box: the draft replaces it.
  await box.fill('tell her no');
  await page.locator('button.suggest').click();
  await expect(box).toHaveValue(`${E2E_SUGGESTION} (tell her no)`, { timeout: 10_000 });
  await expect(page.locator('#feed .msg.user')).toHaveCount(sentBefore);

  // Out of character, it waits.
  await page.keyboard.press('Alt+m');
  await expect(page.locator('button.suggest')).toBeDisabled();
  await page.keyboard.press('Alt+m');
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

test('gig: jack in at The Tilt, win the easy job, she reacts', async ({ page }) => {
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
    // The map opens on your district (Karasu: every room this suite visits is there).
    const tilt = page.locator('.map-bt.place', { hasText: 'The Tilt' });
    await expect(tilt.locator('.gt')).toHaveText('GIGS');
    await tilt.click();
    await page.locator('.map-strip .gig-open').click();
    await expect(page.locator('.gig-window')).toBeVisible();
  };
  await openTilt();
  // The easy hack first, then the medium slip.
  await expect(page.locator('.gig-job-title')).toHaveText([E2E_GIG.title, E2E_SLIP.title]);
  await page.keyboard.press('Enter');
  await expect(page.locator('.gig-run-title')).toHaveText(E2E_GIG.title);

  // The solver's route: Tab to each node, take it, then PULL.
  const path = await page.evaluate(() => (window.__nixRoom as unknown as { gig: { path(): number[] } }).gig.path());
  for (const id of path.slice(1)) {
    for (let i = 0; i < 20; i++) {
      if ((await page.locator('g.gig-node.gig-sel').count()) && (await page.locator('g.gig-node.gig-sel').getAttribute('data-id')) === String(id)) break;
      await page.keyboard.press('Tab');
    }
    await expect(page.locator('g.gig-node.gig-sel')).toHaveAttribute('data-id', String(id));
    await page.keyboard.press('e');
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('.gig-result-big')).toHaveText('CLEAN');

  // JACK OUT: the run goes to the room, the window and map close, she answers.
  const before = await page.locator('.msg.agent.s-ok').count();
  await page.keyboard.press('Enter');
  await expect(page.locator('.gig-window')).toHaveCount(0);
  await expect(page.locator('#map')).toBeHidden();
  await expect(page.locator('#feed .gig-row .gig-head').last()).toHaveText(`◢ GIG · ${E2E_GIG.title.toUpperCase()} · EASY`);
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
  const sent = (await completions()).at(-1)!;
  const last = sent.body.messages!.at(-1)!.content ?? '';
  // The mode's note rides in the latest message (cache-friendly order).
  expect(last).toContain('The user has just run a job while you watched');
  // The player's name is the world's ("You" when no NEW GAME picked one).
  expect(last).toMatch(/\[gig: \S+ just ran a job off The Tilt's board, on the grid from here while you watched: "E2E Line" \(easy\), targeting Voltaic · depot ledger\./);
  expect(last).toContain(E2E_GIG.text);

  // Shrunk to phone width with the window open, it scrolls inside itself: no sideways page scroll
  // (Review Focus 5). (The room's own HUD isn't laid out for phones, so the window opens first.)
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

test('gig: slip in at The Tilt, walk the clean route out, she reacts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=hicks&gigSeed=12345`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);

  await page.locator('.hud-map').click();
  await page.locator('.map-bt.place', { hasText: 'The Tilt' }).click();
  await page.locator('.map-strip .gig-open').click();
  const card = page.locator('.gig-job').nth(1);
  await expect(card.locator('.gig-job-kind')).toHaveText('◢ FLOOR');
  await expect(card.locator('.gig-job-go')).toHaveText('SLIP IN');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.slip-heat')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.gig-where')).toHaveText(`◢ FLOOR // THE TILT · KARASU · ${E2E_SLIP.title.toUpperCase()}`);

  // The dev strip's SHOW SOLUTION walks the clean route, one action a press.
  const show = page.locator('.gig-dev button', { hasText: 'SHOW SOLUTION' });
  // (Exactly as many presses as it has turns: the result comes a beat after the last move.)
  const turns = Number((await page.locator('.gig-dev').textContent())!.match(/solution (\d+) turns/)![1]);
  for (let i = 0; i < turns; i++) await show.click();
  await expect(page.locator('.gig-result-big')).toHaveText('CLEAN');
  await expect(page.locator('.gig-send')).toHaveText('[ENTER] WALK AWAY');

  const before = await page.locator('.msg.agent.s-ok').count();
  await page.keyboard.press('Enter');
  await expect(page.locator('.gig-window')).toHaveCount(0);
  await expect(page.locator('#map')).toBeHidden();
  await expect(page.locator('#feed .gig-row .gig-head').last()).toHaveText(`◢ GIG · FLOOR · ${E2E_SLIP.title.toUpperCase()} · MEDIUM`);
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
  const last = (await completions()).at(-1)!.body.messages!.at(-1)!.content ?? '';
  expect(last).toMatch(/\[gig: \S+ just slipped a job off The Tilt's board, on foot, with you on comms watching their cameras: "E2E Floor" \(medium\)/);
  expect(last).toContain('Result: lifted it clean, never seen.');
  expect(errors).toEqual([]);
});

test('YOU, PEOPLE, CREW and MAP: a bar word switches between them, and Tab cycles YOU → PEOPLE → CREW → MAP', async ({ page }) => {
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
  await page.keyboard.press('Tab');
  await expect(page.locator('.crew-screen')).toBeVisible();
  await expect(page.locator('.people-screen')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('.crew-screen')).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(page.locator('.character-sheet')).toBeVisible();
  await expect(page.locator('#map')).toBeHidden();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#map')).toBeVisible();
  // The map opens inside your own district once its data loads, so the first Esc steps back to the city
  // and the second closes it. (Pressed before the load, one Esc closed it: the test raced the fetch.)
  await expect(page.locator('#map .pin.here')).toBeAttached();
  await expect(page.locator('#map .city-map.zoomed')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#map .city-map.zoomed')).toHaveCount(0);
  await expect(page.locator('#map')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#map')).toBeHidden();
});
