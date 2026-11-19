/**
 * Two Stories (spec 2026-11-10-two-stories): the accounts board. Two listeners each ask three things; Soren answers
 * with TRUE and COVER cards; a card that clashes with what a listener holds gets him pressed; everything told to one
 * listener can be carried to the other by the glass. Hand-written in world/accounts/<id>.md, checked on load; the
 * rules are pure moves on the run's state, judged on the server.
 */
import { CARD_KINDS, pairKey, readCardLine, sections, type CaseProblem } from './cases';
import { splitFrontMatter } from './lore';
import { holds, parseCondition, type CondCtx, type Condition } from './quests';

export interface AccountCard {
  id: string;
  kind: string;
  source: string;
  line: string;
  /** The blank keys it can answer; none: evidence only a listener holds. */
  fills: string[];
  /** `free`: every run has it; `given`: a quest's `gives: clue <file> <CARD>` gives it. */
  from: 'free' | 'given';
  when: Condition[] | null;
  /** Every kind but `cover` is TRUE. */
  true: boolean;
}

export interface ListenerSpec {
  id: string;
  patience: number;
  asks: { key: string; question: string }[];
  knows: { card: string; unmarked: boolean; when: Condition[] | null }[];
  /** Telling this listener the card sets the flag at TELL. */
  costs: Map<string, { flag: string; value: string }>;
  /** Blanks already filled on the night. */
  locked: { key: string; card: string; when: Condition[] | null }[];
}

export interface AccountsFile {
  id: string;
  title: string;
  /** The quest whose beats give the cards. */
  quest: string;
  listeners: ListenerSpec[];
  cards: Map<string, AccountCard>;
  /** pairKey → the pressing line. */
  clashes: Map<string, string>;
  leak: { from: string; to: string; unless: Condition[] | null } | null;
  /** States story-check may leave flagged on purpose. */
  hard: Condition[][];
}

/** What a run brings to the board: the given cards its kit holds (bare ids) and the flags its conditions read. */
export interface StoryRun {
  held: readonly string[];
  ctx: CondCtx;
}

export interface AccountsState {
  /** listener → blank key → card, for open blanks only (locked ones come from the file and the run). */
  placed: Record<string, Record<string, string>>;
  /** listener → the pairKeys that pressed them. */
  pressed: Record<string, string[]>;
  /** Cards that were pressed, shown PRESSED in the hand. */
  marked: string[];
  patience: Record<string, number>;
  /** Cards the glass carried to `leak.to`: said, so taking them back doesn't unsay them. */
  leaked: string[];
  told?: true;
}

export type AccountsMove = { kind: 'place'; card: string; listener: string; blank: string } | { kind: 'take'; listener: string; blank: string } | { kind: 'tell' };

export interface AccountsCardView {
  id: string;
  kind: string;
  source: string;
  line: string;
  true: boolean;
  /** The blanks it can answer (the screen lights them when it's picked). */
  fills: string[];
  pressed?: boolean;
}

export interface AccountsView {
  id: string;
  title: string;
  listeners: {
    id: string;
    /** The contact's name, and her face (null: show her initial). */
    name: string;
    portrait: string | null;
    /** Her colour (character.json `accent`): her name on the board. */
    accent?: string;
    patience: number;
    patienceMax: number;
    asks: { key: string; question: string; card?: AccountsCardView; locked: boolean }[];
    /** THEY'VE GOT: face down with the source (null: unmarked), face up once a press turned it; `glass`: carried there. */
    holds: { source: string | null; card?: AccountsCardView; glass?: true }[];
  }[];
  hand: AccountsCardView[];
  eye: { from: string; to: string; dark: boolean } | null;
  tellOpen: boolean;
}

/** TELL's pick line. */
export const TELL_LINE = 'You tell it.';

const ID = /^[A-Z][A-Z0-9_-]*$/;
const KEY = /^[A-Z][A-Z0-9_-]*$/;
const CONTACT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FLAG = /^[a-z0-9_.-]+$/;

