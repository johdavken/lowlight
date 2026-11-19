import { expect, test, type Page } from '@playwright/test';
import { awaitGreeting, dialIn, skipSplash, startQuest } from './fixtures';

// Kroll's desk (spec 2026-11-18): the real Come Up (e2e/serve.ts copies it) on the crew rules' board, from the title to
// the debrief. A new game as Soren with Kroll opens on her floor, where her standing order lists; he goes in alone, and
// the job's two clocks and her trust line are on the board. Her replies are the stub model's. The playthrough the test
// found is put back afterwards.
let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
});
test.afterEach(async ({ request }) => {
  if (before) await expect.poll(async () => (await request.post(`/api/playthroughs/${before}/activate`)).status(), { timeout: 15_000 }).toBe(200);
});

/** Screenshots for a look by eye, when KROLLS_DESK_SHOTS names a folder (not part of the check). */
const shot = async (page: Page, name: string) => {
  if (process.env.KROLLS_DESK_SHOTS) await page.screenshot({ path: `${process.env.KROLLS_DESK_SHOTS}/${name}.png` });
};

const board = (page: Page) => page.locator('.tb-crew .bw');
const panel = (page: Page, card: string) => page.locator(`.bw-panel[data-card="${card}"]`);
const handCard = (page: Page, id: string) => page.locator(`.bw-hand [data-hand="${id}"]`);

/** The board can take a move: no send landing, nobody on the line. */
async function ready(page: Page): Promise<void> {
  await expect(page.locator('.tb-crew')).not.toHaveClass(/\b(busy|held)\b/, { timeout: 20_000 });
}

/** The beat on the board, by its header. */
async function atBeat(page: Page, title: string): Promise<void> {
  await expect(page.locator('.bw-beatrow .bw-beat')).toHaveText(title, { timeout: 20_000 });
}

/** Sends one of your ways on a card (`you`, or `you:<name>` when you have two there). */
async function sendWay(page: Page, card: string, by: string): Promise<void> {
  await ready(page);
  // Picked already when it's the one card that can be sent (you, alone): a second click would put it down.
  const you = handCard(page, 'you');
  if (!(await you.evaluate((n) => n.classList.contains('sel')))) await you.click();
  const row = panel(page, card).locator(`.bw-way[data-by="${by}"]`);
  await expect(row).toBeVisible();
  await row.click();
  await expect(panel(page, card).locator('.bw-stamp')).toBeVisible({ timeout: 10_000 });
}

