import { expect, test } from '@playwright/test';
import { newGame, skipSplash } from './fixtures';

// The select screen grouped by district (spec 2026-10-25), on the live roster (e2e/serve.ts):
// labels over the groups, and every tile under its group's label.
test('select: grouped by district, each tile under its group label', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto('/');
  await newGame(page);
  const groups = await page.evaluate(async () => Object.fromEntries((await (await fetch('/api/agents')).json()).agents.map((a: { id: string; group: string | null }) => [a.id, a.group])));
  const labels = page.locator('.grid .tile-group');
  await expect(labels.first()).not.toHaveText('');
  // Each labelled group's tiles sit in one run under its label.
  const misplaced = await page.evaluate((groupOf: Record<string, string | null>) => {
    const out: string[] = [];
    const ls = [...document.querySelectorAll<HTMLElement>('.grid .tile-group')];
    for (const t of document.querySelectorAll<HTMLElement>('.grid .tile[data-id]')) {
      const g = groupOf[t.dataset.id!];
      if (!g) continue;
      const tr = t.getBoundingClientRect();
      const mine = ls.find((l) => {
        const lr = l.getBoundingClientRect();
        return l.dataset.group === g && tr.top > lr.top && tr.top - lr.bottom < 30;
      });
      if (!mine) out.push(`${t.dataset.id} (${g}) has no label above it`);
    }
    return out;
  }, groups);
  expect(misplaced).toEqual([]);
  await expect(labels.filter({ hasText: 'KARASU' })).toHaveCount(1);
});
