import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db';
import { HABITS, habitsDue, habitsLine, herReplies, readHabits, repliesCount, writeHabits } from '../src/habits';
import type { ChatMessage } from '../../shared/types';

let n = 0;
const msg = (role: 'user' | 'agent', text: string, more: Partial<ChatMessage> = {}): ChatMessage => ({ id: `m${++n}`, role, text, toolLines: [], ts: n, status: 'ok', ...more });
/** `k` of her replies, each after a line of theirs. */
const replies = (k: number) => Array.from({ length: k }, (_, i) => [msg('user', `line ${i}`), msg('agent', `reply ${i}`)]).flat();

describe('herReplies (habits spec §1.1)', () => {
  it('keeps her in-character replies and drops everything else', () => {
    const plain = msg('agent', 'plain');
    const greet = msg('agent', 'hello', { mode: 'greet' });
    const kept = herReplies([
      plain,
      greet,
      msg('user', 'theirs'),
      msg('agent', 'ooc', { mode: 'ooc' }),
      msg('agent', 'text', { mode: 'text' }),
      msg('agent', 'promised', { promised: true }),
      msg('agent', 'scene', { mode: 'scene' }),
      msg('agent', 'encounter', { mode: 'encounter' }),
      msg('agent', 'failed', { status: 'failed' }),
      msg('agent', '   '),
    ]);
    expect(kept).toEqual([plain, greet]);
  });
});

describe('habitsDue (habits spec §1.1)', () => {
  it('first at 8 of her replies', () => {
    expect(HABITS.firstAfter).toBe(8);
    expect(habitsDue(replies(7), null)).toBe(false);
    expect(habitsDue(replies(8), null)).toBe(true);
  });

  it('then once 12 more have gone by since through', () => {
    const h = replies(20);
    const eighth = herReplies(h)[7].id;
    expect(habitsDue(h.slice(0, 38), { rules: ['A'], through: eighth })).toBe(false);
    expect(habitsDue(h, { rules: ['A'], through: eighth })).toBe(true);
    expect(repliesCount(h)).toBe(20);
  });

  it('a through that is gone falls back to the first-run rule', () => {
    expect(habitsDue(replies(8), { rules: [], through: 'nowhere' })).toBe(true);
    expect(habitsDue(replies(7), { rules: [], through: 'nowhere' })).toBe(false);
  });
});

describe('readHabits / writeHabits (habits spec §1.5)', () => {
  it('null for missing or broken values; a good value round-trips', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    expect(readHabits(db, 'hicks')).toBeNull();
    for (const bad of ['not json', '{"rules":"x"}', '{"rules":[1],"through":"m1"}', '{"rules":["a"]}']) {
      db.setMeta('habits.hicks', bad);
      expect(readHabits(db, 'hicks')).toBeNull();
    }
    writeHabits(db, 'hicks', { rules: ['No glasses business'], through: 'm1' });
    expect(readHabits(db, 'hicks')).toEqual({ rules: ['No glasses business'], through: 'm1' });
    db.close();
  });

  it('rewind brings back the list before, and past the first, none', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', msg('user', 'u'));
    db.insertMessage('hicks', msg('agent', 'a'));
    db.insertMessage('hicks', msg('agent', 'b'));
    const [u, a, b] = db.allMessages('hicks').map((m) => m.id);
    db.withStamp({ messageId: a, take: 0 }, () => writeHabits(db, 'hicks', { rules: ['A'], through: a }));
    db.withStamp({ messageId: b, take: 0 }, () => writeHabits(db, 'hicks', { rules: ['B'], through: b }));
    db.cutAfter('hicks', a);
    expect(readHabits(db, 'hicks')).toEqual({ rules: ['A'], through: a });
    db.cutAfter('hicks', u);
    expect(readHabits(db, 'hicks')).toBeNull();
    db.close();
  });
});

describe('habitsLine (habits spec §2)', () => {
  it('null with no rules; lowercased first letters, no trailing stops, joined by dots', () => {
    expect(habitsLine([])).toBeNull();
    expect(habitsLine(['No business with his glasses.', "Don't close on a question"])).toBe("[worn thin — leave out: no business with his glasses · don't close on a question]");
  });
});
