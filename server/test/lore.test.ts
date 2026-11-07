import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { bookPage, loadLoreBook, withArt } from '../src/lore';
import { LORE_TEST_MAP as MAP } from '../../shared/lore.fixture';
import { tempDir } from './fixtures/temp-dir';
import { buildApp } from '../src/app';
import { makeFixture } from './fixtures/agents';
import { okStep, startStubOpenRouter } from './fixtures/stub-openrouter';
import { locate } from '../../shared/lore';
import { parseMap } from '../../shared/map-schema';
import { DEFAULT_MAP_FILE } from '../src/config';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const entry = (title: string, front: string) => `---\ntitle: ${title}\n${front}\n---\n${title} body.\n`;

function book(files: Record<string, string>) {
  const dir = tempDir('lore-');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

describe('loadLoreBook', () => {
  it('loads the .md files in the folder, ignoring categories/ and other files', () => {
    const dir = book({
      'lowlight.md': entry('Lowlight', 'always: true'),
      'glass-orchid.md': entry('Glass Orchid', 'places: [glass-orchid]'),
      'notes.txt': 'not lore',
      'categories/factions.md': '---\ncategory: Factions\n---\nWho they are.\n',
    });
    const warned: string[] = [];
    const loaded = loadLoreBook(dir, MAP, (m) => warned.push(m));
    expect(loaded.map((e) => e.id).sort()).toEqual(['glass-orchid', 'lowlight']);
    expect(warned).toEqual([]);
  });

  it('a bad file warns once with its name and is skipped; the rest load', () => {
    const dir = book({ 'lowlight.md': entry('Lowlight', 'always: true'), 'glass-orchid.md': entry('Glass Orchid', 'places: [glass-orchd]') });
    const warned: string[] = [];
    expect(loadLoreBook(dir, MAP, (m) => warned.push(m)).map((e) => e.id)).toEqual(['lowlight']);
    expect(warned).toEqual(["lore glass-orchid.md: places: no place 'glass-orchd' on the map; skipping it"]);
  });

  it('a file whose name is not an id is skipped with a warning', () => {
    const warned: string[] = [];
    expect(loadLoreBook(book({ 'Bad Name.md': entry('X', 'always: true') }), MAP, (m) => warned.push(m))).toEqual([]);
    expect(warned).toHaveLength(1);
  });

  it('the committed starter book loads against the real map, with no warnings', () => {
    const real = parseMap(JSON.parse(fs.readFileSync(DEFAULT_MAP_FILE, 'utf8')));
    const warned: string[] = [];
    const dir = path.join(__dirname, '..', '..', 'world', 'lore');
    const loaded = loadLoreBook(dir, real.ok ? real.map : null, (m) => warned.push(m));
    expect(warned).toEqual([]);
    // Every entry file loads; the book grows as lore is written, so only a few long-lived ids are named.
    const ids = loaded.map((e) => e.id);
    expect(ids.sort()).toEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).sort());
    expect(ids).toEqual(expect.arrayContaining(['glass-orchid', 'haes-noodles', 'karasu', 'lowlight-intake', 'slang']));
  });

  it('a missing folder is an empty book with no warning', () => {
    const warned: string[] = [];
    expect(loadLoreBook(path.join(tempDir('lore-'), 'nope'), MAP, (m) => warned.push(m))).toEqual([]);
    expect(warned).toEqual([]);
  });
});

describe('the game with a lore book', () => {
  it("a room not on the map still gets always and keyword lore (Review Focus 4)", async () => {
    const or = await startStubOpenRouter([], { fallback: okStep('ok') });
    cleanups.push(() => or.close());
    const { cfg } = await makeFixture([{ id: 'nix', direct: true, pack: 'karasu' }], undefined, { openrouterUrl: or.url });
    fs.mkdirSync(cfg.loreDir, { recursive: true });
    fs.writeFileSync(path.join(cfg.loreDir, 'lowlight.md'), entry('Lowlight', 'always: true'));
    fs.writeFileSync(path.join(cfg.loreDir, 'velvet-orchid.md'), entry('Velvet Orchid', 'keys: [velvet orchid]'));
    // The real map without any place for the fixture's rooms: her room is somewhere the map doesn't know.
    const raw = JSON.parse(fs.readFileSync(DEFAULT_MAP_FILE, 'utf8')) as { places: { scene?: string }[] };
    raw.places = raw.places.filter((p) => !p.scene?.startsWith('karasu/'));
    cfg.mapFile = path.join(tempDir('lore-map-'), 'map.json');
    fs.writeFileSync(cfg.mapFile, JSON.stringify(raw));
    const built = await buildApp(cfg);
    cleanups.push(() => built.close());
    const rt = (await built.runtime('nix'))!;
    const parsed = parseMap(raw);
    expect(parsed.ok && locate(parsed.map, rt.room.state.sceneId)).toEqual({ placeId: null, districtId: null });
    await rt.relay.send(built.world.players.defaultId, 'ever been to the velvet orchid?');
    const chat = or.requests.filter((r) => r.url.endsWith('/v1/chat/completions')).at(-1)!;
    // The lore block rides at the start of the latest user message (cache order), not in the system message.
    const system = (chat.body as { messages: { content: string }[] }).messages.at(-1)!.content;
    expect(system).toContain('[lore:');
    expect(system).toContain('Lowlight: Lowlight body.');
    expect(system).toContain('Velvet Orchid: Velvet Orchid body.');
  });
});

