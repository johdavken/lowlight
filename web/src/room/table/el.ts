/** The table's small DOM helper (one per room module, as the others do). */
export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** Written text with its *actions* in italics, as the quest panel shows it (the table's prose, the JOB column). */
export const proseNodes = (text: string): Node[] =>
  text.split(/\*([^*\n]+)\*/).flatMap((part, i) => (part === '' ? [] : [i % 2 === 1 ? el('em', '', part) : document.createTextNode(part)]));

/** The table's sounds (the hand spec §5): lift, commit, deal, face down, and a card turning face up. */
export type TableCue = 'move' | 'confirm' | 'beat' | 'lock' | 'flip';
/** A card turning face up (picked 2026-10-31 on the Graft Table Sounds audition; sources in `sounds/CREDITS.md`). */
export const FLIP_CUE_URL = '/sound/table/flip.ogg';
/** The hand's deal-in (table.css `tb-flip-in`): each card starts this much after the one before, and turns over this far in. */
export const DEAL_STAGGER_MS = 140;
export const FLIP_AT_MS = Math.round(620 * 0.55);

/** Phone layout below this width (the hand spec §5). */
export const PHONE_WIDTH = 768;
/**
 * Whether the table lays out for a phone: by its host's own width, so inside the game's fixed 1600×900 stage
 * (zoomed to fit any screen) it never does; the window's width only when the host isn't laid out.
 */
export const isPhone = (host?: HTMLElement | null) => (host?.clientWidth || window.innerWidth) < PHONE_WIDTH;
