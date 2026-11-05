/**
 * A run inside the gig window (Slip spec §4.1). The window owns the frame, the jobs screen, the
 * result screen and the send; a run screen owns its board, side column, keys and dev buttons, and
 * hands back a RunEnd when it's over. Papers' desk is the only one since hack and slip went (2026-11-01).
 */
import type { GigResult } from '../../../../shared/gig/brief';

export interface RunEnd {
  result: GigResult;
  /** The desk's RISK. */
  meter: number;
  max: number;
  seed: number;
  /** Dev builds: the run's own line for the dev strip on the result screen. */
  devLine?: string;
  /** Papers: the rule booth nine looked past (Papers spec §4.1). */
  papers?: { overlooked: number | null };
}

/** What the window does for a run. */
export interface RunHost {
  cue(name: string): void;
  /** An action was taken: the Esc prompt goes away. */
  disarm(): void;
  /** The title bar's step may have changed. */
  repaint(): void;
  ended(end: RunEnd, detail: string): void;
  /** The board never came: the window's "won't resolve" screen. */
  failed(): void;
  /** Dev strip: NEW BOARD / RERUN SAME BOARD, the same job on this seed. */
  restart(seed: number): void;
  dev: boolean;
  reducedMotion: boolean;
}

export interface RunScreen {
  mount(view: HTMLElement, devStrip: HTMLElement | null): void;
  /** A keydown while the run is up; true when it was the run's. Esc goes to `escape` instead. */
  key(e: KeyboardEvent): boolean;
  /** Esc: true when the run used it, so the window doesn't ask to walk away. */
  escape(): boolean;
  /** The title bar's step, e.g. 'EASY'. */
  step(): string;
  destroy(): void;
}

/** A window button: a click never reaches the room, and a disabled one does nothing. */
export function button(text: string, cls: string, run: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = text;
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!b.disabled) run();
  });
  return b;
}
