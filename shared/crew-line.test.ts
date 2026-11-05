import { describe, expect, it } from 'vitest';
import type { CrewMember, CrewResult, CrewState } from './crew-fold';
import { crewLine } from './crew-line';

const result = (at: number, line: string, o: Partial<CrewResult> = {}): CrewResult => ({ at, band: 'clean', fate: null, line, effects: '', ...o });
const member = (name: string, log: CrewResult[], o: Partial<CrewMember> = {}): CrewMember =>
  ({ recruit: { id: name, name, face: null, origin: 'karasu', spec: 'runner', grade: 1, traits: [], hidden: null, pitch: '', wage: 40 }, state: 'ready', busy: false, runs: { clean: 0, messy: 0, blown: 0 }, toNext: 3, loyalty: 50, revealed: [], log, goneUsed: false, hired: { at: 0, place: 'low-roller' }, ...o }) as CrewMember;
const S = (members: CrewMember[]): CrewState => ({ members, prep: {}, scouted: [], taken: [], latest: null, wages: 0 });

describe('crewLine (crew spec §5)', () => {
  it('one landing', () => expect(crewLine(S([member('Juno Sato', [result(100, 'Juno got back from casing the Tilt, clean.')])]), 50, 200)).toBe('[crew] Juno got back from casing the Tilt, clean.'));

  it('three newest, then the rest counted', () => {
    const s = S([member('A', [result(105, 'E five.'), result(104, 'D four.'), result(101, 'A one.')]), member('B', [result(103, 'C three.'), result(102, 'B two.')])]);
    expect(crewLine(s, 0, 200)).toBe('[crew] E five. D four. C three. And 2 more.');
  });

  it('leaves job results out', () => {
    expect(crewLine(S([member('Dez', [result(100, 'Dez walked off Back Door clean.', { from: 'job' })])]), 0, 200)).toBeNull();
  });

  it('walked and talked', () => {
    const s = S([member('Pell Ash', [], { state: 'gone', gone: 'walked', goneAt: 120 }), member('Koji Mar', [], { state: 'gone', gone: 'talked', goneAt: 130 }), member('Old', [], { state: 'gone', gone: 'let go', goneAt: 140 })]);
    expect(crewLine(s, 0, 200)).toBe('[crew] Koji talked to SDG. Pell walked.');
  });

  it('only the window: after since, up to until', () => {
    const s = S([member('A', [result(100, 'At since.'), result(150, 'Inside.'), result(201, 'After.')])]);
    expect(crewLine(s, 100, 200)).toBe('[crew] Inside.');
    expect(crewLine(s, 150, 200)).toBeNull();
  });

  it('a line without a full stop gets one', () => expect(crewLine(S([member('A', [result(100, 'Juno came back')])]), 0, 200)).toBe('[crew] Juno came back.'));
});
