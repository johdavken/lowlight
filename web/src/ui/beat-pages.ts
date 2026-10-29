/**
 * A reply with more than one speaker plays in the dialogue box a speaker at a time: every beat after
 * the first starts on a new page. Heights and starts are px in the reply's text box.
 */

/** Where each beat starts when every beat after the first begins on a new page. */
export function beatStarts(heights: number[], pageHeight: number): number[] {
  const starts: number[] = [];
  let end = 0;
  heights.forEach((h, i) => {
    const start = i === 0 ? 0 : Math.ceil(end / pageHeight) * pageHeight;
    starts.push(start);
    end = start + h;
  });
  return starts;
}

/** The beat on page `page` (0-based), given those starts. */
export function beatOnPage(starts: number[], page: number, pageHeight: number): number {
  const top = page * pageHeight;
  let at = 0;
  starts.forEach((s, i) => {
    if (s <= top) at = i;
  });
  return at;
}
