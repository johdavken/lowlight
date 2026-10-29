/**
 * Cipher (spec 2026-10-28-residual-and-cipher §2): the truths a playthrough holds back, the clues that showed on the
 * page, and what the player learned. Each contact's room.db keeps the events written from her replies under
 * `cipher.<player>` (story meta, so rewind and branch rebuild them); the playthrough's Cipher is every contact's
 * list folded together. Pure: the server folds and checks, the client only ever gets the LOOSE ENDS view.
 */
import type { LooseClue, LooseEndsView } from './types';

export const TRUTH_KINDS = ['self', 'between', 'place', 'city', 'yours'] as const;
export type TruthKind = (typeof TRUTH_KINDS)[number];

export const CIPHER = {
  openMax: 3,
  /** Replies in the playthrough before the first truths. */
  setupAfter: 6,
  /** Replies between two cipher runs. */
  refillGap: 10,
  /** A run is due while fewer than this many are open. */
  refillBelow: 2,
  /** Replies to wait after a failed cipher call (the provider down) before trying again. */
  retryGap: 3,
  truthMax: 300,
  whenMax: 200,
  changesMax: 200,
  ideasMax: 200,
  clueMax: 160,
} as const;

/** One contact's Cipher events for `player` (story meta). */
export const cipherKey = (player: string) => `cipher.${player}`;

export type CipherEvent =
  | { t: 'truth'; id: string; kind: TruthKind; truth: string; knownBy: string[]; comesOutWhen: string; changes: string; clueIdeas: string; seq: number }
  | { t: 'clue'; id: string; text: string; messageId: string; at: number; place: string; onPage: boolean; seq: number }
  | { t: 'learned'; id: string; seq: number }
  /** A cipher run happened (spec §2.2): even one that wrote nothing waits refillGap. */
  | { t: 'run'; replies: number; seq: number };

export interface Clue {
  text: string;
  messageId: string;
  at: number;
  place: string;
  onPage: boolean;
}

export interface Truth {
  id: string;
  kind: TruthKind;
  truth: string;
  knownBy: string[];
  comesOutWhen: string;
  changes: string;
  clueIdeas: string;
  state: 'open' | 'out';
  clues: Clue[];
}

export interface CipherState {
  truths: Truth[];
  /** Her replies across the playthrough. */
  replies: number;
  /** `replies` when the last cipher run happened; null: never. */
  lastRun: number | null;
}

export interface NewTruth {
  kind: TruthKind;
  truth: string;
  knownBy: string[];
  comesOutWhen: string;
  changes: string;
  clueIdeas: string;
}

/** A stored list; anything unreadable is no events. */
export function parseCipherEvents(v: string | null): CipherEvent[] {
  if (v === null) return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as CipherEvent[]) : [];
  } catch {
    return [];
  }
}

const open = (ts: readonly Truth[]) => ts.filter((t) => t.state === 'open');

/** Why `t` can't open now, or null: the open cap and the mix (spec §2.2a). */
function mixRefusal(truths: readonly Truth[], t: Pick<NewTruth, 'kind' | 'knownBy'>): string | null {
  const now = open(truths);
  if (now.length >= CIPHER.openMax) return 'open: full';
  if (now.some((o) => o.kind === t.kind)) return `kind: already open (${t.kind})`;
  const held = t.knownBy.find((id) => now.some((o) => o.knownBy.includes(id)));
  return held ? `knownBy: already holds an open truth (${held})` : null;
}

/**
 * Every contact's events as one Cipher, in `seq` order. A truth that would break the cap or the mix is dropped (two
 * Residuals can race a run); a clue or learned whose truth isn't there (rewound on another contact) is dropped too.
 */
export function foldCipher(lists: CipherEvent[][], replies: number): CipherState {
  const truths: Truth[] = [];
  let lastRun: number | null = null;
  for (const e of lists.flat().sort((a, b) => a.seq - b.seq)) {
    if (e.t === 'run') lastRun = Math.max(lastRun ?? 0, e.replies);
    else if (e.t === 'truth') {
      if (mixRefusal(truths, e) !== null || truths.some((t) => t.id === e.id)) continue;
      truths.push({ id: e.id, kind: e.kind, truth: e.truth, knownBy: e.knownBy, comesOutWhen: e.comesOutWhen, changes: e.changes, clueIdeas: e.clueIdeas, state: 'open', clues: [] });
    } else {
      const t = truths.find((x) => x.id === e.id);
      if (!t) continue;
      if (e.t === 'learned') t.state = 'out';
      // A re-read of the same reply (KEEP GOING) can log its clue again: once is enough.
      else if (!t.clues.some((c) => c.messageId === e.messageId && c.text === e.text)) t.clues.push({ text: e.text, messageId: e.messageId, at: e.at, place: e.place, onPage: e.onPage });
    }
  }
  return { truths, replies, lastRun };
}

/** Whether a cipher run is due (spec §2.2). */
export function cipherDue(s: CipherState): boolean {
  return s.replies >= CIPHER.setupAfter && open(s.truths).length < CIPHER.refillBelow && (s.lastRun === null || s.replies - s.lastRun >= CIPHER.refillGap);
}

