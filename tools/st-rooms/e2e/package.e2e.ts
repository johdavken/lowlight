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
  // A package installed for all users (public/…/third-party) shadows the copy under test: every check would test it.
  if (fs.existsSync(path.join(ST, 'public', 'scripts', 'extensions', 'third-party', EXT))) {
    console.error(`${ST} has ${EXT} installed for all users, which would be tested instead of ${PKG}. Run on a copy without it:\n  rsync -a --exclude /data --exclude '/public/scripts/extensions/third-party/*' --exclude /.git ${ST}/ <copy>/ && … --st <copy>`);
    process.exit(1);
  }
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

/** E2E_CONSOLE=1: the page's errors and Lowlight's warnings, as they happen (for a run that fails in the page). */
function watchConsole(page: Page): void {
  if (process.env.E2E_CONSOLE !== '1') return;
  page.on('console', (m) => {
    if (m.type() === 'error' || /lowlight/i.test(m.text())) console.log(`  [page ${m.type()}] ${m.text().slice(0, 240)}`);
  });
  page.on('pageerror', (e) => console.log(`  [page crash] ${String(e).slice(0, 240)}`));
  page.on('load', () => console.log('  [page load]'));
}

/** Stops a SillyTavern startST began and deletes its data folder (each is a few hundred MB, in /tmp's RAM). */
async function stopST(st: { root: string; proc: ChildProcess }): Promise<void> {
  const exited = new Promise((resolve) => st.proc.once('exit', resolve));
  st.proc.kill();
  await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))]);
  fs.rmSync(st.root, { recursive: true, force: true });
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
  watchConsole(page);
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
    const contacts = await page.evaluate<string[]>("[...document.querySelectorAll('.lls-tile-name')].map((n) => n.textContent)");
    const residents = ['HAE', 'TILLY', 'VESNA', 'OKSANA', 'GARRO'];
    check("the contact grid leaves out the game's residents", contacts.includes('NIX') && !contacts.some((n) => residents.includes(n)), contacts.join(', '));
    // As Lowlight's own select screen: the menu theme plays over the room behind (which drops to a quarter).
    const theme = (JSON.parse(fs.readFileSync(path.join(PKG, 'sound-map.json'), 'utf8')) as { theme?: string | null }).theme ?? null;
    check('the select plays the menu theme', theme !== null && (await until(page, `decodeURIComponent(window.lowlightRoom.audio.state().musicUrl ?? '').endsWith(${JSON.stringify(theme ?? '-')})`, 15_000)), String(theme));
    await page.locator('.lls-tile', { hasText: 'NIX' }).first().click();
    const aiFile = await page.evaluate<{ head: string; about: number }>(
      "({ head: document.querySelector('.lls-p2 .lls-dh')?.textContent ?? '', about: document.querySelector('.lls-p2 .lls-about')?.textContent.length ?? 0 })",
    );
    check("the AI side shows the contact's FILE", aiFile.head === '// FILE NIX' && aiFile.about > 200, JSON.stringify(aiFile));
    // Jack in: the chat opens with the persona picked, locked to the chat (else SillyTavern's default persona wins,
    // and it warns that the pick is temporary).
    const p1Name = await page.evaluate<string>("document.querySelector('.lls-p1 .lls-name')?.textContent ?? ''");
    await page.keyboard.press('y');
    const jacked = await until(page, "SillyTavern.getContext().characters[SillyTavern.getContext().characterId]?.name === 'Nix'", 30_000);
    // The persona is set once the chat has loaded, a moment after it opens.
    await until(page, '!!SillyTavern.getContext().chatMetadata?.persona', 15_000);
    const persona = await page.evaluate<{ name: string; locked: string | null }>(
      "(() => { const c = SillyTavern.getContext(); const f = c.chatMetadata?.persona ?? null; return { name: c.name1, locked: f ? c.powerUserSettings.personas[f] : null }; })()",
    );
    check('jacking in opens the chat as the persona picked, locked to the chat', jacked && persona.name.toUpperCase() === p1Name && persona.locked?.toUpperCase() === p1Name, `${p1Name} → ${JSON.stringify(persona)}`);

    // The subtitle band pages a long line as Lowlight's dialogue box does, and Page Up opens the history.
    const long = Array.from({ length: 30 }, (_, n) => `Line ${n + 1} of a long reply, long enough that the band has to page it.`).join(' ');
    // An earlier line for the history (cards carry no greeting, and there's no API here for her live one).
    await page.evaluate(`SillyTavern.getContext().executeSlashCommandsWithOptions('/sendas name=Nix You made it.')`);
    await page.evaluate(`SillyTavern.getContext().executeSlashCommandsWithOptions(${JSON.stringify(`/sendas name=Nix ${long}`)})`);
    const pager = () => page.evaluate<string>("document.querySelector('.ll-continue:not([hidden])')?.textContent ?? ''");
    await until(page, "/1\\/\\d/.test(document.querySelector('.ll-continue:not([hidden])')?.textContent ?? '')", 15_000);
    const first = await pager();
    const pages = Number(/\/(\d+)/.exec(first)?.[1] ?? 0);
    check('a long line is paged, CONTINUE ▸ 1/N', /CONTINUE ▸ 1\/\d+/.test(first) && pages >= 2, first);
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(400);
    check('Page Down turns to the next page', (await pager()).includes(`2/${pages}`), await pager());
    await page.keyboard.press('PageUp');
    await page.waitForTimeout(400);
    const history = await page.evaluate<{ open: boolean; shown: number }>(
      "({ open: document.body.classList.contains('ll-history'), shown: [...document.querySelectorAll('#chat .mes')].filter((m) => m.offsetParent).length })",
    );
    check('Page Up opens the history: earlier lines show', history.open && history.shown >= 2, JSON.stringify(history));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check('Escape closes the history to the one line', !(await page.evaluate<boolean>("document.body.classList.contains('ll-history')")));

    check('closing the select hands the music back to the room', await until(page, "!decodeURIComponent(window.lowlightRoom.audio.state().musicUrl ?? '').includes('/sound/music/')", 15_000));
    // The key presses above unlocked the sound: the rain is the recording, not the engine's synthesized noise.
    const rain = await until(page, "window.lowlightRoom?.audio?.state?.().rain === 'recorded'", 20_000);
    check('the rain is the recording, not synthesized', rain, String(await page.evaluate("window.lowlightRoom?.audio?.state?.().rain")));

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
    // The extension loads after SillyTavern's own scripts: wait for it rather than for a fixed time.
    await until(page, '!!window.lowlightSelect && !!window.lowlightRoom', 60_000);
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
    await stopST(st);
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
  watchConsole(page);
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
    await stopST(st);
  }
}

