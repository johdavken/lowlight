/**
 * Come Up (Kroll's desk, Task 6): the standing order, held to its design; and the desk together (Task 9): what lists at
 * her desk when, and the Spine rep her jobs earn toward Rue's Arrears. The shared fixtures and `jobShape` are in
 * krolls-desk-kit.ts.
 */
import { describe, expect, it } from 'vitest';
import { repDelta } from '../../shared/mission';
import type { Way } from '../../shared/crew-ways';
import { DAY, START } from '../../shared/clock';
import { allBeats, entryOf, forceDraw, jobShape, KROLL_START, onRelay, play, read, relayWith, useKrollsDesk, waysOf, type Pick } from './krolls-desk-kit';

useKrollsDesk();

jobShape('come-up', { id: 'nerve', label: 'HIS NERVE', size: 3 }, { setsKrollOne: true, exitsSet: ['kroll_one'] });

describe('Come Up: the standing order', () => {
  const q = entryOf('come-up', read('come-up'));

  it('a standing order: open from the start, once, never texted, paid in Spine', () => {
    expect(q.after).toBeNull();
    expect(q.text).toBeUndefined();
    expect(q.once).toBe(true);
    expect(q.district).toBe('spine');
    expect(q.pitch).toBeTruthy();
  });

  it('the first beat teaches the clock: one way plainly fills sees, and her view there tells her to say so', () => {
    const first = q.beats.get(q.first)![0];
    const fills = waysOf(first).filter((w) => (w.clocks.sees ?? 0) > 0);
    expect(fills).toHaveLength(1);
    const flag = fills[0].sets[0];
    expect(flag).toBeDefined();
    expect(first.views.some((v) => v.contact === 'adebayo' && v.when?.some((c) => c.kind === 'flag' && c.name === flag.name))).toBe(true);
  });

  it('every crew way off the glass says what she could hear (told:)', () => {
    for (const w of allBeats(q).flatMap(waysOf).filter((w) => w.key.kind === 'spec' || w.key.kind === 'program')) expect(w.told, `${w.key.kind} → ${w.to}`).toBeTruthy();
  });

  it("the office stays in the market's room (no room name on screen); the catwalk changes room", () => {
    const room = (id: string) => q.beats.get(id)![0].room;
    expect(room('office')).toBe(room('market'));
    expect(room('catwalk')).toBe('spine/catwalk');
    expect(room('catwalk')).not.toBe(room('office'));
  });

  it('the program way is on the office beat', () => {
    expect(waysOf(q.beats.get('office')![0]).some((w) => w.key.kind === 'program')).toBe(true);
  });

  // Nothing on the glass: the letter, ears at the stall, a face at his keys, muscle in the hatch.
  const CLEAN: Pick[] = [
    ['desk', 'letter', 'you'],
    ['market', 'stall', 'ash'],
    ['office', 'keys', 'mia'],
    ['catwalk', 'ask', 'bo'],
    ['ledger', 'report', 'you'],
  ];

  it('a clean run with nothing on the glass: clean, her trust +1, Spine rep +6, kroll_one, and the clerk kept', async () => {
    const r = await play('come-up', { people: ['ash', 'mia', 'bo'], picks: CLEAN, trust: 4 });
    expect(r.run.done).toBe(true);
    expect(r.tier).toBe('clean');
    expect(r.run.takeFill).toBe(4);
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.trust).toBe(5);
    expect(r.moves).toEqual([[1, 'nothing on the glass']]);
    expect(r.rep).toEqual([['spine', repDelta(1, 'clean')]]);
    expect(repDelta(1, 'clean')).toBe(6);
    expect(r.run.flags).toMatchObject({ kroll_one: 'yes' });
    expect(r.run.flags.clerk).toBeUndefined();
  });

  it("the four beats give exactly the job's TAKE: naming the buyer (the double play) costs the last of it, a part take", async () => {
    const r = await play('come-up', {
      people: ['ash'],
      picks: [
        ['desk', 'letter', 'you'],
        ['market', 'stall', 'ash'],
        ['office', 'keys', 'you'],
        ['catwalk', 'ask', 'you:named'],
        ['ledger', 'report', 'you'],
      ],
      trust: 4,
    });
    expect(r.run.takeFill).toBe(3);
    expect(r.run.take).toBe('part');
    expect(r.tier).toBe('messy');
    expect(r.clocks).toMatchObject({ nerve: 1 });
    expect(r.moves).toEqual([[1, 'nothing on the glass']]);
    expect(r.run.flags.clerk).toBeUndefined();
  });

  /** Every line Soren can play alone through the four beats (his own ways, a loaded program's if `program`, the flags they set), with the clocks as they'd stand. */
  const soloLines = (program = false): { line: string[]; sees: number; nerve: number }[] => {
    let lines = [{ line: [] as string[], sees: 0, nerve: 0, flags: {} as Record<string, string> }];
    for (const id of ['desk', 'market', 'office', 'catwalk']) {
      const b = q.beats.get(id)![0];
      lines = lines.flatMap((l) =>
        b.choices.flatMap((c) => {
          const offered = new Map<string, Way>();
          for (const w of (c.ways ?? []).filter((w) => w.key.kind === 'you' || (program && w.key.kind === 'program'))) {
            const k = w.key.kind === 'you' ? w.key.name : 'program';
            const holds = (w.when ?? []).every((cond) => cond.kind === 'flag' && l.flags[cond.name] === cond.value);
            if (!offered.has(k) && holds) offered.set(k, w);
          }
          return [...offered.values()].map((w) => ({
            line: [...l.line, w.to],
            sees: Math.max(0, Math.min(3, l.sees + (w.clocks.sees ?? 0))),
            nerve: Math.max(0, Math.min(3, l.nerve + (w.clocks.nerve ?? 0))),
            flags: { ...l.flags, ...Object.fromEntries(w.sets.map((x) => [x.name, x.value])) },
          }));
        }),
      );
    }
    return lines;
  };

  it('alone, with or without a program, every line leaves something on the glass or has him run, the lie confessed included', () => {
    for (const program of [false, true]) {
      const lines = soloLines(program);
      expect(lines.length).toBeGreaterThan(10);
      for (const l of lines) expect(l.sees > 0 || l.nerve >= 3, `${program} ${l.line.join(' → ')}`).toBe(true);
      // After the lie at her desk, nothing takes the mark back: the glass stays marked, whatever his nerve.
      for (const l of lines.filter((l) => l.line[0] === 'word')) expect(l.sees, `${program} ${l.line.join(' → ')}`).toBeGreaterThan(0);
    }
    expect(soloLines().find((l) => l.line.join() === 'word,seen,keys,truth')).toMatchObject({ sees: 1, nerve: 3 });
    expect(soloLines(true).find((l) => l.line.join() === 'word,seen,looped,truth')).toMatchObject({ sees: 1 });
    // On the honest line, the loop still takes a point off the glass.
    expect(soloLines(true).find((l) => l.line.join() === 'letter,pointed,looped,asked')).toMatchObject({ sees: 0, nerve: 3 });
  });

  it('every way that takes the glass down has a version ahead of it, for after the lie, that takes nothing off', () => {
    for (const b of allBeats(q))
      for (const c of b.choices) {
        const ways = c.ways ?? [];
        ways.forEach((w, i) => {
          if ((w.clocks.sees ?? 0) >= 0) return;
          const lied = ways.slice(0, i).find((x) => x.key.kind === w.key.kind && JSON.stringify(x.key) === JSON.stringify(w.key) && x.when?.some((cond) => cond.kind === 'flag' && cond.name === 'cu_lied' && cond.value === 'yes'));
          expect(lied, `${b.id} ${c.id} → ${w.to}`).toBeDefined();
          expect(lied!.clocks.sees ?? 0, `${b.id} ${c.id} → ${w.to}`).toBe(0);
        });
      }
  });

  it("after the lie, the ledger's empty-glass view can't play: the program line ends with sees still on", async () => {
    const r = await play('come-up', {
      programs: ['firewall'],
      picks: [
        ['desk', 'word', 'you'],
        ['market', 'stall', 'you:scheduler'],
        ['office', 'terminal', 'p:firewall'],
        ['catwalk', 'ask', 'you:truth'],
      ],
      trust: 4,
    });
    expect(r.run.beat).toBe('ledger');
    expect(r.clocks.sees).toBe(1);
    const ledger = q.beats.get('ledger')!.at(-1)!;
    const empty = ledger.views.find((v) => v.when?.some((c) => c.kind === 'count' && c.name === 'sees' && c.op === '<=' && c.value === 0));
    expect(empty).toBeDefined();
  });

  it('alone, the glass empty: clean, her trust +1, and he runs (clerk=burnt)', async () => {
    const r = await play('come-up', {
      picks: [
        ['desk', 'letter', 'you'],
        ['market', 'stall', 'you:scheduler'],
        ['office', 'keys', 'you'],
        ['catwalk', 'ask', 'you'],
        ['ledger', 'report', 'you'],
      ],
      trust: 4,
    });
    expect(r.tier).toBe('clean');
    expect(r.clocks).toMatchObject({ nerve: 3 });
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.trust).toBe(5);
    expect(r.moves).toEqual([[1, 'nothing on the glass']]);
    expect(r.run.flags).toMatchObject({ kroll_one: 'yes', clerk: 'burnt' });
  });

  it('alone, the clerk kept: mercy on the glass, so no move on her trust', async () => {
    const r = await play('come-up', {
      picks: [
        ['desk', 'letter', 'you'],
        ['market', 'stall', 'you:scheduler'],
        ['office', 'keys', 'you'],
        ['catwalk', 'ease', 'you'],
        ['ledger', 'report', 'you'],
      ],
      trust: 4,
    });
    expect(r.tier).toBe('clean');
    expect(r.clocks).toMatchObject({ sees: 1, nerve: 2 });
    expect(r.trust).toBe(4);
    expect(r.moves).toEqual([]);
    expect(r.run.flags.clerk).toBeUndefined();
  });

  it('the worst of it on the glass: sees full, her trust −2, rep still paid, kroll_one', async () => {
    const r = await play('come-up', {
      picks: [
        ['desk', 'word', 'you'],
        ['market', 'stall', 'you:cash'],
        ['office', 'terminal', 'you'],
        ['catwalk', 'ease', 'you'],
        ['ledger', 'pay', 'you'],
      ],
      trust: 4,
    });
    expect(r.run.done).toBe(true);
    expect(r.clocks.sees).toBe(3);
    expect(r.trust).toBe(2);
    expect(r.moves).toEqual([[-2, 'what the glass caught']]);
    expect(r.rep).toEqual([['spine', repDelta(1, 'clean')]]);
    expect(r.run.flags).toMatchObject({ kroll_one: 'yes', cu_end: 'paid' });
    expect(r.run.flags.clerk).toBeUndefined();
  });

  it('a loud line alone reaches ALARM 4 on the catwalk and plays the getaway: pulled out, kroll_one, his nerve full so clerk=burnt', async () => {
    const r = await play('come-up', {
      picks: [
        ['desk', 'letter', 'you'],
        ['market', 'coats', 'you'],
        ['office', 'terminal', 'you'],
        ['catwalk', 'ask', 'you'],
        ['getaway', 'floor', 'you'],
      ],
      trust: 4,
    });
    expect(r.run.done).toBe(true);
    expect(r.run.picks.map((p) => p.beat)).toContain('getaway');
    expect(r.run.alarm).toBeGreaterThanOrEqual(4);
    expect(r.run.take).toBe('part');
    expect(r.clocks).toMatchObject({ sees: 3, nerve: 3 });
    expect(r.trust).toBe(2);
    expect(r.run.flags).toMatchObject({ kroll_one: 'yes', clerk: 'burnt' });
  });

  it('with the watcher walked out at the market (muscle), the four questions draw nobody up the gantry', () => {
    const ask = q.beats.get('catwalk')![0].choices.find((c) => c.id === 'ask')!;
    const plain = ask.ways!.filter((w) => w.key.kind === 'you' && w.key.name === '');
    expect(plain.map((w) => [w.when, w.alarm])).toEqual([
      [[{ kind: 'flag', name: 'cu_watcher', op: '=', value: 'gone' }], 0],
      [null, 1],
    ]);
    const elbow = q.beats.get('market')![0].choices.flatMap((c) => c.ways ?? []).find((w) => w.key.kind === 'spec' && w.key.spec === 'muscle')!;
    expect(elbow.sets).toEqual([{ name: 'cu_watcher', value: 'gone' }]);
  });

  it('her view on the first beat after the lie: she is told to say she marked it', async () => {
    const r = await play('come-up', { picks: [['desk', 'word', 'you']] });
    const sent = r.backend.reqs.at(-1)!.messages.at(-1)!.content;
    expect(sent).toMatch(/\[what you think: [^\]]*you mark it/);
  });

  it('the getaway ends the job with kroll_one, and clerk=burnt only when his nerve is full', () => {
    const g = q.beats.get('getaway')![0];
    for (const c of g.choices) {
      const [burnt, plain] = c.ways!;
      expect(burnt.when).toEqual([{ kind: 'count', name: 'nerve', op: '>=', value: 3 }]);
      expect(burnt.sets).toContainEqual({ name: 'clerk', value: 'burnt' });
      expect(plain.when).toBeNull();
      expect(plain.sets.some((s) => s.name === 'clerk')).toBe(false);
    }
  });

  it('the endings set clerk=burnt in the version for a full nerve, and nowhere else', () => {
    const [full, rest] = q.beats.get('ledger')!;
    expect(full.when).toEqual([{ kind: 'count', name: 'nerve', op: '>=', value: 3 }]);
    expect(rest.when).toBeNull();
    for (const c of full.choices) expect(c.ways!.every((w) => w.sets.some((s) => s.name === 'clerk' && s.value === 'burnt')), c.id).toBe(true);
    for (const c of rest.choices) expect(c.ways!.some((w) => w.sets.some((s) => s.name === 'clerk')), c.id).toBe(false);
  });
});

