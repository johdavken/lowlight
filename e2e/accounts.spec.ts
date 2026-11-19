import { expect, test } from '@playwright/test';
import { awaitGreeting, DIRECT, goIn, skipSplash, startQuest, pickCard } from './fixtures';

// The accounts board (Two Stories spec 2026-11-10): earn a card, get pressed, fill both accounts, TELL, land on told.
// A Rue playthrough of its own: the fixture job is for: rue, so no other spec meets it.
let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  expect((await request.post('/api/playthroughs', { data: { player: 'rue', startContact: DIRECT.id } })).status()).toBe(200);
});
test.afterEach(async ({ request }) => {
  if (before) await expect.poll(async () => (await request.post(`/api/playthroughs/${before}/activate`)).status(), { timeout: 15_000 }).toBe(200);
});

test('the accounts board: earn a card, get pressed, fill both, TELL, land on told', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=rue`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Story Test');
  await goIn(page);
  await pickCard(page.locator('.tb-card[data-choice="go"]'));

  // The board: two listeners side by side, the eye between them, the camera held face down.
  const board = page.locator('.tb-accounts');
  await expect(board).toBeVisible({ timeout: 15_000 });
  const nix = board.locator(`.ac-col[data-l="${DIRECT.id}"]`);
  const hicks = board.locator('.ac-col[data-l="hicks"]');
  await expect(nix.locator('.ac-name')).toHaveText('NIX');
  await expect(nix.locator('.ac-held')).toHaveText(['THE CAMERA']);
  await expect(board.locator('.ac-eye')).toContainText('RECORDING');
  await expect(board.locator('.ac-tell')).toBeDisabled();

  const place = async (card: string, col: typeof nix, key: string) => {
    await board.locator(`.ac-fs[data-id="${card}"]`).click();
    await col.locator(`.ac-blank[data-k="${key}"]`).click();
  };

  // A cover that clashes with the camera: pressed, the camera turns face up, and she says why.
  await place('DESK', nix, 'WHERE');
  await expect(nix.locator('.ac-held.up')).toContainText('You, on the roof at two.');
  await expect(nix.locator('.ac-said')).toContainText('The camera had you on the roof at two.');
  await expect(nix.locator('.ac-pat i.on')).toHaveCount(1);
  await expect(board.locator('.ac-card[data-id="DESK"]')).toHaveClass(/pressed/);

  // The rest, true; Hicks's account goes up the glass.
  await place('ROOF', nix, 'WHERE');
  await place('CREW', nix, 'HELP');
  await place('BOX', nix, 'TAKE');
  await place('NAME', hicks, 'WHO');
  await place('PAY', hicks, 'WHY');
  await place('TWO', hicks, 'WHEN');
  // What Hicks heard goes up the glass to Nix: one cyan chip in her THEY'VE GOT naming all three, the trace's stubs lit.
  await expect(nix.locator('.ac-held.glass')).toHaveCount(1);
  await expect(nix.locator('.ac-held.glass')).toContainText(/MY NAME.*THE PAY.*AT TWO/);
  await expect(board.locator('.ac-tell')).toBeEnabled();
  // In HUD lines (mockup accounts-hud.html A, playtest pick 2026-11-12): TELL under the columns, the hand flat along the
  // bottom from the JOB column's edge, the clocks stepped out, the glass a trace from Hicks's answers into Nix's column.
  await expect.poll(() => board.locator('.ac-trace path.lit').count()).toBeGreaterThanOrEqual(5);
  const lay = await page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
    const cols = [...document.querySelectorAll('.ac-col')].map((c) => c.getBoundingClientRect());
    const cards = [...document.querySelectorAll('.ac-card')].map((c) => getComputedStyle(c).transform);
    return { tellTop: r('.ac-tell').top, colsBottom: Math.max(...cols.map((c) => c.bottom)), handTop: r('.ac-hand').top, tellBottom: r('.ac-tell').bottom, handLeft: r('.ac-hand').left, jcLeft: r('.jc').left, rightHidden: getComputedStyle(document.querySelector('.tb.hud .tb-right')!).visibility, turned: cards.filter((t) => t !== 'none' && !t.startsWith('matrix(1, 0, 0, 1,')).length };
  });
  await page.screenshot({ path: 'test-results/accounts-board.png' });
  expect(lay.tellTop).toBeGreaterThanOrEqual(lay.colsBottom - 1);
  expect(lay.tellBottom).toBeLessThanOrEqual(lay.handTop + 1);
  expect(Math.abs(lay.handLeft - lay.jcLeft)).toBeLessThan(2);
  expect(lay.rightHidden).toBe('hidden');
  expect(lay.turned).toBe(0);

  await board.locator('.ac-tell').click();
  await expect(page.locator('#feed')).toContainText('STORY-TOLD', { timeout: 15_000 });
  await expect(board).toBeHidden();
  expect(errors).toEqual([]);
});
