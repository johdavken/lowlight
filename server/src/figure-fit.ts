/**
 * ADJUST FIGURE on PEOPLE (dev only): a contact's waist (`sprite.waist`, where she stands on the stage's line) and
 * portrait centre (`face`, where thumb.ts cuts her tile) written back to her character.json, the rest of the file
 * as it was. Only a checkout that holds Studio offers it, never the play launcher or a build: a player's
 * character files are the shipped ones.
 */
import fs from 'node:fs';
import path from 'node:path';
import { WAIST_MAX, WAIST_MIN } from '../../shared/waist';
import { writeKeepingForm } from '../../shared/json-text';

export interface FigureFit {
  /** Share of the sprite's height from its top. */
  waist: number;
  /** Centre of the portrait crop, as shares of the sprite. */
  face: { x: number; y: number };
}

/**
 * Whether this server may write figure fits into characters/. LOWLIGHT_FIGURE_EDITS=1/0 decides outright; else
 * only a dev checkout (Studio's folder present: it's never exported) that the play launcher didn't start.
 */
export function figureEditsOn(env: NodeJS.ProcessEnv, cwd = process.cwd()): boolean {
  if (env.LOWLIGHT_FIGURE_EDITS === '1') return true;
  if (env.LOWLIGHT_FIGURE_EDITS === '0') return false;
  if (env.LOWLIGHT_LAUNCHER || env.NODE_ENV === 'production') return false;
  return fs.existsSync(path.join(cwd, 'studio', 'server'));
}

const round = (v: number) => Math.round(v * 1000) / 1000;
const isShare = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** The body's fit, rounded like Studio's; a string saying what's wrong otherwise. */
export function parseFit(body: unknown): FigureFit | string {
  const b = (body ?? {}) as { waist?: unknown; face?: { x?: unknown; y?: unknown } };
  if (typeof b.waist !== 'number' || !Number.isFinite(b.waist) || b.waist < WAIST_MIN || b.waist > WAIST_MAX) return `waist must be a number from ${WAIST_MIN} to ${WAIST_MAX}`;
  if (!isShare(b.face?.x) || !isShare(b.face?.y)) return 'face needs x and y from 0 to 1';
  return { waist: round(b.waist), face: { x: round(b.face.x), y: round(b.face.y) } };
}

/** Her character.json text with the fit in; null when her figure isn't her own (none, or her base's via `extends`). */
export function withFit(text: string, fit: FigureFit): string | null {
  const json = JSON.parse(text) as Record<string, unknown>;
  const sprite = json.sprite;
  if (!sprite || typeof sprite !== 'object' || Array.isArray(sprite)) return null;
  const next: Record<string, unknown> = { ...json, sprite: { ...(sprite as Record<string, unknown>), waist: fit.waist }, face: fit.face };
  return writeKeepingForm(text, next);
}

/** What the editor opens on: her own fit as the file has it (waist null: none set yet). */
export function readFit(text: string): { waist: number | null; face: { x: number; y: number } | null; own: boolean } {
  const json = JSON.parse(text) as { sprite?: { waist?: unknown }; face?: { x?: unknown; y?: unknown } };
  const own = !!json.sprite && typeof json.sprite === 'object';
  const waist = own && typeof json.sprite!.waist === 'number' ? json.sprite!.waist : null;
  const face = isShare(json.face?.x) && isShare(json.face?.y) ? { x: json.face.x, y: json.face.y } : null;
  return { waist, face, own };
}

/** Writes her file through a temp file and a rename, so a crash never leaves half a character.json. */
export function writeFit(file: string, fit: FigureFit): 'ok' | 'not-own' {
  const text = withFit(fs.readFileSync(file, 'utf8'), fit);
  if (text === null) return 'not-own';
  const tmp = `${file}.fit-tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
  return 'ok';
}
