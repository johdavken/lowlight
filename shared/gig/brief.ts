/**
 * Gig briefs (spec §1.2): one Markdown file per job in world/gigs/, front matter like the lore
 * book's. Also the run's snapshot as saved on the conversation row, and the line she gets.
 */
import { z } from 'zod';
import { LORE_ID, oneLine, splitFrontMatter, yamlScalar, zodProblems, type MapIds } from '../lore';
import { SLIP_MAX } from '../slip/rules';
import { TIER_MAX, type Tier } from './rules';

export const BRIEF_ID_MAX = 40;
export const BRIEF_TITLE_MAX = 40;
export const BRIEF_FIELD_MAX = 80;
export const BRIEF_BODY_MAX = 400;
const TIER_ORDER: Tier[] = ['easy', 'medium', 'hard'];

/** Which game a job is (Slip spec §1.1, Papers spec §3.1). Absent on a brief or a saved run means a hack, so older files and rows stay as they were. */
export type GigKind = 'hack' | 'slip' | 'papers';
export type GigResult = 'clean' | 'close' | 'traced' | 'caught' | 'back';
const KINDS: GigKind[] = ['hack', 'slip', 'papers'];
export const RESULTS_FOR: Record<GigKind, readonly GigResult[]> = { hack: ['clean', 'close', 'traced'], slip: ['clean', 'close', 'caught'], papers: ['clean', 'close', 'back'] };
export const gigKind = (x: { kind?: GigKind }): GigKind => x.kind ?? 'hack';
/** The run's meter maximum: TRACE for a hack, HEAT for a slip. A papers board sets its own cap (Papers spec §2.4). */
export const tierMax = (kind: 'hack' | 'slip', tier: Tier): number => (kind === 'slip' ? SLIP_MAX : TIER_MAX)[tier];

export interface Brief {
  id: string;
  title: string;
  tier: Tier;
  kind?: GigKind;
  place: string;
  client: string;
  target: string;
  take: string;
  text: string;
}
export interface BriefProblem {
  field: string;
  message: string;
}

const schema = z.strictObject({
  title: oneLine(BRIEF_TITLE_MAX),
  tier: z.enum(TIER_ORDER),
  kind: z.enum(KINDS).optional(),
  place: oneLine(BRIEF_FIELD_MAX),
  client: oneLine(BRIEF_FIELD_MAX),
  target: oneLine(BRIEF_FIELD_MAX),
  take: oneLine(BRIEF_FIELD_MAX),
});

export function parseGigFile(id: string, text: string, ids: MapIds | null): { ok: true; brief: Brief } | { ok: false; problems: BriefProblem[] } {
  const problems: BriefProblem[] =
    LORE_ID.test(id) && id.length <= BRIEF_ID_MAX ? [] : [{ field: 'id', message: `must be lowercase letters, digits and dashes, at most ${BRIEF_ID_MAX}` }];
  const s = splitFrontMatter(text);
  if ('field' in s) return { ok: false, problems: [...problems, s] };
  const parsed = schema.safeParse(s.front);
  if (!parsed.success) problems.push(...zodProblems(parsed.error));
  if (s.body.length === 0) problems.push({ field: 'body', message: 'needs some text' });
  if (s.body.length > BRIEF_BODY_MAX) problems.push({ field: 'body', message: `at most ${BRIEF_BODY_MAX} characters (this is ${s.body.length})` });
  if (parsed.success && ids && !ids.places.has(parsed.data.place)) problems.push({ field: 'place', message: `no place '${parsed.data.place}' on the map` });
  if (!parsed.success || problems.length > 0) return { ok: false, problems };
  return { ok: true, brief: { id, ...parsed.data, text: s.body } };
}

/** Studio's GIGS listing: every file, with what the game makes of it, and who "you" is for the preview's line. */
export interface GigListing {
  briefs: { id: string; brief: Brief | null; problems: BriefProblem[]; loose?: Brief }[];
  you: string;
}

const FIELDS = ['title', 'tier', 'kind', 'place', 'client', 'target', 'take'] as const;

