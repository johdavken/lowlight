import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Backend } from '../src/backend';
import { ChatRelay, type ChatRelayDeps } from '../src/chat-relay';
import { ScribeRunner } from '../src/scribe-runner';
import { fakePlayers } from './fixtures/players';
import { openDb, type Db, type RebuildResult } from '../src/db';
import { TurnError } from '../src/turn';
import { Journal } from '../src/journal';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import type { SseFrame } from '../src/sse';
import { generateScenes } from '../../tools/gen-placeholders';
import { currentStanding, moveStanding, standingControl, storedStanding } from '../src/standing';
import { DEFAULT_SHARED_STANDING } from '../../shared/standing';

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-rebuild-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
const dbs: Db[] = [];
afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
});

/** What one turn does: its tool calls (run mid-stream, as hers would be), then its text — or a failure after the stream opened. */
/**
 * What one turn does: its tool calls (run mid-stream, as hers would be), then its text — or a failure
 * after the stream opened (`fail`), before it opened (`early`: `act` runs first, as a hand edit made
 * while she's still connecting would), or after some text (`cut`: the take is kept, cut off).
 */
type Turn = { act?: () => void; text?: string; fail?: boolean; early?: boolean; cut?: boolean; wrongModel?: boolean };

/** A relay whose backend runs `turns` in order, with the room persisted the way the hub does it and rebuilds applied the way the runtime does. */
function setup(turns: Turn[], opts: { checkpoint?: () => boolean; scribe?: (db: Db, journal: Journal) => Partial<ChatRelayDeps> } = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  dbs.push(db);
  const room = new Room(registry);
  room.onChange((c) => db.saveRoom(c.state));
  const journal = new Journal(db);
  const rebuilds: RebuildResult[] = [];
  const order: string[] = [];
  let n = 0;
  const backend: Backend = {
    async *streamTurn() {
      const t = turns[n++] ?? {};
      if (t.early) {
        t.act?.();
        throw new TurnError('unreachable', 'no answer');
      }
      yield { event: 'stream.open', data: undefined } as SseFrame;
      t.act?.();
      if (t.fail) throw new TurnError('unreachable', 'dropped');
      if (t.wrongModel) {
        // The provider's "no such model" before any text: the relay retries the turn on a fresh model.
        yield { event: 'run.failed', data: 'HTTP 404: model not found' } as SseFrame;
        return;
      }
      yield { event: 'assistant.delta', data: { delta: t.text ?? 'ok' } } as SseFrame;
      if (t.cut) throw new TurnError('unreachable', 'cut off');
      yield { event: 'run.completed', data: undefined } as SseFrame;
    },
    probe: async () => 'ok',
    currentModel: async () => ({ model: 'z-ai/glm-5.2', provider: 'openrouter' }),
  };
  const relay = new ChatRelay({
    players: fakePlayers(),
    backend,
    identity: () => 'I',
    db,
    room,
    journal,
    emit: () => {},
    instructions: 'ROOM NOTE',
    oocInstructions: 'OOC NOTE',
    onRebuild: (r) => {
      rebuilds.push(r);
      if (r.roomChanged) room.restore(db.loadRoom());
      journal.announce(r);
    },
    beforeRewind: () => {
      order.push(`checkpoint with ${db.allMessages('hicks').length} lines`);
      return opts.checkpoint?.() ?? true;
    },
    ...(opts.scribe?.(db, journal) ?? {}),
  });
  const note = (text: string) => () => void journal.note('hicks', { text }, 'agent');
  const ids = () => db.listNotes('hicks').map((x) => x.text).sort();
  const reply = () => db.allMessages('hicks').filter((m) => m.role === 'agent').at(-1)!;
  return { db, room, journal, relay, rebuilds, order, note, ids, reply };
}

const scenes = () => registry.list().map((s) => s.id);

