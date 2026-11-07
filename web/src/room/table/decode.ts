/**
 * The decode effect (playtest, 2026-11-06): a block of glyphs flickers while a line is on its way, then the real letters
 * lock in from the left. Plain capitals, digits and signs: every one is a single cell in the mono the lines use, so the
 * text doesn't shuffle as it changes. The loops end when their element leaves the page; a redraw needs no cleanup.
 */
export const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789/\\#%&@$*+=<>';
/** How much noise stands in for a line not written yet: about what a line fills. */
export const WAIT_CHARS = 48;
/** How long the letters take to lock in, and how fast the noise changes (about 15 a second). */
export const DECODE_MS = 600;
const FRAME_MS = 66;

const glyph = (r: () => number) => GLYPHS[Math.floor(r() * GLYPHS.length)];

export const noise = (n: number, r: () => number = Math.random): string => Array.from({ length: n }, () => glyph(r)).join('');

/**
 * The line `p` of the way through (0–1): `locked` is real, `rest` is noise. Spaces stay put, so the words wrap where they
 * will end up. The noise past the line's end drops out as it goes, so the block shrinks to the line's size.
 */
export function decodeFrame(text: string, p: number, r: () => number = Math.random): { locked: string; rest: string } {
  const n = Math.floor(p * text.length);
  const tail = text.slice(n).replace(/\S/g, () => glyph(r));
  return { locked: text.slice(0, n), rest: tail + noise(Math.round(Math.max(0, WAIT_CHARS - text.length) * (1 - p)), r) };
}

/** `n` flickers until it leaves the page. */
export function scrambleIn(n: HTMLElement): void {
  n.textContent = noise(WAIT_CHARS);
  const timer = setInterval(() => {
    if (n.isConnected) n.textContent = noise(WAIT_CHARS);
    else clearInterval(timer);
  }, FRAME_MS);
}

/** `n` decodes to `text`: noise first, then the letters lock in. `decoding` keeps the line's own fade off it. */
export function decodeIn(n: HTMLElement, text: string): void {
  n.classList.add('decoding');
  const started = performance.now();
  const draw = (p: number) => {
    const { locked, rest } = decodeFrame(text, p);
    const tail = document.createElement('span');
    tail.className = 'tb-noise';
    tail.textContent = rest;
    n.replaceChildren(locked, tail);
  };
  draw(0);
  const timer = setInterval(() => {
    const p = (performance.now() - started) / DECODE_MS;
    if (!n.isConnected) clearInterval(timer);
    else if (p < 1) draw(p);
    else {
      clearInterval(timer);
      n.textContent = text;
    }
  }, FRAME_MS);
}
