/**
 * Crew rules (spec 2026-11-17 crew rules) through the relay: a crew-rules run starts with its hand and the
 * board's view of it; a Graft job's start and view are unchanged.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChatMessage, GuestCard, QuestState } from '../../shared/types';
import { toCompletion } from '../src/history';
import { recentLines } from '../src/encounter';
import { ChatRelay, type ChatRelayDeps } from '../src/chat-relay';
import { recommendedFrom, recommendedJob } from '../src/job-views';
import type { Block } from '../../shared/clock';
import { fakeBackend, reply } from './fixtures/backend';
import type { TurnRequest } from '../src/backend';
import { MISSION_BEAT, MISSION_CLOSE, MISSION_OPEN, MISSION_OPEN_HERS, turnCue } from '../src/instructions';
import { fakePlayers } from './fixtures/players';
import { openDb, type Db } from '../src/db';
import { Journal } from '../src/journal';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import { generateScenes } from '../../tools/gen-placeholders';
import { flagsOf, parseCondition, parseQuestFile, parseRun, questKey, storyFlagsOf, withGetaway, type Condition, type QuestEntry, type QuestStatus } from '../../shared/quests';
import { MISSION } from '../../shared/quests.fixture';
import { foldKit, heatIn, repDelta, type KitEvent } from '../../shared/mission';
import type { Deck } from '../../shared/gear';
import { parsePrograms } from '../../shared/programs';
import { nerveMax, type Stats } from '../../shared/stats';
import { facesFor } from '../../shared/dice';
import { freshCrew, throwLine, throwOf, type CrewState } from '../../shared/crew-rules';
import type { Trait } from '../../shared/crew-book';
import { makeTerminal, parseWords } from '../../shared/crack';
import { validateClientEvent } from '../src/hub';
import { crewView } from '../src/crew-job';
import { missionSummary } from '../src/mission-run';
import type { CondCtx, QuestRun } from '../../shared/quests';
import type { CrewMember } from '../../shared/crew-fold';
import type { Pronoun } from '../../shared/pronoun';
import { DEFAULT_SHARED_STANDING, parseStored, standingKey } from '../../shared/standing';
import { trustControl } from '../src/standing';
import { clockTrust, judgeOf } from '../src/job-end';

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-jobs-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
const dbs: Db[] = [];
afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
});

const DECKS: Deck[] = [
  { id: 'stall-build', name: 'Stall build', quality: 2, heat: 0, traits: [] },
  { id: 'pocket-deck', name: 'Pocket deck', quality: 1, heat: 0, traits: [] },
  { id: 'field-deck', name: 'Field deck', quality: 3, heat: 0, traits: [] },
  { id: 'deaf-meridian', name: 'Deaf Meridian', quality: 3, heat: 1, traits: [] },
];
const PROGRAMS = parsePrograms(fs.readFileSync('world/gear/programs.md', 'utf8')).programs;
const HICKS: Stats = { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 };
const known = { roster: null, places: null, decks: new Set(DECKS.map((d) => d.id)) };
const entry = (id: string, text: string): QuestEntry => {
  const r = parseQuestFile(id, text, known);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
const CREW_TEXT = fs.readFileSync(path.join(__dirname, 'fixtures/crew-fixture.md'), 'utf8');
const CREW_JOB = entry('crew-fixture', CREW_TEXT);
const NIGHT = entry('night-shift', MISSION);
const KEY = questKey('hicks', 'crew-fixture@0');

/** A crew member: ready unless told otherwise. */
function member(id: string, spec: CrewMember['recruit']['spec'], o: Partial<CrewMember> = {}): CrewMember {
  return {
    recruit: { id, name: `${id[0].toUpperCase()}${id.slice(1)} Vance`, face: null, origin: 'karasu', spec, grade: 1, traits: [], hidden: null, pitch: '', wage: 40 },
    state: 'ready',
    abilities: [],
    slotted: [],
    picks: [],
    busy: false,
    runs: { clean: 0, messy: 0, blown: 0 },
    toNext: 5,
    loyalty: 50,
    revealed: [],
    log: [],
    goneUsed: false,
    hired: { at: 0, place: 'low-roller' },
    ...o,
  };
}
const ROSTER = [member('dez', 'runner'), member('mia', 'face')];

/** Hicks at Hae's with Nix, a roster of a runner and a face, every program owned; as missions.test's relayWith. */
const WORDS = Object.values(parseWords(fs.readFileSync('world/gear/words.md', 'utf8')).byLength).flat();
const CAUTIOUS: Trait = { id: 'cautious', label: 'Cautious', good: true, effect: { kind: 'never-held' }, for: 'any', text: '' };

function relayWith(o: { book?: QuestEntry[]; deck?: string | null; nerve?: number; members?: CrewMember[]; guests?: () => GuestCard[]; db?: Db; emit?: (e: unknown) => void; pronoun?: Pronoun; districtOf?: (placeId: string) => string | null; seed?: KitEvent[]; trust?: number } = {}) {
  const db = o.db ?? openDb(':memory:', { defaultPlayer: 'hicks' });
  if (!o.db) dbs.push(db);
  const backend = fakeBackend(() => reply('Hm.'));
  const contact = 'nix-direct';
  const status = (p: string): QuestStatus[] =>
    db.metaWithPrefix(`quest.${p}.`).flatMap(({ k, v }) => {
      const run = parseRun(v);
      return run ? [{ id: k.slice(`quest.${p}.`.length), contact, run }] : [];
    });
  const kit = (p: string) =>
    foldKit({ deck: o.deck === undefined ? 'stall-build' : o.deck, nerveMax: nerveMax(HICKS), from: 1200, programs: PROGRAMS.map((x) => x.id) }, [...(o.seed ?? []), ...(o.nerve !== undefined ? [{ at: 1199, nerve: o.nerve - nerveMax(HICKS) }] : []), ...status(p).flatMap((s) => (s.run.kit ?? []) as KitEvent[])], 1200, { districtOf: () => 'karasu' });
  const quests: NonNullable<ChatRelayDeps['quests']> = {
    contact,
    book: () => o.book ?? [CREW_JOB],
    status,
    placeId: () => 'haes-noodles',
    contactName: (id) => id,
    contactPronoun: () => o.pronoun ?? 'she',
    placeName: (id) => id,
    ctx: (p) => {
      const k = kit(p);
      return { flags: flagsOf(status(p)), trust: 'mid', warmth: 'mid', with: contact, heat: heatIn(k, 'karasu'), deck: DECKS.find((d) => d.id === k.deck) ?? null, stats: HICKS };
    },
    kit,
    decks: () => DECKS,
    programs: () => PROGRAMS,
    crewState: () => ({ members: o.members ?? ROSTER, prep: {}, scouted: [], taken: [], latest: null, wages: 0 }),
    crewTraits: () => [CAUTIOUS],
    words: () => WORDS,
    ...(o.guests ? { guestCards: o.guests } : {}),
    ...(o.districtOf ? { districtOf: o.districtOf } : {}),
  };
  const relay = new ChatRelay({
    players: fakePlayers(),
    backend,
    db,
    room: new Room(registry),
    journal: new Journal(db),
    emit: (e) => o.emit?.(e),
    instructions: 'ROOM NOTE',
    quests,
    rollDice: (n: number, keep: 'high' | 'low') => facesFor(6, n, keep),
    ...(o.trust !== undefined ? { trust: trustControl({ db, name: 'Nix', start: () => ({ trust: o.trust!, warmth: 0 }), config: () => null, shared: () => DEFAULT_SHARED_STANDING }) } : {}),
  });
  return { relay, db, backend };
}
const crewOf = (relay: ChatRelay) => relay.questState('hicks').active?.crew;
const start = (relay: ChatRelay, people: string[], programs: string[] = []) => relay.startQuest('hicks', 'crew-fixture', { crew: true, people, programs });

describe('crew rules: the run and its view', () => {
  it('the fixture parses with no warnings', () => {
    const r = parseQuestFile('crew-fixture', CREW_TEXT, known);
    expect(r.ok && r.warnings).toEqual([]);
  });

  it('starting writes a run with a fresh crew state; the hand is you, the runner, the program and her', async () => {
    const { relay, db } = relayWith();
    expect(await start(relay, ['dez'], ['firewall'])).not.toBeTypeOf('string');
    const run = parseRun(db.getMeta(KEY))!;
    expect(run.crew).toEqual(freshCrew());
    expect(run.setup?.people).toEqual(['dez']);
    expect(run.programs?.map((p) => p.id)).toEqual(['firewall']);
    const hand = crewOf(relay)!.hand;
    expect(hand.map((h) => h.id)).toEqual(['you', 'dez', 'p:firewall', 'contact']);
    expect(hand.map((h) => h.state)).toEqual(['ready', 'ready', 'ready', 'ready']);
    expect(hand.map((h) => h.kind)).toEqual(['you', 'recruit', 'program', 'contact']);
    expect(hand[1]).toMatchObject({ name: 'Dez Vance', spec: 'runner', grade: 1, move: { id: 'loop-the-cams', name: 'LOOP THE CAMS', can: true } });
    expect(hand[2].play).toEqual({ line: expect.any(String), can: true });
  });

  it("a crew run's active carries the board's view and leaves the table's Graft fields out", async () => {
    const { relay } = relayWith();
    await start(relay, ['dez']);
    const active = relay.questState('hicks').active!;
    expect(active.choices).toEqual([
      { id: 'badge', line: 'Show the badge at the gate.' },
      { id: 'round', line: 'Go round the back.' },
    ]);
    expect(active.hand).toBeUndefined();
    expect(active.nerve).toBeUndefined();
    expect(active.costs).toBeUndefined();
    expect(active.take).toEqual({ filled: 0, size: expect.any(Number) });
    expect(active).toMatchObject({ beat: 'yard', alarm: 0, tier: 1 });
  });

  it("a job's guest joins the hand as a recruit of their specialty", async () => {
    const NOA: GuestCard = { id: 'noa', name: 'Noa Vey', accent: '#9fd', portrait: null, spec: 'runner', art: null, line: 'Dark Cart' };
    const withGuest = entry('crew-fixture', CREW_TEXT.replace('tier: 1', 'tier: 1\nguest: noa GREEN'));
    const { relay } = relayWith({ book: [withGuest], guests: () => [NOA] });
    expect(await start(relay, ['guest-noa'])).not.toBeTypeOf('string');
    const v = crewOf(relay)!;
    expect(v.hand[1]).toMatchObject({ id: 'guest-noa', kind: 'recruit', name: 'Noa Vey', spec: 'runner', grade: 0, state: 'ready' });
    expect(v.cards[0].ways.map((w) => w.by)).toEqual(['you', 'you', 'guest-noa']);
  });

  it("a card's ways as they stand: you and the runner, nobody not brought; a face brought throws", async () => {
    const a = relayWith();
    await start(a.relay, ['dez']);
    const badge = crewOf(a.relay)!.cards[0];
    expect(badge).toMatchObject({ id: 'badge', short: 'THE BADGE', line: 'Show the badge at the gate.' });
    expect(badge.ways.map((w) => [w.by, w.name])).toEqual([
      ['you', 'scheduler'],
      ['you', 'branch'],
      ['dez', undefined],
    ]);
    expect(badge.ways[1]).toEqual({ by: 'you', name: 'branch', line: 'Show it the way they taught you.', take: 2, alarm: 0, heat: 0, clocks: { seen: 1 }, cut: 0, lose: 0 });
    expect(badge.throws).toEqual([]);
    expect(crewOf(a.relay)!.cards[1].short).toBe('ROUND');

    const b = relayWith();
    await start(b.relay, ['mia']);
    const [badgeB, roundB] = crewOf(b.relay)!.cards;
    expect(badgeB.ways.map((w) => w.by)).toEqual(['you', 'you']);
    expect(badgeB.throws).toEqual(['mia']);
    expect(roundB.ways.map((w) => w.by)).toEqual(['you', 'mia']);
    expect(roundB.throws).toEqual([]);
  });

  it('the clocks, no mods, and who has a way ahead', async () => {
    const { relay } = relayWith();
    await start(relay, ['dez', 'mia']);
    const v = crewOf(relay)!;
    expect(v.clocks).toEqual([{ id: 'seen', label: 'SEEN', size: 3, value: 0 }]);
    expect(v.mods).toEqual([]);
    expect(v.ahead).toEqual({ hut: ['Dez'], out: ['Mia'] });
  });

  it('a job that bars the carried deck loads from the Pocket deck', async () => {
    const barred = entry('crew-fixture', CREW_TEXT.replace('pay: 400', 'pay: 400\nbars: stall-build'));
    const { relay, db } = relayWith({ book: [barred] });
    const offer = relay.questState('hicks').open[0].setup!;
    expect(offer.deck).toEqual({ name: 'Pocket deck', quality: 1, slots: 1 });
    expect(offer.barred).toBe('Stall build');
    expect(await start(relay, [], ['firewall', 'scrub'])).toBe('NO FREE SLOT');
    expect(await start(relay, [], ['scrub'])).not.toBeTypeOf('string');
    expect(parseRun(db.getMeta(KEY))!.setup?.deck).toEqual({ id: 'pocket-deck', quality: 1, slots: 1 });
    const scrub = crewOf(relay)!.hand.find((h) => h.id === 'p:scrub')!;
    // SCRUB only at ALARM above 0.
    expect(scrub.play).toEqual({ line: expect.any(String), can: false });
  });

  it("a crew-rules job's offer says so (GO IN on the board); a Graft job's doesn't", () => {
    expect(relayWith().relay.questState('hicks').open[0].setup!.rules).toBe('crew');
    const graft = relayWith({ book: [NIGHT] }).relay.questState('hicks').open[0].setup!;
    expect(graft).toBeDefined();
    expect('rules' in graft).toBe(false);
  });

  it('refusals as checkSetup gives them', async () => {
    const many = relayWith({ members: ['a', 'b', 'c', 'd'].map((id) => member(id, 'runner')) });
    expect(await start(many.relay, ['a', 'b', 'c', 'd'])).toBe('at most 3 people');
    const out = relayWith({ members: [member('dez', 'runner', { state: 'out' })] });
    expect(await start(out.relay, ['dez'])).toBe("DEZ ISN'T READY");
    const slots = relayWith();
    expect(await start(slots.relay, [], ['firewall', 'scrub', 'solvent'])).toBe('NO FREE SLOT');
    const graft = relayWith();
    expect(await graft.relay.startQuest('hicks', 'crew-fixture', { approach: 'quiet', people: [], favour: false })).toBeTypeOf('string');
    for (const r of [many, out, slots, graft]) expect(r.db.getMeta(KEY)).toBeNull();
  });

  it('NERVE gone neither refuses nor locks a crew-rules job, and starting spends none', async () => {
    const { relay, db } = relayWith({ nerve: 0 });
    expect(relay.questState('hicks').open[0].locked).toBeUndefined();
    expect(await start(relay, [])).not.toBeTypeOf('string');
    expect(parseRun(db.getMeta(KEY))!.kit ?? []).toEqual([]);
  });

  it("a Graft job's view has no crew, its start is unchanged, and a crew setup is refused there", async () => {
    const { relay, db } = relayWith({ book: [NIGHT] });
    const refused = await relay.startQuest('hicks', 'night-shift', { crew: true, people: [], programs: [] });
    expect(refused).toBeTypeOf('string');
    await relay.startQuest('hicks', 'night-shift');
    const run = parseRun(db.getMeta(questKey('hicks', 'night-shift@0')))!;
    expect(run.crew).toBeUndefined();
    const active = relay.questState('hicks').active as NonNullable<QuestState['active']>;
    expect(active.crew).toBeUndefined();
    expect(active.choices.length).toBeGreaterThan(0);
  });
});

describe('crewView: ways as they stand', () => {
  const firewall = PROGRAMS.find((p) => p.id === 'firewall')!;
  const runAt = (beat: string, o: Partial<QuestRun> = {}): QuestRun => ({ beat, variant: 0, wait: null, picks: [], flags: {}, done: false, at: 0, alarm: 0, setup: { approach: 'quiet', people: ['dez', 'mia'], favour: false, at: 0 }, programs: [{ id: 'firewall', at: 0 }], crew: freshCrew(), ...o });
  const ctxOf = (run: QuestRun): CondCtx => ({ flags: run.flags, trust: null, warmth: null, with: 'nix-direct', alarm: run.alarm ?? 0, counts: run.crew!.clocks });
  const view = (run: QuestRun) => crewView(CREW_JOB, run, CREW_JOB.beats.get(run.beat!)![0], { members: ROSTER, programs: [firewall], contact: { id: 'nix-direct', name: 'Nix' }, you: { id: 'hicks', name: 'Hicks' }, ctx: ctxOf(run) });

  it("carries the beat's title, for the board's head (a plain beat is on no route)", () => {
    const hut = CREW_JOB.beats.get('hut')![0];
    expect(view(runAt('hut')).title).toBe((hut.title ?? 'hut').toUpperCase());
  });

  it("carries the job's one contact, for the comms strip, even with her way spent", () => {
    expect(view(runAt('hut')).contact).toEqual({ id: 'nix-direct', name: 'Nix' });
    expect(view(runAt('hut', { crew: { ...freshCrew(), goes: { contact: 'spent' } } })).contact).toEqual({ id: 'nix-direct', name: 'Nix' });
    const noWay = crewView(CREW_JOB, runAt('hut'), CREW_JOB.beats.get('hut')![0], { members: ROSTER, programs: [firewall], contact: null, owner: { id: 'nix-direct', name: 'Nix' }, you: { id: 'hicks', name: 'Hicks' }, ctx: ctxOf(runAt('hut')) });
    expect(noWay.contact).toEqual({ id: 'nix-direct', name: 'Nix' });
  });

  it('a program and the contact take their ways; a spent one is gone from the card', () => {
    const terminal = view(runAt('hut')).cards[0];
    expect(terminal.ways.map((w) => w.by)).toEqual(['you', 'p:firewall', 'contact', 'dez']);
    expect(terminal.throws).toEqual(['mia']);
    const spent = runAt('hut', { crew: { ...freshCrew(), goes: { 'p:firewall': 'spent', contact: 'spent' } } });
    const v = view(spent);
    expect(v.cards[0].ways.map((w) => w.by)).toEqual(['you', 'dez']);
    expect(v.hand.find((h) => h.id === 'p:firewall')!.state).toBe('spent');
  });

  it("the first way of a key whose if holds: ALARM 2 walks out losing 1; a held door gives the face her way", () => {
    const at0 = view(runAt('out')).cards[0];
    expect(at0.ways).toEqual([{ by: 'you', line: 'Walk out easy.', take: 1, alarm: 1, heat: 0, clocks: {}, cut: 0, lose: 0 }]);
    expect(at0.throws).toEqual(['dez', 'mia']);
    expect(view(runAt('out', { alarm: 2 })).cards[0].ways[0]).toMatchObject({ by: 'you', line: 'Walk out past the lights.', lose: 1 });
    const held = view(runAt('out', { flags: { door: 'held' } })).cards[0];
    expect(held.ways.map((w) => w.by)).toEqual(['you', 'mia']);
    expect(held.throws).toEqual(['dez']);
  });

  it("the beat's mods change the costs on their own beat only; a getaway fills no TAKE", () => {
    const covered = { ...freshCrew(), mods: { noAlarm: true as const }, modsBeat: 'hut' };
    const on = view(runAt('hut', { crew: covered }));
    expect(on.cards[0].ways[0]).toMatchObject({ by: 'you', alarm: 0, take: 1 });
    expect(on.mods).toEqual([{ label: 'COVER STORY', art: '/abilities/cover-story.webp' }]);
    const off = view(runAt('hut', { crew: { ...covered, modsBeat: 'yard' } }));
    expect(off.cards[0].ways[0]).toMatchObject({ alarm: 1 });
    expect(off.mods).toEqual([]);
    expect(view(runAt('getaway', { getaway: true })).cards[0].ways[0]).toMatchObject({ take: 0, heat: 1 });
  });

  it('prints the TAKE that can land: capped at the room left, none at TAKE full; LISTEN IN capped the same (last pass A2)', () => {
    const takes = (run: QuestRun) => view(run).cards[0].ways.map((w) => [w.by, w.take]);
    // The fixture's size is 3. The terminal's ways print 1, 2, 1, 3 with room to spare.
    expect(takes(runAt('hut', { takeFill: 0 }))).toEqual([['you', 1], ['p:firewall', 2], ['contact', 1], ['dez', 3]]);
    expect(takes(runAt('hut', { takeFill: 2 }))).toEqual([['you', 1], ['p:firewall', 1], ['contact', 1], ['dez', 1]]);
    expect(takes(runAt('hut', { takeFill: 3 }))).toEqual([['you', 0], ['p:firewall', 0], ['contact', 0], ['dez', 0]]);
    const listened = { ...freshCrew(), mods: { plusTake: true as const }, modsBeat: 'hut' };
    expect(takes(runAt('hut', { takeFill: 1, crew: listened }))).toEqual([['you', 2], ['p:firewall', 2], ['contact', 2], ['dez', 2]]);
  });
});

