import { describe, expect, it } from 'vitest';
import { contactCardsFrom, giversFromEnv } from '../src/contact-cards';
import type { HeldLead } from '../../shared/types';

const lead = (id: string, givenBy: string, at: number): HeldLead => ({ id, givenBy, details: '', at, followed: false });
const people: Record<string, { name: string; accent: string; portrait: string | null }> = {
  cass: { name: 'Cass Okafor', accent: '#ff4f8b', portrait: '/p/cass.png' },
  ines: { name: 'Ines Calder', accent: '#4fd1c5', portrait: null },
  hicks: { name: 'Hicks', accent: '#7fe9ff', portrait: null },
};
const trades: Record<string, string | undefined> = { cass: 'fence', hicks: 'wire' };
const cards = (held: HeldLead[]) => contactCardsFrom(held, (id) => people[id] ?? null, (id) => trades[id] as never);

describe('contact cards from leads given', () => {
  it('one card per giver with a trade, in order of their first lead', () => {
    expect(cards([lead('a', 'hicks', 5), lead('b', 'cass', 2), lead('c', 'cass', 9), lead('d', 'ines', 1)])).toEqual([
      { id: 'cass', name: 'Cass Okafor', accent: '#ff4f8b', portrait: '/p/cass.png', spec: 'fence' },
      { id: 'hicks', name: 'Hicks', accent: '#7fe9ff', portrait: null, spec: 'runner' },
    ]);
  });
  it('no leads (a rewound lead), no card', () => {
    expect(cards([])).toEqual([]);
  });
  it('a giver with no trade, or one not met, has no card', () => {
    expect(cards([lead('d', 'ines', 1)])).toEqual([]);
    expect(cards([lead('e', 'stranger', 1)])).toEqual([]);
  });
});

describe('an old trade', () => {
  it('a trade of wire plays as a runner', () => {
    expect(cards([{ id: 'a', givenBy: 'hicks', details: '', at: 0, followed: false }])[0].spec).toBe('runner');
  });
});

describe('NIX_TEST_GIVERS (e2e only)', () => {
  it('reads player@contact pairs; anything unreadable gives none', () => {
    expect(giversFromEnv('hicks', { NIX_TEST_GIVERS: 'hicks@cass,cass@hicks' })).toEqual(['cass']);
    expect(giversFromEnv('hicks', { NIX_TEST_GIVERS: 'hicks@cass,nonsense' })).toEqual([]);
    expect(giversFromEnv('hicks', {})).toEqual([]);
  });
});
