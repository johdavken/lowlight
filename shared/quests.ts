/**
 * Quest lines (spec 2026-10-16 quest lines): a written story with branches, played in the room as
 * word-for-word beats with choice cards, which the player talks over with their contact first. Each is
 * a file, `world/quests/<id>.md`: front matter, then `# beat` and `## outcome` sections. Pure: the game
 * server, Studio and their tests share these rules.
 */
import type { BoardState } from './deduction';
import type { AccountsState } from './accounts';
import { z } from 'zod';
import { LORE_ID, LORE_ID_MAX, LORE_TITLE_MAX, oneLine, splitFrontMatter, zodProblems, type LoreProblem } from './lore';
import { offTemplate } from './job-template';
import { IMAGE_ID, imageMarkers, isCrewFace, SCENE_FILE, stripImageMarkers, type CastFace, type JobImage } from './narration-images';
import type { Band } from './standing';
import { hhmmOf, minuteOfDay, nextOccurrence, parseHhmm } from './clock';
import type { Deck } from './gear';
import type { Check, KitEvent, Mod } from './mission';
import type { CostId } from './costs';
import type { DiceResult, Effect, NextRoll, Position } from './dice';
import type { Call, Setup } from './hand';
import type { CrewState } from './crew-rules';
import { DEFAULT_STATS, STAT_KEYS, type StatKey, type Stats } from './stats';
import { GUEST_NOTE_MAX } from './contract';
import { GRADES, HIREABLE, normalSpec, SPECIALTIES, type Grade, type Specialty } from './crew-book';
import { forms, type Pronoun } from './pronoun';
import { dominatedOnBeat, parseWay, WAY_WORDS, wayKeyText, wayTags, type CardAt, type Dominance, type Way } from './crew-ways';

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
  | { kind: 'alarm'; op: '=' | '>=' | '<='; value: number }
  // Crew rules: one of the job's own clocks (`hears>=2`).
  | { kind: 'count'; name: string; op: '=' | '>=' | '<='; value: number };

export type Tag = { kind: 'set'; name: string; value: string } | { kind: 'needs'; all: Condition[] } | /** `unheard` (The Fourteenth): the contact doesn't see this card among the choices, or hear it picked. */ { kind: 'unheard' } | { kind: 'clock'; minutes: number } | { kind: 'check'; check: Check } | { kind: 'alarm'; delta: 1 } | { kind: 'effect'; effect: 'big' | 'small' } | CrackTag;

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
  /** Crew rules: a card's ways (`·` lines under it); `to` is then its first `you` way's outcome. Absent: a plain pick. */
  ways?: Way[];
  /** Crew rules: `[short <NAME>]`, the card's name on the board. */
  short?: string;
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
  /** `here: yes` with `room:` (House Glass spec): the contact is in that room as herself, not on the line. */
  here?: true;
  /** `board: <case>` (deduction board spec §3): the beat is the board; ACCUSE resolves it into the outcome named for its verdict. */
  board?: string;
  /** `accounts: <id>` (Two Stories spec §3): the beat is the accounts board; TELL resolves it into `## told`. */
  accounts?: string;
  /** Words marked `{{ }}` in the text: the contact on the line. They read as plain text everywhere but the JOB column. */
  onLine?: string[];
  /** `title: <text>` (routes and posts spec §1): the beat's name on a card that leads to it; see `beatTitle`. */
  title?: string;
  /** `post <id>: <line> [suits <specialty>]` with `gives <id>: <promise>` (routes and posts spec §2): a recruit can be sent here with the pick. */
  post?: { id: string; line: string; gives: string; suits?: Specialty };
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
  /** Its versions (`## id if <condition>`, routes and posts spec §1), on the plain outcome, in file order: the first that holds plays in its place. Each is in the book as `<id>@<n>`. */
  versions?: { when: Condition[]; id: string }[];
}

/** The post a recruit stands at on this run; null: they're with you. */
export const posted = (run: Pick<QuestRun, 'posts'>, rid: string): string | null => Object.entries(run.posts ?? {}).find(([, who]) => who === rid)?.[0] ?? null;

/** A beat's name on a card that leads to it: its `title:`, else its id in capitals with dashes as spaces. */
export const beatTitle = (b: Pick<Beat, 'id' | 'title'>): string => (b.title ?? b.id.replace(/-/g, ' ')).toUpperCase();

/** A job's posts (routes and posts spec §2), one per post id, in file order. */
export function jobPosts(q: Pick<QuestEntry, 'beats'>): NonNullable<Beat['post']>[] {
  const out = new Map<string, NonNullable<Beat['post']>>();
  for (const b of [...q.beats.values()].flat()) if (b.post && !out.has(b.post.id)) out.set(b.post.id, b.post);
  return [...out.values()];
}

/** The outcome that plays for `id` now: its first version that holds, else the plain one. */
export function outcomeFor(q: Pick<QuestEntry, 'outcomes'>, id: string, ctx: CondCtx): Outcome | undefined {
  const o = q.outcomes.get(id);
  const v = o?.versions?.find((x) => holds(x.when, ctx));
  return v ? q.outcomes.get(v.id) : o;
}

export interface Effects {
  /** `post <id>: hurt|held` (routes and posts spec §2): whoever stands at that post takes it when this outcome plays; nothing with the post empty. */
  postHarm?: { post: string; harm: 'hurt' | 'held' };
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
  /** `gives: clue <case> <card>` (deduction board spec §2): clue cards this ending gives, several allowed. */
  clues?: { case: string; card: string }[];
  /** Guest crew spec §3: `guest-note: <text>`, what a brought guest knows now, written to their journal. */
  guestNote?: string;
  /** `settles: <contact id>: <text>`: what this ending settles for that contact, a line in every turn of theirs while the ending stands. */
  settles?: Settled[];
}

/** One `settles:` line: who it's for and what's settled. */
export interface Settled {
  who: string;
  text: string;
  /** `settles: <who> if <condition>: …` (Two Stories spec §3): replaces that contact's plain line when it holds. */
  when?: Condition[];
}

/**
 * The lines an ending settles (Two Stories spec §3): for each contact, the first conditional line that holds, else
 * their plain lines; none matching and no plain line settles nothing. What's returned carries no conditions.
 */
