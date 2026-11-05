import { expect, test, type Page } from '@playwright/test';
import { awaitGreeting, DIRECT, send, skipSplash } from './fixtures';

// Contracts (spec 2026-11-04): The Test Contract at the Intake (e2e/serve.ts), in a playthrough of its own as Cass, whose
// Trusted rep offers it (NIX_TEST_REP). The playthrough it found is put back.
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

test("RUMORS: a lead's contract short of rep shows the rep it needs and no way to go", async ({ page }) => {
  // The server's half is in jobs.test.ts; here only the row, so the rumor it sends is marked short of rep.
  await page.routeWebSocket(/\/ws|\/socket|\/api/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => {
      if (typeof m !== 'string' || !m.includes('"quest_state"')) return ws.send(m);
      const e = JSON.parse(m) as { state: { rumors?: { needs?: number }[] } };
      for (const r of e.state.rumors ?? []) r.needs = 45;
      ws.send(JSON.stringify(e));
    });
  });
  await skipSplash(page);
  await enter(page);
  await page.keyboard.press('Alt+KeyQ');
  await page.locator('.ql-tab[data-tab="rumors"]').click();
  await expect(page.locator('.ql-file .ql-locked-note')).toHaveText('NEEDS REP 45');
  await expect(page.locator('.ql-file .ql-goto')).toHaveCount(0);
  await expect(page.locator('.ql-row .ql-line').first()).toContainText('REP 45');
  // No art above it, so nothing to tuck under: the line stays inside the file.
  const inFile = await page.locator('.ql-file .ql-pitch').evaluate((e) => e.getBoundingClientRect().top >= e.closest('.ql-file')!.getBoundingClientRect().top);
  expect(inFile).toBe(true);
  await page.screenshot({ path: 'test-results/contract-rumor-needs.png' });
});

test('SETUP and the table: a guest is a foil card, with her bust and GUEST', async ({ page }) => {
  // The server's half is in jobs.test.ts; here only the card, so the guest rides on the state a mission sends.
  const guest = { id: 'guest-ember', name: 'Ember Zhou', spec: 'runner', grade: 3, toNext: 0, face: null, traits: [], guest: true, art: '/contacts/ember.webp' };
  await page.routeWebSocket(/\/ws|\/socket|\/api/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => {
      if (typeof m !== 'string' || !m.includes('"quest_state"')) return ws.send(m);
      const e = JSON.parse(m) as { state: { open: { setup?: { crew: unknown[] } }[]; active?: { hand?: { people: unknown[] } } | null } };
      for (const q of e.state.open) q.setup?.crew.push({ ...guest, abilities: ['CLEAN EXIT', 'LOOKOUT'] });
      e.state.active?.hand?.people.push({ ...guest, free: 1, risk: null, down: false, abilities: [] });
      ws.send(JSON.stringify(e));
    });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await enter(page);
  if ((await scene(page).textContent()) !== 'LOWLIGHT INTAKE') {
    await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
    await expect(scene(page)).toHaveText('LOWLIGHT INTAKE', { timeout: 10_000 });
    await enter(page);
  }
  await page.locator('.hud-quest').click();
  // The board is drawn by the playthrough's seed, so whichever job it posted tonight.
  await page.locator('.ql-row.ql-job').first().click();
  await page.locator('.ql-file .ql-start').click();
  const foil = page.locator('.tb-setup .tb-foil');
  await expect(foil).toHaveCount(1);
  await expect(foil.locator('.tbc-note').first()).toHaveText('GUEST');
  await expect(foil.locator('.tbc-name')).toHaveText('EMBER');
  await expect(foil.locator('img.tbc-face')).toHaveAttribute('src', '/contacts/ember.webp');
  await page.screenshot({ path: 'test-results/guest-foil-setup.png' });
  await page.locator('.ts-go').click();
  await expect(page.locator('.tb-hand .tb-foil')).toHaveCount(1, { timeout: 15_000 });
  // The hand is dealt face down first: let it land.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/guest-foil-table.png' });
  // The sheen moves: the same picture a moment apart differs.
  const pic = page.locator('.tb-hand .tb-foil .tbc-pic');
  const first = await pic.screenshot({ path: 'test-results/guest-foil-a.png' });
  await page.waitForTimeout(2000);
  expect((await pic.screenshot({ path: 'test-results/guest-foil-b.png' })).equals(first)).toBe(false);
});

