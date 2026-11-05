/**
 * Every point and line in a map/city/ file (spec 2026-10-30 §2), found by walking its schema beside its value:
 * a `pt` (a tuple described 'pt') is a point, a list of them a line. A generator field typed with `pt` shows up
 * in Studio's CITY tool with no Studio change.
 */
import type { z } from 'zod';
import { cityFileSchema, type CityFileKind } from './city-schema';
import type { Pt } from './map-schema';

export interface CityPoint {
  /** Where it is in the file's JSON. */
  path: (string | number)[];
  kind: 'point' | 'line';
  /** One for a point. */
  pts: Pt[];
}

type Def = { type: string; shape?: Record<string, z.ZodType>; element?: z.ZodType; innerType?: z.ZodType; in?: z.ZodType; options?: z.ZodType[] };
const defOf = (s: z.ZodType) => (s as unknown as { _zod: { def: Def } })._zod.def;
const isPt = (s: z.ZodType) => s.description === 'pt';
const WRAPPERS = new Set(['optional', 'nullable', 'default', 'catch', 'readonly', 'nonoptional', 'prefault']);

/** `schema`'s points and lines in `value`, in document order. */
export function walkPoints(schema: z.ZodType, value: unknown, path: (string | number)[] = []): CityPoint[] {
  if (value === undefined || value === null) return [];
  if (isPt(schema)) return [{ path, kind: 'point', pts: [value as Pt] }];
  const def = defOf(schema);
  if (WRAPPERS.has(def.type)) return walkPoints(def.innerType!, value, path);
  if (def.type === 'pipe') return walkPoints(def.in!, value, path);
  if (def.type === 'object' && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return Object.entries(def.shape!).flatMap(([k, s]) => (k in v ? walkPoints(s, v[k], [...path, k]) : []));
  }
  if (def.type === 'array' && Array.isArray(value)) {
    if (isPt(unwrap(def.element!))) return [{ path, kind: 'line', pts: value as Pt[] }];
    return value.flatMap((item, i) => walkPoints(def.element!, item, [...path, i]));
  }
  if (def.type === 'union') {
    const match = def.options!.find((o) => o.safeParse(value).success);
    return match ? walkPoints(match, value, path) : [];
  }
  return [];
}

function unwrap(s: z.ZodType): z.ZodType {
  const def = defOf(s);
  return WRAPPERS.has(def.type) && !isPt(s) ? unwrap(def.innerType!) : s;
}

/** A parsed map/city/ file's points and lines. */
export function cityPoints(kind: CityFileKind, value: unknown): CityPoint[] {
  return walkPoints(cityFileSchema(kind), value);
}
