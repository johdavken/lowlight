/** Test helpers for a costly roll's dealt costs (roll lifecycle spec §1). */
import { COSTS, type CostId } from '../../shared/costs';
import { parseRun, type DicePending } from '../../shared/quests';
import type { ChatRelay } from '../src/chat-relay';
import type { Db } from '../src/db';

/**
 * A dealt roll settled in the old rules' spirit: the approach's first cost, ALARM, HEAT, then the rest, all taken. Undefined when nothing
 * waits.
 */
export async function settleLikeOld(relay: ChatRelay, id: string, beat: string) {
  const costs = relay.questState('hicks').active?.costs;
  if (!costs) return undefined;
  const order: CostId[] = ['alarm', 'heat', 'worse', 'small', 'take'];
  const rank = (c: (typeof costs.dealt)[number]) => (c.first ? -1 : order.indexOf(c.cost));
  const picks = [...costs.dealt].sort((a, b) => rank(a) - rank(b)).map((c) => c.cost).slice(0, costs.pick);
  for (const c of picks) await relay.chooseQuest('hicks', { id, beat, choice: '!cost', card: c });
  return relay.chooseQuest('hicks', { id, beat, choice: '!take' });
}

/** Rewrites the waiting roll's deal to `costs` (as tests rewrite runs), its pick count `pick` (default: as many). */
export function dealAs(db: Db, key: string, costs: CostId[], pick = costs.length): void {
  const run = parseRun(db.getMeta(key))!;
  const p = run.pending as DicePending;
  db.setMeta(key, JSON.stringify({ ...run, pending: { ...p, dealt: costs.map((c) => ({ cost: c, line: COSTS[c].tag, by: 'written' })), pick, settled: [] } }));
}
