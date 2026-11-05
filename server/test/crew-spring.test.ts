import { dealAs } from './settle';
import { facesFor } from '../../shared/dice';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CrewView, Debrief, ServerEvent } from '../../shared/types';
import { ChatRelay, type ChatRelayDeps } from '../src/chat-relay';
import { fakeBackend, reply } from './fixtures/backend';
import { fakePlayers } from './fixtures/players';
import { openDb, type Db } from '../src/db';
import { Journal } from '../src/journal';
import { ROOM_INSTRUCTIONS } from '../src/instructions';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import { generateScenes } from '../../tools/gen-placeholders';
import { flagsOf, parseQuestFile, parseRun, questKey, type QuestEntry, type QuestStatus } from '../../shared/quests';
import { MISSION } from '../../shared/quests.fixture';
import { foldKit, type KitEvent } from '../../shared/mission';
import { foldWithCrew, type CrewEvent, type CrewMember, type CrewState, type FoldJob } from '../../shared/crew-fold';
import { emptyCrewBook } from '../../shared/crew-book';
import type { Recruit } from '../../shared/crew';
import { DEFAULT_STATS, nerveMax } from '../../shared/stats';

// Crew spec §5: SPRING THEM's rescue on the board, and gives: recruit at a job's end.

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spring-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
const dbs: Db[] = [];
afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});

