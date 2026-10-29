/**
 * The room's deals (encounter cards): one narrator call at a time, outliving the panel that asked
 * for it — Esc while it deals, then DRAW again, waits on the same call instead of paying for a
 * second. A finished set is kept for the next DRAW until the moment changes (`clear`).
 */
import type { Encounter } from '../../../shared/encounter';

export interface Dealer {
  /** The running deal, or a new one. */
  load(): Promise<Encounter[]>;
  /** The last set dealt for this moment; null when there's none. */
  readonly cached: Encounter[] | null;
  /** A new turn or a move: the set (and any deal still running) no longer fits. */
  clear(): void;
}

export function createDealer(deal: () => Promise<Encounter[]>): Dealer {
  let running: Promise<Encounter[]> | null = null;
  let cached: Encounter[] | null = null;
  /** Bumped by clear: a deal from before it isn't kept. */
  let moment = 0;
  return {
    load() {
      if (running) return running;
      const at = moment;
      const call = deal().then(
        (set) => {
          if (at === moment) cached = set;
          return set;
        },
        (err: unknown) => {
          throw err;
        },
      );
      const settled = () => {
        if (running === call) running = null;
      };
      call.then(settled, settled);
      running = call;
      return call;
    },
    get cached() {
      return cached;
    },
    clear() {
      moment++;
      cached = null;
      running = null;
    },
  };
}
