import { storyDay } from './board';
import type { ChatMessage } from './types';

/** Witness lines (spec 2026-11-05): what a contact carried away from a scene another contact's model voiced. */
export const WITNESS_MAX = 160;
/** What one witness carries from one room in one day: entries add up to this, oldest sentences going first. */
export const WITNESS_DAY_MAX = 800;
/** At most this many come back on `[you were there: …]`. */
export const WITNESS_SHOWN = 4;

/** The scene's own lines come back for this long: about 2,500 tokens, a night like The Recut's opening whole. */
export const WITNESS_SCENE_MAX = 10000;
/** And for this many nights after it. */
export const WITNESS_SCENE_NIGHTS = 1;

/** Kept in the room the scene happened in, one per witness per story day. */
export interface Witness {
  text: string;
  /** The story clock of the reply that wrote it. */
  at: number;
  scene: string;
}

export const witnessPrefix = (player: string, who: string): string => `witness.${player}.${who}.`;
export const witnessKey = (player: string, who: string, day: number): string => `${witnessPrefix(player, who)}${day}`;

export function parseWitness(v: string | null): Witness | null {
  if (v === null) return null;
  try {
    const w = JSON.parse(v) as Partial<Witness> | null;
    return typeof w?.text === 'string' && typeof w.at === 'number' && typeof w.scene === 'string' ? { text: w.text, at: w.at, scene: w.scene } : null;
  } catch {
    return null;
  }
}

/** One turn's line, at a sentence end, else a comma, else a word: halves run together once entries add up. */
export function clipWitness(saw: string): string {
  if (saw.length <= WITNESS_MAX) return saw;
  const cut = saw.slice(0, WITNESS_MAX);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (end > 0) return cut.slice(0, end + 1);
  // Closed with a full stop, or the next turn's sentence runs on from it.
  const comma = cut.lastIndexOf(', ');
  const word = cut.lastIndexOf(' ');
  return `${comma > 0 ? cut.slice(0, comma) : word > 0 ? cut.slice(0, word) : cut.slice(0, -1)}.`;
}

/** Today's entry with `saw` added. Rewriting lost things: four turns in one scene left only the last (playtest). */
export function addWitness(carried: string | null, saw: string): string {
  if (!carried) return saw;
  if (carried.includes(saw)) return carried;
  const sentences = carried.split(/(?<=[.!?])\s+/);
  while (sentences.length > 0 && [...sentences, saw].join(' ').length > WITNESS_DAY_MAX) sentences.shift();
  return [...sentences, saw].join(' ');
}

/** How long ago, as a turn's lines say it. */
export function agoWords(days: number): string {
  return days <= 0 ? 'tonight' : days === 1 ? 'last night' : days < 7 ? 'a few nights ago' : 'a while back';
}

/** The line's close. "You remember this" alone left her treating the facts as a hunch and asking about them (playtest). */
export const inTheRoom = (player: string): string => `You were in the room for this yourself: you heard it first-hand, and ${player} saw you there. Don't ask about it, and don't take it as news.`;

/** Her `[you were there: …]` line, newest first; null with none. */
export function witnessedLine(entries: Witness[], today: number, placeName: (scene: string) => string, player: string): string | null {
  const shown = [...entries].sort((a, b) => b.at - a.at).slice(0, WITNESS_SHOWN);
  if (shown.length === 0) return null;
  return `[you were there: ${shown.map((w) => `at ${placeName(w.scene)}, ${agoWords(today - storyDay(w.at))} — ${w.text.replace(/\.\s*$/, '')}`).join('; ')}. ${inTheRoom(player)}]`;
}

/** Rows that are the scene: said, narrated or a goodbye. Not an aside, a text or a game. */
const SCENE_MODES: readonly (ChatMessage['mode'] | undefined)[] = [undefined, 'quest', 'encounter', 'scene', 'greet', 'end'];

/** The visit an entry at `at` came from: that night's rows up to it, since the last arrival in that room. */
export function sceneRows(messages: readonly ChatMessage[], at: number): ChatMessage[] {
  const night = messages.filter((m) => m.clock !== undefined && m.clock <= at && storyDay(m.clock) === storyDay(at));
  const arrived = night.map((m) => m.mode).lastIndexOf('travel');
  return night.slice(arrived + 1).filter((m) => m.status === 'ok' && m.text.trim() !== '' && SCENE_MODES.includes(m.mode));
}

/** The scene word for word, for the one she was last in. A summary keeps pieces: she heard Silas out, then said his deck's always shut (playtest). */
export function witnessedScene(rows: readonly ChatMessage[], o: { place: string; ago: string; player: string; contact: string }): string | null {
  const said = (m: ChatMessage): string => {
    const text = m.text.trim().replace(/\s*\n+\s*/g, ' ');
    if (m.role === 'agent') return `${o.contact}: ${text}`;
    return m.mode === 'quest' || m.mode === 'encounter' || m.mode === 'scene' ? `(narration) ${text}` : `${o.player}: ${text}`;
  };
  const lines = rows.map(said);
  while (lines.length > 0 && lines.join('\n').length > WITNESS_SCENE_MAX) lines.shift();
  if (lines.length === 0) return null;
  return `[what happened in that room, at ${o.place}, ${o.ago}, word for word. You were there for it; "you" in narration is ${o.player}, and each "I" is whoever's speaking. It's memory, not a script: don't recite it.\n${lines.join('\n')}\nThis is newer than your notes: where they disagree, this is what happened.]`;
}