const known = { roster: null, places: null, decks: null };
const entry = (id: string, text: string): QuestEntry => {
  const r = parseQuestFile(id, text, known);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
const SPRING = entry(
  'spring-quiet',
  MISSION.replace('starts: haes-noodles\n', 'spring: true\n')
    .replace('title: Night Shift', 'title: Get {recruit} Out')
    .replace('pay: 400\n---', '---')
    .replace('*The office is two floors up', '*Get {recruit} out. The office is two floors up'),
);
const GIVES = entry('night-shift', MISSION.replace('*Clean.*\npay: 400\n', '*Clean.*\npay: 400\ngives: recruit muscle hand\n'));

const dez: Recruit = { id: 'dez', name: 'Dez Vance', face: null, origin: 'strand', spec: 'runner', grade: 1, traits: [], hidden: null, pitch: '', wage: 40 };
// Dez is taken on a call at 19:10 (story day 0) and held.
const taken: FoldJob = { key: 'quest.hicks.back-door@0', title: 'Back Door', district: 'karasu', setup: { approach: 'quiet', people: ['dez'], favour: false, at: 1140 }, calls: [{ beat: 'b', choice: 'c', card: 'dez', again: true, at: 1150, loss: 'held' }], end: { at: 1160, tier: 'blown', getOut: false } };

function relayWith(o: { book?: QuestEntry[]; hiredAt?: string; dezEvents?: CrewEvent[]; rolls?: number[]; now?: number; crew?: () => CrewState; told?: () => number | null; full?: boolean } = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  dbs.push(db);
  const events: ServerEvent[] = [];
  const backend = fakeBackend(() => reply('Hm.'));
  const rolls = [...(o.rolls ?? [])];
  const contact = 'nix-direct';
  let now = o.now ?? 1200;
  const status = (p: string): QuestStatus[] =>
    db.metaWithPrefix(`quest.${p}.`).flatMap(({ k, v }) => {
      const run = parseRun(v);
      return run ? [{ id: k.slice(`quest.${p}.`.length), contact, run }] : [];
    });
  const kit = (p: string) => foldKit({ deck: null, nerveMax: nerveMax(DEFAULT_STATS), from: 1100 }, status(p).flatMap((s) => (s.run.kit ?? []) as KitEvent[]), now, { districtOf: () => 'karasu' });
  const crewState = o.crew ?? (() =>
    foldWithCrew({
      start: { deck: null, nerveMax: 2, from: 1100 },
      kitEvents: [],
      crew: [[{ type: 'hire', at: 1100, recruit: dez, place: o.hiredAt ?? 'haes-noodles', cost: 0 }, ...(o.dezEvents ?? [{ type: 'spring', at: 1170, job: 'spring-quiet' }])]],
      now,
      book: emptyCrewBook(),
      seed: 'pt',
      instance: () => null,
      jobs: [taken],
    }).crew);
  const crewView = (): CrewView => {
    const m = crewState().members[0];
    return { roster: [{ ...m, traitsShown: [], hiddenTraits: 0, word: 'STEADY', line: '', next: 'PRO', canSpring: false, springWhy: 'one rescue a night', springPlace: null, vouchedBy: null, slots: 1 }], slots: 3, used: o.full ? 3 : 1, sol: 2000, wages: 40, nextSix: 0, here: 'haes-noodles', hires: [], errands: [], results: [], traits: {}, abilities: {} };
  };
  const quests: NonNullable<ChatRelayDeps['quests']> = {
    contact,
    book: () => o.book ?? [SPRING],
    status,
    placeId: () => 'haes-noodles',
    contactName: (id) => id,
    placeName: (id) => id,
    districtOf: (place) => (place === 'haes-noodles' ? 'karasu' : place === 'low-roller' ? 'strand' : null),
    ctx: (p) => ({ flags: flagsOf(status(p)), trust: 'mid', warmth: 'mid', with: contact, heat: 0, deck: null, stats: DEFAULT_STATS }),
    kit,
    decks: () => [],
    crewState,
    crewView,
    ...(o.told ? { crewToldUntil: o.told } : {}),
    jobRecruit: (o2) => ({ ...dez, id: `r-${o2.runKey}`, name: 'Saida Rahm', spec: o2.spec, grade: o2.grade }),
  };
  const relay = new ChatRelay({
    players: fakePlayers(),
    backend,
    db,
    room: new Room(registry),
    journal: new Journal(db),
    emit: (e) => events.push(e),
    instructions: 'ROOM NOTE',
    quests,
    rollDice: (n: number, keep: 'high' | 'low') => facesFor(rolls.shift() ?? 6, n, keep),
    clockNow: () => now,
  });
  return { relay, db, events, backend: backend as ReturnType<typeof fakeBackend>, setNow: (n: number) => (now = n) };
}

const springKey = questKey('hicks', 'spring-quiet@0');

describe('SPRING THEM on the board (crew spec §5)', () => {
  it("a sprung recruit's rescue lists at the place they were hired, at their grade's tier", () => {
    const open = relayWith().relay.questState('hicks').open;
    expect(open.map((o) => o.id)).toEqual(['spring-quiet']);
    // HAND (grade 1) is tier 2.
    expect(open[0].mission).toMatchObject({ tier: 2 });
  });

  it('not at another place, and not without tonight’s spring', () => {
    expect(relayWith({ hiredAt: 'low-roller' }).relay.questState('hicks').open).toEqual([]);
    expect(relayWith({ dezEvents: [] }).relay.questState('hicks').open).toEqual([]);
  });

  it('not the next night', () => {
    const t = relayWith();
    t.setNow(1200 + 1440);
    expect(t.relay.questState('hicks').open).toEqual([]);
  });

  it('starting it names them and marks the run', async () => {
    const t = relayWith();
    expect(await t.relay.startQuest('hicks', 'spring-quiet')).toMatchObject({ ok: true });
    const run = parseRun(t.db.getMeta(springKey))!;
    expect(run.spring).toEqual({ recruit: 'dez', place: 'haes-noodles', tier: 2 });
    const rows = t.db.recentMessages('hicks', 10).filter((m) => m.mode === 'quest');
    expect(rows.some((m) => m.text.includes('Get Dez out'))).toBe(true);
    expect(rows.some((m) => m.text.includes('{recruit}'))).toBe(false);
  });

  it("a spring job's heat lands in the district where they were hired", async () => {
    const t = relayWith({ rolls: [1, 6] });
    await t.relay.startQuest('hicks', 'spring-quiet');
    await t.relay.chooseQuest('hicks', { id: 'spring-quiet', beat: 'door', choice: 'roof' });
    dealAs(t.db, springKey, ['heat'], 1);
    await t.relay.chooseQuest('hicks', { id: 'spring-quiet', beat: 'door', choice: '!take' });
    const kit = parseRun(t.db.getMeta(springKey))!.kit ?? [];
    const heat = kit.filter((e) => e.heat);
    expect(heat.length).toBeGreaterThan(0);
    expect(heat.every((e) => e.district === 'karasu')).toBe(true);
  });

  it('bail or LEAVE THEM is refused while their rescue is under way', async () => {
    const t = relayWith();
    await t.relay.startQuest('hicks', 'spring-quiet');
    expect(t.relay.crew('hicks', { do: 'bail', recruit: 'dez' })).toBe("Dez's rescue is under way");
    expect(t.relay.crew('hicks', { do: 'leave', recruit: 'dez' })).toBe("Dez's rescue is under way");
  });
});

describe('mid-run review fixes (crew phase 2)', () => {
  it("her opening prompt names them, never {recruit}", async () => {
    const t = relayWith();
    await t.relay.startQuest('hicks', 'spring-quiet');
    const sent = t.backend.reqs[0].messages.at(-1)!.content;
    expect(sent).toContain('Get Dez Out');
    expect(sent).not.toContain('{recruit}');
  });

  it('a rescue still running past 06:00 keeps bail, LEAVE THEM and SPRING THEM locked (deferred minor)', async () => {
    // Sprung at 05:30 that night, started at 05:40.
    const u = relayWith({ now: 360 + 1440 - 20, dezEvents: [{ type: 'spring', at: 360 + 1440 - 30, job: 'spring-quiet' }] });
    expect(await u.relay.startQuest('hicks', 'spring-quiet')).toMatchObject({ ok: true });
    u.setNow(360 + 1440 + 15);
    expect(u.relay.crew('hicks', { do: 'bail', recruit: 'dez' })).toBe("Dez's rescue is under way");
    expect(u.relay.crew('hicks', { do: 'spring', recruit: 'dez' })).toBe("Dez's rescue is under way");
  });

  it("a rescue left from last night doesn't lock bail", async () => {
    const t = relayWith();
    await t.relay.startQuest('hicks', 'spring-quiet');
    t.setNow(1200 + 1440);
    expect(t.relay.crew('hicks', { do: 'bail', recruit: 'dez' })).not.toBe("Dez's rescue is under way");
  });

  it('a rescue started without a SETUP card still carries one (its end frees them)', async () => {
    const t = relayWith();
    await t.relay.startQuest('hicks', 'spring-quiet');
    expect(parseRun(t.db.getMeta(springKey))!.setup).toMatchObject({ approach: 'quiet', people: [], favour: false });
  });
});

describe('gives: recruit at a job end (crew spec §5)', () => {
  it('sets run.recruit and the debrief line', async () => {
    const t = relayWith({ book: [GIVES], dezEvents: [], rolls: [6, 6] });
    await t.relay.startQuest('hicks', 'night-shift');
    await t.relay.chooseQuest('hicks', { id: 'night-shift', beat: 'door', choice: 'roof' });
    await t.relay.chooseQuest('hicks', { id: 'night-shift', beat: 'desk', choice: 'wipe' });
    const run = parseRun(t.db.getMeta(questKey('hicks', 'night-shift@0')))!;
    expect(run.done).toBe(true);
    expect(run.recruit).toEqual({ spec: 'muscle', grade: 1 });
    const debrief = t.db.recentMessages('hicks', 20).flatMap((m) => (m.quest?.debrief ? [m.quest.debrief as Debrief] : [])).at(-1)!;
    expect(debrief.recruit).toBe('RECRUIT · SAIDA RAHM WANTS IN');
  });

  it('on a full roster the line says so (deferred minor)', async () => {
    const t = relayWith({ book: [GIVES], dezEvents: [], rolls: [6, 6], full: true });
    await t.relay.startQuest('hicks', 'night-shift');
    await t.relay.chooseQuest('hicks', { id: 'night-shift', beat: 'door', choice: 'roof' });
    await t.relay.chooseQuest('hicks', { id: 'night-shift', beat: 'desk', choice: 'wipe' });
    const debrief = t.db.recentMessages('hicks', 20).flatMap((m) => (m.quest?.debrief ? [m.quest.debrief as Debrief] : [])).at(-1)!;
    expect(debrief.recruit).toBe('RECRUIT · SAIDA RAHM WANTS IN · NO FREE SLOT');
  });
});

describe('the [crew] line (crew spec §5)', () => {
  const juno = (log: { at: number; line: string; from?: 'job' }[]): CrewState => ({
    members: [{ recruit: { ...dez, id: 'juno', name: 'Juno Sato' }, state: 'ready', busy: false, runs: { clean: 1, messy: 0, blown: 0 }, toNext: 2, loyalty: 55, revealed: [], log: log.map((l) => ({ band: 'clean', fate: null, effects: '', ...l })), goneUsed: false, hired: { at: 0, place: 'haes-noodles' }, abilities: [], slotted: [], picks: [] } as CrewMember],
    prep: {},
    scouted: [],
    taken: [],
    latest: null,
    wages: 0,
  });
  const sent = (t: ReturnType<typeof relayWith>, i: number) => t.backend.reqs[i].messages.at(-1)!.content;

  it('a contact turn carries what landed since, once; the next turn does not', async () => {
    let told: number | null = null;
    const t = relayWith({ book: [], crew: () => juno([{ at: 1150, line: 'Juno got back from casing the Tilt, clean.' }]), told: () => told });
    await t.relay.send('hicks', 'hey');
    expect(sent(t, 0)).toContain('[crew] Juno got back from casing the Tilt, clean.');
    told = JSON.parse(t.db.getMeta('crewTold.hicks')!).until;
    t.setNow(1230);
    await t.relay.send('hicks', 'again');
    expect(sent(t, 1)).not.toContain('[crew]');
  });

  it('a regenerate of the same reply carries the same [crew] line', async () => {
    let told: number | null = null;
    const t = relayWith({ book: [], crew: () => juno([{ at: 1150, line: 'Juno came back.' }]), told: () => told });
    await t.relay.send('hicks', 'hey');
    told = JSON.parse(t.db.getMeta('crewTold.hicks')!).until;
    const reply = t.db.recentMessages('hicks', 5).find((m) => m.role === 'agent')!;
    await t.relay.regenerate('hicks', reply.id);
    expect(sent(t, 1)).toContain('[crew] Juno came back.');
  });

  it("job results aren't in it", async () => {
    const t = relayWith({ book: [], crew: () => juno([{ at: 1150, line: 'Juno walked off Back Door clean.', from: 'job' }]) });
    await t.relay.send('hicks', 'hey');
    expect(sent(t, 0)).not.toContain('[crew]');
  });

  it('with nothing told yet, the last six story hours only', async () => {
    const t = relayWith({ book: [], crew: () => juno([{ at: 1200 - 400, line: 'Old news.' }, { at: 1190, line: 'Fresh.' }]) });
    await t.relay.send('hicks', 'hey');
    expect(sent(t, 0)).toContain('[crew] Fresh.');
    expect(sent(t, 0)).not.toContain('Old news.');
  });

  it('her room rule says what the line is', () => {
    expect(ROOM_INSTRUCTIONS).toContain("A [crew] line says what the player's crew did off-screen since you last spoke.");
  });
});
