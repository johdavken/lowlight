/**
 * The off-screen beat's prompt (spec 2026-11-18 §2): who could have moved, where the world had them, what's between them
 * and you, and the quests nobody may touch. One call for all of them; every line here is paid nine times over.
 */
import { hhmmOf, minuteOfDay } from '../../shared/clock';
import { LINE_MAX, MOVERS_MAX, STEP } from '../../shared/moves';
import { writtenLines, type WrittenThreads } from './cipher-run';
import type { CompletionMessage } from './turn';

/** The beat's answer: three short moves (spec §2). */
export const MOVES_MAX_TOKENS = 600;

export interface MoverInput {
  id: string;
  name: string;
  pronoun: string;
  tagline: string;
  /** Already cut to ~300 characters at a sentence. */
  bio: string;
  /** "home 20:00–23:00 · the Tilt 23:00–02:00 (fixed)" */
  spans: string;
  /** Her last three move lines, oldest first. */
  recent: string[];
  /** Her summary with you, ≤400 characters. */
  summary: string | null;
  plan: string | null;
  promise: string | null;
  /** A waiting contract she's in: "<title> (waiting for the night)". */
  job: string | null;
}

export interface MovesPromptInput {
  you: string;
  window: { from: number; to: number };
  weather: string;
  /** Districts with the power out. */
  dark: string[];
  places: { id: string; name: string }[];
  movers: MoverInput[];
  written: WrittenThreads;
}

export const MOVES_SYSTEM = `You keep the city moving while the player is elsewhere. Lowlight: rain, neon, debt, chrome. Terse, hard, no comfort. Some of these people did something worth telling in this window. Pick at most ${MOVERS_MAX}, the ones it would matter for. Most of the time most of them did nothing worth a line: leave them out. Never filler: no sleeping, eating or waiting around unless it costs something.

For each: one sentence in their own voice, first person, under ${LINE_MAX} characters, what they did, not what they felt. It happens where [mover] says they were at that time. Nothing that settles a deal, a debt, a job or a person the story hasn't settled. Never touch a [written] quest or name its people or a guest. Corp security on the grid is lacquer.

Their life, not a plot. Use only people, places and things already in their [mover] lines: no new people, names, suspects, figures in photos, lockups, records, evidence or clues, and no mystery the story doesn't already hold. Never investigate, trace, follow or dig into anything: the story's questions are answered on screen, with the player. [lately] is what they already did: don't repeat it and don't take it a step further. A move stands alone.

Effects, at most one per move, only when it fits:
- going: they head somewhere else on the places list, until a time ("until":"HH:MM").
- text: it involves the player and they'd tell them; "about" is what, in a few words. At most one.
- word: others could hear of it. At most one.

Answer JSON only:
{"moves":[{"id":"<mover id>","at":"HH:MM","line":"…","place":"<place id>","effect":{"kind":"going","place":"<place id>","until":"HH:MM"}}]}
Nobody did anything worth a line: {"moves":[]}`;

const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
const hm = (t: number) => hhmmOf(minuteOfDay(t));

/** A place in the spans as the places list names it, id and name (minor M7): rooms that share a map place share its name. */
export const spanPlace = (placeName: (id: string) => string) => (id: string) => `${id} "${placeName(id)}"`;

/** Where she was across the window, collapsed to spans; a span in a fixed block is marked. */
export function spansOf(window: { from: number; to: number }, placeAt: (clock: number) => string, placeName: (id: string) => string, fixed: (from: number, to: number) => boolean): string {
  const spans: { place: string; from: number; to: number }[] = [];
  for (let t = window.from; t < window.to; t += STEP) {
    const place = placeAt(t);
    const last = spans.at(-1);
    if (last && last.place === place) last.to = Math.min(t + STEP, window.to);
    else spans.push({ place, from: t, to: Math.min(t + STEP, window.to) });
  }
  return spans.map((s) => `${placeName(s.place)} ${hm(s.from)}–${hm(s.to)}${fixed(s.from, s.to) ? ' (fixed)' : ''}`).join(' · ');
}

export function movesMessages(i: MovesPromptInput): CompletionMessage[] {
  const mover = (m: MoverInput) =>
    [
      `[mover: ${m.id} "${m.name}" (${m.pronoun}) — ${flat(m.tagline)} ${flat(m.bio)}`.trimEnd(),
      `where: ${m.spans}`,
      m.recent.length > 0 ? `lately (done; don't repeat or extend): ${m.recent.map(flat).join(' / ')}` : null,
      m.summary ? `with ${i.you}: ${flat(m.summary)}` : null,
      m.plan ? `plan with ${i.you}: ${flat(m.plan)}` : null,
      m.promise ? `promised ${i.you}: ${flat(m.promise)}` : null,
      m.job ? `job with ${i.you}: ${flat(m.job)}` : null,
    ]
      .filter((x): x is string => x !== null)
      .join('\n  ') + ']';
  const user = [
    `[window: ${hm(i.window.from)}–${hm(i.window.to)} · ${i.weather}${i.dark.length > 0 ? ` · dark: ${i.dark.join(', ')}` : ''}]`,
    `[player: ${i.you}]`,
    `[places: ${i.places.map((p) => `${p.id} "${p.name}"`).join(', ')}]`,
    ...writtenLines(i.written),
    i.movers.map(mover).join('\n'),
    'Answer {"moves":[…]}, or {"moves":[]}.',
  ].join('\n\n');
  return [
    { role: 'system', content: MOVES_SYSTEM },
    { role: 'user', content: user },
  ];
}
