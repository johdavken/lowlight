import { WRITTEN_SCENE_TITLE } from '../../shared/scenario';
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { diceActionLine, diceText } from '../../shared/dice/text';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SceneRegistry } from '../src/scenes';
import { Room } from '../src/room-state';
import { generateScenes } from '../../tools/gen-placeholders';
import { openDb, type Db } from '../src/db';
import { CONTINUE_INSTRUCTION } from '../src/history';
import { ChatRelay, type ChatRelayDeps } from '../src/chat-relay';
import { fakePlayers } from './fixtures/players';
import { Journal } from '../src/journal';
import { dispatchTool } from '../src/tools';
import { personaLine } from '../src/persona';
type Persona = Parameters<typeof personaLine>[0];
import { LORE_HEADER, loreBlock, selectLore, type LoreEntry, type LoreSelection } from '../../shared/lore';
import { herLeaveInstructions, END_SCENE_INSTRUCTIONS, LEAVE_INSTRUCTIONS, GREET_INSTRUCTIONS, SCENE_GREET_INSTRUCTIONS, GREET_PLACEHOLDER, LIGHTS_LINE, OOC_INSTRUCTIONS, ROLEPLAY_GUIDE, ROOM_INSTRUCTIONS, TRAVEL_INSTRUCTIONS, TRAVEL_LINE, othersBlock, type OtherVoice, ENCOUNTER_INSTRUCTIONS, GIG_INSTRUCTIONS, DICE_INSTRUCTIONS, strangerBlock, beatLine, RP_HEADING } from '../src/instructions';
import { gigActionLine, gigText } from '../../shared/gig/brief';
import type { ChatMessage } from '../../shared/types';
import { parsePlan, planKey, planSeenKey } from '../../shared/plan';
import type { LeadEntry as LeadEntry_ } from '../../shared/leads';

const RP_SYSTEM = `${RP_HEADING}\n\n${ROOM_INSTRUCTIONS}\n\n${ROLEPLAY_GUIDE}`;
const EMPTY_PAGE = (name: string) => `[your dossier on ${name}: empty]`;
import {
  DEFAULT_STUB_MODEL,
  startStubChat,
  sseFrame,
  wireFrame,
  startSseResponse,
  type StubChat,
  type StubScript,
} from './fixtures/stub-chat';
import { wireBackend } from './fixtures/wire-backend';
import type { Backend } from '../src/backend';
import type { ServerEvent } from '../../shared/types';

let tmpDir: string;
let registry: SceneRegistry;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-chat-relay-'));
  await generateScenes(tmpDir);
  const { registry: reg, errors } = await SceneRegistry.load(tmpDir);
  expect(errors).toEqual([]);
  registry = reg;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const stubs: { close(): Promise<void> }[] = [];
const dbs: Db[] = [];

afterEach(async () => {
  while (stubs.length > 0) await stubs.pop()!.close();
  while (dbs.length > 0) dbs.pop()!.close();
});

function makeDb(): Db {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  dbs.push(db);
  return db;
}

function makeRoom(): Room {
  return new Room(registry);
}

async function makeStub(script: StubScript): Promise<StubChat> {
  const stub = await startStubChat(script);
  stubs.push(stub);
  return stub;
}

function chatStreamEntry(sessionId: string, frames: string[]) {
  return {
    match: (req: any) => req.method === 'POST' && req.url === '/v1/chat/completions',
    respond: (_req: any, res: any) => {
      startSseResponse(res);
      for (const f of frames) res.write(f);
      res.end();
    },
  };
}

/** A completions request as the turn it carries: the system note, the last user message, the model. */
/** The message without its head (the `[room: …]` and `[wearing: …]` lines and the blank line after them). */
function body(message: string): string {
  const lines = message.split('\n');
  let i = 0;
  while (i < lines.length && /^\[(?:room|wearing): /.test(lines[i])) i++;
  return lines.slice(i).join('\n').replace(/^\n/, '');
}

function asTurn(body: unknown): { instructions: string; message: string; messages: { role: string; content: string }[]; model?: string; provider?: string } {
  const b = body as { messages: { role: string; content: string }[]; model?: string; provider?: string };
  return { instructions: b.messages[0].content, message: b.messages.at(-1)!.content, messages: b.messages, model: b.model, provider: b.provider };
}

function collector(): { events: ServerEvent[]; emit: (e: ServerEvent) => void } {
  const events: ServerEvent[] = [];
  return { events, emit: (e) => events.push(e) };
}

/** Hae as the relay's others list has her: a resident with her voice, faces or none. */
const haeVoice = (voice: string, faces: boolean): OtherVoice => ({ id: 'hae', kind: 'resident', name: 'Hae', pronoun: 'she', voice, file: null, faces: faces ? ['happy'] : [] });

describe('ChatRelay', () => {
  it('a second turn carries the first exchange as history, oldest first', async () => {
    let n = 0;
    const stub = await makeStub([
      {
        match: (req: any) => req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          startSseResponse(res);
          res.write(wireFrame('assistant.delta', { delta: `reply ${++n}` }));
          res.write(wireFrame('run.completed'));
          res.end();
        },
      },
    ]);
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db: makeDb(), room: makeRoom(), emit: () => {} });
    await relay.send('hicks', 'first');
    await relay.send('hicks', 'second', 'ooc');
    await relay.send('hicks', 'third');
    const third = asTurn(stub.requests.filter((r) => r.url === '/v1/chat/completions')[2].bodyJson);
    expect(third.messages.slice(1, -1)).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply 1' },
      { role: 'user', content: '(OOC) second' },
      { role: 'assistant', content: 'reply 2' },
    ]);
    expect(third.message.endsWith('\n\nthird')).toBe(true);
  });

  it('runs a normal turn: sends the room note, history and room summary + text, streams deltas, finalizes ok', async () => {
    const stub = await makeStub([
      chatStreamEntry('sess1', [
        wireFrame('run.started'),
        wireFrame('message.started'),
        wireFrame('assistant.delta', { delta: 'Hello' }),
        wireFrame('assistant.delta', { delta: ' there' }),
        wireFrame('assistant.completed', { session_id: 'sess1', content: 'Hello there' }),
        wireFrame('run.completed'),
        wireFrame('done'),
      ]),
    ]);
    const db = makeDb();
    const room = makeRoom();
    const { events, emit } = collector();
    const backend = wireBackend(stub.url);
    const relay = new ChatRelay({ players: fakePlayers(), backend, db, room, emit });

    const result = await relay.send('hicks', 'hello');

    expect(result).toEqual({ ok: true, text: 'ok' });
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({ method: 'POST', url: '/v1/chat/completions' });
    const chatBody = asTurn(stub.requests[0].bodyJson);
    expect(chatBody.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(chatBody.message.startsWith('[room: lowlight-intake "Lowlight Intake"')).toBe(true);
    expect(chatBody.message.endsWith('\n\nhello')).toBe(true);
    expect(chatBody.instructions).toBe(RP_SYSTEM);
    expect(chatBody).toMatchObject(DEFAULT_STUB_MODEL);

    const userMsg = events[0];
    expect(userMsg).toMatchObject({ type: 'message', message: { role: 'user', text: 'hello', status: 'ok' } });
    const userId = (userMsg as any).message.id;

    expect(events[1]).toEqual({ type: 'model', ...DEFAULT_STUB_MODEL });

    const nixStreaming = events[2];
    expect(nixStreaming).toMatchObject({ type: 'message', message: { role: 'agent', status: 'streaming', replyTo: userId } });
    const nixId = (nixStreaming as any).message.id;

    expect(events[3]).toEqual({ type: 'nix_delta', messageId: nixId, delta: 'Hello' });
    expect(events[4]).toEqual({ type: 'nix_delta', messageId: nixId, delta: ' there' });

    expect(events[5]).toMatchObject({ type: 'message', message: { id: nixId, role: 'agent', status: 'ok', text: 'Hello there' } });
    expect(events[6]).toEqual({ type: 'link', status: 'ok' });
    expect(events).toHaveLength(7);

    expect(relay.activeMessageId).toBeNull();
    expect(db.getMessage('hicks', nixId)).toMatchObject({ status: 'ok', text: 'Hello there' });
  });

  it('drops the blank lines a reply opens with, however the stream splits them', async () => {
    const stub = await makeStub([
      chatStreamEntry('sess1', [
        wireFrame('assistant.delta', { delta: '\n' }),
        wireFrame('assistant.delta', { delta: '\n  ' }),
        wireFrame('assistant.delta', { delta: '\n*leans in*\n\nHey.' }),
        wireFrame('run.completed'),
        wireFrame('done'),
      ]),
    ]);
    const db = makeDb();
    const { events, emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit });

    await relay.send('hicks', 'hello');

    const deltas = events.filter((e) => e.type === 'nix_delta').map((e) => (e as { delta: string }).delta);
    expect(deltas).toEqual(['*leans in*\n\nHey.']);
    const nixId = (events.find((e) => e.type === 'nix_delta') as { messageId: string }).messageId;
    expect(db.getMessage('hicks', nixId)).toMatchObject({ status: 'ok', text: '*leans in*\n\nHey.' });
  });

  it('marks the user message failed and the link down when the backend is unreachable', async () => {
    const stub = await makeStub([]);
    const deadUrl = stub.url;
    await stub.close();
    stubs.splice(stubs.indexOf(stub), 1);

    const db = makeDb();
    const room = makeRoom();
    const { events, emit } = collector();
    const backend = wireBackend(deadUrl);
    const relay = new ChatRelay({ players: fakePlayers(), backend, db, room, emit });

    const result = await relay.send('hicks', 'hello');

    expect(result).toEqual({ ok: false, error: 'unreachable' });
    const userEvents = events.filter((e) => e.type === 'message' && (e as any).message.role === 'user');
    expect(userEvents.at(-1)).toMatchObject({ message: { status: 'failed' } });
    expect(events.some((e) => e.type === 'link' && e.status === 'down')).toBe(true);
    expect(events.some((e) => e.type === 'message' && (e as any).message.role === 'agent' && (e as any).message.status === 'streaming')).toBe(
      false,
    );
    expect(relay.activeMessageId).toBeNull();
  });

  it('marks the nix message lost and emits link lost when the stream ends with no run.completed', async () => {
    const stub = await makeStub([
      chatStreamEntry('sess1', [wireFrame('assistant.delta', { delta: 'partial' })]),
    ]);
    const db = makeDb();
    const room = makeRoom();
    const { events, emit } = collector();
    const backend = wireBackend(stub.url);
    const relay = new ChatRelay({ players: fakePlayers(), backend, db, room, emit });

    const result = await relay.send('hicks', 'hello');

    expect(result).toEqual({ ok: false, error: 'lost' });
    const nixEvents = events.filter((e) => e.type === 'message' && (e as any).message.role === 'agent');
    expect(nixEvents.at(-1)).toMatchObject({ message: { status: 'lost', text: 'partial' } });
    expect(events.some((e) => e.type === 'link' && e.status === 'lost')).toBe(true);
  });

  it('resolves (does not reject) and marks the open nix reply lost when the socket drops after 200 but before any frame parses', async () => {
    const stub = await makeStub([
      {
        match: (req: any) => req.method === 'POST' && req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          startSseResponse(res);
          res.write(':\n\n'); // flush headers + a comment-only frame so the client sees 200 before the drop
          setTimeout(() => res.socket?.destroy(), 20);
        },
      },
    ]);
    const db = makeDb();
    const room = makeRoom();
    const { events, emit } = collector();
    const backend = wireBackend(stub.url);
    const relay = new ChatRelay({ players: fakePlayers(), backend, db, room, emit });

    const result = await relay.send('hicks', 'hello');

    expect(result).toEqual({ ok: false, error: 'lost' });
    // The stream opened, so the streaming nix message already exists; the drop makes it lost
    // (retryable from the feed via replyTo) and leaves the user message delivered.
    const userEvents = events.filter((e) => e.type === 'message' && (e as any).message.role === 'user');
    expect(userEvents.at(-1)).toMatchObject({ message: { status: 'ok' } });
    const userId = (userEvents[0] as any).message.id;
    const nixEvents = events.filter((e) => e.type === 'message' && (e as any).message.role === 'agent');
    expect(nixEvents.map((e) => (e as any).message.status)).toEqual(['streaming', 'lost']);
    expect(nixEvents.at(-1)).toMatchObject({ message: { replyTo: userId, text: '' } });
    expect(events.some((e) => e.type === 'link' && e.status === 'lost')).toBe(true);
    expect(relay.activeMessageId).toBeNull();
  });

  it('still fails the user message when a (non-HTTP) stream drops before yielding anything', async () => {
    const db = makeDb();
    const room = makeRoom();
    const { events, emit } = collector();
    const backend: Backend = {
      probe: async () => 'ok' as const,
      // eslint-disable-next-line require-yield
      async *streamTurn() {
        throw new Error('socket hang up');
      },
      currentModel: async () => ({ ...DEFAULT_STUB_MODEL }),
    };
    const relay = new ChatRelay({ players: fakePlayers(), backend, db, room, emit });

    const result = await relay.send('hicks', 'hello');

    expect(result).toEqual({ ok: false, error: 'lost' });
    const userEvents = events.filter((e) => e.type === 'message' && (e as any).message.role === 'user');
    expect(userEvents.at(-1)).toMatchObject({ message: { status: 'failed' } });
    expect(events.some((e) => e.type === 'message' && (e as any).message.role === 'agent')).toBe(false);
  });

  it('creates and emits the streaming nix message as soon as the stream opens, before the first frame', async () => {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    const stub = await makeStub([
      {
        match: (req: any) => req.method === 'POST' && req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          startSseResponse(res);
          res.write(':\n\n'); // flush headers; no real frame yet
          void released.then(() => {
            res.write(wireFrame('assistant.delta', { delta: 'late' }));
            res.write(wireFrame('run.completed'));
            res.end();
          });
        },
      },
    ]);
    const db = makeDb();
    const room = makeRoom();
    const { events, emit } = collector();
    const backend = wireBackend(stub.url);
    const relay = new ChatRelay({ players: fakePlayers(), backend, db, room, emit });

    const p = relay.send('hicks', 'hello');
    const start = Date.now();
    while (relay.activeMessageId === null) {
      if (Date.now() - start > 2000) throw new Error('timed out waiting for the streaming message');
      await new Promise((r) => setTimeout(r, 10));
    }

    const nixId = relay.activeMessageId;
    expect(events.filter((e) => e.type === 'nix_delta')).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: 'message', message: { id: nixId, role: 'agent', status: 'streaming' } });
    expect(db.getMessage('hicks', nixId!)?.status).toBe('streaming');

    release();
    expect(await p).toEqual({ ok: true, text: 'ok' });
    expect(db.getMessage('hicks', nixId!)).toMatchObject({ status: 'ok', text: 'late' });
  });

  it('aborts a stream that sends only keepalives past the idle timeout: reply lost, link lost, busy cleared', async () => {
    let aborted = false;
    const stub = await makeStub([
      {
        match: (req: any) => req.method === 'POST' && req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          startSseResponse(res);
          res.write(wireFrame('assistant.delta', { delta: 'thinking' }));
          const timer = setInterval(() => res.write(':\n\n'), 20); // keepalive comments only
          res.on('close', () => {
            aborted = true;
            clearInterval(timer);
          });
        },
      },
    ]);
    const db = makeDb();
    const room = makeRoom();
    const { events, emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room, emit, streamIdleMs: 150 });

    const result = await relay.send('hicks', 'hello');

    expect(result).toEqual({ ok: false, error: 'lost' });
    const nixEvents = events.filter((e) => e.type === 'message' && (e as any).message.role === 'agent');
    expect(nixEvents.at(-1)).toMatchObject({ message: { status: 'lost', text: 'thinking' } });
    expect(events.some((e) => e.type === 'link' && e.status === 'lost')).toBe(true);
    expect(events.some((e) => e.type === 'dev_log' && e.text.includes('idle'))).toBe(true);
    expect(relay.busy).toBe(false);
    expect(relay.activeMessageId).toBeNull();
    const start = Date.now();
    while (!aborted && Date.now() - start < 2000) await new Promise((r) => setTimeout(r, 10));
    expect(aborted).toBe(true);
  });

  it('times out a stream that never opens (fake client) by failing the user message', async () => {
    const db = makeDb();
    const room = makeRoom();
    const { events, emit } = collector();
    let signalSeen: AbortSignal | undefined;
    const backend: Backend = {
      probe: async () => 'ok' as const,
      // eslint-disable-next-line require-yield
      async *streamTurn(_req, signal) {
        signalSeen = signal;
        await new Promise(() => {}); // hangs forever, ignoring the signal
      },
      currentModel: async () => ({ ...DEFAULT_STUB_MODEL }),
    };
    const relay = new ChatRelay({ players: fakePlayers(), backend, db, room, emit, streamIdleMs: 50 });

    expect(await relay.send('hicks', 'hello')).toEqual({ ok: false, error: 'lost' });
    expect(signalSeen?.aborted).toBe(true);
    const userEvents = events.filter((e) => e.type === 'message' && (e as any).message.role === 'user');
    expect(userEvents.at(-1)).toMatchObject({ message: { status: 'failed' } });
    expect(relay.busy).toBe(false);
  });

  it('busy is true from send() until the turn settles', async () => {
    const stub = await makeStub([
      chatStreamEntry('sess1', [wireFrame('assistant.delta', { delta: 'hi' }), wireFrame('run.completed')]),
    ]);
    const db = makeDb();
    const room = makeRoom();
    const { emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room, emit });

    expect(relay.busy).toBe(false);
    const p = relay.send('hicks', 'hello');
    expect(relay.busy).toBe(true);
    await p;
    expect(relay.busy).toBe(false);
  });

  it('marks the nix message lost on run.failed', async () => {
    const stub = await makeStub([
      chatStreamEntry('sess1', [wireFrame('assistant.delta', { delta: 'oops' }), wireFrame('run.failed')]),
    ]);
    const db = makeDb();
    const room = makeRoom();
    const { events, emit } = collector();
    const backend = wireBackend(stub.url);
    const relay = new ChatRelay({ players: fakePlayers(), backend, db, room, emit });

    const result = await relay.send('hicks', 'hello');

    expect(result).toEqual({ ok: false, error: 'lost' });
    const nixEvents = events.filter((e) => e.type === 'message' && (e as any).message.role === 'agent');
    expect(nixEvents.at(-1)).toMatchObject({ message: { status: 'lost', text: 'oops' } });
  });

  it('returns busy and makes no extra request when a turn is already active', async () => {
    const stub = await makeStub([
      chatStreamEntry('sess1', [wireFrame('assistant.delta', { delta: 'hi' }), wireFrame('run.completed')]),
    ]);
    const db = makeDb();
    const room = makeRoom();
    const { emit } = collector();
    const backend = wireBackend(stub.url);
    const relay = new ChatRelay({ players: fakePlayers(), backend, db, room, emit });

    const p1 = relay.send('hicks', 'first');
    const r2 = await relay.send('hicks', 'second');
    expect(r2).toEqual({ ok: false, error: 'busy' });
    const r1 = await p1;
    expect(r1).toEqual({ ok: true, text: 'ok' });

    const chatPosts = stub.requests.filter((r) => r.url === '/v1/chat/completions');
    expect(chatPosts).toHaveLength(1);
  });

  it('returns empty for whitespace-only text', async () => {
    const db = makeDb();
    const room = makeRoom();
    const { events, emit } = collector();
    const backend = wireBackend('http://127.0.0.1:1');
    const relay = new ChatRelay({ players: fakePlayers(), backend, db, room, emit });

    const result = await relay.send('hicks', '   ');

    expect(result).toEqual({ ok: false, error: 'empty' });
    expect(events).toHaveLength(0);
  });

  it('empty text is still refused for rp and ooc', async () => {
    const db = makeDb();
    const room = makeRoom();
    const { events, emit } = collector();
    const backend = wireBackend('http://127.0.0.1:1');
    const relay = new ChatRelay({ players: fakePlayers(), backend, db, room, emit });

    expect(await relay.send('hicks', '')).toEqual({ ok: false, error: 'empty' });
    expect(await relay.send('hicks', '', 'ooc')).toEqual({ ok: false, error: 'empty' });
    expect(events).toHaveLength(0);
  });

  it('retry re-sends the text of a failed user message, keeping the prior lost nix reply in the log', async () => {
    const db = makeDb();
    const room = makeRoom();
    const { emit } = collector();

    // First attempt: the backend is unreachable, so the user message ends up failed.
    const deadStub = await makeStub([]);
    const deadUrl = deadStub.url;
    await deadStub.close();
    stubs.splice(stubs.indexOf(deadStub), 1);
    const deadBackend = wireBackend(deadUrl);
    const relay1 = new ChatRelay({ players: fakePlayers(), backend: deadBackend, db, room, emit });
    const first = await relay1.send('hicks', 'hello again');
    expect(first).toEqual({ ok: false, error: 'unreachable' });

    const userId = db.recentMessages('hicks').find((m) => m.role === 'user')!.id;
    expect(db.getMessage('hicks', userId)?.status).toBe('failed');

    // Retry against a working stub.
    const stub = await makeStub([
      chatStreamEntry('sessR', [wireFrame('assistant.delta', { delta: 'recovered' }), wireFrame('run.completed')]),
    ]);
    const backend = wireBackend(stub.url);
    const relay2 = new ChatRelay({ players: fakePlayers(), backend, db, room, emit });

    const second = await relay2.retry('hicks', userId);
    expect(second).toEqual({ ok: true, text: 'ok' });

    expect(db.getMessage('hicks', userId)).toMatchObject({ status: 'ok', text: 'hello again' });
    const chatBody = stub.requests.find((r) => r.url === '/v1/chat/completions')!;
    expect(asTurn(chatBody.bodyJson).message.endsWith('\n\nhello again')).toBe(true);

    const allMessages = db.recentMessages('hicks');
    const nixMessages = allMessages.filter((m) => m.role === 'agent');
    expect(nixMessages.some((m) => m.replyTo === userId && m.status === 'ok' && m.text === 'recovered')).toBe(true);
  });

  it('retry with an unknown message id fails', async () => {
    const db = makeDb();
    const room = makeRoom();
    const { emit } = collector();
    const backend = wireBackend('http://127.0.0.1:1');
    const relay = new ChatRelay({ players: fakePlayers(), backend, db, room, emit });

    const result = await relay.retry('hicks', 'does-not-exist');
    expect(result).toEqual({ ok: false, error: 'unknown message' });
  });
});

