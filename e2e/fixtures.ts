import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { ClientEvent, PlaythroughInfo } from '../shared/types';
import type {} from '../web/src/main'; // window.__nixRoom

/** The direct twin (characters/nix-direct) and the fake OpenRouter's models. */
export const DIRECT = {
  id: 'nix-direct',
  name: 'Nix',
  /** Her rooms' district, for the specs that walk every room. */
  pack: 'karasu',
  /** The fake OpenRouter's everyday reply to her (numbered: `GLM reply #3`). */
  reply: 'GLM reply',
  /** A line of her identity.md, first in her system message: tells her requests from the others'. */
  identityLine: 'You are Nix Neon.',
  models: [
    { id: 'z-ai/glm-5.2', name: 'Z.ai: GLM 5.2' },
    { id: 'google/gemini-3.8-flash', name: 'Google: Gemini 3.8 Flash' },
  ],
} as const;

/**
 * A second direct contact, only in the e2e characters folder (serve.ts writes it): no rooms of her
 * own, so the neutral default rooms; a player who isn't Nix, or a second contact to dial.
 */
export const SECOND = {
  id: 'zz-alpha',
  name: 'Alpha',
  pack: 'default',
  reply: 'Alpha here. Workspace is quiet.',
  identityLine: 'You are Alpha, a quiet contact who keeps the workspace.',
  /** Her select-screen file (bio.md and facts), which CONTACTS shows (spec 2026-10-28 §4). */
  bio: 'Alpha keeps the workspace. Quiet, plain, never late.',
  fact: { label: 'KNOWN FOR', value: 'Keeping the workspace quiet.' },
} as const;

// This worker's (or server's) ports: each worker has a game server of its own (e2e/ports.ts).
import { STUB_OR_LOG_PORT } from './ports';
export { BUG_RELAY_PORT, STUB_OR_LOG_PORT } from './ports';
/** The key e2e links with, and one the fake OpenRouter refuses (the link panel's rejected path). */
export const GOOD_KEY = 'sk-or-e2e';
export const BAD_KEY = 'sk-or-bad-e2e-key';
/** The Anthropic stand-in's one good key, and its every reply (link.spec). */
export const ANT_KEY = 'sk-ant-e2e-good';
export const ANT_REPLY = 'Claude reply';

/**
 * Opens the dial-in straight on the select screen, as if this session had already dismissed the
 * splash. Rooms skip the page-load arrival screen too, unless `intro` keeps it (arrival.spec).
 */
export async function skipSplash(page: Page, o: { intro?: boolean } = {}): Promise<void> {
  await page.addInitScript(() => sessionStorage.setItem('lowlight.splashSeen', '1'));
  if (!o.intro) await skipIntro(page);
}

/**
 * Skips the opening card that plays before the splash, and waits for it to go. With sound blocked it
 * opens on the sound prompt, and that first key starts it rather than skipping, so a second key does.
 */
export async function skipOpeningCard(page: Page): Promise<void> {
  await expect(page.locator('.opening-card')).toBeVisible();
  if (await page.locator('.oc-sound').isVisible()) {
    await page.keyboard.press('Space');
    await expect(page.locator('.oc-sound')).toHaveCount(0);
  }
  await page.keyboard.press('Space');
  await expect(page.locator('.opening-card')).toHaveCount(0);
}

/**
 * GO on the arrival screen the map's GO opened (spec 2026-10-27 §4): types `line` first when given,
 * and waits for the screen to step aside (the room has moved).
 */
export async function arriveGo(page: Page, line?: string): Promise<void> {
  await expect(page.locator('.ar-rule')).toHaveText('HEADING TO');
  if (line !== undefined) await page.locator('.ar-box textarea').fill(line);
  await page.locator('.ar-go').click();
  await expect(page.locator('.ar-root')).toHaveCount(0, { timeout: 10_000 });
}

/** Every room this page opens skips the page-load arrival screen (only arrival.spec looks at it); GO's still shows. */
export async function skipIntro(page: Page): Promise<void> {
  await page.addInitScript(() => sessionStorage.setItem('lowlight.skipIntro', '1'));
  // Graft's tips stay off for every test but graft-tips.spec (tipsOn), so job clicks and screenshots are as before.
  // Set once per page (a reload or a branch keeps what the test did with them).
  await page.addInitScript(() => localStorage.getItem('nix-room.graft-tips') ?? localStorage.setItem('nix-room.graft-tips', JSON.stringify({ off: true, seen: [] })));
}

