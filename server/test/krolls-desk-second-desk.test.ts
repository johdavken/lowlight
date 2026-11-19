/**
 * Second Desk (Kroll's desk, Task 8): Weir's file, on her own floor after hours. The shared fixtures and `jobShape` are
 * in krolls-desk-kit.ts.
 */
import { describe, expect, it } from 'vitest';
import { repDelta } from '../../shared/mission';
import { holds, parseCondition, type CondCtx } from '../../shared/quests';
import { bandOf } from '../../shared/standing';
import { recommendedJob } from '../src/job-views';
import { allBeats, cardSets, entryOf, jobShape, onRelay, play as playJob, read, relayWith, useKrollsDesk, waysOf, type Pick } from './krolls-desk-kit';

useKrollsDesk();

jobShape('second-desk', { id: 'floor', label: 'THE FLOOR', size: 3 });

/** Countersign and Clearance done (each sets its flag on every way out), the gate Second Desk opens on. */
const BOTH = { kroll_one: 'yes', cs_end: 'cheap', niko: 'collected' };

/** The kit's `play` with Countersign and Clearance done before it, so the job starts through its real `after:` gate. */
const play = (o: Omit<Parameters<typeof playJob>[1], 'flags'>) => playJob('second-desk', { trust: 5, ...o, flags: BOTH });

