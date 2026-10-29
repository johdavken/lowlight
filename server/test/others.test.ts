import { describe, expect, it } from 'vitest';
import { presenceNote, whoIsHere } from '../src/others';
import type { Present } from '../../shared/types';

const silas: Present = { id: 'silas', kind: 'contact', name: 'Silas', pronoun: 'they' };
const hae: Present = { id: 'hae', kind: 'resident', name: 'Hae', pronoun: 'they' as const };
const cass: Present = { id: 'cass', kind: 'contact', name: 'Cass', pronoun: 'they' as const };

describe('whoIsHere', () => {
  it("carries each person's pronoun", () => {
    const here = whoIsHere({
      sceneId: 'k/stall',
      resident: { id: 'hae', name: 'Hae', pronoun: 'she' },
      contacts: [{ id: 'rot', name: 'Mother Rot', pronoun: 'he', sceneId: 'k/stall' }],
      exclude: [],
    });
    expect(here.map((p) => p.pronoun)).toEqual(['she', 'he']);
  });

  const contacts = [
    { id: 'ember', name: 'Ember', pronoun: 'they' as const, sceneId: 'ribbon/zhou-flat' },
    { id: 'silas', name: 'Silas', pronoun: 'they' as const, sceneId: 'ribbon/zhou-flat' },
    { id: 'hicks', name: 'Hicks', pronoun: 'they' as const, sceneId: 'ribbon/zhou-flat' },
    { id: 'cass', name: 'Cass', pronoun: 'they' as const, sceneId: 'ribbon/the-tilt' },
  ];

  it('the contacts in this room, in roster order, never the contact or the player', () => {
    expect(whoIsHere({ sceneId: 'ribbon/zhou-flat', resident: null, contacts, exclude: ['ember', 'hicks'] })).toEqual([silas]);
  });

  it('the resident comes first', () => {
    const here = [...contacts, { id: 'zed', name: 'Zed', pronoun: 'they' as const, sceneId: 'ribbon/zhou-flat' }];
    expect(whoIsHere({ sceneId: 'ribbon/zhou-flat', resident: { id: 'hae', name: 'Hae', pronoun: 'they' as const }, contacts: here, exclude: ['ember', 'hicks'] }).map((p) => p.id)).toEqual(['hae', 'silas', 'zed']);
  });

  it('never someone who shares the contact\'s or the player\'s name (their markers would be hers)', () => {
    const twins = [
      { id: 'nix', name: 'Nix', pronoun: 'they' as const, sceneId: 'ribbon/lowlight-intake' },
      { id: 'nix-direct', name: 'Nix', pronoun: 'they' as const, sceneId: 'ribbon/lowlight-intake' },
      { id: 'cass', name: 'Cass', pronoun: 'they' as const, sceneId: 'ribbon/lowlight-intake' },
    ];
    expect(whoIsHere({ sceneId: 'ribbon/lowlight-intake', resident: null, contacts: twins, exclude: ['nix'], excludeNames: ['Nix', 'Hicks'] }).map((p) => p.id)).toEqual(['cass']);
  });

  it('nobody else here is an empty list', () => {
    expect(whoIsHere({ sceneId: 'ribbon/rooftop', resident: null, contacts, exclude: [] })).toEqual([]);
  });
});

describe('presenceNote', () => {
  const next = (id: string) => (id === 'silas' ? 'the Second Socket' : null);

  it('nothing changed: no line', () => {
    expect(presenceNote([hae, silas], [hae, silas], next)).toBeNull();
  });

  it('someone heads out, to their next place when they have one', () => {
    expect(presenceNote([silas], [], next)).toBe('[Silas heads out — due at the Second Socket.]');
    expect(presenceNote([cass], [], next)).toBe('[Cass heads out.]');
  });

  it('someone comes in', () => {
    expect(presenceNote([], [silas], next)).toBe('[Silas comes in.]');
  });

  it('one leaves and one arrives: both lines', () => {
    expect(presenceNote([silas], [cass], next)).toBe('[Silas heads out — due at the Second Socket.]\n[Cass comes in.]');
  });
});
