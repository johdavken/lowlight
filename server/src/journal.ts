import { capAtWordBoundary } from '../../shared/persona';
import { normalizeKeys } from '../../shared/note-keys';
import { mentionsKeys } from '../../shared/lore';
import type { JournalEditor, Note, Source } from '../../shared/types';
import type { Db, RebuildResult } from './db';
import type { Result } from './room-state';

export const PIN_CAP = 8;
export const NOTE_CAP = 200;
export const NOTE_MAX = 280;
export const RECAP_MAX = 600;
/** Her dossier page on one visitor: at most this many characters. */
export const PAGE_MAX = 1375;
/** At most this many unpinned notes come back in the journal line when their keywords come up (scribe spec §5). */
export const NOTE_MATCH_MAX = 5;
/** The journal line's length cap: matched notes go first, pins never. */
export const JOURNAL_LINE_MAX = 2400;
/** How long a pair has to be away before its recap rides along with the next turn. */
export const PREVIOUSLY_GAP_MS = 6 * 60 * 60 * 1000;

const META_NEXT = 'journal.next';

/**
 * A journal change: `line` is the quiet feed tool line for it (null when there is none). `player`
 * says who sees it: null for one of her journal notes (shared, so every pair's list changes; also a
 * note moving between her journal and a pair), a player for that pair's dossier notes, recap or page.
 */
export interface JournalChange {
  kind: 'notes' | 'recap' | 'page';
  line: string | null;
  by: JournalEditor;
  source: Source | 'user';
  player: string | null;
}

type About = Note['about'];

const editorOf = (source: Source | 'user'): JournalEditor => (source === 'agent' ? 'agent' : 'user');
const flat = (text: string) => text.replace(/\s*\n\s*/g, ' ');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const unknown = (id: string): Result => ({ ok: false, error: `no note '${id}'` });
/** A text over (or under) its limit, saying how long it was so she can fix it in one retry. */
const badLength = (what: string, max: number, length: number): Result => ({
  ok: false,
  error: `${what} must be 1–${max} characters; ${length === 0 ? 'yours is empty' : `yours is ${length} — shorten it`}`,
});
/**
 * Her text over its limit is cut at a word and kept, and the result says so: refusing it gave her a fix-up
 * round, and GLM filled that round by writing its reply again (2026-10-12 stress test). the player's edits are refused.
 */
const fit = (text: string, max: number, source: Source | 'user'): { text: string; cut: string } =>
  source === 'agent' && text.length > max ? { text: capAtWordBoundary(text, max).trimEnd(), cut: ` (shortened to ${max} characters)` } : { text, cut: '' };
const label = (n: Note) => `${n.id} (${n.about})`;
const recapKey = (player: string, part: 'text' | 'at' | 'seen_at') => `recap.${player}.${part}`;
const pageKey = (player: string, part: 'text' | 'at' | 'by') => `page.${player}.${part}`;
const PAGE_LIMIT_ERROR = `the dossier page must be 1–${PAGE_MAX} characters`;

/**
 * Her dossier page as one line in the system message, right after the "who's here" block: the page
 * itself (newlines → spaces, `]` → `)` so the bracket stays whole), or a nudge to write one. With
 * no page yet, what she knows of them from before (a tie) stands in, until she writes her own.
 */
export function pageLine(name: string, page: string | null, tie: string | null = null): string {
  page ??= tie;
  if (page === null) return `[your dossier on ${name}: empty]`;
  return `[your dossier on ${name}: ${page.replace(/\s*\n\s*/g, ' ').replace(/\]/g, ')')}]`;
}

export interface DossierPage {
  text: string | null;
  at: number | null;
  by: JournalEditor | null;
}

/**
 * Her journal (her own notes, `about: 'me'`, shared by every visitor), her dossiers (notes on one
 * visitor, `about: 'you'`, seen only in that pair) and each pair's recap (a short "previously…"),
 * stored in her room DB. Every method takes the pair's player: a pair sees her journal plus its own
 * dossier, never another pair's. Her tools and the player's panel both go through here, so the limits and
 * messages are the same for both.
 */
