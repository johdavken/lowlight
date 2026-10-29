import { expect, test, type Page } from '@playwright/test';
import { DIRECT, awaitGreeting, orRequests, send, skipSplash } from './fixtures';

// Cipher (spec 2026-10-28 §2.8): after six replies the fake Residual keeps a truth; a line that looks under the register
// gets a reply with the envelope and a clue for it, which LOOSE ENDS (Alt+O) shows. A rewind past it clears it; a line
// that learns it makes a solved card. In a playthrough of its own; the one it found is put back.
test.describe.configure({ mode: 'serial' });

let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  expect((await request.post('/api/playthroughs', { data: { player: 'cass', startContact: DIRECT.id } })).status()).toBe(200);
});
test.afterEach(async ({ request }) => {
  if (before) expect((await request.post(`/api/playthroughs/${before}/activate`)).status()).toBe(200);
});

const replies = (page: Page) => page.locator('#feed .msg.agent.s-ok');

/** One line and her finished reply; returns the reply's id. */
async function say(page: Page, text: string): Promise<string> {
  const n = await replies(page).count();
  await send(page, { type: 'user_message', text, mode: 'rp' });
  await expect(replies(page)).toHaveCount(n + 1, { timeout: 15_000 });
  return (await replies(page).last().getAttribute('data-id'))!;
}

const looseEnds = async (page: Page) =>
  (await (await page.request.get('/api/playthroughs/active/loose-ends')).json()) as { open: { text: string }[][]; solved: { truth: string }[] };

test('a clue on the page shows in LOOSE ENDS; a rewind takes it back; learning it solves it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  const asked = (await orRequests()).length;
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  // Her greeting and five more replies: the cipher run is due.
  let lastBefore = '';
  for (let i = 0; i < 5; i++) lastBefore = await say(page, `small talk ${i}`);
  await expect
    .poll(async () => (await orRequests()).slice(asked).some((r) => r.body.messages?.[0]?.content?.startsWith('You keep the secrets')), { timeout: 15_000 })
    .toBe(true);

  await say(page, 'look under the register');
  await expect.poll(async () => (await looseEnds(page)).open.flat().map((c) => c.text), { timeout: 15_000 }).toEqual(['a thick envelope under the register']);
  await page.keyboard.press('Alt+O');
  await expect(page.locator('.pe-tab.on')).toHaveText('LOOSE ENDS');
  await expect(page.locator('.pe-loose-line .pe-loose-text')).toHaveText('a thick envelope under the register');
  await expect(page.locator('.pe-loose-tab')).not.toContainText('The intake is a drop');
  await page.keyboard.press('Escape');
  await expect(page.locator('.people-screen')).toHaveCount(0);

  await send(page, { type: 'rewind', messageId: lastBefore });
  await expect.poll(async () => (await looseEnds(page)).open.length, { timeout: 10_000 }).toBe(0);

  await say(page, 'tell me the truth');
  await expect.poll(async () => (await looseEnds(page)).solved.map((s) => s.truth), { timeout: 15_000 }).toEqual(['The intake is a drop for the Tilt.']);
  await page.keyboard.press('Alt+O');
  await expect(page.locator('.pe-loose-solved .pe-loose-truth')).toHaveText('The intake is a drop for the Tilt.');
  expect(errors).toEqual([]);
});
