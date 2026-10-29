import { DatabaseSync } from 'node:sqlite';
import type { ChatMessage, Note, RoomState, ResidualRunInfo, Take } from '../../shared/types';

/** The Residual runs kept per room.db, newest first (scribe spec §8). */
export const RESIDUAL_RUNS_KEPT = 300;
import { currentSceneId } from '../../shared/scene-aliases';

/**
 * One agent's room DB. Messages, dossier notes and the recap belong to one player–agent pair:
 * every method that touches them takes the player, and never reads or changes another pair's rows
 * (an id from another pair reads as unknown). Her journal notes (`player` NULL) are shared.
 */
export interface Db {
  insertMessage(player: string, m: ChatMessage): void;
  /** No-op for an unknown id or one from another pair. */
  updateMessage(player: string, id: string, patch: Partial<Omit<ChatMessage, 'id'>>): void;
  /** Undefined for an unknown id or one from another pair. */
  getMessage(player: string, id: string): ChatMessage | undefined;
  /** Default 200, ascending by ts. `only`: 'text' keeps the deck's text rows, 'scene' leaves them out (deck spec §3). */
  recentMessages(player: string, limit?: number, only?: 'text' | 'scene'): ChatMessage[];
  /** Every message of the pair, oldest first. */
  allMessages(player: string): ChatMessage[];
  /** A reply's takes and which one is shown; null when it has just the one. */
  getTakes(player: string, id: string): { takes: Take[]; index: number } | null;
  /** Sets a reply's takes (null = just its current text) and shows `takes[index]`. */
  setTakes(player: string, id: string, takes: Take[] | null, index: number): void;
  deleteMessage(player: string, id: string): void;
  /** Deletes every message of the pair after `id` (in time order); returns their ids. */
  deleteAfter(player: string, id: string): string[];
  /** Marks every message still `streaming` as `lost` (a turn a previous process never finished). Returns the count. */
  markStreamingLost(): number;
  loadRoom(): RoomState | null;
  saveRoom(s: RoomState): void;
  getMeta(k: string): string | null;
  setMeta(k: string, v: string): void;
  /** Every meta row whose key starts with `prefix`. */
  metaWithPrefix(prefix: string): { k: string; v: string }[];
  deleteMeta(k: string): void;
  /** Her journal notes plus, for a player, that pair's dossier notes; in no particular order (the journal sorts them). */
  listNotes(player: string | null): Note[];
  /** A journal note or this pair's dossier note; undefined otherwise. */
  getNote(player: string, id: string): Note | undefined;
  /** Files a note under `owner` (null = her journal). `n.about` is ignored: the owner decides it. */
  insertNote(owner: string | null, n: Note): void;
  /**
   * No-op for a note `player` can't see. With `owner` given, also moves the note: into her journal
   * (null) or into `player`'s own dossier; any other owner throws (a pair never files into another's).
   */
  updateNote(player: string, id: string, patch: Partial<Omit<Note, 'id' | 'about'>>, owner?: string | null): void;
  /** True if a note `player` can see was deleted. */
  deleteNote(player: string, id: string): boolean;
  /** Whether a note with this id exists anywhere (journal or any pair): ids are global. */
  noteExists(id: string): boolean;
  /** Whether a message with this id exists in any pair: ids are global. */
  messageExists(id: string): boolean;
  /** Every player with messages, dossier notes or a recap here. */
  pairPlayers(): string[];
  /** Records that `player` now knows a contact. False if they already did (nothing is written). */
  shareContact(r: { contactId: string; player: string; messageId: string; how: string | null; at: number }): boolean;
  sharedContacts(player: string): { contactId: string; messageId: string; how: string | null; at: number }[];
  /** Records that `player` was given lead `id` by this character. False if already held (nothing is written). */
  giveLead(r: { id: string; player: string; details: string; messageId: string; at: number }): boolean;
  /** The leads this character gave `player`, oldest first. */
  leadsGiven(player: string): { id: string; details: string; messageId: string; at: number }[];
  /** Writes a consistent copy of this database to `path` (which must not exist yet). */
  vacuumInto(path: string): void;
  /** `[max(messages.rowid), max(writes.seq), sum of take_index]`: changes whenever the saved state would (text edits aside). */
  fingerprint(): [number, number, number];
  /** How many rows `messages` holds: what fingerprint() misses when an older reply is deleted (cipher minor 5). */
  messageCount(): number;
  /** The largest story clock stamp in this database (null: none). */
  maxClock(): number | null;
  /**
   * Rebuilds notes, the recap and page keys, room_state, shared_contacts and leads from the write log:
   * a row counts if its message still exists (or it's a starting row) and its take is any take or
   * the one shown (`show` stands in for one message's take_index). One transaction: a throw leaves
   * the tables as they were.
   */
  rebuild(opts?: { show?: { messageId: string; take: number } }): RebuildResult;
  /** Drops the log rows of these (deleted) messages. */
  pruneWrites(messageIds: string[]): void;
  /** A reply's takes collapse to the one shown (`keep`, now take 0): the others' writes go, `keep`'s become take 0's. */
  collapseTakes(messageId: string, keep: number): void;
  /** Drops one take's writes (a take index about to be used again: a failed take's, or one collapsed away). */
  dropTakeWrites(messageId: string, take: number): void;
  /** Drops every write made after `at` (a branch's cut, for a contact whose own lines don't reach it). */
  pruneWritesAfter(at: number): void;
  /** The newest log row's seq (0: none). */
  lastSeq(): number;
  /** Drops `messageId`'s writes newer than `seq` (a keep going that failed takes back what it wrote). */
  dropWritesSince(messageId: string, seq: number): void;
  /** REWIND HERE's database half, as one transaction: delete every line of the pair after `id`, drop what they wrote, rebuild. */
  cutAfter(player: string, id: string): { ids: string[]; rebuilt: RebuildResult };
  /** On open: replies a dead process left streaming are lost, and the tables are rebuilt for the takes on screen. */
  recoverAfterCrash(): void;
  /** Moves `from`'s writes to line `to` (null: starting rows), any take: a line going away whose writes didn't come from it. */
  restampWrites(from: string, to: string | null): void;
  /** Deletes every message of every pair later than `ts` (and the shares they made); returns their ids. */
  deleteFrom(ts: number): string[];
  /** The reply now writing (her tools' writes are stamped with it); null when no reply is open. */
  setReplyStamp(s: { messageId: string; take: number } | null): void;
  /** What the next logged write is stamped with: the open reply, else the latest message (any take), else nothing (a starting row). */
  stamp(): Stamp;
  /**
   * Runs `fn` with its writes stamped to `s` (the Residual's writes belong to the reply it read, even
   * when a newer reply is open), then puts the previous stamp back, also when `fn` throws.
   */
  withStamp<T>(s: { messageId: string; take: number }, fn: () => T): T;
  /** The write log, oldest first. */
  writes(): WriteRow[];
  /** Records one residual run (not story data: rewind leaves it); keeps the newest RESIDUAL_RUNS_KEPT. */
  insertResidualRun(r: ResidualRunInfo): void;
  /** The newest `limit` residual runs (only `player`'s when given), newest first. */
  residualRuns(limit: number, player?: string): ResidualRunInfo[];
  close(): void;
}

