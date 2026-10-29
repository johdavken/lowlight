import { describe, expect, it } from 'vitest';
import { crewView } from '../src/crew-view';
import { emptyCrewBook } from '../../shared/crew-book';
import { foldWithCrew } from '../../shared/crew-fold';

describe('crewView without crew tables (a build ships no world/crew yet)', () => {
  it('lists no hires rather than cards named Nobody', () => {
    const book = emptyCrewBook();
    const r = foldWithCrew({ start: { deck: null, edgeMax: 1, from: 0 }, kitEvents: [], crew: [], now: 1200, book, seed: 's', instance: () => null });
    const v = crewView({ crew: r.crew, kit: r.kit, book, now: 1200, seed: 's', places: [{ id: 'low-roller', name: 'The Low Roller', district: 'strand', hires: ['face'] }], extras: [], posted: [], here: null, districts: ['strand'] });
    expect(v.hires).toEqual([]);
  });
});
