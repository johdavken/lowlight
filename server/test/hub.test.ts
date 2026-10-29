import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { writeHabits } from '../src/habits';
import os from 'node:os';
import type { WebSocket } from 'ws';
import { SceneRegistry } from '../src/scenes';
import { Room } from '../src/room-state';
import { roomRegistry } from '../src/rooms';
import { generateScenes } from '../../tools/gen-placeholders';
import { openDb } from '../src/db';
import { Journal } from '../src/journal';
import { createHub, validateClientEvent } from '../src/hub';
import { TRAVEL_LINE_MAX } from '../../shared/arrival';
import { SCENE_TEXT_MAX } from '../../shared/scenario';
import type { ChatRelay } from '../src/chat-relay';
import type { ModelPicker } from '../src/model-catalog';
import type { ServerEvent } from '../../shared/types';
import { tempDir } from './fixtures/temp-dir';
import { papersBoard } from '../../shared/papers/generate';
import { ruleText } from '../../shared/papers/rules';
import { firstNightSeen, loadPapersData } from '../src/papers';
import type { GigSnapshot } from '../../shared/gig/brief';

let tmpDir: string;
let registry: SceneRegistry;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-hub-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Just enough of a `ws` socket for the hub: records what it is sent. */
function fakeSocket(): { ws: WebSocket; events: ServerEvent[]; client(e: unknown): void } {
  const events: ServerEvent[] = [];
  const handlers: Record<string, (d: string) => void> = {};
  const ws = {
    OPEN: 1,
    readyState: 1,
    send: (data: string) => events.push(JSON.parse(data) as ServerEvent),
    on: (name: string, fn: (d: string) => void) => (handlers[name] = fn),
  } as unknown as WebSocket;
  return { ws, events, client: (e) => handlers.message?.(JSON.stringify(e)) };
}

function makeHub(activeMessageId: string | null = null, activePlayer = 'hicks', extra: Partial<Parameters<typeof createHub>[0]> = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  const journal = new Journal(db);
  const room = new Room(registry);
  const hub = createHub({
    player: 'hicks',
    room,
    journal,
    tools: { room, journal, player: () => 'hicks', expressions: null },
    db,
    scenes: registry.list(),
    sceneErrors: [],
    getRelay: () => ({ activeMessageId, busy: false, activePlayer }) as unknown as ChatRelay,
    ...extra,
  });
  return { hub, db, journal, room };
}

describe("hub: who's here", () => {
  const silas = { id: 'silas', kind: 'contact' as const, name: 'Silas', pronoun: 'he' as const, accent: '#6f9bff', thumb: '/api/agents/silas/thumb', sprite: null, face: { x: 0.5, y: 0.1 }, tagline: 'Counter.', facts: [] };

  it('a tab joining mid-scene gets the strip right after the scene list', () => {
    const { hub, db } = makeHub(null, 'hicks', { others: () => [silas], voices: () => [silas, { ...silas, id: 'ember', name: 'Ember' }] });
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    const types = a.events.map((e) => e.type);
    expect(types.indexOf('others')).toBe(types.indexOf('scenes') + 1);
    expect(a.events.find((e) => e.type === 'others')).toEqual({ type: 'others', others: [silas], voices: [silas, { ...silas, id: 'ember', name: 'Ember' }] });
    db.close();
  });

  it('without the dep, an empty strip', () => {
    const { hub, db } = makeHub();
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    expect(a.events.find((e) => e.type === 'others')).toEqual({ type: 'others', others: [], voices: [] });
    db.close();
  });
});

describe('hub model sync', () => {
  it('sends no model on connect while the pair is unknown', () => {
    const { hub, db } = makeHub();
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    expect(a.events.some((e) => e.type === 'model')).toBe(false);
    db.close();
  });

  it('broadcasts a model change and sends the last known pair (right after link) to newly connected clients', () => {
    const { hub, db } = makeHub();
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');

    hub.emit({ type: 'model', model: 'grok-4-6', provider: 'xai-oauth' });
    hub.emit({ type: 'model', model: 'claude-sonnet-5-5', provider: 'anthropic' });
    expect(a.events.filter((e) => e.type === 'model')).toEqual([
      { type: 'model', model: 'grok-4-6', provider: 'xai-oauth' },
      { type: 'model', model: 'claude-sonnet-5-5', provider: 'anthropic' },
    ]);

    const b = fakeSocket();
    hub.addClient(b.ws, 'hicks');
    const types = b.events.map((e) => e.type);
    expect(types.indexOf('model')).toBe(types.indexOf('link') + 1);
    expect(b.events.filter((e) => e.type === 'model')).toEqual([
      { type: 'model', model: 'claude-sonnet-5-5', provider: 'anthropic' },
    ]);
    db.close();
  });
});

describe('hub portrait sync', () => {
  it('sends the default portrait on connect, after link and model', () => {
    const { hub, db } = makeHub();
    hub.emit({ type: 'model', model: 'grok-4-6', provider: 'xai-oauth' });
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    const types = a.events.map((e) => e.type);
    expect(a.events.filter((e) => e.type === 'portrait')).toEqual([{ type: 'portrait', kind: 'mask', accent: '#ff4f8b', name: 'Nix', pronoun: 'they', url: '/portraits/nix.png' }]);
    expect(types.indexOf('portrait')).toBe(types.indexOf('model') + 1);
    db.close();
  });

  it('replays the latest emitted portrait to newly connected clients', () => {
    const { hub, db } = makeHub();
    hub.emit({ type: 'portrait', kind: 'mask', accent: '#ff4f8b', name: 'Nix', pronoun: 'she', url: '/portraits/alt.png' });
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    expect(a.events.filter((e) => e.type === 'portrait')).toEqual([{ type: 'portrait', kind: 'mask', accent: '#ff4f8b', name: 'Nix', pronoun: 'she', url: '/portraits/alt.png' }]);
    db.close();
  });
});

describe('validateClientEvent: user_message mode', () => {
  it('accepts rp, ooc, end, or no mode (defaulting to rp)', () => {
    expect(validateClientEvent({ type: 'user_message', text: 'hi' })).toEqual({ type: 'user_message', text: 'hi', mode: 'rp' });
    expect(validateClientEvent({ type: 'user_message', text: 'hi', mode: 'ooc' })).toEqual({ type: 'user_message', text: 'hi', mode: 'ooc' });
    expect(validateClientEvent({ type: 'user_message', text: 'hi', mode: 'rp' })).toEqual({ type: 'user_message', text: 'hi', mode: 'rp' });
    expect(validateClientEvent({ type: 'user_message', text: '', mode: 'end' })).toEqual({ type: 'user_message', text: '', mode: 'end' });
  });

  it('rejects an unknown mode with a readable message', () => {
    expect(validateClientEvent({ type: 'user_message', text: '', mode: 'end', leave: true })).toEqual({ type: 'user_message', text: '', mode: 'end', leave: true });
    expect(validateClientEvent({ type: 'user_message', text: 'hi', mode: 'rp', leave: true })).toBe("user_message 'leave' needs mode 'end'");
    expect(validateClientEvent({ type: 'user_message', text: '', mode: 'end', leave: 'yes' })).toBe("user_message 'leave' must be a boolean");
    expect(validateClientEvent({ type: 'user_message', text: 'hi', mode: 'narrator' })).toBe("user_message 'mode' must be 'rp', 'ooc' or 'end'");
    expect(validateClientEvent({ type: 'user_message', text: 'x', mode: 'fin' })).toBe("user_message 'mode' must be 'rp', 'ooc' or 'end'");
  });
});

describe('validateClientEvent: a power cut card (blackouts phase 3 §2)', () => {
  it('passes power through, and only "out"', () => {
    expect(validateClientEvent({ type: 'encounter', encounter: { title: 'Dark', text: 'The grid drops.', power: 'out' } })).toEqual({ type: 'encounter', encounter: { title: 'Dark', text: 'The grid drops.', power: 'out' } });
    expect(validateClientEvent({ type: 'encounter', encounter: { title: 'Dark', text: 'The grid drops.', power: 'yes' } })).toEqual({ type: 'encounter', encounter: { title: 'Dark', text: 'The grid drops.' } });
  });
});

describe('validateClientEvent: legacy as:nix', () => {
  it("maps dev_action as:'agent' to as:'agent'", () => {
    expect(validateClientEvent({ type: 'dev_action', tool: 'set_light', args: {}, as: 'agent' })).toEqual({
      type: 'dev_action', tool: 'set_light', args: {}, as: 'agent',
    });
  });
});

