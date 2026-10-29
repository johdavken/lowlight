import { openSettings } from '../src/settings';
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { buildApp } from '../src/app';
import { makeFixture } from './fixtures/agents';
import { startStubOpenRouter, chunk, okStep } from './fixtures/stub-openrouter';
import { dispatchTool } from '../src/tools';
import type { ServerEvent } from '../../shared/types';

const TOKEN = 'test-token-123456789';
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

/** Two direct contacts on one OpenRouter stub (alpha with no rooms of her own, beta in karasu) and gamma with no backend. */
async function startTwo() {
  const or = await startStubOpenRouter([], { fallback: okStep('here') });
  cleanups.push(() => or.close());
  const { cfg } = await makeFixture([{ id: 'alpha', direct: true }, { id: 'beta', direct: true, pack: 'karasu' }, { id: 'gamma' }], undefined, { openrouterUrl: or.url });
  const built = await buildApp(cfg);
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  cleanups.push(() => built.close());
  const addr = built.app.server.address() as { port: number };
  return { built, base: `http://127.0.0.1:${addr.port}`, ws: `ws://127.0.0.1:${addr.port}`, or, cfg };
}

function socket(url: string) {
  const ws = new WebSocket(`${url}?token=${TOKEN}`, { headers: { Origin: 'http://localhost:5173' } });
  const events: ServerEvent[] = [];
  ws.on('message', (d) => events.push(JSON.parse(d.toString())));
  ws.on('error', () => {});
  const closed = new Promise<number>((r) => ws.on('close', (c) => r(c)));
  const opened = new Promise<void>((r) => ws.on('open', () => r()));
  cleanups.push(() => ws.close());
  return { ws, events, closed, opened };
}

