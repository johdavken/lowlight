/**
 * Which check a job's quest-state change plays on the cards (small jobs spec §6). Pure, so main.ts
 * only plays it. A fail that parks plays on its card; each REROLL that fails again plays its roll on
 * REROLL's card; the row that resolves it plays the rest there. A pick that blows the job plays on the
 * way to the cover cards, and the row written after the cover card plays nothing more.
 */
import type { ChatMessage, QuestState } from '../../../shared/types';

type Active = NonNullable<QuestState['active']>;

/** The rolls of a check already played, while it waits (REROLL / TAKE IT, or the cover cards). */
export interface Shown {
  choice: string;
  rolls: number;
}

export interface CheckPlay {
  /** The card it plays on: the picked choice, or `!reroll`. */
  card: string;
  chance: number;
  rolls: number[];
  /** Rolls already played. */
  shown: number;
  pass: boolean;
  red: boolean;
  deckDied: boolean;
}

const DIES = /\*The .+ dies\.\*/;

export function checkToPlay(was: Active | null, now: Active | null, row: ChatMessage | undefined, shown: Shown | null): { play: CheckPlay | null; shown: Shown | null; blown: boolean } {
  const none = { play: null, shown: null, blown: false };
  if (!was || was.alarm === undefined) return none;
  const redOf = (choice: string) => was.choices.find((c) => c.id === choice)?.red === true;
  // Parked on a failed roll: the first one on its card, each later one on REROLL's.
  const rolled = now?.rolled;
  if (rolled) {
    const before = was.rolled?.choice === rolled.choice ? was.rolled.rolls.length : 0;
    if (rolled.rolls.length <= before) return { ...none, shown };
    return {
      play: { card: before > 0 ? '!reroll' : rolled.choice, chance: rolled.chance, rolls: rolled.rolls, shown: before, pass: false, red: false, deckDied: false },
      shown: { choice: rolled.choice, rolls: rolled.rolls.length },
      blown: false,
    };
  }
  // Blown, with cover held: the pick that blew it plays now; the row comes after the cover card.
  const blown = now?.blown;
  if (blown && !was.blown) {
    const pick = blown.pick;
    const r = pick?.roll;
    const done = pick && shown?.choice === pick.choice ? shown.rolls : 0;
    const play = pick && r && r.rolls.length > done ? { card: done > 0 ? '!reroll' : pick.choice, chance: r.chance, rolls: r.rolls, shown: done, pass: r.pass, red: redOf(pick.choice), deckDied: DIES.test(blown.text) } : null;
    return { play, shown: pick && r ? { choice: pick.choice, rolls: r.rolls.length } : null, blown: true };
  }
  const pick = row?.quest?.pick;
  const r = pick?.roll;
  if (!row || !pick || !r) return { ...none, shown };
  const done = shown?.choice === pick.choice ? shown.rolls : 0;
  if (r.rolls.length <= done) return none;
  return { play: { card: done > 0 ? '!reroll' : pick.choice, chance: r.chance, rolls: r.rolls, shown: done, pass: r.pass, red: redOf(pick.choice), deckDied: DIES.test(row.text) }, shown: null, blown: false };
}
