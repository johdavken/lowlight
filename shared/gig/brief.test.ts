import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { mapIds } from '../lore';
import { parseMap } from '../map-schema';
import { briefId, dealJobs, gigActionLine, gigFile, gigKind, gigText, looseBrief, parseGigFile, parseGigSnapshot, RESULTS_FOR, tierMax, type Brief, type GigSnapshot } from './brief';

const map = parseMap(JSON.parse(fs.readFileSync('map/lowlight.json', 'utf8')));
if (!map.ok) throw new Error('the shipped map should parse');
const ids = mapIds(map.map);

const file = (front: Record<string, string>, body = 'A job.') =>
  `---\n${Object.entries(front)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\n${body}\n`;
const good = { title: 'Held Pay', tier: 'hard', place: 'the-tilt', client: 'Nobody', target: 'Glass Orchid · house ledger', take: 'a payout' };

describe('parseGigFile', () => {
  test('the six seed briefs parse, three per gig place, one per tier', () => {
    const names = fs.readdirSync('world/gigs').filter((n) => n.endsWith('.md'));
    const all = names.map((n) => {
      const r = parseGigFile(n.slice(0, -3), fs.readFileSync(path.join('world/gigs', n), 'utf8'), ids);
      if (!r.ok) throw new Error(`${n}: ${JSON.stringify(r.problems)}`);
      return r.brief;
    });
    const briefs = all.filter((b) => gigKind(b) === 'hack');
    expect(briefs.map((b) => `${b.id}.md`).sort()).toEqual(['escort-route.md', 'four-oclock.md', 'held-pay.md', 'line-item.md', 'rerun.md', 'wrong-crate.md']);
    for (const place of ['the-tilt', 'public-landing']) expect(briefs.filter((b) => b.place === place).map((b) => b.tier).sort()).toEqual(['easy', 'hard', 'medium']);
    expect(briefs.find((b) => b.id === 'held-pay')).toMatchObject({ title: 'Held Pay', tier: 'hard', place: 'the-tilt', client: 'Nobody, through the Switchboard' });
  });
  test.each([
    ['title', 'x'.repeat(41)],
    ['client', 'x'.repeat(81)],
    ['target', 'x'.repeat(81)],
    ['take', 'x'.repeat(81)],
    ['tier', 'legendary'],
    ['place', 'nowhere'],
  ])('rejects a bad %s', (field, value) => {
    const r = parseGigFile('job', file({ ...good, [field]: value }), ids);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.map((p) => p.field)).toContain(field);
  });
  test('rejects a missing field, a long body and a bad id', () => {
    const { take: _t, ...noTake } = good;
    const missing = parseGigFile('job', file(noTake), ids);
    expect(!missing.ok && missing.problems.map((p) => p.field)).toContain('take');
    const long = parseGigFile('job', file(good, 'x'.repeat(401)), ids);
    expect(!long.ok && long.problems.map((p) => p.field)).toContain('body');
    const id = parseGigFile('Bad Id', file(good), ids);
    expect(!id.ok && id.problems.map((p) => p.field)).toContain('id');
  });
  test('accepts the limits exactly', () => {
    expect(parseGigFile('job', file({ ...good, title: 'x'.repeat(40), take: 'x'.repeat(80) }, 'x'.repeat(400)), ids).ok).toBe(true);
  });
  test('a Windows file (CRLF, a BOM) reads like a Unix one', () => {
    const unix = parseGigFile('job', file(good, 'Line one.\nLine two.'), ids);
    const windows = parseGigFile('job', `﻿${file(good, 'Line one.\nLine two.').replace(/\n/g, '\r\n')}`, ids);
    expect(windows).toEqual(unix);
    expect(unix.ok).toBe(true);
  });
});

const brief = (id: string, tier: Brief['tier']): Brief => ({ id, title: id, tier, place: 'the-tilt', client: 'c', target: 't', take: 'k', text: 'b' });

describe('dealJobs', () => {
  test('one per tier, easy to hard, empty tiers skipped', () => {
    expect(dealJobs([brief('h', 'hard'), brief('e1', 'easy')], () => 0).map((b) => b.id)).toEqual(['e1', 'h']);
  });
  test('picks among a tier with the random source', () => {
    const two = [brief('e1', 'easy'), brief('e2', 'easy')];
    expect(dealJobs(two, () => 0)[0].id).toBe('e1');
    expect(dealJobs(two, () => 0.99)[0].id).toBe('e2');
  });
  test('nothing to deal', () => {
    expect(dealJobs([])).toEqual([]);
  });
});