const until = async (p: () => boolean) => {
  const t = Date.now();
  while (!p()) {
    if (Date.now() - t > 3000) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('one server, many agents (Review Focus 1)', () => {
  it("a tool call in alpha's room changes only alpha's room, and beta's socket hears nothing", async () => {
    const { built, ws } = await startTwo();
    const b = socket(`${ws}/ws/beta`);
    await b.opened;
    await until(() => b.events.some((e) => e.type === 'portrait') && b.events.some((e) => e.type === 'model'));
    const before = b.events.length;
    expect(dispatchTool((await built.runtime('alpha'))!.tools, 'set_ambient', { level: 0.05, duration: 0 }, 'agent').ok).toBe(true);
    const alphaRoom = (await built.runtime('alpha'))!.room;
    const betaRoom = (await built.runtime('beta'))!.room;
    expect(alphaRoom.state.atmosphere.ambientLevel).toBe(0.05);
    expect(betaRoom.state.atmosphere.ambientLevel).not.toBe(0.05);
    await new Promise((r) => setTimeout(r, 100));
    expect(b.events.length).toBe(before);
  });

  it("alpha's journal and recap never reach beta: events, journal line, own DB, landing entry", async () => {
    const { built, base, ws } = await startTwo();
    const b = socket(`${ws}/ws/beta`);
    await b.opened;
    await until(() => b.events.some((e) => e.type === 'journal') && b.events.some((e) => e.type === 'model'));
    const before = b.events.length;
    const alpha = (await built.runtime('alpha'))!;
    expect(dispatchTool(alpha.tools, 'note', { text: 'alpha only', pinned: true }, 'dev').ok).toBe(true);
    expect(dispatchTool(alpha.tools, 'set_recap', { text: 'alpha recap' }, 'dev').ok).toBe(true);
    const beta = (await built.runtime('beta'))!;
    expect(alpha.journal.journalLine('you', [])).toContain('alpha only');
    expect(beta.journal.journalLine('you', [])).toBeNull();
    expect(beta.db.listNotes('you')).toEqual([]);
    await new Promise((r) => setTimeout(r, 100));
    expect(b.events.slice(before)).toEqual([]);
    const { agents } = (await (await fetch(`${base}/api/agents`)).json()) as { agents: Array<{ id: string; recaps: Record<string, string> }> };
    const recapOf = Object.fromEntries(agents.map((a) => [a.id, a.recaps.you ?? null]));
    expect(recapOf).toEqual({ alpha: 'alpha recap', beta: null, gamma: null });
  });

  it('the landing recap is the text only while unseen', async () => {
    const { built, base } = await startTwo();
    const alpha = (await built.runtime('alpha'))!;
    alpha.journal.setRecap('you', 'we closed up at dawn', 'agent');
    const recap = async () =>
      ((await (await fetch(`${base}/api/agents`)).json()) as { agents: Array<{ id: string; recaps: Record<string, string> }> }).agents.find(
        (a) => a.id === 'alpha',
      )!.recaps.you ?? null;
    expect(await recap()).toBe('we closed up at dawn');
    alpha.journal.markRecapSeen('you');
    expect(await recap()).toBeNull();
  });

  it("a chat turn in alpha's room goes out as alpha only, and each agent has her own DB", async () => {
    const { ws, or, cfg, built } = await startTwo();
    const a = socket(`${ws}/ws/alpha`);
    await a.opened;
    a.ws.send(JSON.stringify({ type: 'user_message', text: 'hi' }));
    await until(() => a.events.some((e) => e.type === 'message' && e.message.role === 'agent' && e.message.status === 'ok'));
    const posts = or.requests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].body.messages[0].content.startsWith('You are Alpha.')).toBe(true);
    expect(fs.existsSync(path.join(cfg.playthroughsDir, built.world.active()!.id, 'chars', 'beta', 'room.db'))).toBe(false);
    expect(fs.existsSync(path.join(cfg.playthroughsDir, built.world.active()!.id, 'chars', 'alpha', 'room.db'))).toBe(true);
  });

  it('unconnected or unknown agents get 4404 on /ws', async () => {
    const { ws } = await startTwo();
    expect(await socket(`${ws}/ws/gamma`).closed).toBe(4404);
    expect(await socket(`${ws}/ws/zzz`).closed).toBe(4404);
  });

  it('initial sync: every room in the city, each contact in her own start room, and who it belongs to', async () => {
    const { ws } = await startTwo();
    const a = socket(`${ws}/ws/alpha`);
    const b = socket(`${ws}/ws/beta`);
    await until(() => a.events.some((e) => e.type === 'portrait') && b.events.some((e) => e.type === 'portrait'));
    for (const s of [a, b]) {
      const ids = (s.events.find((e) => e.type === 'scenes') as { scenes: { id: string }[] }).scenes.map((x) => x.id);
      expect(ids).toEqual(expect.arrayContaining(['default/workspace', 'karasu/noodle-stall']));
    }
    expect((a.events.find((e) => e.type === 'room') as { state: { sceneId: string } }).state.sceneId).toBe('default/workspace');
    expect((b.events.find((e) => e.type === 'room') as { state: { sceneId: string } }).state.sceneId).toBe('karasu/lowlight-intake');
    expect(a.events.find((e) => e.type === 'portrait')).toMatchObject({ name: 'Alpha', kind: 'monogram', url: '/api/agents/alpha/avatar' });
  });

});

