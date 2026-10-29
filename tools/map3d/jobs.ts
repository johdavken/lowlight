// Which tiles a render has to make, and turning Blender's margined PNGs into the map's 512 px WebP tiles (spec 2026-10-25 §3).
import sharp from 'sharp';
import { TILE } from '../../shared/map-tiles';

/**
 * Tiles to render: those whose fingerprint changed or is new, or whose file is gone (`exists` false); the rest are kept.
 * `all` renders everything.
 */
export function planJobs(now: Map<string, string>, prev: Record<string, string>, all: boolean, exists: (key: string) => boolean): { render: string[]; keep: string[] } {
  const render: string[] = [], keep: string[] = [];
  for (const [k, print] of now) (all || prev[k] !== print || !exists(k) ? render : keep).push(k);
  return { render, keep };
}

/** Blackouts (spec 2026-10-27): the levels that get dark and mask passes. Deeper ones use the 4× pair under their lit tile. */
export const darkLevels = (levels: number[]): number[] => levels.filter((s) => s <= 4);
export const passesFor = (scale: number): string[] => (scale <= 4 ? ['lit', 'dark', 'mask'] : ['lit']);
export type TileDir = 'tiles' | 'tiles-dark' | 'tiles-mask';
/** Every file a tile's passes make is on disk. */
export const outputsExist = (key: string, has: (dir: TileDir, key: string) => boolean): boolean =>
  has('tiles', key) && (!passesFor(Number(key.split('/')[0])).includes('dark') || (has('tiles-dark', key) && has('tiles-mask', key)));

/** The middle 512×512 of a mask tile, lossless (a palette PNG): every pixel keeps its exact district value. */
export async function cropMask(png: Buffer, margin: number): Promise<Buffer> {
  return sharp(png).extract({ left: margin, top: margin, width: TILE, height: TILE }).png({ palette: true, dither: 0, compressionLevel: 9 }).toBuffer();
}

/** The middle 512×512 of a tile rendered with `margin` px on every side, as WebP. */
export async function cropTile(png: Buffer, margin: number, quality: number): Promise<Buffer> {
  return sharp(png).extract({ left: margin, top: margin, width: TILE, height: TILE }).webp({ quality }).toBuffer();
}

/** Jobs Blender didn't report rendering ("TILE <id> <ms>" lines): an old PNG of theirs must not be cropped into a tile. */
export function unrendered(jobs: string[], lines: string[]): string[] {
  const done = new Set(lines.filter((l) => l.startsWith('TILE ')).map((l) => l.split(' ')[1]));
  return jobs.filter((j) => !done.has(j));
}

/** Levels whose every tile is on disk and was rendered from the current prints: only these go in the manifest. */
export function currentLevels(now: Map<string, string>, saved: Record<string, string>, exists: (key: string) => boolean): number[] {
  const byLevel = new Map<number, boolean>();
  for (const [k, print] of now) {
    const s = Number(k.split('/')[0]);
    byLevel.set(s, (byLevel.get(s) ?? true) && saved[k] === print && exists(k));
  }
  return [...byLevel].filter(([, ok]) => ok).map(([s]) => s).sort((a, b) => a - b);
}

/** Tiles on disk (`scale/key`) that no level wants any more: left over from an older render (blackouts phase 2 §4). */
export function staleTiles(present: string[], wanted: Set<string>): string[] {
  return present.filter((k) => !wanted.has(k));
}
