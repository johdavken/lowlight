/**
 * The Round (Kroll's desk, Task 8): the one repeating job at her desk, held to its design. The shared fixtures, `play`
 * and `jobShape` are in krolls-desk-kit.ts: here a run stands on Come Up done (`kroll_one`) and any `<asset>=burnt`
 * flags, its draw forced to one asset, on a story night (`day`). The claims about clean nights are proved by playing
 * them through the relay, so a fence's TAKE +1, LISTEN IN and FIREWALL count as the engine does.
 */
import { describe, expect, it } from 'vitest';
import { repDelta } from '../../shared/mission';
import { DAY, START } from '../../shared/clock';
import { chooseVariant, parseRun, questKey, type Beat } from '../../shared/quests';
import { allBeats, entryOf, forceDraw, jobShape, onRelay, play, read, relayWith, useKrollsDesk, waysOf, type DeskRelay, type Pick } from './krolls-desk-kit';

useKrollsDesk();

jobShape('the-round', { id: 'street', label: 'THE STREET', size: 3 });

type Asset = 'fence' | 'checker' | 'runner';
const ASSETS: Asset[] = ['fence', 'checker', 'runner'];

/** Come Up done before it, and these assets burnt (Clearance's). */
const flagsFor = (burnt: Asset[] = []) => ({ kroll_one: 'yes', ...Object.fromEntries(burnt.map((a) => [a, 'burnt'])) });

/** The relay with The Round on it: Come Up done before it, these assets burnt, the draw forced to `asset`, at night `day`. */
function roundRelay(o: { asset?: Asset; burnt?: Asset[]; trust: number; day?: number }): DeskRelay {
  return relayWith([entryOf('the-round', forceDraw(onRelay(read('the-round')), o.asset ? { tr_asset: o.asset } : {}))], { trust: o.trust, flags: flagsFor(o.burnt), day: o.day ?? 0 });
}

type RunOpts = Omit<Parameters<typeof play>[1], 'getaway' | 'on' | 'day' | 'flags' | 'draw'> & { getaway?: boolean };

/** Plays tonight's Round on `t` (the night its clock stands on); with `getaway`, ALARM 4 goes out through the crowd. */
const runRound = (t: DeskRelay, o: RunOpts) => play('the-round', { ...o, on: t, day: Math.floor((t.clock.now - START) / DAY), getaway: o.getaway ? 'crowd' : undefined });
const playRound = (o: RunOpts & { asset: Asset; burnt?: Asset[]; trust: number }) => runRound(roundRelay(o), o);
const listed = (t: DeskRelay) => t.listed().includes('the-round');

