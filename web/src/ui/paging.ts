/**
 * Splits a reply `contentHeight` px tall into pages that fit `available` px, each a whole number
 * of `lineHeight` lines (so no line is ever cut in half). A reply that fits is one unclipped page;
 * only once it doesn't is `reserve` px (the [CONTINUE] button) taken off each page.
 */
export function pageLayout(
  contentHeight: number,
  available: number,
  lineHeight: number,
  reserve = 0,
): { pageHeight: number; pages: number } {
  if (contentHeight <= available) return { pageHeight: contentHeight, pages: 1 };
  const pageHeight = Math.max(lineHeight, Math.floor((available - reserve) / lineHeight) * lineHeight);
  return { pageHeight, pages: Math.ceil(contentHeight / pageHeight) };
}

/** What paging needs to know about a reply's layout (measured from the DOM in the app, faked in tests). */
export interface PageMeasure {
  /** The full height of the reply's text. */
  content: number;
  /** How much height the text may take in the collapsed feed (feed height minus the message's header and tools). */
  available: number;
  /**
   * Stage mode: the room the text has with the box at rest (`--box-h`), when the box can stretch to
   * its cap (`--box-max`, which `available` is measured against). Absent: the box never grows.
   */
  base?: number;
  lineHeight: number;
  /** A reply with others' lines: each beat's own height (no page margins), in order. */
  beats?: number[];
}