const snap: GigSnapshot = {
  you: 'Hicks',
  title: 'Held Pay',
  tier: 'hard',
  place: 'The Tilt',
  client: 'Nobody, through the Switchboard',
  target: 'Glass Orchid · house ledger',
  take: "one worker's held payout, released",
  brief: 'The house keeps its ledger behind thick lacquer.',
  result: 'clean',
  trace: 8,
  max: 14,
};

describe('the line she gets', () => {
  test('a clean run, whole', () => {
    expect(gigText(snap)).toBe(
      `[gig: Hicks just ran a job off The Tilt's board, on the grid from here while you watched: "Held Pay" (hard), targeting Glass Orchid · house ledger. Client: Nobody, through the Switchboard. Take: one worker's held payout, released. Brief: The house keeps its ledger behind thick lacquer. Result: pulled it clean, trace 8 of 14.]`,
    );
  });
  test('close and traced', () => {
    expect(gigText({ ...snap, result: 'close', trace: 12 })).toContain('Result: got it, but the trace hit 12 of 14.]');
    expect(gigText({ ...snap, result: 'traced', trace: 17 })).toContain('Result: traced at 17 of 14, jacked out with nothing.]');
  });
  test('the action line', () => {
    expect(gigActionLine(snap)).toBe(`*Hicks jacks into a job off The Tilt's board: "Held Pay".*`);
  });
});

describe('gigFile, looseBrief, briefId (Studio GIGS tab)', () => {
  const seeds = fs.readdirSync('world/gigs').filter((n) => n.endsWith('.md'));
  test('every seed brief round-trips through gigFile', () => {
    for (const n of seeds) {
      const r = parseGigFile(n.slice(0, -3), fs.readFileSync(path.join('world/gigs', n), 'utf8'), ids);
      if (!r.ok) throw new Error(n);
      expect(parseGigFile(r.brief.id, gigFile(r.brief), ids)).toEqual({ ok: true, brief: r.brief });
    }
  });
  test('awkward YAML in every field round-trips (Review Focus 1)', () => {
    const awkward: Brief = { id: 'odd', title: 'Rates: high', tier: 'medium', place: 'the-tilt', client: '#1 fixer', target: '- dash · "quoted"', take: 'yes', text: "2049 Crew's job: don't ask." };
    expect(parseGigFile('odd', gigFile(awkward), ids)).toEqual({ ok: true, brief: awkward });
    for (const v of ['2049 Crew', 'no', "it's", 'a: b']) {
      const b = { ...awkward, client: v };
      expect(parseGigFile('odd', gigFile(b), ids)).toEqual({ ok: true, brief: b });
    }
  });
  test('the front matter is in field order', () => {
    const r = parseGigFile('held-pay', fs.readFileSync('world/gigs/held-pay.md', 'utf8'), ids);
    if (!r.ok) throw new Error('seed');
    const lines = gigFile(r.brief).split('\n');
    expect([lines[0], lines[7]]).toEqual(['---', '---']);
    expect(lines.slice(1, 7).map((l) => l.split(':')[0])).toEqual(['title', 'tier', 'place', 'client', 'target', 'take']);
    expect(lines.slice(1, 4)).toEqual(['title: Held Pay', 'tier: hard', 'place: the-tilt']);
    expect(gigFile(r.brief).endsWith('\n')).toBe(true);
  });
  test('briefId: from the title, unique, capped, never empty', () => {
    expect(briefId('Held Pay', new Set())).toBe('held-pay');
    expect(briefId('Held Pay', new Set(['held-pay']))).toBe('held-pay-2');
    expect(briefId('x'.repeat(60), new Set()).length).toBeLessThanOrEqual(40);
    expect(briefId('', new Set())).toBe('job');
    expect(briefId('!!!', new Set(['job']))).toBe('job-2');
  });
  test('looseBrief reads what it can', () => {
    const text = '---\ntitle: Half Done\ntier: legendary\nplace: the-tilt\nclient: C\ntarget: T\n---\nSome text.\n';
    expect(looseBrief('half-done', text, ids)).toEqual({ id: 'half-done', title: 'Half Done', tier: 'easy', place: 'the-tilt', client: 'C', target: 'T', take: '', text: 'Some text.' });
    expect(looseBrief('junk', 'not a brief', ids)).toMatchObject({ id: 'junk', title: '', text: 'not a brief' });
  });
});

