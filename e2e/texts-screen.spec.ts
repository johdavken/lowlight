import { expect, test, type Page } from '@playwright/test';
import { DIRECT, SECOND, nixSharesAlpha, skipIntro, skipSplash } from './fixtures';

// TEXTS (in-game texts spec 2026-10-29), PEOPLE's middle tab since 2026-11-15: the deck in the room, on the trace panel.
// A new game with Nix, who shares Alpha; then you go to Alpha, so Nix is someone you can text.
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await skipIntro(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await skipSplash(page);
});

async function atAlpha(page: Page): Promise<void> {
  await nixSharesAlpha(page);
  await page.locator('.hud-people').click();
  const panel = page.locator('.people-screen');
  await panel.locator('.pe-tile', { has: page.locator('.pe-tile-name', { hasText: 'ALPHA' }) }).click();
  await panel.locator('.pe-file .pe-go').click();
  await page.waitForURL(`**/room/${SECOND.id}*`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
}

const pane = (page: Page) => page.locator('.people-screen .pe-right');
/** PEOPLE's list picks the thread. */
const pick = (page: Page, name: string) => page.locator('.people-screen .pe-tile', { has: page.locator('.pe-tile-name', { hasText: name.toUpperCase() }) }).click();

test('Alt+X opens PEOPLE on TEXTS; a text to Nix from Alpha\'s room gets her lines', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await atAlpha(page);
  await page.keyboard.press('Alt+x');
  await expect(page.locator('.people-screen .pe-tab.on')).toHaveText(/TEXTS/);
  await expect(page.locator('.hud-people')).toHaveClass(/\bopen\b/);
  await expect(page.locator('.hud-tx')).toHaveCount(0);
  await pick(page, DIRECT.name);
  await expect(pane(page).locator('.pe-name')).toHaveText(DIRECT.name.toUpperCase());
  await pane(page).locator('.dk-box').fill('you on shift?');
  await pane(page).locator('.dk-box').press('Enter');
  await expect(pane(page).locator('.dk-me')).toHaveText('you on shift?');
  await expect(pane(page).locator('.dk-her')).toHaveText(['till four', 'slow night', 'roof. 4:15']);
  // The deck's own list and header are out of sight: PEOPLE's list and head do their work.
  await expect(pane(page).locator('.dk-lcol')).toBeHidden();
  await expect(pane(page).locator('.dk-head')).toBeHidden();
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'test-results/people-texts.png' });
  // A text's controls and PASS TIME open over the thread, inside the stage; Esc closes each before the panel.
  const inStage = async (sel: string) => {
    const b = (await pane(page).locator(sel).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(1600);
    expect(b.y + b.height).toBeLessThanOrEqual(900);
  };
  await pane(page).locator('.dk-her').first().click();
  await expect(pane(page).locator('.dk-menu')).toBeVisible();
  await inStage('.dk-menu');
  await page.screenshot({ path: 'test-results/people-texts-menu.png' });
  await page.keyboard.press('Escape');
  await expect(pane(page).locator('.dk-menu')).toHaveCount(0);
  await pane(page).locator('.dk-holo > .dk-bar .dk-clock').click();
  await expect(pane(page).locator('.dk-sheet')).toBeVisible();
  await inStage('.dk-sheet');
  await page.screenshot({ path: 'test-results/people-texts-pass.png' });
  await page.keyboard.press('Escape');
  await expect(pane(page).locator('.dk-sheet')).toHaveCount(0);
  await expect(page.locator('.people-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test("the one you're with is read-only", async ({ page }) => {
  await atAlpha(page);
  await page.keyboard.press('Alt+x');
  await pick(page, SECOND.name);
  await expect(pane(page).locator('.dk-ro-why')).toHaveText("SHE'S RIGHT HERE");
  await expect(pane(page).locator('.dk-box')).toHaveCount(0);
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'test-results/people-texts-here.png' });
});

test('the pick holds across the tabs; ← → turn them only while the box is empty; ↑ ↓ walk the list from the box', async ({ page }) => {
  await atAlpha(page);
  await page.keyboard.press('Alt+x');
  await pick(page, DIRECT.name);
  const box = pane(page).locator('.dk-box');
  await expect(box).toBeFocused();
  // A draft keeps ← → for its caret.
  await page.keyboard.type('hold on');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.people-screen .pe-tab.on')).toHaveText(/TEXTS/);
  await box.fill('');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.people-screen .pe-tab.on')).toHaveText(/FILE/);
  await expect(pane(page).locator('.pe-name')).toHaveText(DIRECT.name.toUpperCase());
  await expect(page.locator('.people-screen .pe-tile.on .pe-tile-name')).toHaveText(new RegExp(DIRECT.name.toUpperCase()));
  await page.keyboard.press('ArrowRight');
  await expect(box).toBeFocused();
  // ↓ from the box walks the list, and the thread follows.
  const before = await page.locator('.people-screen .pe-tile.on').getAttribute('data-id');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.people-screen .pe-tile.on')).not.toHaveAttribute('data-id', before!);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.people-screen .pe-tile.on')).toHaveAttribute('data-id', before!);
});