function cond(s: string | undefined, where: string, p: (field: string, message: string) => void): Condition[] | null {
  if (s === undefined) return null;
  const c = parseCondition(s);
  if (!Array.isArray(c)) {
    p(where, c.message);
    return null;
  }
  // A count (`hears>=2`) reads a crew-rules job's own clock; here it would silently read 0.
  const count = c.find((x) => x.kind === 'count');
  if (count) {
    p(where, `can't read '${count.name}${count.op}${count.value}' (no clocks in an accounts file: a flag=value, a band or heat>=N)`);
    return null;
  }
  return c;
}

export function parseAccountsFile(id: string, text: string, known: { roster: ReadonlySet<string> | null }): { ok: true; entry: AccountsFile } | { ok: false; problems: CaseProblem[] } {
  const problems: CaseProblem[] = [];
  const p = (field: string, message: string) => problems.push({ field, message });
  const s = splitFrontMatter(text);
  if ('field' in s) return { ok: false, problems: [s] };
  const f = s.front;
  const title = typeof f.title === 'string' ? f.title : '';
  if (!title) p('title', 'needs a title');
  const quest = typeof f.quest === 'string' ? f.quest : '';
  if (!quest) p('quest', 'needs the quest that gives its cards');

  const patience = new Map<string, number>();
  for (const part of String(f.patience ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const m = /^([a-z0-9-]+)\s+(\d+)$/.exec(part);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 9) p('patience', `'${part}' isn't <listener> <1–9>`);
    else patience.set(m[1], Number(m[2]));
  }

  let leak: AccountsFile['leak'] = null;
  if (f.leaks != null) {
    const m = /^([a-z0-9-]+)\s*→\s*([a-z0-9-]+)(?:\s+unless\s+(.+))?$/.exec(String(f.leaks).trim());
    if (!m) p('leaks', `'${f.leaks}' isn't <from> → <to> [unless <condition>]`);
    else leak = { from: m[1], to: m[2], unless: cond(m[3], 'leaks', p) };
  }
  const hard = (Array.isArray(f.hard) ? f.hard : f.hard == null ? [] : [f.hard]).map((h) => cond(String(h), 'hard', p) ?? []);

  // Sections: # cards, # clashes, and one per listener (a contact id). `asks:` is a listener section's one bare line.
  const sec = sections(s.body);
  const asksLines = new Map<string, string>();
  let cur: string | null = null;
  for (const raw of s.body.split('\n')) {
    const line = raw.trim();
    const h = /^#\s+(.+)$/.exec(line);
    if (h) cur = h[1].trim().toLowerCase();
    else if (cur && /^asks:/.test(line)) asksLines.set(cur, line.slice(5).trim());
  }

  const cards = new Map<string, AccountCard>();
  for (const line of sec.get('cards') ?? []) {
    const r = readCardLine(line);
    if (typeof r === 'string') {
      p('cards', r);
      continue;
    }
    for (const k of r.tail.keys()) if (!['fills', 'from', 'if'].includes(k)) p(r.id, `can't read '${k}:' (fills:, from: or if:)`);
    if (r.kind !== 'cover' && !(CARD_KINDS as readonly string[]).includes(r.kind)) p(r.id, `kind '${r.kind}' isn't cover or one of ${CARD_KINDS.join(', ')}`);
    const from = r.tail.get('from') ?? '';
    if (from !== 'free' && from !== 'given') p(r.id, `from: '${from}' isn't free or given`);
    const fills = (r.tail.get('fills') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    for (const k of fills) if (!KEY.test(k)) p(r.id, `fills: '${k}' isn't a blank key`);
    if (cards.has(r.id)) p(r.id, 'listed twice');
    cards.set(r.id, { id: r.id, kind: r.kind, source: r.source, line: r.line, fills, from: from === 'given' ? 'given' : 'free', when: cond(r.tail.get('if'), r.id, p), true: r.kind !== 'cover' });
  }
  const card = (cid: string, where: string) => {
    if (!cards.has(cid)) p(where, `unknown card '${cid}'`);
    return cid;
  };

  const listeners: ListenerSpec[] = [];
  for (const [name, lines] of sec) {
    if (name === 'cards' || name === 'clashes') continue;
    if (!CONTACT.test(name) || (known.roster && !known.roster.has(name))) {
      p(name, `'${name}' isn't a contact on the roster`);
      continue;
    }
    const asks: ListenerSpec['asks'] = [];
    for (const part of (asksLines.get(name) ?? '').split('·').map((x) => x.trim()).filter(Boolean)) {
      const m = /^([A-Z][A-Z0-9_-]*)\s*\|\s*(.+)$/.exec(part);
      if (!m) p(name, `asks: '${part}' isn't KEY | QUESTION`);
      else asks.push({ key: m[1], question: m[2].trim() });
    }
    if (asks.length !== 3) p(name, `asks: needs three blanks (this has ${asks.length})`);
    const l: ListenerSpec = { id: name, patience: patience.get(name) ?? 3, asks, knows: [], costs: new Map(), locked: [] };
    for (const line of lines) {
      let m: RegExpExecArray | null;
      if ((m = /^knows\s+([A-Z][A-Z0-9_-]*)(\s+unmarked)?(?:\s+if\s+(.+))?$/.exec(line))) l.knows.push({ card: card(m[1], name), unmarked: Boolean(m[2]), when: cond(m[3], name, p) });
      else if ((m = /^costs\s+([A-Z][A-Z0-9_-]*)\s*→\s*([^\s=]+)=(\S+)$/.exec(line)) && FLAG.test(m[2]) && FLAG.test(m[3])) l.costs.set(card(m[1], name), { flag: m[2], value: m[3] });
      else if ((m = /^fills\s+([A-Z][A-Z0-9_-]*)\s+([A-Z][A-Z0-9_-]*)(?:\s+if\s+(.+))?$/.exec(line))) {
        const c = cards.get(card(m[2], name));
        if (!asks.some((a) => a.key === m![1])) p(name, `fills: ${name} doesn't ask ${m[1]}`);
        else if (c && !c.fills.includes(m[1])) p(name, `fills: ${m[2]} can't fill ${m[1]}`);
        l.locked.push({ key: m[1], card: m[2], when: cond(m[3], name, p) });
      } else p(name, `can't read '${line}' (knows CARD [unmarked] [if …], costs CARD → flag=value, fills KEY CARD [if …])`);
    }
    listeners.push(l);
  }
  if (listeners.length < 2) p('listeners', 'needs at least two listeners');
  for (const name of patience.keys()) if (!listeners.some((l) => l.id === name)) p('patience', `no listener '${name}'`);
  if (leak) for (const x of [leak.from, leak.to]) if (!listeners.some((l) => l.id === x)) p('leaks', `no listener '${x}'`);

  const asked = new Set(listeners.flatMap((l) => l.asks.map((a) => a.key)));
  for (const c of cards.values()) for (const k of c.fills) if (!asked.has(k)) p(c.id, `fills: nobody asks ${k}`);

  // Where a card can sit: listeners it can be placed with, or is locked in; listeners who hold it.
  const placeable = (cid: string, l: ListenerSpec) => (cards.get(cid)?.fills ?? []).some((k) => l.asks.some((a) => a.key === k));
  const lockedIn = (cid: string, l: ListenerSpec) => l.locked.some((x) => x.card === cid);
  const heldBy = (cid: string, l: ListenerSpec) => l.knows.some((x) => x.card === cid);
  const L = (x: string) => listeners.find((l) => l.id === x);
  const meet = (a: string, b: string): boolean => {
    for (const l of listeners) if ((placeable(a, l) && heldBy(b, l)) || (placeable(b, l) && heldBy(a, l))) return true;
    const from = leak && L(leak.from);
    const to = leak && L(leak.to);
    if (from && to) for (const [x, y] of [[a, b], [b, a]]) if (placeable(x, from) && (placeable(y, to) || lockedIn(y, to))) return true;
    return false;
  };

  const clashes = new Map<string, string>();
  for (const line of sec.get('clashes') ?? []) {
    const m = /^([A-Z0-9_-]+)\s+×\s+([A-Z0-9_-]+):\s+"?(.+?)"?$/.exec(line);
    if (!m || !ID.test(m[1]) || !ID.test(m[2])) {
      p('clashes', `'${line}' isn't A × B: "line"`);
      continue;
    }
    card(m[1], 'clashes');
    card(m[2], 'clashes');
    const k = pairKey(m[1], m[2]);
    if (clashes.has(k)) p('clashes', `${m[1]} × ${m[2]} is listed twice`);
    else if (cards.has(m[1]) && cards.has(m[2]) && !meet(m[1], m[2])) p('clashes', `${m[1]} × ${m[2]} can never meet`);
    clashes.set(k, m[3]);
  }

  if (problems.length) return { ok: false, problems };
  return { ok: true, entry: { id, title, quest, listeners, cards, clashes, leak, hard } };
}

// ---- The rules --------------------------------------------------------------------------------------------------

export const freshAccounts = (f: AccountsFile): AccountsState => ({
  placed: Object.fromEntries(f.listeners.map((l) => [l.id, {}])),
  pressed: Object.fromEntries(f.listeners.map((l) => [l.id, []])),
  marked: [],
  patience: Object.fromEntries(f.listeners.map((l) => [l.id, l.patience])),
  leaked: [],
});

/** Whether the run has this card: free or given, and its condition holds. */
const has = (f: AccountsFile, run: StoryRun, cid: string): boolean => {
  const c = f.cards.get(cid);
  return !!c && (c.from === 'free' || run.held.includes(cid)) && holds(c.when, run.ctx);
};
const listener = (f: AccountsFile, id: string) => f.listeners.find((l) => l.id === id);
const lockedCard = (f: AccountsFile, run: StoryRun, l: ListenerSpec, key: string): string | null => {
  const x = l.locked.find((y) => y.key === key && holds(y.when, run.ctx) && has(f, run, y.card));
  return x ? x.card : null;
};
const leaking = (f: AccountsFile, run: StoryRun): boolean => f.leak !== null && !(f.leak.unless && holds(f.leak.unless, run.ctx));
/** What a listener holds: their known cards this run has, and what the glass carried to them. */
const heldBy = (f: AccountsFile, s: AccountsState, run: StoryRun, l: ListenerSpec): string[] => [
  ...l.knows.filter((k) => holds(k.when, run.ctx) && has(f, run, k.card)).map((k) => k.card),
  ...(f.leak?.to === l.id && leaking(f, run) ? s.leaked.filter((c) => f.cards.has(c)) : []),
];
/** A listener's account: each asked blank's card, locked or placed. */
const account = (f: AccountsFile, s: AccountsState, run: StoryRun, l: ListenerSpec): (string | null)[] => l.asks.map((a) => lockedCard(f, run, l, a.key) ?? s.placed[l.id]?.[a.key] ?? null);
const handOf = (f: AccountsFile, s: AccountsState, run: StoryRun): string[] => {
  const used = new Set(f.listeners.flatMap((l) => account(f, s, run, l).filter((c): c is string => c !== null)));
  return [...f.cards.values()].filter((c) => c.fills.length > 0 && has(f, run, c.id) && !used.has(c.id)).map((c) => c.id);
};
const tellOpenOf = (f: AccountsFile, s: AccountsState, run: StoryRun): boolean =>
  !s.told && (f.listeners.every((l) => l.asks.every((a) => lockedCard(f, run, l, a.key) !== null || s.placed[l.id]?.[a.key] !== undefined)) || f.listeners.some((l) => (s.patience[l.id] ?? 0) === 0));

/** A press on `l` by the pair: a new pair costs a box of patience, a repeat costs nothing. */
function pressed(s: AccountsState, l: string, a: string, b: string): AccountsState {
  const k = pairKey(a, b);
  if (s.pressed[l]?.includes(k)) return s;
  return { ...s, pressed: { ...s.pressed, [l]: [...(s.pressed[l] ?? []), k] }, patience: { ...s.patience, [l]: Math.max(0, (s.patience[l] ?? 0) - 1) } };
}
const mark = (s: AccountsState, cid: string): AccountsState => (s.marked.includes(cid) ? s : { ...s, marked: [...s.marked, cid] });

export function applyAccountsMove(f: AccountsFile, s: AccountsState, run: StoryRun, m: AccountsMove): { state: AccountsState; said?: string; by?: string; refused?: string; told?: Record<string, string> } {
  const no = (refused: string) => ({ state: s, refused });
  if (s.told) return no('Already told.');
  switch (m.kind) {
    case 'place': {
      const l = listener(f, m.listener);
      if (!l) return no(`no listener '${m.listener}'`);
      if (!handOf(f, s, run).includes(m.card)) return no(`${m.card} isn't in your hand`);
      if (!l.asks.some((a) => a.key === m.blank)) return no(`${l.id} doesn't ask ${m.blank}`);
      if (!f.cards.get(m.card)!.fills.includes(m.blank)) return no(`${m.card} doesn't answer ${m.blank}`);
      if (lockedCard(f, run, l, m.blank)) return no('That was said on the night.');
      if (s.placed[l.id]?.[m.blank] !== undefined) return no('Take that card back first.');
      if ((s.patience[l.id] ?? 0) === 0) return no(`${l.id.toUpperCase()} has stopped listening.`);
      // What they hold presses it: the card comes back, marked, and theirs turns face up.
      const h = heldBy(f, s, run, l).find((x) => f.clashes.has(pairKey(m.card, x)));
      if (h) return { state: mark(pressed(s, l.id, m.card, h), m.card), said: f.clashes.get(pairKey(m.card, h)), by: l.id };
      let state: AccountsState = { ...s, placed: { ...s.placed, [l.id]: { ...s.placed[l.id], [m.blank]: m.card } } };
      let said: string | undefined;
      let by: string | undefined;
      // The glass: told to `from`, it joins what `to` holds, and presses whatever in `to`'s account it clashes with.
      const to = f.leak && f.leak.from === l.id && leaking(f, run) ? listener(f, f.leak.to) : undefined;
      if (to) {
        if (!state.leaked.includes(m.card)) state = { ...state, leaked: [...state.leaked, m.card] };
        for (const a of to.asks) {
          const locked = lockedCard(f, run, to, a.key);
          const c = locked ?? state.placed[to.id]?.[a.key];
          if (!c || !f.clashes.has(pairKey(m.card, c))) continue;
          state = pressed(state, to.id, m.card, c);
          said = f.clashes.get(pairKey(m.card, c));
          by = to.id;
          if (!locked) {
            const rest = { ...state.placed[to.id] };
            delete rest[a.key];
            state = mark({ ...state, placed: { ...state.placed, [to.id]: rest } }, c);
          }
        }
      }
      return { state, ...(said !== undefined ? { said, by } : {}) };
    }
    case 'take': {
      const l = listener(f, m.listener);
      if (!l) return no(`no listener '${m.listener}'`);
      if (lockedCard(f, run, l, m.blank)) return no('That was said on the night.');
      if (s.placed[l.id]?.[m.blank] === undefined) return no('Nothing there.');
      const rest = { ...s.placed[l.id] };
      delete rest[m.blank];
      return { state: { ...s, placed: { ...s.placed, [l.id]: rest } } };
    }
    case 'tell': {
      if (!tellOpenOf(f, s, run)) return no('Fill every blank first, or wait until someone stops listening.');
      const told: Record<string, string> = {};
      for (const l of f.listeners) {
        const cards = account(f, s, run, l);
        const full = cards.every((c) => c !== null);
        told[`story.${l.id}`] = (s.patience[l.id] ?? 0) === 0 ? 'caught' : full && (s.pressed[l.id] ?? []).length === 0 ? 'held' : 'thin';
        told[`story.${l.id}-true`] = full && cards.every((c) => f.cards.get(c!)!.true) ? 'yes' : 'no';
      }
      for (const l of f.listeners)
        for (const c of account(f, s, run, l)) {
          const cost = c ? l.costs.get(c) : undefined;
          if (cost) told[cost.flag] = cost.value;
        }
      return { state: { ...s, told: true }, told };
    }
  }
}

/** A saved board against the file and the run as they are now: what's gone, or now locked, goes back to the hand. */
export function cleanAccounts(f: AccountsFile, s: AccountsState, run: StoryRun): AccountsState {
  const fresh = freshAccounts(f);
  const placed: AccountsState['placed'] = {};
  const pressedBy: AccountsState['pressed'] = {};
  const patience: AccountsState['patience'] = {};
  for (const l of f.listeners) {
    placed[l.id] = {};
    for (const [k, c] of Object.entries(s.placed[l.id] ?? {})) {
      if (l.asks.some((a) => a.key === k) && has(f, run, c) && f.cards.get(c)!.fills.includes(k) && !lockedCard(f, run, l, k)) placed[l.id][k] = c;
    }
    pressedBy[l.id] = (s.pressed[l.id] ?? []).filter((k) => f.clashes.has(k));
    patience[l.id] = Math.min(l.patience, Math.max(0, s.patience[l.id] ?? fresh.patience[l.id]));
  }
  return { placed, pressed: pressedBy, marked: s.marked.filter((c) => f.cards.has(c)), patience, leaked: s.leaked.filter((c) => f.cards.has(c)), ...(s.told ? { told: true as const } : {}) };
}

const cardView = (f: AccountsFile, cid: string, s?: AccountsState): AccountsCardView => {
  const c = f.cards.get(cid)!;
  return { id: c.id, kind: c.kind, source: c.source, line: c.line, true: c.true, fills: c.fills, ...(s?.marked.includes(cid) ? { pressed: true } : {}) };
};

/** A listener's name and face, from the roster; null for one it doesn't know. */
export type ListenerInfo = (id: string) => { name: string; portrait: string | null; accent?: string } | null;

export function accountsView(f: AccountsFile, s: AccountsState, run: StoryRun, who?: ListenerInfo): AccountsView {
  return {
    id: f.id,
    title: f.title,
    listeners: f.listeners.map((l) => {
      const turned = new Set((s.pressed[l.id] ?? []).flatMap((k) => k.split('|')));
      const unmarked = new Set(l.knows.filter((k) => k.unmarked).map((k) => k.card));
      const glass = f.leak?.to === l.id && leaking(f, run) ? new Set(s.leaked) : new Set<string>();
      const info = who?.(l.id) ?? null;
      return {
        id: l.id,
        name: info?.name ?? l.id.charAt(0).toUpperCase() + l.id.slice(1),
        portrait: info?.portrait ?? null,
        ...(info?.accent ? { accent: info.accent } : {}),
        patience: s.patience[l.id] ?? l.patience,
        patienceMax: l.patience,
        asks: l.asks.map((a) => {
          const locked = lockedCard(f, run, l, a.key);
          const c = locked ?? s.placed[l.id]?.[a.key];
          return { key: a.key, question: a.question, locked: locked !== null, ...(c ? { card: cardView(f, c) } : {}) };
        }),
        holds: heldBy(f, s, run, l).map((c) => ({
          source: unmarked.has(c) && !turned.has(c) ? null : f.cards.get(c)!.source,
          ...(turned.has(c) ? { card: cardView(f, c) } : {}),
          ...(glass.has(c) ? { glass: true as const } : {}),
        })),
      };
    }),
    hand: handOf(f, s, run).map((c) => cardView(f, c, s)),
    eye: f.leak ? { from: f.leak.from, to: f.leak.to, dark: !leaking(f, run) } : null,
    tellOpen: tellOpenOf(f, s, run),
  };
}

/**
 * A run's standing at the board before any move, by card id (story-check, spec §6): the hand, what each listener
 * holds, the locked blanks, and whether the glass carries.
 */
export function storyFacts(f: AccountsFile, run: StoryRun): { hand: string[]; held: Record<string, string[]>; locked: Record<string, Record<string, string>>; leaking: boolean } {
  const s = freshAccounts(f);
  return {
    hand: handOf(f, s, run),
    held: Object.fromEntries(f.listeners.map((l) => [l.id, heldBy(f, s, run, l)])),
    locked: Object.fromEntries(f.listeners.map((l) => [l.id, Object.fromEntries(l.asks.flatMap((a) => { const c = lockedCard(f, run, l, a.key); return c ? [[a.key, c]] : []; }))])),
    leaking: leaking(f, run),
  };
}