describe('lore can name an exit place (final review I2)', () => {
  it("a place the game knows from a room's exits is not refused", () => {
    const dir = book({ 'dead-blocks.md': entry('The Dead Blocks', 'places: [dead-blocks]') });
    const warned: string[] = [];
    expect(loadLoreBook(dir, MAP, (m) => warned.push(m), ['dead-blocks']).map((e) => e.id)).toEqual(['dead-blocks']);
    expect(warned).toEqual([]);
  });
});

describe('lore pictures (corp logos)', () => {
  const entry0 = { keys: ['x-key'], districts: [], places: [], always: false };
  it('withArt marks the entries with a <id>.webp beside them, read each time', () => {
    const dir = book({});
    const page = bookPage([{ ...entry0, id: 'soma', title: 'Soma', body: 'Food.' }, { ...entry0, id: 'titan', title: 'Titan', body: 'Ore.' }], [], () => ({ placeId: null, districtId: null }));
    expect(withArt(page, dir).entries.map((e) => e.art)).toEqual([undefined, undefined]);
    fs.writeFileSync(path.join(dir, 'titan.webp'), 'x');
    expect(withArt(page, dir).entries.map((e) => [e.id, e.art])).toEqual([['soma', undefined], ['titan', true]]);
  });

  it('GET /api/lore/art/:id serves a book entry\'s picture, and nothing else', async () => {
    const { cfg } = await makeFixture([{ id: 'nix', pack: 'karasu' }]);
    fs.mkdirSync(cfg.loreDir, { recursive: true });
    fs.writeFileSync(path.join(cfg.loreDir, 'soma.md'), entry('Soma', 'keys: [soma]'));
    fs.writeFileSync(path.join(cfg.loreDir, 'soma.webp'), 'RIFF');
    fs.writeFileSync(path.join(cfg.loreDir, 'stray.webp'), 'RIFF');
    const built = await buildApp(cfg);
    cleanups.push(() => built.close());
    const ok = await built.app.inject({ method: 'GET', url: '/api/lore/art/soma' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/webp');
    expect(ok.body).toBe('RIFF');
    const page = JSON.parse((await built.app.inject({ method: 'GET', url: '/api/lore/book' })).body) as { entries: { id: string; art?: true }[] };
    expect(page.entries.find((e) => e.id === 'soma')?.art).toBe(true);
    for (const bad of ['stray', '..%2Fsoma', 'nope']) expect((await built.app.inject({ method: 'GET', url: `/api/lore/art/${bad}` })).statusCode).toBe(404);
  });
});

describe('GET /api/lore/glossary', () => {
  it('serves the hover cards: street versions where there are some', async () => {
    const { cfg } = await makeFixture([{ id: 'nix', pack: 'karasu' }]);
    fs.mkdirSync(cfg.loreDir, { recursive: true });
    fs.writeFileSync(path.join(cfg.loreDir, 'velvet-orchid.md'), entry('Velvet Orchid', 'keys: [velvet orchid]'));
    fs.writeFileSync(path.join(cfg.loreDir, 'velvet-orchid-on-the-street.md'), entry('Velvet Orchid on the street', 'keys: [the Orchid]'));
    const built = await buildApp(cfg);
    cleanups.push(() => built.close());
    const res = await built.app.inject({ method: 'GET', url: '/api/lore/glossary' });
    expect(JSON.parse(res.body)).toEqual({ glossary: [{ id: 'velvet-orchid', title: 'Velvet Orchid', keys: ['velvet orchid', 'the Orchid'], text: 'Velvet Orchid on the street body.' }] });
  });
});

describe('bookPage', () => {
  it('holds the player’s book and each room’s place and district', () => {
    const entry = { keys: ['x-key'], districts: [], places: [], always: false };
    const page = bookPage(
      [
        { ...entry, id: 'orchid', title: 'Orchid', body: 'Insider.' },
        { ...entry, id: 'orchid-on-the-street', title: 'Street', body: 'Street.' },
      ],
      ['the-tilt', 'nowhere'],
      (id) => (id === 'the-tilt' ? { placeId: 'the-tilt', districtId: 'karasu' } : { placeId: null, districtId: null }),
    );
    expect(page.entries.map((e) => [e.id, e.body])).toEqual([['orchid', 'Insider.\n\nStreet.']]);
    expect(page.rooms).toEqual({ 'the-tilt': { placeId: 'the-tilt', districtId: 'karasu' }, nowhere: { placeId: null, districtId: null } });
  });
});
