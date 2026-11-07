import { expect, test, type Page } from '@playwright/test';
import { awaitGreeting, DIRECT, goIn, send, skipSplash, startQuest } from './fixtures';

// The lore drawer (spec 2026-11-06), each test in a playthrough of its own as Hicks: what one leaves in the chat or on the
// board stays out of the next spec. e2e/serve.ts's book: `e2e-orchid` has the key `velvet orchid`; `e2e-intake` is the Intake's own.
test.describe.configure({ mode: 'serial' });

let before: string | null = null;
test.beforeEach(async ({ request }) => {
  before = ((await (await request.get('/api/playthroughs')).json()) as { active: string | null }).active;
  expect((await request.post('/api/playthroughs', { data: { player: 'hicks', startContact: DIRECT.id } })).status()).toBe(200);
});
test.afterEach(async ({ request }) => {
  if (before) expect((await request.post(`/api/playthroughs/${before}/activate`)).status()).toBe(200);
});

const drawer = (page: Page) => page.locator('.lb-root');
const word = (page: Page) => page.locator('.hud-book');
const box = (page: Page) => page.locator('#input textarea');
const count = (page: Page) => word(page).getAttribute('data-count');
const row = (page: Page, title: string) => page.locator('.lb-row', { hasText: title });

async function room(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await skipSplash(page);
  const open = async () => {
    await page.goto(`/room/${DIRECT.id}`);
    await page.waitForFunction(() => window.__nixRoom !== undefined);
    await awaitGreeting(page);
  };
  await open();
  const scene = page.locator('.hud-left .scene');
  await expect(scene).not.toHaveText('——');
  if ((await scene.textContent()) !== 'LOWLIGHT INTAKE') {
    await send(page, { type: 'dev_action', tool: 'go_to', args: { id: 'lowlight-intake', transition: 'fade' } });
    await expect(scene).toHaveText('LOWLIGHT INTAKE', { timeout: 10_000 });
    await open();
  }
  await expect(word(page)).toBeVisible();
}

test('Alt+B and the word open it, Alt+B and Esc close it, and Esc does not open the pause menu', async ({ page }) => {
  await room(page);
  await page.keyboard.press('Alt+b');
  await expect(drawer(page)).toBeVisible();
  await expect(word(page)).toHaveClass(/open/);
  await page.keyboard.press('Alt+b');
  await expect(drawer(page)).toBeHidden();
  await word(page).click();
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
  await expect(page.locator('.pause-menu, .pm-root')).toHaveCount(0);
});