describe('/api/agents (Review Focus 2)', () => {
  it('lists every agent with link state, and never includes keys or tokens', async () => {
    const { base } = await startTwo();
    const res = await fetch(`${base}/api/agents`);
    const text = await res.text();
    const body = JSON.parse(text);
    const byId = Object.fromEntries(body.agents.map((a: any) => [a.id, a]));
    expect(byId.alpha).toMatchObject({ connected: true, link: 'ok' });
    expect(byId.beta).toMatchObject({ connected: true, link: 'ok' });
    expect(byId.gamma).toMatchObject({ connected: false, link: 'unknown' });
    expect(text).not.toContain('sk-or-fixture');
  });

  it("one agent whose room can't open doesn't take down the list: she's flagged room-error, the rest are fine", async () => {
    const { base, cfg, built } = await startTwo();
    // A directory where her DB file should be: openDb throws for beta only.
    fs.mkdirSync(path.join(cfg.playthroughsDir, built.world.active()!.id, 'chars', 'beta', 'room.db'), { recursive: true });
    const res = await fetch(`${base}/api/agents`);
    expect(res.status).toBe(200);
    const { agents } = (await res.json()) as { agents: Array<{ id: string; link: string }> };
    expect(Object.fromEntries(agents.map((a) => [a.id, a.link]))).toEqual({ alpha: 'ok', beta: 'room-error', gamma: 'unknown' });
  });

  it("serves an agent's sprite, 404 without one, and the room's portrait event carries it", async () => {
    const { base, ws, cfg } = await startTwo();
    // alpha gets a sprite through a character file (fixtures write none by default)
    fs.mkdirSync(path.join(cfg.charactersDir, 'alpha'), { recursive: true });
    fs.copyFileSync(path.join(__dirname, '..', '..', 'characters', 'nix', 'nix-outfit-outdoors.png'), path.join(cfg.charactersDir, 'alpha', 'sprite.png'));
    const alphaJson = path.join(cfg.charactersDir, 'alpha', 'character.json');
    fs.writeFileSync(alphaJson, JSON.stringify({ ...JSON.parse(fs.readFileSync(alphaJson, 'utf8')), sprite: { src: 'sprite.png' } }));
    await fetch(`${base}/api/agents`); // re-reads the registry, as the landing page does
    const res = await fetch(`${base}/api/agents/alpha/sprite`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000); // read it, so the connection can close
    const none = await fetch(`${base}/api/agents/beta/sprite`);
    expect(none.status).toBe(404);
    await none.text();
    const a = socket(`${ws}/ws/alpha`);
    await a.opened;
    await until(() => a.events.some((e) => e.type === 'portrait'));
    expect(a.events.find((e) => e.type === 'portrait')).toMatchObject({ sprite: { url: '/api/agents/alpha/sprite', crop: { top: 0, bottom: 0.5 } } });
  });

  it("Nix's shipped character uses her sprite and has happy, annoyed, concerned and tired expressions", async () => {
    const { loadCharacter } = await import('../src/character');
    const nix = loadCharacter(path.join(__dirname, '..', '..', 'characters', 'nix'));
    expect(nix?.sprite).toMatchObject({ src: 'nix-outfit-outdoors.png' });
    expect(Object.keys(nix?.expressions as Record<string, string>)).toEqual(['happy', 'annoyed', 'concerned', 'tired']);
  });

  it('/api/agents gives each agent her rooms and start room, and no pack', async () => {
    const { base } = await startTwo();
    const { agents } = (await (await fetch(`${base}/api/agents`)).json()) as { agents: Record<string, unknown>[] };
    const beta = agents.find((x) => x.id === 'beta')!;
    expect(beta).toMatchObject({ rooms: ['karasu/lowlight-intake', 'karasu/noodle-stall', 'karasu/ribbon-rooftop'], startRoom: 'karasu/lowlight-intake' });
    expect('scenePack' in beta).toBe(false);
  });

  it("/api/agents names each agent's start room with its default time and weather (SET THE SCENE's header)", async () => {
    const { base } = await startTwo();
    const { agents } = (await (await fetch(`${base}/api/agents`)).json()) as { agents: Record<string, unknown>[] };
    expect(agents.find((x) => x.id === 'beta')!.start).toEqual({ name: 'Lowlight Intake', timeOfDay: 'night', weather: 'rain' });
  });

  it('serves a pack scene list for the landing preview', async () => {
    const { base } = await startTwo();
    const body = await (await fetch(`${base}/api/packs/default/scenes`)).json();
    expect(body.base).toBe('/scenes/default/');
    expect(body.scenes.map((s: any) => s.id).sort()).toEqual(['rooftop', 'workspace']);
    expect((await fetch(`${base}/api/packs/nope/scenes`)).status).toBe(404);
  });

  it('serves the game\'s songs for the dial-in shuffle', async () => {
    const { base } = await startTwo();
    const body = await (await fetch(`${base}/api/songs`)).json();
    expect(Array.isArray(body.songs)).toBe(true);
  });
});

