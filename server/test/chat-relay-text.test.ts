import type { Photo } from '../../shared/photos';
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SceneRegistry } from '../src/scenes';
import { Room } from '../src/room-state';
import { generateScenes } from '../../tools/gen-placeholders';
import { openDb, type Db } from '../src/db';
import { ChatRelay, type ChatRelayDeps } from '../src/chat-relay';
import { fakePlayers } from './fixtures/players';
import { Journal } from '../src/journal';
import { LIGHTS_LINE, SCENE_GREET_INSTRUCTIONS } from '../src/instructions';
import { writeSummary } from '../src/summary';
import type { Backend, TurnRequest } from '../src/backend';
import type { ChatMessage, ServerEvent } from '../../shared/types';

let tmpDir: string;
let registry: SceneRegistry;
const dbs: Db[] = [];

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-relay-text-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
afterEach(() => {
  while (dbs.length > 0) dbs.pop()!.close();
});

/** A backend that answers each turn with the next scripted reply and records what it was asked. */
function scripted(replies: string[], hold?: Promise<void>): { backend: Backend; reqs: TurnRequest[] } {
  const reqs: TurnRequest[] = [];
  const backend: Backend = {
    async *streamTurn(req) {
      reqs.push(req);
      yield { event: 'stream.open', data: {} };
      if (hold) await hold;
      yield { event: 'assistant.delta', data: { delta: replies.shift() ?? 'ok' } };
      yield { event: 'run.completed', data: {} };
    },
    probe: async () => ({ status: 'ok' }) as never,
    currentModel: async () => null,
  };
  return { backend, reqs };
}

function relayWith(replies: string[], over: Partial<ChatRelayDeps> = {}, hold?: Promise<void>) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  dbs.push(db);
  const room = new Room(registry);
  const journal = new Journal(db);
  const roomEvents: ServerEvent[] = [];
  const textEvents: ServerEvent[] = [];
  const { backend, reqs } = scripted(replies, hold);
  let clock = 1000;
  const relay = new ChatRelay({
    players: fakePlayers(),
    backend,
    db,
    room,
    journal,
    clockNow: () => clock,
    onClock: (m: number) => (clock = Math.max(clock, m)),
    self: () => ({ name: 'Nix', pronoun: 'she' }),
    identity: () => 'I AM NIX',
    emit: (e) => roomEvents.push(e),
    emitText: (e: ServerEvent) => textEvents.push(e),
    ...over,
  } as ChatRelayDeps);
  return { relay, db, reqs, roomEvents, textEvents, clock: () => clock };
}

const texts = (db: Db) => db.recentMessages('hicks', 200, 'text');
const row = (id: string, o: Partial<ChatMessage>): ChatMessage => ({ id, role: 'user', text: id, toolLines: [], ts: Number(id.replace(/\D/g, '')) || 1, status: 'ok', ...o });

