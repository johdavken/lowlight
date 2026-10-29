import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { PlanCard } from '../../shared/types';
import type { WebSocket } from 'ws';
import { SceneRegistry } from '../src/scenes';
import { Room } from '../src/room-state';
import { generateScenes } from '../../tools/gen-placeholders';
import { openDb } from '../src/db';
import { Journal } from '../src/journal';
import { createHub, PICK_CHECK_TIMEOUT_MS, validateClientEvent } from '../src/hub';
import type { ChatRelay } from '../src/chat-relay';
import type { QuestState, ServerEvent } from '../../shared/types';

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-quests-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

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

const ACTIVE: QuestState = {
  open: [],
  active: { id: 'paper-trail', title: 'Paper Trail', beat: 'sentinel', choices: [{ id: 'hand', line: 'Hand it over.' }, { id: 'stall', line: 'Stall him till morning.' }] },
  changed: null,
  waiting: null,
  elsewhere: [],
};

function setup(o: { card?: PlanCard | null; state?: QuestState | (() => QuestState); pickCheck?: (player: string, line: string, signal: AbortSignal) => Promise<string>; start?: string; choose?: string } = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  const journal = new Journal(db);
  const room = new Room(registry);
  const calls = { plans: [] as string[], send: [] as { text: string; mode: string }[], start: [] as string[], choose: [] as unknown[], due: [] as unknown[], walk: [] as string[] };
  const relay = {
    activeMessageId: null,
    busy: false,
    ready: true,
    activePlayer: 'hicks',
    questState: () => (typeof o.state === 'function' ? o.state() : (o.state ?? ACTIVE)),
    planCardFor: () => o.card ?? null,
    letHerGo: async () => {
      calls.plans.push('let_her_go');
      return { ok: true };
    },
    dropPlan: () => {
      calls.plans.push('plan_drop');
      return { ok: true };
    },
    resendPlanCard: () => void calls.plans.push('resend'),
    send: async (_p: string, text: string, mode: string) => {
      calls.send.push({ text, mode });
      return { ok: true };
    },
    startQuest: async (_p: string, id: string) => {
      calls.start.push(id);
      return o.start ?? { ok: true };
    },
    playDueQuest: async (_p: string, o: unknown) => {
      calls.due.push(o);
      return null;
    },
    chooseQuest: async (_p: string, c: unknown) => {
      calls.choose.push(c);
      return o.choose ?? { ok: true };
    },
    walkAway: async (_p: string, id: string) => {
      calls.walk.push(id);
      return "you can't walk away now";
    },
  };
  const hub = createHub({
    player: 'hicks',
    room,
    journal,
    tools: { room, journal, player: () => 'hicks', expressions: null },
    db,
    scenes: registry.list(),
    sceneErrors: [],
    getRelay: () => relay as unknown as ChatRelay,
    ...(o.pickCheck ? { pickCheck: o.pickCheck } : {}),
  });
  const tab = fakeSocket();
  hub.addClient(tab.ws, 'hicks');
  return { hub, tab, calls, relay };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const say = (text: string, extra: object = {}) => ({ type: 'user_message', text, ...extra });

describe('the pick check', () => {
  it('a line that acts out a choice is held: nothing sent, quest_pick to this tab', async () => {
    const check = vi.fn(async () => '{"pick":"stall"}');
    const { tab, calls } = setup({ pickCheck: check });
    tab.client(say('Come back in the morning.'));
    await flush();
    expect(calls.send).toEqual([]);
    expect(tab.events.at(-1)).toEqual({ type: 'quest_pick', id: 'paper-trail', beat: 'sentinel', choice: 'stall', text: 'Come back in the morning.' });
    expect(check).toHaveBeenCalledWith('hicks', 'Come back in the morning.', expect.any(AbortSignal));
  });

  for (const [what, answer] of [
    ['null', async () => '{"pick":null}'],
    ['an unshown id', async () => '{"pick":"deny"}'],
    ['prose', async () => 'I think they stall.'],
  ] as const) {
    it(`${what} sends the line on as talk`, async () => {
      const { tab, calls } = setup({ pickCheck: answer });
      tab.client(say('What do we do?'));
      await flush();
      expect(calls.send).toEqual([{ text: 'What do we do?', mode: 'rp' }]);
      expect(tab.events.some((e) => e.type === 'quest_pick')).toBe(false);
    });
  }

  it('a failed check sends it on and says so in the dev log (Review Focus 4)', async () => {
    const { tab, calls } = setup({ pickCheck: async () => Promise.reject(new Error('402')) });
    tab.client(say('Hm.'));
    await flush();
    expect(calls.send).toHaveLength(1);
    expect(tab.events.some((e) => e.type === 'dev_log' && e.level === 'warn' && e.text.includes('pick check'))).toBe(true);
  });

  it('a check slower than its timeout sends it on', async () => {
    vi.useFakeTimers();
    try {
      let aborted = false;
      const { tab, calls } = setup({ pickCheck: (_p, _l, signal) => new Promise((_r, reject) => signal.addEventListener('abort', () => ((aborted = true), reject(new Error('aborted'))))) });
      tab.client(say('Hm.'));
      await vi.advanceTimersByTimeAsync(PICK_CHECK_TIMEOUT_MS + 1);
      expect(aborted).toBe(true);
      expect(calls.send).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('no pick check (no model to ask) goes straight through (Review Focus 4)', async () => {
    const { tab, calls } = setup();
    tab.client(say('Come back in the morning.'));
    await flush();
    expect(calls.send).toHaveLength(1);
  });

  it('talk: true, OOC and END SCENE are never checked; nor is anything with no quest at a beat', async () => {
    const check = vi.fn(async () => '{"pick":"stall"}');
    const { tab, calls } = setup({ pickCheck: check });
    tab.client(say('Come back in the morning.', { talk: true }));
    tab.client(say('ooc question', { mode: 'ooc' }));
    tab.client(say('bye', { mode: 'end' }));
    await flush();
    expect(check).not.toHaveBeenCalled();
    expect(calls.send).toHaveLength(3);
    const idle = setup({ pickCheck: check, state: { open: [], active: null, changed: null, waiting: null, elsewhere: [] } });
    idle.tab.client(say('Come back in the morning.'));
    await flush();
    expect(check).not.toHaveBeenCalled();
    expect(idle.calls.send).toHaveLength(1);
  });

  it('a second line while a check runs is refused as busy, and checked once (Review Focus 3)', async () => {
    let answer: (s: string) => void = () => {};
    const check = vi.fn(() => new Promise<string>((r) => (answer = r)));
    const { tab, calls } = setup({ pickCheck: check });
    tab.client(say('one'));
    tab.client(say('two'));
    await flush();
    expect(tab.events.some((e) => e.type === 'turn_rejected' && e.reason === 'busy')).toBe(true);
    answer('{"pick":null}');
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    expect(calls.send).toEqual([{ text: 'one', mode: 'rp' }]);
  });
});

describe('the pick check against what changed while it ran (review fixes)', () => {
  it('a turn that started meanwhile: the line comes back to its tab, not lost', async () => {
    let answer: (s: string) => void = () => {};
    const { tab, calls, relay } = setup({ pickCheck: () => new Promise<string>((r) => (answer = r)) });
    tab.client(say('What now?'));
    await flush();
    relay.busy = true;
    answer('{"pick":null}');
    await flush();
    expect(calls.send).toEqual([]);
    expect(tab.events.at(-1)).toEqual({ type: 'turn_rejected', reason: 'busy', text: 'What now?' });
  });

  it('cards and the start key wait while a check runs', async () => {
    let answer: (s: string) => void = () => {};
    const { tab, calls } = setup({ pickCheck: () => new Promise<string>((r) => (answer = r)) });
    tab.client(say('What now?'));
    tab.client({ type: 'quest_choose', id: 'paper-trail', beat: 'sentinel', choice: 'stall' });
    await flush();
    expect(calls.choose).toEqual([]);
    expect(tab.events.at(-1)).toEqual({ type: 'notice', text: 'wait for her to finish', for: 'quest' });
    answer('{"pick":null}');
    await flush();
  });

  it('a quest that moved on while it ran: the line goes on as talk', async () => {
    let answer: (s: string) => void = () => {};
    let state = ACTIVE;
    const { tab, calls } = setup({ state: () => state, pickCheck: () => new Promise<string>((r) => (answer = r)) });
    tab.client(say('Come back in the morning.'));
    await flush();
    state = { ...ACTIVE, active: { ...ACTIVE.active!, beat: 'return' } };
    answer('{"pick":"stall"}');
    await flush();
    expect(tab.events.some((e) => e.type === 'quest_pick')).toBe(false);
    expect(calls.send).toEqual([{ text: 'Come back in the morning.', mode: 'rp' }]);
  });

  it('quest_pick names the quest and beat it was judged against', async () => {
    const { tab } = setup({ pickCheck: async () => '{"pick":"stall"}' });
    tab.client(say('Come back in the morning.'));
    await flush();
    expect(tab.events.at(-1)).toEqual({ type: 'quest_pick', id: 'paper-trail', beat: 'sentinel', choice: 'stall', text: 'Come back in the morning.' });
  });
});

describe('her plan card (her plans spec §5)', () => {
  const CARD: PlanCard = { name: 'Nix', going: "Nix's flat", meet: "Hae's Noodles at 21:00", from: 'r1' };
  it('a tab that joins gets the card, or null', () => {
    expect(setup({ card: CARD }).tab.events.find((e) => e.type === 'plan_card')).toEqual({ type: 'plan_card', card: CARD });
    // None: still said, so a tab that reconnects drops a card it was showing (final review M1).
    expect(setup().tab.events.find((e) => e.type === 'plan_card')).toEqual({ type: 'plan_card', card: null });
  });
  it('LET HER GO and GO WITH HER reach the relay', async () => {
    const { tab, calls } = setup({ card: CARD });
    tab.client({ type: 'let_her_go' });
    tab.client({ type: 'plan_drop' });
    await flush();
    expect(calls.plans).toEqual(['let_her_go', 'plan_drop']);
  });
  it('LET HER GO while a line is being checked: not now, and the card comes back (mid review M4)', async () => {
    let release!: (v: string) => void;
    const { tab, calls } = setup({ card: CARD, pickCheck: () => new Promise<string>((r) => (release = r)) });
    tab.client(say('What do we do?'));
    await flush();
    tab.client({ type: 'let_her_go' });
    await flush();
    expect(calls.plans).toEqual(['resend']);
    expect(tab.events.some((e) => e.type === 'control_rejected' && (e as { reason: string }).reason === 'busy')).toBe(true);
    release('{"pick":null}');
    await flush();
  });
});

describe('quest events', () => {
  it('a tab that joins gets the quest state', () => {
    const { tab } = setup();
    expect(tab.events.find((e) => e.type === 'quest_state')).toEqual({ type: 'quest_state', state: ACTIVE });
  });

  it('a tab that joins while a quest waits, or waits elsewhere, gets the state too', () => {
    const waiting = { ...ACTIVE, active: null, waiting: { id: 'paper-trail', title: 'Paper Trail', next: 'Be at the Intake.', at: null, from: null, by: null, ready: false, here: true } };
    expect(setup({ state: waiting }).tab.events.find((e) => e.type === 'quest_state')).toEqual({ type: 'quest_state', state: waiting });
    const away = { ...ACTIVE, active: null, elsewhere: [{ id: 'paper-trail', title: 'Paper Trail', contact: 'nix-direct', contactName: 'Nix', next: null }] };
    expect(setup({ state: away }).tab.events.find((e) => e.type === 'quest_state')).toEqual({ type: 'quest_state', state: away });
  });

  it('quest_start and quest_choose reach the relay; a refusal comes back as a quest notice', async () => {
    const { tab, calls } = setup({ choose: 'that choice has passed' });
    tab.client({ type: 'quest_start', id: 'paper-trail' });
    tab.client({ type: 'quest_choose', id: 'paper-trail', beat: 'sentinel', choice: 'stall', said: 'Come back.' });
    await flush();
    expect(calls.start).toEqual(['paper-trail']);
    expect(calls.choose).toEqual([{ id: 'paper-trail', beat: 'sentinel', choice: 'stall', said: 'Come back.' }]);
    expect(tab.events.at(-1)).toEqual({ type: 'notice', text: 'that choice has passed', for: 'quest' });
  });

  it('quest_continue asks the relay to play a ready wait; nothing to play says so', async () => {
    const { tab, calls } = setup();
    tab.client({ type: 'quest_continue', id: 'paper-trail' });
    await flush();
    expect(calls.due).toEqual([{ ready: true }]);
    expect(tab.events.at(-1)).toEqual({ type: 'notice', text: 'nothing to continue yet', for: 'quest' });
    expect(validateClientEvent({ type: 'quest_continue', id: 'x' })).toEqual({ type: 'quest_continue', id: 'x' });
  });

  it('validates the new shapes', () => {
    expect(validateClientEvent({ type: 'user_message', text: 'x', talk: true })).toEqual({ type: 'user_message', text: 'x', mode: 'rp', talk: true });
    expect(typeof validateClientEvent({ type: 'user_message', text: 'x', talk: 'yes' })).toBe('string');
    expect(validateClientEvent({ type: 'quest_start', id: 'paper-trail' })).toEqual({ type: 'quest_start', id: 'paper-trail' });
    expect(typeof validateClientEvent({ type: 'quest_start' })).toBe('string');
    expect(validateClientEvent({ type: 'quest_choose', id: 'a', beat: 'b', choice: 'c' })).toEqual({ type: 'quest_choose', id: 'a', beat: 'b', choice: 'c' });
    expect(typeof validateClientEvent({ type: 'quest_choose', id: 'a', beat: 'b', choice: 'c', said: 'x'.repeat(5000) })).toBe('string');
  });

  it('big jobs: quest_choose carries a read or a gig result; quest_walk reaches the relay', async () => {
    expect(validateClientEvent({ type: 'quest_choose', id: 'a', beat: '!read', choice: '!read', read: ['x', 'y', 'z'] })).toEqual({ type: 'quest_choose', id: 'a', beat: '!read', choice: '!read', read: ['x', 'y', 'z'] });
    expect(typeof validateClientEvent({ type: 'quest_choose', id: 'a', beat: 'b', choice: 'c', read: ['x', 'y'] })).toBe('string');
    expect(typeof validateClientEvent({ type: 'quest_choose', id: 'a', beat: 'b', choice: 'c', read: ['x', 'y', 'z'.repeat(50)] })).toBe('string');
    expect(validateClientEvent({ type: 'quest_choose', id: 'a', beat: 'b', choice: 'c', gig: { result: 'close', seed: 42 } })).toEqual({ type: 'quest_choose', id: 'a', beat: 'b', choice: 'c', gig: { result: 'close', seed: 42 } });
    expect(typeof validateClientEvent({ type: 'quest_choose', id: 'a', beat: 'b', choice: 'c', gig: { result: 'won', seed: 42 } })).toBe('string');
    expect(typeof validateClientEvent({ type: 'quest_choose', id: 'a', beat: 'b', choice: 'c', gig: { result: 'clean', seed: 1.5 } })).toBe('string');
    expect(validateClientEvent({ type: 'quest_walk', id: 'north-gate' })).toEqual({ type: 'quest_walk', id: 'north-gate' });
    const { tab, calls } = setup();
    tab.client({ type: 'quest_choose', id: 'north-gate', beat: 'gate', choice: 'wire', gig: { result: 'clean', seed: 7 } });
    tab.client({ type: 'quest_walk', id: 'north-gate' });
    await flush();
    expect(calls.choose.at(-1)).toEqual({ id: 'north-gate', beat: 'gate', choice: 'wire', gig: { result: 'clean', seed: 7 } });
    expect(calls.walk).toEqual(['north-gate']);
    expect(tab.events.at(-1)).toEqual({ type: 'notice', text: "you can't walk away now", for: 'quest' });
  });
});

