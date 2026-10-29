/**
 * Click away to close (spec 2026-10-15): a pointerdown outside a panel closes it, as the map's
 * backdrop closes the map. Pointerdowns on the top bar, SYS, the MODEL menu, the bug report or the
 * dev panel are left to them (the bar's buttons already switch screens; the report sits over
 * everything; the dev panel is used alongside the room's panels).
 */
const LEFT_ALONE = '.hud-bar, .sys-menu, .model-menu, .bug-report, .devpanel';

/** Calls `away` on a pointerdown outside `inside` (capture phase, on the document). Returns the remover. */
export function onClickAway(inside: (n: Node) => boolean, away: () => void): () => void {
  const onDown = (e: Event) => {
    const t = e.target;
    if (!(t instanceof Node) || inside(t)) return;
    if (t instanceof Element && t.closest(LEFT_ALONE)) return;
    away();
  };
  document.addEventListener('pointerdown', onDown, true);
  return () => document.removeEventListener('pointerdown', onDown, true);
}
