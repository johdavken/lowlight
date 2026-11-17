// Her Residual in SillyTavern (spec 2026-10-29-st-residual-design): each of her replies carries the change its run made
// (notes, lights fixed, a recap), and the ledger is the chat folded from the top, so rewinds, swipes and branches stay
// exact. Pure: the extension (extension/residual.js) runs the call and writes these onto SillyTavern's chat.
import { asGroup, groupOf, setGroup } from '../../shared/light-share';
import { normalizeKeys } from '../../shared/note-keys';
import { capAtWordBoundary } from '../../shared/persona';
import type { LightDef, Note } from '../../shared/types';
import { NOTE_MAX, PIN_CAP, RECAP_MAX } from '../../server/src/journal';
import type { ResidualAnswer } from '../../server/src/residual';
import { HABITS } from '../../server/src/habits';
import type { HabitsRunInput } from '../../server/src/habits-run';
import type { StMessage } from './room-stamp';

export type LedgerOp =
  | { op: 'add'; id: string; about: 'me' | 'you'; text: string; keys: string[]; pin: boolean }
  | { op: 'rewrite'; id: string; text?: string; keys?: string[]; pin?: boolean }
  | { op: 'forget'; id: string };

/** What one run changed, saved on her message: only the ops that applied. */
export interface LedgerChange {
  notes: LedgerOp[];
  lights: { id: string; intensity: number }[];
  recap?: string;
  run: { ok: true; refused?: number } | { ok: false; why: string };
  /** Habits (the game's habits run): the rules she should leave out now, or why the run failed. */
  habits?: { rules: string[] } | { failed: string };
  /** The take it was made for (takeOf): SillyTavern copies a message's extra onto a new swipe, and that copy isn't its own. */
  take?: string | number;
}

export interface Ledger {
  notes: Note[];
  recap: string | null;
  /** What she keeps writing, as rules (the newest habits run that worked); empty before one has. */
  habits: string[];
  /** The number the next added note takes (`n${nextId}`): one past the highest ever added in the chat. */
  nextId: number;
}

/** Every this-many of her replies, the run also writes the recap. */
export const RECAP_EVERY = 10;
/** At most this many lines go to one run. */
export const EXCHANGES_MAX = 12;

const KEY = 'lowlight_ledger';

/** The parts of a SillyTavern chat message these read and write. */
export type ChatMessage = Omit<StMessage, 'swipe_info'> & {
  name?: string;
  mes?: string;
  is_system?: boolean;
  send_date?: string | number;
  swipe_info?: { send_date?: string | number; extra?: Record<string, unknown> }[];
};

/** Which take a message shows, by its date: a swipe's index moves when an earlier one is deleted, its date doesn't. */
export function takeOf(msg: ChatMessage): string | number {
  return msg.swipe_info?.[msg.swipe_id ?? 0]?.send_date ?? msg.send_date ?? msg.swipe_id ?? 0;
}

/** The message's change: its current swipe's own, else the message's, else null. */
export function changeOf(msg: ChatMessage): LedgerChange | null {
  const take = takeOf(msg);
  const mine = (c: unknown) => (c && ((c as LedgerChange).take === undefined || (c as LedgerChange).take === take) ? (c as LedgerChange) : null);
  // The take's own, else the message's when it's for this take (SillyTavern backfills swipe_info with an empty extra).
  return mine(msg.swipe_info?.[msg.swipe_id ?? 0]?.extra?.[KEY]) ?? mine(msg.extra?.[KEY]);
}

/** A copy of `msg` carrying `c`: on the message, and on its current swipe when it has swipes. */
export function withChange<M extends ChatMessage>(msg: M, c: LedgerChange): M {
  const out: M = { ...msg, extra: { ...msg.extra, [KEY]: c } };
  if (msg.swipe_info) {
    const i = msg.swipe_id ?? 0;
    out.swipe_info = msg.swipe_info.map((s, j) => (j === i ? { ...s, extra: { ...s.extra, [KEY]: c } } : s));
  }
  return out;
}

const idNumber = (id: string) => Number(id.slice(1)) || 0;
/** Her text cut at a word to `max`, as the game's journal keeps an over-long note of hers (journal.ts fit). */
const fit = (text: string, max: number) => {
  const t = text.trim();
  return t.length > max ? capAtWordBoundary(t, max).trimEnd() : t;
};

