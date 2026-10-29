// Promised texts (spec 2026-10-23): she said she'd text — at a time, or when she gets somewhere.
import { hhmmOf, weekdayShort, type Block } from './clock';

/** A place promise is looked for every 15 story minutes since it was made. */
export const PROMISE_SCAN_STEP = 15;
/** A promise that hasn't come due in a story day is dropped. */
export const PROMISE_WINDOW = 1440;
/** A promised text that fails this many times is dropped. */
export const PROMISE_TRIES = 3;

export interface TextPromise {
  /** What makes it due: a time (story minutes), or her arriving at a map place. */
  when: { at: number } | { place: string };
  /** What she said she'd text about, in a few words ("that she's home"). */
  about: string;
  /** The reply it came from, and that reply's clock: the window starts there. */
  from: string;
  since: number;
}

/** Story meta: under the reply's stamp, so rewind and LOAD carry it. */
export const promiseKey = (player: string) => `promise.${player}`;
/** Not story meta (its own prefix): how many times a due promise failed to send. */
export const promiseTriesKey = (player: string) => `promisetries.${player}`;
/** Not story meta: the promise (its `from`) whose text was rewound or deleted — never sent again (deck controls spec §3.6). */
export const promiseSpentKey = (player: string) => `promisespent.${player}`;
/** Not story meta: the last text row the deck has shown you in her thread. */
export const deckReadKey = (player: string) => `deckread.${player}`;

/** The minute it came due (a time reached, or the first step she's at the place), or null. */
export function promiseDue(p: TextPromise, now: number, placeAt: (clock: number) => string | null, from: number = p.since): number | null {
  if ('at' in p.when) return p.when.at <= now ? p.when.at : null;
  for (let t = Math.max(p.since, from) + PROMISE_SCAN_STEP; t < now; t += PROMISE_SCAN_STEP) if (placeAt(t) === p.when.place) return t;
  return placeAt(now) === p.when.place ? now : null;
}

export function promiseExpired(p: TextPromise, now: number): boolean {
  return now > p.since + PROMISE_WINDOW;
}

/** A stored promise; null when missing or unreadable. */
export function parsePromise(raw: string | null): TextPromise | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  const w = o.when as Record<string, unknown> | undefined;
  const when = w && typeof w.at === 'number' ? { at: w.at } : w && typeof w.place === 'string' ? { place: w.place } : null;
  if (!when || typeof o.about !== 'string' || typeof o.from !== 'string' || typeof o.since !== 'number') return null;
  return { when, about: o.about, from: o.from, since: o.since };
}

/** Her schedule as the Residual reads it (deck controls spec §1): `Nix's apartment 05:00–18:00 · the Tilt 18:00–19:00 (Fri, Sat) · …`. */
export function dayWords(blocks: readonly Block[], placeName: (room: string) => string): string | null {
  if (blocks.length === 0) return null;
  return [...blocks]
    .sort((a, b) => a.from - b.from)
    .map((b) => `${placeName(b.room)} ${hhmmOf(b.from)}–${hhmmOf(b.to)}${b.days ? ` (${b.days.map((d) => weekdayShort(d)).join(', ')})` : ''}`)
    .join(' · ');
}

/**
 * The places she can promise to text from: the map's, plus the rooms of her day that aren't on it (her home is often
 * a room off the map) — found by the deck e2e: "text me when you're home" had nowhere to point.
 */
export function promisePlaces(map: readonly { id: string; name: string }[], blocks: readonly Block[], roomName: (room: string) => string): { id: string; name: string }[] {
  const out = [...map];
  for (const b of blocks) if (!out.some((p) => p.id === b.room)) out.push({ id: b.room, name: roomName(b.room) });
  return out;
}
