/**
 * First boot with data/settings.json: brings over data/backends.json (keys, the curated models as
 * recents) and each character's model choice from the active playthrough's room databases, then
 * renames backends.json to backends.json.imported. A failure changes nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Settings } from './settings';

const MODEL_META = 'backend.model';

export function importLegacySettings(o: {
  dataDir: string;
  settings: Settings;
  /** The active playthrough's chars dir (<pt>/chars), or null with no playthrough. */
  charsDir: string | null;
  /** Her character.json default model, or null for a non-direct id. */
  defaultModel: (id: string) => string | null;
  log: (m: string) => void;
}): void {
  if (o.settings.exists()) return;
  const backends = path.join(o.dataDir, 'backends.json');
  const keys: Record<string, string> = {};
  let recentModels: string[] = [];
  if (fs.existsSync(backends)) {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(backends, 'utf8'));
    } catch {
      o.log('[settings] data/backends.json is not valid JSON; not imported — link a key in the game');
      return;
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      o.log('[settings] data/backends.json is not an object; not imported — link a key in the game');
      return;
    }
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (k === 'models') {
        if (Array.isArray(v)) recentModels = v.filter((m): m is string => typeof m === 'string' && m.length > 0);
        continue;
      }
      const apiKey = (v as { apiKey?: unknown } | null)?.apiKey;
      if (typeof apiKey === 'string' && apiKey.length > 0) keys[k] = apiKey;
    }
  }

  const characterModels: Record<string, string> = {};
  if (o.charsDir && fs.existsSync(o.charsDir)) {
    for (const e of fs.readdirSync(o.charsDir, { withFileTypes: true })) {
      const file = path.join(o.charsDir, e.name, 'room.db');
      const def = o.defaultModel(e.name);
      if (!e.isDirectory() || def === null || !fs.existsSync(file)) continue;
      const model = readModelMeta(file);
      if (model && model !== def) characterModels[e.name] = model;
    }
  }

  const found = fs.existsSync(backends) || Object.keys(characterModels).length > 0;
  if (!found) return;
  o.settings.importLegacy({ keys, recentModels, characterModels });
  if (fs.existsSync(backends)) fs.renameSync(backends, `${backends}.imported`);
  o.log(`[settings] imported data/backends.json and ${Object.keys(characterModels).length} model choice(s) into data/settings.json`);
}

/** Her saved model, read-only; a db without a meta table (or unreadable) has none. */
function readModelMeta(file: string): string | null {
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const row = db.prepare('SELECT v FROM meta WHERE k = ?').get(MODEL_META) as { v?: unknown } | undefined;
    return typeof row?.v === 'string' ? row.v : null;
  } catch {
    return null;
  } finally {
    db?.close();
  }
}
