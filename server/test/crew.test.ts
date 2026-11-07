import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// A passthrough spy on the fold, so the memo can be counted.
vi.mock('../../shared/crew-fold', async (orig) => {
  const actual = await orig<typeof import('../../shared/crew-fold')>();
  return { ...actual, foldWithCrew: vi.fn(actual.foldWithCrew) };
});

import { buildApp } from '../src/app';
import { openDb, type Db } from '../src/db';
import { crewKey, freeHireWaiting } from '../src/crew-view';
import { makeFixture } from './fixtures/agents';
import { chunk, startStubOpenRouter } from './fixtures/stub-openrouter';
import { foldWithCrew, type CrewEvent, type CrewState } from '../../shared/crew-fold';
import type { Recruit } from '../../shared/crew';
import type { ChatMessage } from '../../shared/types';
import { questKey } from '../../shared/quests';

const ERRANDS = `---
kind: hustle
label: Hustle in {district}
tag: SOL
suits: fence, face
hours: 5
risk: med
needs: district known
blurb: Move hot goods.
clean:
  - effect: sol 300-300 · rep +1
  - "{name} moved it."
messy:
  - effect: sol 300-300 · rep +1
  - "{name} moved it, mostly."
blown:
  - effect: sol 300-300
  - "{name} was caught."
---
`;
const TRAITS = 'sure · Sure Thing · + · odds any +90 · any · Never misses.\n';
const NAMES = '## strand\n- Juno Sato\n- Ilya Voss\n- Saida Rahm\n## karasu\n- Pell\n- Dez Okoro\n';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
  vi.mocked(foldWithCrew).mockClear();
});

async function start(o: { quests?: Record<string, string> } = {}) {
  const or = await startStubOpenRouter([], { fallback: { raw: [':\n\n'], chunks: [chunk('hello'), chunk(undefined, 'stop')] } });
  cleanups.push(() => or.close());
  const { root, cfg } = await makeFixture([
    { id: 'nix', direct: true, pack: 'karasu' },
    { id: 'cass', direct: true, pack: 'karasu' },
  ], undefined, { openrouterUrl: or.url });
  cfg.crewDir = path.join(root, 'crew');
  fs.mkdirSync(cfg.crewDir);
  fs.writeFileSync(path.join(cfg.crewDir, 'errands.md'), ERRANDS);
  fs.writeFileSync(path.join(cfg.crewDir, 'traits.md'), TRAITS);
  fs.writeFileSync(path.join(cfg.crewDir, 'names.md'), NAMES);
  // The shipped map with hiring places.
  const map = JSON.parse(fs.readFileSync('map/lowlight.json', 'utf8')) as { places: { id: string; hires?: string[] }[] };
  for (const p of map.places) {
    if (p.id === 'low-roller') p.hires = ['face', 'fence'];
    if (p.id === 'pump-house-nine') p.hires = ['muscle', 'ears'];
    if (p.id === 'second-socket') p.hires = ['wire', 'runner'];
  }
  if (o.quests) {
    cfg.questsDir = path.join(root, 'quests');
    fs.mkdirSync(cfg.questsDir);
    for (const [id, text] of Object.entries(o.quests)) fs.writeFileSync(path.join(cfg.questsDir, `${id}.md`), text);
  }
  cfg.mapFile = path.join(root, 'map.json');
  fs.writeFileSync(cfg.mapFile, JSON.stringify(map));
  const built = await buildApp(cfg);
  cleanups.push(() => built.close());
  const pt = built.world.active()!;
  const open = (contact: string): Db => {
    const file = path.join(cfg.playthroughsDir, pt.id, 'chars', contact, 'room.db');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = openDb(file, { defaultPlayer: pt.player });
    cleanups.push(() => {
      try {
        db.close();
      } catch {
        // closed by the test
      }
    });
    return db;
  };
  return { built, pt, open };
}

