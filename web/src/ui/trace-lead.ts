/**
 * The HUD trace for hovers (mockup overlay-hud.html B TRACE, 2026-11-13): a fine line from what a panel is about to the
 * panel. A ring on the subject, then along the longer axis, then a 45° jog onto the panel, ending in a 3-px dot.
 * Each overlay keeps its own line (`key`) in one zero-size, overflow-visible SVG on its host, so it scrolls with it.
 */
export type Pt = [x: number, y: number];

/** The line's corners: along the longer axis first, then a 45° jog onto `to` (whole pixels). */
export function leadPoints(from: Pt, to: Pt): Pt[] {
  const [x1, y1] = [Math.round(from[0]), Math.round(from[1])];
  const [x2, y2] = [Math.round(to[0]), Math.round(to[1])];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const j = Math.min(Math.abs(dx), Math.abs(dy));
  const bend: Pt = Math.abs(dy) >= Math.abs(dx) ? [x1, y2 - Math.sign(dy) * j] : [x2 - Math.sign(dx) * j, y1];
  const pts: Pt[] = [[x1, y1]];
  if (bend[0] !== x1 || bend[1] !== y1) pts.push(bend);
  if (bend[0] !== x2 || bend[1] !== y2) pts.push([x2, y2]);
  return pts;
}

const SVG = 'http://www.w3.org/2000/svg';

const svgOf = (host: HTMLElement, key: string, make: boolean): SVGSVGElement | null => {
  const found = host.querySelector<SVGSVGElement>(`:scope > svg.hv-lead[data-lead="${key}"]`);
  if (found || !make) return found;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'hv-lead');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.lead = key;
  host.append(svg);
  return svg;
};

/** Draws `key`'s line on `host` from `from` (the subject) to `to` (the panel), in the host's own px; replaces the last. */
export function traceLead(host: HTMLElement, key: string, from: Pt, to: Pt): void {
  traceVia(host, key, leadPoints(from, to));
}

/**
 * Draws `key`'s line through given corners (whole pixels), ring at the first, dot at the last; replaces the last.
 * `color` sets the line's colour on this one svg (default: the hovers' `--hv-c`).
 */
export function traceVia(host: HTMLElement, key: string, pts: Pt[], color?: string, o: { ring?: boolean } = {}): void {
  const svg = svgOf(host, key, true)!;
  if (color) svg.style.setProperty('--hv-c', color);
  if (pts.length < 2) {
    svg.replaceChildren();
    return;
  }
  const r = pts.map(([x, y]): Pt => [Math.round(x), Math.round(y)]);
  const [x1, y1] = r[0];
  const [x2, y2] = r[r.length - 1];
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', r.map(([x, y], i) => `${i ? 'L' : 'M'}${x + 0.5} ${y + 0.5}`).join(' '));
  const ring = document.createElementNS(SVG, 'circle');
  ring.setAttribute('class', 'ring');
  ring.setAttribute('cx', String(x1 + 0.5));
  ring.setAttribute('cy', String(y1 + 0.5));
  ring.setAttribute('r', '3.5');
  const dot = document.createElementNS(SVG, 'rect');
  dot.setAttribute('class', 'dot');
  dot.setAttribute('x', String(x2 - 1));
  dot.setAttribute('y', String(y2 - 1));
  dot.setAttribute('width', '3');
  dot.setAttribute('height', '3');
  // A line that hangs from another's ring (the table's rail under the head line's) draws none of its own.
  svg.replaceChildren(path, ...(o.ring === false ? [] : [ring]), dot);
}

/** Takes `key`'s line off `host`. */
export function clearLead(host: HTMLElement, key: string): void {
  svgOf(host, key, false)?.replaceChildren();
}

/** A rect in `host`'s own px: the stage is zoomed to fit the window, so screen offsets are scaled back; a scrolled host's offset is added. */
export function hostRect(host: HTMLElement, el: Element): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
  const h = host.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const z = host.offsetWidth > 0 && h.width > 0 ? h.width / host.offsetWidth : 1;
  const left = (r.left - h.left) / z + host.scrollLeft;
  const top = (r.top - h.top) / z + host.scrollTop;
  return { left, top, right: left + r.width / z, bottom: top + r.height / z, width: r.width / z, height: r.height / z };
}
