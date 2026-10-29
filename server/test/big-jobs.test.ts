import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { QuestState, ServerEvent } from '../../shared/types';
import type { TurnRequest } from '../src/backend';
import { ChatRelay, type ChatRelayDeps } from '../src/chat-relay';
import { fakeBackend, reply } from './fixtures/backend';
import { fakePlayers } from './fixtures/players';
import { openDb, type Db } from '../src/db';
import { JOB_AFTER_READ, MISSION_OPEN } from '../src/instructions';
import { Journal } from '../src/journal';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import { generateScenes } from '../../tools/gen-placeholders';
import { flagsOf, parseQuestFile, parseRun, questKey, type QuestEntry, type QuestStatus } from '../../shared/quests';
import { BIG, JOB } from '../../shared/quests.fixture';
import { foldKit, heatIn, type KitEvent } from '../../shared/mission';
import type { Deck } from '../../shared/gear';
import { edgeMax, type Stats } from '../../shared/stats';
import { postedBig } from '../../shared/board';

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'big-jobs-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
const dbs: Db[] = [];
afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
});

const DECKS: Deck[] = [{ id: 'stall-build', name: 'Stall build', bonus: 15, heat: 0, traits: ['fragile'] }];
const HICKS: Stats = { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 };
const known = { roster: null, places: null, decks: new Set(DECKS.map((d) => d.id)) };
const parse = (text: string, id: string) => {
  const r = parseQuestFile(id, text, known);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
export const GATE = parse(BIG, 'north-gate');
const BACK = parse(JOB, 'back-door');
const NAMES: Record<string, string> = { 'haes-noodles': "Hae's Noodles", 'ferry-stairs': 'Ferry Stairs', 'lowlight-intake': 'Lowlight Intake', 'the-tilt': 'The Tilt' };

/** The story clock at 20:00 on story day `d`. */
export const evening = (d: number) => 360 + d * 1440 + 840;
/** A story day whose board at Hae's posts `id` (with GATE and its twin in the book). */
function dayPosting(book: QuestEntry[], id: string, tier: 3 | 4 = 3): number {
  for (let d = 0; d < 200; d++) if (postedBig({ book, place: 'haes-noodles', tier, day: d, seed: 'pt-1' }) === id) return d;
  throw new Error('never posted');
}

/** Hicks with Nix, starting at Hae's (karasu), rep 50 there (TRUSTED: big jobs). `go(place)` moves the room. */
export function bigRelay(o: { rolls?: number[]; book?: QuestEntry[]; stats?: Stats; clock?: () => number; rep?: number; burner?: number; testGig?: 'clean' | 'close' | 'fail'; sol?: number; stock?: boolean } = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  dbs.push(db);
  const events: ServerEvent[] = [];
  const backend = fakeBackend(() => reply('Hm.'));
  const rolls = [...(o.rolls ?? [])];
  const stats = o.stats ?? HICKS;
  const contact = 'nix-direct';
  const book = o.book ?? [GATE];
  let clock = o.clock ?? (() => evening(dayPosting(book, book.find((q) => q.kind === 'big')!.id)));
  let place = 'haes-noodles';
  const status = (p: string): QuestStatus[] =>
    db.metaWithPrefix(`quest.${p}.`).flatMap(({ k, v }) => {
      const run = parseRun(v);
      return run ? [{ id: k.slice(`quest.${p}.`.length), contact: contactOfRuns, run }] : [];
    });
  const seed: KitEvent[] = [
    { at: 0, rep: { district: 'karasu', delta: o.rep ?? 50 } },
    ...(o.burner ? [{ at: 0, cover: { id: 'burner' as const, delta: o.burner } }] : []),
    ...(o.sol ? [{ at: 0, sol: o.sol }] : []),
  ];
  /** Runs started with someone else show up as that contact's (the "elsewhere" list). */
  let contactOfRuns = contact;
  const kit = (p: string, at?: number) =>
    foldKit({ deck: 'stall-build', edgeMax: edgeMax(stats), from: 0 }, [...seed, ...status(p).flatMap((s) => (s.run.kit ?? []) as KitEvent[])].filter((e) => at === undefined || e.at <= at), at ?? clock(), {
      districtOf: () => 'karasu',
    });
  const quests: NonNullable<ChatRelayDeps['quests']> = {
    contact,
    book: () => book,
    status,
    placeId: () => place,
    contactName: (id) => id,
    placeName: (id) => NAMES[id] ?? id,
    ctx: (p) => {
      const k = kit(p);
      return { flags: flagsOf(status(p)), trust: 'mid', warmth: 'mid', with: contact, heat: heatIn(k, 'karasu'), deck: DECKS.find((d) => d.id === k.deck) ?? null, stats };
    },
    kit,
    decks: () => DECKS,
    districtOf: () => 'karasu',
    boardSeed: () => 'pt-1',
    words: () => [],
    ...(o.stock ? { stock: () => ({ 'haes-noodles': [{ id: 'burner', kind: 'cover' as const, price: 100, tier: 1 as const }] }) } : {}),
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
    roll: () => rolls.shift() ?? 50,
    clockNow: () => clock(),
    ...(o.testGig ? { testGig: o.testGig } : {}),
  });
  return {
    relay,
    db,
    events,
    backend: backend as ReturnType<typeof fakeBackend>,
    kit: () => kit('hicks'),
    /** Walk (with Nix) to `to`: the room moves, then her travel turn. */
    go: async (to: string) => {
      const from = place;
      place = to;
      return relay.travel('hicks', { from, to, contact: 'Nix' });
    },
    setClock: (c: () => number) => {
      clock = c;
    },
    run: () => parseRun(db.metaWithPrefix('quest.hicks.north-gate@').at(0)?.v ?? null),
    /** From now on the stored runs read as another contact's. */
    elsewhere: () => {
      contactOfRuns = 'ember';
    },
  };
}
export const lastUser = (r: TurnRequest) => r.messages.at(-1)!.content;
export const questRows = (db: Db) => db.recentMessages('hicks', 80).filter((m) => m.mode === 'quest' && m.role === 'user');
export const states = (events: ServerEvent[]) => events.filter((e): e is { type: 'quest_state'; state: QuestState } => e.type === 'quest_state').map((e) => e.state);