/** A brief's file: front matter in field order, every value written so YAML reads it back as the same string. `kind` unless it's a hack. */
export function gigFile(b: Brief): string {
  const lines = FIELDS.filter((f) => f !== 'kind' || (b.kind !== undefined && b.kind !== 'hack')).map((f) => `${f}: ${yamlScalar(b[f] ?? '')}`);
  return `---\n${lines.join('\n')}\n---\n${b.text}\n`;
}

/** What can be read from a file the game would skip: every one-line field that reads, '' for the rest, tier easy. */
export function looseBrief(id: string, text: string, ids: MapIds | null): Brief {
  void ids;
  const s = splitFrontMatter(text);
  if ('field' in s) return { id, title: '', tier: 'easy', place: '', client: '', target: '', take: '', text: text.trim() };
  const str = (v: unknown) => (typeof v === 'string' && !/[\r\n]/.test(v) ? v.trim() : '');
  const tier = TIER_ORDER.includes(s.front.tier as Tier) ? (s.front.tier as Tier) : 'easy';
  const kind = KINDS.includes(s.front.kind as GigKind) ? { kind: s.front.kind as GigKind } : {};
  return { id, title: str(s.front.title), tier, ...kind, place: str(s.front.place), client: str(s.front.client), target: str(s.front.target), take: str(s.front.take), text: s.body };
}

/** A new brief's id from its title (loreId's rule, at most BRIEF_ID_MAX), unique against `taken`; 'job' when the title has none. */
export function briefId(title: string, taken: ReadonlySet<string>): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, BRIEF_ID_MAX)
      .replace(/-+$/, '') || 'job';
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const id = `${base.slice(0, BRIEF_ID_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!taken.has(id)) return id;
  }
}

/** The jobs on offer when the window opens: one per tier, picked at random within it, easy to hard. */
export function dealJobs(briefs: Brief[], rand: () => number = Math.random): Brief[] {
  return TIER_ORDER.flatMap((tier) => {
    const pool = briefs.filter((b) => b.tier === tier);
    return pool.length ? [pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]] : [];
  });
}

/** A finished run as the conversation keeps it: a copy, so a later edit to the file never rewrites history. */
export interface GigSnapshot {
  /** Absent: a hack (rows saved before Slip). */
  kind?: GigKind;
  you: string;
  title: string;
  tier: Tier;
  /** The place's name. */
  place: string;
  client: string;
  target: string;
  take: string;
  brief: string;
  result: GigResult;
  /** The run's meter: TRACE for a hack, HEAT for a slip, RISK for papers. */
  trace: number;
  max: number;
  /** Papers: the client and tonight's bulletin (Papers spec §4.2). */
  papers?: PapersDetail;
}

export interface PapersDetail {
  name: string;
  /** From the face's gender tag; absent on rows saved before pronouns. */
  pronoun?: 'she' | 'he' | 'they';
  bulletin: { text: string; why: string; lore: string }[];
  /** The rule booth nine looked past, by index. */
  overlooked: number | null;
  /** Lore ids beyond the bulletin's: the origins' own entries (spec §6.1). */
  extraLore?: string[];
}

const HACK_RESULT: Record<string, (n: number, max: number) => string> = {
  clean: (n, max) => `pulled it clean, trace ${n} of ${max}`,
  close: (n, max) => `got it, but the trace hit ${n} of ${max}`,
  traced: (n, max) => `traced at ${n} of ${max}, jacked out with nothing`,
};
const SLIP_RESULT: Record<string, (n: number, max: number) => string> = {
  clean: (n, max) => (n === 0 ? 'lifted it clean, never seen' : `lifted it clean, heat ${n} of ${max}`),
  close: (n, max) => `got it out, but the heat hit ${n} of ${max}`,
  caught: (n, max) => `caught at heat ${n} of ${max}, walked out with nothing`,
};

const PAPERS_RESULT: Record<string, (n: number, max: number, name: string) => string> = {
  clean: (n, max) => `waved through clean, risk ${n} of ${max}`,
  close: (n, max) => `waved through, but risk hit ${n} of ${max}`,
  back: (_n, _max, name) => `turned back at the booth; ${name} goes back on the boat`,
};
const unstop = (s: string) => s.replace(/\.$/, '');

function papersText(g: GigSnapshot): string {
  const p = g.papers;
  const client = p ? ` The client: ${p.name}${p.pronoun ? ` (${p.pronoun})` : ''}.` : '';
  const bulletin = p?.bulletin.length ? ` Tonight's bulletin: ${p.bulletin.map((b) => `${unstop(b.text)} (${unstop(b.why)})`).join('; ')}.` : '';
  const looked = p && p.overlooked !== null && p.bulletin[p.overlooked] ? ` Booth nine looked past "${unstop(p.bulletin[p.overlooked].text)}".` : '';
  return `[gig: ${g.you} just forged papers for a Ferrymen client, with you on comms: "${g.title}" (${g.tier}).${client} Target: ${g.target}. Take: ${g.take}. Brief: ${g.brief}${bulletin}${looked} Result: ${PAPERS_RESULT[g.result](g.trace, g.max, p?.name ?? 'the client')}.]`;
}

