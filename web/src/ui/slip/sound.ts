/**
 * Slip's sound (spec §7): one cue per kind of turn event, at the gig cues' level, and the floor's
 * own track (the "Glass Floor" song) while a slip runs. A missing file is silent: the engine drops it.
 */
import { GIG_CUE_LEVEL, GIG_MUSIC_LEVEL } from '../gig/sound';

export type SlipCueName = 'step' | 'wait' | 'noise' | 'jam' | 'spotted' | 'hide' | 'lift' | 'clean' | 'close' | 'caught';

const NAMES: SlipCueName[] = ['step', 'wait', 'noise', 'jam', 'spotted', 'hide', 'lift', 'clean', 'close', 'caught'];
export const SLIP_CUE_URL = Object.fromEntries(NAMES.map((n) => [n, `/sound/slip/${n}.ogg`])) as Record<SlipCueName, string>;
export const SLIP_CUE_LEVEL = GIG_CUE_LEVEL;
/** Mastered like "Fast Drying Lacquer" (−16 LUFS) and played at the same level. */
export const SLIP_MUSIC_URL = '/sound/slip/glass-floor.ogg';
export const SLIP_MUSIC_LEVEL = GIG_MUSIC_LEVEL;

export function slipCuePlayer(audio: { cue(url: string, level?: number): void }): (name: SlipCueName) => void {
  return (name) => audio.cue(SLIP_CUE_URL[name], SLIP_CUE_LEVEL);
}