describe("Kroll's desk together", () => {
  it("Come Up's listing carries its GO IN page's clip when one is recorded, and none without", () => {
    const voiced = relayWith([entryOf('come-up', onRelay(read('come-up')))], { setupVoice: (q) => (q === 'come-up' ? '/api/quests/voice/come-up/setup.ogg' : null) });
    expect(voiced.relay.questState('soren').open.find((o) => o.id === 'come-up')?.voice).toBe('/api/quests/voice/come-up/setup.ogg');
    const plain = relayWith([entryOf('come-up', onRelay(read('come-up')))]);
    expect(plain.relay.questState('soren').open.find((o) => o.id === 'come-up')).not.toHaveProperty('voice');
  });

  it("a new game for Soren with her opens on Come Up's story, as one with Rue opens on Run Sheet's: what he reads, and what she's told", () => {
    const t = relayWith([entryOf('come-up', onRelay(read('come-up'), { forSoren: true }))]);
    const o = (t.relay as unknown as { jobs: { storyOpening(p: string): { id: string; text: string; view: string } | null } }).jobs.storyOpening('soren');
    expect(o?.id).toBe('come-up');
    expect(o!.text).toContain('Come up.');
    expect(o!.view).toContain('Come up.');
  });

  const DESK = ['come-up', 'countersign', 'clearance', 'the-round', 'second-desk'];
  /** Her five jobs as the game reads them: Soren's own (`for: soren`), at her desk with her. */
  const desk = () => DESK.map((id) => entryOf(id, onRelay(read(id), { forSoren: true })));
  /** Rue's Arrears on the same save: at her hab, with the relay's contact standing in for her, her text already sent. */
  const arrears = () => entryOf('arrears', read('arrears').replace(/^with: \[rue\]$/m, 'with: [nix-direct]'));
  // Come Up with nothing on the glass, alone: clean, her trust +1, Spine rep +6, kroll_one.
  const COME_UP: Pick[] = [
    ['desk', 'letter', 'you'],
    ['market', 'stall', 'you:scheduler'],
    ['office', 'keys', 'you'],
    ['catwalk', 'ask', 'you'],
    ['ledger', 'report', 'you'],
  ];
  // Clearance with crew, nothing on the glass: clean, Spine rep +6.
  const CLEARANCE: Pick[] = [
    ['room', 'stair', 'bo'],
    ['kept', 'box', 'dez'],
    ['ramp', 'yard', 'ash'],
    ['rigs', 'hand', 'you:band'],
  ];
  const sorted = (ids: string[]) => [...ids].sort();

  it('before the standing order, only Come Up lists at her desk', () => {
    expect(relayWith(desk()).listed()).toEqual(['come-up']);
  });

  it('after Come Up, Countersign, Clearance and The Round list at any trust; Second Desk waits on both of the first two', () => {
    for (const trust of [1, 9]) {
      expect(sorted(relayWith(desk(), { trust, flags: { kroll_one: 'yes' } }).listed()), `${trust}`).toEqual(['clearance', 'come-up', 'countersign', 'the-round']);
      expect(relayWith(desk(), { trust, flags: { kroll_one: 'yes', cs_end: 'cheap' } }).listed(), `${trust}`).not.toContain('second-desk');
      expect(relayWith(desk(), { trust, flags: { kroll_one: 'yes', niko: 'collected' } }).listed(), `${trust}`).not.toContain('second-desk');
      expect(relayWith(desk(), { trust, flags: { kroll_one: 'yes', cs_end: 'cheap', niko: 'collected' } }).listed(), `${trust}`).toContain('second-desk');
    }
  });

  // Countersign with ears and her way, nothing on the glass: clean, bought cheap.
  const COUNTERSIGN: Pick[] = [
    ['wheel', 'rail', 'ash'],
    ['gate', 'manifest', 'contact'],
    ['offer', 'charge', 'you'],
    ['paper', 'sign', 'you'],
  ];

  it("played through from the game's own start (1): Come Up, then Countersign, then Clearance; Second Desk lists only after the last", async () => {
    expect(KROLL_START).toBe(1);
    const t = relayWith(desk(), { trust: KROLL_START, day: 0 });
    const r = await play('come-up', { on: t, day: 0, picks: COME_UP });
    expect([r.tier, r.trust]).toEqual(['clean', 2]);
    expect(r.run.flags).toMatchObject({ kroll_one: 'yes' });
    expect(sorted(t.listed())).toEqual(['clearance', 'countersign', 'the-round']);
    expect((await play('countersign', { on: t, day: 1, people: ['ash'], picks: COUNTERSIGN })).tier).toBe('clean');
    expect(sorted(t.listed())).toEqual(['clearance', 'the-round']);
    expect((await play('clearance', { on: t, day: 2, people: ['bo', 'dez', 'ash'], picks: CLEARANCE })).tier).toBe('clean');
    expect(t.trust()).toBe(4);
    expect(sorted(t.listed())).toEqual(['second-desk', 'the-round']);
  });

  it('a full glass on Come Up drops her trust by 2, and changes nothing that lists', async () => {
    const t = relayWith(desk(), { trust: 4, day: 0 });
    const r = await play('come-up', {
      day: 0,
      on: t,
      picks: [
        ['desk', 'word', 'you'],
        ['market', 'stall', 'you:cash'],
        ['office', 'terminal', 'you'],
        ['catwalk', 'ease', 'you'],
        ['ledger', 'pay', 'you'],
      ],
    });
    expect(r.clocks.sees).toBe(3);
    expect(r.trust).toBe(2);
    expect(sorted(t.listed())).toEqual(['clearance', 'countersign', 'the-round']);
  });

  it("another job's flags of the same old names (room-412's quiet=yes, a lied=yes) change nothing in Come Up: her views and the cover's price are a fresh save's", async () => {
    expect(read('room-412')).toContain('set quiet=yes');
    const COVER: Pick[] = [...COME_UP.slice(0, 4), ['ledger', 'cover', 'you']];
    const fresh = await play('come-up', { trust: 4, picks: COVER });
    const leaked = await play('come-up', { trust: 4, flags: { quiet: 'yes', lied: 'yes', offer: 'heard' }, picks: COVER });
    // Covering for him with nothing heard out of her hearing costs two marks, as on a fresh save.
    expect(fresh.clocks.sees).toBe(2);
    expect(leaked.clocks.sees).toBe(fresh.clocks.sees);
    // What she was told at every beat, the catwalk's and the ledger's views among them, is the same.
    const told = (r: typeof fresh) => r.backend.reqs.map((q) => q.messages.filter((m) => m.role !== 'assistant').map((m) => m.content).join('\n'));
    expect(told(leaked)).toEqual(told(fresh));
  });

  it('nothing at her desk for another player', () => {
    const t = relayWith(desk(), { trust: 7, flags: { kroll_one: 'yes', cs_end: 'cheap', niko: 'collected' } });
    expect(t.relay.questState('soren').open).toHaveLength(5);
    expect(t.relay.questState('hicks').open).toEqual([]);
  });

  // The Round's fence night, clean with crew (as krolls-desk-the-round.test.ts plays it): Spine rep +6.
  const ROUND: Pick[] = [
    ['meet', 'counter', 'dez'],
    ['count', 'count', 'mia'],
    ['word', 'slip', 'bo'],
  ];
  it("Come Up, Clearance and two clean Rounds bring Spine rep to 24, and Rue's Arrears lists at her hab the morning after", async () => {
    const book = desk().map((q) => (q.id === 'the-round' ? entryOf('the-round', forceDraw(onRelay(read('the-round'), { forSoren: true }), { tr_asset: 'fence' })) : q));
    const t = relayWith([...book, arrears()], { trust: 4, day: 0, heard: true, flags: { rue_one: 'yes' } });
    expect((await play('come-up', { on: t, day: 0, picks: COME_UP })).rep).toEqual([['spine', 6]]);
    expect((await play('clearance', { on: t, day: 1, people: ['bo', 'dez', 'ash'], picks: CLEARANCE })).rep).toEqual([['spine', 6]]);
    for (const day of [2, 3]) {
      const night = await play('the-round', { on: t, day, people: ['dez', 'mia', 'bo'], picks: ROUND });
      expect([night.tier, night.rep]).toEqual(['clean', [['spine', repDelta(1, 'clean')]]]);
    }
    expect(repDelta(1, 'clean')).toBe(6);
    const spineAt = (day: number) => t.relay['deps'].quests!.kit!('soren', 360 + day * DAY)!.rep.spine;
    t.at.place = 'rue-hab';
    // The board reads rep as it stood at 06:00: on the third morning, 18 (tier 1), and Arrears (tier 2) waits.
    t.clock.now = START + 3 * DAY;
    expect(spineAt(3)).toBe(18);
    expect(t.listed()).not.toContain('arrears');
    t.clock.now = START + 4 * DAY;
    expect(spineAt(4)).toBe(24);
    expect(t.listed()).toContain('arrears');
  });

  it('Arrears waits on rue_one too', () => {
    const t = relayWith([...desk(), arrears()], { day: 4, heard: true });
    t.seed({ at: START, rep: { district: 'spine', delta: 24 } });
    t.at.place = 'rue-hab';
    expect(t.listed()).not.toContain('arrears');
  });
});
