import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { NixRoomTestHook } from '../web/src/main';
import type {} from '../web/src/landing/landing'; // window.__lowlightLanding
import { arriveGo, skipOpeningCard, DIRECT, SECOND, awaitGreeting, chatsOf, dialIn, greeting, lockPlayer, newGame, phase, pickTitle, send, showTile, skipSplash, toTitle, skipIntro } from './fixtures';

// Rooms here skip the district load screen (arrival.spec covers it).
test.beforeEach(async ({ page }) => {
  await skipIntro(page);
});

/** Each pack's scene ids and preset names, read from the scene.json files the server serves. */
function packScenes(pack: string): Array<{ id: string; presets: string[] }> {
  const dir = path.join('scenes', pack);
  return fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'scene.json')))
    .sort()
    .map((d) => {
      const def = JSON.parse(fs.readFileSync(path.join(dir, d, 'scene.json'), 'utf8')) as { id: string; presets: Record<string, unknown> };
      return { id: def.id, presets: Object.keys(def.presets) };
    });
}

const TRANSITION_WAIT_MS = 1_500;

declare global {
  interface Window {
    __nixRoom?: NixRoomTestHook;
  }
}

test('splash: once per session, the theme plays on the splash, a room and back skips it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await skipOpeningCard(page);
  await expect(page.locator('.splash-logo')).toBeVisible();
  await expect(page.locator('.splash')).not.toHaveClass(/no-scene/);
  await page.waitForFunction(() => window.__lowlightLanding?.nonBlank() === true);
  // Blocked autoplay asks for sound first; that key starts the theme and stays on the splash.
  const prompt = page.locator('.splash-prompt');
  if ((await prompt.textContent()) === '▶ CLICK OR PRESS ANY KEY FOR SOUND') await page.keyboard.press('Space');
  await expect(prompt).toHaveText('[ ENTER TO CONTINUE ]');
  await expect(page.locator('.splash')).toHaveClass(/sounding/);
  await expect.poll(() => page.evaluate(() => window.__lowlightLanding!.audio().music)).toBe('playing');
  await expect.poll(() => page.evaluate(() => window.__lowlightLanding!.audio().context)).toBe('running');
  await expect(page.locator('.splash')).toHaveCount(1); // still on the splash, with the theme playing
  await page.keyboard.press('Space');
  await expect(page.locator('.splash')).toHaveCount(0);
  await toTitle(page);

  await page.reload();
  await toTitle(page);
  await expect(page.locator('.splash')).toHaveCount(0);

  await dialIn(page, SECOND.id);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await page.keyboard.press('Escape');
  // Back from a room: no splash, straight to the title.
  await page.waitForURL((u) => u.pathname === '/');
  await toTitle(page);
  await expect(page.locator('.splash')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('keyboard only: any key, then Enter through player, AI and JACK IN reaches a room', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await skipOpeningCard(page);
  await expect(page.locator('.splash-logo')).toBeVisible();
  const prompt = page.locator('.splash-prompt');
  if ((await prompt.textContent()) === '▶ CLICK OR PRESS ANY KEY FOR SOUND') await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(page.locator('.splash')).toHaveCount(0); // keys wait for the intro to finish
  // The title: Enter on NEW GAME (↓ past CONTINUE when there's a playthrough to continue).
  await newGame(page);
  // The roster is grouped by district (the live roster, see e2e/serve.ts): ←/→ walk its order, so
  // the presses come from where Cass and Alpha actually are.
  const order = await page.locator('.grid .tile[data-id]').evaluateAll((ts) => ts.map((t) => (t as HTMLElement).dataset.id!));
  const cass = order.indexOf('cass');
  const alpha = order.indexOf(SECOND.id);
  for (let i = 0; i < cass; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  // YOU: Enter plays as Cass.
  await expect(phase(page)).toHaveAttribute('data-phase', 'you');
  await page.keyboard.press('Enter');
  await expect(phase(page)).toHaveAttribute('data-phase', 'p2');
  // The CPU cursor starts on Cass's tile: → round to Alpha, Enter, then Enter keeps her model.
  for (let i = 0; i < (alpha - cass + order.length) % order.length; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(phase(page)).toHaveAttribute('data-phase', 'model');
  await expect(page.locator('.model-panel .mp-row.on')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(phase(page)).toHaveAttribute('data-phase', 'ready');
  await page.keyboard.press('Enter');
  await page.waitForURL(`**/room/${SECOND.id}*`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('.stage-left')).toHaveAttribute('aria-label', 'Cass');
});

test('splash: opening a room directly, then going back, skips it', async ({ page }) => {
  await page.goto(`/room/${SECOND.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await page.keyboard.press('Escape');
  await expect(phase(page)).toBeVisible();
  await expect(page.locator('.splash')).toHaveCount(0);
});

test('splash: the logo fits a phone-width window (Review Focus 5)', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.goto('/');
  await skipOpeningCard(page);
  await expect(page.locator('.splash-logo')).toBeVisible();
  const box = (await page.locator('.splash-logo').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.close();
});

const nonBlank = (page: Page) => page.evaluate(() => window.__nixRoom!.nonBlank());

test('landing lists both contacts; each room renders its own pack, presets apply, chat reaches its own character', async ({ page }) => {
  // Every room of every pack with every preset; flat rooms are slow in the software WebGL CI uses.
  // The budget grows with the room library (each room: its transition, its art loading, its presets).
  const CONTACTS = [SECOND, DIRECT] as const;
  const rooms = CONTACTS.flatMap((a) => packScenes(a.pack));
  test.setTimeout(60_000 + rooms.reduce((ms, r) => ms + 20_000 + r.presets.length * 500, 0));
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await skipSplash(page);
  await newGame(page);
  // One roster page: RANDOM + the direct characters (nix-direct, cass, Hicks and whoever else
  // characters/ holds, and the e2e-only SECOND).
  const ids = await page.locator('.tile').evaluateAll((ns) => ns.map((n) => (n as HTMLElement).dataset.id));
  expect(ids).toEqual(expect.arrayContaining(['?random', DIRECT.id, SECOND.id, 'cass', 'hicks']));
  await expect(page.locator(`.tile[data-id="${SECOND.id}"]`)).not.toHaveClass(/offline/);
  await expect(page.locator('.tile[data-id="cass"]')).not.toHaveClass(/offline/);
  // Hicks has a mind of his own since he became a contact (GLM).
  await expect(page.locator('.tile[data-id="hicks"]')).not.toHaveClass(/offline/);

  for (const a of CONTACTS) {
    // Dial in from the select screen: Hicks as the player, her as the AI.
    await dialIn(page, a.id);
    await page.waitForFunction(() => window.__nixRoom !== undefined);
    await expect(page.locator('.stage-left')).toHaveAttribute('aria-label', 'Hicks');
    await expect.poll(() => nonBlank(page)).toBe(true);
    await awaitGreeting(page);

    for (const scene of packScenes(a.pack)) {
      await send(page, { type: 'dev_action', tool: 'go_to', args: { id: scene.id } });
      await page.waitForTimeout(TRANSITION_WAIT_MS);
      // A flat room's 1536×864 art takes several seconds to load in the software WebGL CI uses.
      await expect.poll(() => nonBlank(page), { timeout: 15_000 }).toBe(true);
      for (const preset of scene.presets) {
        await send(page, { type: 'dev_action', tool: 'apply_mood', args: { name: preset } });
        await page.waitForTimeout(300);
      }
      // Still drawing after all its presets. Checked once per room, not per preset: the check reads
      // the whole room back from the GPU, which takes seconds per call in the software WebGL CI uses.
      await expect.poll(() => nonBlank(page), { timeout: 15_000 }).toBe(true);
    }

    await send(page, { type: 'user_message', text: 'hello' });
    await expect(page.locator('#feed .msg.agent:visible .text')).toContainText(a.reply, { timeout: 10_000 });
    // The other contact's reply never shows up in this room.
    for (const other of CONTACTS.filter((o) => o.id !== a.id)) {
      await expect(page.locator('#feed').getByText(other.reply)).toHaveCount(0);
    }
    expect(await page.evaluate(() => window.__nixRoom!.warnings)).toEqual([]);

    await page.locator('.hud-back').click();
    await page.waitForURL((u) => u.pathname === '/');
    await toTitle(page);
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// Her notes, the player's edits and the recap text are vitest's (journal, hub, recap, journal-panel, multi-agent):
// here only the way back in — CONTINUE shows her recap, and the dismissing key stays out of the prompt.
test('recap: CONTINUE opens on her recap card; a key dismisses it and types nothing', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await skipSplash(page);
  await dialIn(page, DIRECT.id, 'hicks');
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await send(page, { type: 'dev_action', tool: 'set_recap', args: { text: 'we closed up at dawn' }, as: 'agent' });
  await page.locator('.hud-back').click();
  await page.waitForURL((u) => u.pathname === '/');
  await toTitle(page);
  await pickTitle(page, 'continue');
  await page.waitForURL(`**/room/${DIRECT.id}*`);
  await expect(page.locator('.recap-card .recap-text')).toHaveText('we closed up at dawn');
  await page.keyboard.press('x');
  await expect(page.locator('.recap-card')).toHaveCount(0);
  expect(await page.locator('textarea').first().inputValue()).toBe('');

  expect(errors).toEqual([]);
});

/** Whether the server has a sound on disk: the public repo holds the restricted recordings back (spec 2026-10-28 open-source release). */
async function hasSound(page: import('@playwright/test').Page, url: string): Promise<boolean> {
  const { files } = (await (await page.request.get('/api/sound-present')).json()) as { files: string[] };
  return files.includes(url);
}

test('sound: locked until a click, then follows the room (indoor rain, neon, rooftop wind)', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  const audio = () => page.evaluate(() => window.__nixRoom!.audio());

  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  // `send` drops events until the socket is open (it connects after the persona fetch); the first
  // room event, which names the scene in the HUD, shows it is.
  const hudScene = page.locator('.hud-left .scene');
  await expect(hudScene).not.toHaveText('——');
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
  await expect(hudScene).toHaveText('LOWLIGHT INTAKE');
  expect((await audio()).unlocked).toBe(false);
  await expect(page.locator('.hud-sys .sys-note')).toHaveText('♪');

  // The first click lands on SYS: it starts the sound and opens the menu, and doesn't also mute.
  await page.locator('.hud-sys').click();
  await expect.poll(async () => (await audio()).unlocked).toBe(true);
  await expect(page.locator('.hud-sys .sys-note')).toHaveText('');
  await expect(page.locator('.sys-row[data-row="sound"] .sys-value')).toHaveText(/^\d+%$/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sys-menu')).toBeHidden();

  await send(page, { type: 'dev_action', tool: 'set_atmosphere', args: { weather: 'rain', weather_level: 0.8, duration: 0 } });
  await expect.poll(async () => (await audio()).mix?.rain.level ?? 0).toBeCloseTo(0.6 * 0.8 ** 0.8, 5);
  const indoor = await audio();
  expect(indoor.mix!.rain.indoor).toBe(true);
  expect(indoor.voices).toContain('rain');
  expect(indoor.mix!.neon.map((n) => n.id)).toEqual(['window_neon']);
  expect(indoor.voices).toContain('neon:window_neon');
  // The rain recordings loaded (a build without them keeps the synthesized rain).
  const recorded = (await hasSound(page, '/sound/rain-light.ogg')) && (await hasSound(page, '/sound/rain-heavy.ogg'));
  await expect.poll(async () => (await audio()).rain).toBe(recorded ? 'recorded' : 'synth');
  await expect.poll(async () => (await audio()).music).toBe('playing'); // Lowlight Intake plays Nix's theme

  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'ribbon-rooftop', transition: 'fade' } });
  await expect.poll(async () => (await audio()).mix?.wind.indoor).toBe(false);
  await expect.poll(async () => (await audio()).music).toBeNull(); // the rooftop has no song: it fades out
  const roof = await audio();
  expect(roof.mix!.wind.level).toBeGreaterThanOrEqual(0.15);
  expect(roof.mix!.neon.map((n) => n.id).sort()).toEqual(['sign_below']); // the re-art's one neon (fa7d7d79)

  expect(errors).toEqual([]);
});

test('stage: both figures on stage, the speaker is marked, PgUp shows history, a narrow window letterboxes the stage', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1920, height: 1080 });
  // A playthrough of its own, as Hicks: the default player ('you') is a silhouette, not a sprite.
  await skipSplash(page);
  await dialIn(page, DIRECT.id);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const left = page.locator('.stage-left');
  const right = page.locator('.stage-right');
  await expect(left).toHaveAttribute('data-kind', 'sprite');
  await expect(right).toHaveAttribute('data-kind', 'sprite');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();

  await send(page, { type: 'user_message', text: 'stage check' });
  const reply = DIRECT.reply;
  // Earlier tests leave her pinned note, so the stub's reply may carry a "(heard: …)" suffix.
  const herLine = page.locator('#feed .msg.agent:visible .text');
  await expect(herLine).toContainText(reply, { timeout: 10_000 });
  // The stage marks the speaker but draws nobody differently (no lit/dimmed looks, spec 2026-10-15).
  await expect(right).toHaveClass(/\bspeaking\b/);
  await expect(left).not.toHaveClass(/\bspeaking\b/);
  await expect(left).not.toHaveClass(/\b(lit|dimmed)\b/);
  await expect(right).not.toHaveClass(/\b(lit|dimmed)\b/);

  // the player's line current marks his side. (The stub answers at once, so his line may never be the
  // box's on its own while she answers: take her reply away, then put it back.)
  await page.locator('.line-keys button.key', { hasText: 'DELETE' }).click();
  await expect(left).toHaveClass(/\bspeaking\b/);
  await expect(right).not.toHaveClass(/\bspeaking\b/);
  await page.locator('.feed-notice button', { hasText: 'UNDO' }).click();
  await expect(herLine).toContainText(reply);
  await expect(right).toHaveClass(/\bspeaking\b/);

  // The box shows only her line; the player's is behind PgUp.
  await expect(page.locator('#feed .msg:visible')).toHaveCount(1);
  await expect(page.locator('#feed').getByText('stage check')).toBeHidden();
  await page.locator('textarea').first().focus();
  await page.keyboard.press('PageUp');
  await expect(page.locator('#feed').getByText('stage check')).toBeVisible();
  // His nameplate is the active playthrough's player, the figure on the left.
  await expect(page.locator('#feed .msg.user .name').last()).toHaveText(new RegExp(`^${(await left.getAttribute('aria-label'))!}$`, 'i'));
  await expect(left).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(left).toBeVisible();

  // The fixed stage (spec 2026-10-16): a narrow window shows the whole 16:9 stage, figures included.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await expect(herLine).toContainText(reply);

  expect(errors).toEqual([]);
});

test("room sounds: the dev panel plays the room's sound", async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await page.mouse.click(960, 400); // unlock sound
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'zz-flat-test', transition: 'fade' } });

  await page.keyboard.press('`');
  const select = page.locator('.dp-sound-select');
  await expect(select).toBeVisible({ timeout: 15_000 });
  await select.selectOption('kettle');
  const fetched = page.waitForRequest((r) => r.url().endsWith('/zz-flat-test/sound/keep/kettle.ogg'));
  await page.click('.dp-sound-play');
  await fetched;
  await expect(page.locator('.dp-log-row').filter({ hasText: '♪ kettle' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('expressions: the dev panel picks her face for one reply', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);

  // She needs a reply on screen before a pick (with no turn running) has anywhere to land.
  await send(page, { type: 'user_message', text: 'expression check' });
  const reply = DIRECT.reply;
  await expect(page.locator('#feed .msg.agent:visible .text')).toContainText(reply, { timeout: 10_000 });

  // Backtick, with the chat input empty and unfocused, opens the dev drawer.
  await page.keyboard.press('`');
  const select = page.locator('.dp-expression-select');
  await expect(select).toBeVisible();
  await select.selectOption('happy');

  const art = page.locator('.stage-figure.stage-right .stage-art');
  await expect.poll(() => art.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('/sprite/happy');

  expect(errors).toEqual([]);
});

// What each control does to her next prompt is vitest's (controls, message-controls): here only the click path.
test('message controls: REGENERATE makes a second take, ◂ swipes back to the first', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  const box = page.locator('.msg:not(.hidden-collapsed)').last();

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  // The room sends its history before the link status: counted before that, earlier replies would land as "new".
  await expect(page.locator('.link')).toHaveAttribute('data-status', 'ok');

  const before = await page.locator('.msg.agent.s-ok').count();
  await send(page, { type: 'user_message', text: 'controls check' });
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
  await expect(page.locator('.line-keys button.key', { hasText: 'REGENERATE' })).toBeEnabled();
  const first = (await box.locator('.text').textContent())!;

  await page.locator('.line-keys button.key', { hasText: 'REGENERATE' }).click();
  await expect(box.locator('.takes-n')).toHaveText('2/2', { timeout: 10_000 });
  expect(await box.locator('.text').textContent()).not.toBe(first);

  await box.locator('.takes button', { hasText: '◂' }).click();
  await expect(box.locator('.takes-n')).toHaveText('1/2');
  await expect(box.locator('.text')).toHaveText(first);

  expect(errors).toEqual([]);
});

test('typing: a long reply types out, Enter finishes the page, then turns it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  // The socket can still be opening when the page resolves; a send before it's up is dropped.
  await expect(page.locator('.link')).toHaveAttribute('data-status', 'ok');

  const ta = page.locator('textarea').first();
  await ta.fill('tell me a long story');
  await ta.press('Enter');

  const continueBtn = page.locator('button.continue');
  await expect(continueBtn).toHaveText(/\[CONTINUE ▸ 1\/\d+\]/, { timeout: 15_000 });
  await expect(page.locator('.type-cursor')).toHaveCount(1);

  // Enter while the page is still typing finishes just that page: the frontier jumps to the
  // page's end, not the whole reply, and the page number doesn't move.
  await page.keyboard.press('Enter');
  await expect(continueBtn).toHaveText(/\[CONTINUE ▸ 1\/\d+\]/);

  // At the moment the cursor stops at the page end, every `.unshown` character sits below the
  // visible page: none of its client rects overlap the (overflow-clipped) `.text` box.
  const text = page.locator('#feed .msg.agent:visible .text');
  const overlapping = await text.evaluate((el) => {
    const box = el.getBoundingClientRect();
    let n = 0;
    for (const span of el.querySelectorAll<HTMLElement>('.unshown')) {
      for (const r of Array.from(span.getClientRects())) {
        if (r.width === 0 && r.height === 0) continue;
        if (r.top < box.bottom - 0.5 && r.bottom > box.top + 0.5) n++;
      }
    }
    return n;
  });
  expect(overlapping).toBe(0);

  // Enter again, on the now-finished page, turns it (on the last page there's no [CONTINUE]).
  await page.keyboard.press('Enter');
  await expect(text).toHaveAttribute('data-page', '1', { timeout: 5_000 });

  expect(errors).toEqual([]);
});

test('paging fit: a reply that fits never pages, and a long one keeps one page size that fits the box', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('.link')).toHaveAttribute('data-status', 'ok');
  // She greets you first: let that reply land before counting replies.
  await awaitGreeting(page);
  const replies = page.locator('#feed .msg.agent');
  const resize = () => page.evaluate(() => window.dispatchEvent(new Event('resize')));

  /** Sends `len:N`, waits until the whole reply is in while she's still streaming, and returns its node. */
  async function reply(n: number) {
    const before = await replies.count();
    await send(page, { type: 'user_message', text: `len:${n}` });
    await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
    const last = replies.last();
    await expect(last).toHaveClass(/s-streaming/);
    await expect.poll(() => last.locator('.text').evaluate((t) => t.textContent?.length ?? 0)).toBeGreaterThanOrEqual(n);
    return last;
  }

  /**
   * Where the message sits in the box. The collapsed box keeps itself scrolled to the bottom, so a
   * message taller than the box shows up as clipping at the top (the box scrolled), not the bottom.
   */
  const fit = (node: typeof replies) =>
    node.evaluate((n) => {
      const list = n.closest<HTMLElement>('.feed')!;
      const box = list.getBoundingClientRect();
      const btn = n.querySelector('button.continue')?.getBoundingClientRect();
      return {
        scrolled: list.scrollTop - parseFloat(getComputedStyle(list).paddingTop),
        // How far the message's content (inside its top padding) starts above the box's top edge.
        contentTopClip: box.top - (n.getBoundingClientRect().top + parseFloat(getComputedStyle(n).paddingTop)),
        buttonInside: btn ? btn.top >= box.top - 0.5 && btn.bottom <= box.bottom + 0.5 : null,
      };
    });

  // A 7-line reply on the 1600×900 stage: fits once the name row is counted and the box's bottom
  // padding borrowed. Being 7 lines depends on the font and the subtitle's width (about 915 is the most
  // that fits between the corner stacks): wait for the font.
  await page.evaluate(() => document.fonts.ready);
  const short = await reply(880);
  await expect(short).toHaveClass(/s-ok/, { timeout: 10_000 });
  await expect(page.locator('.line-keys button.key')).toHaveCount(5);
  await resize();
  await expect(page.locator('button.continue')).toHaveCount(0);
  // It may borrow its bottom padding (the box then scrolls by as much), but no content is cut off.
  expect((await fit(short)).contentTopClip).toBeLessThanOrEqual(0.5);

  // A long reply (too long even for the stretched box): the same page while streaming, once done and
  // after a later refresh — and that page, with the controls and [CONTINUE] under it, fits the box:
  // the box never has to scroll.
  const long = await reply(2600);
  const maxHeight = () => long.locator('.text').evaluate((t) => t.style.maxHeight);
  const streaming = await maxHeight();
  expect(streaming).not.toBe('');
  await expect(long).toHaveClass(/s-ok/, { timeout: 10_000 });
  expect(await maxHeight()).toBe(streaming);
  const expectFits = async () => {
    // The box eases to its new height; measure it settled.
    await long.evaluate((n) => Promise.all(n.closest<HTMLElement>('.feed')!.getAnimations().map((a) => a.finished)));
    const f = await fit(long);
    expect(f.scrolled).toBeLessThanOrEqual(0.5);
    expect(f.contentTopClip).toBeLessThanOrEqual(0.5);
    expect(f.buttonInside).toBe(true);
  };
  await expectFits();
  await resize();
  expect(await maxHeight()).toBe(streaming);
  await expect(page.locator('button.continue')).toHaveText(/\[CONTINUE ▸ 1\/\d+\]/);
  await expectFits();

  expect(errors).toEqual([]);
});

test('box fit: at 1000px tall (the stage letterboxed), a 7-line reply grows the box instead of paging, and shows whole', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('.link')).toHaveAttribute('data-status', 'ok');
  await awaitGreeting(page);
  await page.evaluate(() => document.fonts.ready);
  const replies = page.locator('#feed .msg.agent');
  const before = await replies.count();
  await send(page, { type: 'user_message', text: 'len:880' });
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  const last = replies.last();
  await expect(last).toHaveClass(/s-ok/, { timeout: 10_000 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));

  await expect(page.locator('button.continue')).toHaveCount(0);
  await last.evaluate((n) => Promise.all(n.closest<HTMLElement>('.feed')!.getAnimations().map((a) => a.finished))); // the box eases in
  const f = await last.evaluate((n) => {
    const list = n.closest<HTMLElement>('.feed')!;
    const box = list.getBoundingClientRect();
    const text = n.querySelector<HTMLElement>('.text')!;
    return {
      boxH: box.height,
      // The box's rest and cap in stage px (24 % and 34 % of 900), times the stage's zoom.
      restH: 216 * Math.min(window.innerWidth / 1600, window.innerHeight / 900),
      capH: 306 * Math.min(window.innerWidth / 1600, window.innerHeight / 900),
      lines: Math.round(text.scrollHeight / parseFloat(getComputedStyle(text).lineHeight)),
      contentTopClip: box.top - (n.getBoundingClientRect().top + parseFloat(getComputedStyle(n).paddingTop)),
    };
  });
  expect(f.lines).toBeGreaterThanOrEqual(7);
  expect(f.boxH).toBeGreaterThan(f.restH + 1);
  expect(f.boxH).toBeLessThanOrEqual(f.capH + 0.5);
  expect(f.contentTopClip).toBeLessThanOrEqual(0.5);

  expect(errors).toEqual([]);
});

// Starts its own playthrough (Nix with Alpha as the player), so it opens as a first meeting.
test('greeting: after END SCENE, back in greets you again, and only once the recap card is read', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await skipSplash(page);
  await dialIn(page, DIRECT.id, SECOND.id);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await expect(page.locator('.link')).toHaveAttribute('data-status', 'ok');
  const replies = await page.locator('.msg.agent.s-ok').count();
  await page.locator('button.end-scene').click();
  // Her closing beat, then the scribe (it has no recap to write here, so the player's below stands).
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(replies + 1, { timeout: 10_000 });
  await page.waitForTimeout(1_000);
  await send(page, { type: 'dev_action', tool: 'set_recap', args: { text: 'we closed up at dawn' }, as: 'agent' });
  const before = (await chatsOf(DIRECT)).length;

  await page.reload();
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('.recap-card .recap-text')).toHaveText('we closed up at dawn');
  await expect(page.locator('.link')).toHaveAttribute('data-status', 'ok');
  expect(await greeting(page)).toBe('waiting');
  expect(await chatsOf(DIRECT)).toHaveLength(before);

  await page.keyboard.press('Space');
  await expect(page.locator('.recap-card')).toHaveCount(0);
  await awaitGreeting(page);

  expect(errors).toEqual([]);
});

test('flat rooms: the frame follows the room, both ways', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  const frame = () => page.evaluate(() => window.__nixRoom!.frameSize());
  const drawn = () => page.evaluate(() => window.__nixRoom!.viewSize());
  // What each kind of room should fill on the game stage (in device px): flat fits smoothly, 480 in whole steps.
  const expected = () =>
    page.evaluate(() => {
      const r = document.getElementById('game')!.getBoundingClientRect();
      const c = { width: Math.round(r.width * devicePixelRatio), height: Math.round(r.height * devicePixelRatio) };
      const fit = Math.min(c.width / 1536, c.height / 864);
      const step = Math.max(1, Math.floor(Math.min(c.width / 480, c.height / 270)));
      return { flat: [Math.round(1536 * fit), Math.round(864 * fit)], legacy: [480 * step, 270 * step] };
    });

  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'zz-flat-test', transition: 'fade' } });
  await expect.poll(frame).toEqual([1536, 864]);
  await expect.poll(() => nonBlank(page)).toBe(true);
  await expect.poll(drawn).toEqual((await expected()).flat);
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'zz-legacy-test', transition: 'fade' } });
  await expect.poll(frame).toEqual([480, 270]);
  await expect.poll(drawn).toEqual((await expected()).legacy);
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'zz-flat-test', transition: 'fade' } });
  await expect.poll(frame).toEqual([1536, 864]);

  // Quick switches (Review Focus 1): the last room asked for decides the frame.
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'zz-flat-test', transition: 'glitch' } });
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'zz-legacy-test', transition: 'glitch' } });
  await page.waitForTimeout(TRANSITION_WAIT_MS * 2);
  await expect.poll(frame).toEqual([480, 270]);

  expect(await page.evaluate(() => window.__nixRoom!.warnings)).toEqual([]);
  expect(errors).toEqual([]);
});