describe('the text turn (deck spec §4)', () => {
  it('sendText stores a text row and a bubble reply', async () => {
    const { relay, db } = relayWith(['till four\n*shrugs*\nroof. 4:15']);
    expect(await relay.sendText('hicks', 'you on shift?', 'the Intake')).toMatchObject({ ok: true });
    const rows = texts(db);
    expect(rows.map((m) => [m.role, m.mode, m.text])).toEqual([
      ['user', 'text', 'you on shift?'],
      ['agent', 'text', 'till four\nroof. 4:15'],
    ]);
  });

  it('a text turn sends the texting rules and where she is, no tools, no room lines', async () => {
    const { relay, reqs } = relayWith(['ok']);
    await relay.sendText('hicks', 'hey', 'the Intake');
    const [req] = reqs;
    expect(req.noTools).toBe(true);
    const system = req.messages[0].content;
    expect(system).toContain('I AM NIX');
    expect(system).toContain('# Texting');
    const last = req.messages.at(-1)!.content;
    expect(last).toContain("You're at the Intake");
    expect(last).toContain('hey');
    expect(JSON.stringify(req.messages)).not.toContain(LIGHTS_LINE);
    expect(JSON.stringify(req.messages)).not.toContain('[room:');
  });

  it("a text turn's history is texts only, with the summary", async () => {
    const { relay, db, reqs } = relayWith(['ok']);
    db.insertMessage('hicks', row('s1', { text: 'in the room' }));
    db.insertMessage('hicks', row('t2', { mode: 'text', text: 'earlier text' }));
    db.insertMessage('hicks', row('t3', { mode: 'text', role: 'agent', text: 'earlier reply' }));
    writeSummary(db, 'hicks', { text: 'They argued at the Tilt.', through: 's1' });
    await relay.sendText('hicks', 'sorry', 'home');
    const sent = JSON.stringify(reqs[0].messages);
    expect(sent).not.toContain('in the room');
    expect(sent).toContain('earlier text');
    expect(sent).toContain('earlier reply');
    expect(sent).toContain('They argued at the Tilt.');
  });

  it('a text turn carries her journal: pinned notes, and notes your recent texts bring up (Venn forgotten)', async () => {
    const { relay, db, reqs } = relayWith(['ok']);
    const journal = new Journal(db);
    journal.note('hicks', { text: 'The page is behind a loose brick.', pinned: true }, 'agent');
    journal.note('hicks', { text: 'Venn is SDG, he wants the page.', keys: ['Venn'] }, 'agent');
    journal.note('hicks', { text: 'Otto owes the Low Roller.', keys: ['Otto'] }, 'agent');
    db.insertMessage('hicks', row('t2', { mode: 'text', text: 'any news from venn?' }));
    db.insertMessage('hicks', row('t3', { mode: 'text', role: 'agent', text: 'who' }));
    await relay.sendText('hicks', 'the agent. the dead blocks', 'home');
    const last = reqs[0].messages.at(-1)!.content;
    expect(last).toContain('The page is behind a loose brick.');
    expect(last).toContain('Venn is SDG, he wants the page.');
    expect(last).not.toContain('Otto owes');
  });

  it('a text carries her plan: what she texted earlier holds (deck spec §4; mid review M1)', async () => {
    const { relay, reqs } = relayWith(['ok'], { planNow: () => ({ going: null, meet: { place: 'the Rooftop', time: '04:15' } }) });
    await relay.sendText('hicks', 'still on?', 'the Intake');
    expect(reqs[0].messages.at(-1)!.content).toContain("[your plan: you're meeting hicks at the Rooftop at 04:15]");
  });

  it('a text costs 2 minutes', async () => {
    const { relay, db } = relayWith(['ok']);
    await relay.sendText('hicks', 'hey', 'home');
    expect(texts(db)[0].clock).toBe(1002);
  });

  it('an actions-only reply fails the text, leaving no empty bubble', async () => {
    const { relay, db } = relayWith(['*sighs*']);
    expect(await relay.sendText('hicks', 'hey', 'home')).toMatchObject({ ok: false });
    const rows = texts(db);
    expect(rows.map((m) => [m.role, m.status])).toEqual([['user', 'failed']]);
  });

  it('retry re-runs a failed text', async () => {
    const { relay, db } = relayWith(['*sighs*', 'fine']);
    await relay.sendText('hicks', 'hey', 'home');
    const failed = texts(db)[0];
    expect(await relay.retry('hicks', failed.id, 'home')).toMatchObject({ ok: true });
    expect(texts(db).map((m) => [m.role, m.status, m.text])).toEqual([
      ['user', 'ok', 'hey'],
      ['agent', 'ok', 'fine'],
    ]);
  });

  it('text events go to emitText, not to the room', async () => {
    const { relay, roomEvents, textEvents } = relayWith(['ok']);
    await relay.sendText('hicks', 'hey', 'home');
    expect(textEvents.some((e) => e.type === 'message' && e.message.mode === 'text')).toBe(true);
    expect(roomEvents.some((e) => e.type === 'message' || e.type === 'nix_delta')).toBe(false);
  });

  it('too-long, empty and busy are refused', async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    const { relay } = relayWith(['ok', 'ok'], {}, hold);
    expect(await relay.sendText('hicks', 'x'.repeat(501), 'home')).toEqual({ ok: false, error: 'too-long' });
    expect(await relay.sendText('hicks', '  ', 'home')).toEqual({ ok: false, error: 'empty' });
    const first = relay.sendText('hicks', 'one', 'home');
    await new Promise((r) => setTimeout(r, 10));
    expect(await relay.sendText('hicks', 'two', 'home')).toEqual({ ok: false, error: 'busy' });
    release();
    await first;
  });
});

