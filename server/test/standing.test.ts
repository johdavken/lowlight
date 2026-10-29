import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SHARED_STANDING } from '../../shared/standing';
import { currentStanding, moveStanding, sharedStandingReader, standingControl } from '../src/standing';
import { openDb } from '../src/db';
import { tempDir } from './fixtures/temp-dir';

describe('sharedStandingReader', () => {
  it('a missing file gives the defaults without a warning', () => {
    const warn = vi.fn();
    expect(sharedStandingReader(path.join(tempDir('ss-'), 'standing.json'), warn)()).toEqual(DEFAULT_SHARED_STANDING);
    expect(warn).not.toHaveBeenCalled();
  });
  it('a partly bad file: defaults for the bad parts, warned once per read', () => {
    const file = path.join(tempDir('ss-'), 'standing.json');
    fs.writeFileSync(file, JSON.stringify({ ...DEFAULT_SHARED_STANDING, words: { ...DEFAULT_SHARED_STANDING.words, 'mid-mid': 'Unsure', 'low-low': '' } }));
    const warn = vi.fn();
    const read = sharedStandingReader(file, warn);
    expect(read().words['mid-mid']).toBe('Unsure');
    expect(read().words['low-low']).toBe('Hostile');
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('rereads after the file changes; broken JSON gives the defaults with a warning', () => {
    const file = path.join(tempDir('ss-'), 'standing.json');
    fs.writeFileSync(file, JSON.stringify({ ...DEFAULT_SHARED_STANDING, words: { ...DEFAULT_SHARED_STANDING.words, 'mid-mid': 'A' } }));
    const warn = vi.fn();
    const read = sharedStandingReader(file, warn);
    expect(read().words['mid-mid']).toBe('A');
    fs.writeFileSync(file, '{nope, longer than before');
    expect(read()).toEqual(DEFAULT_SHARED_STANDING);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('currentStanding and moveStanding', () => {
  const start = { trust: 0, warmth: 3 };
  const mv = (trust: number, warmth: number, messageId = 'm1') => ({ trust, warmth, reason: 'r', at: 1, messageId, take: 0 });
  it('no key: the start and its word', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    expect(currentStanding(db, 'hicks', start, null, DEFAULT_SHARED_STANDING)).toEqual({ values: start, stored: null, word: 'Sizing you up' });
    db.close();
  });
  it('a move crossing the warmth edge: the words before and after, and the values stored', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    expect(moveStanding(db, 'hicks', start, null, DEFAULT_SHARED_STANDING, mv(1, 2))).toEqual({ before: 'Sizing you up', after: 'Warming to you' });
    const now = currentStanding(db, 'hicks', start, null, DEFAULT_SHARED_STANDING);
    expect(now.values).toEqual({ trust: 1, warmth: 5 });
    expect(now.stored!.moves).toHaveLength(1);
    expect(db.getMeta('standing.hicks')).not.toBeNull();
    db.close();
  });
  it('a stored value that does not read falls back to the start', () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    db.setMeta('standing.hicks', '{nope');
    expect(currentStanding(db, 'hicks', start, null, DEFAULT_SHARED_STANDING).values).toEqual(start);
    db.close();
  });
});

describe("a job's move (Intake board spec §2)", () => {
  it("a job's move doesn't hold back the Residual", () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const msg = (id: string, role: 'user' | 'agent', ts: number) => db.insertMessage('hicks', { id, role, text: id, toolLines: [], ts, status: 'ok' });
    msg('u1', 'user', 1);
    msg('A', 'agent', 2);
    msg('R', 'user', 3);
    msg('B', 'agent', 4);
    msg('u2', 'user', 5);
    msg('C', 'agent', 6);
    const start = { trust: 0, warmth: 0 };
    moveStanding(db, 'hicks', start, null, DEFAULT_SHARED_STANDING, { trust: 1, warmth: 0, reason: 'residual', at: 2, messageId: 'A', take: 0 });
    moveStanding(db, 'hicks', start, null, DEFAULT_SHARED_STANDING, { trust: 1, warmth: 0, reason: 'Night job: X, clean', at: 3, messageId: 'R', take: 0, job: true });
    const ctl = standingControl({ db, player: () => 'hicks', start: () => start, config: () => null, shared: () => DEFAULT_SHARED_STANDING });
    expect(ctl.repliesSinceMove('C')).toBe(2);
    db.close();
  });
});

describe("a job's trust counts once (2026-10-20)", () => {
  const setup = () => {
    const db = openDb(':memory:', { defaultPlayer: 'hicks' });
    const msg = (id: string, role: 'user' | 'agent', ts: number) => db.insertMessage('hicks', { id, role, text: id, toolLines: [], ts, status: 'ok' });
    msg('R', 'user', 1);
    msg('C', 'agent', 2);
    msg('u2', 'user', 3);
    msg('D', 'agent', 4);
    const start = { trust: 0, warmth: 0 };
    moveStanding(db, 'hicks', start, null, DEFAULT_SHARED_STANDING, { trust: 1, warmth: 0, reason: 'Night job: X, clean', at: 1, messageId: 'R', take: 0, job: true });
    const ctl = standingControl({ db, player: () => 'hicks', start: () => start, config: () => null, shared: () => DEFAULT_SHARED_STANDING });
    return { db, ctl };
  };
  it('her reply to the job row moves no trust (warmth still may)', () => {
    const { db, ctl } = setup();
    expect(ctl.move({ trust: 1, warmth: 0, reason: 'same job' }, 'C')).toBe('already');
    ctl.move({ trust: 1, warmth: 1, reason: 'liked it' }, 'C');
    expect(currentStanding(db, 'hicks', { trust: 0, warmth: 0 }, null, DEFAULT_SHARED_STANDING).values).toEqual({ trust: 1, warmth: 1 });
    db.close();
  });
  it('a later reply moves trust as usual', () => {
    const { db, ctl } = setup();
    ctl.move({ trust: 1, warmth: 0, reason: 'later' }, 'D');
    expect(currentStanding(db, 'hicks', { trust: 0, warmth: 0 }, null, DEFAULT_SHARED_STANDING).values.trust).toBe(2);
    db.close();
  });
});
