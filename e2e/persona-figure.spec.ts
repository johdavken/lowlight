/**
 * A persona's own figure (spec 2026-11-12): Studio writes `<pt>/persona/figure.png` + `figure.json`; the game
 * plays it without a restart: the sprite, the thumbnails by the player's id, no wardrobe, and LOAD's strip.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { expect, test } from '@playwright/test';
import { DIRECT, e2eDataDir, pickTitle, skipSplash, toTitle } from './fixtures';

const figurePng = () => {
  const png = new PNG({ width: 1024, height: 1536 });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([200, 40, 40, 255], i);
  return PNG.sync.write(png);
};

// A playthrough of its own: put back whichever was active, for the next spec on this worker's server.
let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
});
test.afterEach(async ({ request }) => {
  if (before) await expect.poll(async () => (await request.post(`/api/playthroughs/${before}/activate`)).status(), { timeout: 15_000 }).toBe(200);
});

test('a persona with its own figure: the sprite, the thumbnails and LOAD follow it; no wardrobe', async ({ page, request }) => {
  const made = await request.post('/api/playthroughs', { data: { player: 'rue', startContact: DIRECT.id, persona: { name: 'Vee', background: 'Ex-courier.', kind: 'custom' } } });
  expect(made.status()).toBe(200);
  const pt = ((await made.json()) as { id: string }).id;
  const leadThumb = await request.get('/api/agents/rue/thumb');
  const leadEtag = leadThumb.headers()['etag'];
  expect((await request.get('/api/persona')).ok()).toBe(true);

  // Kept in Studio while the game runs.
  const dir = path.join(e2eDataDir(), 'playthroughs', pt, 'persona');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'figure.png'), figurePng());
  fs.writeFileSync(path.join(dir, 'figure.json'), JSON.stringify({ face: { x: 0.5, y: 0.2 }, waist: 0.36, wears: 'a long grey coat', model: 'openai/gpt-image-2', made: '2026-11-12T00:00:00.000Z', fields: {} }));

  const { persona } = (await (await request.get('/api/persona')).json()) as { persona: Record<string, unknown> };
  expect(persona).toMatchObject({ id: 'rue', name: 'Vee', figure: true });
  expect(persona.outfits).toBeUndefined();
  const sprite = await request.get('/api/persona/sprite?as=rue');
  expect(Buffer.from(await sprite.body()).equals(fs.readFileSync(path.join(dir, 'figure.png')))).toBe(true);
  // Their own face by playthrough; the roster's portrait of Rue stays Rue's (select grid, LOAD, as a contact).
  expect(persona.thumb).toMatch(new RegExp(`^/api/persona/thumb\\?pt=${pt}&v=`));
  const own = await request.get(persona.thumb as string);
  expect(own.headers()['etag']).not.toBe(leadEtag);
  expect((await request.get('/api/agents/rue/thumb')).headers()['etag']).toBe(leadEtag);

  // LOAD: this playthrough's strip shows the figure's face.
  await skipSplash(page);
  await toTitle(page);
  await pickTitle(page, 'load');
  const load = page.locator('.load-screen');
  await expect(load.locator(`.pt[data-id="${pt}"]`)).toBeVisible();
  await expect(load.locator('.ss[data-id="now"] .ss-face.ss-l')).toHaveAttribute('src', `/api/persona/thumb?pt=${pt}`);

  // Studio's PERSONA page sets who you are through the game (spec 2026-11-13): a rename plays at once;
  // a cleared persona keeps the figure on disk but plays Rue as written.
  const renamed = await request.put(`/api/playthroughs/${pt}/persona`, { data: { persona: { name: 'Kit', background: '', kind: 'custom' } } });
  expect(renamed.status()).toBe(200);
  expect(((await (await request.get('/api/persona')).json()) as { persona: { name: string; figure?: true } }).persona).toMatchObject({ name: 'Kit', figure: true });
  expect((await request.put(`/api/playthroughs/${pt}/persona`, { data: { persona: null } })).status()).toBe(200);
  const plain = ((await (await request.get('/api/persona')).json()) as { persona: { name: string; figure?: true } }).persona;
  expect(plain.figure).toBeUndefined();
  expect(fs.existsSync(path.join(dir, 'figure.png'))).toBe(true);
});
