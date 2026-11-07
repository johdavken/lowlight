import { beforeEach, expect, it } from 'vitest';
import { openDb, type Db } from '../src/db';
import { witnessKey } from '../../shared/witness';

const P = 'hicks';
let db: Db;
beforeEach(() => {
  db = openDb(':memory:', { defaultPlayer: P });
  db.insertMessage(P, { id: 'a0', role: 'agent', text: 'Hey.', toolLines: [], ts: 1000, status: 'ok' });
  db.insertMessage(P, { id: 'a1', role: 'agent', text: 'Sure.', toolLines: [], ts: 2000, status: 'ok' });
});

it('a witness entry goes with the reply that wrote it', () => {
  const key = witnessKey(P, 'ember', 3);
  db.withStamp({ messageId: 'a0', take: 0 }, () => db.setMeta(key, 'first'));
  db.withStamp({ messageId: 'a1', take: 0 }, () => db.setMeta(key, 'second'));
  db.cutAfter(P, 'a0');
  expect(db.getMeta(key)).toBe('first');
});

it('a swipe shows the entry of the take on screen', () => {
  const key = witnessKey(P, 'ember', 3);
  db.withStamp({ messageId: 'a1', take: 0 }, () => db.setMeta(key, 'take zero'));
  db.withStamp({ messageId: 'a1', take: 1 }, () => db.setMeta(key, 'take one'));
  db.rebuild({ show: { messageId: 'a1', take: 0 } });
  expect(db.getMeta(key)).toBe('take zero');
  db.rebuild({ show: { messageId: 'a1', take: 1 } });
  expect(db.getMeta(key)).toBe('take one');
});
