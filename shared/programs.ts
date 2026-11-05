/**
 * Programs (spec 2026-11-02-programs): the deck's load. `world/gear/programs.md`, one `---` block per program; the deck
 * you carry sets the slots, a program loads in the moment on a check and stays for the job. Pure: the server, the table
 * and job-sim share it.
 */
import { z } from 'zod';
import type { Pool } from './dice';
import type { Deck } from './gear';
import { LORE_ID, splitDrafts, splitFrontMatter } from './lore';
import type { Check } from './mission';
import type { StatKey } from './stats';

export const PROGRAM_KINDS = ['position', 'effect', 'quiet', 'firewall'] as const;
export type ProgramKind = (typeof PROGRAM_KINDS)[number];
/** The stats a program can help (EDGE is RESIST's, not a check's), or any. */
export const PROGRAM_STATS = ['body', 'reflex', 'tech', 'cool', 'wits', 'any'] as const;

export interface Program {
  id: string;
  name: string;
  stat: Exclude<StatKey, 'edge'> | 'any';
  kind: ProgramKind;
  /** Its card's one line. */
  line: string;
  /** Runs a step higher against the job's tier (§1.3); none until the shop. */
  fine?: true;
}

/** FIREWALL's id: it answers a picked cost, never a check (§2.3). */
export const FIREWALL = 'firewall';

/** Slots by the deck's quality (§1.1). */
export const SLOTS: Record<Deck['quality'], number> = { 1: 1, 2: 2, 3: 2, 4: 3 };
export const slotsFor = (deck: Deck | null): number => (deck ? SLOTS[deck.quality] : 0);

/** A mid-job load (programs spec §1.2a): slotting a cart with the job running costs 1 NERVE; SETUP loads are free. */
export const HOT_LOAD_NERVE = 1;

/** The stats a job's checks lean on (programs spec §1.2a): most used first, at most three. */
export function jobLeans(q: { beats: Map<string, readonly { choices: readonly { check?: { stat: string } | null }[] }[]> }): string[] {
  const uses = new Map<string, number>();
  for (const beats of q.beats.values()) for (const b of beats) for (const c of b.choices) if (c.check) uses.set(c.check.stat, (uses.get(c.check.stat) ?? 0) + 1);
  return [...uses].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([stat]) => stat);
}

/** The quality a program runs at: the deck's, a step higher when fine. */
export const programQuality = (deck: Deck, p: Program): number => deck.quality + (p.fine ? 1 : 0);
/** Below the job's tier the lacquer is thicker than the deck: each run costs ALARM +1 (§1.3). */
export const belowTier = (deck: Deck, p: Program, tier: number | undefined): boolean => tier !== undefined && programQuality(deck, p) < tier;

const programSchema = z.strictObject({
  id: z.string().regex(LORE_ID),
  name: z.string().trim().min(1).max(24),
  stat: z.enum(PROGRAM_STATS),
  kind: z.enum(PROGRAM_KINDS),
  line: z.string().trim().min(1).max(80),
  fine: z.literal(true).optional(),
});

/** Every good block, in file order; each bad one (or a repeated id) is skipped with one problem. */
export function parsePrograms(text: string): { programs: Program[]; problems: string[] } {
  const programs: Program[] = [];
  const problems: string[] = [];
  for (const draft of splitDrafts(text)) {
    const s = splitFrontMatter(draft);
    if ('field' in s) {
      problems.push(s.message);
      continue;
    }
    const r = programSchema.safeParse(s.front);
    if (!r.success) {
      const i = r.error.issues[0];
      problems.push(`${String(s.front.id ?? '?')}: ${i.path.join('.') || 'program'}: ${i.message}`);
    } else if (programs.some((p) => p.id === r.data.id)) problems.push(`${r.data.id}: listed twice`);
    else programs.push(r.data);
  }
  return { programs, problems };
}

/**
 * Why a program can't run on this check (§1.5), or null. `pool` is the check's pool before programs. FIREWALL never runs
 * on a check: it answers a picked cost (§2.3).
 */
export function programFits(p: Program, pool: Pick<Pool, 'position' | 'effect'>, check: Check, deck: Deck | null): string | null {
  if (check.red) return 'ONE SHOT';
  if (p.stat !== 'any' && p.stat !== check.stat) return 'NOTHING TO DO HERE';
  if (p.kind === 'firewall') return 'NOTHING TO DO HERE';
  if (p.kind === 'position' && pool.position === 'dark') return 'ALREADY IN THE DARK';
  if (p.kind === 'effect') {
    if (!pool.effect) return 'NOTHING TO TAKE HERE';
    if (pool.effect === 'big') return 'ALREADY BIG';
  }
  return null;
}

/**
 * Why `p` can't run on this check after the programs already accepted (Task 5 review I1), or null: `programFits` on
 * the pool so far, then a position or effect program must move its pool (NEXT ROLL WORSE, BOLD or another program
 * can leave its step doing nothing, and a run that does nothing must not cost the lacquer's ALARM).
 */
export function programJudge(p: Program, poolAt: (programs: Program[]) => Pick<Pool, 'position' | 'effect'>, accepted: Program[], check: Check, deck: Deck | null): string | null {
  const before = poolAt(accepted);
  const why = programFits(p, before, check, deck);
  if (why) return why;
  const after = poolAt([...accepted, p]);
  if (p.kind === 'position' && after.position === before.position) return 'ALREADY IN THE DARK';
  if (p.kind === 'effect' && after.effect === before.effect) return 'ALREADY BIG';
  return null;
}