describe('the scribe and takes', () => {
  it("swipe restores the take's scribe writes", async () => {
    const said = ['from take zero', 'from take one'];
    let runner!: ScribeRunner;
    const t = setup([{}, {}], {
      scribe: (db, journal) => {
        runner = new ScribeRunner({
          db,
          journal,
          selfName: 'Nix',
          selfPronoun: 'she',
          playerName: () => 'Hicks',
          roomLine: () => '[room]',
          standing: () => null,
          standingLine: () => null,
          setLight: () => ({ ok: true, text: 'applied' }),
          complete: async () => ({ text: JSON.stringify({ notes: [{ op: 'add', about: 'you', text: said.shift(), keys: [], pin: false }] }) }),
          log: () => {},
        });
        return {
          beforeTurn: () => runner.wait(),
          onTurnEnd: ({ player, ok, mode, reply }) => {
            if (ok && reply && mode !== 'ooc') runner.afterTurn(player, reply, mode === 'end' ? 'end' : 'turn');
          },
          onTakeReplaced: (id) => runner.takeReplaced(id),
        };
      },
    });
    await t.relay.send('hicks', 'hello');
    await runner.wait();
    const id = t.reply().id;
    expect(t.ids()).toEqual(['from take zero']);
    await t.relay.regenerate('hicks', id);
    await runner.wait();
    expect(t.ids()).toEqual(['from take one']);
    await t.relay.swipe('hicks', id, 0);
    expect(t.ids()).toEqual(['from take zero']);
    await t.relay.swipe('hicks', id, 1);
    expect(t.ids()).toEqual(['from take one']);
  });
});

describe('the relay tells the scribe', () => {
  it('keep going stops a scribe still reading that reply, and an answer after a regenerate collapses its takes (review I2, C1)', async () => {
    const replaced: string[] = [];
    const collapsed: string[] = [];
    const t = setup([{}, {}, {}, {}], { scribe: () => ({ onTakeReplaced: (id: string) => void replaced.push(id), onTakesCollapsed: (id: string, keep: number) => void collapsed.push(`${id}:${keep}`) }) });
    await t.relay.send('hicks', 'hello');
    const id = t.reply().id;
    await t.relay.continueReply('hicks', id);
    expect(replaced).toEqual([id]);
    await t.relay.regenerate('hicks', id);
    await t.relay.send('hicks', 'next');
    expect(collapsed).toEqual([`${id}:1`]);
  });
});

