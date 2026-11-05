/**
 * The gig window's sound (spec §9): its open and close cues, at the page swap's level, and its music
 * (the "Fast Drying Lacquer" song, which the job table plays too). The desk's own cues are papers/sound.ts.
 * A missing file is silent: the engine drops it.
 */
export type GigCueName = 'jack-in' | 'jack-out';

const NAMES: GigCueName[] = ['jack-in', 'jack-out'];
export const GIG_CUE_URL = Object.fromEntries(NAMES.map((n) => [n, `/sound/gig/${n}.ogg`])) as Record<GigCueName, string>;
/** The map's page swap level (0.9 under the room's 0.25 UI scale), raised about 3 dB: the window is in front. */
export const GIG_CUE_LEVEL = 0.9 * 0.25 * 1.4;
/**
 * Loops while the gig window is up; the room's song comes back when it closes. Foreground,
 * like the title theme: the file is mastered at −16 LUFS (as the theme is) and plays at 0.7, well over
 * a room song (−22.4 LUFS at 0.3) and the room's ambience.
 */
export const GIG_MUSIC_URL = '/sound/gig/fast-drying-lacquer.ogg';
export const GIG_MUSIC_LEVEL = 0.7;
/** The Graft table's own track ("On The Wire", 2026-11-02): mastered and played like the gig track; the board keeps that one. */
export const TABLE_MUSIC_URL = '/sound/gig/on-the-wire.ogg';

export function gigCuePlayer(audio: { cue(url: string, level?: number): void }): (name: GigCueName) => void {
  return (name) => audio.cue(GIG_CUE_URL[name], GIG_CUE_LEVEL);
}
