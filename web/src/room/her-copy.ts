/** The room page's words about the contact, in her pronoun (spec 2026-10-12 character pronouns §4). */
import type { NarratorKind } from '../../../shared/narrator';
import { forms, type Pronoun } from '../../../shared/pronoun';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "the game is hers": the possessive that stands alone. */
const OWN: Record<Pronoun, string> = { she: 'hers', he: 'his', they: 'theirs' };

export function herCopy(p: Pronoun) {
  const f = forms(p);
  return {
    waitFor: `wait for ${f.her}`,
    waitToFinish: `Wait for ${f.her} to finish.`,
    endTitle: `End the scene: ${f.hers} closing beat, then ${f.hers} recap and notes (Alt+E)`,
    leaveTitle: `Leave: what you've typed goes with it, then ${f.hers} goodbye, ${f.hers} recap and notes, and you walk out on your own`,
    encounters: {
      keyRejected: `${cap(f.hers)} key was rejected: relink it at select to have events dealt.`,
      noCredit: `No credit on ${f.hers} key: top it up to have events dealt.`,
      /** Why no events came, in plain words (spec 2026-10-14 narrator failures §4). */
      failedWhy: (kind: NarratorKind): string => {
        switch (kind) {
          case 'timeout':
            return `${cap(f.hers)} model took too long to answer. Try again, or pick a faster model from ${f.hers} MODEL menu.`;
          case 'too-long':
          case 'bad-answer':
            return `${cap(f.hers)} model's answer didn't fit. Try again, or pick another model from ${f.hers} MODEL menu.`;
          case 'busy':
            return `OpenRouter couldn't reach ${f.hers} model just now. Try again in a moment.`;
          case 'refused':
            return `${cap(f.hers)} model turned the request down. Pick another model from ${f.hers} MODEL menu.`;
          default:
            return 'Something went wrong dealing the events. Try again.';
        }
      },
    },
    pageEmpty: `${cap(f.hers)} page on this visitor: empty until ${f.she} write${f.s} it.`,
    pageTie: (tie: string) => `Empty. What ${f.she} know${f.s} of you from before: ${tie}`,
    byHer: `by ${f.her}`,
    diceOdds: `Count your face plus your 1s, then expect about a third of ${f.hers} dice to match.`,
    diceLastDie: `The loser opens the next round. Lose your last die and the game is ${OWN[p]}.`,
    diceTruth: (won: boolean) => (won ? ` · ask ${f.her} one` : ` · ${f.she} ask${f.s} you one`),
    diceBack: `[ENTER] BACK TO ${f.her.toUpperCase()}`,
    changeModel: (label: string) => `${label} — change ${f.hers} model`,
  };
}

/** The room page's contact (one per page): main.ts sets her pronoun from the portrait event; until then, they. */
let current: Pronoun = 'they';
export const setHerPronoun = (p: Pronoun): void => {
  current = p;
};
/** The room's words about her now, read at render time. */
export const her = () => herCopy(current);
