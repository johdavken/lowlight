// The package's install run (plan Task 9): a fresh SillyTavern per run (its own --dataRoot, port 8011), the published
// package copied into its extensions, and Playwright through every first-run and update case. Run:
//   npx tsx tools/st-rooms/e2e/package.e2e.ts [--package <checkout>] [--st <SillyTavern dir>]
// Exits 1 on the first failed check. Nothing paid: no model is called (her tools are invoked directly).
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { pngWithCard } from '../cast';

// SillyTavern's page global (the evaluate callbacks run in its page).
declare const SillyTavern: any;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const PKG = path.resolve(arg('package') ?? path.join(os.homedir(), 'Projects/lowlight-sillytavern'));
const ST = path.resolve(arg('st') ?? path.join(os.homedir(), 'Projects/SillyTavern'));
const PORT = 8011;
const URL = `http://127.0.0.1:${PORT}`;
const EXT = 'lowlight-sillytavern';
/** The GPU through Vulkan, as Lowlight's e2e suite runs it: in software the live room starves the page's own code. */
const GL_ARGS = ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'];

let failures = 0;
function check(what: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

async function startST(): Promise<{ root: string; ext: string; proc: ChildProcess }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'st-e2e-'));
  const proc = spawn('node', ['server.js', '--port', String(PORT), '--dataRoot', root, '--listen', 'false', '--browserLaunchEnabled', 'false'], { cwd: ST, stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SillyTavern did not start')), 60_000);
    // Read for the server's whole life: an unread pipe fills and stalls SillyTavern.
    proc.stdout!.on('data', (b: Buffer) => {
      if (b.toString().includes('listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  const ext = path.join(root, 'default-user', 'extensions', EXT);
  fs.cpSync(PKG, ext, { recursive: true, filter: (src) => path.basename(src) !== '.git' });
  return { root, ext, proc };
}

/** Passes SillyTavern's own first-run persona prompt, if it's up, keeping its default name as a new player does. */
async function passStWelcome(page: Page) {
  for (let i = 0; i < 20; i++) {
    const open = await inPage<any>(page, () => {
      const d = document.querySelector('dialog[open]');
      const ta = d?.querySelector('textarea');
      if (!d || !ta) return Boolean(d);
      (d.querySelector('.popup-button-ok') as HTMLElement | null)?.click();
      return true;
    });
    if (!open) return;
    await page.waitForTimeout(500);
  }
}

/** Runs `fn` in the page from its source text (tsx's helpers, like __name, don't exist there). */
const inPage = <T>(page: Page, fn: () => unknown): Promise<T> => page.evaluate(`(${fn.toString()})()`) as Promise<T>;

const until = async (page: Page, fn: string, ms = 90_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(500);
  }
  return false;
};

async function runAccepted() {
  console.log('\n— a fresh SillyTavern, Y at the welcome, then an update —');
  const st = await startST();
  const browser = await chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  // tsx keeps function names with a __name() helper that the page doesn't have.
  await page.addInitScript('globalThis.__name = (f) => f;');
  try {
    await page.goto(URL);
    await page.waitForTimeout(6000);
    await passStWelcome(page);
    check('the welcome shows', await until(page, "!!document.querySelector('.llw-root')", 30_000));
    const welcome = await inPage<string>(page, () => document.querySelector('.llw-root')?.textContent ?? '');
    check('the welcome names the settings Y changes', welcome.includes('function calling on') && welcome.includes('context size 32,768 tokens'), welcome);
    await page.keyboard.press('y');
    const cast = JSON.parse(fs.readFileSync(path.join(PKG, 'cast', 'cast.json'), 'utf8')) as { version: string; characters: { id: string; name: string; persona: unknown }[] };
    const finished = await until(page, `SillyTavern.getContext().extensionSettings.lowlight?.version === '${cast.version}'`);
    check('the install finishes', finished);
    if (!finished) console.log(await page.evaluate(`JSON.stringify({ s: SillyTavern.getContext().extensionSettings.lowlight, notice: document.querySelector('.llw-notice')?.textContent, dialog: document.querySelector('dialog[open]')?.innerText?.slice(0, 120), welcome: !!document.querySelector('.llw-root') })`));
    const state = await inPage<any>(page, async () => {
      const c = SillyTavern.getContext();
      const wi = await fetch('/api/worldinfo/get', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ name: 'Lowlight' }) }).then((r) => r.json());
      return {
        chars: c.characters.map((ch: { name: string }) => ch.name),
        personas: Object.values(c.powerUserSettings.personas) as string[],
        lore: Object.keys(wi?.entries ?? {}).length,
        ranks: Object.values(wi?.entries ?? {}).map((e: any) => ({ order: e.order, always: e.constant, ignoreBudget: e.ignoreBudget, preventRecursion: e.preventRecursion })),
        calling: c.chatCompletionSettings?.function_calling,
        context: c.chatCompletionSettings?.openai_max_context,
        installed: c.extensionSettings.lowlight.installed.length,
      };
    });
    check('every cast member is a character', cast.characters.every((ch) => state.chars.includes(ch.name)), `${state.chars.length} characters`);
    check('every playable one is a persona', cast.characters.filter((ch) => ch.persona).every((ch) => state.personas.includes(ch.name)));
    const loreFile = JSON.parse(fs.readFileSync(path.join(PKG, 'cast', 'lore', 'Lowlight.json'), 'utf8'));
    check('the Lowlight lore book is in', state.lore === Object.keys(loreFile.entries).length, `${state.lore} entries`);
    const ranks = state.ranks as { order: number; always: boolean; ignoreBudget: boolean; preventRecursion: boolean }[];
    check(
      'the lore keeps its budget ranks (always-on first and outside the budget, nothing recursing)',
      ranks.filter((r) => r.always).every((r) => r.order === 1000 && r.ignoreBudget) && ranks.every((r) => r.preventRecursion) && new Set(ranks.map((r) => r.order)).size > 3,
      [...new Set(ranks.map((r) => r.order))].sort((a, b) => b - a).join(' '),
    );
    check('function calling switched on', state.calling === true);
    check('the context size raised for Lowlight', state.context >= 32768, `${state.context} tokens`);
    check('installed ids recorded', state.installed === cast.characters.length);

    // The select screen: SillyTavern's untouched default persona isn't a 1P tile, and the AI side has its FILE.
    // No chat is open yet, so the message box is hidden: run /select as SillyTavern's own command.
    await page.evaluate("SillyTavern.getContext().executeSlashCommandsWithOptions('/select')");
    check('the select screen opens', await until(page, "!!document.querySelector('.lls-root:not([hidden]) .lls-tile')"));
    const p1Tiles = await page.evaluate<string[]>("[...document.querySelectorAll('.lls-tile-name')].map((n) => n.textContent)");
    check("SillyTavern's default User isn't a 1P tile, and no one is there twice", p1Tiles.length > 0 && !p1Tiles.includes('USER') && new Set(p1Tiles).size === p1Tiles.length, p1Tiles.join(', '));
    await page.keyboard.press('Enter');
    check('1P locks in', await until(page, "document.querySelector('.lls-root')?.dataset.phase === 'p2'"));
    await page.locator('.lls-tile', { hasText: 'NIX' }).first().click();
    const aiFile = await page.evaluate<{ head: string; about: number }>(
      "({ head: document.querySelector('.lls-p2 .lls-dh')?.textContent ?? '', about: document.querySelector('.lls-p2 .lls-about')?.textContent.length ?? 0 })",
    );
    check("the AI side shows the contact's FILE", aiFile.head === '// FILE NIX' && aiFile.about > 200, JSON.stringify(aiFile));
    await page.keyboard.press('n');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // Her tools: the room follows, is saved on the message, and comes back after a reload.
    const tools = await inPage<any>(page, async () => {
      const w = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const c = SillyTavern.getContext();
      (window as any).lowlightSelect.close();
      await c.selectCharacterById(c.characters.findIndex((x: { name: string }) => x.name === 'Nix'));
      await w(4000);
      const res = String(await c.ToolManager.invokeFunctionTool('apply_mood', { name: 'storm' }));
      await w(1500);
      return { chat: c.chat.length, res: res.slice(0, 8), mood: (window as any).lowlightRoom.moodName(), saved: c.chat[c.chat.length - 1]?.extra?.lowlight?.mood };
    });
    check("her apply_mood moves the room and is saved on the message", tools.res === 'applied:' && tools.mood === 'storm' && tools.saved === 'storm', JSON.stringify(tools));
    await page.reload();
    await page.waitForTimeout(8000);
    const after = await inPage<any>(page, async () => {
      const w = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const c = SillyTavern.getContext();
      (window as any).lowlightSelect.close();
      await c.selectCharacterById(c.characters.findIndex((x: { name: string }) => x.name === 'Nix'));
      await w(4000);
      return { mood: (window as any).lowlightRoom.moodName(), room: (window as any).lowlightRoom.renderer.current?.sceneId };
    });
    check('the saved room comes back after a reload', after.mood === 'storm' && after.room === 'lowlight-intake', JSON.stringify(after));

    // An update: an 11th character and a changed sprite.
    const castPath = path.join(st.ext, 'cast', 'cast.json');
    const c2 = JSON.parse(fs.readFileSync(castPath, 'utf8'));
    const cass = c2.characters.find((x: { id: string }) => x.id === 'cass');
    const card = JSON.parse(Buffer.from(/chara\0([A-Za-z0-9+/=]+)/.exec(fs.readFileSync(path.join(st.ext, 'cast', cass.card)).toString('latin1'))![1], 'base64').toString('utf8'));
    card.data.name = 'Testa';
    fs.writeFileSync(path.join(st.ext, 'cast', 'cards', 'Testa.png'), pngWithCard(fs.readFileSync(path.join(st.ext, 'cast', cass.card)), card));
    c2.characters.push({ ...cass, id: 'testa', name: 'Testa', card: 'cards/Testa.png', persona: null, since: '9.9.9', hash: { ...cass.hash, persona: null } });
    cass.hash.sprites = 'changed';
    c2.version = '9.9.9';
    fs.writeFileSync(castPath, JSON.stringify(c2));
    fs.writeFileSync(path.join(st.ext, 'CHANGELOG.md'), '# Changelog\n\n## 9.9.9 · test\n- Testa arrives\n');
    // Playwright doesn't expose multipart bodies with files: the re-upload shows as Cass's sprite file being rewritten.
    const cassSprite = path.join(st.root, 'default-user', 'characters', 'Cass', 'joy.png');
    const spriteBefore = fs.statSync(cassSprite).mtimeMs;
    let notice = '';
    await page.reload();
    for (let i = 0; i < 60 && !notice; i++) {
      notice = await inPage<any>(page, () => document.querySelector('.llw-notice')?.textContent ?? '');
      await page.waitForTimeout(500);
    }
    check('the update installs the new character', await until(page, "SillyTavern.getContext().characters.some((c) => c.name === 'Testa')"));
    check('NEW IN LOWLIGHT names them, with the changelog line', notice.includes('NEW IN LOWLIGHT: TESTA') && notice.includes('Testa arrives'), notice);
    check('the changed sprites are uploaded again', fs.statSync(cassSprite).mtimeMs > spriteBefore);
  } finally {
    await browser.close();
    st.proc.kill();
  }
}

async function runOwnContext() {
  console.log('\n— a SillyTavern whose context the player set (8,192), Y at the welcome —');
  const st = await startST();
  // As if they'd set it on the API page: SillyTavern reads settings.json on every page load.
  const file = path.join(st.root, 'default-user', 'settings.json');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/"openai_max_context": *\d+/, '"openai_max_context": 8192'));
  const browser = await chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.addInitScript('globalThis.__name = (f) => f;');
  try {
    await page.goto(URL);
    await page.waitForTimeout(6000);
    await passStWelcome(page);
    await until(page, "!!document.querySelector('.llw-root')", 30_000);
    const welcome = await inPage<string>(page, () => document.querySelector('.llw-root')?.textContent ?? '');
    check("the welcome doesn't offer to change their context", !welcome.includes('context size'), welcome);
    await page.keyboard.press('y');
    let notice = '';
    for (let i = 0; i < 20 && !notice.includes('SETTINGS'); i++) {
      notice = await inPage<string>(page, () => document.querySelector('.llw-notice')?.textContent ?? '');
      await page.waitForTimeout(250);
    }
    const context = await inPage<number>(page, () => SillyTavern.getContext().chatCompletionSettings?.openai_max_context);
    check('their context stays as they set it', context === 8192, `${context} tokens`);
    check('the notice advises 16k+', notice.includes('8,192') && notice.includes('16K'), notice);
  } finally {
    await browser.close();
    st.proc.kill();
  }
}

