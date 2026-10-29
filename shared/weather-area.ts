/**
 * A room's weather area: path shapes traced to the glass, in frame px. Rain is clipped to them and
 * lightning flashes them. Pure helpers, shared by the schema, the renderer and Studio.
 */

export type Point = [number, number];
/** A closed polygon. */
export type Shape = Point[];

export const MAX_SHAPES = 8;
export const MIN_POINTS = 3;
export const MAX_POINTS = 32;
/** px²: anything smaller (three points in a line) is no shape at all. */
export const MIN_SHAPE_AREA = 4;

/** An `[x, y, w, h]` rectangle as a 4-point shape, clockwise from the top left. */
export function rectToShape([x, y, w, h]: [number, number, number, number]): Shape {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

/** The shape's area in px² (shoelace), whichever way it winds. */
export function shapeArea(s: Shape): number {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const [x0, y0] = s[i];
    const [x1, y1] = s[(i + 1) % s.length];
    sum += x0 * y1 - x1 * y0;
  }
  return Math.abs(sum) / 2;
}

/** `[x, y, w, h]` around every shape, widened to whole px. */
export function areaBounds(area: Shape[]): [number, number, number, number] {
  const pts = area.flat();
  const x0 = Math.floor(Math.min(...pts.map((p) => p[0])));
  const y0 = Math.floor(Math.min(...pts.map((p) => p[1])));
  const x1 = Math.ceil(Math.max(...pts.map((p) => p[0])));
  const y1 = Math.ceil(Math.max(...pts.map((p) => p[1])));
  return [x0, y0, x1 - x0, y1 - y0];
}

/** Whether (x, y) lies inside any of the shapes (even-odd, so a notch is outside). */
export function inArea(area: Shape[], x: number, y: number): boolean {
  return area.some((s) => {
    let inside = false;
    for (let i = 0, j = s.length - 1; i < s.length; j = i++) {
      const [xi, yi] = s[i];
      const [xj, yj] = s[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  });
}

/** Whether segments a–b and c–d cross (touching at an end counts). */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const onSeg = (p: Point, q: Point, r: Point) =>
    Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
  const d1 = side(c, d, a), d2 = side(c, d, b), d3 = side(a, b, c), d4 = side(a, b, d);
  if (d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0) return true;
  return (d1 === 0 && onSeg(c, d, a)) || (d2 === 0 && onSeg(c, d, b)) || (d3 === 0 && onSeg(a, b, c)) || (d4 === 0 && onSeg(a, b, d));
}

/**
 * Whether two edges that don't share a point cross. Pixi fills only simple polygons (earcut), so a
 * crossing shape would draw differently from what Studio shows: it's refused.
 */
export function selfCrosses(s: Shape): boolean {
  const n = s.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Neighbouring edges share a point; skip them (and the last edge's neighbour, the first).
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsCross(s[i], s[(i + 1) % n], s[j], s[(j + 1) % n])) return true;
    }
  }
  return false;
}