describe('direct characters in the room', () => {
  async function withDirect(manualClose = false) {
    const or = await startStubOpenRouter([{ chunks: [chunk('Hi from GLM.'), chunk(undefined, 'stop')] }]);
    cleanups.push(() => or.close());
    const { cfg } = await makeFixture([]);
    const dir = path.join(cfg.charactersDir, 'alpha-direct');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({ name: 'Alpha', identity: 'identity.md', backend: { provider: 'openrouter', model: 'z-ai/glm-5.2' } }));
    fs.writeFileSync(path.join(dir, 'identity.md'), '# Alpha\nShe keeps the lights.');
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    openSettings(cfg.dataDir).setKey('openrouter', 'sk-or-multi');
    cfg.openrouterBaseUrl = or.url;
    const built = await buildApp(cfg);
    if (!manualClose) cleanups.push(() => built.close());
    return { built, cfg, or };
  }

  it('a direct agent gets a runtime with a direct backend', async () => {
    const { built, or } = await withDirect();
    const direct = (await built.runtime('alpha-direct'))!;
    expect(await direct.relay.send('you', 'hello')).toEqual({ ok: true, text: 'ok' });
    expect(direct.db.recentMessages('you', 5).find((m) => m.role === 'agent')).toMatchObject({ text: 'Hi from GLM.', model: 'z-ai/glm-5.2' });
    const post = or.requests.find((r) => r.method === 'POST')!;
    expect(post.body.messages[0].content.startsWith('# Alpha\n')).toBe(true);
  });

  it("this playthrough's identity.md replaces her shared one, from her next turn", async () => {
    const { built, cfg, or } = await withDirect();
    const direct = (await built.runtime('alpha-direct'))!;
    const { active } = JSON.parse(fs.readFileSync(path.join(cfg.playthroughsDir, 'index.json'), 'utf8'));
    fs.writeFileSync(path.join(cfg.playthroughsDir, active, 'chars', 'alpha-direct', 'identity.md'), '# Alpha, this time\nShe cut the lights.');
    await direct.relay.send('you', 'hello');
    const post = or.requests.find((r) => r.method === 'POST')!;
    expect(post.body.messages[0].content.startsWith('# Alpha, this time\n')).toBe(true);
  });

  it("the agent list shows a direct agent's current model with the catalog's label", async () => {
    const { built, or } = await withDirect();
    or.models = { status: 200, json: { data: [{ id: 'z-ai/glm-5.2', name: 'Z.ai: GLM 5.2' }, { id: 'google/gemini-3.8-flash', name: 'Google: Gemini 3.8 Flash' }] } };
    const list = async () => (await built.app.inject({ method: 'GET', url: '/api/agents' })).json() as { agents: { id: string; modelLabel: string | null }[] };
    expect((await list()).agents.find((a) => a.id === 'alpha-direct')!.modelLabel).toBe('GLM 5.2');
    (await built.runtime('alpha-direct'))!.setModel!('google/gemini-3.8-flash');
    expect((await list()).agents.find((a) => a.id === 'alpha-direct')!.modelLabel).toBe('Gemini 3.8 Flash');
  });

  it('the model choice persists in meta across a runtime restart', async () => {
    const { built, cfg } = await withDirect(true);
    const rt = (await built.runtime('alpha-direct'))!;
    rt.setModel!('deepseek/deepseek-v3.2');
    expect(await rt.backend.currentModel()).toEqual({ model: 'deepseek/deepseek-v3.2', provider: 'openrouter' });
    await built.close();
    const again = await buildApp(cfg);
    cleanups.push(() => again.close());
    expect(await (await again.runtime('alpha-direct'))!.backend.currentModel()).toEqual({ model: 'deepseek/deepseek-v3.2', provider: 'openrouter' });
  });
});
