/**
 * Crew rules (spec 2026-11-17 crew rules): a card's ways. Under a crew-rules card each `·` line is one way: who can do it,
 * the line for that way, the outcome it plays and what it costs or gives. Pure: the parse in `quests.ts`, the server
 * and their tests share these.
 */
import { parseCondition, type Condition } from './quests';
import { normalSpec, SPECIALTIES, type Specialty } from './crew-book';

/** Who a way belongs to: you (by a name, '' for none), a recruit of a specialty, a loaded program (any, or one), the job's contact. */
export type WayKey = { kind: 'you'; name: string } | { kind: 'spec'; spec: Specialty } | { kind: 'program'; id: string | null } | { kind: 'contact' };

export interface Way {
  key: WayKey;
  line: string;
  /** The outcome it plays. */
  to: string;
  /** `if <condition>`: offered only while it holds; null: always. */
  when: Condition[] | null;
  take: number;
  alarm: number;
  heat: number;
  /** The job's own clocks it moves: clock id → points, negative to take one down (it stops at 0). */
  clocks: Record<string, number>;
  /** Percent off the job's pay at the end. */
  cut: number;
  /** Taken off TAKE (not below 0). */
  lose: number;
  /** The recruit who did it is hurt or held. */
  harm?: 'hurt' | 'held';
  sets: { name: string; value: string }[];
  /**
   * `told: <text>` on the line under the way (Kroll's desk): all the contact hears of it, in place of the pick line and
   * its cost words, `{who}` filled as in an outcome. The player's page is unchanged. Absent: she hears the pick line.
   */
  told?: string;
}

/** The tag words a way reads; a job clock can't take one of these as its id. */
export const WAY_WORDS = ['take', 'alarm', 'heat', 'cut', 'lose', 'set', 'hurt', 'held'] as const;

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FLAG = /^[a-z0-9_.-]+$/;
const WAY = /^(.+?): (.+?) → (\S+)(?: \[(.+?)\])?(?: if (.+))?$/;

export const wayKeyText = (k: WayKey): string => {
  switch (k.kind) {
    case 'you':
      return k.name ? `you ${k.name}` : 'you';
    case 'spec':
      return k.spec;
    case 'program':
      return k.id ? `program ${k.id}` : 'program';
    case 'contact':
      return 'contact';
  }
};

function parseKey(raw: string): WayKey | null {
  const m = /^(you|program)(?: (\S+))?$/.exec(raw);
  if (m && (m[2] === undefined || ID.test(m[2]))) return m[1] === 'you' ? { kind: 'you', name: m[2] ?? '' } : { kind: 'program', id: m[2] ?? null };
  if (raw === 'contact') return { kind: 'contact' };
  const spec = normalSpec(raw);
  return (SPECIALTIES as readonly string[]).includes(spec) ? { kind: 'spec', spec: spec as Specialty } : null;
}

/** A way's tags as written, for outlines and boards: `take 2`, `hears 1`, `set login=yes`, `held`. */
export function wayTags(w: Way): string[] {
  return [
    ...(['take', 'alarm', 'heat', 'cut', 'lose'] as const).flatMap((k) => (w[k] ? [`${k} ${w[k]}`] : [])),
    ...Object.entries(w.clocks).map(([id, n]) => `${id} ${n}`),
    ...w.sets.map((s) => `set ${s.name}=${s.value}`),
    ...(w.harm ? [w.harm] : []),
  ];
}

