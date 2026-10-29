/**
 * Quest lines (spec 2026-10-16 quest lines): a written story with branches, played in the room as
 * word-for-word beats with choice cards, which the player talks over with their contact first. Each is
 * a file, `world/quests/<id>.md`: front matter, then `# beat` and `## outcome` sections. Pure: the game
 * server, Studio and their tests share these rules.
 */
import { z } from 'zod';
import { LORE_ID, LORE_ID_MAX, LORE_TITLE_MAX, oneLine, splitFrontMatter, zodProblems, type LoreProblem } from './lore';
import type { Band } from './standing';
import { hhmmOf, minuteOfDay, nextOccurrence, parseHhmm } from './clock';
import type { Deck } from './gear';
import type { Check, KitEvent, Mod } from './mission';
import { DEFAULT_STATS, STAT_KEYS, type StatKey, type Stats } from './stats';

export const QUEST_TEXT_MAX = 1800;
export const QUEST_VIEW_MAX = 600;
export const QUEST_CHOICE_MAX = 80;
export const QUEST_CHOICES_MIN = 2;
export const QUEST_CHOICES_MAX = 4;
export const QUEST_NODES_MAX = 40;

export type QuestProblem = LoreProblem;

export type Condition =
  | { kind: 'flag'; name: string; op: '=' | '!='; value: string }
  | { kind: 'set'; name: string }
  | { kind: 'band'; axis: 'trust' | 'warmth'; op: '=' | '>=' | '<='; band: Band }
  | { kind: 'with'; contact: string }
  // Missions spec §2: your heat, the deck you hold (any, by id, or by trait), a stat.
  | { kind: 'heat'; op: '=' | '>=' | '<='; value: number }
  | { kind: 'deck'; id: string | null; trait: string | null }
  | { kind: 'stat'; stat: StatKey; op: '=' | '>=' | '<='; value: number }
  // Small jobs spec §3: this run's ALARM, 0–3.
  | { kind: 'alarm'; op: '=' | '>=' | '<='; value: number }
  // Big jobs spec §2: the story clock within the job's night (minutes from 06:00).
  | { kind: 'time'; op: '=' | '>=' | '<=' | '<' | '>'; minute: number };

export type Tag = { kind: 'set'; name: string; value: string } | { kind: 'needs'; all: Condition[] } | { kind: 'clock'; minutes: number } | { kind: 'check'; check: Check } | { kind: 'alarm'; delta: 1 } | CrackTag | GigTag;

/** Big jobs spec §3: a route into a gig of this kind and difficulty; modifiers step the difficulty (−1 easier, +1 harder). */
export interface GigTag {
  kind: 'gig';
  gig: 'hack' | 'slip' | 'papers';
  tier: 'easy' | 'medium' | 'hard';
  mods: GigMod[];
}

export interface GigMod {
  when: Condition[];
  step: -1 | 1;
  label: string;
}

/** Small jobs spec §4: crack a terminal of words this long instead of rolling; modifiers add or take tries. */
export interface CrackTag {
  kind: 'crack';
  length: 5 | 6 | 7 | 8 | 9;
  mods: Mod[];
  /** A corporate terminal (deck skins spec §3): it shows the ICE look whatever deck you hold. */
  ice?: true;
}

export interface Choice {
  id: string;
  /** What the card says, and (in the second person) what the pick row says. */
  line: string;
  /** The outcome it leads to (a checked choice: on a pass). */
  to: string;
  /** A checked choice's outcome on a fail (missions spec §2); null: unchecked. */
  fail: string | null;
  /** What it rolls against; null: no roll. */
  check: Check | null;
  /** A terminal to crack instead (small jobs spec §4); null: none. */
  crack: CrackTag | null;
  /** A big job's route into a gig (big jobs spec §3); null: none. With it, `to` is the clean outcome, `close` the close call's, `fail` the failure's. */
  gig: GigTag | null;
  /** A route's second outcome (a close call); null otherwise. */
  close: string | null;
  tags: Tag[];
}

export interface View {
  /** A roster id, or 'any' for whoever has no line of their own. */
  contact: string;
  /** Shown only while these hold (a gated reveal); null: always. */
  when: Condition[] | null;
  text: string;
}

export interface Beat {
  id: string;
  /** A big job's legwork scene: the map place where arriving plays it (big jobs spec §2); null: not a scene. */
  at: string | null;
  /** This version plays only while these hold (beat variants); null: the default, always last. */
  when: Condition[] | null;
  /** Someone the beat brings in, voiced by the contact until the quest moves on; `face`: an extra, or any with a tag (stranger faces spec §4). */
  stranger: { name: string; voice: string; face: { id: string } | { tag: string } | null; temper?: string | null } | null;
  text: string;
  /** The beat's text lines in order, passive lines (small jobs spec §3) with their condition and label; plain lines with none. */
  segments: { when: Condition[] | null; label: string | null; text: string }[];
  views: View[];
  choices: Choice[];
}

export interface Outcome {
  id: string;
  text: string;
  /** The next beat, the quest's end, or (a big job) back to legwork. */
  to: string | 'end' | 'back';
  /** What the next beat waits for (quest waits spec §2); null: it plays at once. */
  wait: Wait | null;
  /** The panel's line while it waits; null: one is made from the wait's parts. */
  next: string | null;
  /** What it does to the kit when it posts (missions spec §2): sol paid, heat added, a deck given (null: taken). */
  effects: Effects;
}

export interface Effects {
  pay?: number;
  /** Small jobs spec §1: `pay: full` pays the run's drawn pay, `pay: half` half of it. */
  payKind?: 'full' | 'half';
  heat?: number;
  deck?: string | null;
  /** Small jobs spec §3: what you got, and a disaster ending; they set the outcome tier at the job's end. */
  take?: 'full' | 'part' | 'none';
  blown?: true;
  /** Big jobs spec §2: a clue found, places marked by the ask or revealed by a clue (each with its marker line). */
  clue?: string;
  marks?: { place: string; line: string }[];
  reveals?: { place: string; line: string }[];
  /** The arrangement (spec 2026-10-20): this outcome strikes the contact's deal to sit the player's chair. */
  arrangement?: { retainer: number; nights: 1 | 2 };
}

/** A wait as written: `until 06:00 · at <place> · by 12:00 else <id>` (spec §2). */
export interface Wait {
  /** Not before the next HH:MM after the pick (a minute of day). */
  until: number | null;
  /** Not before this many minutes after the pick. */
  after: number | null;
  at: string | null;
  ready: boolean;
  by: { kind: 'time'; minute: number } | { kind: 'after'; minutes: number } | null;
  else: string | null;
  /** Due only while the player is on comms (comms spec §3). */
  comms: boolean;
}

export const QUEST_NEXT_MAX = 160;
/** The QUEST list's one line on what a quest is about. */
export const QUEST_PITCH_MAX = 200;

export interface QuestEntry {
  id: string;
  title: string;
  /** A mission (spec 2026-10-18): checked choices, effects, and the contact only at the start and the end. */
  kind: 'quest' | 'mission' | 'big';
  /** What the QUEST list says a mission pays (null: not said). */
  pay: number | null;
  /** Small jobs spec §1: the rep tier needed in the job's district (default 1). */
  tier: 1 | 2 | 3 | 4;
  /** The pay drawn at the start lies in this range (`pay: N` is [N, N]); null: none said. */
  payRange: [number, number] | null;
  /** Minutes each pick takes; null: the tier's default (stepMinutes). */
  minutes: number | null;
  /** `draw <name>: a | b | c`: one value per run, kept as a flag. */
  draws: { name: string; values: string[] }[];
  /** The panel's picture, a file in world/quests/art/ (null: none). */
  art: string | null;
  /** Who can be the contact for it; null: anyone. */
  with: string[] | null;
  /** The map place id it starts at. */
  starts: string;
  after: Condition[] | null;
  /** One line for the QUEST list on what it's about (null: none). */
  pitch: string | null;
  /** Some wait in it has a deadline: it can be missed. */
  timed: boolean;
  /** The first beat's id. */
  first: string;
  /** Each beat's versions in file order; the last is the default (`when: null`). */
  beats: Map<string, Beat[]>;
  outcomes: Map<string, Outcome>;
  /** Big jobs: the go hour as a minute of day (null: not a big job). */
  go: number | null;
  /** Big jobs: the rep won on CLEAN and lost on BLOWN (null: the default 15 / 25). */
  stake: [number, number] | null;
  /** A desk job (comms spec §3): the place it's played at, on comms (null: not a desk job). */
  commsAt: string | null;
  /** Jobs: the minutes of day it lists between (null: always). */
  posts: [number, number] | null;
  /** Jobs: trust gained on CLEAN / lost on BLOWN with the contact you ran it with (null: rep is the stake). */
  trust: [number, number] | null;
  /** Big jobs: the route gigs' brief lines from the front matter (null: the default). */
  brief: { client: string | null; target: string | null; take: string | null };
  /** Big jobs: the clues, by id. */
  clues: Map<string, { text: string; words: string[]; false: boolean }>;
  /** Big jobs: the read (its beat id, the sentence around its three blanks, the right words, the wrong ones offered, the approach's first beat). */
  read: { beat: string; parts: string[]; answers: [string, string, string]; wrong: string[]; next: string } | null;
}

/** A job: a small one (mission) or a big one. */
export const isJob = (q: Pick<QuestEntry, 'kind'>) => q.kind === 'mission' || q.kind === 'big';

/** Whether a job's `posts:` window holds at story-clock minute `clock` (null: always). */
export function postsOpen(posts: [number, number] | null, clock: number): boolean {
  if (!posts) return true;
  const [from, to] = posts;
  const m = minuteOfDay(clock);
  return from <= to ? m >= from && m < to : m >= from || m < to;
}

/** A contact's own job (Intake board spec §3): the one contact its `with:` names, else null. */
export const ownedBy = (q: Pick<QuestEntry, 'with'>): string | null => (q.with?.length === 1 ? q.with[0] : null);

/** What a condition reads: the playthrough's flags, the contact's standing bands (null: standing doesn't apply), who you're with. */
export interface CondCtx {
  flags: Readonly<Record<string, string>>;
  trust: Band | null;
  warmth: Band | null;
  with: string;
  /** Missions: your heat (absent: 0), the deck you hold (absent: none), your stats (absent: 3s). */
  heat?: number;
  deck?: Deck | null;
  stats?: Stats;
  /** This run's ALARM (absent: 0). */
  alarm?: number;
  /** Big jobs: the story clock within the job's night, minutes from 06:00 (absent: time conditions don't hold). */
  night?: number;
}

/** A flag name or value; a dot is allowed for the read's own flags (`read.2=right`). */
const FLAG = /^[a-z0-9_.-]+$/;
const BANDS: readonly Band[] = ['low', 'mid', 'high'];