/** A chat/stream entry whose n-th call (0-based) writes `framesByCall[min(n, last)]`. */
function sequencedChatStreamEntry(sessionId: string, framesByCall: string[][]) {
  let n = 0;
  return {
    match: (req: any) => req.method === 'POST' && req.url === '/v1/chat/completions',
    respond: (_req: any, res: any) => {
      const frames = framesByCall[Math.min(n++, framesByCall.length - 1)];
      startSseResponse(res);
      for (const f of frames) res.write(f);
      res.end();
    },
  };
}

const OK_FRAMES = [wireFrame('assistant.delta', { delta: 'hi' }), wireFrame('run.completed')];

function chatBodies(stub: StubChat): any[] {
  return stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson));
}

describe('ChatRelay roleplay / out-of-character mode', () => {
  function okStream(sessionId: string) {
    return chatStreamEntry(sessionId, [
      wireFrame('assistant.delta', { delta: 'plain answer' }),
      wireFrame('assistant.completed', { session_id: sessionId, content: 'plain answer' }),
      wireFrame('run.completed'),
      wireFrame('done'),
    ]);
  }

  it('an in-character turn carries the lights line right after the room line; an OOC turn does not', async () => {
    const stub = await makeStub([okStream('sess1'), okStream('sess2')]);
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db: makeDb(), room: makeRoom(), emit: collector().emit });
    await relay.send('hicks', '*the power cuts out*');
    await relay.send('hicks', 'is the app working?', 'ooc');
    const [rp, ooc] = stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson).message);
    expect(rp.split('\n')[0].startsWith('[room: ')).toBe(true);
    expect(body(rp).split('\n')[0]).toBe(LIGHTS_LINE);
    expect(ooc).not.toContain(LIGHTS_LINE);
  });

  it('a plain in-character turn ends with the beat line, right before their words; OOC does not', async () => {
    const stub = await makeStub([okStream('sess1'), okStream('sess2')]);
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db: makeDb(), room: makeRoom(), emit: collector().emit });
    await relay.send('hicks', 'what now?');
    await relay.send('hicks', 'is the app working?', 'ooc');
    const [rp, ooc] = stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson).message);
    expect(rp.endsWith(`\n${beatLine('hicks')}\n\nwhat now?`)).toBe(true);
    expect(beatLine('Hicks')).toMatch(/80 words/);
    expect(beatLine('Hicks')).toContain("Hicks's actions, words and feelings");
    expect(ooc).not.toContain('80 words');
  });

  it('[wearing] follows the room line at the head of the message, in and out of character; never in the system message', async () => {
    const stub = await makeStub([okStream('sess1'), okStream('sess2')]);
    const seen: Array<[string, number]> = [];
    const relay = new ChatRelay({
      players: fakePlayers(),
      backend: wireBackend(stub.url),
      db: makeDb(),
      room: makeRoom(),
      emit: () => {},
      others: () => [haeVoice('', false)],
      wearing: (player, others) => {
        seen.push([player.id, others.length]);
        return [
          { name: 'Nix', pronoun: 'she', self: true, text: 'grey coat' },
          { name: 'Hae', pronoun: 'she', text: 'stained apron' },
        ];
      },
    });
    await relay.send('hicks', 'hi');
    await relay.send('hicks', 'what are you wearing?', 'ooc');
    const [rp, ooc] = stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson));
    const line = '[wearing: Nix (she, yourself) — grey coat; Hae (she) — stained apron]';
    expect(rp.message.split('\n')[1]).toBe(line);
    expect(ooc.message.split('\n')[1]).toBe(line);
    expect(body(rp.message)).not.toContain('[wearing:');
    expect(rp.instructions).not.toContain('[wearing:');
    expect(seen).toEqual([['hicks', 1], ['hicks', 0]]);
  });

  it('no [wearing] line when no one has one, or without the dep', async () => {
    const stub = await makeStub([okStream('sess1'), okStream('sess2')]);
    const bare = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db: makeDb(), room: makeRoom(), emit: () => {} });
    await bare.send('hicks', 'hi');
    const empty = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db: makeDb(), room: makeRoom(), emit: () => {}, wearing: () => [] });
    await empty.send('hicks', 'hi');
    for (const r of stub.requests.filter((r) => r.url === '/v1/chat/completions')) expect(JSON.stringify(r.bodyJson)).not.toContain('[wearing:');
  });

  it('keep going carries no [wearing] line', async () => {
    const stub = await makeStub([okStream('sess1'), okStream('sess2')]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {}, wearing: () => [{ name: 'Nix', pronoun: 'she', self: true, text: 'grey coat' }] });
    await relay.send('hicks', 'hi');
    await relay.continueReply('hicks', db.recentMessages('hicks').find((m) => m.role === 'agent')!.id);
    const [, cont] = stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson));
    const lastUser = cont.messages.filter((m) => m.role === 'user').at(-1)!.content;
    expect(lastUser).not.toContain('[wearing:');
  });

  it('sends the OOC instructions (still with the room line) and tags both messages ooc', async () => {
    const stub = await makeStub([okStream('sess1')]);
    const db = makeDb();
    const { events, emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit });

    expect(await relay.send('hicks', 'is the app working?', 'ooc')).toEqual({ ok: true, text: 'ok' });

    const chat = asTurn(stub.requests.find((r) => r.url === '/v1/chat/completions')!.bodyJson);
    expect(chat.instructions).toBe(OOC_INSTRUCTIONS);
    expect(chat.message.startsWith('[room: ')).toBe(true);
    expect(chat.message.endsWith('\n\nis the app working?')).toBe(true);

    const messages = events.filter((e) => e.type === 'message').map((e) => (e as any).message);
    expect(messages.every((m) => m.mode === 'ooc')).toBe(true);
    for (const m of db.recentMessages('hicks')) expect(m.mode).toBe('ooc');
  });

  it('defaults to roleplay: room instructions, no mode tag', async () => {
    const stub = await makeStub([okStream('sess1')]);
    const db = makeDb();
    const { emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit });

    await relay.send('hicks', 'hi', 'rp');

    const chat = asTurn(stub.requests.find((r) => r.url === '/v1/chat/completions')!.bodyJson);
    expect(chat.instructions).toBe(RP_SYSTEM);
    for (const m of db.recentMessages('hicks')) expect(m.mode).toBeUndefined();
  });

  it("roleplay turns add the roleplay guide after the agent's own room note; OOC turns don't", async () => {
    const stub = await makeStub([okStream('sess1'), okStream('sess1')]);
    const { emit } = collector();
    const relay = new ChatRelay({
      players: fakePlayers(),
      backend: wireBackend(stub.url),
      db: makeDb(),
      room: makeRoom(),
      emit,
      instructions: 'NIX ROOM TEXT',
      oocInstructions: 'NIX OOC TEXT',
    });

    await relay.send('hicks', 'hi', 'rp');
    await relay.send('hicks', 'quick question', 'ooc');

    const [rp, ooc] = stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson));
    expect(rp.instructions).toBe(`${RP_HEADING}\n\nNIX ROOM TEXT\n\n${ROLEPLAY_GUIDE}`);
    expect(ooc.instructions).toBe('NIX OOC TEXT');
  });

  it('a retry keeps the original message mode', async () => {
    const stub = await makeStub([okStream('sess1')]);
    const db = makeDb();
    db.insertMessage('hicks', { id: 'u1', role: 'user', text: 'ooc q', toolLines: [], ts: 1, status: 'failed', mode: 'ooc' });
    const { emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit });

    await relay.retry('hicks', 'u1');

    const chat = asTurn(stub.requests.find((r) => r.url === '/v1/chat/completions')!.bodyJson);
    expect(chat.instructions).toBe(OOC_INSTRUCTIONS);
    const nix = db.recentMessages('hicks').find((m) => m.role === 'agent')!;
    expect(nix.mode).toBe('ooc');
  });
});

