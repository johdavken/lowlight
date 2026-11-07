/**
 * Quest lines (spec 2026-10-16 quest lines): a written story with branches, played in the room as
 * word-for-word beats with choice cards, which the player talks over with their contact first. Each is
 * a file, `world/quests/<id>.md`: front matter, then `# beat` and `## outcome` sections. Pure: the game
 * server, Studio and their tests share these rules.
 */
import { z } from 'zod';
import { LORE_ID, LORE_ID_MAX, LORE_TITLE_MAX, oneLine, splitFrontMatter, zodProblems, type LoreProblem } from './lore';
import { offTemplate } from './job-template';
import type { Band } from './standing';
import { hhmmOf, minuteOfDay, nextOccurrence, parseHhmm } from './clock';
import type { Deck } from './gear';
import type { Check, KitEvent, Mod } from './mission';
import type { CostId } from './costs';
import type { DiceResult, Effect, NextRoll, Position } from './dice';
import type { Call, Setup } from './hand';
import { DEFAULT_STATS, STAT_KEYS, type StatKey, type Stats } from './stats';
import { GUEST_NOTE_MAX } from './contract';
import { GRADES, HIREABLE, normalSpec, SPECIALTIES, type Grade, type Specialty } from './crew-book';

export const QUEST_TEXT_MAX = 1800;
/** A `hire-pitch:` line: what fits the HIRE card beside the stock pitches. */
export const HIRE_PITCH_MAX = 120;
/** What a job's ending gives (crew spec §5): `sex` when its text says he or she, `pitch` when it wrote one. */
export type JobHire = { spec: Specialty; grade: Grade; sex?: 'man' | 'woman'; pitch?: string };
export const QUEST_VIEW_MAX = 600;
export const QUEST_CHOICE_MAX = 80;
export const QUEST_CHOICES_MIN = 2;
export const QUEST_CHOICES_MAX = 4;
export const QUEST_NODES_MAX = 40;
/** A contract holds its offer, reports, night and fallout in one file. */
export const CONTRACT_NODES_MAX = 90;

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
  | { kind: 'alarm'; op: '=' | '>=' | '<='; value: number };

export type Tag = { kind: 'set'; name: string; value: string } | { kind: 'needs'; all: Condition[] } | { kind: 'clock'; minutes: number } | { kind: 'check'; check: Check } | { kind: 'alarm'; delta: 1 } | { kind: 'effect'; effect: 'big' | 'small' } | CrackTag;

/** Small jobs spec §4: crack a terminal of words this long instead of rolling; modifiers add or take tries. */
export interface CrackTag {
  kind: 'crack';
  length: 5 | 6 | 7 | 8 | 9;
  mods: Mod[];
  /** A corporate terminal (deck skins spec §3): it shows the CORP look whatever deck you hold (`ice` in older files). */
  corp?: true;
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
  /** This version plays only while these hold (beat variants); null: the default, always last. */
  when: Condition[] | null;
  /** Someone the beat brings in, voiced by the contact until the quest moves on; `face`: an extra, or any with a tag (stranger faces spec §4). */
  stranger: { name: string; voice: string; face: { id: string } | { tag: string } | null; temper?: string | null } | null;
  /** Guest crew spec §3b: `song: <title>`, a pack's song that takes over the music while the run is on this beat. */
  song?: string;
  /** `song: <title> if <condition>`: it plays only while the condition holds. */
  songWhen?: Condition[];
  /** `room: <scene id>`: the picture while the run is on this beat. View only: the contact stays where they are. */
  room?: string;
  /** `comms: yes`: the contact is on the line for this beat, with no `room:` to bring it. */
  onComms?: true;
  /** Words marked `{{ }}` in the text: the contact on the line. They read as plain text everywhere but the JOB column. */
  onLine?: string[];
  text: string;
  /** The beat's text lines in order, passive lines (small jobs spec §3) with their condition and label; plain lines with none. */
  segments: { when: Condition[] | null; label: string | null; text: string }[];
  views: View[];
  choices: Choice[];
}

export interface Outcome {
  id: string;
  text: string;
  /** The next beat, the quest's end, or (a contract's report) back to the wait. */
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
  /** Pressing on (spec 2026-10-29 §2): `pay: +N` adds N to the push's pot; `lost` is a lost push. Only in a push beat's outcomes. */
  bonus?: number;
  lost?: true;
  /** The arrangement (spec 2026-10-20): this outcome strikes the contact's deal to sit the player's chair; a cut of each job (Tier 2 spec 2026-11-01), or an old file's nightly retainer. */
  arrangement?: { cut: number; nights: 1 | 2 | 3 } | { retainer: number; nights: 1 | 2 };
  /** Crew spec §5: `gives: recruit <specialty> <grade> [man|woman]`, a free hire card at the job's place until the next 06:00; `hire-pitch:` is what they say on it. */
  recruit?: JobHire;
  /** `gives: outfit <character> <outfit>`: that character's outfit, locked until an ending gives it, is theirs to wear in this playthrough. */
  outfit?: { who: string; name: string };
  /** Guest crew spec §3: `guest-note: <text>`, what a brought guest knows now, written to their journal. */
  guestNote?: string;
  /** `settles: <contact id>: <text>`: what this ending settles for that contact, a line in every turn of theirs while the ending stands. */
  settles?: Settled[];
}

/** One `settles:` line: who it's for and what's settled. */
export interface Settled {
  who: string;
  text: string;
}

/** A `settles:` line's text, at most. */
export const SETTLES_MAX = 300;

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
/** The JOBS list's one line on what a quest is about. */
export const QUEST_PITCH_MAX = 200;
/** A job's `posted-by:`, who it came from as far as the player knows. */
export const QUEST_POSTED_BY_MAX = 80;
/** A job's `brief:`, where it is and what the work is. */
export const QUEST_BRIEF_MAX = 240;

export interface QuestEntry {
  id: string;
  title: string;
  /** A mission (spec 2026-10-18): checked choices, effects, and the contact only at the start and the end. */
  kind: 'quest' | 'mission' | 'contract';
  /** A contract's arc (tier 3 contracts spec §2): the two waits in minutes, its groundwork, when it's offered, its rumor. */
  contract?: { night: number; fallout: number; pieces: { id: string; spec: Specialty; line: string }[]; postsAt: number; rumor: string; /** The lead you must hold before it's listed (world/leads id). */ lead?: string; /** Who comes as a guest (guest crew spec §2): a contact and a grade. */ guest?: { id: string; grade: Grade } };
  /** What the JOBS list says a mission pays (null: not said). */
  pay: number | null;
  /** Small jobs spec §1: the rep tier needed in the job's district (default 1). */
  tier: 1 | 2 | 3 | 4;
  /** The job's own TAKE clock size (`take-size:`, balancing 2026-11-01); absent: the tier's (takeSize). */
  takeSize?: number;
  /** What the job's take physically is (`loot:`, roll lifecycle spec): what the GM may lose some of. */
  loot?: string;
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
  /** The map place id it starts at; '' for a spring file (it posts where the recruit was hired). */
  starts: string;
  /** A kind of goods its clean or messy end drops (crew goods spec §6). */
  drops?: string;
  after: Condition[] | null;
  /** One line for the JOBS list on what it's about (null: none). */
  pitch: string | null;
  /** Jobs: who it came from, as far as the player knows (`posted-by:`). */
  postedBy?: string;
  /** Jobs: where it is and what the work is (`brief:`), never how it goes. */
  brief?: string;
  /** Jobs: contacts who heard about it where they work (`known-by:`), though it isn't theirs. */
  knownBy?: string[];
  /** Some wait in it has a deadline: it can be missed. */
  timed: boolean;
  /** The first beat's id. */
  first: string;
  /** Each beat's versions in file order; the last is the default (`when: null`). */
  beats: Map<string, Beat[]>;
  outcomes: Map<string, Outcome>;
  /** A desk job (comms spec §3): the place it's played at, on comms (null: not a desk job). */
  commsAt: string | null;
  /** Jobs: the minutes of day it lists between (null: always). */
  posts: [number, number] | null;
  /** Jobs: trust gained on CLEAN / lost on BLOWN with the contact you ran it with (null: rep is the stake). */
  trust: [number, number] | null;
  /** Jobs: a story that happens once (`once: true`): it never posts again in the playthrough after it ended. */
  once?: true;
  /** Jobs: `for: <character id>`, the one player it's for. It's theirs, so it's never drawn: it lists whenever it holds. */
  for?: string;
  /** Jobs: `bars: <deck id>`, a deck that stays home: with it on you, you go in with none. */
  bars?: string;
  /** A rescue (crew spec §5): no `starts:`, `{recruit}` in its text, posted by SPRING THEM. */
  spring?: true;
  /** Rebuilt to its tier's template (tier template spec §4): the parse warns where it's off, and a no-roll pick fills no TAKE. */
  template?: true;
}

/** A job: a small one (mission) or a contract. */
export const isJob = (q: Pick<QuestEntry, 'kind'>) => q.kind === 'mission' || q.kind === 'contract';

/** Whether a job's `posts:` window holds at story-clock minute `clock` (null: always). */
export function postsOpen(posts: [number, number] | null, clock: number): boolean {
  if (!posts) return true;
  const [from, to] = posts;
  const m = minuteOfDay(clock);
  return from <= to ? m >= from && m < to : m >= from || m < to;
}

