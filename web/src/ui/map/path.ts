import type { Anchor, Pt } from '../../../../shared/map-schema';

/**
 * A border as an SVG path: straight lines between corners, a cubic curve wherever either end
 * of a segment has a handle (a missing handle sits on its own point). `toPx` maps map % to pixels.
 */
export function pathD(anchors: Anchor[], toPx: (x: number, y: number) => Pt, closed = true): string {
  if (!anchors.length) return '';
  const at = (a: Anchor, h: Pt | null = null) => toPx(a.x + (h ? h[0] : 0), a.y + (h ? h[1] : 0)).join(',');
  const n = anchors.length;
  let d = `M${at(anchors[0])}`;
  for (let k = 1; k <= (closed ? n : n - 1); k++) {
    const a = anchors[k - 1];
    const b = anchors[k % n];
    d += a.o || b.i ? ` C${at(a, a.o)} ${at(b, b.i)} ${at(b)}` : ` L${at(b)}`;
  }
  return closed ? `${d} Z` : d;
}
