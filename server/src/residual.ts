/**
 * The Residual (spec 2026-10-15-scribe-design): one small call after her reply that keeps the books —
 * notes, pins, keywords, standing, missed lights, and on END SCENE / LEAVE the recap and her dossier
 * page. This file is the pure part: the messages it's sent, its answer parsed item by item, and the
 * answer applied through the journal, standing and lights under the stamp of the reply it read.
 */
import { JOBS_APART } from './instructions';
import { z } from 'zod';
import type { Note } from '../../shared/types';
import { formatClock, hhmmOf, minuteOfDay, nextOccurrence, parseHhmm } from '../../shared/clock';
import { resolvePlan, type Plan, type PlanAnswer } from '../../shared/plan';
import type { TextPromise } from '../../shared/promise';
import { CIPHER, clueOnPage, type CipherEvent } from '../../shared/cipher';

/** A promised time this many minutes past is taken as now ("05:40" at 05:40), not tomorrow. */
const PROMISE_JUST_PASSED = 30;
import { normalizeKeys } from '../../shared/note-keys';
import { capAtWordBoundary } from '../../shared/persona';
import { STANDING } from '../../shared/standing';
import type { Db } from './db';
import { NOTE_MAX, PAGE_MAX, PIN_CAP, RECAP_MAX, type Journal } from './journal';
import type { Result } from './room-state';
import type { StandingControl } from './standing';
import type { CompletionMessage } from './turn';

/** At most this many unkeyed notes are handed over for keywords per run. */
export const RESIDUAL_KEY_BATCH = 10;
/** Time backstop (spec 2026-10-20): a skip under this many minutes is drift, ignored… */
export const TIME_MIN = 30;
/** …and one over this many is a misread (an earlier hour named in passing), refused. */
export const TIME_MAX = 720;

export type ResidualKind = 'turn' | 'end';

export interface ResidualInput {
  kind: ResidualKind;
  self: { name: string; pronoun: string };
  player: { id: string; name: string };
  /** Her room as it is now: the `[room: …]` line. */
  roomLine: string;
  /** Her reply's story clock (its line's stamp plus what she passed); null or absent outside a stamped turn. */
  clock?: number | null;
  /** Her standing with the player in words and numbers; null when standing doesn't apply. */
  standing: string | null;
  /** Her journal and this pair's dossier notes. */
  notes: Note[];
  /** What happened since the last reply the Residual covered, oldest first. */
  exchanges: { speaker: string; text: string }[];
  /** Read only on an end turn. */
  recap: string | null;
  page: string | null;
  /** The city's places she can make a plan for (her plans spec §4); absent: plans don't apply. */
  places?: { id: string; name: string }[];
  /** Her standing plan in words, for the `[her plan: …]` line. */
  planLine?: string | null;
  /** Plans don't apply to this reply (on comms) though `places` is sent for promises. */
  noPlans?: boolean;
  /** Promised texts (spec 2026-10-23 §4) apply to this reply. */
  promises?: boolean;
  /** Her standing promise in words, for the `[your promise: …]` line. */
  promiseLine?: string | null;
  /** Her schedule in words (deck controls spec §1), so "when I'm in bed" can become a time. */
  herDay?: string | null;
  /** The playthrough's open truths (cipher spec §2.3), labelled T1…; absent or empty: Cipher has nothing open. */
  cipher?: { label: string; truth: string; comesOutWhen: string }[];
}

/** A note's text with something in it: a copied template's "…" is not a note. */
const noteText = z
  .string()
  .trim()
  .min(1)
  .refine((t) => /[\p{L}\p{N}]/u.test(t), 'only placeholder dots');
/** Keys as given, minus placeholder dots (shared/note-keys does the rest when the note is written). */
const noteKeys = z.array(z.string()).transform((ks) => ks.filter((k) => /[\p{L}\p{N}]/u.test(k)));

