import { expect, test, type Page } from '@playwright/test';
import { awaitGreeting, DIRECT, dialIn, send, skipSplash, startQuest } from './fixtures';

// The crew rules' board (spec 2026-11-17, The board; mockup docs/mockups/crew-board.html): the real Run Sheet and Night
// Clerk (e2e/serve.ts copies them) on the whole stage, from GO IN to the debrief's close. Run Sheet is a new game as
// Soren with Rue; Night Clerk is Silas's playthrough of its own, with velvet rep and NIX_TEST_CREW's four recruits.
// Each test starts its own playthrough, and the one it found is put back afterwards.
let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
});
test.afterEach(async ({ request }) => {
  if (before) await expect.poll(async () => (await request.post(`/api/playthroughs/${before}/activate`)).status(), { timeout: 15_000 }).toBe(200);
});

/** Screenshots for a look by eye, when CREW_RULES_SHOTS names a folder (not part of the check). */
const shot = async (page: Page, name: string) => {
  if (process.env.CREW_RULES_SHOTS) await page.screenshot({ path: `${process.env.CREW_RULES_SHOTS}/${name}.png` });
};

const board = (page: Page) => page.locator('.tb-crew .bw');
const panel = (page: Page, card: string) => page.locator(`.bw-panel[data-card="${card}"]`);
const handCard = (page: Page, id: string) => page.locator(`.bw-hand [data-hand="${id}"]`);

/** The board can take a move: no send landing, nobody on the line. */
async function ready(page: Page): Promise<void> {
  await expect(page.locator('.tb-crew')).not.toHaveClass(/\b(busy|held)\b/, { timeout: 20_000 });
}

/** The board is up and the room's chrome is down: no chat box, no keys bar, no contact figure. */
async function chromeDown(page: Page): Promise<void> {
  await expect(page.locator('#game')).toHaveClass(/\bcrew-board\b/);
  for (const sel of ['#input', '#hud', '#stage-figures', '#feed']) await expect(page.locator(sel)).toBeHidden();
}

/** Nothing on the panels is lit or marked before ↑↓ aims, and every way row's class names only whose it is. */
async function nothingLit(page: Page): Promise<void> {
  await expect(page.locator('.bw-panels .at')).toHaveCount(0);
  // Nor by hover under the resting pointer (the last click lands where the next beat's panel draws): every panel's
  // border, glow and lift are the same.
  const looks = await page.locator('.bw-panels .bw-panel').evaluateAll((ns) => ns.map((n) => { const c = getComputedStyle(n); return `${c.borderTopColor} | ${c.boxShadow} | ${c.transform}`; }));
  expect(new Set(looks).size, `panels look alike: ${looks.join(' / ')}`).toBe(1);
  for (const cls of await page.locator('.bw-way').evaluateAll((ns) => ns.map((n) => n.className))) expect(cls).toMatch(/^bw-way bw-by-[a-z]+$/);
}

/** Sends the picked hand card's way on a card (the row, when the card has more than one of theirs). */
async function sendWay(page: Page, card: string, by: string): Promise<void> {
  await ready(page);
  // Picked already when it's the one card that can be sent (you, alone): a second click would put it down.
  const who = handCard(page, by.replace(/^you:.*/, 'you'));
  if (!(await who.evaluate((n) => n.classList.contains('sel')))) await who.click();
  const row = panel(page, card).locator(`.bw-way[data-by="${by}"]`);
  await expect(row).toBeVisible();
  await row.click();
}

/** Clicks a plain card (no ways). */
async function pickPlain(page: Page, card: string): Promise<void> {
  await ready(page);
  await panel(page, card).click();
}

/** The beat on the board, by its header. */
async function atBeat(page: Page, title: string): Promise<void> {
  await expect(page.locator('.bw-beatrow .bw-beat')).toHaveText(title, { timeout: 20_000 });
}