describe('the relay stamps and rebuilds', () => {
  it("a new reply's writes are stamped take 0", async () => {
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push({ act: () => t.note('mug')() });
    await t.relay.send('hicks', 'hello');
    const w = t.db.writes().find((x) => x.kind === 'note')!;
    expect(w).toMatchObject({ messageId: t.reply().id, take: 0 });
    expect(t.db.stamp().take).toBeNull(); // the reply is closed again
  });

  it("a regenerated take starts without the old take's note and scene", async () => {
    const [first, second] = scenes();
    let during: { notes: string[]; scene: string } | null = null;
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push(
      { act: () => (t.note('mug')(), t.room.setScene({ id: second }, 'agent')) },
      { act: () => ((during = { notes: t.ids(), scene: t.room.state.sceneId }), t.note('cup')()) },
    );
    await t.relay.send('hicks', 'hello');
    expect(t.room.state.sceneId).toBe(second);
    await t.relay.regenerate('hicks', t.reply().id);
    expect(during).toEqual({ notes: [], scene: first });
    expect(t.ids()).toEqual(['cup']);
    expect(t.room.state.sceneId).toBe(first);
  });

  it('a lead given in a take swiped away is gone, and back when swiped back (Review Focus 1)', async () => {
    const turns: Turn[] = [];
    const t = setup(turns);
    const give = () => void t.db.giveLead({ id: 'teo-debt', player: 'hicks', details: 'Teo owes 4k', messageId: t.relay.activeMessageId!, at: 1 });
    turns.push({ act: give }, {});
    await t.relay.send('hicks', 'tell me about your brother');
    const id = t.reply().id;
    expect(t.db.leadsGiven('hicks').map((l) => l.id)).toEqual(['teo-debt']);
    await t.relay.regenerate('hicks', id);
    expect(t.db.leadsGiven('hicks')).toEqual([]);
    await t.relay.swipe('hicks', id, 0);
    expect(t.db.leadsGiven('hicks').map((l) => l.id)).toEqual(['teo-debt']);
    await t.relay.swipe('hicks', id, 1);
    expect(t.db.leadsGiven('hicks')).toEqual([]);
  });

  it('standing moved in a take swiped away is gone, and back when swiped back; a rewind past it removes it (Review Focus 1)', async () => {
    const turns: Turn[] = [];
    const t = setup(turns);
    const start = { trust: 0, warmth: 0 };
    const move = () => void moveStanding(t.db, 'hicks', start, null, DEFAULT_SHARED_STANDING, { trust: 0, warmth: 2, reason: 'helped', at: 1, messageId: t.relay.activeMessageId!, take: 0 });
    const warmth = () => currentStanding(t.db, 'hicks', start, null, DEFAULT_SHARED_STANDING).values.warmth;
    turns.push({}, { act: move }, {});
    await t.relay.send('hicks', 'one');
    const firstReply = t.reply().id;
    await t.relay.send('hicks', 'I fixed your deck');
    const id = t.reply().id;
    expect(warmth()).toBe(2);
    await t.relay.regenerate('hicks', id);
    expect(warmth()).toBe(0);
    await t.relay.swipe('hicks', id, 0);
    expect(warmth()).toBe(2);
    await t.relay.rewind('hicks', firstReply);
    expect(warmth()).toBe(0);
    expect(t.db.getMeta('standing.hicks')).toBeNull();
  });

  it('one standing move per take: keep going is the same take; a regenerate is a new one (tool review, Important 1)', async () => {
    const turns: Turn[] = [];
    const t = setup(turns);
    const control = standingControl({ db: t.db, player: () => 'hicks', start: () => ({ trust: 0, warmth: 0 }), config: () => null, shared: () => DEFAULT_SHARED_STANDING });
    const results: unknown[] = [];
    const move = () => void results.push(control.move({ trust: 0, warmth: 1, reason: 'r' }, t.relay.activeMessageId!));
    turns.push({ act: move }, { act: move }, { act: move });
    await t.relay.send('hicks', 'hello');
    const id = t.reply().id;
    await t.relay.continueReply('hicks', id);
    expect(results[1]).toBe('already');
    await t.relay.regenerate('hicks', id);
    expect(results[2]).not.toBe('already');
    expect(currentStanding(t.db, 'hicks', { trust: 0, warmth: 0 }, null, DEFAULT_SHARED_STANDING).values.warmth).toBe(1);
  });

  it('storedStanding before a reply: what the write log had before it, so a regenerate is prompted from there (final review, Important 1)', async () => {
    const turns: Turn[] = [];
    const t = setup(turns);
    const control = standingControl({ db: t.db, player: () => 'hicks', start: () => ({ trust: 3, warmth: 0 }), config: () => null, shared: () => DEFAULT_SHARED_STANDING });
    const move = () => void control.move({ trust: 1, warmth: 0, reason: 'r' }, t.relay.activeMessageId!);
    turns.push({ act: move }, { act: move });
    await t.relay.send('hicks', 'one');
    const first = t.reply().id;
    await t.relay.send('hicks', 'two');
    const second = t.reply().id;
    expect(storedStanding(t.db, 'hicks', null)!.trust).toBe(5);
    expect(storedStanding(t.db, 'hicks', second)!.trust).toBe(4);
    expect(storedStanding(t.db, 'hicks', first)).toBeNull();
  });

  it('replacingReply names the reply a regenerate rewrites until its stream opens, then null (deferred minor: CONTACTS during a regenerate)', async () => {
    const turns: Turn[] = [];
    const t = setup(turns);
    const seen: (string | null)[] = [];
    turns.push({}, { early: true, act: () => seen.push(t.relay.replacingReply) }, { act: () => seen.push(t.relay.replacingReply) });
    await t.relay.send('hicks', 'one');
    const id = t.reply().id;
    expect(t.relay.replacingReply).toBeNull();
    await t.relay.regenerate('hicks', id);
    await t.relay.regenerate('hicks', id);
    expect(seen).toEqual([id, null]);
    expect(t.relay.replacingReply).toBeNull();
  });

  it("swiping back restores the take's writes", async () => {
    const [first, second] = scenes();
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push({ act: () => (t.note('mug')(), t.room.setScene({ id: second }, 'agent')) }, { act: () => t.note('cup')() });
    await t.relay.send('hicks', 'hello');
    const id = t.reply().id;
    await t.relay.regenerate('hicks', id);
    await t.relay.swipe('hicks', id, 0);
    expect(t.ids()).toEqual(['mug']);
    expect(t.room.state.sceneId).toBe(second);
    await t.relay.swipe('hicks', id, 1);
    expect(t.ids()).toEqual(['cup']);
    expect(t.room.state.sceneId).toBe(first);
  });

  it('keep going stamps the same take', async () => {
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push({}, {}, { act: () => t.note('more')() });
    await t.relay.send('hicks', 'hello');
    const id = t.reply().id;
    await t.relay.regenerate('hicks', id);
    await t.relay.continueReply('hicks', id);
    expect(t.db.writes().find((x) => x.kind === 'note')).toMatchObject({ messageId: id, take: 1 });
    await t.relay.swipe('hicks', id, 0);
    expect(t.ids()).toEqual([]);
    await t.relay.swipe('hicks', id, 1);
    expect(t.ids()).toEqual(['more']);
  });

  it("failed regenerate restores the old take's state", async () => {
    const [, second] = scenes();
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push({ act: () => (t.note('mug')(), t.room.setScene({ id: second }, 'agent')) }, { act: () => t.note('cup')(), fail: true });
    await t.relay.send('hicks', 'hello');
    const id = t.reply().id;
    const r = await t.relay.regenerate('hicks', id);
    expect(r.ok).toBe(false);
    expect(t.ids()).toEqual(['mug']);
    expect(t.room.state.sceneId).toBe(second);
    expect(t.db.getTakes('hicks', id)).toBeNull();
  });

  it("delete then restore brings a reply's writes back", async () => {
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push({ act: () => t.note('mug')() });
    await t.relay.send('hicks', 'hello');
    const line = t.reply();
    await t.relay.remove('hicks', line.id);
    expect(t.ids()).toEqual([]);
    await t.relay.restore('hicks', line);
    expect(t.ids()).toEqual(['mug']);
  });

  it('a journal panel edit is tied to the latest message', async () => {
    const t = setup([{}]);
    await t.relay.send('hicks', 'hello');
    t.journal.note('hicks', { text: 'by hand' }, 'user');
    expect(t.db.writes().at(-1)).toMatchObject({ messageId: t.reply().id, take: null });
  });

  it('rewind takes a checkpoint first, then restores', async () => {
    const [first, second] = scenes();
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push({}, { act: () => (t.note('mug')(), t.room.setScene({ id: second }, 'agent')) });
    await t.relay.send('hicks', 'one');
    const firstReply = t.reply().id;
    await t.relay.send('hicks', 'two');
    const second_ = t.reply().id;
    await t.relay.rewind('hicks', firstReply);
    expect(t.order).toEqual(['checkpoint with 4 lines']);
    expect(t.db.writes().some((w) => w.messageId === second_)).toBe(false);
    expect(t.rebuilds.at(-1)).toMatchObject({ roomChanged: true, notes: ['hicks'] });
    expect(t.ids()).toEqual([]);
    expect(t.room.state.sceneId).toBe(first);
  });
});