export function settledFor(lines: readonly Settled[], ctx: CondCtx): Settled[] {
  const out: Settled[] = [];
  for (const who of [...new Set(lines.map((l) => l.who))]) {
    const mine = lines.filter((l) => l.who === who);
    const hit = mine.find((l) => l.when && holds(l.when, ctx));
    for (const l of hit ? [hit] : mine.filter((x) => !x.when)) out.push({ who: l.who, text: l.text });
  }
  return out;
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
/** A contact's own job's `text:` (job texts spec §1): what she wants from the player, told to her, never shown. */
export const QUEST_JOB_TEXT_MAX = 300;
/** A job's STORY opening (`opening:`): the scene a new game opens on, as the player reads it. */
export const QUEST_OPENING_MAX = 700;
/** A job's `opening-view:`: why the player is here tonight, told to her, never shown. */
export const QUEST_OPENING_VIEW_MAX = 600;

/** Where a `text:` job's "told" lives (job texts spec §2): story meta in the sender's room. */
export const toldKey = (player: string, id: string) => `told.${player}.${id}`;
/** How she told the player about her job: by text, in the room, or not at all (an old save, a dead key, a stranger). */
export type Told = { how: 'text' | 'room' | 'silent'; at: number };
export function toldOf(raw: string | null): Told | null {
  if (raw === null) return null;
  try {
    const t = JSON.parse(raw) as Partial<Told> | null;
    return t && (t.how === 'text' || t.how === 'room' || t.how === 'silent') && typeof t.at === 'number' ? { how: t.how, at: t.at } : null;
  } catch {
    return null;
  }
}
/** A job's `brief:`, where it is and what the work is. */
export const QUEST_BRIEF_MAX = 240;

export interface QuestEntry {
  id: string;
  title: string;
  /** A mission (spec 2026-10-18): checked choices, effects, and the contact only at the start and the end. */
  kind: 'quest' | 'mission' | 'contract';
  /** A contract's arc (tier 3 contracts spec §2): the two waits in minutes, its groundwork, when it's offered, its rumor. */
  contract?: { night: number; fallout: number; pieces: { id: string; spec: Specialty; line: string }[]; postsAt: number; rumor: string; /** The lead you must hold before it's listed (world/leads id). */ lead?: string; /** Who comes as a guest (guest crew spec §2): a contact and a grade. */ guest?: { id: string; grade: Grade } };
  /** A mission's guest (The Passenger spec, engine §1): offered whenever it runs, no lead. A contract's is `contract.guest`. */
  guest?: { id: string; grade: Grade };
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
  /** A contact's own job (job texts spec §1): what she texts, or says in the room, when its gate opens. */
  text?: string;
  /** Jobs: where it is and what the work is (`brief:`), never how it goes. */
  brief?: string;
  /**
   * A `for:` job's STORY opening (`opening:` and `opening-view:`): a new game for that player with its one contact opens
   * on `text`, and she's told `view`, why they're here tonight, until the job starts.
   */
  opening?: { text: string; view: string };
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
  /** `people: [Lusk, Pell]`: the people this story writes, by name; Cipher truths leave them alone (2026-11-08). */
  people?: string[];
  /** Jobs: `for: <character id>`, the one player it's for. It's theirs, so it's never drawn: it lists whenever it holds. */
  for?: string;
  /** Jobs: `bars: <deck id>`, a deck that stays home: with it on you, you go in with none. */
  bars?: string;
  /** Jobs: `district: <id>`, where its rep, HEAT and tier gate land, when that isn't the district of `starts` (Kroll's desk). */
  district?: string;
  /** Jobs: `hire-at: <place id>`, where a `gives: recruit` ending's free card sits, when that isn't `starts` (Kroll's desk). */
  hireAt?: string;
  /** A rescue (crew spec §5): no `starts:`, `{recruit}` in its text, posted by SPRING THEM. */
  spring?: true;
  /** Rebuilt to its tier's template (tier template spec §4): the parse warns where it's off, and a no-roll pick fills no TAKE. */
  template?: true;
  /** `rules: crew` (crew rules spec): cards list ways instead of checks. */
  rules?: 'crew';
  /**
   * Crew rules: the job's own clocks (`clock <id>: <LABEL> · <size>`), at most two. One may judge
   * (`· trust <contact>`, Kroll's desk): at the end it moves the job's with: contact's trust (`clockTrust`). A last
   * quoted part is its note, what it is in a few words, printed under it on the board (`· "HE RUNS AT 3"`).
   */
  clocks?: { id: string; label: string; size: number; trust?: string; note?: string }[];
  /** `image` lines (narration images spec 2026-11-18): faces its prose marks with `{img <id>}`, in file order. */
  images?: JobImage[];
}

/** A job: a small one (mission) or a contract. */
export const isJob = (q: Pick<QuestEntry, 'kind'>) => q.kind === 'mission' || q.kind === 'contract';

/** A clock's note, at most this long: it sits under the clock, inside its column on the board. */
export const CLOCK_NOTE_MAX = 32;

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
  /** Crew rules: the job's own clocks by id (absent: each 0). */
  counts?: Record<string, number>;
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
    // Crew rules: a job clock, by an id that isn't heat, alarm, a stat or a band (`hears>=2`). `name=N` stays a flag.
    if ((m = /^([a-z][a-z0-9_-]*)\s*(≥|>=|≤|<=)\s*(\d+)$/.exec(part)) && m[1] !== 'trust' && m[1] !== 'warmth') {
      out.push({ kind: 'count', name: m[1], op: op(m[2]), value: Number(m[3]) });
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
      case 'count':
        return cmp(ctx.counts?.[c.name] ?? 0, c.op, c.value);
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
  /** Job texts spec §1: she texts it, or raises it in the room, when the gate opens; the job posts only then. */
  text: oneLine(QUEST_JOB_TEXT_MAX).nullish(),
  brief: oneLine(QUEST_BRIEF_MAX).nullish(),
  /** A `for:` job's STORY opening: the scene a new game opens on, and what she's told about why they're here. */
  opening: oneLine(QUEST_OPENING_MAX).nullish(),
  'opening-view': oneLine(QUEST_OPENING_VIEW_MAX).nullish(),
  'known-by': z.array(oneLine(LORE_ID_MAX)).min(1).nullish(),
  /** The people this story writes, by name (2026-11-08): the Cipher never gives them a secret of its own. */
  people: z.array(oneLine(LORE_TITLE_MAX)).min(1).nullish(),
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
  district: oneLine(LORE_ID_MAX).nullish(),
  'hire-at': oneLine(LORE_ID_MAX).nullish(),
  spring: z.boolean().nullish(),
  template: z.boolean().nullish(),
  /** Crew rules: cards list ways instead of checks. */
  rules: z.enum(['crew']).nullish(),
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
/** Crew rules: a card with ways under it, `- id: The line. [tags]`, no arrow. */
const CARD = /^- ([^:\s]+): (.+?)(?: \[(.+)\])?$/;
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
    else if (t === 'unheard') tags.push({ kind: 'unheard' });
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

/** Crew rules: a card's `[short <NAME>]` taken out of its tags. */
function splitShort(raw: string | undefined): { short?: string; rest: string | undefined } {
  if (!raw) return { rest: raw };
  const parts = raw.split(',').map((x) => x.trim());
  const at = parts.findIndex((x) => /^short .+$/.test(x));
  if (at < 0) return { rest: raw };
  const rest = parts.filter((_, i) => i !== at);
  return { short: parts[at].slice('short '.length).trim(), rest: rest.length ? rest.join(', ') : undefined };
}

function parseBeat(id: string, when: Condition[] | null, lines: string[], problems: QuestProblem[], o: { crew: boolean; clockIds: readonly string[] } = { crew: false, clockIds: [] }): Beat {
  const p = (message: string) => problems.push({ field: id, message });
  /** Crew rules: the card the `·` lines under it belong to; null once anything else comes between. */
  let waysOf: Choice | null = null;
  const text: string[] = [];
  const views: View[] = [];
  const choices: Choice[] = [];
  const segments: Beat['segments'] = [];
  let stranger: Beat['stranger'] = null;
  let song: string | undefined;
  let songWhen: Condition[] | undefined;
  let room: string | undefined;
  let onComms = false;
  let here = false;
  let board: string | undefined;
  let accounts: string | undefined;
  let title: string | undefined;
  const posts: { id: string; line: string; suits?: string }[] = [];
  const gives = new Map<string, string>();
  const onLine: string[] = [];
  const spoken = (l: string) => l.replace(/\{\{(.+?)\}\}/g, (_, q: string) => (onLine.push(q), q));
  let first = true;
  /** The line before was `stranger:` (where `face:` goes). */
  let afterStranger = false;
  /** Crew rules: the way on the line right above, which a `told:` line belongs to. */
  let lastWay: Way | null = null;
  for (const line of lines) {
    const t = line.trim();
    // Kroll's desk: `told: <text>` right under a way is all the contact hears of it.
    if (/^told:/.test(t)) {
      const body = t.slice('told:'.length).trim();
      if (!lastWay) p(`told: goes on the line right under a way (· …): '${t}'`);
      else if (lastWay.told !== undefined) p(`a way has one told: line ('${t}')`);
      else if (!body) p('told: needs what the contact hears (told: <text>)');
      else lastWay.told = body;
      continue;
    }
    lastWay = null;
    // A title, a post and its promise (routes and posts spec): header lines, before or after a stranger.
    const head = /^title:\s*(.+)$/.exec(t);
    if (head) {
      title = head[1];
      continue;
    }
    const pl = /^post ([a-z0-9]+(?:-[a-z0-9]+)*):\s*(.+?)(?:\s*\[suits ([^\]]+)\])?$/.exec(t);
    if (pl) {
      posts.push({ id: pl[1], line: pl[2], ...(pl[3] !== undefined ? { suits: pl[3].trim() } : {}) });
      continue;
    }
    const gl = /^gives ([a-z0-9]+(?:-[a-z0-9]+)*):\s*(.+)$/.exec(t);
    if (gl) {
      gives.set(gl[1], gl[2]);
      continue;
    }
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
    if (/^here:\s*yes$/.test(t)) {
      here = true;
      continue;
    }
    const bd = /^board:\s*([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(t);
    if (bd) {
      board = bd[1];
      continue;
    }
    const ac = /^accounts:\s*([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(t);
    if (ac) {
      accounts = ac[1];
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
    // Crew rules: a way under the card above it.
    if (t.startsWith('·')) {
      if (!o.crew) p(`way lines (·) go only in a job with rules: crew ('${t}')`);
      else if (!waysOf) p(`a way goes right under a card with no → (- id: The line. [tags]): '${t}'`);
      else {
        const w = parseWay(t.slice(1).trim(), o.clockIds);
        if (typeof w === 'string') p(`card ${waysOf.id}: ${w}`);
        else {
          if (w.line.length > QUEST_CHOICE_MAX) p(`card ${waysOf.id}, way ${wayKeyText(w.key)}: at most ${QUEST_CHOICE_MAX} characters (this is ${w.line.length})`);
          waysOf.ways!.push(w);
          lastWay = w;
        }
      }
      continue;
    }
    if (t !== '') waysOf = null;
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
    } else if (t.startsWith('- ') && ((m = CHOICE.exec(t)) || (o.crew && !t.includes('→') && (m = CARD.exec(t))))) {
      // A plain pick (`→ outcome`), or in a crew-rules job a card whose ways follow.
      const card = !t.includes('→');
      const { short, rest } = o.crew ? splitShort(card ? m[3] : m[5]) : { short: undefined, rest: m[5] };
      const tags = parseTags(rest);
      if (typeof tags === 'string') p(`choice ${m[1]}: ${tags}`);
      if (!idOk(m[1])) p(`'${m[1]}' isn't a choice id: lowercase letters, digits and dashes`);
      if (m[2].length > QUEST_CHOICE_MAX) p(`choice ${m[1]}: at most ${QUEST_CHOICE_MAX} characters (this is ${m[2].length})`);
      const all = typeof tags === 'string' ? [] : tags;
      const check = all.find((x): x is Extract<Tag, { kind: 'check' }> => x.kind === 'check')?.check ?? null;
      const crack = all.find((x): x is CrackTag => x.kind === 'crack') ?? null;
      const c: Choice = { id: m[1], line: m[2], to: card ? '' : m[3], fail: card ? null : (m[4] ?? null), check, crack, tags: all.filter((x) => x.kind !== 'check' && x.kind !== 'crack'), ...(card ? { ways: [] } : {}), ...(short !== undefined ? { short } : {}) };
      choices.push(c);
      if (card) waysOf = c;
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
  if (o.crew) {
    if (posts.length > 0) p('no posts in a crew-rules job: HOLD THE DOOR and the ways that read door=held stand in for them');
    for (const c of choices) {
      if (c.check) p(`card ${c.id}: a crew-rules card has no check (its ways say who can do it)`);
      if (c.fail !== null && !c.crack) p(`card ${c.id}: a crew-rules card has no fail outcome ('/ ${c.fail}')`);
      if (!c.ways) continue;
      if (c.crack) p(`card ${c.id}: a [crack] card takes no ways (write it - id: The line. → win / lockout [crack N])`);
      else if (c.ways.length === 0) p(`card ${c.id}: needs ways (· lines right under it), or → an outcome`);
      const you = c.ways.find((w) => w.key.kind === 'you');
      if (c.ways.length > 0 && !you) p(`card ${c.id}: needs a you way (you can always do a card)`);
      else if (you && !c.ways.some((w) => w.key.kind === 'you' && w.when === null)) p(`card ${c.id}: needs a you way with no if (you can always do a card, whatever holds)`);
      c.to = (you ?? c.ways[0])?.to ?? '';
    }
  }
  if (here && room === undefined) p("here: needs a room: (a beat with no room is already where she is)");
  if (here && onComms) p("here: and comms: can't both be on a beat");
  const body = tidy(text);
  if (body === '') p('needs some text');
  if (body.length > QUEST_TEXT_MAX) p(`at most ${QUEST_TEXT_MAX} characters (this is ${body.length})`);
  if (board !== undefined) {
    if (choices.length > 0) p('a board beat has no choices: the board is the move');
  } else if (accounts !== undefined) {
    if (choices.length > 0) p('an accounts beat has no choices: the board is the move');
  } else if (choices.length < QUEST_CHOICES_MIN || choices.length > QUEST_CHOICES_MAX) p(`needs ${QUEST_CHOICES_MIN}–${QUEST_CHOICES_MAX} choices (this has ${choices.length})`);
  const seen = new Set<string>();
  for (const c of choices) if (seen.has(c.id) || !seen.add(c.id)) p(`choice ${c.id} appears twice`);
  if (posts.length > 1) p('one post on a beat');
  let post: Beat['post'];
  const p0 = posts[0];
  if (p0) {
    const suits = p0.suits !== undefined && (SPECIALTIES as readonly string[]).includes(normalSpec(p0.suits) as string) ? (normalSpec(p0.suits) as Specialty) : undefined;
    if (p0.suits !== undefined && !suits) p(`suits: '${p0.suits}' isn't a specialty`);
    if (!gives.has(p0.id)) p(`post ${p0.id} needs a 'gives ${p0.id}:' line`);
    post = { id: p0.id, line: p0.line, gives: gives.get(p0.id) ?? '', ...(suits ? { suits } : {}) };
  }
  for (const g of gives.keys()) if (!posts.some((x) => x.id === g)) p(`gives ${g}: goes with a 'post ${g}:' line on the same beat`);
  return { id, when, stranger, ...(title ? { title } : {}), ...(post ? { post } : {}), ...(song ? { song, ...(songWhen ? { songWhen } : {}) } : {}), ...(room ? { room } : {}), ...(onComms ? { onComms: true as const } : {}), ...(board !== undefined ? { board } : {}), ...(accounts !== undefined ? { accounts } : {}), ...(here ? { here: true as const } : {}), ...(onLine.length ? { onLine } : {}), text: body, segments, views, choices };
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
    else if ((e = /^post ([a-z0-9]+(?:-[a-z0-9]+)*):\s*(hurt|held)$/.exec(t)) && effects.postHarm === undefined) effects.postHarm = { post: e[1], harm: e[2] as 'hurt' | 'held' };
    else if ((e = /^pay:\s*\+(\d+)$/.exec(t)) && effects.bonus === undefined) effects.bonus = Number(e[1]);
    else if (t === 'lost' && effects.lost === undefined) effects.lost = true;
    else if ((e = /^heat:\s*([+-]\d+)$/.exec(t)) && effects.heat === undefined) effects.heat = Number(e[1]);
    else if ((e = /^gives:\s*deck\s+([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(t)) && effects.deck === undefined) effects.deck = e[1];
    else if ((e = /^gives:\s*outfit\s+([a-z0-9]+(?:-[a-z0-9]+)*)\s+([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(t)) && effects.outfit === undefined) effects.outfit = { who: e[1], name: e[2] };
    else if ((e = /^gives:\s*clue\s+([a-z0-9]+(?:-[a-z0-9]+)*)\s+([A-Z][A-Z0-9_-]*)$/.exec(t))) (effects.clues ??= []).unshift({ case: e[1], card: e[2] });
    else if ((e = /^guest-note:\s*(.+)$/.exec(t)) && effects.guestNote === undefined) effects.guestNote = e[1];
    else if ((e = /^settles:\s*([a-z0-9]+(?:-[a-z0-9]+)*)(?:\s+if\s+([^:]+?))?:\s*(.+)$/.exec(t))) {
      const when = e[2] !== undefined ? parseCondition(e[2]) : undefined;
      if (when !== undefined && !Array.isArray(when)) problems.push({ field: id, message: `settles: ${when.message}` });
      (effects.settles ??= []).unshift({ who: e[1], text: e[3], ...(Array.isArray(when) ? { when } : {}) });
    }
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
  for (const line of kept) if (/^(pay|heat|gives|takes|take|hire-pitch):/.test(line.trim()) || line.trim() === 'blown' || line.trim() === 'lost') p(`can't read the effect line '${line.trim()}' (right above the → line, no blank line: pay: 400 / full / half / +150, heat: +2 or -1, gives: deck <id>, gives: outfit <character> <outfit>, gives: clue <case> <CARD>, gives: recruit <specialty> <grade> [man|woman], hire-pitch: <what they say>, takes: deck, take: full / part / none, blown, lost)`);
  for (const line of kept) if (/^(wait|next):/.test(line.trim())) p("wait: and next: go right after the '→' line");
  // ALARM and flags move on a choice's tags, never in an outcome: a line like that would be shown as story.
  for (const line of kept) if (/^alarm:/.test(line.trim()) || /^set [^\s=]+=\S+$/.test(line.trim())) p(`'${line.trim()}' only works on a choice: put [alarm +1] or [set name=value] on the choice that leads here`);
  const text = tidy(kept);
  if (text === '') p('needs some text');
  if (text.includes('{hire}') && !effects.recruit) p('{hire} needs gives: recruit on the same ending');
  if (text.length > QUEST_TEXT_MAX) p(`at most ${QUEST_TEXT_MAX} characters (this is ${text.length})`);
  return { id, text, to: m ? m[1] : 'end', wait, next, effects };
}

/** An outcome id a board's verdict can name (deduction board spec §3). */
export const isVerdictId = (id: string): boolean => id === 'holds' || id === 'thin' || id === 'hunch' || id.startsWith('wrong-');

/** An outfit's key in the kit and the locked set: `<character>/<outfit>`. */
export const outfitKey = (o: { who: string; name: string }) => `${o.who}/${o.name}`;

/** Every outfit some ending gives (`<character>/<outfit>`): each is locked until a run earns it. */
export function rewardOutfits(quests: readonly QuestEntry[]): Set<string> {
  const out = new Set<string>();
  for (const q of quests) for (const o of q.outcomes.values()) if (o.effects.outfit) out.add(outfitKey(o.effects.outfit));
  return out;
}

/** Every outcome a choice can play: its pass, its fail, each of its ways'. */
const plays = (c: Choice): string[] => [c.to, ...(c.fail ? [c.fail] : []), ...(c.ways ?? []).map((w) => w.to)];

/**
 * A beat's dominated ways (crew rules: no best way), by `dominatedOnBeat`: its ways cards, each with its own `[alarm]`
 * and `set` tags, each way's outcome read as written (its `take:` and the beat it goes on to).
 */
export function beatDominance(b: Beat, outcomes: ReadonlyMap<string, Outcome>): Dominance[] {
  const cards: CardAt[] = b.choices.flatMap((c) => (c.ways?.length ? [{ id: c.id, ways: c.ways, alarm: c.tags.reduce((n, t) => n + (t.kind === 'alarm' ? t.delta : 0), 0), sets: c.tags.flatMap((t) => (t.kind === 'set' ? [{ name: t.name, value: t.value }] : [])) }] : []));
  return dominatedOnBeat(cards, (w) => {
    const o = outcomes.get(w.to);
    const take = o?.effects.take;
    return { leaves: take === 'none' || take === 'part' ? take : null, next: o?.to ?? null };
  });
}

/** A `loot:` line's length (roll lifecycle spec): one short thing the GM can name. */
export const LOOT_MAX = 80;

/**
 * A job's `image` lines (narration images spec 2026-11-18): `image <id>` or `image <id>: cast` (the shared cast list's
 * face), `image <id>: <extra id>`, `image <id>: character <id>`, `image <id>: any <tag> [<tag>…]`.
 */
function parseImages(lines: readonly { id: string; raw: string }[], withIds: readonly string[], known: { roster: ReadonlySet<string> | null; extras?: { ids: ReadonlySet<string>; list?: readonly { id: string; tags: readonly string[] }[] } | null; cast?: ReadonlyMap<string, CastFace> | null }, problems: QuestProblem[]): JobImage[] {
  const out: JobImage[] = [];
  for (const l of lines) {
    const field = `image ${l.id}`;
    const bad = (message: string) => problems.push({ field, message });
    if (l.id === 'who') {
      bad("'who' is reserved ({who} fills a name)");
      continue;
    }
    if (!IMAGE_ID.test(l.id)) {
      bad('an image id is lowercase letters, digits and dashes');
      continue;
    }
    if (out.some((x) => x.id === l.id)) {
      bad('appears twice');
      continue;
    }
    const words = l.raw.split(/\s+/).filter(Boolean);
    const castFace = known.cast?.get(l.id);
    let image: JobImage | null = null;
    if (words.length === 0 || (words.length === 1 && words[0] === 'cast')) {
      if (known.cast && !castFace) bad(`'${l.id}' isn't in the cast (world/cast.json): give it a face here or add it there`);
      else image = { id: l.id, source: { kind: 'cast' } };
    } else if (words[0] === 'character' && words.length === 2) {
      if (known.roster && !known.roster.has(words[1])) bad(`no character '${words[1]}'`);
      else if (withIds.includes(words[1])) bad("the job's own contact is on the comms strip, not an image");
      else image = { id: l.id, source: { kind: 'character', id: words[1] } };
    } else if (words[0] === 'any' && words.length > 1) image = { id: l.id, source: { kind: 'any', tags: words.slice(1) } };
    else if (words[0] === 'scene') {
      if (words.length !== 2 || !SCENE_FILE.test(words[1])) bad('a scene is scene <file>: a .webp, .png or .jpg in world/quests/art, lowercase letters, digits and dashes');
      else image = { id: l.id, source: { kind: 'scene', file: words[1] } };
    }
    else if (words.length === 1 && /^[a-z0-9-]+$/.test(words[0])) {
      if (isCrewFace(words[0])) bad(`'${words[0]}' is a crew portrait: recruits wear those`);
      else if (known.extras && !known.extras.ids.has(words[0])) bad(`no extra '${words[0]}'`);
      else image = { id: l.id, source: { kind: 'extra', id: words[0] } };
    } else bad('an image is <extra id>, character <id>, any <tag> [<tag>…], scene <file>, or nothing (its face from the cast)');
    if (!image) continue;
    if (image.source.kind === 'cast' && castFace?.kind === 'character' && withIds.includes(castFace.id)) {
      bad("the job's own contact is on the comms strip, not an image");
      continue;
    }
    if (castFace && image.source.kind !== 'cast') {
      bad(`'${l.id}' is in the cast list with its own face: write image ${l.id}: and nothing else`);
      continue;
    }
    out.push(image);
  }
  // Every `any` draw must find a portrait once crew portraits and the job's other faces are out (drawImages).
  const list = known.extras?.list;
  if (list) {
    const used = new Set<string>();
    for (const i of out) {
      const f = i.source.kind === 'cast' ? known.cast?.get(i.id) : i.source.kind === 'extra' ? i.source : undefined;
      if (f?.kind === 'extra') used.add(f.id);
    }
    for (const i of out) {
      if (i.source.kind !== 'any') continue;
      const tags = i.source.tags;
      const pool = list.filter((e) => !isCrewFace(e.id) && !used.has(e.id) && tags.every((t) => e.tags.includes(t)));
      if (!pool.length) problems.push({ field: `image ${i.id}`, message: `any ${tags.join(' ')}: no portrait left once crew portraits and the job's other faces are out` });
      else used.add(pool[0].id);
    }
  }
  return out;
}

/**
 * Where a job's {img} markers may sit: at the start of a paragraph of a beat's or an outcome's text, for an image the
 * job declares. Anywhere else in the body is a problem; a declared image nothing marks is a warning.
 */
function checkImageMarkers(body: string, images: readonly JobImage[], prose: readonly { field: string; text: string }[], problems: QuestProblem[], warnings: string[], o: { front: string; passive: readonly { field: string; text: string }[] }): void {
  const count = (t: string) => (t.match(/\{img [a-z0-9-]+\}/g) ?? []).length;
  const ids = new Set(images.map((i) => i.id));
  const marked = new Set<string>();
  let inProse = 0;
  for (const p of prose) {
    const lead = imageMarkers(p.text);
    inProse += count(p.text);
    if (count(p.text) > lead.length) problems.push({ field: p.field, message: 'an {img} marker goes at the start of a paragraph' });
    for (const m of lead) {
      if (!ids.has(m.id)) problems.push({ field: p.field, message: `{img ${m.id}}: no image '${m.id}' (an image ${m.id}: line in the front matter)` });
      marked.add(m.id);
    }
  }
  if (count(body) > inProse || count(o.front) > 0) problems.push({ field: 'file', message: "an {img} marker goes only in a beat's or outcome's text, never in the front matter (pitch:, brief:…) or a view, told:, way or card line" });
  for (const p of o.passive) if (count(p.text) > 0) problems.push({ field: p.field, message: 'an {img} marker never goes on a conditional ([…]) line: it could never head a paragraph' });
  for (const i of images) if (!marked.has(i.id)) warnings.push(`image '${i.id}': no {img ${i.id}} marker uses it`);
}

export function parseQuestFile(
  id: string,
  text: string,
  known: { roster: ReadonlySet<string> | null; places: ReadonlySet<string> | null; extras?: { ids: ReadonlySet<string>; tags: ReadonlySet<string>; /** Each portrait's tags, for `image … any` draws (narration images spec); absent: unchecked. */ list?: readonly { id: string; tags: readonly string[] }[] } | null; /** The shared cast list (`world/cast.json`): recurring people's one face. Null or absent: unchecked. */ cast?: ReadonlyMap<string, CastFace> | null; decks?: ReadonlySet<string> | null; outfits?: ReadonlySet<string> | null; /** Guest files' ids (The Passenger spec, engine §2); null or absent: unchecked. */ guests?: ReadonlySet<string> | null; /** Deduction board cases: each case's card ids; null or absent: unchecked. */ cases?: ReadonlyMap<string, ReadonlySet<string>> | null; /** Each case's verdict outcome ids (`verdictsOf`), for board beats. */ caseVerdicts?: ReadonlyMap<string, readonly string[]> | null; /** Accounts files' ids (Two Stories spec §3); their cards come in through `cases`. */ accounts?: ReadonlySet<string> | null; /** The map's district ids, for `district:`; null or absent: unchecked. */ districts?: ReadonlySet<string> | null },
): { ok: true; entry: QuestEntry; warnings: string[] } | { ok: false; problems: QuestProblem[] } {
  const problems: QuestProblem[] = idOk(id) ? [] : [{ field: 'id', message: `must be lowercase letters, digits and dashes, at most ${LORE_ID_MAX}` }];
  const s = splitFrontMatter(text);
  if ('field' in s) return { ok: false, problems: [...problems, s] };
  // `draw <name>: a | b | c` lines (small jobs spec §1) sit beside the fixed keys.
  const draws: { name: string; values: string[] }[] = [];
  // `piece <id>: <line>` lines: what each piece of a contract's groundwork is, for CREW → ERRANDS.
  const pieceLines = new Map<string, string>();
  // `clock <id>: <LABEL> · <size> [· trust <contact>] [· "<note>"]` lines (crew rules): a job's own clocks.
  const clockLines: { id: string; raw: string }[] = [];
  // `image <id>[: <source>]` lines (narration images spec 2026-11-18): the faces its prose's {img <id>} markers show.
  const imageLines: { id: string; raw: string }[] = [];
  const front: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s.front)) {
    const im = /^image\s+(.+)$/.exec(k);
    if (im) {
      imageLines.push({ id: im[1].trim(), raw: v == null ? '' : String(v).trim() });
      continue;
    }
    const cl = /^clock\s+(.+)$/.exec(k);
    if (cl) {
      clockLines.push({ id: cl[1].trim(), raw: String(v ?? '').trim() });
      continue;
    }
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
  const crew = front.rules === 'crew';
  const clocks: NonNullable<QuestEntry['clocks']> = [];
  for (const c of clockLines) {
    const m = /^(.+?)\s*·\s*(\d+)(?:\s*·\s*trust\s+([a-z0-9-]+))?(?:\s*·\s*"([^"]*)")?$/.exec(c.raw);
    const reserved = [...WAY_WORDS, ...STAT_KEYS, 'trust', 'warmth'] as readonly string[];
    if (!crew) problems.push({ field: `clock ${c.id}`, message: 'a clock line goes only in a job with rules: crew' });
    else if (!idOk(c.id) || !/^[a-z]/.test(c.id) || reserved.includes(c.id)) problems.push({ field: `clock ${c.id}`, message: `a clock id is lowercase letters, digits and dashes, and not one of ${reserved.join(', ')}` });
    else if (!m || Number(m[2]) < 1 || Number(m[2]) > 8) problems.push({ field: `clock ${c.id}`, message: 'a clock is <LABEL> · <size>, the size 1–8, like WHAT RUE HEARS · 3, and may judge: · trust <contact>, then a note: · "SHE HEARS THIS"' });
    else if (m[4] !== undefined && (m[4].trim() === '' || m[4].length > CLOCK_NOTE_MAX)) problems.push({ field: `clock ${c.id}`, message: `a clock's note is a few words, 1–${CLOCK_NOTE_MAX} characters` });
    else if (clocks.some((x) => x.id === c.id)) problems.push({ field: `clock ${c.id}`, message: 'appears twice' });
    else clocks.push({ id: c.id, label: m[1], size: Number(m[2]), ...(m[3] ? { trust: m[3] } : {}), ...(m[4] ? { note: m[4].trim() } : {}) });
  }
  if (clocks.length > 2) problems.push({ field: 'clock', message: `at most two clock lines in a job (this has ${clocks.length})` });
  if (clocks.filter((c) => c.trust).length > 1) problems.push({ field: 'clock', message: 'one clock judges at most (· trust <contact>)' });
  const clockIds = clocks.map((c) => c.id);

  // The body's nodes in order: `# id` a beat, `## id` an outcome.
  const nodes: { kind: 'beat' | 'outcome'; id: string; cond: string | null; lines: string[] }[] = [];
  const lead: string[] = [];
  for (const line of s.body.split('\n')) {
    const h = /^(#{1,2})[ \t]+(.+?)\s*$/.exec(line);
    // A version of a beat or an outcome: `# id if <condition>`, `## id if <condition>`.
    const v = h ? /^(\S+)(?:[ \t]+if[ \t]+(.+))?$/.exec(h[2]) : null;
    if (h) nodes.push({ kind: h[1] === '#' ? 'beat' : 'outcome', id: v ? v[1] : h[2], cond: v?.[2] ?? null, lines: [] });
    else if (nodes.length > 0) nodes[nodes.length - 1].lines.push(line);
    else lead.push(line);
  }
  if (lead.join('').trim() !== '') problems.push({ field: 'body', message: 'text before the first # heading' });
  // A crew-rules job's ways each carry their own story in their own outcome, so it holds as many as a contract.
  const nodesMax = front.kind === 'contract' || crew ? CONTRACT_NODES_MAX : QUEST_NODES_MAX;
  if (nodes.length > nodesMax) problems.push({ field: 'file', message: `at most ${nodesMax} beats and outcomes (this has ${nodes.length})` });

  const beats = new Map<string, Beat[]>();
  const outcomes = new Map<string, Outcome>();
  // An outcome's versions (routes and posts spec §1), in file order, until its plain one closes them.
  const versions = new Map<string, NonNullable<Outcome['versions']>>();
  for (const n of nodes) {
    if (!idOk(n.id)) problems.push({ field: n.id, message: `'${n.id}' isn't an id: lowercase letters, digits and dashes` });
    if (n.kind === 'outcome' ? beats.has(n.id) : outcomes.has(n.id) || versions.has(n.id)) problems.push({ field: n.id, message: 'appears twice' });
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
      vs.push(parseBeat(n.id, when ?? (n.cond !== null ? [] : null), n.lines, problems, { crew, clockIds }));
      beats.set(n.id, vs);
    } else if (outcomes.has(n.id)) {
      problems.push({ field: n.id, message: n.cond !== null || outcomes.get(n.id)!.versions ? 'the version without `if` must be the last one, and there can be only one' : 'appears twice' });
    } else if (n.cond !== null) {
      const c = parseCondition(n.cond);
      if (!Array.isArray(c)) problems.push({ field: n.id, message: `if: ${c.message}` });
      // A version is an outcome of its own in the book, `<id>@<n>`: a run records which one played, and every later lookup finds it.
      const vs = versions.get(n.id) ?? [];
      const vid = `${n.id}@${vs.length}`;
      outcomes.set(vid, { ...parseOutcome(n.id, n.lines, problems), id: vid });
      versions.set(n.id, [...vs, { when: Array.isArray(c) ? c : [], id: vid }]);
    } else {
      const vs = versions.get(n.id);
      outcomes.set(n.id, { ...parseOutcome(n.id, n.lines, problems), ...(vs ? { versions: vs } : {}) });
    }
  }
  for (const id of versions.keys()) if (!outcomes.has(id)) problems.push({ field: id, message: 'needs a last version without `if` (the default)' });
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
  // Crew rules: a mission whose cards list ways; it writes its own getaway, and the tier template doesn't apply.
  if (crew) {
    if (f.kind !== 'mission') problems.push({ field: 'rules', message: 'rules: crew goes only on a job (kind: mission)' });
    if (f.template) problems.push({ field: 'template', message: 'rules: crew replaces template: true: drop it' });
    if (!beats.has('getaway')) problems.push({ field: 'body', message: 'a crew-rules job needs a # getaway beat, with ways like any other card' });
  }
  // A judging clock (Kroll's desk) moves the trust of the job's one contact, and replaces a trust: stake rather than adding to it.
  for (const c of clocks) {
    if (!c.trust) continue;
    const own = ownedBy({ with: withIds });
    if (c.trust !== own) problems.push({ field: `clock ${c.id}`, message: `trust ${c.trust}: a judging clock moves the job's one with: contact's trust (with: [${(withIds ?? []).join(', ')}])` });
    if (f.trust != null) problems.push({ field: `clock ${c.id}`, message: 'a job has a trust: line or a judging clock, not both' });
  }
  if (known.roster && withIds) for (const w of withIds) if (!known.roster.has(w)) problems.push({ field: 'with', message: `no character '${w}'` });
  if (known.roster) for (const w of f['known-by'] ?? []) if (!known.roster.has(w)) problems.push({ field: 'known-by', message: `no character '${w}'` });
  const images = parseImages(imageLines, withIds ?? [], known, problems);
  checkImageMarkers(s.body, images, [...[...beats.values()].flat().map((b) => ({ field: b.id, text: b.text })), ...[...outcomes.values()].map((o) => ({ field: o.id, text: o.text }))], problems, warnings, {
    front: Object.values(s.front).filter((v): v is string => typeof v === 'string').join('\n'),
    passive: [...beats.values()].flat().flatMap((b) => (b.segments ?? []).filter((g) => g.when !== null).map((g) => ({ field: b.id, text: g.text }))),
  });
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
  // Job texts (spec 2026-11-09 §1): one contact sends it, when a gate opens.
  if (f.text != null) {
    if (ownedBy({ with: f.with ?? null }) === null) problems.push({ field: 'text', message: "text: needs one with: contact (she's the one who texts)" });
    if (f.after == null) problems.push({ field: 'text', message: "text: needs an after: (it's sent when the gate opens)" });
    // Contracts and story quests list outside the told check (final review I2).
    if (f.kind !== 'mission') problems.push({ field: 'text', message: 'text: goes only on a job (kind: mission)' });
  }

  for (const b of [...beats.values()].flat()) {
    if (b.board !== undefined) {
      if (known.cases && !known.cases.has(b.board)) problems.push({ field: b.id, message: `board: no case '${b.board}'` });
      for (const v of known.caseVerdicts?.get(b.board) ?? []) if (!outcomes.has(v)) problems.push({ field: b.id, message: `board: needs an outcome ## ${v}` });
    }
    if (b.accounts !== undefined) {
      if (known.accounts && !known.accounts.has(b.accounts)) problems.push({ field: b.id, message: `accounts: no accounts file '${b.accounts}'` });
      if (!outcomes.has('told')) problems.push({ field: b.id, message: 'accounts: needs an outcome ## told' });
    }
    for (const v of b.views) if (v.contact !== 'any' && known.roster && !known.roster.has(v.contact)) problems.push({ field: b.id, message: `view ${v.contact}: no such character` });
    const face = b.stranger?.face;
    if (face && known.extras) {
      if ('id' in face && !known.extras.ids.has(face.id)) problems.push({ field: b.id, message: `face: no extra '${face.id}'` });
      if ('tag' in face && !known.extras.tags.has(face.tag)) problems.push({ field: b.id, message: `face: no extra tagged '${face.tag}'` });
    }
    const covered = mission || b.views.some((v) => v.contact === 'any' && v.when === null) || (withIds !== null && withIds.every((w) => b.views.some((v) => v.contact === w && v.when === null)));
    if (!covered) problems.push({ field: b.id, message: "needs a 'view any:' line, or a view for each contact in with" });
    for (const c of b.choices) {
      if (!c.ways && !outcomes.has(c.to)) problems.push({ field: b.id, message: `choice ${c.id} → '${c.to}': no ## outcome by that id` });
      for (const w of c.ways ?? []) if (!outcomes.has(w.to)) problems.push({ field: b.id, message: `card ${c.id}, way ${wayKeyText(w.key)} → '${w.to}': no ## outcome by that id` });
      if (c.ways) {
        // A card is one step on the route: every way's outcome goes on to the same beat.
        const nexts = [...new Set(c.ways.flatMap((w) => (outcomes.has(w.to) ? [outcomes.get(w.to)!.to] : [])))];
        if (nexts.length > 1) problems.push({ field: b.id, message: `card ${c.id}: its ways lead to different beats (${nexts.join(', ')}); every way goes on to the same one` });
      }
      if (c.fail !== null && !outcomes.has(c.fail)) problems.push({ field: b.id, message: `choice ${c.id} / '${c.fail}': no ## outcome by that id` });
      if (c.check && !mission) problems.push({ field: b.id, message: `choice ${c.id}: check goes only in a mission (kind: mission)` });
      if (c.crack && !mission) problems.push({ field: b.id, message: `choice ${c.id}: crack goes only in a mission (kind: mission)` });
      if (c.tags.some((x) => x.kind === 'alarm') && !mission) problems.push({ field: b.id, message: `choice ${c.id}: alarm goes only in a mission (kind: mission)` });
      if (c.check && c.crack) problems.push({ field: b.id, message: `choice ${c.id}: a choice cracks or checks, not both` });
      if ((c.check || c.crack) && c.fail === null) problems.push({ field: b.id, message: `choice ${c.id}: a ${c.crack ? 'crack' : 'check'} needs a fail outcome (→ <pass> / <fail>)` });
      if (!c.check && !c.crack && c.fail !== null) problems.push({ field: b.id, message: `choice ${c.id}: '/ ${c.fail}' is a fail outcome, which needs a check` });
      if (c.check?.red) reds.add(b.id);
    }
    // No best way (crew rules): weighed across the beat's cards, at each ALARM.
    for (const d of beatDominance(b, outcomes)) warnings.push(`${b.id}: at ALARM ${d.alarm}, card ${d.aCard} way ${wayKeyText(d.a.key)} (→ ${d.a.to}) is at least as good as card ${d.bCard} way ${wayKeyText(d.b.key)} (→ ${d.b.to}) on every count and spends nothing more`);
  }
  if (!contracted && pieceLines.size > 0) problems.push({ field: 'groundwork', message: 'piece lines go only in a contract' });
  if (!mission && f.trust != null) problems.push({ field: 'trust', message: 'trust: goes only on a job (kind: mission or contract)' });
  if (!mission && f.once != null) problems.push({ field: 'once', message: 'once: goes only on a job (kind: mission or contract)' });
  if (!mission && f.for != null) problems.push({ field: 'for', message: 'for: goes only on a job (kind: mission or contract)' });
  if (!mission && f.bars != null) problems.push({ field: 'bars', message: 'bars: goes only on a job (kind: mission or contract)' });
  if (f.bars != null && known.decks && !known.decks.has(f.bars)) problems.push({ field: 'bars', message: `no deck '${f.bars}' in world/gear` });
  if (!mission && f.district != null) problems.push({ field: 'district', message: 'district: goes only on a job (kind: mission or contract)' });
  if (f.district != null && known.districts && !known.districts.has(f.district)) problems.push({ field: 'district', message: `no district '${f.district}' on the map` });
  if (!mission && f['hire-at'] != null) problems.push({ field: 'hire-at', message: 'hire-at: goes only on a job (kind: mission or contract)' });
  else if (f['hire-at'] != null && ![...outcomes.values()].some((o) => o.effects.recruit)) problems.push({ field: 'hire-at', message: 'hire-at: goes with gives: recruit on an ending' });
  else if (f['hire-at'] != null && known.places && !known.places.has(f['hire-at'])) problems.push({ field: 'hire-at', message: `no place '${f['hire-at']}' on the map` });
  if (f.for != null && known.roster && !known.roster.has(f.for)) problems.push({ field: 'for', message: `no character '${f.for}'` });
  if ((f.opening == null) !== (f['opening-view'] == null)) problems.push({ field: f.opening == null ? 'opening' : 'opening-view', message: 'opening: and opening-view: go together' });
  else if (f.opening != null && (!mission || f.for == null || withIds?.length !== 1)) problems.push({ field: 'opening', message: 'opening: goes only on a job with for: and one with: contact' });
  // Both would have her raise the same job twice: once from the story, once as her text: job.
  else if (f.opening != null && f.text != null) problems.push({ field: 'opening', message: 'opening: and text: are two ways in: pick one' });
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
  const setFlags = new Set([...beats.values()].flat().flatMap((b) => b.choices.flatMap((c) => [...c.tags.flatMap((t) => (t.kind === 'set' ? [t.name] : [])), ...(c.ways ?? []).flatMap((w) => w.sets.map((x) => x.name))])));
  for (const b of [...beats.values()].flat()) {
    const tf = b.stranger?.temper;
    if (tf && !draws.some((d) => d.name === tf) && !setFlags.has(tf)) problems.push({ field: b.id, message: `temper: '${tf}' isn't a draw or a flag set in this file` });
  }
  // Posts (routes and posts spec §2): on a rolled beat, two in a job, each read by something later, each harm line naming one.
  const postBeats = [...beats.values()].flat().filter((b) => b.post);
  const postIds = [...new Set(postBeats.map((b) => b.post!.id))];
  if (postIds.length > 2) problems.push({ field: 'file', message: 'at most two posts in a job' });
  for (const b of postBeats) if (b.id === 'getaway' || /^push-\d+$/.test(b.id) || !b.choices.some((c) => c.check || c.crack)) problems.push({ field: b.id, message: 'a post goes on a rolled beat' });
  const read = [
    ...[...beats.values()].flat().flatMap((b) => [b.when ?? [], b.songWhen ?? [], ...b.segments.map((x) => x.when ?? []), ...b.views.map((x) => x.when ?? []), ...b.choices.flatMap((c) => [...c.tags.flatMap((t) => (t.kind === 'needs' ? [t.all] : [])), ...(c.check?.mods ?? []).map((m) => m.when), ...(c.crack?.mods ?? []).map((m) => m.when), ...(c.ways ?? []).map((w) => w.when ?? [])])]),
    ...[...outcomes.values()].flatMap((o) => (o.versions ?? []).map((v) => v.when)),
  ].flat();
  const readFlags = new Set(read.flatMap((c) => (c.kind === 'flag' || c.kind === 'set' ? [c.name] : [])));
  // A count (`hears>=2`) reads one of the job's own clocks: any other name is a mistake, not a clock at 0.
  const counted = [...read, ...(after ?? []), ...[...outcomes.values()].flatMap((o) => (o.effects.settles ?? []).flatMap((x) => x.when ?? []))];
  for (const name of new Set(counted.flatMap((c) => (c.kind === 'count' ? [c.name] : [])))) if (!clockIds.includes(name)) problems.push({ field: 'file', message: `'${name}' isn't a clock in this job (a condition like ${name}>=2 reads a clock <id>: line)` });
  const harmed = new Set([...outcomes.values()].flatMap((o) => (o.effects.postHarm ? [o.effects.postHarm.post] : [])));
  for (const id of postIds) if (!readFlags.has(`post.${id}`) && !harmed.has(id)) problems.push({ field: 'file', message: `post ${id}: no later beat or outcome reads post.${id}` });
  for (const o of outcomes.values()) if (o.effects.postHarm && !postIds.includes(o.effects.postHarm.post)) problems.push({ field: o.id, message: `no post '${o.effects.postHarm.post}' in this file` });
  // A wait's missed-it path plays without a pick, so it writes no deal (arrangement mid-run review I1).
  const missedTargets = new Set([...outcomes.values()].flatMap((o) => (o.wait?.else ? [o.wait.else] : [])));
  // A pick row knows its card by id (unheardIds), so an [unheard] card's id belongs to one beat (its variants may share it).
  for (const id of unheardIds({ beats })) {
    const homes = [...beats].filter(([, vs]) => vs.some((b) => b.choices.some((c) => c.id === id))).length;
    if (homes > 1) problems.push({ field: id, message: `an [unheard] card's id is used by another card in this file: ${id}` });
  }
  for (const o of outcomes.values()) {
    const { arrangement, ...jobEffects } = o.effects;
    if (arrangement && missedTargets.has(o.id)) problems.push({ field: o.id, message: "arrangement: can't be reached by a wait's else (a deal is struck by a pick)" });
    if (!mission && Object.keys(jobEffects).length > 0) problems.push({ field: o.id, message: 'pay:, heat:, gives: and takes: go only in a mission (kind: mission)' });
    // A crew-rules job's HEAT is only what its ways' `heat N` landed: an outcome's `heat:` would never land.
    if (crew && o.effects.heat !== undefined) problems.push({ field: o.id, message: "heat: doesn't land on a crew-rules job: on crew rules HEAT comes from a way's `heat N`" });
    for (const s of o.effects.settles ?? []) {
      if (o.to !== 'end') problems.push({ field: o.id, message: 'settles: goes on an outcome that ends (→ end)' });
      if (s.text.length > SETTLES_MAX) problems.push({ field: o.id, message: `settles: at most ${SETTLES_MAX} characters (this is ${s.text.length})` });
      if (known.roster && !known.roster.has(s.who)) problems.push({ field: o.id, message: `settles: no contact '${s.who}'` });
    }
    if (o.effects.guestNote !== undefined) {
      if (f.guest == null || !contracted) problems.push({ field: o.id, message: 'guest-note: needs a guest: on the contract' });
      if (o.to !== 'end') problems.push({ field: o.id, message: 'guest-note: goes on an outcome that ends (→ end)' });
      if (o.effects.guestNote.length > GUEST_NOTE_MAX) problems.push({ field: o.id, message: `guest-note: at most ${GUEST_NOTE_MAX} characters (this is ${o.effects.guestNote.length})` });
    }
    // The arrangement (spec 2026-10-20): a quest with one contact strikes that contact's deal.
    if (arrangement && (mission || ownedBy({ with: withIds }) === null)) problems.push({ field: o.id, message: 'arrangement: goes only in a quest with one contact (not a job)' });
    if (o.to === 'back' && !contracted) problems.push({ field: o.id, message: "'→ back' goes only in a contract" });
    if (typeof o.effects.deck === 'string' && known.decks && !known.decks.has(o.effects.deck)) problems.push({ field: o.id, message: `gives: no deck '${o.effects.deck}' in world/gear/decks.md` });
    for (const c of o.effects.clues ?? []) {
      const cards = known.cases?.get(c.case);
      if (known.cases && !cards) problems.push({ field: o.id, message: `gives: clue: no case '${c.case}'` });
      else if (cards && !cards.has(c.card)) problems.push({ field: o.id, message: `gives: clue: no card '${c.card}' in ${c.case}` });
    }
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
  const pushOutcomes = new Set(pushBeats.flatMap((id) => beats.get(id)!.flatMap((b) => b.choices.flatMap(plays))));
  if (pushBeats.length > 0 && !mission) problems.push({ field: 'body', message: 'push beats go only in a job (kind: mission or contract)' });
  for (const id of pushBeats) {
    const n = Number(id.slice(5));
    if (!PUSH_ID.test(id)) problems.push({ field: id, message: 'at most three push beats (push-1 to push-3)' });
    else if (n > 1 && !beats.has(pushBeatId(n - 1))) problems.push({ field: id, message: `${id} needs ${pushBeatId(n - 1)}` });
    for (const b of beats.get(id)!)
      for (const c of b.choices) {
        if ((c.check || c.crack) && c.fail !== null && !outcomes.get(c.fail)?.effects.lost) problems.push({ field: id, message: `choice ${c.id}: a push check fails to an outcome with lost` });
        // The pay is settled before a push beat plays, so a cut there would take nothing and still show on the debrief.
        for (const w of c.ways ?? []) if (w.cut > 0) problems.push({ field: id, message: `card ${c.id}, way ${wayKeyText(w.key)}: no cut on a push beat (the pay is settled by then)` });
      }
  }
  const otherOutcomes = new Set([...beats.entries()].filter(([id]) => !pushBeats.includes(id)).flatMap(([, vs]) => vs.flatMap((b) => b.choices.flatMap(plays))));
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
    const ends = new Set(getaway.flatMap((b) => b.choices.flatMap(plays)));
    // A crew-rules job's getaway may go on to a beat of its own (Run Sheet's Grey Car); checked once `next` is known, below.
    for (const id of ends) if (outcomes.get(id) && outcomes.get(id)!.to !== 'end' && !(crew && beats.has(outcomes.get(id)!.to))) problems.push({ field: id, message: "a getaway's outcome ends the job (→ end)" });
  }
  for (const o of outcomes.values()) if (o.to === 'getaway') problems.push({ field: o.id, message: "→ 'getaway': a getaway is reached only by a full ALARM" });

  // Every node reachable from the first beat, and every node able to reach an end.
  const next = (nid: string): string[] => {
    const vs = beats.get(nid);
    // A board beat leads to its verdicts' outcomes (deduction board spec §3).
    if (vs) return vs.flatMap((b) => [...b.choices.flatMap(plays), ...(b.board ? [...outcomes.keys()].filter(isVerdictId) : []), ...(b.accounts ? ['told'] : [])]).filter((t) => outcomes.has(t));
    const o = outcomes.get(nid);
    if (!o) return [];
    const to = o.to !== 'end' && beats.has(o.to) ? [o.to] : [];
    // A missed deadline's path is a way on too.
    const missed = o.wait?.else && (beats.has(o.wait.else) || outcomes.has(o.wait.else)) ? [o.wait.else] : [];
    return [...to, ...missed, ...(o.versions ?? []).map((v) => v.id)];
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
    // A mission may bring a guest with no lead (The Passenger spec, engine §1); a quest that is no job may not.
    if (f.guest != null && !mission) problems.push({ field: 'guest', message: 'only a contract or a mission has a guest' });
    else if (f.guest != null && !guest) problems.push({ field: 'guest', message: 'guest: is a contact and a grade, like ember VET' });
    else if (guest && known.guests && !known.guests.has(guest.id) && !known.roster?.has(guest.id)) problems.push({ field: 'guest', message: `no character or guest '${guest.id}'` });
  }
  // `{who}` (crew rules): the first name of whoever did the way that plays it, so only an outcome nobody but a recruit, a
  // program or the contact plays; you, a plain pick or a check never fills it.
  for (const o of outcomes.values()) {
    if (!o.text.includes('{who}')) continue;
    const base = o.id.split('@')[0];
    const by = [...beats.values()].flat().flatMap((b) => b.choices.flatMap((c) => (c.ways ? c.ways.filter((w) => w.to === base).map((w) => w.key.kind) : c.to === base || c.fail === base ? ['plain'] : [])));
    if (!crew || by.length === 0 || by.some((k) => k === 'you' || k === 'plain')) problems.push({ field: o.id, message: "{who} goes only in a crew-rules outcome that no you way or plain pick plays (it's the name of the recruit, program or contact who did the way)" });
  }
  // A way's `told:` fills `{who}` the same way, so only on a way someone other than you does.
  for (const b of [...beats.values()].flat())
    for (const c of b.choices)
      for (const w of c.ways ?? [])
        if (w.key.kind === 'you' && w.told?.includes('{who}')) problems.push({ field: b.id, message: `card ${c.id}, way ${wayKeyText(w.key)}: {who} goes in a told: only on a way someone other than you does (it's the name of the recruit, program or contact who did it)` });
  // Crew rules: a getaway's outcome that goes on to a beat must lead only to the job's end from there, never back into
  // its ordinary beats, a push beat or the getaway itself.
  if (crew && getaway) {
    const walk = (from: string[]): Set<string> => {
      const seen = new Set<string>(from);
      for (const queue = [...from]; queue.length > 0; ) for (const t of next(queue.shift()!)) if (!seen.has(t) && seen.add(t)) queue.push(t);
      return seen;
    };
    const ordinary = walk([first, ...arcBeats.filter((b) => beats.has(b))]);
    for (const id of new Set(getaway.flatMap((b) => b.choices.flatMap(plays)))) {
      const to = outcomes.get(id)?.to;
      if (!to || to === 'end' || !beats.has(to)) continue;
      const after = [...walk([to])].filter((n) => beats.has(n));
      const back = after.find((n) => n === 'getaway' || pushBeats.includes(n) || ordinary.has(n));
      if (back) problems.push({ field: id, message: `a getaway's outcome goes on to a beat that ends the job, never back into it ('${to}' leads to '${back}')` });
      // Past the getaway nobody is sent: that beat's picks are plain.
      for (const n of after) if ((beats.get(n) ?? []).some((b) => b.choices.some((c) => c.ways?.length))) problems.push({ field: n, message: `a beat after the getaway ('${n}') has plain picks only, no ways` });
    }
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
  const entry: QuestEntry = { id, title: f.title, ...(f.drops ? { drops: f.drops } : {}), kind: contracted ? 'contract' : mission ? 'mission' : 'quest', ...(contracted ? { contract: { night: span(f.night!)!, fallout: span(f.fallout!)!, pieces: pieces.map(([pid, spec]) => ({ id: pid, spec: spec as Specialty, line: pieceLines.get(pid) ?? '' })), postsAt: Number(f['posts-at']), rumor: f.rumor!, ...(f.lead ? { lead: f.lead } : {}), ...(guest ? { guest } : {}) } } : {}), ...(!contracted && mission && guest ? { guest } : {}), pay: payRange ? payRange[0] : null, tier: (f.tier != null ? Number(f.tier) : 1) as 1 | 2 | 3 | 4, payRange, minutes: f.minutes != null ? Number(f.minutes) : null, draws, art: f.art ?? null, with: withIds, starts: f.starts ?? '', after, pitch: f.pitch ?? null, ...(f['posted-by'] ? { postedBy: f['posted-by'] } : {}), ...(f.text ? { text: f.text } : {}), ...(f.brief ? { brief: f.brief } : {}), ...(f.opening && f['opening-view'] ? { opening: { text: f.opening, view: f['opening-view'] } } : {}), ...(f['known-by'] ? { knownBy: f['known-by'] } : {}), ...(f.people ? { people: f.people } : {}), timed, first, beats, outcomes, posts: f.posts ? (f.posts.split('-').map((t) => parseHhmm(t)!) as [number, number]) : null, commsAt: f.comms ?? null, trust: f.trust ? (f.trust.split('/').map((x) => Number(x.trim())) as [number, number]) : null, ...(f.once ? { once: true as const } : {}), ...(f.for ? { for: f.for } : {}), ...(f.bars ? { bars: f.bars } : {}), ...(f.district ? { district: f.district } : {}), ...(f['hire-at'] ? { hireAt: f['hire-at'] } : {}), ...(f.spring ? { spring: true as const } : {}), ...(f['take-size'] != null ? { takeSize: Number(f['take-size']) } : {}), ...(f.loot ? { loot: f.loot.trim() } : {}), ...(f.template || contracted ? { template: true as const } : {}), ...(crew ? { rules: 'crew' as const } : {}), ...(clocks.length > 0 ? { clocks } : {}), ...(images.length > 0 ? { images } : {}) };
  if (entry.template) warnings.push(...offTemplate(entry));
  return { ok: true, warnings, entry };
}

/** A quest run, stored as story meta `quest.<player>.<id>` in the contact's room.db. */
export interface QuestRun {
  /** NEXT ROLL costs waiting for the next checked pick in this job (roll lifecycle spec §1.1). */
  next?: NextRoll;
  /** Which of `next` are NEXT ROLL costs, not a setup's (2026-11-08): they wait past cracks and no-roll picks for a dice check. */
  owed?: { worse?: true; small?: true };
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
  /** Who stands at which post (routes and posts spec §2): post id → recruit id. They're away for the rest of the job. */
  posts?: Record<string, string>;
  /** The beat it stands at; null once it has ended, or while it waits. */
  beat: string | null;
  /** Which version of that beat is playing (chosen when it played; never re-chosen mid-beat). */
  variant: number;
  /** What it waits for before its next beat plays (quest waits spec §3); null: not waiting. */
  wait: RunWait | null;
  /** `take` / `alarm`: what a job's pick changed on those clocks (SO FAR on the table, 2026-11-15); absent on older runs and when nothing moved. */
  /** `told`: a crew-rules pick's line as the contact was told it (`crewPickLine`, a throw's line); absent on others and old picks. */
  picks: { beat: string; choice: string; roll?: Roll; crack?: CrackPick; take?: number; alarm?: number; told?: string }[];
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
  /** `texts`: the parts `text` joins, kept apart so each can find its recorded clip (voiced job beats); absent on older saves. */
  pendingCover?: { outcome: string; text: string; texts?: string[]; pick?: { choice: string; line: string; roll?: Roll; cost?: string; toldAs?: string }; minutes: number } | null;
  /** A mission's changes to the kit (missions spec §1): folded with every other run's into sol, heat, deck and EDGE. */
  kit?: KitEvent[];
  /** A failed check waiting on REROLL or TAKE IT (missions spec §3); absent or null: none. */
  pending?: DicePending | LegacyPending | null;
  /** When it was last written (ms): the later run wins a flag two quests both set. */
  at: number;
  /** Each stranger's face in this run, name → extra id (stranger faces spec §5); absent: none drawn. */
  faces?: Record<string, string>;
  /** Narration images (spec 2026-11-18): `any` faces drawn at the run's start, and the images shown so far (first time only). */
  images?: { drawn: Record<string, string>; shown: string[] };
  /** Pressing on (spec 2026-10-29 §3): the push after the take; absent until one is offered. */
  push?: PushState;
  /** The deduction board on a board beat (deduction board spec §3). */
  board?: BoardState;
  /** The accounts board on an accounts beat (Two Stories spec §3). */
  accounts?: AccountsState;
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
  /** Crew rules (spec 2026-11-17): the hand's goes, the job's clocks, the beat's mods and what lands at the end; on, and only on, a crew-rules run. */
  crew?: CrewState;
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
  /** `missed`: a crew-rules throw that failed on the push beat, so nothing was won (crew rules, last pass B1); absent on others. */
  log: { beat: string; choice: string; result: 'won' | 'lost'; sol: number; missed?: true }[];
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
/**
 * Whether a dice check can still come after `outcome` (NEXT ROLL costs, 2026-11-08): through the beats its normal outcomes
 * lead to, any variant, past cracks and no-roll picks. GET OUT and push beats don't count: no outcome leads there. It says
 * a roll is reachable, not that the route taken will reach it.
 */
export function diceAhead(q: QuestEntry, outcome: string | undefined): boolean {
  const seen = new Set<string>();
  const todo: string[] = [];
  const follow = (o: string | null | undefined) => {
    const out = o ? q.outcomes.get(o) : undefined;
    // Any version of it may be the one that plays (routes and posts spec §1).
    for (const v of out?.versions ?? []) follow(v.id);
    const to = out?.to;
    if (to && to !== 'end' && to !== 'back' && to !== 'getaway' && !/^push-\d+$/.test(to) && !seen.has(to)) {
      seen.add(to);
      todo.push(to);
    }
  };
  follow(outcome);
  while (todo.length > 0) {
    for (const beat of q.beats.get(todo.pop()!) ?? [])
      for (const c of beat.choices) {
        if (c.check) return true;
        follow(c.to);
        follow(c.fail);
        for (const w of c.ways ?? []) follow(w.to);
      }
  }
  return false;
}

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
/** Where a job's `gives: recruit` card sits (crew spec §5): its `hire-at:`, else where it starts. */
export const hirePlace = (q: Pick<QuestEntry, 'starts' | 'hireAt'>): string => q.hireAt ?? q.starts;

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
  guest: z.object({ id: z.string(), name: z.string(), accent: z.string(), portrait: z.string().nullable(), spec: z.preprocess(normalSpec, z.enum(SPECIALTIES)), grade: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), abilities: z.array(z.string()), kind: z.literal('guest').optional(), art: z.string().optional(), line: z.string().optional() }).optional(),
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
const callSchema = z.object({ beat: z.string(), choice: z.string(), card: z.string(), again: z.boolean(), at: z.number(), loss: z.enum(['hurt', 'held']).optional(), ability: z.string().optional(), post: z.string().optional() });

const runSchema = z.object({
  next: z.object({ worse: z.literal(true).optional(), small: z.literal(true).optional(), better: z.literal(true).optional(), die: z.literal(true).optional(), noCut: z.literal(true).optional() }).optional(),
  owed: z.object({ worse: z.literal(true).optional(), small: z.literal(true).optional() }).optional(),
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
      take: z.number().int().optional(),
      alarm: z.number().int().optional(),
      told: z.string().optional(),
      crack: z.object({ moves: z.array(z.union([z.object({ word: z.string() }), z.object({ bracket: z.number().int() })])), state: z.enum(['granted', 'locked']), tries: z.number().int() }).optional(),
    }),
  ),
  flags: z.record(z.string(), z.string()),
  posts: z.record(z.string(), z.string()).optional().catch(undefined),
  done: z.boolean(),
  draws: z.record(z.string(), z.string()).optional(),
  pay: z.number().optional(),
  alarm: z.number().int().min(0).max(4).optional(),
  takeFill: z.number().int().min(0).optional(),
  getaway: z.literal(true).optional(),
  payCeiling: z.number().optional(),
  take: z.enum(['full', 'part', 'none']).optional(),
  blown: z.boolean().optional(),
  /** The deduction board's state on a board beat (deduction board spec §3). */
  board: z
    .object({
      tried: z.record(z.string(), z.enum(['filed', 'bounced'])),
      filed: z.array(z.string()),
      blanks: z.object({ WHO: z.string().optional(), HOW: z.string().optional(), WHY: z.string().optional() }),
      suspect: z.string().nullable(),
      patience: z.number().int().min(0),
    })
    .optional(),
  /** The accounts board's state on an accounts beat (Two Stories spec §3). */
  accounts: z
    .object({
      placed: z.record(z.string(), z.record(z.string(), z.string())),
      pressed: z.record(z.string(), z.array(z.string())),
      marked: z.array(z.string()),
      patience: z.record(z.string(), z.number().int().min(0)),
      leaked: z.array(z.string()),
      told: z.literal(true).optional(),
    })
    .optional(),
  push: z
    .object({
      stage: z.number().int().min(0),
      pot: z.number(),
      from: z.number().int().min(0),
      outcome: z.string(),
      state: z.enum(['offer', 'playing', 'won', 'walked', 'lost']),
      log: z.array(z.object({ beat: z.string(), choice: z.string(), result: z.enum(['won', 'lost']), sol: z.number(), missed: z.literal(true).optional() })),
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
  // A bad crew field falls back to its fresh value, and a bad crew to a fresh one: never dropped, or a crew-rules run
  // would read as a Graft run (its cards have no checks).
  crew: z
    .object({
      goes: z
        .record(z.string(), z.unknown())
        .transform((r) => Object.fromEntries(Object.entries(r).filter((e): e is [string, 'spent' | 'door' | 'hurt' | 'held'] => e[1] === 'spent' || e[1] === 'door' || e[1] === 'hurt' || e[1] === 'held')))
        .catch({}),
      clocks: z
        .record(z.string(), z.unknown())
        .transform((r) => Object.fromEntries(Object.entries(r).filter((e): e is [string, number] => Number.isInteger(e[1]))))
        .catch({}),
      mods: z.object({ noAlarm: z.literal(true).optional().catch(undefined), noHeat: z.literal(true).optional().catch(undefined), plusTake: z.literal(true).optional().catch(undefined), wall: z.literal(true).optional().catch(undefined) }).catch({}),
      modsBeat: z.string().nullable().catch(null),
      cut: z.number().catch(0),
      heat: z.number().catch(0),
    })
    .optional()
    .catch(() => ({ goes: {}, clocks: {}, mods: {}, modsBeat: null, cut: 0, heat: 0 })),
  spring: z.object({ recruit: z.string(), place: z.string(), tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]) }).optional(),
  recruit: z.object({ spec: z.preprocess(normalSpec, z.enum(HIREABLE as [Specialty, ...Specialty[]])), grade: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]), sex: z.enum(['man', 'woman']).optional(), pitch: z.string().optional() }).optional(),
  guestNote: z.string().optional(),
  settles: z.array(z.object({ who: z.string(), text: z.string() })).optional(),
  pendingCover: z.object({ outcome: z.string(), text: z.string(), pick: z.object({ choice: z.string(), line: z.string(), roll: rollSchema.optional(), cost: z.string().optional(), toldAs: z.string().optional() }).optional(), minutes: z.number() }).nullable().optional(),
  at: z.number(),
  faces: z.record(z.string(), z.string()).optional(),
  images: z.object({ drawn: z.record(z.string(), z.string()), shown: z.array(z.string()) }).optional(),
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
        clue: z.array(z.string()).optional(),
        // Spent (negative), or given back by a NERVE +1 ability (crew abilities spec §2).
        nerve: z.number().int().max(2).optional(),
        edge: z.literal(-1).optional(),
        lift: z.literal(true).optional(),
        rep: z.object({ district: z.string(), delta: z.number() }).optional(),
        cover: z.object({ id: z.enum(['burner', 'fall-guy']), delta: z.number() }).optional(),
        // A foil dropped (+1) or used up (−1) (owned programs).
        program: z.object({ id: z.string(), foil: z.number().int().optional() }).optional(),
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
/**
 * A job run's story flags (playtest 2026-11-10): the ones its file's cards set with `[set …]`, and a board's verdict
 * (`case.<id>`). Not its draws, crew prep or guest flags, which belong to that night's job only. A later job reads
 * these, so an arc's acts can follow each other (The Fourteenth's nix4, House Glass's nix1, The Passenger's ear1).
 */
export function storyFlagsOf(q: Pick<QuestEntry, 'beats'>, run: Pick<QuestRun, 'flags'>, also: Iterable<string> = []): Record<string, string> {
  // A card's `[set]` and, on a crew-rules job, a way's own `set` (crew rules spec): an arc reads either.
  const set = new Set([...q.beats.values()].flat().flatMap((b) => b.choices.flatMap((c) => [...c.tags.flatMap((t) => (t.kind === 'set' ? [t.name] : [])), ...(c.ways ?? []).flatMap((w) => w.sets.map((x) => x.name))])));
  for (const k of also) set.add(k);
  // Boards' verdicts: the deduction board's case.*, the accounts board's story.* (`also` is what its cards cost).
  return Object.fromEntries(Object.entries(run.flags).filter(([k]) => set.has(k) || k.startsWith('case.') || k.startsWith('story.')));
}

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

/**
 * A crew-rules pick's line, as the row keeps it and the contact is told it (crew rules spec, The contact): the way's line
 * (an imperative) and who did it. You read as yours ("You hunt and peck."), her own way as yours and done ("You ask her
 * to take the lacquer off. She does it.", by `pronoun`); a recruit is sent ("You sent Kit: Lift his whole session."), a program run ("You ran FIREWALL: …").
 * `name`: the recruit's first name or the program's name in capitals.
 */
export function crewPickLine(o: { by: 'you' | 'contact' | 'recruit' | 'program'; name?: string; line: string; pronoun?: Pronoun }): string {
  if (o.by === 'recruit') return `You sent ${o.name}: ${o.line}`;
  if (o.by === 'program') return `You ran ${o.name}: ${o.line}`;
  // Her own way says she did it, not only that she was asked (live check: she said she could).
  // By her pronoun ("She does it.", "He does it.", "They do it."); `they` when unknown.
  if (o.by === 'contact') {
    const f = forms(o.pronoun ?? 'they');
    return `${pickLine(o.line)} ${f.she[0].toUpperCase()}${f.she.slice(1)} do${f.s ? 'es' : ''} it.`;
  }
  return pickLine(o.line);
}

/**
 * What a crew-rules way cost, in story words for the contact (last pass C: told only the pick, she said "Nobody's
 * looking at you twice" after a way that raised ALARM). One clause per kind that landed, in this order; '' when nothing
 * did. Never a number or a game term. A job's own clock adds nothing: her view lines read it.
 */
export function crewCostWords(o: { alarm: number; heat: number; cut: number; lose: number; none: boolean; harm?: { name: string; loss: 'hurt' | 'held' } | null }): string {
  return [
    o.alarm > 0 ? 'It drew notice.' : null,
    o.heat > 0 ? 'It left a trace.' : null,
    o.cut > 0 ? 'It cost part of the fee.' : null,
    o.lose > 0 ? 'Some of the take was lost.' : null,
    o.none ? 'Nothing came away from it.' : null,
    o.harm ? `${o.harm.name} was ${o.harm.loss}.` : null,
  ]
    .filter((x): x is string => x !== null)
    .join(' ');
}

/** What the contact thinks at this beat: their own view, or `view any`, then whichever gated lines hold. */
export function beatViews(beat: Beat, ctx: CondCtx): string {
  const own = beat.views.filter((v) => v.contact === ctx.with);
  const plain = own.find((v) => v.when === null) ?? beat.views.find((v) => v.contact === 'any' && v.when === null);
  const gated = [...own, ...beat.views.filter((v) => v.contact === 'any')].filter((v) => v.when !== null && holds(v.when, ctx));
  return [plain, ...gated].filter((v): v is View => v !== undefined).map((v) => v.text).join(' ');
}

/** A beat the contact only hears: the picture is somewhere else, or they're on the line. */
export const beatAway = (beat: Pick<Beat, 'room' | 'onComms' | 'here'>): boolean => beat.here !== true && (beat.room !== undefined || beat.onComms === true);

/**
 * Job and quest text is written to the player, so its "you" is them and its "she" may be the contact reading it.
 * Unsaid, she answered as the player (Run Sheet, playtest: 3 takes of 3). `away`: she gets what she heard, not what they saw.
 */
const toldTo = (player: string, away: boolean, here = false): string =>
  `(told to ${player}, so "you" here is ${player}${away ? `; you weren't there, and this is all you heard on the line` : here ? `; you're there with them, in person` : ''})`;

/**
 * What the contact heard of a beat they aren't at: the player's pick and the words marked `{{ }}`. The rest of the beat
 * is what the player saw; a label asking her not to know it still leaked (Run Sheet's stamp, 2 takes of 3).
 */
/** An `[unheard]` card: the contact isn't shown it among the choices, and doesn't hear it picked. */
export const isUnheard = (c: Pick<Choice, 'tags'>): boolean => c.tags.some((t) => t.kind === 'unheard');

/** The ids of a job's `[unheard]` cards. A pick row knows its card by id, so the parse keeps those ids to one beat. */
export const unheardIds = (q: Pick<QuestEntry, 'beats'>): Set<string> => new Set([...q.beats.values()].flat().flatMap((b) => b.choices.filter(isUnheard).map((c) => c.id)));

export function heardAt(beat: Pick<Beat, 'onLine'>, pick?: string): string {
  return [pick, ...(beat.onLine ?? [])].filter(Boolean).join(' ') || 'Nothing came over the line.';
}

/** The contact's `[quest]` block for the beat (spec §3): only this beat, only shown choices, only their view. */
export function questBlock(q: QuestEntry, beat: Beat, ctx: CondCtx, oneLine: (s: string) => string, shown = false, player?: string, o: { views?: boolean } = {}): string {
  // An [unheard] card is the player's own business: she isn't shown it (The Fourteenth's dug pick).
  const choices = shownChoices(beat, ctx)
    .filter((c) => !isUnheard(c))
    .map((c) => lowerFirst(c.line).replace(/[.!?…]+$/, ''))
    .join('; ');
  const views = beatViews(beat, ctx);
  const who = beat.stranger?.name ?? 'someone here';
  const knows = beat.stranger ? ` ${beat.stranger.name} knows only what is written above: give them no new facts, and they stay where they are, waiting.` : '';
  const tag = isJob(q) ? 'job' : 'quest';
  return (
    `[${tag} — ${q.title}. Where it stands${!shown && player ? ` ${toldTo(player, beatAway(beat), beat.here === true)}` : ''}: ${shown ? `the [${tag} — ${q.title}: …] line at the end of this message, which they have just read` : oneLine(beatAway(beat) ? heardAt(beat) : stripImageMarkers(beat.text))}\n` +
    // A board beat (deduction board spec §3): no choices, the board is the move; she talks it through and never names anyone.
    (beat.accounts !== undefined
      ? ` ${player ?? 'They'} is working out what to say about that night, to you and to the others asking: what to tell, and what to leave out. It's theirs to work.\n` +
        (o.views === false ? '' : ` What you think: ${views}\n`) +
        ` Talk as yourself. Don't say what you already know about that night or answer for them; ask what you'd ask, and wait. Don't guess at what comes after.]`
      : beat.board !== undefined
      ? ` ${player ?? 'They'} is working the case on the board: pairing what they've found, filing what holds, naming who. It's theirs to work.\n` +
        (o.views === false ? '' : ` What you think: ${views}\n`) +
        ` Talk it through as yourself. Don't name anyone or solve it for them, and don't say which of their cards clash; say what you'd watch for, and wait. Don't guess at what comes after.]`
      :     ` The choices in front of them: ${choices}.\n` +
    // A ride-along beat reply reacts to the beat just played (its view comes with the note), not to this one yet.
    (o.views === false ? '' : ` What you think: ${views}\n`) +
    ` Talk it through as yourself, and never choose for them.${beat.here === true ? " You're in the room with them, but these choices are theirs: don't do one of them yourself, even if they ask you to lead; say what you'd do, and wait." : ''} If they act a choice out — say it to ${who}, start doing it — it hasn't happened yet: nobody answers it or moves on it, and your reply stops at the moment before it lands. These are the only choices; don't offer other ways out.${knows} Don't guess at what comes after.]`)
  );
}

/** Her block while the quest here waits (quest waits spec §3): what's coming, without the choices. */
export function questWaitBlock(title: string, line: string): string {
  return `[on your mind — ${title}: ${line} You know it's coming; let it colour the evening, but don't push it, and don't make it happen early.]`;
}

/** A quest row as the history gives it to her: a job's rows (they carry its run key) as [job] lines, so a job never reads as part of a quest. */
/** A roll's result line in a row (`*COOL 3d · IN THE OPEN — 6 6, crit.*`, or a d100 one from before the table). */
const ROLL_LINE = /\n*\*[A-Z]+ (?:\d+d · [A-Z ]+|\d+%) — [^*\n]*\.\*\n*/g;

/**
 * A row as she's told it, with a crew pick's cost words (`crewCostWords`) after its pick: in what she heard on the line,
 * after the pick line it starts with; in the row's text, after its first paragraph (the pick, or a throw's line). The
 * player's text never carries them.
 */
function toldText(row: { text: string; heard?: string; pick?: string; cost?: string; toldAs?: string; toldNext?: string }): string {
  // A way's `told:` (Kroll's desk) stands in for the pick, its cost words and its outcome: she gets the told line and the
  // beat it goes on to, never the row's text (what the player saw). What she heard on the line was built with it.
  if (row.toldAs !== undefined) return row.heard ?? [row.toldAs, row.toldNext].filter(Boolean).join('\n\n');
  if (!row.cost) return row.heard ?? row.text;
  if (row.heard !== undefined) return row.pick && row.heard.startsWith(row.pick) ? `${row.pick} ${row.cost}${row.heard.slice(row.pick.length)}` : row.heard;
  const i = row.text.indexOf('\n\n');
  return i < 0 ? `${row.text} ${row.cost}` : `${row.text.slice(0, i)} ${row.cost}${row.text.slice(i)}`;
}

/**
 * `pick` and `cost`: the row's pick line and a crew pick's cost words, told to her after it (last pass C). `toldAs`: a
 * way's `told:`, told in place of the row's text, with `toldNext` (the next beat's text) after it.
 */
export function questRowText(row: { title: string; text: string; run?: string; heard?: string; pick?: string; cost?: string; toldAs?: string; toldNext?: string }, oneLine: (s: string) => string, player?: string): string {
  // Her history leaves out the roll's result line (the table): no dice, odds or game words for her to echo.
  const text = toldText(row)
    .replace(ROLL_LINE, '\n\n')
    // The hand (spec 2026-10-29-the-hand §6): a call and a loss as her own bracketed lines.
    .replace(/⟦CALL⟧ ([^\n]*?)\.?(?=\n|$)/g, '[call: $1]')
    .replace(/⟦LOST⟧ ([^\n]*?)\.?(?=\n|$)/g, '[$1]')
    .trim();
  return `[${row.run ? 'job' : 'quest'} — ${row.title}${player ? ` ${toldTo(player, row.heard !== undefined)}` : ''}: ${oneLine(text.replace(/⟦([^⟧]+)⟧ /g, '($1) '))}]`;
}

/**
 * A quest row's fields as `questRowText` reads them, from the stored row: the same for her history, this turn and the
 * narrator's recent lines, so a way's `told:` is told the same everywhere. `text`: the row's text, or the part of it she
 * reads now (a ride-along's, before the next beat: then the told line goes alone too).
 */
export function questRowOf(m: { text: string; quest?: { title: string; run?: string; heard?: string; pick?: { line: string; cost?: string; toldAs?: string; toldNext?: string } } }, text = m.text, beforeNext = false): Parameters<typeof questRowText>[0] {
  const p = m.quest?.pick;
  return { title: m.quest?.title ?? '', text, run: m.quest?.run, heard: m.quest?.heard, pick: p?.line, cost: p?.cost, toldAs: p?.toldAs, ...(beforeNext ? {} : { toldNext: p?.toldNext }) };
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
    case 'count':
      return `${c.name}${opText(c.op)}${c.value}`;
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
  if (t.kind === 'unheard') return 'unheard';
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

export function questOutline(q: QuestEntry): { beat: string; push: boolean; choices: { id: string; line: string; to: string; next: string; tags: string[]; wait: string | null; waitNext: string | null; check: Check | null; /** Crew rules: each of a card's ways and where its outcome goes on to. */ ways?: { key: string; line: string; to: string; next: string; tags: string[] }[] }[] }[] {
  return [...q.beats.values()].flat().map((b) => ({
    beat: `${b.id}${b.when ? ` if ${b.when.map(condText).join(' and ')}` : ''}`,
    push: PUSH_ID.test(b.id),
    choices: b.choices.map((c) => {
      const o = q.outcomes.get(c.to);
      const ways = c.ways?.map((w) => ({ key: wayKeyText(w.key), line: w.line, to: w.to, next: q.outcomes.get(w.to)?.to ?? '?', tags: [...wayTags(w), ...(w.when ? [`if ${w.when.map(condText).join(' and ')}`] : [])] }));
      return { id: c.id, line: c.line, to: c.to, next: o?.to ?? '?', tags: [...(c.check ? [checkText(c.check)] : []), ...c.tags.map(tagText)], wait: o?.wait ? waitText(o.wait) : null, waitNext: o?.next ?? null, check: c.check, ...(ways ? { ways } : {}) };
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
  "A contact's own job (one contact in with, an after: gate) may take text: <what she wants from the player and what she won't say, to her, under 300 characters>; she texts it or raises it in the room when the gate opens, and the job posts only then.",
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
      "opening: <optional, a for: job with one with: contact: the STORY scene a new game for that pair opens on, in the player's second person>",
      "opening-view: <with opening:, told to her: why they're here tonight, in her second person>",
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

/** `text` with `{who}` as the first name of whoever did a crew-rules way (a recruit, a program in capitals, the contact). */
export function fillWho(text: string, name: string): string {
  return text.replaceAll('{who}', name);
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
  return readsFlag(q, flag);
}

/** Whether any part of `x` (a job, a beat's versions, an outcome) reads `flag` in a condition: `mentionsFlag`'s walk. */
/** With `value`, only a condition on `flag=value` (either op) counts. */
export function readsFlag(x0: unknown, flag: string, value?: string): boolean {
  const seen = new Set<object>();
  const walk = (x: unknown): boolean => {
    if (!x || typeof x !== 'object' || seen.has(x)) return false;
    seen.add(x);
    if (Array.isArray(x)) return x.some(walk);
    if (x instanceof Map) return [...x.values()].some(walk);
    const o = x as Record<string, unknown>;
    // A condition: `flag` (with an op) or `set` (no value; a `[set …]` tag carries one and writes, not reads).
    if (value !== undefined ? o.kind === 'flag' && 'op' in o && o.name === flag && o.value === value : (o.kind === 'flag' && 'op' in o && o.name === flag) || (o.kind === 'set' && !('value' in o) && o.name === flag)) return true;
    return Object.values(o).some(walk);
  };
  return walk(x0);
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

/** A job's book entry with the stock getaway in it, when its file has none of its own (the table spec §2); never a crew-rules job's. */
export function withGetaway(q: QuestEntry): QuestEntry {
  // A crew-rules job writes its own getaway of ways (crew rules spec, Clocks): the stock one is checks.
  if (q.beats.has('getaway') || q.rules === 'crew') return q;
  const beats = new Map(q.beats);
  beats.set('getaway', [STOCK_GETAWAY.beat]);
  const outcomes = new Map(q.outcomes);
  for (const o of STOCK_GETAWAY.outcomes) outcomes.set(o.id, o);
  return { ...q, beats, outcomes };
}

/** Who a job brings as a guest: a contract's (its lead's giver) or a mission's. Null: none. */
export function questGuest(q: Pick<QuestEntry, 'contract' | 'guest'>): { id: string; grade: Grade } | null {
  return q.contract?.guest ?? q.guest ?? null;
}