/** A contact's own job (Intake board spec §3): the one contact its `with:` names, else null. */
export const ownedBy = (q: Pick<QuestEntry, 'with'>): string | null => (q.with?.length === 1 ? q.with[0] : null);

/** A push beat's id (pressing on spec §2): push-1 to push-3, played in order after the take. */
export const PUSH_ID = /^push-[1-3]$/;
export const pushBeatId = (n: number) => `push-${n}`;

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
}

/** A flag name or value; a dot is allowed for a contract's own flags (`angle.boat=yes`). */
const FLAG = /^[a-z0-9_.-]+$/;
const BANDS: readonly Band[] = ['low', 'mid', 'high'];

/** A condition's `and`-joined parts; or a problem. */
export function parseCondition(s: string): Condition[] | QuestProblem {
  const out: Condition[] = [];
  for (const raw of s.trim().split(/\s+and\s+/)) {
    const part = raw.trim();
    let m: RegExpExecArray | null;
    const op = (o: string): '=' | '>=' | '<=' => (o === '≥' || o === '>=' ? '>=' : o === '≤' || o === '<=' ? '<=' : '=');
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
  starts: oneLine(LORE_ID_MAX).nullish(),
  after: oneLine(200).nullish(),
  pitch: oneLine(QUEST_PITCH_MAX).nullish(),
  'posted-by': oneLine(QUEST_POSTED_BY_MAX).nullish(),
  brief: oneLine(QUEST_BRIEF_MAX).nullish(),
  'known-by': z.array(oneLine(LORE_ID_MAX)).min(1).nullish(),
  /** A kind of goods its clean or messy end drops (crew goods spec §6). */
  drops: z.enum(['data', 'pharma', 'parts', 'luxuries', 'contraband']).nullish(),
  kind: z.enum(['quest', 'mission', 'contract']).nullish(),
  /** Contracts: the waits to the night and to the fallout, like +72h. */
  night: z.string().regex(/^\+\d+(h|m)$/, 'a wait, like +72h').nullish(),
  fallout: z.string().regex(/^\+\d+(h|m)$/, 'a wait, like +48h').nullish(),
  /** Contracts: three pieces of groundwork, `<piece> <specialty>`, comma-separated. */
  groundwork: oneLine(200).nullish(),
  /** Contracts: the rep in the district that offers it, and the line RUMORS shows. */
  'posts-at': z.string().regex(/^\d{1,3}$/, 'posts-at is a rep, like 45').nullish(),
  rumor: oneLine(QUEST_PITCH_MAX).nullish(),
  /** Contracts: the lead that opens it, the only way in; with none, rep alone does. */
  lead: oneLine(LORE_ID_MAX).nullish(),
  /** Contracts: the lead's giver as a foil crew card, `<contact id> <grade>`, like ember VET. */
  guest: oneLine(LORE_ID_MAX + 8).nullish(),
  /** A desk job (comms spec §3): the map place it's played at, on comms. */
  comms: oneLine(LORE_ID_MAX).nullish(),
  /** Jobs: when it lists, HH:MM-HH:MM (may cross midnight; the end is exclusive). */
  posts: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/, 'posts is a window, HH:MM-HH:MM').nullish(),
  /** Jobs: trust gained on CLEAN / lost on BLOWN with the contact you ran it with, like 1 / 1 (rep then doesn't move). */
  trust: z.string().regex(/^[0-3]\s*\/\s*[0-3]$/, 'trust is gained / lost, 0–3 each, like 1 / 1').nullish(),
  once: z.boolean().nullish(),
  for: oneLine(LORE_ID_MAX).nullish(),
  bars: oneLine(LORE_ID_MAX).nullish(),
  spring: z.boolean().nullish(),
  template: z.boolean().nullish(),
  /** The panel's picture (spec 2026-10-19 quest art): a file in world/quests/art/. */
  art: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:png|webp|jpg)$/, 'a file name in world/quests/art/: lowercase letters, digits and dashes, then .png, .webp or .jpg').nullish(),
  pay: z
    .string()
    .regex(/^\d+(?:-\d+)?$/, 'must be a whole number of sol, or a range like 350-450')
    .refine((v) => !v.includes('-') || Number(v.split('-')[0]) <= Number(v.split('-')[1]), 'a range runs low to high')
    .nullish(),
  tier: z.string().regex(/^[1-4]$/, 'tier is 1, 2, 3 or 4').nullish(),
  /** A job's own TAKE clock size, 2–8 (balancing 2026-11-01); absent: the tier's. */
  'take-size': z.string().regex(/^[2-8]$/, 'take-size is 2 to 8').nullish(),
  /** What the take physically is, for the GM (roll lifecycle spec); a warning past LOOT_MAX. */
  loot: z.string().nullish(),
  minutes: z.string().regex(/^\d{1,3}$/, 'minutes is a whole number').nullish(),
});

const idOk = (id: string) => LORE_ID.test(id) && id.length <= LORE_ID_MAX;
const VIEW = /^view ([a-z0-9]+(?:-[a-z0-9]+)*)(?: if (.+?))?:\s*(.+)$/;
const CHOICE = /^- ([^:\s]+): (.+?) → (\S+)(?: \/ (\S+))?(?: \[(.+)\])?$/;
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

