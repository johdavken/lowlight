import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ServerEvent } from '../../shared/types';
import type { DirectSetup } from '../src/agents';
import type { Backend, TurnRequest } from '../src/backend';
import { ChatRelay } from '../src/chat-relay';
import { fakeBackend, reply } from './fixtures/backend';
import { fakePlayers } from './fixtures/players';
import { openDb, type Db } from '../src/db';
import { createDirectBackend } from '../src/direct';
import { TurnError } from '../src/turn';
import { OOC_INSTRUCTIONS, ROLEPLAY_GUIDE, RP_HEADING } from '../src/instructions';
import { Journal, pageLine } from '../src/journal';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import type { SseFrame } from '../src/sse';
import { generateScenes } from '../../tools/gen-placeholders';
import { startStubOpenRouter, type StubOpenRouter } from './fixtures/stub-openrouter';

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-direct-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
const dbs: Db[] = [];
const stubs: StubOpenRouter[] = [];
afterEach(async () => {
  while (dbs.length) dbs.pop()!.close();
  while (stubs.length) await stubs.pop()!.close();
});

function relayWith(backend: Backend, over: { identity?: () => string } = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  dbs.push(db);
  const events: ServerEvent[] = [];
  const relay = new ChatRelay({
      players: fakePlayers(),
    backend,
    db,
    room: new Room(registry),
    journal: new Journal(db),
    emit: (e) => events.push(e),
    instructions: 'ROOM NOTE',
    oocInstructions: 'OOC NOTE',
    ...over,
  });
  return { relay, db, events };
}
const system = (r: TurnRequest) => r.messages[0].content;
const notices = (events: ServerEvent[]) => events.filter((e) => e.type === 'notice').map((e) => (e as { text: string }).text);
const agentLines = (db: Db) => db.recentMessages('hicks', 50).filter((m) => m.role === 'agent');