test('effects: a storm brings strikes and thunder; the screen powers off with its light', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  const fx = () => page.evaluate(() => window.__nixRoom!.effects());

  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await page.mouse.click(960, 400); // unlock sound
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'zz-flat-test', transition: 'fade' } });
  await expect.poll(async () => (await fx())?.screens.length ?? 0, { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => (await fx())?.dust ?? 0).toBeGreaterThan(0);
  // The room's two window shapes: glass at x 1000–1090 and 1110–1200, a post between them.
  const GLASS: [number, number] = [1045, 200], POST: [number, number] = [1100, 200];
  const brightness = (at: [number, number]) => page.evaluate(([x, y]) => window.__nixRoom!.pixelAt(x, y).reduce((a, b) => a + b, 0), at);
  const [glass0, post0] = [await brightness(GLASS), await brightness(POST)];

  await send(page, { type: 'dev_action', tool: 'set_atmosphere', args: { weather: 'rain', weather_level: 0.9, duration: 0 } });
  // During a flash the glass lights up and the post stays dark (read in the same frame).
  const flash = await page.evaluate(
    ([glass, post]) =>
      new Promise<{ glass: number; post: number; area: string | null; masked: boolean } | null>((resolve) => {
        const h = window.__nixRoom!;
        const sum = (p: [number, number]) => h.pixelAt(...p).reduce((a, b) => a + b, 0);
        const start = performance.now();
        const step = () => {
          const s = h.effects();
          if (s && s.flash > 0.3) return resolve({ glass: sum(glass), post: sum(post), area: s.flashArea, masked: s.weatherMasked });
          if (performance.now() - start > 45_000) return resolve(null);
          requestAnimationFrame(step);
        };
        step();
      }),
    [GLASS, POST] as const,
  );
  expect(flash).not.toBeNull();
  expect(flash!.area).toBe('shapes');
  expect(flash!.masked).toBe(true);
  const glassRise = flash!.glass - glass0, postRise = flash!.post - post0;
  expect(glassRise).toBeGreaterThan(60);
  expect(postRise).toBeLessThan(glassRise / 3);
  await expect.poll(async () => (await fx())?.strikes ?? 0, { timeout: 45_000 }).toBeGreaterThanOrEqual(1);
  // Thunder after the strike, when the build has the thunder takes (the public repo doesn't).
  if (await hasSound(page, '/sound/thunder/near-1.ogg')) {
    await expect.poll(async () => (await page.evaluate(() => window.__nixRoom!.audio())).thunders ?? 0, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  }
  expect((await fx())!.weatherDrawn).toBe(false);

  await send(page, { type: 'dev_action', tool: 'set_light', args: { light_id: 'screens', intensity: 0, duration: 0 } });
  await expect.poll(async () => (await fx())!.screens[0].on).toBe(false);

  expect(await page.evaluate(() => window.__nixRoom!.warnings)).toEqual([]);
  expect(errors).toEqual([]);
});