/** A condition's `and`-joined parts; or a problem. */
export function parseCondition(s: string): Condition[] | QuestProblem {
  const out: Condition[] = [];
  for (const raw of s.trim().split(/\s+and\s+/)) {
    const part = raw.trim();
    let m: RegExpExecArray | null;
    const op = (o: string): '=' | '>=' | '<=' => (o === '≥' || o === '>=' ? '>=' : o === '≤' || o === '<=' ? '<=' : '=');
    if ((m = /^time\s*(=|≥|>=|≤|<=|<|>)\s*(\d{2}):(\d{2})$/.exec(part)) && Number(m[2]) < 24 && Number(m[3]) < 60) {
      const o = m[1] === '≥' ? '>=' : m[1] === '≤' ? '<=' : (m[1] as '=' | '>=' | '<=' | '<' | '>');
      out.push({ kind: 'time', op: o, minute: nightMinuteOf(Number(m[2]) * 60 + Number(m[3])) });
      continue;
    }
    if ((m = /^alarm\s*(=|≥|>=|≤|<=)\s*(\d+)$/.exec(part))) {
      out.push({ kind: 'alarm', op: op(m[1]), value: Number(m[2]) });
      continue;
    }
    if ((m = /^heat\s*(=|≥|>=|≤|<=)\s*(\d+)$/.exec(part))) {
      out.push({ kind: 'heat', op: op(m[1]), value: Number(m[2]) });
      continue;
    }
    if ((m = /^deck(?:\s*=\s*([a-z0-9]+(?:-[a-z0-9]+)*)|:([a-z]+))?$/.exec(part))) {
      out.push({ kind: 'deck', id: m[1] ?? null, trait: m[2] ?? null });
      continue;
    }
    if ((m = /^([a-z]+)\s*(=|≥|>=|≤|<=)\s*(\d+)$/.exec(part)) && (STAT_KEYS as readonly string[]).includes(m[1])) {
      out.push({ kind: 'stat', stat: m[1] as StatKey, op: op(m[2]), value: Number(m[3]) });
      continue;
    }
    if ((m = /^(trust|warmth)\s*(=|≥|>=|≤|<=)\s*([a-z]+)$/.exec(part))) {
      const band = m[3] as Band;
      if (!BANDS.includes(band)) return { field: 'condition', message: `'${m[3]}' isn't a band (low, mid, high)` };
      const op = m[2] === '≥' || m[2] === '>=' ? '>=' : m[2] === '≤' || m[2] === '<=' ? '<=' : '=';
      out.push({ kind: 'band', axis: m[1] as 'trust' | 'warmth', op, band });
    } else if ((m = /^with\s*=\s*([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(part))) {
      out.push({ kind: 'with', contact: m[1] });
    } else if ((m = /^([^\s=!]+)\s*(!=|=)\s*([^\s=!]+)$/.exec(part)) && FLAG.test(m[1]) && FLAG.test(m[3])) {
      out.push({ kind: 'flag', name: m[1], op: m[2] as '=' | '!=', value: m[3] });
    } else if (FLAG.test(part)) {
      out.push({ kind: 'set', name: part });
    } else {
      return { field: 'condition', message: `can't read '${part}' (flag=value, flag!=value, flag, trust/warmth with =, ≥ or ≤ and a band, with=<id>, heat>=N, deck, deck=<id>, deck:<trait>, tech>=N; joined with 'and')` };
    }
  }
  return out;
}

const rank = (b: Band) => BANDS.indexOf(b);

/** A minute of day as minutes into its night: the night runs 06:00 → 05:59 (big jobs spec §2). */
export const nightMinuteOf = (minuteOfDay: number) => (minuteOfDay - 360 + 1440) % 1440;

const cmp = (v: number, op: '=' | '>=' | '<=', to: number) => (op === '=' ? v === to : op === '>=' ? v >= to : v <= to);

/** Whether every condition holds; no conditions always hold. */
export function holds(all: Condition[] | null, ctx: CondCtx): boolean {
  if (!all) return true;
  return all.every((c) => {
    switch (c.kind) {
      case 'flag':
        return c.op === '=' ? ctx.flags[c.name] === c.value : ctx.flags[c.name] !== c.value;
      case 'set':
        return ctx.flags[c.name] !== undefined;
      case 'with':
        return ctx.with === c.contact;
      case 'heat':
        return cmp(ctx.heat ?? 0, c.op, c.value);
      case 'alarm':
        return cmp(ctx.alarm ?? 0, c.op, c.value);
      case 'time': {
        if (ctx.night === undefined) return false;
        const v = ctx.night;
        return c.op === '<' ? v < c.minute : c.op === '>' ? v > c.minute : cmp(v, c.op, c.minute);
      }
      case 'stat':
        return cmp((ctx.stats ?? DEFAULT_STATS)[c.stat], c.op, c.value);
      case 'deck': {
        const d = ctx.deck ?? null;
        return d !== null && (c.id === null || d.id === c.id) && (c.trait === null || (d.traits as string[]).includes(c.trait));
      }
      case 'band': {
        const v = ctx[c.axis];
        if (v === null) return false;
        return c.op === '=' ? v === c.band : c.op === '>=' ? rank(v) >= rank(c.band) : rank(v) <= rank(c.band);
      }
    }
  });
}

const frontSchema = z.strictObject({
  title: oneLine(LORE_TITLE_MAX),
  with: z.array(oneLine(LORE_ID_MAX)).min(1).nullish(),
  starts: oneLine(LORE_ID_MAX),
  after: oneLine(200).nullish(),
  pitch: oneLine(QUEST_PITCH_MAX).nullish(),
  kind: z.enum(['quest', 'mission', 'big']).nullish(),
  /** Big jobs: the go hour, HH:MM. */
  go: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'go is a time, HH:MM').nullish(),
  /** A desk job (comms spec §3): the map place it's played at, on comms. */
  comms: oneLine(LORE_ID_MAX).nullish(),
  /** Jobs: when it lists, HH:MM-HH:MM (may cross midnight; the end is exclusive). */
  posts: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/, 'posts is a window, HH:MM-HH:MM').nullish(),
  /** Jobs: trust gained on CLEAN / lost on BLOWN with the contact you ran it with, like 1 / 1 (rep then doesn't move). */
  trust: z.string().regex(/^[0-3]\s*\/\s*[0-3]$/, 'trust is gained / lost, 0–3 each, like 1 / 1').nullish(),
  /** Big jobs: the gig's brief (who it's for, what it's against, what you take); absent: the fixer, the title, the job. */
  client: oneLine(60).nullish(),
  target: oneLine(60).nullish(),
  take: oneLine(60).nullish(),
  /** Big jobs: rep won on CLEAN / lost on BLOWN, like 15 / 25. */
  stake: z.string().regex(/^\d{1,2}\s*\/\s*\d{1,2}$/, 'stake is won / lost, like 15 / 25').nullish(),
  /** The panel's picture (spec 2026-10-19 quest art): a file in world/quests/art/. */
  art: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:png|webp|jpg)$/, 'a file name in world/quests/art/: lowercase letters, digits and dashes, then .png, .webp or .jpg').nullish(),
  pay: z
    .string()
    .regex(/^\d+(?:-\d+)?$/, 'must be a whole number of sol, or a range like 350-450')
    .refine((v) => !v.includes('-') || Number(v.split('-')[0]) <= Number(v.split('-')[1]), 'a range runs low to high')
    .nullish(),
  tier: z.string().regex(/^[1-4]$/, 'tier is 1, 2, 3 or 4').nullish(),
  minutes: z.string().regex(/^\d{1,3}$/, 'minutes is a whole number').nullish(),
});

const idOk = (id: string) => LORE_ID.test(id) && id.length <= LORE_ID_MAX;
const VIEW = /^view ([a-z0-9]+(?:-[a-z0-9]+)*)(?: if (.+?))?:\s*(.+)$/;
const CHOICE = /^- ([^:\s]+): (.+?) → (\S+)(?: \/ (\S+))?(?: \/ (\S+))?(?: \[(.+)\])?$/;
const ARROW = /^→ (\S+)$/;

/** A check's or crack's ` · <contact> +N` crew bonuses and ` · if <condition> ±N "label"` modifiers. */
function parseExtras(raw: string): { crew: Check['crew']; mods: Mod[] } | string {
  const crew: Check['crew'] = [];
  const mods: Mod[] = [];
  for (const part of raw.split(' · ').map((x) => x.trim()).filter(Boolean)) {
    let m: RegExpExecArray | null;
    if ((m = /^([a-z0-9]+(?:-[a-z0-9]+)*) \+(\d+)$/.exec(part))) crew.push({ contact: m[1], bonus: Number(m[2]) });
    else if ((m = /^if (.+?) ([+-]\d+) "([^"]+)"$/.exec(part))) {
      const c = parseCondition(m[1]);
      if (!Array.isArray(c)) return c.message;
      mods.push({ when: c, delta: Number(m[2]), label: m[3] });
    } else return `can't read '${part}' (· <contact> +N, or · if <condition> +N "label")`;
  }
  return { crew, mods };
}

/** A gig route's ` · <contact> -1` crew steps and ` · if <condition> -1 "label"` modifiers (big jobs spec §3). */
function parseGigExtras(raw: string): GigMod[] | string {
  const mods: GigMod[] = [];
  for (const part of raw.split(' · ').map((x) => x.trim()).filter(Boolean)) {
    let m: RegExpExecArray | null;
    if ((m = /^([a-z0-9]+(?:-[a-z0-9]+)*) ([+-]1)$/.exec(part))) {
      const name = m[1].charAt(0).toUpperCase() + m[1].slice(1).replace(/-direct$/, '');
      mods.push({ when: [{ kind: 'with', contact: m[1] }], step: Number(m[2]) as -1 | 1, label: name });
    } else if ((m = /^if (.+?) ([+-]1) "([^"]+)"$/.exec(part))) {
      const c = parseCondition(m[1]);
      if (!Array.isArray(c)) return c.message;
      mods.push({ when: c, step: Number(m[2]) as -1 | 1, label: m[3] });
    } else return `can't read '${part}' (· <contact> -1, or · if <condition> -1 "label"; steps are -1 or +1)`;
  }
  return mods;
}