test("Come Up on the board: Soren at Kroll's floor, alone, both clocks, to a CLEAN debrief with the judge line and REP", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1600, height: 900 });
  await skipSplash(page, { intro: true });
  await dialIn(page, 'adebayo', 'soren');
  // A new game with her opens at her floor (Thursday evening: her working hours).
  await expect(page.locator('.ar-rule')).toHaveText('OPENING AT');
  await expect(page.locator('.ar-name')).toHaveText('THE SIXTY-FIRST FLOOR');
  // Come Up's STORY is the default opening, as Run Sheet's is with Rue: her text, the lift, a file on her desk.
  await expect(page.locator('.ar-label span').first()).toHaveText('STORY');
  await expect(page.locator('.ar-story-text')).toContainText('Her text came at five');
  await page.waitForFunction(() => window.__nixRoom?.intro() === 'ready');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ar-root')).toHaveCount(0);
  await awaitGreeting(page);
  await expect(page.locator('.scene-entry .sb-text')).toContainText('Her text came at five');

  // Her standing order is on QUEST here; START opens GO IN on the board.
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Come Up');
  await expect(board(page)).toHaveAttribute('data-mode', 'goin');
  await shot(page, 'come-up-01-go-in');
  await page.locator('.bw-go').click();
  await expect(board(page)).toHaveAttribute('data-mode', 'run', { timeout: 10_000 });

  // Her desk: the job's two clocks beside TAKE and ALARM, Kroll on the comms strip.
  await atBeat(page, 'HER DESK');
  await expect(page.locator('.bw-clk[data-clock="sees"] .bw-clk-label')).toHaveText('WHAT KROLL SEES');
  await expect(page.locator('.bw-clk[data-clock="nerve"] .bw-clk-label')).toHaveText('HIS NERVE');
  await expect(page.locator('.bw-comms')).toBeVisible();
  // Four clocks and a five-stop route share the top: the route ends before the clocks start (playtest: they overlapped).
  const routeRight = await page.locator('.bw-route').evaluate((n) => n.getBoundingClientRect().right);
  const clocksLeft = await page.locator('.bw-clocks').evaluate((n) => n.getBoundingClientRect().left);
  expect(routeRight).toBeLessThanOrEqual(clocksLeft);
  // A card's name keeps to one line, a long one stepped down to fit (playtest: WHERE YOU HEARD IT ran into its line).
  for (const h of await page.locator('.bw-panel h2').all()) expect(await h.evaluate((n) => n.scrollWidth <= n.clientWidth && n.getBoundingClientRect().height < 60)).toBe(true);
  // Rest on a clock and it says what it is.
  await page.locator('.bw-clk[data-clock="nerve"]').hover();
  await expect(page.locator('.bw-clk[data-clock="nerve"] .bw-clk-tip')).toBeVisible();
  await expect(page.locator('.bw-clk[data-clock="nerve"] .bw-clk-tip .hv-gist')).toHaveText('AT 3 HE RUNS');
  // Narration images (spec 2026-11-18): Mirek's face heads the file paragraph, whole (the first text up stands whole),
  // its typing character hidden at a full-size font (the layout floor).
  const mirek = page.locator('.jc-body .jc-img[data-img="mirek"]');
  await expect(mirek).toHaveCount(1);
  // Under a loaded run the typing may not have reached his paragraph yet (his face waits for it): finish the page,
  // again if a redraw starts it typing once more.
  await expect(async () => {
    await page.locator('.jc-body').click();
    await expect(mirek.locator('img')).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 20_000 });
  expect(await mirek.evaluate((n) => [Math.round(n.getBoundingClientRect().width), parseFloat(getComputedStyle(n.querySelector('.jc-img-ch')!).fontSize) >= 14])).toEqual([expect.any(Number), true]);
  expect(await mirek.evaluate((n) => (n.querySelector('img') as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await shot(page, 'come-up-02-desk');
  await page.mouse.move(800, 860);
  await sendWay(page, 'letter', 'you');

  // The deck market (a room of its own: the board steps back for its name, then returns).
  await atBeat(page, 'THE DECK MARKET');
  // BY THE BOOK's letter is a scene picture: a band across the column over its paragraph.
  await expect(page.locator('.jc-body .jc-img.jc-img-scene[data-img="letter"]')).toHaveCount(1);
  // The coat man arrives with the market, mid-run: his face decodes in and stays; nobody's face shows twice.
  const coat = page.locator('.jc-body .jc-img[data-img="coat"]');
  await expect(coat).toHaveCount(1, { timeout: 10_000 });
  await shot(page, 'come-up-02a-coat-decoding');
  // The typing reaches it after the market's long paragraph (slow under a loaded run): a click finishes the page, which
  // shows the face whole, its noise gone; the paragraph wraps to its right.
  // Her reply redraws the held-back market text, which can start it typing again after a click: finish until it holds.
  await expect(async () => {
    await page.locator('.jc-body').click();
    await expect(coat.locator('img')).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 20_000 });
  await expect(coat.locator('canvas')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.jc-body .jc-img[data-img="mirek"]')).toHaveCount(0);
  await shot(page, 'come-up-02a-coat');
  await sendWay(page, 'stall', 'you:scheduler');
  await atBeat(page, 'THE HOUSING OFFICE');
  // Her offer (THE TERMINAL) stacks beside her portrait, clear of the model under it and the keys line (playtest: it
  // ran over both).
  await ready(page);
  await expect(page.locator('.bw-offer')).toHaveCount(1);
  const box = (sel: string) => page.locator(sel).first().evaluate((n) => { const r = n.getBoundingClientRect(); return { bottom: r.bottom, left: r.left, top: r.top, right: r.right }; });
  const offer = await box('.bw-offer');
  expect(offer.bottom).toBeLessThanOrEqual((await box('.bw-keys')).top);
  expect(offer.left).toBeGreaterThanOrEqual((await box('.bw-pic')).right);
  // Her line is the offer's tip, so her words keep the column above it.
  await page.locator('.bw-offer').hover();
  await expect(page.locator('.bw-offer-tip')).toBeVisible();
  await expect(page.locator('.bw-offer-tip .hv-gist')).toHaveText('Ask her to open the roll from the sixty-first floor.');
  await shot(page, 'come-up-02b-office');
  await page.mouse.move(800, 860);
  await sendWay(page, 'keys', 'you');
  await atBeat(page, 'THE CATWALK');
  await sendWay(page, 'ask', 'you');
  // Back at her desk with his nerve full: he has run, and she hears it.
  await atBeat(page, 'HER DESK');
  await expect(page.locator('.bw-clk[data-clock="nerve"]')).toBeVisible();
  await shot(page, 'come-up-03-ledger');
  await ready(page);
  await panel(page, 'report').locator('.bw-way[data-by="you"]').click();

  // The debrief: CLEAN with nothing on the glass. The judging clock says so on its own line (her trust starts at 1 in
  // the game, so the +1 keeps her word and no word line shows), and the rep it paid still shows.
  await expect(board(page)).toHaveAttribute('data-mode', 'end', { timeout: 20_000 });
  await expect(page.locator('.bw-grade')).toHaveText('CLEAN');
  await expect(page.locator('.bw-end .bw-judge')).toHaveText('WHAT KROLL SEES 0/3 · NOTHING ON THE GLASS · TRUST ▲');
  await expect(page.locator('.bw-end .bw-rep', { hasText: /^REP SPINE / })).toHaveText(/^REP SPINE \d+ → \d+$/);
  await page.waitForTimeout(2500);
  await shot(page, 'come-up-04-debrief');
  await page.locator('.bw-close').click();
  await expect(page.locator('#game')).not.toHaveClass(/\bcrew-board\b/);
  await expect(page.locator('#hud')).toBeVisible();
  expect(errors).toEqual([]);
});
