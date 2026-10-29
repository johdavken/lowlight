/** Message controls on the relay: regenerate, swipe, keep going, edit, delete, restore, rewind. */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { ServerResponse } from 'node:http';
import { ChatRelay } from '../src/chat-relay';
import { fakePlayers } from './fixtures/players';
import { openDb, type Db } from '../src/db';
import { CONTINUE_INSTRUCTION } from '../src/history';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import { generateScenes } from '../../tools/gen-placeholders';
import type { ChatMessage, ServerEvent } from '../../shared/types';
import { chunkFrame, doneFrame, startSseResponse, startStubChat, type StubChat, type StubRequest } from './fixtures/stub-chat';
import { wireBackend } from './fixtures/wire-backend';
import { tempDir } from './fixtures/temp-dir';

let registry: SceneRegistry;
beforeAll(async () => {
  const dir = tempDir('nix-controls-');
  await generateScenes(dir);
  registry = (await SceneRegistry.load(dir)).registry;
});
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

type Script = (req: StubRequest, res: ServerResponse, n: number) => void;
const ok = (text: string): Script => (_req, res) => {
  startSseResponse(res);
  res.write(chunkFrame(text, 'stop'));
  res.write(doneFrame());
  res.end();
};
/** A provider's real failure shape: an error finish (with any partial text before it), then [DONE]. */
const fails = (partial: string): Script => (_req, res) => {
  startSseResponse(res);
  if (partial) res.write(chunkFrame(partial));
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'error' }], error: { message: 'provider error' } })}\n\n`);
  res.write(doneFrame());
  res.end();
};
const dies = (partial: string): Script => (_req, res) => {
  startSseResponse(res);
  if (partial) res.write(chunkFrame(partial));
  // Let the partial reach the client before the connection drops.
  setTimeout(() => res.destroy(), 30);
};

/** A relay whose backend answers each turn with the next script (default: "take N"). */
async function setup(scripts: Script[] = []) {
  let n = 0;
  const stub: StubChat = await startStubChat([
    {
      match: (req) => req.url === '/v1/chat/completions',
      respond: (req, res) => {
        n++;
        (scripts[n - 1] ?? ok(`take ${n}`))(req, res, n);
      },
    },
  ]);
  const db: Db = openDb(':memory:', { defaultPlayer: 'hicks' });
  const events: ServerEvent[] = [];
  const relay = new ChatRelay({ players: fakePlayers(), backend: wireBackend(stub.url), db, room: new Room(registry), emit: (e) => events.push(e), streamIdleMs: 2000 });
  cleanup.push(() => stub.close(), () => db.close());
  const bodies = () => stub.requests.filter((r) => r.url === '/v1/chat/completions').map((r) => (r.bodyJson as { messages: { role: string; content: string }[] }).messages);
  const last = (): ChatMessage => db.allMessages('hicks').at(-1)!;
  return { relay, db, events, bodies, last };
}

describe('regenerate and swipe', () => {
  it('regenerate adds a take and shows it', async () => {
    const { relay, last } = await setup();
    await relay.send('hicks', 'hello');
    const reply = last();
    expect(await relay.regenerate('hicks', reply.id)).toMatchObject({ ok: true });
    expect(last()).toMatchObject({ id: reply.id, text: 'take 2', status: 'ok', takes: { index: 1, count: 2 } });
  });

  it('the take on screen is what she sees next; sending collapses the takes', async () => {
    const { relay, db, bodies, last } = await setup();
    await relay.send('hicks', 'hello');
    const reply = last();
    await relay.regenerate('hicks', reply.id);
    expect(await relay.swipe('hicks', reply.id, 0)).toMatchObject({ ok: true });
    expect(db.getMessage('hicks', reply.id)!.text).toBe('take 1');
    await relay.send('hicks', 'and then?');
    const history = bodies()[2].slice(1, -1);
    expect(history).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'take 1' },
    ]);
    expect(db.getMessage('hicks', reply.id)!.takes).toBeUndefined();
    expect(db.getMessage('hicks', reply.id)!.text).toBe('take 1');
  });

  it('a regenerate sends the history before her reply, not the reply itself', async () => {
    const { relay, bodies, last } = await setup();
    await relay.send('hicks', 'hello');
    await relay.regenerate('hicks', last().id);
    const second = bodies()[1];
    expect(second.map((m) => m.role)).toEqual(['system', 'user']);
    expect(second.at(-1)!.content.endsWith('\n\nhello')).toBe(true);
  });

  it('deleting her reply, then regenerate on your now-last line, makes a fresh reply (Review Focus 2)', async () => {
    const { relay, db, last } = await setup();
    await relay.send('hicks', 'hello');
    const reply = last();
    await relay.regenerate('hicks', reply.id);
    await relay.remove('hicks', reply.id);
    const mine = last();
    expect(mine.role).toBe('user');
    expect(await relay.regenerate('hicks', mine.id)).toMatchObject({ ok: true });
    expect(last()).toMatchObject({ role: 'agent', text: 'take 3', status: 'ok' });
    expect(last().takes).toBeUndefined();
    expect(db.allMessages('hicks')).toHaveLength(2);
  });

  it('a regenerate that dies mid-stream keeps the earlier takes and adds the partial as a lost take (Review Focus 4)', async () => {
    const { relay, db, last } = await setup([ok('take 1'), ok('take 2'), dies('par')]);
    await relay.send('hicks', 'hello');
    const id = last().id;
    await relay.regenerate('hicks', id);
    await relay.regenerate('hicks', id);
    expect(db.getTakes('hicks', id)!.takes.map((t) => t.text)).toEqual(['take 1', 'take 2', 'par']);
    expect(db.getMessage('hicks', id)).toMatchObject({ text: 'par', status: 'lost', takes: { index: 2, count: 3 } });
    await relay.swipe('hicks', id, 1);
    expect(db.getMessage('hicks', id)).toMatchObject({ text: 'take 2', status: 'ok' });
  });

  it('a regenerate that fails before any text leaves the reply as it was (Review Focus 4)', async () => {
    const { relay, db, last } = await setup([ok('take 1'), dies('')]);
    await relay.send('hicks', 'hello');
    const before = last();
    await relay.regenerate('hicks', before.id);
    expect(db.getMessage('hicks', before.id)).toMatchObject({ text: 'take 1', status: 'ok' });
    expect(db.getMessage('hicks', before.id)!.takes).toBeUndefined();
    expect(db.allMessages('hicks').find((m) => m.role === 'user')!.status).toBe('ok');
  });

  it('a regenerate the backend reports as failed is not saved as a take (C1)', async () => {
    const { relay, db, last } = await setup([ok('take 1'), fails('')]);
    await relay.send('hicks', 'hello');
    const id = last().id;
    expect(await relay.regenerate('hicks', id)).toEqual({ ok: false, error: 'lost' });
    expect(db.getMessage('hicks', id)).toMatchObject({ text: 'take 1', status: 'ok' });
    expect(db.getMessage('hicks', id)!.takes).toBeUndefined();
  });

  it('a new reply the backend reports as failed shows as lost, not as an empty success (C1)', async () => {
    const { relay, last } = await setup([fails('')]);
    expect(await relay.send('hicks', 'hello')).toEqual({ ok: false, error: 'lost' });
    expect(last()).toMatchObject({ role: 'agent', status: 'lost' });
  });

  it('swipe and keep going only work on her latest reply', async () => {
    const { relay, last } = await setup();
    await relay.send('hicks', 'one');
    const first = last().id;
    await relay.send('hicks', 'two');
    expect(await relay.swipe('hicks', first, 0)).toEqual({ ok: false, error: 'not-latest' });
    expect(await relay.continueReply('hicks', first)).toEqual({ ok: false, error: 'not-latest' });
    expect(await relay.regenerate('hicks', first)).toEqual({ ok: false, error: 'not-latest' });
  });
});

describe('expression', () => {
  /** A script that opens the stream, then stalls until the test calls the returned release(), which sends `finalText`. */
  function stall(onRelease: (release: () => void) => void, finalText: string): Script {
    return (_req, res) => {
      startSseResponse(res);
      res.flushHeaders(); // the client's stream-open event fires on headers alone; flush before stalling
      onRelease(() => {
        res.write(chunkFrame(finalText, 'stop'));
        res.write(doneFrame());
        res.end();
      });
    };
  }

  it('regenerate opens the reply with no expression even if the old one had one; finished takes carry the old and new expressions', async () => {
    let release!: () => void;
    const { relay, db, last } = await setup([ok('take 1'), stall((r) => (release = r), 'take 2')]);
    await relay.send('hicks', 'hello');
    const id = last().id;
    db.updateMessage('hicks', id, { expression: 'happy' });

    const pending = relay.regenerate('hicks', id);
    while (!release || db.getMessage('hicks', id)!.status !== 'streaming') await new Promise((r) => setTimeout(r, 5));
    expect(db.getMessage('hicks', id)!.expression).toBeUndefined();
    db.updateMessage('hicks', id, { expression: 'annoyed' }); // the tool, mid-turn
    release();
    expect(await pending).toMatchObject({ ok: true });

    expect(db.getMessage('hicks', id)).toMatchObject({ text: 'take 2', expression: 'annoyed' });
    expect(db.getTakes('hicks', id)!.takes.map((t) => t.expression)).toEqual(['happy', 'annoyed']);
  });

  it('a regenerate that fails after she set an expression on the new take restores the old text and expression (Review Focus 2)', async () => {
    let die!: () => void;
    const dieScript: Script = (_req, res) => {
      startSseResponse(res);
      res.flushHeaders();
      die = () => res.destroy();
    };
    const { relay, db, last } = await setup([ok('take 1'), dieScript]);
    await relay.send('hicks', 'hello');
    const id = last().id;
    db.updateMessage('hicks', id, { expression: 'happy' });

    const pending = relay.regenerate('hicks', id);
    while (!die || db.getMessage('hicks', id)!.status !== 'streaming') await new Promise((r) => setTimeout(r, 5));
    db.updateMessage('hicks', id, { expression: 'annoyed' }); // the tool, mid-turn
    die();
    expect(await pending).toEqual({ ok: false, error: 'lost' });

    expect(db.getMessage('hicks', id)).toMatchObject({ text: 'take 1', status: 'ok', expression: 'happy' });
    expect(db.getMessage('hicks', id)!.takes).toBeUndefined();
  });

  it('keep going keeps the reply\'s expression', async () => {
    let release!: () => void;
    const { relay, db, last } = await setup([ok('She paused'), stall((r) => (release = r), 'then laughed.')]);
    await relay.send('hicks', 'Go on');
    const id = last().id;
    db.updateMessage('hicks', id, { expression: 'curious' });

    const pending = relay.continueReply('hicks', id);
    while (!release || db.getMessage('hicks', id)!.status !== 'streaming') await new Promise((r) => setTimeout(r, 5));
    expect(db.getMessage('hicks', id)!.expression).toBe('curious'); // not cleared, unlike a take
    release();
    expect(await pending).toMatchObject({ ok: true });
    expect(db.getMessage('hicks', id)).toMatchObject({ text: 'She paused then laughed.', expression: 'curious' });
  });

  it("keep going after a regenerate also updates the current take's expression, not just the message", async () => {
    let release!: () => void;
    const { relay, db, last } = await setup([ok('take 1'), ok('take 2'), stall((r) => (release = r), ' more')]);
    await relay.send('hicks', 'hello');
    const id = last().id;
    await relay.regenerate('hicks', id); // now on take 2 (index 1); takes exist

    const pending = relay.continueReply('hicks', id);
    const deadline = Date.now() + 2000;
    while ((!release || db.getMessage('hicks', id)!.status !== 'streaming') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
    if (!release) throw new Error('stream never opened');
    db.updateMessage('hicks', id, { expression: 'x' }); // the tool, mid-turn
    release();
    expect(await pending).toMatchObject({ ok: true });

    expect(db.getMessage('hicks', id)!.expression).toBe('x');
    const takes = db.getTakes('hicks', id)!;
    expect(takes.takes[takes.index].expression).toBe('x');
  });

  it("her resident's face follows the same rules: a take opens without it, finished takes keep old and new, a failed take restores it", async () => {
    let release!: () => void;
    const { relay, db, last } = await setup([ok('take 1'), stall((r) => (release = r), 'take 2')]);
    await relay.send('hicks', 'hello');
    const id = last().id;
    db.updateMessage('hicks', id, { othersExpressions: { hae: 'happy' } });

    const pending = relay.regenerate('hicks', id);
    while (!release || db.getMessage('hicks', id)!.status !== 'streaming') await new Promise((r) => setTimeout(r, 5));
    expect(db.getMessage('hicks', id)!.othersExpressions).toBeUndefined();
    db.updateMessage('hicks', id, { othersExpressions: { hae: 'concerned' } }); // the tool, mid-turn
    release();
    expect(await pending).toMatchObject({ ok: true });
    expect(db.getMessage('hicks', id)).toMatchObject({ text: 'take 2', othersExpressions: { hae: 'concerned' } });
    expect(db.getTakes('hicks', id)!.takes.map((t) => t.othersExpressions?.hae)).toEqual(['happy', 'concerned']);
  });

  it("a failed regenerate puts her resident's face back", async () => {
    let die!: () => void;
    const dieScript: Script = (_req, res) => {
      startSseResponse(res);
      res.flushHeaders();
      die = () => res.destroy();
    };
    const { relay, db, last } = await setup([ok('take 1'), dieScript]);
    await relay.send('hicks', 'hello');
    const id = last().id;
    db.updateMessage('hicks', id, { othersExpressions: { hae: 'happy' } });
    const pending = relay.regenerate('hicks', id);
    while (!die || db.getMessage('hicks', id)!.status !== 'streaming') await new Promise((r) => setTimeout(r, 5));
    db.updateMessage('hicks', id, { othersExpressions: { hae: 'annoyed' } });
    die();
    expect(await pending).toEqual({ ok: false, error: 'lost' });
    expect(db.getMessage('hicks', id)).toMatchObject({ text: 'take 1', othersExpressions: { hae: 'happy' } });
  });

  it("keep going after a regenerate updates the current take's resident face too", async () => {
    let release!: () => void;
    const { relay, db, last } = await setup([ok('take 1'), ok('take 2'), stall((r) => (release = r), ' more')]);
    await relay.send('hicks', 'hello');
    const id = last().id;
    await relay.regenerate('hicks', id);
    const pending = relay.continueReply('hicks', id);
    const deadline = Date.now() + 2000;
    while ((!release || db.getMessage('hicks', id)!.status !== 'streaming') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
    if (!release) throw new Error('stream never opened');
    db.updateMessage('hicks', id, { othersExpressions: { hae: 'happy' } });
    release();
    expect(await pending).toMatchObject({ ok: true });
    const takes = db.getTakes('hicks', id)!;
    expect(takes.takes[takes.index].othersExpressions?.hae).toBe('happy');
  });

  it('swiping to a take with no expression field clears it on the message (Review Focus 3); swiping back shows the other\'s', async () => {
    const { relay, db, last } = await setup();
    await relay.send('hicks', 'hello');
    const id = last().id;
    db.updateMessage('hicks', id, { expression: 'happy' });
    await relay.regenerate('hicks', id); // take 2, no expression set this turn
    expect(db.getTakes('hicks', id)!.takes.map((t) => t.expression)).toEqual(['happy', undefined]);

    await relay.swipe('hicks', id, 0);
    expect(db.getMessage('hicks', id)!.expression).toBe('happy');
    await relay.swipe('hicks', id, 1);
    expect(db.getMessage('hicks', id)!.expression).toBeUndefined();
    await relay.swipe('hicks', id, 0);
    expect(db.getMessage('hicks', id)!.expression).toBe('happy');
  });
});

describe('keep going', () => {
  it('appends to her reply with a space, sending the continue instruction after her reply', async () => {
    const { relay, bodies, last, db } = await setup([ok('She paused'), ok('then laughed.')]);
    await relay.send('hicks', 'Go on');
    const id = last().id;
    expect(await relay.continueReply('hicks', id)).toMatchObject({ ok: true });
    expect(db.getMessage('hicks', id)!.text).toBe('She paused then laughed.');
    const sent = bodies()[1];
    expect(sent.at(-2)).toEqual({ role: 'assistant', content: 'She paused' });
    expect(sent.at(-1)).toEqual({ role: 'user', content: CONTINUE_INSTRUCTION });
    expect(db.allMessages('hicks')).toHaveLength(2);
  });

  it('a keep going that fails leaves the reply as it was', async () => {
    const { relay, db, last } = await setup([ok('She paused'), dies('then')]);
    await relay.send('hicks', 'Go on');
    const id = last().id;
    await relay.continueReply('hicks', id);
    expect(db.getMessage('hicks', id)).toMatchObject({ text: 'She paused', status: 'ok' });
  });
});

describe('edit, delete, restore, rewind', () => {
  it("editing your earlier line changes what she sees next; nothing after it changes", async () => {
    const { relay, db, bodies } = await setup();
    await relay.send('hicks', 'helo');
    await relay.send('hicks', 'again');
    const mine = db.allMessages('hicks')[0];
    expect(await relay.edit('hicks', mine.id, 'hello')).toMatchObject({ ok: true });
    expect(db.allMessages('hicks')).toHaveLength(4);
    await relay.send('hicks', 'third');
    expect(bodies()[2][1]).toEqual({ role: 'user', content: 'hello' });
    expect(await relay.edit('hicks', mine.id, '   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('editing her reply edits the shown take', async () => {
    const { relay, db, last } = await setup();
    await relay.send('hicks', 'hello');
    const id = last().id;
    await relay.regenerate('hicks', id);
    await relay.edit('hicks', id, 'take 2, fixed');
    await relay.swipe('hicks', id, 0);
    await relay.swipe('hicks', id, 1);
    expect(db.getMessage('hicks', id)!.text).toBe('take 2, fixed');
  });

  it('delete removes a line and tells every tab; restore puts it back in place', async () => {
    const { relay, db, events } = await setup();
    await relay.send('hicks', 'one');
    await new Promise((r) => setTimeout(r, 3)); // distinct timestamps, as real lines have
    await relay.send('hicks', 'two');
    const victim = db.allMessages('hicks')[1];
    await relay.remove('hicks', victim.id);
    expect(events.at(-1)).toEqual({ type: 'messages_removed', ids: [victim.id] });
    expect(db.allMessages('hicks')).toHaveLength(3);
    await relay.restore('hicks', victim);
    expect(db.allMessages('hicks').map((m) => m.id)[1]).toBe(victim.id);
  });

  it('rewind removes every line after one', async () => {
    const { relay, db, events } = await setup();
    await relay.send('hicks', 'one');
    await relay.send('hicks', 'two');
    const keep = db.allMessages('hicks')[1];
    await relay.rewind('hicks', keep.id);
    expect(db.allMessages('hicks').map((m) => m.id).at(-1)).toBe(keep.id);
    expect(events.at(-1)).toMatchObject({ type: 'messages_removed' });
    expect((events.at(-1) as { ids: string[] }).ids).toHaveLength(2);
  });

  it('every control is refused while she is replying', async () => {
    let release!: () => void;
    const slow: Script = (_req, res) => {
      startSseResponse(res);
      res.write(chunkFrame('thinking'));
      release = () => {
        res.write(chunkFrame('…', 'stop'));
        res.write(doneFrame());
        res.end();
      };
    };
    const { relay, db } = await setup([ok('first'), slow]);
    await relay.send('hicks', 'one');
    const reply = db.allMessages('hicks')[1];
    const pending = relay.send('hicks', 'two');
    while (!release) await new Promise((r) => setTimeout(r, 5));
    for (const result of [
      await relay.regenerate('hicks', reply.id),
      await relay.swipe('hicks', reply.id, 0),
      await relay.continueReply('hicks', reply.id),
      await relay.edit('hicks', reply.id, 'x'),
      await relay.remove('hicks', reply.id),
      await relay.rewind('hicks', reply.id),
      await relay.restore('hicks', reply),
    ]) expect(result).toEqual({ ok: false, error: 'busy' });
    release();
    await pending;
  });

  it('unknown messages are refused', async () => {
    const { relay } = await setup();
    expect(await relay.edit('hicks', 'nope', 'x')).toEqual({ ok: false, error: 'unknown' });
    expect(await relay.remove('hicks', 'nope')).toEqual({ ok: false, error: 'unknown' });
  });
});
