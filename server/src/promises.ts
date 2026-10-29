/**
 * Promised texts (spec 2026-10-23 §5): on every clock move, each contact's promise to text is checked; a due one is
 * sent once, through the deck's queue. Nothing runs between clock moves: no background spend.
 */
import { hhmmOf, minuteOfDay } from '../../shared/clock';
import { parsePromise, promiseDue, promiseExpired, promiseKey, promiseSpentKey, promiseTriesKey, PROMISE_TRIES } from '../../shared/promise';

type MetaStore = { getMeta(k: string): string | null; setMeta(k: string, v: string): void; deleteMeta(k: string): void };

export interface PromiseCheckerDeps {
  /** The active playthrough's player; null with no save. */
  active(): { player: string } | null;
  now(): number | null;
  /** The minded contacts the player knows. */
  contacts(): string[];
  /** One meta value from her db, read without starting her runtime. */
  read(id: string, key: string): string | null;
  /** Her db for writes (starts her runtime); null when she can't be reached. */
  store(id: string): Promise<MetaStore | null>;
  /** Whether you're with her now (in her room, or on a call). */
  withYou(id: string): boolean;
  /** When you last parted from her; a place promise scans from then (deck controls spec §3.3). */
  partedAt?(id: string): number | null;
  /** Where the world places her at `clock` (her plan, where you left her, her schedule). */
  placeAt(id: string, clock: number): string | null;
  placeName(sceneId: string): string;
  /** Queues her promised text; resolves true when it was sent. */
  fire(id: string, o: { about: string; due: number; where: string; place: string; from: string }): Promise<boolean>;
  log(line: string): void;
}

export function createPromiseChecker(deps: PromiseCheckerDeps): { check(): Promise<void> } {
  let running = false;
  let again = false;
  // A promise being sent: the next clock move mustn't send it again (Review Focus 2).
  const sending = new Set<string>();

  async function pass(): Promise<void> {
    const pt = deps.active();
    const now = deps.now();
    if (!pt || now === null) return;
    for (const id of deps.contacts()) {
      if (sending.has(id)) continue;
      const p = parsePromise(deps.read(id, promiseKey(pt.player)));
      if (!p) continue;
      const drop = async (why: string) => {
        const db = await deps.store(id);
        db?.deleteMeta(promiseKey(pt.player));
        db?.deleteMeta(promiseTriesKey(pt.player));
        deps.log(`${id} · promise to text dropped ${why}`);
      };
      // Her text for it was rewound or deleted: it's spent for good (deck controls spec §3.6); its day still ends it.
      if (deps.read(id, promiseSpentKey(pt.player)) === p.from) {
        if (promiseExpired(p, now)) await drop('(spent; a story day passed)');
        continue;
      }
      const due = promiseDue(p, now, (t) => deps.placeAt(id, t), deps.partedAt?.(id) ?? p.since);
      // A long WAIT past one that came due inside its day still sends it, stamped then (mid review M3).
      if (due === null || promiseExpired(p, due)) {
        if (promiseExpired(p, now)) await drop('(a story day passed)');
        continue;
      }
      // You're right there: there's nothing to text (spec §2).
      if (deps.withYou(id)) {
        await drop("(you're with her)");
        continue;
      }
      // Tries count for this promise only (deck controls spec §3.2).
      const counted = (() => {
        try {
          return JSON.parse(deps.read(id, promiseTriesKey(pt.player)) ?? 'null') as { from?: string; n?: number } | null;
        } catch {
          return null;
        }
      })();
      const tries = counted?.from === p.from ? (counted.n ?? 0) : 0;
      if (tries >= PROMISE_TRIES) {
        await drop(`after ${PROMISE_TRIES} tries`);
        continue;
      }
      const db = await deps.store(id);
      db?.setMeta(promiseTriesKey(pt.player), JSON.stringify({ from: p.from, n: tries + 1 }));
      const at = deps.placeAt(id, due);
      const place = at ? deps.placeName(at) : 'where you are';
      const where = 'at' in p.when ? `it's ${hhmmOf(minuteOfDay(due))}` : `you're at ${place} now`;
      sending.add(id);
      void deps
        .fire(id, { about: p.about, due, where, place, from: p.from })
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
            deps.log(`promises · check failed: ${(err as Error).message}`);
          }
        } while (again);
      } finally {
        running = false;
      }
    },
  };
}
