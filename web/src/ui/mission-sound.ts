/**
 * Jobs' sound (small jobs spec §6): one cue per moment of a check, a beat and the debrief, at the gig
 * cues' level. The author picked them in the Check Feel audition (2026-10-19); sources in `sounds/CREDITS.md`.
 * Six reuse the game's own cues. A missing file is silent (the engine drops it).
 */
import { GIG_CUE_LEVEL } from './gig/sound';

export type MissionCue = 'lock' | 'tick' | 'pass' | 'fail' | 'reroll' | 'dies' | 'heat' | 'sol' | 'red' | 'hover' | 'start' | 'beat' | 'alarm' | 'deck' | 'edge' | 'clean' | 'messy' | 'blown';

const OWN: MissionCue[] = ['tick', 'pass', 'fail', 'reroll', 'dies', 'heat', 'sol', 'red', 'start', 'beat', 'alarm', 'deck', 'edge', 'messy'];
export const MISSION_CUE_URL: Record<MissionCue, string> = {
  ...(Object.fromEntries(OWN.map((n) => [n, `/sound/mission/${n}.ogg`])) as Record<MissionCue, string>),
  lock: '/sound/gig/select.ogg',
  hover: '/sound/ui/move.ogg',
  clean: '/sound/gig/clean.ogg',
  blown: '/sound/slip/caught.ogg',
};
/** Hovering plays most, so it sits lower. */
const level = (n: MissionCue) => (n === 'hover' ? GIG_CUE_LEVEL * 0.5 : GIG_CUE_LEVEL);

export function missionCuePlayer(audio: { cue(url: string, level?: number): void }): (name: MissionCue) => void {
  return (name) => audio.cue(MISSION_CUE_URL[name], level(name));
}
