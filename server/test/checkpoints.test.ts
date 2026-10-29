import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';
import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import { dispatchTool } from '../src/tools';
import { makeFixture } from './fixtures/agents';
import { chunk, startStubOpenRouter } from './fixtures/stub-openrouter';
import type { ServerEvent } from '../../shared/types';

const TOKEN = 'test-token-123456789';
const CHARACTERS = path.join(__dirname, '..', '..', 'characters');
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  while (cleanups.length) await cleanups.pop()!();
});

const until = async (p: () => boolean) => {
  const t = Date.now();
  while (!p()) {
    if (Date.now() - t > 3000) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};

const MAP = {
  version: 1,
  image: '/map/x.webp',
  panelAt: [50, 50],
  districts: [{ id: 'karasu', name: 'Ribbon', label: [1, 1] }],
  places: [
    { id: 'intake', name: 'Lowlight Intake', district: 'karasu', pin: [1, 1], scene: 'karasu/lowlight-intake' },
    { id: 'stall', name: "Hae's Noodles", district: 'karasu', pin: [2, 2], scene: 'karasu/noodle-stall' },
    { id: 'roof', name: 'Ribbon Rooftop', district: 'karasu', pin: [3, 3], scene: 'karasu/ribbon-rooftop' },
  ],
};

/**
 * nix on the OpenRouter stub that replies `reply`. With `hold`, each reply waits for `release()`; the
 * stream is open (her reply row is `streaming`) until then.
 */
async function start(opts: { hold?: boolean; reply?: string } = {}) {
  let gate = { release: () => {}, open: Promise.resolve() };
  const hold = () => {
    let release!: () => void;
    const open = new Promise<void>((r) => (release = r));
    gate = { release, open };
  };
  if (opts.hold) hold();
  const s = await startStubOpenRouter([], { fallback: { raw: [':\n\n'], chunks: [chunk(opts.reply ?? 'hello'), chunk(undefined, 'stop')], holdUntil: () => gate.open } });
  cleanups.push(async () => {
    gate.release();
    await s.close();
  });
  const { root, cfg } = await makeFixture([{ id: 'nix', direct: true, pack: 'karasu' }], undefined, { openrouterUrl: s.url });
  cfg.mapFile = path.join(root, 'lowlight.json');
  fs.writeFileSync(cfg.mapFile, JSON.stringify(MAP));
  fs.cpSync(path.join(CHARACTERS, 'hae'), path.join(cfg.charactersDir, 'hae'), { recursive: true });
  const built = await buildApp(cfg);
  cleanups.push(() => built.close());
  await built.app.listen({ port: 0, host: '127.0.0.1' });
  const addr = built.app.server.address() as { port: number };
  const pt = built.world.active()!;
  const rt = (await built.runtime('nix'))!;
  const saves = () => built.playthroughs.saves(pt.id);
  return { built, cfg, pt, rt, saves, or: s, release: () => gate.release(), hold, ws: `ws://127.0.0.1:${addr.port}` };
}

async function socket(url: string) {
  const ws = new WebSocket(`${url}?token=${TOKEN}`, { headers: { Origin: 'http://localhost:5173' } });
  const events: ServerEvent[] = [];
  ws.on('message', (d) => events.push(JSON.parse(d.toString())));
  ws.on('error', () => {});
  cleanups.push(() => ws.close());
  await new Promise<void>((r) => ws.on('open', () => r()));
  await until(() => events.some((e) => e.type === 'history'));
  return { ws, events, send: (e: unknown) => ws.send(JSON.stringify(e)) };
}

const saveDb = (cfg: Config, pt: string, save: string) => path.join(cfg.playthroughsDir, pt, 'saves', save, 'chars', 'nix', 'room.db');
type Rt = { db: { recentMessages(p: string): { role: string; status: string; mode?: string }[] } };
const repliesDone = (rt: Rt, player: string, n: number) => rt.db.recentMessages(player).filter((m) => m.role === 'agent' && m.status === 'ok').length >= n;
/** Her finished roleplay replies (not greetings, travel or end). */
const rpReplies = (rt: Rt, player: string) => rt.db.recentMessages(player).filter((m) => m.role === 'agent' && m.status === 'ok' && !m.mode).length;

describe('checkpoints', () => {
  it('ending a conversation adds an end checkpoint', async () => {
    const { pt, rt, saves, ws } = await start();
    const s = await socket(`${ws}/ws/nix`);
    await until(() => !rt.relay.busy);
    s.send({ type: 'user_message', text: '', mode: 'end' });
    await until(() => rt.relay.busy);
    await until(() => !rt.relay.busy);
    // The save waits for the Residual (its recap): it lands a moment after the turn.
    await until(() => saves()[0]?.trigger === 'end');
    expect(saves()[0]).toMatchObject({ kind: 'checkpoint', trigger: 'end', name: 'Talk with Nix ended', location: { contactId: 'nix', sceneId: 'karasu/lowlight-intake' } });
    expect(repliesDone(rt, pt.player, 1)).toBe(true);
  });

  it("the end checkpoint holds the Residual's recap (scribe spec §2)", async () => {
    const { cfg, pt, rt, saves, ws, or } = await start();
    or.residual.json = { choices: [{ message: { content: '{"notes":[],"recap":"We closed up and said goodnight."}' } }] };
    const s = await socket(`${ws}/ws/nix`);
    await until(() => !rt.relay.busy);
    s.send({ type: 'user_message', text: '', mode: 'end' });
    await until(() => saves()[0]?.trigger === 'end');
    const copy = new DatabaseSync(saveDb(cfg, pt.id, saves()[0]!.id), { readOnly: true });
    try {
      const row = copy.prepare('SELECT v FROM meta WHERE k = ?').get(`recap.${pt.player}.text`) as { v: string } | undefined;
      expect(row?.v).toBe('We closed up and said goodnight.');
    } finally {
      copy.close();
    }
  });

  it('END then REWIND before the Residual answers: the delayed end save never lands after the rewind (final review I5)', async () => {
    const { pt, rt, saves, ws, or } = await start();
    or.residual.delayMs = 1_500;
    const s = await socket(`${ws}/ws/nix`);
    await until(() => !rt.relay.busy);
    const done = () => rt.db.recentMessages(pt.player).filter((m) => m.role === 'agent' && m.status === 'ok').length;
    const n = done();
    s.send({ type: 'user_message', text: 'hello' });
    await until(() => done() === n + 1 && !rt.relay.busy);
    const back = rt.db.recentMessages(pt.player).filter((m) => m.role === 'agent' && m.status === 'ok').at(-1)!.id;
    s.send({ type: 'user_message', text: '', mode: 'end' });
    // Her end reply waits up to 1.5 s for the hello's residual first.
    await new Promise((r) => setTimeout(r, 1_800));
    await until(() => done() === n + 2 && !rt.relay.busy);
    expect((await rt.relay.rewind(pt.player, back)).ok).toBe(true);
    await new Promise((r) => setTimeout(r, 2_500));
    expect(saves().some((x) => x.trigger === 'end')).toBe(false);
  });

  it('map travel checkpoints the room you left', async () => {
    const { rt, saves, ws } = await start();
    const s = await socket(`${ws}/ws/nix`);
    await until(() => !rt.relay.busy);
    s.send({ type: 'travel', place: 'stall' });
    await until(() => rt.room.state.sceneId === 'karasu/noodle-stall');
    const newest = saves()[0];
    expect(newest).toMatchObject({ trigger: 'travel', name: "Left Lowlight Intake → Hae's Noodles", location: { contactId: 'nix', sceneId: 'karasu/lowlight-intake' } });
    await until(() => !rt.relay.busy);
  });

  it('agent go_to mid-turn waits for the turn to end', async () => {
    const { cfg, pt, rt, saves, release, ws } = await start({ hold: true });
    const s = await socket(`${ws}/ws/nix`);
    // The greeting turn holds too; let it through first.
    if (rt.relay.busy) {
      release();
      await until(() => !rt.relay.busy);
    }
    const before = saves().map((x) => x.id);
    s.send({ type: 'user_message', text: 'take me for noodles' });
    await until(() => rt.relay.busy);
    // What her MCP call does mid-turn.
    expect(dispatchTool(rt.tools, 'go_to', { id: 'karasu/noodle-stall' }, 'agent').ok).toBe(true);
    expect(saves().map((x) => x.id)).toEqual(before);

    release();
    await until(() => !rt.relay.busy);
    const added = saves().filter((x) => !before.includes(x.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ trigger: 'travel', name: "Nix took you to Hae's Noodles" });
    const copy = new DatabaseSync(saveDb(cfg, pt.id, added[0]!.id), { readOnly: true });
    try {
      expect((copy.prepare("SELECT COUNT(*) AS n FROM messages WHERE status = 'streaming'").get() as { n: number }).n).toBe(0);
    } finally {
      copy.close();
    }
  });

  it('a checkpoint of an unchanged world is skipped (no talk, no move since the last)', async () => {
    const { built, saves } = await start();
    built.world.checkpoint({ trigger: 'travel', contactId: 'nix', name: 'Left A → B' });
    built.world.checkpoint({ trigger: 'travel', contactId: 'nix', name: 'Left B → C' });
    expect(saves().filter((x) => x.trigger === 'travel').map((x) => x.name)).toEqual(['Left A → B']);
  });

  it('a save queued while a text types is written when the text ends (deck mid review I1)', async () => {
    const { built, pt, rt, release, saves } = await start({ hold: true });
    const before = saves().map((x) => x.id);
    const texting = rt.relay.sendText(pt.player, 'you up?', 'home');
    await until(() => rt.relay.busy);
    built.world.checkpoint({ trigger: 'end', contactId: 'nix', name: 'Talk with Nix ended' });
    expect(saves().map((x) => x.id)).toEqual(before);
    release();
    await texting;
    await until(() => saves().some((x) => x.name === 'Talk with Nix ended'));
  });

  it('manual save while busy returns busy', async () => {
    const { built, rt, release, ws } = await start({ hold: true });
    const s = await socket(`${ws}/ws/nix`);
    if (!rt.relay.busy) s.send({ type: 'user_message', text: 'hi' });
    await until(() => rt.relay.busy);
    expect(built.world.save('x')).toEqual({ busy: 'nix' });
    release();
    await until(() => !rt.relay.busy);
    expect(built.world.save('x')).toMatchObject({ kind: 'manual', trigger: 'manual', name: 'x' });
  });

  it('failed checkpoint sends a notice and play continues', async () => {
    const { built, pt, rt, ws } = await start();
    const s = await socket(`${ws}/ws/nix`);
    await until(() => !rt.relay.busy);
    vi.spyOn(built.playthroughs, 'save').mockImplementation(() => {
      throw new Error('disk full');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const replies = rt.db.recentMessages(pt.player).filter((m) => m.role === 'agent').length;
    s.send({ type: 'user_message', text: '', mode: 'end' });
    await until(() => s.events.some((e) => e.type === 'notice' && e.text === 'Checkpoint failed: disk full'));
    await until(() => !rt.relay.busy);
    s.send({ type: 'user_message', text: 'still here?' });
    await until(() => repliesDone(rt, pt.player, replies + 2));
  });

  it('lastLine takes the Hae paragraph', async () => {
    const { built, pt, rt, ws } = await start({ reply: 'Nix: Look who it is.\n\nHae: You came back.' });
    const s = await socket(`${ws}/ws/nix`);
    await until(() => !rt.relay.busy);
    s.send({ type: 'user_message', text: 'two bowls' });
    await until(() => rpReplies(rt, pt.player) === 1 && !rt.relay.busy);
    expect(built.world.saveRequest('nix', 'manual', 'x').lastLine).toEqual({ speaker: 'Hae', text: 'You came back.' });
  });

  it('lastLine is cut to 120 characters, and the request names participants and time of day', async () => {
    const { built, pt, rt, ws } = await start({ reply: 'x'.repeat(200) });
    const s = await socket(`${ws}/ws/nix`);
    await until(() => !rt.relay.busy);
    s.send({ type: 'user_message', text: 'talk' });
    await until(() => rpReplies(rt, pt.player) === 1 && !rt.relay.busy);
    const req = built.world.saveRequest('nix', 'manual', 'x');
    expect(req.lastLine).toEqual({ speaker: 'Nix', text: 'x'.repeat(120) });
    expect(req.participants).toEqual(['nix']);
    expect(req.timeOfDay).toBe(rt.room.state.atmosphere.timeOfDay);
    expect(req).toMatchObject({ kind: 'manual', trigger: 'manual', name: 'x', location: { contactId: 'nix', sceneId: 'karasu/lowlight-intake' } });
  });

  it('checkpointNow writes even while a turn streams', async () => {
    const { built, rt, saves, release, ws } = await start({ hold: true });
    const s = await socket(`${ws}/ws/nix`);
    if (rt.relay.busy) {
      release();
      await until(() => !rt.relay.busy);
    }
    s.send({ type: 'user_message', text: 'hold on' });
    await until(() => rt.relay.busy);
    built.world.checkpointNow({ trigger: 'rewind', contactId: 'nix', name: 'Before rewind' });
    expect(saves()[0]).toMatchObject({ kind: 'checkpoint', trigger: 'rewind', name: 'Before rewind' });
    release();
    await until(() => !rt.relay.busy);
  });

  it('REWIND HERE saves a Before rewind checkpoint first', async () => {
    const { pt, rt, saves, ws } = await start();
    const s = await socket(`${ws}/ws/nix`);
    await until(() => !rt.relay.busy);
    const before = rpReplies(rt, pt.player);
    s.send({ type: 'user_message', text: 'one' });
    await until(() => rpReplies(rt, pt.player) > before && !rt.relay.busy);
    const lines = rt.db.allMessages(pt.player);
    s.send({ type: 'rewind', messageId: lines[0].id });
    await until(() => rt.db.allMessages(pt.player).length === 1);
    expect(saves()[0]).toMatchObject({ trigger: 'rewind', name: 'Before rewind' });
  });

  it('a restored room is not saved again as a new write (final review C1)', async () => {
    const { built, cfg, pt, rt, ws } = await start();
    await socket(`${ws}/ws/nix`);
    await until(() => !rt.relay.busy);
    rt.room.setScene({ id: 'karasu/noodle-stall' }, 'dev');
    await new Promise((r) => setTimeout(r, 0));
    // What a rebuild leaves when no write before the line touched the room: no room_state at all.
    const raw = new DatabaseSync(path.join(cfg.playthroughsDir, pt.id, 'chars', 'nix', 'room.db'));
    raw.exec('DELETE FROM room_state');
    raw.close();
    const before = rt.db.writes().length;
    rt.applyRebuild({ roomChanged: true, notes: [], recap: [], page: [], shares: false, leads: false, quests: false });
    expect(rt.room.state.sceneId).toBe('karasu/lowlight-intake');
    // The restored state isn't saved again; the one write a rebuild may add is the room taking the city's
    // weather (city weather spec §2), which is a real change, not a re-save.
    const added = rt.db.writes().slice(before);
    expect(added.length).toBeLessThanOrEqual(1);
    if (added.length === 0) expect(rt.db.loadRoom()).toBeNull();
    else {
      const city = built.world.active()!.weather!;
      expect(rt.db.loadRoom()!.atmosphere).toMatchObject({ weather: city.weather, weatherLevel: city.level });
    }
  });

  it('restore moves the room without a checkpoint', async () => {
    const { built, rt, saves, ws } = await start();
    const s = await socket(`${ws}/ws/nix`);
    await until(() => !rt.relay.busy);
    const before = saves().map((x) => x.id);
    const seen = s.events.length;
    rt.db.saveRoom({ ...rt.room.state, sceneId: 'karasu/noodle-stall' });
    rt.applyRebuild({ roomChanged: true, notes: [], recap: [], page: [], shares: false, leads: false, quests: false });
    expect(rt.room.state.sceneId).toBe('karasu/noodle-stall');
    expect(built.world.active()!.location).toEqual({ contactId: 'nix', sceneId: 'karasu/noodle-stall' });
    await until(() => s.events.slice(seen).some((e) => e.type === 'room'));
    expect(s.events.slice(seen).find((e) => e.type === 'room')).toMatchObject({ source: 'user' });
    expect(s.events.slice(seen).some((e) => e.type === 'tool_line')).toBe(false);
    expect(saves().map((x) => x.id)).toEqual(before);
  });
});
