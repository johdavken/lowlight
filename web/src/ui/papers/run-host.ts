/** What a papers run hands back, and what the board does for it (it was the gig window's until the board, 2026-11-08). */
import type { GigResult } from '../../../../shared/gig/brief';

export interface RunEnd {
  result: GigResult;
  /** The desk's RISK. */
  meter: number;
  max: number;
  seed: number;
  /** Dev builds: the run's own line for the dev strip. */
  devLine?: string;
  /** The rule booth nine looked past (Papers spec §4.1). */
  papers?: { overlooked: number | null };
}

export interface RunHost {
  cue(name: string): void;
  /** An action was taken. */
  disarm(): void;
  /** The run's step may have changed (the desk to booth nine's read). */
  repaint(): void;
  ended(end: RunEnd, detail: string): void;
  dev: boolean;
  reducedMotion: boolean;
}