describe('ChatRelay end scene mode', () => {
  function okStream(sessionId: string) {
    return chatStreamEntry(sessionId, [
      wireFrame('assistant.delta', { delta: '*closes the door*' }),
      wireFrame('assistant.completed', { session_id: sessionId, content: '*closes the door*' }),
      wireFrame('run.completed'),
      wireFrame('done'),
    ]);
  }

  it('while her district is dark, [city] follows [time] and comes before her schedule (blackouts phase 3 §5)', async () => {
    const stub = await makeStub([okStream('sess1'), okStream('sess1')]);
    let dark = true;
    const asked: number[] = [];
    const relay = new ChatRelay({
      players: fakePlayers(), backend: wireBackend(stub.url), db: makeDb(), room: makeRoom(), emit: () => {}, clockNow: () => 1200,
      scheduleLine: () => '[your schedule: free until 23:00]',
      cityLine: (clock) => (asked.push(clock), dark ? '[city: the power is out across Karasu since 22:00]' : null),
    });
    await relay.send('hicks', 'hi');
    dark = false;
    await relay.send('hicks', 'again');
    const [first, second] = stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson).message);
    expect(first).toContain('[time: Thursday, Day 1, 20:05]\n[city: the power is out across Karasu since 22:00]\n[your schedule: free until 23:00]');
    expect(second).toContain('[time: Thursday, Day 1, 20:05]\n[your schedule: free until 23:00]');
    expect(second).not.toContain('[city:');
    expect(asked[0]).toBe(1205);
  });

  it('with a clock: the user row is stamped with the clock plus its cost, her reply with the same; the context has [time]', async () => {
    const stub = await makeStub([okStream('sess1'), okStream('sess1')]);
    const db = makeDb();
    let ticks = 0;
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {}, clockNow: () => 1200, onClock: () => ticks++ });

    await relay.send('hicks', 'hi');
    const [u, a] = db.recentMessages('hicks');
    expect(u).toMatchObject({ role: 'user', clock: 1205 });
    expect(a).toMatchObject({ role: 'agent', clock: 1205 });
    expect(asTurn(stub.requests.find((r) => r.url === '/v1/chat/completions')!.bodyJson).message).toContain('[time: Thursday, Day 1, 20:05]'); // the time as she answers: after this turn's cost
    expect(ticks).toBeGreaterThan(0);

    await relay.send('hicks', '', 'end');
    expect(db.recentMessages('hicks').filter((m) => m.role === 'user').at(-1)).toMatchObject({ mode: 'end', clock: 1200 });
  });

  it("who came and went since her last reply: the presence line after [time], asked with that reply's clock and this turn's; the others list sees both clocks", async () => {
    const stub = await makeStub([okStream('sess1'), okStream('sess1')]);
    const db = makeDb();
    const asked: Array<[number | null, number | null]> = [];
    const listed: Array<[number | null, number | null]> = [];
    const relay = new ChatRelay({
      players: fakePlayers(),
      backend: wireBackend(stub.url),
      db,
      room: makeRoom(),
      emit: () => {},
      clockNow: () => db.maxClock() ?? 1200,
      presence: (before, after) => {
        asked.push([before, after]);
        return before === null ? null : '[Silas comes in.]';
      },
      others: (clock, before) => {
        listed.push([clock, before]);
        return [];
      },
    });
    await relay.send('hicks', 'hi');
    await relay.send('hicks', 'again');
    expect(asked).toEqual([[null, 1205], [1205, 1210]]);
    expect(listed).toEqual([[1205, null], [1210, 1205]]);
    const turns = stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson));
    expect(turns[0].message).not.toContain('comes in');
    expect(turns[1].message).toContain('[time: Thursday, Day 1, 20:10]\n[Silas comes in.]');
  });

  it("a greeting or a move asks no presence line and lists no one who left: you've only just arrived (final review I1)", async () => {
    const stub = await makeStub([okStream('sess1'), okStream('sess1'), okStream('sess1')]);
    const db = makeDb();
    const asked: Array<[number | null, number | null]> = [];
    const listed: Array<number | null> = [];
    const relay = new ChatRelay({
      players: fakePlayers(),
      backend: wireBackend(stub.url),
      db,
      room: makeRoom(),
      emit: () => {},
      clockNow: () => db.maxClock() ?? 1200,
      presence: (before, after) => {
        asked.push([before, after]);
        return null;
      },
      others: (_clock, before) => {
        listed.push(before);
        return [];
      },
    });
    await relay.send('hicks', 'hi');
    await relay.travel('hicks', { from: null, to: 'Ribbon Rooftop', contact: 'Nix' });
    expect(asked.at(-1)![0]).toBeNull();
    expect(listed.at(-1)).toBeNull();
  });

  it('an empty end turn is sent, with the end note last and the placeholder as the user text', async () => {
    const stub = await makeStub([okStream('sess1')]);
    const db = makeDb();
    const { emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit });

    const result = await relay.send('hicks', '', 'end');

    expect(result).toEqual({ ok: true, text: 'ok' });
    const chat = asTurn(stub.requests.find((r) => r.url === '/v1/chat/completions')!.bodyJson);
    expect(chat.instructions).toBe(RP_SYSTEM);
    expect(body(chat.message).startsWith(`${END_SCENE_INSTRUCTIONS}\n\n`)).toBe(true);
    expect(chat.message.endsWith('\n\n[the user ends the scene]')).toBe(true);

    for (const m of db.recentMessages('hicks')) expect(m.mode).toBe('end');
  });

  it('an end turn with a last beat sends it followed by the placeholder', async () => {
    const stub = await makeStub([okStream('sess1')]);
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db: makeDb(), room: makeRoom(), emit: () => {} });

    await relay.send('hicks', 'one last thing', 'end');

    const chat = asTurn(stub.requests.find((r) => r.url === '/v1/chat/completions')!.bodyJson);
    expect(chat.message.endsWith('\n\none last thing\n\n[the user ends the scene]')).toBe(true);
  });

  it('a leave turn uses the leave note and the leave placeholder', async () => {
    const stub = await makeStub([okStream('sess1')]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {} });

    await relay.send('hicks', 'see you', 'end', { leave: true });

    const chat = asTurn(stub.requests.find((r) => r.url === '/v1/chat/completions')!.bodyJson);
    expect(chat.instructions).toBe(RP_SYSTEM);
    expect(body(chat.message).startsWith(`${LEAVE_INSTRUCTIONS}\n\n`)).toBe(true);
    expect(chat.message.endsWith('\n\nsee you\n\n[the user leaves]')).toBe(true);
    expect(db.recentMessages('hicks').find((m) => m.role === 'user')?.leave).toBe(true);
  });

  describe('her plans: LET HER GO and GO WITH HER (spec 2026-10-21 §5)', () => {
    const PLAN = { going: { place: 'x/home', until: 1300 }, meet: { place: 'x/haes', at: 1300 }, from: 'r1' };
    /** A relay whose plan card reads her stored plan (the world's part in the game). */
    const setup = async (script = [okStream('sess1')]) => {
      const stub = await makeStub(script);
      const db = makeDb();
      const events: { type: string; card?: unknown }[] = [];
      db.insertMessage('hicks', { id: 'u0', role: 'user', text: 'Hungry?', toolLines: [], ts: 1, status: 'ok' });
      db.insertMessage('hicks', { id: 'r1', role: 'agent', text: "I'll go home and shower. Hae's at nine.", toolLines: [], ts: 2, status: 'ok', replyTo: 'u0' });
      const relay = new ChatRelay({
        players: fakePlayers(),
        backend: wireBackend(stub.url),
        db,
        room: makeRoom(),
        emit: (e) => events.push(e as { type: string; card?: unknown }),
        planCard: (player) => {
          const p = parsePlan(db.getMeta(planKey(player)));
          return p?.going ? { name: 'Nix', going: "Nix's flat", meet: p.meet ? { place: "Hae's Noodles", time: '21:00' } : null, from: p.from } : null;
        },
      });
      return { stub, db, relay, events, cards: () => events.filter((e) => e.type === 'plan_card').map((e) => e.card) };
    };
    const store = (db: Db, plan: object = PLAN) => db.withStamp({ messageId: 'r1', take: 0 }, () => db.setMeta(planKey('hicks'), JSON.stringify(plan)));

    it("LET HER GO writes her parting row and runs her goodbye on her leave note; the plan stands", async () => {
      const { stub, db, relay } = await setup();
      store(db);
      expect(await relay.letHerGo('hicks')).toMatchObject({ ok: true });
      const row = db.recentMessages('hicks').find((m) => m.role === 'user' && m.mode === 'end')!;
      expect(row).toMatchObject({ leave: true, parting: 'her', text: '' });
      const chat = asTurn(stub.requests.find((r) => r.url === '/v1/chat/completions')!.bodyJson);
      expect(body(chat.message).startsWith(`${herLeaveInstructions("Nix's flat", { place: "Hae's Noodles", time: '21:00' })}\n\n`)).toBe(true);
      expect(chat.message.endsWith('[you head off]')).toBe(true);
      expect(chat.message).not.toContain(LEAVE_INSTRUCTIONS);
      expect(parsePlan(db.getMeta(planKey('hicks')))).toEqual(PLAN);
    });

    it('LET HER GO carries your typed last line: one turn, she answers it and goes', async () => {
      const { stub, db, relay } = await setup();
      store(db);
      expect(await relay.letHerGo('hicks', 'Nine, then.')).toMatchObject({ ok: true });
      const row = db.recentMessages('hicks').find((m) => m.role === 'user' && m.mode === 'end')!;
      expect(row).toMatchObject({ leave: true, parting: 'her', text: 'Nine, then.' });
      const chat = asTurn(stub.requests.find((r) => r.url === '/v1/chat/completions')!.bodyJson);
      expect(chat.message.endsWith('Nine, then.\n\n[you head off]')).toBe(true);
    });

    it('after her goodbye you are on your own: straight to solo, as after a HANG UP', async () => {
      const stub = await makeStub([okStream('sess1')]);
      const db = makeDb();
      db.insertMessage('hicks', { id: 'r1', role: 'agent', text: 'Hae\'s at nine.', toolLines: [], ts: 2, status: 'ok' });
      db.withStamp({ messageId: 'r1', take: 0 }, () => db.setMeta(planKey('hicks'), JSON.stringify(PLAN)));
      let solo = 0;
      const relay = new ChatRelay({
        players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {},
        planCard: () => ({ name: 'Nix', going: "Nix's flat", meet: null, from: 'r1' }),
        goSolo: () => void solo++,
      });
      await relay.letHerGo('hicks');
      expect(solo).toBe(1);
      // An ordinary LEAVE still waits for WALK OUT.
      await relay.send('hicks', 'bye', 'end', { leave: true });
      expect(solo).toBe(1);
    });

    it('a refused GO WITH HER or LET HER GO sends the card again, so the page that hid it gets it back (final review I1)', async () => {
      const { relay, db, cards } = await setup();
      store(db);
      relay.emitPlanCard('hicks');
      Object.defineProperty(relay, 'turnActive', { get: () => true });
      expect(relay.dropPlan('hicks')).toMatchObject({ ok: false, error: 'busy' });
      expect(await relay.letHerGo('hicks')).toMatchObject({ ok: false, error: 'busy' });
      const card = { name: 'Nix', going: "Nix's flat", meet: "Hae's Noodles at 21:00", from: 'r1' };
      expect(cards()).toEqual([card, card, card]);
      expect(parsePlan(db.getMeta(planKey('hicks')))).toEqual(PLAN);
    });

    it("her goodbye names where her stored plan sends her, not what the card's checks allow (mid review M3)", async () => {
      const stub = await makeStub([okStream('sess1')]);
      const db = makeDb();
      const relay = new ChatRelay({
        players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {},
        planCard: () => ({ name: 'Nix', going: 'the card', meet: null, from: 'r1' }),
        planLeave: () => ({ going: "Nix's flat", meet: { place: "Hae's Noodles", time: '21:00' } }),
      });
      await relay.letHerGo('hicks');
      const chat = asTurn(stub.requests.find((r) => r.url === '/v1/chat/completions')!.bodyJson);
      expect(body(chat.message).startsWith(herLeaveInstructions("Nix's flat", { place: "Hae's Noodles", time: '21:00' }))).toBe(true);
    });

    it('GO WITH HER with no card up is refused, and the plan stays (mid review M5)', async () => {
      const { relay, db } = await setup();
      store(db, { ...PLAN, going: null });
      expect(relay.dropPlan('hicks')).toMatchObject({ ok: false, error: 'no-plan' });
      expect(db.getMeta(planKey('hicks'))).not.toBeNull();
    });

    it('LET HER GO with no plan going is refused', async () => {
      const { relay, db } = await setup();
      expect(await relay.letHerGo('hicks')).toEqual({ ok: false, error: 'no-plan' });
      expect(db.recentMessages('hicks').some((m) => m.mode === 'end')).toBe(false);
    });

    it('GO WITH HER drops the plan under the reply that made it, and the card goes', async () => {
      const { relay, db, cards } = await setup();
      store(db);
      relay.emitPlanCard('hicks');
      expect(relay.dropPlan('hicks')).toMatchObject({ ok: true });
      expect(db.getMeta(planKey('hicks'))).toBeNull();
      // The drop folds into the set under the same reply: a rewind past it undoes both, a swipe of it too.
      expect(db.writes().filter((w) => w.key === planKey('hicks')).map((w) => [w.messageId, w.value])).toEqual([['r1', null]]);
      expect(cards()).toEqual([{ name: 'Nix', going: "Nix's flat", meet: "Hae's Noodles at 21:00", from: 'r1' }, null]);
    });

    it('a second plan replaces the card; the same card twice is sent once', async () => {
      const { relay, db, cards } = await setup();
      store(db);
      relay.emitPlanCard('hicks');
      relay.emitPlanCard('hicks');
      store(db, { ...PLAN, meet: null });
      relay.emitPlanCard('hicks');
      expect(cards()).toEqual([
        { name: 'Nix', going: "Nix's flat", meet: "Hae's Noodles at 21:00", from: 'r1' },
        { name: 'Nix', going: "Nix's flat", meet: null, from: 'r1' },
      ]);
    });

    it("her plan's note rides with the turn, and a spent plan goes under her reply", async () => {
      const stub = await makeStub([okStream('sess1')]);
      const db = makeDb();
      db.withStamp({ messageId: 'none', take: 0 }, () => db.setMeta(planKey('hicks'), JSON.stringify(PLAN)));
      const relay = new ChatRelay({
        players: fakePlayers(),
        backend: wireBackend(stub.url),
        db,
        room: makeRoom(),
        emit: () => {},
        planNote: () => ({ line: "[you waited at Hae's Noodles from 21:00 to 22:00; they never came]", spend: true }),
      });
      await relay.send('hicks', 'Hey.');
      const chat = asTurn(stub.requests.find((r) => r.url === '/v1/chat/completions')!.bodyJson);
      expect(chat.message).toContain("[you waited at Hae's Noodles from 21:00 to 22:00; they never came]");
      const reply = db.recentMessages('hicks').find((m) => m.role === 'agent')!;
      expect(db.getMeta(planKey('hicks'))).toBeNull();
      expect(db.writes().filter((w) => w.key === planKey('hicks')).at(-1)?.messageId).toBe(reply.id);
    });

    it('a regenerate of the reply that spent the plan keeps the line, and the new take spends it (final review M-a)', async () => {
      const stub = await makeStub([okStream('sess1'), okStream('sess1')]);
      const db = makeDb();
      db.insertMessage('hicks', { id: 'r0', role: 'agent', text: 'Bye.', toolLines: [], ts: 1, status: 'ok' });
      db.withStamp({ messageId: 'r0', take: 0 }, () => {
        db.setMeta(planKey('hicks'), JSON.stringify(PLAN));
        db.setMeta(planSeenKey('hicks'), JSON.stringify({ from: 'r1', missed: 1 }));
      });
      const notes: (string | undefined)[] = [];
      const relay = new ChatRelay({
        players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {},
        planNote: (_mode, raw) => {
          const plan = raw !== undefined ? raw : db.getMeta(planKey('hicks'));
          notes.push(plan ?? undefined);
          return plan ? { line: '[you waited]', spend: true } : null;
        },
      });
      await relay.send('hicks', 'Hey.');
      const reply = db.recentMessages('hicks').find((m) => m.role === 'agent' && m.id !== 'r0')!;
      expect(db.getMeta(planKey('hicks'))).toBeNull();
      expect(db.getMeta(planSeenKey('hicks'))).toBeNull();
      await relay.regenerate('hicks', reply.id);
      const second = asTurn(stub.requests.filter((r) => r.url === '/v1/chat/completions')[1].bodyJson);
      expect(second.message).toContain('[you waited]');
      expect(db.getMeta(planKey('hicks'))).toBeNull();
    });

    it('a rewind of the reply that spent the plan brings the plan (and so its line) back', async () => {
      const stub = await makeStub([okStream('sess1')]);
      const db = makeDb();
      db.insertMessage('hicks', { id: 'r0', role: 'agent', text: 'Bye.', toolLines: [], ts: 1, status: 'ok' });
      db.withStamp({ messageId: 'r0', take: 0 }, () => db.setMeta(planKey('hicks'), JSON.stringify(PLAN)));
      const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {}, planNote: () => ({ line: '[you waited]', spend: true }) });
      await relay.send('hicks', 'Hey.');
      expect(db.getMeta(planKey('hicks'))).toBeNull();
      expect(await relay.rewind('hicks', 'r0')).toMatchObject({ ok: true });
      expect(parsePlan(db.getMeta(planKey('hicks')))).toEqual(PLAN);
    });

    it('rebuild re-sends the card state: a rewind past the reply takes the card away', async () => {
      const { relay, db, cards } = await setup();
      store(db);
      relay.emitPlanCard('hicks');
      expect(await relay.rewind('hicks', 'u0')).toMatchObject({ ok: true });
      expect(db.getMeta(planKey('hicks'))).toBeNull();
      expect(cards().at(-1)).toBeNull();
    });
  });

  it('a retried leave line is still a leave (Review Focus 2)', async () => {
    const stub = await makeStub([okStream('sess1')]);
    const db = makeDb();
    db.insertMessage('hicks', { id: 'u1', role: 'user', text: '', toolLines: [], ts: 1, status: 'failed', mode: 'end', leave: true });
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {} });

    await relay.retry('hicks', 'u1');

    const chat = asTurn(stub.requests.find((r) => r.url === '/v1/chat/completions')!.bodyJson);
    expect(chat.instructions).toBe(RP_SYSTEM);
    expect(body(chat.message).startsWith(`${LEAVE_INSTRUCTIONS}\n\n`)).toBe(true);
    expect(chat.message.endsWith('[the user leaves]')).toBe(true);
  });

  it('leave is ignored off an end turn', async () => {
    const stub = await makeStub([okStream('sess1')]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {} });

    await relay.send('hicks', 'hi', 'rp', { leave: true });

    expect('leave' in db.recentMessages('hicks').find((m) => m.role === 'user')!).toBe(false);
  });

  it('an end turn with no recap emits no notice: the scribe writes the recap after it (scribe spec §2)', async () => {
    const stub = await makeStub([okStream('sess1')]);
    const db = makeDb();
    const journal = new Journal(db);
    const { events, emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal, emit });

    await relay.send('hicks', '', 'end');

    expect(events).not.toContainEqual({ type: 'notice', text: '// NO RECAP SAVED' });
  });

  it("a regenerate is told its line's time, not the time a replaced take skipped to; the tabs hear the clock come back (final review 1)", async () => {
    const db = makeDb();
    let relay!: ChatRelay;
    let call = 0;
    const stub = await makeStub([
      {
        match: (req: any) => req.method === 'POST' && req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          startSseResponse(res);
          res.write(wireFrame('assistant.delta', { delta: 'Later.' }));
          if (call++ === 0) relay.passTime(90);
          res.write(wireFrame('run.completed'));
          res.end();
        },
      },
    ]);
    let ticks = 0;
    relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {}, clockNow: () => Math.max(1200, db.maxClock() ?? 0), onClock: () => ticks++ });
    await relay.send('hicks', 'till dawn?');
    const reply = () => db.recentMessages('hicks').find((m) => m.role === 'agent')!;
    const before = ticks;
    await relay.regenerate('hicks', reply().id);
    const turns = stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson));
    expect(turns[1]!.message).toContain('[time: Thursday, Day 1, 20:05]');
    expect(ticks).toBeGreaterThan(before);
  });

  it('no clock (the lobby): no stamps, no [time] (final review 2)', async () => {
    const stub = await makeStub([okStream('sess1')]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {}, clockNow: () => null });
    await relay.send('hicks', 'hi');
    expect('clock' in db.recentMessages('hicks')[0]!).toBe(false);
    expect(asTurn(stub.requests.find((r) => r.url === '/v1/chat/completions')!.bodyJson).message).not.toContain('[time:');
    expect(relay.passTime(5)).toBeNull();
  });

  it('pass_time in a turn moves her reply past the line; a regenerate without it is back at the line; swipe follows the shown take (Review Focus 1)', async () => {
    const db = makeDb();
    let relay!: ChatRelay;
    let call = 0;
    const stub = await makeStub([
      {
        match: (req: any) => req.method === 'POST' && req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          startSseResponse(res);
          res.write(wireFrame('assistant.delta', { delta: 'Till dawn, then.' }));
          if (call++ === 0) expect(relay.passTime(90)).toBe(1295);
          res.write(wireFrame('run.completed'));
          res.end();
        },
      },
    ]);
    let live = 0;
    relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {}, clockNow: () => 1200, onLiveClock: () => live++ });
    expect(relay.passTime(5)).toBeNull();

    await relay.send('hicks', 'talk till dawn?');
    // Story moods (final review I2): the live hook fires on the turn's row and her pass_time...
    expect(live).toBeGreaterThanOrEqual(2);
    const reply = () => db.recentMessages('hicks').find((m) => m.role === 'agent')!;
    expect(reply().clock).toBe(1295);

    await relay.regenerate('hicks', reply().id);
    expect(reply().clock).toBe(1205);
    expect(db.getTakes('hicks', reply().id)!.takes.map((t) => t.passed ?? 0)).toEqual([90, 0]);

    const beforeSwipes = live;
    await relay.swipe('hicks', reply().id, 0);
    expect(reply().clock).toBe(1295);
    await relay.swipe('hicks', reply().id, 1);
    expect(reply().clock).toBe(1205);
    // ...but never on a swipe: the takes' rebuilt rooms are already right.
    expect(live).toBe(beforeSwipes);
  });

  describe('scribePass (time backstop 2026-10-20)', () => {
    /** A relay whose model says `text` each turn and records turnNow() mid-stream. */
    async function timed(text = 'The night goes on.') {
      const db = makeDb();
      let relay!: ChatRelay;
      const seen: (number | null)[] = [];
      const stub = await makeStub([
        {
          match: (req: any) => req.method === 'POST' && req.url === '/v1/chat/completions',
          respond: (_req: any, res: any) => {
            startSseResponse(res);
            seen.push(relay.turnNow());
            res.write(wireFrame('assistant.delta', { delta: text }));
            res.write(wireFrame('run.completed'));
            res.end();
          },
        },
      ]);
      let ticks = 0;
      /** The story clock elsewhere: another contact's rows, or a WAIT floor. */
      const elsewhere = { at: 0 };
      relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {}, clockNow: () => Math.max(1200, elsewhere.at, db.maxClock() ?? 0), onClock: () => ticks++ });
      const reply = () => db.recentMessages('hicks').find((m) => m.role === 'agent')!;
      return { db, relay, seen, reply, ticks: () => ticks, elsewhere };
    }

    it("moves a finished reply's clock and fires onClock", async () => {
      const t = await timed();
      await t.relay.send('hicks', 'wait the night with me');
      expect(t.reply().clock).toBe(1205);
      const before = t.ticks();
      expect(t.relay.scribePass('hicks', t.reply().id, 0, 365)).toMatchObject({ ok: true });
      expect(t.reply().clock).toBe(1570);
      expect(t.ticks()).toBeGreaterThan(before);
    });

    it('refuses too late once a later line exists; unknown; not shown', async () => {
      const t = await timed();
      await t.relay.send('hicks', 'wait the night with me');
      const first = t.reply();
      expect(t.relay.scribePass('hicks', 'nope', 0, 60)).toEqual({ ok: false, error: 'unknown' });
      const line = t.db.recentMessages('hicks').find((m) => m.role === 'user')!;
      expect(t.relay.scribePass('hicks', line.id, 0, 60)).toEqual({ ok: false, error: 'unknown' });
      expect(t.relay.scribePass('hicks', first.id, 1, 60)).toEqual({ ok: false, error: 'not shown' });
      await t.relay.send('hicks', 'and then?');
      expect(t.relay.scribePass('hicks', first.id, 0, 60)).toEqual({ ok: false, error: 'too late' });
      expect(t.db.getMessage('hicks', first.id)!.clock).toBe(1205);
    });

    it("refuses too late once the story moved on elsewhere: another contact's later stamp (final review I1)", async () => {
      const t = await timed();
      await t.relay.send('hicks', 'wait the night with me');
      t.elsewhere.at = 1235;
      expect(t.relay.scribePass('hicks', t.reply().id, 0, 365)).toEqual({ ok: false, error: 'too late' });
      expect(t.reply().clock).toBe(1205);
    });

    it('a swipe away and back keeps the skip (Review Focus 2)', async () => {
      const t = await timed();
      await t.relay.send('hicks', 'wait the night with me');
      await t.relay.regenerate('hicks', t.reply().id);
      expect(t.relay.scribePass('hicks', t.reply().id, 1, 60)).toMatchObject({ ok: true });
      expect(t.reply().clock).toBe(1265);
      await t.relay.swipe('hicks', t.reply().id, 0);
      expect(t.reply().clock).toBe(1205);
      await t.relay.swipe('hicks', t.reply().id, 1);
      expect(t.reply().clock).toBe(1265);
    });

    it('a skip on the only take survives a regenerate and a swipe back to it (review of Task 3)', async () => {
      const t = await timed();
      await t.relay.send('hicks', 'wait the night with me');
      expect(t.relay.scribePass('hicks', t.reply().id, 0, 365)).toMatchObject({ ok: true });
      await t.relay.regenerate('hicks', t.reply().id);
      expect(t.reply().clock).toBe(1205);
      await t.relay.swipe('hicks', t.reply().id, 0);
      expect(t.reply().clock).toBe(1570);
    });

    it('keep going on a moved reply carries on from the moved clock (Review Focus 1)', async () => {
      const t = await timed();
      await t.relay.send('hicks', 'wait the night with me');
      t.relay.scribePass('hicks', t.reply().id, 0, 120);
      await t.relay.continueReply('hicks', t.reply().id);
      expect(t.seen.at(-1)).toBe(1325);
      expect(t.reply().clock).toBe(1325);
    });
  });

  it('with a recap saved during the turn, no NO RECAP SAVED notice', async () => {
    const db = makeDb();
    const journal = new Journal(db);
    const stub = await makeStub([
      {
        match: (req: any) => req.method === 'POST' && req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          startSseResponse(res);
          res.write(wireFrame('assistant.delta', { delta: '*closes the door*' }));
          journal.setRecap('hicks', 'closed up for the night', 'agent');
          res.write(wireFrame('run.completed'));
          res.end();
        },
      },
    ]);
    const { events, emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal, emit });

    await relay.send('hicks', '', 'end');

    expect(events.some((e) => e.type === 'notice')).toBe(false);
  });

  it('a failed end turn emits no NO RECAP SAVED notice', async () => {
    const stub = await makeStub([chatStreamEntry('sess1', [wireFrame('assistant.delta', { delta: 'partial' })])]);
    const db = makeDb();
    const journal = new Journal(db);
    const { events, emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal, emit });

    const result = await relay.send('hicks', '', 'end');

    expect(result.ok).toBe(false);
    expect(events.some((e) => e.type === 'notice')).toBe(false);
  });

  it('skips the NO RECAP SAVED check when the relay has no journal', async () => {
    const stub = await makeStub([okStream('sess1')]);
    const { events, emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db: makeDb(), room: makeRoom(), emit });

    await relay.send('hicks', '', 'end');

    expect(events.some((e) => e.type === 'notice')).toBe(false);
  });

  it('take 1 saves a recap; a regenerate (take 2) that saves none still emits no notice (the pair already has a recap newer than the end line)', async () => {
    const db = makeDb();
    const journal = new Journal(db);
    let call = 0;
    const stub = await makeStub([
      {
        match: (req: any) => req.method === 'POST' && req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          call++;
          startSseResponse(res);
          res.write(wireFrame('assistant.delta', { delta: call === 1 ? 'first beat' : 'second beat' }));
          if (call === 1) journal.setRecap('hicks', 'closed up for the night', 'agent');
          res.write(wireFrame('run.completed'));
          res.end();
        },
      },
    ]);
    const { events, emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal, emit });

    await relay.send('hicks', '', 'end');
    const nixId = db.recentMessages('hicks').find((m) => m.role === 'agent')!.id;
    await relay.regenerate('hicks', nixId);

    expect(call).toBe(2);
    expect(events.some((e) => e.type === 'notice')).toBe(false);
  });

  it('keep going on an end reply whose first turn saved a recap emits no notice', async () => {
    const db = makeDb();
    const journal = new Journal(db);
    let call = 0;
    const stub = await makeStub([
      {
        match: (req: any) => req.method === 'POST' && req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          call++;
          startSseResponse(res);
          res.write(wireFrame('assistant.delta', { delta: call === 1 ? 'first beat' : ' more' }));
          if (call === 1) journal.setRecap('hicks', 'closed up for the night', 'agent');
          res.write(wireFrame('run.completed'));
          res.end();
        },
      },
    ]);
    const { events, emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal, emit });

    await relay.send('hicks', '', 'end');
    const nixId = db.recentMessages('hicks').find((m) => m.role === 'agent')!.id;
    await relay.continueReply('hicks', nixId);

    expect(call).toBe(2);
    expect(events.some((e) => e.type === 'notice')).toBe(false);
  });

  it('an end turn with no recap, followed by a regenerate that also saves none, fires the notice both times', async () => {
    const db = makeDb();
    const journal = new Journal(db);
    let call = 0;
    const stub = await makeStub([
      {
        match: (req: any) => req.method === 'POST' && req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          call++;
          startSseResponse(res);
          res.write(wireFrame('assistant.delta', { delta: call === 1 ? 'first beat' : 'second beat' }));
          res.write(wireFrame('run.completed'));
          res.end();
        },
      },
    ]);
    const { events, emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal, emit });

    await relay.send('hicks', '', 'end');
    const nixId = db.recentMessages('hicks').find((m) => m.role === 'agent')!.id;
    await relay.regenerate('hicks', nixId);

    expect(call).toBe(2);
    expect(events.filter((e) => e.type === 'notice')).toEqual([]);
  });
});