function parseTags(raw: string | undefined): Tag[] | string {
  if (!raw) return [];
  const tags: Tag[] = [];
  for (const t of raw.split(',').map((s) => s.trim())) {
    let m: RegExpExecArray | null;
    if ((m = /^set ([^\s=]+)=(\S+)$/.exec(t)) && FLAG.test(m[1]) && FLAG.test(m[2])) tags.push({ kind: 'set', name: m[1], value: m[2] });
    else if ((m = /^clock \+(\d+)(h|m)$/.exec(t))) tags.push({ kind: 'clock', minutes: Number(m[1]) * (m[2] === 'h' ? 60 : 1) });
    else if ((m = /^check (\S+) (\d+)( grid)?( red)?( angle)?((?: · .+)?)$/.exec(t))) {
      const stat = m[1];
      if (!(STAT_KEYS as readonly string[]).includes(stat) || stat === 'edge') return `check: '${stat}' isn't a stat (body, reflex, tech, cool, wits)`;
      const base = Number(m[2]);
      if (base < 1 || base > 99) return `check: the base is a percent, 1–99 (this is ${base})`;
      const extras = parseExtras(m[6]);
      if (typeof extras === 'string') return `check: ${extras}`;
      tags.push({ kind: 'check', check: { stat: stat as Check['stat'], base, grid: m[3] !== undefined, crew: extras.crew, red: m[4] !== undefined, mods: extras.mods, ...(m[5] ? { angle: true as const } : {}) } });
    } else if (t === 'alarm +1') {
      tags.push({ kind: 'alarm', delta: 1 });
    } else if (t === 'big' || t === 'small') {
      tags.push({ kind: 'effect', effect: t });
    } else if ((m = /^crack (\d+)( corp| ice)?((?: · .+)?)$/.exec(t))) {
      const length = Number(m[1]);
      if (length < 5 || length > 9) return `crack: words are 5–9 letters (this is ${length})`;
      const extras = parseExtras(m[3]);
      if (typeof extras === 'string') return `crack: ${extras}`;
      if (extras.crew.length) return 'crack: crew bonuses go on checks; use · if with=<id> +N "label"';
      tags.push({ kind: 'crack', length: length as CrackTag['length'], mods: extras.mods, ...(m[2] ? { corp: true as const } : {}) });
    } else if ((m = /^needs (.+)$/.exec(t))) {
      const c = parseCondition(m[1]);
      if (!Array.isArray(c)) return c.message;
      tags.push({ kind: 'needs', all: c });
    } else return `can't read the tag '${t}' (set flag=value, needs <condition>, clock +6h / +30m, check <stat> <base> [grid] [red] [· <contact> +N] [· if <condition> +N "label"], crack <5–9> [corp], alarm +1)`;
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

function parseBeat(id: string, when: Condition[] | null, lines: string[], problems: QuestProblem[]): Beat {
  const p = (message: string) => problems.push({ field: id, message });
  const text: string[] = [];
  const views: View[] = [];
  const choices: Choice[] = [];
  const segments: Beat['segments'] = [];
  let stranger: Beat['stranger'] = null;
  let song: string | undefined;
  let songWhen: Condition[] | undefined;
  let room: string | undefined;
  let onComms = false;
  const onLine: string[] = [];
  const spoken = (l: string) => l.replace(/\{\{(.+?)\}\}/g, (_, q: string) => (onLine.push(q), q));
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
    const roomLine = /^room:\s*(\S+)$/.exec(t);
    if (roomLine) {
      room = roomLine[1];
      continue;
    }
    if (/^comms:\s*yes$/.test(t)) {
      onComms = true;
      continue;
    }
    const sung = /^song:\s*(.+?)(?:\s+if\s+(.+))?$/.exec(t);
    if (sung) {
      song = sung[1];
      const when = sung[2] ? parseCondition(sung[2]) : undefined;
      if (when && !Array.isArray(when)) p(`song: ${when.message}`);
      else songWhen = when;
      continue;
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
      const tags = parseTags(m[5]);
      if (typeof tags === 'string') p(`choice ${m[1]}: ${tags}`);
      if (!idOk(m[1])) p(`'${m[1]}' isn't a choice id: lowercase letters, digits and dashes`);
      if (m[2].length > QUEST_CHOICE_MAX) p(`choice ${m[1]}: at most ${QUEST_CHOICE_MAX} characters (this is ${m[2].length})`);
      const all = typeof tags === 'string' ? [] : tags;
      const check = all.find((x): x is Extract<Tag, { kind: 'check' }> => x.kind === 'check')?.check ?? null;
      const crack = all.find((x): x is CrackTag => x.kind === 'crack') ?? null;
      choices.push({ id: m[1], line: m[2], to: m[3], fail: m[4] ?? null, check, crack, tags: all.filter((x) => x.kind !== 'check' && x.kind !== 'crack') });
    } else if (t.startsWith('- ') && t.includes('→')) {
      p(`can't read the choice '${t}' (- id: The line. → outcome [tags])`);
    } else if ((m = /^\[(.+?)\]\s+(.+)$/.exec(t)) && passive(m[1])) {
      const pc = passive(m[1])!;
      if ('message' in pc) p(`passive line: ${pc.message}`);
      else segments.push({ when: pc.when, label: pc.label, text: spoken(m[2]) });
    } else {
      const said = spoken(line);
      text.push(said);
      segments.push({ when: null, label: null, text: said });
    }
  }
  const body = tidy(text);
  if (body === '') p('needs some text');
  if (body.length > QUEST_TEXT_MAX) p(`at most ${QUEST_TEXT_MAX} characters (this is ${body.length})`);
  if (choices.length < QUEST_CHOICES_MIN || choices.length > QUEST_CHOICES_MAX) p(`needs ${QUEST_CHOICES_MIN}–${QUEST_CHOICES_MAX} choices (this has ${choices.length})`);
  const seen = new Set<string>();
  for (const c of choices) if (seen.has(c.id) || !seen.add(c.id)) p(`choice ${c.id} appears twice`);
  return { id, when, stranger, ...(song ? { song, ...(songWhen ? { songWhen } : {}) } : {}), ...(room ? { room } : {}), ...(onComms ? { onComms: true as const } : {}), ...(onLine.length ? { onLine } : {}), text: body, segments, views, choices };
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
  let hirePitch: string | null = null;
  while (kept.length > 0) {
    const t = kept[kept.length - 1].trim();
    let e: RegExpExecArray | null;
    if ((e = /^pay:\s*(\d+)$/.exec(t)) && effects.pay === undefined && effects.payKind === undefined) effects.pay = Number(e[1]);
    else if ((e = /^pay:\s*(full|half)$/.exec(t)) && effects.pay === undefined && effects.payKind === undefined) effects.payKind = e[1] as 'full' | 'half';
    else if ((e = /^take:\s*(full|part|none)$/.exec(t)) && effects.take === undefined) effects.take = e[1] as 'full' | 'part' | 'none';
    else if (t === 'blown' && effects.blown === undefined) effects.blown = true;
    else if ((e = /^pay:\s*\+(\d+)$/.exec(t)) && effects.bonus === undefined) effects.bonus = Number(e[1]);
    else if (t === 'lost' && effects.lost === undefined) effects.lost = true;
    else if ((e = /^heat:\s*([+-]\d+)$/.exec(t)) && effects.heat === undefined) effects.heat = Number(e[1]);
    else if ((e = /^gives:\s*deck\s+([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(t)) && effects.deck === undefined) effects.deck = e[1];
    else if ((e = /^gives:\s*outfit\s+([a-z0-9]+(?:-[a-z0-9]+)*)\s+([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(t)) && effects.outfit === undefined) effects.outfit = { who: e[1], name: e[2] };
    else if ((e = /^guest-note:\s*(.+)$/.exec(t)) && effects.guestNote === undefined) effects.guestNote = e[1];
    else if ((e = /^settles:\s*([a-z0-9]+(?:-[a-z0-9]+)*):\s*(.+)$/.exec(t))) (effects.settles ??= []).unshift({ who: e[1], text: e[2] });
    else if (/^takes:\s*deck$/.test(t) && effects.deck === undefined) effects.deck = null;
    else if ((e = /^hire-pitch:\s*(.+)$/.exec(t)) && hirePitch === null) hirePitch = e[1];
    else if ((e = /^gives:\s*recruit\s+([a-z]+)\s+([a-z]+)(?:\s+(man|woman))?$/i.exec(t)) && effects.recruit === undefined && (HIREABLE as string[]).includes(normalSpec(e[1].toLowerCase())) && GRADES.includes(e[2].toUpperCase() as (typeof GRADES)[number]))
      effects.recruit = { spec: normalSpec(e[1].toLowerCase()) as Specialty, grade: GRADES.indexOf(e[2].toUpperCase() as (typeof GRADES)[number]) as Grade, ...(e[3] ? { sex: e[3].toLowerCase() as 'man' | 'woman' } : {}) };
    else if ((e = /^arrangement:\s*chair\s+(\d+)\s*\/\s*(\d+)$/.exec(t)) && effects.arrangement === undefined) {
      const retainer = Number(e[1]);
      const nights = Number(e[2]);
      if (retainer < 50 || retainer > 500) p('arrangement: the retainer is 50–500 sol');
      if (nights !== 1 && nights !== 2) p('arrangement: nights is 1 or 2');
      effects.arrangement = { retainer, nights: nights === 2 ? 2 : 1 };
    }
    else if ((e = /^arrangement:\s*chair-cut\s+(\d+)\s*\/\s*(\d+)$/.exec(t)) && effects.arrangement === undefined) {
      const cut = Number(e[1]);
      const nights = Number(e[2]);
      if (cut < 5 || cut > 50) p('arrangement: the cut is 5–50 %');
      if (nights < 1 || nights > 3) p('arrangement: nights is 1 to 3');
      effects.arrangement = { cut, nights: nights === 3 ? 3 : nights === 2 ? 2 : 1 };
    }
    else break;
    kept.pop();
  }
  if (hirePitch !== null) {
    if (!effects.recruit) p('hire-pitch: goes with gives: recruit');
    else if (hirePitch.length > HIRE_PITCH_MAX) p(`hire-pitch: at most ${HIRE_PITCH_MAX} characters (this is ${hirePitch.length})`);
    else effects.recruit.pitch = hirePitch;
  }
  // One that didn't read (a blank line before the arrow, no sign on heat) would be shown as story: say so instead.
  for (const line of kept) if (/^(pay|heat|gives|takes|take|hire-pitch):/.test(line.trim()) || line.trim() === 'blown' || line.trim() === 'lost') p(`can't read the effect line '${line.trim()}' (right above the → line, no blank line: pay: 400 / full / half / +150, heat: +2 or -1, gives: deck <id>, gives: outfit <character> <outfit>, gives: recruit <specialty> <grade> [man|woman], hire-pitch: <what they say>, takes: deck, take: full / part / none, blown, lost)`);
  for (const line of kept) if (/^(wait|next):/.test(line.trim())) p("wait: and next: go right after the '→' line");
  // ALARM and flags move on a choice's tags, never in an outcome: a line like that would be shown as story.
  for (const line of kept) if (/^alarm:/.test(line.trim()) || /^set [^\s=]+=\S+$/.test(line.trim())) p(`'${line.trim()}' only works on a choice: put [alarm +1] or [set name=value] on the choice that leads here`);
  const text = tidy(kept);
  if (text === '') p('needs some text');
  if (text.includes('{hire}') && !effects.recruit) p('{hire} needs gives: recruit on the same ending');
  if (text.length > QUEST_TEXT_MAX) p(`at most ${QUEST_TEXT_MAX} characters (this is ${text.length})`);
  return { id, text, to: m ? m[1] : 'end', wait, next, effects };
}

/** An outfit's key in the kit and the locked set: `<character>/<outfit>`. */
export const outfitKey = (o: { who: string; name: string }) => `${o.who}/${o.name}`;

/** Every outfit some ending gives (`<character>/<outfit>`): each is locked until a run earns it. */
export function rewardOutfits(quests: readonly QuestEntry[]): Set<string> {
  const out = new Set<string>();
  for (const q of quests) for (const o of q.outcomes.values()) if (o.effects.outfit) out.add(outfitKey(o.effects.outfit));
  return out;
}

/** A `loot:` line's length (roll lifecycle spec): one short thing the GM can name. */
export const LOOT_MAX = 80;

export function parseQuestFile(
  id: string,
  text: string,
  known: { roster: ReadonlySet<string> | null; places: ReadonlySet<string> | null; extras?: { ids: ReadonlySet<string>; tags: ReadonlySet<string> } | null; decks?: ReadonlySet<string> | null; outfits?: ReadonlySet<string> | null },
): { ok: true; entry: QuestEntry; warnings: string[] } | { ok: false; problems: QuestProblem[] } {
  const problems: QuestProblem[] = idOk(id) ? [] : [{ field: 'id', message: `must be lowercase letters, digits and dashes, at most ${LORE_ID_MAX}` }];
  const s = splitFrontMatter(text);
  if ('field' in s) return { ok: false, problems: [...problems, s] };
  // `draw <name>: a | b | c` lines (small jobs spec §1) sit beside the fixed keys.
  const draws: { name: string; values: string[] }[] = [];
  // `piece <id>: <line>` lines: what each piece of a contract's groundwork is, for CREW → ERRANDS.
  const pieceLines = new Map<string, string>();
  const front: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s.front)) {
    const p = /^piece\s+(.+)$/.exec(k);
    if (p) {
      pieceLines.set(p[1].trim(), String(v ?? '').trim());
      continue;
    }
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
  // The old kind: its files keep lines nothing reads now, so this one problem says it all.
  if (front.kind === 'big') return { ok: false, problems: [...problems, { field: 'kind', message: 'big jobs are contracts now' }] };
  const parsed = frontSchema.safeParse(front);
  if (!parsed.success) problems.push(...zodProblems(parsed.error));

  // The body's nodes in order: `# id` a beat, `## id` an outcome.
  const nodes: { kind: 'beat' | 'outcome'; id: string; cond: string | null; lines: string[] }[] = [];
  const lead: string[] = [];
  for (const line of s.body.split('\n')) {
    const h = /^(#{1,2})[ \t]+(.+?)\s*$/.exec(line);
    // A beat's version: `# id if <condition>`.
    const v = h && h[1] === '#' ? /^(\S+)(?:[ \t]+if[ \t]+(.+))?$/.exec(h[2]) : null;
    if (h) nodes.push({ kind: h[1] === '#' ? 'beat' : 'outcome', id: v ? v[1] : h[2], cond: v?.[2] ?? null, lines: [] });
    else if (nodes.length > 0) nodes[nodes.length - 1].lines.push(line);
    else lead.push(line);
  }
  if (lead.join('').trim() !== '') problems.push({ field: 'body', message: 'text before the first # heading' });
  const nodesMax = front.kind === 'contract' ? CONTRACT_NODES_MAX : QUEST_NODES_MAX;
  if (nodes.length > nodesMax) problems.push({ field: 'file', message: `at most ${nodesMax} beats and outcomes (this has ${nodes.length})` });

  const beats = new Map<string, Beat[]>();
  const outcomes = new Map<string, Outcome>();
  for (const n of nodes) {
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
      vs.push(parseBeat(n.id, when ?? (n.cond !== null ? [] : null), n.lines, problems));
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
  /** A job, a mission or a contract: checks, cracks, ALARM and effects are allowed (the messages name missions, as they always have). */
  const contracted = f.kind === 'contract';
  const guestParts = f.guest?.split(/\s+/) ?? [];
  const guestGrade = GRADES.indexOf((guestParts[1] ?? '') as (typeof GRADES)[number]);
  const guest = guestParts.length === 2 && guestGrade >= 0 ? { id: guestParts[0], grade: guestGrade as Grade } : null;
  const mission = f.kind === 'mission' || contracted;
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
  if (known.roster) for (const w of f['known-by'] ?? []) if (!known.roster.has(w)) problems.push({ field: 'known-by', message: `no character '${w}'` });
  // A spring file (crew spec §5) posts where the held recruit was hired: no starts: of its own.
  if (f.spring) {
    if (f.kind !== 'mission') problems.push({ field: 'spring', message: 'spring: true goes only in a job (kind: mission)' });
    if (f.starts != null) problems.push({ field: 'starts', message: 'a spring file has no starts: (it posts where the recruit was hired)' });
  } else if (f.starts == null) problems.push({ field: 'starts', message: 'needs the map place it starts at' });
  else if (known.places && !known.places.has(f.starts)) problems.push({ field: 'starts', message: `no place '${f.starts}' on the map` });
  if (!f.spring && s.body.includes('{recruit}')) problems.push({ field: 'file', message: '{recruit} goes only in a spring file (spring: true)' });
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
      if (!c.check && !c.crack && c.fail !== null) problems.push({ field: b.id, message: `choice ${c.id}: '/ ${c.fail}' is a fail outcome, which needs a check` });
      if (c.check?.red) reds.add(b.id);
    }
  }
  if (!contracted && pieceLines.size > 0) problems.push({ field: 'groundwork', message: 'piece lines go only in a contract' });
  if (!mission && f.trust != null) problems.push({ field: 'trust', message: 'trust: goes only on a job (kind: mission or contract)' });
  if (!mission && f.once != null) problems.push({ field: 'once', message: 'once: goes only on a job (kind: mission or contract)' });
  if (!mission && f.for != null) problems.push({ field: 'for', message: 'for: goes only on a job (kind: mission or contract)' });
  if (!mission && f.bars != null) problems.push({ field: 'bars', message: 'bars: goes only on a job (kind: mission or contract)' });
  if (f.bars != null && known.decks && !known.decks.has(f.bars)) problems.push({ field: 'bars', message: `no deck '${f.bars}' in world/gear` });
  if (f.for != null && known.roster && !known.roster.has(f.for)) problems.push({ field: 'for', message: `no character '${f.for}'` });
  if (!mission && f['take-size'] != null) problems.push({ field: 'take-size', message: 'take-size goes only on a job (kind: mission or contract)' });
  if (f.loot && f.loot.trim().length > LOOT_MAX) warnings.push(`loot: at most ${LOOT_MAX} characters (this is ${f.loot.trim().length})`);
  if (reds.size > 1) warnings.push(`${reds.size} red checks: keep to one per job, at its peak`);
  // [big] / [small] (effect and NERVE spec §4): a checked choice's, once, where the roll fills TAKE.
  for (const [beatId, versions] of beats)
    for (const c of versions.flatMap((b) => b.choices)) {
      const effects = c.tags.filter((t) => t.kind === 'effect');
      if (effects.length === 0) continue;
      const word = `[${effects[0].effect}]`;
      if (!c.check) warnings.push(`${c.id}: ${word} only works on a checked choice`);
      else if (effects.length > 1) warnings.push(`${c.id}: a choice is [big] or [small], not both`);
      else if (beatId === 'getaway' || /^push-\d+$/.test(beatId)) warnings.push(`${c.id}: ${word} does nothing on a getaway or push beat`);
    }
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
    for (const s of o.effects.settles ?? []) {
      if (o.to !== 'end') problems.push({ field: o.id, message: 'settles: goes on an outcome that ends (→ end)' });
      if (s.text.length > SETTLES_MAX) problems.push({ field: o.id, message: `settles: at most ${SETTLES_MAX} characters (this is ${s.text.length})` });
      if (known.roster && !known.roster.has(s.who)) problems.push({ field: o.id, message: `settles: no contact '${s.who}'` });
    }
    if (o.effects.guestNote !== undefined) {
      if (f.guest == null) problems.push({ field: o.id, message: 'guest-note: needs a guest: on the contract' });
      if (o.to !== 'end') problems.push({ field: o.id, message: 'guest-note: goes on an outcome that ends (→ end)' });
      if (o.effects.guestNote.length > GUEST_NOTE_MAX) problems.push({ field: o.id, message: `guest-note: at most ${GUEST_NOTE_MAX} characters (this is ${o.effects.guestNote.length})` });
    }
    // The arrangement (spec 2026-10-20): a quest with one contact strikes that contact's deal.
    if (arrangement && (mission || ownedBy({ with: withIds }) === null)) problems.push({ field: o.id, message: 'arrangement: goes only in a quest with one contact (not a job)' });
    if (o.to === 'back' && !contracted) problems.push({ field: o.id, message: "'→ back' goes only in a contract" });
    if (typeof o.effects.deck === 'string' && known.decks && !known.decks.has(o.effects.deck)) problems.push({ field: o.id, message: `gives: no deck '${o.effects.deck}' in world/gear/decks.md` });
    if (o.effects.outfit && known.outfits && !known.outfits.has(outfitKey(o.effects.outfit))) problems.push({ field: o.id, message: `gives: no outfit '${o.effects.outfit.name}' in ${o.effects.outfit.who}'s character.json` });
    if (o.to !== 'end' && o.to !== 'back' && !beats.has(o.to)) problems.push({ field: o.id, message: `→ '${o.to}': no # beat by that id` });
    const w = o.wait;
    if (!w) continue;
    if (w.at !== null && known.places && !known.places.has(w.at)) problems.push({ field: o.id, message: `wait: no place '${w.at}' on the map` });
    if (w.else !== null && !beats.has(w.else) && !outcomes.has(w.else)) problems.push({ field: o.id, message: `wait: else '${w.else}': no beat or outcome by that id` });
    if (w.else !== null && w.else === o.to) problems.push({ field: o.id, message: "wait: else can't be the beat it waits for" });
  }

  // Push beats (pressing on spec §2): push-1…push-3, reached only by PRESS ON, every outcome back to the card.
  const pushBeats = [...beats.keys()].filter((id) => /^push-\d+$/.test(id));
  const pushOutcomes = new Set(pushBeats.flatMap((id) => beats.get(id)!.flatMap((b) => b.choices.flatMap((c) => [c.to, ...(c.fail ? [c.fail] : [])]))));
  if (pushBeats.length > 0 && !mission) problems.push({ field: 'body', message: 'push beats go only in a job (kind: mission or contract)' });
  for (const id of pushBeats) {
    const n = Number(id.slice(5));
    if (!PUSH_ID.test(id)) problems.push({ field: id, message: 'at most three push beats (push-1 to push-3)' });
    else if (n > 1 && !beats.has(pushBeatId(n - 1))) problems.push({ field: id, message: `${id} needs ${pushBeatId(n - 1)}` });
    for (const b of beats.get(id)!)
      for (const c of b.choices) if ((c.check || c.crack) && c.fail !== null && !outcomes.get(c.fail)?.effects.lost) problems.push({ field: id, message: `choice ${c.id}: a push check fails to an outcome with lost` });
  }
  const otherOutcomes = new Set([...beats.entries()].filter(([id]) => !pushBeats.includes(id)).flatMap(([, vs]) => vs.flatMap((b) => b.choices.flatMap((c) => [c.to, ...(c.fail ? [c.fail] : [])]))));
  for (const o of outcomes.values()) {
    if (pushOutcomes.has(o.id)) {
      if (otherOutcomes.has(o.id)) problems.push({ field: o.id, message: `outcome '${o.id}' is used by a push beat and another beat` });
      if (o.to !== 'end') problems.push({ field: o.id, message: "a push beat's outcome ends with → end (back to the card)" });
    } else {
      if (/^push-\d+$/.test(o.to)) problems.push({ field: o.id, message: `→ '${o.to}': push beats are reached only by PRESS ON` });
      if (o.effects.bonus !== undefined || o.effects.lost) problems.push({ field: o.id, message: "pay: +N and lost go only in a push beat's outcomes" });
    }
  }

  // A getaway (the table spec §2): a job's beat for a full ALARM, reached by nothing else, every outcome ending the job.
  const getaway = beats.get('getaway');
  if (getaway) {
    if (!mission) problems.push({ field: 'getaway', message: 'a # getaway beat goes only in a job (kind: mission or contract)' });
    const ends = new Set(getaway.flatMap((b) => b.choices.flatMap((c) => [c.to, ...(c.fail ? [c.fail] : [])])));
    for (const id of ends) if (outcomes.get(id) && outcomes.get(id)!.to !== 'end') problems.push({ field: id, message: "a getaway's outcome ends the job (→ end)" });
  }
  for (const o of outcomes.values()) if (o.to === 'getaway') problems.push({ field: o.id, message: "→ 'getaway': a getaway is reached only by a full ALARM" });

  // Every node reachable from the first beat, and every node able to reach an end.
  const next = (nid: string): string[] => {
    const vs = beats.get(nid);
    if (vs) return vs.flatMap((b) => b.choices.flatMap((c) => [c.to, ...(c.fail ? [c.fail] : [])])).filter((t) => outcomes.has(t));
    const o = outcomes.get(nid);
    if (!o) return [];
    const to = o.to !== 'end' && beats.has(o.to) ? [o.to] : [];
    // A missed deadline's path is a way on too.
    const missed = o.wait?.else && (beats.has(o.wait.else) || outcomes.has(o.wait.else)) ? [o.wait.else] : [];
    return [...to, ...missed];
  };
  // A contract (tier 3 contracts spec §1): its reports, night and fallout are played by the run, not led to.
  const pieces = (f.groundwork ?? '').split(',').map((x) => x.trim().split(/\s+/)).filter((x) => x[0] !== '');
  const arcBeats = contracted ? [...pieces.map(([id]) => `report-${id}`), 'night', 'fallout'] : [];
  if (contracted) {
    if (pieces.length !== 3) problems.push({ field: 'groundwork', message: 'groundwork: needs three pieces' });
    for (const [id, spec] of pieces) if (!spec || !(SPECIALTIES as readonly string[]).includes(spec)) problems.push({ field: 'groundwork', message: `groundwork: '${id}' needs a specialty` });
    for (const [id] of pieces) if (!pieceLines.get(id)) problems.push({ field: `piece ${id}`, message: `a contract needs a piece ${id}: line` });
    for (const id of pieceLines.keys()) if (!pieces.some(([p]) => p === id)) problems.push({ field: `piece ${id}`, message: `'${id}' isn't in groundwork:` });
    for (const b of arcBeats) if (!beats.has(b)) problems.push({ field: b, message: `a contract needs a # ${b} beat` });
    if (ownedBy({ with: withIds }) === null) problems.push({ field: 'with', message: 'a contract belongs to one contact (with: one id)' });
    for (const k of ['night', 'fallout', 'rumor', 'posts-at'] as const) if (f[k] == null) problems.push({ field: k, message: `a contract needs ${k}:` });
    if (f.guest != null && !guest) problems.push({ field: 'guest', message: 'guest: is a contact and a grade, like ember VET' });
    if (f.guest != null && f.lead == null) problems.push({ field: 'guest', message: 'a guest needs a lead:' });
  } else {
    if (f.lead != null) problems.push({ field: 'lead', message: 'only a contract is opened by a lead' });
    if (f.guest != null) problems.push({ field: 'guest', message: 'only a contract has a guest' });
  }
  const roots = [first, ...arcBeats.filter((b) => beats.has(b)), ...pushBeats, ...(beats.has('getaway') ? ['getaway'] : [])];
  const reached = new Set<string>(roots);
  for (const queue = [...roots]; queue.length > 0; ) for (const t of next(queue.shift()!)) if (!reached.has(t) && reached.add(t)) queue.push(t);
  // Back to the wait ends a contract's offer or report as `→ end` ends the job.
  const ends = new Set([...outcomes.values()].filter((o) => o.to === 'end' || o.to === 'back').map((o) => o.id));
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of nodes) if (!ends.has(n.id) && next(n.id).some((t) => ends.has(t))) grew = Boolean(ends.add(n.id));
  }
  for (const n of nodes) {
    if (!reached.has(n.id)) problems.push({ field: n.id, message: 'nothing leads here from the first beat' });
    else if (!ends.has(n.id)) problems.push({ field: n.id, message: "no path from here reaches '→ end'" });
  }

  if (problems.length > 0) return { ok: false, problems };
  const timed = [...outcomes.values()].some((o) => o.wait?.by != null);
  const entry: QuestEntry = { id, title: f.title, ...(f.drops ? { drops: f.drops } : {}), kind: contracted ? 'contract' : mission ? 'mission' : 'quest', ...(contracted ? { contract: { night: span(f.night!)!, fallout: span(f.fallout!)!, pieces: pieces.map(([pid, spec]) => ({ id: pid, spec: spec as Specialty, line: pieceLines.get(pid) ?? '' })), postsAt: Number(f['posts-at']), rumor: f.rumor!, ...(f.lead ? { lead: f.lead } : {}), ...(guest ? { guest } : {}) } } : {}), pay: payRange ? payRange[0] : null, tier: (f.tier != null ? Number(f.tier) : 1) as 1 | 2 | 3 | 4, payRange, minutes: f.minutes != null ? Number(f.minutes) : null, draws, art: f.art ?? null, with: withIds, starts: f.starts ?? '', after, pitch: f.pitch ?? null, ...(f['posted-by'] ? { postedBy: f['posted-by'] } : {}), ...(f.brief ? { brief: f.brief } : {}), ...(f['known-by'] ? { knownBy: f['known-by'] } : {}), timed, first, beats, outcomes, posts: f.posts ? (f.posts.split('-').map((t) => parseHhmm(t)!) as [number, number]) : null, commsAt: f.comms ?? null, trust: f.trust ? (f.trust.split('/').map((x) => Number(x.trim())) as [number, number]) : null, ...(f.once ? { once: true as const } : {}), ...(f.for ? { for: f.for } : {}), ...(f.bars ? { bars: f.bars } : {}), ...(f.spring ? { spring: true as const } : {}), ...(f['take-size'] != null ? { takeSize: Number(f['take-size']) } : {}), ...(f.loot ? { loot: f.loot.trim() } : {}), ...(f.template || contracted ? { template: true as const } : {}) };
  if (entry.template) warnings.push(...offTemplate(entry));
  return { ok: true, warnings, entry };
}

/** A quest run, stored as story meta `quest.<player>.<id>` in the contact's room.db. */
export interface QuestRun {
  /** NEXT ROLL costs waiting for the next checked pick in this job (roll lifecycle spec §1.1). */
  next?: NextRoll;
  /** A contract's arc (tier 3 contracts spec §2): where it stands, what groundwork brought back, and the wait to the night. */
  contract?: { stage: 'waiting' | 'night' | 'fallout'; wait: RunWait | null; results: Record<string, 'clean' | 'messy' | 'blown'>; reported: string[]; /** When the fallout ended it: a `gives: recruit` card goes up from here. */ closedAt?: number };
  /** Stand Firm is running (tier 3 beat play spec §2): the first cost picked on each roll is cancelled, until a miss. */
  firm?: true;
  /** The card Saw It Coming took back: gone from this beat until the run moves on. */
  barred?: { beat: string; choice: string };
  /** A holding deck's armour is spent for this job (§1.3); old runs only since programs (programs spec §3). */
  armourUsed?: true;
  /** Programs loaded this job (programs spec §1.2), in load order; FIREWALL `burned` once it cancelled a cost. */
  programs?: { id: string; at: number; burned?: true; /** Loaded mid-job, for NERVE (§1.2a); a SETUP load has none. */ hot?: true }[];
  /** The carried deck died mid-job (fragile): its programs no longer run. */
  deckDead?: true;
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
  /** A job's ALARM, 0–4 (the table spec §2; 0–3 before it). */
  alarm?: number;
  /** TAKE filled so far (the table spec §2); absent on runs from before the table. */
  takeFill?: number;
  /** On its getaway beat (a full ALARM, the table spec §2). */
  getaway?: true;
  /** The written pay the job's outcomes have paid so far, before TAKE scales it (the table spec §2). */
  payCeiling?: number;
  /** The take the job's outcomes last set (full when none did), and whether one was blown: its tier at the end. */
  take?: 'full' | 'part' | 'none';
  blown?: boolean;
  /** The story day a job started on (its run key's `@day`), and the one it ended on. */
  day?: number;
  endDay?: number;
  /** The deck held when a job started (its debrief's "deck gained or lost"). */
  startDeck?: string | null;
  /** A blown ending waiting on the cover cards (plan ruling 5): the outcome, the row it will write, and that row's minutes. */
  pendingCover?: { outcome: string; text: string; pick?: { choice: string; line: string; roll?: Roll }; minutes: number } | null;
  /** A mission's changes to the kit (missions spec §1): folded with every other run's into sol, heat, deck and EDGE. */
  kit?: KitEvent[];
  /** A failed check waiting on REROLL or TAKE IT (missions spec §3); absent or null: none. */
  pending?: DicePending | LegacyPending | null;
  /** When it was last written (ms): the later run wins a flag two quests both set. */
  at: number;
  /** Each stranger's face in this run, name → extra id (stranger faces spec §5); absent: none drawn. */
  faces?: Record<string, string>;
  /** Pressing on (spec 2026-10-29 §3): the push after the take; absent until one is offered. */
  push?: PushState;
  /** A rescue (crew spec §5): the held recruit it frees, where it was posted (their hire place) and its tier (their grade + 1). */
  spring?: { recruit: string; place: string; tier: 1 | 2 | 3 | 4 };
  /** Crew spec §5: the `gives: recruit` its ending outcome had; its free card shows at the job's place until the next 06:00. */
  recruit?: JobHire;
  /** Guest crew spec §3: the `guest-note:` its ending had; a brought guest's next turn writes it down. */
  guestNote?: string;
  /** The `settles:` lines its ending had; each contact named reads theirs on every turn while this run stands. */
  settles?: Settled[];
  /** The hand (spec 2026-10-29-the-hand §1): the SETUP card GO IN took; absent on runs from before it, or sent without one. */
  setup?: Setup;
  /** Each card played on a roll, in order (§2). */
  calls?: Call[];
}

/**
 * A job's push (pressing on spec §3): the push beats played (`stage`), the pot they won, where the push's kit
 * events start (`from`), the ending held for WALK (`outcome`), where it stands, and each push's result.
 */
export interface PushState {
  stage: number;
  pot: number;
  from: number;
  outcome: string;
  state: 'offer' | 'playing' | 'won' | 'walked' | 'lost';
  log: { beat: string; choice: string; result: 'won' | 'lost'; sol: number }[];
  /** The decks you owned as the push began: a lost push takes back only the others it gave. */
  had?: string[];
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

/** Version `variant` of beat `id`; its default (last) version when the file has fewer now (a save from before a rewrite). */
export function beatAt(q: QuestEntry, id: string, variant: number): Beat | undefined {
  const vs = q.beats.get(id);
  return vs?.[variant] ?? vs?.at(-1);
}

/** A checked pick's roll before the table (missions spec §3): the odds it had, every d100 in order (a reroll added one). */
export interface LegacyRoll {
  stat: string;
  chance: number;
  rolls: number[];
  pass: boolean;
}

/** A checked pick's roll on the table (spec 2026-10-29 §1): the pool, its position, the faces, and how it landed. */
export interface DiceRoll {
  stat: string;
  dice: number;
  position: Position;
  faces: number[];
  keep: 'high' | 'low';
  kind: DiceResult['kind'];
  pass: boolean;
  pushed?: true;
  steadied?: true;
  /** The deck against the job's tier, when it acted (deck effects spec §1): held a 4–5's ALARM off, or (old records) outclassed (+1 on a miss). */
  deck?: 'held' | 'outclassed';
  /** A hidden deck took this grid check's heat away (deck effects spec §2). */
  hidden?: true;
  /** A grid check's deck heat, landing at the job's end (tier template spec §2). */
  deckHeat?: number;
  /** A quiet program ran on this roll: 1 off the heat the job leaves. */
  quiet?: true;
  /** A VET's save made this miss a 4–5 (crew abilities spec §2). */
  saved?: true;
  /** How much the pass filled TAKE (effect and NERVE spec §1); absent: FAIR, or a check that fills none. */
  effect?: Effect;
  /** SAFE or BOLD chosen for it (effect and NERVE spec §4). */
  trade?: 'safe' | 'bold';
  /** The costs it settled and the lines they showed (roll lifecycle spec §1), for its row and rewind. */
  costs?: { cost: CostId; how: 'taken' | 'resisted' | 'armour' | 'ability'; line: string }[];
  /** The programs that ran on it, loads included (programs spec §3): rewind and the debrief read them. */
  programs?: string[];
  /** What a setup pressed on it leaves for the next roll (ability pass spec §2). */
  setup?: { better?: true; die?: true; small?: true; noCut?: true };
  /** A greed press: if this ends a miss it also loses 1 TAKE (ability pass spec §2). */
  missTake?: true;
  /** A gamble on it: the die, and the result it started from (ability pass spec §2). */
  gamble?: { die: number; from: 'cost' | 'miss' };
  /** Run It Twice rolled it again (tier 3 beat play spec §2): one rewrite a roll, gamble or this. */
  rerun?: true;
  /** Talk Them Down: a blow-up lands as part, and the job isn't blown. */
  softened?: true;
  /** TAKE traded away on it for ALARM (ability pass spec §2). */
  lessTake?: number;
}

/** Any stored roll: runs and rows from before the table keep their d100 rolls. */
export type Roll = LegacyRoll | DiceRoll;

export const isLegacyRoll = (r: Roll): r is LegacyRoll => 'chance' in r;

/** A costly roll waiting on STEADY / TAKE IT (the table spec §3): the roll, and the ALARM and heat it would cost. */
export interface DicePending {
  beat: string;
  choice: string;
  roll: DiceRoll;
  cost: { alarm: number; heat: number };
  /** A fragile deck that died on this roll (its name), for the row that lands it. */
  died?: string;
  /** The card played on the roll (the hand spec §2), written to the run's calls when it lands. */
  call?: Call;
  /** AFTER A ROLL abilities pressed on this parked roll (crew abilities spec §2), written to the calls after `call`. */
  after?: Call[];
  /** The roll's story minute: a press's kit events go there, after the roll's own (absent on rolls parked before abilities). */
  at?: number;
  /** The costs dealt (roll lifecycle spec §1.2), each with the line it shows; absent: a roll parked before, its fixed `cost`. */
  dealt?: DealtCost[];
  /** How many of them to pick. */
  pick?: number;
  /** The picked costs, each once settled (§1.3); a picked one not yet settled has no `how`. */
  settled?: SettledCost[];
}

/** A dealt cost and the line it shows: the GM's, or a written one. */
export interface DealtCost {
  cost: CostId;
  line: string;
  by: 'gm' | 'written';
}

/** A picked cost and how it was settled: taken, resisted (its dice and NERVE), armoured, or by an ability (ALARM −1). */
export interface SettledCost {
  cost: CostId;
  how?: 'taken' | 'resisted' | 'armour' | 'ability';
  faces?: number[];
  nerve?: number;
}

/** A failed check waiting on REROLL / TAKE IT, saved before the table. */
export interface LegacyPending {
  beat: string;
  choice: string;
  stat: string;
  chance: number;
  rolls: number[];
}

export const isLegacyPending = (p: DicePending | LegacyPending): p is LegacyPending => 'chance' in p;

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
const legacyRollSchema = z.object({ stat: z.string(), chance: z.number(), rolls: z.array(z.number()), pass: z.boolean() });
const costIdSchema = z.enum(['alarm', 'heat', 'worse', 'small', 'take']);
const diceRollSchema = z.object({
  stat: z.string(),
  dice: z.number().int(),
  position: z.enum(['dark', 'open', 'wire']),
  faces: z.array(z.number().int().min(1).max(6)),
  keep: z.enum(['high', 'low']),
  kind: z.enum(['crit', 'clean', 'cost', 'miss']),
  pass: z.boolean(),
  pushed: z.literal(true).optional(),
  steadied: z.literal(true).optional(),
  deck: z.enum(['held', 'outclassed']).optional(),
  hidden: z.literal(true).optional(),
  deckHeat: z.number().optional(),
  quiet: z.literal(true).optional(),
  saved: z.literal(true).optional(),
  setup: z.object({ better: z.literal(true).optional(), die: z.literal(true).optional(), small: z.literal(true).optional(), noCut: z.literal(true).optional() }).optional(),
  missTake: z.literal(true).optional(),
  gamble: z.object({ die: z.number().int(), from: z.enum(['cost', 'miss']) }).optional(),
  rerun: z.literal(true).optional(),
  softened: z.literal(true).optional(),
  lessTake: z.number().int().optional(),
  effect: z.enum(['small', 'fair', 'big']).optional(),
  trade: z.enum(['safe', 'bold']).optional(),
  costs: z.array(z.object({ cost: costIdSchema, how: z.enum(['taken', 'resisted', 'armour', 'ability']), line: z.string() })).optional(),
  programs: z.array(z.string()).optional(),
});
const rollSchema = z.union([diceRollSchema, legacyRollSchema]);
const setupSchema = z.object({
  approach: z.enum(['quiet', 'smooth', 'hard']),
  people: z.array(z.string()).max(3),
  favour: z.boolean(),
  at: z.number(),
  tier: z.number().optional(),
  endAt: z.number().optional(),
  fenced: z.literal(true).optional(),
  fencedBy: z.string().optional(),
  // Contact cards (spec 2026-10-31-contact-cards §2), as they were at GO IN.
  contacts: z.array(z.object({ id: z.string(), name: z.string(), accent: z.string(), portrait: z.string().nullable(), spec: z.preprocess(normalSpec, z.enum(SPECIALTIES)) })).max(2).optional(),
  // A contract's guest (spec 2026-11-05-guest-crew §2), as they were at GO IN.
  guest: z.object({ id: z.string(), name: z.string(), accent: z.string(), portrait: z.string().nullable(), spec: z.preprocess(normalSpec, z.enum(SPECIALTIES)), grade: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), abilities: z.array(z.string()) }).optional(),
  // Crew abilities (spec 2026-11-01): the loadout at GO IN, and what played at the end.
  abilities: z.record(z.string(), z.array(z.string())).optional(),
  ended: z.array(z.string()).optional(),
  endHeat: z.number().int().optional(),
  payCut: z.number().int().optional(),
  payFull: z.literal(true).optional(),
  paidOff: z.literal(true).optional(),
  held: z.string().optional(),
  // Programs (spec 2026-11-02-programs §3): the deck carried at GO IN and its slots; absent on an old run.
  deck: z.object({ id: z.string(), quality: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), slots: z.number().int().min(0).max(4) }).optional(),
});
const callSchema = z.object({ beat: z.string(), choice: z.string(), card: z.string(), again: z.boolean(), at: z.number(), loss: z.enum(['hurt', 'held']).optional(), ability: z.string().optional() });