/** Her context for the run (spec §6.2): the turn's text. A job comes *off* a place's board; the target is named, so she never reads the place as the mark. */
export function gigText(g: GigSnapshot): string {
  if (gigKind(g) === 'papers') return papersText(g);
  if (gigKind(g) === 'slip')
    return `[gig: ${g.you} just slipped a job off ${g.place}'s board, on foot, with you on comms watching their cameras: "${g.title}" (${g.tier}), targeting ${g.target}. Client: ${g.client}. Take: ${g.take}. Brief: ${g.brief} Result: ${SLIP_RESULT[g.result](g.trace, g.max)}.]`;
  return `[gig: ${g.you} just ran a job off ${g.place}'s board, on the grid from here while you watched: "${g.title}" (${g.tier}), targeting ${g.target}. Client: ${g.client}. Take: ${g.take}. Brief: ${g.brief} Result: ${HACK_RESULT[g.result](g.trace, g.max)}.]`;
}

/** The row's own text: the action line. */
export function gigActionLine(g: GigSnapshot): string {
  if (gigKind(g) === 'papers') return `*${g.you} sits down at a forger's desk for "${g.title}".*`;
  return gigKind(g) === 'slip' ? `*${g.you} slips into a job off ${g.place}'s board: "${g.title}".*` : `*${g.you} jacks into a job off ${g.place}'s board: "${g.title}".*`;
}

const TEXT_FIELDS = ['you', 'title', 'place', 'client', 'target', 'take', 'brief'] as const;

/** A snapshot from outside (an undo's restore), or null when it isn't a whole one. */
export function parseGigSnapshot(v: unknown): GigSnapshot | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const g = v as Record<string, unknown>;
  if (g.kind !== undefined && !KINDS.includes(g.kind as GigKind)) return null;
  const kind = (g.kind as GigKind | undefined) ?? 'hack';
  if (!TEXT_FIELDS.every((k) => typeof g[k] === 'string')) return null;
  if (!TIER_ORDER.includes(g.tier as Tier) || !RESULTS_FOR[kind].includes(g.result as GigResult)) return null;
  if (!Number.isInteger(g.trace) || !Number.isInteger(g.max)) return null;
  if (g.papers !== undefined && (kind !== 'papers' || !isPapersDetail(g.papers))) return null;
  const keys = [...(g.kind === undefined ? [] : ['kind']), ...TEXT_FIELDS, 'tier', 'result', 'trace', 'max', ...(g.papers === undefined ? [] : ['papers'])];
  return Object.fromEntries(keys.map((k) => [k, g[k]])) as unknown as GigSnapshot;
}

function isPapersDetail(v: unknown): v is PapersDetail {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p = v as Record<string, unknown>;
  const line = (b: unknown) => typeof b === 'object' && b !== null && ['text', 'why', 'lore'].every((k) => typeof (b as Record<string, unknown>)[k] === 'string');
  const pronounOk = p.pronoun === undefined || p.pronoun === 'she' || p.pronoun === 'he' || p.pronoun === 'they';
  const extra = p.extraLore === undefined || (Array.isArray(p.extraLore) && p.extraLore.every((x) => typeof x === 'string'));
  return typeof p.name === 'string' && Array.isArray(p.bulletin) && p.bulletin.every(line) && (p.overlooked === null || Number.isInteger(p.overlooked)) && extra && pronounOk;
}
