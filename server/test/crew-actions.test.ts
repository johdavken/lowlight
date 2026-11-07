import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
import { foldWithCrew, type CrewEvent, type FoldJob } from '../../shared/crew-fold';
import type { QuestEntry } from '../../shared/quests';
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
  abilities: [
    'read-room · Read the Room · face, fence · GREEN · die · Knows.',
    'smooth · Smooth It Over · face, fence · GREEN · heat -1 · Smooths.',
    'cover · Cover Story · face, fence · HAND · cross wits · Covers.',
  ].join('\n'),
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

function relayWith(o: { sol?: number; here?: string; view?: () => CrewView | null; vouchers?: Parameters<typeof crewView>[0]['vouchers']; jobs?: FoldJob[]; questBook?: QuestEntry[] } = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  dbs.push(db);
  const events: ServerEvent[] = [];
  let now = evening;
  const view = (): CrewView => {
    const lists = new Map<string, CrewEvent[]>();
    for (const { k, v } of db.metaWithPrefix('crew.hicks.')) lists.set(k, parseCrewEvents(v));
    const r = foldWithCrew({
      start: { deck: null, nerveMax: 1, from: 0 },
      kitEvents: [{ at: 0, sol: o.sol ?? 1000 }, { at: 0, rep: { district: 'strand', delta: 25 } }],
      crew: [...lists.values()],
      now,
      book,
      seed: 'pt-1',
      instance: (id) => parseInstance(id, { book, districtOfJob: () => null, placeOfJob: () => null }),
      jobs: o.jobs,
    });
    return crewView({
      crew: r.crew,
      kit: r.kit,
      book,
      now,
      seed: 'pt-1',
      places: [{ id: 'low-roller', name: 'The Low Roller', district: 'strand', hires: ['face', 'fence'] }],
      extras: [],
     
      here: o.here ?? 'low-roller',
      districts: ['strand'],
      vouchers: o.vouchers,
      springs: (o.questBook ?? []).some((q) => q.spring),
    });
  };
  const quests: NonNullable<ChatRelayDeps['quests']> = {
    contact: 'nix-direct',
    book: () => o.questBook ?? [],
    status: () => [],
    boardSeed: () => 'pt-1',
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
  });

  it("a crew action re-sends the job list: its SETUP cards list who's ready (the hand)", () => {
    const t = relayWith();
    const sent = vi.spyOn(t.relay, 'emitQuestState');
    t.relay.crew('hicks', { do: 'hire', recruit: firstCard(t.view()).recruit!.id });
    expect(sent).toHaveBeenCalled();
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

  describe('goods refusals (crew goods spec §2, §3)', () => {
    const open = (patch: (v: CrewView, id: string) => Partial<CrewView>) => {
      let id = '';
      const t: ReturnType<typeof relayWith> = relayWith({ view: () => { const v = t.view(); return { ...v, ...patch(v, id) }; } });
      const card = firstCard(t.view());
      id = card.recruit.id;
      t.relay.crew('hicks', { do: 'hire', recruit: id });
      return { t, id };
    };
    const send = (o: ReturnType<typeof open>, errand: string) => o.t.relay.crew('hicks', { do: 'send', recruit: o.id, errand });
    const row = (v: CrewView, o: Partial<CrewView['errands'][number]>) => [{ ...v.errands[0], ...o }];
    it('a full stash refuses COLLECT, counting lots on the way back', () => {
      expect(send(open((v) => ({ stashFull: true, errands: row(v, { id: 'pull-drive:strand:data@0', group: 'collect' }) })), 'pull-drive:strand:data@0')).toBe('STASH FULL');
    });
    it('a lot already on a sale refuses a second', () => {
      expect(send(open(() => ({ stash: [{ id: 's1', kind: 'data', label: 'Data', value: 380, nightsLeft: 3, stale: false, damaged: false, district: 'strand', out: { recruit: 'r-x' } }] })), 'sell:s1:karasu@0')).toBe("that lot's already out");
    });
    it('Buy It Cheap needs the sol', () => {
      expect(send(open((v) => ({ errands: row(v, { id: 'buy-cheap:strand:data@0', cost: 99999 }) })), 'buy-cheap:strand:data@0')).toBe('that takes 99999 sol');
    });
    it('a recruit with no way to sell in a district is refused', () => {
      expect(send(open((v) => ({ errands: row(v, { id: 'sell:s1:karasu@0', lot: 's1', odds: {} }) })), 'sell:s1:karasu@0')).toBe("can't sell there");
    });
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
    expect(withM(member('job', { ...empty, job: 'Back Door' })).relay.crew('hicks', { do: 'send', recruit: 'r-s', errand: H })).toBe("Pell's on a job");
    expect(withM(member('job', { ...empty, job: 'Back Door' })).relay.crew('hicks', { do: 'letgo', recruit: 'r-s' })).toBe("Pell's on a job");
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
    const r = s.built.world.branch('nix', 'n10', 'A branch');
    if (r === 'unknown' || 'busy' in r) throw new Error(`branch failed: ${JSON.stringify(r)}`);
    const m = s.built.world.kitOf(s.pt.player, 1200 + 5 * 60)!.crew.members[0];
    expect(m).toMatchObject({ state: 'ready', log: [] });
  });

  it('branch copies crew', async () => {
    const s = await start();
    hireThenSend(s.db, s.pt.player);
    s.db.close();
    const r = s.built.world.branch('nix', 'n30', 'A branch');
    if (r === 'unknown' || 'busy' in r) throw new Error(`branch failed: ${JSON.stringify(r)}`);
    expect(s.built.world.kitOf(s.pt.player, 1200 + 5 * 60)!.crew.members.map((m) => m.recruit.id)).toEqual(['r-juno']);
  });
});

