/**
 * The select's leaders (mockup frontend-hud.html B TRACE, playtest 2026-11-14): a fine line from each cursor's tile up
 * over the grid, across, and 45° onto its side's file, in 1P green or CPU pink. Drawn behind the tiles (select.css).
 */
import { clearLead, hostRect, traceVia, type Pt } from '../ui/trace-lead';

export type LeadPhase = 'p1' | 'you' | 'p2' | 'model' | 'ready' | string;

/** Which sides get a leader in a phase: the side choosing, and 1P once locked while 2P chooses. */
export function leadSides(phase: LeadPhase): ('p1' | 'p2')[] {
  if (phase === 'p1' || phase === 'you') return ['p1'];
  if (phase === 'p2') return ['p1', 'p2'];
  return [];
}

/** The corners for one side: up from the tile's top, across above the grid, then 45° onto the file's inner edge. */
export function pickLeadPoints(side: 'p1' | 'p2', tile: { left: number; top: number; width: number }, gridTop: number, file: { left: number; right: number }): Pt[] {
  const x = Math.round(tile.left + tile.width / 2);
  const across = Math.round(gridTop - (side === 'p1' ? 16 : 26));
  const end = side === 'p1' ? Math.round(file.right - 18) : Math.round(file.left + 18);
  const jog = side === 'p1' ? end + 22 : end - 22;
  return [
    [x, Math.round(tile.top - 4)],
    [x, across],
    [jog, across],
    [end, across - 22],
  ];
}

const COLOR = { p1: 'var(--p1, #3dff7a)', p2: 'var(--p2, #ff2bd6)' };

/** Draws (or clears) both leaders on the select stage for `phase`. */
export function drawSelectLeads(stage: HTMLElement, phase: LeadPhase): void {
  const sides = leadSides(phase);
  for (const side of ['p1', 'p2'] as const) {
    const key = `pick-${side}`;
    const cursor = stage.querySelector<HTMLElement>(`.grid .cursor.c${side === 'p1' ? 1 : 2}:not(.hide)`);
    const grid = stage.querySelector<HTMLElement>('.grid');
    const file = stage.querySelector<HTMLElement>(`.fighter.${side} .file-strip`);
    if (!sides.includes(side) || !cursor || !grid || !file) {
      clearLead(stage, key);
      continue;
    }
    const c = hostRect(stage, cursor);
    const g = hostRect(stage, grid);
    // A locked cursor scrolled out of the grid's window (2P's row took it): no line to a tile nobody can see.
    if (c.top < g.top - 1 || c.bottom > g.bottom + 1) {
      clearLead(stage, key);
      continue;
    }
    traceVia(stage, key, pickLeadPoints(side, c, g.top, hostRect(stage, file)), COLOR[side]);
  }
}

/**
 * Draws now, again once the grid's scroll has stepped into place (its 0.18 s transition), and once more after the
 * strips' 0.7 s glitch-in (it shifts them sideways while it plays). Returns a cancel.
 */
export function scheduleSelectLeads(stage: HTMLElement, phase: () => LeadPhase): () => void {
  const draw = () => drawSelectLeads(stage, phase());
  const raf = requestAnimationFrame(draw);
  const timers = [setTimeout(draw, 220), setTimeout(draw, 760)];
  return () => {
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
  };
}