describe('big jobs: posting and the ask', () => {
  it('a big job lists only at Trusted+ in its district, one per board per night, and not while another big job runs', async () => {
    const low = bigRelay({ rep: 40 });
    expect(low.relay.questState('hicks').open.map((o) => o.id)).toEqual([]);
    const twin = parse(BIG.replace('title: North Gate', 'title: South Gate'), 'south-gate');
    const book = [GATE, twin];
    const d = dayPosting(book, 'north-gate');
    const { relay } = bigRelay({ book, clock: () => evening(d) });
    expect(relay.questState('hicks').open.map((o) => o.id)).toEqual(['north-gate']);
    await relay.startQuest('hicks', 'north-gate');
    await relay.chooseQuest('hicks', { id: 'north-gate', beat: 'ask', choice: 'take' });
    // Another night posts the twin, but one big job is running.
    const other = bigRelay({ book });
    expect(other.relay.questState('hicks').open.map((o) => o.id).filter((id) => id === 'south-gate').length).toBeLessThanOrEqual(1);
    expect(relay.questState('hicks').open.map((o) => o.id)).toEqual([]);
  });

  it('the QUEST row carries tier, pay range and stake', () => {
    const { relay } = bigRelay();
    expect(relay.questState('hicks').open[0]).toMatchObject({ id: 'north-gate', big: { tier: 3, range: [1500, 3000], stake: [15, 25] } });
  });

  it('start plays the ask with her opening line; its marks land on the run; the run waits in legwork', async () => {
    const { relay, backend, run } = bigRelay();
    await relay.startQuest('hicks', 'north-gate');
    expect(lastUser(backend.reqs[0])).toContain(MISSION_OPEN);
    await relay.chooseQuest('hicks', { id: 'north-gate', beat: 'ask', choice: 'take' });
    expect(backend.reqs).toHaveLength(1);
    expect(run()).toMatchObject({ beat: null, done: false, big: { section: 'legwork', visited: [], clues: [] } });
    expect(run()!.big!.marks).toEqual([
      { place: 'ferry-stairs', line: 'the courier came through here' },
      { place: 'lowlight-intake', line: "the gate's paperwork" },
    ]);
  });

  it('active.big shows LEGWORK, the go hour, time left and the marks with place names; READ IT NOW is its card', async () => {
    const { relay } = bigRelay();
    await relay.startQuest('hicks', 'north-gate');
    await relay.chooseQuest('hicks', { id: 'north-gate', beat: 'ask', choice: 'take' });
    const a = relay.questState('hicks').active!;
    expect(a).toMatchObject({ id: 'north-gate', beat: '!legwork', choices: [{ id: '!read-now', line: 'READ IT NOW' }] });
    expect(a.big).toMatchObject({
      section: 'legwork',
      go: '03:00',
      clues: [],
      marks: [
        { place: 'ferry-stairs', name: 'Ferry Stairs', line: 'the courier came through here' },
        { place: 'lowlight-intake', name: 'Lowlight Intake', line: "the gate's paperwork" },
      ],
    });
    // The harness clock stands at 20:00: seven hours to 03:00.
    expect(a.big!.left).toBe(420);
  });

  it('small jobs still list and play while a big job is in legwork', async () => {
    const book = [GATE, parse(JOB.replace('tier: 2', 'tier: 1'), 'back-door')];
    const { relay } = bigRelay({ book });
    await relay.startQuest('hicks', 'north-gate');
    await relay.chooseQuest('hicks', { id: 'north-gate', beat: 'ask', choice: 'take' });
    expect(relay.questState('hicks').open.map((o) => o.id)).toEqual(['back-door']);
    expect(await relay.startQuest('hicks', 'back-door')).toEqual({ ok: true, text: 'ok' });
    expect(relay.questState('hicks').active!.id).toBe('back-door');
  });
});