test('a beat with a song takes the music over the table, and hands it back', async ({ page }) => {
  const songs = ((await (await page.request.get('/api/songs')).json()) as { songs: { title: string; url: string }[] }).songs;
  const song = songs.find((s) => !s.url.includes('Nix')) ?? songs[0];
  let sing: string | undefined = song.title;
  let last: { state: { active?: { song?: string } | null } } | null = null;
  let toPage: (m: string) => void = () => {};
  await page.routeWebSocket(/\/ws|\/socket|\/api/, (ws) => {
    const server = ws.connectToServer();
    toPage = (m) => ws.send(m);
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => {
      if (typeof m !== 'string' || !m.includes('"quest_state"')) return ws.send(m);
      last = JSON.parse(m) as NonNullable<typeof last>;
      if (last.state.active && sing) last.state.active.song = sing;
      ws.send(JSON.stringify(last));
    });
  });
  await skipSplash(page);
  await enter(page);
  if ((await scene(page).textContent()) !== 'LOWLIGHT INTAKE') {
    await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
    await expect(scene(page)).toHaveText('LOWLIGHT INTAKE', { timeout: 10_000 });
    await enter(page);
  }
  await page.locator('.hud-quest').click();
  await page.locator('.ql-row.ql-job').first().click();
  await page.locator('.ql-file .ql-start').click();
  await page.locator('.ts-go').click();
  const url = () => page.evaluate(() => window.__nixRoom!.audio().musicUrl);
  await expect.poll(url, { timeout: 15_000 }).toBe(song.url);
  sing = undefined;
  delete last!.state.active!.song;
  toPage(JSON.stringify(last));
  await expect.poll(url, { timeout: 15_000 }).not.toBe(song.url);
});

