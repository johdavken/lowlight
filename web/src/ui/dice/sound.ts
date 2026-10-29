/**
 * Liar's dice's sound (spec §7): one cue per moment at the table, at the gig cues' level. The tray
 * says `dice:<name>`; a missing file is silent (the engine drops it).
 */
import { GIG_CUE_LEVEL } from '../gig/sound';

export type DiceCueName = 'roll' | 'bid' | 'liar' | 'reveal' | 'lose-die' | 'win' | 'lose';

const NAMES: DiceCueName[] = ['roll', 'bid', 'liar', 'reveal', 'lose-die', 'win', 'lose'];
export const DICE_CUE_URL = Object.fromEntries(NAMES.map((n) => [n, `/sound/dice/${n}.ogg`])) as Record<DiceCueName, string>;
export const DICE_CUE_LEVEL = GIG_CUE_LEVEL;

/** Plays the tray's `dice:<name>` cues; anything else is left alone. */
export function diceCuePlayer(audio: { cue(url: string, level?: number): void }): (name: string) => void {
  return (name) => {
    const n = name.startsWith('dice:') ? name.slice(5) : '';
    if (n in DICE_CUE_URL) audio.cue(DICE_CUE_URL[n as DiceCueName], DICE_CUE_LEVEL);
  };
}
