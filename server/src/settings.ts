/**
 * `data/settings.json`: the player's link to a model (provider keys), recent model picks, each
 * character's chosen model and the generated room token. Set in-game; only this module writes it.
 * One in-memory copy, written whole (tmp + rename, 0600) on every change.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { NARRATOR_THINKING, type NarratorThinking } from '../../shared/types';

export const SETTINGS_FILE = 'settings.json';
export const RECENT_CAP = 8;

interface SettingsData {
  version: 1;
  roomToken?: string;
  keys: Record<string, string>;
  recentModels: string[];
  characterModels: Record<string, string>;
  /** Absent: auto. */
  narratorThinking?: NarratorThinking;
}

export interface Settings {
  /** Whether there was a (valid) file when it was opened. */
  exists(): boolean;
  key(name: string): string | null;
  setKey(name: string, key: string): void;
  deleteKey(name: string): void;
  recentModels(): string[];
  pushRecent(model: string): void;
  characterModel(id: string): string | null;
  /** null: back to her character.json default. */
  setCharacterModel(id: string, model: string | null): void;
  narratorThinking(): NarratorThinking;
  setNarratorThinking(t: NarratorThinking): void;
  /** The browser token; generated and saved the first time it's asked for. */
  roomToken(): string;
  /** First boot: everything from the old files, in one write. */
  importLegacy(from: { keys: Record<string, string>; recentModels: string[]; characterModels: Record<string, string> }): void;
}

const empty = (): SettingsData => ({ version: 1, keys: {}, recentModels: [], characterModels: {} });

const strings = (v: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return out;
  for (const [k, s] of Object.entries(v)) if (typeof s === 'string' && s.length > 0) out[k] = s;
  return out;
};

/** The file's data, null when absent, 'bad' when it can't be used. */
function read(file: string): SettingsData | null | 'bad' {
  if (!fs.existsSync(file)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return 'bad';
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'bad';
  const o = raw as Record<string, unknown>;
  return {
    version: 1,
    ...(typeof o.roomToken === 'string' && o.roomToken.length >= 16 ? { roomToken: o.roomToken } : {}),
    keys: strings(o.keys),
    recentModels: Array.isArray(o.recentModels) ? o.recentModels.filter((m): m is string => typeof m === 'string' && m.length > 0).slice(0, RECENT_CAP) : [],
    characterModels: strings(o.characterModels),
    ...((NARRATOR_THINKING as readonly unknown[]).includes(o.narratorThinking) && o.narratorThinking !== 'auto' ? { narratorThinking: o.narratorThinking as NarratorThinking } : {}),
  };
}

export function openSettings(dataDir: string, log: (m: string) => void = (m) => console.warn(m)): Settings {
  const file = path.join(dataDir, SETTINGS_FILE);
  const found = read(file);
  let data: SettingsData;
  let existed = false;
  if (found === 'bad') {
    const aside = `${file}.bad-${Date.now()}`;
    fs.renameSync(file, aside);
    log(`[settings] data/${SETTINGS_FILE} couldn't be read; set aside as ${path.basename(aside)} — relink in the game`);
    data = empty();
  } else if (found) {
    data = found;
    existed = true;
  } else data = empty();

  const write = () => {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, file);
  };

  return {
    exists: () => existed,
    key: (name) => data.keys[name] ?? null,
    setKey(name, key) {
      data.keys[name] = key;
      write();
    },
    deleteKey(name) {
      if (!(name in data.keys)) return;
      delete data.keys[name];
      write();
    },
    recentModels: () => [...data.recentModels],
    pushRecent(model) {
      data.recentModels = [model, ...data.recentModels.filter((m) => m !== model)].slice(0, RECENT_CAP);
      write();
    },
    characterModel: (id) => data.characterModels[id] ?? null,
    setCharacterModel(id, model) {
      if (model === null) delete data.characterModels[id];
      else data.characterModels[id] = model;
      write();
    },
    narratorThinking: () => data.narratorThinking ?? 'auto',
    setNarratorThinking(t) {
      if (t === 'auto') delete data.narratorThinking;
      else data.narratorThinking = t;
      write();
    },
    roomToken() {
      if (!data.roomToken) {
        data.roomToken = crypto.randomBytes(32).toString('base64url');
        write();
      }
      return data.roomToken;
    },
    importLegacy(from) {
      data.keys = { ...data.keys, ...from.keys };
      data.recentModels = [...new Set([...data.recentModels, ...from.recentModels])].slice(0, RECENT_CAP);
      data.characterModels = { ...data.characterModels, ...from.characterModels };
      write();
    },
  };
}

/** Which keys are set (never the keys). Read-only: never writes or sets a bad file aside (Studio). */
export function readSettingsKeys(dataDir: string): Record<string, boolean> {
  const d = read(path.join(dataDir, SETTINGS_FILE));
  return d && d !== 'bad' ? Object.fromEntries(Object.keys(d.keys).map((k) => [k, true])) : {};
}

/** The recent model picks. Read-only, like readSettingsKeys. */
export function readRecentModels(dataDir: string): string[] {
  const d = read(path.join(dataDir, SETTINGS_FILE));
  return d && d !== 'bad' ? d.recentModels : [];
}
