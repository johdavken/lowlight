import { expect, test } from '@playwright/test';
import { buyAtFixer, expectTableClear, fixerItem, firstPlaythrough, goIn, nixAt, questRow, questTab, send, settleCostStep, skipSplash, pickCard } from './fixtures';

test('mission: a MISSION row, dice on a card, a miss dealing costs (pick, RESIST, TAKE IT), the pay on YOU', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  // The worker's first playthrough, with Nix at the Intake, where Night Shift starts.
  await firstPlaythrough(page.request);
  await nixAt(page, 'lowlight-intake', 'LOWLIGHT INTAKE');
  const replies = page.locator('.msg.agent.s-ok');

  // The dice follow its player's kit (the table spec §1): the stat's dice, then the deck's (or NO DECK), in the open.
  type Kit = { deck: { name: string } | null; sol: number; nerveLeft: number; stats: { tech: number } };
  const kit = ((await (await page.request.get('/api/kit')).json()) as { kit: Kit }).kit;
  const base = kit.stats.tech >= 9 ? 4 : kit.stats.tech >= 7 ? 3 : kit.stats.tech >= 4 ? 2 : 1;
  // GO IN as it stands is QUIET (the hand): +1d on TECH.
  const dice = Math.max(0, base + (kit.deck ? 1 : -1) + 1);
  const odds = `TECH ${'●'.repeat(base)}${kit.deck ? ` +${kit.deck.name.toUpperCase()} ●` : ' −NO DECK ○'} +QUIET ● · IN THE OPEN · FAIR${kit.deck ? ' · HIDDEN · NO DECK HEAT' : ''}`;
  await page.locator('.hud-quest').click();
  const row = questRow(page, 'Night Shift');
  await expect(row.locator('.ql-mission')).toHaveText('MISSION · TIER 1 · 400 SOL');
  const before = await replies.count();
  // Her greeting: rewound to at the end, so the specs after this one in the worker meet a room with no mission in it.
  const greetingId = (await replies.last().getAttribute('data-id'))!;
  await row.click();
  await page.locator('.ql-file .ql-start').click();
  // Each approach says how it goes wrong (approach shapes spec §1).
  for (const line of ['NO TAKE LOSS', 'NEVER SMALL', 'NO ALARM COSTS']) await expect(page.locator('.ts-approach')).toContainText(line);
  // Removal (approach shapes, 2026-11-08): no first-pick line on the cards.
  await expect(page.locator('.ts-approach .tbc-first')).toHaveCount(0);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/missions-setup.png' });
  await goIn(page);
  // Her one opening line, and the first beat's cards with their dice.
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  await expect(page.locator('.tb-card[data-choice="roof"] .tb-odds')).toHaveText(odds);
  // HUD (2026-11-02): the title and clocks lead the top bar; the quest's picture steps aside for the JOB column.
  await expect(page.locator('.tb-job .tb-top .tb-title')).toHaveText('NIGHT SHIFT');
  await expect(page.locator('.tb-job .tb-top .tb-take')).toBeVisible();
  // The dice name where they come from, under them; ALARM says what it does, with its two steps marked.
  await expect(page.locator('.tb-card[data-choice="roof"] .tb-names .tb-src').first()).toHaveText('TECH');
  // GO IN as it stands is QUIET: its die is named too.
  await expect(page.locator('.tb-card[data-choice="roof"] .tb-names .tb-src.k-setup')).toHaveText('+QUIET');
  await expect(page.locator('.tb-alarm .tb-clock-note')).toHaveText('AT 2 EVERY POSITION A STEP WORSE · AT 4 GET OUT');
  await expect(page.locator('.tb-alarm .tb-stack i.mark')).toHaveCount(2);
  await expect(page.locator('.tb-sofar')).toBeHidden();
  await page.screenshot({ path: 'test-results/missions-cards.png' });
  await expectTableClear(page, 'the deal');

  // The roll keeps a 2: a miss in the open deals three costs to pick two (roll lifecycle spec §1), beside the roll.
  await pickCard(page.locator('.tb-card[data-choice="roof"]'));
  // The card slides aside for the dice, and they land with the stamp beside it, clear of everything.
  await expect(page.locator('.tb-deal .tb-roll canvas')).toHaveAttribute('data-lit', /\d/, { timeout: 10_000 });
  await page.screenshot({ path: 'test-results/missions-landed.png' });
  await expectTableClear(page, 'the roll landed');
  const costs = page.locator('.tb-costs .tb-cost');
  await expect(costs).toHaveCount(3, { timeout: 10_000 });
  await expect(page.locator('.tb-costs .tb-costs-head')).toHaveText('PICK 2 · 0 PICKED');
  await expect(costs.first().locator('.tb-cost-line')).not.toBeEmpty();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/missions-costs.png' });
  await expectTableClear(page, 'the costs');
  // Every dealt card picks: QUIET is never dealt TAKE −1, and nothing is forced first (approach shapes, removal 2026-11-08).
  const free = page.locator('.tb-costs .tb-cost.pickable');
  await expect(free).toHaveCount(3);
  await expect(page.locator('.tb-costs .tb-cost[data-cost="take"]')).toHaveCount(0);
  await expect(page.locator('.tb-costs .tb-cost-first')).toHaveCount(0);
  // Pick it: it stands alone with its answers branching off it. RESIST it (EDGE's dice set the NERVE), then pick and
  // TAKE IT on the second.
  await free.first().click();
  await expect(page.locator('.tb-costs .tb-costs-head')).toHaveText('PICK 2 · 1 PICKED', { timeout: 10_000 });
  await expect(page.locator('.tb-costs .tb-cost')).toHaveCount(1);
  const resist = page.locator('.tb-costs .tb-cost-panel.resist');
  await expect(resist).toContainText('EDGE');
  await expect(page.locator('.tb-costs .tb-cost-panel.take')).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/missions-cost-picked.png' });
  await expectTableClear(page, 'a cost picked');
  if (kit.nerveLeft >= 1) {
    await resist.click();
    await expect(page.locator('.tb-costs .tb-cost.settled')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('.tb-costs .tb-cost.settled .tb-cost-how')).toContainText('RESISTED');
    await page.screenshot({ path: 'test-results/missions-resisted.png' });
    // The second pick is free.
    await expect(free).toHaveCount(2);
  }
  while (await settleCostStep(page)) await page.waitForTimeout(300);
  await expect(page.locator('.tb-card[data-choice="wipe"]')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#feed')).toContainText(`TECH ${dice}d · IN THE OPEN — 2, no ·`);
  // SO FAR (the table in the trace): the door as the dice had it, and what it changed on the clocks.
  const soFar = page.locator('.tb-sofar .tb-sofar-row');
  await expect(soFar).toHaveCount(1);
  await expect(soFar.locator('.tb-sofar-beat')).toHaveText('DOOR');
  await expect(soFar.locator('.tb-sofar-line')).toHaveText('TECH 2 · MISS');
  // What it changed depends on the costs picked: whatever is there reads as a clock and a signed number.
  for (const m of await soFar.locator('.tb-sofar-moved b').allTextContents()) expect(m).toMatch(/^(TAKE|ALARM) [+−]\d$/);
  // The card that rolls nothing says what it does for certain: the TAKE it fills (1 on a job that isn't a template) and where it goes.
  const sure = page.locator('.tb-deal .tb-sure');
  await expect(sure.locator('.tb-noroll')).toHaveText('NO ROLL');
  await expect(sure.locator('.tb-oddsbar')).toHaveText('SURE 100');
  await expect(sure.locator('.tb-res-row').first()).toHaveText(/TAKE\s*\+1 TAKE\. No dice, no cost\./);
  await expect(sure.locator('.tb-res-row').last()).toHaveText(/THEN\s*The job ends\./);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/missions-sofar.png' });
  await expectTableClear(page, 'the second beat, with SO FAR');
  await expect(replies).toHaveCount(before + 1);

  // The last check keeps a 6 and pays; her closing line ends it.
  await pickCard(page.locator('.tb-card[data-choice="wipe"]'));
  await expect(replies).toHaveCount(before + 2, { timeout: 10_000 });

  // YOU shows the pay and the deck it gave, fetched as it opens (a WAIT since the last quest move would have cooled the heat).
  const fresh = page.waitForRequest((r) => r.url().endsWith('/api/kit'), { timeout: 5_000 });
  await page.keyboard.press('Alt+y');
  await fresh;
  // The pay as the kit holds it (TAKE scaled it, and the costs picked can move TAKE): YOU shows it, and the job paid.
  const after = ((await (await page.request.get('/api/kit')).json()) as { kit: Kit }).kit.sol;
  expect(after).toBeGreaterThan(kit.sol);
  await page.locator('.cs-page-tab[data-page="kit"]').click();
  await expect(page.locator('.cs-wallet.live .cs-amt')).toHaveText(`${after.toLocaleString('en-US')}WHAT YOU HOLD`, { timeout: 10_000 });
  await expect(page.locator('.cs-deck', { hasText: 'Deaf Meridian' })).toContainText('Q3 · 2 SLOTS · HEAT 1');
  await page.waitForTimeout(1200); // past the glitch-in, for the screenshot
  await page.screenshot({ path: 'test-results/missions-you.png' });
  expect(errors).toEqual([]);
  await page.keyboard.press('Escape');
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(replies).toHaveCount(before, { timeout: 10_000 });
});