/** Which message (and which of its takes) a write belongs to; null message = a starting row, null take = any take. */
export interface Stamp {
  messageId: string | null;
  take: number | null;
}

export type WriteKind = 'note' | 'meta' | 'room' | 'share' | 'lead';

/** What a rebuild changed: whose notes (null = her journal), recaps and pages, the room, the shares, the leads. */
export interface RebuildResult {
  roomChanged: boolean;
  notes: (string | null)[];
  recap: string[];
  page: string[];
  shares: boolean;
  leads: boolean;
  /** A quest run moved (a start or a pick undone or redone). */
  quests: boolean;
}

/** One logged write: the row (or meta value, or room) as it stood after it; null value = deleted. */
export interface WriteRow {
  seq: number;
  messageId: string | null;
  take: number | null;
  kind: WriteKind;
  key: string;
  value: string | null;
}

interface NoteRow {
  id: string;
  /** NULL: her own journal note. */
  player: string | null;
  text: string;
  pinned: number;
  created_at: number;
  updated_at: number;
  edited_by: Note['editedBy'];
  /** JSON array of keywords; NULL: none. */
  keys: string | null;
}

function parseKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

/** The stored form of a note's keys: NULL for none, so unkeyed rows log exactly as before. */
const keysCol = (keys: readonly string[] | undefined): string | null => (keys && keys.length > 0 ? JSON.stringify(keys) : null);

function rowToNote(r: NoteRow): Note {
  return {
    id: r.id,
    text: r.text,
    pinned: r.pinned === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    editedBy: r.edited_by,
    about: r.player === null ? 'me' : 'you',
    keys: parseKeys(r.keys),
  };
}

const DEFAULT_RECENT_LIMIT = 200;

/** The recap's parts; each pair's are stored as `recap.<player>.<part>`. */
const RECAP_PARTS = ['text', 'at', 'seen_at'] as const;
const RECAP_KEY_RE = /^recap\.(.+)\.(?:text|at|seen_at)$/;
const PAGE_KEY_RE = /^page\.(.+)\.(?:text|at|by)$/;

/** The meta keys that are story state (logged and rebuilt): each pair's recap and dossier page, and the leads they followed. `scribe.` is the Residual's old name, kept for saves. */
const isStoryMeta = (k: string) =>
  k.startsWith('recap.') || k.startsWith('page.') || k.startsWith('lead.') || k.startsWith('standing.') || k.startsWith('scribe.') || k.startsWith('summary.') || k.startsWith('quest.') || k.startsWith('fixer.') || k.startsWith('crew.') || k.startsWith('arrangement.') || k.startsWith('comms.') || k.startsWith('storyMood.') || k.startsWith('cityWeather.') || k.startsWith('plan.') || k.startsWith('promise.') || k.startsWith('cipher.') || k.startsWith('habits.');
/** A shared_contacts row's log key. */
const shareKey = (contactId: string, player: string) => `${contactId}\u0000${player}`;
/** A leads row's log key. */
const leadKey = (id: string, player: string) => `${id}\u0000${player}`;

interface LeadRow {
  id: string;
  player: string;
  details: string;
  message_id: string;
  at: number;
}

interface ShareRow {
  contact_id: string;
  player: string;
  message_id: string;
  how: string | null;
  at: number;
}

interface MessageRow {
  id: string;
  /** 'nix' is how rows were stored before multi-agent; read as 'agent'. */
  role: 'user' | 'agent' | 'nix';
  text: string;
  tool_lines: string;
  ts: number;
  status: ChatMessage['status'];
  reply_to: string | null;
  mode: string;
  takes: string | null;
  take_index: number;
  model: string | null;
  expression: string | null;
  resident_expression: string | null;
  others_expressions: string | null;
  scene: string | null;
  encounter: string | null;
  quest: string | null;
  gig: string | null;
  dice: string | null;
  leave: number | null;
  clock: number | null;
}

/**
 * Whose face an old `resident_expression` (a reply's, or a take's `residentExpression`) was: Hae's,
 * the only resident before ensembles. Nothing writes the old column or field again.
 */
export const LEGACY_RESIDENT = 'hae';

/** The others' faces as stored: JSON, or null for none. */
function facesColumn(faces: Record<string, string> | undefined): string | null {
  return faces && Object.keys(faces).length > 0 ? JSON.stringify(faces) : null;
}

/** A take as stored: an old one's `residentExpression` becomes Hae's entry in `othersExpressions`. */
function readTake(t: Take & { residentExpression?: string }): Take {
  const { residentExpression, ...take } = t;
  return residentExpression && !take.othersExpressions ? { ...take, othersExpressions: { [LEGACY_RESIDENT]: residentExpression } } : take;
}

function rowToMessage(row: MessageRow): ChatMessage {
  const message: ChatMessage = {
    id: row.id,
    role: row.role === 'nix' ? 'agent' : row.role,
    text: row.text,
    toolLines: JSON.parse(row.tool_lines) as string[],
    ts: row.ts,
    status: row.status,
  };
  if (row.reply_to !== null) message.replyTo = row.reply_to;
  if (row.mode === 'ooc' || row.mode === 'end' || row.mode === 'greet' || row.mode === 'travel' || row.mode === 'scene' || row.mode === 'encounter' || row.mode === 'quest' || row.mode === 'gig' || row.mode === 'dice' || row.mode === 'text') message.mode = row.mode;
  if (row.scene) message.scene = JSON.parse(row.scene) as NonNullable<ChatMessage['scene']>;
  if (row.encounter) message.encounter = JSON.parse(row.encounter) as NonNullable<ChatMessage['encounter']>;
  if (row.quest) message.quest = JSON.parse(row.quest) as NonNullable<ChatMessage['quest']>;
  if (row.gig) message.gig = JSON.parse(row.gig) as NonNullable<ChatMessage['gig']>;
  if (row.dice) message.dice = JSON.parse(row.dice) as NonNullable<ChatMessage['dice']>;
  if (row.leave === 1 || row.leave === 2) message.leave = true;
  // 2: her parting (her plans spec §5), stored in the same column.
  if (row.leave === 2) message.parting = 'her';
  // A promised text's hidden line (promised texts spec §5) reuses the column: leave means nothing on a text row.
  if (row.leave === 3) message.promised = true;
  if (row.clock !== null) message.clock = row.clock;
  if (row.takes) message.takes = { index: row.take_index, count: (JSON.parse(row.takes) as Take[]).length };
  if (row.model) message.model = row.model;
  if (row.expression) message.expression = row.expression;
  if (row.others_expressions) message.othersExpressions = JSON.parse(row.others_expressions) as Record<string, string>;
  else if (row.resident_expression) message.othersExpressions = { [LEGACY_RESIDENT]: row.resident_expression };
  return message;
}

/**
 * Opens a room DB, creating or migrating its schema. Rows from before players belong to
 * `defaultPlayer`'s pair. The whole setup runs in one transaction: a failed migration leaves
 * the file untouched and throws.
 */
export function openDb(path: string, opts: { defaultPlayer: string }): Db {
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    migrate(sqlite, opts.defaultPlayer);
    sqlite.exec('COMMIT');
  } catch (err) {
    sqlite.exec('ROLLBACK');
    sqlite.close();
    throw err;
  }
  return createDb(sqlite);
}

