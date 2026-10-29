/**
 * The menus' cues (title, LOAD, the select screen, `/solo`), one set so every menu sounds alike.
 * Picked by Farban from an audition (2026-10-12); sources in `sounds/CREDITS.md`.
 */
export type MenuCue = 'move' | 'confirm' | 'lock' | 'vs' | 'save';

export const MENU_CUE_URL: Record<MenuCue, string> = {
  move: '/sound/ui/move.ogg',
  confirm: '/sound/ui/confirm.ogg',
  lock: '/sound/ui/lock.ogg',
  vs: '/sound/ui/vs.ogg',
  save: '/sound/ui/save.ogg',
};

/** Levels under the landing's 0.25 audio scale, beside the page swap's 0.9; the cursor step plays most, so it sits lower. */
export const MENU_CUE_LEVEL: Record<MenuCue, number> = { move: 0.6, confirm: 0.9, lock: 0.9, vs: 0.9, save: 0.9 };

export function menuCuePlayer(audio: { cue(url: string, level?: number): void }): (cue: MenuCue) => void {
  return (cue) => audio.cue(MENU_CUE_URL[cue], MENU_CUE_LEVEL[cue]);
}