const runSchema = z.object({
  next: z.object({ worse: z.literal(true).optional(), small: z.literal(true).optional(), better: z.literal(true).optional(), die: z.literal(true).optional(), noCut: z.literal(true).optional() }).optional(),
  firm: z.literal(true).optional(),
  contract: z
    .object({
      stage: z.enum(['waiting', 'night', 'fallout']),
      wait: runWaitSchema.nullable(),
      results: z.record(z.string(), z.enum(['clean', 'messy', 'blown'])),
      reported: z.array(z.string()),
      closedAt: z.number().optional(),
    })
    .optional(),
  barred: z.object({ beat: z.string(), choice: z.string() }).optional(),
  armourUsed: z.literal(true).optional(),
  programs: z.array(z.object({ id: z.string(), at: z.number(), burned: z.literal(true).optional(), hot: z.literal(true).optional() })).optional().catch(undefined),
  deckDead: z.literal(true).optional(),
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
  alarm: z.number().int().min(0).max(4).optional(),
  takeFill: z.number().int().min(0).optional(),
  getaway: z.literal(true).optional(),
  payCeiling: z.number().optional(),
  take: z.enum(['full', 'part', 'none']).optional(),
  blown: z.boolean().optional(),
  push: z
    .object({
      stage: z.number().int().min(0),
      pot: z.number(),
      from: z.number().int().min(0),
      outcome: z.string(),
      state: z.enum(['offer', 'playing', 'won', 'walked', 'lost']),
      log: z.array(z.object({ beat: z.string(), choice: z.string(), result: z.enum(['won', 'lost']), sol: z.number() })),
      had: z.array(z.string()).optional(),
    })
    .optional(),
  day: z.number().int().optional(),
  endDay: z.number().int().optional(),
  // A bad setup or call is dropped, never the run (old and hand-edited saves still load).
  setup: setupSchema.optional().catch(undefined),
  calls: z
    .array(z.unknown())
    .transform((xs) => xs.flatMap((x) => { const r = callSchema.safeParse(x); return r.success ? [r.data] : []; }))
    .optional()
    .catch(undefined),
  startDeck: z.string().nullable().optional(),
  spring: z.object({ recruit: z.string(), place: z.string(), tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }).optional(),
  recruit: z.object({ spec: z.preprocess(normalSpec, z.enum(HIREABLE as [Specialty, ...Specialty[]])), grade: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), sex: z.enum(['man', 'woman']).optional(), pitch: z.string().optional() }).optional(),
  guestNote: z.string().optional(),
  settles: z.array(z.object({ who: z.string(), text: z.string() })).optional(),
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
        lose: z.array(z.string()).optional(),
        // Outfits as rewards: `<character>/<outfit>`, opened by an ending.
        outfit: z.string().optional(),
        // Spent (negative), or given back by a NERVE +1 ability (crew abilities spec §2).
        nerve: z.number().int().max(2).optional(),
        edge: z.literal(-1).optional(),
        lift: z.literal(true).optional(),
        rep: z.object({ district: z.string(), delta: z.number() }).optional(),
        cover: z.object({ id: z.enum(['burner', 'fall-guy']), delta: z.number() }).optional(),
      }),
    )
    .optional(),
  pending: z
    .union([
      z.object({
        beat: z.string(),
        choice: z.string(),
        roll: diceRollSchema,
        cost: z.object({ alarm: z.number().int(), heat: z.number().int() }),
        died: z.string().optional(),
        call: callSchema.optional(),
        after: z.array(callSchema).optional(),
        at: z.number().optional(),
        dealt: z.array(z.object({ cost: costIdSchema, line: z.string(), by: z.enum(['gm', 'written']) })).optional(),
        pick: z.number().int().min(0).max(3).optional(),
        settled: z.array(z.object({ cost: costIdSchema, how: z.enum(['taken', 'resisted', 'armour', 'ability']).optional(), faces: z.array(z.number().int()).optional(), nerve: z.number().int().optional() })).optional(),
      }),
      z.object({ beat: z.string(), choice: z.string(), stat: z.string(), chance: z.number(), rolls: z.array(z.number()) }),
    ])
    .nullable()
    .optional(),
});