const line = (id: string, ts: number): ChatMessage => ({ id, role: 'agent', text: `line ${id}`, toolLines: [], ts, status: 'ok' });
const juno: Recruit = { id: 'r-juno', name: 'Juno Sato', face: null, origin: 'strand', spec: 'face', grade: 1, traits: ['sure'], hidden: null, pitch: '', wage: 40 };
const hire: CrewEvent = { type: 'hire', at: 1190, recruit: juno, place: 'low-roller', cost: 250 };
const send: CrewEvent = { type: 'send', at: 1200, errand: 'hustle:strand@0' };

/** Writes `events` on `db` under a message stamp, as the relay would. */
function write(db: Db, player: string, id: string, events: CrewEvent[], msg: string) {
  db.insertMessage(player, line(msg, 10));
  db.setReplyStamp({ messageId: msg, take: 0 });
  db.setMeta(crewKey(player, id), JSON.stringify(events));
  db.setReplyStamp(null);
}

describe('crew in the playthrough', () => {
  it('crew meta is story meta', async () => {
    const s = await start();
    const nix = s.open('nix');
    write(nix, s.pt.player, 'r-juno', [hire], 'n1');
    expect(nix.writes().some((w) => w.kind === 'meta' && w.key === crewKey(s.pt.player, 'r-juno'))).toBe(true);
  });

  it('kitOf folds crew with runs', async () => {
    const s = await start();
    write(s.open('nix'), s.pt.player, 'r-juno', [hire, send], 'n1');
    const k = s.built.world.kitOf(s.pt.player, 1200 + 5 * 60)!;
    // The roll is seeded by the playthrough id (new each run): clean and messy both pay 300 and +1 rep here, blown pays nothing.
    const m = k.crew.members[0];
    const paid = m.log[0].band !== 'blown';
    expect(m.runs.clean + m.runs.messy + m.runs.blown).toBe(1);
    // 0 − 250 (floored at 0) + 300.
    expect(k.kit.sol).toBe(paid ? 300 : 0);
    expect(k.kit.rep.strand ?? 0).toBe(paid ? 1 : 0);
    expect(s.built.world.kitOf(s.pt.player, 1200 + 5 * 60 - 1)!.crew.members[0].state).toBe('out');
  });

  it('events merge across room dbs', async () => {
    const s = await start();
    write(s.open('nix'), s.pt.player, 'r-juno', [hire], 'n1');
    write(s.open('cass'), s.pt.player, 'r-juno', [send], 'c1');
    const k = s.built.world.kitOf(s.pt.player, 1200 + 5 * 60)!;
    expect(k.crew.members).toHaveLength(1);
    expect(k.crew.members[0].log[0].line).toMatch(/^Juno /);
  });

  it('GET /api/crew shape', async () => {
    const s = await start();
    write(s.open('nix'), s.pt.player, 'r-juno', [hire], 'n1');
    const res = await s.built.app.inject({ method: 'GET', url: '/api/crew' });
    expect(res.statusCode).toBe(200);
    const v = JSON.parse(res.body).crew;
    expect(v.slots).toBe(3);
    expect(v.used).toBe(1);
    expect(v.roster[0]).toMatchObject({ recruit: { id: 'r-juno' }, word: 'STEADY', line: 'Shows up. Gets paid. Fair enough.', next: 'PRO', traitsShown: [{ label: 'Sure Thing', good: true, text: 'Never misses.' }], hiddenTraits: 0 });
    expect(v.hires.map((h: { place: string }) => h.place).sort()).toEqual(['long-haul', 'low-roller', 'pump-house-nine', 'second-socket']);
    const lr = v.hires.find((h: { place: string }) => h.place === 'low-roller');
    expect(lr).toMatchObject({ name: 'The Low Roller', district: 'strand' });
    expect(lr.cards.length).toBeGreaterThanOrEqual(2);
    expect(v.wages).toBe(0); // idle tonight: a wage is only due for a night they run
    expect(typeof v.nextSix).toBe('number');
    expect('here' in v).toBe(true);
    expect(Array.isArray(v.errands)).toBe(true);
    expect(v.results).toEqual([]);
  });

  it('GET /api/crew errands carry odds per ready recruit', async () => {
    const s = await start();
    // Known in the Strand (rep 20) opens a hustle there.
    const nix = s.open('nix');
    nix.insertMessage(s.pt.player, line('n0', 5));
    nix.setReplyStamp({ messageId: 'n0', take: 0 });
    nix.setMeta(questKey(s.pt.player, 'job-a'), JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags: {}, done: true, at: 1, kit: [{ at: 1180, rep: { district: 'strand', delta: 20 } }] }));
    nix.setReplyStamp(null);
    write(nix, s.pt.player, 'r-juno', [hire], 'n1');
    const v = JSON.parse((await s.built.app.inject({ method: 'GET', url: '/api/crew' })).body).crew;
    const h = v.errands.find((e: { id: string }) => e.id === 'hustle:strand@0');
    expect(h).toMatchObject({ kind: 'hustle', tag: 'SOL', suits: ['fence', 'face'], hours: 5, risk: 'med', taken: false });
    expect(h.odds['r-juno'].clean).toBe(95);
    // The district's display name fills the label's {district}.
    expect(h.name).toBe('Neon Strand');
  });

  it('kitOf is memoised', async () => {
    const s = await start();
    write(s.open('nix'), s.pt.player, 'r-juno', [hire], 'n1');
    vi.mocked(foldWithCrew).mockClear();
    s.built.world.kitOf(s.pt.player);
    s.built.world.kitOf(s.pt.player);
    expect(vi.mocked(foldWithCrew)).toHaveBeenCalledTimes(1);
    write(s.open('cass'), s.pt.player, 'r-juno', [send], 'c1');
    s.built.world.kitOf(s.pt.player);
    expect(vi.mocked(foldWithCrew)).toHaveBeenCalledTimes(2);
  });

  it('/api/kit crewLatest', async () => {
    const s = await start();
    const kit = async () => JSON.parse((await s.built.app.inject({ method: 'GET', url: '/api/kit' })).body).kit;
    write(s.open('nix'), s.pt.player, 'r-juno', [hire], 'n1');
    expect((await kit()).crewLatest).toBeNull();
    // Send, then a later row moves the story clock past the landing.
    const cass = s.open('cass');
    write(cass, s.pt.player, 'r-juno', [send], 'c1');
    expect((await kit()).crewLatest).toBeNull();
    cass.insertMessage(s.pt.player, { ...line('c2', 20), clock: 1200 + 5 * 60 + 10 });
    expect((await kit()).crewLatest).toBe(1200 + 5 * 60);
  });
});

