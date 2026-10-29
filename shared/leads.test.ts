import { describe, expect, it } from 'vitest';
import { checkChains, LEAD_DRAFT_RULE, leadCounts, leadDraftPrompt, leadFile, leadsBlock, leadsFor, parseLeadFile, type LeadEntry } from './leads';

const TEO = `---
title: Teo's debt
from: cass
to: mother-rot
keys: [brother, teo, family, debt]
fill: "his name, what he owes"
place: The Marsh
---

## On her mind
Your younger brother is in trouble and you haven't slept right since.

## Giver knows
Your brother Teo borrowed from Mother Rot's people.
You'll tell someone you trust if they ask about family.

## Receiver knows
Teo is one of a dozen kids who owe you.
`;

const ROSTER = new Set(['cass', 'mother-rot', 'hicks']);
const problems = (text: string, roster: ReadonlySet<string> | null = ROSTER, id = 'teo-debt') => {
  const r = parseLeadFile(id, text, roster);
  return r.ok ? [] : r.problems;
};
const fields = (text: string, roster: ReadonlySet<string> | null = ROSTER) => problems(text, roster).map((p) => p.field);

describe('parseLeadFile', () => {
  it('parses a full lead', () => {
    const r = parseLeadFile('teo-debt', TEO, ROSTER);
    expect(r).toEqual({
      ok: true,
      entry: {
        id: 'teo-debt',
        title: "Teo's debt",
        from: 'cass',
        to: 'mother-rot',
        keys: ['brother', 'teo', 'family', 'debt'],
        after: null,
        fill: 'his name, what he owes',
        place: 'The Marsh',
        onMind: "Your younger brother is in trouble and you haven't slept right since.",
        giverKnows: "Your brother Teo borrowed from Mother Rot's people.\nYou'll tell someone you trust if they ask about family.",
        receiverKnows: 'Teo is one of a dozen kids who owe you.',
      },
    });
  });

  it('accepts On his mind and On their mind', () => {
    for (const who of ['his', 'their', 'HER']) {
      const r = parseLeadFile('teo-debt', TEO.replace('## On her mind', `## On ${who} mind`), ROSTER);
      expect(r.ok).toBe(true);
    }
  });

  it('needs from, to, keys and all three sections', () => {
    expect(fields(TEO.replace('from: cass\n', ''))).toContain('from');
    expect(fields(TEO.replace('to: mother-rot\n', ''))).toContain('to');
    expect(fields(TEO.replace('keys: [brother, teo, family, debt]\n', ''))).toContain('keys');
    expect(fields(TEO.replace(/## On her mind\n[^\n]*\n/, ''))).toContain('onMind');
    expect(fields(TEO.replace(/## Giver knows\n[^#]*/, ''))).toContain('giverKnows');
    expect(fields(TEO.replace(/## Receiver knows\n[\s\S]*/, ''))).toContain('receiverKnows');
  });

  it('refuses an unknown heading', () => {
    expect(fields(`${TEO}\n## Notes\nsomething\n`)).toContain('body');
  });

  it('refuses from === to', () => {
    expect(fields(TEO.replace('to: mother-rot', 'to: cass'))).toContain('to');
  });

  it('refuses ids outside the roster when given one', () => {
    expect(fields(TEO, new Set(['cass']))).toContain('to');
    expect(fields(TEO, new Set(['mother-rot']))).toContain('from');
    expect(fields(TEO, null)).toEqual([]);
  });

  it('limits each side to 1200, the mind line to 200 and one line, fill to 120', () => {
    expect(fields(TEO.replace('Teo is one of a dozen kids who owe you.', 'x'.repeat(1201)))).toContain('receiverKnows');
    expect(fields(TEO.replace("Your brother Teo borrowed from Mother Rot's people.", 'x'.repeat(1201)))).toContain('giverKnows');
    expect(fields(TEO.replace("Your younger brother is in trouble and you haven't slept right since.", 'x'.repeat(201)))).toContain('onMind');
    expect(fields(TEO.replace("Your younger brother is in trouble and you haven't slept right since.", 'one\ntwo'))).toContain('onMind');
    expect(fields(TEO.replace('fill: "his name, what he owes"', `fill: "${'x'.repeat(121)}"`))).toContain('fill');
  });

  it('refuses a bad id', () => {
    expect(problems(TEO, ROSTER, 'Teo Debt').map((p) => p.field)).toContain('id');
  });

  it('round-trips through leadFile', () => {
    const r = parseLeadFile('teo-debt', TEO, ROSTER);
    if (!r.ok) throw new Error('fixture must parse');
    const chained: LeadEntry = { ...r.entry, after: 'other', place: null };
    for (const e of [r.entry, chained]) expect(parseLeadFile('teo-debt', leadFile(e), null)).toEqual({ ok: true, entry: e });
    // New files say whose mind neutrally: the giver may be anyone (the parser reads her, his and their).
    expect(leadFile(r.entry)).toContain('\n## On their mind\n');
    expect(leadFile(r.entry)).not.toContain('On her mind');
  });
});

describe('checkChains', () => {
  const lead = (id: string, after: string | null): LeadEntry => ({
    id,
    title: id,
    from: 'cass',
    to: 'hicks',
    keys: ['x'],
    after,
    fill: 'x',
    place: null,
    onMind: 'x',
    giverKnows: 'x',
    receiverKnows: 'x',
  });

  it('flags an unknown after, a loop, and a step whose chain leads to one', () => {
    const bad = checkChains([lead('a', 'b'), lead('b', 'a'), lead('c', 'missing'), lead('d', 'c'), lead('e', null), lead('f', 'e')]);
    expect([...bad.keys()].sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const ps of bad.values()) expect(ps.map((p) => p.field)).toEqual(['after']);
  });

  it('flags a lead after itself', () => {
    expect([...checkChains([lead('a', 'a')]).keys()]).toEqual(['a']);
  });
});

describe('leadsFor', () => {
  const base = (over: Partial<LeadEntry>): LeadEntry => ({
    id: 'teo-debt',
    title: "Teo's debt",
    from: 'cass',
    to: 'hicks',
    keys: ['brother', 'teo'],
    after: null,
    fill: 'his name, what he owes',
    place: null,
    onMind: 'Your younger brother is in trouble.',
    giverKnows: 'Teo borrowed from the wrong people.',
    receiverKnows: 'Teo owes you.',
    ...over,
  });
  const TEO = base({});
  const PRICE = base({ id: 'rot-price', title: "Rot's price", from: 'hicks', to: 'cass', after: 'teo-debt', keys: ['price'], onMind: 'You have a price in mind.' });
  const BOOK = [TEO, PRICE];
  const none = new Map<string, string>();

  it('live leads sit on her mind and are offered only once mentioned', () => {
    expect(leadsFor(BOOK, 'cass', none, ['nice weather'])).toEqual({ onMind: [TEO], offer: [], receive: [] });
    expect(leadsFor(BOOK, 'cass', none, ['nice weather', 'how is your Brother?'])).toEqual({ onMind: [TEO], offer: [TEO], receive: [] });
  });

  it('a held lead leaves the giver and reaches the receiver with its details', () => {
    const held = new Map([['teo-debt', 'Teo owes 4k']]);
    expect(leadsFor([TEO], 'cass', held, ['brother'])).toEqual({ onMind: [], offer: [], receive: [] });
    expect(leadsFor([TEO], 'hicks', held, [])).toEqual({ onMind: [], offer: [], receive: [{ entry: TEO, details: 'Teo owes 4k' }] });
  });

  it('a chain step is live only after its after lead is held', () => {
    expect(leadsFor(BOOK, 'hicks', none, ['price']).onMind).toEqual([]);
    const held = new Map([['teo-debt', 'Teo owes 4k']]);
    expect(leadsFor(BOOK, 'hicks', held, ['price'])).toMatchObject({ onMind: [PRICE], offer: [PRICE] });
  });

  it('two live leads, one mentioned: both on her mind, one offered (Review Focus 5)', () => {
    const OTHER = base({ id: 'old-flame', title: 'Old flame', keys: ['flame'], onMind: 'You saw him again.' });
    const t = leadsFor([TEO, OTHER], 'cass', none, ['an old flame of yours?']);
    expect(t.onMind.map((e) => e.id)).toEqual(['teo-debt', 'old-flame']);
    expect(t.offer.map((e) => e.id)).toEqual(['old-flame']);
  });

  it('leadsBlock uses the exact copy', () => {
    const held = new Map([['teo-debt', 'Teo owes 4k']]);
    expect(leadsBlock({ onMind: [TEO], offer: [TEO], receive: [{ entry: TEO, details: 'Teo owes 4k' }] })).toBe(
      [
        "[on your mind: Your younger brother is in trouble. Let it colour you; don't raise it.]",
        '[a lead you could give — Teo\'s debt: Teo borrowed from the wrong people. If you tell them, call give_lead with id "teo-debt" and details: his name, what he owes.]',
        "[if they raise it — Teo's debt: what you know is: Teo owes you. What they may have heard: Teo owes 4k. Don't bring it up first, and don't let it colour other topics; react if they do.]",
      ].join('\n'),
    );
    expect(held.size).toBe(1);
    expect(leadsBlock({ onMind: [], offer: [], receive: [] })).toBeNull();
  });

  it('leadsBlock ends a mind line without a stop with one', () => {
    expect(leadsBlock({ onMind: [base({ onMind: 'Teo again' })], offer: [], receive: [] })).toBe("[on your mind: Teo again. Let it colour you; don't raise it.]");
  });
});

describe('studio helpers', () => {
  const lead = (id: string, from: string, to: string, over: Partial<LeadEntry> = {}): LeadEntry => ({
    id,
    title: id,
    from,
    to,
    keys: ['teo'],
    after: null,
    fill: 'what he owes',
    place: null,
    onMind: 'm',
    giverKnows: 'g',
    receiverKnows: 'r',
    ...over,
  });

  it('leadCounts counts gives and receives', () => {
    const book = [lead('a', 'cass', 'hicks'), lead('b', 'cass', 'silas'), lead('c', 'hicks', 'cass')];
    expect(leadCounts(book, 'cass')).toEqual({ gives: 2, receives: 1 });
    expect(leadCounts(book, 'ember')).toEqual({ gives: 0, receives: 0 });
  });

  it('leadDraftPrompt states the fill rule, the roster ids and the existing leads', () => {
    const prompt = leadDraftPrompt({ book: [lead('teo-debt', 'cass', 'hicks', { title: "Teo's debt" })], roster: [{ id: 'cass', name: 'Cass' }, { id: 'hicks', name: 'Hicks' }], from: 'cass' });
    expect(LEAD_DRAFT_RULE).toBe("Anything the giver may invent (fill) must be left open in Receiver knows — never fix a name, number or date there that the giver could choose.");
    expect(prompt).toContain(LEAD_DRAFT_RULE);
    expect(prompt).toContain('cass — Cass');
    expect(prompt).toContain("teo-debt — Teo's debt: cass → hicks");
    expect(prompt).toContain('from: cass');
    expect(prompt).toContain('## Receiver knows');
  });

  it('leadDraftPrompt carries the two people, the ticked lore and the places', () => {
    const prompt = leadDraftPrompt({
      book: [],
      roster: [{ id: 'cass', name: 'Cass' }, { id: 'hicks', name: 'Hicks' }],
      from: 'cass',
      to: 'hicks',
      people: [
        { id: 'cass', name: 'Cass', tagline: 'Late shift, Ribbon bar.', bio: 'Cass Arden, 31.', facts: [{ label: 'TELL', value: 'Slides a drink across.' }] },
        { id: 'hicks', name: 'Hicks', tagline: 'Netrunner.', bio: 'Hicks grew up in Old Town.', facts: [] },
      ],
      lore: [{ title: 'The Marsh', body: 'Flooded blocks.' }],
      places: [{ name: 'The Tilt', district: 'Karasu' }],
    });
    expect(prompt).toContain('Cass (giver, cass): Late shift, Ribbon bar.\nCass Arden, 31.\nTELL: Slides a drink across.');
    expect(prompt).toContain('Hicks (receiver, hicks): Netrunner.\nHicks grew up in Old Town.');
    expect(prompt).toContain('Lore (true; use it, don\'t contradict it):\nThe Marsh: Flooded blocks.');
    expect(prompt).toContain('Places (for place):\nThe Tilt (Karasu)');
  });

  it('leadDraftPrompt leaves out empty sections', () => {
    const prompt = leadDraftPrompt({ book: [], roster: [] });
    expect(prompt).not.toContain('Lore (true');
    expect(prompt).not.toContain('Places (for place)');
    expect(prompt).not.toContain('(giver,');
  });

  it('leadFile quotes ids YAML would read as something else (review minor)', () => {
    const e = lead('x', '007', 'null', { after: '1e3' });
    expect(parseLeadFile('x', leadFile(e), null)).toEqual({ ok: true, entry: e });
  });

  it('from, to and after must be ids even without a roster', () => {
    const r = parseLeadFile('x', leadFile(lead('x', 'Cass Arden', 'hicks')), null);
    expect(r.ok ? [] : r.problems.map((p) => p.field)).toContain('from');
  });
});
