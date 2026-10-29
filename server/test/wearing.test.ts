import { describe, expect, it } from 'vitest';
import type { SpriteRecord } from '../src/agents';
import { baseOutfitOf, wearingEntries, wearingLine, wearsOf, wornNow } from '../src/wearing';

const sprite = (over: Partial<SpriteRecord> = {}): SpriteRecord => ({
  file: '/c/indoors.png',
  crop: { top: 0, bottom: 0.5 },
  expressions: {},
  outfits: { indoors: '/c/indoors.png', home: '/c/home.png' },
  outfitByScene: {},
  outfitWears: { indoors: 'black crop top', home: 'old hoodie' },
  ...over,
});

describe('baseOutfitOf', () => {
  it('is the outfit whose file is the sprite', () => expect(baseOutfitOf(sprite())).toBe('indoors'));
  it('is null when no outfit is the sprite', () => expect(baseOutfitOf(sprite({ file: '/c/plain.png' }))).toBeNull());
});

describe('wornNow', () => {
  it('takes a choice she has', () => expect(wornNow(sprite(), 'home')).toBe('home'));
  it('falls back to the base for a stale choice', () => expect(wornNow(sprite(), 'gone')).toBe('indoors'));
  it('falls back to the base with no choice', () => {
    expect(wornNow(sprite(), null)).toBe('indoors');
    expect(wornNow(sprite(), undefined)).toBe('indoors');
  });
  it('is null with no base and no choice', () => expect(wornNow(sprite({ file: '/c/plain.png' }), null)).toBeNull());
  it('is null with no outfits', () => expect(wornNow(sprite({ outfits: {} }), 'home')).toBeNull());
});

describe('wearsOf', () => {
  it("is the line for what she has on", () => expect(wearsOf(sprite(), 'home')).toBe('old hoodie'));
  it('is null without a sprite', () => expect(wearsOf(null, 'home')).toBeNull());
  it("is null when what she has on has no line", () => expect(wearsOf(sprite({ outfitWears: { home: 'old hoodie' } }), null)).toBeNull());
});

describe('wearingLine', () => {
  it('is null with no one', () => expect(wearingLine([])).toBeNull());
  it("names her by name as yourself (the [you] line is the player's), others with their pronoun, in order, ] made safe", () => {
    expect(
      wearingLine([
        { name: 'Ember', pronoun: 'she', self: true, text: 'grey coat' },
        { name: 'Nix', pronoun: 'she', text: 'red ] scarf' },
      ]),
    ).toBe('[wearing: Ember (she, yourself) — grey coat; Nix (she) — red ) scarf]');
  });

  it('a ; inside a line becomes a comma, so it never reads as another entry', () => {
    expect(wearingLine([{ name: 'Hae', pronoun: 'she', text: 'boots; pad in hand' }])).toBe('[wearing: Hae (she) — boots, pad in hand]');
  });
});

describe('wearingEntries', () => {
  const wardrobes: Record<string, SpriteRecord> = {
    ember: sprite({ outfitByScene: { 'karasu/zhou-flat': 'home' } }),
    nix: sprite({ file: '/c/n.png', outfits: { coat: '/c/n.png', dress: '/c/d.png' }, outfitWears: { coat: 'grey coat', dress: 'black dress' } }),
    hae: sprite({ file: '/c/h.png', outfits: { work: '/c/h.png' }, outfitWears: { work: 'apron' }, outfitByScene: { 'karasu/zhou-flat': 'work' } }),
    plain: sprite({ file: '/c/p.png', outfits: {}, outfitWears: {} }),
  };
  const wardrobe = (id: string) => wardrobes[id] ?? null;
  const base = { self: { id: 'ember', name: 'Ember', pronoun: 'she' as const }, wardrobe, player: { id: 'nix', name: 'Nix', pronoun: 'she' as const }, playerOutfit: null, others: [] };

  it("her own follows the scene; the player's the YOU sheet, not the scene", () => {
    expect(wearingEntries({ ...base, sceneId: 'karasu/zhou-flat', playerOutfit: 'dress' })).toEqual([
      { name: 'Ember', pronoun: 'she', self: true, text: 'old hoodie' },
      { name: 'Nix', pronoun: 'she', text: 'black dress' },
    ]);
  });

  it('elsewhere she wears her base outfit; the player with no choice wears theirs', () => {
    expect(wearingEntries({ ...base, sceneId: 'karasu/the-tilt' }).map((e) => e.text)).toEqual(['black crop top', 'grey coat']);
  });

  it("others follow the scene, in order, after the player; anyone without a line is left out", () => {
    const others = [
      { id: 'plain', name: 'Plain', pronoun: 'they' as const },
      { id: 'hae', name: 'Hae', pronoun: 'she' as const },
      { id: 'ghost', name: 'Ghost', pronoun: 'he' as const },
    ];
    expect(wearingEntries({ ...base, sceneId: 'karasu/zhou-flat', others }).map((e) => e.name)).toEqual(['Ember', 'Nix', 'Hae']);
  });

  it('a player with no sprite (a persona) has no entry', () => {
    expect(wearingEntries({ ...base, sceneId: 'x', player: { id: 'you', name: 'You', pronoun: 'they' } }).map((e) => e.name)).toEqual(['Ember']);
  });
});
