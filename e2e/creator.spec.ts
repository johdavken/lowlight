import { expect, test } from '@playwright/test';
import { newGame, phase, showTile, skipSplash } from './fixtures';

// The 1P creator (character creator spec 2026-11-14), on the e2e server's fake OpenRouter: + → LOOK → GENERATE
// → FIT → WHO → KEEP → their tile → a contact → the room, where they stand in their own figure.
test('make someone at 1P, keep them, and play them in a room', async ({ page, request }) => {
  await skipSplash(page);
  await page.goto('/');
  await newGame(page);
  const p = phase(page);
  await page.locator('.tile[data-id="+new"]').click();
  await expect(p).toHaveAttribute('data-phase', 'make');
  await expect(page.locator('.creator .mk-group legend')).toHaveText(['BODY', 'FACE', 'WEAR']);
  await page.locator('.creator [data-field="hair"]').fill('black, cropped short');
  await page.locator('.creator .mk-generate').click();
  // The take comes back cut out: FIT shows it, the face box and the waist line.
  await expect(page.locator('.creator .mk-frame img')).toBeVisible();
  await expect(page.locator('.creator .mk-box')).toBeVisible();
  await expect(page.locator('.creator .mk-waist')).toBeVisible();
  await page.keyboard.press('Enter');
  const name = `Vee ${Date.now() % 100000}`;
  await page.locator('.creator .mk-name').fill(name);
  await page.locator('.creator .mk-pronoun[data-pronoun="she"]').click();
  await page.locator('.creator .mk-wears').fill('a grey quilted jacket, cargo trousers, boots');
  await page.locator('.creator .mk-keep').click();
  await expect(p).toHaveAttribute('data-phase', 'p2');
  await expect(page.locator('.creator')).toHaveCount(0);
  await expect(page.locator('.fighter.p1 .name')).toHaveText(name.toUpperCase());

  // Kept in the library, with a figure; the cleaned take kept its grey (the backdrop was green).
  const people = (await (await request.get('/api/people')).json()) as { people: { id: string; name: string; figure: boolean }[] };
  const made = people.people.find((x) => x.name === name)!;
  expect(made.figure).toBe(true);

  await showTile(page, 'cass');
  await page.locator('.tile[data-id="cass"]').click();
  await expect(p).toHaveAttribute('data-phase', /model|ready/);
  if ((await p.getAttribute('data-phase')) === 'model') {
    await expect(page.locator('.model-band .mp-row.on')).toBeVisible();
    await page.keyboard.press('Enter');
  }
  await expect(p).toHaveAttribute('data-phase', 'ready');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/room/cass*');
  const persona = (await (await request.get('/api/persona')).json()) as { persona: { id: string; name: string; figure?: boolean } };
  expect(persona.persona).toMatchObject({ id: 'newcomer', name, figure: true });
});
