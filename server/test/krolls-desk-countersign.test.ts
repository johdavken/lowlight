/**
 * Countersign (Kroll's desk, Task 7): Marta Quill bought on the Strand, held to its design. The shared fixtures and
 * `jobShape` are in krolls-desk-kit.ts.
 */
import { describe, expect, it } from 'vitest';
import { repDelta } from '../../shared/mission';
import { holds } from '../../shared/quests';
import { allBeats, entryOf, jobShape, onRelay, play as playJob, read, relayWith, useKrollsDesk, waysOf, type Pick } from './krolls-desk-kit';

useKrollsDesk();

jobShape('countersign', { id: 'price', label: 'HER PRICE', size: 3 }, { exitsSet: ['cs_end'] });

/** The kit's `play` with Come Up done before it (kroll_one), so the job starts through its real `after:` gate. */
const play = (id: 'countersign', o: Omit<Parameters<typeof playJob>[1], 'flags'>) => playJob(id, { ...o, flags: { kroll_one: 'yes' } });

describe('Countersign: Marta Quill on the Strand', () => {
  const q = entryOf('countersign', read('countersign'));

  it('opens after the standing order, once, paid on the Strand', () => {
    const ctx = (flags: Record<string, string>) => ({ flags, trust: 'mid' as const, warmth: 'mid' as const, with: 'adebayo' });
    expect(holds(q.after, ctx({}))).toBe(false);
    expect(holds(q.after, ctx({ kroll_one: 'yes' }))).toBe(true);
    expect(q.once).toBe(true);
    expect(q.district).toBe('strand');
    expect(q.takeSize).toBe(4);
  });

  it('the relay refuses to start it before the standing order is done', async () => {
    const { relay } = relayWith([entryOf('countersign', onRelay(read('countersign')))]);
    expect(await relay.startQuest('soren', 'countersign', { crew: true, people: [], programs: [] })).toBe("that job isn't open here");
  });

  it('the badge at her gate is on the glass, and the marker named on the bench takes that point back, for the last slice of TAKE', async () => {
    const opening: Pick[] = [
      ['wheel', 'rail', 'ash'],
      ['gate', 'manifest', 'you'],
    ];
    const half = await play('countersign', { people: ['ash'], picks: opening });
    expect(half.clocks.sees).toBe(1);
    const r = await play('countersign', { people: ['ash'], picks: [...opening, ['offer', 'charge', 'you:marker'], ['paper', 'sign', 'you']], trust: 4 });
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.run.takeFill).toBe(2);
    expect(r.tier).not.toBe('clean');
    expect(r.trust).toBe(5);
  });

  it('every crew way off the glass says what she could hear (told:)', () => {
    for (const w of allBeats(q).flatMap(waysOf).filter((w) => w.key.kind === 'spec' || w.key.kind === 'program')) expect(w.told, `${w.key.kind} → ${w.to}`).toBeTruthy();
  });

  it('every crew way has a price besides the go and any flag it sets: ALARM, HEAT, a clock, a cut or a lose', () => {
    for (const w of allBeats(q).flatMap(waysOf).filter((w) => w.key.kind === 'spec')) {
      const priced = w.alarm > 0 || w.heat > 0 || w.cut > 0 || w.lose > 0 || Object.values(w.clocks).some((n) => n !== 0);
      expect(priced, w.to).toBe(true);
    }
  });

  it('the best TAKE across the beats is the job size exactly', () => {
    const best = ['wheel', 'gate', 'offer', 'paper'].reduce((sum, id) => sum + Math.max(0, ...q.beats.get(id)!.flatMap(waysOf).map((w) => w.take)), 0);
    expect(best).toBe(q.takeSize);
  });

  it('the dock gate holds the Low Roller (no dock room); the offer and the paper are on the old pier', () => {
    const room = (id: string) => q.beats.get(id)![0].room;
    expect(room('wheel')).toBe('strand/low-roller');
    expect(room('gate')).toBe('strand/low-roller');
    expect(room('offer')).toBe('strand/old-pier');
    for (const v of q.beats.get('paper')!) expect(v.room).toBe('strand/old-pier');
  });

  it("a face can make the offer in his place, off the glass, and it fills her price", () => {
    const face = waysOf(q.beats.get('offer')![0]).find((w) => w.key.kind === 'spec' && w.key.spec === 'face')!;
    expect(face.clocks.sees ?? 0).toBe(0);
    expect(face.clocks.price).toBeGreaterThan(0);
  });

  it('only the let-her-go ending gives her as a face hire, with a pitch', () => {
    const givers = [...q.outcomes].filter(([, o]) => o.effects.recruit).map(([id]) => id);
    expect(givers).toEqual(['out']);
    expect(q.outcomes.get('out')!.effects.recruit).toMatchObject({ spec: 'face', grade: 0, sex: 'woman' });
    expect(q.outcomes.get('out')!.effects.recruit!.pitch).toBeTruthy();
  });

  // Nothing on the glass and her price empty: ears at the booth, the manifest from Kroll's desk, the branch's offer.
  const CLEAN: Pick[] = [
    ['wheel', 'rail', 'ash'],
    ['gate', 'manifest', 'contact'],
    ['offer', 'charge', 'you'],
    ['paper', 'sign', 'you'],
  ];

  it('a clean run with nothing on the glass: clean, her trust +1, Strand rep +6, bought cheap', async () => {
    const r = await play('countersign', { people: ['ash'], picks: CLEAN, trust: 4 });
    expect(r.run.done).toBe(true);
    expect(r.tier).toBe('clean');
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.clocks.price ?? 0).toBe(0);
    expect(r.trust).toBe(5);
    expect(r.rep).toEqual([['strand', repDelta(1, 'clean')]]);
    expect(repDelta(1, 'clean')).toBe(6);
    expect(r.run.flags).toMatchObject({ cs_end: 'cheap' });
  });

  it('alone, he keeps the glass empty only by letting her know her worth (and ALARM makes it messy)', async () => {
    const r = await play('countersign', {
      picks: [
        ['wheel', 'rail', 'you'],
        ['gate', 'manifest', 'contact'],
        ['offer', 'charge', 'you'],
        ['paper', 'sign', 'you'],
      ],
      trust: 4,
    });
    expect(r.tier).toBe('messy');
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.clocks.price).toBe(1);
    expect(r.trust).toBe(5);
    expect(r.run.flags).toMatchObject({ cs_end: 'signed' });
  });

  it('alone, he keeps her cheap only on the glass: clean, sees 1, her trust unmoved', async () => {
    const r = await play('countersign', {
      picks: [
        ['wheel', 'stake', 'you'],
        ['gate', 'manifest', 'contact'],
        ['offer', 'charge', 'you'],
        ['paper', 'sign', 'you'],
      ],
      trust: 4,
    });
    expect(r.tier).toBe('clean');
    expect(r.clocks).toMatchObject({ sees: 1 });
    expect(r.clocks.price ?? 0).toBe(0);
    expect(r.trust).toBe(4);
  });

  it('the worst of it on the glass, then let her go: sees full, her trust −2, and she comes to you as a hire', async () => {
    const r = await play('countersign', {
      picks: [
        ['wheel', 'stake', 'you'],
        ['gate', 'manifest', 'you'],
        ['offer', 'truth', 'you'],
        ['paper', 'out', 'you'],
      ],
      trust: 4,
    });
    expect(r.run.done).toBe(true);
    expect(r.clocks.sees).toBe(3);
    expect(r.trust).toBe(2);
    expect(r.run.flags).toMatchObject({ cs_end: 'out' });
    expect(r.run.picks.at(-1)).toMatchObject({ beat: 'paper', choice: 'out' });
    const shown = JSON.stringify(r.db.allMessages('soren'));
    expect(shown).toContain('Off the docks she answers to Saida Rahm.');
    expect(shown).not.toContain('{hire}');
  });

  it('her price full: the paper with her terms, and she is told to note who set them', async () => {
    const r = await play('countersign', {
      people: ['mia'],
      picks: [
        ['wheel', 'rail', 'you'],
        ['gate', 'lamp', 'you'],
        ['offer', 'charge', 'mia'],
        ['paper', 'sign', 'you'],
      ],
    });
    expect(r.clocks.price).toBe(3);
    expect(r.clocks.sees ?? 0).toBe(0);
    expect(r.run.flags).toMatchObject({ cs_end: 'dear', cs_offer: 'face' });
    const sent = r.backend.reqs.at(-1)!.messages.at(-1)!.content;
    expect(sent).toMatch(/\[what you think: [^\]]*who set the terms/);
    expect(sent).toMatch(/only as she wrote it/);
  });

  it('his own ways reach ALARM 4: the rail, the badge, the charge; the getaway ends it unsigned', async () => {
    const r = await play('countersign', {
      picks: [
        ['wheel', 'rail', 'you'],
        ['gate', 'manifest', 'you'],
        ['offer', 'charge', 'you'],
        ['getaway', 'crowd', 'you'],
      ],
    });
    expect(r.run.getaway).toBe(true);
    expect(r.run.done).toBe(true);
    expect(r.tier).toBe('blown');
    expect(r.run.flags).toMatchObject({ cs_end: 'unsigned' });
  });
});
