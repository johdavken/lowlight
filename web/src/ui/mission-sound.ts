/**
 * Jobs' sound (small jobs spec §6): one cue per moment of a check, a beat and the debrief, at the gig
 * cues' level. The author picked them in the Check Feel audition (2026-10-19); sources in `sounds/CREDITS.md`.
 * Four reuse the game's own cues; the roll and the beat are Graft's table sounds. A missing file is silent (the engine drops it).
 */
import { GIG_CUE_LEVEL } from './gig/sound';

export type MissionCue = 'lock' | 'tick' | 'land-crit' | 'land-clean' | 'land-cost' | 'land-miss' | 'reroll' | 'dies' | 'heat' | 'sol' | 'red' | 'hover' | 'start' | 'beat' | 'alarm' | 'deck' | 'edge' | 'clean' | 'messy' | 'blown' | 'tap' | 'glitch';

const OWN: MissionCue[] = ['reroll', 'dies', 'heat', 'sol', 'red', 'start', 'alarm', 'deck', 'edge', 'messy'];
export const MISSION_CUE_URL: Record<MissionCue, string> = {
  ...(Object.fromEntries(OWN.map((n) => [n, `/sound/mission/${n}.ogg`])) as Record<MissionCue, string>),
  lock: '/sound/gig/select.ogg',
  hover: '/sound/ui/move.ogg',
  clean: '/sound/gig/clean.ogg',
  blown: '/sound/mission/blown.ogg',
  // Graft's table (picked 2026-10-31 on the Graft Table Sounds audition): the dice tumble, and a new beat's cards dealt.
  // The tumble was re-picked 2026-11-02 with the pixel dice, and a die's knock on each bounce (Dice Rolls mockup).
  tick: '/sound/table/roll.ogg',
  tap: '/sound/table/tap.ogg',
  // The dice landing, one per result (picked 2026-11-02 on the Dice Landing Sounds audition; were mission/pass and fail).
  'land-crit': '/sound/table/crit.ogg',
  'land-clean': '/sound/table/clean.ogg',
  'land-cost': '/sound/table/cost.ogg',
  'land-miss': '/sound/table/miss.ogg',
  beat: '/sound/table/deal.ogg',
  // A save glitching a waiting miss to a cost: the game's own glitch (the page swap), then land-cost.
  glitch: '/sound/ui/page-swap.ogg',
};
/** Hovering plays most, so it sits lower; a die's knock sits under the tumble (the mix picked on the mockup). */
const level = (n: MissionCue) => (n === 'hover' ? GIG_CUE_LEVEL * 0.5 : n === 'tap' ? GIG_CUE_LEVEL * 0.6 : GIG_CUE_LEVEL);

/** A die's tap knocks over the others (they overlap), at `o.level` of the cue level and `o.rate`. */
export function missionCuePlayer(audio: {
  cue(url: string, level?: number, o?: { rate?: number; overlap?: boolean }): void;
}): (name: MissionCue, o?: { level: number; rate: number }) => void {
  return (name, o) => (o ? audio.cue(MISSION_CUE_URL[name], level(name) * o.level, { rate: o.rate, overlap: true }) : audio.cue(MISSION_CUE_URL[name], level(name)));
}
