/**
 * Clearance (Kroll's desk, Task 7): a burnt runner's room cleared before the grey come for him, held to its design.
 * The shared fixtures and `jobShape` are in krolls-desk-kit.ts.
 */
import { describe, expect, it } from 'vitest';
import { repDelta } from '../../shared/mission';
import { holds } from '../../shared/quests';
import { allBeats, entryOf, jobShape, onRelay, play as playJob, read, relayWith, useKrollsDesk, waysOf, type Pick } from './krolls-desk-kit';

useKrollsDesk();

/** The kit's `play` with Come Up done before it (kroll_one), so the job starts through its real `after:` gate. */
const play = (id: 'clearance', o: Omit<Parameters<typeof playJob>[1], 'flags'>) => playJob(id, { ...o, flags: { kroll_one: 'yes' } });

jobShape('clearance', { id: 'grey', label: 'THE GREY', size: 4 }, { exitsSet: ['niko'] });

describe('Clearance: the burnt runner', () => {
  const q = entryOf('clearance', read('clearance'));
  const main = ['room', 'kept', 'ramp', 'rigs'];

  it("opens after Kroll's standing order, once, paid in Spine", () => {
    const ctx = (flags: Record<string, string>) => ({ flags, trust: 'mid' as const, warmth: 'mid' as const, with: 'adebayo' });
    expect(holds(q.after, ctx({}))).toBe(false);
    expect(holds(q.after, ctx({ kroll_one: 'yes' }))).toBe(true);
    expect(q.once).toBe(true);
    expect(q.district).toBe('spine');
    expect(q.pitch).toBeTruthy();
  });

  it("the relay won't start it without kroll_one, and starts it once Come Up has set it", async () => {
    const go = { crew: true as const, people: [], programs: [] };
    const job = () => [entryOf('clearance', onRelay(read('clearance')))];
    expect(await relayWith(job()).relay.startQuest('soren', 'clearance', go)).toBe("that job isn't open here");
    expect(await relayWith(job(), { flags: { kroll_one: 'yes' } }).relay.startQuest('soren', 'clearance', go)).not.toBeTypeOf('string');
  });

  it('TAKE across the beats fills the job exactly: one at most a beat, four beats, take-size 4', () => {
    expect(q.takeSize).toBe(4);
    for (const id of main) for (const b of q.beats.get(id)!) expect(Math.max(...waysOf(b).map((w) => w.take)), id).toBe(1);
  });

  it('every crew way off the glass says what she could hear (told:), and costs something besides the go', () => {
    // A price: HEAT, ALARM, a lose or a cut, the slice of TAKE it leaves, a mark on the glass, or THE GREY on a beat's
    // plain version (entered with the grey under 3, so it brings the late versions nearer). Grey on a late version may
    // land on a full clock, and a `set` is a payoff: neither counts.
    for (const b of allBeats(q))
      for (const w of waysOf(b).filter((w) => w.key.kind === 'spec' || w.key.kind === 'program')) {
        expect(w.told, `${w.key.kind} → ${w.to}`).toBeTruthy();
        const priced = w.heat > 0 || w.alarm > 0 || w.lose > 0 || w.cut > 0 || w.take === 0 || (w.clocks.sees ?? 0) > 0 || (b.when === null && (w.clocks.grey ?? 0) > 0);
        expect(priced, `${b.id} ${w.key.kind} → ${w.to}`).toBe(true);
      }
  });

  it("the room, what he kept and the ramp hold the Long Haul's room; the rigs are on the catwalk", () => {
    const room = (id: string) => q.beats.get(id)!.map((b) => b.room);
    for (const id of ['room', 'kept', 'ramp']) expect(room(id).every((r) => r === 'spine/long-haul'), id).toBe(true);
    expect(room('rigs').every((r) => r === 'spine/catwalk')).toBe(true);
  });

  it('the late beats have versions on THE GREY, read first', () => {
    const at = (n: number) => [{ kind: 'count', name: 'grey', op: '>=', value: n }];
    expect(q.beats.get('ramp')!.map((b) => b.when)).toEqual([at(3), null]);
    expect(q.beats.get('rigs')!.map((b) => b.when)).toEqual([at(4), at(3), null]);
  });

  it("THE GREY full bites: on the catwalk every handover and the runner's mercy are on the glass, the lie buys nothing, and mercy is dearer", () => {
    const [full, late, plain] = q.beats.get('rigs')!;
    const hand = (b: typeof full) => b.choices.find((c) => c.id === 'hand')!.ways!;
    const go = (b: typeof full) => b.choices.find((c) => c.id === 'go')!.ways!;
    expect(hand(full).every((w) => (w.clocks.sees ?? 0) >= 1)).toBe(true);
    expect(hand(full).some((w) => w.key.kind === 'you' && w.key.name === 'ride')).toBe(false);
    expect(go(full).every((w) => (w.clocks.sees ?? 0) >= 1)).toBe(true);
    for (const [k, i] of [['you', 0], ['spec', 1]] as const) {
      expect(go(full)[i].key.kind).toBe(k);
      expect(go(full)[i].heat).toBeGreaterThan(go(late)[i].heat);
    }
    // At the hatch the band and the lie still play, but neither is free: HEAT 2 each. Below it, both are free.
    const gated = (b: typeof full, name: string) => hand(b).find((w) => w.key.kind === 'you' && w.key.name === name)!;
    expect(gated(late, 'band')).toMatchObject({ take: 1, heat: 2 });
    expect(gated(late, 'ride')).toMatchObject({ take: 1, heat: 2 });
    expect(gated(late, 'ride').clocks.sees ?? 0).toBe(0);
    expect(gated(plain, 'band').heat + gated(plain, 'ride').heat).toBe(0);
  });

  it('mercy by your own hand fills WHAT KROLL SEES to the top in one way; a runner can do it off the glass', () => {
    // Off the glass below the full grey; on the full catwalk nothing is unseen (tested above).
    for (const [i, b] of q.beats.get('rigs')!.entries()) {
      const go = b.choices.find((c) => c.id === 'go')!;
      expect(go.ways!.find((w) => w.key.kind === 'you' && w.when === null)!.clocks.sees).toBe(3);
      if (i > 0) expect(go.ways!.some((w) => w.key.kind === 'spec' && w.key.spec === 'runner' && (w.clocks.sees ?? 0) === 0)).toBe(true);
    }
  });

  it("the rigs' cards carry Niko's fate (a throw keeps a card's set): mercy gives the hire and burns the fence; the full catwalk burns Pim", () => {
    const tags = (c: { tags: { kind: string; name?: string; value?: string }[] }) => c.tags.flatMap((t) => (t.kind === 'set' ? [`${t.name}=${t.value}`] : []));
    const [full] = q.beats.get('rigs')!;
    for (const b of q.beats.get('rigs')!)
      for (const c of b.choices) {
        expect(tags(c), `${b.id} ${c.id}`).toContain('cl_at=rigs');
        for (const w of c.ways!) {
          const o = q.outcomes.get(w.to)!;
          expect(w.sets.some((s) => ['niko', 'fence', 'runner'].includes(s.name)), w.to).toBe(false);
          if (c.id === 'go') {
            expect(tags(c)).toEqual(expect.arrayContaining(['niko=loose', 'fence=burnt']));
            expect(o.effects.recruit, w.to).toMatchObject({ spec: 'runner', sex: 'man' });
            expect(o.effects.recruit?.pitch, w.to).toBeTruthy();
            expect(o.text, w.to).toMatch(/Halloran/);
          } else {
            expect(tags(c)).toContain('niko=collected');
            expect(tags(c).some((t) => t.startsWith('fence=')), w.to).toBe(false);
            expect(o.effects.recruit, w.to).toBeUndefined();
          }
          expect(tags(c).includes('runner=burnt'), `${c.id} → ${w.to}`).toBe(b === full && c.id === 'hand');
        }
      }
    const [atRigs, plain] = q.beats.get('getaway')!;
    expect(atRigs.when).toEqual([{ kind: 'flag', name: 'cl_at', op: '=', value: 'rigs' }]);
    expect(atRigs.room).toBe('spine/catwalk');
    for (const w of atRigs.choices.flatMap((c) => c.ways!)) expect(w.sets.some((s) => s.name === 'niko'), w.to).toBe(false);
    for (const w of plain.choices.flatMap((c) => c.ways!)) expect(w.sets, w.to).toContainEqual({ name: 'niko', value: 'collected' });
  });

  it('never names the runner before Niko', () => {
    expect(read('clearance')).not.toMatch(/\bAri\b|\bKade\b/);
  });

  // Nothing on the glass and THE GREY held off: muscle on the stair, a runner down the drain stack with the box, ears on
  // the yard's band, and the handover timed on that band.
  const CLEAN: Pick[] = [
    ['room', 'stair', 'bo'],
    ['kept', 'box', 'dez'],
    ['ramp', 'yard', 'ash'],
    ['rigs', 'hand', 'you:band'],
  ];

  it('a clean run with crew: clean, nothing on the glass, the grey held back, her trust +1, Spine rep +6, niko=collected', async () => {
    const r = await play('clearance', { people: ['bo', 'dez', 'ash'], picks: CLEAN, trust: 4 });
    expect(r.run.done).toBe(true);
    expect(r.tier).toBe('clean');
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.clocks.grey).toBe(1);
    expect(r.trust).toBe(5);
    expect(r.moves).toEqual([[1, expect.any(String)]]);
    expect(r.rep).toEqual([['spine', repDelta(1, 'clean')]]);
    expect(repDelta(1, 'clean')).toBe(6);
    expect(r.run.flags).toMatchObject({ niko: 'collected', cl_band: 'yes', cl_stair: 'held' });
    expect(r.run.recruit).toBeUndefined();
  });

  it('alone, the glass kept empty costs the clean night: at the hatch he walks away and leaves the burner', async () => {
    const solo: Pick[] = [
      ['room', 'news', 'you'],
      ['kept', 'deck', 'contact'],
      ['ramp', 'cook', 'you'],
    ];
    const at = await play('clearance', { picks: solo });
    expect(at.clocks.grey).toBe(3);
    expect(at.run).toMatchObject({ beat: 'rigs', variant: 1 });
    const r = await play('clearance', { picks: [...solo, ['rigs', 'hand', 'you:walk']], trust: 4 });
    expect(r.tier).toBe('messy');
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.trust).toBe(5);
    expect(r.run.flags).toMatchObject({ niko: 'collected' });
  });

  it('the lie feeds THE GREY: alone, the liar meets the grey on the catwalk, and every handover there is marked', async () => {
    const liar: Pick[] = [
      ['room', 'news', 'you:moving'],
      ['kept', 'deck', 'contact'],
      ['ramp', 'cook', 'you'],
    ];
    const at = await play('clearance', { picks: liar });
    expect(at.clocks.grey).toBe(4);
    expect(at.run).toMatchObject({ beat: 'rigs', variant: 0 });
    const r = await play('clearance', { picks: [...liar, ['rigs', 'hand', 'you']], trust: 4 });
    expect(r.clocks.sees).toBe(1);
    expect(r.trust).toBe(4);
    expect(r.moves).toEqual([]);
    expect(r.run.flags).toMatchObject({ niko: 'collected', runner: 'burnt' });
  });

  it('ears at the late counter listen without delaying: the band is read at the hatch, at HEAT 2 there', async () => {
    const r = await play('clearance', {
      people: ['ash'],
      picks: [
        ['room', 'news', 'you'],
        ['kept', 'deck', 'you'],
        ['ramp', 'counter', 'ash'],
        ['rigs', 'hand', 'you:band'],
      ],
      trust: 4,
    });
    expect(r.clocks.grey).toBe(3);
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.tier).toBe('clean');
    expect(r.run.flags).toMatchObject({ cl_band: 'yes', niko: 'collected' });
    expect(r.run.flags.runner).toBeUndefined();
  });

  it("the face sends the grey to the wrong stair: THE GREY comes down a step, and the late rigs aren't reached", async () => {
    const r = await play('clearance', {
      people: ['mia'],
      picks: [
        ['room', 'news', 'you'],
        ['kept', 'deck', 'contact'],
        ['ramp', 'cook', 'mia'],
      ],
    });
    expect(r.clocks.grey).toBe(1);
    expect(r.run).toMatchObject({ beat: 'rigs', variant: 2 });
  });

  it('a throw missed on the rigs after mercy: the getaway on the catwalk, the hire stands, Niko is never collected', async () => {
    const r = await play('clearance', {
      people: ['mia'],
      picks: [
        ['room', 'news', 'you'],
        ['kept', 'deck', 'you:heel'],
        ['ramp', 'cook', 'you'],
        ['rigs', 'go', 'mia'],
        ['getaway', 'floor', 'you'],
      ],
    });
    expect(r.run.done).toBe(true);
    expect(r.run.picks.map((p) => p.beat)).toEqual(['room', 'kept', 'ramp', 'rigs', 'getaway']);
    expect(r.run.recruit).toMatchObject({ spec: 'runner' });
    expect(r.run.flags).toMatchObject({ cl_at: 'rigs', niko: 'loose', fence: 'burnt' });
  });

  it('a throw missed on the full catwalk\'s handover: the getaway on the catwalk tells that Pim is gone', async () => {
    const r = await play('clearance', {
      people: ['ash'],
      picks: [
        ['room', 'news', 'you:moving'],
        ['kept', 'box', 'you'],
        ['ramp', 'counter', 'you:stair'],
        ['rigs', 'hand', 'ash'],
        ['getaway', 'floor', 'you'],
      ],
    });
    expect(r.run.done).toBe(true);
    expect(r.run.picks.map((p) => p.beat)).toEqual(['room', 'kept', 'ramp', 'rigs', 'getaway']);
    expect(r.clocks.grey).toBe(4);
    expect(r.run.flags).toMatchObject({ cl_at: 'rigs', niko: 'collected', runner: 'burnt' });
    const told = r.db.recentMessages('soren', 80).map((m) => m.text).join('\n');
    expect(told).toMatch(/Pim watched the whole of it/);
    for (const id of ['pulled-off', 'gone-over']) expect(q.outcomes.get(id)!.versions!.map((v) => v.when)).toContainEqual([{ kind: 'flag', name: 'runner', op: '=', value: 'burnt' }]);
  });

  it('a throw missed on the rigs after the handover: the getaway on the catwalk, Niko collected, no hire', async () => {
    const r = await play('clearance', {
      people: ['ash'],
      picks: [
        ['room', 'news', 'you'],
        ['kept', 'deck', 'you:heel'],
        ['ramp', 'cook', 'you'],
        ['rigs', 'hand', 'ash'],
        ['getaway', 'rigs', 'you'],
      ],
    });
    expect(r.run.done).toBe(true);
    expect(r.run.picks.map((p) => p.beat)).toEqual(['room', 'kept', 'ramp', 'rigs', 'getaway']);
    expect(r.run.recruit).toBeUndefined();
    expect(r.run.flags).toMatchObject({ cl_at: 'rigs', niko: 'collected' });
    expect(r.run.flags.fence).toBeUndefined();
  });

  it('alone and by the rule without the lie, the grey at the hatch see him: one mark on the glass, no trust move', async () => {
    const r = await play('clearance', {
      picks: [
        ['room', 'news', 'you'],
        ['kept', 'deck', 'contact'],
        ['ramp', 'cook', 'you'],
        ['rigs', 'hand', 'you'],
      ],
      trust: 4,
    });
    expect(r.tier).toBe('clean');
    expect(r.clocks).toMatchObject({ sees: 1, grey: 3 });
    expect(r.trust).toBe(4);
    expect(r.moves).toEqual([]);
  });

  it('the worst of it on the glass, mercy last: sees full, her trust −2, rep still paid, and Niko is a runner for hire', async () => {
    const r = await play('clearance', {
      picks: [
        ['room', 'stair', 'you'],
        ['kept', 'box', 'you:money'],
        ['ramp', 'cook', 'you:cash'],
        ['rigs', 'go', 'you'],
      ],
      trust: 4,
    });
    expect(r.run.done).toBe(true);
    expect(r.clocks.sees).toBe(3);
    expect(r.clocks.grey ?? 0).toBe(0);
    expect(r.trust).toBe(2);
    expect(r.moves).toEqual([[-2, expect.any(String)]]);
    expect(r.rep).toEqual([['spine', repDelta(1, 'clean')]]);
    expect(r.run.flags).toMatchObject({ cl_money: 'his', niko: 'loose', fence: 'burnt' });
    expect(r.run.flags.runner).toBeUndefined();
    expect(r.run.recruit).toMatchObject({ spec: 'runner', sex: 'man' });
  });

  it('a runner lets him go off the glass with the grey on the ladder: sees stays empty, trust +1, and he is still a hire', async () => {
    const r = await play('clearance', {
      people: ['dez'],
      picks: [
        ['room', 'news', 'you'],
        ['kept', 'deck', 'contact'],
        ['ramp', 'cook', 'you'],
        ['rigs', 'go', 'dez'],
      ],
      trust: 4,
    });
    expect(r.run.done).toBe(true);
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.trust).toBe(5);
    expect(r.run.recruit).toMatchObject({ spec: 'runner', sex: 'man' });
    expect(r.run.flags).toMatchObject({ niko: 'loose', fence: 'burnt' });
  });

  it('a loud night by his own hand reaches ALARM 4 on the ramp: the getaway, and Niko collected', async () => {
    const r = await play('clearance', {
      picks: [
        ['room', 'news', 'you:moving'],
        ['kept', 'deck', 'you:heel'],
        ['ramp', 'yard', 'you:scheduler'],
        ['getaway', 'floor', 'you'],
      ],
      trust: 4,
    });
    expect(r.run.done).toBe(true);
    expect(r.run.picks.map((p) => p.beat)).toEqual(['room', 'kept', 'ramp', 'getaway']);
    expect(r.clocks.sees).toBe(2);
    expect(r.trust).toBe(4);
    expect(r.run.flags).toMatchObject({ niko: 'collected', cl_moving: 'yes' });
  });

  it('a slow, thorough night fills THE GREY: the ramp and the rigs play their late versions', async () => {
    const slow: Pick[] = [
      ['room', 'news', 'you'],
      ['kept', 'deck', 'you'],
    ];
    const atRamp = await play('clearance', { picks: slow });
    expect(atRamp.clocks.grey).toBe(3);
    expect(atRamp.run).toMatchObject({ beat: 'ramp', variant: 0 });
    const atRigs = await play('clearance', { picks: [...slow, ['ramp', 'counter', 'you:stair']] });
    expect(atRigs.run).toMatchObject({ beat: 'rigs', variant: 0 });
    const end = await play('clearance', { picks: [...slow, ['ramp', 'counter', 'you:stair'], ['rigs', 'hand', 'you:walk']] });
    expect(end.clocks.grey).toBe(4);
    expect(end.run.done).toBe(true);
    expect(end.tier).toBe('messy');
    expect(end.clocks.sees).toBe(1);
    expect(end.run.flags.runner).toBe('burnt');
    expect(end.run.flags).toMatchObject({ niko: 'collected' });
  });
});