const NoteAdd = z.object({
  op: z.literal('add'),
  about: z.enum(['me', 'you']).default('you'),
  text: noteText,
  keys: noteKeys.default([]),
  pin: z.boolean().default(false),
});
const NoteRewrite = z.object({
  op: z.literal('rewrite'),
  id: z.string(),
  text: noteText.optional(),
  keys: noteKeys.optional(),
  pin: z.boolean().optional(),
});
const NoteForget = z.object({ op: z.literal('forget'), id: z.string() });
const NoteOp = z.discriminatedUnion('op', [NoteAdd, NoteRewrite, NoteForget]);
const Standing = z.object({
  trust: z.number().int(),
  warmth: z.number().int(),
  reason: z.string().trim().min(1),
});
const Light = z.object({
  id: z.string().min(1),
  intensity: z.number().min(0).max(1),
});
const Time = z.object({ until: z.string().refine((t) => parseHhmm(t) !== null, 'must be HH:MM') });
const hhmm = z.string().refine((t) => parseHhmm(t) !== null, 'must be HH:MM');
const PlanShape = z.union([
  z.object({ cancel: z.literal(true) }).strict(),
  z.object({
    going: z.object({ place: z.string().min(1), until: hhmm.nullable().default(null) }).nullable().default(null),
    meet: z.object({ place: z.string().min(1), at: hhmm }).nullable().default(null),
  }),
]);

/** A promise to text (promised texts spec §4): at a time, or when she gets somewhere; or taken back. */
const PromiseShape = z.union([
  z.object({ cancel: z.literal(true) }).strict(),
  z.object({ at: hhmm, about: z.string().trim().min(1) }).strict(),
  z.object({ place: z.string().min(1), about: z.string().trim().min(1) }).strict(),
]);
export type PromiseAnswer = z.infer<typeof PromiseShape>;

/** Clues and learned truths (cipher spec §2.3), by the labels the user turn gave. */
const CipherShape = z.object({
  clues: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  learned: z.array(z.string()).default([]),
});
export type CipherAnswer = z.infer<typeof CipherShape>;
const ClueItem = z.object({ id: z.string(), text: z.string() });

/** The cipher field item by item (minor 4): a bad clue or learned costs only itself; a learned may come as {"id":…}. */
function readCipher(v: unknown, refused: string[]): CipherAnswer | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) {
    refused.push('cipher: not an object');
    return null;
  }
  const o = v as { clues?: unknown; learned?: unknown };
  const list = (x: unknown, name: string): unknown[] => {
    if (x === undefined || x === null) return [];
    if (Array.isArray(x)) return x;
    refused.push(`cipher.${name}: not a list`);
    return [];
  };
  const clues = list(o.clues, 'clues').flatMap((c, i) => {
    const r = ClueItem.safeParse(c);
    if (r.success) return [r.data];
    refused.push(`cipher.clues[${i}]: dropped`);
    return [];
  });
  const learned = list(o.learned, 'learned').flatMap((l, i) => {
    const id = typeof l === 'string' ? l : typeof l === 'object' && l !== null && typeof (l as { id?: unknown }).id === 'string' ? (l as { id: string }).id : null;
    if (id !== null) return [id];
    refused.push(`cipher.learned[${i}]: dropped`);
    return [];
  });
  return clues.length > 0 || learned.length > 0 ? { clues, learned } : null;
}

export type ResidualNoteOp = z.infer<typeof NoteOp>;
export interface ResidualAnswer {
  notes: ResidualNoteOp[];
  standing: { trust: number; warmth: number; reason: string } | null;
  lights: { id: string; intensity: number }[];
  /** The hour the story reached by the end of her reply, when it moved past the reply's clock. */
  time: { until: string } | null;
  /** Where she's going now and where she'll be (her plans spec §4); cancel drops the one standing. */
  plan: PlanAnswer | { cancel: true } | null;
  /** A promise to text (promised texts spec §4); absent or null: none. */
  promise?: PromiseAnswer | null;
  /** What the page showed of the Cipher (cipher spec §2.3); absent or null: nothing. */
  cipher?: CipherAnswer | null;
  recap: string | null;
  dossier: string | null;
}

const issue = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');