describe('ChatRelay greeting', () => {
  const MIN = 60_000;
  const reply = (text = '*looks up from the radio* You.') =>
    chatStreamEntry('s', [wireFrame('assistant.delta', { delta: text }), wireFrame('assistant.completed', { content: text }), wireFrame('run.completed'), wireFrame('done')]);
  const line = (over: Partial<ChatMessage>): ChatMessage => ({ id: crypto.randomUUID(), role: 'agent', text: 'hey', toolLines: [], ts: Date.now(), status: 'ok', ...over });
  const chats = (stub: StubChat) => stub.requests.filter((r) => r.url === '/v1/chat/completions');

  it('on a first meeting: a hidden greet row, the greet note, the placeholder and [arrival: first meeting]; her reply is a greeting', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal: new Journal(db), emit: () => {} });

    const result = await relay.greet('hicks');

    expect(result).toMatchObject({ ok: true });
    const [row, her] = db.recentMessages('hicks');
    expect(row).toMatchObject({ role: 'user', text: '', mode: 'greet', status: 'ok' });
    expect(her).toMatchObject({ role: 'agent', mode: 'greet', status: 'ok', replyTo: row!.id });
    const chat = asTurn(chats(stub)[0]!.bodyJson);
    expect(chat.instructions.endsWith(RP_SYSTEM)).toBe(true);
    expect(body(chat.message).startsWith(`${GREET_INSTRUCTIONS}\n\n`)).toBe(true);
    expect(chat.message.endsWith(`\n\n${GREET_PLACEHOLDER}`)).toBe(true);
    expect(chat.message).toContain('[arrival: first meeting]');
  });

  it('a first meeting with a tie: she knows him — the tie as her dossier, and the known arrival', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal: new Journal(db), emit: () => {}, tie: (p) => (p === 'hicks' ? 'Court.' : null) });

    await relay.greet('hicks');

    const chat = asTurn(chats(stub)[0]!.bodyJson);
    expect(chat.instructions).not.toContain('[your dossier on');
    expect(chat.message).toContain('[your dossier on hicks: Court.]'); // fakePlayers names hicks 'hicks'
    expect(chat.message).toContain('[arrival: first time this story, but you know them]');
  });

  it('after an opening scene row: still [arrival: first meeting] (the scene is not a line)', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    db.insertMessage('hicks', line({ id: 'scene-1', role: 'user', mode: 'scene', text: 'Rain has shut the Ribbon early.', scene: { title: 'After closing', source: 'written' }, ts: Date.now() - MIN }));
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal: new Journal(db), emit: () => {} });

    await relay.greet('hicks');

    expect(asTurn(chats(stub)[0]!.bodyJson).message).toContain('[arrival: first meeting]');
  });

  it('the scene row takes no message controls: retry, regenerate, edit and remove refuse it', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    db.insertMessage('hicks', line({ id: 'scene-1', role: 'user', mode: 'scene', text: 'Rain has shut the Ribbon early.', scene: { title: 'After closing', source: 'written' }, ts: Date.now() - MIN }));
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal: new Journal(db), emit: () => {} });

    expect(await relay.retry('hicks', 'scene-1')).toMatchObject({ ok: false });
    expect(await relay.regenerate('hicks', 'scene-1')).toMatchObject({ ok: false, error: 'unknown' });
    expect(await relay.edit('hicks', 'scene-1', 'x')).toMatchObject({ ok: false, error: 'unknown' });
    expect(await relay.remove('hicks', 'scene-1')).toMatchObject({ ok: false, error: 'unknown' });
    expect(db.getMessage('hicks', 'scene-1')).toMatchObject({ text: 'Rain has shut the Ribbon early.' });
    expect(chats(stub)).toHaveLength(0);
  });

  describe('the opening (arrival screen spec §3)', () => {
    const relayOn = (stub: StubChat, db: Db) => new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal: new Journal(db), emit: () => {} });

    it('on a new game: the scene row, then the greeting, with the [scene] block', async () => {
      const stub = await makeStub([reply()]);
      const db = makeDb();
      expect(await relayOn(stub, db).greet('hicks', ' Rain has shut the Ribbon. ')).toMatchObject({ ok: true });
      const [scene, greet, her] = db.recentMessages('hicks');
      expect(scene).toMatchObject({ role: 'user', mode: 'scene', text: 'Rain has shut the Ribbon.', scene: { title: WRITTEN_SCENE_TITLE, source: 'written' } });
      expect(greet).toMatchObject({ role: 'user', mode: 'greet' });
      expect(her).toMatchObject({ role: 'agent', replyTo: greet!.id });
      const chat = asTurn(chats(stub)[0]!.bodyJson);
      expect(`${chat.instructions}\n${chat.message}`).toContain('[scene: how this scene opens — "YOUR SCENE": Rain has shut the Ribbon.');
    });

    it('on a game with rows: the opening is dropped', async () => {
      const stub = await makeStub([reply()]);
      const db = makeDb();
      db.insertMessage('hicks', line({ ts: 1 }));
      await relayOn(stub, db).greet('hicks', 'Rain.');
      expect(db.recentMessages('hicks').some((m) => m.mode === 'scene')).toBe(false);
    });

    it('a blank opening writes nothing', async () => {
      const stub = await makeStub([reply()]);
      const db = makeDb();
      await relayOn(stub, db).greet('hicks', '   ');
      expect(db.recentMessages('hicks').some((m) => m.mode === 'scene')).toBe(false);
    });
  });

  it('is dropped when not due: nothing saved, nothing sent', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    db.insertMessage('hicks', line({ ts: Date.now() - MIN }));
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {} });

    expect(await relay.greet('hicks')).toBeNull();
    expect(db.recentMessages('hicks')).toHaveLength(1);
    expect(chats(stub)).toHaveLength(0);
  });

  it('is dropped once you have said something first', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {} });
    await relay.send('hicks', 'anyone home?');

    expect(await relay.greet('hicks')).toBeNull();
    expect(db.recentMessages('hicks').some((m) => m.mode === 'greet')).toBe(false);
  });

  it('greets once: a second request (another tab) finds the pair no longer due', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {} });

    await relay.greet('hicks');
    expect(await relay.greet('hicks')).toBeNull();
    expect(db.recentMessages('hicks').filter((m) => m.mode === 'greet' && m.role === 'user')).toHaveLength(1);
    expect(chats(stub)).toHaveLength(1);
  });

  it('is dropped while a turn is running', async () => {
    const stub = await makeStub([
      {
        match: (req: any) => req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          startSseResponse(res);
          setTimeout(() => {
            res.write(wireFrame('assistant.delta', { delta: 'hi' }));
            res.write(wireFrame('run.completed'));
            res.end();
          }, 50);
        },
      },
    ]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {} });
    const sending = relay.send('hicks', 'hello');

    expect(await relay.greet('hicks')).toBeNull();
    await sending;
    expect(db.recentMessages('hicks').some((m) => m.mode === 'greet')).toBe(false);
  });

  it('back after a WAIT: the arrival measures story time', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    // LEAVE at 20:00 a minute ago (her goodbye ends the scene); the story clock has since moved on by a WAIT.
    db.insertMessage('hicks', line({ role: 'agent', text: 'Later.', mode: 'end', ts: Date.now() - 60 * 1000, clock: 1200 }));
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {}, clockNow: () => 1200 + 8 * 60 + 30 });
    await relay.greet('hicks');
    expect(asTurn(chats(stub)[0]!.bodyJson).message).toContain('[arrival: back 8 hours after the scene ended]');
  });

  it('after an ended scene: [previously: …] with no 6-hour gap, and the arrival since the scene ended', async () => {
    const stub = await makeStub([reply(), reply()]);
    const db = makeDb();
    const journal = new Journal(db);
    journal.setRecap('hicks', 'we closed up at dawn', 'agent');
    db.insertMessage('hicks', line({ role: 'user', text: '', mode: 'end', ts: Date.now() - 10 * MIN }));
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal, emit: () => {} });

    await relay.greet('hicks');

    const chat = asTurn(chats(stub)[0]!.bodyJson);
    expect(chat.message).toContain('[previously: we closed up at dawn]');
    expect(chat.message).toContain('[arrival: back 10 min after the scene ended]');
    // An ordinary turn right after still waits for the gap.
    await relay.send('hicks', 'so');
    expect(asTurn(chats(stub)[1]!.bodyJson).message).not.toContain('[previously:');
  });

  it('fails before any frame: both rows go, messages_removed, and the pair is still due', async () => {
    const stub = await makeStub([
      { match: (req: any) => req.url === '/v1/chat/completions', respond: (_req: any, res: any) => res.writeHead(500).end() },
    ]);
    const db = makeDb();
    const { events, emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit });

    const result = await relay.greet('hicks');

    expect(result).toMatchObject({ ok: false });
    expect(db.recentMessages('hicks')).toEqual([]);
    const greetId = (events.find((e) => e.type === 'message') as Extract<ServerEvent, { type: 'message' }>).message.id;
    expect(events).toContainEqual({ type: 'messages_removed', ids: [greetId] });
    expect(await relay.greet('hicks')).not.toBeNull(); // tried again
  });

  it('a stream that opens and dies with no text: the greet row and the empty reply both go', async () => {
    const stub = await makeStub([chatStreamEntry('s', [])]);
    const db = makeDb();
    const { events, emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit });

    await relay.greet('hicks');

    expect(db.recentMessages('hicks')).toEqual([]);
    const removed = events.filter((e) => e.type === 'messages_removed') as Extract<ServerEvent, { type: 'messages_removed' }>[];
    const ids = removed.flatMap((e) => e.ids);
    const shown = events.filter((e) => e.type === 'message').map((e) => (e as Extract<ServerEvent, { type: 'message' }>).message.id);
    expect(new Set(ids)).toEqual(new Set(shown));
  });

  it('a stream that dies after some text keeps the greeting as lost', async () => {
    const stub = await makeStub([chatStreamEntry('s', [wireFrame('assistant.delta', { delta: '*glances up*' })])]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {} });

    await relay.greet('hicks');

    const [row, her] = db.recentMessages('hicks');
    expect(row).toMatchObject({ mode: 'greet', status: 'ok' });
    expect(her).toMatchObject({ mode: 'greet', status: 'lost', text: '*glances up*' });
  });

  it('a RETRY of a lost greeting that fails again keeps both rows: the greet line is marked failed, the lost reply still answers it', async () => {
    let call = 0;
    const stub = await makeStub([
      {
        match: (req: any) => req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          if (++call > 1) return res.writeHead(500).end();
          startSseResponse(res);
          res.write(wireFrame('assistant.delta', { delta: '*glances up*' }));
          res.end();
        },
      },
    ]);
    const db = makeDb();
    const { events, emit } = collector();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit });
    await relay.greet('hicks');
    const [row, lost] = db.recentMessages('hicks');
    events.length = 0;

    expect(await relay.retry('hicks', row!.id)).toMatchObject({ ok: false });

    expect(db.getMessage('hicks', row!.id)).toMatchObject({ mode: 'greet', status: 'failed' });
    expect(db.getMessage('hicks', lost!.id)).toMatchObject({ status: 'lost', replyTo: row!.id });
    expect(events.some((e) => e.type === 'messages_removed')).toBe(false);
    expect(events).toContainEqual({ type: 'message', message: expect.objectContaining({ id: row!.id, status: 'failed' }) });
  });

  it('a RETRY of a lost greeting whose stream dies empty drops only the new empty reply', async () => {
    let call = 0;
    const stub = await makeStub([
      {
        match: (req: any) => req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          startSseResponse(res);
          if (++call === 1) res.write(wireFrame('assistant.delta', { delta: '*glances up*' }));
          res.end();
        },
      },
    ]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {} });
    await relay.greet('hicks');
    const [row, lost] = db.recentMessages('hicks');

    await relay.retry('hicks', row!.id);

    expect(db.recentMessages('hicks').map((m) => m.id)).toEqual([row!.id, lost!.id]);
    expect(db.getMessage('hicks', row!.id)?.status).toBe('failed');
  });

  it('with her greeting deleted, the line before it is the latest again: regenerate, swipe and keep going work on it', async () => {
    const stub = await makeStub([reply('hello'), reply('again'), reply(' more')]);
    const db = makeDb();
    db.insertMessage('hicks', line({ id: 'u0', role: 'user', text: 'night', ts: Date.now() - 8 * 60 * MIN }));
    db.insertMessage('hicks', line({ id: 'a0', text: 'night, Hicks', replyTo: 'u0', ts: Date.now() - 8 * 60 * MIN + 1 }));
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {} });
    await relay.greet('hicks');
    const greeting = db.recentMessages('hicks').at(-1)!;
    expect(await relay.remove('hicks', greeting.id)).toMatchObject({ ok: true });

    expect(await relay.regenerate('hicks', 'a0')).toMatchObject({ ok: true });
    expect(await relay.swipe('hicks', 'a0', 0)).toMatchObject({ ok: true });
    expect(await relay.continueReply('hicks', 'a0')).toMatchObject({ ok: true });
  });

  it('regenerating a greeting reruns it as a greeting, though the pair is no longer due', async () => {
    const stub = await makeStub([reply('one'), reply('two')]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {} });
    await relay.greet('hicks');
    const her = db.recentMessages('hicks').at(-1)!;

    expect(await relay.regenerate('hicks', her.id)).toMatchObject({ ok: true });

    const chat = asTurn(chats(stub)[1]!.bodyJson);
    expect(chat.instructions).not.toContain(GREET_INSTRUCTIONS);
    expect(body(chat.message).startsWith(GREET_INSTRUCTIONS)).toBe(true);
    expect(chat.message.endsWith(GREET_PLACEHOLDER)).toBe(true);
  });
});