void BACK;

const settle = () => new Promise((r) => setTimeout(r, 30));
/** Take the job: the ask, then TAKE. */
async function taken(r: ReturnType<typeof bigRelay>) {
  await r.relay.startQuest('hicks', 'north-gate');
  await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'ask', choice: 'take' });
}
const at = (hh: number, mm: number, d: number) => 360 + d * 1440 + ((hh * 60 + mm - 360 + 1440) % 1440);

describe('big jobs: legwork', () => {
  it('arriving at a marked place plays its scene once; a second arrival does not', async () => {
    const r = bigRelay();
    await taken(r);
    await r.go('ferry-stairs');
    await settle();
    expect(questRows(r.db).at(-1)!.text).toContain('The last ferry noses in');
    expect(r.run()).toMatchObject({ beat: 'ferry', big: { visited: ['ferry-stairs'] } });
    expect(questRows(r.db).at(-1)!.quest!.silent).toBe(true);
    await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'ferry', choice: 'lean' });
    const rows = questRows(r.db).length;
    await r.go('lowlight-intake');
    await settle();
    await r.go('ferry-stairs');
    await settle();
    expect(questRows(r.db).filter((m) => m.text.includes('The last ferry noses in'))).toHaveLength(1);
    expect(questRows(r.db).length).toBeGreaterThan(rows);
  });

  it("a scene's pick costs the job's minutes; its clue lands on the run; reveals add a mark; back to legwork", async () => {
    let clock = at(22, 0, 3);
    const r = bigRelay({ clock: () => clock });
    await taken(r);
    await r.go('lowlight-intake');
    await settle();
    await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'intake', choice: 'log' });
    expect(questRows(r.db).at(-1)!.clock).toBe(clock + 45);
    expect(r.run()).toMatchObject({ beat: null, done: false, big: { section: 'legwork', clues: ['schedule'] } });
    expect(r.run()!.big!.marks.map((m) => m.place)).toEqual(['ferry-stairs', 'lowlight-intake', 'the-tilt']);
    expect(r.relay.questState('hicks').active!.big!.clues).toEqual([{ id: 'schedule', text: "The north gate's guard changes at 04:00." }]);
    clock += 0;
  });

  it("I1: a quest waiting in her room doesn't freeze the big job: scenes play, the panel stays, READ IT NOW works", async () => {
    const WAITER = parse(
      '---\ntitle: Later\nwith: [nix-direct]\nstarts: haes-noodles\n---\n\n# one\n*A note on the counter.*\n\nview any: You read it.\n\n- go: Pocket it. → went\n- leave: Leave it. → went\n\n## went\n*It says the Tilt, later.*\n→ two\nwait: until 04:00 · at the-tilt\nnext: The Tilt, at four.\n\n# two\n*The Tilt.*\n\nview any: Here.\n\n- done: Done. → fin\n- also: Also. → fin\n\n## fin\n*Done.*\n→ end\n',
      'later',
    );
    const r = bigRelay({ book: [GATE, WAITER] });
    await taken(r);
    await r.relay.startQuest('hicks', 'later');
    await r.relay.chooseQuest('hicks', { id: 'later', beat: 'one', choice: 'go' });
    // The panel: the big job's legwork, with the wait still listed.
    const s = r.relay.questState('hicks');
    expect(s.active).toMatchObject({ id: 'north-gate', big: { section: 'legwork' } });
    expect(s.waiting).toMatchObject({ id: 'later' });
    await r.go('ferry-stairs');
    await settle();
    expect(r.run()).toMatchObject({ beat: 'ferry', big: { visited: ['ferry-stairs'] } });
    await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'ferry', choice: 'lean' });
    expect(await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: '!legwork', choice: '!read-now' })).toEqual({ ok: true, text: 'ok' });
    expect(r.run()).toMatchObject({ beat: '!read', big: { section: 'read' } });
    expect(r.relay.questState('hicks').active).toMatchObject({ id: 'north-gate', beat: '!read' });
  });

  it('an unmarked place with a scene plays nothing', async () => {
    const r = bigRelay();
    await taken(r);
    const rows = questRows(r.db).length;
    await r.go('the-tilt');
    await settle();
    expect(questRows(r.db)).toHaveLength(rows);
    expect(r.run()!.big!.visited).toEqual([]);
  });

  it('a scene plays only where she is (solo arrivals wait for a contact)', async () => {
    const r = bigRelay();
    await taken(r);
    // Nothing plays while the room (hers) stands somewhere unmarked, whoever asks.
    expect(await r.relay.playDueQuest('hicks')).toBeNull();
    await r.go('ferry-stairs');
    await settle();
    expect(r.run()!.beat).toBe('ferry');
  });

  it('a scene waits behind a small job here', async () => {
    const atHome = parse(BIG.replace('marks: ferry-stairs "the courier came through here"', 'marks: haes-noodles "the stall", ferry-stairs "the courier came through here"').replace('# bar at the-tilt', '# stall at haes-noodles\n*The stall, after hours.*\n\n- look: Look under the counter. → nothing\n- ask: Ask Hae. → nothing\n\n# bar at the-tilt'), 'north-gate');
    const back = parse(JOB.replace('tier: 2', 'tier: 1'), 'back-door');
    const r = bigRelay({ book: [atHome, back], rolls: [10, 10] });
    await taken(r);
    await r.relay.startQuest('hicks', 'back-door');
    await r.relay.playDueQuest('hicks');
    expect(r.run()!.big!.visited).toEqual([]);
    await r.relay.chooseQuest('hicks', { id: 'back-door', beat: 'door', choice: 'wait' });
    await r.relay.chooseQuest('hicks', { id: 'back-door', beat: 'desk', choice: 'skim' });
    await settle();
    await r.relay.playDueQuest('hicks');
    await settle();
    expect(r.run()).toMatchObject({ beat: 'stall', big: { visited: ['haes-noodles'] } });
  });

  it('a time variant plays by the hour (before and after 02:00)', async () => {
    const early = bigRelay({ clock: () => at(23, 0, 3) });
    await taken(early);
    await early.go('lowlight-intake');
    await settle();
    expect(questRows(early.db).at(-1)!.text).toContain('watches you over the log');
    const late = bigRelay({ clock: () => at(2, 30, 4) });
    // Started at 02:30 (the go hour hasn't come): the sleeping clerk.
    await taken(late);
    await late.go('lowlight-intake');
    await settle();
    expect(questRows(late.db).at(-1)!.text).toContain('asleep over the log');
  });
});

