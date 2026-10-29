/**
 * Weather is simulated in 480×270 px in every room (same density and motion), and drawn scaled up
 * in a flat room. These move a flat room's px into that 480 frame.
 */
import { frameUnit, LEGACY_FRAME, type FrameSize } from '../../../shared/frame';
import { areaBounds, type Shape } from '../../../shared/weather-area';
import type { Region } from './weather';

/** A room-px weather region in 480 px, rounded outward so it never shrinks, kept inside 480×270. */
export function weatherRegionFor(res: FrameSize, region: Region | undefined): Region | undefined {
  const u = frameUnit(res);
  if (!region || u === 1) return region;
  const [W, H] = LEGACY_FRAME;
  const x = Math.min(W - 1, Math.floor(region[0] / u));
  const y = Math.min(H - 1, Math.floor(region[1] / u));
  return [x, y, Math.min(W - x, Math.ceil(region[2] / u)), Math.min(H - y, Math.ceil(region[3] / u))];
}

/** Lights with their positions in 480 px (the rain near a light takes its tint). */
export function weatherLightsFor<T extends { pos: [number, number] }>(res: FrameSize, lights: T[]): T[] {
  const u = frameUnit(res);
  if (u === 1) return lights;
  return lights.map((l) => ({ ...l, pos: [l.pos[0] / u, l.pos[1] / u] }));
}

/** The rain's simulation box in 480 px: around every shape of the area (none = the whole frame). */
export function weatherBoundsFor(res: FrameSize, area: Shape[] | undefined): Region | undefined {
  return weatherRegionFor(res, area && area.length > 0 ? areaBounds(area) : undefined);
}