describe('ChatRelay travel', () => {
  const reply = (text = '*sets the bowls down* Two, no greens.') =>
    chatStreamEntry('s', [wireFrame('assistant.delta', { delta: text }), wireFrame('assistant.completed', { content: text }), wireFrame('run.completed'), wireFrame('done')]);
  const chats = (stub: StubChat) => stub.requests.filter((r) => r.url === '/v1/chat/completions');
  const move = { from: 'Lowlight Intake', to: "Hae's Noodles", contact: 'Nix' };
  const relayFor = (stub: StubChat, db: Db, room = makeRoom()) =>
    new ChatRelay({ players: fakePlayers('hicks', { hicks: { name: 'Hicks' } }), backend: wireBackend(stub.url), db, room, emit: () => {} });

  it('saves the action line and runs her turn with the travel line and note', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const result = await relayFor(stub, db).travel('hicks', move);

    expect(result).toMatchObject({ ok: true });
    const [row, her] = db.recentMessages('hicks');
    expect(row).toMatchObject({ role: 'user', mode: 'travel', status: 'ok', text: "*Hicks and Nix head from Lowlight Intake to Hae's Noodles.*" });
    expect(her).toMatchObject({ role: 'agent', status: 'ok', replyTo: row!.id });
    const chat = asTurn(chats(stub)[0]!.bodyJson);
    expect(chat.instructions.endsWith(RP_SYSTEM)).toBe(true);
    expect(body(chat.message).startsWith(`${TRAVEL_INSTRUCTIONS}\n\n`)).toBe(true);
    expect(chat.message).toContain(TRAVEL_LINE);
    expect(chat.message.endsWith(`\n\n${row!.text}`)).toBe(true);
  });

  it('through an exit, the action line says the way (clickable doors spec §4)', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    await relayFor(stub, db).travel('hicks', { from: "Hicks's walkway", to: "Hicks's room", contact: 'Nix', via: 'through the grey door into his room' });
    expect(db.recentMessages('hicks')[0]).toMatchObject({ role: 'user', mode: 'travel', text: '*Hicks and Nix go through the grey door into his room.*' });
  });

  it('a line follows the move line after a blank line (arrival screen spec §4)', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    await relayFor(stub, db).travel('hicks', { ...move, line: '  *grabs her coat* Come on.  ' });
    const text = "*Hicks and Nix head from Lowlight Intake to Hae's Noodles.*\n\n*grabs her coat* Come on.";
    expect(db.recentMessages('hicks')[0]).toMatchObject({ role: 'user', mode: 'travel', text });
    expect(asTurn(chats(stub)[0]!.bodyJson).message.endsWith(`\n\n${text}`)).toBe(true);
  });

  it('a blank line is no line', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    await relayFor(stub, db).travel('hicks', { ...move, line: '   ' });
    expect(db.recentMessages('hicks')[0]!.text).toBe("*Hicks and Nix head from Lowlight Intake to Hae's Noodles.*");
  });

  it('on comms, the line follows the on-the-line move', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    await relayFor(stub, db).travel('hicks', { ...move, comms: { on: true, at: 'x' }, line: 'Talk to me.' });
    expect(db.recentMessages('hicks')[0]!.text).toBe("*Hicks heads from Lowlight Intake to Hae's Noodles, Nix on the line.*\n\nTalk to me.");
  });

  it('names only the destination after an off-map start', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    await relayFor(stub, db).travel('hicks', { ...move, from: null });
    expect(db.recentMessages('hicks')[0]!.text).toBe("*Hicks and Nix head to Hae's Noodles.*");
  });

  it('is dropped while a turn is running', async () => {
    const stub = await makeStub([reply(), reply()]);
    const db = makeDb();
    const relay = relayFor(stub, db);
    const first = relay.send('hicks', 'shall we eat?');
    expect(await relay.travel('hicks', move)).toBeNull();
    await first;
    expect(db.recentMessages('hicks').some((m) => m.mode === 'travel')).toBe(false);
  });

  it('later turns do not get the travel line', async () => {
    const stub = await makeStub([reply(), reply()]);
    const db = makeDb();
    const relay = relayFor(stub, db);
    await relay.travel('hicks', move);
    await relay.send('hicks', 'the usual?');
    expect(asTurn(chats(stub)[1]!.bodyJson).message).not.toContain('[travel:');
  });

  it('regenerating her arrival re-sends the travel line and note', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const relay = relayFor(stub, db);
    await relay.travel('hicks', move);
    const her = db.recentMessages('hicks').find((m) => m.role === 'agent')!;
    expect(await relay.regenerate('hicks', her.id)).toMatchObject({ ok: true });
    const again = asTurn(chats(stub)[1]!.bodyJson);
    expect(again.message).toContain(TRAVEL_LINE);
    expect(again.instructions).not.toContain(TRAVEL_INSTRUCTIONS);
    expect(body(again.message).startsWith(TRAVEL_INSTRUCTIONS)).toBe(true);
  });

  it('deleting the move leaves the room where it is', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const room = makeRoom();
    const relay = relayFor(stub, db, room);
    await relay.travel('hicks', move);
    const scene = room.state.sceneId;
    const row = db.recentMessages('hicks').find((m) => m.mode === 'travel' && m.role === 'user')!;
    expect(await relay.remove('hicks', row.id)).toMatchObject({ ok: true });
    expect(db.recentMessages('hicks').some((m) => m.id === row.id)).toBe(false);
    expect(room.state.sceneId).toBe(scene);
  });

  it('a failed travel turn stays as a failed line and can be retried, without touching the room', async () => {
    // The stub answers with the first matching entry every time: fail the first call, then reply.
    let call = 0;
    const ok = reply();
    const stub = await makeStub([
      {
        match: (req: any) => req.url === '/v1/chat/completions',
        respond: (req: any, res: any) => (++call === 1 ? res.writeHead(500).end() : ok.respond(req, res)),
      },
    ]);
    const db = makeDb();
    const room = makeRoom();
    const scene = room.state.sceneId;
    const relay = relayFor(stub, db, room);

    expect(await relay.travel('hicks', move)).toMatchObject({ ok: false });
    const row = db.recentMessages('hicks').find((m) => m.mode === 'travel')!;
    expect(row.status).toBe('failed');
    expect(await relay.retry('hicks', row.id)).toMatchObject({ ok: true });
    expect(room.state.sceneId).toBe(scene);
  });
});

describe('ChatRelay gig', () => {
  const reply = (text = '*lets out a breath* You got it out.') =>
    chatStreamEntry('s', [wireFrame('assistant.delta', { delta: text }), wireFrame('assistant.completed', { content: text }), wireFrame('run.completed'), wireFrame('done')]);
  const chats = (stub: StubChat) => stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson));
  const run = { title: 'Held Pay', tier: 'hard' as const, place: 'The Tilt', client: 'Nobody', target: 'Glass Orchid · house ledger', take: 'a payout', brief: 'Thick lacquer.', result: 'clean' as const, trace: 8, max: 14 };
  const snap = { you: 'Hicks', ...run };
  const relayFor = (stub: StubChat, db: Db) =>
    new ChatRelay({ players: fakePlayers('hicks', { hicks: { name: 'Hicks' } }), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {} });

  it("a papers run forces the bulletin's lore, and the origins' too, into her turn (Papers spec §4.2)", async () => {
    const stub = await makeStub([reply()]);
    const forced: (readonly string[] | undefined)[] = [];
    const relay = new ChatRelay({
      players: fakePlayers('hicks', { hicks: { name: 'Hicks' } }),
      backend: wireBackend(stub.url),
      db: makeDb(),
      room: makeRoom(),
      emit: () => {},
      lore: (_scene, _recent, force) => (forced.push(force), { picks: [], dropped: [], chars: 0 }),
    });
    const papers = {
      name: 'Tomas Varga',
      bulletin: [
        { text: 'No arrivals from Kessen tonight.', why: 'SDG wants Kessen boats held.', lore: 'sentinel-defense-group' },
        { text: 'Clinic workers need a medical slip.', why: 'Chiron wants a record.', lore: 'chiron-medical' },
        { text: 'No permits for Velvet tonight.', why: 'Closed books.', lore: 'chiron-medical' },
      ],
      overlooked: null,
      extraLore: ['tidal-isle'],
    };
    await relay.gig('hicks', { ...run, kind: 'papers', result: 'clean', trace: 4, max: 6, papers });
    expect(forced).toEqual([['sentinel-defense-group', 'chiron-medical', 'tidal-isle']]);
  });

  it('saves the action line with its snapshot, and her turn gets GIG_INSTRUCTIONS and the [gig] line', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    expect(await relayFor(stub, db).gig('hicks', run)).toMatchObject({ ok: true });
    const [row, her] = db.recentMessages('hicks');
    expect(row).toMatchObject({ role: 'user', mode: 'gig', status: 'ok', text: gigActionLine(snap), gig: snap });
    expect(her).toMatchObject({ role: 'agent', replyTo: row!.id });
    const [turn] = chats(stub);
    expect(turn.instructions.endsWith(RP_SYSTEM)).toBe(true);
    expect(body(turn.message).startsWith(`${GIG_INSTRUCTIONS}\n\n`)).toBe(true);
    expect(turn.message.endsWith(gigText(snap))).toBe(true);
  });

  it('is dropped while a turn is running', async () => {
    const stub = await makeStub([reply(), reply()]);
    const db = makeDb();
    const relay = relayFor(stub, db);
    const first = relay.send('hicks', 'watch this');
    expect(await relay.gig('hicks', run)).toBeNull();
    await first;
    expect(db.recentMessages('hicks').some((m) => m.mode === 'gig')).toBe(false);
  });

  it('regenerating her reaction re-sends the [gig] line and note; a later turn has it in history (Review Focus 3)', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const relay = relayFor(stub, db);
    await relay.gig('hicks', run);
    const her = db.recentMessages('hicks').find((m) => m.role === 'agent')!;
    expect(await relay.regenerate('hicks', her.id)).toMatchObject({ ok: true });
    const again = chats(stub)[1];
    expect(again.message.endsWith(gigText(snap))).toBe(true);
    expect(again.instructions).not.toContain(GIG_INSTRUCTIONS);
    expect(body(again.message).startsWith(GIG_INSTRUCTIONS)).toBe(true);
    await relay.send('hicks', 'Drinks on me.');
    const later = chats(stub)[2];
    expect(later.instructions).not.toContain(GIG_INSTRUCTIONS);
    expect(JSON.stringify(stub.requests.at(-1)!.bodyJson)).toContain('[gig: Hicks just ran a job');
  });
});

