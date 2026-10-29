import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import type { CrewView, ServerEvent } from '../../shared/types';
import { ChatRelay, type ChatRelayDeps } from '../src/chat-relay';
import { fakeBackend, reply } from './fixtures/backend';
import { fakePlayers } from './fixtures/players';
import { openDb, type Db } from '../src/db';
import { Journal } from '../src/journal';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import { generateScenes } from '../../tools/gen-placeholders';
import { crewKey, crewView, parseCrewEvents } from '../src/crew-view';
import { parseCrewBook } from '../../shared/crew-book';
import { parseInstance, type Recruit } from '../../shared/crew';
import { foldWithCrew, type CrewEvent } from '../../shared/crew-fold';
import { buildApp } from '../src/app';
import { makeFixture } from './fixtures/agents';
import { chunk, startStubOpenRouter } from './fixtures/stub-openrouter';
import type { ChatMessage } from '../../shared/types';

const ERRANDS = `---
kind: hustle
label: Hustle in {district}
tag: SOL
suits: fence, face
hours: 5
risk: med
needs: district known
clean:
  - effect: sol 300-300
  - "{name} moved it."
messy:
  - "{name} sold half."
blown:
  - "{name} got caught."
---
`;

const { book } = parseCrewBook({
  names: '## strand\n- Juno Sato\n- Ilya Voss\n- Saida Rahm\n- Tomas Reyes\n',
  traits: 'calm · Calm · + · odds any +5 · any · Steady hands.\n',
  pitches: '',
  errands: ERRANDS,
});

let registry: SceneRegistry;
beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-scenes-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
  await generateScenes(dir);
  registry = (await SceneRegistry.load(dir)).registry;
});
const dbs: Db[] = [];
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const db of dbs.splice(0)) db.close();
  while (cleanups.length) await cleanups.pop()!();
});

const H = 'hustle:strand@0';
const evening = 1200;

function relayWith(o: { sol?: number; here?: string; view?: () => CrewView | null } = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  dbs.push(db);
  const events: ServerEvent[] = [];
  let now = evening;
  const view = (): CrewView => {
    const lists = new Map<string, CrewEvent[]>();
    for (const { k, v } of db.metaWithPrefix('crew.hicks.')) lists.set(k, parseCrewEvents(v));
    const r = foldWithCrew({
      start: { deck: null, edgeMax: 1, from: 0 },
      kitEvents: [{ at: 0, sol: o.sol ?? 1000 }, { at: 0, rep: { district: 'strand', delta: 25 } }],
      crew: [...lists.values()],
      now,
      book,
      seed: 'pt-1',
      instance: (id) => parseInstance(id, { book, districtOfJob: () => null, placeOfJob: () => null }),
    });
    return crewView({
      crew: r.crew,
      kit: r.kit,
      book,
      now,
      seed: 'pt-1',
      places: [{ id: 'low-roller', name: 'The Low Roller', district: 'strand', hires: ['face', 'fence'] }],
      extras: [],
      posted: [],
      here: o.here ?? 'low-roller',
      districts: ['strand'],
    });
  };
  const quests: NonNullable<ChatRelayDeps['quests']> = {
    contact: 'nix-direct',
    book: () => [],
    status: () => [],
    placeId: () => o.here ?? 'low-roller',
    contactName: (id) => id,
    placeName: (id) => id,
    ctx: () => ({ flags: {}, trust: 'mid', warmth: 'mid', with: 'nix-direct' }),
    crewView: o.view ?? view,
  };
  const relay = new ChatRelay({
    players: fakePlayers(),
    backend: fakeBackend(() => reply('Hm.')),
    db,
    room: new Room(registry),
    journal: new Journal(db),
    emit: (e) => events.push(e),
    instructions: 'ROOM NOTE',
    quests,
    clockNow: () => now,
  });
  return { relay, db, events, view, setNow: (n: number) => (now = n) };
}

const firstCard = (v: CrewView) => v.hires[0].cards.find((c) => c.recruit) as { recruit: Recruit; cost: number };