describe('the relay keeps takes straight (Task 4 review)', () => {
  it("answering a later take keeps that take's writes", async () => {
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push({ act: () => t.note('mug')() }, { act: () => t.note('cup')() }, {});
    await t.relay.send('hicks', 'hello');
    await t.relay.regenerate('hicks', t.reply().id);
    await t.relay.send('hicks', 'and then?');
    await t.relay.remove('hicks', t.reply().id); // any rebuild
    expect(t.ids()).toEqual(['cup']);
  });

  it("a failed take's writes don't come back in the next regenerate", async () => {
    let during: string[] | null = null;
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push({ act: () => t.note('mug')() }, { act: () => t.note('cup')(), fail: true }, { act: () => (during = t.ids()) });
    await t.relay.send('hicks', 'hello');
    const id = t.reply().id;
    await t.relay.regenerate('hicks', id);
    await t.relay.regenerate('hicks', id);
    expect(during).toEqual([]);
    expect(t.ids()).toEqual([]);
  });

  it("a regenerate after answering a later take starts clean", async () => {
    let during: string[] | null = null;
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push({ act: () => t.note('mug')() }, { act: () => t.note('cup')() }, {}, { act: () => (during = t.ids()) });
    await t.relay.send('hicks', 'hello');
    const first = t.reply().id;
    await t.relay.regenerate('hicks', first);
    await t.relay.send('hicks', 'and then?');
    await t.relay.rewind('hicks', first);
    await t.relay.regenerate('hicks', first);
    expect(during).toEqual([]);
  });

  it("a greeting cut off before a word takes its writes with it", async () => {
    const [first, second] = scenes();
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push({ act: () => t.room.setScene({ id: second }, 'agent'), fail: true });
    await t.relay.greet('hicks');
    expect(t.db.allMessages('hicks').filter((m) => m.role === 'agent')).toEqual([]);
    expect(t.room.state.sceneId).toBe(first);
  });

  it('a failed keep going takes back what it wrote (final review I4)', async () => {
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push({ act: () => t.note('mug')() }, { act: () => t.note('cup')(), fail: true });
    await t.relay.send('hicks', 'hello');
    const r = await t.relay.continueReply('hicks', t.reply().id);
    expect(r.ok).toBe(false);
    expect(t.ids()).toEqual(['mug']);
    // Gone from the log too: no later rebuild (a swipe, a delete and its undo) can bring it back.
    expect(t.db.writes().filter((w) => w.kind === 'note').map((w) => JSON.parse(w.value!).text)).toEqual(['mug']);
  });

  it('a take cut off but kept keeps its writes, and swipes like any take', async () => {
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push({ act: () => t.note('mug')() }, { act: () => t.note('cup')(), text: 'half a th', cut: true });
    await t.relay.send('hicks', 'hello');
    const id = t.reply().id;
    await t.relay.regenerate('hicks', id);
    expect(t.db.getTakes('hicks', id)).toMatchObject({ index: 1 });
    expect(t.ids()).toEqual(['cup']);
    await t.relay.swipe('hicks', id, 0);
    expect(t.ids()).toEqual(['mug']);
    await t.relay.swipe('hicks', id, 1);
    expect(t.ids()).toEqual(['cup']);
  });

  it('a hand edit made while an unanswered greeting waited outlives the greeting (deferred minor)', async () => {
    const turns: Turn[] = [];
    const t = setup(turns);
    turns.push({ early: true, act: () => void t.journal.note('hicks', { text: 'by hand' }, 'user') }, {});
    await t.relay.greet('hicks'); // a first meeting: due at once
    expect(t.db.allMessages('hicks')).toEqual([]); // the unanswered greet line is gone
    await t.relay.send('hicks', 'hello');
    await t.relay.remove('hicks', t.reply().id); // any rebuild
    expect(t.ids()).toEqual(['by hand']);
  });

  it('a rewind whose checkpoint fails deletes nothing', async () => {
    const t = setup([{ act: () => {} }, { act: () => {} }], { checkpoint: () => false });
    await t.relay.send('hicks', 'one');
    const firstReply = t.reply().id;
    await t.relay.send('hicks', 'two');
    const r = await t.relay.rewind('hicks', firstReply);
    expect(r).toEqual({ ok: false, error: 'checkpoint' });
    expect(t.db.allMessages('hicks')).toHaveLength(4);
  });

  it('a rewind to the latest line takes no checkpoint', async () => {
    const t = setup([{}]);
    await t.relay.send('hicks', 'one');
    expect(await t.relay.rewind('hicks', t.reply().id)).toMatchObject({ ok: true });
    expect(t.order).toEqual([]);
  });
});
