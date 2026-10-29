import { describe, expect, it } from 'vitest';
import { echoes, echoLine } from '../src/echoes';

// Her replies at Nix's apartment, 2026-10-23 21:03–21:07 (trimmed).
const AT_2103 =
  "*I bite into the bear claw and the pastry flakes onto the counter and I don't care.*\n\nThree in the morning is when I'm working, genius.\n\n*I brush the flakes off my fingers into the sink. The apartment's small and he's in it and the paper lantern's throwing warm light across the wall.*";
const AT_2105 =
  "*I look at the bear claw in my hand.*\n\nThat one's mine. Get your own.\n\n*I take another bite and chew and he's leaning against my counter in his SDG tee and I'm barefoot.*\n\nGood. What'd you find?";
const AT_2107 =
  "*I take another bite of the bear claw and look at him leaning against my counter in his SDG tee. The paper lantern's throwing warm light across the wall behind him.*\n\nDreamyweave. That's marketing.\n\n*I brush flakes off my fingers into the sink.*\n\nNoticed.";

describe('echoes', () => {
  it('names the phrases in two or more of her last replies, longest first, without the pieces of a longer one', () => {
    expect(echoes([AT_2103, AT_2105, AT_2107])).toEqual([
      "paper lantern's throwing warm light across the wall",
      'leaning against my counter in his sdg tee',
      'flakes off my fingers into the sink',
      'i take another bite',
    ]);
  });

  it('reads her *actions* only: a line she says twice is hers to say', () => {
    expect(echoes(['*I sit.* Paper lantern, warm light.', '*I stand.* Paper lantern, warm light.'])).toEqual([]);
  });

  it('leaves out short common phrases and what they just brought up', () => {
    expect(echoes(['*I look at him. My thumb.*', '*I look at him. My thumb.*'])).toEqual([]);
    expect(echoes(['*The bakery box sits open.*', '*I close the bakery box.*'])).toEqual(['bakery box']);
    expect(echoes(['*The bakery box sits open.*', '*I close the bakery box.*'], ['*hands you the bakery box*'])).toEqual([]);
  });

  it('looks at her last four replies only, and needs two', () => {
    const lantern = '*The paper lantern glows.*';
    expect(echoes([lantern])).toEqual([]);
    expect(echoes([lantern, lantern, '*a*', '*b*', '*c*', '*d*'])).toEqual([]);
    expect(echoes(['*a*', lantern, '*b*', lantern])).toEqual(['paper lantern glows']);
  });

  it('caps the list at eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => `*the ${'x'.repeat(5)}${String.fromCharCode(97 + i)} window*`).join(' ');
    expect(echoes([many, many])).toHaveLength(8);
  });
});

describe('echoLine', () => {
  it('is null when she is not repeating', () => {
    expect(echoLine([AT_2103])).toBeNull();
  });

  it('quotes the phrases and asks for something new', () => {
    expect(echoLine(['*The paper lantern glows.*', '*Under the paper lantern.*'])).toBe(
      `[you keep writing these — "paper lantern". Leave them out of this reply; write what's new in this moment instead.]`,
    );
  });
});
