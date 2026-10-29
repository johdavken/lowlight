/**
 * Papers' sound (spec §9): one cue per desk action and per line of the walk-through, at the gig
 * cues' level, and an optional desk track while the run is up. A missing file is silent.
 */
import { GIG_CUE_LEVEL, GIG_MUSIC_LEVEL } from '../gig/sound';

export type PapersCueName = 'pick' | 'paper' | 'stamp' | 'note' | 'blind' | 'refuse' | 'slide' | 'check' | 'fail' | 'clean' | 'close' | 'back';

const NAMES: PapersCueName[] = ['pick', 'paper', 'stamp', 'note', 'blind', 'refuse', 'slide', 'check', 'fail', 'clean', 'close', 'back'];
export const PAPERS_CUE_URL = Object.fromEntries(NAMES.map((n) => [n, `/sound/papers/${n}.ogg`])) as Record<PapersCueName, string>;
export const PAPERS_CUE_LEVEL = GIG_CUE_LEVEL;
/** A desk track, if one is made (Suno); without it the gig track carries on. */
export const PAPERS_MUSIC_URL = '/sound/papers/desk.ogg';
export const PAPERS_MUSIC_LEVEL = GIG_MUSIC_LEVEL;

export function papersCuePlayer(audio: { cue(url: string, level?: number): void }): (name: PapersCueName) => void {
  return (name) => audio.cue(PAPERS_CUE_URL[name], PAPERS_CUE_LEVEL);
}
