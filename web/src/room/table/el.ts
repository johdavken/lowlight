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
/** `count` and `result`: the deduction board's 3, 2, 1 (a deep bass hit, louder each beat) and its verdict landing (silent until its sound exists). */
export type TableCue = 'move' | 'confirm' | 'beat' | 'lock' | 'flip' | 'count' | 'result' | GraftCue;
/** The boards, the route and the debrief (picked 2026-11-16 on the Graft Boards audition): a deduction put in its blank, a
 * pair's count landing right or wrong, patience dropping, ACCUSE; a card given and TELL on the accounts board; the route
 * forking and a recruit sent to a post; the pay counting up and YOU KEEP; a tip showing. */
export const BOARD_CUES = ['filed', 'verdict-right', 'verdict-wrong', 'patience', 'accuse', 'give', 'tell', 'fork', 'post', 'pay', 'keep', 'tip'] as const;
/** Those moments sound from where they happen (the boards, the debrief, the tips); the page sets what plays them once. */
let playGraft: (n: (typeof BOARD_CUES)[number]) => void = () => {};
export const graftCue = (n: (typeof BOARD_CUES)[number]): void => playGraft(n);
export function setGraftCue(fn: (n: (typeof BOARD_CUES)[number]) => void): void {
  playGraft = fn;
}
/** Graft's own moments (picked 2026-11-16 on the Graft Sounds audition; sources in `sounds/CREDITS.md`), each a file in
 * `web/public/sound/table/`: the table up and cleared, SETUP's program, recruit and READY, a call picked, PUSH, an ability,
 * a program run, the TAKE clock's step, a cost resisted, firewalled or taken, PRESS ON and WALK. */
export const GRAFT_CUES = ['up', 'clear', 'load', 'crew', 'go', 'call', 'push', 'ability', 'program', 'clock', 'resist', 'firewall', 'take', 'press-on', 'walk', ...BOARD_CUES] as const;
export type GraftCue = (typeof GRAFT_CUES)[number];
/** A card turning face up (picked 2026-10-31 on the Graft Table Sounds audition; sources in `sounds/CREDITS.md`). */
export const FLIP_CUE_URL = '/sound/table/flip.ogg';
/** The deduction board's count: one bass hit per number (playtest pick 2026-11-12; source in `sounds/CREDITS.md`). */
export const COUNT_CUE_URL = '/sound/table/count.ogg';
/** Its level on 3, 2 and 1, against the table's other cues: louder with each beat, twice their level on the last (playtest: louder, 2026-11-12). */
export const countLevel = (n: number): number => 2 * (n >= 3 ? 0.45 : n === 2 ? 0.7 : 1);
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
