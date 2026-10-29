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
import { crewKey } from '../src/crew-view';
import { makeFixture } from './fixtures/agents';
import { chunk, startStubOpenRouter } from './fixtures/stub-openrouter';
import { foldWithCrew, type CrewEvent } from '../../shared/crew-fold';
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

async function start() {
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
    expect(v.hires.map((h: { place: string }) => h.place).sort()).toEqual(['low-roller', 'pump-house-nine', 'second-socket']);
    const lr = v.hires.find((h: { place: string }) => h.place === 'low-roller');
    expect(lr).toMatchObject({ name: 'The Low Roller', district: 'strand' });
    expect(lr.cards.length).toBeGreaterThanOrEqual(2);
    expect(v.wages).toBe(40);
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
