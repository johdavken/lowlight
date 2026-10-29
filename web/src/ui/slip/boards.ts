/**
 * Where Slip boards come from in the window (Slip spec §3.4): a module worker in the browser, so a
 * slow hard board never freezes the window; the generator itself where there's no Worker (tests).
 * A seed that won't resolve moves on to the next, as the hack's do: six tries, then null.
 */
import type { Tier } from '../../../../shared/gig/rules';
import { generateSlip } from '../../../../shared/slip/generate';
import type { SlipBoard } from '../../../../shared/slip/rules';

export type SlipGen = (tier: Tier, seed: number) => Promise<SlipBoard | null>;
/** A board source the window owns: `dispose` stops its worker (pending requests settle null). */
export type SlipBoards = SlipGen & { dispose(): void };
const SEED_TRIES = 6;

type Waiting = Map<number, (board: SlipBoard | null) => void>;

const here = (t: Tier, s: number) => Promise.resolve(generateSlip(t, s));

/** One board at a time from a module worker; if the worker fails (its chunk won't load, it throws), what's pending settles null and the rest are made here. */
function workerGen(): { one: (tier: Tier, seed: number) => Promise<SlipBoard | null>; stop(): void } | null {
  if (typeof Worker === 'undefined') return null;
  let worker: Worker;
  try {
    worker = new Worker(new URL('./generate.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
  const waiting: Waiting = new Map();
  let next = 1;
  let broken = false;
  const settleAll = () => {
    for (const done of waiting.values()) done(null);
    waiting.clear();
  };
  worker.onmessage = (e: MessageEvent<{ id: number; board: SlipBoard | null }>) => {
    const done = waiting.get(e.data.id);
    waiting.delete(e.data.id);
    done?.(e.data.board);
  };
  worker.onerror = () => {
    broken = true;
    worker.terminate();
    settleAll();
  };
  return {
    one: (tier, seed) =>
      broken
        ? here(tier, seed)
        : new Promise((resolve) => {
            const id = next++;
            waiting.set(id, resolve);
            worker.postMessage({ id, tier, seed });
          }),
    stop: () => {
      worker.terminate();
      settleAll();
    },
  };
}

/** `gen` replaces the worker (tests). */
export function slipBoards(gen?: (tier: Tier, seed: number) => SlipBoard | null): SlipBoards {
  const w = gen ? null : workerGen();
  const one = gen ? (t: Tier, s: number) => Promise.resolve(gen(t, s)) : (w?.one ?? here);
  let disposed = false;
  const get = async (tier: Tier, seed: number) => {
    for (let k = 0; k < SEED_TRIES && !disposed; k++) {
      const board = await one(tier, (seed + k) >>> 0);
      if (board) return board;
    }
    return null;
  };
  return Object.assign(get, {
    dispose: () => {
      disposed = true;
      w?.stop();
    },
  });
}