/**
 * Why a new truth is refused, field first, or null (spec §2.2–2.2a). A truth may name the player — what others did
 * about them is fair game (hand-check 2026-10-29) — but they never keep one.
 */
export function checkNewTruth(s: CipherState, t: NewTruth, o: { cast: ReadonlySet<string>; playerId: string }): string | null {
  if (!(TRUTH_KINDS as readonly string[]).includes(t.kind)) return 'kind: unknown';
  if (t.knownBy.includes(o.playerId)) return 'knownBy: the player';
  const stranger = t.knownBy.find((id) => !o.cast.has(id));
  if (stranger) return `knownBy: not in the cast (${stranger})`;
  if (t.truth.length > CIPHER.truthMax) return `truth: over ${CIPHER.truthMax}`;
  return mixRefusal(s.truths, t);
}

// ── The prose check (spec §2.5) ─────────────────────────────────────────────

const STOP = new Set(
  ('that this these those there their them then than what when where which while with from into onto over under ' +
    'about after before again some just very only never every each other they were been being have will would could ' +
    'should something someone nothing anything clue reply scene shows showed shown says said turn moment').split(' '),
);
const stem = (w: string) => w.slice(0, 5);

/** A reply's story: her words and *actions*, without `[head]` lines, `// TOOL` lines or markup. An event card's text stays. */
export function storyProse(text: string): string {
  return text
    .split('\n')
    // The narrator's event reads as `[event: "Title": text]` (shared/encounter.ts): its text is on the page.
    .map((l) => l.replace(/^\s*\[event: "[^"]*": (.*)\]\s*$/, '$1'))
    .filter((l) => !/^\s*\[[^\]]*\]\s*$/.test(l) && !/^\s*\/\/ /.test(l))
    .join('\n')
    .replace(/<[^>]+>/g, ' ');
}

/** The words a clue is about: four letters or more, not names (capitalised), not small words. */
function clueWords(clue: string): string[] {
  return (clue.match(/[\p{L}][\p{L}'’-]*/gu) ?? [])
    .filter((w) => !/^\p{Lu}/u.test(w))
    .map((w) => w.toLowerCase().replace(/['’]s$/, ''))
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

/** Whether the page shows the clue: any of its words, stemmed, is on it. A clue with nothing to compare counts. */
export function clueOnPage(clue: string, prose: string): boolean {
  const want = clueWords(clue);
  if (want.length === 0) return true;
  const have = new Set((prose.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) ?? []).map((w) => stem(w.replace(/['’]s$/, ''))));
  return want.some((w) => have.has(stem(w)));
}

// ── Prompt blocks (spec §2.6–2.7) ───────────────────────────────────────────

const sentence = (s: string) => s.trim().replace(/[.!?]?$/, (m) => m || '.');

/** Her `[cipher]` block: the open truths she knows, and how to carry them; null when she knows none. */
export function cipherBlock(truths: readonly Truth[], self: string, player: string): string | null {
  const hers = truths.filter((t) => t.state === 'open' && t.knownBy.includes(self));
  if (hers.length === 0) return null;
  return [
    `[cipher] Things you know that ${player} doesn't. Keep every scene consistent with them.`,
    ...hers.map((t) => `- ${sentence(t.truth)} Comes out when: ${t.comesOutWhen.trim().replace(/\.$/, '')}. Hints you could drop: ${t.clueIdeas.trim()}`),
    'Most replies carry no hint. When one does, keep it small — something that could mean something else.',
    'Guard it, avoid it, or let it slip when the moment pushes you. Never announce it.',
    `If ${player} goes where it's kept and pays what it costs, they find it. Don't stonewall someone standing in front of the answer.`,
  ].join('\n');
}

/** The narrator's block for encounter draws: every open truth; null when none. */
export function cipherNarratorBlock(truths: readonly Truth[]): string | null {
  const open = truths.filter((t) => t.state === 'open');
  if (open.length === 0) return null;
  return ['Secrets in this story (never state them):', ...open.map((t) => `- ${sentence(t.truth)} Hints: ${t.clueIdeas.trim()}`), "An event may carry a small hint to one of these. Most don't."].join('\n');
}

// ── LOOSE ENDS (spec §2.8) ──────────────────────────────────────────────────

/** What the player has seen: on-page clues grouped by truth (unlabelled), and learned truths. No open truth text. */
export function looseEnds(s: CipherState, placeName: (id: string) => string): LooseEndsView {
  const seen = (t: Truth): LooseClue[] =>
    t.clues
      .filter((c) => c.onPage)
      .sort((a, b) => a.at - b.at)
      .map((c) => ({ text: c.text, place: placeName(c.place), at: c.at }));
  return {
    open: s.truths.filter((t) => t.state === 'open').map(seen).filter((g) => g.length > 0),
    solved: s.truths.filter((t) => t.state === 'out').map((t) => ({ truth: t.truth, clues: seen(t) })),
  };
}
