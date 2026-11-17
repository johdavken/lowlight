/**
 * What a card's roll comes to before it's rolled (the table in the trace, plan 2026-11-15): the chance of each result,
 * and one line per result saying what it does on this card. The table's face and its hover panel read the same rules
 * (`kindResult`, `picksFor`), so they can't disagree.
 */
import { kindResult, POOL_MAX, type Effect, type Position } from './dice';
import { picksFor } from './costs';

/** The most costs a roll deals (roll lifecycle spec §1.2). */
const DEALT = 3;

/** Chances in whole percent, summing to 100: a 6 (crits among them), a 4–5, a miss. No dice: two rolled, the lower kept. */
export function odds(dice: number): { clean: number; cost: number; miss: number } {
  const n = Math.min(POOL_MAX, dice);
  const [six, miss] = n >= 1 ? [1 - (5 / 6) ** n, 0.5 ** n] : [1 / 36, 27 / 36];
  const clean = Math.round(six * 100);
  const lost = Math.round(miss * 100);
  return { clean, cost: 100 - clean - lost, miss: lost };
}

/** What a card's outcomes do beyond the roll (the view's `on`), with the holder's name filled in. */
export interface CardOn {
  pass?: 'part' | 'none';
  miss?: 'part' | 'none';
  blown?: true;
  harm?: { who: string; harm: 'hurt' | 'held' };
}

/** One result's line: `gain` leads (bold on the card), `rest` follows. */
export interface ResultLine {
  key: '6' | '4–5' | '1–3';
  gain: string;
  rest: string;
}

const picks = (n: number) => (n ? `Pick ${n} cost${n > 1 ? 's' : ''}.` : 'No cost.');

/**
 * The three lines of a card: a 6, a 4–5, a miss. `effect` absent: the roll fills no TAKE here (GET OUT, a push beat).
 * `on.harm.who` is the name to print.
 */
export function resultLines(o: { position: Position; effect?: Effect; on?: CardOn }): [ResultLine, ResultLine, ResultLine] {
  const take = (k: 'clean' | 'cost') => (o.effect ? kindResult(k, o.position, o.effect).take : 0);
  const gain = (n: number) => (n > 0 ? `+${n} TAKE.` : o.effect ? 'Through, no TAKE.' : 'Through.');
  const cut = o.on?.pass === 'none' ? ' The take is lost all the same.' : o.on?.pass === 'part' ? ' The take is cut all the same.' : '';
  const lost = o.on?.blown ? 'THE JOB IS BLOWN.' : o.on?.miss === 'none' ? 'YOU LOSE THE TAKE.' : o.on?.miss === 'part' ? 'YOU KEEP HALF THE TAKE.' : o.effect ? 'No TAKE.' : 'Not through.';
  const harm = o.on?.harm ? ` ${o.on.harm.who} ${o.on.harm.harm === 'held' ? 'IS HELD' : 'TAKES THE HIT'}.` : '';
  const miss = picksFor('miss', o.position, DEALT);
  return [
    { key: '6', gain: gain(take('clean')), rest: `No cost.${cut}`.trim() },
    { key: '4–5', gain: gain(take('cost')), rest: `${picks(picksFor('cost', o.position, DEALT))}${cut}` },
    { key: '1–3', gain: lost, rest: `${picks(miss)}${harm}` },
  ];
}
