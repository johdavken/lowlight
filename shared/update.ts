/**
 * The title screen's UPDATE (plan 2026-11-08): a clone of the public repo learns public main has moved on, and
 * `npm run play` (tools/play.ts) pulls it in. Shared by the server's route and the title.
 */

/** The server exits with this when the player pressed UPDATE; the launcher then updates and starts it again. */
export const UPDATE_EXIT = 75;

/** Why UPDATE can't run from the game: the clone has its own commits, edits the update touches, or no launcher. */
export type UpdateReason = 'diverged' | 'local-edits' | 'launcher';

export interface UpdateStatus {
  /** Public main has commits this checkout lacks. */
  available: boolean;
  /** How many. */
  behind: number;
  /** The newest of them (ms), null when unknown. */
  newestAt: number | null;
  /** Changed files by where they live: characters/, scenes/ (rooms), world/, and everything else (code). */
  areas: { characters: number; rooms: number; world: number; code: number };
  /** package-lock.json changes, so the update runs npm ci (a few minutes). */
  needsPackages: boolean;
  canApply: boolean;
  reason?: UpdateReason;
  /** For `local-edits`: the player's edited files the update also changes. */
  files?: string[];
}

/** What the launcher wrote after its last update (data/update-result.json). */
export interface UpdateResult {
  ok: boolean;
  from: string;
  to: string;
  /** ms */
  at: number;
  error?: string;
}

/** GET /api/update. Not eligible (not a public clone on main): nothing else. */
export interface UpdateInfo {
  eligible: boolean;
  status?: UpdateStatus;
  last?: UpdateResult | null;
}
