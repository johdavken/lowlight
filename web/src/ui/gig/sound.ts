/**
 * Gig runs' sound (spec §9): one deck cue per event, at the page swap's level, and the hack
 * window's music (the "Fast Drying Lacquer" song). A missing file is silent: the engine drops it.
 */
import type { Cue } from '../../../../shared/gig/rules';

export type GigCueName = Cue | 'jack-in' | 'select' | 'jack-out';

const NAMES: GigCueName[] = ['jack-in', 'select', 'probe', 'enter', 'breach', 'trap', 'cache', 'key', 'watch', 'pull', 'clean', 'close', 'traced', 'jack-out'];
export const GIG_CUE_URL = Object.fromEntries(NAMES.map((n) => [n, `/sound/gig/${n}.ogg`])) as Record<GigCueName, string>;
/** The map's page swap level (0.9 under the room's 0.25 UI scale), raised about 3 dB: the deck is in front. */
export const GIG_CUE_LEVEL = 0.9 * 0.25 * 1.4;
/**
 * Loops while the hack window is open; the room's song comes back when it closes. Foreground, like
 * the title theme: the file is mastered at −16 LUFS (as the theme is) and plays at 0.7, well over
 * a room song (−22.4 LUFS at 0.3) and the room's ambience. Raised with the cues (about 3 dB) together.
 */
export const GIG_MUSIC_URL = '/sound/gig/fast-drying-lacquer.ogg';
export const GIG_MUSIC_LEVEL = 0.7;

export function gigCuePlayer(audio: { cue(url: string, level?: number): void }): (name: GigCueName) => void {
  return (name) => audio.cue(GIG_CUE_URL[name], GIG_CUE_LEVEL);
}
