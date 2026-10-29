/**
 * Fixed characters: a place's resident (Hae at the noodle stall). Never a contact — she isn't in
 * the roster or at character select. A scene names her (`scene.json` `resident`), and the
 * contact's model voices her while the room is there.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Pronoun } from '../../shared/pronoun';
import type { Face, ResidentInfo } from '../../shared/types';
import type { SpriteRecord } from './agents';
import { characterFile, loadCharacter, resolveExpressions, resolveOutfitByScene, resolveOutfitWears, resolveOutfits, resolveSprite } from './character';
import { resolveProfile } from './character-profile';

const DEFAULT_ACCENT = '#7fe9ff';

export interface ResidentRecord {
  id: string;
  name: string;
  pronoun: Pronoun;
  accent: string;
  /** Reads voice.md now (live edits apply next turn); '' when absent. */
  voice: () => string;
  sprite: SpriteRecord;
  face: Face;
}

const capitalized = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);

/**
 * Every `kind: "fixed"` character folder in `charactersDir`. One without a usable sprite is
 * skipped with a warning (a resident is someone you see); other folders are not residents.
 */
export function loadResidents(charactersDir: string, warn: (m: string) => void): Map<string, ResidentRecord> {
  const out = new Map<string, ResidentRecord>();
  if (!fs.existsSync(charactersDir)) return out;
  for (const entry of fs.readdirSync(charactersDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const dir = path.join(charactersDir, id);
    let c;
    try {
      c = loadCharacter(dir);
    } catch (err) {
      continue; // a malformed contact's file is loadAgents' to report
    }
    if (c?.kind !== 'fixed') continue;
    const w = (m: string) => warn(`resident '${id}': ${m}`);
    const base = resolveSprite(dir, c.sprite, w, 'skipping her');
    if (!base) {
      if (c.sprite === undefined) w('a resident needs a sprite; skipping her');
      continue;
    }
    const outfits = resolveOutfits(dir, c.outfits, w);
    const sprite: SpriteRecord = {
      ...base,
      expressions: resolveExpressions(dir, c.expressions, w),
      outfits,
      outfitByScene: resolveOutfitByScene(c.outfitByScene, outfits, w),
      outfitWears: resolveOutfitWears(c.outfitWears, outfits, w),
    };
    const voiceFile = c.voice ? characterFile(dir, c.voice) : null;
    if (c.voice && !voiceFile) w(`voice '${c.voice}' is missing or outside her folder`);
    out.set(id, {
      id,
      name: c.name ?? capitalized(id),
      pronoun: c.pronoun ?? 'they',
      accent: c.accent ?? DEFAULT_ACCENT,
      voice: () => {
        try {
          return voiceFile ? fs.readFileSync(voiceFile, 'utf8').trim() : '';
        } catch {
          return '';
        }
      },
      sprite,
      face: resolveProfile([{ dir, c }], '', w).face,
    });
  }
  return out;
}

/**
 * Scene id → the resident it names, for the scenes whose `resident` is a loaded fixed character.
 * Any other name warns once and the scene runs without one.
 */
export function sceneResidents(
  scenes: Array<{ id: string; resident?: { character: string } }>,
  residents: Map<string, ResidentRecord>,
  warn: (m: string) => void,
): Map<string, ResidentRecord> {
  const out = new Map<string, ResidentRecord>();
  for (const scene of scenes) {
    if (!scene.resident) continue;
    const rec = residents.get(scene.resident.character);
    if (rec) out.set(scene.id, rec);
    else warn(`scene '${scene.id}': resident '${scene.resident.character}' isn't a fixed character; ignoring it`);
  }
  return out;
}

/** What the browser needs to draw her: her look, under `/api/residents/<id>/…`. */
export function residentInfo(rec: ResidentRecord): ResidentInfo {
  const base = `/api/residents/${rec.id}`;
  const names = Object.keys(rec.sprite.expressions);
  const outfits = Object.keys(rec.sprite.outfits);
  return {
    id: rec.id,
    name: rec.name,
    pronoun: rec.pronoun,
    accent: rec.accent,
    thumb: `${base}/thumb`,
    sprite: {
      url: `${base}/sprite`,
      crop: rec.sprite.crop,
      ...(rec.sprite.height !== undefined ? { height: rec.sprite.height } : {}),
      ...(rec.sprite.pixel ? { pixel: true } : {}),
      ...(names.length > 0 ? { expressions: Object.fromEntries(names.map((n) => [n, `${base}/sprite/${n}`])) } : {}),
      ...(outfits.length > 0 ? { outfits: Object.fromEntries(outfits.map((n) => [n, `${base}/outfit/${n}`])) } : {}),
      ...(Object.keys(rec.sprite.outfitByScene).length > 0 ? { outfitByScene: rec.sprite.outfitByScene } : {}),
    },
  };
}
