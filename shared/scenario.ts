/**
 * Scenario cards (spec 2026-10-09), now the arrival screen's opening (spec 2026-10-27): the scene a
 * new game can start in, and the narrator's one draft of it. Pure: the server, the select screen and their tests share it.
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

/**
 * The narrator's one opening (arrival screen spec §3): a {title, text} object, bare or as a
 * one-element array, from inside a code fence if there is one; null otherwise.
 */
export function parseSceneDraft(text: string): { title: string; text: string } | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const open = body.search(/[[{]/);
  if (open < 0) return null;
  const close = body.lastIndexOf(body[open] === '[' ? ']' : '}');
  if (close <= open) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(body.slice(open, close + 1));
  } catch {
    return null;
  }
  if (Array.isArray(raw)) {
    if (raw.length !== 1) return null;
    raw = raw[0];
  }
  const r = draftSchema.safeParse(raw);
  return r.success ? { title: r.data.title, text: r.data.text } : null;
}

/** The `[scene: …]` line in her system message while the scene is on; `oneLine` keeps it one bracketed line. */
export function sceneBlock(s: Pick<Scene, 'title' | 'text'>, oneLine: (s: string) => string): string {
  // Its own quotes stay the block's: a " in the title reads as '. Its text ends on one stop, not two.
  const title = oneLine(s.title).replace(/"/g, "'");
  const text = oneLine(s.text);
  const ended = /[.!?…]$/.test(text) ? text : `${text}.`;
  return `[scene: how this scene opens — "${title}": ${ended} Play it from here; it's the situation, not a script.]`;
}