/** Creates missing tables and adds missing columns (idempotent). Runs inside openDb's transaction. */
function migrate(sqlite: DatabaseSync, defaultPlayer: string): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      tool_lines TEXT NOT NULL,
      ts INTEGER NOT NULL,
      status TEXT NOT NULL,
      reply_to TEXT,
      mode TEXT NOT NULL DEFAULT 'rp'
    )
  `);
  // Databases created before roleplay/OOC modes lack the column; their rows are roleplay.
  const columns = sqlite.prepare('PRAGMA table_info(messages)').all() as unknown as { name: string }[];
  if (!columns.some((c) => c.name === 'mode')) {
    sqlite.exec("ALTER TABLE messages ADD COLUMN mode TEXT NOT NULL DEFAULT 'rp'");
  }
  // Takes (regenerate / swipe) came later still.
  if (!columns.some((c) => c.name === 'takes')) {
    sqlite.exec('ALTER TABLE messages ADD COLUMN takes TEXT');
    sqlite.exec('ALTER TABLE messages ADD COLUMN take_index INTEGER NOT NULL DEFAULT 0');
  }
  // The opening scene's card (its title and source) came with scenario cards.
  if (!columns.some((c) => c.name === 'scene')) sqlite.exec('ALTER TABLE messages ADD COLUMN scene TEXT');
  // An event's card (its title and stranger) came with encounter cards.
  if (!columns.some((c) => c.name === 'encounter')) sqlite.exec('ALTER TABLE messages ADD COLUMN encounter TEXT');
  // A quest row's snapshot came with quest lines.
  if (!columns.some((c) => c.name === 'quest')) sqlite.exec('ALTER TABLE messages ADD COLUMN quest TEXT');
  // A finished run's snapshot came with gig runs.
  if (!columns.some((c) => c.name === 'gig')) sqlite.exec('ALTER TABLE messages ADD COLUMN gig TEXT');
  // A liar's dice game's snapshot came with liar's dice.
  if (!columns.some((c) => c.name === 'dice')) sqlite.exec('ALTER TABLE messages ADD COLUMN dice TEXT');
  // A LEAVE line (go solo) is an end line that walks out.
  if (!columns.some((c) => c.name === 'leave')) sqlite.exec('ALTER TABLE messages ADD COLUMN leave INTEGER');
  // The story clock after each row.
  if (!columns.some((c) => c.name === 'clock')) sqlite.exec('ALTER TABLE messages ADD COLUMN clock INTEGER');
  // Which model wrote a reply came with direct characters.
  if (!columns.some((c) => c.name === 'model')) {
    sqlite.exec('ALTER TABLE messages ADD COLUMN model TEXT');
  }
  // Her face for a reply (set_expression) came with expressions.
  if (!columns.some((c) => c.name === 'expression')) {
    sqlite.exec('ALTER TABLE messages ADD COLUMN expression TEXT');
  }
  // The resident's face for a reply came with fixed characters (Hae).
  if (!columns.some((c) => c.name === 'resident_expression')) {
    sqlite.exec('ALTER TABLE messages ADD COLUMN resident_expression TEXT');
  }
  // Everyone else's faces (JSON, id → face) came with the who's-here strip; it replaces resident_expression.
  if (!columns.some((c) => c.name === 'others_expressions')) {
    sqlite.exec('ALTER TABLE messages ADD COLUMN others_expressions TEXT');
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS room_state (
      k INTEGER PRIMARY KEY CHECK (k = 1),
      json TEXT NOT NULL
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    )
  `);
  // The room journal. `keys`: a JSON array of the note's keywords (scribe spec §5), NULL for none.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      keys TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      edited_by TEXT NOT NULL
    )
  `);
  // Contacts a player has been given (a number, a pointer); rewinding the message that gave one removes it.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS shared_contacts (
      contact_id TEXT NOT NULL,
      player     TEXT NOT NULL,
      message_id TEXT NOT NULL,
      how        TEXT,
      at         INTEGER NOT NULL,
      PRIMARY KEY (contact_id, player)
    )
  `);
  // Leads this character gave a player (Leads spec §5); rewinding the message that gave one removes it.
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id         TEXT NOT NULL,
      player     TEXT NOT NULL,
      details    TEXT NOT NULL,
      message_id TEXT NOT NULL,
      at         INTEGER NOT NULL,
      PRIMARY KEY (id, player)
    )
  `);
  // The write log (branch from here): every story write, stamped with the message (and take) that
  // made it, so rewind, swipe and branch can rebuild state. A database from before it starts with
  // what it holds now as starting rows, which nothing rewinds away.
  const hadLog = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'writes'").get() !== undefined;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS writes (
      seq        INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT,
      take       INTEGER,
      at         INTEGER NOT NULL,
      kind       TEXT NOT NULL,
      key        TEXT NOT NULL,
      value      TEXT
    )
  `);
  sqlite.exec('CREATE INDEX IF NOT EXISTS writes_message ON writes (message_id)');
  // The Residual's runs (scribe spec §8): a record for tuning, never story state.
  sqlite.exec(`
    -- The Residual's old name (the scribe), kept for saves.
    CREATE TABLE IF NOT EXISTS scribe_runs (
      seq        INTEGER PRIMARY KEY AUTOINCREMENT,
      at         INTEGER NOT NULL,
      kind       TEXT NOT NULL,
      player     TEXT NOT NULL,
      message_id TEXT,
      take       INTEGER,
      ms         INTEGER NOT NULL,
      tokens_in  INTEGER,
      tokens_out INTEGER,
      raw        TEXT,
      applied    TEXT NOT NULL,
      refused    TEXT NOT NULL,
      error      TEXT
    )
  `);
  // Players came with dossiers: rows from before them belong to the default player's pair. New
  // rows always name their player (a NULL note player is her own journal note).
  const quoted = `'${defaultPlayer.replace(/'/g, "''")}'`;
  if (!columns.some((c) => c.name === 'player')) {
    sqlite.exec(`ALTER TABLE messages ADD COLUMN player TEXT NOT NULL DEFAULT ${quoted}`);
  }
  const noteColumns = sqlite.prepare('PRAGMA table_info(notes)').all() as unknown as { name: string }[];
  if (!noteColumns.some((c) => c.name === 'player')) {
    sqlite.exec(`ALTER TABLE notes ADD COLUMN player TEXT DEFAULT ${quoted}`);
  }
  sqlite.exec('CREATE INDEX IF NOT EXISTS messages_player_ts ON messages (player, ts)');
  // The recap became per pair: recap.<part> moves to recap.<default>.<part> unless that exists.
  const getMeta = sqlite.prepare('SELECT v FROM meta WHERE k = ?');
  const addMeta = sqlite.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO NOTHING');
  const dropMeta = sqlite.prepare('DELETE FROM meta WHERE k = ?');
  for (const part of RECAP_PARTS) {
    const old = getMeta.get(`recap.${part}`) as { v: string } | undefined;
    if (!old) continue;
    addMeta.run(`recap.${defaultPlayer}.${part}`, old.v);
    dropMeta.run(`recap.${part}`);
  }
  // Her replies open on their first words (the relay drops what comes before them); ones saved
  // before that, and their takes, lose their leading blank lines here. Only rows that need it are written.
  const lead = /^\s+/;
  const rows = sqlite
    .prepare("SELECT id, text, takes FROM messages WHERE role = 'agent' AND (takes IS NOT NULL OR text <> ltrim(text, char(32, 9, 10, 13)))")
    .all() as unknown as { id: string; text: string; takes: string | null }[];
  const fix = sqlite.prepare('UPDATE messages SET text = ?, takes = ? WHERE id = ?');
  for (const row of rows) {
    const takes = row.takes ? (JSON.parse(row.takes) as Take[]) : null;
    const trimmed = takes?.map((t) => ({ ...t, text: t.text.replace(lead, '') }));
    const text = row.text.replace(lead, '');
    const takesJson = trimmed ? JSON.stringify(trimmed) : null;
    if (text !== row.text || takesJson !== row.takes) fix.run(text, takesJson, row.id);
  }
  // Seeded last, once every older migration has shaped the rows it copies.
  if (!hadLog) seedLog(sqlite);
}

