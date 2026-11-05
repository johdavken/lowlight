/** The nightly board (small jobs spec §2): which missions each place posts on a story day. Pure and seeded: nothing stored. */
import { hashSeed, rng } from './rng';
import { ownedBy, type QuestEntry } from './quests';

/** Every place a mission starts at: each is a board (plan ruling 1). */
export function boardPlaces(book: QuestEntry[]): string[] {
  // A spring file (crew spec §5) posts where its recruit was hired, not on a board of its own.
  return [...new Set(book.filter((q) => q.kind === 'mission' && !q.spring).map((q) => q.starts))].sort();
}

/** The posting day: it turns at 06:00. */
export const storyDay = (clock: number): number => Math.floor((clock - 360) / 1440);

export { hashSeed };

/** The draw for one day, ignoring yesterday: weighted without replacement, 3× for the top tier present. */
function draw(pool: QuestEntry[], key: string): string[] {
  if (pool.length <= 1) return pool.map((q) => q.id);
  const n = pool.length >= 4 ? 3 : 2;
  const top = Math.max(...pool.map((q) => q.tier));
  const r = rng(hashSeed(key));
  const left = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const out: string[] = [];
  while (out.length < n && left.length > 0) {
    const weights = left.map((q) => (q.tier === top ? 3 : 1));
    let x = r() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (x >= weights[i]) x -= weights[i++];
    out.push(left.splice(i, 1)[0].id);
  }
  return out;
}

/** At most two of a contact's own jobs post at one place a night (Intake board spec §1), in draw order. */
function capOwn(ids: string[], pool: QuestEntry[]): string[] {
  let own = 0;
  return ids.filter((id) => {
    const q = pool.find((e) => e.id === id);
    if (!q || ownedBy(q) === null) return true;
    return ++own <= 2;
  });
}

/**
 * The missions `place` posts on `day` for a player at `tier` there. Yesterday's posts sit out while 4 or
 * more remain; "yesterday" is the real board, so the nights are walked in order from day 0 (cheap: a few
 * small draws a night).
 */
export function postedJobs(o: { book: QuestEntry[]; place: string; tier: 1 | 2 | 3 | 4; day: number; seed: string }): string[] {
  const pool = o.book.filter((q) => q.kind === 'mission' && !q.spring && !q.for && q.starts === o.place && q.tier <= o.tier);
  let yesterday = new Set<string>();
  let today: string[] = [];
  for (let d = Math.min(0, o.day); d <= o.day; d++) {
    const fresh = pool.filter((q) => !yesterday.has(q.id));
    today = capOwn(draw(fresh.length >= 4 ? fresh : pool, `${o.seed}|${o.place}|${d}`), pool);
    yesterday = new Set(today);
  }
  return today;
}