describe('crew actions through the relay', () => {
  it('hire at the place', () => {
    const t = relayWith();
    const card = firstCard(t.view());
    expect(t.relay.crew('hicks', { do: 'hire', recruit: card.recruit!.id })).toMatchObject({ ok: true });
    const evs = parseCrewEvents(t.db.getMeta(crewKey('hicks', card.recruit!.id)));
    expect(evs).toEqual([{ type: 'hire', at: evening, recruit: card.recruit, place: 'low-roller', cost: card.cost }]);
    expect(t.view().roster.map((m) => m.recruit.id)).toEqual([card.recruit!.id]);
    expect(t.view().sol).toBe(1000 - card.cost);
    expect(t.events.some((e) => e.type === 'crew_changed')).toBe(true);
    const away = relayWith({ here: 'pump-house-nine' });
    expect(away.relay.crew('hicks', { do: 'hire', recruit: firstCard(away.view()).recruit!.id })).toBe('you hire at The Low Roller');
  });

  it('hire twice refuses the second', () => {
    const t = relayWith();
    const card = firstCard(t.view());
    t.relay.crew('hicks', { do: 'hire', recruit: card.recruit!.id });
    expect(t.relay.crew('hicks', { do: 'hire', recruit: card.recruit!.id })).toBe('already hired');
    expect(parseCrewEvents(t.db.getMeta(crewKey('hicks', card.recruit!.id)))).toHaveLength(1);
    expect(t.view().sol).toBe(1000 - card.cost);
  });

  it('hire refusals: not listed, short, no slot', () => {
    expect(relayWith().relay.crew('hicks', { do: 'hire', recruit: 'r-nope' })).toBe("that hire isn't on tonight's list");
    const poor = relayWith({ sol: 10 });
    const c = firstCard(poor.view());
    expect(poor.relay.crew('hicks', { do: 'hire', recruit: c.recruit!.id })).toBe(`${c.recruit!.name.split(' ')[0]} costs ${c.cost} sol`);
    // Strand rep 25 (tier 2): four slots.
    const full = relayWith();
    for (const id of ['r-x1', 'r-x2', 'r-x3', 'r-x4']) {
      const r: Recruit = { id, name: 'X', face: null, origin: 'strand', spec: 'face', grade: 0, traits: [], hidden: null, pitch: '', wage: 25 };
      full.db.setMeta(crewKey('hicks', id), JSON.stringify([{ type: 'hire', at: 1100, recruit: r, place: 'low-roller', cost: 0 }]));
    }
    expect(full.relay.crew('hicks', { do: 'hire', recruit: firstCard(full.view()).recruit!.id })).toBe('no free slot');
  });

  it('send, then refusals while out', () => {
    const t = relayWith();
    const card = firstCard(t.view());
    const id = card.recruit!.id;
    const name = card.recruit!.name.split(' ')[0];
    t.relay.crew('hicks', { do: 'hire', recruit: id });
    expect(t.relay.crew('hicks', { do: 'send', recruit: id, errand: 'nope:strand@0' })).toBe("that errand isn't open tonight");
    expect(t.relay.crew('hicks', { do: 'send', recruit: id, errand: H })).toMatchObject({ ok: true });
    const back = t.view().roster[0].due!;
    const hhmm = `${String(Math.floor((back % 1440) / 60)).padStart(2, '0')}:${String(back % 60).padStart(2, '0')}`;
    expect(t.relay.crew('hicks', { do: 'send', recruit: id, errand: H })).toBe(`${name}'s still out. Back ${hhmm}.`);
    expect(t.relay.crew('hicks', { do: 'recall', recruit: id })).toMatchObject({ ok: true });
    expect(t.relay.crew('hicks', { do: 'send', recruit: id, errand: H })).toBe("that errand's taken tonight");
    expect(t.relay.crew('hicks', { do: 'recall', recruit: id })).toBe(`${name} isn't out`);
  });

  it('send then wait lands', () => {
    const t = relayWith();
    const id = firstCard(t.view()).recruit!.id;
    t.relay.crew('hicks', { do: 'hire', recruit: id });
    t.relay.crew('hicks', { do: 'send', recruit: id, errand: H });
    t.setNow(evening + 5 * 60 + 1);
    const v = t.view();
    expect(v.results).toHaveLength(1);
    expect(v.results[0].recruit).toBe(id);
  });

  it('refusals by state (a static view)', () => {
    const base = relayWith().view();
    const member = (state: string, extra: object = {}) => ({ ...base.roster[0], recruit: { id: 'r-s', name: 'Pell Okoro', face: null, origin: 'strand', spec: 'ears', grade: 1, traits: [], hidden: null, pitch: '', wage: 40 }, state, ...extra });
    const withM = (m: object, sol = 1000) => relayWith({ view: () => ({ ...base, sol, roster: [m as CrewView['roster'][number]], errands: [{ ...(base.errands[0] ?? {}), id: H } as CrewView['errands'][number]] }) });
    const empty = { runs: { clean: 0, messy: 0, blown: 0 }, toNext: 5, loyalty: 50, revealed: [], log: [], goneUsed: false, busy: false, hired: { at: 0, place: 'low-roller' }, traitsShown: [], hiddenTraits: 0, word: 'STEADY', line: '', next: 'PRO' };
    expect(withM(member('hurt', { ...empty, hurtDays: 2 })).relay.crew('hicks', { do: 'send', recruit: 'r-s', errand: H })).toBe("Pell's hurt");
    expect(withM(member('held', empty)).relay.crew('hicks', { do: 'send', recruit: 'r-s', errand: H })).toBe("Pell's held by SDG");
    expect(withM(member('ready', { ...empty, busy: true })).relay.crew('hicks', { do: 'send', recruit: 'r-s', errand: H })).toBe("Pell's busy tonight");
    expect(withM(member('ready', empty)).relay.crew('hicks', { do: 'doc', recruit: 'r-s' })).toBe("Pell isn't hurt");
    expect(withM(member('hurt', { ...empty, hurtDays: 2 }), 50).relay.crew('hicks', { do: 'doc', recruit: 'r-s' })).toBe('the doc costs 100 sol');
    expect(withM(member('ready', empty)).relay.crew('hicks', { do: 'bail', recruit: 'r-s' })).toBe("Pell isn't held");
    expect(withM(member('held', empty), 100).relay.crew('hicks', { do: 'bail', recruit: 'r-s' })).toBe('bail is 600 sol');
    expect(withM(member('ready', empty)).relay.crew('hicks', { do: 'leave', recruit: 'r-s' })).toBe("Pell isn't held");
    expect(withM(member('gone', empty)).relay.crew('hicks', { do: 'letgo', recruit: 'r-s' })).toBe('no one by that name');
    expect(withM(member('ready', empty)).relay.crew('hicks', { do: 'letgo', recruit: 'r-zz' })).toBe('no one by that name');
    // A held recruit's bail is written with its price.
    const held = withM(member('held', empty));
    expect(held.relay.crew('hicks', { do: 'bail', recruit: 'r-s' })).toMatchObject({ ok: true });
    expect(parseCrewEvents(held.db.getMeta(crewKey('hicks', 'r-s')))).toEqual([{ type: 'bail', at: evening, cost: 600 }]);
  });
});