/** One op onto `notes` (a copy), or null when it doesn't apply. `at`: the message index, as the note's time. */
function applyOp(notes: Note[], op: LedgerOp, at: number): Note[] | null {
  if (op.op === 'add') {
    if (notes.some((n) => n.id === op.id)) return null;
    return [...notes, { id: op.id, text: op.text, pinned: op.pin, createdAt: at, updatedAt: at, editedBy: 'agent', about: op.about, keys: op.keys }];
  }
  const i = notes.findIndex((n) => n.id === op.id);
  if (i < 0) return null;
  if (op.op === 'forget') return notes.filter((_, j) => j !== i);
  const n = notes[i];
  const next: Note = { ...n, text: op.text ?? n.text, keys: op.keys ?? n.keys, pinned: op.pin ?? n.pinned, updatedAt: at };
  return notes.map((x, j) => (j === i ? next : x));
}

/** The ledger as it stands after `chat`. */
export function ledgerOf(chat: ChatMessage[]): Ledger {
  let notes: Note[] = [];
  let recap: string | null = null;
  let habits: string[] = [];
  let nextId = 1;
  chat.forEach((msg, at) => {
    const c = changeOf(msg);
    if (!c) return;
    for (const op of c.notes) {
      notes = applyOp(notes, op, at) ?? notes;
      if (op.op === 'add') nextId = Math.max(nextId, idNumber(op.id) + 1);
    }
    if (c.recap !== undefined) recap = c.recap;
    if (c.habits && 'rules' in c.habits) habits = c.habits.rules;
  });
  return { notes, recap, habits, nextId };
}

/**
 * The change an answer makes to `l`: adds get ids; a note or recap too long is cut at a word and a pin past the cap is
 * dropped (the note kept), as the game's journal does; an op that wouldn't apply (an unknown id) or a light not in the
 * room is refused and counted. Standing, time, plans,
 * promises, Cipher and the dossier are ignored, and so is a recap unless `o.recap` (a recap run). `names`: hers and
 * yours, kept out of keywords.
 */
export function applyAnswer(
  l: Ledger,
  a: ResidualAnswer,
  lightIds: ReadonlySet<string>,
  names: readonly string[],
  o: { recap?: boolean; roomLights?: readonly LightDef[]; painted?: readonly LightDef[] } = {},
): LedgerChange {
  let notes = l.notes;
  let nextId = l.nextId;
  let refused = 0;
  const ops: LedgerOp[] = [];
  const pinsAfter = (ns: Note[]) => ns.filter((n) => n.pinned).length;
  for (const o of a.notes) {
    let op: LedgerOp;
    if (o.op === 'add') op = { op: 'add', id: `n${nextId}`, about: o.about, text: o.text.trim(), keys: normalizeKeys(o.keys, names), pin: o.pin };
    else if (o.op === 'rewrite')
      op = { op: 'rewrite', id: o.id, ...(o.text !== undefined ? { text: o.text.trim() } : {}), ...(o.keys !== undefined ? { keys: normalizeKeys(o.keys, names) } : {}), ...(o.pin !== undefined ? { pin: o.pin } : {}) };
    else op = { op: 'forget', id: o.id };
    if ('text' in op && op.text !== undefined) op.text = fit(op.text, NOTE_MAX);
    let next = 'text' in op && op.text === '' ? null : applyOp(notes, op, 0);
    // Past the pin cap the note is kept, unpinned: the live check lost a note she tried to keep three times.
    if (next && pinsAfter(next) > Math.max(PIN_CAP, pinsAfter(notes))) {
      if (op.op === 'add') op.pin = false;
      else if (op.op === 'rewrite') delete op.pin;
      next = applyOp(notes, op, 0);
    }
    if (!next) {
      refused++;
      continue;
    }
    notes = next;
    if (op.op === 'add') nextId++;
    ops.push(op);
  }
  const lights: LedgerChange['lights'] = [];
  for (const light of a.lights) {
    // A group (light groups): every member at that share of its base, saved light by light like any other.
    const group = o.roomLights ? asGroup(light.id) : null;
    if (group && o.roomLights) {
      const painted = new Map((o.painted ?? []).map((x) => [x.id, x.intensity]));
      const members = setGroup(o.roomLights, group, Math.max(0, light.intensity), { painted }).filter((x) => groupOf(x) === group);
      if (members.length === 0) refused++;
      for (const m of members) lights.push({ id: m.id, intensity: m.intensity });
    } else if (!lightIds.has(light.id)) refused++;
    else lights.push({ id: light.id, intensity: Math.min(1, Math.max(0, light.intensity)) });
  }
  // Only a recap run's recap: one written on an ordinary turn would replace the whole chat's with that turn's.
  const recap = o.recap && a.recap ? fit(a.recap, RECAP_MAX) : undefined;
  const keepRecap = recap !== undefined && recap.length >= 1;
  if (recap !== undefined && !keepRecap) refused++;
  return { notes: ops, lights, ...(keepRecap ? { recap } : {}), run: refused > 0 ? { ok: true, refused } : { ok: true } };
}