describe('big jobs: the go hour', () => {
  it('at the go hour the read comes up on the next turn or WAIT; READ IT NOW brings it early', async () => {
    let clock = at(22, 0, 3);
    const r = bigRelay({ clock: () => clock });
    await taken(r);
    expect(await r.relay.playDueQuest('hicks')).toBeNull();
    clock = at(3, 5, 4);
    await r.relay.playDueQuest('hicks');
    expect(r.run()).toMatchObject({ beat: '!read', big: { section: 'read' } });
    const a = r.relay.questState('hicks').active!;
    expect(a.big).toMatchObject({ section: 'read', left: null, read: { parts: ['', ' gets through ', ' because ', '.'] } });
    expect([...a.big!.read!.bank].sort()).toEqual(['the dock', 'the night shift', 'the river']);
    const early = bigRelay({ clock: () => at(22, 0, 3) });
    await taken(early);
    expect(await early.relay.chooseQuest('hicks', { id: 'north-gate', beat: '!legwork', choice: '!read-now' })).toEqual({ ok: true, text: 'ok' });
    expect(early.run()!.big!.section).toBe('read');
  });

  it('the read waits for a scene in progress (a scene beat, then a parked REROLL)', async () => {
    let clock = at(22, 0, 3);
    const r = bigRelay({ clock: () => clock, rolls: [99] });
    await taken(r);
    await r.go('ferry-stairs');
    await settle();
    clock = at(3, 5, 4);
    await r.relay.playDueQuest('hicks');
    expect(r.run()!.beat).toBe('ferry');
    await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'ferry', choice: 'look' });
    expect(r.run()!.pending).toBeTruthy();
    await r.relay.playDueQuest('hicks');
    expect(r.run()!.big!.section).toBe('legwork');
  });

  it('rewind before a scene un-visits it and removes its clue', async () => {
    const r = bigRelay();
    await taken(r);
    const before = r.db.recentMessages('hicks', 80).filter((m) => m.role === 'agent').at(-1)!;
    await r.go('ferry-stairs');
    await settle();
    await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'ferry', choice: 'lean' });
    expect(r.run()!.big!.clues).toEqual(['rumour']);
    await r.relay.rewind('hicks', before.id);
    expect(r.run()!.big).toMatchObject({ visited: [], clues: [] });
  });
});