// Programs (programs spec §5, §1.2a): with a free Cortex Meridian (two slots), SOLVENT loads at SETUP from a slot's fan,
// runs on the roof and again on the wipe; when the roof's roll deals costs (the roll list's place depends on the specs
// before), FIREWALL loads mid-job into the free slot from the cost's panel, for 1 NERVE, and burns. The debrief counts what ran.
test('programs: load SOLVENT at SETUP, run it twice, the debrief counts it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await firstPlaythrough(page.request);
  await nixAt(page, 'lowlight-intake', 'LOWLIGHT INTAKE');
  const replies = page.locator('.msg.agent.s-ok');
  const greetingId = (await replies.last().getAttribute('data-id'))!;
  const before = await replies.count();
  await page.locator('.hud-quest').click();
  await questTab(page, 'fixer');
  await buyAtFixer(page, 'Cortex Meridian');
  await expect.poll(async () => ((await (await page.request.get('/api/kit')).json()) as { kit: { deck: { id: string } | null } }).kit.deck?.id).toBe('meridian');
  // Owned programs: SOLVENT and FIREWALL are the starter; LEECH is bought; the rest aren't offered.
  await buyAtFixer(page, 'LEECH');
  // Bought: the row and the file say so, and BUY is gone.
  await expect(fixerItem(page, 'LEECH').locator('.ql-row-why')).toHaveText('YOU HAVE ONE');
  await expect(page.locator('.ql-fixer .ql-file .ql-item-why')).toHaveText('YOU HAVE ONE');
  await expect(page.locator('.ql-fixer .ql-file .ql-buy')).toHaveCount(0);
  await questTab(page, 'here');
  await questRow(page, 'Night Shift').click();
  await page.locator('.ql-file .ql-start').click();
  await expect(page.locator('.ts-hand .g-deck .tb-group-label')).toHaveText('DECK · CORTEX MERIDIAN · Q3');
  await expect(page.locator('.ts-hand .g-deck .tb-slot')).toHaveCount(2);
  await expect(page.locator('.ts-hand .g-deck .ts-lean')).toContainText('JOB LEANS');
  await page.locator('.ts-hand .g-deck .tb-slot[data-id="slot:1"]').click();
  await expect(page.locator('.ts-tray .tb-slot')).toHaveCount(3);
  await expect(page.locator('.ts-tray .tb-slot[data-id="prog-pick:leech"]')).toHaveCount(1);
  await expect(page.locator('.ts-tray .tb-slot[data-id="prog-pick:voicebox"]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/programs-setup-fan.png' });
  await page.locator('.ts-tray .tb-slot[data-id="prog-pick:solvent"]').click();
  await expect(page.locator('.ts-hand .g-deck .tb-slot')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/programs-setup.png' });
  await goIn(page);
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  const pockets = page.locator('.tb-job .tb-hand .g-deck');
  await expect(pockets.locator('.tb-group-label')).toHaveText('DECK · CORTEX MERIDIAN · Q3');
  await pockets.locator('.tb-slot[data-id="prog:solvent"]').click();
  await expect(pockets.locator('.tb-slot[data-id="prog:solvent"]')).toHaveClass(/\bon\b/);
  // Loaded at SETUP, free: no ALARM on the roof's card.
  await expect(page.locator('.tb-card[data-choice="roof"] .tb-tag.lacquer')).toHaveCount(0);
  await expect(page.locator('.tb-card[data-choice="roof"] .tb-side-word')).toHaveText('DARK');
  await page.screenshot({ path: 'test-results/programs-load.png' });
  await pickCard(page.locator('.tb-card[data-choice="roof"]'));
  const wipe = page.locator('.tb-card[data-choice="wipe"]');
  const pickable = page.locator('.tb-costs .tb-cost.pickable');
  await expect(wipe.or(pickable.first())).toBeVisible({ timeout: 10_000 });
  let firewalled = false;
  if (await pickable.count()) {
    await pickable.first().click();
    const fw = page.locator('.tb-costs .tb-cost-panel.armour');
    await expect(fw.locator('small')).toHaveText('LOAD FIREWALL · 1 SLOT · 1 NERVE');
    await page.screenshot({ path: 'test-results/programs-firewall.png' });
    await fw.click();
    firewalled = true;
    while (await settleCostStep(page)) await page.waitForTimeout(300);
  }
  await expect(wipe).toBeVisible({ timeout: 10_000 });
  // Loaded for the job: lit on the wipe, a tap runs it.
  const solvent = pockets.locator('.tb-slot[data-id="prog:solvent"]');
  await expect(solvent).toHaveAttribute('data-state', 'up');
  await solvent.click();
  await expect(solvent).toHaveClass(/\bon\b/);
  await pickCard(page.locator('.tb-card[data-choice="wipe"]'));
  await expect(wipe.or(pickable.first()).or(page.locator('.db-program-line').first())).toBeVisible({ timeout: 10_000 });
  while (await settleCostStep(page)) await page.waitForTimeout(300);
  await expect(page.locator('.db-program-line').first()).toHaveText('SOLVENT · RAN 2 · TECH IN THE DARK', { timeout: 10_000 });
  if (firewalled) await expect(page.locator('.db-program-line').nth(1)).toHaveText('FIREWALL · BURNED');
  await page.screenshot({ path: 'test-results/programs-debrief.png' });
  expect(errors).toEqual([]);
  await send(page, { type: 'rewind', messageId: greetingId });
  await expect(replies).toHaveCount(before, { timeout: 10_000 });
});