test('songs: a room shuffles its songs with a pause; a shared song carries on', async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  const audio = () => page.evaluate(() => window.__nixRoom!.audio());
  const tones = ['zz-tone-a.ogg', 'zz-tone-b.ogg'];

  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await page.mouse.click(960, 400); // unlock sound
  await page.evaluate(() => window.__nixRoom!.setMusicPause(1, 1));
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'zz-songs-a', transition: 'fade' } });
  // The room change itself, then its song (not a song left over from the room before).
  await expect.poll(async () => (await audio()).scene, { timeout: 15_000 }).toBe('karasu/zz-songs-a');
  await expect.poll(async () => (await audio()).music, { timeout: 15_000 }).toBe('playing');
  const first = (await audio()).playlist.song!;
  expect(tones).toContain(first);
  const other = first === tones[0] ? tones[1] : tones[0];

  // The 3 s tone plays out, a 1 s pause, then the other song.
  await expect.poll(async () => (await audio()).playlist.phase, { timeout: 15_000 }).toBe('pause');
  await expect.poll(async () => { const a = await audio(); return a.playlist.song === other && a.music === 'playing'; }, { timeout: 15_000 }).toBe(true);

  // At once into a room sharing the song: the room change lands, and the song carries on (no new start).
  const before = await audio();
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'zz-songs-b', transition: 'fade' } });
  await expect.poll(async () => (await audio()).scene, { timeout: 15_000 }).toBe('karasu/zz-songs-b');
  const after = await audio();
  expect(after.playlist.song).toBe(other);
  expect(after.musicStarts).toBe(before.musicStarts);

  expect(await page.evaluate(() => window.__nixRoom!.warnings)).toEqual([]);
  expect(errors).toEqual([]);
});