describe('The Round: the repeating job', () => {
  const q = entryOf('the-round', read('the-round'));
  /** The asset a meet version is for, by the `tr_round=` its cards set. */
  const roundOf = (b: Beat) => b.choices.flatMap((c) => c.tags.flatMap((t) => (t.kind === 'set' && t.name === 'tr_round' ? [t.value] : [])))[0];
  const versionFor = (id: string, a: Asset) => chooseVariant(q, id, { flags: { tr_round: a }, trust: 'mid', warmth: 'mid', with: 'adebayo' })!.beat;
  /** The three beats an asset's night plays: its meet, its count, its word. */
  const line = (a: Asset): Beat[] => [q.beats.get('meet')!.find((b) => roundOf(b) === a)!, versionFor('count', a), versionFor('word', a)];
  const youBy = (w: { key: { kind: string; name?: string } }) => (w.key.name ? `you:${w.key.name}` : 'you');
  /** Every line you can play through an asset's night with your own plain ways, plus `extra` picks a beat offers. */
  const soloLines = (a: Asset, extra: (b: Beat) => Pick[] = () => []): Pick[][] =>
    line(a).reduce<Pick[][]>(
      (acc, b) => {
        const here: Pick[] = [...b.choices.flatMap((c) => (c.ways ?? []).filter((w) => w.key.kind === 'you' && w.when === null).map((w): Pick => [b.id, c.id, youBy(w)])), ...extra(b)];
        return acc.flatMap((p) => here.map((x) => [...p, x]));
      },
      [[]],
    );
  const cardWith = (b: Beat, test: (w: ReturnType<typeof waysOf>[number]) => boolean) => b.choices.find((c) => (c.ways ?? []).some(test))!.id;
  /** The card of a beat with your plain way on THE STREET (in public), or on the glass. */
  const streetCard = (b: Beat) => cardWith(b, (w) => w.key.kind === 'you' && !w.key.name && w.when === null && (w.clocks.street ?? 0) > 0);
  const seesCard = (b: Beat) => cardWith(b, (w) => w.key.kind === 'you' && !w.key.name && w.when === null && (w.clocks.sees ?? 0) > 0);
  const muscleCard = (b: Beat) => cardWith(b, (w) => w.key.kind === 'spec' && w.key.spec === 'muscle');

  it('after Come Up, not once, small, paid in Spine, one asset drawn a night', () => {
    expect(q.after).toEqual([{ kind: 'set', name: 'kroll_one' }]);
    expect(q.once).toBeUndefined();
    expect(q.text).toBeUndefined();
    expect(q.district).toBe('spine');
    expect(q.takeSize).toBe(3);
    expect(q.draws).toEqual([{ name: 'tr_asset', values: ['fence', 'checker', 'runner'] }]);
  });

  it('a burnt draw falls through: a burnt fence to the checker, a burnt runner to the fence, or the checker with both burnt', () => {
    const want = (a: Asset, fence: boolean, runner: boolean): Asset => (a === 'runner' && !runner ? 'runner' : a !== 'checker' && !fence ? 'fence' : 'checker');
    // Nothing burns the checker (Clearance burns the fence or the runner), so these are every case that can happen.
    for (const a of ASSETS)
      for (const fence of [false, true])
        for (const runner of [false, true]) {
          const flags = { tr_asset: a, ...(fence ? { fence: 'burnt' } : {}), ...(runner ? { runner: 'burnt' } : {}) };
          const meet = chooseVariant(q, 'meet', { flags, trust: 'mid', warmth: 'mid', with: 'adebayo' })!.beat;
          expect(roundOf(meet), JSON.stringify(flags)).toBe(want(a, fence, runner));
        }
    expect(want('fence', true, false)).toBe('checker');
    expect(want('runner', false, true)).toBe('fence');
    expect(want('runner', true, true)).toBe('checker');
  });

  it("each asset's meet is written once: the fall-through needs no twin", () => {
    expect(q.beats.get('meet')!.map(roundOf)).toEqual(['runner', 'fence', 'checker']);
  });

  it('the three nights stand in two rooms, never the catwalk', () => {
    expect(ASSETS.map((a) => line(a)[0].room)).toEqual(['spine/deck-market', 'spine/long-haul', 'spine/deck-market']);
    expect(allBeats(q).map((b) => b.room)).not.toContain('spine/catwalk');
  });

  it('nothing outlasts tonight: no dated news, no week off, no change from now on, nothing by morning', () => {
    const text = [...allBeats(q).flatMap((b) => [b.text, ...b.views.map((v) => v.text), ...waysOf(b).map((w) => w.line)]), ...[...q.outcomes.values()].map((o) => o.text)].join('\n');
    expect(text).not.toMatch(/two nights ago|last week|on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b|the last one|a week off|for a week|from now on|next call|new place to wait|two runners|by morning/i);
  });

  for (const a of ASSETS)
    describe(`${a}'s night`, () => {
      it("its count and its word stand in its meet's room", () => {
        const [meet, count, word] = line(a);
        expect(count.room).toBe(meet.room);
        expect(word.room).toBe(meet.room);
      });

      it('TAKE across its beats fills the take-size exactly, never more', () => {
        expect(line(a).reduce((n, b) => n + Math.max(...waysOf(b).map((w) => w.take)), 0)).toBe(q.takeSize);
      });

      for (const clock of ['sees', 'street'])
        it(`${clock}: up on two of its beats, down on one`, () => {
          const beats = line(a);
          expect(beats.filter((b) => waysOf(b).some((w) => (w.clocks[clock] ?? 0) > 0)).length).toBeGreaterThanOrEqual(2);
          expect(beats.filter((b) => waysOf(b).some((w) => (w.clocks[clock] ?? 0) < 0)).length).toBeGreaterThanOrEqual(1);
        });

      it('your own ways alone can reach ALARM 4', () => {
        expect(line(a).reduce((n, b) => n + Math.max(0, ...waysOf(b).filter((w) => w.key.kind === 'you' && w.when === null).map((w) => w.alarm)), 0)).toBeGreaterThanOrEqual(4);
      });

      it('a double play behind a flag its count set, and it costs the last slice of TAKE', () => {
        const [, count, word] = line(a);
        const sets = new Set(waysOf(count).flatMap((w) => w.sets.map((s) => s.name)));
        const doubles = waysOf(word).filter((w) => (w.clocks.sees ?? 0) < 0 && (w.clocks.street ?? 0) < 0);
        expect(doubles).toHaveLength(1);
        expect(doubles[0].when?.some((c) => c.kind === 'flag' && sets.has(c.name))).toBe(true);
        expect(doubles[0].take).toBe(0);
      });

      it('every crew way has a price besides the go', () => {
        for (const b of line(a))
          for (const w of waysOf(b).filter((w) => w.key.kind !== 'you'))
            expect(w.heat + w.alarm + w.cut + w.lose + w.sets.length + Object.values(w.clocks).filter((n) => n > 0).length, `${b.id} ${w.to}`).toBeGreaterThan(0);
      });

      it('alone, every line played: an empty glass is never clean, and a clean night has a mark on the glass and THE STREET at 1 or less', async () => {
        const ends: { picks: Pick[]; tier: unknown; sees: number; street: number }[] = [];
        for (const picks of soloLines(a)) {
          const r = await playRound({ asset: a, picks, trust: 4, getaway: true });
          expect(r.run.done, JSON.stringify(picks)).toBe(true);
          ends.push({ picks, tier: r.tier, sees: r.clocks.sees ?? 0, street: r.clocks.street ?? 0 });
        }
        expect(ends.some((e) => e.sees === 0)).toBe(true);
        expect(ends.filter((e) => e.sees === 0 && e.tier === 'clean')).toEqual([]);
        const clean = ends.filter((e) => e.tier === 'clean');
        expect(clean.length).toBeGreaterThan(0);
        for (const e of clean) expect([e.sees >= 1, e.street <= 1], JSON.stringify(e)).toEqual([true, true]);
      });

      it('one muscle recruit is enough for a clean night, at a mark on each clock', async () => {
        const [meet, count, word] = line(a);
        const r = await playRound({ asset: a, people: ['bo'], picks: [['meet', streetCard(meet), 'you'], ['count', seesCard(count), 'you'], ['word', muscleCard(word), 'bo']], trust: 4 });
        expect(r.tier).toBe('clean');
        expect(r.clocks).toMatchObject({ sees: 1, street: 1 });
        expect(r.trust).toBe(4);
      });

      it('THE STREET at 2 at the end costs the clean night, with a fence brought, ears listening in and muscle on the word', async () => {
        const [meet, count, word] = line(a);
        const r = await playRound({ asset: a, people: ['bo', 'fen', 'ash'], picks: [['meet', streetCard(meet), 'you'], ['count', streetCard(count), 'you'], ['word', muscleCard(word), 'bo']], moves: [['count', 'ash']], trust: 4 });
        expect(r.clocks.street).toBe(2);
        expect(r.run.alarm ?? 0).toBeLessThan(2);
        expect(r.tier).not.toBe('clean');
      });

      it('THE STREET full: not clean even with a fence brought, and the Spine takes HEAT 2', async () => {
        const [meet, count, word] = line(a);
        const r = await playRound({ asset: a, people: ['fen'], picks: [['meet', streetCard(meet), 'you'], ['count', streetCard(count), 'you'], ['word', streetCard(word), 'you']], trust: 4 });
        expect(r.clocks.street).toBe(3);
        expect(r.clocks.sees ?? 0).toBe(0);
        expect(r.tier).not.toBe('clean');
        expect(r.heat).toBeGreaterThanOrEqual(2);
      });
    });

  it('alone with a program (the runner) or her way (the checker): a clean night still has a mark on the glass and THE STREET at 1 or less', async () => {
    const withKind = (kind: 'program' | 'contact', by: string) => (b: Beat): Pick[] => b.choices.flatMap((c) => ((c.ways ?? []).some((w) => w.key.kind === kind) ? [[b.id, c.id, by] as Pick] : []));
    for (const [a, programs, extra, by] of [['runner', ['solvent'], withKind('program', 'p:solvent'), 'p:solvent'], ['checker', [], withKind('contact', 'contact'), 'contact']] as const)
      for (const picks of soloLines(a, extra).filter((p) => p.some(([, , x]) => x === by))) {
        const r = await playRound({ asset: a, programs: [...programs], picks, trust: 4, getaway: true });
        if (r.tier === 'clean') expect([(r.clocks.sees ?? 0) >= 1, (r.clocks.street ?? 0) <= 1], JSON.stringify(picks)).toEqual([true, true]);
      }
  });

  // A loud way never keeps the clean night (second re-review): whatever soaks its ALARM, it fills no TAKE.
  for (const a of ASSETS)
    for (const [how, o] of [
      ['FIREWALL', { programs: ['firewall'], moves: [['word', 'p:firewall']] }],
      ["a face's COVER STORY", { people: ['mia'], moves: [['word', 'mia']] }],
    ] as const)
      it(`${a}: the loud way on the word under ${how} is not clean, however little ALARM lands`, async () => {
        const [meet, count, word] = line(a);
        const loud = cardWith(word, (w) => w.key.kind === 'you' && w.key.name === 'hard');
        const r = await playRound({ asset: a, ...o, programs: 'programs' in o ? [...o.programs] : [], people: 'people' in o ? [...o.people] : [], moves: o.moves.map(([b, c]) => [b, c] as [string, string]), picks: [['meet', streetCard(meet), 'you'], ['count', streetCard(count), 'you'], ['word', loud, 'you:hard']], trust: 4 });
        expect(r.run.alarm ?? 0).toBeLessThan(2);
        expect(r.tier).not.toBe('clean');
      });

  it('alone with FIREWALL or SCRUB loaded and played on any beat, no line ends clean with an empty glass', async () => {
    for (const a of ASSETS)
      for (const picks of soloLines(a))
        for (const program of ['firewall', 'scrub'])
          for (const beat of ['meet', 'count', 'word']) {
            const r = await playRound({ asset: a, programs: [program], moves: [[beat, `p:${program}`]], tryMoves: true, picks, trust: 4, getaway: true });
            if ((r.clocks.sees ?? 0) === 0) expect(r.tier, `${a} ${program}@${beat} ${JSON.stringify(picks)}`).not.toBe('clean');
          }
  });

  it('a loud way fills no TAKE, on the count or the word', () => {
    for (const b of allBeats(q).filter((b) => b.id === 'count' || b.id === 'word')) for (const w of waysOf(b).filter((w) => w.key.kind === 'you' && w.key.name === 'hard')) expect(w.take, w.to).toBe(0);
  });

  it("the checker's FIREWALL can't buy a clean night at THE STREET 2", async () => {
    const r = await playRound({ asset: 'checker', programs: ['firewall'], picks: [['meet', 'booth', 'you'], ['count', 'press', 'you'], ['word', 'seals', 'you:hard']], moves: [['word', 'p:firewall']], trust: 4 });
    expect(r.run.alarm).toBeLessThan(2);
    expect(r.clocks.street).toBe(2);
    expect(r.tier).not.toBe('clean');
  });

  it('each night has its own lever: the fence has no program but a face buys back; the checker has her way; the runner\'s pay is never sees-free alone', () => {
    const [, fenceCount] = line('fence');
    expect(waysOf(fenceCount).some((w) => w.key.kind === 'program')).toBe(false);
    expect(waysOf(fenceCount).some((w) => w.key.kind === 'spec' && w.key.spec === 'face' && w.cut > 0)).toBe(true);
    expect(waysOf(line('checker')[1]).some((w) => w.key.kind === 'contact')).toBe(true);
    const pay = line('runner')[1].choices.find((c) => c.id === 'pay')!;
    for (const w of pay.ways!.filter((w) => w.key.kind === 'you')) expect(w.clocks.sees ?? 0).toBeGreaterThan(0);
  });

  it("the checker's word takes THE STREET down only with her off the gate", () => {
    for (const w of waysOf(line('checker')[2]).filter((w) => (w.clocks.street ?? 0) < 0)) expect(q.outcomes.get(w.to)!.text, w.to).toMatch(/off the gate/);
  });

  it('every crew or program way says what she could hear (told:)', () => {
    for (const w of allBeats(q).flatMap(waysOf).filter((w) => w.key.kind === 'spec' || w.key.kind === 'program')) expect(w.told, w.to).toBeTruthy();
  });

  it('her view on what one of his people heard says she knows only what he tells her', () => {
    for (const a of ASSETS) {
      const v = line(a)[2].views.find((v) => v.when?.some((c) => c.kind === 'flag' && c.name === 'tr_heard'));
      expect(v?.text).toMatch(/only what he tells you/);
    }
  });

  it('nothing tells her an empty glass earns anything: a repeating job only loses her trust', () => {
    for (const v of allBeats(q).flatMap((b) => b.views)) expect(v.text).not.toMatch(/nothing (he did|on the glass)|you note that/i);
  });

  // Crew keep both clocks still: a runner at the meet, a face, a program or her own way at the count, muscle on the word.
  const CLEAN: Record<Asset, { people: string[]; programs?: string[]; picks: Pick[] }> = {
    fence: { people: ['dez', 'mia', 'bo'], picks: [['meet', 'counter', 'dez'], ['count', 'count', 'mia'], ['word', 'slip', 'bo']] },
    checker: { people: ['dez', 'bo'], picks: [['meet', 'booth', 'dez'], ['count', 'count', 'contact'], ['word', 'seals', 'bo']] },
    runner: { people: ['dez', 'bo'], programs: ['solvent'], picks: [['meet', 'trade', 'dez'], ['count', 'pay', 'p:solvent'], ['word', 'rule', 'bo']] },
  };

  // The engine rule from f8a53c24: on a job that isn't once, an empty glass doesn't raise her trust.
  for (const a of ASSETS)
    it(`${a}: a clean night with both clocks still: clean, Spine rep +6, her trust unmoved`, async () => {
      const r = await playRound({ asset: a, ...CLEAN[a], trust: 4 });
      expect(r.run.done).toBe(true);
      expect(r.run.flags.tr_round).toBe(a);
      expect(r.tier).toBe('clean');
      expect(r.clocks.sees ?? 0).toBe(0);
      expect(r.clocks.street ?? 0).toBe(0);
      expect(r.trust).toBe(4);
      expect(r.rep).toEqual([['spine', repDelta(1, 'clean')]]);
      expect(repDelta(1, 'clean')).toBe(6);
    });

  it('alone, a clean night: two marks on the glass, THE STREET kept down, Spine +6', async () => {
    const r = await playRound({ asset: 'fence', picks: [['meet', 'counter', 'you'], ['count', 'count', 'you'], ['word', 'short', 'you']], trust: 4 });
    expect(r.tier).toBe('clean');
    expect(r.clocks).toMatchObject({ sees: 2 });
    expect(r.clocks.street ?? 0).toBe(0);
    expect(r.rep).toEqual([['spine', repDelta(1, 'clean')]]);
  });

  it('the worst of it on the glass: sees full, her trust −2, rep still paid', async () => {
    const r = await playRound({ asset: 'checker', picks: [['meet', 'cab', 'you'], ['count', 'count', 'you'], ['word', 'off', 'you']], trust: 4 });
    expect(r.run.done).toBe(true);
    expect(r.clocks.sees).toBe(3);
    expect(r.trust).toBe(2);
    expect(r.rep).toEqual([['spine', repDelta(1, 'clean')]]);
  });

  it('the double play: ears at the count, then the name on the glass; both clocks down, a part take', async () => {
    const r = await playRound({ asset: 'runner', people: ['ash'], picks: [['meet', 'wok', 'you'], ['count', 'rest', 'ash'], ['word', 'rule', 'you:named']], trust: 4 });
    expect(r.run.flags).toMatchObject({ tr_heard: 'yes' });
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.clocks.street ?? 0).toBe(0);
    expect(r.tier).toBe('messy');
    expect(r.trust).toBe(4);
  });

  it('the fence drawn but burnt: the checker is collected instead', async () => {
    const r = await playRound({ asset: 'fence', burnt: ['fence'], ...CLEAN.checker, trust: 4 });
    expect(r.run.flags).toMatchObject({ tr_asset: 'fence', tr_round: 'checker' });
    expect(r.tier).toBe('clean');
  });

  it('the runner drawn but burnt: round to the fence', async () => {
    const r = await playRound({ asset: 'runner', burnt: ['runner'], ...CLEAN.fence, trust: 4 });
    expect(r.run.flags).toMatchObject({ tr_asset: 'runner', tr_round: 'fence' });
    expect(r.tier).toBe('clean');
  });

  it('the runner drawn with the runner and the fence burnt: the checker', async () => {
    const r = await playRound({ asset: 'runner', burnt: ['runner', 'fence'], ...CLEAN.checker, trust: 4 });
    expect(r.run.flags).toMatchObject({ tr_asset: 'runner', tr_round: 'checker' });
    expect(r.tier).toBe('clean');
  });

  it('your own ways to ALARM 4: the getaway; the floor pulls you out marked, the crowd costs the last of a loud night', async () => {
    const loud: Pick[] = [['meet', 'counter', 'you'], ['count', 'lean', 'you:hard'], ['word', 'slip', 'you:hard']];
    const floor = await playRound({ asset: 'fence', picks: [...loud, ['getaway', 'floor', 'you']], trust: 4 });
    expect(floor.run.getaway).toBe(true);
    expect(floor.run.done).toBe(true);
    expect(floor.tier).toBe('messy');
    expect(floor.clocks.sees).toBe(2);
    // Two loud ways fill no TAKE, so the crowd's lose 1 takes the meet's only slice: nothing came away.
    const crowd = await playRound({ asset: 'fence', picks: [...loud, ['getaway', 'crowd', 'you']], trust: 4 });
    expect(crowd.run.done).toBe(true);
    expect(crowd.tier).toBe('blown');
  });

  it("the board prints what the getaway will do: at TAKE 1, LOSE THEM's lose 1 leaves TAKE → 0 (blown), not its outcome's PART", async () => {
    const t = roundRelay({ asset: 'fence', trust: 4 });
    await runRound(t, { picks: [['meet', 'counter', 'you'], ['count', 'lean', 'you:hard'], ['word', 'slip', 'you:hard']] });
    const board = t.relay.questState('soren').active!.crew!;
    expect(parseRun(t.db.getMeta(questKey('soren', 'the-round@0')))).toMatchObject({ beat: 'getaway', takeFill: 1 });
    const way = (card: string) => board.cards.find((c) => c.id === card)!.ways[0];
    expect(way('crowd')).toMatchObject({ lose: 1, leaves: 'none' });
    expect(way('floor').leaves).toBe('part');
  });

  it('not once: gone from her desk the night it was run, listed again the next', async () => {
    const t = roundRelay({ asset: 'fence', trust: 4 });
    expect(listed(t)).toBe(true);
    await runRound(t, CLEAN.fence);
    expect(listed(t)).toBe(false);
    t.clock.now += DAY;
    expect(listed(t)).toBe(true);
    const r = await runRound(t, CLEAN.fence);
    expect(r.run.done).toBe(true);
    expect(r.tier).toBe('clean');
  });

  it('never names Ari Kade', () => {
    expect(read('the-round')).not.toMatch(/Kade/);
  });
});