/** Taken, then at the read (READ IT NOW), after finding `clues` by their scenes. */
async function atRead(r: ReturnType<typeof bigRelay>) {
  await taken(r);
  await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: '!legwork', choice: '!read-now' });
}
const readIt = (r: ReturnType<typeof bigRelay>, picks: [string, string, string]) => r.relay.chooseQuest('hicks', { id: 'north-gate', beat: '!read', choice: '!read', read: picks });
/** A relay whose run already found every clue (the strap, the schedule, the tab), at the read. */
async function withClues(o: Parameters<typeof bigRelay>[0] = {}) {
  const r = bigRelay(o);
  await taken(r);
  const key = r.db.metaWithPrefix('quest.hicks.north-gate@')[0].k;
  const run = r.run()!;
  r.db.setMeta(key, JSON.stringify({ ...run, big: { ...run.big!, clues: ['strap', 'schedule', 'paid'] } }));
  await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: '!legwork', choice: '!read-now' });
  return r;
}

describe('big jobs: the read', () => {
  it('bank words only; full, half and wrong set their flags; wrong starts at ALARM 1; she answers the read row', async () => {
    const full = await withClues();
    const reqs = full.backend.reqs.length;
    expect(await readIt(full, ['the courier', 'the north gate', 'the guard is paid'])).toEqual({ ok: true, text: 'ok' });
    expect(full.run()).toMatchObject({ beat: 'gate', alarm: 0, big: { section: 'approach', read: { level: 'full' } } });
    expect(full.run()!.flags).toMatchObject({ read: 'full', 'read.1': 'right', 'read.2': 'right', 'read.3': 'right' });
    expect(full.backend.reqs.length).toBe(reqs + 1);
    const wrong = await withClues();
    await readIt(wrong, ['the dock', 'the river', 'the courier']);
    expect(wrong.run()).toMatchObject({ alarm: 1, big: { read: { level: 'wrong' } } });
    const bad = await withClues();
    expect(await readIt(bad, ['the courier', 'the courier', 'the dock'])).toBe('that choice has passed');
    expect(await readIt(bad, ['the courier', 'a made-up word', 'the dock'])).toBe('that choice has passed');
    expect(bad.run()!.big!.section).toBe('read');
  });

  it("the read's row and her prompt never name the right words or which blanks were right", async () => {
    const r = await withClues();
    await readIt(r, ['the courier', 'the dock', 'the guard is paid']);
    const row = questRows(r.db).find((m) => m.text.includes('the dock'))!;
    expect(row.text).toContain('the courier gets through the dock because the guard is paid.');
    expect(row.text).not.toContain('the north gate');
    expect(row.text).not.toMatch(/HALF|right|wrong/);
    // The read's turn (the story so far may name the gate; the read must not add it).
    const sent = lastUser(r.backend.reqs.at(-1)!);
    expect(sent).not.toContain('the north gate');
    expect(JSON.stringify(r.backend.reqs.at(-1)!.messages)).not.toMatch(/read\.\d|read=(full|half|wrong)|HALF READ|FULL READ/);
  });
});

