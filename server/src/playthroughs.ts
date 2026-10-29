import fs from 'node:fs';
import path from 'node:path';
import type { CityWeather } from '../../shared/city-weather';
import type { Outage } from '../../shared/outage';
import type { Location, PlaythroughInfo, SaveInfo } from '../../shared/types';
import { parsePersona, type PlaythroughPersona } from '../../shared/persona';
import { currentSceneId } from '../../shared/scene-aliases';
import { copyIdentityOverrides } from './playthrough-identity';

/** Checkpoints kept per playthrough; manual saves are never pruned. */
export const CHECKPOINT_CAP = 20;

export type SaveRequest = Omit<SaveInfo, 'id' | 'playthrough' | 'at' | 'fingerprint'>;
/** The open contact databases, by contact id. Contacts that aren't open aren't snapshotted. */
export type LiveDbs = Map<string, { vacuumInto(path: string): void; fingerprint(): number[] }>;

export interface Playthroughs {
  active(): PlaythroughInfo | null;
  /** Newest updatedAt first. */
  list(): PlaythroughInfo[];
  get(id: string): PlaythroughInfo | null;
  /** `name` defaults to `<personaName> — <Mon D, HH:MM>`; `personaName` defaults to the player id, capitalised. */
  /** `persona`, when given, also names it (ahead of `personaName`). */
  create(o: { player: string; startContact: string; name?: string; personaName?: string; persona?: PlaythroughPersona }): PlaythroughInfo;
  setActive(id: string): void;
  rename(id: string, name: string): void;
  /** Throws for the active one. */
  remove(id: string): void;
  /** Location and updatedAt; `solo: false` also ends solo, in the same write. */
  touch(id: string, location: Location, o?: { solo?: false; parted?: Record<string, number> }): void;
  /** Records the clock when you left each contact (schedules). */
  setParted(id: string, parted: Record<string, number>): void;
  /** Sets or clears go solo (cleared: the key goes); updatedAt stays. */
  setSolo(id: string, solo: boolean): void;
  /** Sets the outfit the player wears (null: back to the plain sprite, the key goes); updatedAt stays. */
  setOutfit(id: string, outfit: string | null): void;
  /** WAIT: the story clock never goes below `m` again. */
  setClockFloor(id: string, m: number): void;
  /** The city's weather (city weather spec §5): the room you're in sets it. Not a reason to re-sort LOAD. */
  setWeather(id: string, w: CityWeather): void;
  /** The narrator's power cuts (blackouts phase 3 §2); an empty list clears them. Not a reason to re-sort LOAD. */
  setOutages(id: string, list: Outage[]): void;
  /** `<pt>/chars`, the runtimes' stateDir. */
  charsDir(id: string): string;
  /** `<root>/.lobby/chars`: where runtimes keep their state while no playthrough is active. */
  lobbyCharsDir(): string;
  /** Newest first. */
  saves(id: string): SaveInfo[];
  /** A checkpoint whose fingerprint matches the newest save's writes nothing. */
  save(id: string, o: SaveRequest, dbs: LiveDbs): SaveInfo | 'unchanged';
  /** Copies a save into a new playthrough. */
  fork(saveId: string): PlaythroughInfo;
  /**
   * Copies live playthrough `id`'s databases (each with vacuumInto) into a new playthrough described
   * by `info` (not activated, no saves). A failure removes the new folder and rethrows.
   */
  copyLive(id: string, dbs: LiveDbs, info: Omit<PlaythroughInfo, 'id' | 'createdAt' | 'updatedAt'>): PlaythroughInfo;
  removeSave(saveId: string): void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');
const day = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const stamp = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const randomSuffix = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

/** Written to `<file>.tmp` and renamed over the target, so a crash never leaves half a file. */
function writeJsonAtomic(file: string, value: unknown): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * A playthrough.json with the fields everything else relies on, in a folder named for its id. A bad
 * `persona` (a hand edit) is dropped, so the playthrough plays as the character; `onBadPersona` hears of it.
 */
function asPlaythrough(v: unknown, folder: string, onBadPersona: () => void = () => {}): PlaythroughInfo | null {
  if (!isRecord(v) || v.id !== folder) return null;
  if (typeof v.name !== 'string' || typeof v.player !== 'string' || typeof v.startContact !== 'string') return null;
  if (v.persona !== undefined) {
    const persona = parsePersona(v.persona);
    if (persona) v.persona = persona;
    else {
      delete v.persona;
      onBadPersona();
    }
  }
  currentLocation(v);
  return v as unknown as PlaythroughInfo;
}

function asSave(v: unknown, folder: string): SaveInfo | null {
  if (!isRecord(v) || v.id !== folder || typeof v.at !== 'number' || typeof v.playthrough !== 'string') return null;
  currentLocation(v);
  return v as unknown as SaveInfo;
}

/** Old ribbon/ room ids (before the folders matched the districts) read as their current ones; the file isn't rewritten. */
function currentLocation(v: Record<string, unknown>): void {
  if (isRecord(v.location) && typeof v.location.sceneId === 'string') v.location = { ...v.location, sceneId: currentSceneId(v.location.sceneId) };
}

const PT_ID = /^pt-\d{8}-[a-z0-9]{4}$/;
const SV_ID = /^sv-\d{8}-[a-z0-9]{4}$/;
/** Ids become folder names, so anything else ('', '../x') could reach outside the playthrough folders. */
const ptId = (id: string) => {
  if (!PT_ID.test(id)) throw new Error('bad-id');
  return id;
};
const svId = (id: string) => {
  if (!SV_ID.test(id)) throw new Error('bad-id');
  return id;
};

const entries = (f: SaveInfo['fingerprint']) => Object.entries(f).sort(([a], [b]) => (a < b ? -1 : 1));
const sameFingerprint = (a: SaveInfo['fingerprint'], b: SaveInfo['fingerprint']) => JSON.stringify(entries(a)) === JSON.stringify(entries(b));

export function createPlaythroughs(
  root: string,
  now: () => number = Date.now,
  rand: () => string = randomSuffix,
  warn: (msg: string) => void = (m) => console.warn(m),
): Playthroughs {
  fs.mkdirSync(root, { recursive: true });
  const indexFile = path.join(root, 'index.json');
  const dir = (id: string) => path.join(root, ptId(id));
  const file = (id: string) => path.join(dir(id), 'playthrough.json');
  const savesDir = (id: string) => path.join(dir(id), 'saves');

  /** A `<prefix>-<yyyymmdd>-<4 random>` id that no folder under `parent` already has. */
  const freshId = (prefix: string, parent: string) => {
    for (;;) {
      const id = `${prefix}-${day(new Date(now()))}-${rand()}`;
      if (!fs.existsSync(path.join(parent, id))) return id;
    }
  };

  /** Playthroughs already warned about for a bad persona: once each per process. */
  const warnedPersona = new Set<string>();
  const badPersona = (id: string) => () => {
    if (warnedPersona.has(id)) return;
    warnedPersona.add(id);
    warn(`playthrough ${id}: bad persona; playing as the character`);
  };
  const get = (id: string): PlaythroughInfo | null => (PT_ID.test(id) ? asPlaythrough(readJson(file(id)), id, badPersona(id)) : null);

  const list = (): PlaythroughInfo[] => {
    const found: PlaythroughInfo[] = [];
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const info = get(e.name);
      if (info) found.push(info);
    }
    return found.sort((a, b) => b.updatedAt - a.updatedAt);
  };