// Nix's room is shared by every test that drives her, so the map's test lives here, where tests run one at a time.
test('map: opens on the whole city with the district you are in open (no auto zoom), switches districts, Esc goes to the city and then closes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
  // The fade's length, as the smoke tests wait it out.
  await page.waitForTimeout(1_500);

  await page.locator('.hud-map').click();
  const heading = page.locator('.map-heading');
  await expect(heading.locator('.t')).toHaveText('KARASU');
  await expect(heading.locator('.s')).toHaveText('Old Town / The Ribbon');
  const intake = page.locator('.map-bt.place.focus');
  await expect(intake.locator('.nm')).toHaveText('Lowlight Intake');
  await expect(intake.locator('.n')).toHaveText('04');
  // The ambience canvas lies in the camera layer, sized to the screen.
  const amb = page.locator('.map-world > canvas.map-amb');
  await expect(amb).toHaveCount(1);
  await expect.poll(() => amb.evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(0);
  await expect(page.locator('.map-strip .chip .tag')).toHaveText(['· YOU', '· CONTACT']);
  await expect(page.locator('.map-world')).toHaveAttribute('style', /scale\(1\)/);
  await expect(page.locator('.city-map .pin.here')).toHaveCount(1);
  await expect(page.locator('.map-notice')).toBeHidden();
  // The CRT (scanlines, fuzz, roll, vignette) is drawn over the map, band and strip, as on a real screen.
  const z = await page.evaluate(() => {
    const zi = (sel: string) => Number(getComputedStyle(document.querySelector(sel)!).zIndex) || 0;
    return { city: Math.max(zi('.map-world'), zi('.map-overlay-host')), crt: Math.min(zi('.map-scan'), zi('.map-fuzz'), zi('.map-roll'), zi('.map-vignette')) };
  });
  expect(z.crt).toBeGreaterThan(z.city);

  // Every place's pin shows at full strength with Karasu open; another district's pin names itself on hover (spec 2026-10-28 §1).
  const places = await page.evaluate(async () => {
    const r = (await (await fetch('/api/map')).json()) as { map?: unknown };
    const m = (r.map ?? r) as { places: { id: string; name: string; district: string; side?: boolean }[] };
    return m.places.filter((p) => !p.side);
  });
  const pins = page.locator('.city-map .pin');
  await expect(pins).toHaveCount(places.length);
  expect(new Set(await pins.evaluateAll((ps) => ps.map((p) => getComputedStyle(p).opacity)))).toEqual(new Set(['1']));
  // Every district's name is printed on the map, at 70 % at 1× (district names spec 2026-10-28 §2, §3).
  const districts = await page.evaluate(async () => {
    const r = (await (await fetch('/api/map')).json()) as { map?: unknown };
    return ((r.map ?? r) as { districts: { id: string; name: string }[] }).districts;
  });
  for (const d of districts) await expect(page.locator(`svg.city-names text.dname[data-id="${d.id}"]`)).toHaveText(d.name);
  expect(Number(await page.locator('svg.city-names').evaluate((s) => getComputedStyle(s).opacity))).toBeCloseTo(0.7, 1);
  const velvet = places.find((p) => p.district === 'velvet')!;
  const vpin = page.locator(`.city-map .pin[data-place="${velvet.id}"]`);
  // Pins are 0×0 boxes with a pseudo-element diamond, which Playwright counts as unhoverable: the pointer event itself.
  await vpin.dispatchEvent('mouseenter');
  await expect(vpin.locator('.map-ntag .nm')).toHaveText(velvet.name);
  await expect(vpin.locator('.map-ntag .nm')).toBeVisible();
  // A drag goes past the city's edge onto the grid (spec 2026-10-28 §2, §3). After the glitch-in: its clip-path hides
  // parts of the screen from the pointer while it plays.
  await page.locator('.map-screen').evaluate((s) =>
    Promise.all(s.getAnimations().filter((a) => (a as CSSAnimation).animationName === 'map-glitch-in').map((a) => a.finished)));
  const view = () => page.locator('.map-world').evaluate((w) => /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([\d.e]+)\)/.exec((w as HTMLElement).style.transform)!.slice(1).map(Number));
  await page.mouse.move(1000, 600);
  await page.mouse.down();
  await page.mouse.move(1010, 600, { steps: 2 });
  await page.mouse.move(1800, 600, { steps: 10 });
  await page.mouse.up();
  expect((await view())[0]).toBeGreaterThan(0);
  expect(await page.locator('.map-screen').evaluate((s) => (s as HTMLElement).style.backgroundSize)).not.toBe('');
  // Two real touch fingers spreading zoom in (spec 2026-10-28 §4): Chromium's own touch input, so the pointers are live.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', xs: number[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: xs.map((x, id) => ({ x, y: 600, id })) });
  await touch('touchStart', [1000, 1200]);
  for (const d of [120, 160, 200]) await touch('touchMove', [1100 - d, 1100 + d]);
  await touch('touchEnd', []);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  expect((await view())[2]).toBeGreaterThan(1);

  await page.keyboard.press('Escape');
  await expect(heading).toHaveCount(0);
  await page.locator('.map-bt.dist[data-id="velvet"]').click();
  await expect(heading.locator('.t')).toHaveText('VELVET');
  await expect(page.locator('.map-band')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(heading).toHaveCount(0);
  await expect(page.locator('#map')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#map')).toBeHidden();

  expect(errors).toEqual([]);
});

test("doors: hover the walkway's grey door for the way, click into Hicks's room, and his door back out", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'karasu/hicks-gallery', transition: 'fade' } });

  const grey = page.locator('#doors .door-spot[data-to="karasu/hicks-room"]');
  await expect(grey).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('#doors .door-spot[data-to="karasu/zhou-flat"]')).toHaveCount(1);
  await grey.hover();
  await expect(grey.locator('.door-label')).toBeVisible();
  await expect(grey.locator('.door-label')).toHaveText('THROUGH THE GREY DOOR INTO HIS ROOM');
  await page.locator('#doors').screenshot({ path: test.info().outputPath('walkway-door-hover.png') });
  await page.screenshot({ path: test.info().outputPath('walkway-door-hover-page.png') });

  await grey.click();
  await expect(page.locator('#feed .msg.travel').last()).toContainText('go through the grey door into his room');
  await expect(page.locator('#feed .msg.agent:visible .text').last()).toContainText(DIRECT.reply, { timeout: 10_000 });
  const out = page.locator('#doors .door-spot[data-to="karasu/hicks-gallery"]');
  await expect(out).toHaveCount(1, { timeout: 10_000 });
  await expect(grey).toHaveCount(0);

  const replies = page.locator('#feed .msg.agent');
  const before = await replies.count();
  await out.click();
  await expect(page.locator('#feed .msg.travel').last()).toContainText('go out to the walkway');
  await expect(grey).toHaveCount(1, { timeout: 10_000 });
  // Her arrival answer finishes before the test ends, so the worker's server is free for the next test.
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  await expect(replies.last()).toHaveClass(/s-ok/, { timeout: 10_000 });

  // Hide UI (Alt+H) hides the doors too.
  await page.keyboard.press('Alt+h');
  await expect(grey).toBeHidden();
  expect(errors).toEqual([]);
});