describe('ChatRelay encounter', () => {
  const reply = (text = '*sets the chopsticks down* That is not my name.') =>
    chatStreamEntry('s', [wireFrame('assistant.delta', { delta: text }), wireFrame('assistant.completed', { content: text }), wireFrame('run.completed'), wireFrame('done')]);
  const chats = (stub: StubChat) => stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson));
  const courier = { name: 'Courier', voice: 'clipped, nervous' };
  const event = { title: 'Wrong package', text: 'A courier drops a box on the counter.', stranger: courier };
  const relayFor = (stub: StubChat, db: Db, others: ChatRelayDeps['others'] = undefined) =>
    new ChatRelay({ players: fakePlayers('hicks', { hicks: { name: 'Hicks' } }), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {}, others });

  it('writes its row and her reaction gets ENCOUNTER_INSTRUCTIONS and the stranger block', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    expect(await relayFor(stub, db).encounter('hicks', event)).toMatchObject({ ok: true });
    const [row, her] = db.recentMessages('hicks');
    expect(row).toMatchObject({ role: 'user', mode: 'encounter', status: 'ok', text: event.text, encounter: { title: 'Wrong package', stranger: courier } });
    expect(her).toMatchObject({ role: 'agent', replyTo: row!.id });
    const [turn] = chats(stub);
    expect(turn.instructions.endsWith(RP_SYSTEM)).toBe(true);
    expect(body(turn.message).startsWith(`${ENCOUNTER_INSTRUCTIONS}\n\n${strangerBlock(courier)}\n\n`)).toBe(true);
    expect(turn.message.endsWith(`[event: "Wrong package": A courier drops a box on the counter.]`)).toBe(true);
  });

  it('a power cut card keeps power on its row and cuts the power once, after the row (blackouts phase 3 §2)', async () => {
    const stub = await makeStub([reply(), reply()]);
    const db = makeDb();
    const cuts: { row: string; at: number; rowThere: boolean }[] = [];
    const relay = new ChatRelay({
      players: fakePlayers('hicks', { hicks: { name: 'Hicks' } }), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {},
      clockNow: () => 2700,
      cutPower: (row, at) => void cuts.push({ row, at, rowThere: db.getMessage('hicks', row) !== undefined }),
    });
    await relay.encounter('hicks', { title: 'Dark', text: 'The grid drops.', power: 'out' });
    const [row] = db.recentMessages('hicks');
    expect(row).toMatchObject({ mode: 'encounter', encounter: { title: 'Dark', power: 'out' } });
    expect(cuts).toEqual([{ row: row!.id, at: row!.clock ?? 2700, rowThere: true }]);
    await relay.encounter('hicks', { title: 'Courier', text: 'A box.' });
    expect(cuts).toHaveLength(1);
  });

  it("the resident's block ends the system message; the stranger block rides in the message after the event note", async () => {
    const stub = await makeStub([reply()]);
    const relay = relayFor(stub, makeDb(), () => [haeVoice('HAE VOICE', false)]);
    await relay.encounter('hicks', event);
    const turn = chats(stub)[0];
    expect(turn.instructions.endsWith(othersBlock([haeVoice('HAE VOICE', false)]))).toBe(true);
    expect(turn.instructions).not.toContain(strangerBlock(courier));
    expect(body(turn.message).startsWith(`${ENCOUNTER_INSTRUCTIONS}\n\n${strangerBlock(courier)}`)).toBe(true);
  });

  it('a later rp turn still carries the stranger block; OOC never; after END SCENE it is gone', async () => {
    const stub = await makeStub([reply()]);
    const relay = relayFor(stub, makeDb());
    await relay.encounter('hicks', event);
    await relay.send('hicks', 'Whose name?');
    await relay.send('hicks', 'brb', 'ooc');
    await relay.send('hicks', '', 'end');
    await relay.send('hicks', 'Next night.');
    const [, later, ooc, end, after] = chats(stub);
    expect(later.message).toContain(strangerBlock(courier));
    expect(later.message).not.toContain(ENCOUNTER_INSTRUCTIONS);
    expect(later.instructions).not.toContain('Courier is here');
    expect(ooc.message).not.toContain('Courier is here');
    expect(end.message).toContain('Courier is here');
    expect(after.message).not.toContain('Courier is here');
  });

  it('after travel the stranger is gone', async () => {
    const stub = await makeStub([reply()]);
    const relay = relayFor(stub, makeDb());
    await relay.encounter('hicks', event);
    await relay.travel('hicks', { from: null, to: 'Ribbon Rooftop', contact: 'Nix' });
    expect(chats(stub)[1].message).not.toContain('Courier is here');
  });

  it('a regenerate of her reaction keeps the event note and the stranger', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const relay = relayFor(stub, db);
    await relay.encounter('hicks', event);
    const her = db.allMessages('hicks').find((m) => m.role === 'agent')!;
    expect(await relay.regenerate('hicks', her.id)).toMatchObject({ ok: true });
    const again = chats(stub)[1];
    expect(again.instructions).not.toContain(ENCOUNTER_INSTRUCTIONS);
    expect(body(again.message).startsWith(`${ENCOUNTER_INSTRUCTIONS}\n\n${strangerBlock(courier)}\n\n`)).toBe(true);
  });

  it("a stranger named after the player or the resident is dropped; the event plays", async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const relay = relayFor(stub, db, () => [haeVoice('V', false)]);
    await relay.encounter('hicks', { ...event, stranger: { name: 'hicks', voice: 'v' } });
    await relay.encounter('hicks', { ...event, stranger: { name: 'Hae', voice: 'v' } });
    expect(db.allMessages('hicks').filter((m) => m.mode === 'encounter' && m.role === 'user').map((m) => m.encounter)).toEqual([{ title: 'Wrong package' }, { title: 'Wrong package' }]);
  });

  it('playing an event (or walking off) keeps the take on screen and drops the others, as answering her does (minor M5)', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const relay = relayFor(stub, db);
    for (const next of [() => relay.encounter('hicks', event), () => relay.travel('hicks', { from: null, to: 'Ribbon Rooftop', contact: 'Nix' })]) {
      await relay.send('hicks', 'hi');
      const her = db.allMessages('hicks').at(-1)!;
      await relay.regenerate('hicks', her.id);
      expect(db.getMessage('hicks', her.id)!.takes?.count).toBe(2);
      await next();
      expect(db.getMessage('hicks', her.id)!.takes).toBeUndefined();
    }
  });

  it('an event that is no event is dropped, writing nothing (minor M4)', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    expect(await relayFor(stub, db).encounter('hicks', { title: '', text: 'x' })).toBeNull();
    expect(db.allMessages('hicks')).toEqual([]);
  });

  it('is dropped while a turn is running', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const relay = relayFor(stub, db);
    const first = relay.send('hicks', 'hi');
    expect(await relay.encounter('hicks', event)).toBeNull();
    await first;
    expect(db.allMessages('hicks').some((m) => m.mode === 'encounter')).toBe(false);
  });
});

describe('ChatRelay journal lines', () => {
  const H = 60 * 60 * 1000;
  async function turn(setup: (db: Db, journal: Journal) => void, act?: (relay: ChatRelay) => Promise<unknown>, persona?: Persona | null) {
    const stub = await makeStub([
      chatStreamEntry('sess1', [wireFrame('assistant.delta', { delta: 'ok' }), wireFrame('run.completed'), wireFrame('done')]),
    ]);
    const db = makeDb();
    const room = makeRoom();
    const journal = new Journal(db);
    setup(db, journal);
    const relay = new ChatRelay({ players: fakePlayers('hicks', persona ? { hicks: { line: personaLine(persona) } } : {}), backend: wireBackend(stub.url), db, room, journal, emit: () => {} });
    await (act ? act(relay) : relay.send('hicks', 'hello'));
    const chat = stub.requests.find((r) => r.url === '/v1/chat/completions')!;
    return { message: asTurn(chat.bodyJson).message, room };
  }
  /** With a journal, her (empty) dossier page opens the blocks at the start of the message. */
  const PAGE = '[your dossier on hicks: empty]';
  const old = (db: Db, id: string, ago: number, over: Partial<import('../../shared/types').ChatMessage> = {}) =>
    db.insertMessage('hicks', { id, role: 'agent', text: 'earlier', toolLines: [], ts: Date.now() - ago, status: 'ok', ...over });

  it('without a journal, or with an empty one and no recap, the message is exactly as before (Review Focus 1)', async () => {
    const { message, room } = await turn(() => {});
    expect(message).toBe(`${room.summary()}\n\n${PAGE}\n\n${LIGHTS_LINE}\n${beatLine('hicks')}\n\nhello`);
  });

  it('the room line heads the message every turn; by their words, only what changed since her last turn', async () => {
    const stub = await makeStub(Array.from({ length: 4 }, (_, i) => chatStreamEntry(`s${i}`, [wireFrame('assistant.delta', { delta: 'ok' }), wireFrame('run.completed'), wireFrame('done')])));
    const db = makeDb();
    const room = makeRoom();
    let coat = 'grey coat';
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room, emit: () => {}, wearing: () => [{ name: 'Nix', pronoun: 'she', self: true, text: coat }] });
    const sent = () => stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson).message);
    const lamp = room.state.lights[0];
    await relay.send('hicks', 'one');
    await relay.send('hicks', 'two');
    room.setLight({ light_id: lamp.id, intensity: 0 }, 'agent');
    coat = 'nothing but the coat';
    await relay.send('hicks', 'three');
    const [one, two, three] = sent();
    for (const m of [one, two, three]) expect(m.startsWith('[room: ')).toBe(true);
    expect(one).not.toContain('[since your last reply');
    expect(two).not.toContain('[since your last reply');
    expect(body(two)).not.toContain('[wearing:');
    expect(body(three).startsWith(`[since your last reply: ${lamp.id} "${lamp.label}" ${lamp.color} 0%]\n${LIGHTS_LINE}\n[wearing: Nix (she, yourself) — nothing but the coat]\n`)).toBe(true);
    // A regenerate of that line compares against the turn before it, not against itself.
    await relay.regenerate('hicks', db.recentMessages('hicks').findLast((m) => m.role === 'agent')!.id);
    expect(body(sent()[3])).toContain('[since your last reply: ');
  });

  it('names what she keeps writing right before the beat line, and not what they just brought up', async () => {
    const { message } = await turn((db) => {
      old(db, 'a1', 3 * 60_000, { text: '*The paper lantern glows. The bakery box sits open.*' });
      old(db, 'a2', 2 * 60_000, { text: '*Under the paper lantern I close the bakery box.*' });
    }, (relay) => relay.send('hicks', '*opens the bakery box*'));
    expect(message).toContain(`\n[you keep writing these — "paper lantern". Leave them out of this reply; write what's new in this moment instead.]\n${beatLine('hicks')}\n\n*opens the bakery box*`);
  });

  it('puts the journal line right after the room line', async () => {
    const { message, room } = await turn((_db, j) => {
      j.note('hicks', { text: 'the blue mug is yours now', pinned: true }, 'agent');
    });
    expect(message).toBe(`${room.summary()}\n\n${PAGE}\n\n${LIGHTS_LINE}\n[journal (pinned): n1 (you) the blue mug is yours now]\n${beatLine('hicks')}\n\nhello`);
  });

  it('sends the rolling summary once the lines it covers have dropped out (scribe spec §6)', async () => {
    const { message, all } = await (async () => {
      const stub = await makeStub([chatStreamEntry('sess1', [wireFrame('assistant.delta', { delta: 'ok' }), wireFrame('run.completed'), wireFrame('done')])]);
      const db = makeDb();
      for (let i = 0; i < 25; i++) {
        old(db, `u${i}`, (100 - 2 * i) * 60_000, { role: 'user', text: `line ${i}` });
        old(db, `a${i}`, (99 - 2 * i) * 60_000, { text: `reply ${i}` });
      }
      db.setMeta('summary.hicks', JSON.stringify({ text: 'they argued about the valve', through: 'a9' }));
      const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal: new Journal(db), emit: () => {} });
      await relay.send('hicks', 'hello');
      const chat = stub.requests.find((r) => r.url === '/v1/chat/completions')!;
      return { message: asTurn(chat.bodyJson).message, all: chat.bodyJson as { messages: { role: string; content: string }[] } };
    })();
    expect(message).toContain('hello');
    expect(all.messages.some((m) => m.content.startsWith('[earlier tonight: they argued about the valve]'))).toBe(true);
  });

  it('brings back an unpinned note whose keyword this turn names', async () => {
    const { message } = await turn((_db, j) => {
      j.note('hicks', { text: 'Teo owes Mother Rot 200', keys: ['Teo'] }, 'agent');
      j.note('hicks', { text: 'the lamp hums', keys: ['lamp'] }, 'agent');
    }, (relay) => relay.send('hicks', 'did Teo pay up?'));
    expect(message).toContain('\n[journal: came up: n1 (you) Teo owes Mother Rot 200 · 1 more note]\n');
  });

  it('adds the recap after a 6-hour gap, and not after 5 hours', async () => {
    const after7 = await turn((db, j) => {
      old(db, 'a0', 7 * H);
      j.note('hicks', { text: 'x', pinned: true }, 'agent');
      j.setRecap('hicks', 'we closed up at dawn', 'agent');
    });
    expect(after7.message).toBe(`${after7.room.summary()}\n\n${PAGE}\n\n${LIGHTS_LINE}\n[journal (pinned): n1 (you) x]\n[previously: we closed up at dawn]\n${beatLine('hicks')}\n\nhello`);
    const after5 = await turn((db, j) => {
      old(db, 'a0', 5 * H);
      j.setRecap('hicks', 'we closed up at dawn', 'agent');
    });
    expect(after5.message).not.toContain('[previously:');
  });

  it("measures the gap from the latest message other than this turn's own user message (Review Focus 2)", async () => {
    const { message } = await turn(
      (db, j) => {
        old(db, 'a0', 8 * H);
        old(db, 'u1', 7 * H, { role: 'user', text: 'hi', status: 'failed' });
        old(db, 'r0', 60_000, { status: 'lost', replyTo: 'u0' });
        j.setRecap('hicks', 'we closed up at dawn', 'agent');
      },
      (relay) => relay.retry('hicks', 'u1'),
    );
    expect(message).not.toContain('[previously:');
  });

  it('adds [you: …] after the journal and previously lines when there is a persona', async () => {
    const hicks: Persona = { name: 'Hicks', description: 'Runs the crew.', pronoun: 'he' };
    const plain = await turn(() => {}, undefined, hicks);
    expect(plain.message).toBe(`${plain.room.summary()}\n\n${PAGE}\n\n${LIGHTS_LINE}\n[you: Hicks (he) — Runs the crew.]\n${beatLine('hicks')}\n\nhello`);
    const all = await turn(
      (db, j) => {
        old(db, 'a0', 7 * H);
        j.note('hicks', { text: 'x', pinned: true }, 'agent');
        j.setRecap('hicks', 'r', 'agent');
      },
      undefined,
      hicks,
    );
    expect(all.message).toBe(`${all.room.summary()}\n\n${PAGE}\n\n${LIGHTS_LINE}\n[journal (pinned): n1 (you) x]\n[previously: r]\n[you: Hicks (he) — Runs the crew.]\n${beatLine('hicks')}\n\nhello`);
  });

  it('carries the same lines out of character', async () => {
    const { message } = await turn(
      (_db, j) => j.note('hicks', { text: 'pin', pinned: true }, 'agent'),
      (relay) => relay.send('hicks', 'ooc question', 'ooc'),
    );
    expect(message).toContain('\n[journal (pinned): n1 (you) pin]\n\nooc question');
  });
});

