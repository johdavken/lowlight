import { expect, test } from '@playwright/test';
import { awaitGreeting, DIRECT, goIn, skipSplash, startQuest } from './fixtures';

// The deduction board (spec 2026-11-09): earn cards, file a clash, name, file, accuse, land on the verdict's outcome.
// A Rue playthrough of its own: the fixture job is for: rue, so no other spec meets it.
let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  expect((await request.post('/api/playthroughs', { data: { player: 'rue', startContact: DIRECT.id } })).status()).toBe(200);
});
test.afterEach(async ({ request }) => {
  if (before) await expect.poll(async () => (await request.post(`/api/playthroughs/${before}/activate`)).status(), { timeout: 15_000 }).toBe(200);
});

test('the board: earn cards, file a clash, name, file, accuse, land on the outcome', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=rue`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Board Test');
  await goIn(page);
  await page.locator('.tb-card[data-choice="look"]').click();

  // The board: three cards held, two missing face down.
  const board = page.locator('.tb-dboard');
  await expect(board).toBeVisible({ timeout: 15_000 });
  await expect(board.locator('.dd-hand .dd-card')).toHaveCount(3);
  await expect(page.locator('.dd-dcol .dd-missing')).toContainText('The roll on the kit failed.');

  // A clash files a deduction.
  await board.locator('.dd-fs[data-id="STOOD"]').click();
  await board.locator('.dd-fs[data-id="CLAIM"]').click();
  // Each pinned card has its leader to its slot.
  await expect(page.locator('#game > .tb svg[data-lead^="dd-pin-"] path')).toHaveCount(2);
  await board.locator('.dd-press').click();
  // It counts it out first (playtest 2026-11-11): 3, 2, 1 over AGAINST with the pair still pinned, then the result.
  await expect(board.locator('.dd-count')).toBeVisible();
  await expect(board.locator('.dd-slot .dd-card')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/deduction-count.png' });
  await expect(board.locator('.dd-count')).toBeHidden({ timeout: 3_000 });
  await expect(page.locator('.dd-ded[data-id="SEEN"]')).toBeVisible();
  await expect(board.locator('.dd-verdict')).toHaveText('Rook lied about being home.');
  await page.screenshot({ path: 'test-results/deduction-verdict.png' });

  // Name, file into WHO; ACCUSE stays shut with two blanks empty.
  await board.locator('.dd-sus .dd-pick', { hasText: 'ROOK' }).click();
  await expect(board.locator('.dd-suspect.on')).toContainText('ROOK');
  await page.locator('.dd-ded[data-id="SEEN"]').click();
  await board.locator('.dd-blank[data-b="WHO"] .dd-bslot').click();
  await expect(board.locator('.dd-blank[data-b="WHO"] .dd-bslot')).toContainText('SEEN');
  await expect(board.locator('.dd-accuse')).toBeDisabled();

  // A near miss uses up the one box of patience, and ACCUSE opens.
  await board.locator('.dd-fs[data-id="RAIN"]').click();
  await board.locator('.dd-fs[data-id="CLAIM"]').click();
  // Her bark for the last box of patience goes out on the voice channel (The Fourteenth voice script).
  const bark = page.waitForResponse((r) => r.url().includes('/api/cases/voice/e2e-case/gone-a.ogg') && r.status() === 200);
  await board.locator('.dd-press').click();
  await bark;
  await expect(board.locator('.dd-verdict')).toHaveText('Rain keeps nobody home.');
  await expect(board.locator('.dd-accuse')).toBeEnabled();

  // ACCUSE: one blank right is thin, and the job plays on to its ending.
  await board.locator('.dd-accuse').click();
  await expect(page.locator('#feed')).toContainText('BOARD-THIN', { timeout: 15_000 });
  // The board gone, nothing of it stays in the JOB column's region or on the table (review 2026-11-15).
  await expect(board).toBeHidden();
  await expect(page.locator('.dd-dcol')).toBeHidden();
  expect(await page.locator('#game > .tb svg[data-lead^="dd-"] path').count()).toBe(0);
  expect(errors).toEqual([]);
});

// Playtest 2026-11-10: with a full hand and three long deductions filed, the named suspect's card grew until ACCUSE sat
// under the fan. The board here is dressed as The Fourteenth's is at that point, and ACCUSE has to take a click.
test('ACCUSE stays clear of the fan with a full hand and three long deductions filed', async ({ page }) => {
  const LONG = (w: string) => `${w}: a bad edit shakes you for a day before it kills, and he had steady hands an hour before he died, so it was not an edit.`;
  await page.routeWebSocket(/\/ws/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => {
      if (typeof m !== 'string' || !m.includes('"quest_state"')) return ws.send(m);
      const e = JSON.parse(m) as { state: { active?: { board?: Record<string, unknown> & { hand: { id: string; kind: string; source: string; line: string }[] } } | null } };
      const b = e.state.active?.board;
      if (b) {
        const base = b.hand[0];
        b.hand = Array.from({ length: 14 }, (_, i) => ({ ...base, id: `C${i}`, source: `SOURCE ${i}`, line: LONG('Card') }));
        b.filed = ['SEEN', 'TOOL', 'DEBT'].map((id, i) => ({ id, blank: ['WHO', 'HOW', 'WHY'][i], text: LONG(id) }));
        b.blanks = { WHO: 'SEEN', HOW: 'TOOL', WHY: 'DEBT' };
        // Three suspects, as The Fourteenth has: the named one's panel at its narrowest.
        const sus = b.suspects as { name: string; face: string; role: string; slug: string }[];
        if (sus.length < 3) sus.push({ ...sus[1], name: 'SILAS', slug: 'silas' });
        b.suspect = 'ROOK';
        b.accuseOpen = true;
        // Several cards not in your hand (one standing for two), at the foot of the deductions column.
        b.missing = [
          { source: 'THE KIT', missed: 'The roll on the kit failed.' },
          { source: 'THE CAMERA', missed: 'You walked in loud; the tape was wiped.', n: 2 },
          { source: "ROOK'S PHONE", missed: 'Nobody asked Silas for it.' },
          { source: 'THE LEDGER', missed: 'The crack locked out.' },
        ];
      }
      ws.send(JSON.stringify(e));
    });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}?as=rue`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Board Test');
  await goIn(page);
  await page.locator('.tb-card[data-choice="look"]').click();
  const board = page.locator('.tb-dboard');
  await expect(board.locator('.dd-hand .dd-card')).toHaveCount(14);
  await expect(board.locator('.dd-suspect.on .dd-bslot.full')).toHaveCount(3);
  // A trial click checks the button would take the click: nothing laid over it.
  await board.locator('.dd-accuse').click({ trial: true, timeout: 5_000 });
  // Each blank's label (WHO's is the longest) stays inside the named suspect's blanks (playtest 2026-11-12: it ran past the edge).
  const over = await board.locator('.dd-blanks').evaluate((p) => {
    const edge = p.getBoundingClientRect().right;
    return [...p.querySelectorAll('.dd-q')].filter((q) => q.getBoundingClientRect().right > edge + 0.5 || q.scrollWidth > q.clientWidth + 1).map((q) => q.textContent);
  });
  expect(over).toEqual([]);
  // On the trace (mockup boards-trace.html, 2026-11-15): the suspects in one row with no frames, ACCUSE under the named
  // one's face, the blanks on a rail under the row, and a leader from each filed deduction to its blank that never
  // crosses a face.
  const geo = await page.evaluate(() => {
    const on = document.querySelector('.dd-pcol')!;
    const img = on.querySelector('.dd-pick img')!.getBoundingClientRect();
    const acc = on.querySelector('.dd-accuse')!.getBoundingClientRect();
    const faces = [...document.querySelectorAll('.dd-pick img')].map((o) => o.getBoundingClientRect());
    const blanks = document.querySelector('.dd-blanks')!.getBoundingClientRect();
    const leads = [...document.querySelectorAll<SVGSVGElement>('#game > .tb svg[data-lead^="dd-file-"]')].filter((l) => l.querySelector('path'));
    // Each leader's corners, on the screen: a segment between two of them must stay off every face.
    const segs = leads.flatMap((l) => {
      const path = l.querySelector('path')!;
      const m = path.getScreenCTM()!;
      const pts = [...path.getAttribute('d')!.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((g) => new DOMPoint(Number(g[1]), Number(g[2])).matrixTransform(m));
      return pts.slice(1).map((q, i) => ({ l: Math.min(pts[i].x, q.x), r: Math.max(pts[i].x, q.x), t: Math.min(pts[i].y, q.y), b: Math.max(pts[i].y, q.y) }));
    });
    const crosses = faces.some((f) => segs.some((g) => g.l < f.right && g.r > f.left && g.t < f.bottom && g.b > f.top));
    const rows = [...document.querySelectorAll('.dd-suspect:not(.on), .dd-pcol')].map((o) => o.getBoundingClientRect().top);
    return { accBelow: acc.top >= img.bottom - 1, leads: leads.length, crosses, oneRow: Math.max(...rows) - Math.min(...rows) < 2, blanksBelow: blanks.top >= acc.bottom - 1, frames: [...document.querySelectorAll('.dd-suspect:not(.on)')].map((o) => getComputedStyle(o).borderTopWidth) };
  });
  expect(geo.accBelow).toBe(true);
  expect(geo.leads).toBe(3);
  expect(geo.crosses).toBe(false);
  expect(geo.oneRow).toBe(true);
  expect(geo.blanksBelow).toBe(true);
  expect(geo.frames.every((w) => w === '0px')).toBe(true);
  // PATIENCE over her chest (playtest 2026-11-12): centred on the figure on the right, above its waist line (0.383).
  const pat = await page.evaluate(() => {
    const f = document.querySelector('.stage-figure.stage-right')!.getBoundingClientRect();
    const c = document.querySelector('.dd-patience')!.getBoundingClientRect();
    return { onFig: document.querySelector('.dd-patience')!.classList.contains('on-fig'), dx: Math.abs(c.left + c.width / 2 - (f.left + f.width / 2)), at: (c.top + c.height / 2 - f.top) / f.height };
  });
  expect(pat.onFig).toBe(true);
  expect(pat.dx).toBeLessThan(2);
  expect(pat.at).toBeGreaterThan(0.2);
  expect(pat.at).toBeLessThan(0.383);
  // A hand card lifted under ACCUSE rides over it (playtest 2026-11-12: the key showed through the card).
  const acc = (await board.locator('.dd-suspect.on .dd-accuse').boundingBox())!;
  const ax = acc.x + acc.width / 2;
  const ay = acc.y + acc.height / 2;
  const under = board.locator('.dd-hand .dd-fs').filter({ has: page.locator('.dd-card') });
  const slots = await under.evaluateAll((els, x) => els.map((e) => { const r = e.getBoundingClientRect(); return r.left <= x && x < r.right; }), ax);
  const i = slots.lastIndexOf(true);
  expect(i).toBeGreaterThanOrEqual(0);
  await under.nth(i).hover();
  await page.waitForTimeout(200);
  // Where the lifted card and ACCUSE overlap (the cards rise 24px since they lost their pictures, 2026-11-12), the card
  // is on top; and nowhere does ACCUSE show through it.
  const hit = await page.evaluate(([x, top]) => {
    const card = [...document.querySelectorAll('.dd-fs:hover > .dd-card')][0]?.getBoundingClientRect();
    const a = document.querySelector('.dd-suspect.on .dd-accuse')!.getBoundingClientRect();
    if (!card) return 'no lift';
    const y0 = Math.max(card.top, a.top), y1 = Math.min(card.bottom, a.bottom);
    if (y1 <= y0) return 'clear';
    return document.elementFromPoint(x, (y0 + y1) / 2)?.closest('.dd-hand') ? 'over' : 'under';
  }, [ax, ay]);
  expect(['over', 'clear']).toContain(hit);
  await page.mouse.move(0, 0);
  // The deductions column, NOT IN YOUR HAND at its foot, keeps above the fan and scrolls rather than run under it.
  const col = (await page.locator('.dd-dcol').boundingBox())!;
  const fan = (await board.locator('.dd-hand').boundingBox())!;
  expect(col.y + col.height).toBeLessThanOrEqual(fan.y + 2);
  // The room HUD's board (playtest 2026-11-11): AGAINST centred under the keys bar's drop, clear of the JOB column; the
  // hand flat along the bottom from the column's left edge, every card on the stage left of her; no clocks.
  await page.screenshot({ path: 'test-results/deduction-board.png' });
  // NOT IN YOUR HAND at the column's foot, several cards (one standing for two): scrolled to, all of it shows.
  await page.locator('.dd-dcol').evaluate((n) => (n.scrollTop = n.scrollHeight));
  await expect(page.locator('.dd-missing .dd-mc')).toHaveCount(4);
  await expect(page.locator('.dd-missing .dd-mc').nth(1)).toContainText('THE CAMERA · 2 CARDS');
  await page.screenshot({ path: 'test-results/deduction-missing.png' });
  await page.locator('.dd-dcol').evaluate((n) => (n.scrollTop = 0));
  const m = await page.evaluate(() => {
    const g = document.querySelector<HTMLElement>('#game')!;
    const gr = g.getBoundingClientRect();
    const k = gr.width / 1600;
    const x = (e: Element) => {
      const b = e.getBoundingClientRect();
      return { l: (b.left - gr.left) / k, r: (b.right - gr.left) / k };
    };
    const against = x(document.querySelector('.dd-against')!);
    const cards = [...document.querySelectorAll('.dd-hand .dd-card')].map((c) => ({ ...x(c), t: getComputedStyle(c).transform }));
    // The drop as the bar draws it: its trace's second and fifth points, on the stage (review: not the CSS var alone).
    const poly = [...document.querySelectorAll<SVGPolylineElement>('polyline.kt')].find((p) => p.points.length === 6)!;
    const onStage = (i: number) => {
      const pt = poly.points.getItem(i).matrixTransform(poly.getScreenCTM()!);
      return (pt.x - gr.left) / k;
    };
    return {
      mid: (onStage(1) + onStage(4)) / 2,
      against,
      jc: x(document.querySelector('.jc')!),
      cards,
      clocks: getComputedStyle(document.querySelector('.tb-dboard')!.closest('.tb')!.querySelector('.tb-right')!).visibility,
    };
  });
  // On the trace AGAINST fills the board's column from its left edge (it no longer centres on the bar's drop).
  expect(m.mid).toBeGreaterThan(0);
  expect(m.against.l).toBeGreaterThanOrEqual(m.jc.r);
  expect(Math.abs(m.cards[0].l - m.jc.l)).toBeLessThanOrEqual(6);
  for (const c of m.cards) {
    expect(c.t).toBe('none');
    expect(c.r).toBeLessThanOrEqual(1265);
  }
  expect(m.clocks).toBe('hidden');
  // The first card lifted to read paints over the JOB column (the table rises above the column's layer while a card is
  // lifted; the card takes no pointer itself, so this reads the stacking), whole on the stage (review).
  await board.locator('.dd-fs').first().hover();
  await page.waitForTimeout(250);
  const lifted = await page.evaluate(() => {
    const c = document.querySelector('.dd-fs:hover > .dd-card')!.getBoundingClientRect();
    const g = document.querySelector('#game')!.getBoundingClientRect();
    const z = (sel: string) => Number(getComputedStyle(document.querySelector(sel)!).zIndex);
    return { above: z('#game > .tb.tb-deduction') > z('#game > .jc-layer'), left: c.left - g.left };
  });
  await page.screenshot({ path: 'test-results/deduction-lift.png' });
  expect(lifted.above).toBe(true);
  expect(lifted.left).toBeGreaterThanOrEqual(0);
});
