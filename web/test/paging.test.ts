import { describe, expect, it } from 'vitest';
import { pageLayout } from '../src/ui/paging';

describe('pageLayout', () => {
  it('a reply that fits is one page, unclipped', () => {
    expect(pageLayout(300, 410, 25)).toEqual({ pageHeight: 300, pages: 1 });
  });

  it('pages are whole lines: 410px available at 25px lines → 400px pages', () => {
    expect(pageLayout(1000, 410, 25)).toEqual({ pageHeight: 400, pages: 3 });
  });

  it('an exact multiple has no empty trailing page', () => {
    expect(pageLayout(800, 410, 25)).toEqual({ pageHeight: 400, pages: 2 });
  });

  it("the button's room is only taken once paging is needed: a reply that fits without it is one page", () => {
    // Dixie's 672px reply in 680px of room: it fits, even though 680 - 40 (button) would not.
    expect(pageLayout(672, 680, 24.8, 40)).toEqual({ pageHeight: 672, pages: 1 });
    expect(pageLayout(1000, 450, 25, 40)).toEqual({ pageHeight: 400, pages: 3 });
  });

  it('never shrinks a page below one line', () => {
    expect(pageLayout(100, 10, 25)).toEqual({ pageHeight: 25, pages: 4 });
  });
});