const runOf = (db: Db): QuestRun => parseRun(db.getMeta(KEY))!;
const questRows = (db: Db) => db.recentMessages('hicks', 50).filter((m) => m.mode === 'quest');
const send = (relay: ChatRelay, beat: string, choice: string, by?: string) => relay.chooseQuest('hicks', { id: 'crew-fixture', beat, choice, ...(by !== undefined ? { by } : {}) });
const move = (relay: ChatRelay, beat: string, card: string) => relay.crewMove('hicks', { id: 'crew-fixture', beat, card });
const variant = (from: string, to: string) => {
  expect(CREW_TEXT).toContain(from);
  return entry('crew-fixture', CREW_TEXT.replace(from, to));
};
const ADE = member('ade', 'muscle');
const KIT = member('kit', 'ears');

describe('crew rules: sending someone', () => {
  it("a pick by you:scheduler lands the way's take and alarm, plays its outcome as the row, and moves on", async () => {
    const { relay, db } = relayWith();
    await start(relay, []);
    expect(await send(relay, 'yard', 'badge', 'you:scheduler')).not.toBeTypeOf('string');
    const run = runOf(db);
    expect(run).toMatchObject({ beat: 'hut', takeFill: 1, alarm: 1 });
    expect(run.picks.at(-1)).toMatchObject({ beat: 'yard', choice: 'badge' });
    // The pick heads the row, as on a Graft job (what the contact is told), then the outcome.
    expect(questRows(db).at(-1)!.text.startsWith("You show it the way a scheduler would.\n\n*You're in.*")).toBe(true);
    expect(questRows(db).at(-1)!.text).toContain('*The hut, the terminal, the night man asleep.*');
    expect(run.crew).toEqual(freshCrew());
  });

  it('who: refused with nobody named, a you way not standing, a card not in the hand', async () => {
    const { relay, db } = relayWith();
    await start(relay, ['dez']);
    expect(await send(relay, 'yard', 'badge')).toBeTypeOf('string');
    expect(await send(relay, 'yard', 'badge', 'you:nobody')).toBeTypeOf('string');
    expect(await send(relay, 'yard', 'badge', 'mia')).toBeTypeOf('string');
    expect(await send(relay, 'yard', 'badge', 'p:firewall')).toBeTypeOf('string');
    expect(runOf(db).beat).toBe('yard');
    // `you` alone is the first of your ways that stands.
    expect(await send(relay, 'yard', 'badge', 'you')).not.toBeTypeOf('string');
    expect(runOf(db)).toMatchObject({ beat: 'hut', takeFill: 1, alarm: 1 });
  });

  it("the runner's pick spends their go; a second is refused; their HEAT waits for the end", async () => {
    const { relay, db } = relayWith();
    await start(relay, ['dez']);
    await send(relay, 'yard', 'badge', 'dez');
    expect(runOf(db).crew).toMatchObject({ goes: { dez: 'spent' }, heat: 1 });
    expect(runOf(db)).toMatchObject({ beat: 'hut', takeFill: 2, alarm: 0 });
    expect(await send(relay, 'hut', 'terminal', 'dez')).toBeTypeOf('string');
    expect(runOf(db).beat).toBe('hut');
  });

  it("a [seen N] way moves the clock, capped at its size; a later beat's version on seen>=1 plays", async () => {
    const q = variant('# hut\n', '# hut if seen>=1\n\n*The night man is awake, and he saw you.*\n\n- press: Lean on the night man.\n  · you: Lean on him. → found [take 2, alarm 2]\n- wait: Wait him out.\n  · you: Wait. → found [heat 1]\n\n# hut\n');
    const a = relayWith({ book: [q] });
    await start(a.relay, []);
    await send(a.relay, 'yard', 'badge', 'you:branch');
    expect(runOf(a.db).crew!.clocks).toEqual({ seen: 1 });
    expect(runOf(a.db)).toMatchObject({ beat: 'hut', variant: 0 });
    expect(questRows(a.db).at(-1)!.text).toContain('he saw you');
    expect(a.relay.questState('hicks').active!.crew!.clocks).toEqual([{ id: 'seen', label: 'SEEN', size: 3, value: 1 }]);
    const capped = variant('→ in [take 2, seen 1]', '→ in [take 2, seen 5]');
    const b = relayWith({ book: [capped] });
    await start(b.relay, []);
    await send(b.relay, 'yard', 'badge', 'you:branch');
    expect(runOf(b.db).crew!.clocks).toEqual({ seen: 3 });
  });

  it('a [seen -1] way takes the clock down, not below 0; the board shows the move that would land', async () => {
    const q = entry('crew-fixture', CREW_TEXT.replace('→ in [take 2, seen 1]', '→ in [take 2, seen 2]').replace('→ found [take 2, alarm 2]', '→ found [take 2, alarm 2, seen -1]'));
    const pressWay = (relay: ChatRelay) => relay.questState('hicks').active!.crew!.cards.find((c) => c.id === 'press')!.ways[0];
    const a = relayWith({ book: [q] });
    await start(a.relay, []);
    await send(a.relay, 'yard', 'badge', 'you:branch');
    expect(runOf(a.db).crew!.clocks).toEqual({ seen: 2 });
    expect(pressWay(a.relay).clocks).toEqual({ seen: -1 });
    await send(a.relay, 'hut', 'press', 'you');
    expect(runOf(a.db).crew!.clocks).toEqual({ seen: 1 });

    const b = relayWith({ book: [q] });
    await start(b.relay, []);
    await send(b.relay, 'yard', 'round', 'you');
    expect(pressWay(b.relay).clocks).toEqual({ seen: 0 });
    await send(b.relay, 'hut', 'press', 'you');
    expect(runOf(b.db).crew!.clocks).toEqual({ seen: 0 });
  });

  it('a program with a way on a card does the card and is spent', async () => {
    const { relay, db } = relayWith();
    await start(relay, [], ['firewall']);
    await send(relay, 'yard', 'round', 'you');
    await send(relay, 'hut', 'terminal', 'p:firewall');
    expect(runOf(db).crew).toMatchObject({ goes: { 'p:firewall': 'spent' }, clocks: { seen: 1 } });
    expect(runOf(db)).toMatchObject({ beat: 'out', takeFill: 3 });
  });

  it("the contact's way spends her go and sets its flag", async () => {
    const { relay, db } = relayWith();
    await start(relay, []);
    await send(relay, 'yard', 'round', 'you');
    await send(relay, 'hut', 'terminal', 'contact');
    expect(runOf(db).crew!.goes).toEqual({ contact: 'spent' });
    expect(runOf(db).flags.asked).toBe('yes');
  });

  it("[held] on a way holds the recruit as an again-call's loss does; never-held turns it to hurt", async () => {
    const q = variant('→ in [take 2, heat 1]', '→ in [take 2, heat 1, held]');
    const a = relayWith({ book: [q] });
    await start(a.relay, ['dez']);
    await send(a.relay, 'yard', 'badge', 'dez');
    expect(runOf(a.db).crew!.goes).toEqual({ dez: 'held' });
    expect(runOf(a.db).calls).toEqual([expect.objectContaining({ beat: 'yard', choice: 'badge', card: 'dez', again: false, loss: 'held' })]);
    const b = relayWith({ book: [q], members: [member('dez', 'runner', { recruit: { ...ROSTER[0].recruit, traits: ['cautious'] } }), ROSTER[1]] });
    await start(b.relay, ['dez']);
    await send(b.relay, 'yard', 'badge', 'dez');
    expect(runOf(b.db).crew!.goes).toEqual({ dez: 'hurt' });
    expect(runOf(b.db).calls).toEqual([expect.objectContaining({ card: 'dez', loss: 'hurt' })]);
  });

  it('a plain pick (no ways) fills no TAKE and moves on', async () => {
    const q = variant("- round: Go round the back.\n  · you: Walk round by the rigs. → in [take 1, heat 1]\n  · face: Talk to the dog man. → in [take 1, cut 10]", '- round: Go round the back. → in');
    const { relay, db } = relayWith({ book: [q] });
    await start(relay, []);
    expect(relay.questState('hicks').active!.crew!.cards[1]).toMatchObject({ id: 'round', plain: true });
    expect(await send(relay, 'yard', 'round')).not.toBeTypeOf('string');
    expect(runOf(db)).toMatchObject({ beat: 'hut', alarm: 0 });
    expect(runOf(db).takeFill ?? 0).toBe(0);
  });

  it("a [crack N] card plays the word terminal as today: a win fills 2 TAKE, a lockout raises ALARM 1, nobody's go is spent", async () => {
    const q = variant('- press: Lean on the night man.\n  · you: Lean on him. → found [take 2, alarm 2]', '- press: Crack the night man\'s screen. → found / found [crack 5]');
    const won = relayWith({ book: [q] });
    await start(won.relay, ['dez']);
    await send(won.relay, 'yard', 'round', 'you');
    const setup = won.relay.questState('hicks').active!.crack!.press;
    expect(won.relay.questState('hicks').active!.crew!.cards[1]).toMatchObject({ id: 'press', crack: true });
    const t = makeTerminal(setup);
    expect(await won.relay.chooseQuest('hicks', { id: 'crew-fixture', beat: 'hut', choice: 'press', moves: [{ word: t.password }] })).not.toBeTypeOf('string');
    expect(runOf(won.db)).toMatchObject({ beat: 'out', takeFill: 3, alarm: 0 });
    expect(runOf(won.db).crew!.goes).toEqual({});
    const lost = relayWith({ book: [q] });
    await start(lost.relay, ['dez']);
    await send(lost.relay, 'yard', 'round', 'you');
    await lost.relay.chooseQuest('hicks', { id: 'crew-fixture', beat: 'hut', choice: 'press', moves: [] });
    expect(runOf(lost.db)).toMatchObject({ beat: 'out', takeFill: 1, alarm: 1 });
    expect(runOf(lost.db).crew!.goes).toEqual({});
  });

  it("the way's outcome and the next beat read other jobs' story flags beside the run's own; a plain pick's outcome too", async () => {
    const withAlly = (text: string) => text.replace("## in\n", "## in if ally=yes\n\n*In, with a friend on the gate.*\n\n→ hut\n\n## in\n");
    const seed = (db: Db) => db.setMeta('quest.hicks.other', JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags: { ally: 'yes' }, done: true, at: 0 }));
    const ways = entry('crew-fixture', withAlly(CREW_TEXT).replace('# hut\n', '# hut if ally=yes\n\n*The night man waves you through.*\n\n- press: Lean on the night man.\n  · you: Lean on him. → found [take 2, alarm 2]\n- wait: Wait him out.\n  · you: Wait. → found [heat 1]\n\n# hut\n'));
    const a = relayWith({ book: [ways] });
    seed(a.db);
    await start(a.relay, []);
    await send(a.relay, 'yard', 'badge', 'you:scheduler');
    expect(questRows(a.db).at(-1)!.text).toContain('with a friend on the gate');
    expect(questRows(a.db).at(-1)!.text).toContain('waves you through');
    expect(runOf(a.db).flags.ally).toBeUndefined();
    const plain = entry('crew-fixture', withAlly(CREW_TEXT).replace("- round: Go round the back.\n  · you: Walk round by the rigs. → in [take 1, heat 1]\n  · face: Talk to the dog man. → in [take 1, cut 10]", '- round: Go round the back. → in'));
    const b = relayWith({ book: [plain] });
    seed(b.db);
    await start(b.relay, []);
    await send(b.relay, 'yard', 'round');
    expect(questRows(b.db).at(-1)!.text).toContain('with a friend on the gate');
  });

  it("a Graft job's pick plays as before, with a `by` sent or not", async () => {
    const { relay, db } = relayWith({ book: [NIGHT] });
    await relay.startQuest('hicks', 'night-shift');
    expect(await relay.chooseQuest('hicks', { id: 'night-shift', beat: 'door', choice: 'roof', by: 'you' })).not.toBeTypeOf('string');
    const run = parseRun(db.getMeta(questKey('hicks', 'night-shift@0')))!;
    expect(run.picks[0]).toMatchObject({ beat: 'door', choice: 'roof', roll: expect.any(Object) });
    expect(run.crew).toBeUndefined();
  });
});

describe('crew rules: what the contact is told', () => {
  const lastUser = (r: TurnRequest) => r.messages.at(-1)!.content;
  const lastRow = (db: Db) => questRows(db).filter((m) => m.role === 'user').at(-1)!;
  const pickOf = (db: Db) => lastRow(db).quest!.pick!.line;

  it("your pick is the way's line as yours, not the card's, at the head of the row", async () => {
    const { relay, db } = relayWith();
    await start(relay, []);
    await send(relay, 'yard', 'badge', 'you:scheduler');
    expect(pickOf(db)).toBe('You show it the way a scheduler would.');
    await send(relay, 'hut', 'terminal', 'you');
    expect(pickOf(db)).toBe('You hunt and peck.');
  });

  it("a recruit's pick is 'You sent Kit: …', a program's 'You ran FIREWALL: …', and her own way reads as yours", async () => {
    const kit = relayWith({ members: [member('kit', 'runner')] });
    await start(kit.relay, ['kit']);
    await send(kit.relay, 'yard', 'round', 'you');
    await send(kit.relay, 'hut', 'terminal', 'kit');
    expect(pickOf(kit.db)).toBe('You sent Kit: Lift his whole session.');
    const prog = relayWith();
    await start(prog.relay, [], ['firewall']);
    await send(prog.relay, 'yard', 'round', 'you');
    await send(prog.relay, 'hut', 'terminal', 'p:firewall');
    expect(pickOf(prog.db)).toBe('You ran FIREWALL: Let the deck do it.');
    const her = relayWith();
    await start(her.relay, []);
    await send(her.relay, 'yard', 'round', 'you');
    await send(her.relay, 'hut', 'terminal', 'contact');
    // Her own way: the you form, then that she did it (live check: told only the ask, she said she could).
    expect(pickOf(her.db)).toBe('You ask her to take the lacquer off. She does it.');
    // By the contact's pronoun: a male contact does it as he.
    const him = relayWith({ pronoun: 'he' });
    await start(him.relay, []);
    await send(him.relay, 'yard', 'round', 'you');
    await send(him.relay, 'hut', 'terminal', 'contact');
    expect(pickOf(him.db)).toBe('You ask her to take the lacquer off. He does it.');
  });

  it("the pick keeps what she was told, through a reload, and the job's summary lists it (final review I3)", async () => {
    const { relay, db } = relayWith({ members: [member('kit', 'runner')] });
    await start(relay, ['kit']);
    await send(relay, 'yard', 'round', 'you');
    await send(relay, 'hut', 'terminal', 'kit');
    // runOf reads the meta row back through parseRun: what's kept survives a reload.
    // With what each cost, in story words (last pass C): the rigs left a trace, Kit's session drew notice.
    expect(runOf(db).picks.map((p) => p.told)).toEqual(['You walk round by the rigs. It left a trace.', 'You sent Kit: Lift his whole session. It drew notice.']);
    const summary = missionSummary(CREW_JOB, runOf(db), DECKS);
    expect(summary).toContain('- You sent Kit: Lift his whole session.');
    expect(summary).not.toContain('- Go in through the terminal.');
    // An old pick with no told line falls back to the card's.
    const old = { ...runOf(db), picks: runOf(db).picks.map(({ told: _, ...p }) => p) };
    expect(missionSummary(CREW_JOB, old, DECKS)).toContain(`- ${CREW_JOB.beats.get('hut')![0].choices.find((c) => c.id === 'terminal')!.line}`);
  });

  it("a pick on the ride-along beat gets one reply, MISSION_BEAT with the beat's view, and she reads the way's line", async () => {
    const { relay, db, backend } = relayWith();
    await start(relay, ['dez']);
    await send(relay, 'yard', 'round', 'you');
    const before = backend.reqs.length;
    await send(relay, 'hut', 'terminal', 'dez');
    expect(backend.reqs).toHaveLength(before + 1);
    const sent = lastUser(backend.reqs.at(-1)!);
    expect(sent).toContain(MISSION_BEAT);
    expect(sent).toContain("You're on his ear for the hut.");
    expect(sent).toContain('You sent Dez: Lift his whole session.');
    expect(sent).not.toContain('Go in through the terminal');
    expect(lastRow(db).quest!.silent).toBeUndefined();
  });

  it("her view reads the job's clock: `if seen>=2` is in what she reads at 2 and not at 1", async () => {
    const q = variant("view nix-direct: You're on his ear for the hut.\n", "view nix-direct: You're on his ear for the hut.\nview nix-direct if seen>=2: SEEN-TWICE-VIEW\n");
    const two = relayWith({ book: [q] });
    await start(two.relay, [], ['firewall']);
    await send(two.relay, 'yard', 'badge', 'you:branch');
    await send(two.relay, 'hut', 'terminal', 'p:firewall');
    expect(runOf(two.db).crew!.clocks).toEqual({ seen: 2 });
    expect(lastUser(two.backend.reqs.at(-1)!)).toContain('SEEN-TWICE-VIEW');
    const one = relayWith({ book: [q] });
    await start(one.relay, [], ['firewall']);
    await send(one.relay, 'yard', 'round', 'you');
    await send(one.relay, 'hut', 'terminal', 'p:firewall');
    expect(runOf(one.db).crew!.clocks).toEqual({ seen: 1 });
    const sent = lastUser(one.backend.reqs.at(-1)!);
    expect(sent).toContain("You're on his ear for the hut.");
    expect(sent).not.toContain('SEEN-TWICE-VIEW');
  });

  it("an [unheard] crew card isn't among her choices, and its pick isn't in what she reads", async () => {
    const q = variant('- press: Lean on the night man.\n', '- press: Lean on the night man. [unheard]\n');
    const { relay, db, backend } = relayWith({ book: [q] });
    await start(relay, []);
    await send(relay, 'yard', 'round', 'you');
    const block = relay['jobs'].questBlockFor('hicks', false)!;
    expect(block).toContain('go in through the terminal');
    expect(block).not.toContain('night man.;');
    expect(block).not.toMatch(/lean on the night man/i);
    await send(relay, 'hut', 'press', 'you');
    expect(pickOf(db)).toBe('You lean on him.');
    expect(lastRow(db).text).not.toMatch(/lean on him/i);
    const sent = lastUser(backend.reqs.at(-1)!);
    expect(sent).toContain(MISSION_BEAT);
    expect(sent).not.toMatch(/lean on him/i);
  });
});