test('map travel: GO walks you both to the stall and she answers; her walk-up is its landing, open to anyone', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
  await page.waitForTimeout(1_500);

  await page.locator('.hud-map').click();
  const strip = page.locator('.map-strip');
  await page.locator('.map-bt.place', { hasText: "Nix's walk-up" }).click();
  // The pin is the landing outside her door: anyone can go; her apartment past it is hers to invite you into.
  await expect(strip.locator('.invite')).toHaveCount(0);
  await expect(strip.locator('.go')).toHaveCount(1);

  await page.locator('.map-bt.place', { hasText: "Hae's Noodles" }).click();
  await strip.locator('.go').click();
  await expect(page.locator('#map')).toBeHidden();
  await arriveGo(page);
  await expect(page.locator('#feed .msg.travel').last()).toContainText("head from Lowlight Intake to Hae's Noodles");
  await expect(page.locator('#feed .msg.agent:visible .text')).toContainText(DIRECT.reply, { timeout: 10_000 });

  await page.locator('.hud-map').click();
  await expect(page.locator('.city-map .pin.here')).toHaveAttribute('data-place', 'haes-noodles');

  expect(errors).toEqual([]);
});

test('narrow windows: the HUD groups never overlap, and END SCENE stays in its stack on the stage', async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 900 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  for (const width of [2000, 1440, 1100, 900, 780]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
          const bar = document.querySelector<HTMLElement>('.hud-bar')!;
          return {
            apart: box('.hud-left').right <= box('.hud-right').left,
            fits: bar.scrollWidth <= bar.clientWidth,
            endInside: box('.end-scene').right <= box('.scene-keys').right + 0.5 && box('.scene-keys').right <= box('#game').right + 0.5,
          };
        }),
        { message: `at ${width}px` },
      )
      .toEqual({ apart: true, fits: true, endInside: true });
  }
});