describe('kinds (Slip)', () => {
  const file = (kind: string | null) =>
    `---\ntitle: Back Office\ntier: medium\n${kind === null ? '' : `kind: ${kind}\n`}place: the-tilt\nclient: A worker\ntarget: Glass Orchid · back office\ntake: a ledger page\n---\nIn and out.\n`;
  const slipSnap: GigSnapshot = { ...snap, kind: 'slip', tier: 'medium', result: 'clean', trace: 0, max: 8 };

  test('kind defaults to hack; kind: slip parses; kind: heist is a problem on kind', () => {
    const plain = parseGigFile('back-office', file(null), ids);
    expect(plain.ok && gigKind(plain.brief)).toBe('hack');
    const slip = parseGigFile('back-office', file('slip'), ids);
    expect(slip.ok && slip.brief.kind).toBe('slip');
    const bad = parseGigFile('back-office', file('heist'), ids);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.problems.map((p) => p.field)).toContain('kind');
  });

  test('gigFile round-trips both kinds and writes no kind line for a hack', () => {
    const slip = parseGigFile('back-office', file('slip'), ids);
    if (!slip.ok) throw new Error('slip did not parse');
    const text = gigFile(slip.brief);
    expect(text).toContain('\ntier: medium\nkind: slip\n');
    expect(parseGigFile('back-office', text, ids)).toEqual(slip);
    const hack = parseGigFile('back-office', file(null), ids);
    if (!hack.ok) throw new Error('hack did not parse');
    expect(gigFile(hack.brief)).not.toContain('kind:');
    expect(looseBrief('x', file('slip'), ids).kind).toBe('slip');
  });

  test('tierMax and the results each kind can end in', () => {
    expect([tierMax('hack', 'easy'), tierMax('hack', 'hard'), tierMax('slip', 'easy'), tierMax('slip', 'hard')]).toEqual([10, 14, 6, 10]);
    expect(RESULTS_FOR).toEqual({ hack: ['clean', 'close', 'traced'], slip: ['clean', 'close', 'caught'], papers: ['clean', 'close', 'back'] });
  });

  test('parseGigSnapshot: no kind is a hack; slip with caught is fine; slip with traced and hack with caught are not', () => {
    expect(parseGigSnapshot(snap)).toEqual(snap);
    expect(gigKind(parseGigSnapshot(snap)!)).toBe('hack');
    expect(parseGigSnapshot({ ...slipSnap, result: 'caught', trace: 0 })).toEqual({ ...slipSnap, result: 'caught', trace: 0 });
    expect(parseGigSnapshot({ ...slipSnap, result: 'traced' })).toBeNull();
    expect(parseGigSnapshot({ ...snap, result: 'caught' })).toBeNull();
    expect(parseGigSnapshot({ ...snap, kind: 'heist' })).toBeNull();
  });

  test('gigText for a slip: each result, exactly', () => {
    expect(gigText(slipSnap)).toBe(
      `[gig: Hicks just slipped a job off The Tilt's board, on foot, with you on comms watching their cameras: "Held Pay" (medium), targeting Glass Orchid · house ledger. Client: Nobody, through the Switchboard. Take: one worker's held payout, released. Brief: The house keeps its ledger behind thick lacquer. Result: lifted it clean, never seen.]`,
    );
    expect(gigText({ ...slipSnap, trace: 2 })).toContain('Result: lifted it clean, heat 2 of 8.]');
    expect(gigText({ ...slipSnap, result: 'close', trace: 5 })).toContain('Result: got it out, but the heat hit 5 of 8.]');
    expect(gigText({ ...slipSnap, result: 'caught', trace: 9 })).toContain('Result: caught at heat 9 of 8, walked out with nothing.]');
  });

  test('gigActionLine for a slip', () => {
    expect(gigActionLine(slipSnap)).toBe(`*Hicks slips into a job off The Tilt's board: "Held Pay".*`);
  });
});

