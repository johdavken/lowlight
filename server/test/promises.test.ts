import { describe, expect, it, vi } from 'vitest';
import { createPromiseChecker, type PromiseCheckerDeps } from '../src/promises';
import type { TextPromise } from '../../shared/promise';

// The checker (promised texts spec §5): on every clock move, a due promise is sent once.
const HOME = 'karasu/nix-home';
const at = (h: number, m = 0) => 1440 + h * 60 + m;

function setup(o: { promise?: TextPromise; now?: number; withYou?: boolean; fire?: () => Promise<boolean>; tries?: number | string; spent?: string; partedAt?: number } = {}) {
  const meta = new Map<string, string>();
  if (o.promise) meta.set('promise.hicks', JSON.stringify(o.promise));
  if (o.tries) meta.set('promisetries.hicks', typeof o.tries === 'string' ? o.tries : JSON.stringify({ from: 'r1', n: o.tries }));
  if (o.spent) meta.set('promisespent.hicks', o.spent);
  let now = o.now ?? at(6);
  const fired: { id: string; o: { about: string; due: number; where: string; place: string; from: string } }[] = [];
  const logs: string[] = [];
  const store = { getMeta: (k: string) => meta.get(k) ?? null, setMeta: (k: string, v: string) => void meta.set(k, v), deleteMeta: (k: string) => void meta.delete(k) };
  const deps: PromiseCheckerDeps = {
    active: () => ({ player: 'hicks' }),
    now: () => now,
    contacts: () => ['nix'],
    read: (_id, k) => meta.get(k) ?? null,
    store: async () => store,
    withYou: () => o.withYou ?? false,
    partedAt: () => o.partedAt ?? null,
    placeAt: (_id, t) => (t >= at(5) ? HOME : 'karasu/intake'),
    placeName: (id) => (id === HOME ? "Nix's flat" : id),
    fire: async (id, f) => {
      fired.push({ id, o: f });
      return o.fire ? o.fire() : true;
    },
    log: (l) => logs.push(l),
  };
  const checker = createPromiseChecker(deps);
  return { checker, meta, fired, logs, setNow: (t: number) => (now = t) };
}
const home: TextPromise = { when: { place: HOME }, about: "that she's home", from: 'r1', since: at(4) };
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('the promise checker', () => {
  it('a due time promise fires once, saying the hour', async () => {
    const s = setup({ promise: { ...home, when: { at: at(5, 30) } } });
    await s.checker.check();
    expect(s.fired).toEqual([{ id: 'nix', o: { about: "that she's home", due: at(5, 30), where: "it's 05:30", place: "Nix's flat", from: 'r1' } }]);
  });

  it("a place promise fires at the first minute she's there, saying where she is", async () => {
    const s = setup({ promise: home, now: at(20) });
    await s.checker.check();
    expect(s.fired.map((f) => [f.o.due, f.o.where])).toEqual([[at(5), "you're at Nix's flat now"]]);
  });

  it('not due: nothing', async () => {
    const s = setup({ promise: home, now: at(4, 40) });
    await s.checker.check();
    expect(s.fired).toEqual([]);
    expect(s.meta.has('promise.hicks')).toBe(true);
  });

  it("with her when it comes due: dropped, nothing sent", async () => {
    const s = setup({ promise: home, withYou: true });
    await s.checker.check();
    expect(s.fired).toEqual([]);
    expect(s.meta.has('promise.hicks')).toBe(false);
  });

  it('a long WAIT past a promise that came due inside its day still sends it, stamped then (mid review M3)', async () => {
    const s = setup({ promise: { ...home, when: { at: at(5) } }, now: at(4) + 1500 });
    await s.checker.check();
    expect(s.fired.map((f) => f.o.due)).toEqual([at(5)]);
  });

  it("tries counted for another promise don't count (minor 2)", async () => {
    const s = setup({ promise: home, tries: JSON.stringify({ from: 'older', n: 3 }) });
    await s.checker.check();
    expect(s.fired).toHaveLength(1);
    expect(JSON.parse(s.meta.get('promisetries.hicks')!)).toEqual({ from: 'r1', n: 1 });
  });

  it('a spent promise (its text was rewound) is never sent again (minor 6)', async () => {
    const s = setup({ promise: home, spent: 'r1' });
    await s.checker.check();
    expect(s.fired).toEqual([]);
  });

  it('a place promise scans from when you parted from her, not before (minor 3)', async () => {
    // Home from 05:00, but you were with her until 06:30.
    const s = setup({ promise: home, now: at(8), partedAt: at(6, 30) });
    await s.checker.check();
    expect(s.fired.map((f) => f.o.due)).toEqual([at(6, 45)]);
  });

  it('expired: dropped', async () => {
    const s = setup({ promise: { ...home, when: { place: 'karasu/elsewhere' } }, now: at(4) + 1441 });
    await s.checker.check();
    expect(s.fired).toEqual([]);
    expect(s.meta.has('promise.hicks')).toBe(false);
  });

  it('two checks in a row while the first is sending: sent once (Review Focus 2)', async () => {
    let release!: (v: boolean) => void;
    const s = setup({ promise: home, fire: () => new Promise((r) => (release = r)) });
    void s.checker.check();
    await settle();
    await s.checker.check();
    expect(s.fired).toHaveLength(1);
    release(true);
  });

  it('a failed send is tried again on the next clock move, three times, then dropped with a log line (Review Focus 4)', async () => {
    const s = setup({ promise: home, fire: async () => false });
    for (let i = 0; i < 4; i++) {
      await s.checker.check();
      await settle();
    }
    expect(s.fired).toHaveLength(3);
    expect(s.meta.has('promise.hicks')).toBe(false);
    expect(s.logs.at(-1)).toMatch(/promise to text dropped after 3 tries/);
  });

  it('no save: nothing', async () => {
    const s = setup({ promise: home });
    const c = createPromiseChecker({ ...({} as PromiseCheckerDeps), active: () => null, now: () => null, contacts: () => [], read: () => null, store: async () => null, withYou: () => false, placeAt: () => null, placeName: (x) => x, fire: vi.fn(), log: () => {} });
    await c.check();
    expect(s.fired).toEqual([]);
  });
});
