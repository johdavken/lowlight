/**
 * Studio GIGS tab's COPY FOR OPUS (spec §3): the prompt that asks Opus for a place's job briefs,
 * in the exact file format IMPORT reads back (LORE's splitter: `---` blocks in one code block).
 */
import type { LoreEntry } from '../lore';
import { BRIEF_BODY_MAX, BRIEF_FIELD_MAX, BRIEF_TITLE_MAX, gigFile, type Brief } from './brief';
import type { Tier } from './rules';

export interface GigPromptInput {
  place: { id: string; name: string; district: string };
  /** The place's room as its art shows it (LORE's listing `rooms[placeId]`), or null. */
  room: string | null;
  counts: Record<Tier, number>;
  /** Slips to ask for (Slip spec §8); absent or all zero, the prompt is the hack prompt as it was. */
  slips?: Record<Tier, number>;
  /** Papers jobs to ask for (Papers spec §8); absent or all zero, nothing about papers. */
  papers?: Record<Tier, number>;
  /** This place's briefs. */
  existing: Brief[];
  /** The ticked lore, in the panel's order (automatic first). */
  lore: LoreEntry[];
}

const TIERS: Tier[] = ['easy', 'medium', 'hard'];

/** What a run at each tier tends to face, so a brief can hint at it. */
export const TIER_HINT: Record<Tier, string> = {
  easy: 'thin lacquer, a trap or two',
  medium: 'lacquer, a watcher (sentry), maybe a cache',
  hard: 'thick lacquer, two watchers, maybe a key somewhere inside',
};

/** What a slip at each tier tends to face. */
export const SLIP_TIER_HINT: Record<Tier, string> = {
  easy: 'one guard on a post or a short beat, a camera, a booth to hide in',
  medium: 'two guards (one may walk a loop), a sweeping camera, two hiding spots',
  hard: "three guards, two cameras, two hiding spots; you'll need the kit",
};

/** What a papers job is, at any tier: the bulletin is generated, so the brief is the person. */
export const PAPERS_HINT = 'a person crossing through the Ferrymen; the target is a customs booth on Tidal Isle; the take is the crossing';

/** The example when a place has no jobs yet: the seed brief "Held Pay". */
const HELD_PAY: Brief = {
  id: 'held-pay',
  title: 'Held Pay',
  tier: 'hard',
  place: 'the-tilt',
  client: 'Nobody, through the Switchboard',
  target: 'Glass Orchid · house ledger',
  take: "one worker's held payout, released",
  text: "A worker wants out of the Orchid with what the house is holding for her. The house keeps its ledger behind thick lacquer and two watchers. Someone left a key in there once. Whether it's still there is your problem.",
};

/** COPY's starting counts: one job for each tier the place lacks; one of each when it lacks none. */
export function defaultCounts(coverage: Record<Tier, number>): Record<Tier, number> {
  const gaps = TIERS.filter((t) => coverage[t] === 0);
  return Object.fromEntries(TIERS.map((t) => [t, gaps.length === 0 || gaps.includes(t) ? 1 : 0])) as Record<Tier, number>;
}

export function gigPrompt(o: GigPromptInput): string {
  const slips = o.slips ?? { easy: 0, medium: 0, hard: 0 };
  const papers = o.papers ?? { easy: 0, medium: 0, hard: 0 };
  const anySlip = TIERS.some((t) => slips[t] > 0);
  const anyPapers = TIERS.some((t) => papers[t] > 0);
  const total = TIERS.reduce((n, t) => n + o.counts[t] + slips[t] + papers[t], 0);
  const slipExample = anySlip ? o.existing.find((b) => b.kind === 'slip') : undefined;
  const example = gigFile(slipExample ?? o.existing[0] ?? HELD_PAY).trim();
  const howMany = [
    ...TIERS.filter((t) => o.counts[t] > 0).map((t) => `- ${o.counts[t]} ${t}: ${TIER_HINT[t]}`),
    ...TIERS.filter((t) => slips[t] > 0).map((t) => `- ${slips[t]} ${t} slip: ${SLIP_TIER_HINT[t]}`),
    ...TIERS.filter((t) => papers[t] > 0).map((t) => `- ${papers[t]} ${t} papers job${papers[t] === 1 ? '' : 's'}: ${PAPERS_HINT}`),
  ];
  const parts = [
    `## What to write\nWrite ${total} job briefs for gig runs at ${o.place.name} (${o.place.district}), in Lowlight, a cyberpunk city. A gig run is a netrunner job taken off a place's job board: the player breaks into a corp system on the grid. The brief is flavour: who wants what taken, from whose system, and why.${
      anySlip ? ' A slip is the other kind of job: the player goes in on foot, past guards and cameras, lifts something from a room, and gets out unseen.' : ''
    }${anyPapers ? " A papers job is the Ferrymen's: the player forges a client's papers at a desk so they pass customs on Tidal Isle. The client is a person and why they're crossing; tonight's rules are generated, so don't write them." : ''}`,
    `## How many\n${howMany.join('\n')}\nA brief may hint at what's in the way; the run itself is generated, so don't promise exact counts.`,
    `## Format\nOne file per job: front matter between --- lines, then the brief. title at most ${BRIEF_TITLE_MAX} characters; tier is easy, medium or hard; place: ${o.place.id} (always this one); client, target and take at most ${BRIEF_FIELD_MAX} characters each; the brief at most ${BRIEF_BODY_MAX} characters, plain text. The target is a system, written \`Corp · system\`.${
      anySlip ? ' A slip adds `kind: slip` after the tier (a hack has no kind line), and its target is a room or a thing in a building, written `Place · room`.' : ''
    }${anyPapers ? ' A papers job adds `kind: papers` after the tier, and its target is `Tidal Isle · customs, booth nine`.' : ''} Example:\n${example}`,
    `## Style\nShort, concrete and in-world, and never addressed to "you". Say what the job is and what's in the way: corp security on the grid is lacquer, watchers are sentries.${
      anySlip ? " For a slip, what's in the way is guards, cameras and where to hide, and its target may be a room in this place." : ''
    } ${anySlip ? "A hack's" : 'The'} target is a corp's system, never ${o.place.name} itself; the place is only where the job was posted. No payouts or prices.`,
    `## Already on this board\n${o.existing.length > 0 ? o.existing.map((b) => `${b.title} — ${b.client} → ${b.target}`).join('\n') : 'none yet'}\nDon't repeat these.`,
  ];
  if (o.room) parts.push(`## The place\n${o.room}`);
  if (o.lore.length > 0) parts.push(`## Lore\n${o.lore.map((e) => `### ${e.title}\n${e.body}`).join('\n\n')}`);
  parts.push('## Answer\nPut every job inside one ``` code block, one --- block per job, with nothing before or after it.');
  return parts.join('\n\n');
}