// A deck carried on YOU while SETUP is up (programs spec §1.2a): the DECK group follows at once, the load kept.
test('programs: CARRY a bigger deck at SETUP, its slots show without backing out', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await firstPlaythrough(page.request);
  await nixAt(page, 'lowlight-intake', 'LOWLIGHT INTAKE');
  const deckId = async () => ((await (await page.request.get('/api/kit')).json()) as { kit: { deck: { id: string } | null } }).kit.deck?.id;
  await page.locator('.hud-quest').click();
  await questTab(page, 'fixer');
  // Bought here, unless an earlier test on this worker's playthrough already owns it (then there's no BUY).
  await fixerItem(page, 'Cortex Meridian').click();
  await expect(page.locator('.ql-fixer .ql-file .ql-file-title')).toHaveText('CORTEX MERIDIAN');
  if ((await page.locator('.ql-fixer .ql-file .ql-buy').count()) > 0) {
    await buyAtFixer(page, 'Cortex Meridian');
    await expect.poll(deckId).toBe('meridian');
  }
  // Everyone owns a pocket deck: back to it, so the bigger one has something to replace.
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+y');
  await page.locator('.cs-page-tab[data-page="kit"]').click();
  await page.locator('.cs-deck', { hasText: 'Pocket deck' }).locator('.cs-carry').click();
  await expect.poll(deckId).toBe('pocket-deck');
  await page.keyboard.press('Escape');
  await page.locator('.hud-quest').click();
  await questTab(page, 'here');
  await questRow(page, 'Night Shift').click();
  await page.locator('.ql-file .ql-start').click();
  const deck = page.locator('.ts-hand .g-deck');
  await expect(deck.locator('.tb-group-label')).toHaveText('DECK · POCKET DECK · Q1');
  await expect(deck.locator('.tb-slot')).toHaveCount(1);
  await deck.locator('.tb-slot[data-id="slot:1"]').click();
  await page.locator('.ts-tray .tb-slot[data-id="prog-pick:solvent"]').click();
  await page.keyboard.press('Alt+y');
  await page.locator('.cs-page-tab[data-page="street"]').click();
  await expect(page.locator('.cs-dist-head')).toContainText('REP');
  await page.screenshot({ path: 'test-results/you-rep.png' });
  await page.locator('.cs-page-tab[data-page="kit"]').click();
  await page.locator('.cs-deck', { hasText: 'Cortex Meridian' }).locator('.cs-carry').click();
  await expect.poll(deckId).toBe('meridian');
  await page.keyboard.press('Escape');
  await expect(deck.locator('.tb-group-label')).toHaveText('DECK · CORTEX MERIDIAN · Q3', { timeout: 5_000 });
  await expect(deck.locator('.tb-slot')).toHaveCount(2);
  await expect(deck.locator('.tb-slot').first()).toHaveAttribute('data-id', 'prog:solvent');
  await page.screenshot({ path: 'test-results/programs-carry-at-setup.png' });
  expect(errors).toEqual([]);
});

