import type { Pronoun } from '../../shared/pronoun';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AroundEntry, ChatMessage, ContactEntry, Fact, PlaythroughInfo, RoomState } from '../../shared/types';
import { completeSceneId } from './room-state';
import { parseStored, standingKey, type StoredStanding } from '../../shared/standing';
import { arrangementActive, arrangementKey, parseArrangement, type Arrangement } from '../../shared/arrangement';
import { lastLine } from './world';

/** A contact the roster can introduce: a connected character (fixed residents aren't contacts). */
export interface RosterContact {
  id: string;
  name: string;
  pronoun: Pronoun;
  accent: string;
  startRoom: string;
  /** False when she has no avatar file (a monogram): her entry then has no portrait. */
  avatar?: boolean;
  /** True when her sprite gives a face thumbnail (`/api/agents/<id>/thumb`, the select grid's): her portrait, over the avatar. */
  thumb?: boolean;
  /** Her old pack: completes a saved room id from before rooms (as her room does). */
  legacyDistrict?: string | null;
  /** Her select-screen file (bio paragraphs and facts), for her entry's file in CONTACTS. */
  bio?: string[];
  facts?: Fact[];
}

/** What the playthrough's contact databases say about one contact (read-only). */
interface DbFacts {
  met: boolean;
  room: RoomState | null;
  /** The pair's latest rows, oldest first. */
  recent: ChatMessage[];
  /** Contacts this database's character introduced to the player, oldest share first. */
  shared: string[];
  /** Her standing on the player as stored (null: none yet). */
  standing: StoredStanding | null;
  /** Her deal to sit the player's chair (arrangement spec 2026-10-20), if struck. */
  arrangement: Arrangement | null;
}

function hasTable(db: DatabaseSync, name: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

function hasColumn(db: DatabaseSync, table: string, name: string): boolean {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === name);
}

export function readFacts(file: string, player: string): DbFacts {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    // Met: a line in character, an event the two of you lived through, or any finished answer of hers (her greeting, a move, a run, a game).
    const met =
      db
        .prepare("SELECT 1 FROM messages WHERE player = ? AND (mode IN ('rp', 'encounter', 'quest') OR (role != 'user' AND status = 'ok' AND mode IN ('greet', 'travel', 'gig', 'dice'))) LIMIT 1")
        .get(player) !== undefined;
    const roomRow = hasTable(db, 'room_state') ? (db.prepare('SELECT json FROM room_state WHERE k = 1').get() as { json: string } | undefined) : undefined;
    // The latest lines, enough to find her last one and the event (and stranger) before it.
    // A database from before encounter cards, not opened since, has no encounter column.
    const encounter = hasColumn(db, 'messages', 'encounter') ? 'encounter' : 'NULL AS encounter';
    const rows = (
      db.prepare(`SELECT role, text, mode, status, ${encounter} FROM messages WHERE player = ? ORDER BY ts DESC, rowid DESC LIMIT 40`).all(player) as {
        role: string;
        text: string;
        mode: string;
        status: ChatMessage['status'];
        encounter: string | null;
      }[]
    ).reverse();
    const shared = hasTable(db, 'shared_contacts')
      ? (db.prepare('SELECT contact_id FROM shared_contacts WHERE player = ? ORDER BY at').all(player) as { contact_id: string }[]).map((r) => r.contact_id)
      : [];
    const standingRow = hasTable(db, 'meta') ? (db.prepare('SELECT v FROM meta WHERE k = ?').get(standingKey(player)) as { v: string } | undefined) : undefined;
    const dealRow = hasTable(db, 'meta') ? (db.prepare('SELECT v FROM meta WHERE k = ?').get(arrangementKey(player)) as { v: string } | undefined) : undefined;
    return {
      met,
      standing: parseStored(standingRow?.v ?? null),
      arrangement: parseArrangement(dealRow?.v ?? null),
      room: roomRow ? (JSON.parse(roomRow.json) as RoomState) : null,
      recent: rows.map((r, i) => ({
        id: String(i),
        role: r.role === 'user' ? 'user' : 'agent',
        text: r.text,
        toolLines: [],
        ts: i,
        status: r.status,
        ...(r.mode !== 'rp' ? { mode: r.mode as NonNullable<ChatMessage['mode']> } : {}),
        ...(r.encounter ? { encounter: JSON.parse(r.encounter) as NonNullable<ChatMessage['encounter']> } : {}),
      })),
      shared,
    };
  } finally {
    db.close();
  }
}

