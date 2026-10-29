/** Stats (missions spec §1): six whole numbers 1–10 per character, set in character.json. */
export const STAT_KEYS = ['body', 'reflex', 'tech', 'cool', 'wits', 'edge'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

/** A character without stats plays at 3 in everything. */
export const DEFAULT_STATS: Stats = { body: 3, reflex: 3, tech: 3, cool: 3, wits: 3, edge: 3 };

/** Exactly the six keys, each a whole number 1–10; null otherwise. */
export function parseStats(v: unknown): Stats | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).length !== STAT_KEYS.length) return null;
  for (const k of STAT_KEYS) {
    const n = o[k];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 10) return null;
  }
  return Object.fromEntries(STAT_KEYS.map((k) => [k, o[k] as number])) as Stats;
}

/** EDGE rerolls between 06:00s: EDGE ÷ 3, rounded up. */
export const edgeMax = (s: Stats): number => Math.ceil(s.edge / 3);