describe('the relay with a direct backend', () => {
  it("a direct turn's system message is identity, then room note, then roleplay guide; the room line heads the message, then her dossier page", async () => {
    const b = fakeBackend(() => reply('Hi.'));
    const { relay } = relayWith(b, { identity: () => 'I AM NIX' });
    await relay.send('hicks', 'hello');
    expect(system(b.reqs[0])).toBe(`I AM NIX\n\n${RP_HEADING}\n\nROOM NOTE\n\n${ROLEPLAY_GUIDE}`);
    const message = b.reqs[0].messages.at(-1)!.content;
    expect(message.startsWith('[room: ')).toBe(true);
    expect(message.split('\n\n')[1]).toBe(pageLine('hicks', null));
  });

  it('OOC: identity then the OOC note; the room line and the dossier page still open the message', async () => {
    const b = fakeBackend(() => reply('Sure.'));
    const { relay } = relayWith(b, { identity: () => 'I AM NIX' });
    await relay.send('hicks', 'quick question', 'ooc');
    expect(system(b.reqs[0])).toBe('I AM NIX\n\nOOC NOTE');
    const message = b.reqs[0].messages.at(-1)!.content;
    expect(message.startsWith('[room: ')).toBe(true);
    expect(message.split('\n\n')[1]).toBe(pageLine('hicks', null));
  });

  it('the identity is read on every turn', async () => {
    let soul = 'FIRST';
    const b = fakeBackend(() => reply('ok'));
    const { relay } = relayWith(b, { identity: () => soul });
    await relay.send('hicks', 'one');
    soul = 'SECOND';
    await relay.send('hicks', 'two');
    expect(system(b.reqs[1]).startsWith('SECOND\n\n')).toBe(true);
  });

  it('regenerate sends regenerate: true, other turns false', async () => {
    const b = fakeBackend(() => reply('take'));
    const { relay, db } = relayWith(b, { identity: () => 'I' });
    await relay.send('hicks', 'hello');
    await relay.regenerate('hicks', agentLines(db)[0].id);
    expect(b.reqs.map((r) => r.regenerate)).toEqual([false, true]);
  });

  it("a reply records the model from stream.open, falling back to the request's model", async () => {
    let n = 0;
    const b = fakeBackend(() => (n++ === 0 ? reply('a', 'deepseek/deepseek-v3.2') : reply('b')));
    const { relay, db } = relayWith(b, { identity: () => 'I' });
    await relay.send('hicks', 'one');
    await relay.send('hicks', 'two');
    expect(agentLines(db).map((m) => m.model)).toEqual(['deepseek/deepseek-v3.2', 'z-ai/glm-5.2']);
  });

  it("each take records its model and swiping sets the message's model to the shown take's (Review Focus 4)", async () => {
    let n = 0;
    const b = fakeBackend(() => reply(`take ${n}`, n++ === 0 ? 'model/a' : 'model/b'));
    const { relay, db } = relayWith(b, { identity: () => 'I' });
    await relay.send('hicks', 'hello');
    const id = agentLines(db)[0].id;
    await relay.regenerate('hicks', id);
    expect(db.getMessage('hicks', id)!.model).toBe('model/b');
    expect(db.getTakes('hicks', id)!.takes.map((t) => t.model)).toEqual(['model/a', 'model/b']);
    await relay.swipe('hicks', id, 0);
    expect(db.getMessage('hicks', id)!.model).toBe('model/a');
  });


  it('a direct 401 also says how to fix it: "// KEY REJECTED — RELINK AT SELECT"', async () => {
    const b = fakeBackend(() => new TurnError('auth', 'nope', 401));
    const { relay, events } = relayWith(b);
    expect(await relay.send('hicks', 'hello')).toEqual({ ok: false, error: 'auth' });
    expect(notices(events)).toEqual(['// KEY REJECTED — RELINK AT SELECT']);
  });

  it('credit → "// OPENROUTER CREDIT IS OUT" and the user line failed', async () => {
    const b = fakeBackend(() => new TurnError('credit', 'out', 402));
    const { relay, db, events } = relayWith(b, { identity: () => 'I' });
    expect(await relay.send('hicks', 'hello')).toEqual({ ok: false, error: 'credit' });
    expect(notices(events)).toEqual(['// OPENROUTER CREDIT IS OUT']);
    expect(db.recentMessages('hicks', 5).find((m) => m.role === 'user')!.status).toBe('failed');
  });

  it('refused → "// THE PROVIDER REFUSED THIS TURN — TRY ANOTHER MODEL"', async () => {
    const { relay, events } = relayWith(fakeBackend(() => new TurnError('refused', 'no', 403)), { identity: () => 'I' });
    expect(await relay.send('hicks', 'hello')).toEqual({ ok: false, error: 'refused' });
    expect(notices(events)).toEqual(['// THE PROVIDER REFUSED THIS TURN — TRY ANOTHER MODEL']);
  });

  it('busy on a direct backend → "// RATE LIMITED"', async () => {
    const { relay, events } = relayWith(fakeBackend(() => new TurnError('busy', 'slow down', 429)), { identity: () => 'I' });
    await relay.send('hicks', 'hello');
    expect(notices(events)).toEqual(['// RATE LIMITED']);
  });

  it("unreachable on a direct backend → \"// CAN'T REACH OPENROUTER — CHECK YOUR CONNECTION\" and the link goes down", async () => {
    const { relay, events } = relayWith(fakeBackend(() => new TurnError('unreachable', 'fetch failed')), { identity: () => 'I' });
    expect(await relay.send('hicks', 'hello')).toEqual({ ok: false, error: 'unreachable' });
    expect(notices(events)).toEqual(["// CAN'T REACH OPENROUTER — CHECK YOUR CONNECTION"]);
    expect(events).toContainEqual({ type: 'link', status: 'down' });
  });

  it('a 4xx OpenRouter rejects (context too long, bad parameter) says so, not "check your connection" (review)', async () => {
    const { relay, events } = relayWith(fakeBackend(() => new TurnError('http', 'This endpoint maximum context length is 131072 tokens', 400)), { identity: () => 'I' });
    expect(await relay.send('hicks', 'hello')).toEqual({ ok: false, error: 'unreachable' });
    expect(notices(events)).toEqual(['// OPENROUTER REJECTED THIS TURN']);
  });

  it('a 5xx on a direct backend gets the connection notice', async () => {
    const direct = relayWith(fakeBackend(() => new TurnError('http', 'HTTP 502', 502)), { identity: () => 'I' });
    await direct.relay.send('hicks', 'hello');
    expect(notices(direct.events)).toEqual(["// CAN'T REACH OPENROUTER — CHECK YOUR CONNECTION"]);
  });

  it('across the auth, credit, refused, busy and http paths no emitted event contains the key', async () => {
    const KEY = 'sk-or-secret-123';
    for (const status of [401, 402, 403, 429, 500]) {
      const stub = await startStubOpenRouter([
        { status, json: { error: { message: `bad key ${KEY}` } } },
        { status, json: { error: { message: `bad key ${KEY}` } } },
      ]);
      stubs.push(stub);
      const setup: DirectSetup = {
        provider: 'openrouter', baseUrl: stub.url, keyName: 'openrouter', defaultModel: 'm/x', temperature: 0.9, maxTokens: 400, identity: () => 'I',
      };
      const db = openDb(':memory:', { defaultPlayer: 'hicks' });
      dbs.push(db);
      const room = new Room(registry);
      const journal = new Journal(db);
      const events: ServerEvent[] = [];
      const backend = createDirectBackend({ setup, tools: { room, journal, player: () => 'hicks', expressions: null }, model: { get: () => 'm/x', set: () => {} }, apiKey: () => KEY, onNotice: (text) => events.push({ type: 'notice', text }), sleep: async () => {} });
      const relay = new ChatRelay({ players: fakePlayers(), backend, db, room, journal, emit: (e) => events.push(e), identity: setup.identity });
      await relay.send('hicks', 'hello');
      expect(JSON.stringify(events)).not.toContain(KEY);
    }
  });
});

describe('OOC instructions default', () => {
  it('a direct relay without an OOC note uses the default one after the identity', async () => {
    const b = fakeBackend(() => reply('ok'));
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    dbs.push(db);
    const relay = new ChatRelay({ players: fakePlayers(), backend: b, db, room: new Room(registry), emit: () => {}, identity: () => 'I' });
    await relay.send('hicks', 'q', 'ooc');
    expect(system(b.reqs[0])).toBe(`I\n\n${OOC_INSTRUCTIONS}`);
  });
});


describe('switching models (Review Focus 5)', () => {
  it('a model chosen while she is replying: the running turn keeps its model, the next turn uses the new one', async () => {
    let current = 'model/a';
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const reqs: TurnRequest[] = [];
    const backend: Backend = {
      async *streamTurn(req) {
        reqs.push(req);
        yield { event: 'stream.open', data: { model: req.model?.model } };
        if (reqs.length === 1) await gate;
        yield { event: 'assistant.delta', data: { delta: 'x' } };
        yield { event: 'run.completed', data: undefined };
      },
      probe: async () => 'ok',
      currentModel: async () => ({ model: current, provider: 'openrouter' }),
    };
    const { relay } = relayWith(backend, { identity: () => 'I' });
    const first = relay.send('hicks', 'one');
    await new Promise((r) => setTimeout(r, 10));
    current = 'model/b';
    release();
    await first;
    await relay.send('hicks', 'two');
    expect(reqs.map((r) => r.model?.model)).toEqual(['model/a', 'model/b']);
  });
});