describe('big jobs: routes into gigs', () => {
  it('routes carry kind, stepped tier and why; a needs read.1=right route shows only after a right first blank', async () => {
    const r = await withClues();
    await readIt(r, ['the courier', 'the north gate', 'the guard is paid']);
    const a = r.relay.questState('hicks').active!;
    expect(a.big!.section).toBe('approach');
    expect(a.big!.routes!.wire).toMatchObject({ kind: 'hack', tier: 'easy', why: ['−1 YOU KNOW THE GATE'] });
    expect(a.big!.routes!.walk).toMatchObject({ kind: 'slip', tier: 'medium', why: ['−1 YOU KNOW THE TIMING'] });
    expect(a.big!.routes!.paper).toMatchObject({ kind: 'papers', tier: 'medium', brief: { kind: 'papers', tier: 'medium', title: 'North Gate' } });
    const wrong = await withClues();
    await readIt(wrong, ['the dock', 'the north gate', 'the river']);
    expect(wrong.relay.questState('hicks').active!.choices.map((c) => c.id)).toEqual(['wire', 'walk']);
  });

  it('a gig result picks the outcome: clean, close, and each kind\'s failure', async () => {
    for (const [choice, result, text] of [
      ['wire', 'clean', 'nobody the wiser'],
      ['walk', 'close', 'close call at the gate'],
      ['wire', 'traced', 'goes up in alarms'],
      ['walk', 'caught', 'goes up in alarms'],
      ['paper', 'back', 'goes up in alarms'],
    ] as const) {
      const r = await withClues();
      await readIt(r, ['the courier', 'the north gate', 'the guard is paid']);
      const route = r.relay.questState('hicks').active!.big!.routes![choice];
      expect(await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'gate', choice, gig: { result, seed: route.seed } })).toEqual({ ok: true, text: 'ok' });
      expect(questRows(r.db).at(-1)!.text).toContain(text);
      expect(r.run()!.big!.gig).toMatchObject({ choice, kind: route.kind, tier: route.tier, seed: route.seed, result });
    }
  });

  it('a gig pick with the wrong seed or a result of another kind has passed', async () => {
    const r = await withClues();
    await readIt(r, ['the courier', 'the north gate', 'the guard is paid']);
    const seed = r.relay.questState('hicks').active!.big!.routes!.wire.seed;
    expect(await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'gate', choice: 'wire', gig: { result: 'clean', seed: seed + 1 } })).toBe('that choice has passed');
    expect(await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'gate', choice: 'wire', gig: { result: 'caught', seed } })).toBe('that choice has passed');
    expect(await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'gate', choice: 'wire' })).toBe('that choice has passed');
    expect(r.run()!.beat).toBe('gate');
  });

  it('NIX_TEST_GIG resolves a route without a result', async () => {
    const r = await withClues({ testGig: 'fail' });
    await readIt(r, ['the courier', 'the north gate', 'the guard is paid']);
    expect(r.relay.questState('hicks').active!.big!.gigAuto).toBe(true);
    await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'gate', choice: 'walk' });
    expect(r.run()!.big!.gig).toMatchObject({ kind: 'slip', result: 'caught' });
  });

  it('rewind replays the bank and the gig seed', async () => {
    const r = await withClues();
    const bank = r.relay.questState('hicks').active!.big!.read!.bank;
    const before = r.db.recentMessages('hicks', 80).at(-1)!;
    await readIt(r, ['the courier', 'the north gate', 'the guard is paid']);
    const seed = r.relay.questState('hicks').active!.big!.routes!.wire.seed;
    await r.relay.rewind('hicks', before.id);
    expect(r.run()!.big!.section).toBe('read');
    expect(r.relay.questState('hicks').active!.big!.read!.bank).toEqual(bank);
    await readIt(r, ['the courier', 'the north gate', 'the guard is paid']);
    expect(r.relay.questState('hicks').active!.big!.routes!.wire.seed).toBe(seed);
  });
});

describe('big jobs: walking away', () => {
  it('walk away: -5 rep, no heat, done, not listed again tonight; refused once the approach started', async () => {
    const r = bigRelay();
    await taken(r);
    expect(await r.relay.walkAway('hicks', 'north-gate')).toEqual({ ok: true, text: 'ok' });
    expect(r.run()).toMatchObject({ done: true });
    expect(r.kit().rep.karasu).toBe(45);
    expect(r.kit().heat.karasu ?? 0).toBe(0);
    expect(r.relay.questState('hicks').open).toEqual([]);
    const late = await withClues();
    await readIt(late, ['the courier', 'the north gate', 'the guard is paid']);
    expect(await late.relay.walkAway('hicks', 'north-gate')).toBe("you can't walk away now");
  });
});

