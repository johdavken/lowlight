import { _electron, expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFakeOpenRouter } from '../e2e/fake-openrouter';
import { DIRECT, GOOD_KEY, awaitGreeting, lockPlayer, newGame, phase, send, showTile } from '../e2e/fixtures';

/**
 * The packaged Linux app, end to end, against the e2e fake OpenRouter and a fresh save folder:
 * splash → select → link a key → one turn; the version label; no dev panel; the files it leaves.
 */
const repo = fileURLToPath(new URL('..', import.meta.url));
const version = (JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')) as { version: string }).version;
const executable = process.env.LOWLIGHT_EXECUTABLE ?? path.join(repo, 'release', version, 'linux-unpacked', 'lowlight');

test('the packaged app links a key and gets a reply, with its version on the title and no dev panel', async () => {
  expect(fs.existsSync(executable), `${executable} exists (npm run package:linux first)`).toBe(true);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'Lowlight smoke ö-'));
  const fakeUrl = await startFakeOpenRouter({ logPort: null });
  const app = await _electron.launch({
    executablePath: executable,
    env: { ...process.env, LOWLIGHT_TEST: '1', LOWLIGHT_USER_DATA: userData, OPENROUTER_BASE_URL: fakeUrl },
  });
  try {
    const page = await app.firstWindow();
    // A browser that has seen the splash, as the e2e suite starts. The arrival screen stays on: the
    // room below steps past it, so it's checked in the packaged app too.
    await app.context().addInitScript(() => {
      sessionStorage.setItem('lowlight.splashSeen', '1');
    });
    // A navigation, not a reload: a reload brings the splash back whatever the session has seen.
    await page.goto(page.url());

    await expect(page.locator('.ver-label')).toHaveText(`PREVIEW ${version}`, { timeout: 20_000 });
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())).toBe('Lowlight');

    await newGame(page);
    await lockPlayer(page, 'hicks');
    await showTile(page, DIRECT.id);
    await page.locator(`.tile[data-id="${DIRECT.id}"]`).click();
    await expect(phase(page)).toHaveAttribute('data-phase', 'model');
    const field = page.locator('.link-panel .lp-key');
    await expect(field).toBeFocused();
    await field.fill(GOOD_KEY);
    await page.keyboard.press('Enter');
    await expect(page.locator('.model-panel')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(phase(page)).toHaveAttribute('data-phase', 'ready');
    await page.keyboard.press('Enter');
    await page.waitForURL(`**/room/${DIRECT.id}*`);
    await page.waitForFunction(() => window.__nixRoom !== undefined);
    // The arrival screen's opening: the staged district art and name reach the packaged server; Enter (an empty box) steps in.
    await expect(page.locator('.ar-sub')).toContainText('KARASU', { timeout: 20_000 });
    await expect(page.locator('img.ar-art')).toBeVisible();
    await expect(page.locator('.ar-rule')).toHaveText('OPENING AT');
    await page.waitForFunction(() => window.__nixRoom?.intro() === 'ready', null, { timeout: 30_000 });
    await page.keyboard.press('Enter');
    await awaitGreeting(page);

    const before = await page.locator('.msg.agent.s-ok').count();
    await send(page, { type: 'user_message', text: 'hello' });
    await expect(page.locator('.msg.agent.s-ok')).toHaveCount(before + 1, { timeout: 15_000 });
    await expect(page.locator('.msg.agent.s-ok').last()).toContainText('GLM reply');

    await page.keyboard.press('`');
    await expect(page.locator('#devpanel')).not.toHaveClass(/\bopen\b/);
  } finally {
    await app.close();
  }
  expect(fs.existsSync(path.join(userData, 'data', 'settings.json'))).toBe(true);
  expect(fs.readFileSync(path.join(userData, 'logs', 'server.log'), 'utf8')).toMatch(new RegExp(`^Lowlight ${version.replace(/\./g, '\\.')} · linux`));
  expect(JSON.parse(fs.readFileSync(path.join(userData, 'version.json'), 'utf8'))).toEqual({ lastVersion: version });
  // The key the player linked lives in their save folder only, never in the log.
  expect(fs.readFileSync(path.join(userData, 'logs', 'server.log'), 'utf8')).not.toContain(GOOD_KEY);
});