/**
 * The answer's JSON: a ```json fence's body if there is one, else the first `{` to the last `}` (the
 * narrator's rule). Only when that doesn't parse, its small slips are repaired (`repaired` names them).
 */
export function jsonOf(raw: string): { v: unknown; repaired: string[] } {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = fence ? fence[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no object');
  const text = body.slice(start, end + 1);
  try {
    return { v: JSON.parse(text), repaired: [] };
  } catch (err) {
    const fix = repairJson(text);
    if (!fix.repaired.length) throw err;
    return { v: JSON.parse(fix.text), repaired: fix.repaired };
  }
}

/** The end of a string at `i` (its opening quote): the index of its closing quote, or -1. */
function stringEnd(s: string, i: number): number {
  for (let j = i + 1; j < s.length; j++) {
    if (s[j] === '\\') j++;
    else if (s[j] === '"') return j;
  }
  return -1;
}

/**
 * GLM's small slips, outside strings only (hand-check 2026-10-20): a comma missing between a value and
 * the next `"key":` across a newline, and a trailing comma before `]` or `}`. Never adds brackets or
 * quotes, so an answer cut off by the cap stays broken.
 */
function repairJson(s: string): { text: string; repaired: string[] } {
  let out = '';
  const repaired = new Set<string>();
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      const close = stringEnd(s, i);
      if (close < 0) return { text: s, repaired: [] };
      const prev = out.trimEnd();
      const gap = out.slice(prev.length);
      const isKey = /^\s*:/.test(s.slice(close + 1));
      if (isKey && gap.includes('\n') && /["\]}\del]$/.test(prev)) {
        out = `${prev},${gap}`;
        repaired.add('missing comma');
      }
      out += s.slice(i, close + 1);
      i = close;
    } else if (c === ',' && /^\s*[\]}]/.test(s.slice(i + 1))) {
      repaired.add('trailing comma');
    } else out += c;
  }
  return { text: out, repaired: [...repaired] };
}

/**
 * Her Residual's answer, checked per item: a bad item is dropped with a reason and the rest stands. An
 * answer that isn't a JSON object at all (a refusal, a reply cut off by the cap) is null: nothing is written.
 */
