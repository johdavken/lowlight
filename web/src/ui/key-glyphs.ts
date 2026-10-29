/**
 * The chat box's keys as pixel glyphs (spec 2026-10-16 subtitle chat box §7): small SVGs on a 16-px
 * grid, drawn in `currentColor`, so they look the same on every OS (the pixel fonts lack ↻ ✎ ⑂ ⇥).
 */
export type KeyId = 'regenerate' | 'continue' | 'edit' | 'delete' | 'branch' | 'suggest' | 'dice' | 'draw' | 'end' | 'leave';

type Rect = [x: number, y: number, w: number, h: number];

const steps = (n: number, f: (i: number) => Rect): Rect[] => Array.from({ length: n }, (_, i) => f(i));
const chevron = (x: number): Rect[] => [[x, 3, 2, 2], [x + 2, 5, 2, 2], [x + 4, 7, 2, 2], [x + 2, 9, 2, 2], [x, 11, 2, 2]];

const SHAPES: Record<KeyId, Rect[]> = {
  // ↻ a ring open at the top right, its arrowhead there
  regenerate: [[6, 2, 4, 2], [4, 3, 2, 2], [2, 5, 2, 6], [4, 11, 2, 2], [6, 12, 4, 2], [10, 11, 2, 2], [12, 7, 2, 4], [11, 1, 2, 5], [9, 4, 5, 2]],
  // » two chevrons
  continue: [...chevron(2), ...chevron(8)],
  // ✎ a pencil from the top right down to its point
  edit: [[11, 2, 3, 3], [9, 4, 3, 3], [7, 6, 3, 3], [5, 8, 3, 3], [3, 10, 3, 3], [2, 13, 2, 1]],
  // ✕
  delete: [...steps(6, (i): Rect => [2 + 2 * i, 2 + 2 * i, 2, 2]), ...steps(6, (i): Rect => [12 - 2 * i, 2 + 2 * i, 2, 2])],
  // ⑂ one stem, two branches
  branch: [[7, 8, 2, 6], [5, 6, 2, 2], [9, 6, 2, 2], [3, 2, 2, 4], [11, 2, 2, 4]],
  // 💬 a speech bubble holding an ellipsis: a line to say
  suggest: [[3, 2, 10, 2], [1, 4, 2, 6], [13, 4, 2, 6], [3, 10, 10, 2], [4, 12, 2, 2], [3, 14, 2, 1], [4, 6, 2, 2], [7, 6, 2, 2], [10, 6, 2, 2]],
  // ⚄ a die's outline, showing five
  dice: [[3, 1, 10, 2], [3, 13, 10, 2], [1, 3, 2, 10], [13, 3, 2, 10], [5, 5, 2, 2], [9, 5, 2, 2], [7, 7, 2, 2], [5, 9, 2, 2], [9, 9, 2, 2]],
  // ◆
  draw: [[7, 1, 2, 1], [6, 2, 4, 1], [5, 3, 6, 1], [4, 4, 8, 1], [3, 5, 10, 1], [2, 6, 12, 4], [3, 10, 10, 1], [4, 11, 8, 1], [5, 12, 6, 1], [6, 13, 4, 1], [7, 14, 2, 1]],
  // ■
  end: [[3, 3, 10, 10]],
  // ⇥ an arrow into a bar
  leave: [[2, 7, 8, 2], [6, 3, 2, 2], [8, 5, 2, 2], [10, 7, 1, 2], [8, 9, 2, 2], [6, 11, 2, 2], [12, 2, 2, 12]],
};

const SVG = 'http://www.w3.org/2000/svg';

export function keyGlyph(id: KeyId): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'glyph');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('shape-rendering', 'crispEdges');
  for (const [x, y, w, h] of SHAPES[id]) {
    const r = document.createElementNS(SVG, 'rect');
    r.setAttribute('x', String(x));
    r.setAttribute('y', String(y));
    r.setAttribute('width', String(w));
    r.setAttribute('height', String(h));
    svg.append(r);
  }
  return svg;
}

/** A key: its glyph and its word (`.lb`); CSS shows one or the other by SYS → CHAT KEYS. */
export function keyButton(id: KeyId, label: string, title?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'key';
  b.dataset.key = id;
  const lb = document.createElement('span');
  lb.className = 'lb';
  lb.textContent = label;
  b.append(keyGlyph(id), lb);
  b.setAttribute('aria-label', label);
  b.title = title ?? label;
  return b;
}
