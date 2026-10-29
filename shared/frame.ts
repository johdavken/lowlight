/** Room frame sizes: the 480×270 pixel-art rooms and the flat full-resolution ones. */
export type FrameSize = readonly [number, number];

export const LEGACY_FRAME = [480, 270] as const;
export const FLAT_FRAME = [1536, 864] as const;

/** A room is flat (one sharp full-resolution image, no parallax) when it isn't 480×270. */
export function isFlat(res: FrameSize): boolean {
  return res[0] !== LEGACY_FRAME[0] || res[1] !== LEGACY_FRAME[1];
}

/** Room px per 480-frame px: 1 for 480 rooms, 3.2 for flat ones. */
export function frameUnit(res: FrameSize): number {
  return res[0] / LEGACY_FRAME[0];
}