const isHers = (m: ChatMessage) => !m.is_user && !m.is_system;

/** Her replies in `chat[0..upTo]`. */
export function herReplies(chat: ChatMessage[], upTo: number): number {
  return chat.slice(0, upTo + 1).filter(isHers).length;
}

/** Her reply at `at` is one of every RECAP_EVERY: its run also writes the recap. */
export function isRecapRun(chat: ChatMessage[], at: number): boolean {
  return herReplies(chat, at) % RECAP_EVERY === 0;
}

/** One of her written replies (`name`: hers): not yours, not hidden, not a narrator's or anyone else's, not a tool
 * call's message, not empty. */
const isReply = (m: ChatMessage & { extra?: { tool_invocations?: unknown; type?: unknown } }, name: string | undefined) =>
  isHers(m) && m.name === name && m.extra?.type !== 'narrator' && !m.extra?.tool_invocations && (m.mes ?? '').trim() !== '';

/**
 * Whether the run for her reply at `at` also runs Habits (the game's habitsDue): first once she has written
 * HABITS.firstAfter replies; then HABITS.every replies after the last run that worked, or HABITS.retryGap after one
 * that failed, counted from the message that carries it.
 */
export function habitsDue(chat: ChatMessage[], at: number): boolean {
  const name = chat[at]?.name;
  const replies = (from: number) => chat.slice(from, at + 1).filter((m) => isReply(m, name)).length;
  for (let i = at - 1; i >= 0; i--) {
    const h = changeOf(chat[i])?.habits;
    if (!h) continue;
    return replies(i + 1) >= ('failed' in h ? HABITS.retryGap : HABITS.every);
  }
  return replies(0) >= HABITS.firstAfter;
}

/** What the habits run for her reply at `at` reads (as the game's runner builds it): her last HABITS.window replies and
 * your lines between; `hers` for its quote check. */
export function habitsInput(chat: ChatMessage[], at: number, self: string, player: string, current: string[]): { input: HabitsRunInput; hers: string[] } {
  const upTo = chat.slice(0, at + 1);
  const name = chat[at]?.name;
  const mine = upTo.filter((m) => isReply(m, name)).slice(-HABITS.window);
  const from = mine.length > 0 ? upTo.indexOf(mine[0]) : upTo.length;
  const lines = upTo
    .slice(from)
    .filter((m) => isReply(m, name) || (m.is_user && !m.is_system && (m.mes ?? '').trim() !== ''))
    .map((m) => ({ speaker: m.is_user ? ('them' as const) : ('her' as const), text: m.mes ?? '' }));
  return { input: { self, player, lines, current }, hers: mine.map((m) => m.mes ?? '') };
}

/** What the run at `at` reads: the lines since the last run that worked (a failed one's lines are read again), up to
 * `at`, the newest EXCHANGES_MAX. */
export function exchangesFor(chat: ChatMessage[], at: number): { speaker: string; text: string }[] {
  let from = 0;
  for (let i = at - 1; i >= 0; i--) {
    if (changeOf(chat[i])?.run.ok) {
      from = i + 1;
      break;
    }
  }
  return chat
    .slice(from, at + 1)
    .filter((m) => !m.is_system && (m.mes ?? '') !== '')
    .slice(-EXCHANGES_MAX)
    .map((m) => ({ speaker: m.name ?? '', text: m.mes ?? '' }));
}