describe('texts in a scene (deck spec §3)', () => {
  it('a scene turn gets the [texts] block', async () => {
    const { relay, db, reqs } = relayWith(['ok']);
    db.insertMessage('hicks', row('t1', { mode: 'text', text: 'roof?', clock: 990 }));
    db.insertMessage('hicks', row('t2', { mode: 'text', role: 'agent', text: 'yeah\n4:15', clock: 990 }));
    await relay.send('hicks', 'here I am');
    expect(reqs[0].messages.at(-1)!.content).toContain('[texts, earlier: hicks: roof? · Nix: yeah · Nix: 4:15]');
    expect(reqs[0].noTools).toBeFalsy();
  });

  it('the room message controls ignore text rows: her scene reply can still be regenerated after a text', async () => {
    const { relay, db } = relayWith(['in person', 'texted back', 'in person, again']);
    await relay.send('hicks', 'hello');
    await relay.sendText('hicks', 'later', 'home');
    const sceneReply = db.recentMessages('hicks', 200, 'scene').at(-1)!;
    expect(await relay.regenerate('hicks', sceneReply.id)).toMatchObject({ ok: true });
    expect(db.getMessage('hicks', sceneReply.id)?.text).toBe('in person, again');
    expect(texts(db).map((m) => m.text)).toEqual(['later', 'texted back']);
  });
});

describe('deck minors (final message 2026-10-23)', () => {
  it("a RETRY of a failed text says where she is now; the room's retry can't run a text (M2, #10)", async () => {
    const { relay, db, reqs } = relayWith(['*sighs*', 'fine']);
    await relay.sendText('hicks', 'hey', 'the Intake');
    const failed = texts(db)[0];
    expect(await relay.retry('hicks', failed.id)).toEqual({ ok: false, error: 'text' });
    expect(await relay.retry('hicks', failed.id, 'the Tilt')).toMatchObject({ ok: true });
    expect(reqs.at(-1)!.messages.at(-1)!.content).toContain("You're at the Tilt");
  });

  it('a rewind to the newest scene line cuts the texts after it (M5)', async () => {
    const { relay, db } = relayWith(['in person', 'texted back']);
    await relay.send('hicks', 'hello');
    await relay.sendText('hicks', 'later', 'home');
    const sceneReply = db.recentMessages('hicks', 200, 'scene').at(-1)!;
    expect(await relay.rewind('hicks', sceneReply.id)).toMatchObject({ ok: true });
    expect(texts(db)).toEqual([]);
  });

  it("a text reply isn't the opening scene played: her first greeting still opens it (#7)", async () => {
    const { relay, db, reqs } = relayWith(['texted', 'greeting']);
    db.insertMessage('hicks', { id: 'scene-1', role: 'user', mode: 'scene', text: 'Rain has shut the Ribbon early.', scene: { title: 'After closing', source: 'generated' }, toolLines: [], ts: 1, status: 'ok' });
    await relay.sendText('hicks', 'on my way', 'home');
    await relay.greet('hicks');
    expect(reqs.at(-1)!.messages.at(-1)!.content).toContain(SCENE_GREET_INSTRUCTIONS);
  });

  it('a text whose stream yields nothing is NOT DELIVERED, with RETRY (#8)', async () => {
    const { db, relay } = relayWith([], {
      backend: {
        async *streamTurn() {},
        probe: async () => ({ status: 'ok' }) as never,
        currentModel: async () => null,
      },
    });
    expect(await relay.sendText('hicks', 'hey', 'home')).toMatchObject({ ok: false });
    expect(texts(db).map((m) => [m.role, m.status])).toEqual([['user', 'failed']]);
  });
});