async function runDeclined() {
  console.log('\n— a fresh SillyTavern, N at the welcome, then SYS → CAST → INSTALL —');
  const st = await startST();
  const browser = await chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  // tsx keeps function names with a __name() helper that the page doesn't have.
  await page.addInitScript('globalThis.__name = (f) => f;');
  try {
    await page.goto(URL);
    await page.waitForTimeout(6000);
    await passStWelcome(page);
    await until(page, "!!document.querySelector('.llw-root')", 30_000);
    await page.keyboard.press('n');
    await page.waitForTimeout(2000);
    const none = await inPage<any>(page, () => SillyTavern.getContext().characters.some((c: { name: string }) => c.name === 'Cass'));
    check('N installs nothing', !none);
    await inPage<any>(page, () => (window as any).lowlightSelect?.close());
    await page.click('.llh-sys');
    await page.waitForTimeout(300);
    const row = await inPage<any>(page, () => [...document.querySelectorAll('.llh-row')].find((r) => r.textContent?.startsWith('CAST'))?.textContent ?? '');
    check('SYS → CAST offers INSTALL', row.includes('INSTALL'), row);
    await page.click('.llh-row:has-text("CAST")');
    check('INSTALL from SYS installs the cast', await until(page, "SillyTavern.getContext().characters.some((c) => c.name === 'Cass')"));
  } finally {
    await browser.close();
    st.proc.kill();
  }
}

if (!fs.existsSync(path.join(PKG, 'cast', 'cast.json'))) {
  console.error(`No published package at ${PKG} (npm run st-publish first).`);
  process.exit(1);
}
await runAccepted();
await runOwnContext();
await runDeclined();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