describe("crew rules: a way's told: is all the contact hears of it (Kroll's desk)", () => {
  const lastRow = (db: Db) => questRows(db).filter((m) => m.role === 'user').at(-1)!;
  /** The job row as she reads it in the last request: `[job — Crew Fixture …: …]`. */
  const rowSent = (r: TurnRequest) => /\[job — Crew Fixture[^\]]*\]/.exec(r.messages.at(-1)!.content)?.[0];
  const RUNNER = '  · runner: Lift his whole session. → found [take 3, alarm 1]\n';
  const playKit = async (q: QuestEntry) => {
    const r = relayWith({ book: [q], members: [member('kit', 'runner')] });
    await start(r.relay, ['kit']);
    await send(r.relay, 'yard', 'round', 'you');
    await send(r.relay, 'hut', 'terminal', 'kit');
    return r;
  };

  it("without told:, she reads who did it and what it cost, as before", async () => {
    const { db, backend } = await playKit(CREW_JOB);
    expect(rowSent(backend.reqs.at(-1)!)).toBe('[job — Crew Fixture (told to hicks, so "you" here is hicks): You sent Kit: Lift his whole session. It drew notice. *The sheet is there.*]');
    expect(lastRow(db).quest!.pick).toEqual({ choice: 'terminal', line: 'You sent Kit: Lift his whole session.', cost: 'It drew notice.' });
  });

  it('with told:, she reads exactly that, {who} filled, with no sending, no cost words and no outcome; the page is as without, and the pick keeps the told:', async () => {
    const plain = await playKit(CREW_JOB);
    const { db, backend } = await playKit(variant(RUNNER, `${RUNNER}    told: You hear {who} at the hut door, then nothing for a minute.\n`));
    // The hut is a ride-along beat: she answers before the next beat, so the told line goes alone.
    expect(rowSent(backend.reqs.at(-1)!)).toBe('[job — Crew Fixture (told to hicks, so "you" here is hicks): You hear Kit at the hut door, then nothing for a minute.]');
    expect(backend.reqs.at(-1)!.messages.at(-1)!.content).not.toContain('The sheet is there');
    expect(backend.reqs.at(-1)!.messages.at(-1)!.content).not.toContain('You sent Kit');
    expect(lastRow(db).text).toBe(lastRow(plain.db).text);
    expect(lastRow(db).text.startsWith('You sent Kit: Lift his whole session.')).toBe(true);
    expect(lastRow(db).quest!.pick).toEqual({ choice: 'terminal', line: 'You sent Kit: Lift his whole session.', toldAs: 'You hear Kit at the hut door, then nothing for a minute.', toldNext: '*The gate again, from the inside.*' });
    expect(runOf(plain.db).picks.at(-1)!.told).toBe('You sent Kit: Lift his whole session. It drew notice.');
    // What she was told is what the pick keeps for her summary: the told: text.
    expect(runOf(db).picks.at(-1)!.told).toBe('You hear Kit at the hut door, then nothing for a minute.');
  });

  it("her summary at the job's end lists the told:, not who was sent or what it cost", async () => {
    const { relay, backend } = await playKit(variant(RUNNER, `${RUNNER}    told: You hear {who} at the hut door.\n`));
    await send(relay, 'out', 'fence', 'you');
    const close = backend.reqs.at(-1)!.messages.at(-1)!.content as string;
    expect(close).toContain(MISSION_CLOSE);
    expect(close).toContain('- You hear Kit at the hut door.');
    expect(close).not.toContain('You sent');
    expect(close).not.toContain('It drew notice.');
    expect(close).not.toContain('Lift his whole session');
  });

  /** The row as her history gives it (the Residual and the summary read the same), and as the narrator's recent lines do. */
  const history = (m: ChatMessage) => toCompletion(m, 'hicks')!.content;
  const TOLD_ROW = '[job — Crew Fixture (told to hicks, so "you" here is hicks): You hear Kit at the hut door. *The gate again, from the inside.*]';

  it("on a home beat her row is the told: line and the next beat's text, none of the outcome's", async () => {
    const { db } = await playKit(variant(RUNNER, `${RUNNER}    told: You hear {who} at the hut door.\n`));
    // The player's row has the outcome ("The sheet is there.") between the pick and the next beat; hers doesn't.
    expect(lastRow(db).text).toContain('*The sheet is there.*');
    expect(history(lastRow(db))).toBe(TOLD_ROW);
    expect(history(lastRow(db))).not.toMatch(/sheet|Lift|sent|notice/);
  });

  it('her history on the next turn reads the told: row too', async () => {
    const { relay, backend } = await playKit(variant(RUNNER, `${RUNNER}    told: You hear {who} at the hut door.\n`));
    await send(relay, 'out', 'fence', 'you');
    const said = backend.reqs.at(-1)!.messages.slice(0, -1).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)));
    expect(said).toContain(TOLD_ROW);
    expect(said.some((c) => c.includes('You sent Kit') || c.includes('The sheet is there'))).toBe(false);
  });

  it('the narrator and pick check read it as she does (recentLines)', async () => {
    const { db } = await playKit(variant(RUNNER, `${RUNNER}    told: You hear {who} at the hut door.\n`));
    const lines = recentLines(questRows(db), { player: 'Vee', contact: 'Nix' });
    expect(lines).toContain('[job — Crew Fixture: You hear Kit at the hut door. *The gate again, from the inside.*]');
    expect(lines.some((l) => l.includes('You sent Kit') || l.includes('The sheet is there'))).toBe(false);
    // Without told:, the narrator reads the pick with its cost words, as she does.
    const plain = await playKit(CREW_JOB);
    expect(recentLines(questRows(plain.db), { player: 'Vee', contact: 'Nix' })).toContain('[job — Crew Fixture: You sent Kit: Lift his whole session. It drew notice. *The sheet is there.* *The gate again, from the inside.*]');
  });

  it("the job's last row: the told: line alone, not the ending's text", async () => {
    const FENCE = '  · you: Over the wire with the sheet. → home [heat 1]\n';
    const { relay, db } = relayWith({ book: [variant(FENCE, `${FENCE}  · runner: Over the wire ahead of you. → home [heat 1]\n    told: You hear {who} hit the wire, then the van door.\n`)], members: [member('kit', 'runner')] });
    await start(relay, ['kit']);
    await send(relay, 'yard', 'round', 'you');
    await send(relay, 'hut', 'terminal', 'you');
    expect(await send(relay, 'out', 'fence', 'kit')).not.toBeTypeOf('string');
    expect(runOf(db).done).toBe(true);
    const row = questRows(db).filter((m) => m.role === 'user' && m.quest?.pick?.choice === 'fence').at(-1)!;
    expect(row.text).toContain('*Home with the sheet.*');
    expect(history(row)).toBe('[job — Crew Fixture (told to hicks, so "you" here is hicks): You hear Kit hit the wire, then the van door.]');
  });

  it("the getaway's row: the told: line and the getaway's text, not the outcome's", async () => {
    const { db } = await playKit(variant(RUNNER, `  · runner: Lift his whole session. → found [take 3, alarm 4]\n    told: You hear {who} at the hut door.\n`));
    expect(runOf(db)).toMatchObject({ beat: 'getaway', getaway: true });
    expect(lastRow(db).text).toContain('*The sheet is there.*');
    expect(history(lastRow(db))).toBe('[job — Crew Fixture (told to hicks, so "you" here is hicks): You hear Kit at the hut door. *The horn goes.*]');
  });

  it("on a beat she only hears on the line, the told: is what she heard; the rest of the line follows it", async () => {
    // The row's beat is the one the pick goes on to: the gate, which she only hears.
    const away = (t: string) => t.replace('*The gate again, from the inside.*', 'comms: yes\n\n*The gate again, {{the gate man coughs}}.*');
    const plain = await playKit(entry('crew-fixture', away(CREW_TEXT)));
    expect(lastRow(plain.db).quest!.heard).toBe('You sent Kit: Lift his whole session. the gate man coughs');
    const { db, backend } = await playKit(entry('crew-fixture', away(CREW_TEXT).replace(RUNNER, `${RUNNER}    told: You hear the hut door.\n`)));
    expect(lastRow(db).quest!.heard).toBe('You hear the hut door. the gate man coughs');
    expect(rowSent(backend.reqs.at(-1)!)).toBe(`[job — Crew Fixture (told to hicks, so "you" here is hicks; you weren't there, and this is all you heard on the line): You hear the hut door. the gate man coughs]`);
    expect(rowSent(plain.backend.reqs.at(-1)!)).toBe(`[job — Crew Fixture (told to hicks, so "you" here is hicks; you weren't there, and this is all you heard on the line): You sent Kit: Lift his whole session. It drew notice. the gate man coughs]`);
    expect(lastRow(db).text).toBe(lastRow(plain.db).text);
  });
});

describe('crew rules: she is told what a way cost, in story words (last pass C)', () => {
  const lastUser = (r: TurnRequest) => r.messages.at(-1)!.content;
  const lastRow = (db: Db) => questRows(db).filter((m) => m.role === 'user').at(-1)!;

  it("ALARM that landed: 'It drew notice.' after the pick in what she reads and in the pick's told line; not in the player's row", async () => {
    const { relay, db, backend } = relayWith();
    await start(relay, []);
    await send(relay, 'yard', 'round', 'you');
    await send(relay, 'hut', 'terminal', 'you');
    const sent = lastUser(backend.reqs.at(-1)!);
    expect(sent).toContain('You hunt and peck. It drew notice.');
    expect(runOf(db).picks.at(-1)!.told).toBe('You hunt and peck. It drew notice.');
    const row = lastRow(db);
    expect(row.quest!.pick!.line).toBe('You hunt and peck.');
    expect(row.text).not.toContain('It drew notice.');
    expect(row.text.startsWith('You hunt and peck.\n\n')).toBe(true);
    expect(missionSummary(CREW_JOB, runOf(db), DECKS)).toContain('- You hunt and peck. It drew notice.');
  });

  it("a cut and HEAT: her own way costs part of the fee; the rigs leave a trace", async () => {
    const r = relayWith();
    const db = r.db;
    await start(r.relay, []);
    await send(r.relay, 'yard', 'round', 'you');
    await send(r.relay, 'hut', 'terminal', 'contact');
    expect(runOf(db).picks.map((p) => p.told)).toEqual(['You walk round by the rigs. It left a trace.', 'You ask her to take the lacquer off. She does it.']);
    const q = variant('  · contact: Ask her to take the lacquer off. → found [take 1, set asked=yes]', '  · contact: Ask her to take the lacquer off. → found [take 1, cut 20, set asked=yes]');
    const cut = relayWith({ book: [q] });
    await start(cut.relay, []);
    await send(cut.relay, 'yard', 'round', 'you');
    await send(cut.relay, 'hut', 'terminal', 'contact');
    expect(runOf(cut.db).picks.at(-1)!.told).toBe('You ask her to take the lacquer off. She does it. It cost part of the fee.');
    expect(lastUser(cut.backend.reqs.at(-1)!)).toContain('She does it. It cost part of the fee.');
  });

  it("a job's own clock adds nothing; COVER STORY's stopped ALARM adds nothing", async () => {
    const { relay, db } = relayWith({ members: [member('mia', 'face')] });
    await start(relay, ['mia'], ['firewall']);
    await send(relay, 'yard', 'badge', 'you:branch');
    expect(runOf(db).crew!.clocks).toEqual({ seen: 1 });
    expect(runOf(db).picks.at(-1)!.told).toBe('You show it the way they taught you.');
    expect(await move(relay, 'hut', 'mia')).not.toBeTypeOf('string');
    await send(relay, 'hut', 'terminal', 'you');
    expect(runOf(db).alarm).toBe(0);
    expect(runOf(db).picks.at(-1)!.told).toBe('You hunt and peck.');
  });

  it("several, in order: TAKE lost and a recruit held at once", async () => {
    const q = variant('  · face: Walk out on the badge they held for you. → home [take 1] if door=held', '  · face: Walk out on the badge they held for you. → home [take 1] if door=held\n  · runner: Walk out loud with the sheet. → home [alarm 1, heat 1, lose 1, held]');
    const { relay, db } = relayWith({ book: [q], members: [member('dez', 'runner')] });
    await start(relay, ['dez']);
    await send(relay, 'yard', 'round', 'you');
    await send(relay, 'hut', 'terminal', 'you');
    await send(relay, 'out', 'gate', 'dez');
    expect(runOf(db).picks.at(-1)!.told).toBe('You sent Dez: Walk out loud with the sheet. It drew notice. It left a trace. Some of the take was lost. Dez was held.');
    // The ending's row: she reads it, the player's text doesn't carry it.
    const end = questRows(db).filter((m) => m.role === 'user').at(-1)!;
    expect(end.text).not.toContain('Dez was held.');
  });

  it("a missed throw: notice and the recruit hurt, after the throw's line", async () => {
    const names = ['dez', 'kit', 'noor', 'zoe', 'ivy', 'lux', 'oona', 'pia', 'remy', 'sol', 'tess'];
    const out = names.find((id) => !throwOf(`crew-fixture@0|hut|press|${id}`).through)!;
    const name = `${out[0].toUpperCase()}${out.slice(1)}`;
    const { relay, db, backend } = relayWith({ members: [member(out, 'runner')] });
    await start(relay, [out]);
    await send(relay, 'yard', 'round', 'you');
    expect(await send(relay, 'hut', 'press', out)).not.toBeTypeOf('string');
    const told = `${throwLine(name, false)} It drew notice. ${name} was hurt.`;
    expect(runOf(db).picks.at(-1)!.told).toBe(told);
    expect(lastUser(backend.reqs.at(-1)!)).toContain(told);
    expect(lastRow(db).text).not.toContain(`${name} was hurt.`);
  });

  it("an [unheard] card tells her nothing, cost words included", async () => {
    const q = variant('- press: Lean on the night man.\n', '- press: Lean on the night man. [unheard]\n');
    const { relay, db, backend } = relayWith({ book: [q] });
    await start(relay, []);
    await send(relay, 'yard', 'round', 'you');
    await send(relay, 'hut', 'press', 'you');
    expect(runOf(db).picks.at(-1)!.told).toBeUndefined();
    expect(lastUser(backend.reqs.at(-1)!)).not.toContain('It drew notice.');
  });
});

describe('crew rules: an [unheard] card keeps a throw from her too', () => {
  const q = variant('- press: Lean on the night man.\n', '- press: Lean on the night man. [unheard]\n');
  const names = ['dez', 'kit', 'noor', 'zoe', 'ivy', 'lux', 'oona', 'pia', 'remy', 'sol', 'tess'];
  const throwsFor = (id: string) => throwOf(`crew-fixture@0|hut|press|${id}`);
  const through = names.find((id) => throwsFor(id).through)!;
  const out = names.find((id) => !throwsFor(id).through)!;
  const name = (id: string) => `${id[0].toUpperCase()}${id.slice(1)}`;

  for (const [label, id, made] of [['through', through, true], ['out of their depth', out, false]] as const)
    it(`${label}: the throw's line isn't in the row or what she reads`, async () => {
      const { relay, db, backend } = relayWith({ book: [q], members: [member(id, 'runner')] });
      await start(relay, [id]);
      await send(relay, 'yard', 'round', 'you');
      const before = backend.reqs.length;
      expect(await send(relay, 'hut', 'press', id)).not.toBeTypeOf('string');
      const said = throwLine(name(id), made);
      expect(questRows(db).filter((m) => m.role === 'user').at(-1)!.text).not.toContain(said);
      expect(backend.reqs).toHaveLength(before + 1);
      expect(backend.reqs.at(-1)!.messages.at(-1)!.content).not.toContain(said);
    });
});

describe('crew rules: {who} in a way\'s outcome', () => {
  // The hut's program, contact and runner ways each play an outcome naming who did it.
  const WHO = entry('crew-fixture', CREW_TEXT.replace('  · program: Let the deck do it. → found [take 2, seen 1]\n  · contact: Ask her to take the lacquer off. → found [take 1, set asked=yes]\n  · runner: Lift his whole session. → found [take 3, alarm 1]\n', '  · program: Let the deck do it. → by-who [take 2, seen 1]\n  · contact: Ask her to take the lacquer off. → by-who [take 1, set asked=yes]\n  · runner: Lift his whole session. → by-who [take 3, alarm 1]\n').replace('## found\n', '## by-who\n\n*{who} has the cold store open.*\n\n→ out\n\n## found\n'));
  const rowAfter = async (people: string[], programs: string[], by: string) => {
    const { relay, db } = relayWith({ book: [WHO] });
    await start(relay, people, programs);
    await send(relay, 'yard', 'round', 'you');
    expect(await send(relay, 'hut', 'terminal', by)).not.toBeTypeOf('string');
    // The pick's row, not her reply to it (the hut is a ride-along beat).
    return questRows(db).filter((m) => m.role === 'user').at(-1)!.text;
  };

  it("a recruit's way: their first name", async () => {
    const text = await rowAfter(['dez'], [], 'dez');
    expect(text).toContain('*Dez has the cold store open.*');
    expect(text).not.toContain('{who}');
  });

  it("the contact's way: her name", async () => {
    expect(await rowAfter([], [], 'contact')).toContain('*nix-direct has the cold store open.*');
  });

  it("a program's way: its name in capitals", async () => {
    expect(await rowAfter([], ['firewall'], 'p:firewall')).toContain('*FIREWALL has the cold store open.*');
  });
});

describe('crew rules: the throw', () => {
  const runId = 'crew-fixture@0';
  const faces = ['mia', 'noor', 'zoe', 'ivy', 'lux', 'oona', 'pia', 'remy', 'sol', 'tess'];
  const throwsFor = (id: string) => throwOf(`${runId}|yard|badge|${id}`);
  const through = faces.find((id) => throwsFor(id).through)!;
  const out = faces.find((id) => !throwsFor(id).through)!;
  const name = (id: string) => `${id[0].toUpperCase()}${id.slice(1)}`;
  const q = variant('→ in [take 1, alarm 1]', '→ in [take 1, alarm 1, set shown=yes]');
  const thrower = (id: string, db?: Db) => relayWith({ book: [q], members: [member(id, 'face')], ...(db ? { db } : {}) });

  it('both faces exist', () => {
    expect(through).toBeDefined();
    expect(out).toBeDefined();
  });

  it("through: the first you way lands in full, its outcome under the throw's line", async () => {
    const { relay, db } = thrower(through);
    await start(relay, [through]);
    expect(relay.questState('hicks').active!.crew!.cards[0].throws).toEqual([through]);
    expect(await send(relay, 'yard', 'badge', through)).not.toBeTypeOf('string');
    expect(runOf(db)).toMatchObject({ beat: 'hut', takeFill: 1, alarm: 1 });
    expect(runOf(db).flags.shown).toBe('yes');
    expect(runOf(db).crew!.goes).toEqual({ [through]: 'spent' });
    expect(questRows(db).at(-1)!.text.startsWith(`${throwLine(name(through), true)}\n\n*You're in.*`)).toBe(true);
  });

  it('out of their depth: no take, no set, ALARM +2, hurt, the line alone, and on to the next beat', async () => {
    const { relay, db } = thrower(out);
    await start(relay, [out]);
    await send(relay, 'yard', 'badge', out);
    const run = runOf(db);
    expect(run).toMatchObject({ beat: 'hut', alarm: 2 });
    expect(run.takeFill ?? 0).toBe(0);
    expect(run.flags.shown).toBeUndefined();
    expect(run.crew!.goes).toEqual({ [out]: 'hurt' });
    expect(run.calls).toEqual([expect.objectContaining({ card: out, loss: 'hurt' })]);
    const text = questRows(db).at(-1)!.text;
    expect(text.startsWith(throwLine(name(out), false))).toBe(true);
    expect(text).not.toContain("You're in");
    expect(text).toContain('*The hut, the terminal, the night man asleep.*');
  });

  it("out of their depth: the card's own set lands (the card was taken), the way's doesn't", async () => {
    const carded = entry('crew-fixture', CREW_TEXT.replace('→ in [take 1, alarm 1]', '→ in [take 1, alarm 1, set shown=yes]').replace('- badge: Show the badge at the gate. [short THE BADGE]', '- badge: Show the badge at the gate. [short THE BADGE, set gate=tried]'));
    const { relay, db } = relayWith({ book: [carded], members: [member(out, 'face')] });
    await start(relay, [out]);
    await send(relay, 'yard', 'badge', out);
    const run = runOf(db);
    expect(run).toMatchObject({ beat: 'hut', alarm: 2 });
    expect(run.flags.gate).toBe('tried');
    expect(run.flags.shown).toBeUndefined();
  });

  it('the same seed gives the same result on a second identical run', async () => {
    for (const id of [through, out]) {
      const a = thrower(id);
      const b = thrower(id);
      for (const r of [a, b]) {
        await start(r.relay, [id]);
        await send(r.relay, 'yard', 'badge', id);
      }
      const strip = (run: QuestRun) => ({ ...run, at: 0, picks: run.picks.map((p) => ({ ...p })), calls: run.calls?.map((c) => ({ ...c, at: 0 })) });
      expect(strip(runOf(a.db))).toEqual(strip(runOf(b.db)));
      expect(questRows(a.db).at(-1)!.text).toBe(questRows(b.db).at(-1)!.text);
    }
  });
});

