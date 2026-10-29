import { expect, test, type Page } from '@playwright/test';
import type { NixRoomTestHook } from '../web/src/main';
import type { ContactEntry, PlaythroughInfo } from '../shared/types';
import { DIRECT, activeId, awaitGreeting, dialIn, pickTitle, send, skipSplash, toTitle, skipIntro } from './fixtures';

// Rooms here skip the district load screen (arrival.spec covers it).
test.beforeEach(async ({ page }) => {
  await skipIntro(page);
});

declare global {
  interface Window {
    __nixRoom?: NixRoomTestHook;
  }
}

const START = 'karasu/lowlight-intake';
const ROOF = 'karasu/ribbon-rooftop';

/** Her room as the active playthrough's databases have it. */
async function herScene(page: Page): Promise<string | undefined> {
  const list = (await (await page.request.get('/api/playthroughs/active/contacts')).json()) as ContactEntry[];
  return list.find((c) => c.id === DIRECT.id)?.sceneId;
}

/** Says `text` and waits for her reply; returns the reply's id. */
async function say(page: Page, text: string): Promise<string> {
  const before = await page.locator('.msg.agent.s-ok').count();
  await send(page, { type: 'user_message', text });
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
  return (await page.locator('.msg.agent.s-ok').last().getAttribute('data-id'))!;
}

/** Her journal, as Alt+J shows it on PEOPLE's JOURNAL tab (then closed again). */
async function journal(page: Page): Promise<string[]> {
  await page.locator('textarea').first().focus();
  await page.keyboard.press('Alt+j');
  await expect(page.locator('.people-screen .pe-tab.on')).toHaveText('JOURNAL');
  const notes = await page.locator('.people-screen .journal-row .jr-text').allTextContents();
  await page.keyboard.press('Escape');
  await expect(page.locator('.people-screen')).toHaveCount(0);
  return notes;
}

/** Three replies: a plain one, one that notes the mug, one that takes them to the roof. Returns the first's id. */
async function threeReplies(page: Page): Promise<string> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  expect((await page.request.post(`/api/agents/${DIRECT.id}/model`, { data: { model: null } })).status()).toBe(204);
  await skipSplash(page);
  await dialIn(page, DIRECT.id);
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  await awaitGreeting(page);
  const first = await say(page, 'hello');
  await say(page, 'remember the blue mug');
  await say(page, 'take me up to the roof');
  await expect.poll(() => herScene(page)).toBe(ROOF);
  expect(await journal(page)).toContain('the blue mug is yours now');
  return first;
}

/** Opens the archive and clicks `label` on line `id` (accepting its confirm). */
async function archiveControl(page: Page, id: string, label: string): Promise<void> {
  page.once('dialog', (d) => void d.accept());
  await page.locator('textarea').first().focus();
  await page.keyboard.press('PageUp');
  const line = page.locator(`.msg[data-id="${id}"]`);
  await line.hover();
  await line.locator('.controls button', { hasText: label }).click();
}

// The whole run shares one server, and later specs open Nix's room in whatever playthrough is
// active: branching and loading switch it, so each test here puts the one it found back.
let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
});
test.afterEach(async ({ request }) => {
  if (before) expect((await request.post(`/api/playthroughs/${before}/activate`)).status()).toBe(200);
});

test('branch from an early line', async ({ page }) => {
  const first = await threeReplies(page);
  const original = await activeId(page);

  await archiveControl(page, first, 'BRANCH HERE');
  await expect(page.locator('.feed-notice')).toContainText('// BRANCHED — ', { timeout: 10_000 });
  await page.waitForFunction(() => window.__nixRoom !== undefined);
  const branch = await activeId(page);
  expect(branch).not.toBe(original);

  // The story as it was just after her first reply: no note, the room she started in.
  await expect(page.locator('.msg.agent.s-ok').last()).toHaveAttribute('data-id', first);
  expect(await journal(page)).not.toContain('the blue mug is yours now');
  expect(await herScene(page)).toBe(START);

  // LOAD lists both: the branch says where it came from, and the original is still there.
  const pts = ((await (await page.request.get('/api/playthroughs')).json()) as { playthroughs: PlaythroughInfo[] }).playthroughs;
  expect(pts.map((p) => p.id)).toEqual(expect.arrayContaining([original, branch]));
  expect(pts.find((p) => p.id === branch)!.forkedFrom).toMatchObject({ playthrough: original, message: { contactId: DIRECT.id, messageId: first } });
  await toTitle(page);
  await pickTitle(page, 'load');
  // The branch is the newest, so selected: its file says where it came from.
  await expect(page.locator(`.load-screen .pt[data-id="${branch}"]`)).toBeVisible();
  await expect(page.locator(`.load-screen .pt[data-id="${original}"]`)).toBeVisible();
  await expect(page.locator('.load-screen .fighter.p1 .fighter-file > p')).toContainText('branched from');
});