async function runDeclined() {
  console.log('\n— a fresh SillyTavern, N at the welcome, then /lowcast —');
  const st = await startST();
  const browser = await chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  watchConsole(page);
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
    // Later, from a plain SillyTavern (no Keys bar there): /lowcast installs it.
    await inPage<any>(page, () => (window as any).lowlightSelect?.close());
    await page.waitForTimeout(1000);
    check('the Keys bar stays out of a plain SillyTavern', !(await page.locator('.llh-sys').isVisible()));
    await inPage<any>(page, () => SillyTavern.getContext().executeSlashCommandsWithOptions('/lowcast'));
    check('/lowcast installs the cast', await until(page, "SillyTavern.getContext().characters.some((c) => c.name === 'Cass')"));
  } finally {
    await browser.close();
    await stopST(st);
  }
}

/** Her Residual (spec 2026-10-29-st-residual-design), with the model stood in for: each call takes the next scripted answer. */
async function runResidual() {
  console.log('\n— her Residual: notes on the message, rolled back by a swipe and a delete, a missed light, OFF, another card —');
  const st = await startST();
  const browser = await chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  watchConsole(page);
  await page.addInitScript('globalThis.__name = (f) => f;');
  try {
    await page.goto(URL);
    await page.waitForTimeout(6000);
    await passStWelcome(page);
    await until(page, "!!document.querySelector('.llw-root')", 30_000);
    await page.keyboard.press('y');
    await until(page, "(SillyTavern.getContext().extensionSettings.lowlight?.installed?.length ?? 0) > 0");
    await page.waitForTimeout(3000);
    const open = (name: string) =>
      page.evaluate(`(async () => {
        window.lowlightSelect?.close();
        const c = SillyTavern.getContext();
        await c.selectCharacterById(c.characters.findIndex((x) => x.name === ${JSON.stringify(name)}));
        await new Promise((r) => setTimeout(r, 4000));
        // Her live greeting needs a model: none here, so start from an empty chat.
        while (c.chat.length > 0) await c.deleteMessage(c.chat.length - 1);
      })()`);
    // Someone who answered the welcome before the Residual existed is told once, after the update.
    check('a new player, told in the welcome, gets no Residual notice after it', (await page.evaluate<boolean>('SillyTavern.getContext().extensionSettings.lowlight.residualSaid === true')));
    await page.evaluate('delete SillyTavern.getContext().extensionSettings.lowlight.residualSaid; SillyTavern.getContext().saveSettingsDebounced();');
    await page.waitForTimeout(2500);
    await page.reload();
    const told = await until(page, "[...document.querySelectorAll('.llw-notice')].some((n) => n.textContent.includes('RESIDUAL'))", 60_000);
    check('an existing install is told once that her Residual makes one more call per reply', told && (await page.evaluate<boolean>('SillyTavern.getContext().extensionSettings.lowlight.residualSaid === true')));
    await until(page, '!!window.lowlightSelect && !!window.lowlightRoom', 60_000);
    await page.waitForTimeout(3000);

    await open('Nix');
    // The stand-in model: answers in order, counting calls; a '!wait' answer takes 3 s.
    await page.evaluate(`(() => {
      window.__calls = 0;
      window.__answers = [];
      window.lowlightResidual.setComplete(async () => {
        window.__calls++;
        const a = window.__answers.shift() ?? '{"notes":[],"lights":[],"recap":null}';
        if (a.startsWith('!wait')) { await new Promise((r) => setTimeout(r, 3000)); return a.slice(5); }
        return a;
      });
    })()`);
    const say = async (text: string, answer: string) => {
      await page.evaluate(`window.__answers.push(${JSON.stringify(answer)})`);
      await page.evaluate(`SillyTavern.getContext().executeSlashCommandsWithOptions(${JSON.stringify(`/sendas name=Nix ${text}`)})`);
    };
    const saved = "(() => { const c = SillyTavern.getContext(); const m = c.chat[c.chat.length - 1]; return !!m?.extra?.lowlight_ledger; })()";
    const line = "SillyTavern.getContext().extensionPrompts?.['lowlight-ledger']?.value ?? ''";

    await say('You owe Hae for the noodles.', '{"notes":[{"op":"add","about":"you","text":"Owes Hae for noodles.","keys":["noodles"],"pin":true}],"lights":[],"recap":null}');
    check('a reply adds a note, saved on her message', await until(page, saved, 15_000));
    check('the note is in her prompt', (await page.evaluate<string>(line)) === '[journal (pinned): n1 (you) Owes Hae for noodles.]', await page.evaluate<string>(line));

    const swiped = await page.evaluate<{ notes: number; line: string }>(`(async () => {
      const c = SillyTavern.getContext();
      const at = c.chat.length - 1;
      const m = c.chat[at];
      m.swipes = m.swipes ?? [m.mes];
      m.swipe_info = m.swipe_info ?? m.swipes.map(() => ({ send_date: m.send_date, extra: { ...m.extra } }));
      m.swipes.push('Another take.');
      // As SillyTavern does: the new take gets its own date, and its swipe_info a copy of the message's extra, the old
      // take's change in it.
      m.send_date = Date.now() + 1;
      m.swipe_info.push({ send_date: m.send_date, extra: structuredClone(m.extra) });
      m.swipe_id = m.swipes.length - 1;
      m.mes = 'Another take.';
      await c.eventSource.emit(c.eventTypes.MESSAGE_SWIPED, at);
      return { notes: window.lowlightResidual.ledger().notes.length, line: ${line} };
    })()`);
    check('a swipe rolls the note back', swiped.notes === 0 && swiped.line === '', JSON.stringify(swiped));

    await page.evaluate(`(async () => { const c = SillyTavern.getContext(); await c.deleteMessage(c.chat.length - 1); })()`);
    await say('Hae says hi.', '{"notes":[{"op":"add","about":"me","text":"Hae waved.","keys":["hae"],"pin":false}],"lights":[],"recap":null}');
    await until(page, saved, 15_000);
    await page.evaluate(`(async () => { const c = SillyTavern.getContext(); await c.deleteMessage(c.chat.length - 1); })()`);
    check('a delete rolls the note back', (await page.evaluate<number>('window.lowlightResidual.ledger().notes.length')) === 0);

    const lamp = await page.evaluate<string>('window.lowlightRoom.scene()?.lights?.[0]?.id ?? ""');
    await say('*She kills the lamp.*', `{"notes":[],"lights":[{"id":"${lamp}","intensity":0}],"recap":null}`);
    await until(page, saved, 15_000);
    const lit = await page.evaluate<{ now: number; saved: number }>(`(() => {
      const c = SillyTavern.getContext();
      const find = (ls) => ls?.find((l) => l.id === ${JSON.stringify(lamp)})?.intensity;
      return { now: find(window.lowlightRoom.state()?.lights), saved: find(c.chat[c.chat.length - 1]?.extra?.lowlight?.lights) };
    })()`);
    check('a missed light is set, and saved with the room on her message', lamp !== '' && lit.now === 0 && lit.saved === 0, `${lamp} ${JSON.stringify(lit)}`);

    await say('Wait.', '!wait{"notes":[{"op":"add","about":"you","text":"Too late.","keys":[],"pin":false}],"lights":[],"recap":null}');
    await page.waitForTimeout(800);
    // A new take while the run is out: the answer was for the old one, so the new take gets nothing.
    await page.evaluate(`(async () => {
      const c = SillyTavern.getContext();
      const at = c.chat.length - 1;
      const m = c.chat[at];
      m.swipes = m.swipes ?? [m.mes];
      m.swipe_info = m.swipe_info ?? m.swipes.map(() => ({ send_date: m.send_date, extra: {} }));
      m.swipes.push('A new take.');
      m.send_date = Date.now() + 1;
      m.swipe_info.push({ send_date: m.send_date, extra: {} });
      m.swipe_id = m.swipes.length - 1;
      m.mes = 'A new take.';
      await c.eventSource.emit(c.eventTypes.MESSAGE_SWIPED, at);
    })()`);
    await page.waitForTimeout(3500);
    check('an answer for a take swiped away mid-run is dropped', (await page.evaluate<number>('window.lowlightResidual.ledger().notes.length')) === 0);

    await say('Think hard.', ' ');
    await until(page, saved, 15_000);
    const empty = await page.evaluate<any>(`(() => { const c = SillyTavern.getContext(); return { run: c.chat[c.chat.length - 1].extra.lowlight_ledger.run, status: window.lowlightResidual.status() }; })()`);
    check('an empty answer saves the failure and nothing else', empty.run.ok === false && empty.run.why === 'no answer' && empty.status?.why === 'no answer', JSON.stringify(empty));

    await page.evaluate("SillyTavern.getContext().executeSlashCommandsWithOptions('/ledger')");
    const shown = await until(page, "!!document.querySelector('.llr-root')", 5_000);
    await page.keyboard.press('o');
    const offFromPanel = await page.evaluate<boolean>('!window.lowlightResidual.isOn()');
    await page.keyboard.press('o');
    await page.keyboard.press('Escape');
    check('/ledger opens the ledger, and O switches the Residual off and on', shown && offFromPanel && (await page.evaluate<boolean>("window.lowlightResidual.isOn() && !document.querySelector('.llr-root')")));

    const stamps = await page.evaluate<number>("Math.max(0, ...[...document.querySelectorAll('#chat .mes')].map((m) => m.querySelectorAll('.ll-stamp').length))");
    check('each message has one time-and-model stamp', stamps === 1, `${stamps} at most`);

    // E2E_SHOTS=<dir>: the SYS row and the LEDGER panel, at the desktop stage and a phone, for a look by eye.
    const shots = process.env.E2E_SHOTS;
    if (shots) {
      await say('One for the ledger.', '{"notes":[{"op":"add","about":"me","text":"Moved the spare deck to the Tilt.","keys":["deck","tilt"],"pin":false},{"op":"add","about":"you","text":"Lies about where he sleeps.","keys":["sleeps"],"pin":true}],"lights":[],"recap":null}');
      await until(page, saved, 15_000);
      for (const [w, h] of [[1600, 900], [390, 844]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(800);
        await page.evaluate("document.querySelector('.llh-sys')?.click()");
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(shots, `residual-sys-${w}.png`) });
        await page.evaluate("document.querySelector('.llr-open')?.click()");
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(shots, `residual-ledger-${w}.png`) });
        await page.keyboard.press('Escape');
      }
      await page.setViewportSize({ width: 1600, height: 900 });
    }

    await page.evaluate('window.__calls = 0;');
    await page.evaluate(`SillyTavern.getContext().executeSlashCommandsWithOptions('/sendas name=Hae Two bowls, then.')`);
    await page.waitForTimeout(2500);
    check("someone else's line in her chat makes no call", (await page.evaluate<number>('window.__calls')) === 0);
    await page.evaluate(`(async () => { const c = SillyTavern.getContext(); await c.deleteMessage(c.chat.length - 1); })()`);

    // Her reply from a generation (a tool call and the reply after it included) runs once the generation has ended.
    await page.evaluate(`(async () => {
      window.__answers.push('{"notes":[{"op":"add","about":"me","text":"Heard it from the generation.","keys":[],"pin":false}],"lights":[],"recap":null}');
      const c = SillyTavern.getContext();
      c.chat.push({ name: 'Nix', is_user: false, mes: 'From a generation.', extra: {}, send_date: Date.now() });
      await c.eventSource.emit(c.eventTypes.GENERATION_ENDED, c.chat.length);
    })()`);
    check('her reply runs when the generation ends', await until(page, saved, 15_000));

    await page.evaluate('window.lowlightResidual.set(false); window.__calls = 0;');
    await say('Off now.', '{"notes":[],"lights":[],"recap":null}');
    await page.waitForTimeout(2500);
    check('OFF makes no call', (await page.evaluate<number>('window.__calls')) === 0);
    await page.evaluate('window.lowlightResidual.set(true);');

    await open('Seraphina');
    await page.evaluate('window.__calls = 0;');
    await page.evaluate(`SillyTavern.getContext().executeSlashCommandsWithOptions('/sendas name=Seraphina Hello, traveller.')`);
    await page.waitForTimeout(2500);
    check("another card's chat makes no call and gets no ledger line", (await page.evaluate<number>('window.__calls')) === 0 && (await page.evaluate<string>(line)) === '');
  } finally {
    await browser.close();
    await stopST(st);
  }
}