describe('a promised text (promised texts spec §5)', () => {
  it('the hidden row and her reply are stamped at the due minute; the promise goes under her reply', async () => {
    const { relay, db, reqs } = relayWith(['home.\nfinally']);
    db.withStamp({ messageId: 'earlier', take: 0 }, () => db.setMeta('promise.hicks', JSON.stringify({ when: { place: 'karasu/nix-home' }, about: "that she's home", from: 'earlier', since: 900 })));
    expect(await relay.sendPromised('hicks', { about: "that she's home", due: 960, where: "you're at Nix's flat now", place: "Nix's flat", from: 'earlier' })).toMatchObject({ ok: true });
    const rows = texts(db);
    expect(rows.map((m) => [m.role, m.promised ?? false, m.clock, m.text])).toEqual([
      ['user', true, 960, "[you told hicks you'd text that she's home — you're at Nix's flat now. Text them now.]"],
      ['agent', false, 960, 'home.\nfinally'],
    ]);
    expect(reqs[0].messages.at(-1)!.content).toContain("[you told hicks you'd text that she's home — you're at Nix's flat now. Text them now.]");
    expect(reqs[0].noTools).toBe(true);
    expect(db.getMeta('promise.hicks')).toBeNull();
    expect(db.writes().filter((w) => w.key === 'promise.hicks').at(-1)?.messageId).toBe(rows[1].id);
  });

  it('a failed promised text keeps the promise', async () => {
    const { relay, db } = relayWith(['*sighs*']);
    const kept = JSON.stringify({ when: { at: 960 }, about: 'x', from: 'p1', since: 900 });
    db.setMeta('promise.hicks', kept);
    expect(await relay.sendPromised('hicks', { about: 'x', due: 960, where: "it's 16:00", place: 'home', from: 'p1' })).toMatchObject({ ok: false });
    expect(db.getMeta('promise.hicks')).toBe(kept);
  });

  it('a promise cancelled or replaced while her text waited: nothing is sent, the new one stays (mid review I1)', async () => {
    const { relay, db, reqs } = relayWith(['home.']);
    db.setMeta('promise.hicks', JSON.stringify({ when: { at: 2000 }, about: 'later', from: 'newer', since: 1990 }));
    expect(await relay.sendPromised('hicks', { about: "that she's home", due: 960, where: "it's 16:00", place: 'home', from: 'older' })).toEqual({ ok: false, error: 'stale' });
    expect(reqs).toHaveLength(0);
    expect(texts(db)).toEqual([]);
    expect(JSON.parse(db.getMeta('promise.hicks')!).from).toBe('newer');
  });

  it("she already texted since it came due (you asked 'home yet?'): nothing more, and the promise is spent (mid review I1)", async () => {
    const { relay, db, reqs } = relayWith(['again']);
    db.setMeta('promise.hicks', JSON.stringify({ when: { at: 960 }, about: "that she's home", from: 'p1', since: 900 }));
    db.insertMessage('hicks', row('u9', { mode: 'text', text: 'home yet?', clock: 970 }));
    db.insertMessage('hicks', row('a9', { mode: 'text', role: 'agent', text: 'yeah, just in', clock: 970, replyTo: 'u9' }));
    expect(await relay.sendPromised('hicks', { about: "that she's home", due: 960, where: "it's 16:00", place: 'home', from: 'p1' })).toEqual({ ok: false, error: 'already' });
    expect(reqs).toHaveLength(0);
    expect(db.getMeta('promise.hicks')).toBeNull();
  });
});


