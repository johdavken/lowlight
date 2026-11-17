/**
 * A persona's own figure (spec 2026-11-12): `<pt>/persona/figure.png` and `figure.json`, made in Studio.
 * It belongs to the playthrough, not to save history: a load keeps it, a branch copies it (not `takes/`).
 * Anything missing or bad reads as no figure, so the persona plays in the lead's body.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { WEARS_MAX } from '../../shared/persona';

export const PERSONA_DIR = 'persona';
export const FIGURE_PNG = 'figure.png';
export const FIGURE_JSON = 'figure.json';
export const TAKES_DIR = 'takes';

export interface FigureMeta {
  /** The thumbnail's centre, as character.json's `face`. */
  face: { x: number; y: number };
  /** As character.json's sprite `waist`. */
  waist: number;
  /** The `[wearing]` line's text for the player. */
  wears: string;
  model: string;
  /** ISO date it was kept. */
  made: string;
  /** The filled-in questions, so a later try starts from them. */
  fields: Record<string, string>;
}

export interface PersonaFigure {
  file: string;
  meta: FigureMeta;
}

const unit = z.number().min(0).max(1);
const metaSchema = z.object({
  face: z.object({ x: unit, y: unit }),
  waist: unit,
  wears: z.string().trim().min(1).max(WEARS_MAX),
  model: z.string(),
  made: z.string(),
  fields: z.record(z.string(), z.string()),
});

export function parseFigureMeta(raw: unknown): FigureMeta | null {
  const r = metaSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** The figure in `personaDir`; null when there's no json, it isn't valid, or there's no png. */
export function readFigure(personaDir: string): PersonaFigure | null {
  const file = path.join(personaDir, FIGURE_PNG);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(personaDir, FIGURE_JSON), 'utf8'));
  } catch {
    return null;
  }
  const meta = parseFigureMeta(raw);
  if (!meta || !fs.existsSync(file)) return null;
  return { file, meta };
}

/** Copies a playthrough folder's kept figure (the two files, never takes) into another's. */
export function copyFigure(fromPtDir: string, toPtDir: string): void {
  const from = path.join(fromPtDir, PERSONA_DIR);
  if (!fs.existsSync(path.join(from, FIGURE_PNG)) || !fs.existsSync(path.join(from, FIGURE_JSON))) return;
  const to = path.join(toPtDir, PERSONA_DIR);
  fs.mkdirSync(to, { recursive: true });
  for (const f of [FIGURE_PNG, FIGURE_JSON]) fs.copyFileSync(path.join(from, f), path.join(to, f));
}