describe('crew rules: moves and programs', () => {
  it("COVER STORY: no ALARM on this beat and the face is spent; the next beat's mods are empty", async () => {
    const { relay, db } = relayWith();
    await start(relay, ['mia']);
    expect(await move(relay, 'yard', 'mia')).not.toBeTypeOf('string');
    expect(runOf(db).crew).toMatchObject({ goes: { mia: 'spent' }, mods: { noAlarm: true }, modsBeat: 'yard' });
    expect(relay.questState('hicks').active!.crew!.cards[0].ways[0]).toMatchObject({ by: 'you', alarm: 0 });
    expect(await move(relay, 'yard', 'mia')).toBeTypeOf('string');
    await send(relay, 'yard', 'badge', 'you:scheduler');
    expect(runOf(db)).toMatchObject({ beat: 'hut', alarm: 0, takeFill: 1 });
    expect(runOf(db).crew).toMatchObject({ mods: {}, modsBeat: null });
  });

  it("a move is refused on a beat it wouldn't change", async () => {
    const q = variant('  · you scheduler: Show it the way a scheduler would. → in [take 1, alarm 1]', '  · you scheduler: Show it the way a scheduler would. → in [take 1, heat 2]');
    const { relay, db } = relayWith({ book: [q] });
    await start(relay, ['mia']);
    expect(relay.questState('hicks').active!.crew!.hand.find((h) => h.id === 'mia')!.move!.can).toBe(false);
    expect(await move(relay, 'yard', 'mia')).toBeTypeOf('string');
    expect(runOf(db).crew).toEqual(freshCrew());
    // Another face brought could throw at the badge (no face way there), so COVER STORY has ALARM to stop.
    const two = relayWith({ book: [q], members: [ROSTER[1], member('noor', 'face')] });
    await start(two.relay, ['mia', 'noor']);
    expect(two.relay.questState('hicks').active!.crew!.hand.find((h) => h.id === 'mia')!.move!.can).toBe(true);
  });

  describe("the beat's mods cover every ALARM a pick lands", () => {
    const outFace = ['noor', 'zoe', 'ivy', 'lux', 'oona', 'pia', 'remy', 'sol', 'tess'].find((x) => !throwOf(`crew-fixture@0|yard|badge|${x}`).through)!;
    it('the thrower fails', () => expect(throwOf(`crew-fixture@0|yard|badge|${outFace}`).through).toBe(false));

    it('COVER STORY, then a failed throw: no ALARM, and the thrower is still hurt', async () => {
      const { relay, db } = relayWith({ members: [ROSTER[1], member(outFace, 'face')] });
      await start(relay, ['mia', outFace]);
      expect(await move(relay, 'yard', 'mia')).not.toBeTypeOf('string');
      await send(relay, 'yard', 'badge', outFace);
      expect(runOf(db).alarm).toBe(0);
      expect(runOf(db).crew!.goes).toEqual({ mia: 'spent', [outFace]: 'hurt' });
    });

    it('FIREWALL, then a failed throw: ALARM +1 and FIREWALL spent', async () => {
      const { relay, db } = relayWith({ members: [member(outFace, 'face')] });
      await start(relay, [outFace], ['firewall']);
      await move(relay, 'yard', 'p:firewall');
      await send(relay, 'yard', 'badge', outFace);
      expect(runOf(db).alarm).toBe(1);
      expect(runOf(db).crew!.goes).toEqual({ 'p:firewall': 'spent', [outFace]: 'hurt' });
    });

    it("FIREWALL, then a card's own [alarm +1] by a way with none: ALARM 0 and FIREWALL spent", async () => {
      const q = variant('- round: Go round the back.\n', '- round: Go round the back. [alarm +1]\n');
      const { relay, db } = relayWith({ book: [q] });
      await start(relay, [], ['firewall']);
      await move(relay, 'yard', 'p:firewall');
      await send(relay, 'yard', 'round', 'you');
      expect(runOf(db).alarm).toBe(0);
      expect(runOf(db).crew!.goes).toEqual({ 'p:firewall': 'spent' });
      // Without FIREWALL the card's tag lands.
      const bare = relayWith({ book: [q] });
      await start(bare.relay, []);
      await send(bare.relay, 'yard', 'round', 'you');
      expect(runOf(bare.db).alarm).toBe(1);
    });

    it("COVER STORY, then a crack lockout: no ALARM; a beat whose only ALARM is the crack still offers it", async () => {
      const text = CREW_TEXT.replace('- press: Lean on the night man.\n  · you: Lean on him. → found [take 2, alarm 2]', "- press: Crack the night man's screen. → found / found [crack 5]").replace('  · you: Hunt and peck. → found [take 1, alarm 1]', '  · you: Hunt and peck. → found [take 1, heat 1]').replace('  · runner: Lift his whole session. → found [take 3, alarm 1]', '  · runner: Lift his whole session. → found [take 3, heat 1]');
      const { relay, db } = relayWith({ book: [entry('crew-fixture', text)] });
      await start(relay, ['mia']);
      await send(relay, 'yard', 'round', 'you');
      expect(relay.questState('hicks').active!.crew!.hand.find((h) => h.id === 'mia')!.move!.can).toBe(true);
      expect(await move(relay, 'hut', 'mia')).not.toBeTypeOf('string');
      await relay.chooseQuest('hicks', { id: 'crew-fixture', beat: 'hut', choice: 'press', moves: [] });
      expect(runOf(db)).toMatchObject({ beat: 'out', alarm: 0 });
      expect(runOf(db).picks.at(-1)!.crack).toMatchObject({ state: 'locked' });
    });
  });

  it('LISTEN IN: TAKE +1 on a way that fills it, on this beat', async () => {
    const { relay, db } = relayWith({ members: [KIT] });
    await start(relay, ['kit']);
    await move(relay, 'yard', 'kit');
    await send(relay, 'yard', 'badge', 'you:branch');
    expect(runOf(db)).toMatchObject({ takeFill: 3 });
  });

  it('LISTEN IN is refused where its +1 could fill nothing: TAKE full, or every way already reaching the cap', async () => {
    const full = relayWith({ members: [KIT] });
    await start(full.relay, ['kit']);
    await send(full.relay, 'yard', 'badge', 'you:branch');
    await send(full.relay, 'hut', 'terminal', 'you');
    expect(runOf(full.db)).toMatchObject({ beat: 'out', takeFill: 3 });
    expect(full.relay.questState('hicks').active!.crew!.hand.find((h) => h.id === 'kit')!.move!.can).toBe(false);
    expect(await move(full.relay, 'out', 'kit')).toBe('NOTHING HERE FOR IT TO CHANGE');

    const capped = relayWith({ members: [KIT] });
    await start(capped.relay, ['kit']);
    await send(capped.relay, 'yard', 'round', 'you');
    await send(capped.relay, 'hut', 'terminal', 'you');
    expect(runOf(capped.db)).toMatchObject({ beat: 'out', takeFill: 2 });
    expect(await move(capped.relay, 'out', 'kit')).toBe('NOTHING HERE FOR IT TO CHANGE');
  });

  it('LOOP THE CAMS: no HEAT lands on this beat', async () => {
    const { relay, db } = relayWith();
    await start(relay, ['dez']);
    await move(relay, 'yard', 'dez');
    await send(relay, 'yard', 'round', 'you');
    expect(runOf(db).crew!.heat).toBe(0);
  });

  it("HOLD THE DOOR: door=held and AT THE DOOR; refused on the way out, and where the file never reads it after this beat", async () => {
    const a = relayWith({ members: [ADE, ROSTER[1]] });
    await start(a.relay, ['ade', 'mia']);
    expect(await move(a.relay, 'yard', 'ade')).not.toBeTypeOf('string');
    expect(runOf(a.db).flags.door).toBe('held');
    expect(runOf(a.db).crew!.goes).toEqual({ ade: 'door' });
    expect(runOf(a.db).crew!.mods).toEqual({});
    expect(a.relay.questState('hicks').active!.crew!.hand.find((h) => h.id === 'ade')!.state).toBe('door');

    const b = relayWith({ members: [ADE] });
    await start(b.relay, ['ade']);
    await send(b.relay, 'yard', 'badge', 'you:scheduler');
    await send(b.relay, 'hut', 'press', 'you');
    expect(runOf(b.db).beat).toBe('out');
    expect(await move(b.relay, 'out', 'ade')).toBeTypeOf('string');
    expect(runOf(b.db).crew!.goes).toEqual({});

    const other = variant('→ home [take 1] if door=held', '→ home [take 1] if door=open');
    const d = relayWith({ book: [other], members: [ADE] });
    await start(d.relay, ['ade']);
    expect(await move(d.relay, 'yard', 'ade')).toBeTypeOf('string');

    const never = variant('  · face: Walk out on the badge they held for you. → home [take 1] if door=held\n', '');
    const c = relayWith({ book: [never], members: [ADE] });
    await start(c.relay, ['ade']);
    expect(await move(c.relay, 'yard', 'ade')).toBeTypeOf('string');
    expect(runOf(c.db).flags.door).toBeUndefined();
  });

  it('FIREWALL stops a point of ALARM and is spent then; with no ALARM landing it stays', async () => {
    const a = relayWith();
    await start(a.relay, [], ['firewall']);
    expect(await move(a.relay, 'yard', 'p:firewall')).not.toBeTypeOf('string');
    expect(runOf(a.db).crew).toMatchObject({ goes: {}, mods: { wall: true }, modsBeat: 'yard' });
    expect(await move(a.relay, 'yard', 'p:firewall')).toBeTypeOf('string');
    await send(a.relay, 'yard', 'badge', 'you:scheduler');
    expect(runOf(a.db).alarm).toBe(0);
    expect(runOf(a.db).crew!.goes).toEqual({ 'p:firewall': 'spent' });

    const b = relayWith();
    await start(b.relay, [], ['firewall']);
    await move(b.relay, 'yard', 'p:firewall');
    await send(b.relay, 'yard', 'round', 'you');
    expect(runOf(b.db).crew).toMatchObject({ goes: {}, mods: {}, modsBeat: null });
    expect(b.relay.questState('hicks').active!.crew!.hand.find((h) => h.id === 'p:firewall')!.state).toBe('ready');
  });

  it('SCRUB: refused at ALARM 0; ALARM −1 now and spent', async () => {
    const { relay, db } = relayWith();
    await start(relay, [], ['scrub']);
    expect(await move(relay, 'yard', 'p:scrub')).toBeTypeOf('string');
    await send(relay, 'yard', 'badge', 'you:scheduler');
    expect(runOf(db).alarm).toBe(1);
    expect(await move(relay, 'hut', 'p:scrub')).not.toBeTypeOf('string');
    expect(runOf(db).alarm).toBe(0);
    expect(runOf(db).crew!.goes).toEqual({ 'p:scrub': 'spent' });
  });

  it('a move on a stale beat, or with a card not in the hand, is refused', async () => {
    const { relay } = relayWith();
    await start(relay, ['mia'], ['firewall']);
    expect(await move(relay, 'hut', 'mia')).toBeTypeOf('string');
    expect(await move(relay, 'yard', 'dez')).toBeTypeOf('string');
    expect(await move(relay, 'yard', 'p:solvent')).toBeTypeOf('string');
  });
});

describe('district: (Kroll\'s desk): a job taken in one district, paid in another', () => {
  // The fixture starts at haes-noodles; here that place is in Nexus, as Kroll's desk is.
  const inNexus = (placeId: string) => (placeId === 'haes-noodles' ? 'nexus' : null);
  const SPINE = (extra = '') => entry('crew-fixture', CREW_TEXT.replace('starts: haes-noodles', `starts: haes-noodles\ndistrict: spine${extra}`));
  const districtsOf = (run: QuestRun) => [...new Set((run.kit ?? []).flatMap((e) => { const k = e as KitEvent; return k.rep ? [`rep ${k.rep.district}`] : k.heat ? [`heat ${k.district}`] : []; }))].sort();
  const runClean = async (book: QuestEntry[]) => {
    const { relay, db } = relayWith({ book, deck: 'deaf-meridian', districtOf: inNexus });
    expect(relay.questState('hicks').open[0].setup!.district).toBe(book[0].district ?? 'nexus');
    await start(relay, [], ['firewall']);
    await send(relay, 'yard', 'badge', 'you:scheduler');
    await send(relay, 'hut', 'terminal', 'p:firewall');
    await send(relay, 'out', 'fence', 'you');
    expect(debriefOf(db).tier).toBe('clean');
    return runOf(db);
  };

  it('a clean end writes its rep and HEAT in district:, not where it starts', async () => {
    expect(districtsOf(await runClean([SPINE()]))).toEqual(['heat spine', 'rep spine']);
  });

  it('without district:, rep and HEAT land where it starts, as before', async () => {
    expect(districtsOf(await runClean([CREW_JOB]))).toEqual(['heat nexus', 'rep nexus']);
  });

  it("its tier gate reads district:'s rep, not the starting place's", () => {
    const TIER2 = { ...SPINE('\nfor: hicks'), tier: 2 as const };
    const listed = (district: string) => relayWith({ book: [TIER2], districtOf: inNexus, seed: [{ at: 1199, rep: { district, delta: 20 } }] }).relay.questState('hicks').open.map((q) => q.id);
    expect(listed('spine')).toEqual(['crew-fixture']);
    expect(listed('nexus')).toEqual([]);
  });
});

describe('crew rules: rewind and reload', () => {
  it('Review Focus 1: rewinding before the second pick gives back the crew as it was; the same throw replays the same die', async () => {
    const faces = ['mia', 'noor', 'zoe', 'ivy', 'lux', 'oona'];
    const id = faces.find((x) => !throwOf(`crew-fixture@0|yard|badge|${x}`).through)!;
    expect(throwOf(`crew-fixture@0|yard|badge|${id}`).through).toBe(false);
    const { relay, db } = relayWith({ members: [member(id, 'face'), ROSTER[0]] });
    await start(relay, [id, 'dez']);
    const startRow = questRows(db).at(-1)!;
    await send(relay, 'yard', 'badge', id);
    const firstRow = questRows(db).at(-1)!;
    const crew1: CrewState = runOf(db).crew!;
    await send(relay, 'hut', 'terminal', 'dez');
    expect(runOf(db).crew).not.toEqual(crew1);
    await relay.rewind('hicks', firstRow.id);
    expect(runOf(db).crew).toEqual(crew1);
    expect(runOf(db).beat).toBe('hut');
    await relay.rewind('hicks', startRow.id);
    expect(runOf(db).crew).toEqual(freshCrew());
    await send(relay, 'yard', 'badge', id);
    expect(runOf(db).crew).toEqual(crew1);
    expect(questRows(db).at(-1)!.text).toBe(firstRow.text);
  });

  it('Review Focus 4: a move survives a rebuilt relay; sending someone empties the next beat\'s mods', async () => {
    const a = relayWith();
    await start(a.relay, ['mia']);
    await move(a.relay, 'yard', 'mia');
    const b = relayWith({ db: a.db });
    expect(b.relay.questState('hicks').active!.crew!.mods).toEqual([{ label: 'COVER STORY', art: '/abilities/cover-story.webp' }]);
    await send(b.relay, 'yard', 'badge', 'you:scheduler');
    expect(b.relay.questState('hicks').active!.crew!.mods).toEqual([]);
    expect(runOf(a.db).alarm).toBe(0);
  });
});

const debriefOf = (db: Db) => questRows(db).find((m) => m.quest?.debrief)!.quest!.debrief!;
const kitSum = (run: QuestRun, f: (e: KitEvent) => number | undefined) => (run.kit ?? []).reduce((n, e) => n + (f(e as KitEvent) ?? 0), 0);
const FEN = member('fen', 'fence');

describe('crew rules: the end', () => {
  it('full TAKE, ALARM 1, nobody harmed: clean, rep as a template mission of its tier, pay scaled by TAKE; HEAT is the ways alone (ALARM left is not HEAT), no deck heat after a program way', async () => {
    const { relay, db } = relayWith({ deck: 'deaf-meridian' });
    await start(relay, [], ['firewall']);
    await send(relay, 'yard', 'badge', 'you:scheduler');
    await send(relay, 'hut', 'terminal', 'p:firewall');
    await send(relay, 'out', 'fence', 'you');
    const run = runOf(db);
    expect(run).toMatchObject({ done: true, takeFill: 3, alarm: 1, take: 'full' });
    expect(kitSum(run, (e) => e.rep?.delta)).toBe(repDelta(1, 'clean'));
    expect(kitSum(run, (e) => e.sol)).toBe(400);
    expect(kitSum(run, (e) => e.heat)).toBe(1);
    const d = debriefOf(db);
    expect(d.tier).toBe('clean');
    expect(d.heat.delta).toBe(1);
    expect(d.heat.parts).toEqual([{ label: 'ON THE NIGHT', n: 1 }]);
    expect(d.waysCut).toBeUndefined();
    // Marked for the board, so an ending after a reload mid-run still goes there.
    expect(d.rules).toBe('crew');
  });

  it('TAKE 2 of 3 pays two thirds, messy', async () => {
    const { relay, db } = relayWith();
    await start(relay, []);
    await send(relay, 'yard', 'round', 'you');
    await send(relay, 'hut', 'terminal', 'you');
    await send(relay, 'out', 'fence', 'you');
    const run = runOf(db);
    expect(run).toMatchObject({ done: true, takeFill: 2, alarm: 1, take: 'part' });
    expect(kitSum(run, (e) => e.sol)).toBe(270);
    expect(kitSum(run, (e) => e.rep?.delta)).toBe(repDelta(1, 'messy'));
    expect(debriefOf(db).heat.parts).toEqual([{ label: 'ON THE NIGHT', n: 2 }]);
  });

  it('a recruit hurt makes it messy though the take is full', async () => {
    const q = variant('→ in [take 2, heat 1]', '→ in [take 2, heat 1, hurt]');
    const { relay, db } = relayWith({ book: [q] });
    await start(relay, ['dez'], ['firewall']);
    await send(relay, 'yard', 'badge', 'dez');
    await send(relay, 'hut', 'terminal', 'p:firewall');
    await send(relay, 'out', 'fence', 'you');
    expect(runOf(db)).toMatchObject({ done: true, takeFill: 3, alarm: 0, take: 'full' });
    expect(runOf(db).crew!.goes.dez).toBe('hurt');
    expect(debriefOf(db).tier).toBe('messy');
    expect(kitSum(runOf(db), (e) => e.rep?.delta)).toBe(repDelta(1, 'messy'));
  });

  it('`lose 1` takes one off TAKE; a bigger loss never takes it below 0, and TAKE 0 is blown with no HEAT floor', async () => {
    const a = relayWith();
    await start(a.relay, []);
    await send(a.relay, 'yard', 'badge', 'you:scheduler');
    await send(a.relay, 'hut', 'press', 'you');
    expect(runOf(a.db)).toMatchObject({ takeFill: 3, alarm: 3 });
    await send(a.relay, 'out', 'gate', 'you');
    expect(runOf(a.db)).toMatchObject({ done: true, takeFill: 2 });

    const q = variant('  · you: Over the wire with the sheet. → home [heat 1]', '  · you: Over the wire with the sheet. → home [lose 5]');
    const b = relayWith({ book: [q] });
    await start(b.relay, []);
    await send(b.relay, 'yard', 'round', 'you');
    await send(b.relay, 'hut', 'terminal', 'you');
    await send(b.relay, 'out', 'fence', 'you');
    const run = runOf(b.db);
    expect(run).toMatchObject({ done: true, takeFill: 0, alarm: 1, take: 'none' });
    const d = debriefOf(b.db);
    expect(d.tier).toBe('blown');
    expect(kitSum(run, (e) => e.rep?.delta)).toBe(repDelta(1, 'blown'));
    expect(kitSum(run, (e) => e.sol)).toBe(0);
    // No blown floor on a crew-rules job (last pass A1): HEAT is what the ways printed, the night's 1.
    expect(d.heat.parts).toEqual([{ label: 'ON THE NIGHT', n: 1 }]);
    expect(d.heat.delta).toBe(1);
    expect(kitSum(run, (e) => e.heat)).toBe(1);
  });

  it('`cut 20` takes 20 % off the pay after TAKE scales it, and the debrief names it', async () => {
    const q = variant('→ in [take 1, cut 10]', '→ in [take 1, cut 20]');
    const { relay, db } = relayWith({ book: [q] });
    await start(relay, ['mia']);
    await send(relay, 'yard', 'round', 'mia');
    await send(relay, 'hut', 'terminal', 'you');
    await send(relay, 'out', 'fence', 'you');
    const run = runOf(db);
    expect(run).toMatchObject({ done: true, takeFill: 2 });
    // 400 × 2/3 is 270; 20 % off that is 210 (pay rounds to 10).
    expect(kitSum(run, (e) => e.sol)).toBe(210);
    const d = debriefOf(db);
    expect(d.sol).toBe(210);
    expect(d.waysCut).toEqual({ pct: 20, amount: 60 });
  });

  it('a fence brought adds TAKE +1 at the end, as today', async () => {
    const { relay, db } = relayWith({ members: [FEN] });
    await start(relay, ['fen']);
    await send(relay, 'yard', 'round', 'you');
    await send(relay, 'hut', 'terminal', 'you');
    await send(relay, 'out', 'fence', 'you');
    const run = runOf(db);
    expect(run).toMatchObject({ done: true, takeFill: 3, take: 'full' });
    expect(run.setup).toMatchObject({ fenced: true, fencedBy: 'fen' });
    expect(debriefOf(db).tier).toBe('clean');
  });

  it("a fence doesn't save TAKE 0: it's blown", async () => {
    const q = variant('  · you: Over the wire with the sheet. → home [heat 1]', '  · you: Over the wire with the sheet. → home [lose 5]');
    const { relay, db } = relayWith({ book: [q], members: [FEN] });
    await start(relay, ['fen']);
    await send(relay, 'yard', 'round', 'you');
    await send(relay, 'hut', 'terminal', 'you');
    await send(relay, 'out', 'fence', 'you');
    expect(runOf(db)).toMatchObject({ done: true, takeFill: 0, take: 'none' });
    expect(runOf(db).setup?.fenced).toBeUndefined();
    expect(debriefOf(db).tier).toBe('blown');
  });
});

