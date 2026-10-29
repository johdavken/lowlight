/** Slip boards off the main thread (Slip spec §3.4): a hard board can take a few hundred ms to solve. */
import type { Tier } from '../../../../shared/gig/rules';
import { generateSlip } from '../../../../shared/slip/generate';

const post = (self as unknown as { postMessage(m: unknown): void }).postMessage.bind(self);
self.onmessage = (e: MessageEvent<{ id: number; tier: Tier; seed: number }>) => {
  const { id, tier, seed } = e.data;
  try {
    post({ id, board: generateSlip(tier, seed) });
  } catch {
    post({ id, board: null });
  }
};