/** What's under 14px or overlaps among the board's own visible pieces (a look by eye misses a 13px label). */
async function layoutFaults(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const root = document.querySelector('.tb-crew');
    if (!root) return ['no board'];
    const shown = (e: Element) => {
      const r = e.getBoundingClientRect();
      for (let n: Element | null = e; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      }
      return r.width > 0 && r.height > 0;
    };
    for (const n of [...root.querySelectorAll('*'), ...document.querySelectorAll('.jc *')]) {
      if (!shown(n)) continue;
      const own = [...n.childNodes].some((c) => c.nodeType === 3 && (c.textContent ?? '').trim());
      if (!own) continue;
      const px = parseFloat(getComputedStyle(n).fontSize);
      if (px < 14) out.push(`${px}px: ${(n as HTMLElement).className || n.tagName} "${(n.textContent ?? '').trim().slice(0, 30)}"`);
    }
    const boxes = (sel: string) => [...root.querySelectorAll(sel)].filter(shown).map((e) => ({ sel, r: e.getBoundingClientRect() }));
    const parts = ['.bw-job', '.bw-sub', '.bw-route', '.bw-clk', '.bw-beatrow', '.bw-panel', '.bw-comms', '.bw-keys'].flatMap(boxes);
    const meets = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
    // The route's cells: none on another, none on the beat's head, none against the stage's top.
    const cells = boxes('.bw-rt-b, .rt-ladder > span');
    const head = boxes('.bw-beatrow')[0];
    const top = document.querySelector('#game')!.getBoundingClientRect().top;
    cells.forEach((c, i) => {
      for (const d of cells.slice(i + 1)) if (meets(c.r, d.r)) out.push('a route cell on another');
      if (head && meets(c.r, head.r)) out.push('a route cell on the beat head');
      if (c.r.top - top < 12) out.push('a route cell against the stage top');
    });
    parts.forEach((p, i) => {
      for (const q of parts.slice(i + 1)) if (p.sel !== q.sel && meets(p.r, q.r)) out.push(`${p.sel} on ${q.sel}`);
    });
    // Off the stage.
    const stage = document.querySelector('#game')!.getBoundingClientRect();
    for (const p of [...parts, ...boxes('.bw-card'), ...boxes('.bw-ab')]) if (p.r.right > stage.right + 1 || p.r.bottom > stage.bottom + 1 || p.r.left < stage.left - 1) out.push(`${p.sel} off the stage`);
    return out;
  });
}

/** The room's chrome as it stands: which of the pieces the board hides are showing. */
const CHROME = ['#hud', '#input', '#stage-figures', '#feed'];
const chromeNow = (page: Page) => Promise.all(CHROME.map((sel) => page.locator(sel).isVisible()));

/** A new game as Soren with Rue on Run Sheet's STORY opening, then START: GO IN on the board. Returns the chrome before. */
async function runSheetGoIn(page: Page): Promise<boolean[]> {
  await page.setViewportSize({ width: 1600, height: 900 });
  await skipSplash(page, { intro: true });
  await dialIn(page, 'rue', 'soren');
  await expect(page.locator('.ar-label span').first()).toHaveText('STORY');
  await page.waitForFunction(() => window.__nixRoom?.intro() === 'ready');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ar-root')).toHaveCount(0);
  await awaitGreeting(page);
  const chrome = await chromeNow(page);
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Run Sheet');
  await expect(board(page)).toHaveAttribute('data-mode', 'goin');
  return chrome;
}

/** GO IN with nobody and nothing, and the first beat (the hundred, a plain pick). */
async function goInRunSheet(page: Page): Promise<void> {
  await page.locator('.bw-go').click();
  await expect(board(page)).toHaveAttribute('data-mode', 'run', { timeout: 10_000 });
  await atBeat(page, 'THE HUNDRED');
}

