import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, type Db } from './db';
import type { Playthroughs } from './playthroughs';
import type { Location } from '../../shared/types';

const RENAMED = 'room.db.pre-playthroughs';

/** Deletes the rows in a copied database that belong to other players. The contact's journal (notes with player NULL) stays. */
function pruneToPlayer(file: string, player: string): void {
  const raw = new DatabaseSync(file);
  try {
    raw.prepare('DELETE FROM messages WHERE player != ?').run(player);
    raw.prepare('DELETE FROM notes WHERE player IS NOT NULL AND player != ?').run(player);
    raw.prepare('DELETE FROM shared_contacts WHERE player != ?').run(player);
    for (const kind of ['recap', 'page']) {
      const own = `${kind}.${player}.`;
      raw
        .prepare('DELETE FROM meta WHERE substr(k, 1, ?) = ? AND substr(k, 1, ?) != ?')
        .run(kind.length + 1, `${kind}.`, own.length, own);
    }
    // The write log still holds the other pairs' rows: dropped, so the next open seeds it again from what's left.
    raw.exec('DROP TABLE IF EXISTS writes');
  } finally {
    raw.close();
  }
}

interface Stat {
  count: number;
  newest: number;
}

/**
 * Brings the one-database-per-contact layout over to playthroughs: one per player found in the old
 * databases, each holding a pruned copy of every contact database that player has messages in.
 * Returns the number created. All-or-nothing: on failure the originals are untouched and what this
 * run created is removed, so the next boot tries again.
 */
export function migrateToPlaythroughs(
  dataDir: string,
  pts: Playthroughs,
  contactIds: string[],
  log: (m: string) => void,
  /** A contact's saved room id as it reads now (a bare id from before rooms, completed as her room does). */
  completeScene: (contactId: string, sceneId: string) => string = (_c, s) => s,
  /** Whether a contact is on today's roster: only those are picked to start with or stand at (all are copied). */
  onRoster: (contactId: string) => boolean = () => true,
): number {
  if (pts.list().length > 0) return 0;
  const sources = contactIds.filter((id) => fs.existsSync(path.join(dataDir, id, 'room.db')));
  if (sources.length === 0) return 0;

  const dbs = new Map<string, Db>();
  const created: string[] = [];
  const renamed: [string, string][] = [];
  let activated = false;
  let root: string | null = null;
  const closeAll = () => {
    for (const db of dbs.values()) {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    }
    dbs.clear();
  };
  try {
    // contact → player → message stats; and each contact's current scene.
    const stats = new Map<string, Map<string, Stat>>();
    const scenes = new Map<string, string | undefined>();
    for (const id of sources) {
      const db = openDb(path.join(dataDir, id, 'room.db'), { defaultPlayer: 'you' });
      dbs.set(id, db);
      const saved = db.loadRoom()?.sceneId;
      scenes.set(id, saved ? completeScene(id, saved) : undefined);
      const perPlayer = new Map<string, Stat>();
      for (const player of db.pairPlayers()) {
        const all = db.allMessages(player);
        if (all.length > 0) perPlayer.set(player, { count: all.length, newest: all.reduce((n, m) => Math.max(n, m.ts), 0) });
      }
      stats.set(id, perPlayer);
    }

    const players = [...new Set(sources.flatMap((id) => [...stats.get(id)!.keys()]))];
    if (players.length === 0) {
      closeAll();
      return 0; // old databases with no messages: nothing to import, leave them be
    }
    const imported: { id: string; newest: number }[] = [];
    for (const player of players) {
      const mine = sources.filter((id) => stats.get(id)!.has(player));
      const stat = (id: string) => stats.get(id)!.get(player)!;
      // Pick among contacts still on the roster (a retired one's history is copied, not stood in).
      const listed = mine.filter(onRoster);
      const pickFrom = listed.length > 0 ? listed : mine;
      // Strict > keeps the first contact on a tie.
      const start = pickFrom.reduce((best, id) => (stat(id).count > stat(best).count ? id : best));
      const latest = pickFrom.reduce((best, id) => (stat(id).newest > stat(best).newest ? id : best));
      const sceneId = scenes.get(latest);
      const location: Location | null = sceneId ? { contactId: latest, sceneId } : null;

      const info = pts.create({ player, startContact: start, name: `Imported — ${player}` });
      created.push(info.id);
      const chars = pts.charsDir(info.id);
      root ??= path.dirname(path.dirname(chars));
      for (const id of mine) {
        const target = path.join(chars, id, 'room.db');
        fs.mkdirSync(path.dirname(target), { recursive: true });
        dbs.get(id)!.vacuumInto(target);
        pruneToPlayer(target, player);
      }
      if (location) pts.touch(info.id, location);
      imported.push({ id: info.id, newest: stat(latest).newest });
    }

    const newest = imported.reduce((best, p) => (p.newest > best.newest ? p : best));
    pts.setActive(newest.id);
    activated = true;

    // Fold each WAL into its main file before closing, so nothing is left in sidecars the rename would orphan.
    for (const id of sources) {
      const raw = new DatabaseSync(path.join(dataDir, id, 'room.db'));
      try {
        raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      } finally {
        raw.close();
      }
    }
    closeAll();
    const moves: [string, string][] = [];
    for (const id of sources) {
      const base = path.join(dataDir, id, 'room.db');
      moves.push([base, path.join(dataDir, id, RENAMED)]);
      for (const ext of ['-wal', '-shm']) {
        if (!fs.existsSync(base + ext)) continue;
        if (fs.statSync(base + ext).size > 0) {
          throw new Error(`${base}${ext} still has content (is another process using the database?); not migrating`);
        }
        moves.push([base + ext, `${base}${ext}.pre-playthroughs`]);
      }
    }
    for (const [from, to] of moves) {
      fs.renameSync(from, to);
      renamed.push([from, to]);
    }
    log(`imported ${created.length} playthrough(s) from ${sources.length} contact database(s): ${players.join(', ')}`);
    return created.length;
  } catch (err) {
    // Every undo step is best-effort: the original error is the one worth seeing.
    const attempt = (undo: () => void) => {
      try {
        undo();
      } catch {
        /* keep going */
      }
    };
    attempt(closeAll);
    for (const [from, to] of renamed.reverse()) attempt(() => fs.renameSync(to, from));
    if (root) {
      const r = root;
      for (const id of created) attempt(() => fs.rmSync(path.join(r, id), { recursive: true, force: true }));
      if (activated) attempt(() => fs.rmSync(path.join(r, 'index.json'), { force: true }));
      attempt(() => fs.rmdirSync(r)); // only succeeds if nothing else (a .lobby) lives there
    }
    throw err;
  }
}
