import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import WebSocket from 'ws';
import { PNG } from 'pngjs';
import { generateScenes } from '../../tools/gen-placeholders';
import { buildApp } from '../src/app';
import { makeFixture } from './fixtures/agents';
import { openDb } from '../src/db';
import { loadConfig } from '../src/config';
import { openSettings } from '../src/settings';
import { createPlaythroughs } from '../src/playthroughs';
import { dispatchTool } from '../src/tools';
import { startStubOpenRouter, chunk, okStep, type StubOpenRouter, type StubOpenRouterStep } from './fixtures/stub-openrouter';
import type { ServerEvent } from '../../shared/types';

const TOKEN = 'test-token-123456789';

let scenesDir: string;
let scenesDirWithError: string;

beforeAll(async () => {
  scenesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-app-'));
  await generateScenes(path.join(scenesDir, 'karasu'));
  await generateScenes(path.join(scenesDir, 'default'), 'default');

  scenesDirWithError = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-app-err-'));
  await generateScenes(path.join(scenesDirWithError, 'karasu'));
  await generateScenes(path.join(scenesDirWithError, 'default'), 'default');
  fs.mkdirSync(path.join(scenesDirWithError, 'karasu', 'broken'));
});

afterAll(() => {
  fs.rmSync(scenesDir, { recursive: true, force: true });
  fs.rmSync(scenesDirWithError, { recursive: true, force: true });
});

/** The single-agent view the app tests were written against: Nix's runtime plus the Fastify app. */
interface BuiltApp {
  app: import('fastify').FastifyInstance;
  room: import('../src/room-state').Room;
  journal: import('../src/journal').Journal;
  db: import('../src/db').Db;
  relay: import('../src/chat-relay').ChatRelay;
  checkHealth(): Promise<void>;
  linkStatus(): import('../../shared/types').LinkStatus;
  close(): Promise<void>;
}

const apps: BuiltApp[] = [];
const stubs: { close(): Promise<void> }[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  while (sockets.length > 0) sockets.pop()!.close();
  while (apps.length > 0) await apps.pop()!.close();
  while (stubs.length > 0) await stubs.pop()!.close();
});

interface Started {
  built: BuiltApp;
  baseUrl: string;
  wsUrl: string;
  cfg: import('../src/config').Config;
}

/**
 * Starts the server with one connected agent, nix (on the ribbon pack), whose MCP token is
 * the same TOKEN the tests use for the browser. `dataDir` lets a test reuse/seed nix's room.db
 * (its playthroughs live in `<dataDir>/playthroughs`; see `seedRoomDb`). `autoPlaythrough: false`
 * starts with no active playthrough.
 */
async function start(
  overrides: { scenesDir?: string; dataDir?: string; persona?: object; cast?: string[]; dressed?: string[]; hae?: boolean; autoPlaythrough?: boolean; or?: StubOpenRouter; allowedHosts?: string[] } = {},
): Promise<Started> {
  // Nix is a direct character on an OpenRouter stub (default: "ok" to every turn).
  const or = overrides.or ?? (await orStub([]));
  const { cfg } = await makeFixture([{ id: 'nix', direct: true, pack: 'karasu' }], overrides.scenesDir ?? scenesDir, { openrouterUrl: or.url });
  // Mindless roster characters (with a sprite) who can visit with ?as=<id>.
  for (const id of overrides.cast ?? []) {
    const dir = path.join(cfg.charactersDir, id);
    fs.mkdirSync(dir, { recursive: true });
    // `dressed` ones also have an `indoors` outfit (the YOU sheet's wardrobe).
    const dressed = overrides.dressed?.includes(id);
    fs.writeFileSync(
      path.join(dir, 'character.json'),
      JSON.stringify({ name: id[0].toUpperCase() + id.slice(1), sprite: { src: `${id}.png` }, ...(dressed ? { outfits: { indoors: `${id}.png` } } : {}) }),
    );
    fs.copyFileSync(path.join(__dirname, '..', '..', 'characters', 'nix', 'nix-outfit-outdoors.png'), path.join(dir, `${id}.png`));
  }
  // Hae, the noodle stall's resident (a fixed character), copied from the repo.
  if (overrides.hae) fs.cpSync(path.join(__dirname, '..', '..', 'characters', 'hae'), path.join(cfg.charactersDir, 'hae'), { recursive: true });
  if (overrides.persona) {
    fs.mkdirSync(cfg.personaDir, { recursive: true });
    fs.writeFileSync(path.join(cfg.personaDir, 'persona.json'), JSON.stringify(overrides.persona));
    fs.copyFileSync(path.join(__dirname, '..', '..', 'characters', 'nix', 'nix-outfit-outdoors.png'), path.join(cfg.personaDir, 'me.png'));
  }
  if (overrides.dataDir) {
    fs.mkdirSync(path.join(overrides.dataDir, 'nix'), { recursive: true });
    fs.copyFileSync(path.join(cfg.dataDir, 'settings.json'), path.join(overrides.dataDir, 'settings.json'));
    cfg.dataDir = overrides.dataDir;
    cfg.playthroughsDir = path.join(overrides.dataDir, 'playthroughs');
  }
  if (overrides.autoPlaythrough !== undefined) cfg.autoPlaythrough = overrides.autoPlaythrough;
  if (overrides.allowedHosts) cfg.allowedHosts = overrides.allowedHosts;
  const app = await buildApp(cfg);
  const rt = (await app.runtime('nix'))!;
  const built: BuiltApp = {
    app: app.app,
    room: rt.room,
    journal: rt.journal,
    db: rt.db,
    relay: rt.relay,
    checkHealth: () => rt.checkHealth(),
    linkStatus: () => rt.hub.linkStatus,
    close: () => app.close(),
  };
  apps.push(built);
  await app.app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.app.server.address();
  if (!address || typeof address === 'string') throw new Error('expected a network address');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const wsUrl = `ws://127.0.0.1:${address.port}/ws/nix`;
  return { built, baseUrl, wsUrl, cfg };
}

/** An OpenRouter stub answering `steps`, then "ok" to every turn; closed after the test. */
async function orStub(steps: StubOpenRouterStep[]): Promise<StubOpenRouter> {
  const or = await startStubOpenRouter(steps, { fallback: okStep('ok') });
  stubs.push(or);
  return or;
}

/** Activates a playthrough for `player` under `<dataDir>/playthroughs` and returns where nix's room.db goes in it. */
function seedRoomDb(dataDir: string, player = 'you'): string {
  const pts = createPlaythroughs(path.join(dataDir, 'playthroughs'));
  const pt = pts.create({ player, startContact: 'nix' });
  pts.setActive(pt.id);
  const dir = path.join(pts.charsDir(pt.id), 'nix');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'room.db');
}

