/** The title band's pixel glyphs: 16×16 art, `#` for a lit cell, drawn crisp in the mark's colour. */

export type GlyphName = 'new' | 'load' | 'report';

const ROWS: Record<GlyphName, string[]> = {
  // NEW GAME: a terminal prompt, a fresh line waiting.
  new: [
    '................',
    '................',
    '.##.............',
    '..##............',
    '...##...........',
    '....##..........',
    '.....##.........',
    '....##..........',
    '...##...........',
    '..##............',
    '.##.....######..',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  // LOAD: three data shards stacked, the newest in front.
  load: [
    '................',
    '....##########..',
    '....#........#..',
    '..##########.#..',
    '..#........#.#..',
    '##########.#.#..',
    '#........#.###..',
    '#.######.#.#....',
    '#........###....',
    '#.######.#......',
    '#........#......',
    '##########......',
    '................',
    '................',
    '................',
    '................',
  ],
  // REPORT A BUG: a mast sending out signal (the report goes out over the relay).
  report: [
    '................',
    '.#............#.',
    '#..#........#..#',
    '#.#..........#.#',
    '#.#...####...#.#',
    '#.#...#..#...#.#',
    '#..#..####..#..#',
    '.#.....##.....#.',
    '.......##.......',
    '......####......',
    '.....##..##.....',
    '....##....##....',
    '...##......##...',
    '................',
    '................',
    '................',
  ],
};

const SVG = 'http://www.w3.org/2000/svg';

/** `name` as an inline svg: one 1×1 rect per lit cell, filled with currentColor. */
export function glyphSvg(name: GlyphName): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  ROWS[name].forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      const r = document.createElementNS(SVG, 'rect');
      r.setAttribute('x', String(x));
      r.setAttribute('y', String(y));
      r.setAttribute('width', '1');
      r.setAttribute('height', '1');
      svg.append(r);
    }
  });
  return svg;
}
