/**
 * The GM's written lines (roll lifecycle spec §1.4): `world/gm/costs.md`, a `# <cost>` heading per cost and a `- line`
 * per line. A dealt cost shows one until the GM's line arrives, and keeps it when the GM's fails or never comes.
 */
import { hashSeed } from './board';
import type { CostId } from './costs';
import { rng } from './rng';

const IDS: readonly CostId[] = ['alarm', 'heat', 'worse', 'small', 'take'];

/** The last resort when the file has none for a cost. */
const BUILT_IN: Record<CostId, string> = {
  alarm: 'Somewhere a log fills in your name.',
  heat: 'Someone on the street will remember your face.',
  worse: 'Whatever waits ahead is waiting for you now.',
  small: 'The window ahead is already closing.',
  take: 'Some of what you carry is gone.',
};

export function parseGmLines(text: string): { lines: Partial<Record<CostId, string[]>>; warnings: string[] } {
  const lines: Partial<Record<CostId, string[]>> = {};
  let at: CostId | null = null;
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    const h = /^#\s+(\S+)$/.exec(t);
    if (h) at = (IDS as readonly string[]).includes(h[1]) ? (h[1] as CostId) : null;
    else if (at && t.startsWith('- ') && t.length > 2) (lines[at] ??= []).push(t.slice(2).trim());
  }
  return { lines, warnings: IDS.filter((id) => !lines[id]?.length).map((id) => `no lines for ${id}`) };
}

/** A written line for `cost`, seeded so rewind shows the same one. */
export function writtenLine(lines: Partial<Record<CostId, string[]>>, cost: CostId, seed: string): string {
  const pool = lines[cost];
  if (!pool?.length) return BUILT_IN[cost];
  return pool[Math.floor(rng(hashSeed(seed))() * pool.length)];
}