test('Run Sheet on the board: GO IN, Esc backs out, the scheduler’s night to a MESSY debrief, the room back after', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const chrome = await runSheetGoIn(page);
  expect(chrome[0], 'the keys bar before the job').toBe(true);
  await chromeDown(page);
  await expect(page.locator('.bw-goin-head')).toContainText('GO IN');
  await page.waitForTimeout(600);
  await shot(page, 'run-sheet-01-go-in');
  expect.soft(await layoutFaults(page), 'GO IN').toEqual([]);

  // Esc backs out without starting: the room's chrome is back, and the pause menu didn't open.
  await page.keyboard.press('Escape');
  await expect(page.locator('#game')).not.toHaveClass(/\bcrew-board\b/);
  await expect(page.locator('.pause-menu')).toHaveCount(0);
  await expect(page.locator('#hud')).toBeVisible();
  // Not started: no run came up behind it, and START is offered again.
  await page.waitForTimeout(500);
  await expect(page.locator('.tb-crew')).toBeHidden();

  await page.locator('.hud-quest').click();
  await startQuest(page, 'Run Sheet');
  await expect(board(page)).toHaveAttribute('data-mode', 'goin');
  // GO IN by its key this time (the hidden prompt mustn't take it).
  await page.keyboard.press('Enter');
  await expect(board(page)).toHaveAttribute('data-mode', 'run', { timeout: 10_000 });
  await atBeat(page, 'THE HUNDRED');
  await chromeDown(page);
  // The room's hotkeys are refused while the board is up: no map, no QUEST, no chat mode.
  for (const key of ['Tab', 'Alt+m', 'Alt+q']) await page.keyboard.press(key);
  await page.waitForTimeout(300);
  await expect(page.locator('.ql-pane:visible')).toHaveCount(0);
  await expect(page.locator('#map')).toBeHidden();
  await expect(board(page)).toHaveAttribute('data-mode', 'run');
  // The clocks: TAKE, ALARM and the job's own, WHAT RUE HEARS; Rue on the comms strip.
  await expect(page.locator('.bw-clk[data-clock="hears"] .bw-clk-label')).toHaveText('WHAT RUE HEARS');
  await expect(page.locator('.bw-comms')).toBeVisible();
  await expect(page.locator('.bw-cwho')).toHaveText(/^RUE · (ON COMMS|WITH YOU)$/);
  await page.waitForTimeout(600);
  await shot(page, 'run-sheet-02-first-beat');
  expect.soft(await layoutFaults(page), 'the first beat').toEqual([]);
  await pickPlain(page, 'take');

  // The yard is in the Long Haul's: the board steps back while the room changes, the new room holds clear with its name
  // on a band, and the board comes back by itself (board.ts sceneMoment).
  const sceneBand = page.locator('.bw-scene-band');
  await expect(sceneBand).toBeVisible({ timeout: 15_000 });
  await expect(sceneBand).toHaveText(/^THE LONG HAUL( · .+)?$/);
  for (const sel of ['.bw-panels', '.bw-hand', '.bw-comms', '.jc', '.bw-beatrow']) await expect(page.locator(sel), `${sel} hidden in the moment`).toBeHidden();
  await page.waitForTimeout(500);
  await shot(page, 'run-sheet-12-scene');
  expect(await sceneBand.evaluate((n) => parseFloat(getComputedStyle(n.firstElementChild!).fontSize)), 'the name at 14px or more').toBeGreaterThanOrEqual(14);
  await expect(sceneBand).toBeHidden({ timeout: 5_000 });
  await expect(page.locator('.bw-panels')).toBeVisible();
  await expect(page.locator('#game')).not.toHaveClass(/\bbw-scene/);

  // The yard: your card picked shows your two ways there, nothing lit until ↑↓.
  await atBeat(page, 'THE YARD');
  await ready(page);
  // The new beat types in on the page; Enter with nothing aimed shows the rest, and aims nothing.
  await page.keyboard.press('Enter');
  await expect(page.locator('.jc-body .unshown, .bw-say .unshown')).toHaveCount(0);
  await expect(page.locator('.bw-panels .at')).toHaveCount(0);
  await expect(board(page)).toHaveAttribute('data-mode', 'run');
  // Soren is the one card that can be sent: he's picked for you, his ways already on the panels.
  await expect(handCard(page, 'you')).toHaveClass(/\bsel\b/);
  await expect(panel(page, 'badge').locator('.bw-way')).toHaveCount(2);
  await nothingLit(page);
  await page.waitForTimeout(400);
  await shot(page, 'run-sheet-03-card-picked');
  expect.soft(await layoutFaults(page), 'a card picked').toEqual([]);
  // The page's TEXT key (the story table's): it opens the box settings beside the page, the board stepped back behind
  // it; the panel takes ↑↓ (the board's keys don't fire), Esc closes it without the pause menu, and nothing is lit after.
  const bsKey = page.locator('.bs-key');
  await expect(bsKey).toBeVisible();
  const [kb, jb] = await Promise.all([bsKey.boundingBox(), page.locator('.jc').boundingBox()]);
  expect(kb!.x + kb!.width, 'the key ends at the page’s right edge').toBeCloseTo(jb!.x + jb!.width, -1);
  expect(kb!.y + kb!.height, 'the key over the page').toBeLessThanOrEqual(jb!.y + 1);
  await bsKey.click();
  await expect(page.locator('.bs-panel')).toBeVisible();
  await expect(page.locator('.bw-panels')).toBeHidden();
  await page.waitForTimeout(300);
  await shot(page, 'run-sheet-09-text-panel');
  // Only what applies on the board: the TEXT rows (the LINE section is the hidden chat box's).
  await expect(page.locator('.bs-panel .bs-row:visible')).toHaveCount(5);
  await expect(page.locator('.bs-panel .bs-sec:visible')).toHaveText(['TEXT']);
  // TEXT SIZE and FONT reach the page and her comms line together.
  const looks = () => Promise.all(['.jc-body', '.bw-say'].map((s) => page.locator(s).evaluate((n) => { const c = getComputedStyle(n); return { size: parseFloat(c.fontSize), font: c.fontFamily }; })));
  const before = await looks();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.bw-panels .at')).toHaveCount(0);
  await expect(handCard(page, 'you')).toHaveClass(/\bsel\b/);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  const after = await looks();
  for (const i of [0, 1]) {
    expect(after[i].size, `${i ? 'her line' : 'the page'} grows with TEXT SIZE`).toBeGreaterThan(before[i].size);
    expect(after[i].font, `${i ? 'her line' : 'the page'} takes the FONT`).not.toBe(before[i].font);
  }
  expect(after[1].font, 'her line and the page in one font').toBe(after[0].font);
  // Back as they were, so the later shots read at the default.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowLeft');
  expect(await looks()).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('.bs-panel')).toBeHidden();
  await expect(page.locator('.pause-menu')).toHaveCount(0);
  await expect(board(page)).toHaveAttribute('data-mode', 'run');
  await expect(page.locator('.bw-panels')).toBeVisible();
  await nothingLit(page);
  // Her model under her portrait: the one her next reply uses, by its short name.
  const label = page.locator('.bw-model');
  await expect(label).toHaveText('GLM 5.2');
  // The model selection from settings, as a player opens it (Esc, SETTINGS, MODEL): it shows over the board, which
  // steps back behind it and takes none of its keys; the room's chrome stays down.
  await page.keyboard.press('Escape');
  await page.locator('.pause-row[data-row="settings"]').click();
  await page.locator('.sys-row[data-row="model"]').click();
  await expect(page.locator('.pause-menu')).toHaveCount(0);
  const menu = page.locator('.model-menu');
  await expect(menu).toBeVisible();
  await expect(page.locator('.bw-panels')).toBeHidden();
  for (const sel of ['#input', '#hud', '#stage-figures']) await expect(page.locator(sel)).toBeHidden();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('m');
  await expect(handCard(page, 'you')).toHaveClass(/\bsel\b/);
  await expect(board(page)).toHaveAttribute('data-mode', 'run');
  // OTHER… takes typing (the board's keys don't swallow the letters); Esc there closes the selection.
  await menu.locator('.mm-other').click();
  await page.keyboard.type('gem');
  await expect(menu.locator('.mm-input')).toHaveValue('gem');
  await page.waitForTimeout(300);
  await shot(page, 'run-sheet-10-model');
  await menu.locator('.mm-row', { hasText: 'Gemini 3.8 Flash' }).first().click();
  await expect(menu).toBeHidden();
  await expect(label).toHaveText('GEMINI 3.8 FLASH');
  await expect(page.locator('.bw-panels')).toBeVisible();
  await expect(board(page)).toHaveAttribute('data-mode', 'run');
  await nothingLit(page);
  // Opened again, Esc goes back to the board, not the pause menu.
  await page.keyboard.press('Escape');
  await page.locator('.pause-row[data-row="settings"]').click();
  await page.locator('.sys-row[data-row="model"]').click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.locator('.pause-menu')).toHaveCount(0);
  await expect(board(page)).toHaveAttribute('data-mode', 'run');
  await chromeDown(page);
  await nothingLit(page);
  await page.waitForTimeout(300);
  await shot(page, 'run-sheet-11-model-label');
  expect.soft(await layoutFaults(page), 'the model label').toEqual([]);
  // ↓ aims at the first way (the scheduler's); only then is one lit, and Enter sends it.
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.bw-panels .bw-way.at')).toHaveCount(1);
  await expect(page.locator('.bw-panels .bw-way.at')).toHaveAttribute('data-by', 'you:scheduler');
  await page.keyboard.press('Enter');
  await expect(panel(page, 'badge').locator('.bw-stamp')).toBeVisible({ timeout: 10_000 });
  await shot(page, 'run-sheet-04-sent');

  // The hut: Rue's strip offers her way at the terminal.
  await atBeat(page, 'THE HUT');
  await ready(page);
  await expect(page.locator('.bw-offer[data-card="terminal"]')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, 'run-sheet-05-her-offer');
  expect.soft(await layoutFaults(page), 'her offer').toEqual([]);
  await sendWay(page, 'terminal', 'you:scheduler');

  await atBeat(page, 'THE GATE');
  await sendWay(page, 'talk', 'you:scheduler');

  // Her crate: plain picks, then the end.
  await atBeat(page, 'HER CRATE');
  await pickPlain(page, 'tell');
  await expect(board(page)).toHaveAttribute('data-mode', 'end', { timeout: 20_000 });
  await expect(page.locator('.bw-grade')).toHaveText('MESSY');
  await chromeDown(page);
  await page.waitForTimeout(2500);
  await shot(page, 'run-sheet-07-debrief');
  expect.soft(await layoutFaults(page), 'the debrief').toEqual([]);

  // CLOSE: the room's chrome is back.
  await page.locator('.bw-close').click();
  await expect(page.locator('#game')).not.toHaveClass(/\bcrew-board\b/);
  await expect(page.locator('.tb-crew')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
  await expect.poll(() => chromeNow(page), { message: 'the room as it was before the job' }).toEqual(chrome);
  await shot(page, 'run-sheet-08-closed');
  expect(errors).toEqual([]);
});

