/**
 * Job texts (spec 2026-11-09 §3): on every clock move, each contact's own `text:` job whose gate has opened goes out
 * as her text, once, while you're apart and she's awake. With her, her next turn raises it instead (the relay's room
 * line), so the checker leaves it. Nothing runs between clock moves: no background spend.
 */
import { toldKey, type Told } from '../../shared/quests';
import { PROMISE_TRIES } from '../../shared/promise';

type MetaStore = { getMeta(k: string): string | null; setMeta(k: string, v: string): void };

export interface JobTextCheckerDeps {
  /** The active playthrough's player; null with no save. */
  active(): { player: string } | null;
  now(): number | null;
  /** Contacts who send at least one `text:` job in the book. */
  senders(): string[];
  /** A contact the player knows. */
  known(id: string): boolean;
  /** Her own gated, untold, unstarted `text:` jobs for `player`, in book order. */
  due(id: string, player: string): Promise<{ id: string; title: string; text: string }[]>;
  /** One meta value from her db, read without starting her runtime. */
  read(id: string, key: string): string | null;
  /** Her db for writes; null when she can't be reached. */
  store(id: string): Promise<MetaStore | null>;
  /** Whether you're with her now (in her room, or on a call). */
  withYou(id: string): boolean;
  awake(id: string, clock: number): boolean;
  /** A job table is up (any run standing at a beat). */
  tableUp(): boolean;
  /** Queues her job text; resolves true when it was sent. */
  fire(id: string, o: { job: string; text: string; due: number }): Promise<boolean>;
  log(line: string): void;
}

/** Not story meta: a rewind leaves them. */
export const toldSeededKey = (player: string) => `toldseeded.${player}`;
export const jobTextTriesKey = (player: string, job: string) => `jobtexttries.${player}.${job}`;

export function createJobTextChecker(deps: JobTextCheckerDeps): { check(): Promise<void> } {
  let running = false;
  let again = false;
  // A sender whose text is in flight: the next clock move mustn't send it again.
  const sending = new Set<string>();

  async function tell(id: string, player: string, job: string, now: number, why: string): Promise<void> {
    const db = await deps.store(id);
    db?.setMeta(toldKey(player, job), JSON.stringify({ how: 'silent', at: now } satisfies Told));
    deps.log(`${id} · ${job} told silent ${why}`);
  }

  async function pass(): Promise<void> {
    const pt = deps.active();
    const now = deps.now();
    if (!pt || now === null) return;
    for (const id of deps.senders()) {
      if (sending.has(id)) continue;
      const due = await deps.due(id, pt.player);
      // An old save already past a gate (spec §2): those jobs post as they did, untexted.
      if (deps.read(id, toldSeededKey(pt.player)) === null) {
        for (const d of due) await tell(id, pt.player, d.id, now, '(already open before job texts)');
        (await deps.store(id))?.setMeta(toldSeededKey(pt.player), String(now));
        continue;
      }
      if (due.length === 0) continue;
      // A contact you haven't met can't text you: her jobs post as they always have.
      if (!deps.known(id)) {
        for (const d of due) await tell(id, pt.player, d.id, now, "(you haven't met her)");
        continue;
      }
      if (deps.withYou(id) || !deps.awake(id, now) || deps.tableUp()) continue;
      const job = due[0];
      const tries = Number(deps.read(id, jobTextTriesKey(pt.player, job.id)) ?? 0) || 0;
      if (tries >= PROMISE_TRIES) {
        await tell(id, pt.player, job.id, now, `after ${PROMISE_TRIES} tries`);
        continue;
      }
      (await deps.store(id))?.setMeta(jobTextTriesKey(pt.player, job.id), String(tries + 1));
      sending.add(id);
      void deps
        .fire(id, { job: job.id, text: job.text, due: now })
        .catch(() => false)
        .finally(() => sending.delete(id));
    }
  }

  return {
    async check() {
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        do {
          again = false;
          try {
            await pass();
          } catch (err) {
            deps.log(`job texts · check failed: ${(err as Error).message}`);
          }
        } while (again);
      } finally {
        running = false;
      }
    },
  };
}