describe("a clock that judges (Kroll's desk): the contact's trust at the end", () => {
  // A once job: the judge can go either way. Without once (a repeating job) it only loses trust.
  const REPEATING = CREW_TEXT.replace('clock seen: SEEN · 3', 'clock seen: SEEN · 3 · trust nix-direct');
  const JUDGED = REPEATING.replace('clock seen:', 'once: true\nclock seen:');
  const judged = (from?: string, to?: string, text = JUDGED) => {
    expect(text).toContain(from ?? '');
    return entry('crew-fixture', from && to !== undefined ? text.replace(from, to) : text);
  };
  const runAt = (seen: number): QuestRun => ({ crew: { ...freshCrew(), clocks: { seen } } }) as unknown as QuestRun;

  it('clockTrust: +1 at 0, 0 between, −2 full; never up on a blown job; null without a judging clock', () => {
    const q = judged();
    expect(clockTrust(q, runAt(0), 'clean')).toEqual({ delta: 1, reason: 'nothing on the glass' });
    expect(clockTrust(q, runAt(0), 'messy')).toEqual({ delta: 1, reason: 'nothing on the glass' });
    expect(clockTrust(q, runAt(1), 'clean')).toMatchObject({ delta: 0 });
    expect(clockTrust(q, runAt(3), 'clean')).toEqual({ delta: -2, reason: 'what the glass caught' });
    expect(clockTrust(q, runAt(3), 'blown')).toEqual({ delta: -2, reason: 'what the glass caught' });
    expect(clockTrust(q, runAt(0), 'blown')).toMatchObject({ delta: 0 });
    // A run with no crew clocks yet reads 0.
    expect(clockTrust(q, { crew: freshCrew() } as unknown as QuestRun, 'clean')).toMatchObject({ delta: 1 });
    expect(clockTrust(CREW_JOB, runAt(0), 'clean')).toBeNull();
  });

  it('clockTrust on a repeating job (not once): full −2 as before; at 0 and between, no move', () => {
    const q = judged(undefined, undefined, REPEATING);
    expect(q.once).toBeUndefined();
    expect(clockTrust(q, runAt(0), 'clean')).toMatchObject({ delta: 0 });
    expect(clockTrust(q, runAt(0), 'messy')).toMatchObject({ delta: 0 });
    expect(clockTrust(q, runAt(0), 'blown')).toMatchObject({ delta: 0 });
    expect(clockTrust(q, runAt(1), 'clean')).toMatchObject({ delta: 0 });
    expect(clockTrust(q, runAt(3), 'clean')).toEqual({ delta: -2, reason: 'what the glass caught' });
    expect(clockTrust(q, runAt(3), 'blown')).toEqual({ delta: -2, reason: 'what the glass caught' });
  });

  const trustOf = (db: Db) => parseStored(db.getMeta(standingKey('hicks')))?.trust ?? 4;
  const movesOf = (db: Db) => (parseStored(db.getMeta(standingKey('hicks')))?.moves ?? []).filter((m) => m.job);
  // The district: test's clean path (badge, terminal by the deck, the fence), the deck's way with its SEEN tag set to `seen`.
  const playClean = async (seen: string, text = JUDGED) => {
    const q = judged('  · program: Let the deck do it. → found [take 2, seen 1]', `  · program: Let the deck do it. → found [take 2${seen}]`, text);
    const r = relayWith({ book: [q], deck: 'deaf-meridian', trust: 4 });
    await start(r.relay, [], ['firewall']);
    await send(r.relay, 'yard', 'badge', 'you:scheduler');
    await send(r.relay, 'hut', 'terminal', 'p:firewall');
    await send(r.relay, 'out', 'fence', 'you');
    expect(debriefOf(r.db).tier).toBe('clean');
    return r;
  };

  it('SEEN 0 at a clean end: her trust +1, and rep is still paid', async () => {
    const { db } = await playClean('');
    expect(runOf(db).crew!.clocks.seen ?? 0).toBe(0);
    expect(trustOf(db)).toBe(5);
    expect(movesOf(db).map((m) => [m.trust, m.reason])).toEqual([[1, 'nothing on the glass']]);
    expect(kitSum(runOf(db), (e) => e.rep?.delta)).toBe(repDelta(1, 'clean'));
    const rep = debriefOf(db).rep;
    expect(rep.after - rep.before).toBe(repDelta(1, 'clean'));
    expect(debriefOf(db).trust).toEqual({ name: 'Nix', before: 'Sizing you up', after: 'Trusts you' });
  });

  it('a repeating job ended clean with SEEN at 0: no trust move, rep still paid, no trust line', async () => {
    const { db } = await playClean('', REPEATING);
    expect(runOf(db).crew!.clocks.seen ?? 0).toBe(0);
    expect(trustOf(db)).toBe(4);
    expect(movesOf(db)).toEqual([]);
    expect(kitSum(runOf(db), (e) => e.rep?.delta)).toBe(repDelta(1, 'clean'));
    expect(debriefOf(db).trust).toBeNull();
  });

  it('a repeating job ended with SEEN full: −2', async () => {
    const { db } = await playClean(', seen 3', REPEATING);
    expect(trustOf(db)).toBe(2);
    expect(movesOf(db).map((m) => [m.trust, m.reason])).toEqual([[-2, 'what the glass caught']]);
  });

  it('SEEN full: −2, rep still paid', async () => {
    const { db } = await playClean(', seen 3');
    expect(runOf(db).crew!.clocks.seen).toBe(3);
    expect(trustOf(db)).toBe(2);
    expect(movesOf(db).map((m) => [m.trust, m.reason])).toEqual([[-2, 'what the glass caught']]);
    expect(kitSum(runOf(db), (e) => e.rep?.delta)).toBe(repDelta(1, 'clean'));
    expect(debriefOf(db).trust).not.toBeUndefined();
  });

  it('SEEN between: no move, and the debrief has no word change to show', async () => {
    const { db } = await playClean(', seen 1');
    expect(trustOf(db)).toBe(4);
    expect(movesOf(db)).toEqual([]);
    expect(debriefOf(db).trust).toBeNull();
  });

  it('a blown job with SEEN at 0 gives nothing', async () => {
    const q = judged('  · you: Over the wire with the sheet. → home [heat 1]', '  · you: Over the wire with the sheet. → home [lose 5]');
    const { relay, db } = relayWith({ book: [q], trust: 4 });
    await start(relay, []);
    await send(relay, 'yard', 'round', 'you');
    await send(relay, 'hut', 'terminal', 'you');
    await send(relay, 'out', 'fence', 'you');
    expect(debriefOf(db).tier).toBe('blown');
    expect(runOf(db).crew!.clocks.seen ?? 0).toBe(0);
    expect(trustOf(db)).toBe(4);
    expect(movesOf(db)).toEqual([]);
    expect(kitSum(runOf(db), (e) => e.rep?.delta)).toBe(repDelta(1, 'blown'));
  });

  it('rewinding past the end row takes the move back', async () => {
    const { relay, db } = await playClean('');
    expect(trustOf(db)).toBe(5);
    const users = questRows(db).filter((m) => m.role === 'user');
    const end = users.findIndex((m) => m.quest?.debrief);
    await relay.rewind('hicks', users[end - 1].id);
    expect(runOf(db).done).not.toBe(true);
    expect(trustOf(db)).toBe(4);
    expect(movesOf(db)).toEqual([]);
  });

  it("the debrief's judge: the clock's label and end value, and the verdict, whatever her word does", async () => {
    expect(debriefOf((await playClean('')).db).judge).toEqual({ label: 'SEEN', value: 0, size: 3, delta: 1, words: 'NOTHING ON THE GLASS · TRUST ▲' });
    expect(debriefOf((await playClean(', seen 3')).db).judge).toEqual({ label: 'SEEN', value: 3, size: 3, delta: -2, words: 'WHAT THE GLASS CAUGHT · TRUST ▼▼' });
    expect(debriefOf((await playClean(', seen 1')).db).judge).toEqual({ label: 'SEEN', value: 1, size: 3, delta: 0, words: 'NOTED' });
    // A repeating job at 0: the label and value alone.
    expect(debriefOf((await playClean('', REPEATING)).db).judge).toEqual({ label: 'SEEN', value: 0, size: 3, delta: 0, words: '' });
    expect(debriefOf((await playClean(', seen 3', REPEATING)).db).judge).toMatchObject({ value: 3, delta: -2, words: 'WHAT THE GLASS CAUGHT · TRUST ▼▼' });
  });

  it("her summary at the end of a judged job says the rep moved (a judging clock leaves rep paid), with her standing", async () => {
    const { db } = await playClean('');
    const summary = missionSummary(judged(), runOf(db), DECKS, debriefOf(db));
    expect(summary).toMatch(/Their name in \S+ went up\./);
    expect(summary).toContain('Their standing with you went up.');
    // A trust: stake job still says nothing of rep: rep is off there.
    expect(missionSummary(judged(), runOf(db), DECKS, { ...debriefOf(db), judge: undefined, trust: null })).not.toContain('Their name in');
  });

  it('judgeOf: a blown once job at 0 is NOTED, no arrow; none without a judging clock', () => {
    const q = judged();
    expect(judgeOf(q, runAt(0), 'blown')).toEqual({ label: 'SEEN', value: 0, size: 3, delta: 0, words: 'NOTED' });
    expect(judgeOf(q, runAt(2), 'messy')).toMatchObject({ value: 2, words: 'NOTED' });
    expect(judgeOf(CREW_JOB, runAt(0), 'clean')).toBeNull();
  });

  it('a job without a judging clock moves no trust, as before', async () => {
    const { relay, db } = relayWith({ deck: 'deaf-meridian', trust: 4 });
    await start(relay, [], ['firewall']);
    await send(relay, 'yard', 'badge', 'you:scheduler');
    await send(relay, 'hut', 'terminal', 'p:firewall');
    await send(relay, 'out', 'fence', 'you');
    expect(movesOf(db)).toEqual([]);
    expect(debriefOf(db).trust).toBeUndefined();
  });
});

describe('crew rules: the getaway', () => {
  // ALARM 2+ at the gate: a way that raises it to 4. The getaway gets a way that would fill TAKE, into an outcome that keeps it.
  const loud = (text: string) =>
    text
      .replace('→ home [take 1, lose 1] if alarm>=2', '→ home [alarm 2] if alarm>=2')
      .replace('  · you: Wait it out in the dark. → stuck [alarm 1]', '  · you: Wait it out in the dark. → clear [take 2, alarm 1]')
      .replace('## stuck\n', '## clear\n\n*It quiets. You walk out with what you came for.*\n\npay: full\n→ end\n\n## stuck\n');
  const Q = entry('crew-fixture', loud(CREW_TEXT));

  it('Review Focus 5: ALARM 4 from a way on `out` moves the run to its own getaway once; its `take 2` fills nothing; the take is part at best', async () => {
    const a = relayWith({ book: [Q] });
    await start(a.relay, []);
    await send(a.relay, 'yard', 'badge', 'you:scheduler');
    await send(a.relay, 'hut', 'press', 'you');
    expect(runOf(a.db)).toMatchObject({ takeFill: 3, alarm: 3 });
    await send(a.relay, 'out', 'gate', 'you');
    expect(runOf(a.db)).toMatchObject({ beat: 'getaway', getaway: true, alarm: 4, done: false });
    expect(questRows(a.db).at(-1)!.text).toContain('*The horn goes.*');
    expect(a.relay.questState('hicks').active!.crew!.cards.map((c) => c.id)).toEqual(['run', 'hide']);
    await send(a.relay, 'getaway', 'hide', 'you');
    const run = runOf(a.db);
    expect(run).toMatchObject({ done: true, takeFill: 3, take: 'part', alarm: 4 });
    expect(run.picks.filter((p) => p.beat === 'getaway')).toHaveLength(1);
    expect(debriefOf(a.db).tier).toBe('messy');

    const b = relayWith({ book: [Q] });
    await start(b.relay, []);
    await send(b.relay, 'yard', 'badge', 'you:scheduler');
    await send(b.relay, 'hut', 'terminal', 'you');
    expect(runOf(b.db)).toMatchObject({ takeFill: 2, alarm: 2 });
    await send(b.relay, 'out', 'gate', 'you');
    expect(runOf(b.db)).toMatchObject({ beat: 'getaway', alarm: 4 });
    await send(b.relay, 'getaway', 'hide', 'you');
    expect(runOf(b.db)).toMatchObject({ done: true, takeFill: 2, take: 'part' });
  });

  it("a getaway's outcome may go on to a beat: its pick is a plain pick that ends the job, TAKE part at best", async () => {
    const grey = loud(CREW_TEXT)
      .replace('## stuck\n\n*Stuck on the rigs with nothing.*\n\ntake: none\n→ end', '## stuck\n\n*Stuck on the rigs with nothing.*\n\ntake: none\n→ grey')
      .concat('\n# grey\n\n*A grey car idles at the gate.*\n\nview nix-direct: You heard the call.\n\n- own: Tell her. → owned [set cover=cracked]\n- quiet: Say nothing. → owned\n\n## owned\n\n*The line goes dead.*\n\n→ end\n');
    const { relay, db } = relayWith({ book: [entry('crew-fixture', grey)] });
    await start(relay, []);
    await send(relay, 'yard', 'badge', 'you:scheduler');
    await send(relay, 'hut', 'press', 'you');
    await send(relay, 'out', 'gate', 'you');
    expect(runOf(db)).toMatchObject({ beat: 'getaway', alarm: 4 });
    expect(await send(relay, 'getaway', 'run', 'you')).not.toBeTypeOf('string');
    expect(runOf(db)).toMatchObject({ beat: 'grey', getaway: true, done: false, alarm: 4 });
    expect(questRows(db).at(-1)!.text).toContain('*A grey car idles at the gate.*');
    expect(relay.questState('hicks').active!.crew!.cards.map((c) => [c.id, c.plain])).toEqual([
      ['own', true],
      ['quiet', true],
    ]);
    expect(await relay.chooseQuest('hicks', { id: 'crew-fixture', beat: 'grey', choice: 'own' })).not.toBeTypeOf('string');
    const run = runOf(db);
    expect(run).toMatchObject({ done: true, take: 'none', alarm: 4, flags: expect.objectContaining({ cover: 'cracked' }) });
    expect(run.picks.filter((p) => p.beat === 'getaway')).toHaveLength(1);
    expect(debriefOf(db).tier).toBe('blown');
  });

  it('withGetaway leaves a crew-rules job as it is: never the stock getaway', () => {
    const bare: QuestEntry = { ...CREW_JOB, beats: new Map([...CREW_JOB.beats].filter(([id]) => id !== 'getaway')) };
    expect(withGetaway(bare)).toBe(bare);
    expect(withGetaway(CREW_JOB)).toBe(CREW_JOB);
    // A Graft job with none still gets the stock one.
    expect(withGetaway(NIGHT).beats.has('getaway')).toBe(true);
  });
});

describe('crew rules: pressing on', () => {
  const PUSH = '\n# push-1\n\n*A crate by the gate, nobody on it.*\n\n- crate: Lift the crate. [short THE CRATE]\n  · you: Lift it yourself. → lifted [heat 1, set crate=yes]\n- leave: Leave it.\n  · you: Leave it and go. → lifted [alarm 1]\n\n## lifted\n\n*Heavy, and worth it.*\n\npay: +60\n→ end\n';
  const Q = entry('crew-fixture', CREW_TEXT + PUSH);

  it('PRESS ON is offered with NERVE gone, costs none, and its beat\'s ways land like any other', async () => {
    const { relay, db } = relayWith({ book: [Q], nerve: 0 });
    await start(relay, []);
    await send(relay, 'yard', 'badge', 'you:scheduler');
    await send(relay, 'hut', 'terminal', 'you');
    await send(relay, 'out', 'fence', 'you');
    expect(runOf(db)).toMatchObject({ beat: '!push', done: false });
    expect(relay.questState('hicks').active!.choices.map((c) => c.id)).toContain('!press');
    // On the board, not the table: WALK and PRESS ON as plain panels, the hand with no moves to play.
    const offer = relay.questState('hicks').active!.crew!;
    expect(offer.title).toBe('PRESS ON?');
    expect(relay.questState('hicks').active!.tier).toBe(Q.tier);
    expect(offer.cards.map((c) => [c.id, c.short, c.plain])).toEqual([['!walk', 'WALK', true], ['!press', 'PRESS ON', true]]);
    expect(offer.cards[0].line).toMatch(/^\d+ SOL · HEAT [+−]\d+$/);
    expect(offer.hand.map((h) => h.id)).toContain('you');
    expect(offer.hand.some((h) => h.move)).toBe(false);
    expect(await relay.chooseQuest('hicks', { id: 'crew-fixture', beat: '!push', choice: '!press' })).not.toBeTypeOf('string');
    expect(runOf(db)).toMatchObject({ beat: 'push-1' });
    expect(kitSum(runOf(db), (e) => e.nerve)).toBe(0);
    expect(relay.questState('hicks').active!.crew!.cards.map((c) => c.id)).toEqual(['crate', 'leave']);
    await send(relay, 'push-1', 'crate', 'you');
    const run = runOf(db);
    expect(run).toMatchObject({ done: true, flags: expect.objectContaining({ crate: 'yes' }) });
    expect(run.crew!.heat).toBe(2);
    expect(run.push).toMatchObject({ state: 'won', pot: 60 });
  });

  // A lost push (review): Night Clerk's register beat pays +160 on every way, so it can't be lost as written; the
  // fixture's push beat here loses on both ways.
  it('a lost push drops the take a step: from part it is blown and the pay goes; the debrief says PRESS ON lost', async () => {
    const LOSE = '\n# push-1\n\n*A crate by the gate, and the clerk coming back.*\n\n- crate: Lift the crate. [short THE CRATE]\n  · you: Lift it in front of him. → caught [alarm 1]\n- leave: Leave it.\n  · you: Leave it and go. → caught [heat 1]\n\n## caught\n\n*He sees you with your hands in it.*\n\nlost\n→ end\n';
    const { relay, db } = relayWith({ book: [entry('crew-fixture', CREW_TEXT + LOSE)] });
    await start(relay, []);
    await send(relay, 'yard', 'badge', 'you:scheduler');
    await send(relay, 'hut', 'terminal', 'you');
    await send(relay, 'out', 'fence', 'you');
    expect(runOf(db)).toMatchObject({ beat: '!push', done: false });
    const pay = kitSum(runOf(db), (e) => e.sol);
    expect(pay).toBeGreaterThan(0);
    // TAKE short of full is a part take; a lost push drops it to none, which is blown and pays nothing (as on Graft).
    expect(runOf(db).take).toBe('part');
    expect(relay.questState('hicks').active!.crew!.cards.find((c) => c.id === '!press')!.line).toBe('One more beat. Lose it, and the job is blown: no pay at all.');
    expect(await relay.chooseQuest('hicks', { id: 'crew-fixture', beat: '!push', choice: '!press' })).not.toBeTypeOf('string');
    await send(relay, 'push-1', 'crate', 'you');
    const run = runOf(db);
    expect(run).toMatchObject({ done: true });
    expect(run.push).toMatchObject({ state: 'lost', pot: 0 });
    expect(run.take).toBe('none');
    expect(kitSum(run, (e) => e.sol)).toBe(0);
    const d = debriefOf(db);
    expect(d.push).toBe('lost');
    expect(d.tier).toBe('blown');
    expect(d.sol).toBe(0);
    expect(d.pushes).toEqual([expect.objectContaining({ result: 'lost', sol: 0 })]);
    expect(d.rules).toBe('crew');
  });

  it("a push beat's lose never lands (jobStep), so the board doesn't print it as emptying the TAKE", async () => {
    const PUSH = '\n# push-1\n\n*A crate by the gate.*\n\n- crate: Lift the crate. [short THE CRATE]\n  · you: Lift it and drop half. → off [lose 9]\n- leave: Leave it.\n  · you: Leave it and go. → off\n\n## off\n\n*You go.*\n\npay: +60\n→ end\n';
    const { relay, db } = relayWith({ book: [entry('crew-fixture', CREW_TEXT + PUSH)] });
    await start(relay, []);
    await send(relay, 'yard', 'badge', 'you:scheduler');
    await send(relay, 'hut', 'terminal', 'you');
    await send(relay, 'out', 'fence', 'you');
    expect(await relay.chooseQuest('hicks', { id: 'crew-fixture', beat: '!push', choice: '!press' })).not.toBeTypeOf('string');
    const way = relay.questState('hicks').active!.crew!.cards.find((c) => c.id === 'crate')!.ways[0];
    expect(way.leaves).toBeUndefined();
    const fill = runOf(db).takeFill;
    await send(relay, 'push-1', 'crate', 'you');
    expect(runOf(db)).toMatchObject({ done: true, takeFill: fill });
    expect(debriefOf(db).tier).not.toBe('blown');
  });

  it('a lost push from a full take: part, the pot and half the pay go; the debrief says PRESS ON lost', async () => {
    const LOSE = '\n# push-1\n\n*A crate by the gate, and the clerk coming back.*\n\n- crate: Lift the crate. [short THE CRATE]\n  · you: Lift it in front of him. → caught [alarm 1]\n- leave: Leave it.\n  · you: Leave it and go. → caught [heat 1]\n\n## caught\n\n*He sees you with your hands in it.*\n\nlost\n→ end\n';
    const { relay, db } = relayWith({ book: [entry('crew-fixture', CREW_TEXT + LOSE)] });
    await start(relay, []);
    await send(relay, 'yard', 'badge', 'you:branch');
    await send(relay, 'hut', 'terminal', 'you');
    await send(relay, 'out', 'gate', 'you');
    expect(runOf(db)).toMatchObject({ beat: '!push', done: false, take: 'full' });
    expect(relay.questState('hicks').active!.crew!.cards.find((c) => c.id === '!press')!.line).toBe('One more beat. Lose it, and the pot goes with half the pay.');
    const pay = kitSum(runOf(db), (e) => e.sol);
    expect(pay).toBeGreaterThan(0);
    expect(await relay.chooseQuest('hicks', { id: 'crew-fixture', beat: '!push', choice: '!press' })).not.toBeTypeOf('string');
    await send(relay, 'push-1', 'leave', 'you');
    const run = runOf(db);
    expect(run).toMatchObject({ done: true, take: 'part' });
    expect(run.push).toMatchObject({ state: 'lost', pot: 0 });
    expect(kitSum(run, (e) => e.sol)).toBe(pay - Math.floor(pay / 2));
    const d = debriefOf(db);
    expect(d.push).toBe('lost');
    expect(d.pushes).toEqual([expect.objectContaining({ result: 'lost', sol: 0 })]);
    expect(d.tier).not.toBe('blown');
  });

  it("isn't offered at ALARM 3, as today", async () => {
    const { relay, db } = relayWith({ book: [Q] });
    await start(relay, []);
    await send(relay, 'yard', 'badge', 'you:scheduler');
    await send(relay, 'hut', 'press', 'you');
    await send(relay, 'out', 'fence', 'you');
    expect(runOf(db)).toMatchObject({ done: true, alarm: 3 });
    expect(runOf(db).push).toBeUndefined();
  });
});