/** JACK IN with different personas: each gets its own chat with the contact, and coming back as one opens theirs again. */
async function runPersonas() {
  console.log('\n— JACK IN as one persona, then another, then the first again —');
  const st = await startST();
  const browser = await chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  watchConsole(page);
  await page.addInitScript('globalThis.__name = (f) => f;');
  try {
    await page.goto(URL);
    await page.waitForTimeout(6000);
    await passStWelcome(page);
    await until(page, "!!document.querySelector('.llw-root')", 30_000);
    await page.keyboard.press('y');
    await until(page, "(SillyTavern.getContext().extensionSettings.lowlight?.installed?.length ?? 0) > 0");
    await page.waitForTimeout(3000);
    /** JACK IN as `who`, calling Nix: the chat it opened and who you are in it. */
    const jackAs = async (who: string) => {
      await page.evaluate("window.lowlightSelect.close(); SillyTavern.getContext().executeSlashCommandsWithOptions('/select')");
      await until(page, "!!document.querySelector('.lls-root:not([hidden]) .lls-tile')", 20_000);
      await page.waitForTimeout(800);
      // A click on a 1P tile picks and locks it in.
      await page.locator('.lls-tile', { hasText: who.toUpperCase() }).first().click();
      if (await page.evaluate("document.querySelector('.lls-root')?.dataset.phase === 'p1'")) await page.keyboard.press('Enter');
      await until(page, "document.querySelector('.lls-root')?.dataset.phase === 'p2'", 10_000);
      await page.locator('.lls-tile', { hasText: 'NIX' }).first().click();
      await page.keyboard.press('y');
      await until(page, "SillyTavern.getContext().characters[SillyTavern.getContext().characterId]?.name === 'Nix' && !!SillyTavern.getContext().chatMetadata?.persona && !window.lowlightSelect.jacking", 30_000);
      await page.waitForTimeout(1500);
      return page.evaluate<{ chat: string; name: string; locked: string | null }>(
        "(() => { const c = SillyTavern.getContext(); const f = c.chatMetadata?.persona ?? null; return { chat: c.getCurrentChatId(), name: c.name1, locked: f ? c.powerUserSettings.personas[f] : null }; })()",
      );
    };
    const nixChats = () =>
      page.evaluate<{ id: string; persona: string | null }[]>(`(async () => {
        const c = SillyTavern.getContext();
        const nix = c.characters.find((x) => x.name === 'Nix');
        const all = await fetch('/api/characters/chats', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ avatar_url: nix.avatar, metadata: true }) }).then((r) => r.json());
        return Object.values(all).map((x) => ({ id: x.file_id, persona: x.chat_metadata?.persona ? c.powerUserSettings.personas[x.chat_metadata.persona] : null }));
      })()`);

    const first = await jackAs('Adebayo');
    await page.evaluate("SillyTavern.getContext().executeSlashCommandsWithOptions('/sendas name=Nix First of the night.')");
    await page.waitForTimeout(1500);
    const afterFirst = await nixChats();
    check('the first JACK IN uses her empty chat, locked to the persona picked', afterFirst.length === 1 && first.locked === first.name, JSON.stringify({ first, afterFirst }));

    const second = await jackAs('Cass');
    const afterSecond = await nixChats();
    check(
      'JACK IN as another persona starts their own chat, and leaves the first one locked to its persona',
      second.chat !== first.chat && second.name !== first.name && second.locked === second.name && afterSecond.find((x) => x.id === first.chat)?.persona === first.name,
      JSON.stringify({ second, afterSecond }),
    );

    const again = await jackAs('Adebayo');
    check('JACK IN as the first persona again opens their chat', again.chat === first.chat && again.name === first.name, JSON.stringify(again));
  } finally {
    await browser.close();
    await stopST(st);
  }
}

if (!fs.existsSync(path.join(PKG, 'cast', 'cast.json'))) {
  console.error(`No published package at ${PKG} (npm run st-publish first).`);
  process.exit(1);
}
// --only <name>: one case (accepted, context, declined, residual, personas).
const only = arg('only');
const cases: [string, () => Promise<void>][] = [['accepted', runAccepted], ['context', runOwnContext], ['declined', runDeclined], ['residual', runResidual], ['personas', runPersonas]];
for (const [name, run] of cases) if (!only || only === name) await run();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