describe('crew phase 2 actions (crew spec §5)', () => {
  const cass = { contact: 'cass', name: 'Cass', place: 'the-tilt', placeName: 'The Tilt', district: 'strand', spec: 'face' as const };
  const vouchedCard = (t: ReturnType<typeof relayWith>) => t.view().hires.find((h) => h.vouched)!.cards[0];

  it('hiring a vouched card writes loyalty 70, cost 0 and vouched', () => {
    const t = relayWith({ here: 'the-tilt', vouchers: [cass] });
    const c = vouchedCard(t);
    expect(t.relay.crew('hicks', { do: 'hire', recruit: c.recruit!.id })).toMatchObject({ ok: true });
    expect(parseCrewEvents(t.db.getMeta(crewKey('hicks', c.recruit!.id)))).toEqual([{ type: 'hire', at: evening, recruit: c.recruit, place: 'the-tilt', cost: 0, loyalty: 70, vouched: 'cass' }]);
    expect(t.view().roster[0]).toMatchObject({ loyalty: 70, vouched: 'cass' });
    expect(t.view().sol).toBe(1000);
  });

  it('a vouched card is hired at her home place only', () => {
    const t = relayWith({ vouchers: [cass] });
    expect(t.relay.crew('hicks', { do: 'hire', recruit: vouchedCard(t).recruit!.id })).toBe('you hire at The Tilt');
  });

  it('a free card on a full roster says no free slot', () => {
    const t = relayWith({ here: 'the-tilt', vouchers: [cass] });
    for (const id of ['r-x1', 'r-x2', 'r-x3', 'r-x4']) {
      const r: Recruit = { id, name: 'X', face: null, origin: 'strand', spec: 'face', grade: 0, traits: [], hidden: null, pitch: '', wage: 25 };
      t.db.setMeta(crewKey('hicks', id), JSON.stringify([{ type: 'hire', at: 1100, recruit: r, place: 'low-roller', cost: 0 }]));
    }
    expect(t.relay.crew('hicks', { do: 'hire', recruit: vouchedCard(t).recruit!.id })).toBe('no free slot');
  });

  it('rewinding past a free hire puts the card back', () => {
    const t = relayWith({ here: 'the-tilt', vouchers: [cass] });
    const id = vouchedCard(t).recruit!.id;
    t.relay.crew('hicks', { do: 'hire', recruit: id });
    expect(t.view().hires.some((h) => h.vouched)).toBe(false);
    // A rewind takes the hire's write back: its list is as it was before.
    t.db.setMeta(crewKey('hicks', id), JSON.stringify([]));
    expect(vouchedCard(t).recruit!.id).toBe(id);
  });

  const dez: Recruit = { id: 'dez', name: 'Dez Vance', face: null, origin: 'strand', spec: 'runner', grade: 1, traits: [], hidden: null, pitch: '', wage: 40 };
  const taken: FoldJob[] = [{ key: 'quest.hicks.back-door@0', title: 'Back Door', district: 'strand', setup: { approach: 'quiet', people: ['dez'], favour: false, at: 1100 }, calls: [{ beat: 'b', choice: 'c', card: 'dez', again: true, at: 1110, loss: 'held' }], end: { at: 1120, tier: 'blown', getOut: false } }];
  const springs = ['spring-loud', 'spring-quiet'].map((id) => ({ id, kind: 'mission', spring: true }) as QuestEntry);
  const heldRelay = (questBook: QuestEntry[] = springs) => {
    const t = relayWith({ jobs: taken, questBook });
    t.db.setMeta(crewKey('hicks', 'dez'), JSON.stringify([{ type: 'hire', at: 1000, recruit: dez, place: 'low-roller', cost: 0 }]));
    return t;
  };

  it('spring writes the picked spring file; a second tonight refuses', () => {
    const t = heldRelay();
    expect(t.view().roster[0]).toMatchObject({ state: 'held', canSpring: true });
    expect(t.relay.crew('hicks', { do: 'spring', recruit: 'dez' })).toMatchObject({ ok: true });
    const ev = parseCrewEvents(t.db.getMeta(crewKey('hicks', 'dez'))).at(-1)!;
    expect(ev).toMatchObject({ type: 'spring', at: evening });
    expect(['spring-loud', 'spring-quiet']).toContain((ev as { job: string }).job);
    expect(t.relay.crew('hicks', { do: 'spring', recruit: 'dez' })).toBe('one rescue a night');
  });

  it('spring refuses when not held, or with no rescue written', () => {
    const t = relayWith({ questBook: springs });
    const id = firstCard(t.view()).recruit!.id;
    t.relay.crew('hicks', { do: 'hire', recruit: id });
    expect(t.relay.crew('hicks', { do: 'spring', recruit: id })).toBe(`${firstCard(relayWith().view()).recruit!.name.split(' ')[0]} isn't held`);
    expect(heldRelay([]).relay.crew('hicks', { do: 'spring', recruit: 'dez' })).toBe('no rescue written');
  });
});

