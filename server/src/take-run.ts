/**
 * The TAKE clock (the table spec §2): how much of the job you got. Rolls fill it as they land; at the job's own end
 * it sets the pay (the written pay × TAKE ÷ its size, rounded to 10) and caps a full take at part when short.
 */
import { jobTakeSize } from '../../shared/dice';
import type { KitEvent } from '../../shared/mission';
import type { QuestEntry, QuestRun } from '../../shared/quests';

/** TAKE filled so far: a run from before the table counts one per pick made. */
export const takeOf = (run: QuestRun, q: Pick<QuestEntry, 'tier' | 'takeSize'>): number => Math.min(jobTakeSize(q), run.takeFill ?? run.picks.length);

/** The written pay the job's outcomes have paid: kept on the run, or (before the table) the sol its kit holds. */
export const ceilingOf = (run: QuestRun): number => run.payCeiling ?? (run.kit ?? []).reduce((n, e) => n + Math.max(0, e.sol ?? 0), 0);

/**
 * The pay settled at the job's own end: one sol event scaling the written pay by TAKE, and the take it leaves.
 * `unpaid` is the pay to scale when no outcome paid at all (a GET OUT before the job's paying outcome: the drawn pay).
 */
export function settleTake(run: QuestRun, q: Pick<QuestEntry, 'tier'>, at: number, unpaid = 0): { events: KitEvent[]; take: 'full' | 'part' | 'none' } {
  const size = jobTakeSize(q);
  const fill = takeOf(run, q);
  const paid = ceilingOf(run);
  const ceiling = paid > 0 ? paid : unpaid;
  // AT THE END: a cooling fence takes its share first (ability pass spec §2).
  // Cut a Deal sells what's there as all of it (tier 3 beat play spec §2).
  const scaled = Math.round((ceiling * (run.setup?.payFull ? size : fill) * (100 - (run.setup?.payCut ?? 0))) / 100 / size / 10) * 10;
  const take0 = run.take ?? 'full';
  return { events: scaled !== paid ? [{ at, sol: scaled - paid }] : [], take: take0 === 'full' && fill < size ? 'part' : take0 };
}
