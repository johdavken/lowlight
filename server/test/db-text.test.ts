import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db';
import type { ChatMessage } from '../../shared/types';

const row = (id: string, ts: number, o: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: 'user', text: id, toolLines: [], ts, status: 'ok', ...o });

describe('text rows (deck spec §3)', () => {
  it('a text row reads back with mode text', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', row('t', 1, { mode: 'text' }));
    expect(db.getMessage('hicks', 't')?.mode).toBe('text');
  });

  it('recentMessages filters by text and scene', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', row('a', 1));
    db.insertMessage('hicks', row('b', 2, { mode: 'ooc' }));
    db.insertMessage('hicks', row('t1', 3, { mode: 'text' }));
    db.insertMessage('hicks', row('t2', 4, { mode: 'text', role: 'agent' }));
    db.insertMessage('hicks', row('c', 5));
    expect(db.recentMessages('hicks', 200, 'scene').map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(db.recentMessages('hicks', 200, 'text').map((m) => m.id)).toEqual(['t1', 't2']);
    expect(db.recentMessages('hicks').map((m) => m.id)).toEqual(['a', 'b', 't1', 't2', 'c']);
    // The limit counts only the rows asked for.
    expect(db.recentMessages('hicks', 1, 'scene').map((m) => m.id)).toEqual(['c']);
  });

  it('a promised row reads back promised, and a parting END row still reads as hers', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.insertMessage('hicks', row('p', 1, { mode: 'text', promised: true }));
    db.insertMessage('hicks', row('e', 2, { mode: 'end', leave: true, parting: 'her' }));
    expect(db.getMessage('hicks', 'p')).toMatchObject({ promised: true });
    expect(db.getMessage('hicks', 'p')?.leave).toBeUndefined();
    expect(db.getMessage('hicks', 'e')).toMatchObject({ leave: true, parting: 'her' });
    expect(db.getMessage('hicks', 'e')?.promised).toBeUndefined();
  });
});

