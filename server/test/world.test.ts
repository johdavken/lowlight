import { openSettings } from '../src/settings';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import { openDb } from '../src/db';
import { createPlaythroughs } from '../src/playthroughs';
import { makeFixture } from './fixtures/agents';
import { startStubOpenRouter, chunk } from './fixtures/stub-openrouter';
import type { ServerEvent } from '../../shared/types';

const TOKEN = 'test-token-123456789';
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

const until = async (p: () => boolean) => {
  const t = Date.now();
  while (!p()) {
    if (Date.now() - t > 3000) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

/** An OpenRouter stub whose chat replies wait for `release()` (held) or answer at once. */
async function stubFor(hold: boolean) {
  let release!: () => void;
  const released = hold ? new Promise<void>((r) => (release = r)) : Promise.resolve();
  const s = await startStubOpenRouter([], { fallback: { raw: [':\n\n'], chunks: [chunk('hello'), chunk(undefined, 'stop')], holdUntil: released } });
  cleanups.push(async () => {
    release?.();
    await s.close();
  });
  return { url: s.url, release: () => release() };
}

/** nix (a direct character on the ribbon pack) on the stub; `cfg` can be adjusted before the app is built. */
async function start(opts: { hold?: boolean; cast?: string[]; prepare?: (cfg: Config) => void } = {}) {
  const or = await stubFor(opts.hold ?? false);
  const { cfg } = await makeFixture([{ id: 'nix', direct: true, pack: 'karasu' }], undefined, { openrouterUrl: or.url });
  for (const id of opts.cast ?? []) {
    fs.mkdirSync(path.join(cfg.charactersDir, id), { recursive: true });
    fs.writeFileSync(path.join(cfg.charactersDir, id, 'character.json'), JSON.stringify({ name: id[0].toUpperCase() + id.slice(1) }));
  }
  opts.prepare?.(cfg);
  const built = await buildApp(cfg);
  cleanups.push(() => built.close());
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const addr = built.app.server.address() as { port: number };
  return { built, cfg, or, base: `http://127.0.0.1:${addr.port}`, ws: `ws://127.0.0.1:${addr.port}` };
}

function socket(url: string) {
  const ws = new WebSocket(url.includes('?') ? `${url}&token=${TOKEN}` : `${url}?token=${TOKEN}`, { headers: { Origin: 'http://localhost:5173' } });
  const events: ServerEvent[] = [];
  ws.on('message', (d) => events.push(JSON.parse(d.toString())));
  ws.on('error', () => {});
  const closed = new Promise<number>((r) => ws.on('close', (c) => r(c)));
  const opened = new Promise<void>((r) => ws.on('open', () => r()));
  cleanups.push(() => ws.close());
  return { ws, events, closed, opened };
}

const dbFile = (cfg: Config, pt: string, id: string) => path.join(cfg.playthroughsDir, pt, 'chars', id, 'room.db');

describe('lastLine after a greeting (Task 3 review 5)', () => {
  it("her greeting is a line: met through it, she shows what she said", async () => {
    const { lastLine } = await import('../src/world');
    const greet = (over: object) => ({ id: 'x', role: 'agent', text: 'Who are you?', toolLines: [], ts: 1, status: 'ok', mode: 'greet', ...over }) as never;
    expect(lastLine([greet({})], { player: 'Hicks', contact: 'Nix', residents: [] })).toEqual({ speaker: 'Nix', text: 'Who are you?' });
    expect(lastLine([greet({ role: 'user', text: '' })], { player: 'Hicks', contact: 'Nix', residents: [] })).toBeNull();
  });
});

describe('a world per playthrough', () => {
  it('runtime opens room.db under the active playthrough', async () => {
    const { built, cfg } = await start();
    const active = built.world.active();
    expect(active).not.toBeNull();
    await built.runtime('nix');
    expect(fs.existsSync(dbFile(cfg, active!.id, 'nix'))).toBe(true);
    expect(fs.existsSync(path.join(cfg.dataDir, 'nix', 'room.db'))).toBe(false);
  });

  it('no active playthrough builds in the lobby and refuses the socket', async () => {
    const or = await startStubOpenRouter([{ chunks: [chunk('Hi.'), chunk(undefined, 'stop')] }]);
    cleanups.push(() => or.close());
    or.models = { status: 200, json: { data: [{ id: 'z-ai/glm-5.2', name: 'Z.ai: GLM 5.2' }] } };
    const { built, cfg, base, ws } = await start({
      prepare: (c) => {
        c.autoPlaythrough = false;
        const dir = path.join(c.charactersDir, 'direct');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({ name: 'Direct', identity: 'identity.md', backend: { provider: 'openrouter', model: 'z-ai/glm-5.2' } }));
        fs.writeFileSync(path.join(dir, 'identity.md'), 'You are Direct.');
        fs.mkdirSync(c.dataDir, { recursive: true });
        openSettings(c.dataDir).setKey('openrouter', 'sk-or-world');
        c.openrouterBaseUrl = or.url;
      },
    });
    expect(built.world.active()).toBeNull();
    await built.runtime('nix');
    expect(fs.existsSync(path.join(cfg.playthroughsDir, '.lobby', 'chars', 'nix', 'room.db'))).toBe(true);

    const s = socket(`${ws}/ws/nix`);
    expect(await s.closed).toBe(4409);
    expect(s.events).toContainEqual({ type: 'notice', text: 'no playthrough' });

    const models = await fetch(`${base}/api/agents/direct/models`);
    expect(models.status).toBe(200);
    expect(((await models.json()) as { model: string }).model).toBe('z-ai/glm-5.2');
  });

  it('activate refuses while a turn streams', async () => {
    const { built, cfg, ws, or } = await start({ hold: true });
    const before = built.world.active()!;
    const other = createPlaythroughs(cfg.playthroughsDir).create({ player: before.player, startContact: 'nix' });
    const s = socket(`${ws}/ws/nix`);
    await s.opened;
    s.ws.send(JSON.stringify({ type: 'user_message', text: 'hi' }));
    const rt = (await built.runtime('nix'))!;
    await until(() => rt.relay.busy);

    expect(built.world.busy()).toBe('nix');
    expect(built.world.activate(other.id)).toEqual({ busy: 'nix' });
    expect(built.world.active()!.id).toBe(before.id);
    expect(built.runtimes()).toEqual([rt]);
    or.release();
    await until(() => !rt.relay.busy);
  });

  it('activate closes runtimes, emits world-changed and rebuilds lazily', async () => {
    const { built, cfg, ws } = await start();
    const other = createPlaythroughs(cfg.playthroughsDir).create({ player: built.world.active()!.player, startContact: 'nix' });
    const s = socket(`${ws}/ws/nix`);
    await s.opened;
    await until(() => s.events.some((e) => e.type === 'history'));

    const result = built.world.activate(other.id);
    expect(result).toMatchObject({ id: other.id });
    expect(await s.closed).toBe(4410);
    expect(s.events).toContainEqual({ type: 'world-changed', playthrough: other.id, location: null });
    expect(built.runtimes()).toEqual([]);
    expect(built.world.active()!.id).toBe(other.id);
    expect(built.world.stateDir()).toBe(path.join(cfg.playthroughsDir, other.id, 'chars'));

    await built.runtime('nix');
    expect(fs.existsSync(dbFile(cfg, other.id, 'nix'))).toBe(true);
  });

  it('create makes a playthrough and activates it', async () => {
    const { built } = await start();
    const first = built.world.active()!;
    const made = built.world.create(first.player, 'nix');
    expect(made).toMatchObject({ player: first.player, startContact: 'nix' });
    expect(built.world.active()!.id).toBe((made as { id: string }).id);
  });

  it('create passes the persona through', async () => {
    const { built } = await start();
    const first = built.world.active()!;
    built.world.create(first.player, 'nix', undefined, { name: 'Vee', background: '' });
    expect(built.world.active()!.persona).toEqual({ name: 'Vee', background: '' });
  });

  it("the active playthrough's persona is who visits", async () => {
    const { built } = await start({
      prepare: (c) => {
        fs.mkdirSync(path.join(c.charactersDir, 'zed'), { recursive: true });
        fs.writeFileSync(path.join(c.charactersDir, 'zed', 'character.json'), JSON.stringify({ name: 'Zed', tagline: 'Runs the zed line.' }));
        const pts = createPlaythroughs(c.playthroughsDir);
        pts.setActive(pts.create({ player: 'zed', startContact: 'nix', persona: { name: 'Vee', background: 'Ex-courier.' } }).id);
      },
    });
    const p = built.world.players.resolve(undefined);
    expect(p).toMatchObject({ id: 'zed', name: 'Vee', line: '[you: Vee (they) — Ex-courier.]' });
    expect(p.whosHere).toBe("[who's here: Vee (they)]\nEx-courier.");
    expect(p.whosHere).not.toContain('Runs the zed line');
  });

  it("the player's own last line is labelled with the persona's name (saves and CONTACTS)", async () => {
    const { built } = await start({
      prepare: (c) => {
        const pts = createPlaythroughs(c.playthroughsDir);
        pts.setActive(pts.create({ player: 'hicks', startContact: 'nix', persona: { name: 'Vee', background: '' } }).id);
      },
    });
    const rt = (await built.runtime('nix'))!;
    rt.db.insertMessage('hicks', { id: 'u1', role: 'user', text: 'two bowls', toolLines: [], ts: 1, status: 'ok' });
    expect(built.world.saveRequest('nix', 'manual', 'x').lastLine).toEqual({ speaker: 'Vee', text: 'two bowls' });
    expect(built.world.contacts().find((c) => c.id === 'nix')!.lastLine).toMatchObject({ speaker: 'Vee' });
  });

  it('a persona on a character gone from the roster', async () => {
    const { built } = await start({
      prepare: (c) => {
        const pts = createPlaythroughs(c.playthroughsDir);
        pts.setActive(pts.create({ player: 'ghost', startContact: 'nix', persona: { name: 'Vee', background: '' } }).id);
      },
    });
    expect(built.world.players.resolve(undefined)).toMatchObject({ id: 'ghost', name: 'Vee', line: '[you: Vee (they)]', sprite: null });
  });

  it('an opening scene row (written at the greeting since the arrival screen) is skipped by lastLine (Review Focus 4)', async () => {
    const { built, cfg } = await start({ cast: ['cass'] });
    const player = built.world.active()!.player;
    const made = built.world.create(player, 'nix') as { id: string };
    const file = dbFile(cfg, made.id, 'nix');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = openDb(file, { defaultPlayer: player });
    db.insertMessage(player, { id: 'scene-1', role: 'user', mode: 'scene', text: 'Rain.', scene: { title: 'YOUR SCENE', source: 'written' }, toolLines: [], ts: 1, status: 'ok' });
    db.close();
    await built.runtime('nix');
    expect(built.world.saveRequest('nix', 'manual', 'x').lastLine).toBeNull();
    expect(built.world.contacts().find((c) => c.id === 'nix')!.lastLine).toBeNull();
  });

  it('?as= is ignored in a playthrough', async () => {
    const { built, ws } = await start({
      cast: ['hicks', 'cass'],
      prepare: (c) => {
        const pts = createPlaythroughs(c.playthroughsDir);
        pts.setActive(pts.create({ player: 'hicks', startContact: 'nix' }).id);
      },
    });
    expect(built.world.players.defaultId).toBe('hicks');
    expect(built.world.players.resolve('cass').id).toBe('hicks');
    const s = socket(`${ws}/ws/nix?as=cass`);
    await s.opened;
    s.ws.send(JSON.stringify({ type: 'user_message', text: 'who am i' }));
    const rt = (await built.runtime('nix'))!;
    await until(() => rt.db.recentMessages('hicks').some((m) => m.role === 'agent' && m.status === 'ok'));
    expect(rt.db.recentMessages('hicks').find((m) => m.role === 'user')).toMatchObject({ text: 'who am i' });
    expect(rt.db.recentMessages('cass')).toEqual([]);
  });

  it('a manual save while solo is written and carries solo (Review Focus 4)', async () => {
    const { built } = await start();
    built.world.checkpoint({ trigger: 'end', contactId: 'nix', name: 'Talk with Nix ended' });
    expect(built.world.goSolo()).toMatchObject({ solo: true });
    const saved = built.world.save('alone');
    expect(saved).toMatchObject({ kind: 'manual', name: 'alone', solo: true });
    // A checkpoint's request while solo carries it too.
    expect(built.world.saveRequest('nix', 'travel', 'x').solo).toBe(true);
  });

  it('a room page opening ends solo and puts the player in her room (Review Focus 1)', async () => {
    const { built, ws } = await start();
    built.world.goSolo();
    const s = socket(`${ws}/ws/nix?enter=1`);
    await until(() => s.events.some((e) => e.type === 'history'));
    expect(built.world.active()!.solo).toBeUndefined();
    expect(built.world.active()!.location?.contactId).toBe('nix');
  });

  it("a socket reconnecting (no enter) doesn't end solo (final review 1)", async () => {
    const { built, ws } = await start();
    built.world.goSolo();
    const s = socket(`${ws}/ws/nix`);
    await until(() => s.events.some((e) => e.type === 'history'));
    expect(built.world.active()!.solo).toBe(true);
  });

  it("entering a contact the player doesn't know leaves solo as it was (final review 5)", async () => {
    const { built } = await start({ cast: ['cass'] });
    built.world.goSolo();
    built.world.entered('cass');
    expect(built.world.active()!.solo).toBe(true);
  });

  it('setLocation ends solo', async () => {
    const { built } = await start();
    built.world.goSolo();
    built.world.setLocation('nix');
    expect(built.world.active()!.solo).toBeUndefined();
  });

  it('setLocation rejects an unknown contact', async () => {
    const { built } = await start();
    const before = built.world.active()!.location;
    expect(built.world.setLocation('cass')).toBe('unknown');
    expect(built.world.setLocation('hae')).toBe('unknown');
    expect(built.world.active()!.location).toEqual(before);
  });

  it("setLocation sets the contact's current scene, or its startRoom when it has no db", async () => {
    const { built, cfg } = await start();
    const pt = built.world.active()!;
    expect(fs.existsSync(dbFile(cfg, pt.id, 'nix'))).toBe(false);
    expect(built.world.setLocation('nix')).toEqual({ contactId: 'nix', sceneId: 'karasu/lowlight-intake' });
    expect(built.world.active()!.location).toEqual({ contactId: 'nix', sceneId: 'karasu/lowlight-intake' });

    const rt = (await built.runtime('nix'))!;
    expect(rt.room.setScene({ id: 'karasu/noodle-stall' }, 'user').ok).toBe(true);
    expect(built.world.setLocation('nix')).toEqual({ contactId: 'nix', sceneId: 'karasu/noodle-stall' });
    expect(built.world.active()!.location).toEqual({ contactId: 'nix', sceneId: 'karasu/noodle-stall' });
  });

  it('a location whose contact left the roster falls back to startContact, then the first known contact', async () => {
    let gone = '';
    let orphan = '';
    const { built, cfg } = await start({
      cast: ['hicks'],
      prepare: (c) => {
        const pts = createPlaythroughs(c.playthroughsDir);
        // Started with nix; the location names ghost, who isn't in the roster.
        gone = pts.create({ player: 'hicks', startContact: 'nix' }).id;
        pts.touch(gone, { contactId: 'ghost', sceneId: 'karasu/noodle-stall' });
        // Started with ghost too: nix, met since, is the first known contact.
        orphan = pts.create({ player: 'hicks', startContact: 'ghost' }).id;
        pts.touch(orphan, { contactId: 'ghost', sceneId: 'karasu/noodle-stall' });
        const file = path.join(pts.charsDir(orphan), 'nix', 'room.db');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const db = openDb(file, { defaultPlayer: 'hicks' });
        db.insertMessage('hicks', { id: 'm1', role: 'user', text: 'hi', toolLines: [], ts: 1, status: 'ok' });
        db.close();
        pts.setActive(gone);
      },
    });
    expect(built.world.contacts().map((c) => c.id)).toEqual(['nix']);
    expect(built.world.active()!.location).toEqual({ contactId: 'nix', sceneId: 'karasu/lowlight-intake' });

    built.world.activate(orphan);
    expect(built.world.contacts().map((c) => [c.id, c.status])).toEqual([['nix', 'met']]);
    expect(built.world.active()!.location).toMatchObject({ contactId: 'nix' });
    void cfg;
  });
});