describe('message controls on texts (deck controls spec §2)', () => {
  it("REGEN of her latest text writes a new take in bubbles; the scene's latest reply is untouched", async () => {
    const { relay, db } = relayWith(['in person', 'first\n*shrugs*', 'second\nand more']);
    await relay.send('hicks', 'hello');
    await relay.sendText('hicks', 'later', 'home');
    const reply = texts(db).at(-1)!;
    expect(await relay.regenerate('hicks', reply.id)).toMatchObject({ ok: true });
    const after = db.getMessage('hicks', reply.id)!;
    expect(after.text).toBe('second\nand more');
    expect(after.takes).toEqual({ index: 1, count: 2 });
    expect(after.clock).toBe(reply.clock);
    expect(db.recentMessages('hicks', 200, 'scene').at(-1)!.text).toBe('in person');
  });

  it('REGEN is refused for an older text', async () => {
    const { relay, db } = relayWith(['one', 'two', 'x']);
    await relay.sendText('hicks', 'a', 'home');
    await relay.sendText('hicks', 'b', 'home');
    expect(await relay.regenerate('hicks', texts(db)[1].id)).toEqual({ ok: false, error: 'not-latest' });
  });

  it('swipe between text takes', async () => {
    const { relay, db } = relayWith(['one', 'two']);
    await relay.sendText('hicks', 'a', 'home');
    const reply = texts(db).at(-1)!;
    await relay.regenerate('hicks', reply.id);
    expect(await relay.swipe('hicks', reply.id, 0)).toMatchObject({ ok: true });
    expect(db.getMessage('hicks', reply.id)!.text).toBe('one');
  });

  it('deleteTexts removes that text and later texts, keeps a later scene row, drops a plan its reply wrote', async () => {
    const { relay, db } = relayWith(['t1', 't2', 'scene reply']);
    await relay.sendText('hicks', 'first', 'home');
    await relay.sendText('hicks', 'second', 'home');
    const second = texts(db)[2];
    db.withStamp({ messageId: texts(db)[3].id, take: 0 }, () => db.setMeta('plan.hicks', JSON.stringify({ going: null, meet: { place: 'x', at: 5000 }, from: texts(db)[3].id })));
    await relay.send('hicks', 'in the room');
    const r = await relay.deleteTexts('hicks', second.id);
    expect(r).toMatchObject({ ok: true });
    expect(texts(db).map((m) => m.text)).toEqual(['first', 't1']);
    expect(db.recentMessages('hicks', 200, 'scene').map((m) => m.text)).toEqual(['in the room', 'scene reply']);
    expect(db.getMeta('plan.hicks')).toBeNull();
  });

  it('deleteTexts refuses a scene row', async () => {
    const { relay, db } = relayWith(['x']);
    await relay.send('hicks', 'hello');
    expect(await relay.deleteTexts('hicks', db.recentMessages('hicks', 5, 'scene')[0].id)).toEqual({ ok: false, error: 'not-text' });
  });

  it('editText edits your latest text and she replies again, as a new take', async () => {
    const { relay, db, reqs } = relayWith(['one', 'two']);
    await relay.sendText('hicks', 'helo', 'home');
    const mine = texts(db)[0];
    expect(await relay.editText('hicks', mine.id, 'hello')).toMatchObject({ ok: true });
    expect(texts(db).map((m) => m.text)).toEqual(['hello', 'two']);
    expect(texts(db)[1].takes).toEqual({ index: 1, count: 2 });
    expect(reqs.at(-1)!.messages.at(-1)!.content).toContain('hello');
  });

  it('editText is refused on an older text', async () => {
    const { relay, db } = relayWith(['one', 'two']);
    await relay.sendText('hicks', 'a', 'home');
    await relay.sendText('hicks', 'b', 'home');
    expect(await relay.editText('hicks', texts(db)[0].id, 'z')).toEqual({ ok: false, error: 'not-latest' });
  });
});