describe('crew across rewind and branch', () => {
  const line = (id: string, ts: number): ChatMessage => ({ id, role: 'agent', text: `line ${id}`, toolLines: [], ts, status: 'ok' });
  async function start() {
    const or = await startStubOpenRouter([], { fallback: { raw: [':\n\n'], chunks: [chunk('hello'), chunk(undefined, 'stop')] } });
    cleanups.push(() => or.close());
    const { root, cfg } = await makeFixture([{ id: 'nix', direct: true, pack: 'karasu' }], undefined, { openrouterUrl: or.url });
    cfg.crewDir = path.join(root, 'crew');
    fs.mkdirSync(cfg.crewDir);
    fs.writeFileSync(path.join(cfg.crewDir, 'errands.md'), ERRANDS);
    const built = await buildApp(cfg);
    cleanups.push(() => built.close());
    const pt = built.world.active()!;
    const file = path.join(cfg.playthroughsDir, pt.id, 'chars', 'nix', 'room.db');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = openDb(file, { defaultPlayer: pt.player });
    return { built, pt, db };
  }
  const juno: Recruit = { id: 'r-juno', name: 'Juno Sato', face: null, origin: 'strand', spec: 'face', grade: 1, traits: [], hidden: null, pitch: '', wage: 40 };
  function hireThenSend(db: Db, player: string) {
    db.insertMessage(player, line('n10', 10));
    db.setReplyStamp({ messageId: 'n10', take: 0 });
    db.setMeta(crewKey(player, 'r-juno'), JSON.stringify([{ type: 'hire', at: 1190, recruit: juno, place: 'low-roller', cost: 0 }]));
    db.setReplyStamp(null);
    db.insertMessage(player, line('n30', 30));
    db.setReplyStamp({ messageId: 'n30', take: 0 });
    db.setMeta(crewKey(player, 'r-juno'), JSON.stringify([...parseCrewEvents(db.getMeta(crewKey(player, 'r-juno'))), { type: 'send', at: 1200, errand: H }]));
    db.setReplyStamp(null);
  }

  it('rewind before a deadly send brings them back', async () => {
    const s = await start();
    hireThenSend(s.db, s.pt.player);
    // Whatever the roll (it's seeded by the playthrough id), after the landing the send has happened.
    expect(s.built.world.kitOf(s.pt.player, 1200 + 5 * 60)!.crew.members[0].log).toHaveLength(1);
    s.db.close();
    const r = s.built.world.branch('nix', 'n10');
    if (r === 'unknown' || 'busy' in r) throw new Error(`branch failed: ${JSON.stringify(r)}`);
    const m = s.built.world.kitOf(s.pt.player, 1200 + 5 * 60)!.crew.members[0];
    expect(m).toMatchObject({ state: 'ready', log: [] });
  });

  it('branch copies crew', async () => {
    const s = await start();
    hireThenSend(s.db, s.pt.player);
    s.db.close();
    const r = s.built.world.branch('nix', 'n30');
    if (r === 'unknown' || 'busy' in r) throw new Error(`branch failed: ${JSON.stringify(r)}`);
    expect(s.built.world.kitOf(s.pt.player, 1200 + 5 * 60)!.crew.members.map((m) => m.recruit.id)).toEqual(['r-juno']);
  });
});