type Names = {
  placeName(sceneId: string): string;
  playerName: string;
  residentNames: string[];
  hasScene?(sceneId: string): boolean;
  ties?: Record<string, string>;
  /** The scene her open room shows now (null: not open); wins over her database's. */
  liveScene?(contactId: string): string | null;
  /** Standing (spec 2026-10-13 §6): her word and values on the player from what's stored (null: none stored yet). Absent: entries carry no standing. */
  standing?(contactId: string, stored: StoredStanding | null): NonNullable<ContactEntry['standing']>;
  /** Her plan's tail (spec 2026-10-21 §7); absent or null: none. */
  planTail?(contactId: string): string | null;
};

/** Her plan's tail when she has one (her plans spec §7); entries without a plan stay as they were. */
const tailOf = (names: Names, id: string): { planTail?: string } => {
  const t = names.planTail?.(id) ?? null;
  return t ? { planTail: t } : {};
};

/** Each contact database in `charsDir`, read for `player`. */
function readAll(charsDir: string, player: string): Map<string, DbFacts> {
  const facts = new Map<string, DbFacts>();
  if (fs.existsSync(charsDir)) {
    for (const e of fs.readdirSync(charsDir, { withFileTypes: true })) {
      const file = path.join(charsDir, e.name, 'room.db');
      if (!e.isDirectory() || !fs.existsSync(file)) continue;
      try {
        facts.set(e.name, readFacts(file, player));
      } catch (err) {
        // One unreadable database costs only her: she reads as never met, with no room of her own.
        console.error(`[contacts] ${e.name}: unreadable: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return facts;
}

/** Where `c` is: her open room's scene, else her database's room (completed to a full id), else her start room. */
function placeOf(c: RosterContact, f: DbFacts | undefined, names: Names): string {
  const live = names.liveScene?.(c.id);
  if (live) return live;
  const saved = f?.room?.sceneId;
  return saved ? completeSceneId(saved, names.hasScene ?? (() => false), c.legacyDistrict ?? null, c.startRoom) : c.startRoom;
}

function known(facts: Map<string, DbFacts>, pt: PlaythroughInfo, roster: RosterContact[], names: Names): ContactEntry[] {
  const nameOf = (id: string) => roster.find((c) => c.id === id)?.name ?? id;
  /** Who first introduced each contact. */
  const sharedBy = new Map<string, string>();
  for (const [by, f] of facts) for (const id of f.shared) if (!sharedBy.has(id)) sharedBy.set(id, nameOf(by));

  const entries: ContactEntry[] = [];
  for (const c of roster) {
    const f = facts.get(c.id);
    const status = c.id === pt.startContact ? 'start' : f?.met ? 'met' : names.ties?.[c.id] !== undefined ? 'knows' : sharedBy.has(c.id) ? 'shared' : null;
    if (!status) continue;
    const sceneId = placeOf(c, f, names);
    entries.push({
      id: c.id,
      name: c.name,
      accent: c.accent,
      portrait: c.thumb ? `/api/agents/${c.id}/thumb` : c.avatar === false ? null : `/api/agents/${c.id}/avatar`,
      status,
      ...(status === 'shared' ? { sharedBy: sharedBy.get(c.id)! } : {}),
      sceneId,
      placeName: names.placeName(sceneId),
      ...tailOf(names, c.id),
      timeOfDay: f?.room?.atmosphere?.timeOfDay ?? null,
      lastLine: f ? lastLine(f.recent, { player: names.playerName, contact: c.name, residents: names.residentNames }) : null,
      // You don't know how someone feels about you before you've met (a contact only heard of has none).
      ...(names.standing ? { standing: status === 'shared' ? null : names.standing(c.id, f?.standing ?? null) } : {}),
      // Her deal (arrangement spec §3): in force while her trust is high.
      ...(f?.arrangement
        ? { arrangement: { retainer: f.arrangement.retainer, nights: f.arrangement.nights, active: arrangementActive(f.arrangement, names.standing ? names.standing(c.id, f.standing).trust : (f.standing?.trust ?? null)) } }
        : {}),
      ...(c.bio?.length ? { bio: c.bio } : {}),
      ...(c.facts?.length ? { facts: c.facts } : {}),
    });
  }
  const rank = { start: 0, met: 1, knows: 2, shared: 3 };
  // Stable: within a status, roster order.
  return entries.sort((a, b) => rank[a.status] - rank[b.status]);
}

/**
 * The contacts the player knows in `pt` (spec §7), worked out from its databases each time:
 * the start contact, then those met (an rp line, an event, her greeting), then those the player
 * knows from before (ties), then those another contact shared. Contacts no longer in the roster
 * are left out.
 */
export function knownContacts(
  charsDir: string,
  pt: PlaythroughInfo,
  roster: RosterContact[],
  names: Names = { placeName: (s) => s, playerName: pt.player, residentNames: [] },
): ContactEntry[] {
  return known(readAll(charsDir, pt.player), pt, roster, names);
}

/**
 * AROUND LOWLIGHT (spec 2026-10-10 ties §2): the roster contacts the player doesn't know in `pt`
 * (never himself), each where she is now, in roster order.
 */
export function aroundContacts(charsDir: string, pt: PlaythroughInfo, roster: RosterContact[], names: Names): AroundEntry[] {
  return contactsAndAround(charsDir, pt, roster, names).around;
}

function strangersOf(facts: Map<string, DbFacts>, pt: PlaythroughInfo, roster: RosterContact[], names: Names, known: ContactEntry[]): AroundEntry[] {
  const ids = new Set(known.map((c) => c.id));
  return roster
    .filter((c) => !ids.has(c.id) && c.id !== pt.player)
    .map((c) => {
      const f = facts.get(c.id);
      const sceneId = placeOf(c, f, names);
      return { contactId: c.id, sceneId, placeName: names.placeName(sceneId), ...tailOf(names, c.id), timeOfDay: f?.room?.atmosphere?.timeOfDay ?? null };
    });
}

/** Only her room, for where she is: one small read per database (who's here runs often). */
function readRoom(file: string): RoomState | null {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = hasTable(db, 'room_state') ? (db.prepare('SELECT json FROM room_state WHERE k = 1').get() as { json: string } | undefined) : undefined;
    return row ? (JSON.parse(row.json) as RoomState) : null;
  } finally {
    db.close();
  }
}

/**
 * Where every roster contact is in `pt` (never the player), as the contact lists place them, from
 * each database's room alone: who's here (spec 2026-10-11 §2) without the lists' heavier reads.
 */
export function placesOf(charsDir: string, pt: PlaythroughInfo, roster: RosterContact[], names: Names): Map<string, string> {
  const places = new Map<string, string>();
  for (const c of roster) {
    if (c.id === pt.player) continue;
    const file = path.join(charsDir, c.id, 'room.db');
    let room: RoomState | null = null;
    if (!names.liveScene?.(c.id) && fs.existsSync(file)) {
      try {
        room = readRoom(file);
      } catch {
        room = null; // unreadable: she's at her start room, as in the lists
      }
    }
    places.set(c.id, placeOf(c, room ? ({ room } as DbFacts) : undefined, names));
  }
  return places;
}

/** Both lists from one read of the databases: who the player knows, and who's around. */
export function contactsAndAround(charsDir: string, pt: PlaythroughInfo, roster: RosterContact[], names: Names): { known: ContactEntry[]; around: AroundEntry[] } {
  const facts = readAll(charsDir, pt.player);
  const list = known(facts, pt, roster, names);
  return { known: list, around: strangersOf(facts, pt, roster, names, list) };
}