test('Tab comes to it from MAP and goes on to YOU, Shift+Tab the other way, with the draft kept', async ({ page }) => {
  await room(page);
  await box(page).fill('A half-written line');
  await page.locator('.hud-map').click();
  await expect(page.locator('.hud-map')).toHaveClass(/open/);
  await page.keyboard.press('Tab');
  await expect(drawer(page)).toBeVisible();
  await expect(word(page)).toHaveClass(/open/);
  await expect(page.locator('.hud-map')).not.toHaveClass(/open/);
  await page.keyboard.press('Tab');
  await expect(drawer(page)).toBeHidden();
  await expect(page.locator('.hud-you')).toHaveClass(/open/);
  await page.keyboard.press('Shift+Tab');
  await expect(drawer(page)).toBeVisible();
  await expect(page.locator('.hud-you')).not.toHaveClass(/open/);
  await page.keyboard.press('Shift+Tab');
  await expect(drawer(page)).toBeHidden();
  await expect(page.locator('.hud-map')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(box(page)).toHaveValue('A half-written line');
});

test('with nothing open Tab opens YOU from the box, Shift+Tab opens it, and the pause menu keeps Tab', async ({ page }) => {
  await room(page);
  await box(page).fill('A half-written line');
  await box(page).focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.hud-you')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.hud-you')).not.toHaveClass(/open/);
  await box(page).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(drawer(page)).toBeVisible();
  await expect(box(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
  await expect(box(page)).toHaveValue('A half-written line');
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-menu, .pm-root')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('.hud-you')).not.toHaveClass(/open/);
});

test('a click off closes it; the box and the book itself leave it up', async ({ page }) => {
  await room(page);
  await page.keyboard.press('Alt+b');
  await expect(drawer(page)).toBeVisible();
  await box(page).click();
  await page.locator('.lb-tab[data-tab="all"]').click();
  await expect(drawer(page)).toBeVisible();
  const stage = (await page.locator('#game').boundingBox())!;
  await page.mouse.click(stage.x + stage.width * 0.3, stage.y + stage.height * 0.3);
  await expect(drawer(page)).toBeHidden();
  await expect(word(page)).not.toHaveClass(/open/);
});

test('a draft survives opening, search and closing, and the cursor comes back to the box', async ({ page }) => {
  await room(page);
  await box(page).fill('A half-written line');
  await box(page).focus();
  await page.keyboard.press('Alt+b');
  await expect(box(page)).toBeFocused();
  await page.keyboard.type(' still going');
  await page.locator('.lb-tab[data-tab="all"]').click();
  await page.locator('.lb-find').click();
  await page.keyboard.type('intake');
  await expect(row(page, 'E2E Intake Lore')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(box(page)).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
  await expect(box(page)).toHaveValue('A half-written line still going');
});

test('the box narrows and comes back', async ({ page }) => {
  await room(page);
  const right = () => page.locator('#feed .feed').evaluate((n) => n.getBoundingClientRect().right);
  const before = await right();
  await page.keyboard.press('Alt+b');
  await expect(drawer(page)).toBeVisible();
  const left = await drawer(page).evaluate((n) => n.getBoundingClientRect().left);
  await expect.poll(right).toBeLessThanOrEqual(left);
  await page.keyboard.press('Alt+b');
  await expect.poll(right).toBe(before);
});

test('typing velvet orchid sets the count and lists the row; deleting it clears the count', async ({ page }) => {
  await room(page);
  await expect.poll(() => count(page)).toBeNull();
  await box(page).fill('the velvet orchid again');
  await expect.poll(() => count(page)).toBe('1');
  await page.keyboard.press('Alt+b');
  await expect(row(page, 'E2E Orchid Lore')).toBeVisible();
  await expect(row(page, 'E2E Orchid Lore')).toContainText('"velvet orchid"');
  await box(page).fill('');
  await expect.poll(() => count(page)).toBeNull();
  await expect(row(page, 'E2E Orchid Lore')).toHaveCount(0);
});

test('a sent line holds the count, and sending with the drawer open leaves the box empty', async ({ page }) => {
  await room(page);
  await page.keyboard.press('Alt+b');
  const replies = page.locator('.msg.agent.s-ok');
  const before = await replies.count();
  await box(page).fill('Have you seen the velvet orchid?');
  await box(page).press('Enter');
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  await expect(box(page)).toHaveValue('');
  await expect(drawer(page)).toBeVisible();
  await expect.poll(() => count(page)).toBe('1');
});

test('WHERE YOU ARE shows the room off the count', async ({ page }) => {
  await room(page);
  await page.keyboard.press('Alt+b');
  await expect(page.locator('.lb-grp', { hasText: 'WHERE YOU ARE' })).toBeVisible();
  await expect(row(page, 'E2E Intake Lore')).toBeVisible();
  const head = () =>
    row(page, 'E2E Intake Lore').evaluate((n) => {
      let p = n.previousElementSibling;
      while (p && !p.classList.contains('lb-grp')) p = p.previousElementSibling;
      return p?.textContent;
    });
  await expect.poll(head).toBe('WHERE YOU ARE');
});

test('your file and the contact’s show, and identity.md never does', async ({ page }) => {
  await room(page);
  await page.keyboard.press('Alt+b');
  await expect(row(page, 'YOUR FILE')).toBeVisible();
  await row(page, 'YOUR FILE').click();
  await expect(page.locator('.lb-body')).toContainText('Netrunner');
  await expect(page.locator('.lb-body .lb-secret')).not.toBeEmpty();
  await expect(row(page, 'THEIR FILE')).toBeVisible();
  await row(page, 'THEIR FILE').click();
  await expect(page.locator('.lb-body')).toBeVisible();
  await expect(drawer(page)).not.toContainText(DIRECT.identityLine);
});

for (const [screen, cls] of [['you', '.hud-you'], ['people', '.hud-people'], ['texts', '.hud-tx'], ['crew', '.hud-crew'], ['map', '.hud-map']] as const) {
  test(`opening ${screen} closes it, and ${screen}'s word stays lit`, async ({ page }) => {
    await room(page);
    await page.keyboard.press('Alt+b');
    await expect(drawer(page)).toBeVisible();
    await page.locator(cls).click();
    await expect(drawer(page)).toBeHidden();
    await expect(page.locator(cls)).toHaveClass(/open/);
    await expect(word(page)).not.toHaveClass(/open/);
  });
}

test('opening quest closes it', async ({ page }) => {
  await room(page);
  await page.keyboard.press('Alt+b');
  await page.locator('.hud-quest').click();
  await expect(drawer(page)).toBeHidden();
  await expect(page.locator('.hud-quest')).toHaveClass(/open/);
});

test('the word over MAP closes MAP and opens it', async ({ page }) => {
  await room(page);
  await page.locator('.hud-map').click();
  await expect(page.locator('.hud-map')).toHaveClass(/open/);
  await word(page).click();
  await expect(drawer(page)).toBeVisible();
  await expect(page.locator('.hud-map')).not.toHaveClass(/open/);
});

for (const [screen, cls] of [['you', '.hud-you'], ['people', '.hud-people'], ['crew', '.hud-crew'], ['texts', '.hud-tx']] as const) {
  test(`the word and Alt+B over ${screen} close it and open the drawer`, async ({ page }) => {
    await room(page);
    await page.locator(cls).click();
    await expect(page.locator(cls)).toHaveClass(/open/);
    await word(page).click();
    await expect(drawer(page)).toBeVisible();
    await expect(page.locator(cls)).not.toHaveClass(/open/);
    await page.keyboard.press('Alt+b');
    await expect(drawer(page)).toBeHidden();
    await page.locator(cls).click();
    await expect(page.locator(cls)).toHaveClass(/open/);
    await page.keyboard.press('Alt+b');
    await expect(drawer(page)).toBeVisible();
    await expect(page.locator(cls)).not.toHaveClass(/open/);
  });
}

test('the scene keys stay reachable beside it', async ({ page }) => {
  await room(page);
  await page.keyboard.press('Alt+b');
  await expect(drawer(page)).toBeVisible();
  const keys = page.locator('.scene-keys button:visible');
  expect(await keys.count()).toBeGreaterThan(0);
  for (const key of await keys.all()) {
    const inStack = await key.evaluate((n) => {
      const b = n.getBoundingClientRect();
      return (document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)?.closest('.scene-keys') ?? null) !== null;
    });
    expect(inStack).toBe(true);
  }
});

test('Alt+H closes it', async ({ page }) => {
  await room(page);
  await page.keyboard.press('Alt+b');
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press('Alt+h');
  await expect(page.locator('body')).toHaveClass(/ui-hidden/);
  await page.keyboard.press('Alt+h');
  await expect(drawer(page)).toBeHidden();
});

test('it opens over a Graft table, Esc closes only it, and the table is as it was', async ({ page }) => {
  await room(page);
  const replies = page.locator('.msg.agent.s-ok');
  const before = await replies.count();
  await page.locator('.hud-quest').click();
  await startQuest(page, 'Back Door');
  // Enter in an empty search is the field's, not SETUP's GO.
  await expect(page.locator('.ts-go')).toBeVisible();
  await page.keyboard.press('Alt+b');
  await page.locator('.lb-tab[data-tab="all"]').click();
  await page.locator('.lb-find').click();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await expect(page.locator('.ts-go')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
  await goIn(page);
  await expect(replies).toHaveCount(before + 1, { timeout: 10_000 });
  const strip = await page.locator('.tb-strip').textContent();
  await page.keyboard.press('Alt+b');
  await expect(drawer(page)).toBeVisible();
  await expect(box(page)).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(drawer(page)).toBeHidden();
  await expect(page.locator('.tb-strip')).toBeVisible();
  expect(await page.locator('.tb-strip').textContent()).toBe(strip);
});

test('in a phone’s window it scales with the stage, clear of the input', async ({ page }) => {
  await room(page);
  await page.setViewportSize({ width: 900, height: 420 });
  await word(page).click();
  await expect(drawer(page)).toBeVisible();
  const d = (await drawer(page).boundingBox())!;
  const stage = (await page.locator('#game').boundingBox())!;
  const input = (await box(page).boundingBox())!;
  expect(d.x + d.width).toBeLessThanOrEqual(stage.x + stage.width);
  expect(d.y + d.height).toBeLessThanOrEqual(input.y);
});