/** QUEST's pane (quest panel 2026-10-31): a row on the HERE tab's list. */
export const questRow = (page: Page, title: string) => page.locator('.ql-list .ql-row', { hasText: title }).first();

/** Opens a QUEST tab (HERE, ELSEWHERE or FIXER) in the open pane. */
export async function questTab(page: Page, tab: 'here' | 'away' | 'fixer'): Promise<void> {
  await page.locator(`.ql-tab[data-tab="${tab}"]`).click();
}

/** Picks a quest on QUEST's HERE tab and presses START in its file (the pane is open). */
export async function startQuest(page: Page, title: string): Promise<void> {
  if ((await page.locator('.ql-pane[data-tab="here"]').count()) === 0) await questTab(page, 'here');
  await questRow(page, title).click();
  await page.locator('.ql-file .ql-start').click();
}

/** Graft's tips on, nothing seen, from this page's first load (graft-tips): after skipIntro, which turns them off. */
export async function tipsOn(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e.tipsOn')) return;
    sessionStorage.setItem('e2e.tipsOn', '1');
    localStorage.setItem('nix-room.graft-tips', JSON.stringify({ off: false, seen: [] }));
  });
}

/** The select screen's current phase (`p1`, `p2`, `model`, `ready`). */
export const phase = (page: Page) => page.locator('[data-phase]');

/** Waits for `id`'s tile on the select screen (one roster page: every tile is in the DOM). */
export async function showTile(page: Page, id: string): Promise<void> {
  await expect(page.locator(`.tile[data-id="${id}"]`)).toBeVisible();
}

/** The title menu's items, left to right: CONTINUE (with an active playthrough), NEW GAME, LOAD, REPORT A BUG. */
export type TitleItem = 'continue' | 'new' | 'load' | 'report';

/**
 * Opens the title menu and waits for its items (they arrive with the playthroughs). Goes to `/`
 * unless the page is already there; a splash still up has to be dismissed first (see skipSplash).
 */
export async function toTitle(page: Page): Promise<void> {
  // Off the title (a room, or the select screen after NEW GAME): load `/`, which opens on it.
  if (!(await page.locator('.title-menu').isVisible())) await page.goto('/');
  await expect(page.locator('.title-menu .tile[data-id="new"]')).toBeVisible();
}

/** Moves the title's cursor to `item` with ←→, then presses Enter on it. */
export async function pickTitle(page: Page, item: TitleItem): Promise<void> {
  const order = await page.locator('.title-menu .tile').evaluateAll((ns) => ns.map((n) => (n as HTMLElement).dataset.id));
  const to = order.indexOf(item);
  expect(to, `${item} is on the title`).toBeGreaterThanOrEqual(0);
  const from = order.indexOf((await page.locator('.title-menu .tile.on').getAttribute('data-id')) ?? '');
  for (let i = from; i !== to; i += to > from ? 1 : -1) await page.keyboard.press(to > from ? 'ArrowRight' : 'ArrowLeft');
  await expect(page.locator(`.title-menu .tile[data-id="${item}"]`)).toHaveClass(/\bon\b/);
  await page.keyboard.press('Enter');
}

/** The active playthrough's id. */
export async function activeId(page: Page): Promise<string> {
  return ((await (await page.request.get('/api/playthroughs')).json()) as { active: string }).active;
}

/**
 * Continues playthrough `id` from the LOAD screen: TITLE → LOAD, ←→ until its row is selected (the
 * saves are then on NOW), Enter. Waits for the room it opens.
 */
