import { expect, test, type Page } from '@playwright/test';
import { awaitGreeting, DIRECT, expectTableClear, goIn, send, settleCostStep, skipSplash, startQuest } from './fixtures';

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

  // A tab on the lifted recruit drops the lift, and the hand redraws mid-turn: the card still turns through its back
  // rather than snapping to it.
  const tab = page.locator('.tb-tab').first();
  await expect(page.locator('.tb-crew-stack .tb-slot.lifted')).toHaveCount(1);
  // The card's turn, frame by frame: cos of its angle. A snap goes 1 → −1 with nothing between.
  await page.evaluate(() => {
    const w = window as unknown as { __cos: number[] };
    w.__cos = [];
    const t0 = performance.now();
    const tick = () => {
      const inner = document.querySelector<HTMLElement>('.tb-flip-in');
      if (inner) w.__cos.push(new DOMMatrix(getComputedStyle(inner).transform).m11);
      if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await tab.click();
  await page.waitForTimeout(1300);
  const cos = await page.evaluate(() => (window as unknown as { __cos: number[] }).__cos);
  const firstBack = cos.findIndex((c) => c < -0.9);
  expect(firstBack).toBeGreaterThan(0);
  // On the way over to the back, frames part way round.
  expect(cos.slice(0, firstBack).filter((c) => c > -0.9 && c < 0.9).length).toBeGreaterThanOrEqual(3);
});

test('SETUP: the printed approach cards clear the title, the hand and GO IN, their words inside the card', async ({ page }) => {
  await room(page);
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Two Step');
  await expect(page.locator('.ts-approach .tb-card').first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/setup-approach.png' });
  const hits = await page.evaluate(() => {
    const box = (e: Element) => e.getBoundingClientRect();
    const touch = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const cards = [...document.querySelectorAll('.ts-approach .tb-card')];
    const out: string[] = [];
    for (const s of ['.ts-title', '.ts-approach > .tb-group-label', '.ts-hand', '.ts-ready', '.ts-buttons', '.hud-left']) {
      const e = document.querySelector(s);
      if (e) for (const c of cards) if (touch(box(c), box(e))) out.push(`${s} on ${(c as HTMLElement).dataset.id}`);
    }
    for (const c of cards) {
      const pic = box(c.querySelector('.tbc-print')!);
      for (const t of c.querySelectorAll('.tbc-body > *')) {
        const r = document.createRange();
        r.selectNodeContents(t);
        const b = r.getBoundingClientRect();
        if (b.left < pic.left || b.right > pic.right || b.top < pic.top) out.push(`${t.textContent} leaves ${(c as HTMLElement).dataset.id}`);
      }
    }
    return out;
  });
  expect(hits).toEqual([]);
});

test('the table stays clear with a hand up: the deal, each roll, its costs (position cards)', async ({ page }) => {
  await room(page);
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
  await page.locator(`.ts-ready .tb-slot[data-id="${rid}"]`).click();
  await goIn(page);

  const playable = page.locator('.tb-deal > .tb-card:has(.tb-odds):not(.none)');
  const debrief = page.locator('.tb-debrief');
  for (let beat = 0; beat < 8; beat++) {
    await expect(playable.first().or(debrief).or(page.locator('.tb-costs'))).toBeVisible({ timeout: 15_000 });
    if (await debrief.isVisible()) break;
    if (await page.locator('.tb-costs').isVisible()) {
      await page.waitForTimeout(600);
      await page.screenshot({ path: `test-results/clear-${beat}-costs.png` });
      await expectTableClear(page, `beat ${beat}: the costs`);
      if (!(await settleCostStep(page))) break;
      await page.waitForTimeout(600);
      await expectTableClear(page, `beat ${beat}: a cost picked`);
      await page.screenshot({ path: `test-results/clear-${beat}-picked.png` });
      while (await settleCostStep(page)) await page.waitForTimeout(400);
      continue;
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/clear-${beat}-deal.png` });
    await expectTableClear(page, `beat ${beat}: the deal`);
    // Every frame from the click on: the costs never show over the card still shrinking into its place.
    await page.evaluate(() => {
      const w = window as unknown as { __hit?: string[] };
      w.__hit ??= [];
      const t0 = performance.now();
      const look = () => {
        const costs = document.querySelector('.tb-costs');
        const card = document.querySelector('.tb-deal .tb-card.is-locked, .tb-parked .tb-card');
        if (costs && card && Number(getComputedStyle(costs).opacity) > 0.05) {
          const [a, b] = [costs.getBoundingClientRect(), card.getBoundingClientRect()];
          if (a.top < b.bottom - 1 && b.top < a.bottom - 1 && a.left < b.right - 1 && b.left < a.right - 1) w.__hit!.push(`${Math.round(performance.now() - t0)}ms`);
        }
        if (performance.now() - t0 < 4_000) requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    await playable.first().click();
    const dice = page.locator('.tb-deal .tb-roll canvas');
    if (!(await dice.waitFor({ timeout: 5_000 }).then(() => true, () => false))) continue;
    await expect(dice).toHaveAttribute('data-lit', /\d/, { timeout: 8_000 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `test-results/clear-${beat}-roll.png` });
    await expectTableClear(page, `beat ${beat}: the roll landed`);
    const hand = (await page.locator('.tb-hand').boundingBox())!;
    const box = (await dice.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(hand.y);
    // The next beat's deal lands once the result has had its hold.
    await page.waitForTimeout(2_000);
  }
  expect(await page.evaluate(() => (window as unknown as { __hit?: string[] }).__hit ?? [])).toEqual([]);
});