/** A job started before programs (programs spec §3): a setup without its deck keeps the old rules until it ends. */
export const isOldRun = (run: QuestRun): boolean => run.setup !== undefined && run.setup.deck === undefined;

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

/** What the contact thinks at this beat: their own view, or `view any`, then whichever gated lines hold. */
export function beatViews(beat: Beat, ctx: CondCtx): string {
  const own = beat.views.filter((v) => v.contact === ctx.with);
  const plain = own.find((v) => v.when === null) ?? beat.views.find((v) => v.contact === 'any' && v.when === null);
  const gated = [...own, ...beat.views.filter((v) => v.contact === 'any')].filter((v) => v.when !== null && holds(v.when, ctx));
  return [plain, ...gated].filter((v): v is View => v !== undefined).map((v) => v.text).join(' ');
}

/** A beat the contact only hears: the picture is somewhere else, or they're on the line. */
export const beatAway = (beat: Pick<Beat, 'room' | 'onComms'>): boolean => beat.room !== undefined || beat.onComms === true;

/**
 * Job and quest text is written to the player, so its "you" is them and its "she" may be the contact reading it.
 * Unsaid, she answered as the player (Run Sheet, playtest: 3 takes of 3). `away`: she gets what she heard, not what they saw.
 */
const toldTo = (player: string, away: boolean): string => `(told to ${player}, so "you" here is ${player}${away ? `; you weren't there, and this is all you heard on the line` : ''})`;

