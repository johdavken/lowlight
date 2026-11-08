import { expect, test, type Page } from '@playwright/test';
import { lockPlayer, newGame, phase, SECOND, skipSplash } from './fixtures';

// Four leads on select (spec 2026-11-07), on the live roster (e2e/serve.ts): 1P offers only the
// playable leads; 2P every contact but those found in play.
const named = (page: Page) =>
  page.locator('.grid .tile[data-id]').evaluateAll((ts) => ts.map((t) => (t as HTMLElement).dataset.id!).filter((id) => !id.includes('random')));

test('select: the four leads at 1P, every contact but Rot and Ines at 2P', async ({ page }) => {
  await skipSplash(page);
  await page.goto('/');
  await newGame(page);
  expect((await named(page)).sort()).toEqual(['ember', 'hicks', 'rue', 'soren']);
  await lockPlayer(page, 'hicks');
  const p2 = await named(page);
  for (const id of ['soren', 'rue', 'hicks', 'ember', 'nix-direct', 'cass', 'adebayo', 'silas', SECOND.id]) expect(p2, `${id} on 2P`).toContain(id);
  expect(p2).not.toContain('mother-rot');
  expect(p2).not.toContain('ines');
});

test('select: Esc at 2P brings the four back', async ({ page }) => {
  await skipSplash(page);
  await page.goto('/');
  await newGame(page);
  await lockPlayer(page, 'soren');
  await page.keyboard.press('Escape');
  await expect(phase(page)).toHaveAttribute('data-phase', 'you');
  await expect.poll(async () => (await named(page)).sort()).toEqual(['ember', 'hicks', 'rue', 'soren']);
  await expect(page.locator('.tile.locked-p1')).toHaveAttribute('data-id', 'soren');
});