test('Run Sheet: Rue takes the lacquer off from her comms strip', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await runSheetGoIn(page);
  await goInRunSheet(page);
  await pickPlain(page, 'take');
  await atBeat(page, 'THE YARD');
  await sendWay(page, 'round', 'you');
  await atBeat(page, 'THE HUT');
  await ready(page);
  const offer = page.locator('.bw-offer[data-card="terminal"]');
  await expect(offer).toContainText('RUE DOES THE TERMINAL');
  await offer.click();
  await expect(panel(page, 'terminal').locator('.bw-stamp')).toBeVisible({ timeout: 10_000 });
  await atBeat(page, 'THE GATE');
  // Her one go is spent: no offer on the next beat.
  await expect(page.locator('.bw-offer')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Run Sheet: loud twice is the getaway, the horn', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await runSheetGoIn(page);
  await goInRunSheet(page);
  await pickPlain(page, 'take');
  await atBeat(page, 'THE YARD');
  await sendWay(page, 'badge', 'you:scheduler');
  await atBeat(page, 'THE HUT');
  await sendWay(page, 'press', 'you');
  await atBeat(page, 'THE GATE');
  await sendWay(page, 'yard', 'you');
  await atBeat(page, 'GET OUT · THE HORN');
  await ready(page);
  await page.waitForTimeout(400);
  await shot(page, 'run-sheet-06-getaway');
  expect.soft(await layoutFaults(page), 'the getaway').toEqual([]);
  expect(errors).toEqual([]);
});