export async function continuePlaythrough(page: Page, id: string): Promise<void> {
  await toTitle(page);
  await pickTitle(page, 'load');
  const row = page.locator(`.load-screen .pt[data-id="${id}"]`);
  await expect(row).toBeVisible();
  // The cursor starts on the active playthrough; the list is newest first.
  const on = async () => row.evaluate((n) => n.classList.contains('on'));
  for (let i = 0; i < 50 && !(await on()); i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 50 && !(await on()); i++) await page.keyboard.press('ArrowLeft');
  await expect(row).toHaveClass(/\bon\b/);
  await expect(page.locator('.load-screen .ss[data-id="now"].on')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/room/**');
  await page.waitForFunction(() => window.__nixRoom !== undefined);
}

/** From anywhere: the title, then NEW GAME, onto the select screen's player pick. */
export async function newGame(page: Page): Promise<void> {
  await toTitle(page);
  await pickTitle(page, 'new');
  await expect(phase(page)).toHaveAttribute('data-phase', 'p1');
}

/** Locks `player` as 1P by clicking their tile, then plays as them at the YOU step (Enter): on to p2. */
export async function lockPlayer(page: Page, player: string): Promise<void> {
  const p = phase(page);
  await page.locator(`.tile[data-id="${player}"]`).click();
  await expect(p).toHaveAttribute('data-phase', 'you');
  await expect(page.locator('.you-panel .yp-row.on')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(p).toHaveAttribute('data-phase', 'p2');
}

/**
 * Dials into `ai`'s room as a NEW GAME: TITLE → NEW GAME, picks the player (playing as them) and the
 * AI by clicking their tiles, confirms the model step if there is one, then Enter on VS. Each call starts a fresh
 * playthrough (the whole run shares one server, so a test can't otherwise count on a clean world).
 */
export async function dialIn(page: Page, ai: string, player = 'hicks'): Promise<void> {
  await newGame(page);
  const p = phase(page);
  await showTile(page, player);
  await lockPlayer(page, player);
  await showTile(page, ai);
  await page.locator(`.tile[data-id="${ai}"]`).click();
  await expect(p).toHaveAttribute('data-phase', /model|ready/);
  if ((await p.getAttribute('data-phase')) === 'model') {
    // The model step's band: her current model is the highlighted row; Enter keeps it.
    await expect(page.locator('.model-band .mp-row.on')).toBeVisible();
    await page.keyboard.press('Enter');
  }
  await expect(p).toHaveAttribute('data-phase', 'ready');
  await page.keyboard.press('Enter');
  // The dial-in goes to `/room/<ai>`; the room may put `?as=<player>` back in the address bar.
  await page.waitForURL(`**/room/${ai}*`);
}

/**
 * Sends a client event from the room. Waits for the room's socket first: the page's hook exists
 * before the socket opens, and an event sent while it's still connecting is dropped.
 */
export async function send(page: Page, event: ClientEvent): Promise<void> {
  await page.waitForFunction(() => window.__nixRoom?.connected() === true);
  await page.evaluate((e) => window.__nixRoom!.send(e), event);
}

export const greeting = (page: Page) => page.evaluate(() => window.__nixRoom!.greeting());

/**
 * Makes the server's first playthrough (autoPlaythrough's, played by the default player, with the sol and standing
 * e2e/serve.ts seeds) active again. The specs that play it (jobs, intake, missions) meet it whichever NEW GAME ran
 * before them in the worker: a test lands on whatever server slot is free, so the one before it varies run to run.
 */
export async function firstPlaythrough(request: APIRequestContext): Promise<void> {
  const pts = ((await (await request.get('/api/playthroughs')).json()) as { playthroughs: PlaythroughInfo[] }).playthroughs;
  const first = pts.filter((p) => p.forkedFrom === null).sort((a, b) => a.createdAt - b.createdAt)[0];
  expect((await request.post(`/api/playthroughs/${first.id}/activate`)).status()).toBe(200);
}

/**
 * Opens Nix's room as Hicks with her in `room` (its HUD name `label`): specs before this one in the worker may have
 * walked her elsewhere, or moved the clock past her hours there. A dev move sends no quest state, so the room loads
 * again after one, and the board arrives.
 */
export async function nixAt(page: Page, room: string, label: string): Promise<void> {
  const open = async () => {
    await page.goto(`/room/${DIRECT.id}?as=hicks`);
    await page.waitForFunction(() => window.__nixRoom !== undefined);
    await awaitGreeting(page);
  };
  await open();
  const scene = page.locator('.hud-left .scene');
  await expect(scene).not.toHaveText('——');
  if ((await scene.textContent()) === label) return;
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: room, transition: 'fade' } });
  await expect(scene).toHaveText(label, { timeout: 10_000 });
  await open();
}

/** Lets her greeting, if this entry gets one, finish before the test acts. */
export async function awaitGreeting(page: Page): Promise<void> {
  await expect.poll(() => greeting(page), { timeout: 10_000 }).not.toBe('waiting');
  if ((await greeting(page)) !== 'sent') return;
  // The greet line itself is never shown, so her greeting becomes the last message.
  const last = page.locator('#feed .msg').last();
  await expect(last).toHaveClass(/\bgreet\b/, { timeout: 10_000 });
  await expect(last).toHaveClass(/\bs-ok\b/, { timeout: 10_000 });
}