test('Tab goes on to the next screen (QUEST when it is on the bar, else CREW) and Shift+Tab back; Esc closes and you stay in the room', async ({ page }) => {
  await atAlpha(page);
  await page.keyboard.press('Alt+x');
  await pick(page, DIRECT.name);
  await pane(page).locator('.dk-box').focus();
  const quest = await page.locator('.hud-quest').isVisible();
  // Another's JOURNAL isn't yours to read, so from their TEXTS the cycle goes straight on.
  await page.keyboard.press('Tab');
  await expect(page.locator(quest ? '.ql-pane' : '.crew-screen')).toBeVisible();
  await expect(page.locator('.people-screen')).toHaveCount(0);
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.people-screen')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.people-screen')).toHaveCount(0);
  expect(page.url()).toContain(`/room/${SECOND.id}`);
});

test('an unread text: the notice and the count on PEOPLE; the notice opens her thread, and both clear', async ({ page, request }) => {
  await atAlpha(page);
  await page.keyboard.press('Alt+x');
  await pick(page, DIRECT.name);
  await pane(page).locator('.dk-box').fill('text me in an hour');
  await pane(page).locator('.dk-box').press('Enter');
  await expect(pane(page).locator('.dk-her')).toHaveCount(3);
  // The Residual runs after her reply: give it a moment to record the promise.
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await expect(page.locator('.people-screen')).toHaveCount(0);
  expect((await request.post('/api/playthroughs/active/wait', { data: { minutes: 240 } })).status()).toBe(200);
  await expect(page.locator('.hud-texts')).toHaveText(`${DIRECT.name.toUpperCase()} · 1 TEXT`, { timeout: 15_000 });
  await expect(page.locator('.hud-people')).toHaveClass(/\btexts-new\b/);
  await expect(page.locator('.hud-people')).toHaveAttribute('data-count', '1');
  // FILE doesn't read it: the tag and the tab's count stay while you look at her file.
  await page.keyboard.press('Alt+c');
  await pick(page, DIRECT.name);
  await expect(page.locator('.people-screen .pe-tile.on .pe-new')).toHaveText('NEW');
  await expect(page.locator('.people-screen .pe-tab[data-tab="texts"] .tp-n')).toHaveText('1 NEW');
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'test-results/people-file-unread.png' });
  await page.keyboard.press('Escape');
  await expect(page.locator('.hud-people')).toHaveAttribute('data-count', '1');
  // The notice folds into PEOPLE's count after a few seconds; pointing at PEOPLE brings it back to click.
  await page.locator('.hud-people').hover();
  await expect(page.locator('.hud-texts')).not.toHaveClass(/\bfolded\b/);
  await page.locator('.hud-texts').click();
  await expect(page.locator('.people-screen .pe-tile.on .pe-tile-name')).toHaveText(new RegExp(DIRECT.name.toUpperCase()));
  await expect(pane(page).locator('.dk-her')).toHaveCount(6);
  await expect(page.locator('.hud-texts')).toBeHidden();
  await expect(page.locator('.hud-people')).not.toHaveClass(/\btexts-new\b/);
});

test('the panel: no pane, hung off the bar; list, what it opens and the key line fit at 1600×900 on all three tabs', async ({ page }) => {
  await atAlpha(page);
  const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  const settled = () => page.waitForTimeout(450); // past the panel's step-on
  await page.keyboard.press('Alt+c');
  await expect(page.locator('.people-screen .pe-tile').first()).toBeVisible();
  await settled();
  await expect(page.locator('.people-screen .hf')).toHaveCount(0);
  const ends = await page.evaluate(() => {
    const d = document.querySelector('.people-screen > svg.hv-lead[data-lead="head"] path')!.getAttribute('d')!;
    const pts = [...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const root = document.querySelector('.people-screen')!.getBoundingClientRect();
    const z = root.width / (document.querySelector<HTMLElement>('.people-screen')!.offsetWidth || 1);
    const kon = document.querySelector('.hud-trace .kon')!.getBoundingClientRect();
    return { n: pts.length, last: pts[pts.length - 1], run: [(kon.left - root.left) / z, (kon.top + kon.height / 2 - root.top) / z] };
  });
  expect(ends.n).toBe(3);
  expect(Math.abs(ends.last[0] - ends.run[0])).toBeLessThan(2);
  expect(Math.abs(ends.last[1] - ends.run[1])).toBeLessThan(2);
  const apart = async () => {
    const [l, f, k] = [await box('.pe-roster'), await box('.pe-right'), await box('.tp-keys')];
    expect(l.x + l.width).toBeLessThanOrEqual(f.x + 1);
    expect(f.y + f.height).toBeLessThanOrEqual(k.y + 1);
    expect(l.y + l.height).toBeLessThanOrEqual(k.y + 1);
    expect(f.x + f.width).toBeLessThanOrEqual(1600);
    await expect(page.locator('.people-screen > svg.hv-lead[data-lead="pick"] path')).toHaveCount(1);
  };
  await apart();
  await page.screenshot({ path: 'test-results/people-file-here.png' });
  await pick(page, DIRECT.name);
  await settled();
  await apart();
  await page.screenshot({ path: 'test-results/people-file.png' });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.people-screen .pe-tab.on')).toHaveText(/TEXTS/);
  await settled();
  await apart();
  await page.keyboard.press('Alt+j');
  await expect(page.locator('.people-screen .pe-tab.on')).toHaveText(/JOURNAL/);
  await expect(page.locator('.people-screen .pe-tile.on .pe-here')).toBeVisible();
  await settled();
  await apart();
  await page.screenshot({ path: 'test-results/people-journal.png' });
});