test('a line that arrives live: its name row sits over its text and its footer on the band bottom', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const place = () =>
    page.evaluate(() => {
      const top = (n: Element) => n.getBoundingClientRect();
      const band = top(document.querySelector('#feed .feed')!);
      const line = [...document.querySelectorAll('#feed .msg')].find((n) => !n.classList.contains('hidden-collapsed'))!;
      const meta = top(line.querySelector('.meta')!);
      const text = top(line.querySelector('.text')!);
      const foot = top(line.querySelector('.foot')!);
      return { plateOnEdge: meta.bottom <= text.top + 0.5 && meta.left === text.left, footOnBottom: Math.abs(band.bottom - 12 - foot.bottom) <= 2, live: line.classList.contains('live') };
    });
  // the player's own line, the moment it's sent (and, for a while, the current line).
  const replies = page.locator('#feed .msg.agent.s-ok');
  const before = await replies.count();
  await send(page, { type: 'user_message', text: 'len:400 chunk:20 every:300', mode: 'ooc' });
  await expect.poll(place).toEqual({ plateOnEdge: true, footOnBottom: true, live: true });
  // Let her reply land: one still streaming would keep her turn busy for the next test on this worker's server.
  await expect(replies).toHaveCount(before + 1, { timeout: 15_000 });
});