describe('abilities through the relay (crew abilities spec §4)', () => {
  const hired = () => {
    const t = relayWith();
    const card = firstCard(t.view());
    t.relay.crew('hicks', { do: 'hire', recruit: card.recruit.id });
    return { ...t, id: card.recruit.id, name: card.recruit.name.split(' ')[0], ability: card.recruit.abilities![0] };
  };
  const evs = (t: ReturnType<typeof hired>) => parseCrewEvents(t.db.getMeta(crewKey('hicks', t.id)));
  it('unslot then slot: two events, and the view follows', () => {
    const t = hired();
    expect(t.view().roster[0].slotted).toEqual([t.ability]);
    expect(t.relay.crew('hicks', { do: 'unslot', recruit: t.id, ability: t.ability })).toMatchObject({ ok: true });
    expect(t.view().roster[0].slotted).toEqual([]);
    expect(t.relay.crew('hicks', { do: 'unslot', recruit: t.id, ability: t.ability })).toBe("that isn't slotted");
    expect(t.relay.crew('hicks', { do: 'slot', recruit: t.id, ability: t.ability })).toMatchObject({ ok: true });
    expect(evs(t).slice(1)).toEqual([{ type: 'unslot', at: evening, ability: t.ability }, { type: 'slot', at: evening, ability: t.ability }]);
    expect(t.relay.crew('hicks', { do: 'slot', recruit: t.id, ability: t.ability })).toBe('already slotted');
    expect(t.relay.crew('hicks', { do: 'slot', recruit: t.id, ability: 'cover' })).toBe(`${t.name} doesn't know that`);
  });
  it('slot while out is refused with the send line', () => {
    const t = hired();
    t.relay.crew('hicks', { do: 'unslot', recruit: t.id, ability: t.ability });
    t.relay.crew('hicks', { do: 'send', recruit: t.id, errand: H });
    const back = t.view().roster[0].due!;
    const hhmm = `${String(Math.floor((back % 1440) / 60)).padStart(2, '0')}:${String(back % 60).padStart(2, '0')}`;
    expect(t.relay.crew('hicks', { do: 'slot', recruit: t.id, ability: t.ability })).toBe(`${t.name}'s still out. Back ${hhmm}.`);
  });
  it('a full slot needs out to swap', () => {
    const base = hired();
    const other = base.ability === 'smooth' ? 'read-room' : 'smooth';
    const t = relayWith({ view: () => {
      const v = base.view();
      return { ...v, roster: v.roster.map((m) => ({ ...m, abilities: [base.ability, other] })) };
    } });
    expect(t.relay.crew('hicks', { do: 'slot', recruit: base.id, ability: other })).toBe('no free slot');
    expect(t.relay.crew('hicks', { do: 'slot', recruit: base.id, ability: other, out: base.ability })).toMatchObject({ ok: true });
  });
  it('learn from an open pick; refusals', () => {
    const base = hired();
    const pick = (picks: { grade: 0 | 1 | 2 | 3; offer: string[] }[]) =>
      relayWith({ view: () => {
        const v = base.view();
        return { ...v, roster: v.roster.map((m) => ({ ...m, picks })) };
      } });
    expect(pick([]).relay.crew('hicks', { do: 'learn', recruit: base.id, ability: 'cover', grade: 1 })).toBe(`no pick waiting for ${base.name}`);
    const t = pick([{ grade: 1, offer: ['cover', 'smooth'] }]);
    expect(t.relay.crew('hicks', { do: 'learn', recruit: base.id, ability: 'read-room', grade: 1 })).toBe(`that isn't on ${base.name}'s pick`);
    expect(t.relay.crew('hicks', { do: 'learn', recruit: base.id, ability: 'cover', grade: 1 })).toMatchObject({ ok: true });
    expect(parseCrewEvents(t.db.getMeta(crewKey('hicks', base.id)))).toEqual([{ type: 'learn', at: evening, ability: 'cover', grade: 1 }]);
  });
});