describe('controls on promised texts and failures (deck controls mid review)', () => {
  const failing = (good: string[]): Backend => {
    let n = 0;
    return {
      async *streamTurn() {
        n++;
        yield { event: 'stream.open', data: {} };
        if (n <= good.length) {
          yield { event: 'assistant.delta', data: { delta: good[n - 1] } };
          yield { event: 'run.completed', data: {} };
        } else {
          yield { event: 'assistant.delta', data: { delta: 'half *sigh*' } };
          yield { event: 'run.failed', data: {} };
        }
      },
      probe: async () => ({ status: 'ok' }) as never,
      currentModel: async () => null,
    };
  };
  const promise = (db: Db) => db.setMeta('promise.hicks', JSON.stringify({ when: { at: 960 }, about: 'x', from: 'p1', since: 900 }));

  it('a REGEN of her promised text keeps the promise spent (I1)', async () => {
    const { relay, db } = relayWith(['home.', 'home, finally.']);
    promise(db);
    await relay.sendPromised('hicks', { about: 'x', due: 960, where: "it's 16:00", place: 'home', from: 'p1' });
    const reply = texts(db).at(-1)!;
    expect(await relay.regenerate('hicks', reply.id)).toMatchObject({ ok: true });
    expect(db.getMeta('promise.hicks')).toBeNull();
    expect(await relay.swipe('hicks', reply.id, 0)).toMatchObject({ ok: true });
    expect(db.getMeta('promise.hicks')).toBeNull();
  });

  it('DELETE of her promised text takes its hidden line with it (I2)', async () => {
    const { relay, db } = relayWith(['home.']);
    promise(db);
    await relay.sendPromised('hicks', { about: 'x', due: 960, where: "it's 16:00", place: 'home', from: 'p1' });
    expect(await relay.deleteTexts('hicks', texts(db).at(-1)!.id)).toMatchObject({ ok: true });
    expect(texts(db)).toEqual([]);
  });

  it('a REGEN cut off mid-stream keeps her old text, never a half one (I3)', async () => {
    const { relay, db } = relayWith([], { backend: failing(['first']) });
    await relay.sendText('hicks', 'hey', 'home');
    const reply = texts(db).at(-1)!;
    await relay.regenerate('hicks', reply.id);
    expect(db.getMessage('hicks', reply.id)).toMatchObject({ text: 'first', status: 'ok' });
    expect(db.getMessage('hicks', reply.id)!.takes ?? null).toBeNull();
  });

  it('an EDIT whose new reply fails puts your text back (I4)', async () => {
    const { relay, db } = relayWith([], { backend: failing(['first']) });
    await relay.sendText('hicks', 'helo', 'home');
    const mine = texts(db)[0];
    expect(await relay.editText('hicks', mine.id, 'hello')).toMatchObject({ ok: false });
    expect(db.getMessage('hicks', mine.id)!.text).toBe('helo');
    expect(texts(db)[1].text).toBe('first');
  });

  it('a rewind or a DELETE of her promised text spends that promise for good (minor 6)', async () => {
    for (const how of ['rewind', 'delete'] as const) {
      const { relay, db } = relayWith(['in person', 'home.']);
      await relay.send('hicks', 'bye');
      const scene = db.recentMessages('hicks', 10, 'scene').at(-1)!;
      db.withStamp({ messageId: scene.id, take: 0 }, () => promise(db));
      await relay.sendPromised('hicks', { about: 'x', due: 960, where: "it's 16:00", place: 'home', from: 'p1' });
      if (how === 'rewind') await relay.rewind('hicks', scene.id);
      else await relay.deleteTexts('hicks', texts(db).at(-1)!.id);
      expect(JSON.parse(db.getMeta('promise.hicks')!).from).toBe('p1');
      expect(db.getMeta('promisespent.hicks')).toBe('p1');
    }
  });

  it('REGEN and EDIT say where she is now (final review I2)', async () => {
    const { relay, db, reqs } = relayWith(['one', 'two', 'three']);
    await relay.sendText('hicks', 'hey', 'her apartment');
    await relay.regenerate('hicks', texts(db).at(-1)!.id, 'the Tilt');
    expect(reqs.at(-1)!.messages.at(-1)!.content).toContain("You're at the Tilt");
    await relay.editText('hicks', texts(db)[0].id, 'hey you', 'Hae\'s Noodles');
    expect(reqs.at(-1)!.messages.at(-1)!.content).toContain("You're at Hae's Noodles");
  });
});


