import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../src/db';
import { toCompletion } from '../src/history';
import { recentLines } from '../src/encounter';
import { readFacts } from '../src/contacts';
import { strangerAt } from '../../shared/encounter';
import type { ChatMessage } from '../../shared/types';

const venn = { name: 'Arlo Venn', voice: 'polite, patient' };
const beatRow = (o: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'q1',
  role: 'user',
  text: '*Boots on the stairs.*\n\n"Evening."',
  toolLines: [],
  ts: 10,
  status: 'ok',
  mode: 'quest',
  quest: { id: 'paper-trail', title: 'Paper Trail', beat: 'sentinel', stranger: venn },
  ...o,
});
const line = (id: string, ts: number, o: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: 'user', text: 'hi', toolLines: [], ts, status: 'ok', ...o });

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('a quest row', () => {
  it('round-trips through the database with its mode and snapshot', () => {
    const db = openDb(':memory:', { defaultPlayer: 'cass' });
    const pick = beatRow({ id: 'q2', ts: 20, quest: { id: 'paper-trail', title: 'Paper Trail', beat: 'ledger', pick: { choice: 'stall', line: 'You stall him.' } } });
    db.insertMessage('cass', beatRow());
    db.insertMessage('cass', pick);
    expect(db.getMessage('cass', 'q1')).toMatchObject({ mode: 'quest', quest: beatRow().quest });
    expect(db.getMessage('cass', 'q2')!.quest).toEqual(pick.quest);
    db.updateMessage('cass', 'q2', { status: 'ok', quest: { ...pick.quest!, beat: null } });
    expect(db.getMessage('cass', 'q2')!.quest!.beat).toBeNull();
  });

  it('gains its column in an old database', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quest-row-'));
    dirs.push(dir);
    const file = path.join(dir, 'room.db');
    openDb(file, { defaultPlayer: 'cass' }).close();
    const raw = new DatabaseSync(file);
    raw.exec('ALTER TABLE messages DROP COLUMN quest');
    raw.close();
    const db = openDb(file, { defaultPlayer: 'cass' });
    db.insertMessage('cass', beatRow());
    expect(db.getMessage('cass', 'q1')!.quest!.title).toBe('Paper Trail');
    db.close();
  });

  it('reaches her history as a [quest] line', () => {
    expect(toCompletion(beatRow())).toEqual({ role: 'user', content: '[quest — Paper Trail: *Boots on the stairs.* "Evening."]' });
    expect(toCompletion(beatRow({ status: 'failed' }))).toBeNull();
  });

  it('is a line of the scene for the narrator and the pick check', () => {
    expect(recentLines([beatRow()], { player: 'Cass', contact: 'Hicks' })).toEqual(['[quest — Paper Trail: *Boots on the stairs.* "Evening."]']);
  });

  it('brings its stranger, and the next quest row without one ends them', () => {
    const rows = [beatRow(), line('a', 11), beatRow({ id: 'q2', ts: 12, quest: { id: 'paper-trail', title: 'Paper Trail', beat: 'ledger' } })];
    expect(strangerAt(rows, 1)).toEqual(venn);
    expect(strangerAt(rows, 2)).toBeNull();
    expect(strangerAt([beatRow(), line('t', 11, { mode: 'travel' })], 1)).toBeNull();
  });

  it('counts as meeting them', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quest-met-'));
    dirs.push(dir);
    const file = path.join(dir, 'room.db');
    const db = openDb(file, { defaultPlayer: 'cass' });
    db.insertMessage('cass', beatRow());
    db.close();
    expect(readFacts(file, 'cass').met).toBe(true);
  });
});