function connectWs(wsUrl: string, opts: { token?: string | null; origin?: string | null; as?: string } = {}): {
  ws: WebSocket;
  events: ServerEvent[];
  opened: Promise<void>;
  closed: Promise<number>;
} {
  const token = opts.token === null ? undefined : opts.token ?? TOKEN;
  const query = [
    ...(token === undefined ? [] : [`token=${encodeURIComponent(token)}`]),
    ...(opts.as === undefined ? [] : [`as=${encodeURIComponent(opts.as)}`]),
  ];
  const url = query.length === 0 ? wsUrl : `${wsUrl}?${query.join('&')}`;
  const headers: Record<string, string> = {};
  if (opts.origin !== null) headers.Origin = opts.origin ?? 'http://localhost:5173';

  const ws = new WebSocket(url, { headers });
  sockets.push(ws);
  const events: ServerEvent[] = [];
  ws.on('message', (data) => events.push(JSON.parse(data.toString()) as ServerEvent));

  const opened = new Promise<void>((resolve) => ws.on('open', () => resolve()));
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  // Swallow connection-reset errors from the server closing right after upgrade.
  ws.on('error', () => {});

  return { ws, events, opened, closed };
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start_ = Date.now();
  while (!predicate()) {
    if (Date.now() - start_ > timeoutMs) throw new Error('waitFor: timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('buildApp / websocket hub', () => {
  it('closes a connection with a wrong token with code 4401', async () => {
    const { wsUrl } = await start();
    const { closed } = connectWs(wsUrl, { token: 'wrong-token-0000000' });
    expect(await closed).toBe(4401);
  });

  it('closes a connection with no token with code 4401', async () => {
    const { wsUrl } = await start();
    const { closed } = connectWs(wsUrl, { token: null });
    expect(await closed).toBe(4401);
  });

  it('closes a connection from a disallowed Origin with code 4403', async () => {
    const { wsUrl } = await start();
    const { closed } = connectWs(wsUrl, { origin: 'http://evil.example' });
    expect(await closed).toBe(4403);
  });

  it('accepts a connection with origin http://localhost:5173', async () => {
    const { wsUrl } = await start();
    const { opened, events } = connectWs(wsUrl, { origin: 'http://localhost:5173' });
    await opened;
    await waitFor(() => events.length >= 1);
    expect(events[0].type).toBe('scenes');
  });

  it('accepts a connection with no Origin header', async () => {
    const { wsUrl } = await start();
    const { opened, events } = connectWs(wsUrl, { origin: null });
    await opened;
    await waitFor(() => events.length >= 1);
    expect(events[0].type).toBe('scenes');
  });

  it('sends scenes, who\'s here, room (restore), history, journal, recap, dossier page, link, then no dev_log when there are no scene errors', async () => {
    const { wsUrl } = await start();
    const { opened, events } = connectWs(wsUrl);
    await opened;
    await waitFor(() => events.length >= 8);
    expect(events[0].type).toBe('scenes');
    expect(events[1]).toMatchObject({ type: 'others', others: [] });
    expect(events[2]).toMatchObject({ type: 'room', duration: 0, source: 'restore' });
    expect(events[3].type).toBe('history');
    expect(events[4]).toEqual({ type: 'journal', notes: [] });
    expect(events[5]).toEqual({ type: 'recap', text: null, at: null, seen: false });
    expect(events[6]).toEqual({ type: 'dossier_page', text: null, at: null, by: null });
    expect(events[7]).toMatchObject({ type: 'link', status: 'down' });
    expect(events.filter((e) => e.type === 'dev_log')).toHaveLength(0);
  });

  it('logs each scene-load error to the server console as well', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await start({ scenesDir: scenesDirWithError });
      expect(warn).toHaveBeenCalled();
      expect(warn.mock.calls.some((args) => String(args.join(' ')).includes('broken'))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('sends one dev_log warn per scene-load error, after the initial sync events', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { wsUrl } = await start({ scenesDir: scenesDirWithError });
    warn.mockRestore();
    const { opened, events } = connectWs(wsUrl);
    await opened;
    await waitFor(() => events.length >= 13);
    expect(events[0].type).toBe('scenes');
    expect(events[1]).toMatchObject({ type: 'others', others: [] });
    expect(events[2].type).toBe('room');
    expect(events[3].type).toBe('history');
    expect(events[4].type).toBe('journal');
    expect(events[5].type).toBe('recap');
    expect(events[6].type).toBe('dossier_page');
    expect(events[7].type).toBe('link');
    expect(events[8]).toEqual({ type: 'clock', clock: 1200 });
    // Who is dark and whether this room is (blackouts phase 3 §4).
    expect(events[9]).toEqual({ type: 'power', dark: [], here: null });
    expect(events[10]).toEqual({ type: 'portrait', url: '/api/agents/nix/avatar', kind: 'monogram', accent: '#7fe9ff', name: 'Nix', pronoun: 'they', sprite: null });
    expect(events[11]).toEqual({ type: 'comms', on: false, can: false, where: null, herAt: null });
    // Her plan's card (her plans spec §5), null included: a reconnecting tab drops a stale one.
    expect(events[12]).toEqual({ type: 'plan_card', card: null });
    // Who has texted you unseen, empty included (promised texts final review I2).
    expect(events[13]).toEqual({ type: 'texts_unread', from: [] });
    const devLogs = events.slice(14);
    expect(devLogs.length).toBeGreaterThanOrEqual(1);
    for (const log of devLogs) {
      expect(log).toMatchObject({ type: 'dev_log', level: 'warn' });
    }
  });

  it('dev_action set_light (dev) broadcasts room with source dev and no tool_line', async () => {
    const { wsUrl } = await start();
    const { opened, events } = connectWs(wsUrl);
    await opened;
    await waitFor(() => events.length >= 4);
    const before = events.length;

    const ws = new WebSocket(`${wsUrl}?token=${TOKEN}`);
    sockets.push(ws);
    await new Promise((resolve) => ws.on('open', resolve));
    ws.send(JSON.stringify({ type: 'dev_action', tool: 'set_light', args: { light_id: 'monitor', intensity: 0 } }));
    // Reuse the first client's event stream since it's broadcast to every connection.
    await waitFor(() => events.length > before);

    const roomEvent = events.slice(before).find((e) => e.type === 'room');
    expect(roomEvent).toMatchObject({ type: 'room', source: 'dev' });
    expect(events.slice(before).some((e) => e.type === 'tool_line')).toBe(false);
  });

  it('dev_action set_light (as: nix) broadcasts room with source nix and a tool_line', async () => {
    const { wsUrl } = await start();
    const { opened, events } = connectWs(wsUrl);
    await opened;
    await waitFor(() => events.length >= 4);
    const before = events.length;

    ws_send(wsUrl, { type: 'dev_action', tool: 'set_light', args: { light_id: 'monitor', intensity: 0.5 }, as: 'agent' });

    await waitFor(() => events.slice(before).some((e) => e.type === 'tool_line'));
    const roomEvent = events.slice(before).find((e) => e.type === 'room');
    expect(roomEvent).toMatchObject({ type: 'room', source: 'agent' });
    const toolLine = events.slice(before).find((e) => e.type === 'tool_line');
    expect(toolLine).toMatchObject({ type: 'tool_line', messageId: null });
    expect((toolLine as { text: string }).text).toContain('SET_LIGHT');
  });

  it('dev_action play_sound sends the player a sound event and a ♪ tool line; reconnecting replays no sound', async () => {
    // Every ribbon room gets a kettle the agent can play.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-app-snd-'));
    fs.cpSync(scenesDir, dir, { recursive: true });
    for (const room of fs.readdirSync(path.join(dir, 'karasu'))) {
      const file = path.join(dir, 'karasu', room, 'scene.json');
      if (!fs.existsSync(file)) continue;
      const scene = JSON.parse(fs.readFileSync(file, 'utf8'));
      scene.sound = { ...scene.sound, sounds: [{ name: 'kettle', src: 'sound/keep/kettle.ogg', agent: { about: 'the kettle clicking off' } }] };
      fs.writeFileSync(file, JSON.stringify(scene));
    }
    try {
      const { wsUrl } = await start({ scenesDir: dir });
      const { opened, events } = connectWs(wsUrl);
      await opened;
      await waitFor(() => events.length >= 4);
      const before = events.length;
      ws_send(wsUrl, { type: 'dev_action', tool: 'play_sound', args: { name: 'kettle' }, as: 'agent' });
      await waitFor(() => events.slice(before).some((e) => e.type === 'tool_line'));
      const room = events.filter((e) => e.type === 'room').at(-1) as { state: { sceneId: string } };
      expect(events.slice(before).find((e) => e.type === 'sound')).toEqual({ type: 'sound', scene: room.state.sceneId, name: 'kettle' });
      expect(events.slice(before).find((e) => e.type === 'tool_line')).toMatchObject({ text: '♪ kettle' });
      const again = connectWs(wsUrl);
      await again.opened;
      await waitFor(() => again.events.length >= 4);
      expect(again.events.some((e) => e.type === 'sound')).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function ws_send(wsUrl: string, msg: unknown): void {
    const ws = new WebSocket(`${wsUrl}?token=${TOKEN}`);
    sockets.push(ws);
    ws.on('open', () => ws.send(JSON.stringify(msg)));
  }

  it('dev_action note (dev) writes a journal note edited by the user', async () => {
    const { wsUrl, built } = await start();
    const { opened } = connectWs(wsUrl);
    await opened;
    ws_send(wsUrl, { type: 'dev_action', tool: 'note', args: { text: 'from the dev panel' } });
    await waitFor(() => built.journal.notes('you').length === 1);
    expect(built.journal.notes('you')[0]).toMatchObject({ text: 'from the dev panel', editedBy: 'user' });
  });

  it('/api/persona: none without a file; persona.json only names the default player (its inline name, description and sprite are ignored)', async () => {
    const { baseUrl: none } = await start();
    expect(await (await fetch(`${none}/api/persona`)).json()).toEqual({ persona: null });
    const { baseUrl: base } = await start({
      cast: ['hicks'],
      autoPlaythrough: false,
      persona: { character: 'hicks', name: 'Tester', description: 'secret-ish', sprite: { src: 'me.png' } },
    });
    expect(await (await fetch(`${base}/api/persona`)).json()).toEqual({
      persona: { id: 'hicks', name: 'Hicks', sprite: { url: '/api/persona/sprite?as=hicks', crop: { top: 0, bottom: 0.5 } }, accent: '#7fe9ff' },
    });
    const img = await fetch(`${base}/api/persona/sprite`);
    expect(img.headers.get('content-type')).toContain('image/png');
    expect(Buffer.from(await img.arrayBuffer())).toEqual(fs.readFileSync(path.join(__dirname, '..', '..', 'characters', 'nix', 'nix-outfit-outdoors.png')));
  });

  it('/api/persona sends the character\'s expressions, on the same route as theirs (faces from actions)', async () => {
    const { baseUrl: base, cfg } = await start({ autoPlaythrough: false });
    const charDir = path.join(cfg.charactersDir, 'nix');
    const nixArt = path.join(__dirname, '..', '..', 'characters', 'nix');
    fs.copyFileSync(path.join(nixArt, 'nix-outfit-outdoors.png'), path.join(charDir, 'sprite.png'));
    fs.copyFileSync(path.join(nixArt, 'nix-happy.png'), path.join(charDir, 'happy.png'));
    fs.writeFileSync(path.join(charDir, 'character.json'), JSON.stringify({ scenePack: 'karasu', sprite: { src: 'sprite.png' }, expressions: { happy: 'happy.png' } }));
    await fetch(`${base}/api/agents`); // re-reads the registry
    const { persona } = await (await fetch(`${base}/api/persona?as=nix`)).json();
    expect(persona.expressions).toEqual({ happy: '/api/agents/nix/sprite/happy' });
  });

  it("/api/persona sends the character's file: bio paragraphs and facts (FILE on YOU)", async () => {
    const { baseUrl, cfg } = await start({ cast: ['zed'], autoPlaythrough: false });
    const dir = path.join(cfg.charactersDir, 'zed');
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({ ...json, bio: 'bio.md', facts: [{ label: 'TELL', value: 'Smiles first.' }] }));
    fs.writeFileSync(path.join(dir, 'bio.md'), 'Zed, 30.\nGrew up wet.\n\nRuns light.\n');
    await fetch(`${baseUrl}/api/agents`); // re-reads the registry
    const { persona } = await (await fetch(`${baseUrl}/api/persona?as=zed`)).json();
    expect(persona.bio).toEqual(['Zed, 30. Grew up wet.', 'Runs light.']);
    expect(persona.facts).toEqual([{ label: 'TELL', value: 'Smiles first.' }]);
  });

  it('/api/persona under a persona: the background is the bio, split on blank lines; a blank one sends no file', async () => {
    for (const [background, bio] of [['one\ntwo\n\nthree', ['one two', 'three']], ['', undefined]] as const) {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-app-persona-'));
      try {
        const pts = createPlaythroughs(path.join(dataDir, 'playthroughs'));
        pts.setActive(pts.create({ player: 'zed', startContact: 'nix', persona: { name: 'Vee', background, kind: 'edit' } }).id);
        const { baseUrl, cfg } = await start({ cast: ['zed'], dataDir });
        const dir = path.join(cfg.charactersDir, 'zed');
        const json = JSON.parse(fs.readFileSync(path.join(dir, 'character.json'), 'utf8'));
        fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({ ...json, bio: 'bio.md', facts: [{ label: 'TELL', value: 'Not hers to show.' }] }));
        fs.writeFileSync(path.join(dir, 'bio.md'), 'The character as written.');
        await fetch(`${baseUrl}/api/agents`);
        const { persona } = await (await fetch(`${baseUrl}/api/persona`)).json();
        expect(persona.bio).toEqual(bio);
        expect('facts' in persona).toBe(false);
      } finally {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    }
  });

  it("/api/persona follows the active playthrough's persona; the sprite stays the character's", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-app-persona-'));
    try {
      const pts = createPlaythroughs(path.join(dataDir, 'playthroughs'));
      pts.setActive(pts.create({ player: 'zed', startContact: 'nix', persona: { name: 'Vee', background: 'b' } }).id);
      const { baseUrl } = await start({ cast: ['zed'], dataDir });
      expect(await (await fetch(`${baseUrl}/api/persona`)).json()).toEqual({
        persona: { id: 'zed', name: 'Vee', sprite: { url: '/api/persona/sprite?as=zed', crop: { top: 0, bottom: 0.5 } }, accent: '#7fe9ff', bio: ['b'] },
      });
      const img = await fetch(`${baseUrl}/api/persona/sprite?as=zed`);
      expect(img.status).toBe(200);
      await img.arrayBuffer();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("POST /api/persona/outfit saves the player's outfit in the active playthrough; /api/persona says it", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-app-persona-'));
    try {
      const pts = createPlaythroughs(path.join(dataDir, 'playthroughs'));
      const pt = pts.create({ player: 'zed', startContact: 'nix' });
      pts.setActive(pt.id);
      const { baseUrl } = await start({ cast: ['zed'], dressed: ['zed'], dataDir });
      const persona = async () => ((await (await fetch(`${baseUrl}/api/persona`)).json()) as { persona: Record<string, unknown> }).persona;
      const post = (outfit: unknown) => fetch(`${baseUrl}/api/persona/outfit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outfit }) });
      // Zed's one outfit is his sprite's own picture.
      expect(await persona()).toMatchObject({ id: 'zed', outfits: ['indoors'], baseOutfit: 'indoors' });
      expect((await persona()).outfit).toBeUndefined();
      expect((await post('ghost')).status).toBe(400);
      expect((await post(3)).status).toBe(400);
      expect(await (await post('indoors')).json()).toEqual({ outfit: 'indoors' });
      expect(pts.get(pt.id)!.outfit).toBe('indoors');
      expect(await persona()).toMatchObject({ outfits: ['indoors'], outfit: 'indoors' });
      expect((await post(null)).status).toBe(200);
      expect(pts.get(pt.id)!.outfit).toBeUndefined();
      expect((await persona()).outfit).toBeUndefined();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('POST /api/persona/outfit: 409 without a playthrough, 403 from another site', async () => {
    const { baseUrl } = await start({ autoPlaythrough: false });
    const post = (headers: Record<string, string> = {}) =>
      fetch(`${baseUrl}/api/persona/outfit`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ outfit: null }) });
    expect((await post({ origin: 'https://evil.example' })).status).toBe(403);
    expect((await post()).status).toBe(409);
  });

  it('/api/persona/sprite?as= serves that character even while another playthrough is active (the load screen)', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-app-persona-'));
    try {
      const pts = createPlaythroughs(path.join(dataDir, 'playthroughs'));
      pts.setActive(pts.create({ player: 'zed', startContact: 'nix' }).id);
      const { baseUrl, cfg } = await start({ cast: ['zed', 'cass'], dataDir });
      const hicksPng = path.join(__dirname, '..', '..', 'characters', 'hicks', 'hicks-outfit-outdoors.png');
      fs.copyFileSync(hicksPng, path.join(cfg.charactersDir, 'cass', 'cass.png'));
      const img = await fetch(`${baseUrl}/api/persona/sprite?as=cass`);
      expect(img.status).toBe(200);
      expect(Buffer.from(await img.arrayBuffer())).toEqual(fs.readFileSync(hicksPng));
      expect((await fetch(`${baseUrl}/api/persona/sprite?as=ghost`)).status).toBe(404);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("/ws/:id binds every tab to the playthrough's player (cass), whatever ?as= says", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-app-as-'));
    try {
      seedRoomDb(dataDir, 'cass');
      const { wsUrl, built } = await start({ cast: ['cass'], dataDir });
      built.db.insertMessage('cass', { id: 'c1', role: 'user', text: 'cass here', toolLines: [], ts: 1, status: 'ok' });
      built.db.insertMessage('you', { id: 'y1', role: 'user', text: 'you here', toolLines: [], ts: 1, status: 'ok' });
      built.journal.note('cass', { text: 'cass hates rain' }, 'user');
      const historyIds = (events: ServerEvent[]) =>
        (events.find((e) => e.type === 'history') as Extract<ServerEvent, { type: 'history' }>).messages.map((m) => m.id);
      const cass = connectWs(wsUrl, { as: 'cass' });
      const you = connectWs(wsUrl, { as: 'you' });
      const none = connectWs(wsUrl);
      await Promise.all([cass.opened, you.opened, none.opened]);
      await waitFor(() => [cass, you, none].every((c) => c.events.some((e) => e.type === 'journal')));
      for (const c of [cass, you, none]) {
        expect(historyIds(c.events)).toEqual(['c1']);
        expect(c.events.find((e) => e.type === 'journal')).toMatchObject({ notes: [{ text: 'cass hates rain' }] });
      }

      // A dev panel note from the ?as=you tab still lands in Cass's dossier.
      you.ws.send(JSON.stringify({ type: 'dev_action', tool: 'note', args: { text: 'from her panel' } }));
      await waitFor(() => built.journal.notes('cass').length === 2);
      expect(built.journal.notes('you')).toEqual([]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('/api/persona?as=cass returns Cass with her sprite URL; the sprite route serves her PNG', async () => {
    // No playthrough: ?as= picks the visitor (in one, it is always the playthrough's player).
    const { baseUrl } = await start({ cast: ['cass'], autoPlaythrough: false });
    const body = (await (await fetch(`${baseUrl}/api/persona?as=cass`)).json()) as { persona: Record<string, unknown> };
    expect(body).toEqual({ persona: { id: 'cass', name: 'Cass', sprite: { url: '/api/persona/sprite?as=cass', crop: expect.any(Object) }, accent: '#7fe9ff' } });
    const img = await fetch(`${baseUrl}/api/persona/sprite?as=cass`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toContain('image/png');
    expect((await img.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    // No persona file: the default 'you' (and an unknown id, which falls back to it) has none.
    expect(await (await fetch(`${baseUrl}/api/persona?as=ghost`)).json()).toEqual({ persona: null });
    expect(await (await fetch(`${baseUrl}/api/persona`)).json()).toEqual({ persona: null });
    expect((await fetch(`${baseUrl}/api/persona/sprite`)).status).toBe(404);
  });

  it('/api/agents returns recaps per player', async () => {
    const { baseUrl, built } = await start({ cast: ['cass'] });
    built.journal.setRecap('cass', 'cass left at dawn', 'agent');
    built.journal.setRecap('you', 'you stayed late', 'agent');
    const list = (await (await fetch(`${baseUrl}/api/agents`)).json()) as { agents: Array<Record<string, unknown>> };
    const nix = list.agents.find((a) => a.id === 'nix')!;
    expect(nix.recaps).toEqual({ cass: 'cass left at dawn', you: 'you stayed late' });
    built.journal.markRecapSeen('cass');
    const again = (await (await fetch(`${baseUrl}/api/agents`)).json()) as { agents: Array<Record<string, unknown>> };
    expect(again.agents.find((a) => a.id === 'nix')!.recaps).toEqual({ you: 'you stayed late' });
    expect(again.agents.find((a) => a.id === 'cass')!.recaps).toEqual({});
  });

  it('a mindless character folder (no backend) is listed with backend none and link unknown, her sprite serves, and she has no runtime', async () => {
    const or = await orStub([]);
    const { cfg } = await makeFixture([{ id: 'nix', direct: true, pack: 'karasu' }], scenesDir, { openrouterUrl: or.url });
    const hicksDir = path.join(cfg.charactersDir, 'hicks');
    fs.mkdirSync(hicksDir, { recursive: true });
    fs.writeFileSync(path.join(hicksDir, 'character.json'), JSON.stringify({ name: 'Hicks', sprite: { src: 'hicks.png' } }));
    fs.copyFileSync(path.join(__dirname, '..', '..', 'characters', 'nix', 'nix-outfit-outdoors.png'), path.join(hicksDir, 'hicks.png'));

    const app = await buildApp(cfg);
    try {
      await app.app.listen({ port: 0, host: '127.0.0.1' });
      const address = app.app.server.address();
      if (!address || typeof address === 'string') throw new Error('expected a network address');
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const list = (await (await fetch(`${baseUrl}/api/agents`)).json()) as { agents: Array<Record<string, unknown>> };
      const hicks = list.agents.find((a) => a.id === 'hicks');
      expect(hicks).toMatchObject({ backend: 'none', connected: false, link: 'unknown' });

      const sprite = await fetch(`${baseUrl}/api/agents/hicks/sprite`);
      expect(sprite.status).toBe(200);
      expect(sprite.headers.get('content-type')).toContain('image/png');
      await sprite.arrayBuffer();

      expect(await app.runtime('hicks')).toBeNull();
    } finally {
      await app.close();
    }
  });

  it('GET /api/agents/:id/sprite/:name: 200 for a known expression, 404 for an unknown one or an agent without expressions', async () => {
    const { baseUrl: base, cfg } = await start();
    const charDir = path.join(cfg.charactersDir, 'nix');
    const nixArt = path.join(__dirname, '..', '..', 'characters', 'nix');
    fs.copyFileSync(path.join(nixArt, 'nix-outfit-outdoors.png'), path.join(charDir, 'sprite.png'));
    fs.copyFileSync(path.join(nixArt, 'nix-happy.png'), path.join(charDir, 'happy.png'));
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({ scenePack: 'karasu', sprite: { src: 'sprite.png' }, expressions: { happy: 'happy.png' } }),
    );
    await fetch(`${base}/api/agents`); // re-reads the registry, as the landing page does

    const ok = await fetch(`${base}/api/agents/nix/sprite/happy`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('image/png');
    expect((await ok.arrayBuffer()).byteLength).toBeGreaterThan(1000);

    const unknown = await fetch(`${base}/api/agents/nix/sprite/smug`);
    expect(unknown.status).toBe(404);
    await unknown.text();

    const proto = await fetch(`${base}/api/agents/nix/sprite/constructor`);
    expect(proto.status).toBe(404);
    await proto.text();
  });

  it('GET /api/agents/:id/photo/:photo serves her photo; an unknown one is 404 (photos spec §1)', async () => {
    const { baseUrl: base, cfg } = await start();
    const charDir = path.join(cfg.charactersDir, 'nix');
    const json = JSON.parse(fs.readFileSync(path.join(charDir, 'character.json'), 'utf8'));
    fs.mkdirSync(path.join(charDir, 'photos'), { recursive: true });
    fs.writeFileSync(path.join(charDir, 'photos', 'roof.webp'), Buffer.from('RIFF0000WEBPVP8 '));
    fs.writeFileSync(path.join(charDir, 'character.json'), JSON.stringify({ ...json, photos: [{ id: 'roof', caption: 'on the roof' }] }));
    await fetch(`${base}/api/agents`);

    const ok = await fetch(`${base}/api/agents/nix/photo/roof`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('image/webp');
    expect((await ok.arrayBuffer()).byteLength).toBe(16);
    const unknown = await fetch(`${base}/api/agents/nix/photo/beach`);
    expect(unknown.status).toBe(404);
    await unknown.text();

    const now = (await (await fetch(`${base}/api/agents/nix/photos/now`)).json()) as { fits: string[] };
    expect(now.fits).toEqual(['roof']);
  });

  it('a saved room from before rooms is completed, and the next save writes its full name (Review Focus 1)', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-app-data-'));
    try {
      const seed = openDb(seedRoomDb(dataDir), { defaultPlayer: 'hicks' });
      seed.saveRoom({ sceneId: 'noodle-stall', lights: [], atmosphere: { ambient: '#000000', ambientLevel: 0.3, weather: 'none', weatherLevel: 0, fog: 0, timeOfDay: 'night' } });
      seed.close();
      const { built } = await start({ dataDir });
      expect(built.room.state.sceneId).toBe('karasu/noodle-stall');
      built.room.setAtmosphere({ fog: 0.4 }, 'dev');
      expect(built.db.loadRoom()!.sceneId).toBe('karasu/noodle-stall');
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('two contacts in the noodle stall both meet its resident (Review Focus 4)', async () => {
    const withHae = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-app-hae-'));
    try {
      fs.cpSync(scenesDir, withHae, { recursive: true });
      const stall = path.join(withHae, 'karasu', 'noodle-stall', 'scene.json');
      fs.writeFileSync(stall, JSON.stringify({ ...JSON.parse(fs.readFileSync(stall, 'utf8')), resident: { character: 'hae', scale: 0.78 } }));
      const or = await orStub([]);
      const { cfg } = await makeFixture(
        [
          { id: 'nix', direct: true, pack: 'karasu' },
          { id: 'alpha', direct: true, pack: 'default' },
        ],
        withHae,
        { openrouterUrl: or.url },
      );
      fs.cpSync(path.join(__dirname, '..', '..', 'characters', 'hae'), path.join(cfg.charactersDir, 'hae'), { recursive: true });
      const app = await buildApp(cfg);
      try {
        for (const id of ['nix', 'alpha']) {
          const rt = (await app.runtime(id))!;
          rt.room.setScene({ id: 'karasu/noodle-stall' }, 'dev');
          // She's there for whoever comes: each contact's tools can set her face.
          expect(rt.tools.others?.()).toMatchObject([{ id: 'hae' }]);
        }
        const a = (await app.runtime('nix'))!;
        const b = (await app.runtime('alpha'))!;
        a.room.setAtmosphere({ fog: 0.9 }, 'dev');
        expect(b.room.state.atmosphere.fog).not.toBe(0.9);
      } finally {
        await app.close();
      }
    } finally {
      fs.rmSync(withHae, { recursive: true, force: true });
    }
  });

  it('GET /api/residents/:id/…: her sprite, outfits, faces and thumb; 404 for unknown names and non-residents', async () => {
    const { baseUrl: base } = await start({ hae: true });
    for (const url of ['/api/residents/hae/sprite', '/api/residents/hae/outfit/work2', '/api/residents/hae/sprite/happy', '/api/residents/hae/thumb']) {
      const ok = await fetch(`${base}${url}`);
      expect(ok.status, url).toBe(200);
      expect(ok.headers.get('content-type')).toContain('image/png');
      await ok.arrayBuffer();
    }
    for (const url of ['/api/residents/hae/sprite/nope', '/api/residents/hae/outfit/constructor', '/api/residents/nix/sprite', '/api/agents/hae/sprite']) {
      const no = await fetch(`${base}${url}`);
      expect(no.status, url).toBe(404);
      await no.text();
    }
  });

  it('GET /api/agents/:id/outfit/:name: 200 for a known outfit, 404 for an unknown one or an agent without outfits', async () => {
    const { baseUrl: base, cfg } = await start();
    const charDir = path.join(cfg.charactersDir, 'nix');
    const nixArt = path.join(__dirname, '..', '..', 'characters', 'nix');
    fs.copyFileSync(path.join(nixArt, 'nix-outfit-outdoors.png'), path.join(charDir, 'sprite.png'));
    fs.copyFileSync(path.join(nixArt, 'nix-outfit-indoors.png'), path.join(charDir, 'indoors.png'));
    fs.writeFileSync(
      path.join(charDir, 'character.json'),
      JSON.stringify({ scenePack: 'karasu', sprite: { src: 'sprite.png' }, outfits: { indoors: 'indoors.png' } }),
    );
    await fetch(`${base}/api/agents`); // re-reads the registry, as the landing page does

    const ok = await fetch(`${base}/api/agents/nix/outfit/indoors`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('image/png');
    expect(ok.headers.get('cache-control')).toBe('no-cache');
    expect((await ok.arrayBuffer()).byteLength).toBeGreaterThan(1000);

    for (const name of ['orchid', 'constructor']) {
      const res = await fetch(`${base}/api/agents/nix/outfit/${name}`);
      expect(res.status).toBe(404);
      await res.text();
    }

    fs.writeFileSync(path.join(charDir, 'character.json'), JSON.stringify({ scenePack: 'karasu', sprite: { src: 'sprite.png' } }));
    await fetch(`${base}/api/agents`);
    const none = await fetch(`${base}/api/agents/nix/outfit/indoors`);
    expect(none.status).toBe(404);
    await none.text();
  });

  it('GET /api/agents/:id/sprite/:name: 404 for an agent with a sprite but no expressions', async () => {
    const { baseUrl: base, cfg } = await start();
    const charDir = path.join(cfg.charactersDir, 'nix');
    const nixArt = path.join(__dirname, '..', '..', 'characters', 'nix');
    fs.copyFileSync(path.join(nixArt, 'nix-outfit-outdoors.png'), path.join(charDir, 'sprite.png'));
    fs.writeFileSync(path.join(charDir, 'character.json'), JSON.stringify({ scenePack: 'karasu', sprite: { src: 'sprite.png' } }));
    await fetch(`${base}/api/agents`); // re-reads the registry, as the landing page does

    const res = await fetch(`${base}/api/agents/nix/sprite/happy`);
    expect(res.status).toBe(404);
    await res.text();
  });

  it('GET /api/agents/:id/thumb: 200 image/png with an ETag, honours If-None-Match with 304, 404 without a sprite or for an unknown id', async () => {
    const { baseUrl: base, cfg } = await start();
    const charDir = path.join(cfg.charactersDir, 'nix');
    const nixArt = path.join(__dirname, '..', '..', 'characters', 'nix');
    fs.copyFileSync(path.join(nixArt, 'nix-outfit-outdoors.png'), path.join(charDir, 'sprite.png'));
    fs.writeFileSync(path.join(charDir, 'character.json'), JSON.stringify({ scenePack: 'karasu', sprite: { src: 'sprite.png' } }));
    await fetch(`${base}/api/agents`); // re-reads the registry, as the landing page does

    const res = await fetch(`${base}/api/agents/nix/thumb`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    const etag = res.headers.get('etag');
    expect(etag).toBeTruthy();
    const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
    expect(png.width).toBe(208);
    expect(png.height).toBe(240);

    const cached = await fetch(`${base}/api/agents/nix/thumb`, { headers: { 'If-None-Match': etag! } });
    expect(cached.status).toBe(304);
    await cached.text();

    const unknown = await fetch(`${base}/api/agents/ghost/thumb`);
    expect(unknown.status).toBe(404);
    await unknown.text();
  });

  it('GET /api/agents/:id/thumb: 404 for an agent without a sprite', async () => {
    const { baseUrl: base } = await start();
    const res = await fetch(`${base}/api/agents/nix/thumb`);
    expect(res.status).toBe(404);
    await res.text();
  });

  it('dev_action with an unknown tool sends a dev_log error to that client only', async () => {
    const { wsUrl } = await start();
    const { ws, opened, events } = connectWs(wsUrl);
    await opened;
    await waitFor(() => events.length >= 4);
    const before = events.length;

    ws.send(JSON.stringify({ type: 'dev_action', tool: 'not_a_tool', args: {} }));

    await waitFor(() => events.slice(before).some((e) => e.type === 'dev_log'));
    const log = events.slice(before).find((e) => e.type === 'dev_log')!;
    expect(log).toMatchObject({ type: 'dev_log', level: 'error' });
    expect((log as { text: string }).text).toContain('unknown tool');
  });

  it('invalid client JSON gets a dev_log warn and does not crash the socket', async () => {
    const { wsUrl } = await start();
    const { ws, opened, events } = connectWs(wsUrl);
    await opened;
    await waitFor(() => events.length >= 4);
    const before = events.length;

    ws.send('not json {{{');

    await waitFor(() => events.slice(before).some((e) => e.type === 'dev_log'));
    expect(events.slice(before)[0]).toMatchObject({ type: 'dev_log', level: 'warn' });

    // socket still works afterwards
    ws.send(JSON.stringify({ type: 'dev_action', tool: 'set_light', args: { light_id: 'monitor', intensity: 0.1 } }));
    await waitFor(() => events.slice(before + 1).some((e) => e.type === 'room'));
  });

  it('an unknown client event type gets a dev_log warn', async () => {
    const { wsUrl } = await start();
    const { ws, opened, events } = connectWs(wsUrl);
    await opened;
    await waitFor(() => events.length >= 4);
    const before = events.length;

    ws.send(JSON.stringify({ type: 'something_else' }));

    await waitFor(() => events.slice(before).some((e) => e.type === 'dev_log'));
    expect(events.slice(before)[0]).toMatchObject({ type: 'dev_log', level: 'warn' });
  });

  it('malformed client events get a dev_log each and never crash the server', async () => {
    const { wsUrl } = await start();
    const { ws, opened, events } = connectWs(wsUrl);
    await opened;
    // The whole hello, which for a direct contact ends with her model.
    await waitFor(() => events.length >= 4 && events.some((e) => e.type === 'model'));
    const before = events.length;

    const malformed = [
      { type: 'user_message' },
      { type: 'user_message', text: 42 },
      { type: 'retry', messageId: {} },
      { type: 'retry' },
      { type: 'dev_action', tool: 7, args: {} },
      { type: 'dev_action', tool: 'set_light', args: 'nope' },
      { type: 'dev_action', tool: 'set_light', args: { light_id: 'monitor' }, as: 'root' },
      null,
      [],
    ];
    for (const m of malformed) ws.send(JSON.stringify(m));

    await waitFor(() => events.slice(before).filter((e) => e.type === 'dev_log').length >= malformed.length);
    for (const e of events.slice(before)) expect(e).toMatchObject({ type: 'dev_log' });

    // The server is still alive and answers a subsequent valid event.
    ws.send(JSON.stringify({ type: 'dev_action', tool: 'set_light', args: { light_id: 'monitor', intensity: 0.2 } }));
    await waitFor(() => events.slice(before).some((e) => e.type === 'room'));
  });

  it('an error thrown inside an async user_message handler becomes a dev_log error, not a crash', async () => {
    const { built, wsUrl } = await start();
    const { ws, opened, events } = connectWs(wsUrl);
    await opened;
    await waitFor(() => events.length >= 4);
    const before = events.length;

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    built.relay.send = async () => {
      throw new Error('disk full');
    };
    ws.send(JSON.stringify({ type: 'user_message', text: 'hi' }));

    await waitFor(() => events.slice(before).some((e) => e.type === 'dev_log'));
    expect(events.slice(before).find((e) => e.type === 'dev_log')).toMatchObject({ level: 'error', text: expect.stringContaining('disk full') });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();

    ws.send(JSON.stringify({ type: 'dev_action', tool: 'set_light', args: { light_id: 'monitor', intensity: 0.3 } }));
    await waitFor(() => events.slice(before).some((e) => e.type === 'room'));
  });

  it('rejects requests whose Host is not loopback with 403 (DNS-rebinding guard) on /api/bootstrap and /ws', async () => {
    const { built } = await start();
    for (const host of ['evil.example', 'evil.example:7700', '192.168.1.5:7700', 'localhost.evil.example']) {
      const boot = await built.app.inject({ method: 'GET', url: '/api/bootstrap', headers: { host } });
      expect(boot.statusCode).toBe(403);
      expect(boot.body).not.toContain(TOKEN);
    }
    for (const host of ['localhost', 'localhost:5173', '127.0.0.1:7700', '[::1]:7700']) {
      const boot = await built.app.inject({ method: 'GET', url: '/api/bootstrap', headers: { host } });
      expect(boot.statusCode).toBe(200);
    }
  });

  it('refuses a websocket upgrade with a non-loopback Host', async () => {
    const { wsUrl } = await start();
    const ws = new WebSocket(`${wsUrl}?token=${TOKEN}`, { headers: { Host: 'evil.example:7700', Origin: 'http://localhost:5173' } });
    ws.on('error', () => {});
    const status = await new Promise<number>((resolve, reject) => {
      ws.on('unexpected-response', (req, res) => {
        resolve(res.statusCode ?? 0);
      });
      ws.on('open', () => reject(new Error('upgrade should have been refused')));
    });
    expect(status).toBe(403);
  });

  it('also accepts the hosts in allowedHosts (a tailnet name), exactly and on any port', async () => {
    const { built } = await start({ allowedHosts: ['omarken.tail.ts.net'] });
    for (const host of ['omarken.tail.ts.net', 'OMARKEN.tail.ts.net:443', 'localhost:5173']) {
      const boot = await built.app.inject({ method: 'GET', url: '/api/bootstrap', headers: { host } });
      expect(boot.statusCode).toBe(200);
    }
    for (const host of ['evil.example', 'x.omarken.tail.ts.net', 'omarken.tail.ts.net.evil.example']) {
      const boot = await built.app.inject({ method: 'GET', url: '/api/bootstrap', headers: { host } });
      expect(boot.statusCode).toBe(403);
    }
  });

  it('a tailnet name is refused when allowedHosts is unset', async () => {
    const { built } = await start();
    const boot = await built.app.inject({ method: 'GET', url: '/api/bootstrap', headers: { host: 'omarken.tail.ts.net' } });
    expect(boot.statusCode).toBe(403);
  });

  it('opens /ws from an allowed host and its https origin', async () => {
    const { wsUrl } = await start({ allowedHosts: ['omarken.tail.ts.net'] });
    const ws = new WebSocket(`${wsUrl}?token=${TOKEN}`, { headers: { Host: 'omarken.tail.ts.net', Origin: 'https://omarken.tail.ts.net' } });
    ws.on('error', () => {});
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('close', (code) => reject(new Error(`closed ${code}`)));
      ws.on('unexpected-response', (_req, res) => reject(new Error(`refused ${res.statusCode}`)));
    });
    ws.close();
  });

  it('still refuses /ws from an allowed host with a foreign origin', async () => {
    const { wsUrl } = await start({ allowedHosts: ['omarken.tail.ts.net'] });
    const ws = new WebSocket(`${wsUrl}?token=${TOKEN}`, { headers: { Host: 'omarken.tail.ts.net', Origin: 'https://evil.example' } });
    ws.on('error', () => {});
    const code = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
    expect(code).toBe(4403);
  });

  it('GET /api/bootstrap returns the token', async () => {
    const { baseUrl } = await start();
    const res = await fetch(`${baseUrl}/api/bootstrap`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ token: TOKEN });
  });

  it("loadConfig({}) throws the token message", () => {
    expect(() => loadConfig({})).toThrow('NIX_ROOM_TOKEN must be at least 16 characters');
  });

  it('loadConfig reads the port from NIX_ROOM_PORT, ignores a generic PORT, and defaults to 7700', () => {
    const base = { NIX_ROOM_TOKEN: TOKEN };
    expect(loadConfig({ ...base, NIX_ROOM_PORT: '7711' }).port).toBe(7711);
    expect(loadConfig({ ...base, PORT: '5173' }).port).toBe(7700);
    expect(loadConfig(base).port).toBe(7700);
  });

  it('a room change persists to the db, and a new buildApp on the same file restores it', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-app-db-'));

    const { built } = await start({ dataDir });
    const result = dispatchTool({ room: built.room, journal: built.journal, player: () => 'you', expressions: null }, 'set_light', { light_id: 'desk_lamp', intensity: 0.33 }, 'dev');
    expect(result.ok).toBe(true);

    expect(built.db.loadRoom()).toEqual(built.room.state);

    await built.close();
    apps.splice(apps.indexOf(built), 1);

    const second = await start({ dataDir });
    const light = second.built.room.state.lights.find((l) => l.id === 'desk_lamp');
    expect(light?.intensity).toBe(0.33);

    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('broadcasts a user_message turn (message, deltas, final message) to two connected tabs', async () => {
    const or = await orStub([{ chunks: [chunk('Hi'), chunk(' there'), chunk(undefined, 'stop')] }]);

    const { wsUrl } = await start({ or });
    const a = connectWs(wsUrl);
    const b = connectWs(wsUrl);
    await Promise.all([a.opened, b.opened]);
    await waitFor(() => a.events.length >= 4 && b.events.length >= 4);

    const aBefore = a.events.length;
    const bBefore = b.events.length;
    a.ws.send(JSON.stringify({ type: 'user_message', text: 'hello nix' }));

    await waitFor(() => {
      const aFinal = a.events.slice(aBefore).filter((e) => e.type === 'message' && e.message.role === 'agent' && e.message.status === 'ok');
      const bFinal = b.events.slice(bBefore).filter((e) => e.type === 'message' && e.message.role === 'agent' && e.message.status === 'ok');
      return aFinal.length >= 1 && bFinal.length >= 1;
    });

    for (const { events, before } of [{ events: a.events, before: aBefore }, { events: b.events, before: bBefore }]) {
      const slice = events.slice(before);
      const userMsg = slice.find((e) => e.type === 'message' && e.message.role === 'user');
      expect(userMsg).toMatchObject({ message: { text: 'hello nix', status: 'ok' } });
      const deltas = slice.filter((e) => e.type === 'nix_delta');
      expect(deltas.length).toBe(2);
      const finalMsg = slice.find((e) => e.type === 'message' && e.message.role === 'agent' && e.message.status === 'ok');
      expect(finalMsg).toMatchObject({ message: { text: 'Hi there', status: 'ok' } });
    }
  });

  it('a user_message sent while a turn is active is rejected back to that tab with its text (draft restore), and no second turn starts', async () => {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    const stub = await orStub([{ chunks: [chunk('ok'), chunk(undefined, 'stop')], holdUntil: released }]);
    const { built, wsUrl } = await start({ or: stub });
    const { ws, opened, events } = connectWs(wsUrl);
    await opened;
    await waitFor(() => events.length >= 4);
    const before = events.length;

    ws.send(JSON.stringify({ type: 'user_message', text: 'first' }));
    ws.send(JSON.stringify({ type: 'user_message', text: 'second draft' }));

    await waitFor(() => events.slice(before).some((e) => e.type === 'turn_rejected'));
    expect(events.slice(before).find((e) => e.type === 'turn_rejected')).toEqual({
      type: 'turn_rejected',
      reason: 'busy',
      text: 'second draft',
    });

    release();
    await waitFor(() => built.relay.busy === false && events.slice(before).some((e) => e.type === 'link'));
    const userTexts = events
      .slice(before)
      .filter((e) => e.type === 'message' && e.message.role === 'user')
      .map((e) => (e as Extract<ServerEvent, { type: 'message' }>).message.text);
    expect(userTexts).toEqual(['first']);
    expect(stub.requests.filter((r) => r.url.endsWith('/chat/completions'))).toHaveLength(1);
  });

});

describe('tool lines in a direct turn', () => {
  it("a set_light call mid-turn broadcasts a tool_line with the streaming reply's id, persisted in its toolLines", async () => {
    const call = { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'set_light', arguments: JSON.stringify({ light_id: 'monitor', intensity: 0.7 }) } }] }, finish_reason: null }] };
    const or = await orStub([{ chunks: [call, chunk(undefined, 'tool_calls')] }, { chunks: [chunk('Hi there'), chunk(undefined, 'stop')] }]);
    const { built, wsUrl } = await start({ or });
    const { opened, events } = connectWs(wsUrl);
    await opened;
    await waitFor(() => events.length >= 4 && events.some((e) => e.type === 'model'));
    const before = events.length;

    expect(await built.relay.send('you', 'dim it')).toEqual({ ok: true, text: 'ok' });

    const reply = built.db.recentMessages('you').findLast((m) => m.role === 'agent')!;
    await waitFor(() => events.slice(before).some((e) => e.type === 'tool_line'));
    expect(events.slice(before).find((e) => e.type === 'tool_line')).toMatchObject({ type: 'tool_line', messageId: reply.id });
    expect(reply.toolLines).toHaveLength(1);
    expect(reply.toolLines[0]).toContain('SET_LIGHT');
    expect(reply).toMatchObject({ status: 'ok', text: 'Hi there' });
  });
});

describe('the link after a rejected key', () => {
  it('the health poll does not flip LINK OK back on after a 401 turn, until a turn succeeds (her /key probe can still say ok)', async () => {
    const or = await orStub([{ status: 401, json: { error: { message: 'bad key' } } }]);
    const { built } = await start({ or });

    await built.checkHealth();
    expect(built.linkStatus()).toBe('ok');

    expect(await built.relay.send('you', 'hello')).toEqual({ ok: false, error: 'auth' });
    expect(built.linkStatus()).toBe('down');
    await built.checkHealth();
    expect(built.linkStatus()).toBe('down');

    const failedId = built.db.recentMessages('you').find((m) => m.role === 'user')!.id;
    expect(await built.relay.retry('you', failedId)).toEqual({ ok: true, text: 'ok' });
    expect(built.linkStatus()).toBe('ok');
    await built.checkHealth();
    expect(built.linkStatus()).toBe('ok');
  });
});

describe('buildApp startup recovery', () => {
  it('marks messages left streaming by a crashed server as lost before serving history', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-app-recover-'));
    // No persona in these tests: the app's default player is 'you'.
    const dbPath = seedRoomDb(dir);
    try {
      const seed = openDb(dbPath, { defaultPlayer: 'you' });
      seed.insertMessage('you', { id: 'u1', role: 'user', text: 'hi', toolLines: [], ts: 1, status: 'ok' });
      seed.insertMessage('you', { id: 'n1', role: 'agent', text: '', toolLines: [], ts: 2, status: 'streaming', replyTo: 'u1' });
      seed.close();

      const { built, wsUrl } = await start({ dataDir: dir });
      const { opened, events } = connectWs(wsUrl);
      await opened;
      await waitFor(() => events.some((e) => e.type === 'history'));
      const history = events.find((e) => e.type === 'history') as Extract<ServerEvent, { type: 'history' }>;
      expect(history.messages.map((m) => [m.id, m.status])).toEqual([
        ['u1', 'ok'],
        ['n1', 'lost'],
      ]);
      expect(built.db.getMessage('you', 'n1')?.status).toBe('lost');
    } finally {
      while (sockets.length > 0) sockets.pop()!.close();
      while (apps.length > 0) {
        const b = apps.pop()!;
        await b.app.close();
        b.db.close();
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildApp migration under a broken persona', () => {
  it("an old DB opened while persona.json names a character that fails to load migrates its rows to that id, not 'you'", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-app-brokenpersona-'));
    const dbPath = seedRoomDb(dir, 'hicks');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const old = new DatabaseSync(dbPath);
      old.exec(`CREATE TABLE messages (id TEXT PRIMARY KEY, role TEXT NOT NULL, text TEXT NOT NULL,
        tool_lines TEXT NOT NULL, ts INTEGER NOT NULL, status TEXT NOT NULL, reply_to TEXT)`);
      old.exec(`INSERT INTO messages VALUES ('old', 'user', 'hi', '[]', 1, 'ok', NULL)`);
      old.close();

      // No characters/hicks: the persona itself fails to load (null), but the player is still 'hicks'.
      const { built, baseUrl } = await start({ dataDir: dir, persona: { character: 'hicks' } });
      expect(built.db.getMessage('hicks', 'old')).toMatchObject({ id: 'old', text: 'hi' });
      expect(built.db.getMessage('you', 'old')).toBeUndefined();
      // No persona line or sprite for the default player.
      expect(await (await fetch(`${baseUrl}/api/persona`)).json()).toEqual({ persona: null });
    } finally {
      warn.mockRestore();
      while (sockets.length > 0) sockets.pop()!.close();
      while (apps.length > 0) {
        const b = apps.pop()!;
        await b.app.close();
        b.db.close();
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('model routes', () => {
  const cleanups: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });

  /** A direct character ('direct') on a stubbed OpenRouter catalog. */
  async function startModelApp(opts: { key?: string | null; steps?: StubOpenRouterStep[] } = {}) {
    const or = await startStubOpenRouter(opts.steps ?? [{ chunks: [chunk('Hi.'), chunk(undefined, 'stop')] }]);
    cleanups.push(() => or.close());
    or.models = {
      status: 200,
      json: { data: [{ id: 'z-ai/glm-5.2', name: 'Z.ai: GLM 5.2' }, { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek: V3.2' }] },
    };
    const { cfg } = await makeFixture([]);
    const dir = path.join(cfg.charactersDir, 'direct');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'character.json'),
      JSON.stringify({ name: 'Direct', identity: 'identity.md', backend: { provider: 'openrouter', model: 'z-ai/glm-5.2' } }),
    );
    fs.writeFileSync(path.join(dir, 'identity.md'), 'You are Direct.');
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    const settings = openSettings(cfg.dataDir);
    const key = opts.key === undefined ? 'sk-or-model-routes' : opts.key;
    if (key !== null) settings.setKey('openrouter', key);
    cfg.openrouterBaseUrl = or.url;
    const app = await buildApp(cfg, { settings });
    cleanups.push(() => app.close());
    await app.app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.app.server.address();
    if (!address || typeof address === 'string') throw new Error('expected a network address');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const wsUrl = `ws://127.0.0.1:${address.port}/ws/direct`;
    return { app, baseUrl, wsUrl, or, settings };
  }

  it('the scribe runs after her reply in a playthrough: one call on her model, its note in her journal, a dev line (scribe spec §2)', async () => {
    const { wsUrl, or, app } = await startModelApp();
    or.scribe.json = { choices: [{ message: { content: '{"notes":[{"op":"add","about":"you","text":"said hello first","keys":["hello"],"pin":true}]}' } }], usage: { prompt_tokens: 900, completion_tokens: 40 } };
    const { opened, events, ws } = connectWs(wsUrl);
    await opened;
    ws.send(JSON.stringify({ type: 'user_message', text: 'hello' }));
    await waitFor(() => events.some((e) => e.type === 'dev_log' && e.text.startsWith('scribe ·')));
    expect(or.scribeRequests).toHaveLength(1);
    const body = or.scribeRequests[0].body as { model: string; stream: boolean; max_tokens: number; temperature: number; messages: { content: string }[] };
    expect(body).toMatchObject({ model: 'z-ai/glm-5.2', stream: false, max_tokens: 600, temperature: 0.2 });
    expect(body.messages[1].content).toContain(': hello');
    expect(body.messages[1].content).toContain('Direct: Hi.');
    const rt = (await app.runtime('direct'))!;
    expect(rt.journal.notes(rt.relay.activePlayer).map((n) => n.text)).toEqual(['said hello first']);
    expect(rt.db.scribeRuns(1)[0]).toMatchObject({ kind: 'turn', tokensIn: 900, tokensOut: 40, error: null });
  });

  it('standing reaches a direct character in a playthrough: the block in her prompt and shift_standing in her tools (deferred minor: runtime wiring)', async () => {
    const { wsUrl, or } = await startModelApp();
    const { opened, events, ws } = connectWs(wsUrl);
    await opened;
    ws.send(JSON.stringify({ type: 'user_message', text: 'hello' }));
    await waitFor(() => events.some((e) => e.type === 'message' && e.message.role === 'agent' && e.message.status === 'ok'));
    const body = or.requests.filter((r) => r.method === 'POST').at(-1)!.body as { messages: { role: string; content: string }[]; tools?: { function: { name: string } }[] };
    // It rides at the start of the latest user message now (cache order), not in the system message.
    const last = body.messages.at(-1)!.content;
    expect(last).toContain('[how you feel about');
    expect(last).toContain('"Sizing you up"');
    expect(body.messages[0].content).not.toContain('[how you feel about');
    // The scribe moves standing now (scribe spec): never one of her tools.
    expect((body.tools ?? []).map((t) => t.function.name)).not.toContain('shift_standing');
  });

  it('an out-of-character turn gets neither the block nor shift_standing (deferred minor)', async () => {
    const { wsUrl, or } = await startModelApp();
    const { opened, events, ws } = connectWs(wsUrl);
    await opened;
    ws.send(JSON.stringify({ type: 'user_message', text: 'quick question', mode: 'ooc' }));
    await waitFor(() => events.some((e) => e.type === 'message' && e.message.role === 'agent' && e.message.status === 'ok'));
    const body = or.requests.filter((r) => r.method === 'POST').at(-1)!.body as { messages: { role: string; content: string }[]; tools?: { function: { name: string } }[] };
    expect(JSON.stringify(body.messages)).not.toContain('[how you feel about');
    expect((body.tools ?? []).map((t) => t.function.name)).not.toContain('shift_standing');
  });

  it('her model comes from settings.characterModels, else her default', async () => {
    const { baseUrl, settings } = await startModelApp();
    const get = async () => ((await (await fetch(`${baseUrl}/api/agents/direct/models`)).json()) as { model: string }).model;
    expect(await get()).toBe('z-ai/glm-5.2');
    settings.setCharacterModel('direct', 'deepseek/deepseek-v3.2');
    expect(await get()).toBe('deepseek/deepseek-v3.2');
  });

  it('choosing a model writes characterModels and pushes it onto recents', async () => {
    const { baseUrl, settings } = await startModelApp();
    const res = await fetch(`${baseUrl}/api/agents/direct/model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek/deepseek-v3.2' }),
    });
    expect(res.status).toBe(204);
    expect(settings.characterModel('direct')).toBe('deepseek/deepseek-v3.2');
    expect(settings.recentModels()).toEqual(['deepseek/deepseek-v3.2']);
  });

  it('her model is a setting, not saved: a save made on one model loads on the one picked last', async () => {
    const { baseUrl } = await startModelApp();
    const post = (url: string, body?: unknown) =>
      fetch(`${baseUrl}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    const model = async () => ((await (await fetch(`${baseUrl}/api/agents/direct/models`)).json()) as { model: string }).model;
    const pt = ((await (await fetch(`${baseUrl}/api/playthroughs`)).json()) as { active: string }).active;
    expect((await post('/api/agents/direct/model', { model: 'deepseek/deepseek-v3.2' })).status).toBe(204);
    const saved = await post(`/api/playthroughs/${pt}/saves`, { name: 'on deepseek' });
    expect(saved.status).toBe(200);
    const saveId = ((await saved.json()) as { id: string }).id;
    expect((await post('/api/agents/direct/model', { model: 'z-ai/glm-5.2' })).status).toBe(204);
    expect((await post(`/api/saves/${saveId}/load`)).status).toBe(200);
    expect(await model()).toBe('z-ai/glm-5.2');
  });

  it('a send with no key is refused with no-link: nothing stored, no request', async () => {
    const { wsUrl, or } = await startModelApp({ key: null });
    const { opened, events, ws } = connectWs(wsUrl);
    await opened;
    ws.send(JSON.stringify({ type: 'user_message', text: 'hello?' }));
    await waitFor(() => events.some((e) => e.type === 'turn_rejected'));
    expect(events.find((e) => e.type === 'turn_rejected')).toEqual({ type: 'turn_rejected', reason: 'no-link', text: 'hello?' });
    expect(or.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
    expect(events.some((e) => e.type === 'message' && e.message.role === 'user')).toBe(false);
  });

  it('deleting the key mid-session: the next send is refused with no-link', async () => {
    const { wsUrl, settings } = await startModelApp();
    const { opened, events, ws } = connectWs(wsUrl);
    await opened;
    settings.deleteKey('openrouter');
    ws.send(JSON.stringify({ type: 'user_message', text: 'still there?' }));
    await waitFor(() => events.some((e) => e.type === 'turn_rejected'));
    expect(events.find((e) => e.type === 'turn_rejected')).toMatchObject({ reason: 'no-link' });
  });

  it('relinking after a 401 clears the dead link: resetProbe brings the room back to ok', async () => {
    const { wsUrl, settings, app } = await startModelApp({ steps: [{ status: 401, json: { error: { message: 'No auth credentials found' } } }] });
    const { opened, events, ws } = connectWs(wsUrl);
    await opened;
    ws.send(JSON.stringify({ type: 'user_message', text: 'hi' }));
    await waitFor(() => events.some((e) => e.type === 'dev_log' && e.text.includes('401')));
    expect(events.filter((e) => e.type === 'link').at(-1)).toEqual({ type: 'link', status: 'down' });
    settings.setKey('openrouter', 'sk-or-good-key');
    await (await app.runtime('direct'))!.resetProbe();
    await waitFor(() => events.filter((e) => e.type === 'link').at(-1)?.status === 'ok');
  });

  it('after a key is set, resetProbe moves the link from no-link to ok', async () => {
    const { app, settings } = await startModelApp({ key: null });
    const rt = (await app.runtime('direct'))!;
    expect(await rt.probe()).toBe('no-link');
    settings.setKey('openrouter', 'sk-or-later');
    await rt.resetProbe();
    expect(await rt.probe()).toBe('ok');
  });

  it('POST model null resets to her default and leaves recents alone', async () => {
    const { baseUrl, settings } = await startModelApp();
    settings.setCharacterModel('direct', 'deepseek/deepseek-v3.2');
    settings.pushRecent('deepseek/deepseek-v3.2');
    const res = await fetch(`${baseUrl}/api/agents/direct/model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: null }),
    });
    expect(res.status).toBe(204);
    expect(settings.characterModel('direct')).toBeNull();
    expect(settings.recentModels()).toEqual(['deepseek/deepseek-v3.2']);
    const get = await fetch(`${baseUrl}/api/agents/direct/models`);
    expect(((await get.json()) as { model: string }).model).toBe('z-ai/glm-5.2');
  });

  it('GET /api/agents/:id/models includes her default', async () => {
    const { baseUrl } = await startModelApp();
    const body = (await (await fetch(`${baseUrl}/api/agents/direct/models`)).json()) as { default: string };
    expect(body.default).toBe('z-ai/glm-5.2');
  });

  it('the app serves /api/link and /api/models', async () => {
    const { baseUrl } = await startModelApp();
    const link = (await (await fetch(`${baseUrl}/api/link`)).json()) as { linked: boolean; last4: string };
    expect(link).toMatchObject({ linked: true, last4: 'utes' });
    const models = (await (await fetch(`${baseUrl}/api/models`)).json()) as { picks: { id: string }[] };
    expect(models.picks.map((p) => p.id)).toEqual(['z-ai/glm-5.2']);
  });

  it('GET /api/agents/:id/models returns the direct picker event', async () => {
    const { baseUrl } = await startModelApp();
    const res = await fetch(`${baseUrl}/api/agents/direct/models`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { type: string; model: string; choices: { id: string }[] };
    expect(body.type).toBe('model');
    expect(body.model).toBe('z-ai/glm-5.2');
    expect(body.choices.length).toBeGreaterThan(0);
  });

  it('POST /api/agents/:id/model saves a known model and broadcasts it to open tabs', async () => {
    const { baseUrl, wsUrl } = await startModelApp();
    const { opened, events } = connectWs(wsUrl);
    await opened;
    await waitFor(() => events.some((e) => e.type === 'model'));

    const res = await fetch(`${baseUrl}/api/agents/direct/model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'deepseek/deepseek-v3.2' }),
    });
    expect(res.status).toBe(204);

    await waitFor(() => events.filter((e) => e.type === 'model').some((e) => (e as { model: string }).model === 'deepseek/deepseek-v3.2'));

    const get = await fetch(`${baseUrl}/api/agents/direct/models`);
    expect(((await get.json()) as { model: string }).model).toBe('deepseek/deepseek-v3.2');
  });

  it('POST /api/agents/:id/model still answers 204 when the broadcast fails after the save', async () => {
    const { app, baseUrl } = await startModelApp();
    const rt = (await app.runtime('direct'))!;
    rt.models!.event = () => Promise.reject(new Error('catalog down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const res = await fetch(`${baseUrl}/api/agents/direct/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'deepseek/deepseek-v3.2' }),
      });
      expect(res.status).toBe(204);
    } finally {
      warn.mockRestore();
    }
  });

  it.each([
    ['an unknown model', { model: 'nope/nope' }, 400, 'unknown-model'],
    ['an empty model', { model: '' }, 400, 'bad-model'],
    ['a 201-character model', { model: 'x'.repeat(201) }, 400, 'bad-model'],
    ['no body field', {}, 400, 'bad-model'],
  ])('POST with %s → %i %s', async (_label, body, status, error) => {
    const { baseUrl } = await startModelApp();
    const res = await fetch(`${baseUrl}/api/agents/direct/model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(res.status).toBe(status);
    expect((await res.json()) as { error: string }).toEqual({ error });
  });

  it('GET/POST on an unknown id → 404', async () => {
    const { baseUrl } = await startModelApp();

    const getUnknown = await fetch(`${baseUrl}/api/agents/nope/models`);
    expect(getUnknown.status).toBe(404);
    expect(await getUnknown.json()).toEqual({ error: 'unknown agent' });

    const postUnknown = await fetch(`${baseUrl}/api/agents/nope/model`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'z-ai/glm-5.2' }),
    });
    expect(postUnknown.status).toBe(404);
    expect(await postUnknown.json()).toEqual({ error: 'unknown agent' });
  });

});

describe('bug report wiring', () => {
  it('saves a report with the game state when no relay is set', async () => {
    const { baseUrl } = await start();
    const res = await fetch(`${baseUrl}/api/bug-report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'Nix froze', contact: '', includeTurns: true, screenshot: null }),
    });
    const json = (await res.json()) as { sent: boolean; reason: string; file: string };
    expect(json).toMatchObject({ sent: false, reason: 'no report address in this build' });
    const { unzipSync, strFromU8 } = await import('fflate');
    const report = strFromU8(unzipSync(fs.readFileSync(json.file))['report.txt']);
    expect(report).toContain('Nix froze');
    expect(report).toContain(`Node ${process.versions.node}`);
    expect(report).toMatch(/Version: \d+\.\d+\.\d+/);

    const ctx = (await (await fetch(`${baseUrl}/api/bug-report/context`)).json()) as { playthroughName: string | null; hasTurns: boolean };
    expect(typeof ctx.playthroughName).toBe('string');
  });
});

describe('bug report turns', () => {
  it('reads the last turns from the contact database and says hasTurns', async () => {
    const { baseUrl, built } = await start();
    const before = (await (await fetch(`${baseUrl}/api/bug-report/context`)).json()) as { hasTurns: boolean };
    expect(before.hasTurns).toBe(false);
    built.db.insertMessage('you', { id: 'bt1', role: 'user', text: 'Where is the noodle stall?', toolLines: [], ts: Date.now(), status: 'ok' });
    built.db.insertMessage('you', { id: 'bt2', role: 'agent', text: 'Two blocks down.', toolLines: [], ts: Date.now() + 1, status: 'ok' });
    const after = (await (await fetch(`${baseUrl}/api/bug-report/context`)).json()) as { hasTurns: boolean };
    expect(after.hasTurns).toBe(true);
    const res = await fetch(`${baseUrl}/api/bug-report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'turns?', contact: '', includeTurns: true, screenshot: null }),
    });
    const { file } = (await res.json()) as { file: string };
    const { unzipSync, strFromU8 } = await import('fflate');
    const report = strFromU8(unzipSync(fs.readFileSync(file))['report.txt']);
    expect(report).toContain('Where is the noodle stall?');
    expect(report).toContain(': Two blocks down.');
  });
});
