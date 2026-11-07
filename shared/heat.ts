/** What a district's heat does to you there: one list for the debrief, the HEAT tip and STREET. */
import { errandHeatCut } from './crew';
import { EFFECT_HEAT } from './dice';
import { FAVOUR_HEAT } from './hand';

/** From here ten jobs open on their `if heat>=4` beat: a warier scene, usually with harder checks. */
export const WARY_HEAT = 4;

/** The penalties in force at `heat`, worst first; empty below WARY_HEAT. */
export function heatEffects(heat: number): string[] {
  const cut = errandHeatCut(heat);
  return [
    ...(heat >= EFFECT_HEAT ? ['ROLLS A STEP SMALLER'] : []),
    ...(heat >= FAVOUR_HEAT ? ['NO FAVOURS'] : []),
    ...(cut ? [`ERRANDS −${cut} %`] : []),
    ...(heat >= WARY_HEAT ? ['SOME JOBS OPEN WARIER'] : []),
  ];
}