test("ELSEWHERE: another place's board under its name, GO THERE opens that place's arrival screen", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await firstPlaythrough(page.request);
  await nixAt(page, 'lowlight-intake', 'LOWLIGHT INTAKE');
  await page.locator('.hud-quest').click();
  await questTab(page, 'away');
  // Push Test posts at Second Socket (e2e/serve.ts): listed under its place, not on HERE.
  await expect(page.locator('.ql-group', { hasText: 'SECOND SOCKET · TONIGHT' })).toBeVisible();
  await questRow(page, 'Push Test').click();
  await expect(page.locator('.ql-file .ql-file-title')).toHaveText('PUSH TEST');
  await expect(page.locator('.ql-file .ql-hint')).toContainText('AT SECOND SOCKET');
  await expect(page.locator('.ql-file .ql-start')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/quest-elsewhere.png' });
  await page.locator('.ql-file .ql-goto').click();
  await expect(page.locator('.ql-pane')).toBeHidden();
  await expect(page.locator('.ar-rule')).toHaveText('HEADING TO');
  await expect(page.locator('.ar-name')).toHaveText('SECOND SOCKET');
  // BACK: nothing moved.
  await page.keyboard.press('Escape');
  await expect(page.locator('.ar-root')).toHaveCount(0);
  await expect(page.locator('.hud-left .scene')).toHaveText('LOWLIGHT INTAKE');
  expect(errors).toEqual([]);
});
