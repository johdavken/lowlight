/**
 * An ability's index tab under its recruit's card (crew abilities on the table; picked 2026-11-02 from
 * docs/mockups/ability-marks.html over the 9×9 glyphs, which read too cartoon for the table): what it does, in words.
 */
import type { JobEffect } from '../../../../shared/crew-book';

const WORDS: Record<JobEffect['kind'], string> = {
  cross: 'POSITION',
  die: '+1D',
  getaway: 'GETAWAY',
  again: 'AGAIN',
  save: 'SAVE',
  alarm: 'ALARM −1',
  nerve: '+1 NERVE',
  take: '+1 TAKE',
  heat: 'HEAT −1',
  rerun: 'AGAIN',
  lookout: 'EARLY',
  'hold-alarm': 'HOLD',
  'talk-past': 'COOL',
  'talk-down': 'NOT BLOWN',
  'inside-info': 'NO CUT',
  undo: 'UNDO',
  'take-hit': 'THE HIT',
  'stand-firm': 'FIRM',
  'sell-part': 'FULL PAY',
  'pay-off': 'PAID OFF',
  'setup-position': 'SET UP',
  'setup-die': 'SET UP',
  'greed-effect': 'GREED',
  'greed-die': 'GREED',
  'gamble-cost': 'GAMBLE',
  'gamble-miss': 'GAMBLE',
  'trade-alarm': 'ALARM −1',
  'trade-nerve': '+2 NERVE',
  'end-take': '+1 TAKE',
  'end-cool': 'HEAT −2',
};

/** The tab's words; a kind this table doesn't know (a server older than the tabs sends none) shows the ability's name. */
export const tabWords = (kind: JobEffect['kind'] | undefined, label: string): string => (kind && WORDS[kind]) || label.toUpperCase();
