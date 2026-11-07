/**
 * YOU, PEOPLE, TEXTS, QUEST, CREW, MAP and BOOK as one cycle (2026-10-18; CREW 2026-10-19; TEXTS 2026-10-29; QUEST 2026-11-02; BOOK
 * 2026-11-06), in the bar's order: Tab opens YOU, and with one of them open goes to the next (YOU → PEOPLE → TEXTS → QUEST → CREW → MAP →
 * BOOK → YOU, YOU's and PEOPLE's pages first, QUEST only while it's on the bar). Shift+Tab runs the other way, from BOOK with nothing open.
 * In the room Tab only ever does this, never walks the page's buttons, unless a field of its own has focus or something is over it (the
 * hack window, a menu, the bug report).
 */
export type CycleScreen = 'you' | 'people' | 'texts' | 'quest' | 'crew' | 'map' | 'book';
export const CYCLE: CycleScreen[] = ['you', 'people', 'texts', 'quest', 'crew', 'map', 'book'];

/** The next screen `dir` from `from` (null: nothing open, so the ring's first or last) that `shown` allows (all of them by default). */
export function nextScreen(from: CycleScreen | null, dir: 1 | -1, shown: (s: CycleScreen) => boolean = () => true): CycleScreen {
  let i = from === null ? (dir > 0 ? -1 : 0) : CYCLE.indexOf(from);
  for (let n = 0; n < CYCLE.length; n++) {
    i = (i + dir + CYCLE.length) % CYCLE.length;
    if (shown(CYCLE[i])) return CYCLE[i];
  }
  return from ?? CYCLE[0];
}

/** Listens for the cycle's Tab on `target`, in the capture phase; returns the remover. */
export function listenScreenCycle(
  target: Window,
  o: {
    /** The one that's open, or null. */
    current(): CycleScreen | null;
    /** With nothing open, whether Tab may open one. */
    canStart?(): boolean;
    /** Focus is in a field with a use for Tab (the chat box isn't one). */
    inField(): boolean;
    /** Something is over the screen and takes the keys. */
    blocked(): boolean;
    /** `dir`: 1 for Tab, -1 for Shift+Tab (YOU opens on its last page coming back). */
    go(s: CycleScreen, dir: 1 | -1): void;
    /** A screen's own pages come first (YOU's FILE → STATS → STREET → KIT): true when it turned one, so the cycle stays put. */
    turnPage?(cur: CycleScreen, dir: 1 | -1): boolean;
    /** Whether a screen is on the bar to go to (QUEST hides with nothing to list). */
    shown?(s: CycleScreen): boolean;
  },
): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    const cur = o.current();
    if ((!cur && !o.canStart?.()) || o.inField() || o.blocked()) return;
    e.preventDefault();
    e.stopPropagation();
    const dir = e.shiftKey ? -1 : 1;
    if (cur && o.turnPage?.(cur, dir)) return;
    o.go(nextScreen(cur, dir, o.shown), dir);
  };
  target.addEventListener('keydown', onKey, true);
  return () => target.removeEventListener('keydown', onKey, true);
}
