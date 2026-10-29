// Texts on the deck (spec 2026-10-23): a reply's bubbles, and the [texts] block a scene turn gets.
import { photoForModel, photoIdOf } from './photos';
import type { ChatMessage } from './types';

/** A reply holds at most this many bubbles; anything past the last is joined onto it. */
export const MAX_BUBBLES = 4;
/** The longest text the player can send. */
export const MAX_TEXT_CHARS = 500;
/** A scene hears about texts from the last story day only. */
export const TEXT_WINDOW_MIN = 1440;
/** And at most this many text rows. */
export const TEXTS_IN_BLOCK = 8;

/** Her reply as bubbles: *actions* stripped, one bubble per line, blanks dropped, at most MAX_BUBBLES. */
export function splitBubbles(raw: string): string[] {
  const lines = raw
    .replace(/\*[^*\n]*\*/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l !== '');
  if (lines.length <= MAX_BUBBLES) return lines;
  // A photo line (photos spec §3) stays its own bubble: only words are merged, the photo keeps its place at the end.
  const photo = lines.find((l) => photoIdOf(l) !== null);
  const words = lines.filter((l) => l !== photo);
  const room = photo ? MAX_BUBBLES - 1 : MAX_BUBBLES;
  const merged = words.length <= room ? words : [...words.slice(0, room - 1), words.slice(room - 1).join(' ')];
  return photo ? [...merged, photo] : merged;
}

/** `[texts, earlier: you: … · Nix: …]` from the newest text rows of the last story day, oldest first; null when there are none. */
export function textsBlock(rows: readonly ChatMessage[], now: number, names: { you: string; her: string }, caption: (id: string) => string | null = () => null): string | null {
  const recent = rows.filter((m) => m.mode === 'text' && !m.promised && m.status === 'ok' && m.clock !== undefined && m.clock >= now - TEXT_WINDOW_MIN && m.text.trim() !== '').slice(-TEXTS_IN_BLOCK);
  if (recent.length === 0) return null;
  const items = recent.flatMap((m) => (m.role === 'user' ? [`${names.you}: ${m.text.replace(/\s+/g, ' ').trim()}`] : photoForModel(m.text, caption).split('\n').filter((b) => b.trim() !== '').map((b) => `${names.her}: ${b.trim()}`)));
  return `[texts, earlier: ${items.join(' · ')}]`;
}
