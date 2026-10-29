/**
 * The rendered map's tiles (spec 2026-10-25 §3): 512 px squares at each zoom level, named `<col>_<row>`, and the
 * manifest that says which exist. Rects are in map % of the rendered map (ground points render at their own map %).
 */
import { z } from 'zod';
import { MAP_H, MAP_W } from './map-projection';

export const TILE = 512;

export interface TileLevel {
  scale: number;
  cols: number;
  rows: number;
  /** Which tiles exist (`<col>_<row>`), or all of them. */
  tiles: string[] | 'all';
}
export interface TileManifest {
  version: 1;
  size: [number, number];
  tile: number;
  levels: TileLevel[];
  /** Districts rendered at the deepest level (Karasu). */
  deep: string[];
  /** Other places rendered at the deepest level, as outlines in map % (the Spine's corridor). */
  deepAreas?: [number, number][][];
  /** The map data and city description the render was made from (city-hash.ts). */
  dataHash: string;
  blender: string;
  /** Map px up, for places on a structure. */
  pinHeights: Record<string, number>;
  rendered: string;
  /** Blackouts (spec 2026-10-27): levels with a lights-off copy of every tile (tiles-dark/) and its district mask
   * (tiles-mask/). Absent: no blackouts, the map works with lit tiles only. */
  dark?: { levels: number[] };
  /** The mask's index table: districts[i - 1] is index i (R = i × 8); 0 is none. */
  mask?: { districts: string[] };
}

export function tileGrid(scale: number): { cols: number; rows: number } {
  return { cols: Math.ceil((MAP_W * scale) / TILE), rows: Math.ceil((MAP_H * scale) / TILE) };
}

/** A tile's rect in map %, the last column and row clipped to the map. */
export function tileRect(scale: number, col: number, row: number): { x: number; y: number; w: number; h: number } {
  const W = MAP_W * scale, H = MAP_H * scale;
  const x = col * TILE, y = row * TILE;
  return { x: (x / W) * 100, y: (y / H) * 100, w: (Math.min(TILE, W - x) / W) * 100, h: (Math.min(TILE, H - y) / H) * 100 };
}

export const hasTile = (l: TileLevel, key: string) => l.tiles === 'all' || l.tiles.includes(key);

const manifestSchema = z.object({
  version: z.literal(1),
  size: z.tuple([z.number(), z.number()]),
  tile: z.number().int().min(1),
  levels: z.array(z.object({ scale: z.number().min(1), cols: z.number().int(), rows: z.number().int(), tiles: z.union([z.literal('all'), z.array(z.string())]) })).min(1),
  deep: z.array(z.string()),
  deepAreas: z.array(z.array(z.tuple([z.number(), z.number()]))).optional(),
  dataHash: z.string(),
  blender: z.string(),
  pinHeights: z.record(z.string(), z.number()),
  rendered: z.string(),
  dark: z.object({ levels: z.array(z.number().min(1)) }).optional(),
  mask: z.object({ districts: z.array(z.string()) }).optional(),
});

/** The manifest, or null when it can't be used (the map falls back to the painting). */
export function parseManifest(raw: unknown): TileManifest | null {
  const r = manifestSchema.safeParse(raw);
  return r.success ? (r.data as TileManifest) : null;
}