describe('review fixes (Tasks 3–5)', () => {
  it('I1: a silent big-job row (the take, the go hour, walking away) is refused for REGENERATE and never closes the job', async () => {
    const r = bigRelay();
    await taken(r);
    const take = questRows(r.db).at(-1)!;
    expect(take.quest!.silent).toBe(true);
    expect(await r.relay.regenerate('hicks', take.id)).toEqual({ ok: false, error: 'mission-beat' });
    await r.relay.walkAway('hicks', 'north-gate');
    const walk = questRows(r.db).at(-1)!;
    const reqs = r.backend.reqs.length;
    expect(await r.relay.regenerate('hicks', walk.id)).toEqual({ ok: false, error: 'mission-beat' });
    expect(r.backend.reqs.length).toBe(reqs);
  });

  it('I2: the read row she answers can be retried', async () => {
    const r = await withClues();
    await readIt(r, ['the courier', 'the north gate', 'the guard is paid']);
    const row = questRows(r.db).at(-1)!;
    expect(row.quest!.silent).toBeUndefined();
    expect(await r.relay.retry('hicks', row.id)).not.toEqual({ ok: false, error: 'mission-beat' });
  });

  it("I3: a big job in legwork shows under elsewhere with another contact", async () => {
    const r = bigRelay();
    await taken(r);
    r.elsewhere();
    expect(r.relay.questState('hicks').elsewhere).toEqual([expect.objectContaining({ id: 'north-gate', title: 'North Gate', contact: 'ember' })]);
  });

  it('the fixer sells during legwork (nothing is at a beat); not while a beat of the job is up', async () => {
    const r = bigRelay({ sol: 500, stock: true });
    await r.relay.startQuest('hicks', 'north-gate');
    expect(r.relay.buy('hicks', 'burner')).toBe('not while a job is in progress');
    await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'ask', choice: 'take' });
    expect(r.relay.buy('hicks', 'burner')).toEqual({ ok: true, text: 'ok' });
  });
});


/** Through the read (full) and a route's gig with `result` (seed from the card). */
async function throughGig(r: Awaited<ReturnType<typeof withClues>>, choice: string, result: 'clean' | 'close' | 'traced' | 'caught' | 'back') {
  await readIt(r, ['the courier', 'the north gate', 'the guard is paid']);
  const seed = r.relay.questState('hicks').active!.big!.routes![choice].seed;
  return r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'gate', choice, gig: { result, seed } });
}

describe('big jobs: the end', () => {
  it("a clean big job: +15 rep, the debrief's big part (clues, read level, gig)", async () => {
    const r = await withClues();
    await throughGig(r, 'wire', 'clean');
    const last = questRows(r.db).at(-1)!;
    expect(last.quest!.debrief).toMatchObject({
      tier: 'clean',
      rep: { district: 'karasu', before: 50, after: 65 },
      big: { clues: ["A courier's strap snagged on the ferry railing.", "The north gate's guard changes at 04:00.", "Someone pays the guard's bar tab."], read: 'full', gig: { kind: 'hack', tier: 'easy', result: 'clean' } },
    });
    expect(r.kit().rep.karasu).toBe(65);
    expect(r.run()!.done).toBe(true);
  });

  it('blown with a burner: -25 halved to -12', async () => {
    const r = await withClues({ burner: 1 });
    await throughGig(r, 'wire', 'traced');
    expect(r.relay.questState('hicks').active!.choices.map((c) => c.line)).toContain('USE BURNER (−12 INSTEAD OF −25)');
    await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'gate', choice: '!burner' });
    expect(questRows(r.db).at(-1)!.quest!.debrief).toMatchObject({ tier: 'blown', cover: 'burner', rep: { before: 50, after: 38 } });
  });

  it('custom stake 20 / 30', async () => {
    const book = [parse(BIG.replace('stake: 15 / 25', 'stake: 20 / 30'), 'north-gate')];
    const r = await withClues({ book });
    await throughGig(r, 'wire', 'clean');
    expect(r.kit().rep.karasu).toBe(70);
  });

  it('her closing summary names the read and the gig, never a reserved id', async () => {
    const r = await withClues();
    await throughGig(r, 'wire', 'clean');
    const sent = lastUser(r.backend.reqs.at(-1)!);
    expect(sent).toContain('Their read was right.');
    expect(sent).toContain('The hack, an easy one, went smoothly.');
    expect(sent).not.toMatch(/\[mission summary[^\]]*(FULL|HACK|EASY|CLEAN)/);
    expect(sent).not.toContain('!read');
  });

  it('her line after the read has its own note', async () => {
    const r = await withClues();
    await readIt(r, ['the courier', 'the north gate', 'the guard is paid']);
    expect(lastUser(r.backend.reqs.at(-1)!)).toContain(JOB_AFTER_READ);
  });
});

