/**
 * Encounter cards (spec 2026-10-09 encounter cards): an event that cuts into the scene, the
 * narrator's answer that offers three, the event's line in her history, and who it left here.
 * Pure: the server, the room and their tests share it.
 */
import { z } from 'zod';
import { SCENE_OPTION_TEXT_MAX, SCENE_TITLE_MAX } from './scenario';
import type { ChatMessage } from './types';

export const ENCOUNTER_OPTIONS = 3;
/** How many of the scene's latest lines the narrator reads. */
export const ENCOUNTER_RECENT_LINES = 8;
/** Each of those lines, cut to this many characters. */
export const ENCOUNTER_LINE_MAX = 400;
export const STRANGER_NAME_MAX = 24;
export const STRANGER_VOICE_MAX = 120;

export interface Stranger {
  name: string;
  /** A few words on how they speak. */
  voice: string;
  /** Their face, an extra's id (quest strangers only; stranger faces spec §5). */
  face?: string;
}

export interface Encounter {
  title: string;
  text: string;
  stranger?: Stranger;
  /** The event cuts this district's power (blackouts phase 3 §2). */
  power?: 'out';
}

const title = z
  .string()
  .trim()
  .min(1)
  .max(SCENE_TITLE_MAX)
  .refine((s) => !/[\r\n]/.test(s));
const eventSchema = z.object({ title, text: z.string().trim().min(1).max(SCENE_OPTION_TEXT_MAX), stranger: z.unknown().optional(), power: z.unknown().optional() });
const strangerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(STRANGER_NAME_MAX)
    .regex(/^[\p{L}][\p{L} '-]*$/u),
  voice: z.string().trim().min(1).max(STRANGER_VOICE_MAX),
});

/** Words that say the power goes: a power cut card whose text has none is a mistag. */
const POWER_WORDS = /\b(power|grid|black ?out|outage|breaker|fuse|current|juice|electric\w*|darkness|(goes|went|go|going|gone) dark|dark(ness)? (falls|rolls|spreads)|(lights?|lamps?|bulbs?|neon|screens?)(\s+\w+){0,3}\s+(die|dies|died|dying|go|goes|went|cut|cuts|fail|fails|failed|drop|drops|gutter\w*|out))\b/i;

/** A name as compared with the names already taken: no markdown stars or spaces at the ends, any case. */
const bare = (s: string) => s.replace(/^[\s*]+|[\s*]+$/g, '').toLowerCase();

/**
 * An event, trimmed; null when it isn't one. Its stranger is dropped (the event kept) when it
 * isn't one, or when its name is already taken (`reserved`: you, her, the place's resident). Its
 * `power: 'out'` is kept only as exactly that, and dropped where the power's already out (`dark`).
 */
export function parseEncounter(raw: unknown, reserved: string[], o: { dark?: boolean } = {}): Encounter | null {
  const r = eventSchema.safeParse(raw);
  if (!r.success) return null;
  const out: Encounter = { title: r.data.title, text: r.data.text };
  const s = strangerSchema.safeParse(r.data.stranger);
  const taken = new Set(reserved.map(bare));
  if (s.success && !taken.has(bare(s.data.name))) out.stranger = { name: s.data.name, voice: s.data.voice };
  // A power cut only where the power is on, and only when the event says the power goes (blackouts phase 3 §2; the narrator once tagged an envelope).
  if (r.data.power === 'out' && !o.dark && POWER_WORDS.test(`${out.title} ${out.text}`)) out.power = 'out';
  return out;
}

/** The narrator's answer: exactly three events (from inside a code fence if there is one); null otherwise. */
export function parseEncounterOptions(text: string, reserved: string[], o: { dark?: boolean } = {}): Encounter[] | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(raw) || raw.length !== ENCOUNTER_OPTIONS) return null;
  const out: Encounter[] = [];
  for (const item of raw) {
    const e = parseEncounter(item, reserved, o);
    if (!e) return null;
    out.push(e);
  }
  return out;
}

/** The event as a line of her history: `[event: "<title>": <text>]`, on one line, ending on one stop. */
export function encounterText(e: Pick<Encounter, 'title' | 'text'>, oneLine: (s: string) => string): string {
  const t = oneLine(e.title).replace(/"/g, "'");
  const text = oneLine(e.text);
  const ended = /[.!?…]$/.test(text) ? text : `${text}.`;
  return `[event: "${t}": ${ended}]`;
}

/**
 * Who an event left here at `rows[index]`: walking back, the newest encounter row with a stranger
 * (present), or a successful END SCENE or a travel row (nobody). An END SCENE ends it only after
 * her closing reply: the END SCENE row and her answer to it still have the stranger there. Worked
 * out from the transcript, never stored, so a rewind, delete or branch can't leave a stale stranger.
 */
export function strangerAt(rows: ChatMessage[], index: number): Stranger | null {
  const last = Math.min(index, rows.length - 1);
  for (let i = last; i >= 0; i--) {
    const m = rows[i];
    if (m.role !== 'user' || m.status === 'failed') continue;
    if (m.mode === 'travel') return null;
    if (m.mode === 'end') {
      const closing = rows.slice(i + 1, last + 1).every((r) => r.role === 'agent' && r.replyTo === m.id);
      if (closing) continue;
      return null;
    }
    if (m.mode === 'encounter' && m.encounter?.stranger) return m.encounter.stranger;
    // A quest row's stranger stays until the next quest row: one without a stranger ends them.
    if (m.mode === 'quest') return m.quest?.stranger ?? null;
  }
  return null;
}
