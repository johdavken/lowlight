import { expect, test, type Page } from '@playwright/test';
import { DIRECT, awaitGreeting, send, skipSplash } from './fixtures';

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
const crew = async (page: Page) => ((await (await page.request.get('/api/crew')).json()) as { crew: { roster: { recruit: { id: string; name: string }; state: string; log: unknown[] }[]; sol: number; results: { line: string }[] } }).crew;

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

test('a case gives CASED +10 on that night’s job', async ({ page }) => {
  const { greetingId, errors } = await room(page);
  await wait(page, { until: '20:00' });
  await newRow(page);
  await hireOne(page);
  await page.locator('.cr-tab[data-tab="assign"]').click();
  await page.locator('.cr-errand', { hasText: 'Back Door' }).click();
  await page.locator('.cr-send').click();
  await wait(page, { minutes: 150 });
  await expect(page.locator('.cr-back')).toContainText('cased it', { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await page.locator('.hud-quest').click();
  const row = page.locator('.ql-row', { hasText: 'Back Door' });
  await expect(row.locator('.ql-cased')).toHaveText('CASED');
  await row.locator('.ql-start').click();
  await expect(page.locator('.qc-card').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.qc-card .qc-why').first()).toContainText('CASED +10');
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