describe('hub journal', () => {
  const of = (events: ServerEvent[], type: ServerEvent['type']) => events.filter((e) => e.type === type);

  it('sends the journal and recap on connect, after history', () => {
    const { hub, db, journal } = makeHub();
    journal.note('hicks', { text: 'the blue mug is yours now' }, 'agent');
    journal.setRecap('hicks', 'we closed up at dawn', 'agent');
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    const types = a.events.map((e) => e.type);
    expect(types.indexOf('journal')).toBeGreaterThan(types.indexOf('history'));
    expect(of(a.events, 'journal')[0]).toMatchObject({ notes: [{ id: 'n1', text: 'the blue mug is yours now' }] });
    expect(of(a.events, 'recap')[0]).toMatchObject({ text: 'we closed up at dawn', seen: false });
    db.close();
  });

  it('a mood the story applies writes // MOOD on the reply; other world changes write none (story moods spec §4)', () => {
    const { hub, db, room } = makeHub('r1');
    db.insertMessage('hicks', { id: 'r1', role: 'agent', text: '', toolLines: [], ts: 1, status: 'streaming' });
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.events.length = 0;
    room.applyPreset({ name: 'late', duration: 3 }, 'world');
    expect(of(a.events, 'tool_line')).toEqual([{ type: 'tool_line', messageId: 'r1', text: '// MOOD · LATE' }]);
    room.setLight({ light_id: 'desk_lamp', intensity: 0.1 }, 'world');
    expect(of(a.events, 'tool_line')).toHaveLength(1);
    db.close();
  });

  it('the power going and coming back writes // MOOD · POWER OUT and POWER BACK (blackouts phase 3 §3)', () => {
    const { hub, db, room } = makeHub('r1');
    db.insertMessage('hicks', { id: 'r1', role: 'agent', text: '', toolLines: [], ts: 1, status: 'streaming' });
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.events.length = 0;
    room.setPower({ out: true }, 'world');
    room.setPower({ out: false }, 'world');
    expect(of(a.events, 'tool_line').map((e) => (e as { text: string }).text)).toEqual(['// MOOD · POWER OUT', '// MOOD · POWER BACK']);
    db.close();
  });

  it("an agent's journal call broadcasts the journal and a quiet tool line on her reply", () => {
    const { hub, db, journal } = makeHub('r1');
    db.insertMessage('hicks', { id: 'r1', role: 'agent', text: '', toolLines: [], ts: 1, status: 'streaming' });
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.events.length = 0;
    journal.note('hicks', { text: 'pin me', pinned: true }, 'agent');
    expect(of(a.events, 'journal')).toHaveLength(1);
    expect(of(a.events, 'tool_line')).toEqual([{ type: 'tool_line', messageId: 'r1', text: '// PINNED' }]);
    expect(db.getMessage('hicks', 'r1')!.toolLines).toEqual(['// PINNED']);
    journal.setRecap('hicks', 'later', 'agent');
    expect(of(a.events, 'recap')).toHaveLength(1);
    expect(of(a.events, 'tool_line').at(-1)).toMatchObject({ text: '// RECAP SAVED' });
    db.close();
  });

  it('withToolLineReply puts a tool line on the reply the Residual read, not the one streaming (residual review I3)', () => {
    const { hub, db, journal } = makeHub('r2');
    db.insertMessage('hicks', { id: 'r1', role: 'agent', text: 'one', toolLines: [], ts: 1, status: 'ok' });
    db.insertMessage('hicks', { id: 'r2', role: 'agent', text: '', toolLines: [], ts: 2, status: 'streaming' });
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.events.length = 0;
    hub.withToolLineReply('hicks', 'r1', () => journal.note('hicks', { text: 'about me', about: 'me', pinned: true }, 'agent'));
    expect(of(a.events, 'tool_line')).toEqual([{ type: 'tool_line', messageId: 'r1', text: '// PINNED' }]);
    expect(db.getMessage('hicks', 'r1')!.toolLines).toEqual(['// PINNED']);
    expect(db.getMessage('hicks', 'r2')!.toolLines).toEqual([]);
    journal.note('hicks', { text: 'after', pinned: true }, 'agent');
    expect(db.getMessage('hicks', 'r2')!.toolLines).toEqual(['// PINNED']);
    db.close();
  });

  it("a tool line lands on the reply in progress of the running turn's pair", () => {
    const { hub, db, journal } = makeHub('r1', 'cass');
    db.insertMessage('cass', { id: 'r1', role: 'agent', text: '', toolLines: [], ts: 1, status: 'streaming' });
    hub.addClient(fakeSocket().ws, 'hicks');
    journal.note('cass', { text: 'my own plans', about: 'me' }, 'agent');
    expect(db.getMessage('cass', 'r1')!.toolLines).toEqual(['// NOTED']);
    db.close();
  });

  it("another pair's dossier note or recap is not broadcast; her journal notes are", () => {
    const { hub, db, journal } = makeHub('r1');
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.events.length = 0;
    journal.note('cass', { text: 'cass hates the rain' }, 'agent');
    journal.setRecap('cass', 'cass left', 'agent');
    expect(a.events).toEqual([]);
    journal.note('cass', { text: 'the lamp flickers', about: 'me' }, 'user');
    expect(of(a.events, 'journal')).toEqual([{ type: 'journal', notes: [expect.objectContaining({ id: 'n2', about: 'me' })] }]);
    db.close();
  });

  it("the player's edits and dev actions broadcast the journal but no tool line", () => {
    const { hub, db, journal } = makeHub('r1');
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.events.length = 0;
    journal.note('hicks', { text: 'x' }, 'user');
    journal.note('hicks', { text: 'y' }, 'dev');
    expect(of(a.events, 'journal')).toHaveLength(2);
    expect(of(a.events, 'tool_line')).toEqual([]);
    db.close();
  });

  it('applies journal_edit, journal_delete, journal_restore and recap_seen from the browser as the player', () => {
    const { hub, db, journal } = makeHub();
    journal.note('hicks', { text: 'first' }, 'agent');
    journal.setRecap('hicks', 'r', 'agent');
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.client({ type: 'journal_edit', id: 'n1', text: 'first, fixed', pinned: true });
    expect(journal.notes('hicks')[0]).toMatchObject({ text: 'first, fixed', pinned: true, editedBy: 'user' });
    a.client({ type: 'journal_edit', id: 'n1', pinned: false });
    expect(journal.notes('hicks')[0]).toMatchObject({ text: 'first, fixed', pinned: false });
    const before = journal.notes('hicks')[0];
    a.client({ type: 'journal_delete', id: 'n1' });
    expect(journal.notes('hicks')).toEqual([]);
    a.client({ type: 'journal_restore', note: before });
    expect(journal.notes('hicks')).toEqual([before]);
    a.client({ type: 'recap_seen' });
    expect(journal.recap('hicks').seen).toBe(true);
    db.close();
  });

  it('journal_edit sets a note\'s keys, and a restore keeps them', () => {
    const { hub, db, journal } = makeHub();
    journal.note('hicks', { text: 'Teo owes' }, 'agent');
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.client({ type: 'journal_edit', id: 'n1', keys: ['Teo', 'debt'] });
    expect(journal.notes('hicks')[0]).toMatchObject({ text: 'Teo owes', keys: ['Teo', 'debt'] });
    const before = journal.notes('hicks')[0];
    a.client({ type: 'journal_delete', id: 'n1' });
    a.client({ type: 'journal_restore', note: before });
    expect(journal.notes('hicks')[0].keys).toEqual(['Teo', 'debt']);
    expect(validateClientEvent({ type: 'journal_edit', id: 'n1', keys: 'Teo' })).toBe("journal_edit 'keys' must be an array of strings");
    db.close();
  });

  it("a refused edit comes back as a dev_log warning with the journal's message", () => {
    const { hub, db, journal } = makeHub();
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.client({ type: 'journal_edit', id: 'n9', text: 'x' });
    expect(of(a.events, 'dev_log').at(-1)).toEqual({ type: 'dev_log', level: 'warn', text: "no note 'n9'" });
    expect(journal.notes('hicks')).toEqual([]);
    db.close();
  });

  it('answers residual_runs with that pair\'s runs, newest first, at most 50 (scribe spec §8)', () => {
    const { hub, db } = makeHub();
    const run = (at: number, player: string) => ({ at, kind: 'turn' as const, player, messageId: 'm', take: 0, ms: 5, tokensIn: null, tokensOut: null, raw: '{}', applied: [], refused: [], error: null });
    for (let i = 0; i < 55; i++) db.insertResidualRun(run(i, 'hicks'));
    db.insertResidualRun(run(99, 'cass'));
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.client({ type: 'residual_runs' });
    const ev = of(a.events, 'residual_runs').at(-1)! as unknown as { runs: { at: number; player: string }[] };
    expect(ev.runs).toHaveLength(50);
    expect(ev.runs[0].at).toBe(54);
    expect(ev.runs.every((r) => r.player === 'hicks')).toBe(true);
    expect(validateClientEvent({ type: 'residual_runs' })).toEqual({ type: 'residual_runs' });
    db.close();
  });

  it("residual_runs carries the pair's habits list, null without one (habits spec §3)", () => {
    const { hub, db } = makeHub();
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.client({ type: 'residual_runs' });
    expect((of(a.events, 'residual_runs').at(-1)! as unknown as { habits: unknown }).habits).toBeNull();
    writeHabits(db, 'hicks', { rules: ['A'], through: 'm1' });
    a.client({ type: 'residual_runs' });
    expect((of(a.events, 'residual_runs').at(-1)! as unknown as { habits: unknown }).habits).toEqual({ rules: ['A'], through: 'm1' });
    db.close();
  });

  it("residual_runs carries the playthrough's Cipher for the dev panel, null without one (cipher spec §2.9)", () => {
    const cipher = { truths: [], replies: 3, lastRun: null };
    const { hub, db } = makeHub(null, 'hicks', { cipher: () => cipher });
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.client({ type: 'residual_runs' });
    expect((of(a.events, 'residual_runs').at(-1)! as unknown as { cipher: unknown }).cipher).toEqual(cipher);
    db.close();
    const none = makeHub();
    const b = fakeSocket();
    none.hub.addClient(b.ws, 'hicks');
    b.client({ type: 'residual_runs' });
    expect((of(b.events, 'residual_runs').at(-1)! as unknown as { cipher: unknown }).cipher).toBeNull();
    none.db.close();
  });

  it('validates the journal client events', () => {
    expect(validateClientEvent({ type: 'journal_edit' })).toBe("journal_edit needs a string 'id'");
    expect(validateClientEvent({ type: 'journal_edit', id: 'n1', text: 3 })).toBe("journal_edit 'text' must be a string");
    expect(validateClientEvent({ type: 'journal_edit', id: 'n1', pinned: 'yes' })).toBe("journal_edit 'pinned' must be a boolean");
    expect(validateClientEvent({ type: 'journal_delete' })).toBe("journal_delete needs a string 'id'");
    expect(validateClientEvent({ type: 'journal_restore', note: { id: 'n1' } })).toBe('journal_restore needs a whole note');
    expect(validateClientEvent({ type: 'recap_seen' })).toEqual({ type: 'recap_seen' });
    const note = { id: 'n1', text: 't', pinned: false, createdAt: 1, updatedAt: 2, editedBy: 'agent' };
    // `about` is required: a note without a valid one is refused.
    expect(validateClientEvent({ type: 'journal_restore', note })).toBe('journal_restore needs a whole note');
    expect(validateClientEvent({ type: 'journal_restore', note: { ...note, about: 'them' } })).toBe('journal_restore needs a whole note');
    expect(validateClientEvent({ type: 'journal_restore', note: { ...note, about: 'you' } })).toEqual({ type: 'journal_restore', note: { ...note, about: 'you' } });
    expect(validateClientEvent({ type: 'journal_restore', note: { ...note, about: 'me' } })).toEqual({ type: 'journal_restore', note: { ...note, about: 'me' } });
  });
});