function parseTags(raw: string | undefined): Tag[] | string {
  if (!raw) return [];
  const tags: Tag[] = [];
  for (const t of raw.split(',').map((s) => s.trim())) {
    let m: RegExpExecArray | null;
    if ((m = /^set ([^\s=]+)=(\S+)$/.exec(t)) && FLAG.test(m[1]) && FLAG.test(m[2])) tags.push({ kind: 'set', name: m[1], value: m[2] });
    else if ((m = /^clock \+(\d+)(h|m)$/.exec(t))) tags.push({ kind: 'clock', minutes: Number(m[1]) * (m[2] === 'h' ? 60 : 1) });
    else if ((m = /^check (\S+) (\d+)( grid)?( red)?((?: · .+)?)$/.exec(t))) {
      const stat = m[1];
      if (!(STAT_KEYS as readonly string[]).includes(stat) || stat === 'edge') return `check: '${stat}' isn't a stat (body, reflex, tech, cool, wits)`;
      const base = Number(m[2]);
      if (base < 1 || base > 99) return `check: the base is a percent, 1–99 (this is ${base})`;
      const extras = parseExtras(m[5]);
      if (typeof extras === 'string') return `check: ${extras}`;
      tags.push({ kind: 'check', check: { stat: stat as Check['stat'], base, grid: m[3] !== undefined, crew: extras.crew, red: m[4] !== undefined, mods: extras.mods } });
    } else if (t === 'alarm +1') {
      tags.push({ kind: 'alarm', delta: 1 });
    } else if ((m = /^crack (\d+)( ice)?((?: · .+)?)$/.exec(t))) {
      const length = Number(m[1]);
      if (length < 5 || length > 9) return `crack: words are 5–9 letters (this is ${length})`;
      const extras = parseExtras(m[3]);
      if (typeof extras === 'string') return `crack: ${extras}`;
      if (extras.crew.length) return 'crack: crew bonuses go on checks; use · if with=<id> +N "label"';
      tags.push({ kind: 'crack', length: length as CrackTag['length'], mods: extras.mods, ...(m[2] ? { ice: true as const } : {}) });
    } else if ((m = /^gig (hack|slip|papers) (easy|medium|hard)((?: · .+)?)$/.exec(t))) {
      const mods = parseGigExtras(m[3]);
      if (typeof mods === 'string') return `gig: ${mods}`;
      tags.push({ kind: 'gig', gig: m[1] as GigTag['gig'], tier: m[2] as GigTag['tier'], mods });
    } else if ((m = /^needs (.+)$/.exec(t))) {
      const c = parseCondition(m[1]);
      if (!Array.isArray(c)) return c.message;
      tags.push({ kind: 'needs', all: c });
    } else return `can't read the tag '${t}' (set flag=value, needs <condition>, clock +6h / +30m, check <stat> <base> [grid] [red] [· <contact> +N] [· if <condition> +N "label"], crack <5–9> [ice], alarm +1, gig <hack|slip|papers> <easy|medium|hard> [· if <condition> -1 "label"])`;
  }
  return tags;
}

/** Body text: trimmed, at most one blank line between paragraphs. */
const tidy = (lines: string[]) =>
  lines
    .join('\n')
    .trim()
    .replace(/\n{3,}/g, '\n\n');

/** A passive line's bracket (small jobs spec §3): `wits 6` (≥), or any condition; its faint label. Null: not a condition at all. */
function passive(raw: string): { when: Condition[]; label: string | null } | QuestProblem | null {
  const short = /^([a-z]+) (\d+)$/.exec(raw.trim());
  const src = short && (STAT_KEYS as readonly string[]).includes(short[1]) ? `${short[1]}>=${short[2]}` : raw;
  const c = parseCondition(src);
  if (!Array.isArray(c)) return /^[a-z]/.test(raw.trim()) ? c : null;
  const first = c[0];
  const label = first.kind === 'stat' ? first.stat.toUpperCase() : first.kind === 'deck' ? 'DECK' : first.kind === 'with' ? first.contact.toUpperCase() : null;
  return { when: c, label };
}

/** A beat's text as shown (small jobs spec §3): plain lines, and each passive line whose condition holds, `⟦LABEL⟧ text`. */
export function beatText(beat: Beat, ctx: CondCtx): string {
  if (!beat.segments?.length) return beat.text;
  return tidy(beat.segments.filter((s) => s.when === null || holds(s.when, ctx)).map((s) => (s.when === null ? s.text : s.label ? `⟦${s.label}⟧ ${s.text}` : s.text)));
}

function parseBeat(id: string, when: Condition[] | null, lines: string[], problems: QuestProblem[], at: string | null = null): Beat {
  const p = (message: string) => problems.push({ field: id, message });
  const text: string[] = [];
  const views: View[] = [];
  const choices: Choice[] = [];
  const segments: Beat['segments'] = [];
  let stranger: Beat['stranger'] = null;
  let first = true;
  /** The line before was `stranger:` (where `face:` goes). */
  let afterStranger = false;
  for (const line of lines) {
    const t = line.trim();
    if (first && t !== '') {
      first = false;
      const m = /^stranger:\s*(.+?)\s+(?:—|-)\s+(.+)$/.exec(t);
      if (m) {
        stranger = { name: m[1], voice: m[2], face: null, temper: null };
        afterStranger = true;
        continue;
      }
    }
    if (/^face:/.test(t)) {
      const f = /^face:\s*(?:any\s+(\S+)|(\S+))$/.exec(t);
      if (!afterStranger || !stranger) p('face: goes right after stranger:');
      else if (!f) p(`can't read '${t}' (face: <id>, or face: any <tag>)`);
      else stranger.face = f[1] !== undefined ? { tag: f[1] } : { id: f[2] };
      afterStranger = false;
      continue;
    }
    if (/^temper:/.test(t)) {
      const tm = /^temper:\s*([a-z0-9_-]+)$/.exec(t);
      if (!stranger) p('temper: goes with a stranger: line');
      else if (!tm) p(`can't read '${t}' (temper: <flag>)`);
      else stranger.temper = tm[1];
      continue;
    }
    if (t !== '') afterStranger = false;
    let m: RegExpExecArray | null;
    if ((m = VIEW.exec(t)) || /^view any(?: if .+?)?:/.test(t)) {
      const any = /^view any( if (.+?))?:\s*(.+)$/.exec(t);
      const [contact, cond, body] = any ? ['any', any[2], any[3]] : [m![1], m![2], m![3]];
      let when: Condition[] | null = null;
      if (cond !== undefined) {
        const c = parseCondition(cond);
        if (!Array.isArray(c)) p(`view ${contact}: ${c.message}`);
        else when = c;
      }
      if (body.length > QUEST_VIEW_MAX) p(`view ${contact}: at most ${QUEST_VIEW_MAX} characters (this is ${body.length})`);
      views.push({ contact, when, text: body });
    } else if (t.startsWith('- ') && (m = CHOICE.exec(t))) {
      const tags = parseTags(m[6]);
      if (typeof tags === 'string') p(`choice ${m[1]}: ${tags}`);
      if (!idOk(m[1])) p(`'${m[1]}' isn't a choice id: lowercase letters, digits and dashes`);
      if (m[2].length > QUEST_CHOICE_MAX) p(`choice ${m[1]}: at most ${QUEST_CHOICE_MAX} characters (this is ${m[2].length})`);
      const all = typeof tags === 'string' ? [] : tags;
      const check = all.find((x): x is Extract<Tag, { kind: 'check' }> => x.kind === 'check')?.check ?? null;
      const crack = all.find((x): x is CrackTag => x.kind === 'crack') ?? null;
      const gig = all.find((x): x is GigTag => x.kind === 'gig') ?? null;
      // Three outcomes (a gig route): clean / close / fail; two: pass / fail.
      const three = m[5] !== undefined;
      choices.push({ id: m[1], line: m[2], to: m[3], close: three ? m[4] : null, fail: (three ? m[5] : m[4]) ?? null, check, crack, gig, tags: all.filter((x) => x.kind !== 'check' && x.kind !== 'crack' && x.kind !== 'gig') });
    } else if (t.startsWith('- ') && t.includes('→')) {
      p(`can't read the choice '${t}' (- id: The line. → outcome [tags])`);
    } else if ((m = /^\[(.+?)\]\s+(.+)$/.exec(t)) && passive(m[1])) {
      const pc = passive(m[1])!;
      if ('message' in pc) p(`passive line: ${pc.message}`);
      else segments.push({ when: pc.when, label: pc.label, text: m[2] });
    } else {
      text.push(line);
      segments.push({ when: null, label: null, text: line });
    }
  }
  const body = tidy(text);
  if (body === '') p('needs some text');
  if (body.length > QUEST_TEXT_MAX) p(`at most ${QUEST_TEXT_MAX} characters (this is ${body.length})`);
  if (choices.length < QUEST_CHOICES_MIN || choices.length > QUEST_CHOICES_MAX) p(`needs ${QUEST_CHOICES_MIN}–${QUEST_CHOICES_MAX} choices (this has ${choices.length})`);
  const seen = new Set<string>();
  for (const c of choices) if (seen.has(c.id) || !seen.add(c.id)) p(`choice ${c.id} appears twice`);
  return { id, at, when, stranger, text: body, segments, views, choices };
}

const span = (s: string): number | null => {
  const m = /^\+(\d+)(h|m)$/.exec(s);
  return m ? Number(m[1]) * (m[2] === 'h' ? 60 : 1) : null;
};

