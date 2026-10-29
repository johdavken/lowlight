import { expect, test, type Page } from '@playwright/test';
import type { ContactEntry } from '../shared/types';
import { DIRECT, nixAt, send, skipSplash } from './fixtures';

/** Her room as the active playthrough's databases have it. */
async function herScene(page: Page): Promise<string | undefined> {
  const list = (await (await page.request.get('/api/playthroughs/active/contacts')).json()) as ContactEntry[];
  return list.find((c) => c.id === DIRECT.id)?.sceneId;
}

test('room exits: she takes you through the intake\'s way out, and the map shows you at the intake', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  expect((await page.request.post(`/api/agents/${DIRECT.id}/model`, { data: { model: null } })).status()).toBe(204);
  await skipSplash(page);
  // The active playthrough (a NEW GAME here would switch it under the specs after this one), with her at the intake:
  // a spec before this one in the worker may have walked her elsewhere.
  await nixAt(page, 'lowlight-intake', 'LOWLIGHT INTAKE');
  const before = await page.locator('.msg.agent.s-ok').count();
  await send(page, { type: 'user_message', text: 'take me out the back' });
  await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 10_000 });
  await expect.poll(() => herScene(page)).toBe('karasu/zz-side-room');

  // The side room has no pin: you stand at the intake.
  await page.locator('.hud-map').click();
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('.pin[data-place="lowlight-intake"] .dots b').first()).toBeVisible();
  // From the side room, GO to the intake is open: you stand there, but you aren't in its room.
  await page.keyboard.press('Escape');

  // Back to the intake: specs that run after this one open the active playthrough and expect her there.
  await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'karasu/lowlight-intake' } });
  await expect.poll(() => herScene(page)).toBe('karasu/lowlight-intake');
});