/** The starting rows of a database that predates the write log: what it holds now (shares keep their message). */
function seedLog(sqlite: DatabaseSync): void {
  const add = sqlite.prepare('INSERT INTO writes (message_id, take, at, kind, key, value) VALUES (?, NULL, ?, ?, ?, ?)');
  // Time 0: what a database held before the log is older than any line, so no cut by time removes it.
  const at = 0;
  const notes = sqlite.prepare('SELECT id, player, text, pinned, created_at, updated_at, edited_by FROM notes ORDER BY rowid').all() as unknown as NoteRow[];
  for (const n of notes) add.run(null, at, 'note', n.id, noteJson(n));
  const meta = sqlite.prepare('SELECT k, v FROM meta ORDER BY k').all() as { k: string; v: string }[];
  for (const { k, v } of meta) if (isStoryMeta(k)) add.run(null, at, 'meta', k, v);
  const room = sqlite.prepare('SELECT json FROM room_state WHERE k = 1').get() as { json: string } | undefined;
  if (room) add.run(null, at, 'room', '1', room.json);
  const shares = sqlite.prepare('SELECT contact_id, player, message_id, how, at FROM shared_contacts ORDER BY at, contact_id').all() as unknown as ShareRow[];
  for (const s of shares) add.run(s.message_id, at, 'share', shareKey(s.contact_id, s.player), shareJson(s));
}

/** 32-bit FNV-1a of a string: a short number for the fingerprint. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** A note row as the log keeps it (column order fixed, so equal rows compare equal). */
function noteJson(n: NoteRow): string {
  return JSON.stringify({ id: n.id, player: n.player, text: n.text, pinned: n.pinned, created_at: n.created_at, updated_at: n.updated_at, edited_by: n.edited_by, ...(n.keys ? { keys: n.keys } : {}) });
}

function leadJson(l: LeadRow): string {
  return JSON.stringify({ id: l.id, player: l.player, details: l.details, message_id: l.message_id, at: l.at });
}

function shareJson(s: ShareRow): string {
  return JSON.stringify({ contact_id: s.contact_id, player: s.player, message_id: s.message_id, how: s.how, at: s.at });
}

