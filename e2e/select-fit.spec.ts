import { expect, test, type Page } from '@playwright/test';
import { lockPlayer, newGame, skipSplash } from './fixtures';

// Every character's file on the select screen fits its panel: the whole bio shows (nothing under the
// fade) and the facts end inside the panel. It reads the live roster (e2e/serve.ts), so a long bio
// written in Studio or a new character fails here instead of quietly losing its facts. Each step has
// its own grid (select leads spec §4): the leads on 1P's file, then every contact on 2P's.
test('select: every character file fits, bio and facts', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  await page.goto('/');
  await newGame(page);
  const misfits: string[] = [...(await measure(page, 'p1'))];
  await lockPlayer(page, 'hicks');
  misfits.push(...(await measure(page, 'p2')));
  expect(misfits, 'files that overflow the select panel').toEqual([]);
});

/** Hovers each tile on the grid that's up and measures its file on `side`'s strip. */
async function measure(page: Page, side: 'p1' | 'p2'): Promise<string[]> {
  const ids = await page.locator('.grid .tile[data-id]').evaluateAll((ts) =>
    ts.map((t) => (t as HTMLElement).dataset.id!).filter((id) => !id.includes('random')),
  );
  expect(ids.length).toBeGreaterThan(0);
  const misfits: string[] = [];
  for (const id of ids) {
    await page.locator(`.grid .tile[data-id="${id}"]`).hover();
    const file = page.locator(`.fighter.${side} .fighter-file.has-facts`);
    await expect(file.locator('.dh')).toHaveText(new RegExp(`^// FILE `));
    // The print-in animation clips the file while it runs.
    await page.waitForTimeout(450);
    const m = await file.evaluate((f) => {
      const bio = f.querySelector('.fighter-bio') as HTMLElement;
      const dl = f.querySelector('dl')!.getBoundingClientRect();
      return { bioOver: bio.scrollHeight - bio.clientHeight, factsOver: dl.bottom - f.getBoundingClientRect().bottom, faded: bio.classList.contains('cut') };
    });
    if (m.bioOver > 1 || m.factsOver > 1 || m.faded) misfits.push(`${side} ${id}: bio over by ${m.bioOver}px, facts over by ${Math.round(m.factsOver)}px${m.faded ? ', faded' : ''}`);
  }
  return misfits;
}