describe('big jobs: her [job] block', () => {
  it('every turn while a big job runs carries the [job] block; on a marked place it names the line; never an unfound clue or a right word', async () => {
    const r = bigRelay();
    await taken(r);
    await r.relay.send('hicks', 'so where do we start?');
    const block = /\[job — [^\]]+\]/.exec(lastUser(r.backend.reqs.at(-1)!))![0];
    expect(block).toBe('[job — North Gate: legwork, go 03:00 (in 7h).]');
    await r.go('ferry-stairs');
    await settle();
    const arrival = lastUser(r.backend.reqs.at(-1)!);
    expect(arrival).toContain('Here: the courier came through here.');
    await r.relay.chooseQuest('hicks', { id: 'north-gate', beat: 'ferry', choice: 'lean' });
    await r.relay.send('hicks', 'what did he say?');
    const now = lastUser(r.backend.reqs.at(-1)!);
    expect(now).toContain("You hold: The deckhand swears the guard's on SDG pay.");
    expect(now).not.toContain('bar tab');
    expect(now).not.toContain('the guard is paid');
  });

  it('no [job] block once it ends or with none', async () => {
    const none = bigRelay();
    await none.relay.send('hicks', 'hey');
    expect(lastUser(none.backend.reqs.at(-1)!)).not.toContain('[job');
    const r = bigRelay();
    await taken(r);
    await r.relay.walkAway('hicks', 'north-gate');
    await r.relay.send('hicks', 'well then');
    expect(lastUser(r.backend.reqs.at(-1)!)).not.toContain('[job');
  });
});

describe('repFromEnv (e2e)', async () => {
  const { repFromEnv } = await import('../src/mission-run');
  it('reads NIX_TEST_REP=player@district:N[,…] for that player only; unset or bad is none', () => {
    const env = { NIX_TEST_REP: 'cass@karasu:50, cass@velvet:20, hicks@karasu:5' };
    expect(repFromEnv('cass', env)).toEqual([
      { district: 'karasu', delta: 50 },
      { district: 'velvet', delta: 20 },
    ]);
    expect(repFromEnv('nix', env)).toEqual([]);
    expect(repFromEnv('cass', {})).toEqual([]);
    expect(repFromEnv('cass', { NIX_TEST_REP: 'karasu:50' })).toEqual([]);
  });
});

describe('the shipped big jobs (world/quests)', () => {
  const map = JSON.parse(fs.readFileSync('map/lowlight.json', 'utf8')) as { places: { id: string }[] };
  const live = { roster: new Set(fs.readdirSync('characters')), places: new Set(map.places.map((p) => p.id)), decks: null };
  const SHIPPED = [
    { id: 'cold-script', tier: 3, starts: 'second-socket' },
    { id: 'first-cut', tier: 4, starts: 'the-tilt' },
  ] as const;
  for (const s of SHIPPED) {
    it(`${s.id}: parses with no warnings, posts at its tier and not below, and starts into legwork`, async () => {
      const text = fs.readFileSync(`world/quests/${s.id}.md`, 'utf8');
      const r = parseQuestFile(s.id, text, live as never);
      if (!r.ok) throw new Error(JSON.stringify(r.problems));
      expect(r.warnings).toEqual([]);
      expect(r.entry).toMatchObject({ kind: 'big', tier: s.tier, starts: s.starts });
      expect(postedBig({ book: [r.entry], place: s.starts, tier: s.tier, day: 1, seed: 's' })).toBe(s.id);
      expect(postedBig({ book: [r.entry], place: s.starts, tier: (s.tier - 1) as 2 | 3, day: 1, seed: 's' })).toBeNull();
      // Started at the harness's board (Hae's), with the rep its tier needs.
      const q = parse(text.replace(`starts: ${s.starts}`, 'starts: haes-noodles'), s.id);
      // Alone in its pool, it posts every night.
      const { relay, db } = bigRelay({ book: [q], rep: s.tier === 4 ? 80 : 50, clock: () => evening(1) });
      expect(relay.questState('hicks').open.map((o) => o.id)).toEqual([s.id]);
      await relay.startQuest('hicks', s.id);
      await relay.chooseQuest('hicks', { id: s.id, beat: 'ask', choice: 'take' });
      const run = parseRun(db.metaWithPrefix(`quest.hicks.${s.id}@`).at(0)?.v ?? null)!;
      expect(run).toMatchObject({ beat: null, done: false, big: { section: 'legwork' } });
      expect(run.big!.marks.length).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('jobOn for a big job (story moods spec §2)', () => {
  it('a taken big job is on from its go hour, not before', async () => {
    let clock = at(22, 0, 3);
    const r = bigRelay({ clock: () => clock });
    await taken(r);
    expect(r.relay.jobOn('hicks')).toBe(false);
    clock = at(3, 5, 4);
    expect(r.relay.jobOn('hicks')).toBe(true);
  });
});