test('persona: play Nix as Vee — the room names you Vee and her turn says who you are', async ({ page }) => {
  await skipSplash(page);
  await newGame(page);
  await showTile(page, DIRECT.id);
  await page.locator(`.tile[data-id="${DIRECT.id}"]`).click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'you');
  await page.locator('.yp-row[data-kind="custom"]').click();
  await page.locator('.yp-name').fill('Vee');
  await page.locator('.yp-background').fill('Ex-courier.');
  await page.locator('.yp-confirm').click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'p2');
  await expect(page.locator('.fighter.p1 .name')).toHaveText('VEE');
  await showTile(page, SECOND.id);
  await page.locator(`.tile[data-id="${SECOND.id}"]`).click();
  await expect(phase(page)).toHaveAttribute('data-phase', /model|ready/);
  if ((await phase(page).getAttribute('data-phase')) === 'model') {
    await expect(page.locator('.model-panel .mp-row.on')).toBeVisible();
    await page.keyboard.press('Enter');
  }
  await expect(phase(page)).toHaveAttribute('data-phase', 'ready');
  // A reply still streaming from an earlier test refuses a new game ("Wait for … to finish"): Enter again until it starts.
  await expect(async () => {
    await page.keyboard.press('Enter');
    await page.waitForURL(`**/room/${SECOND.id}*`, { timeout: 2_000 });
  }).toPass({ timeout: 45_000 });
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(page.locator('.stage-left')).toHaveAttribute('aria-label', 'Vee');
  await awaitGreeting(page);
  const before = await page.locator('.msg.agent.s-ok').count();
  await send(page, { type: 'user_message', text: 'hello' });
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
  const said = (await chatsOf(SECOND)).at(-1)!.map((m) => m.content).join('\n');
  // Vee takes Nix's pronoun (she), as every name in a prompt carries one.
  expect(said).toContain('[you: Vee (she) — Ex-courier.]');
  expect(said).toContain("[who's here: Vee (she)]");
});

test('YOU sheet wardrobe: ← dresses Hicks in another outfit, in the room too, and a reload keeps it', async ({ page }) => {
  await skipSplash(page);
  await newGame(page);
  await showTile(page, 'hicks');
  await lockPlayer(page, 'hicks');
  await showTile(page, SECOND.id);
  await page.locator(`.tile[data-id="${SECOND.id}"]`).click();
  await expect(phase(page)).toHaveAttribute('data-phase', /model|ready/);
  if ((await phase(page).getAttribute('data-phase')) === 'model') {
    await expect(page.locator('.model-panel .mp-row.on')).toBeVisible();
    await page.keyboard.press('Enter');
  }
  await expect(phase(page)).toHaveAttribute('data-phase', 'ready');
  // A reply still streaming from an earlier test refuses a new game: Enter again until it starts.
  await expect(async () => {
    await page.keyboard.press('Enter');
    await page.waitForURL(`**/room/${SECOND.id}*`, { timeout: 2_000 });
  }).toPass({ timeout: 45_000 });
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  const art = page.locator('.stage-left .stage-art');
  // Hicks's plain sprite is his outdoors outfit, so that's what the sheet says he's wearing.
  await expect(art).toHaveAttribute('style', /\/api\/persona\/sprite/);
  await page.keyboard.press('Alt+KeyY');
  // It opens on FILE (spec 2026-10-28 §3): Hicks's own select-screen file (live, so only that it's there).
  await expect(page.locator('.character-sheet .cs-page-tab.on')).toHaveAttribute('data-page', 'file');
  await expect(page.locator('.character-sheet .cs-bio p').first()).toBeVisible();
  await expect(page.locator('.character-sheet .cs-facts dt').first()).toBeVisible();
  await expect(page.locator('.character-sheet [data-section="stats"]')).toBeHidden();
  await page.keyboard.press('Tab');
  await expect(page.locator('.character-sheet [data-section="stats"]')).toBeVisible();
  await expect(page.locator('.character-sheet .cs-filepage')).toBeHidden();
  // The next Tab goes on round the cycle, to PEOPLE; Shift+Tab comes back into YOU at SHEET, then FILE.
  await page.keyboard.press('Tab');
  await expect(page.locator('.people-screen')).toBeVisible();
  await expect(page.locator('.character-sheet')).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.character-sheet .cs-page-tab.on')).toHaveAttribute('data-page', 'sheet');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.character-sheet .cs-page-tab.on')).toHaveAttribute('data-page', 'file');
  await expect(page.locator('.character-sheet .cs-outfit')).toHaveText('OUTDOORS');
  await expect(page.locator('.cs-wardrobe')).not.toHaveClass(/planned/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.character-sheet .cs-outfit')).toHaveText('HOME');
  await expect(page.locator('.character-sheet .cs-img')).toHaveAttribute('src', '/api/agents/hicks/outfit/home');
  await expect(art).toHaveAttribute('style', /\/api\/agents\/hicks\/outfit\/home/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.character-sheet')).toHaveCount(0);
  // Saved in the playthrough: a reload still wears it.
  await expect.poll(async () => ((await (await page.request.get('/api/persona')).json()) as { persona: { outfit?: string } }).persona.outfit).toBe('home');
  await page.reload();
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await expect(art).toHaveAttribute('style', /\/api\/agents\/hicks\/outfit\/home/);
  await page.keyboard.press('Alt+KeyY');
  await expect(page.locator('.character-sheet .cs-outfit')).toHaveText('HOME');
});

