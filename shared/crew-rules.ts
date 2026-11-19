/**
 * Crew rules (spec 2026-11-17 crew rules): landing a way on a beat, the moves, the throw and the grade at the end.
 * Pure: the server, the board and their tests share these. A way's costs are what its file says; only a move or
 * program played on that beat (the beat's mods) changes them.
 */
import { hashSeed } from './board';
import type { Specialty } from './crew-book';
import type { Way } from './crew-ways';
import { rng } from './rng';

export type MoveId = 'cover-story' | 'loop-the-cams' | 'listen-in' | 'hold-the-door';

/** Each recruit's move, by specialty. `art` is a file in `web/public/abilities/`. */
export const MOVES: Record<MoveId, { spec: Specialty; name: string; line: string; art: string }> = {
  'cover-story': { spec: 'face', name: 'COVER STORY', line: 'No ALARM lands on this beat.', art: 'cover-story.webp' },
  'loop-the-cams': { spec: 'runner', name: 'LOOP THE CAMS', line: 'No HEAT lands on this beat.', art: 'loop-the-cams.webp' },
  'listen-in': { spec: 'ears', name: 'LISTEN IN', line: "This beat's TAKE is +1.", art: 'heard-it-first.webp' },
  'hold-the-door': { spec: 'muscle', name: 'HOLD THE DOOR', line: 'Stays behind and holds the door for the rest of the job.', art: 'hold-the-door.webp' },
};

/** A specialty's move; a fence (and any other) has none. */
export const moveOf = (spec: Specialty): MoveId | null => (Object.keys(MOVES) as MoveId[]).find((id) => MOVES[id].spec === spec) ?? null;

/** What moves and programs played on the current beat change for whoever does it. */
export interface BeatMods {
  /** COVER STORY. */
  noAlarm?: true;
  /** LOOP THE CAMS. */
  noHeat?: true;
  /** LISTEN IN. */
  plusTake?: true;
  /** FIREWALL: one point of ALARM doesn't land. */
  wall?: true;
}

/** A crew-rules job's state: who has used their go (and how), its own clocks, this beat's mods, and what lands at the end. */
export interface CrewState {
  goes: Record<string, 'spent' | 'door' | 'hurt' | 'held'>;
  clocks: Record<string, number>;
  mods: BeatMods;
  /** The beat `mods` belong to. */
  modsBeat: string | null;
  /** Percent off the pay at the end. */
  cut: number;
  /** HEAT that landed, added to the district at the end. */
  heat: number;
}

export const freshCrew = (): CrewState => ({ goes: {}, clocks: {}, mods: {}, modsBeat: null, cut: 0, heat: 0 });

/** What a way lands once the beat's mods apply. */
export interface Landed {
  take: number;
  alarm: number;
  heat: number;
  clocks: Record<string, number>;
  cut: number;
  lose: number;
  harm?: 'hurt' | 'held';
  /** FIREWALL stopped a point of ALARM (so it's spent). */
  wallUsed: boolean;
}

/** A way as it lands: its own tags, changed only by the beat's mods. A getaway fills no TAKE. */
export function landWay(w: Way, mods: BeatMods, o: { getaway: boolean }): Landed {
  const take = o.getaway ? 0 : w.take + (mods.plusTake && w.take > 0 ? 1 : 0);
  let alarm = mods.noAlarm ? 0 : w.alarm;
  const wallUsed = !!mods.wall && alarm > 0;
  if (wallUsed) alarm -= 1;
  return { take, alarm, heat: mods.noHeat ? 0 : w.heat, clocks: { ...w.clocks }, cut: w.cut, lose: w.lose, ...(w.harm ? { harm: w.harm } : {}), wallUsed };
}

/** A job clock moved by a way's points: up to its size, down to 0. */
export const moveClock = (value: number, n: number, size: number): number => Math.max(0, Math.min(size, value + n));

/** A recruit sent at a card with no way for them: one seeded die, through on 4–6. */
export function throwOf(seed: string): { die: number; through: boolean } {
  const die = 1 + Math.floor(rng(hashSeed(seed))() * 6);
  return { die, through: die >= 4 };
}

export const throwLine = (name: string, through: boolean): string => (through ? `${name} gets it done the hard way.` : `${name} is out of their depth, and it shows.`);

/** The end: clean is full TAKE, ALARM under 2 and nobody hurt or held; blown is TAKE 0 or a blown outcome; messy the rest. */
export function crewGrade(o: { take: number; size: number; alarm: number; blown: boolean; harmed: boolean }): 'clean' | 'messy' | 'blown' {
  if (o.blown || o.take <= 0) return 'blown';
  return o.take >= o.size && o.alarm < 2 && !o.harmed ? 'clean' : 'messy';
}

/** Hand ids for you and the job's contact; a loaded program's is `p:<id>`. */
export const HAND_YOU = 'you',
  HAND_CONTACT = 'contact';
export const programCard = (id: string) => `p:${id}`;