/** Silas's playthrough of his own with Nix, moved under the Cat, QUEST open on Night Clerk's GO IN. */
async function nightClerkGoIn(page: Page): Promise<void> {
  expect((await page.request.post('/api/playthroughs', { data: { player: 'silas', startContact: DIRECT.id } })).status()).toBe(200);
  await page.setViewportSize({ width: 1600, height: 900 });
  await skipSplash(page);
  const open = async () => {
    await page.goto(`/room/${DIRECT.id}?as=silas`);
    await page.waitForFunction(() => window.__nixRoom !== undefined);
    await awaitGreeting(page);
  };
  await open();
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'under-the-cat', transition: 'fade' } });
  await expect(page.locator('.hud-left .scene')).toHaveText('UNDER THE CAT', { timeout: 10_000 });
  await open();
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Night Clerk');
  await expect(board(page)).toHaveAttribute('data-mode', 'goin');
}

test('Night Clerk on the board: three of four brought, a recruit sent, a move, a throw, the way out, the debrief', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await nightClerkGoIn(page);
  await chromeDown(page);
  const bring = page.locator('.bw-bring [data-bring]');
  await expect(bring).toHaveCount(4);
  for (const id of ['e2e-face', 'e2e-muscle', 'e2e-ears']) await page.locator(`[data-bring="${id}"]`).click();
  await page.locator('[data-bring="e2e-runner"]').click();
  await expect(page.locator('.bw-note')).toHaveText('AT MOST 3 PEOPLE');
  await expect(page.locator('.bw-bring .bw-card.sel')).toHaveCount(3);
  await expect(page.locator('[data-bring="e2e-runner"]')).not.toHaveClass(/\bsel\b/);
  // The deck's two slots, both loaded: the programs come into the hand, smaller, after the people.
  for (const id of ['solvent', 'firewall']) await page.locator(`[data-load="${id}"]`).click();
  await expect(page.locator('.bw-dslot [data-unload]')).toHaveCount(2);
  await page.waitForTimeout(400);
  await shot(page, 'night-clerk-01-go-in');
  expect.soft(await layoutFaults(page), 'GO IN').toEqual([]);
  await page.locator('.bw-go').click();
  await expect(board(page)).toHaveAttribute('data-mode', 'run', { timeout: 10_000 });

  // The lobby: no contact, so no comms strip.
  await atBeat(page, 'THE LOBBY');
  await expect(page.locator('.bw-comms')).toBeHidden();
  await expect(page.locator('.bw-hand .bw-prog')).toHaveCount(2);
  await chromeDown(page);
  await page.waitForTimeout(400);
  await shot(page, 'night-clerk-02-beat');
  expect.soft(await layoutFaults(page), 'the lobby').toEqual([]);
  await ready(page);
  await handCard(page, 'e2e-face').click();
  await nothingLit(page);
  await expect(panel(page, 'charm').locator('.bw-way')).toHaveCount(1);
  await shot(page, 'night-clerk-03-recruit-picked');
  await panel(page, 'charm').click();
  await expect(panel(page, 'charm').locator('.bw-stamp')).toBeVisible({ timeout: 10_000 });

  // The desk: Mika's LISTEN IN rises, then sits in the beat's header.
  await atBeat(page, 'THE DESK');
  await ready(page);
  const move = page.locator('.bw-ab[data-move="e2e-ears"]');
  await expect(move).toBeVisible();
  // Its name and the top of its art show above Mika's card: that's what a player clicks.
  await move.locator('.bw-top').click();
  await expect(page.locator('.bw-rise.in, .bw-rise.still')).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, 'night-clerk-04-move-risen');
  await expect(page.locator('.bw-beatrow .bw-mod')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('.bw-beatrow .bw-mod img')).toHaveCount(1);
  await expect(page.locator('.bw-rise.in, .bw-rise.still')).toHaveCount(0, { timeout: 5_000 });
  await shot(page, 'night-clerk-05-move-thumb');

  // A throw: Pell has no way at the desk. The panel says the terms before the send.
  await ready(page);
  await handCard(page, 'e2e-muscle').click();
  await expect(panel(page, 'read').locator('.bw-throw')).toContainText('NOT THEIR TRADE.');
  await expect(panel(page, 'read').locator('.bw-throw')).toContainText('A throw: 4 or more');
  await nothingLit(page);
  await shot(page, 'night-clerk-06-throw-terms');
  expect.soft(await layoutFaults(page), 'the throw terms').toEqual([]);
  await panel(page, 'read').click();
  await expect(panel(page, 'read').locator('.bw-stamp')).toHaveText(/^(CLEAN|AT A PRICE|HURT)$/, { timeout: 10_000 });

  // The floor and the closet by your own ways that raise no ALARM, so the way out comes whatever the throw did.
  await atBeat(page, 'THE FLOOR');
  await sendWay(page, 'cart', 'you');
  await atBeat(page, 'THE CLOSET');
  await sendWay(page, 'pull', 'you');
  await atBeat(page, 'THE WAY OUT');
  await ready(page);
  // The pointer rests where the closet's panel was clicked: nothing lights under it.
  await nothingLit(page);
  await page.waitForTimeout(400);
  await shot(page, 'night-clerk-07-way-out');
  expect.soft(await layoutFaults(page), 'the way out').toEqual([]);
  await sendWay(page, 'walk', 'you');
  // PRESS ON? on the board too (the job has a push beat), not the table: WALK takes the pay.
  await atBeat(page, 'PRESS ON?');
  await chromeDown(page);
  await expect(page.locator('.tb.hud:not(.tb-crew)')).toBeHidden();
  await expect(panel(page, '!press')).toBeVisible();
  await ready(page);
  await nothingLit(page);
  await expect(page.locator('.bw-hand .sel')).toHaveCount(0);
  await page.waitForTimeout(400);
  await shot(page, 'night-clerk-08-press-on');
  expect.soft(await layoutFaults(page), 'PRESS ON?').toEqual([]);
  await pickPlain(page, '!walk');
  await expect(board(page)).toHaveAttribute('data-mode', 'end', { timeout: 20_000 });
  await expect(page.locator('.bw-grade')).toHaveText(/^(CLEAN|MESSY|BLOWN)$/);
  await expect(page.locator('.bw-end .bw-card')).toHaveCount(3);
  await page.waitForTimeout(2500);
  await shot(page, 'night-clerk-09-debrief');
  expect.soft(await layoutFaults(page), 'the debrief').toEqual([]);
  await page.keyboard.press('Enter');
  await expect(page.locator('#game')).not.toHaveClass(/\bcrew-board\b/);
  await expect(page.locator('#hud')).toBeVisible();
  expect(errors).toEqual([]);
});

