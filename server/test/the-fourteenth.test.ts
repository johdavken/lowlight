import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { parseCaseFile, verdictsOf } from '../../shared/cases';
import { beatAway, heardAt, isUnheard, parseQuestFile, type Beat, type QuestEntry } from '../../shared/quests';
import { offTemplate, rolledBeats } from '../../shared/job-template';

// The Fourteenth, Nix's tier 2 for Hicks (spec 2026-11-09-the-fourteenth-design): the case's pictures, then the three jobs.
const parsed = parseCaseFile('the-fourteenth', fs.readFileSync('world/cases/the-fourteenth.md', 'utf8'), { extras: null });
if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems));
const CASE = parsed;

describe('The Fourteenth: the case', () => {
  it('every card of the case has its picture', () => {
    for (const c of CASE.entry.cards.values()) expect(fs.existsSync(`world/cases/art/the-fourteenth/${c.id.toLowerCase()}.webp`), c.id).toBe(true);
  });
});

const read = (id: string): QuestEntry => {
  const r = parseQuestFile(id, fs.readFileSync(`world/quests/${id}.md`, 'utf8'), { roster: null, places: null });
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
/** Every name=value a card's [set …] tag sets, across all beats. */
const sets = (e: QuestEntry) => [...e.beats.values()].flat().flatMap((b) => b.choices.flatMap((c) => c.tags.flatMap((t) => (t.kind === 'set' ? [`${t.name}=${t.value}`] : []))));
/** An act of the arc: Hicks's, with Nix, tier 2 on the template, a view for her on every beat, real rooms. */
const act = (id: string, o: { after: string; sets: string }) => {
  const e = read(id);
  expect([e.kind, e.tier, e.for, e.with, e.once, e.template, e.starts]).toEqual(['mission', 2, 'hicks', ['nix-direct'], true, true, 'lowlight-intake']);
  expect(e.payRange).toEqual([360, 440]);
  expect(e.trust).toEqual([1, 2]);
  expect(e.art).toBeNull();
  expect(JSON.stringify(e.after)).toContain(`"${o.after}"`);
  expect(e.text!.length).toBeGreaterThan(0);
  expect(e.text!.length).toBeLessThanOrEqual(300);
  const beats = [...e.beats.values()].flat();
  for (const b of beats) expect(b.views.map((v) => v.contact), `${b.id} has a view for nix-direct`).toContain('nix-direct');
  expect(offTemplate(e)).toEqual([]);
  for (const b of beats) if (b.room) expect(fs.existsSync(`scenes/${b.room}/scene.json`), b.room).toBe(true);
  expect(sets(e)).toContain(o.sets);
  return e;
};
/** The case's card ids an outcome gives. */
const clues = (e: QuestEntry, outcome: string) => (e.outcomes.get(outcome)?.effects.clues ?? []).filter((c) => c.case === 'the-fourteenth').map((c) => c.card).sort();
/** Free cards on every outcome of the beat's rolled cards; roll cards on each card's success only. */
const place = (e: QuestEntry, beat: string, o: { free?: string[]; roll?: string[] }) => {
  const free = o.free ?? [];
  const roll = o.roll ?? [];
  for (const v of e.beats.get(beat)!) {
    const cards = v.choices.filter((c) => c.check || c.crack);
    expect(cards.length, beat).toBe(2);
    for (const c of cards) {
      expect(clues(e, c.to), `${beat}/${c.id} → ${c.to}`).toEqual([...free, ...roll].sort());
      expect(c.fail, `${beat}/${c.id} has a miss`).toBeDefined();
      expect(clues(e, c.fail!), `${beat}/${c.id} ✗ ${c.fail}`).toEqual([...free].sort());
    }
  }
};
/**
 * What reaches Nix (final review, Important 6): her views and the job's text; a beat in her room as written, with the cards
 * she's shown; a beat away only as heard (its {{ }} lines, and the pick unless it's [unheard]); and an outcome's prose when
 * it lands somewhere she is (her room, or the end).
 */
const reachesHer = (e: QuestEntry): string[] => {
  const beats = [...e.beats.values()].flat();
  const away = (id: string) => (e.beats.get(id) ?? []).every((b) => beatAway(b));
  return [
    e.text ?? '',
    ...beats.flatMap((b) => b.views.filter((v) => v.contact === 'nix-direct').map((v) => v.text)),
    ...beats.flatMap((b) => (beatAway(b) ? [heardAt(b)] : [b.text, ...b.choices.filter((c) => !isUnheard(c)).map((c) => c.line)])),
    ...beats.flatMap((b) => b.choices.filter((c) => !isUnheard(c) && beatAway(b)).map((c) => c.line)),
    ...[...e.outcomes.values()].filter((o) => o.to === 'end' || !away(o.to)).map((o) => o.text),
  ];
};
/** Nothing that reaches Nix gives the truth away. */
const noTruth = (e: QuestEntry) => {
  for (const s of reachesHer(e)) for (const w of ['LOW TIDE', 'Ferreira', 'Kat ', 'killed him']) expect(s, w).not.toContain(w);
};

describe('The Fourteenth: job 1', () => {
  it('The Fourteenth opens the arc after House Glass, unless he sold her eye', () => {
    const e = act('the-fourteenth', { after: 'lark', sets: 'fourteenth_one=yes' });
    expect(JSON.stringify(e.after)).toContain('"op":"!="');
    noTruth(e);
  });
  it("reading her book is [unheard] and lands away from her, so she isn't shown it or told it (final review, Critical 1)", () => {
    const e = read('the-fourteenth');
    const ask = e.beats.get('ask')![0].choices;
    const dug = ask.find((c) => c.tags.some((t) => t.kind === 'set' && t.name === 'nix4' && t.value === 'dug'))!;
    expect(isUnheard(dug)).toBe(true);
    expect(e.beats.get(e.outcomes.get(dug.to)!.to)!.every((b) => beatAway(b))).toBe(true);
    for (const s of reachesHer(e)) expect(s).not.toMatch(/read her book|read the book/i);
  });
  it('The Fourteenth hands out its cards where the case says', () => {
    const e = read('the-fourteenth');
    const ask = e.beats.get('ask')![0].choices;
    const by = (flag: string) => ask.find((c) => c.tags.some((t) => t.kind === 'set' && `${t.name}=${t.value}` === flag))!;
    expect(clues(e, by('nix4=asked').to)).toEqual(['DATE']);
    expect(clues(e, by('nix4=dug').to)).toEqual(['SOLD']);
    place(e, 'alley', { free: ['HAND', 'CALL'] });
    place(e, 'counter', { free: ['BOWL', 'DOOR'] });
    place(e, 'cart', { roll: ['PORT'] });
    place(e, 'grid', { roll: ['BOUNTY'] });
    place(e, 'booth', {});
    expect(rolledBeats(e).map((b) => b.id)).toEqual(['alley', 'counter', 'cart', 'grid', 'booth']);
  });
});

describe('The Fourteenth: job 2', () => {
  it('Thursdays follows The Fourteenth', () => {
    const e = act('thursdays', { after: 'fourteenth_one', sets: 'fourteenth_two=yes' });
    noTruth(e);
    expect(sets(e)).toEqual(expect.arrayContaining(['nix5=asked', 'nix5=dug']));
  });
  it('Thursdays hands out its cards where the case says', () => {
    const e = read('thursdays');
    place(e, 'front', { free: ['PENN', 'SHUTTER'] });
    place(e, 'book', { roll: ['LEDGER', 'ADA'] });
    place(e, 'tilt', { free: ['ALIBI', 'NEVER', 'TAB', 'HESK'] });
    place(e, 'cass', { roll: ['CASS'] });
    place(e, 'out', {});
    expect(e.beats.get('book')![0].choices.some((c) => c.crack)).toBe(true);
    expect(rolledBeats(e).map((b) => b.id)).toEqual(['front', 'book', 'tilt', 'cass', 'out']);
  });
  it("each of the case's cards is given in exactly one beat of jobs 1 and 2 (Review Focus 4)", () => {
    const given = new Map<string, Set<string>>();
    for (const id of ['the-fourteenth', 'thursdays']) {
      const e = read(id);
      for (const [bid, vs] of e.beats) for (const v of vs) for (const c of v.choices) for (const o of [c.to, c.fail]) {
        for (const card of o ? clues(e, o) : []) given.set(card, (given.get(card) ?? new Set()).add(`${id}/${bid}`));
      }
    }
    for (const c of CASE.entry.cards.values()) expect([...(given.get(c.id) ?? [])], c.id).toHaveLength(1);
  });
  it("Penn's book's missed line fits a miss on either card", () => {
    for (const id of ['LEDGER', 'ADA']) expect(CASE.entry.cards.get(id)!.missed).toBe("Job 2: Penn's book stayed shut.");
  });
});

describe('The Fourteenth: job 3', () => {
  it('Quiet is the board, then the Long Haul', () => {
    const e = act('quiet', { after: 'fourteenth_two', sets: 'fourteenth=gone' });
    noTruth(e);
    expect(e.beats.get('board')![0].board).toBe('the-fourteenth');
    for (const v of ['holds', 'thin', 'hunch']) expect(e.outcomes.get(v)!.to).toBe('deck');
    for (const v of ['wrong-dr-penn', 'wrong-hesk']) {
      const o = e.outcomes.get(v)!;
      expect(o.to).toBe('end');
      expect(o.effects.settles!.map((s) => s.who)).toContain('nix-direct');
    }
    expect(rolledBeats(e).map((b) => b.id)).toEqual(['deck', 'ramp', 'booth', 'door', 'lot']);
    expect(sets(e)).toEqual(expect.arrayContaining(['fourteenth=sold', 'fourteenth=gone', 'fourteenth=nix', 'fourteenth=filed']));
  });
  it('every variant of a rolled beat has the same cards (Review Focus 2)', () => {
    const e = read('quiet');
    const shape = (b: Beat) => b.choices.filter((c) => c.check).map((c) => `${c.check!.stat} ${c.check!.base} → ${c.to} / ${c.fail}`).sort().join(',');
    expect(e.beats.get('booth')!.length).toBe(3);
    for (const { id } of rolledBeats(e)) {
      const vs = e.beats.get(id)!;
      for (const v of vs) expect(shape(v), id).toBe(shape(vs.at(-1)!));
    }
  });
  it('SDG files it only when the case holds, and a dug run is told he read her book (Review Focus 3)', () => {
    const e = read('quiet');
    const homes = e.beats.get('home')!;
    expect(homes.map((h) => h.choices.length)).toEqual([4, 4, 3, 3]);
    expect(homes.map((h) => h.choices.some((c) => c.to.startsWith('filed')))).toEqual([true, true, false, false]);
    for (const [i, h] of homes.entries()) {
      for (const c of h.choices) {
        const said = (e.outcomes.get(c.to)!.effects.settles ?? []).filter((s) => s.who === 'nix-direct').map((s) => s.text).join(' ');
        expect(said.length, c.to).toBeGreaterThan(0);
        expect(/\bbook\b/.test(said), c.to).toBe(i === 0 || i === 2);
      }
    }
  });
});

describe('The Fourteenth: with the case known', () => {
  it('the three files parse with the case known, as the server loads them: every clue names a card, every verdict has its outcome', () => {
    const known = { roster: null, places: null, cases: new Map([['the-fourteenth', new Set(CASE.entry.cards.keys())]]), caseVerdicts: new Map([['the-fourteenth', verdictsOf(CASE.entry)]]) };
    expect(verdictsOf(CASE.entry).sort()).toEqual(['holds', 'hunch', 'thin', 'wrong-dr-penn', 'wrong-hesk']);
    for (const id of ['the-fourteenth', 'thursdays', 'quiet']) {
      const r = parseQuestFile(id, fs.readFileSync(`world/quests/${id}.md`, 'utf8'), known);
      expect(r.ok ? [] : r.problems, id).toEqual([]);
    }
  });
});

describe('an asked run is told so (playtest 2026-11-10: she said Hicks read her book on an asked run)', () => {
  it("Quiet's ask, board and its homes for an asked run tell her he asked and never read it", () => {
    const e = read('quiet');
    const asked = (id: string, i = 0) => e.beats.get(id)![i].views.some((v) => v.contact === 'nix-direct' && JSON.stringify(v.when ?? null).includes('"asked"'));
    expect(asked('ask')).toBe(true);
    expect(asked('board')).toBe(true);
    expect(asked('home', 1)).toBe(true);
    expect(asked('home', 3)).toBe(true);
  });
  it("job 1 doesn't keep her book in front of her: it's in the read card, not her lines", () => {
    const e = read('the-fourteenth');
    const ask = e.beats.get('ask')![0];
    expect(ask.text).not.toMatch(/\bbook\b/);
    expect(ask.views.map((v) => v.text).join(' ')).not.toMatch(/\bbook\b/);
    expect(e.beats.get('home')![0].text).not.toMatch(/\bbook\b/);
    expect(read('thursdays').beats.get('ask')![0].text).not.toMatch(/\bbook\b/);
  });
});