describe('crew rules: old runs', () => {
  const GRAFT_TEXT = '---\ntitle: Crew Fixture\nkind: mission\ntier: 1\nwith: [nix-direct]\nstarts: haes-noodles\nafter: null\npitch: A yard, on Graft.\npay: 400\n---\n\n# yard\n\n*The yard at night.*\n\n- walk: Walk in like you work there. → home\n- wait: Wait for the shift change. → home\n\n## home\n\n*Home with the sheet.*\n\npay: full\n→ end\n';
  const GRAFT = entry('crew-fixture', GRAFT_TEXT);
  const notices = (sink: unknown[]) => sink.filter((e) => (e as { type: string }).type === 'notice').map((e) => (e as { text: string }).text);

  it('Review Focus 2: a Graft run in progress on a file now crew rules is dropped, the job listed again, one notice', async () => {
    const old = relayWith({ book: [GRAFT] });
    expect(await old.relay.startQuest('hicks', 'crew-fixture')).not.toBeTypeOf('string');
    expect(runOf(old.db).crew).toBeUndefined();
    const sink: unknown[] = [];
    const now = relayWith({ db: old.db, emit: (e) => sink.push(e) });
    const state = now.relay.questState('hicks');
    expect(state.active).toBeNull();
    expect(state.open.map((o) => o.id)).toContain('crew-fixture');
    expect(old.db.getMeta(KEY)).toBeNull();
    now.relay.questState('hicks');
    expect(notices(sink)).toEqual([expect.stringContaining('STARTS OVER')]);
    // Offered again from its start, on crew rules.
    expect(await start(now.relay, [])).not.toBeTypeOf('string');
    expect(runOf(old.db)).toMatchObject({ beat: 'yard', crew: freshCrew() });
  });

  it('the mirror: a crew run in progress on a file no longer crew rules is dropped the same way', async () => {
    const old = relayWith();
    await start(old.relay, ['dez']);
    const sink: unknown[] = [];
    const now = relayWith({ db: old.db, book: [GRAFT], emit: (e) => sink.push(e) });
    const state = now.relay.questState('hicks');
    expect(state.active).toBeNull();
    expect(state.open.map((o) => o.id)).toContain('crew-fixture');
    expect(old.db.getMeta(KEY)).toBeNull();
    expect(notices(sink)).toEqual([expect.stringContaining('STARTS OVER')]);
  });

  it('a finished run of either kind is untouched', async () => {
    const graft = relayWith({ book: [GRAFT] });
    await graft.relay.startQuest('hicks', 'crew-fixture');
    await graft.relay.chooseQuest('hicks', { id: 'crew-fixture', beat: 'yard', choice: 'walk' });
    const before = graft.db.getMeta(KEY);
    expect(parseRun(before!)!.done).toBe(true);
    const sink: unknown[] = [];
    relayWith({ db: graft.db, emit: (e) => sink.push(e) }).relay.questState('hicks');
    expect(graft.db.getMeta(KEY)).toBe(before);
    expect(notices(sink)).toEqual([]);

    const crew = relayWith();
    await start(crew.relay, []);
    await send(crew.relay, 'yard', 'round', 'you');
    await send(crew.relay, 'hut', 'terminal', 'you');
    await send(crew.relay, 'out', 'fence', 'you');
    const done = crew.db.getMeta(KEY);
    expect(parseRun(done!)!.done).toBe(true);
    relayWith({ db: crew.db, book: [GRAFT] }).relay.questState('hicks');
    expect(crew.db.getMeta(KEY)).toBe(done);
  });
});

describe("crew rules: a way's set reaches later jobs", () => {
  it("storyFlagsOf keeps a way's `set` flag as it keeps a card's", () => {
    expect(storyFlagsOf(CREW_JOB, { flags: { asked: 'yes', other: 'x' } })).toEqual({ asked: 'yes' });
  });

  it("a later job's ways read what an earlier job's way set", async () => {
    const later = entry('later', CREW_TEXT.replace('title: Crew Fixture', 'title: Later\nfor: hicks').replace('  · face: Talk to the dog man.', '  · you asked: Walk in on her name. → in [take 2, heat 1] if asked=yes\n  · face: Talk to the dog man.'));
    const { relay } = relayWith({ book: [CREW_JOB, later] });
    await start(relay, []);
    await send(relay, 'yard', 'round', 'you');
    await send(relay, 'hut', 'terminal', 'contact');
    await send(relay, 'out', 'fence', 'you');
    expect(await relay.startQuest('hicks', 'later', { crew: true, people: [], programs: [] })).not.toBeTypeOf('string');
    expect(relay.questState('hicks').active!.crew!.cards[1].ways.map((w) => w.name ?? '')).toEqual(['', 'asked']);
  });
});

describe('crew rules: the route, the deck, the events', () => {
  it("a crew-rules job's route counts its beats of ways", async () => {
    const { relay } = relayWith();
    await start(relay, []);
    expect(relay.questState('hicks').active!.route).toEqual({ ways: [{ via: null, beats: [{ id: 'yard', title: expect.any(String) }, { id: 'hut', title: expect.any(String) }, { id: 'out', title: expect.any(String) }] }], played: [] });
  });

  it('conditions on a barred crew job read the Pocket deck the hand loads from', async () => {
    const q = entry('crew-fixture', CREW_TEXT.replace('pay: 400', 'pay: 400\nbars: stall-build').replace('  · face: Talk to the dog man.', '  · you pocket: Let the pocket deck find the way. → in [take 2, seen 1] if deck=pocket-deck\n  · face: Talk to the dog man.'));
    const { relay } = relayWith({ book: [q] });
    await start(relay, []);
    expect(relay.questState('hicks').active!.crew!.cards[1].ways.map((w) => w.name ?? '')).toEqual(['', 'pocket']);
  });

  it('quest_choose carries by; quest_move is read and checked', () => {
    expect(validateClientEvent({ type: 'quest_choose', id: 'j', beat: 'b', choice: 'c', by: 'you:branch' })).toEqual({ type: 'quest_choose', id: 'j', beat: 'b', choice: 'c', by: 'you:branch' });
    expect(validateClientEvent({ type: 'quest_choose', id: 'j', beat: 'b', choice: 'c', by: 7 })).toBeTypeOf('string');
    expect(validateClientEvent({ type: 'quest_move', id: 'j', beat: 'b', card: 'p:firewall' })).toEqual({ type: 'quest_move', id: 'j', beat: 'b', card: 'p:firewall' });
    expect(validateClientEvent({ type: 'quest_move', id: 'j', beat: 'b' })).toBeTypeOf('string');
  });
});

/**
 * The two jobs on the crew rules (Task 7): Run Sheet and Night Clerk as written in world/quests, played through the
 * relay. The files are moved onto this relay's player, contact and place; their beats, ways and outcomes are as written.
 */
