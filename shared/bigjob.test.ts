import { describe, expect, it } from 'vitest';
import { bigRep, bigStake, GIG_OUTCOME, gigBrief, gigOf, gigSeed, goPassed, nightMinute, scoreRead, wordBank } from './bigjob';
import { parseQuestFile, type CondCtx, type QuestEntry } from './quests';
import { BIG } from './quests.fixture';

const big = (text = BIG): QuestEntry => {
  const r = parseQuestFile('north-gate', text, { roster: null, places: null });
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
const ctx = (o: Partial<CondCtx> = {}): CondCtx => ({ flags: {}, trust: null, warmth: null, with: 'ember', ...o });
const at = (hh: number, mm = 0, day = 0) => day * 1440 + hh * 60 + mm;

describe('the read', () => {
  it('scoreRead: 3 right full, 2 half, 1 wrong, 0 wrong; flags read and read.1-3', () => {
    const q = big();
    expect(scoreRead(q, ['the courier', 'the north gate', 'the guard is paid'])).toEqual({
      level: 'full',
      blanks: ['right', 'right', 'right'],
      flags: { read: 'full', 'read.1': 'right', 'read.2': 'right', 'read.3': 'right' },
    });
    expect(scoreRead(q, ['the courier', 'the dock', 'the guard is paid']).level).toBe('half');
    expect(scoreRead(q, ['the courier', 'the dock', 'SDG pay'])).toMatchObject({ level: 'wrong', flags: { read: 'wrong', 'read.1': 'right', 'read.2': 'wrong', 'read.3': 'wrong' } });
    expect(scoreRead(q, ['the dock', 'the river', 'SDG pay']).level).toBe('wrong');
  });

  it('wordBank: found clues\' words plus wrong words, no duplicates, same seed same order', () => {
    const q = big();
    const bank = wordBank(q, ['strap', 'rumour'], 'seed-1');
    expect([...bank].sort()).toEqual(['SDG pay', 'the courier', 'the dock', 'the ferry', 'the night shift', 'the river'].sort());
    expect(wordBank(q, ['strap', 'rumour'], 'seed-1')).toEqual(bank);
    expect(wordBank(q, [], 'x').sort()).toEqual(['the dock', 'the night shift', 'the river']);
  });
});

describe('gigs', () => {
  const gate = () => big().beats.get('gate')![0];
  it('gigOf: medium with two -1 mods is easy (clamped), why lists both; hard +1 stays hard', () => {
    const wire = gate().choices.find((c) => c.id === 'wire')!.gig!;
    expect(gigOf(wire, ctx({ with: 'hicks', flags: { 'read.2': 'right' } }))).toEqual({ kind: 'hack', tier: 'easy', why: ['−1 YOU KNOW THE GATE', '−1 HICKS'] });
    expect(gigOf(wire, ctx())).toEqual({ kind: 'hack', tier: 'medium', why: [] });
    const hard = { kind: 'gig' as const, gig: 'slip' as const, tier: 'hard' as const, mods: [{ when: [], step: 1 as const, label: 'loud' }] };
    expect(gigOf(hard, ctx())).toEqual({ kind: 'slip', tier: 'hard', why: ['+1 LOUD'] });
  });

  it('gigSeed stable for the same inputs, different across choices; outcomes by result', () => {
    expect(gigSeed('quest.p.north-gate@3', 'gate', 'wire')).toBe(gigSeed('quest.p.north-gate@3', 'gate', 'wire'));
    expect(gigSeed('quest.p.north-gate@3', 'gate', 'wire')).not.toBe(gigSeed('quest.p.north-gate@3', 'gate', 'walk'));
    expect(Number.isInteger(gigSeed('a', 'b', 'c')) && gigSeed('a', 'b', 'c') >= 0).toBe(true);
    expect(GIG_OUTCOME).toEqual({ clean: 0, close: 1, traced: 2, caught: 2, back: 2 });
  });

  it('gigBrief: the job as a brief at its place, of that kind and tier', () => {
    expect(gigBrief(big(), 'papers', 'easy')).toMatchObject({ id: 'north-gate-gig', title: 'North Gate', kind: 'papers', tier: 'easy', place: 'haes-noodles' });
  });

  it("I2: the brief's client, target and take come from the front matter; its text is the route's line", () => {
    const q = big(BIG.replace('stake: 15 / 25\n', 'stake: 15 / 25\nclient: A broker in the Spine\ntarget: North Gate · the guard post\ntake: the courier\'s manifest\n'));
    expect(gigBrief(q, 'hack', 'medium', "Loop the gate's cameras from the substation.")).toMatchObject({
      client: 'A broker in the Spine',
      target: 'North Gate · the guard post',
      take: "the courier's manifest",
      text: "Loop the gate's cameras from the substation.",
    });
    // Without them: the fixer, the job's title, the job; the pitch when there's no route line.
    expect(gigBrief(big(), 'hack', 'medium')).toMatchObject({ client: 'the fixer', target: 'North Gate', take: 'the job', text: expect.stringContaining('A courier keeps getting through') });
  });
});

describe('the night and the stakes', () => {
  it('nightMinute counts from 06:00', () => {
    expect(nightMinute(at(6))).toBe(0);
    expect(nightMinute(at(2, 30, 1))).toBe(1230);
  });

  it('goPassed: started 22:00, go 03:00: false at 02:59, true at 03:00 and at 05:00; a run started 04:00 with go 03:00 is past at once', () => {
    const q = big();
    expect(goPassed(q, at(22), at(2, 59, 1))).toBe(false);
    expect(goPassed(q, at(22), at(3, 0, 1))).toBe(true);
    expect(goPassed(q, at(22), at(5, 0, 1))).toBe(true);
    expect(goPassed(q, at(4, 0, 1), at(4, 0, 1))).toBe(true);
  });

  it('bigRep with default and custom stake', () => {
    const q = big();
    expect(bigStake(q)).toEqual([15, 25]);
    expect([bigRep(q, 'clean'), bigRep(q, 'messy'), bigRep(q, 'blown')]).toEqual([15, 2, -25]);
    const custom = big(BIG.replace('stake: 15 / 25', 'stake: 20 / 30'));
    expect([bigRep(custom, 'clean'), bigRep(custom, 'blown')]).toEqual([20, -30]);
    expect(bigStake(big(BIG.replace('stake: 15 / 25\n', '')))).toEqual([15, 25]);
  });
});
