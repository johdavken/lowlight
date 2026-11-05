import { describe, expect, it } from 'vitest';
import { angleFlags, contractRep, nightAlarm, openPieces } from './contract';
import { offTemplate } from './job-template';
import { parseQuestFile } from './quests';
import { CONTRACT } from './quests.contract.fixture';

const parse = (text: string) => parseQuestFile('test-contract', text, { roster: null, places: null });
const problems = (text: string) => {
  const r = parse(text);
  return r.ok ? [] : r.problems.map((p) => p.message);
};

describe('what groundwork leaves (tier 3 contracts spec §3)', () => {
  it('ALARM: one a messy or blown piece, at most 2', () => {
    expect(nightAlarm({ a: 'clean', b: 'messy' })).toBe(1);
    expect(nightAlarm({ a: 'blown', b: 'messy' })).toBe(2);
    expect(nightAlarm({ a: 'blown', b: 'messy', c: 'blown' })).toBe(2);
    expect(nightAlarm({})).toBe(0);
  });
  it('flags: an angle on clean or messy, seen on blown', () => {
    expect(angleFlags({ a: 'clean', b: 'blown' })).toEqual({ 'angle.a': 'yes', seen: 'yes' });
    expect(angleFlags({ a: 'messy' })).toEqual({ 'angle.a': 'yes' });
  });
  it('rep', () => expect([contractRep('clean'), contractRep('messy'), contractRep('blown')]).toEqual([15, 2, -25]));
});

describe('the contract file (tier 3 contracts spec §1)', () => {
  it('kind: big is a problem, whatever else the old file holds', () => {
    expect(problems(CONTRACT.replace('kind: contract', 'kind: big\ngo: 03:00'))).toEqual(['big jobs are contracts now']);
  });
  it('parses', () => {
    const r = parse(CONTRACT);
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect(r.entry.kind).toBe('contract');
    expect(r.entry.contract).toEqual({ night: 72 * 60, fallout: 48 * 60, pieces: [{ id: 'boat', spec: 'muscle', line: expect.stringContaining('Her skiff') }, { id: 'roof', spec: 'ears', line: expect.stringContaining('A room in a building') }, { id: 'goodwill', spec: 'face', line: expect.stringContaining('Her name on the water') }], postsAt: 45, rumor: 'Mother Rot has been asking after you.' });
  });
  it('wants three pieces', () => expect(problems(CONTRACT.replace('boat muscle, roof ears, goodwill face', 'boat muscle, roof ears'))).toContain('groundwork: needs three pieces'));
  it('wants a line for each piece', () => expect(problems(CONTRACT.replace(/^piece roof:.*\n/m, ''))).toContain('a contract needs a piece roof: line'));
  it("wants no line for a piece it doesn't have", () => expect(problems(CONTRACT.replace('piece roof:', 'piece attic:'))).toContain("'attic' isn't in groundwork:"));
  it('wants a report for each piece', () => expect(problems(CONTRACT.replace(/# report-roof/g, '# reported-roof').replace('groundwork: boat muscle', 'groundwork: boat muscle'))).toContain('a contract needs a # report-roof beat'));
  it('wants a night', () => expect(problems(CONTRACT.replace('# night\n', '# dusk\n'))).toContain('a contract needs a # night beat'));
  it('wants one contact', () => {
    expect(problems(CONTRACT.replace('with: [mother-rot]', 'with: [mother-rot, cass]'))).toContain('a contract belongs to one contact (with: one id)');
    expect(problems(CONTRACT.replace('with: [mother-rot]\n', ''))).toContain('a contract belongs to one contact (with: one id)');
  });
  it('wants a rumor', () => expect(problems(CONTRACT.replace('rumor: Mother Rot has been asking after you.\n', ''))).toContain('a contract needs rumor:'));
  it('a no-roll pick fills no TAKE, as on any template job', () => {
    const r = parse(CONTRACT);
    if (!r.ok) throw new Error('fixture');
    expect(r.entry.template).toBe(true);
  });
  it('the template reads the night alone', () => {
    const r = parse(CONTRACT);
    if (!r.ok) throw new Error('fixture');
    expect(offTemplate(r.entry)).toEqual([]);
  });
  it('a roll outside the night is off template', () => {
    const r = parse(CONTRACT.replace('- take: Take it. → taken\n', '- take: Take it. → taken / taken [check cool 50]\n'));
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    expect(offTemplate(r.entry)).toContain('beat offer: no rolled cards outside the night');
  });
});

describe('which groundwork is open (tier 3 contracts spec §2)', () => {
  const pieces = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('all three to start', () => expect(openPieces(pieces, [], 5).map((p) => p.id)).toEqual(['a', 'b', 'c']));
  it('none more tonight', () => expect(openPieces(pieces, [{ piece: 'a', day: 5 }], 5)).toEqual([]));
  it('the others the next night', () => expect(openPieces(pieces, [{ piece: 'a', day: 5 }], 6).map((p) => p.id)).toEqual(['b', 'c']));
  it('none after two', () => expect(openPieces(pieces, [{ piece: 'a', day: 5 }, { piece: 'b', day: 6 }], 7)).toEqual([]));
});
