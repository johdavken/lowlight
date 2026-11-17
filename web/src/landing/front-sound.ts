/**
 * The front end's own sounds (picked 2026-11-16 on the Front End Sounds audition; web/public/sound/front/): a key linked,
 * a model picked, the creator's GENERATE, its figure arriving and KEEP, and LOAD's STAR, RENAME, DELETE, BRANCH and a
 * save loaded (REWIND). Each screen says its moment; the landing sets what plays them once (a test hears nothing).
 */
export type FrontCue = 'link' | 'model' | 'generate' | 'figure' | 'keep' | 'star' | 'rename' | 'delete' | 'branch' | 'rewind';
let play: (n: FrontCue) => void = () => {};
export const frontCue = (n: FrontCue): void => play(n);
export function setFrontCue(fn: (n: FrontCue) => void): void {
  play = fn;
}