describe('Second Desk: Weir’s file', () => {
  const q = entryOf('second-desk', read('second-desk'));

  it('once, after Countersign and Clearance, paid in Nexus, never texted', () => {
    expect(q.once).toBe(true);
    expect(q.district).toBe('nexus');
    expect(q.text).toBeUndefined();
    expect(q.after).toEqual(parseCondition('cs_end and niko'));
  });

  describe('the gate: Countersign and Clearance both done, whatever her trust', () => {
    const ctx = (trust: number, flags: Record<string, string>): CondCtx => ({ flags, trust: bandOf(trust), warmth: 'mid', with: 'adebayo' });
    const desk = (c: CondCtx) =>
      recommendedJob([q], { player: 'soren', contact: 'adebayo', ctx: c, started: [], withNow: null, heard: () => false, tier: () => 1 })?.id ?? null;

    it('both of them, at any trust; one alone, or Come Up alone, at no trust', () => {
      for (const trust of [-6, 1, 4, 5, 9]) {
        expect(holds(q.after, ctx(trust, BOTH)), `${trust}`).toBe(true);
        expect(holds(q.after, ctx(trust, { kroll_one: 'yes', cs_end: 'out' })), `${trust}`).toBe(false);
        expect(holds(q.after, ctx(trust, { kroll_one: 'yes', niko: 'loose' })), `${trust}`).toBe(false);
        expect(holds(q.after, ctx(trust, { kroll_one: 'yes' })), `${trust}`).toBe(false);
      }
      // Any way either ended counts: the getaway's unsigned paper, a runner let go.
      expect(holds(q.after, ctx(1, { cs_end: 'unsigned', niko: 'loose' }))).toBe(true);
    });

    it('recommended at her desk once both are done, at her starting trust', () => {
      expect(desk(ctx(1, { kroll_one: 'yes', cs_end: 'cheap' }))).toBeNull();
      expect(desk(ctx(1, BOTH))).toBe('second-desk');
    });

    it('on the relay: refused after one of them, started after both at her starting trust', async () => {
      const go = { crew: true as const, people: [], programs: [] };
      const job = () => [entryOf('second-desk', onRelay(read('second-desk')))];
      expect(await relayWith(job(), { trust: 9, flags: { kroll_one: 'yes', niko: 'collected' } }).relay.startQuest('soren', 'second-desk', go)).toBe("that job isn't open here");
      expect(await relayWith(job(), { trust: 1, flags: BOTH }).relay.startQuest('soren', 'second-desk', go)).not.toBeTypeOf('string');
    });
  });

  it('the whole job stands in her room: no beat changes it', () => {
    for (const b of allBeats(q)) expect(b.room, b.id).toBeUndefined();
  });

  it('only the clean ending, with nothing on the glass and the file read by her alone, gives the deck', () => {
    const gives = [...q.outcomes.values()].filter((o) => o.effects.deck !== undefined);
    expect(gives.map((o) => [o.id, o.effects.deck])).toEqual([['reported@0', 'stall-build']]);
    expect(q.outcomes.get('reported')!.versions![0]).toEqual({ when: parseCondition('sees<=0 and alarm<=1 and floor<=1 and sd_tipped!=yes and sd_hands!=empty'), id: 'reported@0' });
    const hers = q.beats.get('ledger')!.find((b) => b.when?.some((c) => c.kind === 'flag' && c.name === 'sd_file'))!;
    expect(hers.views.some((v) => v.contact === 'adebayo' && /stall build/.test(v.text) && JSON.stringify(v.when) === JSON.stringify(q.outcomes.get('reported')!.versions![0].when))).toBe(true);
  });

  it('keeping the name back is offered only where he read it', () => {
    const [hers, his] = q.beats.get('ledger')!;
    expect(hers.when).toEqual(parseCondition('sd_file=hers'));
    expect(hers.choices.map((c) => c.id)).toEqual(['report', 'ask']);
    expect(his.when).toBeNull();
    expect(his.choices.map((c) => c.id)).toEqual(['all', 'keep']);
    // Every way out of the office that doesn't hand her the file reads it on his side of the glass, or in the gap. CARRY IT
    // hands it over by the card's own set, so a throw that misses there still leaves it hers.
    const office = q.beats.get('office')![0];
    expect(office.choices.filter((c) => cardSets(c, 'sd_file')).map((c) => c.id)).toEqual(['carry']);
    expect(office.choices.find((c) => c.id === 'carry')!.tags).toContainEqual(expect.objectContaining({ kind: 'set', name: 'sd_file', value: 'hers' }));
    const read = office.choices.filter((c) => !cardSets(c, 'sd_file')).flatMap((c) => c.ways ?? []);
    for (const w of read) expect(w.sets.some((s) => s.name === 'sd_name' || s.name === 'sd_glass'), w.to).toBe(true);
  });

  it('TAKE across the beats is the take-size exactly', () => {
    const order = ['desk', 'floor', 'office', 'out'];
    const best = order.map((id) => Math.max(...q.beats.get(id)!.flatMap(waysOf).map((w) => w.take)));
    expect(best.reduce((a, b) => a + b, 0)).toBe(q.takeSize);
  });

  it('every runner way sets a flag a later beat reads, or moves a clock', () => {
    const runner = allBeats(q).flatMap((b) => b.choices.flatMap((c) => (c.ways ?? []).filter((w) => w.key.kind === 'spec' && w.key.spec === 'runner').map((w) => ({ w, card: c }))));
    expect(runner.length).toBe(3);
    for (const { w, card } of runner) expect(w.sets.length > 0 || card.tags.some((t) => t.kind === 'set') || Object.values(w.clocks).some((n) => n !== 0), w.to).toBe(true);
  });

  // Nothing on the glass and a quiet floor: stay late, a face pulls Fenn down to the dock, a runner opens the drawer onto
  // her terminal, and you wait out the cleaner in the dark.
  const CLEAN: Pick[] = [
    ['desk', 'stay', 'you'],
    ['floor', 'book', 'mia'],
    ['office', 'carry', 'dez'],
    ['out', 'lamp', 'you'],
    ['ledger', 'report', 'you'],
  ];

  it('a clean run with nothing on the glass: clean, her trust +1, Nexus rep +6, the stall build', async () => {
    const r = await play({ people: ['mia', 'dez'], picks: CLEAN, trust: 5 });
    expect(r.run.done).toBe(true);
    expect(r.tier).toBe('clean');
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.clocks.floor).toBe(1);
    expect(r.run.alarm).toBe(1);
    expect(r.trust).toBe(6);
    expect(r.rep).toEqual([['nexus', repDelta(1, 'clean')]]);
    expect(repDelta(1, 'clean')).toBe(6);
    expect(r.decks).toEqual(['stall-build']);
    expect(r.run.flags).toMatchObject({ sd_end: 'told', sd_file: 'hers' });
  });

  it('asking her whose name it was, on the same clean night, marks it and gives no deck', async () => {
    const r = await play({ people: ['mia', 'dez'], picks: [...CLEAN.slice(0, 4), ['ledger', 'ask', 'you']], trust: 5 });
    expect(r.tier).toBe('clean');
    expect(r.clocks.sees).toBe(1);
    expect(r.trust).toBe(5);
    expect(r.decks).toEqual([]);
  });

  it('the double play: out on Fenn’s round, the floor down and nothing on the glass, but the last slice of TAKE left behind: messy, no deck', async () => {
    const r = await play({
      people: ['ash', 'dez'],
      picks: [
        ['desk', 'stay', 'you'],
        ['floor', 'book', 'ash'],
        ['office', 'carry', 'dez'],
        ['out', 'walk', 'you:rounds'],
        ['ledger', 'report', 'you'],
      ],
      trust: 5,
    });
    expect(r.run.done).toBe(true);
    expect(r.clocks.floor ?? 0).toBe(0);
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.tier).toBe('messy');
    expect(r.trust).toBe(6);
    expect(r.decks).toEqual([]);
  });

  describe('alone: trust +1 or a quiet floor, never both, never the deck', () => {
    it('the glass empty: the floor sees him and the night is messy', async () => {
      const r = await play({
        picks: [
          ['desk', 'stay', 'you'],
          ['floor', 'book', 'you'],
          ['office', 'carry', 'you'],
          ['out', 'walk', 'you'],
          ['ledger', 'report', 'you'],
        ],
        trust: 5,
      });
      expect(r.clocks.sees ?? 0).toBe(0);
      expect(r.clocks.floor).toBe(3);
      expect(r.tier).toBe('messy');
      expect(r.trust).toBe(6);
      expect(r.decks).toEqual([]);
      expect(r.db.recentMessages('soren', 80).some((m) => m.text.includes('Fenn turns a page in his book'))).toBe(true);
    });

    it('the floor quiet: a clean night, but the glass has him', async () => {
      const r = await play({
        picks: [
          ['desk', 'stay', 'you'],
          ['floor', 'row', 'you'],
          ['office', 'read', 'you'],
          ['out', 'lamp', 'you'],
          ['ledger', 'all', 'you'],
        ],
        trust: 5,
      });
      expect(r.tier).toBe('clean');
      expect(r.clocks).toMatchObject({ sees: 2, floor: 1 });
      expect(r.trust).toBe(5);
      expect(r.decks).toEqual([]);
    });

    it('her own way at the night book: the glass empty, but the folder carried makes the night loud — no deck', async () => {
      const r = await play({
        picks: [
          ['desk', 'stay', 'you'],
          ['floor', 'book', 'contact'],
          ['office', 'carry', 'you'],
          ['out', 'lamp', 'you'],
          ['ledger', 'report', 'you'],
        ],
        trust: 5,
      });
      expect(r.clocks.sees ?? 0).toBe(0);
      expect(r.run.alarm).toBe(3);
      expect(r.tier).toBe('messy');
      expect(r.decks).toEqual([]);
    });

    it('the fifty sol confessed: the mark comes back off the fee, but it buys no deck', async () => {
      const r = await play({
        picks: [
          ['desk', 'stay', 'you'],
          ['floor', 'row', 'you'],
          ['office', 'carry', 'you'],
          ['out', 'lamp', 'you'],
          ['ledger', 'report', 'you:tip'],
        ],
        trust: 5,
      });
      expect(r.clocks).toMatchObject({ floor: 2 });
      expect(r.clocks.sees ?? 0).toBe(0);
      expect(r.tier).toBe('messy');
      expect(r.trust).toBe(6);
      expect(r.decks).toEqual([]);
    });

    it('by his own ways: the night lift, the folder carried, the dark — ALARM 4, and her word gets him out with part', async () => {
      const r = await play({
        picks: [
          ['desk', 'lift', 'you'],
          ['floor', 'book', 'you'],
          ['office', 'carry', 'you'],
          ['out', 'lamp', 'you'],
          ['getaway', 'vouch', 'you'],
        ],
        trust: 5,
      });
      expect(r.run.done).toBe(true);
      expect(r.run.alarm).toBe(4);
      expect(r.run.take).toBe('part');
      expect(r.tier).toBe('messy');
      expect(r.clocks.sees).toBe(2);
    });
  });

  it('the fifty sol confessed on a quiet night with crew: trust +1, but still no deck', async () => {
    const r = await play({
      people: ['dez'],
      picks: [
        ['desk', 'stay', 'you'],
        ['floor', 'row', 'you'],
        ['office', 'carry', 'dez'],
        ['out', 'lamp', 'you'],
        ['ledger', 'report', 'you:tip'],
      ],
      trust: 5,
    });
    expect(r.tier).toBe('clean');
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.trust).toBe(6);
    expect(r.decks).toEqual([]);
  });

  it('the worst of it on the glass: sees full, her trust −2, rep still paid, no deck', async () => {
    const r = await play({
      picks: [
        ['desk', 'lift', 'you'],
        ['floor', 'row', 'you'],
        ['office', 'read', 'you:copy'],
        ['out', 'lamp', 'you'],
        ['ledger', 'keep', 'you'],
      ],
      trust: 5,
    });
    expect(r.run.done).toBe(true);
    expect(r.clocks.sees).toBe(3);
    expect(r.trust).toBe(3);
    expect(bandOf(r.trust)).toBe('mid');
    expect(r.rep.length).toBe(1);
    expect(r.rep[0][0]).toBe('nexus');
    expect(r.decks).toEqual([]);
    expect(r.run.flags).toMatchObject({ sd_end: 'kept' });
  });

  it('ALARM 4: the night lift, a cart held in the basement, the glass looped — the fire stair, nothing in hand: blown', async () => {
    const r = await play({
      people: ['bo'],
      programs: ['sniffer'],
      picks: [
        ['desk', 'lift', 'you'],
        ['floor', 'row', 'bo'],
        ['office', 'read', 'p:sniffer'],
        ['getaway', 'stair', 'you'],
      ],
      trust: 5,
    });
    expect(r.run.done).toBe(true);
    expect(r.run.alarm).toBe(4);
    expect(r.run.take).toBe('none');
    expect(r.tier).toBe('blown');
    expect(r.decks).toEqual([]);
  });

  it('the lift a runner stalled is still on its fault at the getaway: down on the engineer’s key, with part', async () => {
    const r = await play({
      people: ['dez', 'bo'],
      picks: [
        ['desk', 'lift', 'dez'],
        ['floor', 'row', 'bo'],
        ['office', 'carry', 'you'],
        ['out', 'lamp', 'you'],
        ['getaway', 'stair', 'you:key'],
      ],
      trust: 5,
    });
    expect(r.run.done).toBe(true);
    expect(r.run.alarm).toBe(4);
    expect(r.run.take).toBe('part');
    expect(r.tier).toBe('messy');
    expect(r.clocks.sees ?? 0).toBe(0);
  });
});