describe('ChatRelay per pair', () => {
  const PLAYERS = fakePlayers('hicks', {
    hicks: { name: 'Hicks', line: '[you: Hicks — Runs the crew.]', whosHere: "[who's here: Hicks — crew lead]" },
    cass: { name: 'Cass', line: '[you: Cass — A courier.]', whosHere: "[who's here: Cass — courier]\nBORN: Mars" },
  });

  /** A stub that answers every turn at once, or holds the stream open until `release()`. */
  async function pairStub(hold = false) {
    let release!: () => void;
    const released = hold ? new Promise<void>((r) => (release = r)) : Promise.resolve();
    let n = 0;
    const stub = await makeStub([
      {
        match: (req: any) => req.method === 'POST' && req.url === '/v1/chat/completions',
        respond: (_req: any, res: any) => {
          const k = ++n;
          startSseResponse(res);
          res.write(':\n\n');
          void released.then(() => {
            res.write(wireFrame('assistant.delta', { delta: `reply ${k}` }));
            res.write(wireFrame('run.completed'));
            res.end();
          });
        },
      },
    ]);
    const turns = () => stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson));
    return { stub, turns, release: () => release() };
  }

  function pairRelay(url: string, over: Pick<ChatRelayDeps, 'identity' | 'others' | 'presence' | 'lore'> = {}) {
    const db = makeDb();
    const room = makeRoom();
    const journal = new Journal(db);
    const events: { e: ServerEvent; player?: string }[] = [];
    const relay = new ChatRelay({
      players: PLAYERS,
      backend: wireBackend(url),
      db,
      room,
      journal,
      emit: (e, player) => events.push({ e, ...(player !== undefined ? { player } : {}) }),
      ...over,
    });
    return { relay, db, room, journal, events };
  }

  async function waitFor(cond: () => boolean): Promise<void> {
    const start = Date.now();
    while (!cond()) {
      if (Date.now() - start > 2000) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  it("history sent for a turn contains only that pair's messages", async () => {
    const { stub, turns } = await pairStub();
    const { relay } = pairRelay(stub.url);
    await relay.send('hicks', 'hicks one');
    await relay.send('cass', 'cass one');
    await relay.send('hicks', 'hicks two');
    const [, cassTurn, hicksTwo] = turns();
    expect(cassTurn.messages.slice(1, -1)).toEqual([]);
    expect(hicksTwo.messages.slice(1, -1)).toEqual([
      { role: 'user', content: 'hicks one' },
      { role: 'assistant', content: 'reply 1' },
    ]);
    expect(JSON.stringify(hicksTwo.messages)).not.toContain('cass one');
  });

  it("a scene turn's history leaves text rows out (deck spec §3)", async () => {
    const { stub, turns } = await pairStub();
    const { relay, db } = pairRelay(stub.url);
    db.insertMessage('hicks', { id: 'tx', role: 'user', text: 'texted earlier', toolLines: [], ts: 1, status: 'ok', mode: 'text' });
    await relay.send('hicks', 'in person');
    const [one] = turns();
    expect(JSON.stringify(one.messages)).not.toContain('texted earlier');
  });

  describe('cache-friendly order (scribe spec §7)', () => {
    const TEO: LoreEntry = { id: 'teo', title: 'Teo', keys: ['Teo'], districts: [], places: [], always: false, body: 'A runner who owes.' };
    const lore: ChatRelayDeps['lore'] = (_scene, recent) => (recent[0]?.includes('Teo') ? { picks: [{ entry: TEO, why: 'key' }], dropped: [], chars: 20 } : { picks: [], dropped: [], chars: 0 });

    it('two rp turns in a row share the request prefix up to the latest user message, though the lore changed', async () => {
      const { stub, turns } = await pairStub();
      const { relay } = pairRelay(stub.url, { identity: () => 'I AM NIX', lore });
      await relay.send('hicks', 'Teo owes Mother Rot');
      await relay.send('hicks', 'anyway');
      const [one, two] = turns();
      expect(two.messages[0]).toEqual(one.messages[0]);
      expect(two.messages.slice(0, one.messages.length - 1)).toEqual(one.messages.slice(0, -1));
    });

    it('lore, her dossier page and the mode note ride in the latest user message, not the system', async () => {
      const { stub, turns } = await pairStub();
      const { relay } = pairRelay(stub.url, { identity: () => 'I AM NIX', lore });
      await relay.send('hicks', 'Teo owes Mother Rot');
      await relay.send('hicks', '', 'end');
      const [rp, end] = turns();
      expect(rp.instructions).not.toContain(loreBlock([TEO]));
      expect(rp.message).toContain(loreBlock([TEO]));
      expect(rp.instructions).not.toContain('[your dossier on');
      expect(rp.message).toContain('[your dossier on Hicks');
      expect(end.instructions).not.toContain(END_SCENE_INSTRUCTIONS);
      expect(body(end.message).startsWith(END_SCENE_INSTRUCTIONS)).toBe(true);
      // The room line heads the message, ahead of the lore (2026-10-23: away from their words).
      expect(rp.message.indexOf('[room:')).toBeLessThan(rp.message.indexOf(loreBlock([TEO])!));
    });

    it('a keep going turn still carries the per-turn blocks', async () => {
      const { stub, turns } = await pairStub();
      const { relay, db } = pairRelay(stub.url, { identity: () => 'I AM NIX', lore });
      await relay.send('hicks', 'Teo owes Mother Rot');
      const id = db.recentMessages('hicks').find((m) => m.role === 'agent')!.id;
      await relay.continueReply('hicks', id);
      const cont = turns()[1];
      expect(cont.message).toContain('[your dossier on Hicks');
      expect(cont.message.endsWith(CONTINUE_INSTRUCTION)).toBe(true);
    });
  });

  describe('the opening scene', () => {
    const SCENE_TEXT = 'Rain has shut the Ribbon early.';
    const seedScene = (db: Db, player: string) =>
      db.insertMessage(player, { id: `scene-${player}`, role: 'user', mode: 'scene', text: SCENE_TEXT, scene: { title: 'After closing', source: 'generated' }, toolLines: [], ts: 1, status: 'ok' });
    const BLOCK = `[scene: how this scene opens — "After closing": ${SCENE_TEXT} Play it from here; it's the situation, not a script.]`;
    const CITY: LoreEntry = { id: 'lowlight', title: 'Lowlight', keys: [], districts: [], places: [], always: true, body: 'A coastal sprawl.' };

    it("sits after the room note, before who's here (the lore block rides first in the message)", async () => {
      const { stub, turns } = await pairStub();
      const { relay, db } = pairRelay(stub.url, { identity: () => 'I AM NIX', lore: () => ({ picks: [{ entry: CITY, why: 'always' }], dropped: [], chars: 10 }) });
      seedScene(db, 'cass');
      await relay.send('cass', 'hi');
      expect(turns()[0].instructions.startsWith(`I AM NIX\n\n${RP_SYSTEM}\n\n${BLOCK}\n\n[who's here: Cass`)).toBe(true);
      expect(turns()[0].instructions).not.toContain(loreBlock([CITY]));
      expect(body(turns()[0].message).startsWith(`${loreBlock([CITY])}\n\n`)).toBe(true);
    });

    it('greets with the scene, rides rp, travel and end turns, skips ooc, and is gone after END SCENE', async () => {
      const { stub, turns } = await pairStub();
      const { relay, db } = pairRelay(stub.url, { identity: () => 'I AM NIX' });
      seedScene(db, 'hicks');
      await relay.greet('hicks');
      await relay.send('hicks', 'hi');
      await relay.send('hicks', 'hi', 'ooc');
      await relay.travel('hicks', { from: null, to: 'Somewhere', contact: 'Nix' });
      await relay.send('hicks', '', 'end');
      await relay.send('hicks', 'after');
      const t = turns();
      expect(t).toHaveLength(6);
      expect(t.map((x) => x.instructions.includes(BLOCK))).toEqual([true, true, false, true, true, false]);
      expect(t[0].message).toContain(SCENE_GREET_INSTRUCTIONS);
      expect(t[0].message).not.toContain(GREET_INSTRUCTIONS);
      expect(t[0].instructions).not.toContain(SCENE_GREET_INSTRUCTIONS);
      for (const x of t) expect(JSON.stringify(x.messages.slice(1))).not.toContain(SCENE_TEXT);
    });

    it('a later greeting mid-scene (back after the gap, a loaded save) is the usual one, with the block still on', async () => {
      const { stub, turns } = await pairStub();
      const { relay, db } = pairRelay(stub.url, { identity: () => 'I AM NIX' });
      seedScene(db, 'hicks');
      db.insertMessage('hicks', { id: 'g0', role: 'user', mode: 'greet', text: '', toolLines: [], ts: 2, status: 'ok' });
      db.insertMessage('hicks', { id: 'n0', role: 'agent', mode: 'greet', text: 'You came.', replyTo: 'g0', toolLines: [], ts: 3, status: 'ok' });
      db.insertMessage('hicks', { id: 'u0', role: 'user', text: 'Hey.', toolLines: [], ts: 4, status: 'ok' });
      db.insertMessage('hicks', { id: 'n1', role: 'agent', text: 'Hey yourself.', replyTo: 'u0', toolLines: [], ts: 5, status: 'ok' });
      await relay.greet('hicks');
      const t = turns();
      expect(t).toHaveLength(1);
      expect(body(t[0].message).startsWith(GREET_INSTRUCTIONS)).toBe(true);
      expect(t[0].message).not.toContain(SCENE_GREET_INSTRUCTIONS);
      expect(t[0].instructions).toContain(BLOCK);
    });

    it('a failed END SCENE leaves the scene on', async () => {
      const { stub, turns } = await pairStub();
      const { relay, db } = pairRelay(stub.url, { identity: () => 'I AM NIX' });
      seedScene(db, 'hicks');
      db.insertMessage('hicks', { id: 'e1', role: 'user', mode: 'end', text: '', toolLines: [], ts: 2, status: 'failed' });
      await relay.send('hicks', 'hi');
      expect(turns()[0].instructions).toContain(BLOCK);
    });

    it('regenerating the END SCENE reply still carries the block; the turn after it does not', async () => {
      const { stub, turns } = await pairStub();
      const { relay, db } = pairRelay(stub.url, { identity: () => 'I AM NIX' });
      seedScene(db, 'hicks');
      await relay.send('hicks', '', 'end');
      const reply = db.allMessages('hicks').findLast((m) => m.role === 'agent')!;
      await relay.regenerate('hicks', reply.id);
      await relay.send('hicks', 'after');
      expect(turns().map((t) => t.instructions.includes(BLOCK))).toEqual([true, true, false]);
    });

    it('the scene text helps choose lore while the scene is on, and stops once it ends', async () => {
      const { stub } = await pairStub();
      const recents: string[][] = [];
      const { relay, db } = pairRelay(stub.url, {
        identity: () => 'I AM NIX',
        lore: (_scene, recent) => {
          recents.push(recent);
          return { picks: [], dropped: [], chars: 0 };
        },
      });
      seedScene(db, 'hicks');
      await relay.send('hicks', 'hi');
      await relay.send('hicks', '', 'end');
      await relay.send('hicks', 'after');
      expect(recents[0]).toContain(SCENE_TEXT);
      expect(recents[2]).not.toContain(SCENE_TEXT);
    });

    it('without a scene, the greeting is the usual one', async () => {
      const { stub, turns } = await pairStub();
      const { relay } = pairRelay(stub.url, { identity: () => 'I AM NIX' });
      await relay.greet('hicks');
      expect(body(turns()[0].message).startsWith(GREET_INSTRUCTIONS)).toBe(true);
      expect(turns()[0].instructions).not.toContain('[scene:');
    });

    it("another pair in the same database never gets it", async () => {
      const { stub, turns } = await pairStub();
      const { relay, db } = pairRelay(stub.url, { identity: () => 'I AM NIX' });
      seedScene(db, 'cass');
      await relay.send('hicks', 'hi');
      expect(turns()[0].instructions).not.toContain('[scene:');
    });
  });

  describe('lore', () => {
    const entry = (id: string, title: string, body: string): LoreEntry => ({ id, title, keys: [], districts: [], places: [], always: true, body });
    const pick = (e: LoreEntry): LoreSelection => ({ picks: [{ entry: e, why: 'always' }], dropped: [], chars: 10 });
    const CITY = entry('lowlight', 'Lowlight', 'A coastal sprawl.');

    it("puts the [lore] block first in the message; the system message is identity, room note, who's here", async () => {
      const { stub, turns } = await pairStub();
      const { relay } = pairRelay(stub.url, { identity: () => 'I AM NIX', lore: () => pick(CITY) });
      await relay.send('cass', 'hi');
      const [t] = turns();
      expect(t.instructions.startsWith(`I AM NIX\n\n${RP_SYSTEM}\n\n[who's here: Cass`)).toBe(true);
      expect(t.instructions).not.toContain(LORE_HEADER);
      expect(body(t.message).startsWith(`${loreBlock([CITY])}\n\n`)).toBe(true);
    });

    it('in every mode', async () => {
      const { stub, turns } = await pairStub();
      const { relay } = pairRelay(stub.url, { identity: () => 'I AM NIX', lore: () => pick(CITY) });
      await relay.send('hicks', 'hi');
      await relay.send('hicks', 'hi', 'ooc');
      await relay.send('hicks', '', 'end');
      await relay.greet('hicks');
      await relay.travel('hicks', { from: null, to: 'Somewhere', contact: 'Nix' });
      const all = turns();
      expect(all).toHaveLength(5);
      for (const t of all) {
        expect(t.message).toContain(LORE_HEADER);
        expect(t.instructions).not.toContain(LORE_HEADER);
      }
    });

    it('no block when nothing is chosen', async () => {
      const { stub, turns } = await pairStub();
      const { relay } = pairRelay(stub.url, { identity: () => 'I AM NIX', lore: () => ({ picks: [], dropped: [], chars: 0 }) });
      await relay.send('cass', 'hi');
      expect(turns()[0].instructions).not.toContain('[lore:');
    });

    it("gets the room's scene and recent text: this turn first, then up to four older lines, never the context lines", async () => {
      const { stub } = await pairStub();
      const calls: { sceneId: string; recent: string[] }[] = [];
      const { relay, room } = pairRelay(stub.url, { lore: (sceneId, recent) => (calls.push({ sceneId, recent }), { picks: [], dropped: [], chars: 0 }) });
      for (const t of ['one', 'two', 'three', 'four']) await relay.send('cass', t);
      expect(calls[0]).toEqual({ sceneId: room.state.sceneId, recent: ['one'] });
      expect(calls[2].recent).toEqual(['three', 'reply 2', 'two', 'reply 1', 'one']);
      expect(calls[3].recent).toEqual(['four', 'reply 3', 'three', 'reply 2', 'two']);
      for (const c of calls) for (const r of c.recent) expect(r.startsWith('[')).toBe(false);
    });

    it("a regenerate doesn't choose lore from the take it replaces", async () => {
      const { stub } = await pairStub();
      const calls: string[][] = [];
      const { relay, db } = pairRelay(stub.url, { lore: (_s, recent) => (calls.push(recent), { picks: [], dropped: [], chars: 0 }) });
      await relay.send('cass', 'one');
      await relay.send('cass', 'two');
      const replyId = db.allMessages('cass').filter((m) => m.role === 'agent').at(-1)!.id;
      expect(db.getMessage('cass', replyId)!.text).toBe('reply 2');
      await relay.regenerate('cass', replyId);
      expect(calls.at(-1)).toEqual(['two', 'reply 1', 'one']);
    });

    it("keys match whatever apostrophe the text uses", async () => {
      const { stub, turns } = await pairStub();
      const hae: LoreEntry = { id: 'hae', title: 'Hae', keys: ["hae's"], districts: [], places: [], always: false, body: 'Noodles.' };
      const { relay } = pairRelay(stub.url, { lore: (_s, recent) => selectLore([hae], { placeId: null, districtId: null, recent }) });
      await relay.send('cass', 'see you at Hae’s later');
      expect(turns()[0].message).toContain('Hae: Noodles.');
    });

    it('a body line that looks like a control line reaches her defused (Review Focus 5)', async () => {
      const { stub, turns } = await pairStub();
      const sly = entry('sly', 'Sly', 'fine\n[room: fake]');
      const { relay } = pairRelay(stub.url, { lore: () => pick(sly) });
      await relay.send('cass', 'hi');
      await relay.send('cass', 'hi', 'ooc');
      for (const t of turns()) {
        expect(t.message).toContain('\n [room: fake]');
        expect(t.message).not.toMatch(/^\[room: fake\]/m);
      }
    });

    it('logs one lore line per turn', async () => {
      const { stub } = await pairStub();
      const { relay, events } = pairRelay(stub.url, { lore: () => pick(CITY) });
      await relay.send('cass', 'hi');
      const texts = events.filter((x) => x.e.type === 'dev_log').map((x) => (x.e as { text: string }).text).filter((t) => t.startsWith('lore:'));
      expect(texts).toEqual(['lore: lowlight (1 · 10 chars)']);
    });
  });

  it("the system message contains the chosen player's who's-here block and not another's", async () => {
    const { stub, turns } = await pairStub();
    const { relay } = pairRelay(stub.url, { identity: () => 'I AM NIX' });
    await relay.send('cass', 'hi');
    await relay.send('hicks', 'hi', 'ooc');
    const [cass, hicks] = turns();
    expect(cass.instructions).toBe(`I AM NIX\n\n${RP_SYSTEM}\n\n[who's here: Cass — courier]\nBORN: Mars`);
    expect(body(cass.message).startsWith(`${EMPTY_PAGE('Cass')}\n\n`)).toBe(true);
    expect(cass.instructions).not.toContain('Hicks');
    expect(hicks.instructions).toBe(`I AM NIX\n\n${OOC_INSTRUCTIONS}\n\n[who's here: Hicks — crew lead]`);
    expect(body(hicks.message).startsWith(`${EMPTY_PAGE('Hicks')}\n\n`)).toBe(true);
    expect(hicks.instructions).not.toContain('Cass');
  });

  it("the system message for an end turn is identity, room note, who's here; the end note then the dossier page open the message", async () => {
    const { stub, turns } = await pairStub();
    const { relay } = pairRelay(stub.url, { identity: () => 'I AM NIX' });
    await relay.send('cass', '', 'end');
    const [cass] = turns();
    expect(cass.instructions).toBe(`I AM NIX\n\n${RP_SYSTEM}\n\n[who's here: Cass — courier]\nBORN: Mars`);
    expect(body(cass.message).startsWith(`${END_SCENE_INSTRUCTIONS}\n\n${EMPTY_PAGE('Cass')}\n\n`)).toBe(true);
  });

  it("at a place with a resident, the system message ends with her block after the room note and who's here; not out of character", async () => {
    const { stub, turns } = await pairStub();
    const { relay } = pairRelay(stub.url, { others: () => [haeVoice('HAE VOICE', true)] });
    await relay.send('cass', 'hi');
    await relay.send('cass', 'hi', 'ooc');
    const [rp, ooc] = turns();
    expect(rp.instructions).toBe(`${RP_SYSTEM}\n\n[who's here: Cass — courier]\nBORN: Mars\n\n${othersBlock([haeVoice('HAE VOICE', true)])}`);
    expect(ooc.instructions).not.toContain('Hae is here');
  });

  it('with no one else here there is no block', async () => {
    const { stub, turns } = await pairStub();
    const { relay } = pairRelay(stub.url, { others: () => [] });
    await relay.send('cass', 'hi');
    expect(turns()[0].instructions).not.toContain('is here.');
  });

  it("the system message without identity or who's-here block is the note alone", async () => {
    const { stub, turns } = await pairStub();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db: makeDb(), room: makeRoom(), emit: () => {} });
    await relay.send('hicks', 'hi');
    expect(turns()[0].instructions).toBe(RP_SYSTEM);
  });

  it("a filled page opens the message, as one line (newlines → spaces, ] → )), not the system message", async () => {
    const { stub, turns } = await pairStub();
    const { relay, journal } = pairRelay(stub.url, { identity: () => 'I AM NIX' });
    journal.setPage('cass', 'Tends bar.\nHard to rattle [mostly].', 'agent');
    await relay.send('cass', 'hi');
    const [t] = turns();
    expect(t.instructions).toBe(`I AM NIX\n\n${RP_SYSTEM}\n\n[who's here: Cass — courier]\nBORN: Mars`);
    expect(body(t.message).startsWith('[your dossier on Cass: Tends bar. Hard to rattle [mostly).]\n\n')).toBe(true);
  });

  it("only the turn's pair's page is sent", async () => {
    const { stub, turns } = await pairStub();
    const { relay, journal } = pairRelay(stub.url);
    journal.setPage('cass', 'CASS PAGE', 'agent');
    await relay.send('hicks', 'hi');
    expect(turns()[0].message).toContain(EMPTY_PAGE('Hicks'));
    expect(JSON.stringify(turns()[0].messages)).not.toContain('CASS PAGE');
  });

  it("the turn's last context line is the chosen player's [you: …]", async () => {
    const { stub, turns } = await pairStub();
    const { relay, room } = pairRelay(stub.url);
    await relay.send('cass', 'hello');
    expect(turns()[0].message).toBe(`${room.summary()}\n\n${EMPTY_PAGE('Cass')}\n\n${LIGHTS_LINE}\n[you: Cass — A courier.]\n${beatLine('Cass')}\n\nhello`);
  });

  it("journal and previously lines come from the turn's pair", async () => {
    const { stub, turns } = await pairStub();
    const { relay, db, journal, room } = pairRelay(stub.url);
    const H = 60 * 60 * 1000;
    db.insertMessage('cass', { id: 'c0', role: 'agent', text: 'old', toolLines: [], ts: Date.now() - 8 * H, status: 'ok' });
    db.insertMessage('hicks', { id: 'h0', role: 'agent', text: 'recent', toolLines: [], ts: Date.now() - 60_000, status: 'ok' });
    journal.note('hicks', { text: 'hicks secret', pinned: true }, 'agent');
    journal.setRecap('cass', 'cass recap', 'agent');
    journal.setRecap('hicks', 'hicks recap', 'agent');
    await relay.send('cass', 'hello');
    expect(turns()[0].message).toBe(`${room.summary()}\n\n${EMPTY_PAGE('Cass')}\n\n${LIGHTS_LINE}\n[previously: cass recap]\n[you: Cass — A courier.]\n${beatLine('Cass')}\n\nhello`);
  });

  it("messages are saved under the turn's player and emitted with that player", async () => {
    const { stub } = await pairStub();
    const { relay, db, events } = pairRelay(stub.url);
    await relay.send('cass', 'hello');
    expect(db.allMessages('hicks')).toEqual([]);
    expect(db.allMessages('cass').map((m) => [m.role, m.text])).toEqual([
      ['user', 'hello'],
      ['agent', 'reply 1'],
    ]);
    for (const { e, player } of events) {
      if (e.type === 'message' || e.type === 'nix_delta' || e.type === 'messages_removed') expect(player).toBe('cass');
      else expect(player).toBeUndefined();
    }
    expect(events.some(({ e }) => e.type === 'nix_delta')).toBe(true);
    const agent = db.allMessages('cass')[1];
    events.length = 0;
    expect(await relay.remove('hicks', agent.id)).toEqual({ ok: false, error: 'unknown' });
    expect(await relay.remove('cass', agent.id)).toEqual({ ok: true, text: 'ok' });
    expect(events).toEqual([{ e: { type: 'messages_removed', ids: [agent.id] }, player: 'cass' }]);
  });

  it("activePlayer: the streaming turn's player, then the last turn's, then the default", async () => {
    const { stub, release } = await pairStub(true);
    const { relay } = pairRelay(stub.url);
    expect(relay.activePlayer).toBe('hicks');
    const p = relay.send('cass', 'hello');
    expect(relay.activePlayer).toBe('cass');
    await waitFor(() => relay.activeMessageId !== null);
    expect(relay.activePlayer).toBe('cass');
    release();
    await p;
    expect(relay.busy).toBe(false);
    expect(relay.activePlayer).toBe('cass');
  });

  it('busy across pairs: B sends while A streams → busy', async () => {
    const { stub, release, turns } = await pairStub(true);
    const { relay, db } = pairRelay(stub.url);
    const p = relay.send('hicks', 'first');
    await waitFor(() => relay.activeMessageId !== null);
    expect(await relay.send('cass', 'second')).toEqual({ ok: false, error: 'busy' });
    release();
    expect(await p).toEqual({ ok: true, text: 'ok' });
    expect(db.allMessages('cass')).toEqual([]);
    expect(turns()).toHaveLength(1);
  });

  it("an MCP-style tool call during pair A's streaming turn writes to A", async () => {
    const { stub, release } = await pairStub(true);
    const { relay, room, journal } = pairRelay(stub.url);
    const p = relay.send('cass', 'hello');
    await waitFor(() => relay.activeMessageId !== null);
    expect(relay.activePlayer).toBe('cass');
    const ctx = { room, journal, player: () => relay.activePlayer, expressions: null };
    // Her bookkeeping is the scribe's now (scribe spec): the dev panel's call stands in for one.
    const result = dispatchTool(ctx, 'note', { text: 'cass secret' }, 'dev');
    expect(result).toMatchObject({ ok: true });
    expect(journal.notes('cass').map((n) => n.text)).toContain('cass secret');
    expect(journal.notes('hicks').map((n) => n.text)).not.toContain('cass secret');
    release();
    await p;
  });

  it("regenerate and keep going on a non-default pair ('cass') write Cass's rows, emit to Cass, and carry Cass's who's-here", async () => {
    const { stub, turns } = await pairStub();
    const { relay, db, events } = pairRelay(stub.url, { identity: () => 'I AM NIX' });
    await relay.send('hicks', 'hicks one'); // the last turn before Cass's controls is Hicks's
    await relay.send('cass', 'hello');
    const hicksBefore = db.allMessages('hicks');
    const reply = db.allMessages('cass')[1];
    await relay.send('hicks', 'hicks two');
    const hicksAfter = db.allMessages('hicks');
    events.length = 0;

    expect(await relay.regenerate('cass', reply.id)).toMatchObject({ ok: true });
    expect(await relay.continueReply('cass', reply.id)).toMatchObject({ ok: true });

    expect(db.getTakes('cass', reply.id)!.takes.map((t) => t.text)).toEqual(['reply 2', 'reply 4 reply 5']);
    expect(db.getMessage('cass', reply.id)).toMatchObject({ text: 'reply 4 reply 5', status: 'ok' });
    expect(db.allMessages('hicks')).toEqual(hicksAfter);
    expect(hicksAfter.slice(0, hicksBefore.length)).toEqual(hicksBefore);
    for (const { e, player } of events) {
      if (e.type === 'message' || e.type === 'nix_delta' || e.type === 'messages_removed' || e.type === 'tool_line') expect(player).toBe('cass');
    }
    expect(events.some(({ e }) => e.type === 'nix_delta')).toBe(true);
    const [regen, cont] = turns().slice(-2);
    for (const t of [regen, cont]) {
      expect(t.instructions).toBe(`I AM NIX\n\n${RP_SYSTEM}\n\n[who's here: Cass — courier]\nBORN: Mars`);
      expect(t.message).toContain(EMPTY_PAGE('Cass'));
      expect(JSON.stringify(t.messages)).not.toContain('hicks');
    }
  });

  it('a pair mismatch during a turn throws instead of writing to another pair', async () => {
    const { stub, release } = await pairStub(true);
    const { relay } = pairRelay(stub.url);
    const p = relay.send('cass', 'hello');
    await waitFor(() => relay.activeMessageId !== null);
    // Simulate a call that re-entered mid-turn (no public method can today: each checks busy first).
    (relay as unknown as { pid: string }).pid = 'hicks';
    expect(() => (relay as unknown as { latest(): unknown }).latest()).toThrow('relay: pair mismatch');
    (relay as unknown as { pid: string }).pid = 'cass';
    release();
    expect(await p).toEqual({ ok: true, text: 'ok' });
  });

  it('restore refuses an id another pair holds, without throwing', async () => {
    const { stub } = await pairStub();
    const { relay, db } = pairRelay(stub.url);
    await relay.send('hicks', 'mine');
    const line = db.allMessages('hicks')[0];
    expect(await relay.restore('cass', line)).toEqual({ ok: false, error: 'unknown' });
    expect(db.allMessages('cass')).toEqual([]);
    expect(db.getMessage('hicks', line.id)).toEqual(line);
  });
});