export class Journal {
  private readonly listeners = new Set<(c: JournalChange) => void>();
  /** Who owned each note forgotten since startup (null: her journal), so an undo can't cross pairs. */
  private readonly forgotten = new Map<string, string | null>();

  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  /** Her journal notes and `player`'s dossier notes: pinned first, then newest first. */
  notes(player: string): Note[] {
    return this.db.listNotes(player).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt || b.id.localeCompare(a.id));
  }

  /**
   * Adds a note (`about` 'you' by default: `player`'s dossier; 'me': her journal), or with `id`
   * rewrites one (`text` may be left out to only pin/unpin it, rekey it, or to move it with `about` between
   * her journal and this pair's dossier). `keys` are normalized (shared/note-keys).
   */
  note(player: string, args: { text?: string; pinned?: boolean; id?: string; about?: About; keys?: string[] }, source: Source | 'user'): Result {
    const notes = this.notes(player);
    const existing = args.id === undefined ? undefined : notes.find((n) => n.id === args.id);
    // An id she made up with text is a new note (what she meant every time it came up); refusing it made GLM
    // rewrite its reply. Without text (a pin, a move) there's nothing to write, and the player's panel names real ids.
    const madeUp = args.id !== undefined && !existing;
    if (madeUp && (source === 'user' || args.text === undefined)) return unknown(args.id!);
    const fitted = fit((args.text ?? existing?.text ?? '').trim(), NOTE_MAX, source);
    const text = fitted.text;
    if (text.length < 1 || text.length > NOTE_MAX) return badLength('note text', NOTE_MAX, text.length);
    const told = `${madeUp ? ` — there was no note '${args.id}', so this is a new one` : ''}${fitted.cut}`;

    const pinning = args.pinned === true && !existing?.pinned;
    if (pinning) {
      const pins = notes.filter((n) => n.pinned);
      if (pins.length >= PIN_CAP) {
        return {
          ok: false,
          error: `pinned notes are full (${PIN_CAP}): ${pins.map((n) => n.id).sort(byIdNumber).join(', ')} — unpin one with note(id, pinned: false) first`,
        };
      }
    }
    const at = this.now();
    const by = editorOf(source);
    const ownerOf = (about: About) => (about === 'me' ? null : player);

    const keys = args.keys === undefined ? undefined : normalizeKeys(args.keys);
    if (existing) {
      const pinned = args.pinned ?? existing.pinned;
      const moveTo = args.about !== undefined && args.about !== existing.about ? args.about : undefined;
      this.db.updateNote(player, existing.id, { text, pinned, updatedAt: at, editedBy: by, ...(keys !== undefined ? { keys } : {}) }, moveTo === undefined ? undefined : ownerOf(moveTo));
      const onlyPinned = text === existing.text && pinned && !existing.pinned;
      // A journal note, or one moving in or out of her journal, changes every pair's list.
      const seenBy = moveTo !== undefined || existing.about === 'me' ? null : player;
      this.emit({ kind: 'notes', line: onlyPinned ? '// PINNED' : '// NOTE UPDATED', by, source, player: seenBy });
      return { ok: true, text: `updated: ${existing.id} "${text}"${pinned ? ' (pinned)' : ''}${told}` };
    }

    if (notes.length >= NOTE_CAP) return { ok: false, error: `the journal is full (${NOTE_CAP} notes) — forget or merge some first` };
    const k = Number(this.db.getMeta(META_NEXT) ?? '1');
    const id = `n${k}`;
    this.db.setMeta(META_NEXT, String(k + 1));
    const pinned = args.pinned === true;
    const about = args.about ?? 'you';
    const owner = ownerOf(about);
    this.db.insertNote(owner, { id, text, pinned, createdAt: at, updatedAt: at, editedBy: by, about, keys: keys ?? [] });
    this.emit({ kind: 'notes', line: pinned ? '// PINNED' : '// NOTED', by, source, player: owner });
    return { ok: true, text: `noted: ${id} "${text}"${pinned ? ' (pinned)' : ''}${told}` };
  }

  /** Her journal and `player`'s dossier, each note labelled `(me)` / `(you)`. */
  read(player: string, query?: string): Result {
    const all = this.notes(player);
    const q = query?.trim();
    const shown = q ? all.filter((n) => n.text.toLowerCase().includes(q.toLowerCase())) : all;
    if (q && shown.length === 0) return { ok: true, text: `no notes match "${q}"` };
    const head = q
      ? `journal: ${shown.length} of ${plural(all.length, 'note')} match "${q}"`
      : `journal: ${plural(all.length, 'note')} (${all.filter((n) => n.pinned).length} pinned)`;
    return { ok: true, text: [head, ...shown.map((n) => `${label(n)}${n.pinned ? ' [pinned]' : ''} ${flat(n.text)}`)].join('\n') };
  }

  /** Deletes one of her journal notes or one of `player`'s dossier notes. */
  forget(player: string, id: string, source: Source | 'user'): Result {
    const note = this.db.getNote(player, id);
    if (!note) return unknown(id);
    const owner = note.about === 'me' ? null : player;
    this.db.deleteNote(player, id);
    this.forgotten.set(id, owner);
    this.emit({ kind: 'notes', line: '// FORGOT A NOTE', by: editorOf(source), source, player: owner });
    return { ok: true, text: `forgot: ${id} "${note.text}"` };
  }

  /**
   * Puts a deleted note back (the player's undo). Not an addition, so the note cap doesn't apply — but the
   * other limits do: only an id that existed, a valid `about`, the length rule, the pin cap (a note
   * whose pin no longer fits comes back unpinned) and timestamps no later than now. It goes back where
   * it was forgotten from; a note another pair forgot, or an id another pair holds, is "no such note".
   * With no record of it (forgotten before a restart) `about` decides: 'me' her journal, 'you' this pair.
   */
  restore(player: string, note: Note): Result {
    const k = /^n(\d+)$/.exec(note.id);
    const about: unknown = note.about;
    if (!k || Number(k[1]) < 1 || Number(k[1]) >= Number(this.db.getMeta(META_NEXT) ?? '1') || (about !== 'me' && about !== 'you')) {
      return { ok: false, error: `no note '${note.id}' to restore` };
    }
    const recorded = this.forgotten.get(note.id);
    if (recorded !== undefined && recorded !== null && recorded !== player) return unknown(note.id);
    if (this.db.noteExists(note.id)) {
      return this.db.getNote(player, note.id) ? { ok: false, error: `note '${note.id}' already exists` } : unknown(note.id);
    }
    const text = note.text.trim();
    if (text.length < 1 || text.length > NOTE_MAX) return { ok: false, error: `note text must be 1–${NOTE_MAX} characters` };
    const owner = recorded !== undefined ? recorded : about === 'me' ? null : player;
    const now = this.now();
    const pinned = note.pinned && this.notes(player).filter((n) => n.pinned).length < PIN_CAP;
    const createdAt = Math.min(note.createdAt, now);
    this.db.insertNote(owner, { ...note, text, pinned, createdAt, updatedAt: Math.max(createdAt, Math.min(note.updatedAt, now)) });
    this.forgotten.delete(note.id);
    this.emit({ kind: 'notes', line: null, by: 'user', source: 'user', player: owner });
    return { ok: true, text: `restored: ${note.id} "${text}"${pinned ? ' (pinned)' : ''}` };
  }

  /** Writes `player`'s pair's recap. */
  setRecap(player: string, text: string, source: Source | 'user'): Result {
    const { text: t, cut } = fit(text.trim(), RECAP_MAX, source);
    if (t.length < 1 || t.length > RECAP_MAX) return badLength('recap', RECAP_MAX, t.length);
    this.db.setMeta(recapKey(player, 'text'), t);
    this.db.setMeta(recapKey(player, 'at'), String(this.now()));
    this.emit({ kind: 'recap', line: '// RECAP SAVED', by: editorOf(source), source, player });
    return { ok: true, text: `recap saved${cut}` };
  }

  recap(player: string): { text: string | null; at: number | null; seen: boolean } {
    const text = this.db.getMeta(recapKey(player, 'text'));
    const atRaw = this.db.getMeta(recapKey(player, 'at'));
    const at = atRaw === null ? null : Number(atRaw);
    const seenRaw = this.db.getMeta(recapKey(player, 'seen_at'));
    const seen = at !== null && seenRaw !== null && Number(seenRaw) >= at;
    return { text, at, seen };
  }

  /** The player dismissed `player`'s pair's current recap. */
  markRecapSeen(player: string): void {
    const { at } = this.recap(player);
    if (at === null) return;
    this.db.setMeta(recapKey(player, 'seen_at'), String(at));
    this.emit({ kind: 'recap', line: null, by: 'user', source: 'user', player });
  }

  /** Her dossier page on `player`: her running picture of that visitor, in her words. */
  page(player: string): DossierPage {
    const text = this.db.getMeta(pageKey(player, 'text'));
    if (text === null) return { text: null, at: null, by: null };
    const at = this.db.getMeta(pageKey(player, 'at'));
    const by = this.db.getMeta(pageKey(player, 'by'));
    return { text, at: at === null ? null : Number(at), by: by === 'agent' || by === 'user' ? by : null };
  }

  /**
   * Replaces `player`'s dossier page (trimmed, 1–PAGE_MAX characters). From the player's panel an empty
   * page clears it; from her an empty page is refused like any other bad length.
   */
  setPage(player: string, text: string, source: Source | 'user'): Result {
    const { text: t, cut } = fit(text.trim(), PAGE_MAX, source);
    const by = editorOf(source);
    if (t.length === 0 && by === 'user') {
      for (const part of ['text', 'at', 'by'] as const) this.db.deleteMeta(pageKey(player, part));
      this.emit({ kind: 'page', line: null, by, source, player });
      return { ok: true, text: 'dossier page cleared' };
    }
    if (t.length < 1 || t.length > PAGE_MAX) return { ok: false, error: PAGE_LIMIT_ERROR };
    this.db.setMeta(pageKey(player, 'text'), t);
    this.db.setMeta(pageKey(player, 'at'), String(this.now()));
    this.db.setMeta(pageKey(player, 'by'), by);
    this.emit({ kind: 'page', line: by === 'agent' ? '// DOSSIER UPDATED' : null, by, source, player });
    return { ok: true, text: `dossier updated (${t.length}/${PAGE_MAX})${cut}` };
  }

  /** Every pair's recap that is set and not yet seen, by player. */
  unseenRecaps(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const player of this.db.pairPlayers()) {
      const { text, seen } = this.recap(player);
      if (text !== null && !seen) out[player] = text;
    }
    return out;
  }

  /** The per-turn `[journal …]` line for `player`'s pair, or null when that pair sees no notes. */
  journalLine(player: string, recent: readonly string[]): string | null {
    const all = this.notes(player);
    if (all.length === 0) return null;
    const pins = all.filter((n) => n.pinned);
    // Unpinned notes whose keywords came up: the earliest (most recent) mention first, ties by id.
    const firstMention = (n: Note) => recent.findIndex((t) => mentionsKeys(t, n.keys ?? []));
    let matched = all
      .filter((n) => !n.pinned && (n.keys?.length ?? 0) > 0)
      .map((n) => ({ n, at: firstMention(n) }))
      .filter((m) => m.at >= 0)
      .sort((a, b) => a.at - b.at || byIdNumber(a.n.id, b.n.id))
      .slice(0, NOTE_MATCH_MAX)
      .map((m) => m.n);
    const build = () => {
      const rest = all.length - pins.length - matched.length;
      const parts: string[] = [];
      if (pins.length > 0) parts.push(pins.map((n) => `${label(n)} ${flat(n.text)}`).join(' · '));
      if (matched.length > 0) parts.push(`came up: ${matched.map((n) => `${label(n)} ${flat(n.text)}`).join(' · ')}`);
      if (pins.length + matched.length === 0) return `[journal: ${plural(rest, 'note')}]`;
      if (rest > 0) parts.push(`${rest} more ${rest === 1 ? 'note' : 'notes'}`);
      return `[journal${pins.length > 0 ? ' (pinned)' : ''}: ${parts.join(' · ')}]`;
    };
    let line = build();
    while (line.length > JOURNAL_LINE_MAX && matched.length > 0) {
      matched = matched.slice(0, -1);
      line = build();
    }
    return line;
  }

  /**
   * `player`'s pair's recap as a one-off `[previously …]` line, when they've been away 6 hours or
   * more — or, `force`d (her greeting), whenever there is one.
   */
  previouslyLine(player: string, lastActivityAt: number | null, force = false): string | null {
    const { text } = this.recap(player);
    if (text === null) return null;
    if (!force && (lastActivityAt === null || this.now() - lastActivityAt < PREVIOUSLY_GAP_MS)) return null;
    return `[previously: ${flat(text)}]`;
  }

  /** A rebuild changed these pairs' notes (null: her journal), recaps and pages: their panels refresh, with no line. */
  announce(r: RebuildResult): void {
    const quiet = { line: null, by: 'user', source: 'user' } as const;
    for (const player of r.notes) this.emit({ kind: 'notes', ...quiet, player });
    for (const player of r.recap) this.emit({ kind: 'recap', ...quiet, player });
    for (const player of r.page) this.emit({ kind: 'page', ...quiet, player });
  }

  onChange(fn: (c: JournalChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(c: JournalChange): void {
    for (const fn of this.listeners) fn(c);
  }
}

function byIdNumber(a: string, b: string): number {
  return Number(a.slice(1)) - Number(b.slice(1));
}