describe('the two jobs on the crew rules', () => {
  const read = (id: string) => fs.readFileSync(`world/quests/${id}.md`, 'utf8');
  const onRelay = (text: string) =>
    text
      .replace(/^for: soren\n/m, '')
      .replace(/^opening(-view)?: .*\n/gm, '')
      .replace(/^with: \[rue\]$/m, 'with: [nix-direct]')
      .replace(/^starts: [a-z-]+$/m, 'starts: haes-noodles')
      .replace(/^view rue( if [^:]+)?:/gm, 'view nix-direct$1:');
  const RUN_SHEET = entry('run-sheet', onRelay(read('run-sheet')));
  const keyOf = (id: string) => questKey('hicks', `${id}@0`);
  const runAt = (db: Db, id: string): QuestRun => parseRun(db.getMeta(keyOf(id)))!;
  const go = (relay: ChatRelay, id: string, beat: string, choice: string, by?: string) => relay.chooseQuest('hicks', { id, beat, choice, ...(by !== undefined ? { by } : {}) });
  const begin = (relay: ChatRelay, id: string, people: string[], programs: string[] = []) => relay.startQuest('hicks', id, { crew: true, people, programs });

  it('both files parse with no problems and no warnings', () => {
    for (const id of ['run-sheet', 'night-clerk']) {
      const r = parseQuestFile(id, read(id), known);
      expect(r.ok ? r.warnings : r.problems, id).toEqual([]);
      expect(r.ok && r.entry.rules, id).toBe('crew');
      expect(r.ok && r.entry.template, id).toBeUndefined();
    }
  });

  describe('Run Sheet', () => {
    // GO IN with nobody (Run Sheet is solo) and any programs; then her plain pick at the crate.
    const playCrew = async (picks: [string, string, string][], programs: string[] = []) => {
      const r = relayWith({ book: [RUN_SHEET] });
      expect(await begin(r.relay, 'run-sheet', [], programs)).not.toBeTypeOf('string');
      expect(await go(r.relay, 'run-sheet', 'ask', 'take')).not.toBeTypeOf('string');
      for (const [beat, card, by] of picks) expect(await go(r.relay, 'run-sheet', beat, card, by), `${beat} ${card} ${by}`).not.toBeTypeOf('string');
      return r;
    };

    describe('her opening (playtest: she narrated the player instead of putting the job to him)', () => {
      const last = (r: { backend: { reqs: TurnRequest[] } }) => r.backend.reqs.at(-1)!.messages.at(-1)!.content;
      const missionLine = (sent: string) => sent.split('\n').find((l) => l.startsWith('[mission — '))!;

      it('her own job in her room opens with MISSION_OPEN_HERS, and the turn ends on the cue', async () => {
        const r = relayWith({ book: [RUN_SHEET] });
        await begin(r.relay, 'run-sheet', []);
        const sent = last(r);
        expect(sent).toContain(MISSION_OPEN_HERS);
        expect(sent).not.toContain(MISSION_OPEN);
        expect(sent.split('\n').at(-1)).toBe(turnCue('nix-direct', 'hicks'));
        expect(sent).toContain('[your turn: you are nix-direct. Speak to hicks now, in your own voice, from where you are. Write nothing hicks does, says, thinks or notices.]');
        // The [job] line is right before it.
        expect(sent.split('\n\n').at(-2)).toMatch(/^\[job — Run Sheet/);
      });

      it('a beat reply ends on the cue too; a plain chat turn has none', async () => {
        const r = relayWith({ book: [RUN_SHEET] });
        await begin(r.relay, 'run-sheet', []);
        await go(r.relay, 'run-sheet', 'ask', 'take');
        const beat = last(r);
        expect(beat).toContain(MISSION_BEAT);
        expect(beat.split('\n').at(-1)).toBe(turnCue('nix-direct', 'hicks'));
        await r.relay.send('hicks', 'hey');
        expect(last(r)).not.toContain('[your turn:');
        expect(last(r).split('\n').at(-1)).toBe('hey');
      });

      it('with her away on the first beat, the job keeps MISSION_OPEN', async () => {
        const away = entry('run-sheet', onRelay(read('run-sheet')).replace('# ask\n', '# ask\nroom: default/workspace\n'));
        const r = relayWith({ book: [away] });
        await begin(r.relay, 'run-sheet', []);
        expect(last(r)).toContain(MISSION_OPEN);
        expect(last(r)).not.toContain(MISSION_OPEN_HERS);
        expect(last(r).split('\n').at(-1)).toBe(turnCue('nix-direct', 'hicks'));
      });

      it("a job that isn't hers keeps MISSION_OPEN", async () => {
        const r = relayWith({ book: [NIGHT] });
        await r.relay.startQuest('hicks', 'night-shift');
        expect(last(r)).toContain(MISSION_OPEN);
        expect(last(r)).not.toContain(MISSION_OPEN_HERS);
      });

      it('a Graft job of hers, first beat in the room, keeps MISSION_OPEN (on-the-stairs, playtest: HERS retold the client at length)', async () => {
        const hers = entry('night-shift', MISSION.replace('with: [hicks, ember, nix-direct]', 'with: [nix-direct]'));
        expect(hers.with).toEqual(['nix-direct']);
        const r = relayWith({ book: [hers] });
        await r.relay.startQuest('hicks', 'night-shift');
        expect(last(r)).toContain(MISSION_OPEN);
        expect(last(r)).not.toContain(MISSION_OPEN_HERS);
        expect(last(r).split('\n').at(-1)).toBe(turnCue('nix-direct', 'hicks'));
      });

      it("HERS asks for her own voice, first person, two to four short sentences", () => {
        expect(MISSION_OPEN_HERS).toContain('Say it in your own voice, in the first person, in two to four short sentences: what you want and why it matters to you. Stop before they answer.');
        expect(MISSION_OPEN_HERS).not.toContain('a few sentences at most');
      });

      it('the [mission] line has no stats as numbers; the barred field deck is the Pocket deck in both lines', async () => {
        const r = relayWith({ book: [RUN_SHEET], deck: 'field-deck' });
        await begin(r.relay, 'run-sheet', []);
        const sent = last(r);
        const line = missionLine(sent);
        expect(line).not.toMatch(/\b(BODY|REFLEX|TECH|COOL|WITS|EDGE) \d/);
        expect(line).toContain('hicks: carries a pocket deck; heat 0 of 10');
        expect(sent).toContain('hicks carries a pocket deck. Heat 0 of 10 here.');
        expect(sent).not.toMatch(/field deck|no deck/i);
      });

      it('a Graft job that bars the carried deck: the kit line agrees with the [mission] line (no deck)', async () => {
        const graft = entry('night-shift', MISSION.replace(/^---\n/, '---\nbars: stall-build\n'));
        const r = relayWith({ book: [graft] });
        await r.relay.startQuest('hicks', 'night-shift');
        const sent = last(r);
        expect(missionLine(sent)).toContain('hicks: no deck; heat 0 of 10');
        expect(sent).not.toContain('carries a stall build');
      });

      it('the board line ends the posted-by name before the brief', async () => {
        const r = relayWith({ book: [RUN_SHEET] });
        await begin(r.relay, 'run-sheet', []);
        expect(last(r)).toContain('Posted by: Rue. Rue has work for a scheduler');
      });
    });

    it('all scheduler: messy, TAKE 3 of 4, ALARM 2, HEAT +1 from the night, nothing heard', async () => {
      const { relay, db } = await playCrew([
        ['yard', 'badge', 'you:scheduler'],
        ['hut', 'terminal', 'you:scheduler'],
        ['gate', 'talk', 'you:scheduler'],
      ]);
      expect(runAt(db, 'run-sheet')).toMatchObject({ beat: 'home', takeFill: 3, alarm: 2 });
      expect(runAt(db, 'run-sheet').crew).toMatchObject({ heat: 1, clocks: {} });
      expect(relay.questState('hicks').active!.crew!.cards.map((c) => c.id)).toEqual(['tell', 'freight']);
      expect(await go(relay, 'run-sheet', 'home', 'tell')).not.toBeTypeOf('string');
      const run = runAt(db, 'run-sheet');
      expect(run).toMatchObject({ done: true, take: 'part' });
      expect(run.flags.cover).toBeUndefined();
      expect(debriefOf(db).tier).toBe('messy');
    });

    it('the branch at the badge, then a scheduler: clean, TAKE 4, ALARM 1, heard once', async () => {
      const { relay, db } = await playCrew([
        ['yard', 'badge', 'you:branch'],
        ['hut', 'terminal', 'you:scheduler'],
        ['gate', 'talk', 'you:scheduler'],
      ]);
      expect(runAt(db, 'run-sheet')).toMatchObject({ takeFill: 4, alarm: 1 });
      expect(runAt(db, 'run-sheet').crew!.clocks).toEqual({ hears: 1 });
      await go(relay, 'run-sheet', 'home', 'freight');
      expect(runAt(db, 'run-sheet')).toMatchObject({ done: true, take: 'full', flags: expect.objectContaining({ stamp: 'hidden' }) });
      expect(debriefOf(db).tier).toBe('clean');
    });

    it("the branch, the pocket deck, the branch: heard 3, and the ending cracks his cover; at 2 her home view has its line", async () => {
      const three = await playCrew(
        [
          ['yard', 'badge', 'you:branch'],
          ['hut', 'terminal', 'p:firewall'],
          ['gate', 'talk', 'you:branch'],
        ],
        ['firewall'],
      );
      expect(runAt(three.db, 'run-sheet').crew!.clocks).toEqual({ hears: 3 });
      expect(three.relay.questState('hicks').active!.crew!.cards.map((c) => c.id)).toEqual(['tell-heard', 'freight-heard']);
      await go(three.relay, 'run-sheet', 'home', 'tell-heard');
      expect(runAt(three.db, 'run-sheet')).toMatchObject({ done: true, flags: expect.objectContaining({ cover: 'cracked', stamp: 'told' }) });

      const two = await playCrew(
        [
          ['yard', 'badge', 'you:branch'],
          ['hut', 'terminal', 'p:firewall'],
          ['gate', 'talk', 'you:scheduler'],
        ],
        ['firewall'],
      );
      expect(runAt(two.db, 'run-sheet').crew!.clocks).toEqual({ hears: 2 });
      const block = two.relay['jobs'].questBlockFor('hicks', false)!;
      expect(block).toContain('no scheduler works like that');
      expect(block).not.toContain('you owe him nothing for the sheet');
      await go(two.relay, 'run-sheet', 'home', 'tell');
      expect(runAt(two.db, 'run-sheet').flags.cover).toBeUndefined();
    });

    it("her card on the terminal: asked=yes, and her home view says she owes him nothing", async () => {
      const { relay, db } = await playCrew([
        ['yard', 'round', 'you'],
        ['hut', 'terminal', 'contact'],
        ['gate', 'talk', 'you:scheduler'],
      ]);
      expect(runAt(db, 'run-sheet').flags.asked).toBe('yes');
      expect(runAt(db, 'run-sheet').crew!.goes).toEqual({ contact: 'spent' });
      expect(relay['jobs'].questBlockFor('hicks', false)!).toContain('you owe him nothing for the sheet');
    });

    it('asking her costs half the fee: the debrief names a 50 % cut', async () => {
      const { relay, db } = await playCrew([
        ['yard', 'round', 'you'],
        ['hut', 'terminal', 'contact'],
        ['gate', 'talk', 'you:scheduler'],
      ]);
      expect(questRows(db).some((m) => m.role === 'user' && m.text.includes('Half the hundred goes back across the crate for it.'))).toBe(true);
      expect(await go(relay, 'run-sheet', 'home', 'tell')).not.toBeTypeOf('string');
      expect(runAt(db, 'run-sheet').done).toBe(true);
      expect(debriefOf(db).waysCut).toMatchObject({ pct: 50 });
    });

    it("at the gate with TAKE already full, no way prints a TAKE that can't land; one short, the branch prints 1 (last pass A2)", async () => {
      const full = await playCrew(
        [
          ['yard', 'badge', 'you:branch'],
          ['hut', 'terminal', 'p:firewall'],
        ],
        ['firewall'],
      );
      expect(runAt(full.db, 'run-sheet')).toMatchObject({ beat: 'gate', takeFill: 4 });
      expect(full.relay.questState('hicks').active!.crew!.cards.map((c) => c.ways.map((w) => [w.name ?? '', w.take]))).toEqual([
        [
          ['scheduler', 0],
          ['branch', 0],
        ],
        [['', 0]],
      ]);
      const short = await playCrew([
        ['yard', 'badge', 'you:branch'],
        ['hut', 'terminal', 'you:scheduler'],
      ]);
      expect(runAt(short.db, 'run-sheet')).toMatchObject({ beat: 'gate', takeFill: 3 });
      expect(short.relay.questState('hicks').active!.crew!.cards.map((c) => c.ways.map((w) => w.take))).toEqual([[1, 1], [1]]);
    });

    it("on the yard's line she hears what the badge cost; the player's row and what was heard as text don't show it (last pass C)", async () => {
      const r = relayWith({ book: [RUN_SHEET] });
      await begin(r.relay, 'run-sheet', []);
      await go(r.relay, 'run-sheet', 'ask', 'take');
      await go(r.relay, 'run-sheet', 'yard', 'badge', 'you:scheduler');
      const row = questRows(r.db).filter((m) => m.role === 'user').at(-1)!;
      const pick = 'You slouch up tired and bored, a man on his own shift. Let him ask.';
      expect(row.quest!.pick!.line).toBe(pick);
      // The hut is a beat she hears over the line: she reads `heard`, and the words go there.
      expect(row.quest!.heard).toBeDefined();
      expect(r.backend.reqs.at(-1)!.messages.at(-1)!.content).toContain(`${pick} It drew notice.`);
      expect(row.text).not.toContain('It drew notice.');
      expect(row.quest!.heard).not.toContain('It drew notice.');
      expect(runAt(r.db, 'run-sheet').picks.at(-1)!.told).toBe(`${pick} It drew notice.`);
    });

    it('the press then the yard: ALARM 4, the getaway', async () => {
      const { relay, db } = await playCrew([
        ['yard', 'badge', 'you:branch'],
        ['hut', 'press', 'you'],
        ['gate', 'yard', 'you'],
      ]);
      expect(runAt(db, 'run-sheet')).toMatchObject({ beat: 'getaway', getaway: true, alarm: 4, done: false });
      expect(relay.questState('hicks').active!.crew!.cards.map((c) => [c.id, c.ways.map((w) => w.by)])).toEqual([
        ['call', ['you']],
        ['run', ['you']],
      ]);
      // Both leave you nothing, and the board says so beside what each costs (final review C2): hears 3, or HEAT 2.
      expect(relay.questState('hicks').active!.crew!.cards.map((c) => c.ways.map((w) => [w.clocks, w.heat, w.leaves]))).toEqual([
        [[{ hears: 3 }, 0, 'none']],
        [[{}, 2, 'none']],
      ]);
    });

    it("the getaway: call plays called and reaches the Grey Car heard 3; run plays stuck, TAKE none", async () => {
      const loud: [string, string, string][] = [
        ['yard', 'badge', 'you:scheduler'],
        ['hut', 'press', 'you'],
        ['gate', 'yard', 'you'],
      ];
      const call = await playCrew(loud);
      expect(await go(call.relay, 'run-sheet', 'getaway', 'call', 'you')).not.toBeTypeOf('string');
      expect(runAt(call.db, 'run-sheet')).toMatchObject({ beat: 'burned', done: false, flags: expect.objectContaining({ rue_one: 'yes' }) });
      expect(runAt(call.db, 'run-sheet').crew!.clocks).toEqual({ hears: 3 });
      expect(questRows(call.db).at(-1)!.text).toContain('You make the call with her on your ear.');
      await go(call.relay, 'run-sheet', 'burned', 'own');
      expect(runAt(call.db, 'run-sheet')).toMatchObject({ done: true, take: 'none', flags: expect.objectContaining({ cover: 'cracked', stamp: 'lost' }) });

      const run = await playCrew(loud);
      expect(await go(run.relay, 'run-sheet', 'getaway', 'run', 'you')).not.toBeTypeOf('string');
      expect(runAt(run.db, 'run-sheet')).toMatchObject({ done: true, take: 'none', flags: expect.objectContaining({ rue_one: 'yes' }) });
      expect(runAt(run.db, 'run-sheet').flags.cover).toBeUndefined();
      expect(runAt(run.db, 'run-sheet').crew!.clocks).toEqual({});
      // Both ends take nothing, and pay nothing.
      expect(kitSum(runAt(run.db, 'run-sheet'), (e) => e.sol)).toBe(0);
      expect(kitSum(runAt(call.db, 'run-sheet'), (e) => e.sol)).toBe(0);
    });

    it('the HEAT that lands at the getaway is what each card prints: MAKE THE CALL none, OVER THE RIGS 2 (last pass A1)', async () => {
      const loud: [string, string, string][] = [
        ['yard', 'badge', 'you:scheduler'],
        ['hut', 'press', 'you'],
        ['gate', 'yard', 'you'],
      ];
      const call = await playCrew(loud);
      await go(call.relay, 'run-sheet', 'getaway', 'call', 'you');
      await go(call.relay, 'run-sheet', 'burned', 'own');
      const rigs = await playCrew(loud);
      await go(rigs.relay, 'run-sheet', 'getaway', 'run', 'you');
      for (const [r, heat] of [
        [call, 0],
        [rigs, 2],
      ] as const) {
        const run = runAt(r.db, 'run-sheet');
        expect(run).toMatchObject({ done: true, take: 'none' });
        expect(kitSum(run, (e) => e.heat)).toBe(heat);
        const d = debriefOf(r.db);
        expect(d.tier).toBe('blown');
        expect(d.heat.delta).toBe(heat);
        expect(d.heat.parts).toEqual(heat ? [{ label: 'ON THE NIGHT', n: heat }] : []);
      }
    });

    it("the beat and outcome prose never writes her: no {{ }}, never 'Rue', no 'she says' or the like; quotes of others are fine (last pass D)", () => {
      const raw = parseQuestFile('run-sheet', read('run-sheet'), known);
      if (!raw.ok) throw new Error('run-sheet does not parse');
      // Beat and outcome prose only: way and card lines may say "her", and views are addressed to her.
      const texts = [...[...raw.entry.beats.values()].flat().map((b) => [b.id, b.text] as const), ...[...raw.entry.outcomes.values()].map((o) => [o.id, o.text] as const)];
      for (const [id, text] of texts) {
        expect(text, id).not.toMatch(/\{\{/);
        expect(text, id).not.toMatch(/\bRue\b/);
        expect(text, id).not.toMatch(/\bshe (says|said|asks|asked|tells|told|nods|lets|drops|heard|hears|breathes|thinks|believes|wants|takes|puts|is|has|was)\b|\bshe's\b/i);
      }
      for (const b of [...raw.entry.beats.values()].flat()) expect(b.onLine, b.id).toBeUndefined();
    });

    it("the hut's view when she took the lacquer off herself: on her reply to that pick, not to the others (last pass D)", async () => {
      const ASKED = 'He asked you to take the lacquer off, and you did it yourself in about a minute.';
      const her = await playCrew([
        ['yard', 'round', 'you'],
        ['hut', 'terminal', 'contact'],
      ]);
      expect(runAt(her.db, 'run-sheet').flags.asked).toBe('yes');
      expect(her.backend.reqs.at(-1)!.messages.at(-1)!.content).toContain(ASKED);
      for (const [card, by] of [
        ['terminal', 'you:scheduler'],
        ['press', 'you'],
      ] as const) {
        const other = await playCrew([
          ['yard', 'round', 'you'],
          ['hut', card, by],
        ]);
        const sent = other.backend.reqs.at(-1)!.messages.at(-1)!.content;
        expect(sent, card).toContain('You can see the lacquer from your side.');
        expect(sent, card).not.toContain(ASKED);
      }
    });

    it('still gives the loader as a free hire on told and freight; pulled is gone', () => {
      for (const id of ['told', 'freight']) expect(RUN_SHEET.outcomes.get(id)!.effects.recruit, id).toMatchObject({ spec: 'muscle', grade: 0, sex: 'man' });
      expect(RUN_SHEET.outcomes.has('pulled')).toBe(false);
    });
  });

  describe('Night Clerk', () => {
    // This relay's player has no rep, so the board posts tier 1 only: the job is posted at tier 1 with tier 2's TAKE of 4.
    const NIGHT_CLERK = entry('night-clerk', onRelay(read('night-clerk')).replace(/^tier: 2$/m, 'tier: 1\ntake-size: 4'));
    const MIA = member('mia', 'face');
    const DEZ = member('dez', 'runner');
    const EARS = member('kit', 'ears');
    const crew = (members: CrewMember[]) => relayWith({ book: [NIGHT_CLERK], members });
    const nc = (relay: ChatRelay, beat: string, card: string, by: string) => go(relay, 'night-clerk', beat, card, by);
    // The job's end offers PRESS ON first; WALK takes the debrief.
    const walk = async (relay: ChatRelay, db: Db) => {
      expect(runAt(db, 'night-clerk')).toMatchObject({ beat: '!push', done: false });
      expect(await relay.chooseQuest('hicks', { id: 'night-clerk', beat: '!push', choice: '!walk' })).not.toBeTypeOf('string');
    };
    // The back way to the head of the stair at ALARM 2 with TAKE full: the stair, the paint, the sweep, the drive.
    const backAtTwo = async (relay: ChatRelay, o: { door?: boolean } = {}) => {
      await nc(relay, 'lobby', 'stairs', 'you');
      if (o.door) expect(await relay.crewMove('hicks', { id: 'night-clerk', beat: 'stairwell', card: 'ade' })).not.toBeTypeOf('string');
      await nc(relay, 'stairwell', 'force', 'you');
      await nc(relay, 'floor-back', 'slip', 'you');
      await nc(relay, 'closet', 'pull', 'you');
    };

    it('the front with a face and a runner reaches the debrief', async () => {
      const { relay, db } = crew([MIA, DEZ]);
      expect(await begin(relay, 'night-clerk', ['mia', 'dez'])).not.toBeTypeOf('string');
      // No `with:`: no contact on the view, so the board shows no comms strip (in whoever's room it's played).
      expect(relay.questState('hicks').active!.crew!.contact).toBeUndefined();
      await nc(relay, 'lobby', 'charm', 'mia');
      expect(runAt(db, 'night-clerk')).toMatchObject({ beat: 'desk', flags: expect.objectContaining({ route: 'front' }) });
      await nc(relay, 'desk', 'read', 'dez');
      await nc(relay, 'floor-front', 'stroll', 'you');
      // His log-in's way stands; TAKE is full already (1 + 2 + 1), so it prints no TAKE (last pass A2).
      expect(runAt(db, 'night-clerk').takeFill).toBe(4);
      expect(relay.questState('hicks').active!.crew!.cards[0].ways.find((w) => w.by === 'you')).toMatchObject({ line: 'Type his nine characters and wipe it.', take: 0, alarm: 0 });
      await nc(relay, 'closet', 'crack', 'you');
      expect(runAt(db, 'night-clerk')).toMatchObject({ beat: 'out', takeFill: 4, alarm: 1 });
      await nc(relay, 'out', 'walk', 'you');
      await walk(relay, db);
      expect(runAt(db, 'night-clerk')).toMatchObject({ done: true, takeFill: 4 });
      expect(runAt(db, 'night-clerk').crew!.goes).toEqual({ mia: 'spent', dez: 'spent' });
      expect(questRows(db).some((m) => m.quest?.debrief)).toBe(true);
    });

    it("the back with a muscle who holds the door: ALARM 2 on the way out costs nothing, and the ears go out unheld", async () => {
      const { relay, db } = crew([ADE, EARS]);
      await begin(relay, 'night-clerk', ['ade', 'kit']);
      await backAtTwo(relay, { door: true });
      expect(runAt(db, 'night-clerk')).toMatchObject({ beat: 'out', takeFill: 4, alarm: 2, flags: expect.objectContaining({ route: 'back', door: 'held' }) });
      const drop = relay.questState('hicks').active!.crew!.cards[0];
      expect(drop.ways.map((w) => [w.by, w.take, w.alarm, w.lose, w.harm])).toEqual([
        ['you', 0, 0, 0, undefined],
        ['kit', 0, 0, 0, undefined],
      ]);
      await nc(relay, 'out', 'drop', 'kit');
      await walk(relay, db);
      const run = runAt(db, 'night-clerk');
      expect(run).toMatchObject({ done: true, takeFill: 4, alarm: 2 });
      expect(run.crew!.goes).toEqual({ ade: 'door', kit: 'spent' });
      expect(questRows(db).some((m) => m.quest?.debrief)).toBe(true);
    });

    it('at ALARM 2 on the way out with no door held: a recruit sent is held, and going yourself loses 2', async () => {
      const held = crew([EARS]);
      await begin(held.relay, 'night-clerk', ['kit']);
      await backAtTwo(held.relay);
      expect(runAt(held.db, 'night-clerk')).toMatchObject({ beat: 'out', takeFill: 4, alarm: 2 });
      await nc(held.relay, 'out', 'drop', 'kit');
      await walk(held.relay, held.db);
      expect(runAt(held.db, 'night-clerk')).toMatchObject({ done: true, takeFill: 4 });
      expect(runAt(held.db, 'night-clerk').crew!.goes).toEqual({ kit: 'held' });
      expect(debriefOf(held.db).tier).toBe('messy');

      const you = crew([]);
      await begin(you.relay, 'night-clerk', []);
      await backAtTwo(you.relay);
      await nc(you.relay, 'out', 'drop', 'you');
      // Going yourself past the blazers is lose 2 and nothing more: ALARM stays 2.
      expect(runAt(you.db, 'night-clerk')).toMatchObject({ takeFill: 2, alarm: 2 });
      await walk(you.relay, you.db);
      expect(runAt(you.db, 'night-clerk')).toMatchObject({ done: true, takeFill: 2, alarm: 2 });
    });

    it('into the way out at ALARM 3, going yourself walks out losing what the way says: no getaway', async () => {
      // THE LATCH loses 2; THE DOOR loses 1 and costs HEAT 1 (final review C3: the two differ in kind).
      for (const [card, heat, fill] of [
        ['drop', 0, 2],
        ['door', 1, 3],
      ] as const) {
        const { relay, db } = crew([]);
        await begin(relay, 'night-clerk', []);
        await nc(relay, 'lobby', 'stairs', 'you');
        await nc(relay, 'stairwell', 'force', 'you');
        await nc(relay, 'floor-back', 'slip', 'you');
        await nc(relay, 'closet', 'crack', 'you');
        expect(runAt(db, 'night-clerk')).toMatchObject({ beat: 'out', takeFill: 4, alarm: 3 });
        await nc(relay, 'out', card, 'you');
        const run = runAt(db, 'night-clerk');
        expect(run, card).toMatchObject({ done: true, takeFill: fill, alarm: 3 });
        expect(run.getaway, card).toBeUndefined();
        expect(run.picks.some((p) => p.beat === 'getaway'), card).toBe(false);
        expect(run.crew!.heat, card).toBe(1 + heat);
      }
    });

    it("at ALARM 2+ HIS SCREEN and THE DOOR play their own outcome, less than you came for; PAST THE GLASS and THE LATCH keep half (last pass B2)", async () => {
      const text = (db: Db) => questRows(db).filter((m) => m.role === 'user').map((m) => m.text).join('\n');
      // The front at ALARM 2, TAKE 4: the glass, his log-in, the lens stopping on you, the drive.
      const front = async (card: string) => {
        const r = crew([]);
        await begin(r.relay, 'night-clerk', []);
        for (const [beat, c] of [['lobby', 'charm'], ['desk', 'read'], ['floor-front', 'stroll'], ['closet', 'pull']]) expect(await nc(r.relay, beat, c, 'you')).not.toBeTypeOf('string');
        expect(runAt(r.db, 'night-clerk')).toMatchObject({ beat: 'out', takeFill: 4, alarm: 2 });
        expect(await nc(r.relay, 'out', card, 'you')).not.toBeTypeOf('string');
        return r;
      };
      const back = async (card: string) => {
        const r = crew([]);
        await begin(r.relay, 'night-clerk', []);
        await backAtTwo(r.relay);
        expect(await nc(r.relay, 'out', card, 'you')).not.toBeTypeOf('string');
        return r;
      };
      for (const [r, card, less] of [
        [await front('loop'), 'loop', true],
        [await front('walk'), 'walk', false],
        [await back('door'), 'door', true],
        [await back('drop'), 'drop', false],
      ] as const) {
        const all = text(r.db);
        expect(all.includes("You're out in the rain with less than you came for."), card).toBe(less);
        expect(all.includes("You're out in the rain with half of what you came for."), card).toBe(!less);
        expect(runAt(r.db, 'night-clerk').picks.at(-1)!.beat, card).toBe('out');
      }
      expect(NIGHT_CLERK.outcomes.get('searched')).toMatchObject({ to: 'end', effects: expect.objectContaining({ payKind: 'full' }) });
    });

    it("the front's two setups differ in kind: THE PASS yourself costs HEAT, his log-in ALARM, and each chain reaches a night the other can't (last pass B4)", async () => {
      const desk = NIGHT_CLERK.beats.get('desk')![0].choices;
      const mine = (id: string) => desk.find((c) => c.id === id)!.ways!.find((w) => w.key.kind === 'you')!;
      expect([mine('read').alarm, mine('read').heat]).toEqual([1, 0]);
      expect([mine('palm').alarm, mine('palm').heat]).toEqual([0, 1]);
      // Solo through the front to the way out, every floor and closet card: TAKE 4 always (the log-in's extra TAKE is
      // past the cap), so the chains differ in ALARM and HEAT. [ALARM, HEAT] at the way out:
      const night = async (setup: string, floor: string, closet: string) => {
        const r = crew([]);
        await begin(r.relay, 'night-clerk', []);
        for (const [beat, c] of [['lobby', 'charm'], ['desk', setup], ['floor-front', floor], ['closet', closet]]) expect(await nc(r.relay, beat, c, 'you')).not.toBeTypeOf('string');
        const run = runAt(r.db, 'night-clerk');
        expect(run.takeFill).toBe(4);
        return [run.alarm ?? 0, run.crew!.heat];
      };
      const chains: Record<string, number[][]> = { read: [], palm: [] };
      for (const setup of ['read', 'palm']) for (const floor of ['stroll', 'cart']) for (const closet of ['crack', 'pull']) chains[setup].push(await night(setup, floor, closet));
      expect(chains.read).toEqual([[2, 1], [2, 3], [1, 2], [1, 4]]);
      expect(chains.palm).toEqual([[1, 2], [0, 4], [1, 3], [0, 5]]);
      // Only the pass reaches the way out at ALARM 0; only the log-in at HEAT 1.
      expect(chains.palm.some(([a]) => a === 0)).toBe(true);
      expect(chains.read.some(([a]) => a === 0)).toBe(false);
      expect(chains.read.some(([, h]) => h === 1)).toBe(true);
      expect(chains.palm.some(([, h]) => h <= 1)).toBe(false);
    });

    describe("the getaway: what you can hold, or empty hands", () => {
      // ALARM 4 on the closet's login: stair, paint, camera line and the login, all your own ways (TAKE 4, ALARM 4).
      const toGetaway = async () => {
        const r = crew([]);
        await begin(r.relay, 'night-clerk', []);
        await nc(r.relay, 'lobby', 'stairs', 'you');
        await nc(r.relay, 'stairwell', 'force', 'you');
        await nc(r.relay, 'floor-back', 'blind', 'you');
        await nc(r.relay, 'closet', 'crack', 'you');
        expect(runAt(r.db, 'night-clerk')).toMatchObject({ beat: 'getaway', getaway: true, takeFill: 4, alarm: 4 });
        expect(r.relay.questState('hicks').active!.crew!.cards[0].ways[0]).toMatchObject({ take: 0, lose: 2, heat: 1 });
        expect(r.relay.questState('hicks').active!.crew!.cards[0].ways[0].leaves).toBeUndefined();
        // EMPTY HANDS: its outcome is take: none, printed as such (final review C2).
        expect(r.relay.questState('hicks').active!.crew!.cards[1].ways[0]).toMatchObject({ take: 0, lose: 0, heat: 0, leaves: 'none' });
        return r;
      };

      it('keep: TAKE 2 lower, the pay scaled by it, HEAT +1 from the way', async () => {
        const { relay, db } = await toGetaway();
        const pay = runAt(db, 'night-clerk').pay!;
        expect(await nc(relay, 'getaway', 'keep', 'you')).not.toBeTypeOf('string');
        const run = runAt(db, 'night-clerk');
        expect(run).toMatchObject({ done: true, takeFill: 2, take: 'part' });
        expect(kitSum(run, (e) => e.sol)).toBe(Math.round((pay * 2) / 4 / 10) * 10);
        expect(debriefOf(db).heat.parts).toEqual([{ label: 'ON THE NIGHT', n: 1 }]);
      });

      it('the HEAT that lands is what each card prints: WHAT YOU CAN HOLD 1, EMPTY HANDS none (last pass A1)', async () => {
        for (const [card, heat] of [
          ['keep', 1],
          ['drop', 0],
        ] as const) {
          const { relay, db } = await toGetaway();
          expect(await nc(relay, 'getaway', card, 'you')).not.toBeTypeOf('string');
          const run = runAt(db, 'night-clerk');
          expect(run.done, card).toBe(true);
          expect(kitSum(run, (e) => e.heat), card).toBe(heat);
          expect(debriefOf(db).heat.delta, card).toBe(heat);
          expect((debriefOf(db).heat.parts ?? []).map((p) => p.label), card).not.toContain('ALARM');
        }
      });

      it('keep never takes TAKE below 0', async () => {
        const q = entry('night-clerk', onRelay(read('night-clerk')).replace(/^tier: 2$/m, 'tier: 1\ntake-size: 4').replace('→ torn [lose 2, heat 1]', '→ torn [lose 9, heat 1]'));
        const { relay, db } = relayWith({ book: [q], members: [] });
        await begin(relay, 'night-clerk', []);
        for (const [beat, card] of [['lobby', 'stairs'], ['stairwell', 'force'], ['floor-back', 'blind'], ['closet', 'crack'], ['getaway', 'keep']]) await nc(relay, beat, card, 'you');
        expect(runAt(db, 'night-clerk')).toMatchObject({ done: true, takeFill: 0, take: 'none' });
        expect(debriefOf(db).tier).toBe('blown');
      });

      it('empty hands: take none, no HEAT from the way', async () => {
        const { relay, db } = await toGetaway();
        expect(await nc(relay, 'getaway', 'drop', 'you')).not.toBeTypeOf('string');
        const run = runAt(db, 'night-clerk');
        expect(run).toMatchObject({ done: true, take: 'none' });
        expect(kitSum(run, (e) => e.sol)).toBe(0);
        // Blown, and no HEAT: EMPTY HANDS prints none, and no floor lands (last pass A1).
        expect(debriefOf(db).heat.parts).toEqual([]);
        expect(debriefOf(db).heat.delta).toBe(0);
        expect(kitSum(run, (e) => e.heat)).toBe(0);
      });
    });

    describe("a missed throw at the way out keeps the outcome's pay (final review C1)", () => {
      const POOL = ['ivy', 'lux', 'oona', 'pia', 'remy', 'sol', 'tess', 'uma', 'vee', 'wren', 'xan', 'yul', 'abe', 'bea', 'cal', 'dot'];
      const missAt = (card: string) => POOL.find((id) => !throwOf(`night-clerk@0|out|${card}|${id}`).through)!;
      // To the way out at TAKE 4, ALARM 1, nobody spent: the front by his log-in and the cart, or the back by the laundry and the sweep.
      const front = async (relay: ChatRelay) => {
        for (const [beat, card] of [['lobby', 'charm'], ['desk', 'read'], ['floor-front', 'cart'], ['closet', 'pull']]) expect(await nc(relay, beat, card, 'you')).not.toBeTypeOf('string');
      };
      const back = async (relay: ChatRelay) => {
        for (const [beat, card] of [['lobby', 'stairs'], ['stairwell', 'wait'], ['floor-back', 'slip'], ['closet', 'pull']]) expect(await nc(relay, beat, card, 'you')).not.toBeTypeOf('string');
      };
      for (const [route, card, spec] of [
        ['front', 'walk', 'ears'],
        ['front', 'loop', 'muscle'],
        ['back', 'drop', 'face'],
        ['back', 'door', 'runner'],
      ] as const) {
        it(`${route}: a ${spec} thrown at ${card.toUpperCase()} misses, is hurt, and the job still pays by TAKE`, async () => {
          const id = missAt(card);
          expect(id, card).toBeDefined();
          const { relay, db } = crew([member(id, spec)]);
          await begin(relay, 'night-clerk', [id]);
          await (route === 'front' ? front(relay) : back(relay));
          expect(runAt(db, 'night-clerk')).toMatchObject({ beat: 'out', takeFill: 4, alarm: 1 });
          expect(relay.questState('hicks').active!.crew!.cards.find((c) => c.id === card)!.throws).toEqual([id]);
          const pay = runAt(db, 'night-clerk').pay!;
          expect(await nc(relay, 'out', card, id)).not.toBeTypeOf('string');
          // ALARM 3 after the miss: no PRESS ON, the job ends here.
          const run = runAt(db, 'night-clerk');
          expect(run).toMatchObject({ done: true, takeFill: 4, alarm: 3, take: 'full' });
          expect(run.crew!.goes).toEqual({ [id]: 'hurt' });
          expect(kitSum(run, (e) => e.sol)).toBe(Math.round((pay * 4) / 4 / 10) * 10);
          expect(debriefOf(db).tier).toBe('messy');
        });
      }

      it('a miss at ALARM 2 fills ALARM: the getaway, and the pay lands once, as the getaway leaves it', async () => {
        const id = missAt('drop');
        const { relay, db } = crew([member(id, 'face')]);
        await begin(relay, 'night-clerk', [id]);
        for (const [beat, card] of [['lobby', 'stairs'], ['stairwell', 'force'], ['floor-back', 'slip'], ['closet', 'pull']]) await nc(relay, beat, card, 'you');
        expect(runAt(db, 'night-clerk')).toMatchObject({ beat: 'out', takeFill: 4, alarm: 2 });
        const pay = runAt(db, 'night-clerk').pay!;
        expect(await nc(relay, 'out', 'drop', id)).not.toBeTypeOf('string');
        expect(runAt(db, 'night-clerk')).toMatchObject({ beat: 'getaway', getaway: true, alarm: 4 });
        expect(await nc(relay, 'getaway', 'keep', 'you')).not.toBeTypeOf('string');
        const run = runAt(db, 'night-clerk');
        expect(run).toMatchObject({ done: true, takeFill: 2, take: 'part' });
        expect(kitSum(run, (e) => e.sol)).toBe(Math.round((pay * 2) / 4 / 10) * 10);
      });

      it('on the getaway nobody throws: no throws offered, a recruit sent there refused, COVER STORY with nothing to cover', async () => {
        const { relay, db } = crew([member('kit', 'ears'), member('mia', 'face')]);
        await begin(relay, 'night-clerk', ['kit', 'mia']);
        for (const [beat, card] of [['lobby', 'stairs'], ['stairwell', 'force'], ['floor-back', 'blind'], ['closet', 'crack']]) await nc(relay, beat, card, 'you');
        expect(runAt(db, 'night-clerk')).toMatchObject({ beat: 'getaway', alarm: 4 });
        const view = relay.questState('hicks').active!.crew!;
        expect(view.cards.map((c) => c.throws)).toEqual([[], []]);
        expect(view.hand.find((h) => h.id === 'mia')!.move!.can).toBe(false);
        expect(await nc(relay, 'getaway', 'keep', 'kit')).toBeTypeOf('string');
        expect(runAt(db, 'night-clerk')).toMatchObject({ beat: 'getaway', done: false });
        expect(runAt(db, 'night-clerk').crew!.goes).toEqual({});
      });
    });

    it("a missed throw at the lobby's glass still sets route=front: on to the desk, and out the front", async () => {
      const ids = ['ivy', 'lux', 'oona', 'pia', 'remy', 'sol', 'tess', 'uma', 'vee', 'wren', 'xan', 'yul'];
      const out = ids.find((id) => !throwOf(`night-clerk@0|lobby|charm|${id}`).through)!;
      expect(out).toBeDefined();
      const { relay, db } = crew([member(out, 'ears')]);
      await begin(relay, 'night-clerk', [out]);
      await nc(relay, 'lobby', 'charm', out);
      expect(runAt(db, 'night-clerk')).toMatchObject({ beat: 'desk', alarm: 2, flags: expect.objectContaining({ route: 'front' }) });
      expect(runAt(db, 'night-clerk').crew!.goes).toEqual({ [out]: 'hurt' });
      await nc(relay, 'desk', 'palm', 'you');
      await nc(relay, 'floor-front', 'stroll', 'you');
      await nc(relay, 'closet', 'pull', 'you');
      expect(runAt(db, 'night-clerk').beat).toBe('out');
      expect(relay.questState('hicks').active!.crew!.cards.map((c) => c.id)).toEqual(['walk', 'loop']);
    });

    describe('a throw: a muscle sent for his log-in', () => {
      const ids = ['ade', 'bo', 'cy', 'dov', 'eli', 'fen', 'gus', 'hal', 'ivo', 'jax', 'kai', 'lev'];
      const throwsFor = (id: string) => throwOf(`night-clerk@0|desk|read|${id}`);
      const through = ids.find((id) => throwsFor(id).through)!;
      const out = ids.find((id) => !throwsFor(id).through)!;
      const name = (id: string) => `${id[0].toUpperCase()}${id.slice(1)}`;
      const sent = async (id: string) => {
        const r = crew([member(id, 'muscle')]);
        await begin(r.relay, 'night-clerk', [id]);
        await nc(r.relay, 'lobby', 'charm', 'you');
        expect(r.relay.questState('hicks').active!.crew!.cards[0].throws).toEqual([id]);
        expect(await nc(r.relay, 'desk', 'read', id)).not.toBeTypeOf('string');
        return r;
      };

      it('through: your way lands in full, log-in and all, under the throw line', async () => {
        const { db } = await sent(through);
        const run = runAt(db, 'night-clerk');
        expect(run).toMatchObject({ beat: 'floor-front', takeFill: 2, alarm: 1, flags: expect.objectContaining({ login: 'yes' }) });
        expect(run.crew!.goes).toEqual({ [through]: 'spent' });
        expect(questRows(db).at(-1)!.text.startsWith(throwLine(name(through), true))).toBe(true);
      });

      it('out of their depth: no take, no log-in, ALARM +2, hurt, on to the floor', async () => {
        const { db } = await sent(out);
        const run = runAt(db, 'night-clerk');
        expect(run).toMatchObject({ beat: 'floor-front', takeFill: 1, alarm: 2 });
        expect(run.flags.login).toBeUndefined();
        expect(run.crew!.goes).toEqual({ [out]: 'hurt' });
        expect(questRows(db).at(-1)!.text.startsWith(throwLine(name(out), false))).toBe(true);
      });
    });

    it('PRESS ON offers the register beat only', async () => {
      const { relay, db } = crew([MIA]);
      await begin(relay, 'night-clerk', ['mia']);
      await nc(relay, 'lobby', 'charm', 'mia');
      await nc(relay, 'desk', 'palm', 'you');
      await nc(relay, 'floor-front', 'stroll', 'you');
      await nc(relay, 'closet', 'pull', 'you');
      await nc(relay, 'out', 'walk', 'you');
      expect(runAt(db, 'night-clerk')).toMatchObject({ beat: '!push', done: false });
      expect(await relay.chooseQuest('hicks', { id: 'night-clerk', beat: '!push', choice: '!press' })).not.toBeTypeOf('string');
      expect(runAt(db, 'night-clerk')).toMatchObject({ beat: 'push-1' });
      expect(relay.questState('hicks').active!.crew!.cards.map((c) => c.id)).toEqual(['lean', 'pread']);
      expect(NIGHT_CLERK.beats.has('push-2')).toBe(false);
      expect(NIGHT_CLERK.draws).toEqual([]);
    });

    describe('Review Focus 5, the push case: a getaway reached from the register is a lost push (final review I1)', () => {
      // The back way at TAKE 4, ALARM 1; out by the latch (ALARM 2), paid in full; then PRESS ON.
      const toPress = async (members: CrewMember[]) => {
        const r = crew(members);
        await begin(r.relay, 'night-clerk', members.map((m) => m.recruit.id));
        for (const [beat, card] of [['lobby', 'stairs'], ['stairwell', 'wait'], ['floor-back', 'slip'], ['closet', 'pull'], ['out', 'drop']]) expect(await nc(r.relay, beat, card, 'you')).not.toBeTypeOf('string');
        expect(runAt(r.db, 'night-clerk')).toMatchObject({ beat: '!push', takeFill: 4, alarm: 2, take: 'full' });
        return r;
      };
      const pressLine = (relay: ChatRelay) => relay.questState('hicks').active!.crew!.cards.find((c) => c.id === '!press')!.line;
      const toGetaway = async () => {
        const r = await toPress([ADE]);
        const pay = kitSum(runAt(r.db, 'night-clerk'), (e) => e.sol);
        expect(await r.relay.chooseQuest('hicks', { id: 'night-clerk', beat: '!push', choice: '!press' })).not.toBeTypeOf('string');
        expect(await nc(r.relay, 'push-1', 'lean', 'ade')).not.toBeTypeOf('string');
        expect(runAt(r.db, 'night-clerk')).toMatchObject({ beat: 'getaway', getaway: true, alarm: 4, done: false });
        return { ...r, pay };
      };

      it("the PRESS ON line says ALARM can take all of it only when the beat's ways could fill it", async () => {
        const none = await toPress([]);
        expect(pressLine(none.relay)).toBe('One more beat. Lose it, and the pot goes with half the pay.');
        const ade = await toPress([ADE]);
        expect(pressLine(ade.relay)).toBe('One more beat. Lose it, and the pot goes with half the pay; fill ALARM, and it can cost all of it.');
      });

      it('the getaway there prints what lands: no TAKE −2, and the lost push drops the take to part', async () => {
        const { relay } = await toGetaway();
        const cards = relay.questState('hicks').active!.crew!.cards;
        expect(cards.map((c) => c.throws)).toEqual([[], []]);
        expect(cards.map((c) => c.ways.map((w) => [w.by, w.lose, w.heat, w.leaves]))).toEqual([[['you', 0, 1, 'part']], [['you', 0, 0, 'none']]]);
      });

      it('WHAT YOU CAN HOLD: a lost push, the pot and half the pay gone, the take part; the debrief says PRESS ON lost', async () => {
        const { relay, db, pay } = await toGetaway();
        expect(await nc(relay, 'getaway', 'keep', 'you')).not.toBeTypeOf('string');
        const run = runAt(db, 'night-clerk');
        expect(run).toMatchObject({ done: true, take: 'part' });
        expect(run.push).toMatchObject({ state: 'lost', pot: 0 });
        expect(kitSum(run, (e) => e.sol)).toBe(pay - Math.floor(pay / 2));
        const d = debriefOf(db);
        expect(d.push).toBe('lost');
        expect(d.pushes).toEqual([expect.objectContaining({ result: 'lost', sol: 0 })]);
        expect(d.heat.parts).toEqual([{ label: 'ON THE NIGHT', n: 5 }]);
      });

      it('from a part take both ways there leave nothing (left for the developer: EMPTY HANDS is then the cheaper)', async () => {
        const { relay, db } = crew([ADE]);
        await begin(relay, 'night-clerk', ['ade']);
        for (const [beat, card] of [['lobby', 'stairs'], ['stairwell', 'wait'], ['floor-back', 'slip'], ['closet', 'crack'], ['out', 'drop']]) await nc(relay, beat, card, 'you');
        expect(runAt(db, 'night-clerk')).toMatchObject({ beat: '!push', takeFill: 2, alarm: 2, take: 'part' });
        expect(relay.questState('hicks').active!.crew!.cards.find((c) => c.id === '!press')!.line).toBe('One more beat. Lose it, and the job is blown: no pay at all.');
        await relay.chooseQuest('hicks', { id: 'night-clerk', beat: '!push', choice: '!press' });
        await nc(relay, 'push-1', 'lean', 'ade');
        expect(runAt(db, 'night-clerk')).toMatchObject({ beat: 'getaway', alarm: 4 });
        expect(relay.questState('hicks').active!.crew!.cards.map((c) => c.ways.map((w) => [w.lose, w.heat, w.leaves]))).toEqual([[[0, 1, 'none']], [[0, 0, 'none']]]);
        await nc(relay, 'getaway', 'keep', 'you');
        expect(runAt(db, 'night-clerk')).toMatchObject({ done: true, take: 'none' });
        expect(kitSum(runAt(db, 'night-clerk'), (e) => e.sol)).toBe(0);
      });

      it('EMPTY HANDS: blown, no pay at all', async () => {
        const { relay, db } = await toGetaway();
        expect(await nc(relay, 'getaway', 'drop', 'you')).not.toBeTypeOf('string');
        const run = runAt(db, 'night-clerk');
        expect(run).toMatchObject({ done: true, take: 'none' });
        expect(run.push).toMatchObject({ state: 'lost', pot: 0 });
        expect(kitSum(run, (e) => e.sol)).toBe(0);
        expect(debriefOf(db).tier).toBe('blown');
      });
    });

    it("a missed throw on the register is ALARM +2 and hurt, and banks no +160: the push pays nothing", async () => {
      const POOL = ['ivy', 'lux', 'oona', 'pia', 'remy', 'sol', 'tess', 'uma', 'vee', 'wren', 'xan', 'yul', 'abe', 'bea', 'cal', 'dot'];
      const id = POOL.find((x) => !throwOf(`night-clerk@0|push-1|lean|${x}`).through)!;
      expect(id).toBeDefined();
      const { relay, db } = crew([member(id, 'runner')]);
      await begin(relay, 'night-clerk', [id]);
      for (const [beat, card] of [['lobby', 'charm'], ['desk', 'read'], ['floor-front', 'cart'], ['closet', 'pull'], ['out', 'loop']]) expect(await nc(relay, beat, card, 'you')).not.toBeTypeOf('string');
      expect(runAt(db, 'night-clerk')).toMatchObject({ beat: '!push', takeFill: 4, alarm: 1 });
      const pay = kitSum(runAt(db, 'night-clerk'), (e) => e.sol);
      expect(await relay.chooseQuest('hicks', { id: 'night-clerk', beat: '!push', choice: '!press' })).not.toBeTypeOf('string');
      expect(relay.questState('hicks').active!.crew!.cards.find((c) => c.id === 'lean')!.throws).toEqual([id]);
      expect(await nc(relay, 'push-1', 'lean', id)).not.toBeTypeOf('string');
      const run = runAt(db, 'night-clerk');
      expect(run).toMatchObject({ done: true, alarm: 3 });
      expect(run.crew!.goes).toEqual({ [id]: 'hurt' });
      // Nothing earned: the push's pot stays 0, and the job keeps only its own pay.
      expect(run.push).toMatchObject({ pot: 0 });
      expect(kitSum(run, (e) => e.sol)).toBe(pay);
      const d = debriefOf(db);
      // A miss, not a win for nothing (last pass B1): the push log keeps it, through a reload, and the debrief says so.
      expect(run.push!.log).toEqual([expect.objectContaining({ result: 'won', sol: 0, missed: true })]);
      expect(d.pushes).toEqual([expect.objectContaining({ sol: 0, missed: true })]);
      expect(d.push).toBe('won');
    });

    it('every way on the register costs something', () => {
      const ways = NIGHT_CLERK.beats.get('push-1')![0].choices.flatMap((c) => c.ways ?? []);
      expect(ways.map((w) => [w.key.kind === 'spec' ? w.key.spec : w.key.kind, w.alarm, w.heat])).toEqual([
        ['you', 1, 1],
        ['face', 1, 0],
        ['muscle', 2, 0],
        ['you', 0, 2],
        ['ears', 0, 1],
      ]);
    });

    it('pressing on at ALARM 1 with a face ends the night at ALARM 2: messy, the name in the row', async () => {
      const { relay, db } = crew([MIA]);
      await begin(relay, 'night-clerk', ['mia']);
      await nc(relay, 'lobby', 'charm', 'you');
      await nc(relay, 'desk', 'read', 'you');
      await nc(relay, 'floor-front', 'cart', 'you');
      await nc(relay, 'closet', 'pull', 'you');
      await nc(relay, 'out', 'loop', 'you');
      expect(runAt(db, 'night-clerk')).toMatchObject({ beat: '!push', takeFill: 4, alarm: 1 });
      await relay.chooseQuest('hicks', { id: 'night-clerk', beat: '!push', choice: '!press' });
      expect(await nc(relay, 'push-1', 'lean', 'mia')).not.toBeTypeOf('string');
      expect(runAt(db, 'night-clerk')).toMatchObject({ done: true, alarm: 2 });
      expect(debriefOf(db).tier).toBe('messy');
      expect(questRows(db).some((m) => m.text.includes('He watches Mia all the way to the street door.'))).toBe(true);
    });
  });
});

describe('recommended (Kroll\'s desk spec, "The standing order and recommended")', () => {
  // A fixture book: only the fields recommendedJob reads.
  const job = (o: Partial<QuestEntry> & { id: string }): QuestEntry => ({ title: o.id.toUpperCase(), pitch: `pitch of ${o.id}`, kind: 'mission', tier: 1, with: ['kroll'], after: null, for: 'soren', once: true, ...o }) as QuestEntry;
  const order = job({ id: 'standing-order' });
  const ctx: CondCtx = { flags: {}, trust: 'mid', warmth: 'mid', with: 'kroll' };
  const base = { player: 'soren', contact: 'kroll', ctx, started: [] as { id: string }[], withNow: null as string | null, heard: () => false, tier: () => 1 };

  it('an open standing order: hers alone, for you, once, gate held, not started', () => {
    expect(recommendedJob([order], base)?.id).toBe('standing-order');
  });
  it('started, on any run id (done or not): no longer', () => {
    expect(recommendedJob([order], { ...base, started: [{ id: 'standing-order' }] })).toBeNull();
    expect(recommendedJob([order], { ...base, started: [{ id: 'standing-order@2' }] })).toBeNull();
  });
  it('not while you are with her', () => {
    expect(recommendedJob([order], { ...base, withNow: 'kroll' })).toBeNull();
    expect(recommendedJob([order], { ...base, withNow: 'rue' })?.id).toBe('standing-order');
  });
  it('a repeating job, another player\'s, a shared one or a gate not held never counts', () => {
    const after = parseCondition('kroll_one = yes') as Condition[];
    expect(recommendedJob([job({ id: 'round', once: undefined })], base)).toBeNull();
    expect(recommendedJob([job({ id: 'hers', for: 'hicks' })], base)).toBeNull();
    expect(recommendedJob([job({ id: 'open', for: undefined })], base)).toBeNull();
    expect(recommendedJob([job({ id: 'two', with: ['kroll', 'rue'] })], base)).toBeNull();
    expect(recommendedJob([job({ id: 'later', after })], base)).toBeNull();
    expect(recommendedJob([job({ id: 'later', after })], { ...base, ctx: { ...ctx, flags: { kroll_one: 'yes' } } })?.id).toBe('later');
  });
  it('only a mission, as her desk lists them', () => {
    expect(recommendedJob([job({ id: 'story', kind: 'quest' })], base)).toBeNull();
    expect(recommendedJob([job({ id: 'contract', kind: 'contract' })], base)).toBeNull();
  });
  it('a text: job only once she has told you', () => {
    const texted = job({ id: 'arrears', text: 'Come by the stall.' });
    expect(recommendedJob([texted], base)).toBeNull();
    expect(recommendedJob([texted], { ...base, heard: (id) => id === 'arrears' })?.id).toBe('arrears');
  });
  it('a job above your rep\'s tier in its district only once your rep reaches it', () => {
    const tier2 = job({ id: 'arrears', tier: 2, district: 'spine' });
    const seen: QuestEntry[] = [];
    expect(recommendedJob([tier2], { ...base, tier: (q) => (seen.push(q), 1) })).toBeNull();
    expect(seen).toEqual([tier2]);
    expect(recommendedJob([tier2], { ...base, tier: () => 2 })?.id).toBe('arrears');
  });
  it('the first in book order', () => {
    expect(recommendedJob([job({ id: 'round', once: undefined }), order, job({ id: 'second' })], base)?.id).toBe('standing-order');
  });

  // Kroll: the floor Monday to Saturday 09:00–21:00, the deck market Sunday 17:00. Day 1 (clock 0) is a Thursday.
  const floor = 'nexus/sdg-floor';
  const blocks: Block[] = [
    { from: 540, to: 1260, room: floor, fixed: true, days: [0, 1, 2, 3, 4, 5] },
    { from: 1020, to: 1080, room: 'spine/deck-market', days: [6] },
  ];
  const at = (day: number, hh: number) => day * 1440 + hh * 60;
  it('FROM: the hour she is next at her place, when she is not there now', () => {
    expect(recommendedFrom(blocks, floor, at(0, 22))).toBe('09:00');
    expect(recommendedFrom(blocks, floor, at(0, 10))).toBeNull();
    // Saturday night: the deck market on Sunday doesn't count; Monday's 09:00 does, named, more than a day off.
    expect(recommendedFrom(blocks, floor, at(2, 22))).toBe('Mon 09:00');
    // Sunday 10:00: Monday 09:00 is the coming day.
    expect(recommendedFrom(blocks, floor, at(3, 10))).toBe('09:00');
    expect(recommendedFrom([], floor, at(0, 22))).toBeNull();
    expect(recommendedFrom([{ from: 1020, to: 1080, room: 'spine/deck-market' }], floor, at(0, 22))).toBeNull();
  });
});