  const readActive = (): string | null => {
    const v = readJson(indexFile);
    return isRecord(v) && typeof v.active === 'string' ? v.active : null;
  };
  const writeActive = (id: string | null) => writeJsonAtomic(indexFile, { active: id });

  // An index naming a playthrough that's gone (deleted by hand, say) would strand the title.
  const opened = readActive();
  if (opened && !get(opened)) writeActive(null);

  const update = (id: string, change: (info: PlaythroughInfo) => void) => {
    const info = get(ptId(id));
    if (!info) throw new Error(`no playthrough '${id}'`);
    change(info);
    writeJsonAtomic(file(id), info);
  };

  const saves = (id: string): SaveInfo[] => {
    ptId(id);
    const parent = savesDir(id);
    if (!fs.existsSync(parent)) return [];
    const found: SaveInfo[] = [];
    for (const e of fs.readdirSync(parent, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const info = asSave(readJson(path.join(parent, e.name, 'save.json')), e.name);
      if (info) found.push(info);
    }
    // Ids only break ties between saves in the same millisecond.
    return found.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
  };

  /** The playthrough and folder that hold a save. */
  const locate = (saveId: string): { playthrough: string; dir: string } | null => {
    for (const p of list()) {
      const d = path.join(savesDir(p.id), svId(saveId));
      if (fs.existsSync(path.join(d, 'save.json'))) return { playthrough: p.id, dir: d };
    }
    return null;
  };

  return {
    active() {
      const id = readActive();
      return id ? get(id) : null;
    },
    list,
    get,

    create({ player, startContact, name, personaName, persona }) {
      const id = freshId('pt', root);
      const at = now();
      const who = persona?.name ?? personaName ?? player.charAt(0).toUpperCase() + player.slice(1);
      const info: PlaythroughInfo = {
        id,
        name: name ?? `${who} — ${stamp(new Date(at))}`,
        player,
        startContact,
        createdAt: at,
        updatedAt: at,
        forkedFrom: null,
        location: null,
        seed: id,
        ...(persona ? { persona } : {}),
      };
      fs.mkdirSync(path.join(dir(id), 'chars'), { recursive: true });
      writeJsonAtomic(file(id), info);
      return info;
    },

    setActive(id) {
      if (!get(ptId(id))) throw new Error(`no playthrough '${id}'`);
      writeActive(id);
    },

    rename(id, name) {
      update(id, (info) => {
        info.name = name;
      });
    },

    remove(id) {
      if (readActive() === id) throw new Error('active');
      fs.rmSync(dir(id), { recursive: true, force: true });
    },

    touch(id, location, o = {}) {
      update(id, (info) => {
        info.location = location;
        if (o.solo === false) delete info.solo;
        if (o.parted) info.parted = o.parted;
        info.updatedAt = now();
      });
    },

    setParted(id, parted) {
      update(id, (info) => {
        info.parted = parted;
      });
    },

    setClockFloor(id, m) {
      update(id, (info) => {
        info.clockFloor = m;
        info.updatedAt = now();
      });
    },

    setWeather(id, w) {
      update(id, (info) => {
        info.weather = { ...w };
      });
    },

    setOutages(id, list) {
      update(id, (info) => {
        if (list.length > 0) info.outages = list.map((o) => ({ ...o }));
        else delete info.outages;
      });
    },

    setSolo(id, solo) {
      update(id, (info) => {
        if (solo) info.solo = true;
        else delete info.solo;
      });
    },

    setOutfit(id, outfit) {
      update(id, (info) => {
        if (outfit === null) delete info.outfit;
        else info.outfit = outfit;
      });
    },

    charsDir: (id) => path.join(dir(id), 'chars'),
    lobbyCharsDir: () => path.join(root, '.lobby', 'chars'),

    saves,

    save(id, o, dbs) {
      if (!get(ptId(id))) throw new Error('no-playthrough');
      const fingerprint: SaveInfo['fingerprint'] = {};
      for (const [contact, db] of dbs) fingerprint[contact] = db.fingerprint();
      // A rewind's checkpoint is always written: REWIND HERE promises one, by name, to load back.
      if (o.kind === 'checkpoint' && o.trigger !== 'rewind') {
        const newest = saves(id)[0];
        // Walking out or back in changes nothing in the databases, but it is still a different moment.
        // A WAIT changes no database but is still a later moment (its clock).
        if (newest && sameFingerprint(newest.fingerprint, fingerprint) && !!newest.solo === !!o.solo && newest.clock === o.clock) return 'unchanged';
      }

      const saveId = freshId('sv', savesDir(id));
      const saveDir = path.join(savesDir(id), saveId);
      const info: SaveInfo = { ...o, id: saveId, playthrough: id, at: now(), fingerprint };
      try {
        fs.mkdirSync(path.join(saveDir, 'chars'), { recursive: true });
        for (const [contact, db] of dbs) {
          const contactDir = path.join(saveDir, 'chars', contact);
          fs.mkdirSync(contactDir, { recursive: true });
          db.vacuumInto(path.join(contactDir, 'room.db'));
        }
        copyIdentityOverrides(path.join(dir(id), 'chars'), path.join(saveDir, 'chars'));
        fs.copyFileSync(file(id), path.join(saveDir, 'playthrough.json'));
        writeJsonAtomic(path.join(saveDir, 'save.json'), info);
      } catch (err) {
        fs.rmSync(saveDir, { recursive: true, force: true });
        throw err;
      }

      if (o.kind === 'checkpoint') {
        for (const old of saves(id).filter((s) => s.kind === 'checkpoint').slice(CHECKPOINT_CAP)) {
          fs.rmSync(path.join(savesDir(id), old.id), { recursive: true, force: true });
        }
      }
      return info;
    },

    fork(saveId) {
      const found = locate(saveId);
      if (!found) throw new Error(`no save '${saveId}'`);
      const save = asSave(readJson(path.join(found.dir, 'save.json')), saveId)!;
      const snapshot = asPlaythrough(readJson(path.join(found.dir, 'playthrough.json')), found.playthrough);
      if (!snapshot) throw new Error(`save '${saveId}' has no playthrough.json`);

      const id = freshId('pt', root);
      const at = now();
      const info: PlaythroughInfo = {
        ...snapshot,
        id,
        name: `${save.name} (branch)`,
        createdAt: at,
        updatedAt: at,
        forkedFrom: { playthrough: found.playthrough, save: saveId, name: save.name },
        location: save.location ?? snapshot.location,
        // The same nights as the playthrough it came from (one from before seeds: its id).
        seed: snapshot.seed ?? found.playthrough,
      };
      // Solo as the save has it (the snapshot copy can't disagree, but the save is what the load screen shows).
      delete info.solo;
      if (save.solo) info.solo = true;
      const target = dir(id);
      try {
        // A save with no databases (the contact in its location was never opened) still forks to an empty chars/.
        fs.mkdirSync(path.join(target, 'chars'), { recursive: true });
        fs.cpSync(path.join(found.dir, 'chars'), path.join(target, 'chars'), { recursive: true });
        writeJsonAtomic(file(id), info);
      } catch (err) {
        fs.rmSync(target, { recursive: true, force: true });
        throw err;
      }
      return info;
    },

    copyLive(id, dbs, o) {
      if (!get(ptId(id))) throw new Error('no-playthrough');
      const newId = freshId('pt', root);
      const at = now();
      const info: PlaythroughInfo = { ...o, id: newId, createdAt: at, updatedAt: at };
      const target = dir(newId);
      try {
        fs.mkdirSync(path.join(target, 'chars'), { recursive: true });
        for (const [contact, db] of dbs) {
          fs.mkdirSync(path.join(target, 'chars', contact), { recursive: true });
          db.vacuumInto(path.join(target, 'chars', contact, 'room.db'));
        }
        copyIdentityOverrides(path.join(dir(id), 'chars'), path.join(target, 'chars'));
        writeJsonAtomic(file(newId), info);
      } catch (err) {
        fs.rmSync(target, { recursive: true, force: true });
        throw err;
      }
      return info;
    },

    removeSave(saveId) {
      const found = locate(saveId);
      if (found) fs.rmSync(found.dir, { recursive: true, force: true });
    },
  };
}
