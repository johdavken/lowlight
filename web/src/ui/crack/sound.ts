/**
 * The crack terminal's sound: one cue per moment of a crack, at the gig cues' level. The author picked them
 * on the Terminal Sounds audition (2026-10-20); sources in `sounds/CREDITS.md`. A missing file is
 * silent (the engine drops it).
 */
import type { Move, Played } from '../../../../shared/crack';
import { GIG_CUE_LEVEL } from '../gig/sound';

export type CrackCue = 'open' | 'hover' | 'guess' | 'wrong' | 'last' | 'dud' | 'reset' | 'granted' | 'locked' | 'leave';

export const CRACK_CUE_URL: Record<CrackCue, string> = {
  open: '/sound/crack/open.ogg',
  hover: '/sound/crack/hover.ogg',
  guess: '/sound/crack/guess.ogg',
  wrong: '/sound/crack/wrong.ogg',
  last: '/sound/crack/last.ogg',
  dud: '/sound/crack/dud.ogg',
  reset: '/sound/crack/reset.ogg',
  granted: '/sound/crack/granted.ogg',
  // The author kept the mission's heat buzzer for a lockout.
  locked: '/sound/mission/heat.ogg',
  leave: '/sound/crack/leave.ogg',
};
/** Hovering plays most, so it sits lower, as on the quest cards. */
export const crackCueLevel = (n: CrackCue) => (n === 'hover' ? GIG_CUE_LEVEL * 0.5 : GIG_CUE_LEVEL);

export function crackCuePlayer(audio: { cue(url: string, level?: number): void }): (name: CrackCue) => void {
  return (name) => audio.cue(CRACK_CUE_URL[name], crackCueLevel(name));
}

/**
 * What a move that took sounds like: the key going in, then what came of it. A wrong word with one try
 * left warns instead of failing; a bracket that does nothing is only the key.
 */
export function cuesForMove(m: Move, after: Played): [CrackCue, ...CrackCue[]] {
  if (after.state === 'granted') return ['guess', 'granted'];
  if (after.state === 'locked') return ['guess', 'locked'];
  const entry = after.log.at(-1);
  if ('word' in m) return ['guess', after.triesLeft === 1 ? 'last' : 'wrong'];
  if (entry?.reset) return ['guess', 'reset'];
  if (entry?.removed) return ['guess', 'dud'];
  return ['guess'];
}