export function parseResidualAnswer(raw: string): {
  answer: ResidualAnswer | null;
  refused: string[];
} {
  let v: unknown;
  let repaired: string[];
  try {
    ({ v, repaired } = jsonOf(raw));
  } catch {
    return { answer: null, refused: ['answer: not JSON'] };
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return { answer: null, refused: ['answer: not an object'] };
  const o = v as Record<string, unknown>;
  const refused: string[] = repaired.map((r) => `answer: JSON repaired (${r})`);
  const list = <T>(name: string, schema: z.ZodType<T>): T[] => {
    const items = o[name];
    if (items === undefined || items === null) return [];
    if (!Array.isArray(items)) {
      refused.push(`${name}: not a list`);
      return [];
    }
    const out: T[] = [];
    items.forEach((item, i) => {
      const r = schema.safeParse(item);
      if (r.success) out.push(r.data);
      else refused.push(`${name}[${i}]: ${issue(r.error)}`);
    });
    return out;
  };
  const one = <T>(name: string, schema: z.ZodType<T>): T | null => {
    const item = o[name];
    if (item === undefined || item === null) return null;
    const r = schema.safeParse(item);
    if (r.success) return r.data;
    refused.push(`${name}: ${issue(r.error)}`);
    return null;
  };
  const text = z.string().trim().min(1);
  return {
    answer: {
      notes: list('notes', NoteOp),
      lights: list('lights', Light),
      standing: one('standing', Standing),
      time: one('time', Time),
      plan: one('plan', PlanShape),
      ...((promise) => (promise ? { promise } : {}))(one('promise', PromiseShape)),
      ...((cipher) => (cipher ? { cipher } : {}))(readCipher(o.cipher, refused)),
      recap: one('recap', text),
      dossier: one('dossier', text),
    },
    refused,
  };
}

export interface ApplyDeps {
  journal: Journal;
  player: string;
  /** Her standing control for this player; null when standing doesn't apply. */
  standing: StandingControl | null;
  /** set_light on her room (source 'world'). */
  setLight: (id: string, intensity: number) => Result;
  db: Pick<Db, 'withStamp'>;
  /** Names that never key a note (hers and the player's: they come up every turn). */
  names?: readonly string[];
  /** Her word for the player changed: the shift line, as shift_standing shows it. */
  standingShifted?: (word: string) => void;
  /** Moves her reply's clock on by `minutes` (the relay's residualPass); absent: time doesn't apply. */
  passTime?: (minutes: number) => Result;
  /** Her plan (her plans spec §4): the scene ids she can name, and where it's stored; absent: plans don't apply. */
  plan?: { places: ReadonlySet<string>; /** Her room's scene after the reply. */ here?: string; set(p: Plan | null): void };
  /** A promise to text (promised texts spec §4): the place ids she can name, and where it's stored; absent: promises don't apply. */
  promise?: { places: ReadonlySet<string>; set(p: TextPromise | null): void };
  /**
   * Cipher (spec §2.3): the labels the prompt gave (T1 → truth id), which truths are open, the page the clues are
   * checked against, where and when the reply happened, and where an event goes; absent: Cipher doesn't apply.
   */
  cipher?: { labels: ReadonlyMap<string, string>; open: ReadonlySet<string>; prose: string; place: string; clock: number; append(e: CipherEvent): void };
}

/** The minutes from her reply's clock to `until`'s next occurrence, behind the guards (spec §4). */
export function timeSkip(clock: number, until: string): { minutes: number } | { ignored: string } | { refused: string } {
  const minutes = nextOccurrence(clock, parseHhmm(until)!) - clock;
  if (minutes < TIME_MIN) return { ignored: 'under 30 min' };
  if (minutes > TIME_MAX) return { refused: 'over 12 h' };
  return { minutes };
}

const clockWords = (m: number) => formatClock(m).replace(' · ', ', ');

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const clampStep = (n: number) => Math.max(-STANDING.step, Math.min(STANDING.step, n));

/** Applies the answer under the stamp of the reply it read; says what it wrote and what it refused. */
export function applyResidual(d: ApplyDeps, a: ResidualAnswer, at: { messageId: string; take: number; kind: ResidualKind; clock?: number | null }): { applied: string[]; refused: string[] } {
  const applied: string[] = [];
  const refused: string[] = [];
  const { journal, player } = d;
  const pinsFull = () => journal.notes(player).filter((n) => n.pinned).length >= PIN_CAP;
  const fail = (r: Result) => (r.ok ? '' : r.error);

  d.db.withStamp({ messageId: at.messageId, take: at.take }, () => {
    for (const op of a.notes) {
      if (op.op === 'add') {
        const pin = op.pin && !pinsFull();
        const r = journal.note(
          player,
          {
            text: op.text,
            about: op.about,
            keys: normalizeKeys(op.keys, d.names),
            pinned: pin,
          },
          'agent',
        );
        if (!r.ok) {
          refused.push(`add refused: ${r.error}`);
          continue;
        }
        const id = /^noted: (n\d+)/.exec(r.text)?.[1] ?? '?';
        applied.push(`note ${id} added`);
        if (op.pin && !pin) refused.push(`pin ${id} refused: pins full (${PIN_CAP})`);
      } else if (op.op === 'rewrite') {
        const existing = journal.notes(player).find((n) => n.id === op.id);
        if (!existing) {
          refused.push(`rewrite ${op.id} refused: no such note`);
          continue;
        }
        const pin = op.pin === true && !existing.pinned && pinsFull() ? undefined : op.pin;
        const r = journal.note(
          player,
          {
            id: op.id,
            ...(op.text !== undefined ? { text: op.text } : {}),
            ...(op.keys !== undefined ? { keys: normalizeKeys(op.keys, d.names) } : {}),
            ...(pin !== undefined ? { pinned: pin } : {}),
          },
          'agent',
        );
        if (r.ok) applied.push(`note ${op.id} rewritten`);
        else refused.push(`rewrite ${op.id} refused: ${fail(r)}`);
        if (op.pin === true && pin === undefined) refused.push(`pin ${op.id} refused: pins full (${PIN_CAP})`);
      } else {
        if (!journal.notes(player).some((n) => n.id === op.id)) {
          refused.push(`forget ${op.id} refused: no such note`);
          continue;
        }
        const r = journal.forget(player, op.id, 'agent');
        if (r.ok) applied.push(`note ${op.id} forgotten`);
        else refused.push(`forget ${op.id} refused: ${fail(r)}`);
      }
    }

    if (a.standing) {
      const trust = clampStep(a.standing.trust);
      const warmth = clampStep(a.standing.warmth);
      if (trust !== 0 || warmth !== 0) {
        const since = d.standing?.repliesSinceMove(at.messageId) ?? null;
        if (!d.standing) refused.push("standing refused: doesn't apply here");
        else if (since !== null && since < STANDING.cooldown) refused.push('standing refused: too soon after the last move');
        else {
          const r = d.standing.move(
            {
              trust,
              warmth,
              reason: capAtWordBoundary(a.standing.reason, STANDING.reasonMax),
            },
            at.messageId,
          );
          if (r === 'already') refused.push('standing refused: already moved for this reply');
          else if (r === 'off') refused.push("standing refused: doesn't apply here");
          else {
            applied.push(`standing trust ${signed(trust)} warmth ${signed(warmth)}`);
            if (r.before !== r.after) d.standingShifted?.(r.after);
          }
        }
      }
    }

    for (const l of a.lights) {
      const r = d.setLight(l.id, l.intensity);
      if (r.ok) applied.push(`light ${l.id} ${Math.round(l.intensity * 100)}%`);
      else refused.push(`light ${l.id} refused: ${r.error}`);
    }

    // Her clock left behind the story she told: move it on (time backstop, spec 2026-10-20).
    const clock = at.clock ?? null;
    let moved = 0;
    if (a.time && clock !== null && d.passTime) {
      const skip = timeSkip(clock, a.time.until);
      if ('ignored' in skip) refused.push(`time ignored: ${skip.ignored}`);
      else if ('refused' in skip) refused.push(`time refused: ${skip.refused}`);
      else {
        const r = d.passTime(skip.minutes);
        if (r.ok) {
          moved = skip.minutes;
          applied.push(`time +${skip.minutes} → ${clockWords(clock + skip.minutes)}`);
        } else refused.push(`time refused: ${r.error}`);
      }
    }

    // Her plan (her plans spec §4), on the clock as her reply left it.
    if (a.plan && clock !== null && d.plan) {
      if ('cancel' in a.plan) {
        d.plan.set(null);
        applied.push('plan cancelled');
      } else {
        const bad = [a.plan.going?.place, a.plan.meet?.place].find((id) => id !== undefined && !d.plan!.places.has(id));
        // Going where she already is: she walked you both there (go_to), it's not her leaving (chat-stress 2026-10-22).
        const there = a.plan.going !== null && a.plan.going.place === d.plan.here;
        if (there) refused.push(`plan going ignored: she's at ${a.plan.going!.place} already`);
        const answer = there ? { ...a.plan, going: null } : a.plan;
        const p = bad === undefined ? resolvePlan(answer, clock + moved, at.messageId) : null;
        if (bad !== undefined) refused.push(`plan refused: ${bad} isn't a map place`);
        else if (p) {
          d.plan.set(p);
          const hm = (m: number) => hhmmOf(minuteOfDay(m));
          const legs = [p.going ? `going ${p.going.place} until ${hm(p.going.until)}` : null, p.meet ? `meet ${p.meet.place} ${hm(p.meet.at)}` : null].filter(Boolean);
          applied.push(`plan set: ${legs.join('; ')}`);
        }
      }
    }

    // A promise to text (promised texts spec §4), on the clock as her reply left it.
    if (a.promise && clock !== null && d.promise) {
      const now = clock + moved;
      if ('cancel' in a.promise) {
        d.promise.set(null);
        applied.push('promise cancelled');
      } else if ('place' in a.promise && !d.promise.places.has(a.promise.place)) {
        refused.push(`promise refused: ${a.promise.place} isn't a map place`);
      } else {
        // A time just reached (the last half hour) is now, not tomorrow: "05:40" said at 05:40 (live check 2026-10-23).
        const due = 'at' in a.promise ? nextOccurrence(now - PROMISE_JUST_PASSED, parseHhmm(a.promise.at)!) : null;
        const place = 'place' in a.promise ? a.promise.place : '';
        const when: TextPromise['when'] = due !== null ? { at: due } : { place };
        d.promise.set({ when, about: a.promise.about, from: at.messageId, since: now });
        applied.push(`promise set: at ${due !== null ? hhmmOf(minuteOfDay(due)) : place}, ${a.promise.about}`);
      }
    }

    // Cipher (spec §2.3): what the page showed, by label; the truths themselves are never the Residual's to change.
    if (a.cipher && (a.cipher.clues.length > 0 || a.cipher.learned.length > 0)) {
      const c = d.cipher;
      if (!c) refused.push("cipher ignored: doesn't apply here");
      else {
        const truthOf = (label: string): string | null => {
          const id = c.labels.get(label.trim());
          if (id === undefined) refused.push(`cipher: unknown ${label}`);
          else if (!c.open.has(id)) refused.push(`cipher: ${label} is out`);
          else return id;
          return null;
        };
        for (const k of a.cipher.clues) {
          const text = capAtWordBoundary(k.text.trim(), CIPHER.clueMax);
          if (text === '') {
            refused.push('cipher: empty clue');
            continue;
          }
          const id = truthOf(k.id);
          if (id === null) continue;
          c.append({ t: 'clue', id, text, messageId: at.messageId, at: c.clock, place: c.place, onPage: clueOnPage(text, c.prose), seq: Date.now() });
          applied.push(`clue ${k.id.trim()}`);
        }
        for (const label of a.cipher.learned) {
          const id = truthOf(label);
          if (id === null) continue;
          c.append({ t: 'learned', id, seq: Date.now() });
          applied.push(`learned ${label.trim()}`);
        }
      }
    }

    // The recap on any turn that ends the night (they part without END SCENE too; 2026-10-16); the dossier only on an end.
    if (a.recap) {
      const r = journal.setRecap(player, a.recap, 'agent');
      if (r.ok) applied.push('recap saved');
      else refused.push(`recap refused: ${r.error}`);
    }
    if (at.kind !== 'end') {
      if (a.dossier) refused.push('dossier ignored: not an end turn');
      return;
    }
    if (a.dossier) {
      const r = journal.setPage(player, a.dossier, 'agent');
      if (r.ok) applied.push('dossier saved');
      else refused.push(`dossier refused: ${r.error}`);
    }
  });
  return { applied, refused };
}

const flat = (t: string) => t.replace(/\s*\n\s*/g, ' ');
const noteLine = (n: Note) => `${n.id} (${n.about})${n.pinned ? ' [pinned]' : ''}${(n.keys?.length ?? 0) > 0 ? ` {${n.keys!.join(', ')}}` : ''} ${flat(n.text)}`;

/** The Residual's system message and its one user message (spec §3). */
export function residualMessages(i: ResidualInput): CompletionMessage[] {
  const her = i.self.name;
  const you = i.player.name;
  const timed = i.clock !== undefined && i.clock !== null;
  const planned = timed && (i.places?.length ?? 0) > 0 && !i.noPlans;
  const promising = timed && (i.places?.length ?? 0) > 0 && i.promises === true;
  const placed = planned || promising;
  const ciphered = (i.cipher?.length ?? 0) > 0;
  const system = [
    `You keep the records for a roleplay between ${her} (${i.self.pronoun}) and ${you}. You never write story: you read what just happened and answer with one JSON object.`,
    `NOTES are ${her}'s memory. Only lasting facts: what is owed or promised, what was revealed, what changed, where something is. Not moods, not small talk. One fact per note: a new fact is a new note, even about the same person; rewrite a note only when that same fact changed, and forget it once it stops being true. "about": "me" is ${her}'s own journal (her life, her room, her plans); "about": "you" is what ${her} learns about ${you}. Up to ${NOTE_MAX} characters each, in ${her}'s words. Give every note 1–4 keywords, written the way they would be said (\"chrome hand\", not \"chrome-hand\"): names of other people, places, objects, words that would come up again in talk — not ${her}'s or ${you}'s names, not everyday words. Pin only what should matter every scene (at most ${PIN_CAP} pins). Most turns add nothing.`,
    `STANDING is about what ${you} did this turn and how it lands with ${her}: something ${you} said or did, never what ${her} or anyone else did. ${her}'s reply only shows how it landed. Leave it null unless what ${you} did would still matter to ${her} next week: most turns move nothing, and ordinary courtesy, small favours, flirting or a pleasant chat are not enough. Decide the reason first, then its sign: a lie, a dodge, hiding something, pushing ${her} or bringing ${her} trouble moves down; keeping a promise, telling a hard truth or taking a risk for ${her} moves up. Trust and warmth usually move apart: someone can earn trust and still not be liked, or be liked and not believed — move only the one that changed. Each is -1, 0 or +1. trust: whether ${her} believes them and would tell them things. warmth: whether ${her} likes having them around. reason: a few words.`,
    JOBS_APART,
    `LIGHTS: only when the reply says a light changed (the power cut, a lamp switched off) and the [room: …] line shows it didn't. Use the light ids from that line; intensity 0–1.`,
    ...(timed
      ? [
          `TIME: the [clock: …] line is the story's time when ${her}'s reply was written, by Lowlight's count. If what just happened moves the story on past it — a later hour named, "hours later", the night going on, "till dawn" — give the hour the story has reached by the end of the reply: not a time planned, promised or mentioned for later ("meet me at midnight", "come back at ten"). Otherwise null; most turns don't move it.`,
          ...(planned
            ? [
                `PLAN: only when ${her}'s reply commits ${her} to going somewhere now, or to being somewhere at a time — "I'm going home to shower", "meet me at Hae's at nine". Not a place or time only mentioned, wished for or asked about, and not a plan the two of them carry out together right now. Use the place ids from the [places: …] line. "going" is where ${her} heads now without ${you}, and until when — never somewhere they go together; "meet" is where and when ${her} said ${i.self.pronoun}'ll be. If ${her} drops a plan already listed, answer {"cancel":true}. Otherwise null; most turns have none.`,
              ]
            : []),
          ...(promising
            ? [
                `PROMISE: only when ${her}'s reply says ${i.self.pronoun}'ll text or message ${you} later — at a time ("I'll text you at ten"), or when ${i.self.pronoun} gets somewhere ("text you when I'm home"). A request ${you} made that ${her} doesn't agree to is not a promise. "about" is what ${her} will text about, in a few words. Use the place ids from the [places: …] line. If ${her} takes back a promise already listed, answer {"cancel":true}. When the promise is tied to a moment of ${her}'s day rather than a clock time ("when I'm in bed", "after my shift"), give the time it most likely happens from [her day: …] and what ${her} said, as "at". If ${her}'s reply already does what ${i.self.pronoun} promised (${i.self.pronoun} says ${i.self.pronoun === 'they' ? "they're" : `${i.self.pronoun}'s`} in bed now), it's kept: null. Otherwise null; most turns have none.`,
              ]
            : []),
        ]
      : []),
    ...(i.kind === 'end'
      ? [
          `The scene is ending. RECAP: where things stand between ${her} and ${you}, for the next visit (up to ${RECAP_MAX} characters). DOSSIER: ${her}'s whole page on ${you} rewritten if ${her} learned something lasting (up to ${PAGE_MAX} characters, carry over what still holds), else null.`,
        ]
      : [
          `RECAP: only if this turn ends the night — they part, say goodnight, one of them leaves: where things stand between ${her} and ${you}, for the next visit (up to ${RECAP_MAX} characters). Otherwise null.`,
        ]),
    ...(ciphered
      ? [
          `CIPHER: secrets the story keeps, listed as [cipher: …]. "clues": only when what just happened showed something small on the page that points at one — what was shown, in a few words, not what it means. "learned": ${you} now knows one — told, found or worked out on the page. Most turns have neither: null. Never put a [cipher: …] truth into notes, a recap or a dossier: only whoever keeps it may know it.`,
        ]
      : []),
    'Answer with one JSON object and nothing else. When nothing changed, answer exactly:',
    (planned || promising
      ? `{"notes":[],"standing":null,"lights":[],"time":null,${planned ? '"plan":null,' : ''}${promising ? '"promise":null,' : ''}"recap":null,"dossier":null}`
      : timed
        ? '{"notes":[],"standing":null,"lights":[],"time":null,"recap":null,"dossier":null}'
        : '{"notes":[],"standing":null,"lights":[],"recap":null,"dossier":null}'
    ).replace('"recap":null', ciphered ? '"cipher":null,"recap":null' : '"recap":null'),
    'Each entry in "notes" is one of: add {"op":"add","about":"me" or "you","text":the note,"keys":[1–4 keywords],"pin":true or false}; rewrite {"op":"rewrite","id":an id from the notes listed,"text":the new text,"keys":[…],"pin":…} (any of text, keys, pin; leave out what stays); forget {"op":"forget","id":an id from the notes listed}. "standing" is null or {"reason":"a few words","trust":n,"warmth":n}. "lights" holds {"id":a light id from the [room: …] line,"intensity":0 to 1}.' +
      (timed ? ' "time" is null or {"until":"HH:MM"}.' : '') +
      (planned ? ' "plan" is null, {"cancel":true}, or {"going":{"place":id,"until":"HH:MM" or null} or null,"meet":{"place":id,"at":"HH:MM"} or null}.' : '') +
      (promising ? ' "promise" is null, {"cancel":true}, {"at":"HH:MM","about":"…"}, or {"place":id,"about":"…"}.' : '') +
      (ciphered ? ' "cipher" is null or {"clues":[{"id":a label from the [cipher: …] line,"text":"what was shown"}],"learned":[labels]}.' : ''),
  ].join('\n\n');

  const unkeyed = i.notes.filter((n) => (n.keys?.length ?? 0) === 0).slice(0, RESIDUAL_KEY_BATCH);
  const user = [
    i.roomLine,
    timed ? `[clock: ${clockWords(i.clock!)}]` : null,
    placed ? `[places: ${i.places!.map((p) => `${p.id} "${p.name}"`).join(', ')}]` : null,
    planned && i.planLine ? `[her plan: ${i.planLine}]` : null,
    promising && i.promiseLine ? `[your promise: ${i.promiseLine}]` : null,
    promising && i.herDay ? `[her day: ${i.herDay}]` : null,
    i.standing ? `[standing: ${i.standing}]` : null,
    ciphered ? `[cipher: ${i.cipher!.map((c) => `${c.label} · ${flat(c.truth)} · comes out when ${flat(c.comesOutWhen)}`).join('; ')}]` : null,
    i.notes.length > 0 ? `${her}'s notes:\n${i.notes.map(noteLine).join('\n')}` : `${her} has no notes yet.`,
    ...(i.kind === 'end' ? [`The recap now: ${i.recap ?? '(none)'}`, `${her}'s dossier page on ${you} now: ${i.page ?? '(empty)'}`] : []),
    `What just happened:\n${i.exchanges.map((e) => `${e.speaker}: ${flat(e.text)}`).join('\n')}`,
    unkeyed.length > 0 ? `Give keywords to these notes (a rewrite with keys only): ${unkeyed.map((n) => n.id).join(', ')}` : null,
  ]
    .filter((x): x is string => x !== null)
    .join('\n\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
