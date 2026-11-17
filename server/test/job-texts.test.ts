import { describe, expect, it } from 'vitest';
import { createJobTextChecker, type JobTextCheckerDeps } from '../src/job-texts';
import { toldKey } from '../../shared/quests';

// The job-text checker (job texts spec §3): on clock moves, a contact's opened job goes out as her text, once.
const at = (h: number, m = 0) => 1440 + h * 60 + m;
const settle = () => new Promise((r) => setTimeout(r, 20));
type Due = { id: string; title: string; text: string };

function setup(o: { due?: Record<string, Due[]>; senders?: string[]; known?: string[]; withYou?: string; asleep?: boolean; table?: boolean; fire?: () => Promise<boolean>; seeded?: boolean; now?: number } = {}) {
  const meta = new Map<string, Map<string, string>>();
  const of = (id: string) => meta.get(id) ?? meta.set(id, new Map()).get(id)!;
  const senders = o.senders ?? ['rue'];
  if (o.seeded !== false) for (const s of senders) of(s).set('toldseeded.soren', '1');
  let now = o.now ?? at(20);
  let asleep = o.asleep ?? false;
  let table = o.table ?? false;
  const due = o.due ?? { rue: [{ id: 'arrears', title: 'Arrears', text: 'Need you again.' }] };
  const fired: { id: string; o: { job: string; text: string; due: number } }[] = [];
  const logs: string[] = [];
  const told = (id: string, job: string) => of(id).get(toldKey('soren', job)) ?? null;
  const deps: JobTextCheckerDeps = {
    active: () => ({ player: 'soren' }),
    now: () => now,
    senders: () => senders,
    known: (id) => (o.known ?? senders).includes(id),
    // Once told, a job is no longer due (the relay's jobTextsDue reads the told row).
    due: async (id) => (due[id] ?? []).filter((d) => told(id, d.id) === null),
    read: (id, k) => of(id).get(k) ?? null,
    store: async (id) => ({ getMeta: (k: string) => of(id).get(k) ?? null, setMeta: (k: string, v: string) => void of(id).set(k, v) }),
    withYou: (id) => o.withYou === id,
    awake: () => !asleep,
    tableUp: () => table,
    fire: async (id, f) => {
      fired.push({ id, o: f });
      const ok = o.fire ? await o.fire() : true;
      // The relay tells it under her reply.
      if (ok) of(id).set(toldKey('soren', f.job), JSON.stringify({ how: 'text', at: f.due }));
      return ok;
    },
    log: (l) => logs.push(l),
  };
  return { checker: createJobTextChecker(deps), fired, logs, told, setNow: (t: number) => (now = t), wake: () => (asleep = false), closeTable: () => (table = false) };
}

describe('the job-text checker', () => {
  it("sends once when the gate holds, you're apart and she's awake", async () => {
    const s = setup();
    await s.checker.check();
    await settle();
    await s.checker.check();
    await settle();
    expect(s.fired).toEqual([{ id: 'rue', o: { job: 'arrears', text: 'Need you again.', due: at(20) } }]);
  });
  it('not while she sleeps; sent at her first waking clock move, stamped then', async () => {
    const s = setup({ asleep: true, now: at(10) });
    await s.checker.check();
    await settle();
    expect(s.fired).toEqual([]);
    s.wake();
    s.setNow(at(14));
    await s.checker.check();
    await settle();
    expect(s.fired.map((f) => f.o.due)).toEqual([at(14)]);
  });
  it("not while you're with her: nothing sent, nothing told (her room line handles it)", async () => {
    const s = setup({ withYou: 'rue' });
    await s.checker.check();
    await settle();
    expect(s.fired).toEqual([]);
    expect(s.told('rue', 'arrears')).toBeNull();
  });
  it('not while a job table is up; sent once it closes (Review Focus 4)', async () => {
    const s = setup({ table: true });
    await s.checker.check();
    await settle();
    expect(s.fired).toEqual([]);
    s.closeTable();
    await s.checker.check();
    await settle();
    expect(s.fired).toHaveLength(1);
  });
  it("a failed send counts a try; after three it's told silent with a log line", async () => {
    const s = setup({ fire: async () => false });
    for (let i = 0; i < 4; i++) {
      await s.checker.check();
      await settle();
    }
    expect(s.fired).toHaveLength(3);
    expect(JSON.parse(s.told('rue', 'arrears')!)).toMatchObject({ how: 'silent' });
    expect(s.logs.some((l) => l.includes('arrears') && l.includes('silent'))).toBe(true);
  });
  it("an unknown sender's due job is told silent", async () => {
    const s = setup({ known: [] });
    await s.checker.check();
    await settle();
    expect(s.fired).toEqual([]);
    expect(JSON.parse(s.told('rue', 'arrears')!)).toMatchObject({ how: 'silent' });
  });
  it('first pass for a playthrough tells every already-due job silent and sends nothing', async () => {
    const s = setup({ seeded: false });
    await s.checker.check();
    await settle();
    expect(s.fired).toEqual([]);
    expect(JSON.parse(s.told('rue', 'arrears')!)).toMatchObject({ how: 'silent' });
  });
  it('one text per sender per pass; two senders both send', async () => {
    const s = setup({
      senders: ['rue', 'nix'],
      due: { rue: [{ id: 'a', title: 'A', text: 'one' }, { id: 'b', title: 'B', text: 'two' }], nix: [{ id: 'c', title: 'C', text: 'three' }] },
    });
    await s.checker.check();
    await settle();
    expect(s.fired.map((f) => f.o.job).sort()).toEqual(['a', 'c']);
  });
  it('two checks in a row while one is sending: sent once', async () => {
    let release!: (v: boolean) => void;
    const s = setup({ fire: () => new Promise<boolean>((r) => (release = r)) });
    await s.checker.check();
    await s.checker.check();
    release(true);
    await settle();
    expect(s.fired).toHaveLength(1);
  });
});