describe('photos by text (photos spec §3, §4)', () => {
  const roof: Photo = { id: 'roof-cranes', file: '/x/roof-cranes.webp', caption: 'selfie on the roof, cranes behind me' };
  const desk: Photo = { id: 'desk', file: '/x/desk.webp', caption: 'the desk at 2am' };
  const pool = [roof, desk];
  const photoCaption = (id: string) => pool.find((p) => p.id === id)?.caption ?? null;

  it('a text turn offers the photos that fit, and none when nothing fits', async () => {
    const { relay, reqs } = relayWith(['ok', 'ok'], { photosNow: () => [roof], photoCaption });
    await relay.sendText('hicks', 'send a pic', 'the rooftop');
    expect(reqs[0].messages.at(-1)!.content).toContain('[photos you could send: roof-cranes "selfie on the roof, cranes behind me"');
    const none = relayWith(['ok'], { photosNow: () => [], photoCaption });
    await none.relay.sendText('hicks', 'send a pic', 'the rooftop');
    expect(none.reqs[0].messages.at(-1)!.content).not.toContain('[photos you could send');
  });

  it('her [photo: id] is kept as one bubble; an id not offered is dropped and the words stay', async () => {
    const { relay, db } = relayWith(['here\n[Photo: roof-cranes]', 'and\n[photo: desk]'], { photosNow: () => [roof], photoCaption });
    await relay.sendText('hicks', 'pic?', 'the rooftop');
    expect(texts(db).at(-1)!.text).toBe('here\n[photo: roof-cranes]');
    await relay.sendText('hicks', 'another?', 'the rooftop');
    expect(texts(db).at(-1)!.text).toBe('and');
  });

  it('a reply that is only an unoffered photo is NOT DELIVERED', async () => {
    const { relay, db } = relayWith(['[photo: desk]'], { photosNow: () => [roof], photoCaption });
    await relay.sendText('hicks', 'pic?', 'the rooftop');
    const rows = texts(db);
    expect(rows.find((m) => m.role === 'user')!.status).toBe('failed');
    expect(rows.some((m) => m.role === 'agent' && m.status === 'ok')).toBe(false);
  });

  it('the model reads (sent a photo: caption) in text history, never the marker; a removed photo reads (sent a photo)', async () => {
    const { relay, db, reqs } = relayWith(['ok'], { photosNow: () => [], photoCaption });
    db.insertMessage('hicks', row('t2', { mode: 'text', text: 'pic?' }));
    db.insertMessage('hicks', row('t3', { mode: 'text', role: 'agent', text: 'here\n[photo: roof-cranes]' }));
    db.insertMessage('hicks', row('t4', { mode: 'text', role: 'agent', text: '[photo: gone-one]' }));
    await relay.sendText('hicks', 'nice', 'home');
    const sent = JSON.stringify(reqs[0].messages);
    expect(sent).toContain('(sent a photo: selfie on the roof, cranes behind me)');
    expect(sent).toContain('(sent a photo)');
    expect(sent).not.toContain('[photo:');
    expect(texts(db).find((m) => m.id === 't3')!.text).toBe('here\n[photo: roof-cranes]');
  });

  it('a scene turn reads captions in the [texts] block', async () => {
    const { relay, db, reqs } = relayWith(['ok'], { photoCaption });
    db.insertMessage('hicks', row('t2', { mode: 'text', role: 'agent', text: '[photo: desk]', clock: 990 }));
    await relay.send('hicks', 'hey');
    const sent = JSON.stringify(reqs[0].messages);
    expect(sent).toContain('Nix: (sent a photo: the desk at 2am)');
    expect(sent).not.toContain('[photo:');
  });

  it('a promised text is offered the photos for when it is stamped, not for now (mid review I2)', async () => {
    const asked: (number | null)[] = [];
    const { relay, db } = relayWith(['home.'], { photosNow: (clock) => (asked.push(clock), []), photoCaption });
    db.setMeta('promise.hicks', JSON.stringify({ when: { at: 960 }, about: "that she's home", from: 'p1', since: 900 }));
    await relay.sendPromised('hicks', { about: "that she's home", due: 960, where: "it's 16:00", place: 'home', from: 'p1' });
    expect(asked).toEqual([960]);
  });

  it('her copying the caption form is not a photo: the line goes (mid review I3)', async () => {
    const { relay, db } = relayWith(['look\n(sent a photo: selfie on the roof)'], { photosNow: () => [roof], photoCaption });
    await relay.sendText('hicks', 'pic?', 'the rooftop');
    expect(texts(db).at(-1)!.text).toBe('look');
  });

  it('REGEN re-reads what fits now', async () => {
    let fits: Photo[] = [roof];
    const { relay, db, reqs } = relayWith(['one', 'two'], { photosNow: () => fits, photoCaption });
    await relay.sendText('hicks', 'pic?', 'the rooftop');
    fits = [desk];
    await relay.regenerate('hicks', texts(db).at(-1)!.id);
    const last = reqs[1].messages.at(-1)!.content;
    expect(last).toContain('desk "the desk at 2am"');
    expect(last).not.toContain('roof-cranes');
  });
});
