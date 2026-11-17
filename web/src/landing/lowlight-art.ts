/**
 * Block letters (█ ▀ ▄), eight rows tall, for the opening card's decrypting names: LOWLIGHT, HICKS and SOREN.
 * Each letter is drawn on its own and padded to its width, so a row typo can't shift the others.
 */

const LETTERS: Record<string, string[]> = {
  L: [
    '▄█       ', //
    '███      ',
    '███      ',
    '███      ',
    '███      ',
    '███      ',
    '███     ▄',
    '█████████',
  ],
  O: [
    ' ▄█████▄ ', //
    '███   ███',
    '███   ███',
    '███   ███',
    '███   ███',
    '███   ███',
    '███   ███',
    ' ▀█████▀ ',
  ],
  W: [
    '▄█    ▄█▄    █▄', //
    '███   ███   ███',
    '███   ███   ███',
    '███   ███   ███',
    '███   ███   ███',
    '███   ███   ███',
    '███   ███   ███',
    ' ▀█████▀█████▀ ',
  ],
  I: [
    '▄█▄', //
    '███',
    '███',
    '███',
    '███',
    '███',
    '███',
    '███',
  ],
  G: [
    ' ▄█████▄ ', //
    '███   ███',
    '███   ▀▀▀',
    '███      ',
    '███  ▄▄▄▄',
    '███   ███',
    '███   ███',
    ' ▀██████▀',
  ],
  H: [
    '▄█     █▄', //
    '███   ███',
    '███   ███',
    '███▄▄▄███',
    '███▀▀▀███',
    '███   ███',
    '███   ███',
    '███   ███',
  ],
  T: [
    '▄███████▄', //
    '▀▀▀███▀▀▀',
    '   ███   ',
    '   ███   ',
    '   ███   ',
    '   ███   ',
    '   ███   ',
    '   ███   ',
  ],
  C: [
    ' ▄█████▄ ', //
    '███   ███',
    '███   ▀▀▀',
    '███      ',
    '███      ',
    '███   ▄▄▄',
    '███   ███',
    ' ▀█████▀ ',
  ],
  K: [
    '▄█     ▄█', //
    '███   ███',
    '███  ███ ',
    '███▄██▀  ',
    '███▀██▄  ',
    '███  ███ ',
    '███   ███',
    '███   ███',
  ],
  S: [
    ' ▄█████▄ ', //
    '███   ███',
    '███▄     ',
    ' ▀█████▄ ',
    '     ▀███',
    '▄▄▄   ███',
    '███   ███',
    ' ▀█████▀ ',
  ],
  R: [
    '▄███████▄', //
    '███   ███',
    '███   ███',
    '███▄▄▄██▀',
    '███▀▀██▄ ',
    '███   ███',
    '███   ███',
    '███   ███',
  ],
  E: [
    '▄████████', //
    '███      ',
    '███      ',
    '███▄▄▄▄  ',
    '███▀▀▀▀  ',
    '███      ',
    '███     ▄',
    '█████████',
  ],
  N: [
    '▄█▄    ▄█▄', //
    '███▄   ███',
    '████▄  ███',
    '███▀█▄ ███',
    '███ ▀█▄███',
    '███  ▀████',
    '███   ▀███',
    '███    ███',
  ],
};

/** Columns between letters. */
const GAP = 2;

/** Lines of block art for `word`, or null when a letter has no art. */
export function blockArt(word: string): string[] | null {
  const letters = [...word.toUpperCase()].map((c) => LETTERS[c]);
  if (!letters.length || letters.some((l) => !l)) return null;
  const rows = letters[0].length;
  return Array.from({ length: rows }, (_, r) =>
    letters
      .map((l) => {
        const w = Math.max(...l.map((line) => [...line].length));
        return l[r].padEnd(w, ' ');
      })
      .join(' '.repeat(GAP)),
  );
}

/** One filled cell of the art: its column, row and block character. */
export interface ArtCell {
  col: number;
  row: number;
  ch: string;
}

/** The art's filled cells in reading order (top row first, left to right), with its size in cells. */
export function artCells(lines: string[]): { cells: ArtCell[]; cols: number; rows: number } {
  const cells: ArtCell[] = [];
  let cols = 0;
  lines.forEach((line, row) => {
    const chars = [...line];
    cols = Math.max(cols, chars.length);
    chars.forEach((ch, col) => {
      if (ch !== ' ') cells.push({ col, row, ch });
    });
  });
  return { cells, cols, rows: lines.length };
}