// The rendered map (spec 2026-10-25 §5): fixture tiles served by the browser; the e2e servers themselves answer no
// tiles.json, so every other test sees the painting. Device pixel ratio 2, so zooming into Karasu asks for its 8× tiles.
test('map on rendered tiles: zoom into Karasu past 4x, an 8x tile loads, the Intake stands raised', async ({ browser }, info) => {
  const sharp = (await import('sharp')).default;
  const key = (p: number, n: number, k: number) => Math.floor((p / 100) * n * k);
  const intake: [number, number] = [89.1, 33.5];
  const near = (k: number, cols: number, rows: number) => {
    const c = key(intake[0], cols / k, k), r = key(intake[1], rows / k, k);
    return [-1, 0, 1].flatMap((dc) => [-1, 0, 1].map((dr) => `${c + dc}_${r + dr}`));
  };
  const manifest = {
    version: 1, size: [4608, 3072], tile: 512,
    levels: [
      { scale: 1, cols: 9, rows: 6, tiles: 'all' },
      { scale: 4, cols: 36, rows: 24, tiles: 'all' as const },
      { scale: 8, cols: 72, rows: 48, tiles: near(8, 72, 48) },
    ],
    deep: ['karasu'], dataHash: 'fixture', blender: '5.2.2', pinHeights: { 'lowlight-intake': 26.7 }, rendered: 'fixture',
  };
  const colour: Record<string, { r: number; g: number; b: number }> = { 1: { r: 20, g: 16, b: 40 }, 4: { r: 40, g: 30, b: 60 }, 8: { r: 70, g: 50, b: 90 } };
  const tile = (s: string) => sharp({ create: { width: 512, height: 512, channels: 3, background: colour[s] ?? colour[1]! } }).webp().toBuffer();
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, deviceScaleFactor: 2, viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  await skipSplash(page);
  await page.route('**/map/tiles.json', (r) => r.fulfill({ json: manifest }));
  await page.route('**/map/windows.json', (r) => r.fulfill({ json: [] }));
  await page.route('**/map/tiles/**', async (r) => {
    const m = /\/map\/tiles\/(\d+)\/(\d+_\d+)\.webp/.exec(r.request().url());
    const level = m && manifest.levels.find((l) => String(l.scale) === m[1]);
    if (!m || !level || (level.tiles !== 'all' && !level.tiles.includes(m[2]!))) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ body: await tile(m[1]!), contentType: 'image/webp' });
  });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
  await page.waitForTimeout(1_500);
  await page.locator('.hud-map').click();
  await expect(page.locator('img.map-img')).toBeHidden();
  const pin = page.locator('.city-map .pin[data-place="lowlight-intake"]');
  await expect(pin).toHaveCount(1);
  // Every pin is on top of the tiles, not hidden under the sharper levels' images (the focused pin has its own z-index,
  // so check one that isn't focused).
  await expect
    .poll(() => page.locator('.city-map .pin[data-place="second-socket"]').evaluate((el) => {
      // The pin's name tag (the pin itself has no size): whatever is on top there must be part of the city layer.
      const tag = el.firstElementChild as HTMLElement;
      const r = tag.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && !!top.closest('.city-map');
    }))
    .toBe(true);
  expect(parseFloat((await pin.getAttribute('style'))!.match(/top:\s*([\d.]+)%/)![1]!)).toBeLessThan(intake[1]);
  const scale = () => page.locator('.map-world').evaluate((w) => Number(/scale\(([\d.]+)\)/.exec((w as HTMLElement).style.transform)?.[1] ?? 1));
  for (let i = 0; i < 12 && (await scale()) < 6; i++) {
    const at = await pin.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(80);
  }
  expect(await scale()).toBeGreaterThan(4);
  await expect
    .poll(() => page.locator('img.map-tile[src*="/tiles/8/"]').evaluateAll((imgs) => imgs.filter((i) => (i as HTMLImageElement).naturalWidth > 0).length))
    .toBeGreaterThan(0);
  await context.close();
});

// Blackouts (spec 2026-10-27): a fixture render whose masks put Karasu on each tile's left half and Velvet on its right;
// the dark copies are black. Never the real tiles.
test('map blackouts: a district goes dark over the rendered tiles and comes back', async ({ page }) => {
  const sharp = (await import('sharp')).default;
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const manifest = {
    version: 1, size: [4608, 3072], tile: 512, levels: [{ scale: 1, cols: 9, rows: 6, tiles: 'all' }],
    deep: ['karasu'], dataHash: 'fixture', blender: '5.2.2', pinHeights: {}, rendered: 'fixture',
    dark: { levels: [1] }, mask: { districts: ['karasu', 'velvet', 'spine'] },
  };
  const flat = (r: number, g: number, b: number) => sharp({ create: { width: 512, height: 512, channels: 3, background: { r, g, b } } });
  const lit = await flat(90, 70, 120).webp().toBuffer();
  const dark = await flat(0, 0, 0).webp().toBuffer();
  const half = await flat(16, 0, 0).png().toBuffer();
  const mask = await flat(8, 0, 0).composite([{ input: await sharp(half).extract({ left: 0, top: 0, width: 256, height: 512 }).toBuffer(), left: 256, top: 0 }]).png({ palette: true, dither: 0 }).toBuffer();
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.route('**/map/tiles.json', (r) => r.fulfill({ json: manifest }));
  await page.route('**/map/windows.json', (r) => r.fulfill({ json: [] }));
  await page.route('**/map/tiles/**', (r) => r.fulfill({ body: lit, contentType: 'image/webp' }));
  await page.route('**/map/tiles-dark/**', (r) => r.fulfill({ body: dark, contentType: 'image/webp' }));
  await page.route('**/map/tiles-mask/**', (r) => r.fulfill({ body: mask, contentType: 'image/png' }));
  // One sign inside Karasu (blackouts phase 2): it goes out with the district.
  await page.route('**/api/map', async (r) => {
    const live = await (await r.fetch()).json();
    const karasu = live.districts.find((d: { id: string }) => d.id === 'karasu');
    live.ambience = { signs: [], plumes: [], traffic: [], ...live.ambience };
    live.ambience.signs = [...live.ambience.signs, { at: karasu.label, color: '#ff4fd8', mode: 'pulse', size: 1 }];
    await r.fulfill({ json: live });
  });
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await page.locator('.hud-map').click();
  await expect(page.locator('img.map-img')).toBeHidden();
  // The map data comes through the route above (a fetch of the live map first): give it time under a full run.
  await expect(page.locator('.map-strip')).toBeVisible({ timeout: 15_000 });
  // Only Karasu's sign is on the grid here (no windows in the fixture).
  await expect.poll(() => page.evaluate(() => window.__nixRoom!.mapGridLights!()), { timeout: 3_000 }).toBe(1);
  const before = 1;

  await page.evaluate(() => window.__nixRoom!.blackout!(['karasu']));
  const karasu = page.locator('.map-blackout-d[data-id="karasu"]');
  await expect(karasu).toBeVisible({ timeout: 2_000 });
  await expect.poll(() => karasu.evaluate((b) => (b as HTMLElement).style.opacity), { timeout: 2_000 }).toBe('1');
  expect(await karasu.locator('canvas').count()).toBeGreaterThan(0);
  // Velvet (the right halves) stays lit; the dark canvas holds only the left half's pixels.
  await expect(page.locator('.map-blackout-d[data-id="velvet"]')).toBeHidden();
  const alpha = await karasu.locator('canvas').first().evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const at = (x: number) => d[(256 * c.width + x) * 4 + 3];
    return [at(10), at(500)];
  });
  expect(alpha).toEqual([255, 0]);
  // Karasu's sign is out while the district is dark.
  await expect.poll(() => page.evaluate(() => window.__nixRoom!.mapGridLights!()), { timeout: 2_000 }).toBe(before - 1);

  await page.evaluate(() => window.__nixRoom!.blackout!([]));
  await expect(karasu).toBeHidden({ timeout: 3_500 });
  await expect.poll(() => page.evaluate(() => window.__nixRoom!.mapGridLights!()), { timeout: 2_000 }).toBe(before);
  expect(errors).toEqual([]);
});
