// The nearest-district lookup in map px (blackouts): which district a point stands in, or failing that the nearest
// within reach. Shared by the map tool (the mask, items outside every border) and the game's live layer (signs).

type P = [number, number];

export function inside([x, y]: P, b: P[]): boolean {
  let hit = false;
  for (let i = 0, j = b.length - 1; i < b.length; j = i++) {
    const [ax, ay] = b[i]!, [cx, cy] = b[j]!;
    if (ay > y !== cy > y && x < ((cx - ax) * (y - ay)) / (cy - ay) + ax) hit = !hit;
  }
  return hit;
}

export function toBorder([x, y]: P, b: P[]): number {
  let best = Infinity;
  for (let i = 0, j = b.length - 1; i < b.length; j = i++) {
    const [ax, ay] = b[j]!, [cx, cy] = b[i]!;
    const dx = cx - ax, dy = cy - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return best;
}

/** The index (position + 1) of the district `p` stands in, or failing that the nearest one within `reach`; 0 if none. */
export function ownerAt(p: P, districts: { border: P[] }[], reach: number): number {
  let id = 0, near = reach;
  for (let i = 0; i < districts.length; i++) {
    const b = districts[i]!.border;
    if (b.length < 3) continue;
    if (inside(p, b)) return i + 1;
    const dist = toBorder(p, b);
    if (dist < near) [id, near] = [i + 1, dist];
  }
  return id;
}
