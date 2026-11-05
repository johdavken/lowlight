/**
 * Studio GIGS tab's COPY FOR OPUS (spec §3): the prompt that asks Opus for a place's job briefs,
 * in the exact file format IMPORT reads back (LORE's splitter: `---` blocks in one code block).
 */
import type { LoreEntry } from '../lore';
import { BRIEF_BODY_MAX, BRIEF_FIELD_MAX, BRIEF_TITLE_MAX, gigFile, type Brief } from './brief';
import type { Tier } from './brief';

export interface GigPromptInput {
  place: { id: string; name: string; district: string };
  /** The place's room as its art shows it (LORE's listing `rooms[placeId]`), or null. */
  room: string | null;
  /** Papers jobs to ask for, by tier (Papers spec §8; hack and slip are gone, 2026-11-01). */
  counts: Record<Tier, number>;
  /** This place's briefs. */
  existing: Brief[];
  /** The ticked lore, in the panel's order (automatic first). */
  lore: LoreEntry[];
}

const TIERS: Tier[] = ['easy', 'medium', 'hard'];

/** What a papers job is, at any tier: the bulletin is generated, so the brief is the person. */
export const PAPERS_HINT = 'a person crossing through the Ferrymen; the target is a customs booth on Tidal Isle; the take is the crossing';

/** The example when a place has no jobs yet. */
const FIRST_BOAT: Brief = {
  id: 'first-boat',
  title: 'First Boat',
  tier: 'easy',
  kind: 'papers',
  place: 'ferry-stairs',
  client: 'A dock family',
  target: 'Tidal Isle · customs, booth nine',
  take: 'one crossing',
  text: "A deckhand's cousin has a berth on the first boat out and nothing that says she's allowed on it. The family has her photo and a name she can live with.",
};

/** COPY's starting counts: one job for each tier the place lacks; one of each when it lacks none. */
export function defaultCounts(coverage: Record<Tier, number>): Record<Tier, number> {
  const gaps = TIERS.filter((t) => coverage[t] === 0);
  return Object.fromEntries(TIERS.map((t) => [t, gaps.length === 0 || gaps.includes(t) ? 1 : 0])) as Record<Tier, number>;
}

export function gigPrompt(o: GigPromptInput): string {
  const total = TIERS.reduce((n, t) => n + o.counts[t], 0);
  const example = gigFile(o.existing[0] ?? FIRST_BOAT).trim();
  const howMany = TIERS.filter((t) => o.counts[t] > 0).map((t) => `- ${o.counts[t]} ${t} papers job${o.counts[t] === 1 ? '' : 's'}: ${PAPERS_HINT}`);
  const parts = [
    `## What to write\nWrite ${total} job briefs for papers jobs posted at ${o.place.name} (${o.place.district}), in Lowlight, a cyberpunk city. A papers job is the Ferrymen's: the player forges a client's papers at a desk so they pass customs on Tidal Isle. The client is a person and why they're crossing; tonight's rules are generated, so don't write them.`,
    `## How many\n${howMany.join('\n')}`,
    `## Format\nOne file per job: front matter between --- lines, then the brief. title at most ${BRIEF_TITLE_MAX} characters; tier is easy, medium or hard; kind: papers (always); place: ${o.place.id} (always this one); client, target and take at most ${BRIEF_FIELD_MAX} characters each; the brief at most ${BRIEF_BODY_MAX} characters, plain text. The target is \`Tidal Isle · customs, booth nine\`. Example:\n${example}`,
    `## Style\nShort, concrete and in-world, and never addressed to "you". Say who is crossing and why. No payouts or prices.`,
    `## Already on this board\n${o.existing.length > 0 ? o.existing.map((b) => `${b.title} — ${b.client} → ${b.target}`).join('\n') : 'none yet'}\nDon't repeat these.`,
  ];
  if (o.room) parts.push(`## The place\n${o.room}`);
  if (o.lore.length > 0) parts.push(`## Lore\n${o.lore.map((e) => `### ${e.title}\n${e.body}`).join('\n\n')}`);
  parts.push('## Answer\nPut every job inside one ``` code block, one --- block per job, with nothing before or after it.');
  return parts.join('\n\n');
}
