/**
 * District names printed on the map (district names spec 2026-10-28): each name runs along a circular arc between
 * its two ends, bowed by its bend, the letters spread to fill it. Drawn into a 3:2 SVG (`NAMES_BOX`, map % × 15
 * across and × 10 down) so the letters keep their shape. The game's map and Studio's canvas both draw with this.
 */
import type { District, Lettering, Pt } from '../../../../shared/map-schema';

const NS = 'http://www.w3.org/2000/svg';
export const NAMES_BOX = { w: 1500, h: 1000 };
export const DEFAULT_NAME_SIZE = 1.6;

const toU = (p: Pt): Pt => [p[0] * 15, p[1] * 10];
const n2 = (v: number) => +v.toFixed(2);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The line kept where the map's file takes it: its ends on the map (0–100) and its bend within ±50. */
export function onMap(l: Lettering): Lettering {
  const pt = (p: Pt): Pt => [clamp(p[0], 0, 100), clamp(p[1], 0, 100)];
  return { from: pt(l.from), to: pt(l.to), bend: clamp(l.bend, -50, 50), size: l.size };
}

/** The district's own line, or a straight one through its label as long as its name's letters. */
export function letteringOf(d: District): Lettering {
  return d.lettering ?? defaultLettering(d);
}

/** A straight line through the label, as long as the name's letters at `size` (the mono font plus the wide spacing). */
export function defaultLettering(d: District, size = DEFAULT_NAME_SIZE): Lettering {
  const half = (d.name.length * size * 1.1) / 2;
  return { from: [d.label[0] - half, d.label[1]], to: [d.label[0] + half, d.label[1]], bend: 0, size };
}

/** The chord's middle and its left normal on screen (units), for a line as drawn from → to. */
function frame(l: Lettering): { m: Pt; n: Pt } {
  const [ax, ay] = toU(l.from);
  const [bx, by] = toU(l.to);
  const dx = bx - ax;
  const dy = by - ay;
  const c = Math.hypot(dx, dy);
  return { m: [(ax + bx) / 2, (ay + by) / 2], n: c < 1e-9 ? [0, -1] : [dy / c, -dx / c] };
}

/** The arc as an SVG path (viewBox units) that always reads left to right, and its length. */
export function namePath(l: Lettering): { d: string; length: number } {
  let a = toU(l.from);
  let b = toU(l.to);
  let s = l.bend * 15;
  // Right to left would set the letters upside down: run it the other way, the bend turned to keep the shape.
  if (b[0] < a[0] - 0.5) {
    [a, b] = [b, a];
    s = -s;
  }
  let c = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (c < 1) {
    const m: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    a = [m[0] - 0.5, m[1]];
    b = [m[0] + 0.5, m[1]];
    c = 1;
  }
  const start = `M ${n2(a[0])} ${n2(a[1])}`;
  if (Math.abs(s) < 0.01) return { d: `${start} L ${n2(b[0])} ${n2(b[1])}`, length: c };
  const h = c / 2;
  const r = (h * h + s * s) / (2 * Math.abs(s));
  const large = Math.abs(s) > h;
  const theta = 2 * Math.asin(Math.min(1, h / r));
  return {
    d: `${start} A ${n2(r)} ${n2(r)} 0 ${large ? 1 : 0} ${s > 0 ? 1 : 0} ${n2(b[0])} ${n2(b[1])}`,
    length: r * (large ? 2 * Math.PI - theta : theta),
  };
}

/** The arc's middle, map % (where Studio's bend handle sits). */
export function arcMid(l: Lettering): Pt {
  const { m, n } = frame(l);
  const s = l.bend * 15;
  return [(m[0] + n[0] * s) / 15, (m[1] + n[1] * s) / 10];
}

/** The bend that puts the arc's middle across the line from `p` (map %). */
export function bendAt(l: Lettering, p: Pt): number {
  const { m, n } = frame(l);
  const [px, py] = toU(p);
  return ((px - m[0]) * n[0] + (py - m[1]) * n[1]) / 15;
}

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Replaces the svg's names: one `text.dname` per district on its own path (`#dname-<id>`), `has` when it has
 * places, `sel` when selected. Anything else in the svg is left alone. */
export function drawNames(svg: SVGSVGElement, districts: District[], opts: { has?: (id: string) => boolean; sel?: string | null }): void {
  for (const n of svg.querySelectorAll('text.dname, defs.dname-defs')) n.remove();
  const defs = svgEl('defs', { class: 'dname-defs' });
  svg.prepend(defs);
  for (const d of districts) {
    const l = letteringOf(d);
    const p = namePath(l);
    defs.append(svgEl('path', { id: `dname-${d.id}`, d: p.d }));
    const cls = `dname${opts.has?.(d.id) ? ' has' : ''}${opts.sel === d.id ? ' sel' : ''}`;
    const text = svgEl('text', { class: cls, 'data-id': d.id, 'font-size': n2(l.size * 15), 'text-anchor': 'middle' });
    const tp = svgEl('textPath', { href: `#dname-${d.id}`, startOffset: '50%', textLength: n2(p.length), lengthAdjust: 'spacing' });
    tp.textContent = d.name;
    text.append(tp);
    svg.append(text);
  }
}