/** One request the fake OpenRouter took, as its log serves it. */
export type OrRequest = { method: string; url: string; body: { stream?: boolean; messages?: { role: string; content: string | null }[] } };

/** Every request the fake OpenRouter took, oldest first. */
export async function orRequests(): Promise<OrRequest[]> {
  return (await (await fetch(`http://127.0.0.1:${STUB_OR_LOG_PORT}/`)).json()) as OrRequest[];
}

/** The chat turns (streamed completions) the fake OpenRouter took for `who`, oldest first: their messages. */
export async function chatsOf(who: { identityLine: string }): Promise<{ role: string; content: string }[][]> {
  return (await orRequests())
    .filter((r) => r.method === 'POST' && r.url.endsWith('/chat/completions') && r.body.stream !== false)
    .filter((r) => r.body.messages?.[0]?.role === 'system' && (r.body.messages[0].content ?? '').includes(who.identityLine))
    .map((r) => r.body.messages!.map((m) => ({ role: m.role, content: m.content ?? '' })));
}

/** Says `text` in the room and waits for her reply to finish. */
export async function say(page: Page, text: string): Promise<void> {
  const before = await page.locator('.msg.agent.s-ok').count();
  await send(page, { type: 'user_message', text });
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
}

/** A new game with Nix, who shares Alpha (the fake OpenRouter's share_contact). */
export async function nixSharesAlpha(page: Page): Promise<void> {
  await dialIn(page, DIRECT.id);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await say(page, 'where do I find Alpha?');
  await expect(page.locator('#feed .tool', { hasText: 'Nix shared a contact: ALPHA' })).toHaveCount(1);
}

/** A job's SETUP card (the hand spec §1): GO IN as it stands (QUIET, nobody brought). A story quest has none. */
export async function goIn(page: Page): Promise<void> {
  const go = page.locator('.ts-go');
  if (await go.waitFor({ timeout: 3_000 }).then(() => true, () => false)) await go.click();
}

/**
 * Settles one step of a dealt roll on the table (roll lifecycle spec §1.5): picks the first free cost, else TAKES IT on
 * the first picked one. True when it clicked something.
 */
export async function settleCostStep(page: Page): Promise<boolean> {
  const take = page.locator('.tb-costs .tb-cost-btn.take').first();
  if (await take.isVisible()) {
    await take.click();
    return true;
  }
  const free = page.locator('.tb-costs .tb-cost.pickable').first();
  if (await free.isVisible()) {
    await free.click();
    return true;
  }
  return false;
}

/**
 * The moment on the job table stands clear of its neighbours and of itself: every call card, its tabs, the waiting card, the
 * stamp and its line and the costs against the hand, the levers and the JOB column, then each other. `label` names the step.
 */
export async function expectTableClear(page: Page, label: string): Promise<void> {
  const hits = await page.evaluate(() => {
    const shown = (e: Element) => {
      const r = e.getBoundingClientRect();
      let n: Element | null = e;
      for (; n; n = n.parentElement) if (getComputedStyle(n).opacity === '0' || getComputedStyle(n).visibility === 'hidden') return false;
      return r.width > 0 && r.height > 0;
    };
    const boxes = (sel: string) => [...document.querySelectorAll(sel)].filter(shown).map((e) => ({ name: sel, r: e.getBoundingClientRect() }));
    const moment = ['.tb-deal > .tb-card', '.tb-deal > .tb-card .tb-src', '.tb-parked > .tb-card', '.tb-roll .qc-stamp', '.tb-roll .qc-says', '.tb-costs'].flatMap(boxes);
    const around = ['.tb-hand', '.tb-levers', '.jc'].flatMap(boxes);
    const meets = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const out: string[] = [];
    for (const m of moment) for (const n of around) if (meets(m.r, n.r)) out.push(`${m.name} on ${n.name}`);
    moment.forEach((m, i) => {
      for (const n of moment.slice(i + 1)) {
        // A tab belongs to its card, and the stamp's line sits under the stamp.
        if (m.name !== n.name && n.name.includes(m.name)) continue;
        if (meets(m.r, n.r) && !(m.name === '.tb-deal > .tb-card' && n.name === '.tb-deal > .tb-card .tb-src')) out.push(`${m.name} on ${n.name}`);
      }
    });
    return out;
  });
  expect(hits, label).toEqual([]);
}
