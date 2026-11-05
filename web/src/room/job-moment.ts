/**
 * Which roll a job's quest-state change plays on the cards (the table spec §4). Pure, so main.ts only plays
 * it. A costly roll that parks plays once on its card, and STEADY or TAKE IT resolving it plays nothing more;
 * a roll that lands at once plays on its card with the row; a pick that blows the job plays on the way to the
 * cover cards, and the row written after the cover card plays nothing more. Rolls from before the table don't play.
 * A save played on a parked miss (crew abilities spec §2) glitches it to the 4–5 it became, on the parked roll.
 */
import type { ChatMessage, QuestState } from '../../../shared/types';
import { isLegacyRoll } from '../../../shared/quests';
import type { Effect } from '../../../shared/dice';
import { rollCost, rollLine } from './check-anim';

type Active = NonNullable<QuestState['active']>;

/** The card whose roll already played, while it waits (STEADY / TAKE IT, or the cover cards). */
export interface Shown {
  choice: string;
}

export interface CheckPlay {
  /** The card it plays on: the picked choice. */
  card: string;
  faces: number[];
  keep: 'high' | 'low';
  kind: 'crit' | 'clean' | 'cost' | 'miss';
  red: boolean;
  deckDied: boolean;
  /** It parks: the table keeps it up beside STEADY / TAKE IT, so it holds only a beat. */
  parked: boolean;
  /** What it did, in words, under its stamp (rollLine); null when an older server sent no cost. */
  line: string | null;
}

/** A save on the parked miss: its faces after (the kept die a 5). */
export interface SavePlay {
  to: number[];
  keep: 'high' | 'low';
  /** The cost's line it scrambles to: what the save bought. */
  line: string | null;
  /** A gamble's new result (ability pass spec §2); absent: a save, to a cost. */
  kind?: CheckPlay['kind'];
}

const DIES = /\*The .+ dies\.\*/;

/** A parked roll's line, from the cost the server holds for it (after a deck or ALARM −1). */
export function parkedLine(r: { kind: CheckPlay['kind']; cost?: { alarm: number; heat: number }; effect?: Effect; gamble?: { die: number }; rerun?: true; lessTake?: number; missTake?: true }): string | null {
  const lost = (r.lessTake ?? 0) + (r.missTake && r.kind === 'miss' ? 1 : 0);
  const line = r.cost ? `${rollLine(r.kind, r.cost, r.effect)}${lost ? ` · TAKE −${lost}` : ''}` : null;
  // A gamble's die shows on the table (ability pass spec §2).
  if (r.rerun) return `RUN AGAIN${line ? ` · ${line}` : ''}`;
  return r.gamble ? `GAMBLE ${r.gamble.die}${line ? ` · ${line}` : ''}` : line;
}

export function checkToPlay(was: Active | null, now: Active | null, row: ChatMessage | undefined, shown: Shown | null): { play: CheckPlay | null; shown: Shown | null; blown: boolean; save?: SavePlay } {
  const none = { play: null, shown: null, blown: false };
  if (!was || was.alarm === undefined) return none;
  const redOf = (choice: string) => was.choices.find((c) => c.id === choice)?.red === true;
  // Parked on a costly roll: it plays once, on its card.
  const rolled = now?.rolled && 'faces' in now.rolled ? now.rolled : undefined;
  if (rolled) {
    // Already up: played here, or parked before this tab loaded (the table rebuilt it, landed).
    const before = was.rolled && 'faces' in was.rolled && was.rolled.choice === rolled.choice ? was.rolled : undefined;
    if (shown?.choice === rolled.choice || before) {
      const saved = before && !before.saved && rolled.saved;
      const gambled = before && !before.gamble && rolled.gamble && before.kind !== rolled.kind;
      // Run It Twice lands new dice whatever they say (tier 3 beat play spec §2).
      const rerun = before && !before.rerun && rolled.rerun;
      return { ...none, shown: { choice: rolled.choice }, ...(saved || gambled || rerun ? { save: { to: rolled.faces, keep: rolled.keep, line: parkedLine(rolled), ...(gambled || rerun ? { kind: rolled.kind } : {}) } } : {}) };
    }
    return { play: { card: rolled.choice, faces: rolled.faces, keep: rolled.keep, kind: rolled.kind, red: redOf(rolled.choice), deckDied: false, parked: true, line: parkedLine(rolled) }, shown: { choice: rolled.choice }, blown: false };
  }
  // Blown, with cover held: the pick that blew it plays now; the row comes after the cover card.
  const blown = now?.blown;
  if (blown && !was.blown) {
    const pick = blown.pick;
    const r = pick?.roll && !isLegacyRoll(pick.roll) ? pick.roll : undefined;
    const play = pick && r && shown?.choice !== pick.choice ? { card: pick.choice, faces: r.faces, keep: r.keep, kind: r.kind, red: redOf(pick.choice), deckDied: DIES.test(blown.text), parked: false, line: rollLine(r.kind, rollCost(r), r.effect) } : null;
    return { play, shown: pick ? { choice: pick.choice } : null, blown: true };
  }
  if (now?.blown) return { ...none, shown };
  const pick = row?.quest?.pick;
  const r = pick?.roll && !isLegacyRoll(pick.roll) ? pick.roll : undefined;
  if (!row || !pick || !r || shown?.choice === pick.choice) return none;
  return { play: { card: pick.choice, faces: r.faces, keep: r.keep, kind: r.kind, red: redOf(pick.choice), deckDied: DIES.test(row.text), parked: false, line: rollLine(r.kind, rollCost(r), r.effect) }, shown: null, blown: false };
}