function createDb(sqlite: DatabaseSync): Db {
  const NOTE_COLS = 'id, player, text, pinned, created_at, updated_at, edited_by, keys';
  // A note `player` can see: her journal's, or that pair's (`player = NULL` matches nothing, so null lists the journal alone).
  const VISIBLE = '(player IS NULL OR player = ?)';
  const listNotesStmt = sqlite.prepare(`SELECT ${NOTE_COLS} FROM notes WHERE ${VISIBLE}`);
  const getNoteStmt = sqlite.prepare(`SELECT ${NOTE_COLS} FROM notes WHERE id = ? AND ${VISIBLE}`);
  const insertNoteStmt = sqlite.prepare(`INSERT INTO notes (${NOTE_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const updateNoteStmt = sqlite.prepare(
    `UPDATE notes SET player = ?, text = ?, pinned = ?, created_at = ?, updated_at = ?, edited_by = ?, keys = ? WHERE id = ? AND ${VISIBLE}`,
  );
  const deleteNoteStmt = sqlite.prepare(`DELETE FROM notes WHERE id = ? AND ${VISIBLE}`);
  const noteExistsStmt = sqlite.prepare('SELECT 1 FROM notes WHERE id = ?');
  const messageExistsStmt = sqlite.prepare('SELECT 1 FROM messages WHERE id = ?');
  const messagePlayersStmt = sqlite.prepare('SELECT DISTINCT player FROM messages');
  const notePlayersStmt = sqlite.prepare('SELECT DISTINCT player FROM notes WHERE player IS NOT NULL');
  const recapKeysStmt = sqlite.prepare("SELECT k FROM meta WHERE k LIKE 'recap.%' OR k LIKE 'page.%'");
  const deleteMetaStmt = sqlite.prepare('DELETE FROM meta WHERE k = ?');

  const insertMessageStmt = sqlite.prepare(
    'INSERT INTO messages (id, player, role, text, tool_lines, ts, status, reply_to, mode, model, expression, others_expressions, scene, encounter, quest, gig, dice, leave, clock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const MSG_COLS = 'id, role, text, tool_lines, ts, status, reply_to, mode, takes, take_index, model, expression, resident_expression, others_expressions, scene, encounter, quest, gig, dice, leave, clock';
  const getMessageStmt = sqlite.prepare(`SELECT ${MSG_COLS} FROM messages WHERE id = ? AND player = ?`);
  const recentMessagesStmt = sqlite.prepare(
    `SELECT ${MSG_COLS} FROM messages WHERE player = ? ORDER BY ts DESC, rowid DESC LIMIT ?`,
  );
  const recentTextStmt = sqlite.prepare(
    `SELECT ${MSG_COLS} FROM messages WHERE player = ? AND mode = 'text' ORDER BY ts DESC, rowid DESC LIMIT ?`,
  );
  const recentSceneStmt = sqlite.prepare(
    `SELECT ${MSG_COLS} FROM messages WHERE player = ? AND (mode IS NULL OR mode <> 'text') ORDER BY ts DESC, rowid DESC LIMIT ?`,
  );
  const allMessagesStmt = sqlite.prepare(`SELECT ${MSG_COLS} FROM messages WHERE player = ? ORDER BY ts ASC, rowid ASC`);
  const setTakesStmt = sqlite.prepare(
    'UPDATE messages SET takes = ?, take_index = ?, text = ?, tool_lines = ?, model = ?, expression = ?, resident_expression = NULL, others_expressions = ? WHERE id = ? AND player = ?',
  );
  const getTakesStmt = sqlite.prepare('SELECT takes, take_index FROM messages WHERE id = ? AND player = ?');
  const shareContactStmt = sqlite.prepare(
    'INSERT OR IGNORE INTO shared_contacts (contact_id, player, message_id, how, at) VALUES (?, ?, ?, ?, ?)',
  );
  const sharedContactsStmt = sqlite.prepare(
    'SELECT contact_id, message_id, how, at FROM shared_contacts WHERE player = ? ORDER BY at, contact_id',
  );
  const deleteSharesStmt = sqlite.prepare('DELETE FROM shared_contacts WHERE message_id = ?');
  const giveLeadStmt = sqlite.prepare('INSERT OR IGNORE INTO leads (id, player, details, message_id, at) VALUES (?, ?, ?, ?, ?)');
  const leadsGivenStmt = sqlite.prepare('SELECT id, details, message_id, at FROM leads WHERE player = ? ORDER BY at, id');
  const deleteLeadsStmt = sqlite.prepare('DELETE FROM leads WHERE message_id = ?');
  const leadRowStmt = sqlite.prepare('SELECT id, player, details, message_id, at FROM leads WHERE id = ? AND player = ?');
  /** A message is gone: the shares and leads it made go with it. */
  const dropMadeBy = (messageId: string) => {
    deleteSharesStmt.run(messageId);
    deleteLeadsStmt.run(messageId);
  };
  const fingerprintStmt = sqlite.prepare(
    // t: which take each reply with takes shows, as text (hashed below): opposite swipes on two lines don't cancel out.
    "SELECT (SELECT COALESCE(MAX(rowid), 0) FROM messages) AS m, (SELECT COALESCE(MAX(seq), 0) FROM writes) AS w, (SELECT COALESCE(group_concat(rowid || ':' || take_index, ','), '') FROM (SELECT rowid, take_index FROM messages WHERE takes IS NOT NULL ORDER BY rowid)) AS t",
  );
  const messageCountStmt = sqlite.prepare('SELECT COUNT(*) AS n FROM messages');
  const deleteMessageStmt = sqlite.prepare('DELETE FROM messages WHERE id = ? AND player = ?');
  // A line that never reached her (failed) costs nothing; RETRY sets it back to ok.
  const maxClockStmt = sqlite.prepare("SELECT MAX(clock) AS m FROM messages WHERE status != 'failed'");
  const positionStmt = sqlite.prepare('SELECT ts, rowid FROM messages WHERE id = ? AND player = ?');
  const laterStmt = sqlite.prepare(
    'SELECT id FROM messages WHERE player = ? AND (ts > ? OR (ts = ? AND rowid > ?)) ORDER BY ts ASC, rowid ASC',
  );
  const markStreamingLostStmt = sqlite.prepare("UPDATE messages SET status = 'lost' WHERE status = 'streaming'");
  const saveRoomStmt = sqlite.prepare('INSERT INTO room_state (k, json) VALUES (1, ?) ON CONFLICT(k) DO UPDATE SET json = ?');
  const loadRoomStmt = sqlite.prepare('SELECT json FROM room_state WHERE k = 1');
  const getMetaStmt = sqlite.prepare('SELECT v FROM meta WHERE k = ?');
  const metaPrefixStmt = sqlite.prepare("SELECT k, v FROM meta WHERE substr(k, 1, length(?)) = ? ORDER BY k");
  const setMetaStmt = sqlite.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = ?');
  const updateMessageStmt = sqlite.prepare(
    'UPDATE messages SET role = ?, text = ?, tool_lines = ?, ts = ?, status = ?, reply_to = ?, mode = ?, model = ?, expression = ?, resident_expression = NULL, others_expressions = ?, scene = ?, encounter = ?, quest = ?, gig = ?, dice = ?, leave = ?, clock = ? WHERE id = ? AND player = ?',
  );
  const noteRowStmt = sqlite.prepare(`SELECT ${NOTE_COLS} FROM notes WHERE id = ?`);
  const shareRowStmt = sqlite.prepare('SELECT contact_id, player, message_id, how, at FROM shared_contacts WHERE contact_id = ? AND player = ?');
  // The opening scene is set at NEW GAME, before the story: never a write's stamp.
  const latestMessageStmt = sqlite.prepare("SELECT id FROM messages WHERE mode IS NOT 'scene' ORDER BY ts DESC, rowid DESC LIMIT 1");
  const insertWriteStmt = sqlite.prepare('INSERT INTO writes (message_id, take, at, kind, key, value) VALUES (?, ?, ?, ?, ?, ?)');
  const writesStmt = sqlite.prepare('SELECT seq, message_id, take, kind, key, value FROM writes ORDER BY seq');
  const insertResidualRunStmt = sqlite.prepare(
    'INSERT INTO scribe_runs (at, kind, player, message_id, take, ms, tokens_in, tokens_out, raw, applied, refused, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const pruneResidualRunsStmt = sqlite.prepare('DELETE FROM scribe_runs WHERE seq NOT IN (SELECT seq FROM scribe_runs ORDER BY seq DESC LIMIT ?)');
  const playerResidualRunsStmt = sqlite.prepare(
    'SELECT at, kind, player, message_id, take, ms, tokens_in, tokens_out, raw, applied, refused, error FROM scribe_runs WHERE player = ? ORDER BY seq DESC LIMIT ?',
  );
  const residualRunsStmt = sqlite.prepare('SELECT at, kind, player, message_id, take, ms, tokens_in, tokens_out, raw, applied, refused, error FROM scribe_runs ORDER BY seq DESC LIMIT ?');

  // ── The write log ─────────────────────────────────────────────────────────────────────────
  let replyStamp: { messageId: string; take: number } | null = null;
  const stamp = (): Stamp => {
    if (replyStamp) return { ...replyStamp };
    const latest = latestMessageStmt.get() as { id: string } | undefined;
    return { messageId: latest?.id ?? null, take: null };
  };
  /** Appends a log row for a write that changed something (a no-op write is never logged). */
  const lastWriteStmt = sqlite.prepare('SELECT seq, message_id, take, kind, key FROM writes ORDER BY seq DESC LIMIT 1');
  const deleteWriteStmt = sqlite.prepare('DELETE FROM writes WHERE seq = ?');
  const log = (kind: WriteKind, key: string, before: string | null, after: string | null): void => {
    if (before === after) return;
    const s = stamp();
    // The newest row writing the same thing under the same stamp (a slider dragged, a note retyped)
    // replays to nothing the new one doesn't overwrite: it goes, so the log grows by changes, not ticks.
    const last = lastWriteStmt.get() as { seq: number; message_id: string | null; take: number | null; kind: string; key: string } | undefined;
    if (last && last.kind === kind && last.key === key && last.message_id === s.messageId && (last.take === null ? null : Number(last.take)) === s.take) {
      deleteWriteStmt.run(last.seq);
    }
    insertWriteStmt.run(s.messageId, s.take, Date.now(), kind, key, after);
  };
  /** Runs a write and its log row together: in the caller's transaction if one is open, else its own. */
  const tx = <T>(fn: () => T): T => {
    if (sqlite.isTransaction) return fn();
    sqlite.exec('BEGIN');
    try {
      const out = fn();
      sqlite.exec('COMMIT');
      return out;
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  };
  const noteNow = (id: string): string | null => {
    const row = noteRowStmt.get(id) as NoteRow | undefined;
    return row ? noteJson(row) : null;
  };
  const metaNow = (k: string): string | null => (getMetaStmt.get(k) as { v: string } | undefined)?.v ?? null;
  const roomNow = (): string | null => (loadRoomStmt.get() as { json: string } | undefined)?.json ?? null;
  const leadNow = (id: string, player: string): string | null => {
    const row = leadRowStmt.get(id, player) as LeadRow | undefined;
    return row ? leadJson(row) : null;
  };
  const shareNow = (contactId: string, player: string): string | null => {
    const row = shareRowStmt.get(contactId, player) as ShareRow | undefined;
    return row ? shareJson(row) : null;
  };

  // ── Rebuild ───────────────────────────────────────────────────────────────────────────────
  const pruneWritesStmt = sqlite.prepare('DELETE FROM writes WHERE message_id = ?');
  const dropOtherTakesStmt = sqlite.prepare('DELETE FROM writes WHERE message_id = ? AND take IS NOT NULL AND take <> ?');
  const renumberTakeStmt = sqlite.prepare('UPDATE writes SET take = 0 WHERE message_id = ? AND take = ?');
  const dropTakeStmt = sqlite.prepare('DELETE FROM writes WHERE message_id = ? AND take = ?');
  const pruneAfterStmt = sqlite.prepare('DELETE FROM writes WHERE at > ?');
  const lastSeqStmt = sqlite.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM writes');
  const dropSinceStmt = sqlite.prepare('DELETE FROM writes WHERE message_id = ? AND seq > ?');
  const restampStmt = sqlite.prepare('UPDATE writes SET message_id = ?, take = NULL WHERE message_id = ?');
  const laterThanStmt = sqlite.prepare('SELECT id FROM messages WHERE ts > ? ORDER BY ts, rowid');
  const deleteAnyMessageStmt = sqlite.prepare('DELETE FROM messages WHERE id = ?');
  // The rows that count: their message is still here (or they're starting rows), on any take or the shown one.
  const keptWritesStmt = sqlite.prepare(`
    SELECT w.kind, w.key, w.value FROM writes w LEFT JOIN messages m ON m.id = w.message_id
    WHERE (w.message_id IS NULL OR m.id IS NOT NULL)
      AND (w.take IS NULL OR w.take = CASE WHEN w.message_id = ? THEN ? ELSE m.take_index END)
    ORDER BY w.seq`);
  const allNoteRowsStmt = sqlite.prepare(`SELECT ${NOTE_COLS} FROM notes`);
  const storyMetaStmt = sqlite.prepare(
    "SELECT k, v FROM meta WHERE k LIKE 'recap.%' OR k LIKE 'page.%' OR k LIKE 'lead.%' OR k LIKE 'standing.%' OR k LIKE 'scribe.%' OR k LIKE 'summary.%' OR k LIKE 'quest.%' OR k LIKE 'fixer.%' OR k LIKE 'crew.%' OR k LIKE 'arrangement.%' OR k LIKE 'comms.%' OR k LIKE 'storyMood.%' OR k LIKE 'cityWeather.%' OR k LIKE 'plan.%' OR k LIKE 'promise.%' OR k LIKE 'cipher.%' OR k LIKE 'habits.%'",
  );
  const allLeadsStmt = sqlite.prepare('SELECT id, player, details, message_id, at FROM leads');
  const replaceLeadStmt = sqlite.prepare('INSERT OR REPLACE INTO leads (id, player, details, message_id, at) VALUES (?, ?, ?, ?, ?)');
  const deleteLeadStmt = sqlite.prepare('DELETE FROM leads WHERE id = ? AND player = ?');
  const allSharesStmt = sqlite.prepare('SELECT contact_id, player, message_id, how, at FROM shared_contacts');
  const replaceNoteStmt = sqlite.prepare(`INSERT OR REPLACE INTO notes (${NOTE_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const deleteNoteByIdStmt = sqlite.prepare('DELETE FROM notes WHERE id = ?');
  const replaceShareStmt = sqlite.prepare('INSERT OR REPLACE INTO shared_contacts (contact_id, player, message_id, how, at) VALUES (?, ?, ?, ?, ?)');
  const deleteShareStmt = sqlite.prepare('DELETE FROM shared_contacts WHERE contact_id = ? AND player = ?');

  /** The story tables as the log rebuilds them, keyed the log's way. */
  const snapshot = () => {
    const notes = new Map<string, { json: string; owner: string | null }>();
    for (const r of allNoteRowsStmt.all() as unknown as NoteRow[]) notes.set(r.id, { json: noteJson(r), owner: r.player });
    const meta = new Map((storyMetaStmt.all() as { k: string; v: string }[]).map((r) => [r.k, r.v]));
    const shares = new Map((allSharesStmt.all() as unknown as ShareRow[]).map((r) => [shareKey(r.contact_id, r.player), shareJson(r)]));
    const leads = new Map((allLeadsStmt.all() as unknown as LeadRow[]).map((r) => [leadKey(r.id, r.player), leadJson(r)]));
    return { notes, meta, room: roomNow(), shares, leads };
  };

  /** Applies one kept log row with the raw statements (a rebuild is never itself logged). */
  const apply = (kind: WriteKind, key: string, value: string | null): void => {
    switch (kind) {
      case 'note': {
        if (value === null) return void deleteNoteByIdStmt.run(key);
        const n = JSON.parse(value) as NoteRow;
        replaceNoteStmt.run(n.id, n.player, n.text, n.pinned, n.created_at, n.updated_at, n.edited_by, n.keys ?? null);
        return;
      }
      case 'meta':
        if (value === null) deleteMetaStmt.run(key);
        else setMetaStmt.run(key, value, value);
        return;
      case 'room':
        if (value === null) return void sqlite.exec('DELETE FROM room_state');
        JSON.parse(value); // a broken row fails the rebuild, not the next load
        saveRoomStmt.run(value, value);
        return;
      case 'share': {
        if (value === null) {
          const [contactId, player] = key.split('\u0000');
          return void deleteShareStmt.run(contactId, player);
        }
        const s = JSON.parse(value) as ShareRow;
        replaceShareStmt.run(s.contact_id, s.player, s.message_id, s.how, s.at);
        return;
      }
      case 'lead': {
        if (value === null) {
          const [id, player] = key.split('\u0000');
          return void deleteLeadStmt.run(id, player);
        }
        const l = JSON.parse(value) as LeadRow;
        replaceLeadStmt.run(l.id, l.player, l.details, l.message_id, l.at);
        return;
      }
    }
  };

  const rebuild = (show: { messageId: string; take: number } | null): RebuildResult => {
    const before = snapshot();
    sqlite.exec(
      "DELETE FROM notes; DELETE FROM meta WHERE k LIKE 'recap.%' OR k LIKE 'page.%' OR k LIKE 'lead.%' OR k LIKE 'standing.%' OR k LIKE 'scribe.%' OR k LIKE 'summary.%' OR k LIKE 'quest.%' OR k LIKE 'fixer.%' OR k LIKE 'crew.%' OR k LIKE 'arrangement.%' OR k LIKE 'comms.%' OR k LIKE 'storyMood.%' OR k LIKE 'cityWeather.%' OR k LIKE 'plan.%' OR k LIKE 'promise.%' OR k LIKE 'cipher.%' OR k LIKE 'habits.%'; DELETE FROM room_state; DELETE FROM shared_contacts; DELETE FROM leads",
    );
    const rows = keptWritesStmt.all(show?.messageId ?? null, show?.take ?? null) as { kind: WriteKind; key: string; value: string | null }[];
    for (const r of rows) apply(r.kind, r.key, r.value);
    const after = snapshot();

    const notes = new Set<string | null>();
    for (const id of new Set([...before.notes.keys(), ...after.notes.keys()])) {
      const b = before.notes.get(id);
      const a = after.notes.get(id);
      if (b?.json === a?.json) continue;
      if (b) notes.add(b.owner);
      if (a) notes.add(a.owner);
    }
    const recap = new Set<string>();
    const page = new Set<string>();
    let quests = false;
    for (const k of new Set([...before.meta.keys(), ...after.meta.keys()])) {
      if (before.meta.get(k) === after.meta.get(k)) continue;
      if (k.startsWith('quest.') || k.startsWith('fixer.') || k.startsWith('crew.') || k.startsWith('arrangement.') || k.startsWith('comms.') || k.startsWith('plan.') || k.startsWith('promise.') || k.startsWith('cipher.')) quests = true;
      const r = RECAP_KEY_RE.exec(k);
      if (r) recap.add(r[1]);
      const p = PAGE_KEY_RE.exec(k);
      if (p) page.add(p[1]);
    }
    const shareKeys = new Set([...before.shares.keys(), ...after.shares.keys()]);
    const leadKeys = new Set([...before.leads.keys(), ...after.leads.keys()]);
    return {
      roomChanged: before.room !== after.room,
      notes: [...notes],
      recap: [...recap],
      page: [...page],
      shares: [...shareKeys].some((k) => before.shares.get(k) !== after.shares.get(k)),
      leads: [...leadKeys].some((k) => before.leads.get(k) !== after.leads.get(k)),
      quests,
    };
  };

  return {
    insertMessage(player: string, m: ChatMessage): void {
      insertMessageStmt.run(
        m.id,
        player,
        m.role,
        m.text,
        JSON.stringify(m.toolLines),
        m.ts,
        m.status,
        m.replyTo ?? null,
        m.mode ?? 'rp',
        m.model ?? null,
        m.expression ?? null,
        facesColumn(m.othersExpressions),
        m.scene ? JSON.stringify(m.scene) : null,
        m.encounter ? JSON.stringify(m.encounter) : null,
        m.quest ? JSON.stringify(m.quest) : null,
        m.gig ? JSON.stringify(m.gig) : null,
        m.dice ? JSON.stringify(m.dice) : null,
        m.promised ? 3 : m.leave ? (m.parting === 'her' ? 2 : 1) : null,
        m.clock ?? null,
      );
    },

    updateMessage(player: string, id: string, patch: Partial<Omit<ChatMessage, 'id'>>): void {
      const existing = this.getMessage(player, id);
      if (!existing) return;
      const next: ChatMessage = { ...existing, ...patch, id };
      updateMessageStmt.run(
        next.role,
        next.text,
        JSON.stringify(next.toolLines),
        next.ts,
        next.status,
        next.replyTo ?? null,
        next.mode ?? 'rp',
        next.model ?? null,
        next.expression ?? null,
        facesColumn(next.othersExpressions),
        next.scene ? JSON.stringify(next.scene) : null,
        next.encounter ? JSON.stringify(next.encounter) : null,
        next.quest ? JSON.stringify(next.quest) : null,
        next.gig ? JSON.stringify(next.gig) : null,
        next.dice ? JSON.stringify(next.dice) : null,
        next.promised ? 3 : next.leave ? (next.parting === 'her' ? 2 : 1) : null,
        next.clock ?? null,
        id,
        player,
      );
    },

    getMessage(player: string, id: string): ChatMessage | undefined {
      const row = getMessageStmt.get(id, player) as MessageRow | undefined;
      return row ? rowToMessage(row) : undefined;
    },

    recentMessages(player: string, limit: number = DEFAULT_RECENT_LIMIT, only?: 'text' | 'scene'): ChatMessage[] {
      const stmt = only === 'text' ? recentTextStmt : only === 'scene' ? recentSceneStmt : recentMessagesStmt;
      const rows = stmt.all(player, limit) as unknown as MessageRow[];
      return rows.map(rowToMessage).reverse();
    },

    allMessages(player: string): ChatMessage[] {
      return (allMessagesStmt.all(player) as unknown as MessageRow[]).map(rowToMessage);
    },

    getTakes(player: string, id: string): { takes: Take[]; index: number } | null {
      const row = getTakesStmt.get(id, player) as { takes: string | null; take_index: number } | undefined;
      return row?.takes ? { takes: (JSON.parse(row.takes) as Take[]).map(readTake), index: row.take_index } : null;
    },

    setTakes(player: string, id: string, takes: Take[] | null, index: number): void {
      const existing = this.getMessage(player, id);
      if (!existing) return;
      const shown = takes ? takes[Math.max(0, Math.min(index, takes.length - 1))] : null;
      setTakesStmt.run(
        takes ? JSON.stringify(takes) : null,
        takes ? Math.max(0, Math.min(index, takes.length - 1)) : 0,
        shown ? shown.text : existing.text,
        JSON.stringify(shown ? shown.toolLines : existing.toolLines),
        shown ? (shown.model ?? null) : (existing.model ?? null),
        shown ? (shown.expression ?? null) : (existing.expression ?? null),
        facesColumn(shown ? shown.othersExpressions : existing.othersExpressions),
        id,
        player,
      );
    },

    deleteMessage(player: string, id: string): void {
      if (Number(deleteMessageStmt.run(id, player).changes) > 0) dropMadeBy(id);
    },

    deleteAfter(player: string, id: string): string[] {
      const at = positionStmt.get(id, player) as { ts: number; rowid: number } | undefined;
      if (!at) return [];
      const ids = (laterStmt.all(player, at.ts, at.ts, at.rowid) as { id: string }[]).map((r) => r.id);
      for (const later of ids) {
        deleteMessageStmt.run(later, player);
        dropMadeBy(later);
      }
      return ids;
    },

    shareContact(r): boolean {
      return tx(() => {
        const added = Number(shareContactStmt.run(r.contactId, r.player, r.messageId, r.how, r.at).changes) > 0;
        if (added) log('share', shareKey(r.contactId, r.player), null, shareNow(r.contactId, r.player));
        return added;
      });
    },

    sharedContacts(player: string) {
      const rows = sharedContactsStmt.all(player) as { contact_id: string; message_id: string; how: string | null; at: number }[];
      return rows.map((r) => ({ contactId: r.contact_id, messageId: r.message_id, how: r.how, at: r.at }));
    },

    giveLead(r): boolean {
      return tx(() => {
        const added = Number(giveLeadStmt.run(r.id, r.player, r.details, r.messageId, r.at).changes) > 0;
        if (added) log('lead', leadKey(r.id, r.player), null, leadNow(r.id, r.player));
        return added;
      });
    },

    leadsGiven(player: string) {
      const rows = leadsGivenStmt.all(player) as { id: string; details: string; message_id: string; at: number }[];
      return rows.map((r) => ({ id: r.id, details: r.details, messageId: r.message_id, at: r.at }));
    },

    vacuumInto(path: string): void {
      sqlite.exec("VACUUM INTO '" + path.replaceAll("'", "''") + "'");
    },

    maxClock(): number | null {
      const r = maxClockStmt.get() as { m: number | null } | undefined;
      return r?.m ?? null;
    },

    messageCount(): number {
      return Number((messageCountStmt.get() as { n: number }).n);
    },

    fingerprint(): [number, number, number] {
      const r = fingerprintStmt.get() as { m: number; w: number; t: string };
      return [Number(r.m), Number(r.w), fnv1a(r.t)];
    },

    rebuild(opts) {
      return tx(() => rebuild(opts?.show ?? null));
    },

    pruneWrites(messageIds: string[]): void {
      tx(() => {
        for (const id of messageIds) pruneWritesStmt.run(id);
      });
    },

    collapseTakes(messageId: string, keep: number): void {
      tx(() => {
        dropOtherTakesStmt.run(messageId, keep);
        renumberTakeStmt.run(messageId, keep);
      });
    },

    dropTakeWrites(messageId: string, take: number): void {
      dropTakeStmt.run(messageId, take);
    },

    pruneWritesAfter(at: number): void {
      pruneAfterStmt.run(at);
    },

    metaWithPrefix(prefix: string): { k: string; v: string }[] {
      return metaPrefixStmt.all(prefix, prefix) as { k: string; v: string }[];
    },

    lastSeq(): number {
      return Number((lastSeqStmt.get() as { s: number }).s);
    },

    dropWritesSince(messageId: string, seq: number): void {
      dropSinceStmt.run(messageId, seq);
    },

    cutAfter(player: string, id: string) {
      return tx(() => {
        const ids = this.deleteAfter(player, id);
        for (const gone of ids) pruneWritesStmt.run(gone);
        return { ids, rebuilt: rebuild(null) };
      });
    },

    recoverAfterCrash(): void {
      tx(() => {
        markStreamingLostStmt.run();
        rebuild(null);
      });
    },

    restampWrites(from: string, to: string | null): void {
      restampStmt.run(to, from);
    },

    deleteFrom(ts: number): string[] {
      return tx(() => {
        const ids = (laterThanStmt.all(ts) as { id: string }[]).map((r) => r.id);
        for (const id of ids) {
          deleteAnyMessageStmt.run(id);
          dropMadeBy(id);
        }
        return ids;
      });
    },

    markStreamingLost(): number {
      return Number(markStreamingLostStmt.run().changes);
    },

    loadRoom(): RoomState | null {
      const row = loadRoomStmt.get() as { json: string } | undefined;
      if (!row) return null;
      const state = JSON.parse(row.json) as RoomState;
      // Old ribbon/ ids (before the folders matched the districts) read as their current ones.
      return { ...state, sceneId: currentSceneId(state.sceneId) };
    },

    saveRoom(s: RoomState): void {
      const json = JSON.stringify(s);
      tx(() => {
        const before = roomNow();
        saveRoomStmt.run(json, json);
        log('room', '1', before, json);
      });
    },

    listNotes(player: string | null): Note[] {
      return (listNotesStmt.all(player) as unknown as NoteRow[]).map(rowToNote);
    },

    getNote(player: string, id: string): Note | undefined {
      const row = getNoteStmt.get(id, player) as NoteRow | undefined;
      return row ? rowToNote(row) : undefined;
    },

    insertNote(owner: string | null, n: Note): void {
      tx(() => {
        insertNoteStmt.run(n.id, owner, n.text, n.pinned ? 1 : 0, n.createdAt, n.updatedAt, n.editedBy, keysCol(n.keys));
        log('note', n.id, null, noteNow(n.id));
      });
    },

    updateNote(player: string, id: string, patch: Partial<Omit<Note, 'id' | 'about'>>, owner?: string | null): void {
      if (owner !== undefined && owner !== null && owner !== player) {
        throw new Error(`note '${id}': ${player}'s pair can't file a note into another pair's dossier (${owner})`);
      }
      const row = getNoteStmt.get(id, player) as NoteRow | undefined;
      if (!row) return;
      const n: Note = { ...rowToNote(row), ...patch, id };
      const nextOwner = owner === undefined ? row.player : owner;
      tx(() => {
        updateNoteStmt.run(nextOwner, n.text, n.pinned ? 1 : 0, n.createdAt, n.updatedAt, n.editedBy, keysCol(n.keys), id, player);
        log('note', id, noteJson(row), noteNow(id));
      });
    },

    deleteNote(player: string, id: string): boolean {
      return tx(() => {
        const deleted = Number(deleteNoteStmt.run(id, player).changes) > 0;
        if (deleted) log('note', id, 'deleted', null);
        return deleted;
      });
    },

    noteExists(id: string): boolean {
      return noteExistsStmt.get(id) !== undefined;
    },

    messageExists(id: string): boolean {
      return messageExistsStmt.get(id) !== undefined;
    },

    pairPlayers(): string[] {
      const found = new Set<string>();
      for (const { player } of messagePlayersStmt.all() as { player: string }[]) found.add(player);
      for (const { player } of notePlayersStmt.all() as { player: string }[]) found.add(player);
      for (const { k } of recapKeysStmt.all() as { k: string }[]) {
        const m = RECAP_KEY_RE.exec(k) ?? PAGE_KEY_RE.exec(k);
        if (m) found.add(m[1]);
      }
      return [...found];
    },

    getMeta(k: string): string | null {
      const row = getMetaStmt.get(k) as { v: string } | undefined;
      return row ? row.v : null;
    },

    setMeta(k: string, v: string): void {
      if (!isStoryMeta(k)) {
        setMetaStmt.run(k, v, v);
        return;
      }
      tx(() => {
        const before = metaNow(k);
        setMetaStmt.run(k, v, v);
        log('meta', k, before, v);
      });
    },

    deleteMeta(k: string): void {
      if (!isStoryMeta(k)) {
        deleteMetaStmt.run(k);
        return;
      }
      tx(() => {
        const before = metaNow(k);
        deleteMetaStmt.run(k);
        log('meta', k, before, null);
      });
    },

    setReplyStamp(s): void {
      replyStamp = s ? { ...s } : null;
    },

    stamp,

    withStamp<T>(s: { messageId: string; take: number }, fn: () => T): T {
      const before = replyStamp;
      replyStamp = { ...s };
      try {
        return fn();
      } finally {
        replyStamp = before;
      }
    },

    writes(): WriteRow[] {
      const rows = writesStmt.all() as { seq: number; message_id: string | null; take: number | null; kind: WriteKind; key: string; value: string | null }[];
      return rows.map((r) => ({ seq: Number(r.seq), messageId: r.message_id, take: r.take === null ? null : Number(r.take), kind: r.kind, key: r.key, value: r.value }));
    },

    insertResidualRun(r: ResidualRunInfo): void {
      insertResidualRunStmt.run(r.at, r.kind, r.player, r.messageId, r.take, Math.round(r.ms), r.tokensIn, r.tokensOut, r.raw, JSON.stringify(r.applied), JSON.stringify(r.refused), r.error);
      pruneResidualRunsStmt.run(RESIDUAL_RUNS_KEPT);
    },

    residualRuns(limit: number, player?: string): ResidualRunInfo[] {
      const rows = (player === undefined ? residualRunsStmt.all(limit) : playerResidualRunsStmt.all(player, limit)) as {
        at: number; kind: ResidualRunInfo['kind']; player: string; message_id: string | null; take: number | null; ms: number;
        tokens_in: number | null; tokens_out: number | null; raw: string | null; applied: string; refused: string; error: string | null;
      }[];
      return rows.map((r) => ({
        at: Number(r.at), kind: r.kind, player: r.player, messageId: r.message_id, take: r.take === null ? null : Number(r.take), ms: Number(r.ms),
        tokensIn: r.tokens_in === null ? null : Number(r.tokens_in), tokensOut: r.tokens_out === null ? null : Number(r.tokens_out),
        raw: r.raw, applied: JSON.parse(r.applied) as string[], refused: JSON.parse(r.refused) as string[], error: r.error,
      }));
    },

    close(): void {
      sqlite.close();
    },
  };
}
