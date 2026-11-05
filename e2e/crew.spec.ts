import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { CrewView } from '../shared/types';
import { awaitGreeting, settleCostStep, DIRECT, goIn, questRow, send, skipSplash, startQuest, tipsOn } from './fixtures';

// Crew (spec 2026-10-19): hiring at the Intake (e2e/serve.ts gives it hires), errands, prep on a job, rewind.
// Each test plays in a branch from her greeting (WAITs move a playthrough's clock for good, and Paper Trail has a
// deadline), and the playthrough it found is put back afterwards, so the specs after this one in the worker don't see it.
test.describe.configure({ mode: 'serial' });

let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
});
test.afterEach(async ({ request }) => {
  if (before) expect((await request.post(`/api/playthroughs/${before}/activate`)).status()).toBe(200);
});

async function room(page: Page): Promise<{ greetingId: string; errors: string[] }> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=hicks`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const scene = page.locator('.hud-left .scene');
  await expect(scene).not.toHaveText('——');
  if ((await scene.textContent()) !== 'LOWLIGHT INTAKE') {
    await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
    await expect(scene).toHaveText('LOWLIGHT INTAKE', { timeout: 10_000 });
    await page.goto(`/room/${DIRECT.id}?as=hicks`);
    await page.waitForFunction(() => window.__nixRoom !== undefined);
    await awaitGreeting(page);
  }
  const greetingId = (await page.locator('.msg.agent.s-ok').last().getAttribute('data-id'))!;
  // A branch from her greeting to play in; the room reloads itself into it.
  const reloaded = page.waitForEvent('load');
  const r = await page.request.post('/api/branch', { data: { contactId: DIRECT.id, messageId: greetingId } });
  expect(r.status()).toBe(200);
  await reloaded;
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  return { greetingId: (await page.locator('.msg.agent.s-ok').last().getAttribute('data-id'))!, errors };
}

/** A line from the player and her reply: a fresh row for the crew's writes to be stamped to. */
async function newRow(page: Page): Promise<string> {
  const replies = page.locator('.msg.agent.s-ok');
  const before = await replies.count();
  await send(page, { type: 'user_message', text: 'Anything on tonight?' });
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  return (await replies.last().getAttribute('data-id'))!;
}

const wait = (page: Page, body: { minutes: number } | { until: string }) =>
  page.evaluate(async (b) => {
    const r = await fetch('/api/playthroughs/active/wait', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
    if (!r.ok) throw new Error(`wait: ${r.status}`);
  }, body);
const crew = async (page: Page) => ((await (await page.request.get('/api/crew')).json()) as { crew: { stash?: unknown[]; roster: { recruit: { id: string; name: string }; state: string; log: unknown[] }[]; sol: number; results: { line: string }[] } }).crew;

/** Opens CREW, hires the first card at the Intake, and returns the hire's first name. */
async function hireOne(page: Page): Promise<string> {
  await page.keyboard.press('Alt+KeyK');
  await expect(page.locator('.crew-screen')).toBeVisible();
  await page.locator('.cr-tab[data-tab="hire"]').click();
  const card = page.locator('.cr-card:not(.locked)').first();
  // The card says it in capitals; result lines say it as written.
  const shout = ((await card.locator('.cr-cname').textContent()) ?? '').split(' ')[0];
  const name = shout.charAt(0) + shout.slice(1).toLowerCase();
  await card.locator('.cr-btn', { hasText: 'HIRE' }).click();
  await page.locator('.cr-tab[data-tab="roster"]').click();
  await expect(page.locator('.cr-tiles > .cr-tile[data-id]')).toHaveCount(1);
  return name;
}

test('hire, send, wait: the result is back, and sol on YOU', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  // At 20:00, so a two-hour errand lands before 06:00 whatever the worker's clock was.
  await wait(page, { until: '20:00' });
  await newRow(page);
  const name = await hireOne(page);
  const solBefore = (await crew(page)).sol;
  await page.locator('.cr-tab[data-tab="assign"]').click();
  await page.locator('.cr-errand', { hasText: 'Run a package' }).click();
  await page.locator('.cr-send').click();
  await expect(page.locator('.cr-out')).toContainText(name.toUpperCase());
  await wait(page, { minutes: 150 });
  await expect(page.locator('.cr-back')).toContainText(`${name} ran it`, { timeout: 10_000 });
  expect((await crew(page)).sol).toBe(solBefore + 200);
  const kit = ((await (await page.request.get('/api/kit')).json()) as { kit: { sol: number } }).kit;
  expect(kit.sol).toBe(solBefore + 200);
  await page.keyboard.press('Escape');
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect.poll(async () => (await crew(page)).roster.length).toBe(0);
  expect(errors).toEqual([]);
});

test('rewind before a send takes it back: the recruit is ready, with no runs', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  await wait(page, { until: '20:00' });
  const hiredAt = await newRow(page);
  const name = await hireOne(page);
  await page.keyboard.press('Escape');
  // Gone after its glitch-out, before it opens again.
  await expect(page.locator('.crew-screen')).toHaveCount(0);
  await newRow(page);
  await page.keyboard.press('Alt+KeyK');
  await page.locator('.cr-tab[data-tab="assign"]').click();
  await page.locator('.cr-errand', { hasText: 'Run a package' }).click();
  await page.locator('.cr-send').click();
  await wait(page, { minutes: 150 });
  await expect(page.locator('.cr-back')).toContainText(name, { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await send(page, { type: 'rewind', messageId: hiredAt });
  await expect.poll(async () => (await crew(page)).roster.map((m) => [m.state, m.log.length])).toEqual([['ready', 0]]);
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect.poll(async () => (await crew(page)).roster.length).toBe(0);
  expect(errors).toEqual([]);
});

/** Plays the table's up cards (STEADY/TAKE IT and the cover cards included) until the debrief deals; returns it. */
async function playToDebrief(page: Page, first?: string) {
  const debrief = page.locator('.tb-debrief .db');
  // A card that can be played: the deal's own (a parked roll's card sits in its row), not the one still rolling (locked).
  const playable = page.locator('.tb-deal > .tb-card[data-state="up"]:not(.is-locked)');
  let settles = 0;
  for (let i = 0; i < 10 && !(await debrief.isVisible()); i++) {
    if (i > 0) await expect(playable.first().or(debrief).or(page.locator('.tb-costs'))).toBeVisible({ timeout: 15_000 });
    if (await debrief.isVisible()) break;
    // A costly roll's costs (roll lifecycle spec §1.5): pick and TAKE IT until the roll lands.
    // Capped (final review M10): a refused click would otherwise loop until the test times out.
    if (settles < 12 && (await settleCostStep(page))) {
      settles++;
      await page.waitForTimeout(300);
      i--;
      continue;
    }
    const take = page.locator('.tb-deal > .tb-card[data-choice="!take"]');
    const card = first && i === 0 ? page.locator(`.tb-deal .tb-card[data-choice="${first}"]`) : (await take.count()) ? take : playable.first();
    await card.click();
    await page.waitForTimeout(400);
    await expect(page.locator('.tb-deal .tb-card, .tb-debrief .db').first()).toBeVisible({ timeout: 10_000 });
  }
  await expect(debrief).toBeVisible({ timeout: 10_000 });
  return debrief;
}

/** Starts `job` from QUEST with QUIET and the one hire brought, on the SETUP card. */
async function goInWith(page: Page, job: string, rid: string) {
  await page.locator('.hud-quest').click();
  await expect(page.locator('.ql-row.ql-job', { hasText: job })).toBeVisible();
  await page.screenshot({ path: 'test-results/hand-board.png' });
  await startQuest(page, job);
  await expect(page.locator('.tb-setup')).toBeVisible();
  // The pitch and its district line read in the JOB column beside the subtitles; the table keeps the title.
  await expect(page.locator('.jc')).toBeVisible();
  await expect(page.locator('.jc-head')).toHaveText(`◆ JOB · ${job.toUpperCase()}`);
  await expect(page.locator('.jc-sub')).toContainText('HEAT');
  await expect(page.locator('.ts-pitch .tb-sub')).toBeHidden();
  await page.locator(`.ts-ready .tb-slot[data-id="${rid}"]`).click();
  await expect(page.locator(`.g-people .tb-slot[data-id="${rid}"]`)).toBeVisible();
  await page.screenshot({ path: 'test-results/hand-setup.png' });
  // Enter goes in (GO IN's key), from the empty prompt too.
  await page.locator('#input textarea, #input input').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tb-setup')).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('.tb-job .tb-deal .tb-card').first()).toBeVisible({ timeout: 10_000 });
  // HUD (2026-11-02): the beat's text in the column, standing in the table's log region left of the moment, and her line
  // a subtitle at the right by her; the table's own prose stays hidden.
  await expect(page.locator('.jc-body')).not.toBeEmpty();
  await expect(page.locator('.tb-job .tb-prose')).toBeHidden();
  await expect
    .poll(async () => {
      const [line, col, moment] = await Promise.all([page.locator('.feed-root.feed-stage .feed').boundingBox(), page.locator('.jc').boundingBox(), page.locator('.tb-job .tb-middle').boundingBox()]);
      return col!.x + col!.width <= moment!.x && col!.x + col!.width <= line!.x;
    })
    .toBe(true);
  await page.screenshot({ path: 'test-results/job-column.png' });
}

test('brings crew and plays a card: on a job, the preview, the call, a crew line in the debrief', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  await wait(page, { until: '20:00' });
  await newRow(page);
  await hireOne(page);
  await page.keyboard.press('Escape');
  const rid = (await crew(page)).roster[0].recruit.id;
  const shout = (await crew(page)).roster[0].recruit.name.split(' ')[0].toUpperCase();
  await goInWith(page, 'Night Shift', rid);
  expect((await crew(page)).roster[0].state).toBe('job');
  // Lift the recruit: each checked choice shows what the card would do there.
  await page.locator(`.tb-hand .tb-slot[data-id="${rid}"]`).click();
  await expect(page.locator('.tb-deal .tb-card[data-choice="roof"] .tb-odds.preview')).toContainText('TECH');
  await page.screenshot({ path: 'test-results/hand-lifted.png' });
  // Talking still works over the table: the input takes a click (nothing on top of it).
  await page.locator('#input textarea, #input input').first().click();
  // The roll: the pixel dice beside the card, landed with the stamp after them, clear of the hand. A roll that waits on
  // STEADY / TAKE IT keeps them up in its parked row.
  await page.locator('.tb-deal .tb-card[data-choice="roof"]').click();
  const roll = page.locator('.tb-deal .tb-roll');
  await expect(roll.locator('canvas')).toBeVisible({ timeout: 10_000 });
  await expect(roll.locator('canvas')).toHaveAttribute('data-lit', /\d/, { timeout: 5_000 });
  await expect(roll.locator('.qc-stamp')).toHaveText(/CRIT|CLEAN|COST|MISS/);
  // Under it, what the roll did in words.
  await expect(roll.locator('.qc-says')).toHaveText(/^(THROUGH|FAILED)( · [^·]+)*$/);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-results/pixel-dice-roll.png' });
  if (await page.locator('.tb-parked').count()) {
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'test-results/roll-parked.png' });
  }
  const dice = (await roll.locator('canvas').boundingBox())!;
  const hand = (await page.locator('.tb-hand').boundingBox())!;
  expect(dice.y + dice.height).toBeLessThanOrEqual(hand.y);
  const debrief = await playToDebrief(page);
  await expect(debrief.locator('.db-crew-line')).toContainText([shout]);
  await expect(debrief.locator('.db-mate img')).toHaveCount(1);
  // The ending's text reads in the column beside the debrief.
  await expect(page.locator('.jc-body')).not.toBeEmpty();
  await page.screenshot({ path: 'test-results/hand-debrief.png' });
  // Another job's SETUP over the debrief takes the column; BACK hands it back to the ending.
  const ending = await page.locator('.jc-body').textContent();
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Back Door');
  await expect(page.locator('.jc-head')).toHaveText('◆ JOB · BACK DOOR');
  // Esc backs out (BACK's key), not to the pause menu.
  await page.keyboard.press('Escape');
  await expect(page.locator('.tb-setup')).toHaveCount(0);
  await expect(page.locator('.pause-menu, .pm-root')).toHaveCount(0);
  await expect(page.locator('.jc-body')).toHaveText(ending!);
  await expect(page.locator('.jc-head')).not.toHaveText('◆ JOB · BACK DOOR');
  // The debrief is still up, so the room stays dim (and a stranger's bust stays sized under the table).
  await expect(page.locator('#game')).toHaveClass(/\btb-dim\b/);
  const run = await page.request.get('/api/crew');
  expect(((await run.json()) as { crew: { roster: { state: string }[] } }).crew.roster[0].state).not.toBe('job');
  await expect(page.locator('.line-keys')).toBeHidden();
  await page.locator('.tb-close').click();
  await expect(page.locator('.tb-job')).toBeHidden();
  // CLOSE takes the column with it: her line has the band back, and its keys.
  await expect(page.locator('.jc')).toBeHidden();
  await expect(page.locator('.feed-root.job-col')).toHaveCount(0);
  await expect(page.locator('.line-keys')).toBeVisible();
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect.poll(async () => (await crew(page)).roster.length).toBe(0);
  expect(errors).toEqual([]);
});

test("abilities: the hire's ability on the file, UNSLOT and SLOT, bring them, press it, its debrief line", async ({ page }) => {
  const { greetingId, errors } = await room(page);
  await wait(page, { until: '20:00' });
  await newRow(page);
  await hireOne(page);
  const rid = (await crew(page)).roster[0].recruit.id;
  const shout = (await crew(page)).roster[0].recruit.name.split(' ')[0].toUpperCase();
  // The file: one slotted ability, UNSLOT then SLOT.
  const card = page.locator('.cr-abilities .cr-ab[data-id="e2e-steady"]');
  await expect(card).toContainText('STEADY HAND');
  await expect(page.locator('.cr-ab-slots')).toHaveText('SLOTS 1/1');
  await card.locator('.cr-ab-btn', { hasText: 'UNSLOT' }).click();
  await expect(page.locator('.cr-ab-slots')).toHaveText('SLOTS 0/1');
  await card.locator('.cr-ab-btn', { hasText: 'SLOT' }).click();
  await expect(page.locator('.cr-ab-slots')).toHaveText('SLOTS 1/1');
  await page.screenshot({ path: 'test-results/abilities-file.png' });
  await page.keyboard.press('Escape');
  await goInWith(page, 'Night Shift', rid);
  // The recruit's card with a tab for the ability under it; the tab turns the card over to the ability, which, lifted,
  // previews on a check and goes with the pick.
  const tab = page.locator(`.tb-crew-stack[data-stack="${rid}"] .tb-tab[data-id="${rid}/e2e-steady"]`);
  await expect(tab).toHaveCount(1);
  // Let the deal turn the hand face up before the screenshot.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/abilities-stack-rest.png' });
  await tab.click();
  await expect(tab).toHaveClass(/\bon\b/);
  // Both half turns done: the ability is the side up.
  await page.waitForTimeout(900);
  await page.locator(`.tb-hand .tb-slot[data-id="${rid}/e2e-steady"]`).click();
  await expect(page.locator('.tb-deal .tb-card[data-choice="roof"] .tb-odds.preview')).toBeVisible();
  await page.screenshot({ path: 'test-results/abilities-stack.png' });
  const debrief = await playToDebrief(page, 'roof');
  await expect(debrief.locator('.db-crew-line')).toContainText([`${shout} · STEADY HAND`]);
  await page.locator('.tb-close').click();
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect.poll(async () => (await crew(page)).roster.length).toBe(0);
  expect(errors).toEqual([]);
});

test('effect and NERVE: BOLD on a card, an ability pressed for 1 NERVE, the record says BOLD', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  await wait(page, { until: '20:00' });
  await newRow(page);
  await hireOne(page);
  const rid = (await crew(page)).roster[0].recruit.id;
  await page.keyboard.press('Escape');
  await goInWith(page, 'Night Shift', rid);
  const roof = page.locator('.tb-deal .tb-card[data-choice="roof"]');
  await expect(roof.locator('.tb-eff')).toHaveText('FAIR');
  // BOLD: the card previews a position worse for a step more (effect and NERVE spec §3).
  await page.locator('.tb-trade .tb-bold').click();
  await expect(page.locator('.tb-trade .tb-bold')).toHaveClass(/\bon\b/);
  await expect(roof.locator('.tb-eff')).toHaveText('BIG');
  await expect(roof.locator('.tb-odds')).toContainText('FAIR → BIG');
  // The ability costs 1 NERVE a press: its card says so.
  const tab = page.locator(`.tb-crew-stack[data-stack="${rid}"] .tb-tab[data-id="${rid}/e2e-steady"]`);
  await page.waitForTimeout(1500);
  await tab.click();
  await page.waitForTimeout(900);
  const ability = page.locator(`.tb-hand .tb-slot[data-id="${rid}/e2e-steady"]`);
  await expect(ability).toContainText('1 NERVE');
  await ability.click();
  await page.screenshot({ path: 'test-results/effect-bold.png' });
  const nerve = async () => Number(/NERVE (\d+)/.exec((await page.locator('.tb-nerve').getAttribute('aria-label')) ?? '')?.[1]);
  const before = await nerve();
  await roof.click();
  await expect.poll(nerve).toBe(before - 1);
  await expect(page.locator('.tb-trade .tb-bold')).not.toHaveClass(/\bon\b/);
  await expect(page.locator('#feed')).toContainText('· BOLD');
  await page.screenshot({ path: 'test-results/effect-rolled.png' });
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect.poll(async () => (await crew(page)).roster.length).toBe(0);
  expect(errors).toEqual([]);
});

// Contact cards are on hold (programs spec §2.4): SETUP has no CONTACTS row, so this waits for them to come back. Runs
// from before that brought one are covered in server/test/jobs.test.ts (asOld).
test.skip('a contact card: Ember from CONTACTS into a pocket, played on a check, her line in the debrief', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  await wait(page, { until: '20:00' });
  await newRow(page);
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Night Shift');
  await expect(page.locator('.tb-setup')).toBeVisible();
  await page.locator('.ts-contacts .tb-slot[data-id="contact:ember"]').click();
  await expect(page.locator('.g-pockets .tb-slot[data-id="contact:ember"]')).toContainText('EMBER · RUNNER');
  const art = page.locator('.g-pockets .tb-slot[data-id="contact:ember"] img.tbc-face');
  await expect(art).toHaveAttribute('src', '/contacts/ember.webp');
  await expect.poll(() => art.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(370);
  await page.screenshot({ path: 'test-results/contact-setup.png' });
  await page.locator('.ts-go').click();
  await expect(page.locator('.tb-job .tb-deal .tb-card').first()).toBeVisible({ timeout: 10_000 });
  await page.locator('.tb-hand .tb-slot[data-id="contact:ember"]').click();
  await expect(page.locator('.tb-deal .tb-card[data-choice="roof"] .tb-odds.preview')).toContainText('TECH');
  const debrief = await playToDebrief(page, 'roof');
  await expect(debrief.locator('.db-crew-line')).toContainText(['EMBER TOOK THE DOOR']);
  await page.screenshot({ path: 'test-results/contact-debrief.png' });
  await page.locator('.tb-close').click();
  await send(page, { type: 'rewind', messageId: greetingId });
  expect(errors).toEqual([]);
});

test('a press beside a call: both cards lift, one roll, both on the record', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  await wait(page, { until: '20:00' });
  await newRow(page);
  await hireOne(page);
  await page.locator('.cr-tab[data-tab="hire"]').click();
  await page.locator('.cr-card:not(.locked)').first().locator('.cr-btn', { hasText: 'HIRE' }).click();
  await page.locator('.cr-tab[data-tab="roster"]').click();
  await expect(page.locator('.cr-tiles > .cr-tile[data-id]')).toHaveCount(2);
  await page.keyboard.press('Escape');
  const [first, second] = (await crew(page)).roster.map((m) => m.recruit.id);
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Night Shift');
  await expect(page.locator('.tb-setup')).toBeVisible();
  for (const id of [first, second]) await page.locator(`.ts-ready .tb-slot[data-id="${id}"]`).click();
  await page.locator('#input textarea, #input input').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tb-setup')).toBeHidden();
  await page.waitForTimeout(1500);
  await page.locator(`.tb-crew-stack[data-stack="${second}"] .tb-tab[data-id="${second}/e2e-steady"]`).click();
  await page.waitForTimeout(900);
  const call = page.locator(`.tb-hand .tb-slot[data-id="${first}"]`);
  const press = page.locator(`.tb-hand .tb-slot[data-id="${second}/e2e-steady"]`);
  await call.click();
  await press.click();
  await expect(call).toHaveClass(/\blifted\b/);
  await expect(press).toHaveClass(/\blifted\b/);
  await page.screenshot({ path: 'test-results/press-beside-call.png' });
  await page.locator('.tb-deal .tb-card[data-choice="roof"]').click();
  await expect(page.locator('#feed')).toContainText('Steady Hand');
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect.poll(async () => (await crew(page)).roster.length).toBe(0);
  expect(errors).toEqual([]);
});

test('a blown job costs the crew brought: a loss line in the debrief', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  await wait(page, { until: '20:00' });
  await newRow(page);
  await hireOne(page);
  await page.keyboard.press('Escape');
  const rid = (await crew(page)).roster[0].recruit.id;
  const shout = (await crew(page)).roster[0].recruit.name.split(' ')[0].toUpperCase();
  await goInWith(page, 'Back Door', rid);
  // Kicking the door in blows it without a roll.
  const debrief = await playToDebrief(page, 'kick');
  await expect(debrief.locator('.db-tier')).toHaveText('BLOWN');
  await expect(debrief.locator('.db-crew-line')).toContainText([new RegExp(`^${shout} · (HURT · \\d DAYS?|HELD|GONE)$`)]);
  expect((await crew(page)).roster[0].state).not.toBe('job');
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect.poll(async () => (await crew(page)).roster.length).toBe(0);
  expect(errors).toEqual([]);
});

test('Graft tips on a first job: SETUP, the first beat, the next deal; none again; SHOW AGAIN', async ({ page }) => {
  await tipsOn(page);
  const { greetingId, errors } = await room(page);
  await wait(page, { until: '20:00' });
  await newRow(page);
  const tip = page.locator('.gt-tip');
  const title = tip.locator('.gt-title');
  const openSetup = async () => {
    await page.locator('.hud-quest').click();
    await startQuest(page, 'Night Shift');
    await expect(page.locator('.tb-setup')).toBeVisible();
  };
  /** GOT IT until none is left (or `stop` shows), collecting the titles. */
  const okAll = async (stop?: string) => {
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      if (!(await tip.isVisible())) await page.waitForTimeout(900);
      if (!(await tip.isVisible())) break;
      const t = (await title.textContent()) ?? '';
      if (t === stop) break;
      seen.push(t);
      // The HEAT tip points at the line under a parked roll's stamp.
      if (t === 'HEAT') {
        await expect(page.locator('.tb-parked .qc-says')).toContainText('HEAT +');
        await page.waitForTimeout(700);
        await page.screenshot({ path: 'test-results/tips-heat.png' });
      }
      await tip.locator('.gt-ok').click();
    }
    return seen;
  };
  await openSetup();
  await expect(title).toHaveText('HOW YOU GO IN');
  await page.screenshot({ path: 'test-results/tips-setup.png' });
  // The favour and contact cards are on hold (programs spec §2.4): their tips wait with them.
  expect(await okAll()).toEqual(['HOW YOU GO IN']);
  await page.locator('.ts-go').click();
  await expect(page.locator('.tb-job .tb-deal .tb-card').first()).toBeVisible({ timeout: 10_000 });
  await expect(title).toHaveText('THE ROLL');
  await page.screenshot({ path: 'test-results/tips-roll.png' });
  await tip.locator('.gt-ok').click();
  await expect(title).toHaveText('WHERE YOU STAND');
  // Picking with a tip up still rolls, and the tip goes.
  await page.locator('.tb-deal .tb-card[data-state="up"]').first().click();
  await expect(page.locator('.tb-card.is-locked')).toBeVisible({ timeout: 10_000 });
  await expect(tip).toHaveCount(0);
  // Whatever deals next shows only tips not yet seen: THE ROLL had GOT IT; WHERE YOU STAND was only cleared by
  // the pick, so it may come back on a new beat (STEADY / TAKE IT doesn't offer it).
  await expect(tip).toBeVisible({ timeout: 10_000 });
  const next = await okAll();
  expect(next).toEqual(expect.arrayContaining(['ALARM', 'NERVE']));
  expect(next).not.toContain('THE ROLL');
  // Out of the job: a second SETUP shows none of what was seen.
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(page.locator('.tb-job')).toBeHidden({ timeout: 10_000 });
  await newRow(page);
  await openSetup();
  await page.waitForTimeout(1200);
  await expect(tip).toHaveCount(0);
  await page.locator('.ts-back').click();
  // SYS → TIPS → SHOW AGAIN brings them back.
  await page.locator('.hud-sys').click();
  await page.locator('.sys-tips-again').click();
  await page.keyboard.press('Escape');
  await openSetup();
  await expect(title).toHaveText('HOW YOU GO IN');
  await page.locator('.ts-back').click();
  expect(errors).toEqual([]);
});

test('SPRING THEM: a held recruit, the rescue at the hire place, out and READY', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  await wait(page, { until: '20:00' });
  await newRow(page);
  const name = await hireOne(page);
  await page.keyboard.press('Escape');
  const rid = (await crew(page)).roster[0].recruit.id;
  await goInWith(page, 'Back Door', rid);
  await playToDebrief(page, 'kick');
  await page.locator('.tb-close').click();
  // The pinned crew seed has Back Door's kick take them (the hand: a blown job's loss).
  expect((await crew(page)).roster[0].state).toBe('held');
  // Her closing line first: crew actions wait for her to finish.
  await expect(page.locator('.msg.s-streaming')).toHaveCount(0, { timeout: 10_000 });
  await page.keyboard.press('Alt+KeyK');
  await expect(page.locator('.crew-screen')).toBeVisible();
  await page.locator('.cr-acts .cr-btn', { hasText: 'SPRING THEM' }).click();
  await expect(page.locator('.cr-status')).toHaveText('HELD BY SDG · THEIR PEOPLE AT LOWLIGHT INTAKE ARE WAITING');
  await expect(page.locator('.cr-acts .cr-btn', { hasText: 'SPRING THEM' })).toBeDisabled();
  await page.screenshot({ path: 'test-results/spring-roster.png' });
  await page.keyboard.press('Escape');
  // The rescue posts here, where they were hired, named.
  await page.locator('.hud-quest').click();
  const row = questRow(page, `Get ${name} Out`);
  await expect(row).toBeVisible();
  await row.click();
  await page.locator('.ql-file .ql-start').click();
  await expect(page.locator('.tb-setup')).toBeVisible();
  await page.locator('.ts-go').click();
  await expect(page.locator('.tb-job .tb-deal .tb-card').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.tb-job')).not.toContainText('{recruit}');
  const debrief = await playToDebrief(page, 'walk');
  // Clean or messy both free them (a one-pick rescue doesn't fill a TAKE clock).
  await expect(debrief.locator('.db-tier')).toHaveText(/CLEAN|MESSY/);
  await page.screenshot({ path: 'test-results/spring-debrief.png' });
  await page.locator('.tb-close').click();
  const m = (await crew(page)).roster[0] as { state: string; log: { effects: string }[] };
  expect(m.state).toBe('ready');
  expect(m.log[0].effects).toBe('SPRUNG');
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect.poll(async () => (await crew(page)).roster.length).toBe(0);
  expect(errors).toEqual([]);
});

/** A full panel, served in place of /api/crew: four recruits (or `extra` more), a contract, tonight's jobs, a hire board. */
function fullPanel(extra = 0): CrewView {
  const odds = (clean: number) => ({ clean, messy: 90 - clean, blown: 10, hurt: 6, held: 3, gone: 1, fits: true, why: [] });
  const entry = (id: string, name: string, spec: string, grade: number, o: object = {}) => ({
    recruit: { id, name, face: 'face', origin: 'karasu', spec, grade, traits: ['quick'], hidden: null, pitch: '', wage: 40 },
    state: 'ready', abilities: ['take-the-hit', 'lean-on-them'], slotted: ['take-the-hit'], picks: [], slots: 1, runs: { clean: 4, messy: 1, blown: 1 }, toNext: 2, loyalty: 60, revealed: ['quick'],
    log: [{ at: 1500, band: 'clean', fate: null, line: `${name.split(' ')[0]} did what you asked.`, effects: '+200 SOL' }, { at: 1000, band: 'blown', fate: null, line: `It went wrong for ${name.split(' ')[0]}.`, effects: 'HURT 2 DAYS' }],
    goneUsed: false, busy: false, hired: { at: 0, place: 'low-roller' },
    traitsShown: [{ label: 'Quick', good: true, text: 'Gets there faster.' }, { label: 'Loud', good: false, text: "Can't keep it in." }], hiddenTraits: 1, word: 'STEADY', line: 'Shows up. Gets paid. Fair enough.', next: 'PRO', canSpring: false, springWhy: null, vouchedBy: null, springPlace: null, ...o,
  });
  const roster = [
    entry('koji', 'Koji Marr', 'muscle', 2),
    entry('dez', 'Dez Vance', 'runner', 1),
    entry('mia', 'Mia Tane', 'face', 1, { state: 'out', due: 250, errand: 'groundwork:sub@3:roof:ears@0' }),
    entry('ash', 'Ash Reyes', 'ears', 0, { state: 'hurt', hurtDays: 2 }),
    ...Array.from({ length: extra }, (_, i) => entry(`x${i}`, `Spare Hand${i}`, 'wire', 0)),
  ];
  const ready = Object.fromEntries(roster.filter((m) => m.state === 'ready').map((m, i) => [m.recruit.id, odds(74 - i * 8)]));
  const errand = (id: string, label: string, name: string, tag: string, hours: number, o: object = {}) => ({ id, kind: 'x', target: name, district: 'karasu', day: 0, label, name, tag, suits: ['runner', 'ears'], hours, risk: 'low', blurb: 'Someone sits across from it all night and counts who goes in and who does not come out. Done clean, the check is easier, and whoever goes is back before light if the night is kind.', bands: { clean: 'a', messy: 'b', blown: 'c' }, taken: false, odds: ready, ...o });
  const boat = 'groundwork:sub@3:boat:muscle@0';
  return {
    roster, slots: 6, used: roster.length, sol: 1240, wages: 150, nextSix: 200, here: 'low-roller', traits: { quick: { label: 'Quick', good: true, text: 'x' }, loud: { label: 'Loud', good: false, text: 'y' } },
    abilities: {
      'take-the-hit': { label: 'Take the Hit', timing: 'after', job: 'A COST LANDS ON THEM', text: 'Steps in front of it, every time.', from: 0 },
      'lean-on-them': { label: 'Lean on Them', timing: 'roll', job: 'BODY CHECKS ONE POSITION BETTER', text: 'Nobody argues twice.', from: 1 },
    },
    errands: [
      errand(boat, 'Groundwork for {job}', 'Sub · boat', 'PREP', 8, { run: 'sub@3', piece: 'boat', spec: 'muscle', target: 'sub@3:boat:muscle', district: '', art: '/api/quests/art/the-subtraction.webp' }),
      errand('hustle:k@0', 'Hustle in {district}', 'Karasu', 'SOL', 5),
      errand('lay:s@0', 'Lay low in {district}', 'the Strand', 'HEAT', 8),
    ] as CrewView['errands'],
    contracts: [{ run: 'sub@3', title: 'The Subtraction', nightsLeft: 2, art: '/api/quests/art/the-subtraction.webp', hours: 8, risk: 'med', pieces: [
      { id: 'boat', label: 'The boat', spec: 'muscle', line: 'Her skiff, at its mooring on the Bell Street cut. It goes under before light. Someone has to pull the plug with half the stretch asleep around them.', state: 'open', errand: boat },
      { id: 'roof', label: 'The roof', spec: 'ears', line: 'A room in a building he controls.', state: 'out', recruit: 'mia', due: 250 },
      { id: 'goodwill', label: 'The goodwill', spec: 'face', line: 'Her name on the water.', state: 'waits' },
    ] }],
    results: [{ at: 1500, band: 'clean', fate: null, line: 'Koji did what you asked.', effects: '+200 SOL', recruit: 'koji', name: 'Koji Marr' }, { at: 1400, band: 'blown', fate: null, line: 'It went wrong for Ash.', effects: 'HURT 2 DAYS', recruit: 'ash', name: 'Ash Reyes' }],
    hires: [
      { place: 'low-roller', name: 'The Low Roller', district: 'strand', cards: [
        ...['Oren Pike', 'Saba Rook', 'Tomas Reyes'].map((name, i) => ({ recruit: { ...entry(`h${i}`, name, 'wire', 1).recruit, traits: ['quick', 'loud'], hidden: 'loud', abilities: ['take-the-hit'], pitch: 'Drove a cab four years. Knows which lights the cameras watch and which ones are only lights.' }, cost: 250 })),
        { locked: { grade: 2, tier: 3, spec: 'face' } },
      ] },
      { place: 'long-haul', name: 'The Long Haul', district: 'spine', cards: [{ recruit: { ...entry('h9', 'Ilya Voss', 'fence', 0).recruit, pitch: 'Quiet.' }, cost: 100 }] },
    ],
  } as unknown as CrewView;
}

/** Whether `sel` shows all it holds: nothing cut off below or to the right. */
const fits = (page: Page, sel: string) => page.locator(sel).evaluate((n) => [n.scrollHeight - n.clientHeight, n.scrollWidth - n.clientWidth]);

test('a first lot: sold in the wanted district, the price on the card', async ({ page }) => {
  const { errors } = await room(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.route('**/api/crew/art/data.webp', (r) => r.fulfill({ path: 'world/crew/art/data.webp' }));
  await wait(page, { until: '20:00' });
  await newRow(page);
  await hireOne(page);
  await page.locator('.cr-tab[data-tab="assign"]').click();
  await page.locator('.cr-errand', { hasText: 'Data' }).click();
  await expect(page.locator('.cr-where button.on')).toBeVisible();
  const price = Number(((await page.locator('.cr-pick-price').first().textContent()) ?? '').split(' ')[0]);
  expect(price).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/crew-goods.png' });
  const solBefore = (await crew(page)).sol;
  await page.locator('.cr-send').click();
  await expect(page.locator('.cr-out')).toContainText('Hustle');
  await wait(page, { minutes: 480 });
  await expect.poll(async () => (await crew(page)).stash).toEqual([]);
  expect((await crew(page)).sol).toBeGreaterThanOrEqual(solBefore);
  expect(errors).toEqual([]);
});

test('the panel: QUEST’s box, four recruits fit, more scroll sideways, all three tabs at 1600×900', async ({ page }) => {
  await room(page);
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.route('**/api/extras/face', (r) => r.fulfill({ path: `world/extras/${fs.readdirSync('world/extras').find((f) => f.endsWith('.png'))}` }));
  await page.route('**/api/quests/art/the-subtraction.webp', (r) => r.fulfill({ path: 'world/quests/art/the-subtraction.webp' }));
  let panel = fullPanel();
  await page.route('**/api/crew', (r) => r.fulfill({ json: { crew: panel } }));
  // The same box as QUEST's, on a desktop and on a phone.
  const box = (sel: string) => page.locator(sel).boundingBox();
  // The stage rescales a moment after the viewport changes: read the box once it's stopped moving.
  const steady = async (sel: string) => {
    let last = '';
    await expect.poll(async () => { const now = JSON.stringify(await box(sel)); const held = now === last; last = now; return held; }, { intervals: [150] }).toBe(true);
    return JSON.parse(last);
  };
  const same = async () => {
    await page.keyboard.press('Alt+KeyQ');
    await expect(page.locator('.ql-pane')).toBeVisible();
    const quest = await steady('.ql-pane');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Alt+KeyK');
    await expect(page.locator('.crew-screen .cr-tile').first()).toBeVisible();
    expect(await box('.crew-screen .scr-frame')).toEqual(quest);
  };
  await page.setViewportSize({ width: 915, height: 412 });
  await same();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/crew-phone.png' });
  await page.keyboard.press('Alt+KeyK');
  await expect(page.locator('.crew-screen')).toHaveCount(0);
  await page.setViewportSize({ width: 1600, height: 900 });
  await same();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/crew-roster.png' });
  // The file scrolls inside the pane; its actions stay in view.
  await page.locator('.cr-file').evaluate((n) => n.scrollTo(0, n.scrollHeight));
  await expect(page.locator('.cr-acts .cr-btn').first()).toBeInViewport();
  await page.screenshot({ path: 'test-results/crew-roster-foot.png' });
  await page.locator('.cr-tab[data-tab="assign"]').click();
  await expect(page.locator('.cr-brief h2')).toHaveText('THE BOAT');
  await expect(page.locator('.cr-pick')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/crew-errands.png' });
  expect(await fits(page, '.cr-in')).toEqual([0, 0]);
  // The longest blurb, a job's, and a piece that can't go, fit as well.
  await page.locator('.cr-errand', { hasText: 'Hustle in Karasu' }).click();
  expect(await fits(page, '.cr-in')).toEqual([0, 0]);
  await page.screenshot({ path: 'test-results/crew-errands-noart.png' });
  await page.locator('.cr-errand', { hasText: 'The roof' }).click();
  expect(await fits(page, '.cr-in')).toEqual([0, 0]);
  await page.locator('.cr-tab[data-tab="hire"]').click();
  await expect(page.locator('.cr-card')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/crew-hire.png' });
  panel = fullPanel(4);
  await page.keyboard.press('Alt+KeyK');
  await expect(page.locator('.crew-screen')).toHaveCount(0);
  await page.keyboard.press('Alt+KeyK');
  await page.locator('.cr-tab[data-tab="assign"]').click();
  await expect(page.locator('.cr-pick')).toHaveCount(8);
  expect((await fits(page, '.cr-picks'))[1]).toBeGreaterThan(0);
  expect(await fits(page, '.cr-in')).toEqual([0, 0]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/crew-errands-eight.png' });
});