/** The text after a `· `: `<key>: <line> → <outcome> [tags] if <condition>`. A string is what's wrong with it. */
export function parseWay(raw: string, clockIds: readonly string[]): Way | string {
  const m = WAY.exec(raw.trim());
  if (!m) return `can't read the way '${raw.trim()}' (· <who>: The line. → outcome [tags] if <condition>)`;
  const key = parseKey(m[1]);
  if (!key) return `'${m[1]}' isn't who a way is for (you, you <name>, a specialty, program, program <id>, contact)`;
  const w: Way = { key, line: m[2], to: m[3], when: null, take: 0, alarm: 0, heat: 0, clocks: {}, cut: 0, lose: 0, sets: [] };
  const seen = new Set<string>();
  for (const t of (m[4] ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    let e: RegExpExecArray | null;
    const word = t.split(/[\s=]/)[0];
    if (word !== 'set' && seen.has(word)) return `'${word}' appears twice on a way`;
    seen.add(word);
    if ((e = /^(take|alarm|heat|cut|lose) (\d+)$/.exec(t))) {
      const n = Number(e[2]);
      if (e[1] === 'cut' && (n < 1 || n > 100)) return `cut is a percent, 1–100 (this is ${n})`;
      w[e[1] as 'take' | 'alarm' | 'heat' | 'cut' | 'lose'] = n;
    } else if ((e = /^set ([^\s=]+)=(\S+)$/.exec(t)) && FLAG.test(e[1]) && FLAG.test(e[2])) w.sets.push({ name: e[1], value: e[2] });
    else if (t === 'hurt' || t === 'held') {
      if (w.harm) return 'a way is hurt or held, not both';
      w.harm = t;
    } else if ((e = /^([a-z0-9_-]+) (-?\d+)$/.exec(t))) {
      if (!clockIds.includes(e[1])) return `no clock '${e[1]}' in this job (clock ${e[1]}: <LABEL> · <size> in the front matter)`;
      const n = Number(e[2]);
      if (n === 0) return `'${t}' moves the clock nothing (${e[1]} N up, ${e[1]} -N down, N 1 or more)`;
      w.clocks[e[1]] = n;
    } else return `can't read the tag '${t}' (take N, alarm N, heat N, <clock> N or -N, cut N, lose N, set flag=value, hurt, held)`;
  }
  if (m[5] !== undefined) {
    const c = parseCondition(m[5]);
    if (!Array.isArray(c)) return `if: ${c.message}`;
    w.when = c;
  }
  return w;
}

/** What a way spends: you nothing, anyone else their go. */
const spends = (w: Way) => (w.key.kind === 'you' ? 0 : 1);
const HARM = { none: 0, hurt: 1, held: 2 } as const;
/** What an outcome's `take:` leaves you with, as a cost: none is worse than part, part worse than nothing said. */
const LEAVES = { kept: 0, part: 1, none: 2 } as const;
type Sets = { name: string; value: string }[];
const setsKey = (sets: Sets) => JSON.stringify(sets.map((s) => `${s.name}=${s.value}`).sort());

/** A way as the dominance check weighs it: its own tags, plus its card's own `[alarm]` and `set`, and what its outcome leaves. */
interface Weighed {
  w: Way;
  alarm: number;
  sets: Sets;
  leaves: 'none' | 'part' | null;
}
const bare = (w: Way): Weighed => ({ w, alarm: w.alarm, sets: w.sets, leaves: null });

/** Whether `a` is at least as good as `b` on every tag and spends nothing more. Ways that set different flags don't compare. */
function noWorse(x: Weighed, y: Weighed): boolean {
  const a = x.w,
    b = y.w;
  if (spends(a) > spends(b) || setsKey(x.sets) !== setsKey(y.sets)) return false;
  if (a.take < b.take) return false;
  if (x.alarm > y.alarm || a.heat > b.heat || a.cut > b.cut || a.lose > b.lose) return false;
  if (HARM[a.harm ?? 'none'] > HARM[b.harm ?? 'none']) return false;
  if (LEAVES[x.leaves ?? 'kept'] > LEAVES[y.leaves ?? 'kept']) return false;
  for (const id of new Set([...Object.keys(a.clocks), ...Object.keys(b.clocks)])) if ((a.clocks[id] ?? 0) > (b.clocks[id] ?? 0)) return false;
  return true;
}

/**
 * Whether `a` can stand over `b` at all: a `you` way spends nothing, so it is weighed against every way; otherwise only
 * ways that spend the same thing (the same key: one specialty, the same program, the contact). Two recruits' goes are
 * different things to spend: you keep the one you didn't send.
 */
const comparable = (a: Way, b: Way): boolean => a.key.kind === 'you' || wayKeyText(a.key) === wayKeyText(b.key);

/**
 * The first pair on a card where `a` is no worse than `b` on every tag and spends nothing more (an authoring warning),
 * among the pairs `comparable` weighs. Ways with an `if` are left out: they are offered only in a state the others
 * aren't written for.
 */
export function dominated(ways: Way[]): [Way, Way] | null {
  const plain = ways.filter((w) => w.when === null).map(bare);
  for (const b of plain) for (const a of plain) if (a !== b && comparable(a.w, b.w) && noWorse(a, b)) return [a.w, b.w];
  return null;
}

/** A card of a beat as the beat's dominance check reads it. */
export interface CardAt {
  id: string;
  ways: Way[];
  /** The card's own `[alarm]` and `set` tags, landing on any way of it. */
  alarm: number;
  sets: Sets;
}

/** What the beat's check needs to know of a way's outcome: what its `take:` leaves, and the beat it goes on to (`end` too). */
export type OutcomeAt = (w: Way) => { leaves: 'none' | 'part' | null; next: string | null };

/** A dominated pair found on a beat: at that ALARM, `a` (on card `aCard`) is no worse than `b` (on `bCard`) and spends nothing more. */
export interface Dominance {
  alarm: number;
  aCard: string;
  a: Way;
  bCard: string;
  b: Way;
}


/** A way's `if` read at an ALARM, or null when it reads anything else (a flag, a clock): such a way is a payoff bought earlier, left out. */
function standsAt(w: Way, alarm: number): boolean | null {
  if (w.when === null) return true;
  if (!w.when.every((c) => c.kind === 'alarm')) return null;
  return w.when.every((c) => (c.kind !== 'alarm' ? true : c.op === '=' ? alarm === c.value : c.op === '>=' ? alarm >= c.value : alarm <= c.value));
}

/**
 * A beat's dominated pairs (crew rules: no best way), at ALARM 0, 1, 2 and 3. At each ALARM, each card offers per key
 * the first way whose `if` holds, ways gated on a flag or clock left out (bought on an earlier beat). Within a card the
 * pairs `comparable` weighs; across two cards of the beat that lead to the same next beat, `you` ways against each
 * other. An outcome's `take: none` / `part` is a cost, and a card's own `[alarm]` and `set` count on each of its ways.
 */
export function dominatedOnBeat(cards: readonly CardAt[], outcome: OutcomeAt): Dominance[] {
  const out: Dominance[] = [];
  const seen = new Set<string>();
  // The ALARM levels a beat is weighed at (a literal: quests.ts parses a file while this module loads).
  for (const alarm of [0, 1, 2, 3]) {
    const standing = cards.map((c) => {
      const keys = new Set<string>();
      const ways = c.ways.filter((w) => {
        const k = wayKeyText(w.key);
        if (keys.has(k) || standsAt(w, alarm) !== true) return false;
        keys.add(k);
        return true;
      });
      return { c, ways: ways.map((w) => ({ w, alarm: w.alarm + c.alarm, sets: [...c.sets, ...w.sets], leaves: outcome(w).leaves, next: outcome(w).next })) };
    });
    for (const x of standing)
      for (const y of standing)
        for (const a of x.ways)
          for (const b of y.ways) {
            if (a === b) continue;
            const weighs = x === y ? comparable(a.w, b.w) : a.w.key.kind === 'you' && b.w.key.kind === 'you' && a.next === b.next;
            if (!weighs || !noWorse(a, b)) continue;
            const id = `${x.c.id}|${wayKeyText(a.w.key)}|${a.w.to}|${y.c.id}|${wayKeyText(b.w.key)}|${b.w.to}`;
            if (seen.has(id)) continue;
            seen.add(id);
            out.push({ alarm, aCard: x.c.id, a: a.w, bCard: y.c.id, b: b.w });
          }
  }
  return out;
}
