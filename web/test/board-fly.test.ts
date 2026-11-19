// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fly } from '../src/room/board/moments';

/** jsdom has no layout: a box with the size and place the board's CSS gives it. */
const box = (w: number, h: number, x = 0, y = 0, parent?: HTMLElement) => {
  const n = document.createElement('div');
  for (const [k, v] of Object.entries({ offsetWidth: w, offsetHeight: h, offsetLeft: x, offsetTop: y, offsetParent: parent ?? null })) Object.defineProperty(n, k, { value: v });
  parent?.append(n);
  return n;
};

describe('a card flies into the slot', () => {
  it("a recruit's card lands as it always has: scaled to the slot about its centre", () => {
    const root = box(1600, 900);
    const slot = box(168, 226, 1000, 300, root);
    const card = box(204, 272);
    fly(card, slot, root, true);
    expect([card.style.left, card.style.top, card.style.transform]).toEqual(['982px', '277px', 'scale(0.824)']);
  });

  it("a program's smaller card is scaled up to fill the slot, not left in its corner", () => {
    const root = box(1600, 900);
    const slot = box(168, 226, 1000, 300, root);
    const card = box(126, 168);
    fly(card, slot, root, true);
    // Centred on the slot (1000 + (168 − 126) / 2, 300 + (226 − 168) / 2) and scaled to its size.
    expect([card.style.left, card.style.top]).toEqual(['1021px', '329px']);
    const s = Number(/scale\(([\d.]+)\)/.exec(card.style.transform)![1]);
    // It fills the slot's width, the tighter fit, and its height stays inside the slot.
    expect(Math.round(126 * s)).toBe(168);
    expect(Math.round(168 * s)).toBeLessThanOrEqual(226);
    expect(Math.round(168 * s)).toBeGreaterThan(220);
  });
});