/**
 * What the contact heard of a beat they aren't at: the player's pick and the words marked `{{ }}`. The rest of the beat
 * is what the player saw; a label asking her not to know it still leaked (Run Sheet's stamp, 2 takes of 3).
 */
export function heardAt(beat: Pick<Beat, 'onLine'>, pick?: string): string {
  return [pick, ...(beat.onLine ?? [])].filter(Boolean).join(' ') || 'Nothing came over the line.';
}

/** The contact's `[quest]` block for the beat (spec §3): only this beat, only shown choices, only their view. */
export function questBlock(q: QuestEntry, beat: Beat, ctx: CondCtx, oneLine: (s: string) => string, shown = false, player?: string): string {
  const choices = shownChoices(beat, ctx)
    .map((c) => lowerFirst(c.line).replace(/[.!?…]+$/, ''))
    .join('; ');
  const views = beatViews(beat, ctx);
  const who = beat.stranger?.name ?? 'someone here';
  const knows = beat.stranger ? ` ${beat.stranger.name} knows only what is written above: give them no new facts, and they stay where they are, waiting.` : '';
  const tag = isJob(q) ? 'job' : 'quest';
  return (
    `[${tag} — ${q.title}. Where it stands${!shown && player ? ` ${toldTo(player, beatAway(beat))}` : ''}: ${shown ? `the [${tag} — ${q.title}: …] line at the end of this message, which they have just read` : oneLine(beatAway(beat) ? heardAt(beat) : beat.text)}\n` +
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
/** A roll's result line in a row (`*COOL 3d · IN THE OPEN — 6 6, crit.*`, or a d100 one from before the table). */
const ROLL_LINE = /\n*\*[A-Z]+ (?:\d+d · [A-Z ]+|\d+%) — [^*\n]*\.\*\n*/g;

export function questRowText(row: { title: string; text: string; run?: string; heard?: string }, oneLine: (s: string) => string, player?: string): string {
  // Her history leaves out the roll's result line (the table): no dice, odds or game words for her to echo.
  const text = (row.heard ?? row.text)
    .replace(ROLL_LINE, '\n\n')
    // The hand (spec 2026-10-29-the-hand §6): a call and a loss as her own bracketed lines.
    .replace(/⟦CALL⟧ ([^\n]*?)\.?(?=\n|$)/g, '[call: $1]')
    .replace(/⟦LOST⟧ ([^\n]*?)\.?(?=\n|$)/g, '[$1]')
    .trim();
  return `[${row.run ? 'job' : 'quest'} — ${row.title}${player ? ` ${toldTo(player, row.heard !== undefined)}` : ''}: ${oneLine(text.replace(/⟦([^⟧]+)⟧ /g, '($1) '))}]`;
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
  }
};

/** A check as written: `check tech 45 grid · ember +15`. */
const modText = (m: Mod) => ` · if ${m.when.map(condText).join(' and ')} ${m.delta >= 0 ? '+' : ''}${m.delta} "${m.label}"`;
export const checkText = (c: Check): string => `check ${c.stat} ${c.base}${c.grid ? ' grid' : ''}${c.red ? ' red' : ''}${c.angle ? ' angle' : ''}${c.crew.map((x) => ` · ${x.contact} +${x.bonus}`).join('')}${c.mods.map(modText).join('')}`;

/** A choice's [big] / [small] (effect and NERVE spec §1): the effect its roll starts from; none is FAIR. */
export const effectTagOf = (c: Pick<Choice, 'tags'>): 'big' | 'small' | undefined => c.tags.find((t): t is Extract<Tag, { kind: 'effect' }> => t.kind === 'effect')?.effect;

export const tagText = (t: Tag): string => {
  if (t.kind === 'set') return `set ${t.name}=${t.value}`;
  if (t.kind === 'clock') return `clock +${t.minutes % 60 === 0 ? `${t.minutes / 60}h` : `${t.minutes}m`}`;
  if (t.kind === 'check') return checkText(t.check);
  if (t.kind === 'alarm') return 'alarm +1';
  if (t.kind === 'effect') return t.effect;
  if (t.kind === 'crack') return `crack ${t.length}${t.corp ? ' corp' : ''}${t.mods.map(modText).join('')}`;
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

export function questOutline(q: QuestEntry): { beat: string; push: boolean; choices: { id: string; line: string; to: string; next: string; tags: string[]; wait: string | null; waitNext: string | null; check: Check | null }[] }[] {
  return [...q.beats.values()].flat().map((b) => ({
    beat: `${b.id}${b.when ? ` if ${b.when.map(condText).join(' and ')}` : ''}`,
    push: PUSH_ID.test(b.id),
    choices: b.choices.map((c) => {
      const o = q.outcomes.get(c.to);
      return { id: c.id, line: c.line, to: c.to, next: o?.to ?? '?', tags: [...(c.check ? [checkText(c.check)] : []), ...c.tags.map(tagText)], wait: o?.wait ? waitText(o.wait) : null, waitNext: o?.next ?? null, check: c.check };
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
  "A job (kind: mission or contract) also has posted-by: <who it came from, as far as the player knows, under 80 characters> and brief: <where it is and what the work is, one or two sentences, under 240 characters, no outcomes, no checks, and never 'you'>. The contact is told these and that the player knows them, so they must hold for every run of the job.",
  'A missed-it path plays wherever the player is with the contact: write it as news reaching them (a message, a call, someone passing it on), not as a scene at the place they missed.',
  "A choice line starts with a verb, since the row shows it as 'You <line>' ('Go back to the Tilt.', never 'Back to the Tilt.').",
  'A job may set posts: HH:MM-HH:MM (when it lists; may cross midnight) and trust: W / L (CLEAN raises trust with the contact by W, BLOWN lowers it by L; rep then doesn\'t move).',
  "A job that changes the world (a rival sunk, a book burned) sets once: true and never posts again after it ends; a job that can recur (a regular delivery, a standing collection) leaves it out and reads fine the second time.",
  "take-size: N (2–8) sets a job's TAKE clock; leave it out and the tier decides (3 / 4 / 6). A long job with plenty of picks can take a bigger clock (take-size: 4 on tier 1); a short one of two or three picks keeps the tier's.",
  'A quest with one contact may end in arrangement: chair-cut <5–50> / <nights 1–3> (that contact sits the player\'s chair for that cut of each job).',
  'A spring file (spring: true) is a rescue: no starts:, {recruit} for the held recruit\'s name; its clean and messy ends free them.',
  "A job's ending may give someone: gives: recruit <specialty> <grade>, with man or woman after it when the text says he or she. {hire} in that ending is their name, and hire-pitch: <one or two short lines, first person, no quote marks> is what they say on the HIRE card. Keep the text to they/them or leave the word off when it doesn't matter.",
  "A job may end in up to three push beats (# push-1, # push-2, # push-3), played only when the player presses on after the take: each one's greed comes from the job's own prose, never stock loot, and each is harder than the last.",
  "A push outcome pays pay: +N (about 30–60 % of the job's pay) or gives something, and ends → end; every check in a push beat fails to an outcome marked lost (a bare line).",
  "A check's number sets its position, not its odds: 55 or more is IN THE DARK, 45–54 IN THE OPEN, 44 or less ON THE WIRE; red is one shot.",
  'Tag a bold choice [big] (a pass fills more TAKE) or a careful one [small] (less); most choices take neither.',
  'Give a job a loot: line (≤ 80 characters): what the take physically is, so the GM can lose some of it.',
  "The player picks how they go in before the first beat: QUIET is reflex and tech, SMOOTH cool and wits, HARD body; a check on the chosen stats rolls a die more. Their crew help on their own stat (runner reflex, wire tech, face cool, ears wits, muscle body). So mix the stats across a job's checks, with at least two ways through a beat that lean on different stats, and never write the approach or the crew into the file: the game adds them.",
  'A job may have a # getaway beat for when ALARM fills: its outcomes end the job (→ end) and nothing else leads to it.',
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
      "pitch: <one line for the JOBS list: what it's about, never how it goes>",
      'posted-by: <jobs: who it came from, as far as the player knows>',
      'brief: <jobs: where it is and what the work is, never how it goes>',
      'known-by: [<contact ids>]   # optional: contacts who work where it posts and would have heard, though it is not their job',
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

/**
 * A spring file as one rescue plays it (crew spec §5): at the place it was posted, at the recruit's tier, with
 * `{recruit}` filled everywhere in its text.
 */
export function withSpring(q: QuestEntry, spring: { place: string; tier: 1 | 2 | 3 | 4 }, name: string | null): QuestEntry {
  const fill = (x: unknown): unknown => {
    if (typeof x === 'string') return fillRecruit(x, name);
    if (Array.isArray(x)) return x.map(fill);
    if (x instanceof Map) return new Map([...x.entries()].map(([k, v]) => [k, fill(v)]));
    if (x && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fill(v)]));
    return x;
  };
  return { ...(fill(q) as QuestEntry), starts: spring.place, tier: spring.tier };
}

/** `text` with `{hire}` as the name on its `gives: recruit` card; 'Someone' with no draw. */
export function fillHire(text: string, name: string | null): string {
  return text.replaceAll('{hire}', name ?? 'Someone');
}

/** `text` with `{recruit}` as the held recruit's first name (a spring file, crew spec §5); unchanged with none. */
export function fillRecruit(text: string, name: string | null): string {
  return name === null ? text : text.replaceAll('{recruit}', name);
}

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

/**
 * The stock getaway (the table spec §2): a job without its own # getaway plays this when ALARM fills. Parsed once
 * from a small job, so it is an ordinary beat with ordinary outcomes.
 */
export const STOCK_GETAWAY: { beat: Beat; outcomes: Outcome[] } = (() => {
  const r = parseQuestFile(
    'stock-getaway',
    [
      '---',
      'title: Stock getaway',
      'kind: mission',
      'starts: anywhere',
      'after: null',
      'pay: 1',
      '---',
      '',
      '# start',
      '*Nothing.*',
      '',
      '- go: Go. → done',
      '- stay: Stay. → done',
      '',
      '## done',
      '*Nothing.*',
      '→ end',
      '',
      '# getaway',
      "*They're coming. Now.*",
      '',
      '- run: Run for it. → getaway-made / getaway-missed [check reflex 40]',
      '- walk: Walk it off like you belong here. → getaway-made / getaway-missed [check cool 40]',
      '',
      '## getaway-made',
      '*Nobody follows you out. Not yet.*',
      'take: part',
      '→ end',
      '',
      '## getaway-missed',
      '*Hands on your collar before the corner.*',
      'take: none',
      'blown',
      '→ end',
      '',
    ].join('\n'),
    { roster: null, places: null },
  );
  if (!r.ok) throw new Error(`stock getaway: ${JSON.stringify(r.problems)}`);
  return { beat: r.entry.beats.get('getaway')![0], outcomes: ['getaway-made', 'getaway-missed'].map((id) => r.entry.outcomes.get(id)!) };
})();

/** A job's book entry with the stock getaway in it, when its file has none of its own (the table spec §2). */
export function withGetaway(q: QuestEntry): QuestEntry {
  if (q.beats.has('getaway')) return q;
  const beats = new Map(q.beats);
  beats.set('getaway', [STOCK_GETAWAY.beat]);
  const outcomes = new Map(q.outcomes);
  for (const o of STOCK_GETAWAY.outcomes) outcomes.set(o.id, o);
  return { ...q, beats, outcomes };
}