describe('ChatRelay dice', () => {
  const reply = (text = 'Pay up.') =>
    chatStreamEntry('s', [wireFrame('assistant.delta', { delta: text }), wireFrame('assistant.completed', { content: text }), wireFrame('run.completed'), wireFrame('done')]);
  const chats = (stub: StubChat) => stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => asTurn(r.bodyJson));
  const game = { her: 'Nix', stake: 'a drink', result: 'lost' as const, rounds: [{ round: 1, bids: [{ q: 2, face: 4 as const, by: 'you' as const }], caller: 'her' as const, dice: { you: [4, 2] as (1 | 2 | 3 | 4 | 5 | 6)[], her: [3, 3] as (1 | 2 | 3 | 4 | 5 | 6)[] }, bid: { q: 2, face: 4 as const, by: 'you' as const }, count: 1, loser: 'you' as const, left: { you: 0, her: 2 } }], lines: ['Gotcha.'] };
  const snap = { you: 'Hicks', ...game };
  const relayFor = (stub: StubChat, db: Db) =>
    new ChatRelay({ players: fakePlayers('hicks', { hicks: { name: 'Hicks' } }), backend: wireBackend(stub.url), db, room: makeRoom(), emit: () => {} });

  it('saves the action line with its snapshot, and her turn gets DICE_INSTRUCTIONS and the [dice] line', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    expect(await relayFor(stub, db).dice('hicks', game)).toMatchObject({ ok: true });
    const [row, her] = db.recentMessages('hicks');
    expect(row).toMatchObject({ role: 'user', mode: 'dice', status: 'ok', text: diceActionLine(snap), dice: snap });
    expect(her).toMatchObject({ role: 'agent', replyTo: row!.id });
    const [turn] = chats(stub);
    expect(turn.instructions.endsWith(RP_SYSTEM)).toBe(true);
    expect(body(turn.message).startsWith(`${DICE_INSTRUCTIONS}\n\n`)).toBe(true);
    expect(turn.message.endsWith(diceText(snap))).toBe(true);
  });

  it('is dropped while a turn is running; a later turn has the [dice] line in history', async () => {
    const stub = await makeStub([reply(), reply(), reply()]);
    const db = makeDb();
    const relay = relayFor(stub, db);
    const first = relay.send('hicks', 'deal');
    expect(await relay.dice('hicks', game)).toBeNull();
    await first;
    await relay.dice('hicks', game);
    await relay.send('hicks', 'Again?');
    expect(JSON.stringify(stub.requests.at(-1)!.bodyJson)).toContain("[dice: Hicks just played liar's dice with you");
  });
});

describe('ChatRelay leads', () => {
  const reply = (text = 'Mm.') =>
    chatStreamEntry('s', [wireFrame('assistant.delta', { delta: text }), wireFrame('assistant.completed', { content: text }), wireFrame('run.completed'), wireFrame('done')]);
  const chats = (stub: StubChat) => stub.requests.filter((r) => r.url === '/v1/chat/completions');
  const TEO: LeadEntry_ = {
    id: 'teo-debt',
    title: "Teo's debt",
    from: 'cass',
    to: 'hicks',
    keys: ['teo'],
    after: null,
    fill: 'what he owes',
    place: null,
    onMind: 'Your brother is in trouble.',
    giverKnows: 'Teo borrowed.',
    receiverKnows: 'Teo owes you.',
  };
  const receiving = () => ({ onMind: [], offer: [], receive: [{ entry: TEO, details: 'Teo owes 4k' }] });

  it('lead blocks go after the room line at the head and the dossier page, all at the start of the message', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal: new Journal(db), emit: () => {}, tie: () => 'Court.', leads: receiving });
    await relay.send('hicks', 'hello');
    const turn = asTurn(chats(stub)[0]!.bodyJson);
    expect(turn.instructions).not.toContain("[if they raise it");
    const sys = turn.message;
    const page = sys.indexOf('[your dossier on hicks: Court.]');
    const lead = sys.indexOf("[if they raise it — Teo's debt:");
    const note = sys.indexOf('[room:');
    expect(note).toBe(0);
    expect(page).toBeGreaterThan(note);
    expect(lead).toBeGreaterThan(page);
  });

  it('the standing block goes after the dossier page and before the lead blocks', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal: new Journal(db), emit: () => {}, tie: () => 'Court.', leads: receiving, standing: (p) => `[how you feel about ${p} — "Wary":]` });
    await relay.send('hicks', 'hello');
    const sys = asTurn(chats(stub)[0]!.bodyJson).message;
    const page = sys.indexOf('[your dossier on hicks: Court.]');
    const standing = sys.indexOf('[how you feel about hicks — "Wary":]');
    const lead = sys.indexOf("[if they raise it — Teo's debt:");
    expect(page).toBeGreaterThanOrEqual(0);
    expect(standing).toBeGreaterThan(page);
    expect(lead).toBeGreaterThan(standing);
  });

  it('the standing block rides a greeting, not an OOC turn, and not when there is none', async () => {
    const stub = await makeStub([reply(), reply(), reply()]);
    const db = makeDb();
    let block: string | null = '[how you feel about hicks — "Wary":]';
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal: new Journal(db), emit: () => {}, standing: () => block });
    await relay.greet('hicks');
    expect(asTurn(chats(stub)[0]!.bodyJson).message).toContain('[how you feel about hicks');
    expect(asTurn(chats(stub)[0]!.bodyJson).instructions).not.toContain('[how you feel about');
    await relay.send('hicks', 'quick question', 'ooc');
    expect(asTurn(chats(stub)[1]!.bodyJson).message).not.toContain('[how you feel about');
    block = null;
    await relay.send('hicks', 'hello');
    expect(asTurn(chats(stub)[2]!.bodyJson).message).not.toContain('[how you feel about');
  });

  it('a regenerate tells the standing callback which reply it replaces; a new turn says none (final review, Important 1)', async () => {
    const stub = await makeStub([reply(), reply()]);
    const db = makeDb();
    const seen: [string, string | null][] = [];
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal: new Journal(db), emit: () => {}, standing: (p, replaced) => (seen.push([p, replaced]), null) });
    await relay.send('hicks', 'hello');
    const id = db.recentMessages('hicks', 10).findLast((m) => m.role === 'agent')!.id;
    await relay.regenerate('hicks', id);
    expect(seen).toEqual([['hicks', null], ['hicks', id]]);
  });

  it('the leads callback gets the player and the lore window, this turn first', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const seen: [string, string[]][] = [];
    const relay = new ChatRelay({
      players: fakePlayers(),
      backend: wireBackend(stub.url),
      db,
      room: makeRoom(),
      journal: new Journal(db),
      emit: () => {},
      leads: (p, recent) => (seen.push([p, recent]), { onMind: [], offer: [], receive: [] }),
    });
    await relay.send('hicks', 'about your brother');
    expect(seen).toEqual([['hicks', ['about your brother']]]);
  });

  it('an OOC turn carries no lead blocks', async () => {
    const stub = await makeStub([reply()]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal: new Journal(db), emit: () => {}, leads: receiving });
    await relay.send('hicks', 'teo?', 'ooc');
    expect(asTurn(chats(stub)[0]!.bodyJson).instructions).not.toContain('[if they raise it');
  });

  it('offeredLeads holds the turn’s offer while it runs and is empty after', async () => {
    const db = makeDb();
    let during: string[] = [];
    let relay!: ChatRelay;
    const backend = {
      async *streamTurn() {
        during = relay.offeredLeads().map((l) => l.id);
        yield { event: 'stream.open', data: undefined };
        yield { event: 'assistant.delta', data: { delta: 'ok' } };
        yield { event: 'run.completed', data: undefined };
      },
      probe: async () => 'ok' as const,
      currentModel: async () => ({ model: 'm', provider: 'p' }),
    };
    relay = new ChatRelay({ players: fakePlayers(), backend: backend as never, db, room: makeRoom(), journal: new Journal(db), emit: () => {}, leads: () => ({ onMind: [TEO], offer: [TEO], receive: [] }) });
    await relay.send('hicks', 'teo');
    expect(during).toEqual(['teo-debt']);
    expect(relay.offeredLeads()).toEqual([]);
  });

  it('a turn at the receiver whose text names a key marks the lead followed, and rewinding that line unmarks it', async () => {
    const stub = await makeStub([reply(), reply(), reply()]);
    const db = makeDb();
    const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: makeRoom(), journal: new Journal(db), emit: () => {}, leads: receiving });
    await relay.send('hicks', 'evening');
    expect(db.getMeta('lead.hicks.teo-debt.followed')).toBeNull();
    const first = db.allMessages('hicks').filter((m) => m.role === 'agent').at(-1)!;
    await relay.send('hicks', "I'm here about Teo");
    expect(db.getMeta('lead.hicks.teo-debt.followed')).toBe('1');
    await relay.send('hicks', 'and Teo again');
    expect(db.writes().filter((w) => w.key === 'lead.hicks.teo-debt.followed')).toHaveLength(1);
    await relay.rewind('hicks', first.id);
    expect(db.getMeta('lead.hicks.teo-debt.followed')).toBeNull();
  });
});