/** A `wait:` line's parts; or what's wrong with it. The cross-file rules (targets, places) are checked by the caller. */
function parseWait(raw: string): Wait | string {
  const w: Wait = { until: null, after: null, at: null, ready: false, by: null, else: null, comms: false };
  for (const part of raw.split(/\s+[·.-]\s+/).map((x) => x.trim()).filter(Boolean)) {
    let m: RegExpExecArray | null;
    if ((m = /^until (\S+)$/.exec(part)) && parseHhmm(m[1]) !== null) w.until = parseHhmm(m[1]);
    else if ((m = /^after (\S+)$/.exec(part)) && span(m[1]) !== null) w.after = span(m[1]);
    else if ((m = /^at ([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(part))) w.at = m[1];
    else if (part === 'ready') w.ready = true;
    else if (part === 'comms') w.comms = true;
    else if ((m = /^by (\S+) else ([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(part)) && (parseHhmm(m[1]) !== null || span(m[1]) !== null)) {
      w.by = parseHhmm(m[1]) !== null ? { kind: 'time', minute: parseHhmm(m[1])! } : { kind: 'after', minutes: span(m[1])! };
      w.else = m[2];
    } else return `can't read '${part}' (until HH:MM, after +6h, at <place>, ready, comms, by HH:MM else <id>)`;
  }
  if (w.until === null && w.after === null && w.at === null && !w.ready) return 'waits for nothing: give until, after, at or ready';
  if (w.until !== null && w.after !== null) return "until and after can't go together";
  if (w.by && w.ready) return "a deadline can't go with ready";
  if (w.by && w.until === null && w.after === null && w.at === null) return 'a deadline needs until, after or at';
  if (w.by?.kind === 'after' && w.after !== null && w.by.minutes <= w.after) return 'the deadline has to come after the wait';
  return w;
}

/** `place "line", place "line"`: places and their marker lines (big jobs spec §2). */
function placeLines(raw: string): { place: string; line: string }[] | string {
  const out: { place: string; line: string }[] = [];
  const rest = raw.replace(/([a-z0-9]+(?:-[a-z0-9]+)*)\s+"([^"]{1,80})"\s*(,|$)/g, (_m, place: string, line: string) => {
    out.push({ place, line });
    return '';
  });
  return rest.trim() === '' && out.length > 0 ? out : `can't read '${raw}' (place "its line", place "its line")`;
}

/** A big job's `# clues`: `- id: text · words: a, b · false` (big jobs spec §2). */
function parseClues(lines: string[], into: Map<string, { text: string; words: string[]; false: boolean }>, problems: QuestProblem[]): void {
  for (const raw of lines) {
    const t = raw.trim();
    if (t === '') continue;
    const m = /^- ([a-z0-9]+(?:-[a-z0-9]+)*): (.+?) · words: (.+?)( · false)?$/.exec(t);
    if (!m) {
      problems.push({ field: 'clues', message: `can't read '${t}' (- id: The clue. · words: a, b [· false])` });
      continue;
    }
    const words = m[3].split(',').map((w) => w.trim()).filter(Boolean);
    if (words.length < 1 || words.length > 3 || words.some((w) => w.length > 32)) problems.push({ field: 'clues', message: `${m[1]}: 1–3 words, each at most 32 characters` });
    if (into.has(m[1])) problems.push({ field: 'clues', message: `${m[1]} appears twice` });
    into.set(m[1], { text: m[2], words, false: m[4] !== undefined });
  }
  if (into.size === 0) problems.push({ field: 'clues', message: 'needs at least one clue' });
}

/** A big job's read beat: `read:` with three [blanks], `wrong:` words, and `→ <the approach's first beat>` (big jobs spec §3). */
function parseRead(id: string, lines: string[], problems: QuestProblem[]): QuestEntry['read'] {
  const p = (message: string) => problems.push({ field: id, message });
  let sentence = '';
  let wrong: string[] = [];
  let next = '';
  for (const raw of lines) {
    const t = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^read:\s*(.+)$/.exec(t))) sentence = m[1];
    else if ((m = /^wrong:\s*(.+)$/.exec(t))) wrong = m[1].split(',').map((w) => w.trim()).filter(Boolean);
    else if ((m = ARROW.exec(t))) next = m[1];
    else if (t !== '') p(`can't read '${t}' in the read (read: …, wrong: …, → <beat>)`);
  }
  const bits = sentence.split(/\[([^\]]+)\]/);
  const answers = bits.filter((_, i) => i % 2 === 1).map((w) => w.trim());
  if (answers.length !== 3) p(`the read needs three blanks in [brackets] (this has ${answers.length})`);
  if (wrong.length === 0) p('the read needs a wrong: line (wrong words to choose from)');
  if (!next) p("the read needs '→ <beat>': where the approach starts");
  return { beat: id, parts: bits.filter((_, i) => i % 2 === 0), answers: [answers[0] ?? '', answers[1] ?? '', answers[2] ?? ''], wrong, next };
}