describe('a clock move re-sends quest state (crew results land on the clock)', () => {
  it('clockChanged asks every room to re-send its quest state', async () => {
    const s = await start();
    const rt = (await s.built.runtime('nix'))!;
    const spy = vi.spyOn(rt.relay, 'emitQuestState');
    s.built.world.clockChanged();
    expect(spy).toHaveBeenCalled();
  });
});


describe('a WAIT re-sends quest state too', () => {
  it('world.wait asks every room to re-send its quest state', async () => {
    const s = await start();
    const rt = (await s.built.runtime('nix'))!;
    const spy = vi.spyOn(rt.relay, 'emitQuestState');
    s.built.world.wait({ minutes: 60 });
    expect(spy).toHaveBeenCalled();
  });
});

describe('spring runs in the playthrough (crew spec §5)', () => {
  const dez: Recruit = { id: 'r-dez', name: 'Dez Okoro', face: null, origin: 'karasu', spec: 'runner', grade: 1, traits: [], hidden: null, pitch: '', wage: 40 };
  const base = { variant: 0, wait: null, picks: [], flags: {}, at: 1 };
  // Dez is taken on a hand job's call at 20:10 and held; SPRING THEM at 20:30; the rescue runs 20:40–21:30.
  const taken = { ...base, beat: null, done: true, take: 'full', blown: true, setup: { approach: 'quiet', people: ['r-dez'], favour: false, at: 1200, endAt: 1220 }, calls: [{ beat: 'b', choice: 'c', card: 'r-dez', again: true, at: 1210, loss: 'held' }] };
  const rescue = (o: object = {}) => ({ ...base, beat: null, done: true, take: 'full', setup: { approach: 'quiet', people: [], favour: false, at: 1240, endAt: 1290 }, spring: { recruit: 'r-dez', place: 'low-roller', tier: 2 }, kit: [{ at: 1260, heat: 2 }], ...o });
  const SPRING_FILE = `---
title: Get {recruit} Out
kind: mission
spring: true
after: null
pitch: Their people know where SDG took {recruit}.
---

# door

*The holding floor.*

- walk: Walk {recruit} out. → out
- wait: Wait for the shift change. → out

## out
*Out.*
→ end
`;
  async function setUp(run: object, quests?: Record<string, string>) {
    const s = await start(quests ? { quests } : {});
    const db = s.open('nix');
    db.insertMessage(s.pt.player, line('n1', 10));
    db.setReplyStamp({ messageId: 'n1', take: 0 });
    db.setMeta(crewKey(s.pt.player, 'r-dez'), JSON.stringify([{ type: 'hire', at: 1190, recruit: dez, place: 'low-roller', cost: 0 }, { type: 'spring', at: 1230, job: 'spring-quiet' }]));
    db.setMeta(questKey(s.pt.player, 'back-door@0'), JSON.stringify(taken));
    db.setMeta(questKey(s.pt.player, 'spring-quiet@0'), JSON.stringify(run));
    db.setReplyStamp(null);
    return s;
  }

  it('a clean rescue frees them in kitOf', async () => {
    const s = await setUp(rescue());
    expect(s.built.world.kitOf(s.pt.player, 1235)!.crew.members[0].state).toBe('held');
    expect(s.built.world.kitOf(s.pt.player, 1300)!.crew.members[0]).toMatchObject({ state: 'ready', loyalty: 65 });
  });

  it("crew on a rescue log its filled title", async () => {
    const pell: Recruit = { id: 'r-pell', name: 'Pell Ash', face: null, origin: 'karasu', spec: 'muscle', grade: 1, traits: [], hidden: null, pitch: '', wage: 40 };
    const s = await setUp(rescue({ setup: { approach: 'quiet', people: ['r-pell'], favour: false, at: 1240, endAt: 1290 } }), { 'spring-quiet': SPRING_FILE });
    const db = s.open('nix');
    db.insertMessage(s.pt.player, line('n2', 20));
    db.setReplyStamp({ messageId: 'n2', take: 0 });
    db.setMeta(crewKey(s.pt.player, 'r-pell'), JSON.stringify([{ type: 'hire', at: 1191, recruit: pell, place: 'low-roller', cost: 0 }]));
    db.setReplyStamp(null);
    const p = s.built.world.kitOf(s.pt.player, 1300)!.crew.members.find((m) => m.recruit.id === 'r-pell')!;
    expect(p.log[0].line).toContain('Get Dez Out');
  });

  it("a rescue's heat lands where they were hired", async () => {
    const s = await setUp(rescue());
    expect(s.built.world.kitOf(s.pt.player, 1300)!.kit.heat.strand).toBe(2);
  });
});

