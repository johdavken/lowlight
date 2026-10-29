import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db';
import { loadQuestBook } from '../src/quests';
import { TRAIL } from '../../shared/quests.fixture';
import type { ChatMessage } from '../../shared/types';

const row = (id: string, ts: number, o: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: 'user', text: 'x', toolLines: [], ts, status: 'ok', ...o });
const KEY = 'quest.cass.paper-trail';

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'quests-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('a quest run as story meta', () => {
  it('is stamped to the row before it, and a rewind past that row undoes it', () => {
    const db = openDb(':memory:', { defaultPlayer: 'cass' });
    db.insertMessage('cass', row('a', 1));
    db.insertMessage('cass', row('q', 2, { mode: 'quest', quest: { id: 'paper-trail', title: 'Paper Trail', beat: 'sentinel' } }));
    db.setMeta(KEY, '{"beat":"sentinel"}');
    expect(db.writes().find((w) => w.key === KEY)?.messageId).toBe('q');
    const { rebuilt } = db.cutAfter('cass', 'a');
    expect(db.getMeta(KEY)).toBeNull();
    expect(rebuilt.quests).toBe(true);
  });

  it('survives a rebuild that keeps its row', () => {
    const db = openDb(':memory:', { defaultPlayer: 'cass' });
    db.insertMessage('cass', row('q', 2, { mode: 'quest' }));
    db.setMeta(KEY, 'v1');
    const r = db.rebuild();
    expect(db.getMeta(KEY)).toBe('v1');
    expect(r.quests).toBe(false);
  });
});

describe('loadQuestBook', () => {
  const known = { roster: new Set(['nix-direct', 'hicks']), places: new Set(['lowlight-intake']) };
  it('loads the good files and warns about the bad', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'paper-trail.md'), TRAIL);
    fs.writeFileSync(path.join(dir, 'broken.md'), TRAIL.replace('starts: lowlight-intake', 'starts: the-moon'));
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    const warnings: string[] = [];
    const book = loadQuestBook(dir, known, (m) => warnings.push(m));
    expect(book.map((q) => q.id)).toEqual(['paper-trail']);
    expect(warnings).toEqual(["quest broken.md: starts: no place 'the-moon' on the map; skipping it"]);
  });
  it('is empty without a folder', () => {
    expect(loadQuestBook(path.join(tmp(), 'none'), known, () => {})).toEqual([]);
  });
});