function parseOutcome(id: string, lines: string[], problems: QuestProblem[]): Outcome {
  const p = (message: string) => problems.push({ field: id, message });
  const kept = [...lines];
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  // The arrow, then at most a wait: line and a next: line.
  let i = kept.length - 1;
  while (i >= 0 && /^(wait|next):/.test(kept[i].trim())) i--;
  const m = ARROW.exec(kept[i]?.trim() ?? '');
  let wait: Wait | null = null;
  let next: string | null = null;
  if (!m) p("needs '→ <beat>' or '→ end' (then optional wait: and next: lines) as its last lines");
  else {
    for (const line of kept.slice(i + 1).map((l) => l.trim())) {
      const w = /^wait:\s*(.+)$/.exec(line);
      const n = /^next:\s*(.+)$/.exec(line);
      if (w && wait === null) {
        const r = parseWait(w[1]);
        if (typeof r === 'string') p(`wait: ${r}`);
        else wait = r;
      } else if (n && next === null) {
        next = n[1];
        if (next.length > QUEST_NEXT_MAX) p(`next: at most ${QUEST_NEXT_MAX} characters (this is ${next.length})`);
      } else p(`'${line}' appears twice after the arrow`);
    }
    if ((wait || next) && m[1] === 'end') p("a wait needs a beat to wait for, not '→ end'");
    if (next !== null && wait === null) p('next: needs a wait: line');
    kept.splice(i);
  }
  // Effect lines (missions spec §2): right above the arrow.
  const effects: Effects = {};
  while (kept.length > 0) {
    const t = kept[kept.length - 1].trim();
    let e: RegExpExecArray | null;
    if ((e = /^pay:\s*(\d+)$/.exec(t)) && effects.pay === undefined && effects.payKind === undefined) effects.pay = Number(e[1]);
    else if ((e = /^pay:\s*(full|half)$/.exec(t)) && effects.pay === undefined && effects.payKind === undefined) effects.payKind = e[1] as 'full' | 'half';
    else if ((e = /^take:\s*(full|part|none)$/.exec(t)) && effects.take === undefined) effects.take = e[1] as 'full' | 'part' | 'none';
    else if (t === 'blown' && effects.blown === undefined) effects.blown = true;
    else if ((e = /^heat:\s*([+-]\d+)$/.exec(t)) && effects.heat === undefined) effects.heat = Number(e[1]);
    else if ((e = /^gives:\s*deck\s+([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(t)) && effects.deck === undefined) effects.deck = e[1];
    else if (/^takes:\s*deck$/.test(t) && effects.deck === undefined) effects.deck = null;
    else if ((e = /^clue:\s*([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(t)) && effects.clue === undefined) effects.clue = e[1];
    else if ((e = /^arrangement:\s*chair\s+(\d+)\s*\/\s*(\d+)$/.exec(t)) && effects.arrangement === undefined) {
      const retainer = Number(e[1]);
      const nights = Number(e[2]);
      if (retainer < 50 || retainer > 500) p('arrangement: the retainer is 50–500 sol');
      if (nights !== 1 && nights !== 2) p('arrangement: nights is 1 or 2');
      effects.arrangement = { retainer, nights: nights === 2 ? 2 : 1 };
    }
    else if ((e = /^(marks|reveals):\s*(.+)$/.exec(t)) && effects[e[1] as 'marks' | 'reveals'] === undefined) {
      const pairs = placeLines(e[2]);
      if (typeof pairs === 'string') {
        p(`${e[1]}: ${pairs}`);
        effects[e[1] as 'marks' | 'reveals'] = [];
      } else effects[e[1] as 'marks' | 'reveals'] = pairs;
    } else break;
    kept.pop();
  }
  // One that didn't read (a blank line before the arrow, no sign on heat) would be shown as story: say so instead.
  for (const line of kept) if (/^(pay|heat|gives|takes|take|clue|marks|reveals):/.test(line.trim()) || line.trim() === 'blown') p(`can't read the effect line '${line.trim()}' (right above the → line, no blank line: pay: 400 / full / half, heat: +2 or -1, gives: deck <id>, takes: deck, take: full / part / none, blown)`);
  for (const line of kept) if (/^(wait|next):/.test(line.trim())) p("wait: and next: go right after the '→' line");
  const text = tidy(kept);
  if (text === '') p('needs some text');
  if (text.length > QUEST_TEXT_MAX) p(`at most ${QUEST_TEXT_MAX} characters (this is ${text.length})`);
  return { id, text, to: m ? m[1] : 'end', wait, next, effects };
}

export function parseQuestFile(
  id: string,
  text: string,
  known: { roster: ReadonlySet<string> | null; places: ReadonlySet<string> | null; extras?: { ids: ReadonlySet<string>; tags: ReadonlySet<string> } | null; decks?: ReadonlySet<string> | null },
): { ok: true; entry: QuestEntry; warnings: string[] } | { ok: false; problems: QuestProblem[] } {
  const problems: QuestProblem[] = idOk(id) ? [] : [{ field: 'id', message: `must be lowercase letters, digits and dashes, at most ${LORE_ID_MAX}` }];
  const s = splitFrontMatter(text);
  if ('field' in s) return { ok: false, problems: [...problems, s] };
  // `draw <name>: a | b | c` lines (small jobs spec §1) sit beside the fixed keys.
  const draws: { name: string; values: string[] }[] = [];
  const front: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s.front)) {
    const d = /^draw\s+(.+)$/.exec(k);
    if (!d) {
      front[k] = v;
      continue;
    }
    const name = d[1].trim();
    const values = String(v ?? '').split('|').map((x) => x.trim()).filter(Boolean);
    if (!FLAG.test(name)) problems.push({ field: `draw ${name}`, message: 'a draw name is lowercase letters, digits, dashes and underscores' });
    else if (values.length < 2 || values.some((x) => !FLAG.test(x))) problems.push({ field: `draw ${name}`, message: 'needs two or more values like a | b (lowercase letters, digits, dashes)' });
    else if (draws.some((x) => x.name === name)) problems.push({ field: `draw ${name}`, message: 'appears twice' });
    else draws.push({ name, values });
  }
  const parsed = frontSchema.safeParse(front);
  if (!parsed.success) problems.push(...zodProblems(parsed.error));

  // The body's nodes in order: `# id` a beat, `## id` an outcome.
  const nodes: { kind: 'beat' | 'outcome'; id: string; at: string | null; cond: string | null; lines: string[] }[] = [];
  const lead: string[] = [];
  for (const line of s.body.split('\n')) {
    const h = /^(#{1,2})[ \t]+(.+?)\s*$/.exec(line);
    // A beat's version: `# id if <condition>`; a big job's scene: `# id at <place>` (then any `if`).
    const v = h && h[1] === '#' ? /^(\S+)(?:[ \t]+at[ \t]+(\S+))?(?:[ \t]+if[ \t]+(.+))?$/.exec(h[2]) : null;
    if (h) nodes.push({ kind: h[1] === '#' ? 'beat' : 'outcome', id: v ? v[1] : h[2], at: v?.[2] ?? null, cond: v?.[3] ?? null, lines: [] });
    else if (nodes.length > 0) nodes[nodes.length - 1].lines.push(line);
    else lead.push(line);
  }
  if (lead.join('').trim() !== '') problems.push({ field: 'body', message: 'text before the first # heading' });
  if (nodes.length > QUEST_NODES_MAX) problems.push({ field: 'file', message: `at most ${QUEST_NODES_MAX} beats and outcomes (this has ${nodes.length})` });

  const beats = new Map<string, Beat[]>();
  const outcomes = new Map<string, Outcome>();
  const isBig = parsed.success && parsed.data.kind === 'big';
  const clues = new Map<string, { text: string; words: string[]; false: boolean }>();
  let read: QuestEntry['read'] = null;
  for (const n of nodes) {
    // A big job's `# clues` list and its `# read` beat (big jobs spec §2–§3) aren't beats.
    if (n.kind === 'beat' && isBig && n.id === 'clues') {
      parseClues(n.lines, clues, problems);
      continue;
    }
    if (n.kind === 'beat' && n.lines.some((l) => /^read:/.test(l.trim()))) {
      if (!isBig) problems.push({ field: n.id, message: 'read: goes only in a big job (kind: big)' });
      else if (read) problems.push({ field: n.id, message: 'a big job has one read' });
      else read = parseRead(n.id, n.lines, problems);
      continue;
    }
    if (n.at !== null && !isBig) problems.push({ field: n.id, message: `at ${n.at}: scenes at places go only in a big job (kind: big)` });
    if (!idOk(n.id)) problems.push({ field: n.id, message: `'${n.id}' isn't an id: lowercase letters, digits and dashes` });
    if (n.kind === 'outcome' ? beats.has(n.id) || outcomes.has(n.id) : outcomes.has(n.id)) problems.push({ field: n.id, message: 'appears twice' });
    if (n.kind === 'beat') {
      let when: Condition[] | null = null;
      if (n.cond !== null) {
        const c = parseCondition(n.cond);
        if (!Array.isArray(c)) problems.push({ field: n.id, message: `if: ${c.message}` });
        else when = c;
      }
      const vs = beats.get(n.id) ?? [];
      // Only the last version may be the default; a second default, or a default before a version, is a mistake.
      if (vs.length > 0 && vs[vs.length - 1].when === null) problems.push({ field: n.id, message: 'the version without `if` must be the last one, and there can be only one' });
      vs.push(parseBeat(n.id, when ?? (n.cond !== null ? [] : null), n.lines, problems, n.at));
      beats.set(n.id, vs);
    } else outcomes.set(n.id, parseOutcome(n.id, n.lines, problems));
  }
  for (const [bid, vs] of beats) if (vs[vs.length - 1].when !== null) problems.push({ field: bid, message: 'needs a last version without `if` (the default)' });
  const first = nodes.find((n) => n.kind === 'beat')?.id;
  if (!first) problems.push({ field: 'body', message: 'needs at least one # beat' });
  if (!parsed.success || !first) return { ok: false, problems };

  const f = parsed.data;
  const withIds = f.with ?? null;
  const payRange: [number, number] | null = f.pay != null ? (f.pay.split('-').map(Number).concat(f.pay.includes('-') ? [] : [Number(f.pay)]).slice(0, 2) as [number, number]) : null;
  const big = f.kind === 'big';
  /** A job, small or big: checks, cracks, ALARM and effects are allowed (the messages name missions, as they always have). */
  const mission = f.kind === 'mission' || big;
  /** The beats with a red check: each version of a beat counts once, since only one plays. */
  const reds = new Set<string>();
  const warnings: string[] = [];
  let after: Condition[] | null = null;
  if (f.after != null) {
    const c = parseCondition(f.after);
    if (!Array.isArray(c)) problems.push({ field: 'after', message: c.message });
    else after = c;
  }
  if (known.roster && withIds) for (const w of withIds) if (!known.roster.has(w)) problems.push({ field: 'with', message: `no character '${w}'` });
  if (known.places && !known.places.has(f.starts)) problems.push({ field: 'starts', message: `no place '${f.starts}' on the map` });
  // A desk job (comms spec §3): one of a contact's own jobs, played at a place on the map.
  if (f.comms != null) {
    if (f.kind !== 'mission' || ownedBy({ with: f.with ?? null }) === null) problems.push({ field: 'comms', message: "comms: goes only on a contact's own job (kind: mission, one contact in with)" });
    if (known.places && !known.places.has(f.comms)) problems.push({ field: 'comms', message: `no place '${f.comms}' on the map` });
  }

  for (const b of [...beats.values()].flat()) {
    for (const v of b.views) if (v.contact !== 'any' && known.roster && !known.roster.has(v.contact)) problems.push({ field: b.id, message: `view ${v.contact}: no such character` });
    const face = b.stranger?.face;
    if (face && known.extras) {
      if ('id' in face && !known.extras.ids.has(face.id)) problems.push({ field: b.id, message: `face: no extra '${face.id}'` });
      if ('tag' in face && !known.extras.tags.has(face.tag)) problems.push({ field: b.id, message: `face: no extra tagged '${face.tag}'` });
    }
    const covered = mission || b.views.some((v) => v.contact === 'any' && v.when === null) || (withIds !== null && withIds.every((w) => b.views.some((v) => v.contact === w && v.when === null)));
    if (!covered) problems.push({ field: b.id, message: "needs a 'view any:' line, or a view for each contact in with" });
    for (const c of b.choices) {
      if (!outcomes.has(c.to)) problems.push({ field: b.id, message: `choice ${c.id} → '${c.to}': no ## outcome by that id` });
      if (c.fail !== null && !outcomes.has(c.fail)) problems.push({ field: b.id, message: `choice ${c.id} / '${c.fail}': no ## outcome by that id` });
      if (c.check && !mission) problems.push({ field: b.id, message: `choice ${c.id}: check goes only in a mission (kind: mission)` });
      if (c.crack && !mission) problems.push({ field: b.id, message: `choice ${c.id}: crack goes only in a mission (kind: mission)` });
      if (c.tags.some((x) => x.kind === 'alarm') && !mission) problems.push({ field: b.id, message: `choice ${c.id}: alarm goes only in a mission (kind: mission)` });
      if (c.check && c.crack) problems.push({ field: b.id, message: `choice ${c.id}: a choice cracks or checks, not both` });
      if ((c.check || c.crack) && c.fail === null) problems.push({ field: b.id, message: `choice ${c.id}: a ${c.crack ? 'crack' : 'check'} needs a fail outcome (→ <pass> / <fail>)` });
      if (!c.check && !c.crack && !c.gig && c.fail !== null) problems.push({ field: b.id, message: `choice ${c.id}: '/ ${c.fail}' is a fail outcome, which needs a check` });
      if (c.check?.red) reds.add(b.id);
      if (c.gig && !big) problems.push({ field: b.id, message: `choice ${c.id}: gig goes only in a big job (kind: big)` });
      if (c.gig && (c.close === null || c.fail === null)) problems.push({ field: b.id, message: `choice ${c.id}: a gig route needs three outcomes (→ <clean> / <close> / <failed>)` });
      if (!c.gig && c.close !== null) problems.push({ field: b.id, message: `choice ${c.id}: three outcomes go only on a gig route` });
      if (c.gig && (c.check || c.crack)) problems.push({ field: b.id, message: `choice ${c.id}: a route is a gig, not a check or a crack` });
      if (c.close !== null && !outcomes.has(c.close)) problems.push({ field: b.id, message: `choice ${c.id} / '${c.close}': no ## outcome by that id` });
    }
  }
  // Time conditions read a big job's night (big jobs spec §2).
  if (!mission && f.trust != null) problems.push({ field: 'trust', message: 'trust: goes only on a job (kind: mission or big)' });
  for (const k of ['client', 'target', 'take'] as const) if (!big && f[k] != null) problems.push({ field: k, message: `${k}: goes only in a big job (kind: big)` });
  if (!big && allConditions(beats).some((c) => c.kind === 'time')) problems.push({ field: 'body', message: 'time conditions go only in a big job (kind: big)' });
  if (reds.size > 1) warnings.push(`${reds.size} red checks: keep to one per job, at its peak`);
  // A temper names a draw, or a flag some choice sets (small jobs spec §1).
  const setFlags = new Set([...beats.values()].flat().flatMap((b) => b.choices.flatMap((c) => c.tags.flatMap((t) => (t.kind === 'set' ? [t.name] : [])))));
  for (const b of [...beats.values()].flat()) {
    const tf = b.stranger?.temper;
    if (tf && !draws.some((d) => d.name === tf) && !setFlags.has(tf)) problems.push({ field: b.id, message: `temper: '${tf}' isn't a draw or a flag set in this file` });
  }
  // A wait's missed-it path plays without a pick, so it writes no deal (arrangement mid-run review I1).
  const missedTargets = new Set([...outcomes.values()].flatMap((o) => (o.wait?.else ? [o.wait.else] : [])));
  for (const o of outcomes.values()) {
    const { arrangement, ...jobEffects } = o.effects;
    if (arrangement && missedTargets.has(o.id)) problems.push({ field: o.id, message: "arrangement: can't be reached by a wait's else (a deal is struck by a pick)" });
    if (!mission && Object.keys(jobEffects).length > 0) problems.push({ field: o.id, message: 'pay:, heat:, gives: and takes: go only in a mission (kind: mission)' });
    // The arrangement (spec 2026-10-20): a quest with one contact strikes that contact's deal.
    if (arrangement && (mission || ownedBy({ with: withIds }) === null)) problems.push({ field: o.id, message: 'arrangement: goes only in a quest with one contact (not a job)' });
    else if (!big && (o.effects.clue || o.effects.marks || o.effects.reveals)) problems.push({ field: o.id, message: 'clue:, marks: and reveals: go only in a big job (kind: big)' });
    if (o.effects.clue && big && !clues.has(o.effects.clue)) problems.push({ field: o.id, message: `clue: no clue '${o.effects.clue}' in # clues` });
    for (const m of [...(o.effects.marks ?? []), ...(o.effects.reveals ?? [])]) if (known.places && !known.places.has(m.place)) problems.push({ field: o.id, message: `no place '${m.place}' on the map` });
    if (o.to === 'back' && !big) problems.push({ field: o.id, message: "'→ back' (back to legwork) goes only in a big job" });
    if (typeof o.effects.deck === 'string' && known.decks && !known.decks.has(o.effects.deck)) problems.push({ field: o.id, message: `gives: no deck '${o.effects.deck}' in world/gear/decks.md` });
    if (o.to !== 'end' && o.to !== 'back' && !beats.has(o.to)) problems.push({ field: o.id, message: `→ '${o.to}': no # beat by that id` });
    const w = o.wait;
    if (!w) continue;
    if (w.at !== null && known.places && !known.places.has(w.at)) problems.push({ field: o.id, message: `wait: no place '${w.at}' on the map` });
    if (w.else !== null && !beats.has(w.else) && !outcomes.has(w.else)) problems.push({ field: o.id, message: `wait: else '${w.else}': no beat or outcome by that id` });
    if (w.else !== null && w.else === o.to) problems.push({ field: o.id, message: "wait: else can't be the beat it waits for" });
  }

  if (big) {
    if (f.tier !== '3' && f.tier !== '4') problems.push({ field: 'tier', message: 'a big job is tier 3 or 4 (Trusted or A Name)' });
    if (!f.go) problems.push({ field: 'go', message: 'a big job needs go: HH:MM (the hour it happens)' });
    if (!read) problems.push({ field: 'body', message: 'a big job needs a # read beat (read: with three [blanks])' });
    else {
      if (!beats.has(read.next)) problems.push({ field: read.beat, message: `→ '${read.next}': no # beat by that id` });
      for (const c of clues.values()) for (const w of c.words) if (c.false && read.answers.includes(w)) problems.push({ field: 'clues', message: `a false clue can't hold a right answer ('${w}')` });
      const given = new Set([...clues.values()].filter((c) => !c.false).flatMap((c) => c.words));
      for (const a of read.answers) if (a && !given.has(a)) warnings.push(`read: '${a}' comes from no clue`);
    }
    const marked = new Set([...outcomes.values()].flatMap((o) => [...(o.effects.marks ?? []), ...(o.effects.reveals ?? [])].map((m) => m.place)));
    for (const b of [...beats.values()].flat()) if (b.at && !marked.has(b.at)) warnings.push(`scene '${b.id}' at ${b.at}: no outcome marks or reveals it`);
    if (known.places) for (const b of [...beats.values()].flat()) if (b.at && !known.places.has(b.at)) problems.push({ field: b.id, message: `at: no place '${b.at}' on the map` });
  }

  // Every node reachable from the first beat, and every node able to reach an end.
  const next = (nid: string): string[] => {
    const vs = beats.get(nid);
    if (vs) return vs.flatMap((b) => b.choices.flatMap((c) => [c.to, ...(c.close ? [c.close] : []), ...(c.fail ? [c.fail] : [])])).filter((t) => outcomes.has(t));
    const o = outcomes.get(nid);
    if (!o) return [];
    const to = o.to !== 'end' && beats.has(o.to) ? [o.to] : [];
    // A missed deadline's path is a way on too.
    const missed = o.wait?.else && (beats.has(o.wait.else) || outcomes.has(o.wait.else)) ? [o.wait.else] : [];
    return [...to, ...missed];
  };
  // A big job's scenes start at their places and its approach at the read: they're roots too.
  const roots = [first, ...(big ? [...beats.values()].flat().filter((b) => b.at).map((b) => b.id) : []), ...(read && beats.has(read.next) ? [read.next] : [])];
  const reached = new Set<string>(roots);
  for (const queue = [...roots]; queue.length > 0; ) for (const t of next(queue.shift()!)) if (!reached.has(t) && reached.add(t)) queue.push(t);
  // Back to legwork ends a scene (and the ask) as `→ end` ends the job.
  const ends = new Set([...outcomes.values()].filter((o) => o.to === 'end' || o.to === 'back').map((o) => o.id));
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of nodes) if (!ends.has(n.id) && next(n.id).some((t) => ends.has(t))) grew = Boolean(ends.add(n.id));
  }
  for (const n of nodes) {
    // A big job's clues and read aren't beats or outcomes.
    if (!beats.has(n.id) && !outcomes.has(n.id)) continue;
    if (!reached.has(n.id)) problems.push({ field: n.id, message: 'nothing leads here from the first beat' });
    else if (!ends.has(n.id)) problems.push({ field: n.id, message: "no path from here reaches '→ end'" });
  }

  if (problems.length > 0) return { ok: false, problems };
  const timed = [...outcomes.values()].some((o) => o.wait?.by != null);
  return { ok: true, warnings, entry: { id, title: f.title, kind: big ? 'big' : mission ? 'mission' : 'quest', pay: payRange ? payRange[0] : null, tier: (f.tier != null ? Number(f.tier) : 1) as 1 | 2 | 3 | 4, payRange, minutes: f.minutes != null ? Number(f.minutes) : null, draws, art: f.art ?? null, with: withIds, starts: f.starts, after, pitch: f.pitch ?? null, timed, first, beats, outcomes, go: f.go ? parseHhmm(f.go) : null, stake: f.stake ? (f.stake.split('/').map((x) => Number(x.trim())) as [number, number]) : null, clues, read, brief: { client: f.client ?? null, target: f.target ?? null, take: f.take ?? null }, posts: f.posts ? (f.posts.split('-').map((t) => parseHhmm(t)!) as [number, number]) : null, commsAt: f.comms ?? null, trust: f.trust ? (f.trust.split('/').map((x) => Number(x.trim())) as [number, number]) : null } };
}

/** Every condition in a quest's beats: versions, needs, passive lines, check and crack modifiers, gig steps. */
function allConditions(beats: Map<string, Beat[]>): Condition[] {
  return [...beats.values()].flat().flatMap((b) => [
    ...(b.when ?? []),
    ...b.segments.flatMap((sg) => sg.when ?? []),
    ...b.choices.flatMap((c) => [
      ...c.tags.flatMap((t) => (t.kind === 'needs' ? t.all : [])),
      ...(c.check?.mods.flatMap((m) => m.when) ?? []),
      ...(c.crack?.mods.flatMap((m) => m.when) ?? []),
      ...(c.gig?.mods.flatMap((m) => m.when) ?? []),
    ]),
  ]);
}

/** A quest run, stored as story meta `quest.<player>.<id>` in the contact's room.db. */
export interface QuestRun {
  /** The beat it stands at; null once it has ended, or while it waits. */
  beat: string | null;
  /** Which version of that beat is playing (chosen when it played; never re-chosen mid-beat). */
  variant: number;
  /** What it waits for before its next beat plays (quest waits spec §3); null: not waiting. */
  wait: RunWait | null;
  picks: { beat: string; choice: string; roll?: Roll; crack?: CrackPick }[];
  flags: Record<string, string>;
  done: boolean;
  /** A job's draws (small jobs spec §1), made when it started; also in `flags`. */
  draws?: Record<string, string>;
  /** A job's drawn pay (what `pay: full` pays). */
  pay?: number;
  /** A job's ALARM, 0–3 (small jobs spec §3). */
  alarm?: number;
  /** The take the job's outcomes last set (full when none did), and whether one was blown: its tier at the end. */
  take?: 'full' | 'part' | 'none';
  blown?: boolean;
  /** The story day a job started on (its run key's `@day`), and the one it ended on. */
  day?: number;
  endDay?: number;
  /** A big job's own state (big jobs spec): the section, when it started, places marked and visited, clues found, the read and the gig. */
  big?: BigRun;
  /** The deck held when a job started (its debrief's "deck gained or lost"). */
  startDeck?: string | null;
  /** A blown ending waiting on the cover cards (plan ruling 5): the outcome, the row it will write, and that row's minutes. */
  pendingCover?: { outcome: string; text: string; pick?: { choice: string; line: string; roll?: Roll }; minutes: number } | null;
  /** A mission's changes to the kit (missions spec §1): folded with every other run's into sol, heat, deck and EDGE. */
  kit?: KitEvent[];
  /** A failed check waiting on REROLL or TAKE IT (missions spec §3); absent or null: none. */
  pending?: { beat: string; choice: string; stat: string; chance: number; rolls: number[] } | null;
  /** When it was last written (ms): the later run wins a flag two quests both set. */
  at: number;
  /** Each stranger's face in this run, name → extra id (stranger faces spec §5); absent: none drawn. */
  faces?: Record<string, string>;
}

/** A big job's run state (big jobs spec §1–§3). */
export interface BigRun {
  section: 'legwork' | 'read' | 'approach' | 'out';
  /** The story clock when it started (its night's go hour is read from it). */
  started: number;
  marks: { place: string; line: string }[];
  visited: string[];
  clues: string[];
  read?: { picks: [string, string, string]; level: 'full' | 'half' | 'wrong' };
  gig?: { choice: string; kind: 'hack' | 'slip' | 'papers'; tier: 'easy' | 'medium' | 'hard'; seed: number; result: 'clean' | 'close' | 'traced' | 'caught' | 'back' };
}

/** A crack pick (small jobs spec §4): the moves sent, how it ended, and the wrong words it cost. */
export interface CrackPick {
  moves: ({ word: string } | { bracket: number })[];
  state: 'granted' | 'locked';
  tries: number;
}

/** A run's wait, in story-clock minutes (spec §3): where it goes, from when, where, by when, else what. */
export interface RunWait {
  to: string;
  from: number;
  at: string | null;
  ready: boolean;
  by: number | null;
  else: string | null;
  next: string | null;
  /** Due only on comms (comms spec §3). */
  comms?: true;
}

/** The run's wait for an outcome picked at `pickClock`: `until` is the next HH:MM after the pick; `by` a time after `from`, or a span after the pick. */
export function startWait(o: Outcome, pickClock: number): RunWait {
  const w = o.wait!;
  const from = w.until !== null ? nextOccurrence(pickClock, w.until) : w.after !== null ? pickClock + w.after : pickClock;
  const by = w.by === null ? null : w.by.kind === 'time' ? nextOccurrence(from, w.by.minute) : pickClock + w.by.minutes;
  return { to: o.to, from, at: w.at, ready: w.ready, by, else: w.else, next: o.next, ...(w.comms ? { comms: true as const } : {}) };
}

/** Whether a parked run plays now (spec §3): past the deadline is missed, before anything else. */
export function waitDue(w: RunWait, o: { now: number; placeId: string | null; ready: boolean; comms?: boolean }): 'due' | 'missed' | 'wait' {
  if (w.by !== null && o.now > w.by) return 'missed';
  if (o.now < w.from) return 'wait';
  if (w.at !== null && w.at !== o.placeId) return 'wait';
  if (w.comms && !o.comms) return 'wait';
  if (w.ready && !o.ready) return 'wait';
  return 'due';
}

/** The panel's line for a wait: its `next`, else one made from its parts. */
export function waitLine(w: RunWait, placeName: (id: string) => string): string {
  if (w.next) return w.next;
  const parts = [w.at ? `At ${placeName(w.at)}` : null, w.comms ? 'on comms' : null, w.ready ? 'when you are ready' : `after ${hhmmOf(minuteOfDay(w.from))}`].filter(Boolean);
  return `${parts.join(', ')}.`;
}

/** The first version of beat `id` whose condition holds (the default last); null for no such beat. */
export function chooseVariant(q: QuestEntry, id: string, ctx: CondCtx): { beat: Beat; variant: number } | null {
  const vs = q.beats.get(id);
  if (!vs) return null;
  const variant = vs.findIndex((b) => holds(b.when, ctx));
  return variant < 0 ? null : { beat: vs[variant], variant };
}

/** Version `variant` of beat `id`. */
export function beatAt(q: QuestEntry, id: string, variant: number): Beat | undefined {
  return q.beats.get(id)?.[variant];
}

/** A checked pick's roll (missions spec §3): the odds it had, every roll in order (a reroll adds one), and how it landed. */
export interface Roll {
  stat: string;
  chance: number;
  rolls: number[];
  pass: boolean;
}

/** Minutes each pick of a job takes (small jobs spec §1): its own `minutes:`, else 20 / 30 / 45 / 60 by tier. */
export const stepMinutes = (q: Pick<QuestEntry, 'minutes' | 'tier'>): number => q.minutes ?? [20, 30, 45, 60][q.tier - 1];

export const questKey = (player: string, id: string) => `quest.${player}.${id}`;

const runWaitSchema = z.object({
  to: z.string(),
  from: z.number(),
  at: z.string().nullable(),
  ready: z.boolean(),
  by: z.number().nullable(),
  else: z.string().nullable(),
  next: z.string().nullable(),
  comms: z.literal(true).optional(),
});
const rollSchema = z.object({ stat: z.string(), chance: z.number(), rolls: z.array(z.number()), pass: z.boolean() });
const runSchema = z.object({
  beat: z.string().nullable(),
  variant: z.number().int().min(0).default(0),
  wait: runWaitSchema.nullable().default(null),
  picks: z.array(
    z.object({
      beat: z.string(),
      choice: z.string(),
      roll: rollSchema.optional(),
      crack: z.object({ moves: z.array(z.union([z.object({ word: z.string() }), z.object({ bracket: z.number().int() })])), state: z.enum(['granted', 'locked']), tries: z.number().int() }).optional(),
    }),
  ),
  flags: z.record(z.string(), z.string()),
  done: z.boolean(),
  draws: z.record(z.string(), z.string()).optional(),
  pay: z.number().optional(),
  alarm: z.number().int().min(0).max(3).optional(),
  take: z.enum(['full', 'part', 'none']).optional(),
  blown: z.boolean().optional(),
  day: z.number().int().optional(),
  endDay: z.number().int().optional(),
  startDeck: z.string().nullable().optional(),
  big: z
    .object({
      section: z.enum(['legwork', 'read', 'approach', 'out']),
      started: z.number(),
      marks: z.array(z.object({ place: z.string(), line: z.string() })),
      visited: z.array(z.string()),
      clues: z.array(z.string()),
      read: z.object({ picks: z.tuple([z.string(), z.string(), z.string()]), level: z.enum(['full', 'half', 'wrong']) }).optional(),
      gig: z
        .object({ choice: z.string(), kind: z.enum(['hack', 'slip', 'papers']), tier: z.enum(['easy', 'medium', 'hard']), seed: z.number(), result: z.enum(['clean', 'close', 'traced', 'caught', 'back']) })
        .optional(),
    })
    .optional(),
  pendingCover: z.object({ outcome: z.string(), text: z.string(), pick: z.object({ choice: z.string(), line: z.string(), roll: rollSchema.optional() }).optional(), minutes: z.number() }).nullable().optional(),
  at: z.number(),
  faces: z.record(z.string(), z.string()).optional(),
  kit: z
    .array(
      z.object({
        at: z.number(),
        sol: z.number().optional(),
        heat: z.number().optional(),
        district: z.string().optional(),
        deck: z.string().nullable().optional(),
        edge: z.literal(-1).optional(),
        rep: z.object({ district: z.string(), delta: z.number() }).optional(),
        cover: z.object({ id: z.enum(['burner', 'fall-guy']), delta: z.number() }).optional(),
      }),
    )
    .optional(),
  pending: z.object({ beat: z.string(), choice: z.string(), stat: z.string(), chance: z.number(), rolls: z.array(z.number()) }).nullable().optional(),
});

export function parseRun(v: string | null): QuestRun | null {
  if (v === null) return null;
  try {
    const r = runSchema.safeParse(JSON.parse(v));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** A quest run as the playthrough knows it: which quest, in whose room. */
export interface QuestStatus {
  id: string;
  contact: string;
  run: QuestRun;
}

/** Every flag the runs set; where two set the same flag, the later run's value. */
export function flagsOf(runs: { run: QuestRun }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { run } of [...runs].sort((a, b) => a.run.at - b.run.at)) Object.assign(out, run.flags);
  return out;
}

/** The quests that can start here now: at their place, with an allowed contact, after their condition, started nowhere. */
export function openQuests(book: QuestEntry[], o: { placeId: string | null; contact: string; started: QuestStatus[]; ctx: CondCtx }): QuestEntry[] {
  return book.filter(
    (q) => q.starts === o.placeId && (q.with === null || q.with.includes(o.contact)) && holds(q.after, o.ctx) && !o.started.some((s) => s.id === q.id),
  );
}

/** The beat's choices whose `needs` hold. */
export function shownChoices(beat: Beat, ctx: CondCtx): Choice[] {
  return beat.choices.filter((c) => c.tags.every((t) => t.kind !== 'needs' || holds(t.all, ctx)));
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The pick row's line for a card click: "Stall him till morning." → "You stall him till morning." */
export const pickLine = (line: string) => `You ${lowerFirst(line)}`;

/** The contact's `[quest]` block for the beat (spec §3): only this beat, only shown choices, only their view. */
export function questBlock(q: QuestEntry, beat: Beat, ctx: CondCtx, oneLine: (s: string) => string, shown = false): string {
  const choices = shownChoices(beat, ctx)
    .map((c) => lowerFirst(c.line).replace(/[.!?…]+$/, ''))
    .join('; ');
  const own = beat.views.filter((v) => v.contact === ctx.with);
  const plain = own.find((v) => v.when === null) ?? beat.views.find((v) => v.contact === 'any' && v.when === null);
  const gated = [...own, ...beat.views.filter((v) => v.contact === 'any')].filter((v) => v.when !== null && holds(v.when, ctx));
  const views = [plain, ...gated].filter((v): v is View => v !== undefined).map((v) => v.text).join(' ');
  const who = beat.stranger?.name ?? 'someone here';
  const knows = beat.stranger ? ` ${beat.stranger.name} knows only what is written above: give them no new facts, and they stay where they are, waiting.` : '';
  const tag = isJob(q) ? 'job' : 'quest';
  return (
    `[${tag} — ${q.title}. Where it stands: ${shown ? `the [${tag} — ${q.title}: …] line at the end of this message, which they have just read` : oneLine(beat.text)}\n` +
    ` The choices in front of them: ${choices}.\n` +
    ` What you think: ${views}\n` +
    ` Talk it through as yourself, and never choose for them. If they act a choice out — say it to ${who}, start doing it — it hasn't happened yet: nobody answers it or moves on it, and your reply stops at the moment before it lands. These are the only choices; don't offer other ways out.${knows} Don't guess at what comes after.]`
  );
}

/** Her block while the quest here waits (quest waits spec §3): what's coming, without the choices. */
export function questWaitBlock(title: string, line: string): string {
  return `[on your mind — ${title}: ${line} You know it's coming; let it colour the evening, but don't push it, and don't make it happen early.]`;
}

/** A quest row as the history gives it to her: a job's rows (they carry its run key) as [job] lines, so a job never reads as part of a quest. */
export function questRowText(row: { title: string; text: string; run?: string }, oneLine: (s: string) => string): string {
  return `[${row.run ? 'job' : 'quest'} — ${row.title}: ${oneLine(row.text.replace(/⟦([^⟧]+)⟧ /g, '($1) '))}]`;
}

/** The pick check's instructions (spec §3, exact). */
export const PICK_CHECK_SYSTEM =
  'You read one line a player just typed in a roleplay, while a choice is in front of them. Decide whether the line clearly acts out one of the choices or asks for it ("come back in the morning", "here, take it"). Chatter, questions, maybes and talk about a choice are not a choice. Answer with one JSON object and nothing else: {"pick":"<choice id>"} or {"pick":null}.';

/** How many of the scene's last lines the pick check reads, and how long its answer may be. */
export const PICK_RECENT_LINES = 4;
export const PICK_CHECK_MAX_TOKENS = 60;

export function pickCheckMessages(o: { beat: string; choices: Pick<Choice, 'id' | 'line'>[]; recent: string[]; line: string }): { role: 'system' | 'user'; content: string }[] {
  const user = [
    `Where it stands: ${o.beat}`,
    `The choices:\n${o.choices.map((c) => `${c.id}: ${c.line}`).join('\n')}`,
    o.recent.length > 0 ? `The scene's last lines:\n${o.recent.join('\n')}` : null,
    `The line: ${o.line}`,
  ]
    .filter((x): x is string => x !== null)
    .join('\n\n');
  return [
    { role: 'system', content: PICK_CHECK_SYSTEM },
    { role: 'user', content: user },
  ];
}

/** The pick check's answer: a shown choice id, or null for anything else. */
export function parsePick(text: string, shown: readonly string[]): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = (JSON.parse(body.slice(start, end + 1)) as { pick?: unknown }).pick;
    return typeof v === 'string' && shown.includes(v) ? v : null;
  } catch {
    return null;
  }
}

/** Studio's GET /api/quests: every quest file as written, with what the game would refuse it for; who and where a quest can name. */
export interface QuestListing {
  entries: { id: string; text: string; problems: QuestProblem[] }[];
  roster: { id: string; name: string; pronoun: string }[];
  places: string[];
  /** The extras library's tags and how many faces each (COPY FOR OPUS lists them). */
  tags: { tag: string; count: number }[];
  /** Missions (spec 2026-10-18 §4): every character with stats, for the odds row; absent: none. */
  players?: { id: string; name: string; stats: Stats; deck: string | null }[];
  /** The deck catalog (world/gear/decks.md); absent: none. */
  decks?: Deck[];
  /** The pictures in world/quests/art/ (quest art); absent: none. */
  art?: string[];
}

const opText = (op: '=' | '>=' | '<=') => (op === '>=' ? '≥' : op === '<=' ? '≤' : '=');
export const condText = (c: Condition): string => {
  switch (c.kind) {
    case 'flag':
      return `${c.name}${c.op}${c.value}`;
    case 'set':
      return c.name;
    case 'with':
      return `with=${c.contact}`;
    case 'band':
      return `${c.axis}${opText(c.op)}${c.band}`;
    case 'heat':
      return `heat${opText(c.op)}${c.value}`;
    case 'stat':
      return `${c.stat}${opText(c.op)}${c.value}`;
    case 'deck':
      return c.id ? `deck=${c.id}` : c.trait ? `deck:${c.trait}` : 'deck';
    case 'alarm':
      return `alarm${opText(c.op)}${c.value}`;
    case 'time':
      return `time${c.op === '<' || c.op === '>' ? c.op : opText(c.op)}${hhmmOf((c.minute + 360) % 1440)}`;
  }
};

/** A gig route as written: `gig hack medium · if read.2=right -1 "you know the gate"`. */
export const gigText = (g: GigTag): string => `gig ${g.gig} ${g.tier}${g.mods.map((m) => ` · if ${m.when.map(condText).join(' and ')} ${m.step > 0 ? '+1' : '-1'} "${m.label}"`).join('')}`;

/** A check as written: `check tech 45 grid · ember +15`. */
const modText = (m: Mod) => ` · if ${m.when.map(condText).join(' and ')} ${m.delta >= 0 ? '+' : ''}${m.delta} "${m.label}"`;
export const checkText = (c: Check): string => `check ${c.stat} ${c.base}${c.grid ? ' grid' : ''}${c.red ? ' red' : ''}${c.crew.map((x) => ` · ${x.contact} +${x.bonus}`).join('')}${c.mods.map(modText).join('')}`;

export const tagText = (t: Tag): string => {
  if (t.kind === 'set') return `set ${t.name}=${t.value}`;
  if (t.kind === 'clock') return `clock +${t.minutes % 60 === 0 ? `${t.minutes / 60}h` : `${t.minutes}m`}`;
  if (t.kind === 'check') return checkText(t.check);
  if (t.kind === 'alarm') return 'alarm +1';
  if (t.kind === 'crack') return `crack ${t.length}${t.ice ? ' ice' : ''}${t.mods.map(modText).join('')}`;
  if (t.kind === 'gig') return gigText(t);
  return `needs ${t.all.map(condText).join(' and ')}`;
};

/** Studio's outline: each beat, its choices, the outcome each leads to and the beat after it ('end' for the end). */
/** A wait as Studio's outline shows it: `until 06:00 · at <place> · by 12:00 → <else>`. */
export function waitText(w: Wait): string {
  const t = (m: number) => hhmmOf(m);
  const sp = (m: number) => (m % 60 === 0 ? `+${m / 60}h` : `+${m}m`);
  const parts = [
    w.until !== null ? `until ${t(w.until)}` : null,
    w.after !== null ? `after ${sp(w.after)}` : null,
    w.at ? `at ${w.at}` : null,
    w.ready ? 'ready' : null,
    w.by ? `by ${w.by.kind === 'time' ? t(w.by.minute) : sp(w.by.minutes)}` : null,
  ].filter((x): x is string => x !== null);
  return `${parts.join(' · ')}${w.else ? ` → ${w.else}` : ''}`;
}

export function questOutline(q: QuestEntry): { beat: string; choices: { id: string; line: string; to: string; next: string; tags: string[]; wait: string | null; waitNext: string | null; check: Check | null }[] }[] {
  return [...q.beats.values()].flat().map((b) => ({
    beat: `${b.id}${b.at ? ` at ${b.at}` : ''}${b.when ? ` if ${b.when.map(condText).join(' and ')}` : ''}`,
    choices: b.choices.map((c) => {
      const o = q.outcomes.get(c.to);
      return { id: c.id, line: c.line, to: c.to, next: o?.to ?? '?', tags: [...(c.check ? [checkText(c.check)] : []), ...(c.gig ? [gigText(c.gig)] : []), ...c.tags.map(tagText)], wait: o?.wait ? waitText(o.wait) : null, waitNext: o?.next ?? null, check: c.check };
    }),
  }));
}

/** How many quests name `id` in `with` (Studio's character cards). */
export function questCounts(book: QuestEntry[], id: string): number {
  return book.filter((q) => q.with?.includes(id)).length;
}

/** The design and writing rules COPY FOR OPUS states (spec §1, §5). */
export const QUEST_DRAFT_RULES = [
  'The contact never chooses for the player: the views argue, the cards decide.',
  'No spoilers: a view knows only its own beat, never what comes after.',
  "Branches rejoin: split, then come back to a shared beat; flags carry the difference ('set ledger=burned').",
  'Nothing is written for the player beyond the choice line: beats and outcomes describe the world and other people, never what the player feels or says.',
  'Second person, present tense, word for word as it will be shown; short paragraphs; *actions in asterisks*; Lowlight\'s own words (grid, glass, chrome, the Ribbon), no cartoon cyberpunk.',
  'A view line for each contact named in with, in the second person, from their side (what they think, what they want, what they would never say in front of a stranger); a view any: line for anyone else.',
  'A wait is where the evening happens: use one between beats that shouldn\'t be back to back.',
  'A deadline needs a missed-it path that\'s a real story, not a punishment.',
  "A next: line says what to do, never what happens if you don't.",
  'A stranger who could be anyone of a kind (a Sentinel, a dock hand) takes face: any <tag>; one the story knows by name and comes back to may take a fixed face.',
  "A pitch: line is the hook a player reads before START: the situation in one or two sentences, no choices, no outcomes.",
  'A missed-it path plays wherever the player is with the contact: write it as news reaching them (a message, a call, someone passing it on), not as a scene at the place they missed.',
  "A choice line starts with a verb, since the row shows it as 'You <line>' ('Go back to the Tilt.', never 'Back to the Tilt.').",
  'A job may set posts: HH:MM-HH:MM (when it lists; may cross midnight) and trust: W / L (CLEAN raises trust with the contact by W, BLOWN lowers it by L; rep then doesn\'t move).',
  'A quest with one contact may end in arrangement: chair <retainer 50–500> / <nights 1–2> (that contact sits the player\'s chair).',
  'A big job may set client:, target: and take: (one line each): the gig screens show them when a route opens.',
  'A big job (kind: big, tier 3 or 4, go: HH:MM, stake: 15 / 25): its first beat is the ask, whose outcome marks: the first places (place "why you\'d go") and ends → back.',
  'Legwork scenes are beats headed # <id> at <place>: arriving there plays them; their outcomes give clue: <id>, may reveals: more places, and end → back.',
  "A # clues list: - id: what was found · words: one, two (· false for a misleading clue; its words are never right answers).",
  "A # read beat: read: a sentence with three [blanks] (each the right words, given by some clue), wrong: decoy words, → the approach's first beat. Beats after it can read read=full|half|wrong and read.1|2|3=right.",
  'The approach ends in 2–3 routes: - id: The way in. → clean / close / failed [gig <hack|slip|papers> <easy|medium|hard> · if <condition> -1 "label"]. A failed gig never ends the job: it leads to a harder way out.',
  "Never write the hour the player is in (a job can be played at any time): write {time} for now, or {time +40m} / {time +2h} for later tonight; the game shows the story clock's HH:MM.",
];

/** COPY FOR OPUS: the author's outline → a quest file in the game's format. */
export function questDraftPrompt(o: { outline: string; roster: { id: string; name: string; pronoun: string }[]; places: string[]; tags?: { tag: string; count: number }[] }): string {
  return [
    "Write a quest line for Lowlight, a roleplaying cyberpunk city game, from the outline below. Answer with the file only, in a markdown code block.",
    `The outline:\n${o.outline.trim()}`,
    `Rules:\n${QUEST_DRAFT_RULES.map((r) => `- ${r}`).join('\n')}`,
    [
      'The format:',
      '---',
      'title: <title>',
      'with: [<contact ids>]   # leave out for anyone',
      'starts: <place id>',
      'after: null             # or a condition, e.g. "ledger=burned"',
      "pitch: <one line for the QUEST list: what it's about, never how it goes>",
      '---',
      '',
      '# <beat-id>',
      '# <beat-id> if <condition>   # a version of a beat for those who did something earlier; the last version has no if',
      'stranger: <Name> — <how they speak>   # optional, the first line',
      'face: <extra id> | face: any <tag>   # optional, right after stranger: (a portrait from the extras library)',
      '<the beat, word for word>',
      '',
      'view <contact-id>: <what they think>',
      'view <contact-id> if trust=high: <what they would only say to someone they trust>',
      'view any: <for anyone else>',
      '',
      '- <choice-id>: <The choice.> → <outcome-id> [set flag=value, needs trust≥mid, clock +6h]',
      '',
      '## <outcome-id>',
      '<what happens, word for word>',
      '→ <next beat-id>   # or → end',
      'wait: until 06:00 · at <place id> · by 12:00 else <beat or outcome id>   # optional: the next beat waits (until HH:MM, after +6h, at <place>, ready; by … else … is a deadline)',
      "next: <what to do, never what happens if you don't>   # the panel's line while it waits",
      '',
      'Ids are lowercase words joined by dashes. Two to four choices per beat. Conditions: flag=value, flag!=value, flag, trust/warmth with =, ≥ or ≤ and low/mid/high, with=<contact id>; joined with "and".',
    ].join('\n'),
    `Contacts (id — name (pronoun)):\n${o.roster.map((c) => `${c.id} — ${c.name} (${c.pronoun})`).join('\n')}`,
    `Places: ${o.places.join(', ')}`,
    ...(o.tags && o.tags.length > 0 ? [`Extras' tags for face: any <tag> (faces each): ${o.tags.map((t) => `${t.tag} (${t.count})`).join(', ')}`] : []),
  ].join('\n\n');
}

/** A quest's time token (small jobs feedback 2026-10-19): `{time}` or `{time +40m}` / `{time +2h}`, the story clock as HH:MM. */
const TIME_TOKEN = /\{time(?:\s*\+\s*(\d+)\s*(m|h))?\}/g;

/** `text` with its time tokens read at story-clock minute `clock`, so a job says the hour it's played at. */
export function fillTimes(text: string, clock: number): string {
  return text.replace(TIME_TOKEN, (_t, n?: string, unit?: string) => hhmmOf(minuteOfDay(clock + (n ? Number(n) * (unit === 'h' ? 60 : 1) : 0))));
}

/**
 * Whether a job's file reads `flag` anywhere (crew spec §2): in a beat variant, a choice's needs, a check's
 * modifier or a passive line. Crew prep's default bonuses apply only to jobs that don't.
 */
export function mentionsFlag(q: QuestEntry, flag: string): boolean {
  const seen = new Set<object>();
  const walk = (x: unknown): boolean => {
    if (!x || typeof x !== 'object' || seen.has(x)) return false;
    seen.add(x);
    if (Array.isArray(x)) return x.some(walk);
    if (x instanceof Map) return [...x.values()].some(walk);
    const o = x as Record<string, unknown>;
    // A condition: `flag` (with an op) or `set` (no value; a `[set …]` tag carries one and writes, not reads).
    if ((o.kind === 'flag' && 'op' in o && o.name === flag) || (o.kind === 'set' && !('value' in o) && o.name === flag)) return true;
    return Object.values(o).some(walk);
  };
  return walk(q);
}
