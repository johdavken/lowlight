import { expect, test } from '@playwright/test';
import type { ContactEntry } from '../shared/types';
import { DIRECT, E2E_MOVES_PLAYER, awaitGreeting, chatsOf, send, skipSplash } from './fixtures';

// Off-screen moves (spec 2026-11-18): alone past 22:00, the beat's (fake) answer sends Nix somewhere else; walking back
// in on her, her turn carries what she did. In a playthrough of its own; the one it found is put back.
test.describe.configure({ mode: 'serial' });

let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  const made = await request.post('/api/playthroughs', { data: { player: 'cass', startContact: DIRECT.id, persona: { name: E2E_MOVES_PLAYER, background: '' } } });
  expect(made.status()).toBe(200);
});
test.afterEach(async ({ request }) => {
  if (before) expect((await request.post(`/api/playthroughs/${before}/activate`)).status()).toBe(200);
});

test('a beat moves her while you are away, and she has it when you walk back in', async ({ page, request }) => {
  const where = async () => ((await (await request.get('/api/playthroughs/active/contacts')).json()) as ContactEntry[]).find((c) => c.id === DIRECT.id)?.sceneId;
  expect((await request.post('/api/playthroughs/active/solo')).status()).toBe(200);
  const from = await where();
  expect((await request.post('/api/playthroughs/active/wait', { data: { until: '22:10' } })).status()).toBe(200);
  await expect.poll(where, { timeout: 5_000 }).not.toBe(from);
  expect((await request.post('/api/playthroughs/active/location', { data: { contactId: DIRECT.id } })).status()).toBe(200);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto(`/room/${DIRECT.id}`);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  await send(page, { type: 'user_message', text: 'Where were you?', mode: 'rp' });
  await expect
    .poll(async () => (await chatsOf(DIRECT)).some((m) => m.some((x) => x.content.includes('[since you last saw') && x.content.includes('Walked out on a bad deal.'))), { timeout: 15_000 })
    .toBe(true);
});
