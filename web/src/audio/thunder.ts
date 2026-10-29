/** The thunder takes (web/public/sound/thunder/) and which one a strike gets. Pure. */

export type ThunderBand = 'far' | 'mid' | 'near';

export const THUNDER_TAKES: { url: string; band: ThunderBand }[] = [
  { url: '/sound/thunder/far-1.ogg', band: 'far' },
  { url: '/sound/thunder/far-2.ogg', band: 'far' },
  { url: '/sound/thunder/mid-1.ogg', band: 'mid' },
  { url: '/sound/thunder/mid-2.ogg', band: 'mid' },
  { url: '/sound/thunder/near-1.ogg', band: 'near' },
  { url: '/sound/thunder/near-2.ogg', band: 'near' },
  { url: '/sound/thunder/near-3.ogg', band: 'near' },
];

/** A take for a strike `distance` away (0 near … 1 far), never `last` when its band has another. */
export function chooseTake(distance: number, last: string | null, rng: () => number): string {
  const band: ThunderBand = distance > 0.66 ? 'far' : distance < 0.33 ? 'near' : 'mid';
  const inBand = THUNDER_TAKES.filter((t) => t.band === band && t.url !== last);
  return inBand[Math.floor(rng() * inBand.length)].url;
}

/** How loud a strike's thunder plays: 0.9 near, 0.35 far. */
export function thunderLevel(distance: number): number {
  return 0.9 - 0.55 * Math.max(0, Math.min(1, distance));
}