describe('kinds (Papers)', () => {
  const papers: GigSnapshot = {
    kind: 'papers',
    you: 'Ines',
    title: 'Night Crossing',
    tier: 'medium',
    place: 'The Ferry Stairs',
    client: 'A dock family, through the Ferrymen',
    target: 'Tidal Isle · customs, booth nine',
    take: 'one crossing, papers that hold',
    brief: 'The boat drops them on the Isle at four.',
    result: 'clean',
    trace: 4,
    max: 6,
    papers: {
      name: 'Tomas Varga',
      bulletin: [
        { text: 'No arrivals from Kessen tonight.', why: "MiraGen's quarantine on Kessen hulls, day 9.", lore: 'miragen-pharmaceuticals' },
        { text: 'Clinic workers need a medical slip.', why: 'Chiron wants a health record on anyone near patients.', lore: 'chiron-medical' },
      ],
      overlooked: null,
    },
  };
  const head =
    '[gig: Ines just forged papers for a Ferrymen client, with you on comms: "Night Crossing" (medium). The client: Tomas Varga. Target: Tidal Isle · customs, booth nine. Take: one crossing, papers that hold. Brief: The boat drops them on the Isle at four. ' +
    "Tonight's bulletin: No arrivals from Kessen tonight (MiraGen's quarantine on Kessen hulls, day 9); Clinic workers need a medical slip (Chiron wants a health record on anyone near patients).";

  test('her line for each result', () => {
    expect(gigText(papers)).toBe(`${head} Result: waved through clean, risk 4 of 6.]`);
    expect(gigText({ ...papers, result: 'close', trace: 5 })).toBe(`${head} Result: waved through, but risk hit 5 of 6.]`);
    expect(gigText({ ...papers, result: 'back' })).toBe(`${head} Result: turned back at the booth; Tomas Varga goes back on the boat.]`);
  });
  test('booth nine is named before the result', () => {
    expect(gigText({ ...papers, papers: { ...papers.papers!, overlooked: 1 } })).toBe(`${head} Booth nine looked past "Clinic workers need a medical slip". Result: waved through clean, risk 4 of 6.]`);
  });
  test('without its detail the line still reads', () => {
    const { papers: _, ...bare } = papers;
    void _;
    expect(gigText({ ...bare, result: 'back' })).toBe(
      '[gig: Ines just forged papers for a Ferrymen client, with you on comms: "Night Crossing" (medium). Target: Tidal Isle · customs, booth nine. Take: one crossing, papers that hold. Brief: The boat drops them on the Isle at four. Result: turned back at the booth; the client goes back on the boat.]',
    );
  });
  test('the action line', () => expect(gigActionLine(papers)).toBe('*Ines sits down at a forger\'s desk for "Night Crossing".*'));
  test('gigFile writes kind: papers', () => {
    const b: Brief = { id: 'night-crossing', title: 'Night Crossing', tier: 'medium', kind: 'papers', place: 'the-tilt', client: 'c', target: 't', take: 'k', text: 'Body.' };
    expect(gigFile(b)).toContain('\nkind: papers\n');
    expect(parseGigFile('night-crossing', gigFile(b), null)).toEqual({ ok: true, brief: b });
  });
  test('parseGigSnapshot reads papers with and without its detail, and refuses a hack result', () => {
    expect(parseGigSnapshot(papers)).toEqual(papers);
    const { papers: _, ...bare } = papers;
    void _;
    expect(parseGigSnapshot(bare)).toEqual(bare);
    expect(parseGigSnapshot({ ...papers, result: 'traced' })).toBeNull();
    expect(parseGigSnapshot({ ...papers, papers: { name: 1, bulletin: [], overlooked: null } })).toBeNull();
    expect(parseGigSnapshot({ ...papers, papers: { ...papers.papers, overlooked: 1.5 } })).toBeNull();
    expect(RESULTS_FOR.papers).toEqual(['clean', 'close', 'back']);
  });
});

describe('the client’s pronoun (2026-10-12)', () => {
  const base: GigSnapshot = { kind: 'papers', you: 'Ines', title: 'T', tier: 'easy', place: 'P', client: 'C', target: 'X', take: 'K', brief: 'B.', result: 'back', trace: 1, max: 6, papers: { name: 'Zofia Novak', pronoun: 'she', bulletin: [], overlooked: null } };
  test('her line names the client with their pronoun', () => {
    expect(gigText(base)).toContain('The client: Zofia Novak (she).');
  });
  test('they for an untagged face; a row without one reads as before', () => {
    expect(gigText({ ...base, papers: { ...base.papers!, pronoun: 'they' } })).toContain('The client: Zofia Novak (they).');
    const { pronoun: _p, ...old } = base.papers!;
    void _p;
    expect(gigText({ ...base, papers: old })).toContain('The client: Zofia Novak.');
  });
  test('parseGigSnapshot keeps the pronoun and refuses a made-up one', () => {
    expect(parseGigSnapshot(base)?.papers?.pronoun).toBe('she');
    expect(parseGigSnapshot({ ...base, papers: { ...base.papers!, pronoun: 'it' } })).toBeNull();
  });
});
