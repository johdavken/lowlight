/**
 * Scenario cards (spec 2026-10-09), now the arrival screen's opening (spec 2026-10-27): the scene a
 * new game can start in, and the narrator's three for the pair. Pure: the server, the select screen and their tests share it.
 */
import { z } from 'zod';

export const SCENE_TITLE_MAX = 40;
export const SCENE_TEXT_MAX = 800;
/** An encounter card's text (a scene may run to SCENE_TEXT_MAX). */
export const SCENE_OPTION_TEXT_MAX = 600;
/** A written scene's title. */
export const WRITTEN_SCENE_TITLE = 'YOUR SCENE';

export interface Scene {
  title: string;
  text: string;
  source: 'generated' | 'written';
}

const title = z
  .string()
  .trim()
  .min(1)
  .max(SCENE_TITLE_MAX)
  .refine((s) => !/[\r\n]/.test(s));
const draftSchema = z.object({ title, text: z.string().trim().min(1).max(SCENE_TEXT_MAX) });

/** The opening's three kinds (one card each, in this order): something already between them, one needing something from the other tonight, the place throwing them together. */
export const SCENE_KINDS = ['history', 'business', 'chance'] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];
export interface SceneOption {
  kind: SceneKind;
  title: string;
  text: string;
}

/**
 * The narrator's three openings: a JSON array of exactly three {title, text}, from inside a code
 * fence if there is one, each taking the kind of its place whatever it said; null otherwise.
 */
export function parseSceneOptions(text: string): SceneOption[] | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const open = body.indexOf('[');
  const close = body.lastIndexOf(']');
  if (open < 0 || close <= open) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(body.slice(open, close + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length !== SCENE_KINDS.length) return null;
  const out: SceneOption[] = [];
  for (const [i, item] of raw.entries()) {
    const r = draftSchema.safeParse(item);
    if (!r.success) return null;
    out.push({ kind: SCENE_KINDS[i]!, title: r.data.title, text: r.data.text });
  }
  return out;
}

/** The `[scene: …]` line in her system message while the scene is on; `oneLine` keeps it one bracketed line. */
export function sceneBlock(s: Pick<Scene, 'title' | 'text'>, oneLine: (s: string) => string): string {
  // Its own quotes stay the block's: a " in the title reads as '. Its text ends on one stop, not two.
  const title = oneLine(s.title).replace(/"/g, "'");
  const text = oneLine(s.text);
  const ended = /[.!?…]$/.test(text) ? text : `${text}.`;
  return `[scene: how this scene opens — "${title}": ${ended} Play it from here; it's the situation, not a script.]`;
}