test('a beat in another room: the room, the contact on the line in CRT, a guest in the figure slot, and back', async ({ page }) => {
  let room: string | undefined = 'nexus/spectra-archive';
  let last: { state: { active?: { room?: string; roomGuest?: string } | null } } | null = null;
  let toPage: (m: string) => void = () => {};
  await page.routeWebSocket(/\/ws|\/socket|\/api/, (ws) => {
    const server = ws.connectToServer();
    toPage = (m) => ws.send(m);
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => {
      if (typeof m !== 'string' || !m.includes('"quest_state"')) return ws.send(m);
      last = JSON.parse(m) as NonNullable<typeof last>;
      if (last.state.active && room) Object.assign(last.state.active, { room, roomGuest: 'ember' });
      ws.send(JSON.stringify(last));
    });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await enter(page);
  if ((await scene(page).textContent()) !== 'LOWLIGHT INTAKE') {
    await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
    await expect(scene(page)).toHaveText('LOWLIGHT INTAKE', { timeout: 10_000 });
    await enter(page);
  }
  await page.locator('.hud-quest').click();
  await page.locator('.ql-row.ql-job').first().click();
  await page.locator('.ql-file .ql-start').click();
  await page.locator('.ts-go').click();
  await expect(page.locator('.feed-root.on-line')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator('.ci')).toHaveCount(0);
  await expect(page.locator('#whos-here .wh-role', { hasText: 'ON COMMS' })).toHaveCount(1);
  await expect(scene(page)).toHaveText('SPECTRA ARCHIVE');
  await expect.poll(() => page.evaluate(() => window.__nixRoom!.viewScene?.())).toBe('nexus/spectra-archive');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/beat-room.png' });
  room = undefined;
  delete last!.state.active!.room;
  delete last!.state.active!.roomGuest;
  toPage(JSON.stringify(last));
  await expect(page.locator('.feed-root.on-line')).toHaveCount(0, { timeout: 15_000 });
  await expect(scene(page)).toHaveText('LOWLIGHT INTAKE');
  await expect.poll(() => page.evaluate(() => window.__nixRoom!.viewScene?.())).not.toBe('nexus/spectra-archive');
});

test('a full hand in another room: three crew and a Q3 deck, and no inset to clear', async ({ page }) => {
  const person = (id: string, name: string) => ({ id, name, spec: 'runner', grade: 2, toNext: 2, face: null, traits: [], free: 1, risk: null, down: false, abilities: [] });
  await page.routeWebSocket(/\/ws|\/socket|\/api/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => {
      if (typeof m !== 'string' || !m.includes('"quest_state"')) return ws.send(m);
      const e = JSON.parse(m) as { state: { active?: { room?: string; onLine?: string[]; hand?: { people: unknown[]; pockets?: unknown } } | null } };
      if (e.state.active?.hand) {
        e.state.active.room = 'nexus/spectra-archive';
        e.state.active.onLine = ['One guard, one camera, one door.'];
        e.state.active.hand.people = [person('a', 'Ada Vance'), person('b', 'Ben Vance'), person('c', 'Cy Vance')];
        e.state.active.hand.pockets = { deck: { name: 'Deaf Meridian', quality: 3, slots: 3 }, slots: 3, loaded: [], catalog: [], dead: false };
      }
      ws.send(JSON.stringify(e));
    });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await enter(page);
  if ((await scene(page).textContent()) !== 'LOWLIGHT INTAKE') {
    await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
    await expect(scene(page)).toHaveText('LOWLIGHT INTAKE', { timeout: 10_000 });
    await enter(page);
  }
  await page.locator('.hud-quest').click();
  await page.locator('.ql-row.ql-job').first().click();
  await page.locator('.ql-file .ql-start').click();
  await page.locator('.ts-go').click();
  await expect(page.locator('.feed-root.on-line')).toHaveCount(1, { timeout: 15_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/full-hand.png' });
  await expect(page.locator('.ci')).toHaveCount(0);
  await expect(page.locator('.jc-line')).toHaveText('One guard, one camera, one door.');
});

test('RUMORS: the rumor, START, the offer, then its pieces wait on ELSEWHERE', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await enter(page);
  if ((await scene(page).textContent()) !== 'LOWLIGHT INTAKE') {
    await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
    await expect(scene(page)).toHaveText('LOWLIGHT INTAKE', { timeout: 10_000 });
    await enter(page);
  }
  await page.keyboard.press('Alt+KeyQ');
  await page.locator('.ql-tab[data-tab="rumors"]').click();
  await expect(page.locator('.ql-file .ql-pitch')).toHaveText('Mother Rot has been asking after you.');
  await page.screenshot({ path: 'test-results/contract-rumor.png' });
  await page.locator('.ql-file .ql-goto').click();
  const take = page.locator('.qc-card[data-choice="take"], .tb-card[data-choice="take"]').first();
  await expect(take).toBeVisible({ timeout: 10_000 });
  await take.click();
  await expect(page.locator('.qc-card:visible, .tb-card:visible')).toHaveCount(0, { timeout: 15_000 });
  await page.keyboard.press('Alt+KeyQ');
  await page.locator('.ql-tab[data-tab="away"]').click();
  await expect(page.locator('.ql-piece')).toHaveCount(3);
  // Its art stays with it once it's under way, not only while HERE lists it.
  await expect(page.locator('.ql-file .ql-art')).not.toHaveClass(/ql-noart/);
  await page.screenshot({ path: 'test-results/contract-waiting.png' });
  await page.keyboard.press('Escape');
  // CREW → ERRANDS: all three pieces with their lines; sending one leaves the others listed.
  await page.keyboard.press('Alt+KeyK');
  await page.locator('.cr-tab[data-tab="hire"]').click();
  await page.locator('.cr-card:not(.locked)').first().locator('.cr-btn', { hasText: 'HIRE' }).click();
  await page.locator('.cr-tab[data-tab="assign"]').click();
  await expect(page.locator('.cr-grp.hot')).toHaveText('THE TEST CONTRACT · 3 NIGHTS LEFT');
  await expect(page.locator('.cr-errand', { hasText: 'The boat' })).toContainText('MUSCLE');
  await expect(page.locator('.cr-brief h2')).toHaveText('THE BOAT');
  await expect(page.locator('.cr-blurb')).toContainText('Her skiff');
  await expect(page.locator('.cr-meta')).toContainText('SUITS MUSCLE');
  await page.locator('.cr-send').click();
  await expect(page.locator('.cr-errand', { hasText: 'The boat' })).toContainText('OUT ·');
  await expect(page.locator('.cr-errand', { hasText: 'The roof' })).toContainText('WAITS · ONE A NIGHT');
  await expect(page.locator('.cr-recall')).toBeVisible();
  expect(errors).toEqual([]);
});
