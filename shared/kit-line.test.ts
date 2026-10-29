import { describe, expect, it } from 'vitest';
import { kitLine, withArticle } from './kit-line';
import type { Deck } from './gear';
import type { Kit } from './mission';

const DECKS: Deck[] = [
  { id: 'stall-build', name: 'Stall build', bonus: 15, heat: 0, traits: ['fragile'] },
  { id: 'old-karasu', name: 'Old Karasu deck', bonus: 5, heat: 0, traits: ['ghost'] },
];
const kit = (o: Partial<Kit>): Kit => ({ deck: null, sol: 0, heat: {}, rep: {}, cover: { burner: 0, 'fall-guy': 0 }, edgeLeft: 1, edgeMax: 1, ...o });

describe('kitLine', () => {
  it('a deck and heat', () => {
    expect(kitLine('Hicks', kit({ deck: 'stall-build', heat: { karasu: 4 } }), DECKS, 'karasu')).toBe('Hicks carries a stall build. Heat 4 of 10 here.');
  });
  it('a deck with a vowel takes an', () => {
    expect(kitLine('Hicks', kit({ deck: 'old-karasu' }), DECKS, 'karasu')).toBe('Hicks carries an Old Karasu deck. Heat 0 of 10 here.');
    expect(withArticle('Cortex Meridian')).toBe('a Cortex Meridian');
  });
  it('no deck: the heat alone', () => {
    expect(kitLine('Nix', kit({ heat: { karasu: 3 } }), DECKS, 'karasu')).toBe('Heat 3 of 10 here.');
  });
  it('no deck and no heat: nothing', () => {
    expect(kitLine('Nix', kit({}), DECKS, 'karasu')).toBeNull();
  });
  it('heat is the district here, not the hottest', () => {
    expect(kitLine('Nix', kit({ heat: { velvet: 7 } }), DECKS, 'karasu')).toBeNull();
    expect(kitLine('Hicks', kit({ deck: 'stall-build', heat: { velvet: 7, karasu: 1 } }), DECKS, 'karasu')).toBe('Hicks carries a stall build. Heat 1 of 10 here.');
  });
});