describe('a job card on GET /api/crew (crew spec §5)', () => {
  it("a rescue's card sits at its post's place", async () => {
    const s = await start({ quests: { 'spring-quiet': '---\ntitle: Get {recruit} Out\nkind: mission\nspring: true\nafter: null\n---\n\n# door\n\n*Holding.*\n\n- walk: Walk out. → out\n- wait: Wait. → out\n\n## out\n*Out.*\n→ end\n' } });
    const db = s.open('nix');
    db.insertMessage(s.pt.player, line('n1', 10));
    db.setReplyStamp({ messageId: 'n1', take: 0 });
    const run = { variant: 0, wait: null, picks: [], flags: {}, at: 1, beat: null, done: true, take: 'full', setup: { approach: 'quiet', people: [], favour: false, at: 1100, endAt: 1150 }, spring: { recruit: 'r-x', place: 'low-roller', tier: 1 }, recruit: { spec: 'muscle', grade: 1 } };
    db.setMeta(questKey(s.pt.player, 'spring-quiet@0'), JSON.stringify(run));
    db.setReplyStamp(null);
    const v = JSON.parse((await s.built.app.inject({ method: 'GET', url: '/api/crew' })).body).crew;
    const lr = v.hires.find((h: { place: string; vouched?: unknown }) => h.place === 'low-roller' && !h.vouched);
    expect(lr.cards.some((c: { from?: { job?: string } }) => c.from?.job === questKey(s.pt.player, 'spring-quiet@0'))).toBe(true);
  });

  it("an ended run's gives: recruit shows a free card at its place", async () => {
    const s = await start();
    const db = s.open('nix');
    db.insertMessage(s.pt.player, line('n1', 10));
    db.setReplyStamp({ messageId: 'n1', take: 0 });
    const run = { variant: 0, wait: null, picks: [], flags: {}, at: 1, beat: null, done: true, take: 'full', setup: { approach: 'quiet', people: [], favour: false, at: 1100, endAt: 1150 }, recruit: { spec: 'muscle', grade: 1 } };
    db.setMeta(questKey(s.pt.player, 'weigh-station@0'), JSON.stringify(run));
    db.setReplyStamp(null);
    const v = JSON.parse((await s.built.app.inject({ method: 'GET', url: '/api/crew' })).body).crew;
    const lh = v.hires.find((h: { place: string }) => h.place === 'long-haul');
    const card = lh.cards.find((c: { from?: unknown }) => c.from);
    expect(card).toMatchObject({ cost: 0, loyalty: 50, from: { job: questKey(s.pt.player, 'weigh-station@0'), title: 'Weigh Station' }, recruit: { spec: 'muscle', grade: 1 } });
  });

  it("/api/kit crewFree: a job's free card lights the dot until it's hired or 06:00 takes it", async () => {
    const s = await start();
    const kit = async () => JSON.parse((await s.built.app.inject({ method: 'GET', url: '/api/kit' })).body).kit;
    const db = s.open('nix');
    expect((await kit()).crewFree).toBe(false);
    db.insertMessage(s.pt.player, line('n1', 10));
    db.setReplyStamp({ messageId: 'n1', take: 0 });
    const run = { variant: 0, wait: null, picks: [], flags: {}, at: 1, beat: null, done: true, take: 'full', setup: { approach: 'quiet', people: [], favour: false, at: 1100, endAt: 1150 }, recruit: { spec: 'muscle', grade: 1, pitch: 'I lift.' } };
    db.setMeta(questKey(s.pt.player, 'weigh-station@0'), JSON.stringify(run));
    db.setReplyStamp(null);
    expect((await kit()).crewFree).toBe(true);
    const v = JSON.parse((await s.built.app.inject({ method: 'GET', url: '/api/crew' })).body).crew;
    const card = v.hires.find((h: { place: string }) => h.place === 'long-haul').cards.find((c: { from?: unknown }) => c.from);
    expect(card.recruit.pitch).toBe('I lift.');
    write(db, s.pt.player, card.recruit.id, [{ ...hire, recruit: card.recruit }], 'n2');
    expect((await kit()).crewFree).toBe(false);
  });

  it('crewFree goes out at the next 06:00', () => {
    const j = { runKey: 'k', endAt: 1200 };
    const o = { crew: { members: [] } as unknown as CrewState, seed: 's', jobCards: [j] };
    expect(freeHireWaiting({ ...o, now: 1300 })).toBe(true);
    expect(freeHireWaiting({ ...o, now: 1800 })).toBe(false);
  });
});
