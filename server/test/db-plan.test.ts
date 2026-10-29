import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db';
import { planKey } from '../../shared/plan';
import type { ChatMessage } from '../../shared/types';

const row = (id: string, ts: number, o: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: 'user', text: 'x', toolLines: [], ts, status: 'ok', ...o });
const KEY = planKey('hicks');

describe('her plan as story meta (her plans spec §2)', () => {
  it('is logged under the reply that made it, and a rewind past that reply drops it', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', row('a', 1));
    db.insertMessage('hicks', row('b', 2, { role: 'agent' }));
    db.withStamp({ messageId: 'b', take: 0 }, () => db.setMeta(KEY, '{"going":null}'));
    expect(db.writes().find((w) => w.key === KEY)?.messageId).toBe('b');
    const { rebuilt } = db.cutAfter('hicks', 'a');
    expect(db.getMeta(KEY)).toBeNull();
    // A changed plan tells the relay to re-send its story state (the card rides with it).
    expect(rebuilt.quests).toBe(true);
  });

  it('a rebuild that keeps its reply keeps it', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', row('b', 2, { role: 'agent' }));
    db.withStamp({ messageId: 'b', take: 0 }, () => db.setMeta(KEY, 'v1'));
    db.rebuild();
    expect(db.getMeta(KEY)).toBe('v1');
  });
});

describe('promises as story meta (promised texts spec §3)', () => {
  it('a rewind past its reply drops it; the try count and read mark survive', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', row('a', 1));
    db.insertMessage('hicks', row('b', 2, { role: 'agent' }));
    db.withStamp({ messageId: 'b', take: 0 }, () => db.setMeta('promise.hicks', '{}'));
    db.setMeta('promisetries.hicks', '1');
    db.setMeta('deckread.hicks', 'b');
    db.cutAfter('hicks', 'a');
    expect(db.getMeta('promise.hicks')).toBeNull();
    expect(db.getMeta('promisetries.hicks')).toBe('1');
    expect(db.getMeta('deckread.hicks')).toBe('b');
  });
});