describe('hub message controls', () => {
  const of = (events: ServerEvent[], type: ServerEvent['type']) => events.filter((e) => e.type === type);
  function controlHub(results: Record<string, { ok: true; text: string } | { ok: false; error: string }>) {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const calls: [string, unknown[]][] = [];
    const method = (name: string) => async (...args: unknown[]) => {
      calls.push([name, args]);
      return results[name] ?? { ok: true, text: 'ok' };
    };
    const relay = {
      activeMessageId: null,
      busy: false,
      ready: true,
      regenerate: method('regenerate'),
      swipe: method('swipe'),
      continueReply: method('continueReply'),
      edit: method('edit'),
      remove: method('remove'),
      restore: method('restore'),
      rewind: method('rewind'),
    } as unknown as ChatRelay;
    const room = new Room(registry);
    const journal = new Journal(db);
    const hub = createHub({ player: 'hicks', room, journal, tools: { room, journal, player: () => 'hicks', expressions: null }, db, scenes: registry.list(), sceneErrors: [], getRelay: () => relay });
    return { hub, db, calls };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const line = { id: 'm1', role: 'agent', text: 'hi', toolLines: [], ts: 1, status: 'ok' };

  it('routes each control to the relay', async () => {
    const { hub, db, calls } = controlHub({});
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.client({ type: 'regenerate', messageId: 'm1' });
    a.client({ type: 'swipe', messageId: 'm1', index: 2 });
    a.client({ type: 'continue', messageId: 'm1' });
    a.client({ type: 'edit_message', messageId: 'm1', text: 'new' });
    a.client({ type: 'delete_message', messageId: 'm1' });
    a.client({ type: 'restore_message', message: line });
    a.client({ type: 'rewind', messageId: 'm1' });
    await flush();
    expect(calls).toEqual([
      ['regenerate', ['hicks', 'm1']],
      ['swipe', ['hicks', 'm1', 2]],
      ['continueReply', ['hicks', 'm1']],
      ['edit', ['hicks', 'm1', 'new']],
      ['remove', ['hicks', 'm1']],
      ['restore', ['hicks', line]],
      ['rewind', ['hicks', 'm1']],
    ]);
    db.close();
  });

  it('a refused control comes back to that tab only, as control_rejected', async () => {
    const { hub, db } = controlHub({ swipe: { ok: false, error: 'not-latest' }, regenerate: { ok: false, error: 'busy' } });
    const a = fakeSocket();
    const b = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    hub.addClient(b.ws, 'hicks');
    a.client({ type: 'swipe', messageId: 'm1', index: 0 });
    a.client({ type: 'regenerate', messageId: 'm1' });
    await flush();
    expect(of(a.events, 'control_rejected')).toEqual([
      { type: 'control_rejected', reason: 'not-latest' },
      { type: 'control_rejected', reason: 'busy' },
    ]);
    expect(of(b.events, 'control_rejected')).toEqual([]);
    db.close();
  });

  it('validates the control events', () => {
    expect(validateClientEvent({ type: 'swipe', messageId: 'm1' })).toBe("swipe needs a number 'index'");
    expect(validateClientEvent({ type: 'edit_message', messageId: 'm1' })).toBe("edit_message needs a string 'text'");
    expect(validateClientEvent({ type: 'regenerate' })).toBe("regenerate needs a string 'messageId'");
    expect(validateClientEvent({ type: 'restore_message', message: { id: 'm1' } })).toBe('restore_message needs a whole message');
    expect(validateClientEvent({ type: 'restore_message', message: line })).toEqual({ type: 'restore_message', message: line });
    // Her parting (her plans §5) comes back as hers, not a plain LEAVE.
    const parting = { id: 'u1', role: 'user', text: '', toolLines: [], ts: 1, status: 'ok', mode: 'end', leave: true, parting: 'her' };
    expect(validateClientEvent({ type: 'restore_message', message: parting })).toEqual({ type: 'restore_message', message: parting });
  });

  it('restore_message keeps its clock stamp (Task 2 review 1); a bad one is dropped', () => {
    expect(validateClientEvent({ type: 'restore_message', message: { ...line, clock: 1215 } })).toEqual({ type: 'restore_message', message: { ...line, clock: 1215 } });
    expect(validateClientEvent({ type: 'restore_message', message: { ...line, clock: -3 } })).toEqual({ type: 'restore_message', message: line });
  });

  it('restore_message keeps a leave line a leave (Review Focus 2)', () => {
    const leaveLine = { ...line, mode: 'end', leave: true };
    expect(validateClientEvent({ type: 'restore_message', message: leaveLine })).toEqual({ type: 'restore_message', message: leaveLine });
  });

  it("restore_message brings back her reaction to an event (mode encounter, no card) (mid-branch review C1)", () => {
    const reaction = { ...line, role: 'agent', mode: 'encounter', replyTo: 'e1' };
    expect(validateClientEvent({ type: 'restore_message', message: reaction })).toEqual({ type: 'restore_message', message: reaction });
    expect(validateClientEvent({ type: 'restore_message', message: { ...reaction, encounter: { title: 'stray' } } })).toEqual({ type: 'restore_message', message: reaction });
  });

  it('restore_message brings back a gig row with its snapshot, and refuses one without (Review Focus 3)', () => {
    const gig = { you: 'Hicks', title: 'Held Pay', tier: 'hard', place: 'The Tilt', client: 'C', target: 'T', take: 'K', brief: 'B', result: 'clean', trace: 8, max: 14 };
    const user = { ...line, role: 'user' };
    expect(validateClientEvent({ type: 'restore_message', message: { ...user, mode: 'gig', gig } })).toEqual({ type: 'restore_message', message: { ...user, mode: 'gig', gig } });
    expect(validateClientEvent({ type: 'restore_message', message: { ...user, mode: 'gig' } })).toBe('restore_message needs a whole message');
    expect(validateClientEvent({ type: 'restore_message', message: { ...user, mode: 'gig', gig: { ...gig, result: 'win' } } })).toBe('restore_message needs a whole message');
    // Her reaction carries the mode only.
    const reaction = { ...line, role: 'agent', mode: 'gig', replyTo: 'g1' };
    expect(validateClientEvent({ type: 'restore_message', message: { ...reaction, gig } })).toEqual({ type: 'restore_message', message: reaction });
  });

  it('restore_message brings back an encounter row whole', () => {
    const encounter = { title: 'Wrong package', stranger: { name: 'Courier', voice: 'clipped' } };
    const user = { ...line, role: 'user' };
    const row = { ...user, mode: 'encounter', encounter };
    expect(validateClientEvent({ type: 'restore_message', message: row })).toEqual({ type: 'restore_message', message: { ...user, mode: 'encounter', encounter } });
    // A broken stranger goes; a broken event is no encounter row at all.
    expect(validateClientEvent({ type: 'restore_message', message: { ...row, encounter: { title: 'T', stranger: { name: '' } } } })).toEqual({
      type: 'restore_message',
      message: { ...user, mode: 'encounter', encounter: { title: 'T' } },
    });
    expect(validateClientEvent({ type: 'restore_message', message: { ...row, encounter: { title: '' } } })).toBe('restore_message needs a whole message');
  });

  it('restore_message keeps a whole-message expression, and rejects a non-string one', () => {
    const withExpression = { ...line, expression: 'happy' };
    expect(validateClientEvent({ type: 'restore_message', message: withExpression })).toEqual({
      type: 'restore_message',
      message: withExpression,
    });
    expect(validateClientEvent({ type: 'restore_message', message: { ...line, expression: 5 } })).toBe('restore_message needs a whole message');
  });

  it("restore_message keeps the others' faces, and rejects a map that isn't names to strings", () => {
    const withFaces = { ...line, othersExpressions: { hae: 'happy', silas: 'annoyed' } };
    expect(validateClientEvent({ type: 'restore_message', message: withFaces })).toEqual({ type: 'restore_message', message: withFaces });
    expect(validateClientEvent({ type: 'restore_message', message: { ...line, othersExpressions: 'happy' } })).toBe('restore_message needs a whole message');
    expect(validateClientEvent({ type: 'restore_message', message: { ...line, othersExpressions: { hae: 5 } } })).toBe('restore_message needs a whole message');
  });

  it('restore_message accepts and keeps a greeting (undo of a deleted greeting)', () => {
    const greetLine = { ...line, role: 'agent', mode: 'greet' };
    expect(validateClientEvent({ type: 'restore_message', message: greetLine })).toEqual({ type: 'restore_message', message: greetLine });
  });

  it('restore_message accepts and keeps an end-mode message (Review Focus 4)', () => {
    const endLine = { ...line, mode: 'end' };
    expect(validateClientEvent({ type: 'restore_message', message: endLine })).toEqual({
      type: 'restore_message',
      message: endLine,
    });
  });
});

describe('hub greetings', () => {
  function greetHub(busy: boolean) {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const journal = new Journal(db);
    const room = new Room(registry);
    const greeted: string[] = [];
    const relay = { activeMessageId: null, busy, activePlayer: 'hicks', greet: async (p: string) => (greeted.push(p), null) };
    const hub = createHub({
      player: 'hicks',
      room,
      journal,
      tools: { room, journal, player: () => 'hicks', expressions: null },
      db,
      scenes: registry.list(),
      sceneErrors: [],
      getRelay: () => relay as unknown as ChatRelay,
    });
    return { hub, db, greeted };
  }
  const history = (events: ServerEvent[]) => events.find((e) => e.type === 'history') as Extract<ServerEvent, { type: 'history' }>;

  it('validates greet, and still refuses greet as a user_message mode', () => {
    expect(validateClientEvent({ type: 'greet' })).toEqual({ type: 'greet' });
    // Her plans (spec 2026-10-21 §5): the card's two answers, no fields.
    expect(validateClientEvent({ type: 'let_her_go' })).toEqual({ type: 'let_her_go' });
    // Your last line rides with LET HER GO, as with LEAVE.
    expect(validateClientEvent({ type: 'let_her_go', text: 'See you there.' })).toEqual({ type: 'let_her_go', text: 'See you there.' });
    expect(validateClientEvent({ type: 'let_her_go', text: 3 })).toBe("let_her_go's 'text' must be a string");
    expect(validateClientEvent({ type: 'plan_drop', extra: 1 })).toEqual({ type: 'plan_drop' });
    expect(validateClientEvent({ type: 'user_message', text: '', mode: 'greet' })).toBe("user_message 'mode' must be 'rp', 'ooc' or 'end'");
  });

  it('history says a greeting is due for a pair that has never talked, and not one mid-conversation', () => {
    const { hub, db } = greetHub(false);
    db.insertMessage('cass', { id: 'c1', role: 'user', text: 'hi', toolLines: [], ts: Date.now() - 60_000, status: 'ok' });
    const h = fakeSocket();
    const c = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    hub.addClient(c.ws, 'cass');
    expect(history(h.events).greetDue).toBe(true);
    expect(history(c.events).greetDue).toBe(false);
    db.close();
  });

  it("a greet frame reaches the relay with the tab's player", async () => {
    const { hub, db, greeted } = greetHub(false);
    const c = fakeSocket();
    hub.addClient(c.ws, 'cass');
    c.client({ type: 'greet' });
    await Promise.resolve();
    expect(greeted).toEqual(['cass']);
    db.close();
  });

  it('while she is busy a greet frame is dropped silently', async () => {
    const { hub, db, greeted } = greetHub(true);
    const h = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    h.events.length = 0;
    h.client({ type: 'greet' });
    await Promise.resolve();
    expect(greeted).toEqual([]);
    expect(h.events).toEqual([]);
    db.close();
  });
});

describe('hub model picker', () => {
  function pickerHub(picker: ModelPicker | undefined) {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const room = new Room(registry);
    const journal = new Journal(db);
    const hub = createHub({
      player: 'hicks',
      room,
      journal,
      tools: { room, journal, player: () => 'hicks', expressions: null },
      db,
      scenes: registry.list(),
      sceneErrors: [],
      getRelay: () => ({ activeMessageId: null, busy: false }) as unknown as ChatRelay,
      ...(picker ? { models: picker } : {}),
    });
    return { hub, db };
  }
  function fakePicker(known: string[]): ModelPicker & { chosen: () => string } {
    let current = 'z-ai/glm-5.2';
    return {
      chosen: () => current,
      async event() {
        return { type: 'model', model: current, provider: 'openrouter', label: current.split('/')[1], backend: 'direct', choices: [], credit: 4.12 };
      },
      async choose(id) {
        if (id === null || !known.includes(id)) return 'unknown-model';
        current = id;
        return null;
      },
    };
  }
  const flush = () => new Promise((r) => setTimeout(r, 10));

  it("a direct agent's model event on connect carries choices and credit", async () => {
    const { hub } = pickerHub(fakePicker([]));
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    await flush();
    expect(a.events.find((e) => e.type === 'model')).toMatchObject({ backend: 'direct', credit: 4.12, choices: [] });
  });

  it('set_model with a known id saves the choice, and every tab gets a model event with the new label', async () => {
    const picker = fakePicker(['deepseek/deepseek-v3.2']);
    const { hub } = pickerHub(picker);
    const a = fakeSocket();
    const b = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    hub.addClient(b.ws, 'hicks');
    await flush();
    a.client({ type: 'set_model', model: 'deepseek/deepseek-v3.2' });
    await flush();
    expect(picker.chosen()).toBe('deepseek/deepseek-v3.2');
    expect(b.events.filter((e) => e.type === 'model').at(-1)).toMatchObject({ model: 'deepseek/deepseek-v3.2', label: 'deepseek-v3.2' });
  });

  it("set_model with an id the catalog doesn't know → model_rejected unknown-model to that tab only", async () => {
    const picker = fakePicker([]);
    const { hub } = pickerHub(picker);
    const a = fakeSocket();
    const b = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    hub.addClient(b.ws, 'hicks');
    a.client({ type: 'set_model', model: 'nope/nope' });
    await flush();
    expect(a.events).toContainEqual({ type: 'model_rejected', reason: 'unknown-model' });
    expect(b.events.some((e) => e.type === 'model_rejected')).toBe(false);
    expect(picker.chosen()).toBe('z-ai/glm-5.2');
  });

  it('set_model on a hub with no model picker is told to that tab as a dev log, never a model_rejected', async () => {
    const { hub } = pickerHub(undefined);
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.client({ type: 'set_model', model: 'x/y' });
    await flush();
    expect(a.events.some((e) => e.type === 'model_rejected')).toBe(false);
    expect(a.events).toContainEqual(expect.objectContaining({ type: 'dev_log', level: 'warn' }));
  });

  it('validates set_model', () => {
    expect(validateClientEvent({ type: 'set_model', model: 'a/b' })).toEqual({ type: 'set_model', model: 'a/b' });
    expect(typeof validateClientEvent({ type: 'set_model', model: '' })).toBe('string');
    expect(typeof validateClientEvent({ type: 'set_model', model: 'x'.repeat(201) })).toBe('string');
  });
});

describe('hub: texts stay off the room feed (deck spec §5)', () => {
  it('history on join leaves text rows out', () => {
    const { hub, db } = makeHub();
    db.insertMessage('hicks', { id: 'h1', role: 'user', text: 'in the room', toolLines: [], ts: 1, status: 'ok' });
    db.insertMessage('hicks', { id: 't1', role: 'user', text: 'a text', toolLines: [], ts: 2, status: 'ok', mode: 'text' });
    const h = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    const history = h.events.find((e) => e.type === 'history') as Extract<ServerEvent, { type: 'history' }>;
    expect(history.messages.map((m) => m.id)).toEqual(['h1']);
  });
});

describe('hub players: each socket belongs to one pair', () => {
  const of = (events: ServerEvent[], type: ServerEvent['type']) => events.filter((e) => e.type === type);
  const ids = (e: ServerEvent | undefined) => (e && e.type === 'journal' ? e.notes.map((n) => n.id) : null);
  const msg = (id: string, text: string) => ({ id, role: 'user' as const, text, toolLines: [], ts: 1, status: 'ok' as const });

  it('two sockets as different players: different history and journal events, same room events', () => {
    const { hub, db, journal } = makeHub();
    db.insertMessage('hicks', msg('h1', 'hicks says hi'));
    db.insertMessage('cass', msg('c1', 'cass says hi'));
    journal.note('hicks', { text: 'hicks likes tea' }, 'agent');
    journal.note('cass', { text: 'cass hates rain' }, 'agent');
    journal.setRecap('cass', 'cass left at dawn', 'agent');
    const h = fakeSocket();
    const c = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    hub.addClient(c.ws, 'cass');
    expect(of(h.events, 'history')).toEqual([{ type: 'history', messages: [expect.objectContaining({ id: 'h1' })], greetDue: expect.any(Boolean) }]);
    expect(of(c.events, 'history')).toEqual([{ type: 'history', messages: [expect.objectContaining({ id: 'c1' })], greetDue: expect.any(Boolean) }]);
    expect(ids(of(h.events, 'journal')[0])).toEqual(['n1']);
    expect(ids(of(c.events, 'journal')[0])).toEqual(['n2']);
    expect(of(h.events, 'recap')[0]).toMatchObject({ text: null });
    expect(of(c.events, 'recap')[0]).toMatchObject({ text: 'cass left at dawn' });
    h.events.length = 0;
    c.events.length = 0;
    h.client({ type: 'dev_action', tool: 'set_light', args: { light_id: 'monitor', intensity: 0.3 } });
    expect(of(h.events, 'room')).toHaveLength(1);
    expect(of(c.events, 'room')).toEqual(of(h.events, 'room'));
    hub.emit({ type: 'link', status: 'ok' });
    expect(of(h.events, 'link')).toEqual([{ type: 'link', status: 'ok' }]);
    expect(of(c.events, 'link')).toEqual([{ type: 'link', status: 'ok' }]);
    db.close();
  });

  it("a message streamed for pair A reaches A's sockets only", () => {
    const { hub, db } = makeHub();
    const h = fakeSocket();
    const c = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    hub.addClient(c.ws, 'cass');
    c.events.length = 0;
    h.events.length = 0;
    hub.emit({ type: 'message', message: { ...msg('r1', ''), role: 'agent', status: 'streaming' } }, 'hicks');
    hub.emit({ type: 'nix_delta', messageId: 'r1', delta: 'Hi' }, 'hicks');
    hub.emit({ type: 'tool_line', messageId: 'r1', text: '// X' }, 'hicks');
    hub.emit({ type: 'messages_removed', ids: ['r1'] }, 'hicks');
    expect(h.events.map((e) => e.type)).toEqual(['message', 'nix_delta', 'tool_line', 'messages_removed']);
    expect(c.events).toEqual([]);
    db.close();
  });

  it('a journal (me) note change reaches every socket, each with its own notes list', () => {
    const { hub, db, journal } = makeHub();
    journal.note('hicks', { text: 'hicks likes tea' }, 'user');
    journal.note('cass', { text: 'cass hates rain' }, 'user');
    const h = fakeSocket();
    const c = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    hub.addClient(c.ws, 'cass');
    h.events.length = 0;
    c.events.length = 0;
    journal.note('hicks', { text: 'the lamp flickers', about: 'me' }, 'user');
    expect(of(h.events, 'journal').map(ids)).toEqual([['n3', 'n1']]);
    expect(of(c.events, 'journal').map(ids)).toEqual([['n3', 'n2']]);
    db.close();
  });

  it("a dossier note or recap for pair B, and her tool line with it, reach B's sockets only", () => {
    const { hub, db, journal } = makeHub(null, 'cass');
    const h = fakeSocket();
    const c = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    hub.addClient(c.ws, 'cass');
    h.events.length = 0;
    c.events.length = 0;
    journal.note('cass', { text: 'cass hates rain' }, 'agent');
    journal.setRecap('cass', 'cass left', 'agent');
    expect(h.events).toEqual([]);
    expect(of(c.events, 'journal').map(ids)).toEqual([['n1']]);
    expect(of(c.events, 'recap')).toEqual([expect.objectContaining({ text: 'cass left' })]);
    expect(of(c.events, 'tool_line').map((e) => (e as { text: string }).text)).toEqual(['// NOTED', '// RECAP SAVED']);
    db.close();
  });

  it("her own room tool call's line goes to the running turn's pair only", () => {
    const { hub, db, room } = makeHub('r1', 'cass');
    db.insertMessage('cass', { id: 'r1', role: 'agent', text: '', toolLines: [], ts: 1, status: 'streaming' });
    const h = fakeSocket();
    const c = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    hub.addClient(c.ws, 'cass');
    h.events.length = 0;
    c.events.length = 0;
    expect(room.setLight({ light_id: 'monitor', intensity: 0.3 }, 'agent').ok).toBe(true); // her MCP call, mid-turn
    expect(of(h.events, 'tool_line')).toEqual([]);
    expect(of(c.events, 'tool_line')).toEqual([expect.objectContaining({ messageId: 'r1' })]);
    expect(db.getMessage('cass', 'r1')!.toolLines).toHaveLength(1);
    db.close();
  });

  it("a dev_action from a Hicks socket during Cass's turn: the tool line goes to Hicks with messageId null; Cass's reply is untouched", () => {
    const { hub, db } = makeHub('r1', 'cass');
    db.insertMessage('cass', { id: 'r1', role: 'agent', text: '', toolLines: [], ts: 1, status: 'streaming' });
    const h = fakeSocket();
    const c = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    hub.addClient(c.ws, 'cass');
    h.events.length = 0;
    c.events.length = 0;
    h.client({ type: 'dev_action', tool: 'set_light', args: { light_id: 'monitor', intensity: 0.3 }, as: 'agent' });
    expect(of(h.events, 'room')).toHaveLength(1);
    expect(of(c.events, 'room')).toHaveLength(1);
    expect(of(h.events, 'tool_line')).toEqual([expect.objectContaining({ messageId: null })]);
    expect(of(c.events, 'tool_line')).toEqual([]);
    expect(db.getMessage('cass', 'r1')!.toolLines).toEqual([]);
    // Another of her calls from the dev panel: the line still goes to the clicking tab.
    h.client({ type: 'dev_action', tool: 'set_ambient', args: { level: 0.2, duration: 0 }, as: 'agent' });
    expect(of(h.events, 'tool_line')).toHaveLength(2);
    expect(of(c.events, 'tool_line')).toEqual([]);
    expect(db.getMessage('cass', 'r1')!.toolLines).toEqual([]);
    db.close();
  });

  it("a dev_action from a Cass socket during Cass's turn lands on her reply in progress", () => {
    const { hub, db } = makeHub('r1', 'cass');
    db.insertMessage('cass', { id: 'r1', role: 'agent', text: '', toolLines: [], ts: 1, status: 'streaming' });
    const c = fakeSocket();
    hub.addClient(c.ws, 'cass');
    c.events.length = 0;
    c.client({ type: 'dev_action', tool: 'set_light', args: { light_id: 'monitor', intensity: 0.3 }, as: 'agent' });
    expect(of(c.events, 'tool_line')).toEqual([expect.objectContaining({ messageId: 'r1' })]);
    expect(db.getMessage('cass', 'r1')!.toolLines).toHaveLength(1);
    db.close();
  });

  it('journal_edit with about "you" from a Hicks socket moves the note into Hicks\'s dossier; a Cass socket no longer lists it (Review Focus 3)', () => {
    const { hub, db, journal } = makeHub();
    journal.note('hicks', { text: 'my own plans', about: 'me' }, 'agent');
    const h = fakeSocket();
    const c = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    hub.addClient(c.ws, 'cass');
    expect(ids(of(c.events, 'journal').at(-1))).toEqual(['n1']);
    h.client({ type: 'journal_edit', id: 'n1', about: 'you' });
    expect(journal.notes('hicks')).toEqual([expect.objectContaining({ id: 'n1', about: 'you', editedBy: 'user' })]);
    expect(journal.notes('cass')).toEqual([]);
    expect(ids(of(c.events, 'journal').at(-1))).toEqual([]);
    expect(ids(of(h.events, 'journal').at(-1))).toEqual(['n1']);
    db.close();
  });

  it("dev_action note from a Cass socket writes Cass's dossier (Review Focus 1)", () => {
    const { hub, db, journal } = makeHub();
    const c = fakeSocket();
    hub.addClient(c.ws, 'cass');
    c.client({ type: 'dev_action', tool: 'note', args: { text: 'from the dev panel' } });
    expect(journal.notes('cass')).toEqual([expect.objectContaining({ text: 'from the dev panel', about: 'you' })]);
    expect(journal.notes('hicks')).toEqual([]);
    db.close();
  });

  it("the player's journal_delete and recap_seen act on the socket's pair", () => {
    const { hub, db, journal } = makeHub();
    journal.note('cass', { text: 'cass note' }, 'agent');
    journal.setRecap('cass', 'r', 'agent');
    const h = fakeSocket();
    const c = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    hub.addClient(c.ws, 'cass');
    h.client({ type: 'journal_delete', id: 'n1' });
    expect(journal.notes('cass')).toHaveLength(1);
    h.client({ type: 'recap_seen' });
    expect(journal.recap('cass').seen).toBe(false);
    c.client({ type: 'journal_delete', id: 'n1' });
    expect(journal.notes('cass')).toEqual([]);
    c.client({ type: 'recap_seen' });
    expect(journal.recap('cass').seen).toBe(true);
    db.close();
  });

  it("chat and controls go to the relay with the socket's player; another pair's turn makes it busy", async () => {
    const calls: [string, unknown[]][] = [];
    let busy = false;
    let ready = true;
    const ok = { ok: true, text: '' };
    const relay = {
      activeMessageId: null,
      activePlayer: 'hicks',
      get ready() {
        return ready;
      },
      get busy() {
        return busy;
      },
      send: async (...args: unknown[]) => (calls.push(['send', args]), ok),
      retry: async (...args: unknown[]) => (calls.push(['retry', args]), ok),
      regenerate: async (...args: unknown[]) => (calls.push(['regenerate', args]), ok),
    } as unknown as ChatRelay;
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const room = new Room(registry);
    const journal = new Journal(db);
    const hub = createHub({ player: 'hicks', room, journal, tools: { room, journal, player: () => 'hicks', expressions: null }, db, scenes: registry.list(), sceneErrors: [], getRelay: () => relay });
    const c = fakeSocket();
    hub.addClient(c.ws, 'cass');
    c.client({ type: 'user_message', text: 'hi' });
    c.client({ type: 'retry', messageId: 'u1' });
    c.client({ type: 'regenerate', messageId: 'm1' });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual([
      ['send', ['cass', 'hi', 'rp']],
      ['retry', ['cass', 'u1']],
      ['regenerate', ['cass', 'm1']],
    ]);
    busy = true;
    c.client({ type: 'user_message', text: 'again' });
    expect(of(c.events, 'turn_rejected')).toEqual([{ type: 'turn_rejected', reason: 'busy', text: 'again' }]);
    expect(calls).toHaveLength(3);

    // No key linked: send, retry, regenerate and keep going are refused (draft back), none reach her.
    busy = false;
    ready = false;
    c.client({ type: 'user_message', text: 'hello?' });
    c.client({ type: 'retry', messageId: 'u1' });
    c.client({ type: 'regenerate', messageId: 'm1' });
    c.client({ type: 'continue', messageId: 'm1' });
    await new Promise((r) => setTimeout(r, 0));
    expect(of(c.events, 'turn_rejected').slice(1)).toEqual([
      { type: 'turn_rejected', reason: 'no-link', text: 'hello?' },
      { type: 'turn_rejected', reason: 'no-link' },
      { type: 'turn_rejected', reason: 'no-link' },
      { type: 'turn_rejected', reason: 'no-link' },
    ]);
    expect(calls).toHaveLength(3);
    db.close();
  });

  it('validates journal_edit about', () => {
    expect(validateClientEvent({ type: 'journal_edit', id: 'n1', about: 'me' })).toEqual({ type: 'journal_edit', id: 'n1', about: 'me' });
    expect(validateClientEvent({ type: 'journal_edit', id: 'n1', about: 'them' })).toBe("journal_edit 'about' must be 'me' or 'you'");
  });
});

describe('hub dossier page', () => {
  const of = (events: ServerEvent[], type: ServerEvent['type']) => events.filter((e) => e.type === type);

  it('an empty page carries her tie, so the panel shows what she reads (final review 5)', () => {
    const { hub, db } = makeHub(null, 'hicks', { tie: (p: string) => (p === 'hicks' ? 'Court.' : null) });
    const h = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    expect(of(h.events, 'dossier_page')).toEqual([{ type: 'dossier_page', text: null, at: null, by: null, tie: 'Court.' }]);
    db.close();
  });

  it('no playthrough clock (null): no clock event', () => {
    const { hub, db } = makeHub(null, 'hicks', { clock: () => null });
    const h = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    expect(h.events.some((e) => e.type === 'clock')).toBe(false);
    db.close();
  });

  it('connect sends the clock when the world has one', () => {
    const { hub, db } = makeHub(null, 'hicks', { clock: () => 1300 });
    const h = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    expect(of(h.events, 'clock')).toEqual([{ type: 'clock', clock: 1300 }]);
    db.close();
  });

  it("connect sends dossier_page for the socket's pair", () => {
    const { hub, db, journal } = makeHub();
    journal.setPage('cass', 'Cass: hard to rattle', 'agent');
    const h = fakeSocket();
    const c = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    hub.addClient(c.ws, 'cass');
    expect(of(h.events, 'dossier_page')).toEqual([{ type: 'dossier_page', text: null, at: null, by: null }]);
    expect(of(c.events, 'dossier_page')).toEqual([expect.objectContaining({ text: 'Cass: hard to rattle', by: 'agent' })]);
    const types = c.events.map((e) => e.type);
    expect(types.indexOf('dossier_page')).toBe(types.indexOf('recap') + 1);
    db.close();
  });

  it("a page change reaches that pair's sockets only", () => {
    const { hub, db, journal } = makeHub(null, 'cass');
    const h = fakeSocket();
    const c = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    hub.addClient(c.ws, 'cass');
    h.events.length = 0;
    c.events.length = 0;
    journal.setPage('cass', 'Cass: hard to rattle', 'agent');
    expect(h.events).toEqual([]);
    expect(of(c.events, 'dossier_page')).toEqual([expect.objectContaining({ text: 'Cass: hard to rattle', by: 'agent' })]);
    expect(of(c.events, 'recap')).toEqual([]);
    expect(of(c.events, 'tool_line').map((e) => (e as { text: string }).text)).toEqual(['// DOSSIER UPDATED']);
    db.close();
  });

  it("dossier_page_edit from a Hicks socket while Cass's turn streams writes Hicks's page (Review Focus 2)", () => {
    const { hub, db, journal } = makeHub('r1', 'cass');
    const h = fakeSocket();
    const c = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    hub.addClient(c.ws, 'cass');
    c.events.length = 0;
    h.client({ type: 'dossier_page_edit', text: 'Hicks: quit production, contracts now' });
    expect(journal.page('hicks')).toMatchObject({ text: 'Hicks: quit production, contracts now', by: 'user' });
    expect(journal.page('cass').text).toBeNull();
    expect(of(h.events, 'dossier_page').at(-1)).toMatchObject({ text: 'Hicks: quit production, contracts now', by: 'user' });
    expect(c.events).toEqual([]);
    db.close();
  });

  it('dossier_page_edit with only whitespace clears; over the limit warns that tab only', () => {
    const { hub, db, journal } = makeHub();
    journal.setPage('hicks', 'old page', 'agent');
    const h = fakeSocket();
    const h2 = fakeSocket();
    hub.addClient(h.ws, 'hicks');
    hub.addClient(h2.ws, 'hicks');
    h.client({ type: 'dossier_page_edit', text: '   \n ' });
    expect(journal.page('hicks')).toEqual({ text: null, at: null, by: null });
    expect(of(h2.events, 'dossier_page').at(-1)).toEqual({ type: 'dossier_page', text: null, at: null, by: null });
    h.events.length = 0;
    h2.events.length = 0;
    h.client({ type: 'dossier_page_edit', text: 'x'.repeat(1376) });
    expect(of(h.events, 'dev_log')).toEqual([{ type: 'dev_log', level: 'warn', text: 'the dossier page must be 1–1375 characters' }]);
    expect(h2.events).toEqual([]);
    expect(journal.page('hicks').text).toBeNull();
    db.close();
  });

  it('dossier_page_edit with a non-string text is rejected by validation', () => {
    expect(validateClientEvent({ type: 'dossier_page_edit', text: 5 })).toBe("dossier_page_edit needs a string 'text'");
    expect(validateClientEvent({ type: 'dossier_page_edit' })).toBe("dossier_page_edit needs a string 'text'");
    expect(validateClientEvent({ type: 'dossier_page_edit', text: 'hi' })).toEqual({ type: 'dossier_page_edit', text: 'hi' });
  });
});

describe('hub travel', () => {
  const MAP = {
    version: 1,
    image: '/map/x.webp',
    panelAt: [50, 50],
    districts: [{ id: 'k', name: 'K', label: [1, 1] }],
    places: [
      { id: 'intake', name: 'Lowlight Intake', district: 'k', pin: [1, 1], scene: 'p/lowlight-intake' },
      { id: 'stall', name: "Hae's Noodles", district: 'k', pin: [2, 2], scene: 'p/noodle-stall' },
      { id: 'home', name: "Nix's walk-up", district: 'k', pin: [3, 3], scene: 'p/ribbon-rooftop', inviteOnly: true },
      { id: 'roof', name: 'Ribbon Rooftop', district: 'k', pin: [4, 4], scene: 'p/ribbon-rooftop' },
      { id: 'shop', name: 'Second Socket', district: 'k', pin: [5, 5] },
      { id: 'far', name: 'The Tilt', district: 'k', pin: [6, 6], scene: 'q/noodle-stall', gigs: true },
      { id: 'gone', name: 'Old Arcade', district: 'k', pin: [7, 7], scene: 'q/arcade' },
      { id: 'back', name: 'Back Stairs', district: 'k', pin: [8, 8], scene: 'q/ribbon-rooftop', side: true },
    ],
  };

  function makeTravelHub(map: unknown = MAP, extra: Partial<Parameters<typeof createHub>[0]> = {}, relayExtra: Record<string, unknown> = {}) {
    const mapFile = path.join(tempDir('nix-hub-map-'), 'lowlight.json');
    fs.writeFileSync(mapFile, typeof map === 'string' ? map : JSON.stringify(map));
    const gigsDir = path.join(path.dirname(mapFile), 'gigs');
    fs.mkdirSync(gigsDir);
    const brief = (place: string, tier: string) =>
      `---\ntitle: Held Pay\ntier: ${tier}\nplace: ${place}\nclient: Nobody\ntarget: Glass Orchid · house ledger\ntake: a payout\n---\nThick lacquer.\n`;
    fs.writeFileSync(path.join(gigsDir, 'held-pay.md'), brief('far', 'hard'));
    fs.writeFileSync(path.join(gigsDir, 'noodles.md'), brief('stall', 'easy'));
    fs.writeFileSync(path.join(gigsDir, 'floor.md'), brief('far', 'medium').replace('tier: medium\n', 'tier: medium\nkind: slip\n'));
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const journal = new Journal(db);
    // Two districts with the same rooms: hers is p; q is another part of town.
    const city = roomRegistry(new Map([['p', { registry }], ['q', { registry }]]));
    const room = new Room(city, null, { mine: city.inDistrict('p'), start: 'p/lowlight-intake', legacyDistrict: null, districtName: (d) => d });
    const travels: unknown[][] = [];
    const encounters: unknown[][] = [];
    const gigs: unknown[][] = [];
    const relay = {
      gig: (...args: unknown[]) => {
        gigs.push(args);
        relay.busy = true;
        return new Promise(() => {});
      },
      activeMessageId: null,
      busy: false,
      ready: true,
      activePlayer: 'hicks',
      encounter: (...args: unknown[]) => {
        encounters.push(args);
        relay.busy = true;
        return new Promise(() => {});
      },
      // A travel turn keeps the relay busy until it settles (never, here).
      travel: (...args: unknown[]) => {
        travels.push(args);
        // A comms move runs under the travel row (the relay calls it).
        (args[1] as { move?: () => void }).move?.();
        relay.busy = true;
        return new Promise(() => {});
      },
      // Comms (spec 2026-10-20): no deal, no line, unless a test says so.
      commsCan: (_p: string) => false,
      commsNow: (_p: string): unknown => null,
      ...relayExtra,
    };
    const hub = createHub({
      player: 'hicks',
      room,
      journal,
      tools: { room, journal, player: () => 'hicks', expressions: null },
      db,
      scenes: city.list(),
      sceneErrors: [],
      mapFile,
      gigsDir,
      getRelay: () => relay as unknown as ChatRelay,
      ...extra,
    });
    const tab = fakeSocket();
    hub.addClient(tab.ws, 'hicks');
    return { tab, hub, room, db, relay, travels, encounters, gigs, mapFile };
  }
  const notices = (events: ServerEvent[]) => events.filter((e) => e.type === 'notice').map((e) => (e as { text: string }).text);

  it('needs a string place', () => {
    expect(validateClientEvent({ type: 'travel' })).toBe("travel needs a string 'place'");
    expect(validateClientEvent({ type: 'travel', place: 'stall' })).toEqual({ type: 'travel', place: 'stall' });
  });

  it('greet takes an opening, and refuses anything but a short enough string (arrival screen spec §3)', () => {
    const refusal = `greet's 'opening' must be a string of at most ${SCENE_TEXT_MAX} characters`;
    expect(validateClientEvent({ type: 'greet', opening: 7 })).toBe(refusal);
    expect(validateClientEvent({ type: 'greet', opening: 'a'.repeat(SCENE_TEXT_MAX + 1) })).toBe(refusal);
    expect(validateClientEvent({ type: 'greet', opening: 'Rain.' })).toEqual({ type: 'greet', opening: 'Rain.' });
    expect(validateClientEvent({ type: 'greet' })).toEqual({ type: 'greet' });
  });

  describe('your line on the way (arrival screen spec §4)', () => {
    const refusal = `travel's 'line' must be a string of at most ${TRAVEL_LINE_MAX} characters`;
    it('takes a line, and refuses anything but a short enough string', () => {
      expect(validateClientEvent({ type: 'travel', place: 'x', line: 5 })).toBe(refusal);
      expect(validateClientEvent({ type: 'travel', place: 'x', line: 'a'.repeat(TRAVEL_LINE_MAX + 1) })).toBe(refusal);
      expect(validateClientEvent({ type: 'travel', place: 'x', line: 'Come on.' })).toEqual({ type: 'travel', place: 'x', line: 'Come on.' });
    });
    it("GO's refusals are tagged for the arrival screen (only they re-arm its GO)", () => {
      const { tab } = makeTravelHub();
      tab.client({ type: 'travel', place: 'nowhere' });
      expect(tab.events.filter((e) => e.type === 'notice')).toEqual([{ type: 'notice', text: "no place 'nowhere'", for: 'travel' }]);
    });
    it("a move the room itself refuses is tagged for the arrival screen too (final review I2)", () => {
      // A scene the hub lists but the room can't load: GO passes the hub's checks, then go_to fails.
      const { tab, travels } = makeTravelHub(MAP, { scenes: [...registry.list().map((s) => ({ ...s, id: `p/${s.id}` })), { ...registry.list()[0]!, id: 'q/arcade' }] });
      tab.client({ type: 'travel', place: 'gone', line: 'Come on.' });
      expect(travels).toEqual([]);
      const ns = tab.events.filter((e) => e.type === 'notice');
      expect(ns).toHaveLength(1);
      expect(ns[0]).toMatchObject({ for: 'travel' });
    });
    it('GO hands the line to the relay with the move', () => {
      const { tab, travels } = makeTravelHub();
      tab.client({ type: 'travel', place: 'stall', line: 'Come on.' });
      expect(travels[0][1]).toMatchObject({ to: "Hae's Noodles", line: 'Come on.' });
    });
  });

  describe('comms (spec 2026-10-20)', () => {
    it('travel takes comms: true', () => {
      expect(validateClientEvent({ type: 'travel', place: 'stall', comms: true })).toEqual({ type: 'travel', place: 'stall', comms: true });
    });
    it("ON COMMS without a deal is refused: she's not on your line", () => {
      const { tab, room, travels } = makeTravelHub();
      tab.client({ type: 'travel', place: 'stall', comms: true });
      expect(room.state.sceneId).toBe('p/lowlight-intake');
      expect(travels).toEqual([]);
      expect(notices(tab.events)).toEqual(["she's not on your line"]);
    });
    it('ON COMMS with a deal: you go, the line begins where her room was', () => {
      const { tab, room, travels } = makeTravelHub(MAP, {}, { commsCan: () => true });
      tab.client({ type: 'travel', place: 'stall', comms: true });
      expect(room.state.sceneId).toBe('p/noodle-stall');
      expect(travels).toEqual([['hicks', { from: 'Lowlight Intake', to: "Hae's Noodles", contact: 'Nix', comms: { on: true, at: 'p/lowlight-intake' }, move: expect.any(Function) }]]);
    });
    it('on comms, GO elsewhere stays on the line; GO to where she is ends it', () => {
      const on = { on: true, at: 'p/lowlight-intake' };
      const away = makeTravelHub(MAP, { herPlace: () => 'p/lowlight-intake' }, { commsCan: () => true, commsNow: () => on });
      away.tab.client({ type: 'travel', place: 'stall' });
      expect(away.travels[0][1]).toMatchObject({ comms: on });
      const back = makeTravelHub(MAP, { herPlace: () => 'p/noodle-stall' }, { commsCan: () => true, commsNow: () => on });
      back.tab.client({ type: 'travel', place: 'stall' });
      expect(back.travels[0][1]).toMatchObject({ comms: { on: false } });
    });
    it("I2: ON COMMS to where she already is is refused: go with her", () => {
      const { tab, room, travels } = makeTravelHub(MAP, { herScheduled: () => 'p/noodle-stall' }, { commsCan: () => true });
      tab.client({ type: 'travel', place: 'stall', comms: true });
      expect(room.state.sceneId).toBe('p/lowlight-intake');
      expect(travels).toEqual([]);
      expect(notices(tab.events)).toEqual(["she's there: go with her"]);
    });
    it('busy: ON COMMS waits for her to finish', () => {
      const { tab, relay, travels } = makeTravelHub(MAP, {}, { commsCan: () => true });
      relay.busy = true;
      tab.client({ type: 'travel', place: 'stall', comms: true });
      expect(travels).toEqual([]);
      expect(notices(tab.events)).toEqual(['wait for her to finish']);
    });
    it('I3: refreshComms re-sends the line (after a rewind or a clock move)', () => {
      let state: unknown = { on: true, at: 'p/lowlight-intake' };
      const { tab, hub } = makeTravelHub(MAP, { herPlace: () => 'p/lowlight-intake' }, { commsCan: () => true, commsNow: () => state });
      state = { on: false };
      hub.refreshComms();
      expect(tab.events.filter((e) => e.type === 'comms').at(-1)).toEqual({ type: 'comms', on: false, can: true, where: null, herAt: null });
    });
    it('a tab hears the line on connect: on, whether it can go on, and where she is', () => {
      const { tab } = makeTravelHub(MAP, { herPlace: () => 'p/lowlight-intake' }, { commsCan: () => true, commsNow: () => ({ on: true, at: 'p/lowlight-intake' }) });
      expect(tab.events.find((e) => e.type === 'comms')).toEqual({ type: 'comms', on: true, can: true, where: 'Lowlight Intake', herAt: null });
      const off = makeTravelHub();
      expect(off.tab.events.find((e) => e.type === 'comms')).toEqual({ type: 'comms', on: false, can: false, where: null, herAt: null });
    });
  });

  it('with no key linked, GO is refused with a NO LINK notice: the room stays and no turn starts', () => {
    const { tab, room, relay, travels } = makeTravelHub();
    relay.ready = false;
    tab.client({ type: 'travel', place: 'stall' });
    expect(room.state.sceneId).toBe('p/lowlight-intake');
    expect(travels).toEqual([]);
    expect(notices(tab.events)).toEqual(['// NO LINK — RELINK AT SELECT']);
  });

  it('walks you both: the scene changes with a glitch, as the user, then her turn starts', () => {
    const { tab, room, travels } = makeTravelHub();
    tab.client({ type: 'travel', place: 'stall' });
    expect(room.state.sceneId).toBe('p/noodle-stall');
    const change = tab.events.filter((e) => e.type === 'room').at(-1) as Extract<ServerEvent, { type: 'room' }>;
    expect(change).toMatchObject({ source: 'user', transition: 'glitch' });
    expect(travels).toEqual([['hicks', { from: 'Lowlight Intake', to: "Hae's Noodles", contact: 'Nix' }]]);
    expect(notices(tab.events)).toEqual([]);
  });

  it.each([
    ['an unknown place', 'nowhere', "no place 'nowhere'"],
    ['a place with no room', 'shop', 'Second Socket has no room yet'],
    ['an invite-only place', 'home', "Nix's walk-up is invite only"],
    ['a side place (room exits spec §4a)', 'back', 'Back Stairs is reached from another room'],
    ['a place whose room is gone', 'gone', 'Old Arcade has no room yet'],
    ['where you already are', 'intake', "you're already at Lowlight Intake"],
  ])('refuses %s', (_n, place, notice) => {
    const { tab, room, travels, db } = makeTravelHub();
    tab.client({ type: 'travel', place });
    expect(notices(tab.events)).toEqual([notice]);
    expect(room.state.sceneId).toBe('p/lowlight-intake');
    expect(travels).toEqual([]);
    expect(db.recentMessages('hicks')).toEqual([]);
  });

  it('the city is open: a place in another part of town is reached too', () => {
    const { tab, room, travels } = makeTravelHub();
    tab.client({ type: 'travel', place: 'far' });
    expect(notices(tab.events)).toEqual([]);
    expect(room.state.sceneId).toBe('q/noodle-stall');
    expect(travels).toEqual([['hicks', { from: 'Lowlight Intake', to: 'The Tilt', contact: 'Nix' }]]);
  });

  it('from a room no place shows, the move has no from', () => {
    const { tab, room, travels } = makeTravelHub();
    room.setScene({ id: 'q/lowlight-intake' }, 'dev');
    tab.client({ type: 'travel', place: 'stall' });
    expect(travels).toEqual([['hicks', { from: null, to: "Hae's Noodles", contact: 'Nix' }]]);
  });

  it('from a side room reached by an exit, the move is from that room, by its name (room exits spec §4)', () => {
    const city = roomRegistry(new Map([['p', { registry }], ['q', { registry }]]));
    const scenes = city.list().map((s) => (s.id === 'p/lowlight-intake' ? { ...s, exits: [{ to: 'q/lowlight-intake', way: 'down the back stairs' }] } : s));
    const { tab, room, travels } = makeTravelHub(MAP, { scenes });
    room.setScene({ id: 'q/lowlight-intake' }, 'dev');
    tab.client({ type: 'travel', place: 'stall' });
    expect(travels).toEqual([['hicks', { from: room.findScene('q/lowlight-intake')!.name, to: "Hae's Noodles", contact: 'Nix' }]]);
  });

  it('refuses while she is replying', () => {
    const { tab, room, relay, travels } = makeTravelHub();
    relay.busy = true;
    tab.client({ type: 'travel', place: 'stall' });
    expect(notices(tab.events)).toEqual(['wait for her to finish']);
    expect(room.state.sceneId).toBe('p/lowlight-intake');
    expect(travels).toEqual([]);
  });

  it.each([
    ['a broken map file', '{'],
    ['an invalid map', { version: 2 }],
  ])('refuses with %s', (_n, map) => {
    const { tab, room } = makeTravelHub(map);
    tab.client({ type: 'travel', place: 'stall' });
    expect(notices(tab.events)).toEqual(["the map isn't available"]);
    expect(room.state.sceneId).toBe('p/lowlight-intake');
  });

  it('reads the map per move: a file deleted after start is refused', () => {
    const { tab, mapFile } = makeTravelHub();
    fs.rmSync(mapFile);
    tab.client({ type: 'travel', place: 'stall' });
    expect(notices(tab.events)).toEqual(["the map isn't available"]);
  });

  it('two moves at once: one scene change, one turn, and the second waits', () => {
    const { tab, room, travels } = makeTravelHub();
    tab.client({ type: 'travel', place: 'stall' });
    tab.client({ type: 'travel', place: 'roof' });
    expect(room.state.sceneId).toBe('p/noodle-stall');
    expect(travels).toHaveLength(1);
    expect(notices(tab.events)).toEqual(['wait for her to finish']);
  });

  it('names no start when the room is somewhere off the map', () => {
    const { tab, room, travels } = makeTravelHub({ ...MAP, places: MAP.places.filter((p) => p.id !== 'roof' && p.id !== 'home') });
    room.setScene({ id: 'p/ribbon-rooftop' }, 'dev');
    tab.client({ type: 'travel', place: 'stall' });
    expect(travels[0]![1]).toMatchObject({ from: null, to: "Hae's Noodles" });
  });

  describe('encounter', () => {
    const event = { title: 'Wrong package', text: 'A courier drops a box.', stranger: { name: 'Courier', voice: 'clipped' } };

    it('validates: an event that parses (a bad stranger dropped), else refused', () => {
      expect(validateClientEvent({ type: 'encounter', encounter: event })).toEqual({ type: 'encounter', encounter: event });
      expect(validateClientEvent({ type: 'encounter', encounter: { ...event, stranger: { name: '' } } })).toEqual({
        type: 'encounter',
        encounter: { title: 'Wrong package', text: 'A courier drops a box.' },
      });
      // A broken one gets through to the handler, which says so to the tab (the panel shows it).
      expect(validateClientEvent({ type: 'encounter', encounter: { title: 'T' } })).toEqual({ type: 'encounter', encounter: null });
    });

    it("a broken event is refused to the tab as a notice (mid-branch review M3)", () => {
      const { tab, encounters } = makeTravelHub();
      tab.client({ type: 'encounter', encounter: { title: 'T' } });
      expect(notices(tab.events)).toEqual(["that isn't an event"]);
      expect(encounters).toEqual([]);
    });

    it('plays it: her turn starts on it', () => {
      const { tab, encounters } = makeTravelHub();
      tab.client({ type: 'encounter', encounter: event });
      expect(encounters).toEqual([['hicks', event]]);
      expect(notices(tab.events)).toEqual([]);
    });

    it('while busy it is refused with "wait for her to finish" and writes nothing', () => {
      const { tab, relay, encounters, db } = makeTravelHub();
      relay.busy = true;
      tab.client({ type: 'encounter', encounter: event });
      expect(notices(tab.events)).toEqual(['wait for her to finish']);
      // Tagged, so an open ENCOUNTER panel shows it and no other notice (minor M1).
      expect(tab.events.filter((e) => e.type === 'notice')).toEqual([{ type: 'notice', text: 'wait for her to finish', for: 'encounter' }]);
      expect(encounters).toEqual([]);
      expect(db.recentMessages('hicks')).toEqual([]);
    });

    it('with no key it is refused with NO LINK', () => {
      const { tab, relay, encounters } = makeTravelHub();
      relay.ready = false;
      tab.client({ type: 'encounter', encounter: event });
      expect(notices(tab.events)).toEqual(['// NO LINK — RELINK AT SELECT']);
      expect(encounters).toEqual([]);
    });
  });

  describe('dice_line', () => {
    const record = { round: 1, bids: [{ q: 2, face: 4, by: 'you' }], caller: 'her', dice: { you: [4, 2], her: [3, 3] }, bid: { q: 2, face: 4, by: 'you' }, count: 1, loser: 'you', left: { you: 1, her: 2 } };
    const ev = { type: 'dice_line', round: 1, record, stake: 'a drink', seed: 7 } as const;
    const flush = () => new Promise((r) => setTimeout(r, 0));

    it('validates its shape', () => {
      expect(validateClientEvent(ev)).toEqual(ev);
      expect(typeof validateClientEvent({ ...ev, round: 0 })).toBe('string');
      expect(typeof validateClientEvent({ ...ev, stake: 'x'.repeat(61) })).toBe('string');
      expect(typeof validateClientEvent({ ...ev, record: { ...record, caller: 'nobody' } })).toBe('string');
      expect(typeof validateClientEvent({ ...ev, seed: 'x' })).toBe('string');
    });

    it('a good round gets her line back to that tab only', async () => {
      const diceLine = vi.fn(async () => ({ line: 'Collar again.', expression: 'smile' }));
      const { tab } = makeTravelHub(MAP, { diceLine });
      const other = fakeSocket();
      tab.client(ev);
      await flush();
      expect(diceLine).toHaveBeenCalledWith('hicks', { round: 1, record, stake: 'a drink' }, expect.any(AbortSignal));
      // The game's seed comes back, so a line for an abandoned game can't land in the next one (M1).
      expect(tab.events.filter((e) => e.type === 'dice_line')).toEqual([{ type: 'dice_line', round: 1, seed: 7, line: 'Collar again.', expression: 'smile' }]);
      expect(other.events).toEqual([]);
    });

    it('no line from her model sends nothing', async () => {
      const { tab } = makeTravelHub(MAP, { diceLine: async () => null });
      tab.client(ev);
      await flush();
      expect(tab.events.filter((e) => e.type === 'dice_line')).toEqual([]);
    });

    it('a newer round from the same tab aborts the call still running for the last one (M7)', async () => {
      const signals: AbortSignal[] = [];
      const diceLine = vi.fn((_p: string, _r: unknown, signal?: AbortSignal) => (signals.push(signal!), new Promise<null>(() => {})));
      const { tab } = makeTravelHub(MAP, { diceLine });
      tab.client(ev);
      tab.client({ ...ev, round: 2, record: { ...record, round: 2 } });
      expect(signals.map((x) => x.aborted)).toEqual([true, false]);
    });

    it('refused silently with no link and while she replies: the tray just goes without (M3)', async () => {
      for (const [set] of [
        [(r: Record<string, unknown>) => (r.busy = true), 'wait for her to finish'],
        [(r: Record<string, unknown>) => (r.ready = false), '// NO LINK — RELINK AT SELECT'],
      ] as const) {
        const diceLine = vi.fn(async () => null);
        const { tab, relay } = makeTravelHub(MAP, { diceLine });
        set(relay as unknown as Record<string, unknown>);
        tab.client(ev);
        expect(tab.events.filter((e) => e.type === 'notice')).toEqual([]);
        expect(diceLine).not.toHaveBeenCalled();
      }
    });
  });

  describe('dice', () => {
    const record = { round: 1, bids: [{ q: 2, face: 4 as const, by: 'you' as const }], caller: 'her' as const, dice: { you: [4, 2] as (1 | 2 | 3 | 4 | 5 | 6)[], her: [3, 3] as (1 | 2 | 3 | 4 | 5 | 6)[] }, bid: { q: 2, face: 4 as const, by: 'you' as const }, count: 1, loser: 'you' as const, left: { you: 0, her: 2 } };
    const ev = { type: 'dice', stake: 'a drink', result: 'won', rounds: [record], lines: ['Gotcha.'], seed: 9 } as const;

    it('validates its shape', () => {
      expect(validateClientEvent(ev)).toEqual(ev);
      for (const bad of [{ stake: 'x'.repeat(61) }, { stake: 'a\ndrink' }, { result: 'draw' }, { rounds: [], lines: [] }, { rounds: Array(21).fill(record), lines: Array(21).fill(null) }, { lines: [] }, { seed: 'x' }])
        expect(typeof validateClientEvent({ ...ev, ...bad })).toBe('string');
    });

    it("starts her turn on the game's snapshot", () => {
      const dice: unknown[][] = [];
      const { tab, relay } = makeTravelHub(MAP, { diceLine: async () => null });
      (relay as unknown as { dice: (...a: unknown[]) => Promise<never> }).dice = (...a: unknown[]) => (dice.push(a), new Promise(() => {}));
      tab.client(ev);
      expect(tab.events.filter((e) => e.type === 'notice')).toEqual([]);
      expect(dice).toEqual([['hicks', { her: 'Nix', stake: 'a drink', result: 'won', rounds: [record], lines: ['Gotcha.'], seed: 9 }]]);
    });

    it('refuses with no link and while she replies', () => {
      for (const [set, notice] of [
        [(r: Record<string, unknown>) => (r.busy = true), 'wait for her to finish'],
        [(r: Record<string, unknown>) => (r.ready = false), '// NO LINK — RELINK AT SELECT'],
      ] as const) {
        const { tab, relay } = makeTravelHub(MAP);
        set(relay as unknown as Record<string, unknown>);
        tab.client(ev);
        expect(tab.events.filter((e) => e.type === 'notice')).toEqual([{ type: 'notice', text: notice, for: 'dice' }]);
      }
    });

    it('restore_message brings back a dice row with its snapshot, and refuses one without', () => {
      const user = { id: 'd1', role: 'user', text: '*Hicks plays.*', toolLines: [], ts: 1, status: 'ok' };
      const dice = { you: 'Hicks', her: 'Nix', stake: 'a drink', result: 'won', rounds: [record], lines: [null] };
      expect(validateClientEvent({ type: 'restore_message', message: { ...user, mode: 'dice', dice } })).toEqual({ type: 'restore_message', message: { ...user, mode: 'dice', dice } });
      expect(validateClientEvent({ type: 'restore_message', message: { ...user, mode: 'dice' } })).toBe('restore_message needs a whole message');
    });
  });

  describe('gig', () => {
    const run = { type: 'gig', place: 'far', brief: 'held-pay', result: 'clean', trace: 8, max: 14, seed: 42 } as const;

    it('validates its shape', () => {
      expect(validateClientEvent(run)).toEqual(run);
      const { seed: _s, ...noSeed } = run;
      expect(typeof validateClientEvent(noSeed)).toBe('string');
      expect(typeof validateClientEvent({ ...run, result: 'win' })).toBe('string');
      expect(typeof validateClientEvent({ ...run, trace: '8' })).toBe('string');
    });

    it("starts her turn on the brief's snapshot", () => {
      const { tab, gigs } = makeTravelHub();
      tab.client(run);
      expect(notices(tab.events)).toEqual([]);
      expect(gigs).toEqual([
        [
          'hicks',
          { title: 'Held Pay', tier: 'hard', place: 'The Tilt', client: 'Nobody', target: 'Glass Orchid · house ledger', take: 'a payout', brief: 'Thick lacquer.', result: 'clean', trace: 8, max: 14 },
        ],
      ]);
    });

    it.each([
      ['an unknown place', { place: 'nowhere' }, 'no jobs at nowhere'],
      ['a place with gigs off', { place: 'stall' }, 'no jobs at stall'],
      ['an unknown brief', { brief: 'nope' }, "no job 'nope' here"],
      ["another place's brief", { brief: 'noodles' }, "no job 'noodles' here"],
      ["a max that isn't the tier's", { max: 12 }, "that run doesn't add up"],
      ['a clean run over the max', { trace: 15 }, "that run doesn't add up"],
      ['a negative trace', { trace: -1 }, "that run doesn't add up"],
      ['a traced run within the max', { result: 'traced', trace: 14 }, "that run doesn't add up"],
      ['a traced run past max + 20', { result: 'traced', trace: 35 }, "that run doesn't add up"],
    ])('refuses %s', (_name, change, notice) => {
      const { tab, gigs } = makeTravelHub();
      tab.client({ ...run, ...change });
      expect(tab.events.filter((e) => e.type === 'notice')).toEqual([{ type: 'notice', text: notice, for: 'gig' }]);
      expect(gigs).toEqual([]);
    });

    describe('papers', () => {
      const desk = (dir: string) =>
        fs.writeFileSync(
          path.join(dir, 'desk.md'),
          '---\ntitle: Night Crossing\ntier: medium\nkind: papers\nplace: far\nclient: A dock family\ntarget: Tidal Isle · booth nine\ntake: one crossing\n---\nThe boat drops them at four.\n',
        );
      const lore = new Set(['tidal-isle', 'sentinel-defense-group', 'miragen-pharmaceuticals', 'neon-strand', 'the-marsh', 'velvet', 'voltaic-logistics', 'karasu', 'the-houses', 'chiron-medical', 'the-co-ops', 'dockside']);
      function papersHub(setup: (papersDir: string) => void = () => {}) {
        const papersDir = tempDir('nix-hub-papers-');
        const dataDir = tempDir('nix-hub-data-');
        setup(papersDir);
        const h = makeTravelHub(MAP, { papersDir, dataDir, loreIds: () => lore });
        desk(path.join(path.dirname(h.mapFile), 'gigs'));
        return { ...h, papersDir, dataDir };
      }
      const boardFor = (papersDir: string, seed: number, tier: 'easy' | 'medium' = 'medium') => papersBoard(tier, seed, loadPapersData(papersDir, lore, () => {}));
      const runFor = (b: ReturnType<typeof papersBoard>, over: Record<string, unknown> = {}) => ({ type: 'gig', kind: 'papers', place: 'far', brief: 'desk', result: 'clean', trace: b.clean, max: b.cap, seed: b.seed, papers: { overlooked: null }, ...over });

      it('validates with its kind and its papers detail', () => {
        const ev = { type: 'gig', kind: 'papers', place: 'far', brief: 'desk', result: 'back', trace: 3, max: 6, seed: 5, papers: { overlooked: 1 } };
        expect(validateClientEvent(ev)).toEqual(ev);
        expect(typeof validateClientEvent({ ...ev, result: 'traced' })).toBe('string');
        expect(typeof validateClientEvent({ ...ev, papers: { overlooked: 'x' } })).toBe('string');
      });

      it("regenerates the board and starts her turn with the client and tonight's bulletin", () => {
        const h = papersHub();
        const b = boardFor(h.papersDir, 42);
        h.tab.client(runFor(b, { papers: { overlooked: 1 }, trace: b.clean }));
        expect(notices(h.tab.events)).toEqual([]);
        const [, snap] = h.gigs[0] as [string, GigSnapshot];
        expect(snap).toMatchObject({ kind: 'papers', title: 'Night Crossing', result: 'clean', trace: b.clean, max: b.cap });
        expect(snap.papers).toEqual({ name: b.name, pronoun: b.pronoun, bulletin: b.rules.map((r) => ({ text: ruleText(r.rule), why: r.why, lore: r.lore })), overlooked: 1 });
      });

      it.each([
        ['a cap that is not the board\'s', (b: ReturnType<typeof papersBoard>) => ({ max: b.cap + 1 })],
        ['risk over the cap', (b: ReturnType<typeof papersBoard>) => ({ trace: b.cap + 1 })],
        ['negative risk', () => ({ trace: -1 })],
        ['clean above the CLEAN line', (b: ReturnType<typeof papersBoard>) => ({ trace: b.clean + 1 })],
        ['booth nine on a rule that is not there', (b: ReturnType<typeof papersBoard>) => ({ papers: { overlooked: b.rules.length } })],
      ])("refuses %s: that run doesn't add up", (_name, over) => {
        const h = papersHub();
        const b = boardFor(h.papersDir, 42);
        h.tab.client(runFor(b, over(b)));
        expect(notices(h.tab.events)).toEqual(["that run doesn't add up"]);
        expect(h.gigs).toEqual([]);
      });

      it('refuses a run whose board changed under it when faces.json was edited (Review Focus 1)', () => {
        const h = papersHub();
        const dealt = Array.from({ length: 300 }, (_, i) => boardFor(h.papersDir, i + 1));
        const bands = { 'under 25': 'u25', '25–40': 'mid', 'over 40': 'o40' } as const;
        // Faces that pass for every band they can: the same seeds now deal cheaper boards.
        fs.mkdirSync(path.join(h.papersDir, 'faces'), { recursive: true });
        for (const [band, p] of Object.entries(bands)) fs.writeFileSync(path.join(h.papersDir, 'faces', `${p}-01.jpg`), 'jpg');
        fs.writeFileSync(path.join(h.papersDir, 'faces.json'), JSON.stringify([{ id: 'u25-01', looks: ['under 25', '25–40'] }, { id: 'mid-01', looks: ['under 25', '25–40', 'over 40'] }, { id: 'o40-01', looks: ['25–40', 'over 40'] }]));
        const changed = dealt.find((b) => boardFor(h.papersDir, b.seed).cap !== b.cap);
        expect(changed).toBeDefined();
        h.tab.client(runFor(changed!, { result: 'close', trace: changed!.cap }));
        expect(notices(h.tab.events)).toEqual(["that run doesn't add up"]);
      });

      it('seed 0 is the first night, and accepting it marks the first night seen', () => {
        const h = papersHub();
        const b = boardFor(h.papersDir, 0);
        expect(b.firstNight).toBe(true);
        expect(firstNightSeen(h.dataDir)).toBe(false);
        h.tab.client(runFor(b));
        expect(notices(h.tab.events)).toEqual([]);
        expect(firstNightSeen(h.dataDir)).toBe(true);
      });

      it("an origin's own lore rides along with the bulletin's (spec §6.1)", () => {
        const h = papersHub((dir) =>
          fs.writeFileSync(path.join(dir, 'origins.json'), JSON.stringify(['Sable Coast', 'Kessen', 'the Shoals', 'Varna', 'Meridian'].map((name) => ({ name, lore: 'tidal-isle' })))),
        );
        const b = Array.from({ length: 400 }, (_, i) => boardFor(h.papersDir, i + 1)).find((x) => x.rules.some((r) => r.rule.f === 'origin') && x.rules.every((r) => r.lore !== 'tidal-isle'))!;
        h.tab.client(runFor(b));
        const [, snap] = h.gigs[0] as [string, GigSnapshot];
        expect(snap.papers?.extraLore).toEqual(['tidal-isle']);
      });
    });

    describe('a slip', () => {
      const slip = { type: 'gig', kind: 'slip', place: 'far', brief: 'floor', result: 'clean', trace: 0, max: 8, seed: 7 } as const;

      it('validates with its kind, and a hack event with no kind still does', () => {
        expect(validateClientEvent(slip)).toEqual(slip);
        expect(validateClientEvent({ ...slip, result: 'caught' })).toEqual({ ...slip, result: 'caught' });
        expect(typeof validateClientEvent({ ...slip, kind: 'heist' })).toBe('string');
        expect(typeof validateClientEvent({ ...slip, result: 'traced', trace: 9 })).toBe('string');
        expect(typeof validateClientEvent({ type: 'gig', place: 'far', brief: 'held-pay', result: 'caught', trace: 0, max: 14, seed: 1 })).toBe('string');
      });

      it("starts her turn on the slip's snapshot, kind included", () => {
        const { tab, gigs } = makeTravelHub();
        tab.client(slip);
        expect(notices(tab.events)).toEqual([]);
        expect(gigs).toEqual([
          [
            'hicks',
            { kind: 'slip', title: 'Held Pay', tier: 'medium', place: 'The Tilt', client: 'Nobody', target: 'Glass Orchid · house ledger', take: 'a payout', brief: 'Thick lacquer.', result: 'clean', trace: 0, max: 8 },
          ],
        ]);
      });

      it('a caught run at heat 0 goes through (a guard walked into you)', () => {
        const { tab, gigs } = makeTravelHub();
        tab.client({ ...slip, result: 'caught', trace: 0 });
        expect(gigs).toHaveLength(1);
      });

      it.each([
        ['a kind that is not the brief\'s', { kind: 'hack' }, "that run doesn't add up"],
        ["a hack's max on a slip", { max: 12 }, "that run doesn't add up"],
        ['caught past max + 20', { result: 'caught', trace: 29 }, "that run doesn't add up"],
      ])('refuses %s', (_name, change, notice) => {
        const { tab, gigs } = makeTravelHub();
        tab.client({ ...slip, ...change });
        expect(tab.events.filter((e) => e.type === 'notice')).toEqual([{ type: 'notice', text: notice, for: 'gig' }]);
        expect(gigs).toEqual([]);
      });

      it('a hack run naming a slip brief is refused', () => {
        const { tab, gigs } = makeTravelHub();
        const { kind: _k, ...noKind } = slip;
        tab.client({ ...noKind, max: 12 });
        expect(tab.events.filter((e) => e.type === 'notice')).toEqual([{ type: 'notice', text: "that run doesn't add up", for: 'gig' }]);
        expect(gigs).toEqual([]);
      });
    });

    it('a traced run up to max + 20 goes through', () => {
      const { tab, gigs } = makeTravelHub();
      tab.client({ ...run, result: 'traced', trace: 34 });
      expect(gigs).toHaveLength(1);
    });

    it('a run the relay drops (it got busy first) is refused, so the window can send again (review)', async () => {
      const { tab, relay } = makeTravelHub();
      (relay as unknown as { gig: () => Promise<null> }).gig = () => Promise.resolve(null);
      tab.client(run);
      await new Promise((r) => setTimeout(r, 0));
      expect(tab.events.filter((e) => e.type === 'notice')).toEqual([{ type: 'notice', text: 'wait for her to finish', for: 'gig' }]);
    });

    it('refuses while busy and with no key', () => {
      for (const [set, notice] of [
        [(r: Record<string, unknown>) => (r.busy = true), 'wait for her to finish'],
        [(r: Record<string, unknown>) => (r.ready = false), '// NO LINK — RELINK AT SELECT'],
      ] as const) {
        const { tab, relay, gigs } = makeTravelHub();
        set(relay as unknown as Record<string, unknown>);
        tab.client(run);
        expect(tab.events.filter((e) => e.type === 'notice')).toEqual([{ type: 'notice', text: notice, for: 'gig' }]);
        expect(gigs).toEqual([]);
      }
    });
  });

  describe('hub exit (clickable doors spec §4)', () => {
    const exitHub = (extra: Partial<Parameters<typeof createHub>[0]> = {}, relayExtra: Record<string, unknown> = {}) => {
      const city = roomRegistry(new Map([['p', { registry }], ['q', { registry }]]));
      const scenes = city.list().map((s) =>
        s.id === 'p/lowlight-intake'
          ? {
              ...s,
              exits: [
                { to: 'p/noodle-stall', way: 'down the back stairs', door: [10, 10, 40, 40] as [number, number, number, number] },
                { to: 'q/arcade', way: 'into the arcade' },
                { to: 'q/ribbon-rooftop', way: 'up the fire escape' },
              ],
            }
          : s,
      );
      return makeTravelHub(MAP, { scenes, ...extra }, relayExtra);
    };

    it("needs a string 'to'", () => {
      expect(validateClientEvent({ type: 'exit' })).toBe("exit needs a string 'to'");
      expect(validateClientEvent({ type: 'exit', to: 'p/noodle-stall' })).toEqual({ type: 'exit', to: 'p/noodle-stall' });
    });

    it('goes through: a save point, the glitch as the user, then her turn with the way', () => {
      const moves: unknown[] = [];
      const { tab, room, travels } = exitHub({ beforeTravel: (m) => moves.push(m) });
      tab.client({ type: 'exit', to: 'p/noodle-stall' });
      expect(notices(tab.events)).toEqual([]);
      expect(room.state.sceneId).toBe('p/noodle-stall');
      const change = tab.events.filter((e) => e.type === 'room').at(-1) as Extract<ServerEvent, { type: 'room' }>;
      expect(change).toMatchObject({ source: 'user', transition: 'glitch' });
      expect(moves).toEqual([{ from: 'Lowlight Intake', to: "Hae's Noodles" }]);
      expect(travels).toEqual([['hicks', { from: 'Lowlight Intake', to: "Hae's Noodles", contact: 'Nix', via: 'down the back stairs' }]]);
    });

    it('I5: a door on comms keeps the line; a door into her place ends it', () => {
      const on = { on: true, at: 'p/ribbon-rooftop' };
      const away = exitHub({ herPlace: () => 'p/ribbon-rooftop' }, { commsCan: () => true, commsNow: () => on });
      away.tab.client({ type: 'exit', to: 'p/noodle-stall' });
      expect(away.travels[0][1]).toMatchObject({ via: 'down the back stairs', comms: on });
      const back = exitHub({ herPlace: () => 'p/noodle-stall' }, { commsCan: () => true, commsNow: () => on });
      back.tab.client({ type: 'exit', to: 'p/noodle-stall' });
      expect(back.travels[0][1]).toMatchObject({ comms: { on: false } });
    });

    it('an exit with no door box still goes (the server checks the exit, not the click)', () => {
      const { tab, room } = exitHub();
      tab.client({ type: 'exit', to: 'q/ribbon-rooftop' });
      expect(notices(tab.events)).toEqual([]);
      expect(room.state.sceneId).toBe('q/ribbon-rooftop');
    });

    it.each([
      ['a room that is no exit here', (_r: { busy: boolean; ready: boolean }) => {}, 'p/ribbon-rooftop', 'no way there from here'],
      ['an exit whose room is gone', (_r: { busy: boolean; ready: boolean }) => {}, 'q/arcade', 'q/arcade has no room yet'],
      ['while she is replying', (r: { busy: boolean; ready: boolean }) => void (r.busy = true), 'p/noodle-stall', 'wait for her to finish'],
      ['with no key linked', (r: { busy: boolean; ready: boolean }) => void (r.ready = false), 'p/noodle-stall', '// NO LINK — RELINK AT SELECT'],
    ])('refuses %s', (_n, set, to, notice) => {
      const { tab, room, relay, travels, db } = exitHub();
      set(relay);
      tab.client({ type: 'exit', to });
      expect(notices(tab.events)).toEqual([notice]);
      expect(room.state.sceneId).toBe('p/lowlight-intake');
      expect(travels).toEqual([]);
      expect(db.recentMessages('hicks')).toEqual([]);
    });

    it('a room no map place shows is named by its exit place, else its own name', () => {
      const { tab, travels, room } = exitHub();
      tab.client({ type: 'exit', to: 'q/ribbon-rooftop' });
      // q/ribbon-rooftop is the map's side place "Back Stairs".
      expect(travels).toEqual([['hicks', { from: 'Lowlight Intake', to: 'Back Stairs', contact: 'Nix', via: 'up the fire escape' }]]);
      expect(room.state.sceneId).toBe('q/ribbon-rooftop');
    });
  });
});

describe('hub scenes event', () => {
  const hae = { id: 'hae', name: 'Hae', pronoun: 'she' as const, accent: '#ff8a3c', thumb: '/api/residents/hae/thumb', sprite: { url: '/api/residents/hae/sprite', crop: { top: 0, bottom: 0.5 } } };

  it('carries the residents it was given', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const journal = new Journal(db);
    const room = new Room(registry);
    const hub = createHub({
      player: 'hicks', room, journal, db, scenes: registry.list(), sceneErrors: [], residents: { hae },
      tools: { room, journal, player: () => 'hicks', expressions: null },
      getRelay: () => ({ activeMessageId: null, busy: false, activePlayer: 'hicks' }) as unknown as ChatRelay,
    });
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    const scenes = a.events.find((e) => e.type === 'scenes');
    expect(scenes && scenes.type === 'scenes' && scenes.residents).toEqual({ hae });
    db.close();
  });

  it('carries none by default', () => {
    const { hub, db } = makeHub();
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    const scenes = a.events.find((e) => e.type === 'scenes');
    expect(scenes && scenes.type === 'scenes' && scenes.residents).toEqual({});
    db.close();
  });
});

describe('hub: the power (blackouts phase 3 §4)', () => {
  it('a tab joining hears who is dark and whether its room is', () => {
    const power = { dark: ['karasu'], here: { name: 'Karasu', since: 1320 } };
    const { hub, db } = makeHub(null, 'hicks', { power: () => power });
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    expect(a.events.find((e) => e.type === 'power')).toEqual({ type: 'power', ...power });
    db.close();
  });

  it("the admin panel's POWER OUT cuts the power where this room is", () => {
    let cuts = 0;
    const { hub, db } = makeHub(null, 'hicks', { powerOut: () => void cuts++ });
    const a = fakeSocket();
    hub.addClient(a.ws, 'hicks');
    a.client({ type: 'dev_action', tool: 'power_out', args: {} });
    expect(cuts).toBe(1);
    expect(a.events.filter((e) => e.type === 'dev_log')).toEqual([]);
    db.close();
  });
});
