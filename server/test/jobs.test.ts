import type { GmComplete } from '../src/gm';
import type { Pool } from '../../shared/dice';
import { facesFor } from '../../shared/dice';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ContactCard, QuestState, ServerEvent } from '../../shared/types';
import type { TurnRequest } from '../src/backend';
import { ChatRelay, type ChatRelayDeps } from '../src/chat-relay';
import { fakeBackend, reply } from './fixtures/backend';
import { fakePlayers } from './fixtures/players';
import { openDb, type Db } from '../src/db';
import { COSTS, type CostId } from '../../shared/costs';
import { dealAs, settleLikeOld } from './settle';
import { GM_HOLD_MS } from '../src/gm';
import { MISSION_CLOSE, QUEST_INSTRUCTIONS } from '../src/instructions';
import { Journal } from '../src/journal';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import { generateScenes } from '../../tools/gen-placeholders';
import { flagsOf, parseQuestFile, parseRun, questKey, type DicePending, type DiceRoll, type QuestEntry, type QuestRun, type QuestStatus } from '../../shared/quests';
import { JOB as TIER_2_JOB, TRAIL } from '../../shared/quests.fixture';
import { foldKit, heatIn, type KitEvent } from '../../shared/mission';
import type { Deck } from '../../shared/gear';
import { parsePrograms } from '../../shared/programs';
import { nerveMax, type Stats } from '../../shared/stats';
import { storyDay } from '../../shared/board';
import { makeTerminal, parseWords } from '../../shared/crack';
import { crackSetup, drawsFor, rollLine } from '../src/mission-run';
import { heatLeft } from '../src/push-run';
import { lossOnAgain } from '../../shared/hand';
import { parseCrewBook } from '../../shared/crew-book';
import { DEFAULT_STATS } from '../../shared/stats';
import { fixerKey, parseFixer, parseStock } from '../../shared/stock';
import type { CrewMember, CrewState } from '../../shared/crew-fold';
import { contractBlock, payFor } from '../src/mission-run';
import { CONTRACT } from '../../shared/quests.contract.fixture';
import { settleTake } from '../src/take-run';

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
// Most of this file is about other rules: tier 1 with tier 2's TAKE keeps them clear of the tier's cut (tier effect spec).
const JOB = TIER_2_JOB.replace('tier: 2', 'tier: 1\ntake-size: 4');
const dbs: Db[] = [];
afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
});

const DECKS: Deck[] = [
  { id: 'stall-build', name: 'Stall build', quality: 2, heat: 0, traits: ['fragile'], skin: 'slab' },
  { id: 'pocket-deck', name: 'Pocket deck', quality: 1, heat: 0, traits: [] },
  { id: 'quiet-deck', name: 'Quiet deck', quality: 2, heat: 2, traits: ['hidden'] },
  { id: 'breaker-deck', name: 'Breaker deck', quality: 2, heat: 0, traits: ['breaker'] },
  { id: 'chrome-deck', name: 'Chrome deck', quality: 2, heat: 0, traits: ['chrome'] },
  { id: 'meridian', name: 'Cortex Meridian', quality: 3, heat: 0, traits: [], skin: 'meridian' },
  { id: 'top-deck', name: 'Top deck', quality: 4, heat: 0, traits: [] },
  { id: 'loud-deck', name: 'Loud deck', quality: 2, heat: 2, traits: [] },
];
const PROGRAMS = parsePrograms(fs.readFileSync('world/gear/programs.md', 'utf8')).programs;
const STOCK = parseStock(
  `---\nplace: haes-noodles\nitems:\n  - pocket-deck · 600 · 1\n  - burner · 500 · 2\n  - fall-guy · 1000 · 3\n---\n`,
  new Set(DECKS.map((d) => d.id)),
).byPlace;
const HICKS: Stats = { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 };
const WORDS = Object.values(parseWords(fs.readFileSync(path.join(__dirname, '../../world/gear/words.md'), 'utf8')).byLength).flat();
const known = { roster: null, places: null, decks: new Set(DECKS.map((d) => d.id)) };
const job = (text = JOB, id = 'back-door') => {
  const r = parseQuestFile(id, text, known);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
const BACK = job();
const trail = parseQuestFile('paper-trail', TRAIL.replace('starts: lowlight-intake', 'starts: haes-noodles'), { roster: null, places: null });
if (!trail.ok) throw new Error('fixture');

/** The story clock at 20:00 on story day `d`. */
const evening = (d: number) => 360 + d * 1440 + 840;
/** The first story day from 0 whose draws for `q` (run by hicks) pass `want`. */
function dayWhere(want: (d: Record<string, string>) => boolean, q: QuestEntry = BACK): number {
  for (let d = 0; d < 200; d++) if (want(drawsFor(q, questKey('hicks', `${q.id}@${d}`)))) return d;
  throw new Error('no such day');
}

/** Hicks with Nix at Hae's (karasu), rep 30 there (KNOWN: tier 2 jobs), on the story clock `clock`. */
const ABILITIES = parseCrewBook({
  names: '',
  traits: '',
  pitches: '',
  errands: '',
  abilities: [
    'cool-head · Cool Head · any · GREEN · cross cool · Keeps it level.',
    'steady-hand · Steady Hand · any · GREEN · die · Doesn’t shake.',
    'log-wipe · Log Wipe · any · GREEN · alarm -1 · Knows which logs nobody reads.',
    'second-wind · Second Wind · any · GREEN · nerve +1 · Breathes slow.',
    'clean-exit · Clean Exit · any · VET · save · Never a trace.',
    'quick-sale · Quick Sale · any · GREEN · take +1 · A buyer waiting.',
    'smooth · Smooth It Over · any · GREEN · heat -1 · A word in the right ear.',
    'look · Second Look · any · GREEN · setup-position · Sees what moved.',
    'story · Cover Story · any · GREEN · setup-die · A story for every door.',
    'roofs · Over the Roofs · any · GREEN · greed-effect · Never the street.',
    'spoof · Spoof · any · GREEN · greed-die · Any name you like.',
    'door-hold · Hold the Door · any · GREEN · gamble-cost · As long as the hinges do.',
    'word · Quiet Word · any · GREEN · gamble-miss · He didn’t see anything.',
    'wipe · Smooth Wipe · any · GREEN · trade-alarm · Something left on the table.',
    'wind · Long Wind · any · GREEN · trade-nerve · Stops to breathe.',
    'sale · Quick Flip · any · GREEN · end-take · The buyer talks.',
    'thin · Spread It Thin · any · GREEN · end-cool · Six hands.',
    'lookout · Lookout · any · PRO · lookout · Calls the patrol.',
    'more · One More Thing · any · PRO · talk-past · Turns at the door.',
    'calm · Calm Voice · any · PRO · inside-info · Talks low.',
    'firm · Stand Firm · any · VET · stand-firm · Doesn’t go down.',
    'twice · Run It Twice · any · PRO · rerun · Goes back.',
    'run-it-twice · Run It Twice · runner · PRO · rerun · Goes back.',
    'exit · Clean Exit · any · VET · hold-alarm · Never a trace.',
    'deal · Cut a Deal · any · PRO · sell-part · Sells him his silence.',
    'paid · Paid Off · any · VET · pay-off · Somebody owes them.',
    'undo · Saw It Coming · any · VET · undo · Already moving.',
    'down · Talk Them Down · any · VET · talk-down · A gun back in its holster.',
    'hit · Take the Hit · any · PRO · take-hit · Steps in front.',
  ].join('\n'),
}).book.abilities;

function relayWith(o: { tie?: string; leads?: string[]; gamble?: number; rerun?: number[]; deck?: string; rolls?: number[]; nerve?: number; heat?: number; gm?: GmComplete; book?: QuestEntry[]; stats?: Stats; clock?: () => number; burner?: number; rep?: number; sol?: number; crew?: Partial<CrewState>; contacts?: () => ContactCard[]; onLiveClock?: (relay: ChatRelay) => void } = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  dbs.push(db);
  const events: ServerEvent[] = [];
  const backend = fakeBackend(() => reply('Hm.'));
  const rolls = [...(o.rolls ?? [])];
  const stats = o.stats ?? HICKS;
  const contact = 'nix-direct';
  const clock = o.clock ?? (() => evening(dayWhere(() => true)));
  const status = (p: string): QuestStatus[] =>
    db.metaWithPrefix(`quest.${p}.`).flatMap(({ k, v }) => {
      const run = parseRun(v);
      return run ? [{ id: k.slice(`quest.${p}.`.length), contact, run }] : [];
    });
  const seed: KitEvent[] = [
    { at: 0, rep: { district: 'karasu', delta: o.rep ?? 30 } },
    ...(o.burner ? [{ at: 0, cover: { id: 'burner' as const, delta: o.burner } }] : []),
    ...(o.sol ? [{ at: 0, sol: o.sol }] : []),
    // NERVE left as the job starts (the table spec §3): spent just before the clock, after its 06:00.
    ...(o.nerve !== undefined ? [{ at: clock() - 1, nerve: o.nerve - nerveMax(stats) }] : []),
    // Heat in karasu as the job starts (effect and NERVE spec §1), after the 06:00 that cools it.
    ...(o.heat ? [{ at: clock() - 1, heat: o.heat, district: 'karasu' }] : []),
  ];
  const kit = (p: string, at?: number) =>
    foldKit(
      { deck: o.deck ?? 'stall-build', nerveMax: nerveMax(stats), from: 0 },
      [...seed, ...status(p).flatMap((s) => (s.run.kit ?? []) as KitEvent[]), ...parseFixer(db.getMeta(fixerKey(p)))].filter((e) => at === undefined || e.at <= at),
      at ?? clock(),
      { districtOf: () => 'karasu' },
    );
  const quests: NonNullable<ChatRelayDeps['quests']> = {
    heldLeads: () => o.leads ?? [],
    contact,
    book: () => o.book ?? [BACK],
    status,
    placeId: () => 'haes-noodles',
    contactName: (id) => id,
    placeName: (id) => id,
    ctx: (p) => {
      const k = kit(p);
      return { flags: flagsOf(status(p)), trust: 'mid', warmth: 'mid', with: contact, heat: heatIn(k, 'karasu'), deck: DECKS.find((d) => d.id === k.deck) ?? null, stats };
    },
    kit,
    decks: () => DECKS,
    programs: () => PROGRAMS,
    districtOf: () => 'karasu',
    boardSeed: () => 'pt-1',
    words: () => WORDS,
    stock: () => STOCK,
    crewState: () => (o.crew ? { members: [], prep: {}, scouted: [], taken: [], latest: null, wages: 0, ...o.crew } : null),
    crewAbilities: () => ABILITIES,
    ...(o.contacts ? { contactCards: o.contacts } : {}),
  };
  const relay: ChatRelay = new ChatRelay({
    ...(o.tie ? { tie: () => o.tie! } : {}),
    ...(o.gm ? { gm: o.gm } : {}),
    ...(o.onLiveClock ? { onLiveClock: () => o.onLiveClock!(relay) } : {}),
    players: fakePlayers(),
    backend,
    db,
    room: new Room(registry),
    journal: new Journal(db),
    emit: (e) => events.push(e),
    instructions: 'ROOM NOTE',
    quests,
    rollDice: (n: number, keep: 'high' | 'low') => facesFor(rolls.shift() ?? 6, n, keep),
    ...(o.gamble !== undefined ? { gambleDie: () => o.gamble! } : {}),
    ...(o.rerun !== undefined ? { rerunFaces: () => o.rerun! } : {}),
    clockNow: clock,
  });
  return { relay, db, events, backend: backend as ReturnType<typeof fakeBackend>, kit: () => kit('hicks') };
}
const lastUser = (r: TurnRequest) => r.messages.at(-1)!.content;
const keyOn = (d: number, id = 'back-door') => questKey('hicks', `${id}@${d}`);
const runOn = (db: Db, d: number, id = 'back-door') => parseRun(db.getMeta(keyOn(d, id)));
/** A job from before programs (programs spec §3): its setup without the deck, with the favour or contact cards it brought. */
const asOld = (db: Db, d: number, patch: Record<string, unknown>, id = 'back-door') => {
  const run = runOn(db, d, id)!;
  const { deck: _deck, ...setup } = run.setup!;
  db.setMeta(keyOn(d, id), JSON.stringify({ ...run, setup: { ...setup, ...patch } }));
};
const states = (events: ServerEvent[]) => events.filter((e): e is { type: 'quest_state'; state: QuestState } => e.type === 'quest_state').map((e) => e.state);
const questRows = (db: Db) => db.recentMessages('hicks', 50).filter((m) => m.mode === 'quest' && m.role === 'user');
/** A pick; a costly roll's dealt costs (roll lifecycle spec §1) are then taken as dealt, as a bare TAKE IT does. */
const pick = async (relay: ChatRelay, beat: string, choice: string, moves?: ({ word: string } | { bracket: number })[]) => {
  const r = await relay.chooseQuest('hicks', { id: 'back-door', beat, choice, ...(moves ? { moves } : {}) });
  return (await settleLikeOld(relay, "back-door", beat)) ?? r;
};
/** A pick with nothing settled after it (a dealt roll stays waiting). */
const raw = (relay: ChatRelay, beat: string, choice: string, card?: string) => relay.chooseQuest('hicks', { id: 'back-door', beat, choice, ...(card ? { card } : {}) });
/** Picks each of `costs` on the waiting roll and RESISTs each (roll lifecycle spec §1.3). */
async function resistEach(relay: ChatRelay, beat: string, costs: CostId[]) {
  for (const c of costs) await raw(relay, beat, '!cost', c);
  for (const c of costs) await raw(relay, beat, '!resist', c);
}
/** A day whose door beat is the default (the doorman), with the given temper. */
const plainDoor = (door: 'easy' | 'hard') => dayWhere((d) => d.complication !== 'caper-watching' && d.door === door);

describe('jobs: the board', () => {
  it("only tonight's posted jobs are open; a job done today isn't open again today; it can be posted another day", async () => {
    const tier1 = (id: string) => job(JOB.replace('tier: 2', 'tier: 1'), id);
    const five = ['a-job', 'b-job', 'c-job', 'd-job', 'e-job'].map(tier1);
    const d = 3;
    const { relay } = relayWith({ book: five, clock: () => evening(d) });
    const { postedJobs } = await import('../../shared/board');
    const posted = postedJobs({ book: five, place: 'haes-noodles', tier: 2, day: d, seed: 'pt-1' });
    expect(posted).toHaveLength(3);
    expect(relay.questState('hicks').open.map((o) => o.id).sort()).toEqual([...posted].sort());

    let clock = evening(d);
    const one = relayWith({ clock: () => clock, rolls: [6, 6] });
    await one.relay.startQuest('hicks', 'back-door');
    await pick(one.relay, 'door', 'talk');
    await pick(one.relay, 'desk', 'skim');
    expect(runOn(one.db, d)!.done).toBe(true);
    expect(one.relay.questState('hicks').open).toEqual([]);
    clock += 1440;
    expect(one.relay.questState('hicks').open.map((o) => o.id)).toEqual(['back-door']);
  });

  it('a tier 2 job is not posted to a Nobody', () => {
    const { relay } = relayWith({ book: [job(TIER_2_JOB)], rep: 0 });
    expect(relay.questState('hicks').open).toEqual([]);
  });
});

describe('jobs: setting out', () => {
  it('draws are made at start, saved, and the matching beat variant plays', async () => {
    const caper = dayWhere((x) => x.complication === 'caper-watching');
    const { relay, db } = relayWith({ clock: () => evening(caper) });
    await relay.startQuest('hicks', 'back-door');
    const r = runOn(db, caper)!;
    expect(r.draws).toEqual(drawsFor(BACK, keyOn(caper)));
    expect(r.flags.complication).toBe('caper-watching');
    expect(r.variant).toBe(0);
    expect(questRows(db).at(-1)!.text).toContain("someone across the street who isn't eating");

    const plain = plainDoor('easy');
    const other = relayWith({ clock: () => evening(plain) });
    await other.relay.startQuest('hicks', 'back-door');
    expect(runOn(other.db, plain)!.variant).toBe(1);
    expect(questRows(other.db).at(-1)!.text).not.toContain("isn't eating");
  });

  it('pay draw within the range; pay: full pays it; pay: half pays half', async () => {
    const d = plainDoor('easy');
    // Two crits fill a tier 2 TAKE (6): the written pay in full (the table spec §2).
    const full = relayWith({ clock: () => evening(d), rolls: [66, 66] });
    await full.relay.startQuest('hicks', 'back-door');
    const pay = runOn(full.db, d)!.pay!;
    expect(pay).toBeGreaterThanOrEqual(350);
    expect(pay).toBeLessThanOrEqual(450);
    await pick(full.relay, 'door', 'talk');
    await pick(full.relay, 'desk', 'grab');
    expect(full.kit().sol).toBe(pay);

    const half = relayWith({ clock: () => evening(d), rolls: [66] });
    await half.relay.startQuest('hicks', 'back-door');
    await pick(half.relay, 'door', 'talk');
    await pick(half.relay, 'desk', 'skim');
    // pay: half, with TAKE full (a crit and a no-roll pick fill 4/4), rounded to 10.
    expect(half.kit().sol).toBe(Math.round(Math.floor(pay / 2) / 10) * 10);
  });

  it('the active job shows ALARM, NERVE, heat and the pay range', async () => {
    const { relay } = relayWith();
    await relay.startQuest('hicks', 'back-door');
    expect(relay.questState('hicks').active).toMatchObject({ alarm: 0, nerve: { left: 5, max: 5 }, heat: 0, pay: [350, 450] });
  });
});

describe('jobs: picks', () => {
  it('each pick moves the clock by stepMinutes plus tags; REROLL and TAKE IT add none', async () => {
    const d = plainDoor('easy');
    const now = evening(d);
    const a = relayWith({ clock: () => now });
    await a.relay.startQuest('hicks', 'back-door');
    await pick(a.relay, 'door', 'wait');
    expect(questRows(a.db).at(-1)!.clock).toBe(now + 30 + 60);

    const b = relayWith({ clock: () => now, rolls: [2] });
    await b.relay.startQuest('hicks', 'back-door');
    await pick(b.relay, 'door', 'talk');
    await pick(b.relay, 'door', '!take');
    expect(questRows(b.db).at(-1)!.clock).toBe(now + 30);
  });

  it('a parked check shows the roll it parked on, with its dealt costs (roll lifecycle spec §1)', async () => {
    const d = plainDoor('easy');
    const { relay } = relayWith({ clock: () => evening(d), rolls: [2] });
    await relay.startQuest('hicks', 'back-door');
    await raw(relay, 'door', 'talk');
    expect(relay.questState('hicks').active!.rolled).toEqual({ choice: 'talk', faces: [2, 1, 1, 1], keep: 'high', kind: 'miss', cost: { alarm: 0, heat: 0 } });
    // A miss that ends the job can only cost ALARM here, so that's all it deals.
    expect(relay.questState('hicks').active!.costs).toMatchObject({ pick: 1 });
  });
  it('ALARM +1 when a miss in the open takes it, on [alarm +1]; ALARM 2 makes the position one worse', async () => {
    const d = plainDoor('easy');
    const failed = relayWith({ clock: () => evening(d), rolls: [2] });
    await failed.relay.startQuest('hicks', 'back-door');
    await raw(failed.relay, 'door', 'talk');
    dealAs(failed.db, keyOn(d), ['alarm', 'worse']);
    await raw(failed.relay, 'door', '!take');
    expect(runOn(failed.db, d)!.alarm).toBe(1);

    const loud = job(JOB.replace(/→ inside \[clock \+1h\]/g, '→ inside [clock +1h, alarm +1]'));
    const { relay, db } = relayWith({ book: [loud], clock: () => evening(d) });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'wait');
    expect(runOn(db, d)!.alarm).toBe(1);
    expect(relay.questState('hicks').active!.choices.find((c) => c.id === 'grab')!.pool).toMatchObject({ dice: 2, position: 'open' });
    db.setMeta(keyOn(d), JSON.stringify({ ...runOn(db, d)!, alarm: 2 }));
    expect(relay.questState('hicks').active!.choices.find((c) => c.id === 'grab')!.pool).toMatchObject({ dice: 2, position: 'wire' });
  });
  it('a red check fails straight to its fail outcome with EDGE left', async () => {
    const d = plainDoor('easy');
    const red = job(JOB.replace(/\[check cool 50\]/g, '[check cool 50 red]'));
    const { relay, db } = relayWith({ book: [red], clock: () => evening(d), rolls: [2] });
    await relay.startQuest('hicks', 'back-door');
    expect(relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!.red).toBe(true);
    await pick(relay, 'door', 'talk');
    expect(runOn(db, d)!.pending ?? null).toBeNull();
    expect(questRows(db).at(-1)!.text).toContain('*He turns you round.*');
  });

  it('passive line in the row only when its condition holds, with its marker', async () => {
    const d = plainDoor('easy');
    const text = JOB.replace('*The ledger.*', '*The ledger.*\n[wits 6] *A second ledger under the first.*');
    const sharp = relayWith({ book: [job(text)], clock: () => evening(d), rolls: [6] });
    await sharp.relay.startQuest('hicks', 'back-door');
    await pick(sharp.relay, 'door', 'talk');
    expect(questRows(sharp.db).at(-1)!.text).toContain('⟦WITS⟧ *A second ledger under the first.*');
    const dull = relayWith({ book: [job(text)], clock: () => evening(d), rolls: [6], stats: { ...HICKS, wits: 5 } });
    await dull.relay.startQuest('hicks', 'back-door');
    await pick(dull.relay, 'door', 'talk');
    expect(questRows(dull.db).at(-1)!.text).not.toContain('second ledger');
  });

  it('an easy mark is +1d (EASY MARK), a hard mark −1d', async () => {
    const { relay } = relayWith({ clock: () => evening(plainDoor('easy')) });
    await relay.startQuest('hicks', 'back-door');
    const talk = relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!;
    expect(talk.pool).toMatchObject({ stat: 'COOL', base: 3, dice: 4, parts: [{ label: 'EASY MARK', dice: 1 }], position: 'open', noDeck: false, effect: 'fair', effectRaw: 1, effectParts: [] });
    const hard = relayWith({ clock: () => evening(plainDoor('hard')) });
    await hard.relay.startQuest('hicks', 'back-door');
    expect(hard.relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!.pool!.dice).toBe(2);
  });
});

describe('jobs: the roll (the table spec §1, §3)', () => {
  const pickPush = (relay: ChatRelay, beat: string, choice: string) => relay.chooseQuest('hicks', { id: 'back-door', beat, choice, push: true });
  const atDoor = async (o: Parameters<typeof relayWith>[0] = {}) => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), ...o });
    await r.relay.startQuest('hicks', 'back-door');
    return { ...r, d };
  };

  it('a 6 6 is a crit: TAKE +3, no cost, no cards', async () => {
    const { relay, db, d } = await atDoor({ rolls: [66] });
    await pick(relay, 'door', 'talk');
    expect(runOn(db, d)).toMatchObject({ beat: 'desk', alarm: 0, takeFill: 3, pending: null });
    expect(questRows(db).at(-1)!.text).toContain('*COOL 4d · IN THE OPEN — 6 6, crit.*');
  });

  it('a miss on the wire: fail outcome, and the two costs taken land (ALARM +1, heat +1)', async () => {
    const wire = job(JOB.replace(/\[check cool 50\]/g, '[check cool 40]'));
    const { relay, db, d, kit } = await atDoor({ book: [wire], rolls: [2], nerve: 1 });
    await raw(relay, 'door', 'talk');
    dealAs(db, keyOn(d), ['alarm']);
    await raw(relay, 'door', '!take');
    expect(runOn(db, d)).toMatchObject({ done: true, alarm: 1 });
    expect(kit().heat.karasu).toBe(2); // blown: at least 2
    expect(questRows(db).at(-1)!.text).toContain('*He turns you round.*');
  });
  it('PUSH adds a die and spends 2 nerve; refused on red and below 2 nerve', async () => {
    const { relay, db, d, kit } = await atDoor({ rolls: [6] });
    await pickPush(relay, 'door', 'talk');
    expect(runOn(db, d)!.picks.at(-1)!.roll).toMatchObject({ dice: 5, pushed: true, kind: 'clean' });
    expect(kit().nerveLeft).toBe(3);
    const red = job(JOB.replace(/\[check cool 50\]/g, '[check cool 50 red]'));
    const r2 = await atDoor({ book: [red], rolls: [6] });
    expect(await pickPush(r2.relay, 'door', 'talk')).toBe("PUSH can't go on a one-shot card");
    const r3 = await atDoor({ rolls: [6], nerve: 1 });
    expect(await pickPush(r3.relay, 'door', 'talk')).toBe('not enough nerve');
  });

  it('red: the costs are dealt, but RESIST is refused', async () => {
    const red = job(JOB.replace(/\[check cool 50\]/g, '[check cool 50 red]'));
    const { relay, db, d } = await atDoor({ book: [red], rolls: [5] });
    await raw(relay, 'door', 'talk');
    expect(relay.questState('hicks').active!.costs!.resist).toMatchObject({ ok: false, why: 'ONE SHOT' });
    dealAs(db, keyOn(d), ['alarm']);
    await raw(relay, 'door', '!take');
    expect(runOn(db, d)).toMatchObject({ beat: 'desk', alarm: 1, pending: null });
  });
  it('a fragile deck dies on a miss showing a 1', async () => {
    const grid = job(JOB.replace('[check reflex 50]', '[check reflex 50 grid]'));
    const { relay, db, kit } = await atDoor({ book: [grid], rolls: [6, 2], nerve: 1 });
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'grab');
    expect(kit().deck).toBeNull();
    expect(questRows(db).at(-1)!.text).toContain('dies');
  });

  it('a legacy pending shows only TAKE IT and plays its fail outcome', async () => {
    const { relay, db, d, events } = await atDoor();
    db.setMeta(keyOn(d), JSON.stringify({ ...runOn(db, d)!, pending: { beat: 'door', choice: 'talk', stat: 'COOL', chance: 74, rolls: [80] } }));
    expect(relay.questState('hicks').active!.choices).toEqual([{ id: '!take', line: 'TAKE IT' }]);
    expect(await pick(relay, 'door', '!steady')).toBe('that choice has passed');
    await pick(relay, 'door', '!take');
    expect(runOn(db, d)).toMatchObject({ done: true });
    expect(questRows(db).at(-1)!.text).toContain('*He turns you round.*');
    expect(events.length).toBeGreaterThan(0);
  });

  it("a fragile deck's death line survives a parked roll (review I1)", async () => {
    const grid = job(JOB.replace('[check reflex 50]', '[check reflex 50 grid]'));
    const { relay, db, kit } = await atDoor({ book: [grid], rolls: [6, 2] });
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'grab');
    expect(kit().deck).toBeNull();
    await pick(relay, 'desk', '!take');
    expect(questRows(db).at(-1)!.text).toContain('*The Stall build dies.*');
  });

  it("a 4–5 whose costs were all resisted reads as 'it worked' in her summary, not 'at a cost' (review M3)", async () => {
    const { relay, db, d, backend } = await atDoor({ rolls: [5, 6, 66] });
    await raw(relay, 'door', 'talk');
    dealAs(db, keyOn(d), ['alarm']);
    await resistEach(relay, 'door', ['alarm']);
    await pick(relay, 'desk', 'grab');
    const sent = lastUser(backend.reqs.at(-1)!);
    expect(sent).toContain('- Talk your way in. — it worked\n');
  });
  it('PUSH at the 6-die cap is refused and spends nothing (review M4)', async () => {
    const six = job(JOB.replace(/\[check cool 50\]/g, '[check cool 50 · nix-direct +10]'));
    const { relay, kit } = await atDoor({ book: [six], stats: { ...HICKS, cool: 10 }, rolls: [6] });
    expect(relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!.pool!.dice).toBe(6);
    expect(await pickPush(relay, 'door', 'talk')).toBe('already rolling 6 dice');
    expect(kit().nerveLeft).toBe(5);
  });

  it('a pool at 0 rolls 2 and keeps the lower; the card shows 0 dice, never negative', async () => {
    const d = plainDoor('hard');
    const { relay, db } = relayWith({ clock: () => evening(d), stats: { ...HICKS, cool: 1 }, rolls: [5], nerve: 1 });
    await relay.startQuest('hicks', 'back-door');
    expect(relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!.pool).toMatchObject({ dice: 0, position: 'open' });
    await pick(relay, 'door', 'talk');
    expect(runOn(db, d)!.picks.at(-1)!.roll).toMatchObject({ dice: 0, faces: [5, 6], keep: 'low', kind: 'cost' });
  });
});

describe('jobs: the clocks (the table spec §2)', () => {
  const round10 = (n: number) => Math.round(n / 10) * 10;
  const PUSH1 = `
# push-1
*The safe behind the desk is open.*

- crack: Empty the safe. → won-1 / lost-1 [check reflex 50]
- pocket: Take one bundle and go. → won-1

## won-1
*Folded notes.*
pay: +150
→ end

## lost-1
*Someone shouts.*
lost
→ end
`;
  const GETAWAY = `
# getaway
*The doorman's radio crackles. Lights come on upstairs.*

- run: Go out the back way. → clear / caught-out [check reflex 50]
- hide: Hide in the stall's cold store. → clear

## clear
*The alley is empty.*
→ end

## caught-out
*They have you against the wall.*
take: none
blown
→ end
`;
  const PUSHY = job(`${JOB.trimEnd()}\n${PUSH1}`);
  const run = async (o: Parameters<typeof relayWith>[0], picks: [string, string][]) => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), ...o });
    await r.relay.startQuest('hicks', 'back-door');
    for (const [beat, choice] of picks) await pick(r.relay, beat, choice);
    return { ...r, d, pay: runOn(r.db, d)!.pay! };
  };

  it("TAKE fills by result; a no-roll choice +1; capped at the tier's size", async () => {
    const a = await run({ rolls: [66, 66, 66] }, [['door', 'talk']]);
    expect(runOn(a.db, a.d)!.takeFill).toBe(3);
    const b = await run({ rolls: [66] }, [['door', 'wait']]);
    expect(runOn(b.db, b.d)!.takeFill).toBe(1);
    const capped = await run({ rolls: [66, 66] }, [['door', 'talk'], ['desk', 'grab']]);
    expect(questRows(capped.db).at(-1)!.quest!.debrief).toMatchObject({ tier: 'clean', sol: capped.pay });
  });

  it('the pay is scaled at the job\'s end: tier 2, TAKE 3/4 of pay: full → rounded to 10; take: full becomes part', async () => {
    const r = await run({ rolls: [6, 5], nerve: 1 }, [['door', 'talk'], ['desk', 'grab']]);
    expect(r.kit().sol).toBe(round10((r.pay * 3) / 4));
    expect(runOn(r.db, r.d)!.take).toBe('part');
    expect(questRows(r.db).at(-1)!.quest!.debrief).toMatchObject({ tier: 'messy', sol: round10((r.pay * 3) / 4) });
  });

  it('WALK on the card shows the scaled pay', async () => {
    const r = await run({ rolls: [6, 5], nerve: 1, book: [PUSHY] }, [['door', 'talk'], ['desk', 'grab']]);
    expect(states(r.events).at(-1)!.active!.choices[0]).toEqual({ id: '!walk', line: `WALK — ${round10((r.pay * 3) / 4)} SOL · HEAT +${runOn(r.db, r.d)!.alarm ?? 0}` });
    expect(states(r.events).at(-1)!.active!.take).toEqual({ filled: 3, size: 4 });
  });

  it('a push beat card has no effect and refuses the trade (effect and NERVE spec §1)', async () => {
    const r = await run({ rolls: [66, 66], nerve: 3, book: [PUSHY] }, [['door', 'talk'], ['desk', 'grab'], ['!push', '!press']]);
    const crack = r.relay.questState('hicks').active!.choices.find((c) => c.id === 'crack')!;
    expect(crack.pool).not.toHaveProperty('effect');
    expect(await r.relay.chooseQuest('hicks', { id: 'back-door', beat: 'push-1', choice: 'crack', trade: 'bold' })).toBe('NOTHING TO TAKE HERE');
  });

  it('a job says its tier, and pressing on says so', async () => {
    const r = await run({ rolls: [66, 66, 2], nerve: 1, book: [PUSHY] }, [['door', 'talk'], ['desk', 'grab'], ['!push', '!press']]);
    expect(r.relay.questState('hicks').active).toMatchObject({ tier: 1, pressing: true });
  });

  it('a lost push after a full TAKE takes half the pay', async () => {
    const r = await run({ rolls: [66, 66, 2], nerve: 1, book: [PUSHY] }, [['door', 'talk'], ['desk', 'grab'], ['!push', '!press'], ['push-1', 'crack']]);
    expect(r.kit().sol).toBe(r.pay - Math.floor(r.pay / 2));
  });

  it('ALARM 4 goes to the stock getaway; RUN made → take part, messy, no push card', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [2, 6], nerve: 1, book: [PUSHY] });
    await r.relay.startQuest('hicks', 'back-door');
    r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, alarm: 3 }));
    await pick(r.relay, 'door', 'talk');
    expect(runOn(r.db, d)).toMatchObject({ beat: 'getaway', getaway: true, done: false });
    const active = r.relay.questState('hicks').active!;
    expect(active.getaway).toBe(true);
    expect(active.choices.map((c) => c.id)).toEqual(['run', 'walk']);
    expect(active.choices.every((c) => c.pool?.position === 'wire')).toBe(true);
    expect(questRows(r.db).at(-1)!.text).toContain("*They're coming. Now.*");
    await pick(r.relay, 'getaway', 'run');
    expect(runOn(r.db, d)).toMatchObject({ done: true, take: 'none' });
  });

  it('a made getaway caps the take at part: messy, and no push card', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [66, 2, 6], nerve: 1, book: [PUSHY] });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, alarm: 3 }));
    await pick(r.relay, 'desk', 'grab');
    expect(runOn(r.db, d)!.beat).toBe('getaway');
    await pick(r.relay, 'getaway', 'run');
    const done = runOn(r.db, d)!;
    expect(done).toMatchObject({ done: true, take: 'part' });
    expect(done.push).toBeUndefined();
    expect(questRows(r.db).at(-1)!.quest!.debrief).toMatchObject({ tier: 'messy' });
  });

  it("a missed getaway is blown, with the cover cards when a burner's held", async () => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [2, 2], nerve: 1, burner: 1 });
    await r.relay.startQuest('hicks', 'back-door');
    r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, alarm: 3 }));
    await pick(r.relay, 'door', 'talk');
    await pick(r.relay, 'getaway', 'run');
    expect(runOn(r.db, d)!.pendingCover).toBeTruthy();
    expect(r.relay.questState('hicks').active!.choices.map((c) => c.id)).toEqual(['!burner', '!take']);
  });

  it("the file's own # getaway plays instead of the stock card", async () => {
    const d = plainDoor('easy');
    const own = job(`${JOB.trimEnd()}\n${GETAWAY}`);
    const r = relayWith({ clock: () => evening(d), rolls: [66, 2], nerve: 1, book: [own] });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, alarm: 3 }));
    await pick(r.relay, 'desk', 'grab');
    expect(questRows(r.db).at(-1)!.text).toContain("*The doorman's radio crackles. Lights come on upstairs.*");
    expect(r.relay.questState('hicks').active!.choices.map((c) => c.id)).toEqual(['run', 'hide']);
    await pick(r.relay, 'getaway', 'hide');
    expect(runOn(r.db, d)).toMatchObject({ done: true, take: 'part' });
  });

  it('a push lost on the way into GET OUT stays lost when the getaway is made (final review I3)', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [66, 66, 2, 6], nerve: 1, book: [PUSHY] });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    await pick(r.relay, 'desk', 'grab');
    const pay = runOn(r.db, d)!.pay!;
    await pick(r.relay, '!push', '!press');
    r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, alarm: 3 }));
    await pick(r.relay, 'push-1', 'crack');
    expect(runOn(r.db, d)!.beat).toBe('getaway');
    await pick(r.relay, 'getaway', 'run');
    expect(runOn(r.db, d)).toMatchObject({ done: true, take: 'part', push: { state: 'lost' } });
    expect(r.kit().sol).toBe(pay - Math.floor(pay / 2));
  });

  it('a push won on the way into GET OUT keeps its pot when the getaway is made', async () => {
    const loudPush = job(`${JOB.trimEnd()}\n${PUSH1.replace('- pocket: Take one bundle and go. → won-1', '- pocket: Take one bundle and go. → won-1 [alarm +1]')}`);
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [66, 66, 6], nerve: 1, book: [loudPush] });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    await pick(r.relay, 'desk', 'grab');
    const pay = runOn(r.db, d)!.pay!;
    await pick(r.relay, '!push', '!press');
    r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, alarm: 3 }));
    await pick(r.relay, 'push-1', 'pocket');
    expect(runOn(r.db, d)!.beat).toBe('getaway');
    await pick(r.relay, 'getaway', 'run');
    expect(runOn(r.db, d)).toMatchObject({ done: true, push: { state: 'won' } });
    expect(r.kit().sol).toBe(pay + 150);
  });

  it("a getaway's own roll leaves TAKE as it was (final review I1)", async () => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [66, 2, 66], nerve: 1 });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, alarm: 3 }));
    await pick(r.relay, 'desk', 'grab');
    const { pay: drawn, takeFill: fill } = runOn(r.db, d)!;
    await pick(r.relay, 'getaway', 'run');
    expect(runOn(r.db, d)!.takeFill).toBe(fill);
    expect(r.kit().sol).toBe(round10((Math.floor(drawn! / 2) * fill!) / 4));
  });

  it('a GET OUT before anything paid pays the drawn pay, scaled by TAKE (final review I2 ruling)', async () => {
    const loud = job(JOB.replace(/→ inside \[clock \+1h\]/g, '→ inside [clock +1h, alarm +1]'));
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [6], nerve: 1, book: [loud] });
    await r.relay.startQuest('hicks', 'back-door');
    r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, alarm: 3 }));
    await pick(r.relay, 'door', 'wait');
    expect(runOn(r.db, d)!.beat).toBe('getaway');
    const pay = runOn(r.db, d)!.pay!;
    await pick(r.relay, 'getaway', 'run');
    expect(runOn(r.db, d)).toMatchObject({ done: true, take: 'part' });
    expect(r.kit().sol).toBe(round10((pay * 1) / 4));
  });
});

describe('jobs: the end', () => {
  it('clean ending writes debrief tier clean and rep +(5+T) in the job\'s district', async () => {
    const d = plainDoor('easy');
    const { relay, db, kit, backend } = relayWith({ clock: () => evening(d), rolls: [66, 66] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'grab');
    const last = questRows(db).at(-1)!;
    const pay = runOn(db, d)!.pay!;
    expect(last.quest!.debrief).toMatchObject({
      tier: 'clean',
      sol: pay,
      rep: { district: 'karasu', before: 30, after: 36 },
      checks: [
        { line: 'Talk your way in.', stat: 'COOL', dice: 4, position: 'open', kind: 'crit' },
        { line: 'Take it all.', stat: 'REFLEX', dice: 2, position: 'open', kind: 'crit' },
      ],
    });
    expect(kit().rep.karasu).toBe(36);
    const sent = lastUser(backend.reqs.at(-1)!);
    expect(sent).toContain(MISSION_CLOSE);
    // In words, not numbers (MISSION_CLOSE): the outcome, no alarm, the name gone up.
    expect(sent).toContain('It paid. It went well. Their name in karasu went up.');
    expect(sent).toContain('- Talk your way in. — it worked');
    expect(sent).not.toMatch(/\[mission summary[^\]]*(CLEAN|ALARM|\d)/);
  });

  it('blown ending with a burner held parks with cover cards; !burner halves the loss; debrief.cover is burner; the closing turn then runs', async () => {
    const d = plainDoor('easy');
    const { relay, db, events, kit, backend } = relayWith({ book: [job(TIER_2_JOB)], clock: () => evening(d), rolls: [2], nerve: 1, burner: 1 });
    await relay.startQuest('hicks', 'back-door');
    const rows = questRows(db).length;
    await pick(relay, 'door', 'talk');
    expect(questRows(db)).toHaveLength(rows);
    expect(backend.reqs).toHaveLength(1);
    expect(states(events).at(-1)!.active!.choices).toEqual([
      { id: '!burner', line: 'USE BURNER (−6 INSTEAD OF −12)' },
      { id: '!take', line: 'TAKE IT' },
    ]);
    await pick(relay, 'door', '!burner');
    const last = questRows(db).at(-1)!;
    expect(last.text).toContain('*He turns you round.*');
    expect(last.quest!.debrief).toMatchObject({ tier: 'blown', cover: 'burner', rep: { district: 'karasu', before: 30, after: 24 } });
    expect(kit().cover.burner).toBe(0);
    expect(kit().rep.karasu).toBe(24);
    expect(runOn(db, d)!.done).toBe(true);
    expect(backend.reqs).toHaveLength(2);
    expect(lastUser(backend.reqs[1])).toContain(MISSION_CLOSE);
  });

  it('a fall guy makes the loss 0 and takes half the drawn pay', async () => {
    const d = plainDoor('easy');
    const { relay, db, events, kit } = relayWith({ clock: () => evening(d), rolls: [2], nerve: 1 });
    // A fall guy bought earlier, and some sol to pay him from.
    db.setMeta(questKey('hicks', 'old@0'), JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags: {}, done: true, at: 1, kit: [{ at: 0, sol: 1000, cover: { id: 'fall-guy', delta: 1 } }] }));
    await relay.startQuest('hicks', 'back-door');
    const pay = runOn(db, d)!.pay!;
    await pick(relay, 'door', 'talk');
    expect(states(events).at(-1)!.active!.choices).toEqual([
      { id: '!fall-guy', line: `USE FALL GUY (0, −${Math.floor(pay / 2)} SOL)` },
      { id: '!take', line: 'TAKE IT' },
    ]);
    await pick(relay, 'door', '!fall-guy');
    expect(kit()).toMatchObject({ sol: 1000 - Math.floor(pay / 2), rep: { karasu: 30 }, cover: { 'fall-guy': 0 } });
    expect(questRows(db).at(-1)!.quest!.debrief).toMatchObject({ tier: 'blown', cover: 'fall-guy' });
  });

  it('cover is offered only when blown', async () => {
    const d = plainDoor('easy');
    const { relay, db, kit } = relayWith({ clock: () => evening(d), rolls: [6], burner: 1 });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'skim');
    expect(runOn(db, d)!.done).toBe(true);
    expect(questRows(db).at(-1)!.quest!.debrief).toMatchObject({ tier: 'messy', rep: { before: 30, after: 32 } });
    expect(questRows(db).at(-1)!.quest!.debrief!.cover).toBeUndefined();
    expect(kit().cover.burner).toBe(1);
  });
});

describe('jobs: pressing on', () => {
  const PUSHES = `
# push-1
*The safe behind the desk is open.*

- crack: Empty the safe. → won-1 / lost-1 [check reflex 50]
- pocket: Take one bundle and go. → won-1

## won-1
*Folded notes.*
pay: +150
→ end

## lost-1
*Someone shouts.*
lost
→ end

# push-2
*A terminal still logged in.*

- copy: Copy the payroll. → won-2 / lost-2 [check tech 55]
- photo: Photograph the screen. → won-2 / lost-2 [check wits 50]

## won-2
*It copies.*
pay: +200
→ end

## lost-2
*The terminal screams.*
lost
→ end
`;
  const PUSHY = job(`${JOB.trimEnd()}\n${PUSHES}`);
  /** A clean run to the take (talk and grab pass), on a plain-door day. */
  async function toCard(o: Parameters<typeof relayWith>[0] = {}) {
    const d = plainDoor('easy');
    const book = o.book ?? [PUSHY];
    const r = relayWith({ clock: () => evening(d), rolls: [66, 66], ...o, book });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    await pick(r.relay, 'desk', 'grab');
    return { ...r, d, book, pay: runOn(r.db, d)!.pay! };
  }

  it("a clean end with push beats parks on !push with WALK and PRESS ON; WALK's line shows the paid sol and heat", async () => {
    const { db, events, backend, d, pay } = await toCard();
    const run = runOn(db, d)!;
    expect(run.done).toBe(false);
    expect(run.beat).toBe('!push');
    const active = states(events).at(-1)!.active!;
    expect(active.choices).toEqual([
      { id: '!walk', line: `WALK — ${pay} SOL · HEAT +0` },
      { id: '!press', line: 'PRESS ON' },
    ]);
    expect(active.push).toEqual({ stage: 0, pot: 0, walk: { sol: pay, heat: 0 } });
    expect(questRows(db).at(-1)!.text).toContain('*All of it.*');
    expect(backend.reqs).toHaveLength(1);
  });

  it("WALK finishes the job: debrief written, closing turn runs, sol is the job's pay", async () => {
    const { relay, db, backend, kit, d, pay } = await toCard();
    await pick(relay, '!push', '!walk');
    expect(runOn(db, d)!.done).toBe(true);
    expect(runOn(db, d)!.push!.state).toBe('walked');
    expect(questRows(db).at(-1)!.quest!.debrief).toMatchObject({ tier: 'clean', sol: pay });
    expect(kit().sol).toBe(pay);
    expect(lastUser(backend.reqs.at(-1)!)).toContain(MISSION_CLOSE);
  });

  it('PRESS ON plays push-1; a pass adds pay: +N to sol and returns to the card with stage 1', async () => {
    const { relay, db, events, kit, d, pay } = await toCard({ rolls: [66, 66, 6] });
    await pick(relay, '!push', '!press');
    expect(runOn(db, d)!.beat).toBe('push-1');
    expect(questRows(db).at(-1)!.text).toContain('*The safe behind the desk is open.*');
    await pick(relay, 'push-1', 'crack');
    expect(kit().sol).toBe(pay + 150);
    expect(runOn(db, d)!.push).toMatchObject({ stage: 1, pot: 150, state: 'offer' });
    expect(states(events).at(-1)!.active!.choices[0]).toEqual({ id: '!walk', line: `WALK — ${pay + 150} SOL · HEAT +0` });
  });

  it('a lost push: pot gone, pay halved, take one tier down, heat +1; the debrief tier follows', async () => {
    const { relay, db, kit, d, pay } = await toCard({ rolls: [66, 66, 6, 2], nerve: 2 });
    await pick(relay, '!push', '!press');
    await pick(relay, 'push-1', 'crack');
    await pick(relay, '!push', '!press');
    await pick(relay, 'push-2', 'copy');
    const run = runOn(db, d)!;
    expect(run.done).toBe(true);
    expect(run.take).toBe('part');
    expect(run.push).toMatchObject({ state: 'lost', log: [{ beat: 'push-1', choice: 'crack', result: 'won', sol: 150 }, { beat: 'push-2', choice: 'copy', result: 'lost', sol: 0 }] });
    expect(kit().sol).toBe(pay - Math.floor(pay / 2));
    expect(kit().heat.karasu).toBe(1);
    expect(questRows(db).at(-1)!.quest!.debrief).toMatchObject({ tier: 'messy' });
  });

  it('a push that fills ALARM goes to GET OUT; missed with a burner held, it parks on the cover cards', async () => {
    const { relay, db, events, d } = await toCard({ rolls: [66, 66, 2, 2], nerve: 1, burner: 1 });
    await pick(relay, '!push', '!press');
    db.setMeta(keyOn(d), JSON.stringify({ ...runOn(db, d)!, alarm: 3 }));
    await pick(relay, 'push-1', 'crack');
    expect(runOn(db, d)!.beat).toBe('getaway');
    await pick(relay, 'getaway', 'run');
    const run = runOn(db, d)!;
    expect(run.done).toBe(false);
    expect(run.pendingCover).toBeTruthy();
    expect(states(events).at(-1)!.active!.choices.map((c) => c.id)).toEqual(['!burner', '!take']);
  });

  it('no offer when the take is none, the job is blown, or ALARM is 3', async () => {
    const d = plainDoor('easy');
    const { relay, db } = relayWith({ clock: () => evening(d), rolls: [2], nerve: 1, book: [PUSHY] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    expect(runOn(db, d)!.done).toBe(true);
    expect(runOn(db, d)!.push).toBeUndefined();
  });

  it('after the last push beat a pass finishes the job with state won', async () => {
    const { relay, db, kit, d, pay } = await toCard({ rolls: [66, 66, 6, 6] });
    await pick(relay, '!push', '!press');
    await pick(relay, 'push-1', 'crack');
    await pick(relay, '!push', '!press');
    await pick(relay, 'push-2', 'copy');
    expect(runOn(db, d)!.done).toBe(true);
    expect(runOn(db, d)!.push!.state).toBe('won');
    expect(kit().sol).toBe(pay + 350);
  });

  it('PRESS ON: nothing at the offer; WALK shows and lands the heat once', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ book: [PUSHY], clock: () => evening(d), rolls: [66, 66] });
    await r.relay.startQuest('hicks', 'back-door');
    r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, alarm: 2 }));
    await pick(r.relay, 'door', 'talk');
    await pick(r.relay, 'desk', 'grab');
    expect(r.kit().heat.karasu ?? 0).toBe(0);
    expect(r.relay.questState('hicks').active!.choices[0].line).toContain('HEAT +2');
    await pick(r.relay, '!push', '!walk');
    expect(r.kit().heat.karasu).toBe(2);
  });
  it('a lost push lands it once, from the final ALARM', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ book: [PUSHY], clock: () => evening(d), rolls: [66, 66, 2], nerve: 3 });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    await pick(r.relay, 'desk', 'grab');
    await pick(r.relay, '!push', '!press');
    await pick(r.relay, 'push-1', 'crack');
    const run = runOn(r.db, d)!;
    expect(run.done).toBe(true);
    expect(r.kit().heat.karasu ?? 0).toBe(Math.max(run.blown ? 2 : 0, run.alarm ?? 0));
  });
  it('a missed push check deals its costs; TAKE IT applies the loss once', async () => {
    const { relay, db, events, kit, d, pay } = await toCard({ rolls: [66, 66, 2] });
    await pick(relay, '!push', '!press');
    await raw(relay, 'push-1', 'crack');
    expect(states(events).at(-1)!.active!.costs).toBeTruthy();
    dealAs(db, keyOn(d), ['alarm']);
    await raw(relay, 'push-1', '!take');
    expect(runOn(db, d)!.push!.state).toBe('lost');
    expect(kit().sol).toBe(pay - Math.floor(pay / 2));
    expect(kit().heat.karasu).toBe(1);
  });
  it('buildDebrief splits push picks into pushes with result and sol', async () => {
    const { relay, db } = await toCard({ rolls: [66, 66, 6, 2], nerve: 2 });
    await pick(relay, '!push', '!press');
    await pick(relay, 'push-1', 'crack');
    await pick(relay, '!push', '!press');
    await pick(relay, 'push-2', 'copy');
    const debrief = questRows(db).at(-1)!.quest!.debrief!;
    expect(debrief.checks.map((c) => c.line)).toEqual(['Talk your way in.', 'Take it all.']);
    expect(debrief.pushes).toEqual([
      { line: 'Empty the safe.', stat: 'REFLEX', dice: 2, position: 'open', faces: [6, 1], keep: 'high', kind: 'clean', result: 'won', sol: 150 },
      { line: 'Copy the payroll.', stat: 'TECH', dice: 3, position: 'dark', faces: [2, 1, 1], keep: 'high', kind: 'miss', result: 'lost', sol: 0 },
    ]);
    expect(debrief.push).toBe('lost');
  });

  it('missionSummary says each push line, with no digits', async () => {
    const said = async (o: Parameters<typeof toCard>[0], go: (relay: ChatRelay) => Promise<unknown>) => {
      const r = await toCard(o);
      await go(r.relay);
      return lastUser(r.backend.reqs.at(-1)!);
    };
    const walked = await said({}, (relay) => pick(relay, '!push', '!walk'));
    expect(walked).toContain('They could have pushed their luck; they walked away instead.');
    const won = await said({ rolls: [66, 66, 6] }, async (relay) => {
      await pick(relay, '!push', '!press');
      await pick(relay, 'push-1', 'crack');
      await pick(relay, '!push', '!walk');
    });
    expect(won).toContain('They pushed their luck and came out ahead.');
    const lost = await said({ rolls: [66, 66, 2], nerve: 1 }, async (relay) => {
      await pick(relay, '!push', '!press');
      await pick(relay, 'push-1', 'crack');
    });
    expect(lost).toContain('They pushed their luck and lost what they had gained.');
    for (const s of [walked, won, lost]) expect(s).not.toMatch(/\[mission summary[^\]]*\d/);
  });

  it('a lost push through a crack lockout costs heat +1 (review I1)', async () => {
    const cracky = job(`${JOB.trimEnd()}\n${PUSHES.replace('[check reflex 50]', '[crack 6]')}`);
    const { relay, kit } = await toCard({ book: [cracky] });
    await pick(relay, '!push', '!press');
    await pick(relay, 'push-1', 'crack', []);
    expect(kit().heat.karasu).toBe(1);
  });

  it('a lost push does not bring back a deck that died on its own check (review I2)', async () => {
    const grid = job(`${JOB.trimEnd()}\n${PUSHES.replace('[check reflex 50]', '[check tech 50 grid]')}`);
    const { relay, kit } = await toCard({ book: [grid], rolls: [66, 66, 2], nerve: 1 });
    expect(kit().deck).toBe('stall-build');
    await pick(relay, '!push', '!press');
    await pick(relay, 'push-1', 'crack');
    expect(kit().deck).toBeNull();
  });

  it('a lost push that blows the job pays nothing (review I3)', async () => {
    const atAlarm = await toCard({ rolls: [66, 66, 2, 2], nerve: 1 });
    await pick(atAlarm.relay, '!push', '!press');
    atAlarm.db.setMeta(keyOn(atAlarm.d), JSON.stringify({ ...runOn(atAlarm.db, atAlarm.d)!, alarm: 3 }));
    await pick(atAlarm.relay, 'push-1', 'crack');
    await pick(atAlarm.relay, 'getaway', 'run');
    expect(questRows(atAlarm.db).at(-1)!.quest!.debrief).toMatchObject({ tier: 'blown', sol: 0 });
    expect(atAlarm.kit().sol).toBe(0);
    // A part take (skim) dropped to none is blown too.
    const d = plainDoor('easy');
    const part = relayWith({ clock: () => evening(d), rolls: [6, 2], nerve: 1, book: [PUSHY] });
    await part.relay.startQuest('hicks', 'back-door');
    await pick(part.relay, 'door', 'talk');
    await pick(part.relay, 'desk', 'skim');
    await pick(part.relay, '!push', '!press');
    await pick(part.relay, 'push-1', 'crack');
    expect(questRows(part.db).at(-1)!.quest!.debrief).toMatchObject({ tier: 'blown', sol: 0 });
  });

  it('a push that gave a deck and a later lost push: no deck row, no deck line (final review I3)', async () => {
    const decky = job(`${JOB.trimEnd()}\n${PUSHES.replace('pay: +150\n→ end', 'pay: +150\ngives: deck pocket-deck\n→ end')}`);
    const { relay, db, backend } = await toCard({ book: [decky], rolls: [66, 66, 6, 2], nerve: 2 });
    await pick(relay, '!push', '!press');
    await pick(relay, 'push-1', 'crack');
    await pick(relay, '!push', '!press');
    await pick(relay, 'push-2', 'copy');
    expect(questRows(db).at(-1)!.quest!.debrief!.deck).toBeUndefined();
    const sent = lastUser(backend.reqs.at(-1)!);
    expect(sent).not.toContain('came away with');
    expect(sent).not.toContain('lost their deck');
  });


  it("her summary names a push's own choice when an earlier beat shares its id (final review M2)", async () => {
    const shared = job(`${JOB.trimEnd()}\n${PUSHES.replace('- crack: Empty the safe. → won-1 / lost-1', '- grab: Empty the safe. → won-1 / lost-1')}`);
    const { relay, backend } = await toCard({ book: [shared], rolls: [66, 66, 6] });
    await pick(relay, '!push', '!press');
    await pick(relay, 'push-1', 'grab');
    await pick(relay, '!push', '!walk');
    const sent = lastUser(backend.reqs.at(-1)!);
    expect(sent).toContain('- Empty the safe. — it worked');
    expect(sent.match(/- Take it all\./g)).toHaveLength(1);
  });

  it('run.push round-trips through parseRun', async () => {
    const { db, d } = await toCard();
    const run = runOn(db, d)!;
    expect(run.push).toEqual({ stage: 0, pot: 0, from: run.kit!.length, outcome: 'paid', state: 'offer', log: [] });
  });

  it('a run on !push whose file lost its push beat shows WALK only, and WALK still finishes', async () => {
    const { relay, db, book, d, pay } = await toCard();
    book[0] = BACK;
    const active = relay.questState('hicks').active!;
    expect(active.choices).toEqual([{ id: '!walk', line: `WALK — ${pay} SOL · HEAT +0` }]);
    await pick(relay, '!push', '!walk');
    expect(runOn(db, d)!.done).toBe(true);
  });
});

describe('jobs: old saves (the table spec §4)', () => {
  it('a run saved before the table (no TAKE, ALARM 3, a d100 pick, an EDGE spend) shows TAKE = picks so far, ALARM 3/4, NERVE one down, and finishes', async () => {
    const d = plainDoor('easy');
    const { relay, db, kit } = relayWith({ clock: () => evening(d), rolls: [66] });
    await relay.startQuest('hicks', 'back-door');
    const run = runOn(db, d)!;
    const old = { ...run, beat: 'desk', variant: 0, alarm: 3, picks: [{ beat: 'door', choice: 'talk', roll: { stat: 'COOL', chance: 74, rolls: [80, 30], pass: true } }], kit: [{ at: evening(d), edge: -1 }] };
    delete (old as Partial<typeof old>).takeFill;
    db.setMeta(keyOn(d), JSON.stringify(old));
    const active = relay.questState('hicks').active!;
    expect(active).toMatchObject({ take: { filled: 1, size: 4 }, alarm: 3, nerve: { left: 4, max: 5 } });
    await pick(relay, 'desk', 'grab');
    const done = runOn(db, d)!;
    expect(done.done).toBe(true);
    expect(kit().sol).toBe(Math.round(done.pay! / 10) * 10);
    expect(questRows(db).at(-1)!.quest!.debrief!.checks[0]).toMatchObject({ stat: 'COOL', chance: 74, rolls: [80, 30] });
  });
});

describe('jobs: a first pick that fills nothing', () => {
  it('still starts TAKE at 0, so the run never reads as an old save', async () => {
    const grid = job(JOB.replace('[check reflex 50]', '[check reflex 50 grid]'));
    const d = plainDoor('easy');
    const { relay, db } = relayWith({ clock: () => evening(d), rolls: [2], nerve: 1, book: [grid] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'wait');
    expect(runOn(db, d)!.takeFill).toBe(1);
    const crack = job(JOB.replace('- talk: Talk your way in. → inside / turned [check cool 50]', '- talk: Talk your way in. → inside / stuck [check cool 50]').replace('## inside', '## stuck\n*Stuck at the door.*\n→ desk\n\n## inside'));
    const r2 = relayWith({ clock: () => evening(d), rolls: [2], nerve: 1, book: [crack] });
    await r2.relay.startQuest('hicks', 'back-door');
    await pick(r2.relay, 'door', 'talk');
    expect(runOn(r2.db, d)!.takeFill).toBe(0);
  });
});

describe('jobs: NERVE (the table spec §3)', () => {
  const TWO_PUSHES = `
# push-1
*The safe is open.*

- crack: Empty the safe. → won-1 / lost-1 [check reflex 50]
- pocket: Take one bundle. → won-1

## won-1
*Notes.*
pay: +150
→ end

## lost-1
*A shout.*
lost
→ end

# push-2
*A terminal.*

- copy: Copy the payroll. → won-2 / lost-2 [check tech 55]
- photo: Photograph it. → won-2 / lost-2 [check wits 50]

## won-2
*Copied.*
pay: +200
→ end

## lost-2
*It screams.*
lost
→ end
`;
  const PUSHY = job(`${JOB.trimEnd()}\n${TWO_PUSHES}`);

  it("PRESS ON costs 1 nerve; when that leaves none, the next card isn't offered and the job ends", async () => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [66, 66, 6], nerve: 1, book: [PUSHY] });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    await pick(r.relay, 'desk', 'grab');
    expect(r.relay.questState('hicks').active!.choices.map((c) => c.id)).toEqual(['!walk', '!press']);
    await pick(r.relay, '!push', '!press');
    expect(r.kit().nerveLeft).toBe(0);
    await pick(r.relay, 'push-1', 'crack');
    expect(runOn(r.db, d)).toMatchObject({ done: true, push: { state: 'won', stage: 1 } });
  });

  it('the job in hand plays out at 0 nerve; afterwards jobs are locked: NERVE GONE — BACK AT 06:00; 06:00 clears it', async () => {
    const d = plainDoor('easy');
    let now = evening(d);
    const r = relayWith({ clock: () => now, rolls: [5, 2, 66], nerve: 1 });
    await r.relay.startQuest('hicks', 'back-door');
    await raw(r.relay, 'door', 'talk');
    dealAs(r.db, keyOn(d), ['alarm']);
    // RESIST on a 2 costs 2: it takes the last one.
    await resistEach(r.relay, 'door', ['alarm']);
    expect(r.kit()).toMatchObject({ nerveLeft: 0, nerveGone: true });
    await pick(r.relay, 'desk', 'grab');
    expect(runOn(r.db, d)!.done).toBe(true);
    const state = r.relay.questState('hicks');
    expect(state.nerveGone).toEqual({ back: '06:00' });
    expect(state.open.filter((q) => q.mission).every((q) => q.locked === 'NERVE GONE — BACK AT 06:00')).toBe(true);
    now = evening(d + 1);
    const next = r.relay.questState('hicks');
    expect(next.nerveGone).toBeUndefined();
    expect(next.open.some((q) => q.locked)).toBe(false);
  });
  it('startQuest refuses a job while the nerve is gone', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), nerve: 0 });
    expect(await r.relay.startQuest('hicks', 'back-door')).toBe('nerve gone — back at 06:00');
  });

  it("her summary hears the nerve spent and a getaway, in words", async () => {
    const d = plainDoor('easy');
    const steady = relayWith({ clock: () => evening(d), rolls: [5, 5, 66] });
    await steady.relay.startQuest('hicks', 'back-door');
    await raw(steady.relay, 'door', 'talk');
    dealAs(steady.db, keyOn(d), ['alarm']);
    await resistEach(steady.relay, 'door', ['alarm']);
    await pick(steady.relay, 'desk', 'grab');
    const said = lastUser(steady.backend.reqs.at(-1)!);
    expect(said).toContain('They kept their nerve.');
    expect(said).not.toMatch(/\[mission summary[^\]]*\d/);
    const out = relayWith({ clock: () => evening(d), rolls: [66, 2, 6], nerve: 1 });
    await out.relay.startQuest('hicks', 'back-door');
    await pick(out.relay, 'door', 'talk');
    out.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(out.db, d)!, alarm: 3 }));
    await raw(out.relay, 'desk', 'grab');
    dealAs(out.db, keyOn(d), ['alarm']);
    await raw(out.relay, 'desk', '!take');
    await pick(out.relay, 'getaway', 'run');
    expect(lastUser(out.backend.reqs.at(-1)!)).toContain('They had to get out fast.');
  });
});

describe('jobs: cracking', () => {
  const cracked = job(JOB.replace('- grab: Take it all. → paid / part [check reflex 50]', '- grab: Take it all. → paid / part [crack 6]'));
  async function atDesk(rolls: number[] = [6]) {
    const d = plainDoor('easy');
    const r = relayWith({ book: [cracked], clock: () => evening(d), rolls });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    return { ...r, d };
  }

  it('the crack card shows its letters and tries, and the terminal it opens', async () => {
    const { relay } = await atDesk();
    const active = relay.questState('hicks').active!;
    // TECH 7: +1 try; a stall build: a 4th bracket pair.
    expect(active.choices.find((c) => c.id === 'grab')!.crack).toEqual({ length: 6, tries: 5, take: 2 });
    expect(active.crack!.grab).toMatchObject({ length: 6, tries: 5, extraBracket: true, strikeOne: false, ghost: false, skin: 'slab', deck: 'Stall build' });
  });

  it('a corp terminal shows CORP whatever the deck; the deck still counts', async () => {
    const iced = job(JOB.replace('- grab: Take it all. → paid / part [check reflex 50]', '- grab: Take it all. → paid / part [crack 6 corp]'));
    const d = plainDoor('easy');
    const r = relayWith({ book: [iced], clock: () => evening(d), rolls: [6] });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    expect(r.relay.questState('hicks').active!.crack!.grab).toMatchObject({ skin: 'corp', deck: 'Stall build', extraBracket: true, strikeOne: false, ghost: false, tries: 5 });
  });

  it('no deck: green, and no deck named', () => {
    const tag = { kind: 'crack' as const, length: 6 as const, mods: [] };
    const words = parseWords(fs.readFileSync('world/gear/words.md', 'utf8')).byLength[6];
    const base = { seed: 's', words, stats: { ...DEFAULT_STATS } };
    expect(crackSetup({ ...base, tag, ctx: { flags: {}, trust: null, warmth: null, with: '', deck: null } })).toMatchObject({ skin: 'green', deck: null });
    expect(crackSetup({ ...base, tag: { ...tag, corp: true }, ctx: { flags: {}, trust: null, warmth: null, with: '', deck: null } })).toMatchObject({ skin: 'corp', deck: null });
  });

  it('a crack choice scores the sent moves from the seed: granted → pass outcome; locked → fail outcome and ALARM +1', async () => {
    const won = await atDesk();
    const t = makeTerminal(won.relay.questState('hicks').active!.crack!.grab);
    await pick(won.relay, 'desk', 'grab', [{ word: t.password }]);
    expect(questRows(won.db).at(-1)!.text).toContain('*All of it.*');
    expect(runOn(won.db, won.d)!.picks.at(-1)!.crack).toMatchObject({ state: 'granted' });
    expect(runOn(won.db, won.d)!.alarm).toBe(0);
    // TAKE (the table spec §2): the talk's 6 filled 2, a granted crack 2 more.
    expect(runOn(won.db, won.d)!.takeFill).toBe(4);

    const lost = await atDesk();
    const t2 = makeTerminal(lost.relay.questState('hicks').active!.crack!.grab);
    const wrong = t2.words.map((w) => w.word).filter((w) => w !== t2.password).slice(0, t2.tries);
    await pick(lost.relay, 'desk', 'grab', wrong.map((word) => ({ word })));
    expect(questRows(lost.db).at(-1)!.text).toContain('*Some of it.*');
    expect(runOn(lost.db, lost.d)!.picks.at(-1)!.crack).toMatchObject({ state: 'locked' });
    expect(runOn(lost.db, lost.d)!.alarm).toBe(1);
    expect(runOn(lost.db, lost.d)!.takeFill).toBe(2);
  });

  it('walking away (no moves) is a lockout', async () => {
    const { relay, db, d } = await atDesk();
    await pick(relay, 'desk', 'grab', []);
    expect(runOn(db, d)!.picks.at(-1)!.crack).toMatchObject({ state: 'locked' });
  });
});

describe('jobs: across time', () => {
  it('a job in progress survives the 06:00 repost', async () => {
    const d = plainDoor('easy');
    let clock = 360 + (d + 1) * 1440 - 20; // 05:40, still story day d
    expect(storyDay(clock)).toBe(d);
    const { relay, db } = relayWith({ clock: () => clock, rolls: [6] });
    await relay.startQuest('hicks', 'back-door');
    clock += 60;
    expect(storyDay(clock)).toBe(d + 1);
    expect(await pick(relay, 'door', 'talk')).toEqual({ ok: true, text: 'ok' });
    expect(runOn(db, d)!.beat).toBe('desk');
    expect(relay.questState('hicks').active!.beat).toBe('desk');
  });

  it('rewind replays draws and a crack', async () => {
    const d = plainDoor('easy');
    const cracked = job(JOB.replace('- grab: Take it all. → paid / part [check reflex 50]', '- grab: Take it all. → paid / part [crack 6]'));
    const { relay, db } = relayWith({ book: [cracked], clock: () => evening(d), rolls: [6, 6] });
    await relay.startQuest('hicks', 'back-door');
    const opening = db.recentMessages('hicks', 50).filter((m) => m.role === 'agent').at(-1)!;
    const draws = runOn(db, d)!.draws;
    await pick(relay, 'door', 'talk');
    const setup = relay.questState('hicks').active!.crack!.grab;
    const t = makeTerminal(setup);
    const moves = [{ word: t.words.find((w) => w.word !== t.password)!.word }, { word: t.password }];
    await pick(relay, 'desk', 'grab', moves);
    const first = runOn(db, d)!.picks.at(-1)!.crack;
    await relay.rewind('hicks', opening.id);
    expect(runOn(db, d)!.draws).toEqual(draws);
    expect(runOn(db, d)!.beat).toBe('door');
    await pick(relay, 'door', 'talk');
    expect(relay.questState('hicks').active!.crack!.grab).toEqual(setup);
    await pick(relay, 'desk', 'grab', moves);
    expect(runOn(db, d)!.picks.at(-1)!.crack).toEqual(first);
  });
});

describe('quests are unchanged', () => {
  it('Paper Trail still lists and plays as before', async () => {
    const { relay, db, backend } = relayWith({ book: [trail.entry] });
    expect(relay.questState('hicks').open.map((o) => o.id)).toEqual(['paper-trail']);
    await relay.startQuest('hicks', 'paper-trail');
    expect(parseRun(db.getMeta(questKey('hicks', 'paper-trail')))).not.toBeNull();
    await relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'hand' });
    expect(backend.reqs).toHaveLength(2);
    expect(lastUser(backend.reqs[1])).toContain(QUEST_INSTRUCTIONS);
  });
});

describe('jobs: the fixer', () => {
  it('questState.fixer lists the board\'s stock with states', () => {
    const { relay } = relayWith({ sol: 550 });
    expect(relay.questState('hicks').fixer).toEqual({
      place: 'haes-noodles',
      items: [
        { id: 'pocket-deck', name: 'Pocket deck', price: 600, tier: 1, quality: 1, state: 'short' },
        { id: 'burner', name: 'Burner', price: 500, tier: 2, state: 'ok' },
        { id: 'fall-guy', name: 'Fall guy', price: 1000, tier: 3, state: 'locked' },
      ],
    });
  });

  it('buy refuses locked and short with a reason string', () => {
    const { relay } = relayWith({ sol: 550 });
    expect(relay.buy('hicks', 'fall-guy')).toMatch(/TRUSTED/);
    expect(relay.buy('hicks', 'pocket-deck')).toMatch(/sol/);
    expect(relay.buy('hicks', 'chrome-thing')).toMatch(/doesn't sell/);
  });

  it('buying cover adds one; buying a deck carries it and keeps yours', () => {
    const { relay, kit } = relayWith({ sol: 2000 });
    expect(relay.buy('hicks', 'burner')).toEqual({ ok: true, text: 'ok' });
    expect(kit()).toMatchObject({ sol: 1500, cover: { burner: 1 } });
    expect(relay.buy('hicks', 'pocket-deck')).toEqual({ ok: true, text: 'ok' });
    expect(kit()).toMatchObject({ sol: 1500 - 600, deck: 'pocket-deck', owned: ['stall-build', 'pocket-deck'] });
    // A deck you have isn't sold twice.
    expect(relay.questState('hicks').fixer?.items[0]).toMatchObject({ id: 'pocket-deck', state: 'owned' });
    expect(relay.buy('hicks', 'pocket-deck')).toMatch(/already have/);
  });

  it('carry swaps to a deck you own; refuses one you don\'t, and mid-job; rewind undoes it', async () => {
    const { relay, db, kit, events } = relayWith({ sol: 2000 });
    relay.buy('hicks', 'pocket-deck');
    await relay.send('hicks', 'one');
    const before = db.recentMessages('hicks', 50).filter((m) => m.role === 'agent').at(-1)!;
    await relay.send('hicks', 'two');
    const emitted = events.length;
    expect(relay.carry('hicks', 'stall-build')).toEqual({ ok: true, text: 'ok' });
    expect(kit()).toMatchObject({ deck: 'stall-build', owned: ['stall-build', 'pocket-deck'] });
    expect(events.slice(emitted).map((e) => e.type)).toContain('kit_changed');
    // Saved as a swap (review I2): it carries only a deck you still own.
    expect(parseFixer(db.getMeta(fixerKey('hicks'))).at(-1)).toMatchObject({ deck: 'stall-build', carry: true });
    expect(relay.carry('hicks', 'meridian')).toMatch(/don't have/);
    await relay.rewind('hicks', before.id);
    expect(kit().deck).toBe('pocket-deck');
    await relay.startQuest('hicks', 'back-door');
    expect(relay.carry('hicks', 'stall-build')).toMatch(/job/);
  });

  it('rewind undoes a purchase', async () => {
    const { relay, db, kit } = relayWith({ sol: 2000 });
    await relay.send('hicks', 'one');
    const before = db.recentMessages('hicks', 50).filter((m) => m.role === 'agent').at(-1)!;
    await relay.send('hicks', 'two');
    relay.buy('hicks', 'burner');
    expect(kit().cover.burner).toBe(1);
    await relay.rewind('hicks', before.id);
    expect(kit()).toMatchObject({ sol: 2000, cover: { burner: 0 } });
  });
});

describe('review fixes (Task 7)', () => {
  const cracked = job(JOB.replace('- grab: Take it all. → paid / part [check reflex 50]', '- grab: Take it all. → paid / part [crack 6]'));

  it('I1: a crack pick with no moves is refused (the terminal opens first); [] is a walk-away', async () => {
    const d = plainDoor('easy');
    const { relay, db } = relayWith({ book: [cracked], clock: () => evening(d), rolls: [6] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    const rows = questRows(db).length;
    expect(await relay.chooseQuest('hicks', { id: 'back-door', beat: 'desk', choice: 'grab', said: 'I go for the terminal.' })).toMatch(/terminal/);
    expect(questRows(db)).toHaveLength(rows);
    expect(runOn(db, d)!.alarm).toBe(0);
  });

  it("I2: a job finished after 06:00 doesn't come back that day", async () => {
    const d = plainDoor('easy');
    let clock = 360 + (d + 1) * 1440 - 20;
    const { relay, db } = relayWith({ clock: () => clock, rolls: [6] });
    await relay.startQuest('hicks', 'back-door');
    clock += 60;
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'skim');
    expect(runOn(db, d)!.done).toBe(true);
    expect(relay.questState('hicks').open).toEqual([]);
    clock += 1440;
    expect(relay.questState('hicks').open.map((o) => o.id)).toEqual(['back-door']);
  });

  it("I3: the board reads your tier at 06:00, so rep gained tonight doesn't reshuffle it", () => {
    const d = 3;
    const book = [...['a-job', 'b-job', 'c-job', 'd-job'].map((id) => job(JOB.replace('tier: 2', 'tier: 1'), id)), ...['x-job', 'y-job'].map((id) => job(JOB, id))];
    const { relay, db } = relayWith({ book, rep: 15, clock: () => evening(d) });
    const before = relay.questState('hicks').open.map((o) => o.id);
    // A job done tonight lifted rep to 21 (KNOWN).
    db.setMeta(questKey('hicks', 'z-job@3'), JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags: {}, done: true, at: 1, kit: [{ at: evening(d) - 10, rep: { district: 'karasu', delta: 6 } }] }));
    expect(relay.questState('hicks').open.map((o) => o.id)).toEqual(before);
  });

  it('I4: the fixer sells nothing while a job is in progress', async () => {
    const { relay, kit } = relayWith({ sol: 2000 });
    await relay.startQuest('hicks', 'back-door');
    expect(relay.buy('hicks', 'burner')).toMatch(/job/);
    expect(kit().cover.burner).toBe(0);
  });
});

describe('take and blown carry through the run', () => {
  // A take or a blown line on an outcome partway through counts at the end (spec §3: take defaults to full only if nothing set it).
  const midway = job(
    JOB.replace("## inside\n*You're in.*\n→ desk", "## inside\n*You're in.*\ntake: part\n→ desk").replace('## paid\n*All of it.*\npay: full\ntake: full\n→ end', '## paid\n*All of it.*\npay: full\n→ end'),
  );
  it('a take: part partway makes a clean ending messy', async () => {
    const d = plainDoor('easy');
    const { relay, db } = relayWith({ book: [midway], clock: () => evening(d), rolls: [6, 6] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'grab');
    expect(questRows(db).at(-1)!.quest!.debrief!.tier).toBe('messy');
  });
  it('a blown line partway blows the job', async () => {
    const d = plainDoor('easy');
    const blownMid = job(JOB.replace("## inside\n*You're in.*\n→ desk", "## inside\n*You're in.*\nblown\n→ desk"));
    const { relay, db } = relayWith({ book: [blownMid], clock: () => evening(d), rolls: [6, 6] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'grab');
    expect(questRows(db).at(-1)!.quest!.debrief!.tier).toBe('blown');
  });
});

describe('final review fixes', () => {
  it("I1: a prep flag from last night's run doesn't buff tonight's", async () => {
    const prepped = job(JOB.replace(/→ inside \[clock \+1h\]/g, '→ inside [clock +1h, set cased=yes]').replace('[check reflex 50]', '[check reflex 50 · if cased +15 "you cased it"]'));
    const d = plainDoor('easy');
    let d2 = d + 1;
    while (drawsFor(prepped, keyOn(d2)).complication === 'caper-watching' || drawsFor(prepped, keyOn(d2)).door !== 'easy') d2++;
    let clock = evening(d);
    const { relay } = relayWith({ book: [prepped], clock: () => clock, rolls: [6] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'wait');
    expect(relay.questState('hicks').active!.choices.find((c) => c.id === 'grab')!.pool!.parts).toContainEqual({ label: 'YOU CASED IT', dice: 1 });
    await pick(relay, 'desk', 'skim');
    clock = evening(d2);
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    expect(relay.questState('hicks').active!.choices.find((c) => c.id === 'grab')!.pool!.parts).not.toContainEqual({ label: 'YOU CASED IT', dice: 1 });
  });

  it('I2: the take keeps the worst one seen (a later take: full or part never lifts a none)', async () => {
    const d = plainDoor('easy');
    const worst = job(JOB.replace("## inside\n*You're in.*\n→ desk", "## inside\n*You're in.*\ntake: none\n→ desk"));
    const { relay, db } = relayWith({ book: [worst], clock: () => evening(d), rolls: [6, 6] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'grab');
    expect(questRows(db).at(-1)!.quest!.debrief!.tier).toBe('blown');
  });

  it('I3: the cover cards come with the blowing pick: its text, its roll, and the debrief so far', async () => {
    const d = plainDoor('easy');
    const { relay } = relayWith({ book: [job(TIER_2_JOB)], clock: () => evening(d), rolls: [2], nerve: 1, burner: 1 });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    const blown = relay.questState('hicks').active!.blown!;
    expect(blown.text).toContain('*He turns you round.*');
    expect(blown.pick).toMatchObject({ choice: 'talk', roll: { kind: 'miss', pass: false } });
    expect(blown.debrief).toMatchObject({ tier: 'blown', rep: { district: 'karasu', before: 30, after: 18 } });
    expect(blown.debrief.cover).toBeUndefined();
  });

  it('a beat row she never answers is marked silent; the rows she answers are not', async () => {
    const d = plainDoor('easy');
    const { relay, db } = relayWith({ clock: () => evening(d), rolls: [6, 6] });
    await relay.startQuest('hicks', 'back-door');
    expect(questRows(db).at(-1)!.quest!.silent).toBeUndefined();
    await pick(relay, 'door', 'talk');
    expect(questRows(db).at(-1)!.quest!.silent).toBe(true);
    await pick(relay, 'desk', 'grab');
    expect(questRows(db).at(-1)!.quest!.silent).toBeUndefined();
  });

  it('time tokens read the row\'s story clock in the row and in her prompt', async () => {
    const d = plainDoor('easy');
    const timed = job(JOB.replace('*A steel door behind the stall. One man on it.*', '*A steel door behind the stall. One man on it. The buyer is due at {time +40m}.*'));
    const { relay, db, backend } = relayWith({ book: [timed], clock: () => evening(d) });
    await relay.startQuest('hicks', 'back-door');
    // The start row stands at 20:10 (the quest row's 10 minutes).
    expect(questRows(db).at(-1)!.text).toContain('due at 20:50.');
    expect(JSON.stringify(backend.reqs.at(-1)!.messages)).not.toContain('{time');
  });
});


describe('crew prep reaches tonight\'s jobs (crew spec §2)', () => {
  const plain = () => dayWhere((x) => x.complication !== 'caper-watching');
  const why = (pool: Pool | undefined) => (pool?.parts ?? []).map((p) => `${p.label} ${p.dice > 0 ? '+' : '−'}1d`);
  const grab = (relay: ChatRelay) => why(relay.questState('hicks').active!.choices.find((c) => c.id === 'grab')!.pool);
  const talk = (relay: ChatRelay) => why(relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!.pool);

  it('prep flags join the run', async () => {
    const d = plain();
    const { relay, db } = relayWith({ clock: () => evening(d), crew: { prep: { [`back-door@${d}`]: { cased: 'clean' } } } });
    await relay.startQuest('hicks', 'back-door');
    expect(runOn(db, d)!.flags.cased).toBe('clean');
  });

  it('default CASED +10 on the first checked pick only', async () => {
    const d = plain();
    const { relay } = relayWith({ clock: () => evening(d), rolls: [6], crew: { prep: { [`back-door@${d}`]: { cased: 'clean' } } } });
    await relay.startQuest('hicks', 'back-door');
    expect(talk(relay)).toContain('CASED +1d');
    await pick(relay, 'door', 'talk');
    expect(grab(relay)).not.toContain('CASED +1d');
  });

  it('no default when the job mentions cased, or when the case was messy', async () => {
    const d = plain();
    const mentioned = job(JOB.replace('[check reflex 50]', '[check reflex 50 · if cased +15 "you cased it"]'));
    const a = relayWith({ book: [mentioned], clock: () => evening(d), crew: { prep: { [`back-door@${d}`]: { cased: 'clean' } } } });
    await a.relay.startQuest('hicks', 'back-door');
    expect(talk(a.relay)).not.toContain('CASED +1d');
    const b = relayWith({ clock: () => evening(d), crew: { prep: { [`back-door@${d}`]: { cased: 'messy' } } } });
    await b.relay.startQuest('hicks', 'back-door');
    expect(talk(b.relay)).not.toContain('CASED +1d');
  });

  it('default RECORDS +10 on grid checks only', async () => {
    const d = plain();
    const gridJob = job(JOB.replace('[check reflex 50]', '[check tech 50 grid]'));
    const { relay } = relayWith({ book: [gridJob], clock: () => evening(d), rolls: [6], crew: { prep: { [`back-door@${d}`]: { records: 'clean' } } } });
    await relay.startQuest('hicks', 'back-door');
    expect(talk(relay)).not.toContain('RECORDS +1d');
    await pick(relay, 'door', 'wait');
    expect(grab(relay)).toContain('RECORDS +1d');
  });

  it('a scouted row carries the draws and pay the run will get; a cased row says so', async () => {
    const d = plain();
    const { relay, db } = relayWith({ clock: () => evening(d), crew: { scouted: [`back-door@${d}`], prep: { [`back-door@${d}`]: { cased: 'clean' } } } });
    const row = relay.questState('hicks').open.find((o) => o.id === 'back-door')!;
    expect(row.mission!.scouted).toEqual({ draws: drawsFor(BACK, keyOn(d)), pay: payFor(BACK, keyOn(d)) });
    expect(row.mission!.cased).toBe(true);
    await relay.startQuest('hicks', 'back-door');
    expect(runOn(db, d)!.draws).toEqual(row.mission!.scouted!.draws);
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

describe('a parked roll', () => {
  it("on a choice the file no longer has is dropped: the beat's cards show again (Task 3 review I1)", async () => {
    const d = plainDoor('easy');
    const r = relayWith({ book: [BACK], clock: () => evening(d) });
    await r.relay.startQuest('hicks', 'back-door');
    const pending = { beat: 'door', choice: 'gone', at: 0, roll: { stat: 'reflex', dice: 2, position: 'open', faces: [5, 1], keep: 'high', kind: 'cost', pass: true }, cost: { alarm: 1, heat: 0 } };
    r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, pending }));
    expect(r.relay.questState('hicks').active!.choices.map((c) => c.id)).toEqual(['talk', 'wait']);
  });
});

describe('jobOn (story moods spec §2)', () => {
  it('a run with ALARM 1 is a job on; none before it, none once it has ended', async () => {
    const d = plainDoor('easy');
    const loud = job(JOB.replace(/→ inside \[clock \+1h\]/g, '→ inside [clock +1h, alarm +1]'));
    const { relay } = relayWith({ book: [loud], clock: () => evening(d), rolls: [6, 6] });
    expect(relay.jobOn('hicks')).toBe(false);
    await relay.startQuest('hicks', 'back-door');
    expect(relay.jobOn('hicks')).toBe(false); // started, ALARM 0
    await pick(relay, 'door', 'wait');
    expect(relay.jobOn('hicks')).toBe(true);
    await pick(relay, 'desk', 'grab');
    expect(relay.jobOn('hicks')).toBe(false);
  });
});

describe('the live clock comes after the run is written (story moods minors)', () => {
  it('the pick that raises ALARM is a job on by the time the room checks', async () => {
    const d = plainDoor('easy');
    const loud = job(JOB.replace(/→ inside \[clock \+1h\]/g, '→ inside [clock +1h, alarm +1]'));
    const seen: boolean[] = [];
    const { relay } = relayWith({ book: [loud], clock: () => evening(d), onLiveClock: (r) => seen.push(r.jobOn('hicks')) });
    await relay.startQuest('hicks', 'back-door');
    seen.length = 0;
    await pick(relay, 'door', 'wait');
    expect(seen.at(-1)).toBe(true);
  });

  it("a turn's live clock waits for her reply to open, so the mood's line lands on it", async () => {
    const opened: (string | null)[] = [];
    const { relay } = relayWith({ onLiveClock: (r) => opened.push(r.activeMessageId) });
    await relay.send('hicks', 'hi');
    expect(opened.length).toBeGreaterThan(0);
    expect(opened[0]).not.toBeNull();
  });
});

/** A crew member for the hand's tests: ready unless told otherwise. */
function member(id: string, spec: CrewMember['recruit']['spec'], o: Partial<CrewMember> = {}, grade: CrewMember['recruit']['grade'] = 1): CrewMember {
  return {
    recruit: { id, name: `${id[0].toUpperCase()}${id.slice(1)} Vance`, face: null, origin: 'karasu', spec, grade, traits: [], hidden: null, pitch: '', wage: 40 },
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
const CREW = { members: [member('dez', 'runner'), member('koji', 'muscle'), member('moss', 'fence'), member('ash', 'runner', { state: 'out' })] };
const BACK1 = job(JOB.replace('tier: 2', 'tier: 1'));
const offerOf = (relay: ChatRelay) => relay.questState('hicks').open.find((o) => o.id === 'back-door')?.setup;

describe('the hand: the setup at GO IN', () => {
  it('offers ready crew; the favour is on hold (programs spec §2.4)', () => {
    const { relay } = relayWith({ crew: CREW });
    const offer = offerOf(relay)!;
    expect(offer.crew.map((c) => c.id)).toEqual(['dez', 'koji', 'moss']);
    expect(offer).toMatchObject({ district: 'karasu', tier: 'KNOWN', heat: 0, favour: 'ON HOLD' });
  });

  it('go in stores the setup; hard starts loud', async () => {
    const t = relayWith({ crew: CREW });
    const d = storyDay(t.relay["deps"].clockNow!() as number);
    expect(await t.relay.startQuest('hicks', 'back-door', { approach: 'quiet', people: ['dez', 'moss'], favour: false })).toMatchObject({ ok: true });
    expect(runOn(t.db, d)?.setup).toEqual({ approach: 'quiet', people: ['dez', 'moss'], favour: false, tier: 1, at: t.relay['deps'].clockNow!(), deck: { id: 'stall-build', quality: 2, slots: 2 } });
    expect(runOn(t.db, d)?.takeFill).toBeUndefined();
    const h = relayWith({ crew: CREW, book: [job(TIER_2_JOB)] });
    await h.relay.startQuest('hicks', 'back-door', { approach: 'hard', people: [], favour: false });
    expect(runOn(h.db, d)).toMatchObject({ takeFill: 1, alarm: 1 });
    // Tier 1: HARD starts loud but with no TAKE (balancing 2026-11-01).
    const one = relayWith({ crew: CREW, book: [BACK1] });
    await one.relay.startQuest('hicks', 'back-door', { approach: 'hard', people: [], favour: false });
    expect(runOn(one.db, d)!.alarm).toBe(1);
    expect(runOn(one.db, d)!.takeFill ?? 0).toBe(0);
  });

  it("refuses a brought recruit who isn't ready, more than 3, and the favour (on hold)", async () => {
    const t = relayWith({ crew: { members: [member('dez', 'runner', { state: 'out' }), member('koji', 'muscle', { busy: true })] } });
    const d = storyDay(t.relay["deps"].clockNow!() as number);
    expect(await t.relay.startQuest('hicks', 'back-door', { approach: 'quiet', people: ['dez'], favour: false })).toBe("DEZ ISN'T READY");
    expect(await t.relay.startQuest('hicks', 'back-door', { approach: 'quiet', people: ['koji'], favour: false })).toBe("KOJI ISN'T READY");
    expect(await t.relay.startQuest('hicks', 'back-door', { approach: 'quiet', people: ['nobody'], favour: false })).toBe("that recruit isn't ready");
    expect(runOn(t.db, d)).toBeNull();
    const many = relayWith({ crew: { members: ['a', 'b', 'c', 'd'].map((id) => member(id, 'runner')) } });
    expect(await many.relay.startQuest('hicks', 'back-door', { approach: 'quiet', people: ['a', 'b', 'c', 'd'], favour: false })).toBe('at most 3 people');
    const cold = relayWith({ crew: CREW, rep: 10, book: [BACK1] });
    expect(await cold.relay.startQuest('hicks', 'back-door', { approach: 'quiet', people: [], favour: true })).toBe('the favour is on hold');
  });

  it('no setup plays as before; story quests ignore one', async () => {
    const t = relayWith({ crew: CREW });
    const d = storyDay(t.relay["deps"].clockNow!() as number);
    await t.relay.startQuest('hicks', 'back-door');
    expect(runOn(t.db, d)?.setup).toBeUndefined();
    expect(runOn(t.db, d)?.beat).toBe('door');
    const s = relayWith({ crew: CREW, book: [trail.entry] });
    await s.relay.startQuest('hicks', 'paper-trail', { approach: 'hard', people: ['dez'], favour: true });
    const story = parseRun(s.db.getMeta(questKey('hicks', 'paper-trail')));
    expect(story).not.toBeNull();
    expect(story?.setup).toBeUndefined();
  });
});

describe('take-size (balancing 2026-11-01)', () => {
  it("a job's own take-size is its TAKE clock on the table", async () => {
    const d = plainDoor('easy');
    const t = relayWith({ clock: () => evening(d), book: [job(JOB.replace('tier: 2', 'tier: 1\ntake-size: 4'))] });
    await t.relay.startQuest('hicks', 'back-door');
    expect(t.relay.questState('hicks').active!.take).toEqual({ filled: 0, size: 4 });
  });
});

describe('the hand: calls at checks', () => {
  const crew = { members: [member('dez', 'runner'), member('mia', 'face', {}, 0), member('moss', 'fence'), member('koji', 'muscle')] };
  const go = async (setup: { approach?: 'quiet' | 'smooth' | 'hard'; people?: string[]; favour?: boolean } = {}, o: Parameters<typeof relayWith>[0] = {}) => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), crew, ...o });
    const { favour, ...rest } = setup;
    expect(await r.relay.startQuest('hicks', 'back-door', { approach: 'smooth', people: ['dez', 'mia', 'moss'], favour: false, ...rest })).toMatchObject({ ok: true });
    // The favour is on hold for new jobs (programs spec §2.4): one that brought it is a job from before.
    if (favour) asOld(r.db, storyDay(evening(d)), { favour: true });
    return { ...r, d };
  };
  const card = (relay: ChatRelay, beat: string, choice: string, c?: string, more: { push?: boolean } = {}) => relay.chooseQuest('hicks', { id: 'back-door', beat, choice, ...(c ? { card: c } : {}), ...more });
  const active = (relay: ChatRelay) => relay.questState('hicks').active!;

  it('a call lifts position on its stat, and is written with the pick', async () => {
    const t = await go({}, { rolls: [6] });
    expect(active(t.relay).choices.find((c) => c.id === 'talk')!.pool!.position).toBe('open');
    await card(t.relay, 'door', 'talk', 'mia');
    const run = runOn(t.db, t.d)!;
    expect((run.picks[0].roll as { position: string }).position).toBe('dark');
    expect(run.calls).toEqual([{ beat: 'door', choice: 'talk', card: 'mia', again: false, at: expect.any(Number) }]);
  });

  it('off its stat a call adds a die; SMOOTH adds one on cool', async () => {
    const t = await go({}, { rolls: [6] });
    const before = active(t.relay).choices.find((c) => c.id === 'talk')!.pool!;
    expect(before.parts).toContainEqual({ label: 'SMOOTH', dice: 1, kind: 'setup' });
    await card(t.relay, 'door', 'talk', 'dez');
    const roll = runOn(t.db, t.d)!.picks[0].roll as { dice: number; position: string };
    expect(roll).toMatchObject({ dice: before.dice + 1, position: 'open' });
  });

  it('plays match the roll', async () => {
    for (const c of ['dez', 'mia', 'favour'] as const) {
      const t = await go({ favour: true }, { rolls: [6] });
      const plays = active(t.relay).choices.find((x) => x.id === 'talk')!.plays!;
      expect(Object.keys(plays).sort()).toEqual(['dez', 'favour', 'mia']);
      await card(t.relay, 'door', 'talk', c);
      const roll = runOn(t.db, t.d)!.picks[0].roll as { dice: number; position: string; effect?: string };
      expect({ dice: roll.dice, position: roll.position, effect: roll.effect ?? 'fair' }).toEqual({ dice: plays[c].dice, position: plays[c].position, effect: plays[c].effect });
    }
  });

  it('the hand shows who came, free calls and the again risk', async () => {
    const t = await go({ favour: true }, { rolls: [6] });
    expect(active(t.relay).hand).toEqual({
      approach: 'smooth',
      people: [
        { id: 'dez', name: 'Dez Vance', spec: 'runner', grade: 1, toNext: 5, face: null, traits: [], free: 1, risk: null, down: false, abilities: [] },
        { id: 'mia', name: 'Mia Vance', spec: 'face', grade: 0, toNext: 5, face: null, traits: [], free: 1, risk: null, down: false, abilities: [] },
        { id: 'moss', name: 'Moss Vance', spec: 'fence', grade: 1, toNext: 5, face: null, traits: [], free: 0, risk: null, down: false, abilities: [] },
      ],
      favour: 'ready',
      contacts: [],
    });
    await card(t.relay, 'door', 'talk', 'mia');
    const h = active(t.relay).hand!;
    expect(h.people.find((p) => p.id === 'mia')).toMatchObject({ free: 0, risk: 2, down: false });
  });

  it('again risks a loss on a miss', async () => {
    // Days whose again-call on the desk draws a loss for mia (GREEN: 1 in 2), and one that doesn't.
    const days = (loss: boolean) => {
      for (let d = 0; d < 300; d++) {
        const x = drawsFor(BACK, keyOn(d));
        if (x.complication === 'caper-watching' || x.door !== 'easy') continue;
        if ((lossOnAgain({ seed: `${keyOn(d)}|desk|mia|again`, grade: 0, position: 'open', neverHeld: false }) !== null) === loss) return d;
      }
      throw new Error('no day');
    };
    for (const loss of [true, false]) {
      const d = days(loss);
      const r = relayWith({ clock: () => evening(d), crew, rolls: [6, 2] });
      await r.relay.startQuest('hicks', 'back-door', { approach: 'smooth', people: ['mia'], favour: false });
      await card(r.relay, 'door', 'talk', 'mia');
      await card(r.relay, 'desk', 'grab', 'mia');
      if (runOn(r.db, d)!.pending) await card(r.relay, 'desk', '!take');
      const calls = runOn(r.db, d)!.calls!;
      expect(calls.map((c) => c.again)).toEqual([false, true]);
      expect(calls[1].loss).toBe(loss ? 'hurt' : undefined);
    }
  });

  it("refuses cards that can't play", async () => {
    const t = await go({ people: ['dez', 'moss'] }, { rolls: [6] });
    expect(await card(t.relay, 'door', 'wait', 'dez')).toBe("cards only go on a roll");
    expect(await card(t.relay, 'door', 'talk', 'moss')).toBe("MOSS PLAYS AT THE END");
    expect(await card(t.relay, 'door', 'talk', 'koji')).toBe("that card isn't in your hand");
    expect(await card(t.relay, 'door', 'talk', 'favour')).toBe("that card isn't in your hand");
    expect(runOn(t.db, t.d)!.picks).toEqual([]);
    // A used favour; a recruit down from a call.
    const run = runOn(t.db, t.d)!;
    t.db.setMeta(keyOn(t.d), JSON.stringify({ ...run, setup: { ...run.setup!, favour: true }, calls: [{ beat: 'x', choice: 'y', card: 'favour', again: false, at: 1 }, { beat: 'x', choice: 'y', card: 'dez', again: true, at: 2, loss: 'hurt' }] }));
    expect(await card(t.relay, 'door', 'talk', 'favour')).toBe('the favour is spent');
    expect(await card(t.relay, 'door', 'talk', 'dez')).toBe("DEZ IS DOWN");
    expect(active(t.relay).hand!.people.find((p) => p.id === 'dez')!.down).toBe(true);
    expect(active(t.relay).choices.find((c) => c.id === 'talk')!.plays).toEqual({});
  });

  it('favour judged at go in: heat 7 later and it still plays', async () => {
    const t = await go({ favour: true }, { rolls: [6] });
    t.db.setMeta(fixerKey('hicks'), JSON.stringify([{ at: 0, heat: 7, district: 'karasu' }]));
    expect(await card(t.relay, 'door', 'talk', 'favour')).toMatchObject({ ok: true });
  });

  it('favour burns on blown: −5 rep on top; brought and not called costs nothing', async () => {
    const repDeltas = (db: Db, d: number) => (runOn(db, d)!.kit ?? []).flatMap((e) => (e.rep ? [e.rep.delta] : []));
    const called = await go({ favour: true }, { rolls: [1] });
    await card(called.relay, 'door', 'talk', 'favour');
    if (runOn(called.db, called.d)!.pending) await card(called.relay, 'door', '!take');
    const plain = await go({ favour: true }, { rolls: [1] });
    await card(plain.relay, 'door', 'talk');
    if (runOn(plain.db, plain.d)!.pending) await card(plain.relay, 'door', '!take');
    expect(runOn(called.db, called.d)!.done).toBe(true);
    expect(repDeltas(called.db, called.d)).toEqual([repDeltas(plain.db, plain.d)[0] - 5]);
  });

  it('a brought fence adds TAKE +1 at the end, and the end is stamped', async () => {
    const run = async (people: string[]) => {
      const t = await go({ people }, { rolls: [6] });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'desk', 'skim');
      return runOn(t.db, t.d)!;
    };
    const without = await run(['dez']);
    const fenced = await run(['moss']);
    expect(without.takeFill).toBe(3);
    expect(fenced.takeFill).toBe(4);
    expect(fenced.setup!.endAt).toEqual(expect.any(Number));
  });

  it('what she hears: a line per call and per loss, and who came in the summary, in words', async () => {
    const t = await go({ favour: true, people: ['mia', 'dez'] }, { rolls: [6, 6] });
    await card(t.relay, 'door', 'talk', 'mia');
    await card(t.relay, 'desk', 'grab', 'favour');
    const req = t.backend.reqs.at(-1)!;
    const all = req.messages.map((m) => m.content).join('\n');
    expect(all).toContain('(call: Mia (face) does the talking)');
    expect(all).toContain('(call: a friend in Karasu)');
    expect(all).not.toContain('⟦CALL⟧');
    const summary = /\[mission summary — [^\]]*\]/.exec(lastUser(req))![0];
    expect(summary).toContain('Mia and Dez went in with them.');
    expect(summary).not.toMatch(/\d/);
    // The player's row shows the call as a labelled line.
    expect(questRows(t.db).map((r) => r.text).join('\n')).toContain('⟦CALL⟧ Mia (face) does the talking.');
  });

  it('her opening line hears who came', async () => {
    const t = await go({ people: ['mia', 'dez'] });
    expect(lastUser(t.backend.reqs.at(-1)!)).toContain('Mia and Dez came with them.');
    const alone = await go({ people: [] });
    expect(lastUser(alone.backend.reqs.at(-1)!)).not.toContain('came with them');
  });

  it('a loss is said as one line, and in the summary', async () => {
    for (let d = 0; d < 300; d++) {
      const x = drawsFor(BACK, keyOn(d));
      if (x.complication === 'caper-watching' || x.door !== 'easy' || !lossOnAgain({ seed: `${keyOn(d)}|desk|mia|again`, grade: 0, position: 'open', neverHeld: false })) continue;
      const r = relayWith({ clock: () => evening(d), crew, rolls: [6, 2] });
      await r.relay.startQuest('hicks', 'back-door', { approach: 'smooth', people: ['mia'], favour: false });
      await card(r.relay, 'door', 'talk', 'mia');
      await card(r.relay, 'desk', 'grab', 'mia');
      if (runOn(r.db, d)!.pending) await card(r.relay, 'desk', '!take');
      const req = r.backend.reqs.at(-1)!;
      expect(req.messages.map((m) => m.content).join('\n')).toContain('(Mia got hurt)');
      expect(lastUser(req)).toContain("Mia didn't walk away clean.");
      return;
    }
    throw new Error('no day');
  });

  it('the debrief has a line for each recruit brought', async () => {
    const t = await go({ people: ['dez', 'moss'] }, { rolls: [6] });
    await card(t.relay, 'door', 'talk');
    await card(t.relay, 'desk', 'skim');
    expect(questRows(t.db).at(-1)!.quest!.debrief!.crew).toEqual(['DEZ · MESSY', 'MOSS · MESSY', 'MOSS FENCED IT · TAKE +1']);
    const none = await go({ people: [] }, { rolls: [6] });
    await card(none.relay, 'door', 'talk');
    await card(none.relay, 'desk', 'skim');
    expect(questRows(none.db).at(-1)!.quest!.debrief!.crew).toBeUndefined();
  });
});


describe('her memory of jobs (no job notes)', () => {
  it('after a job, her turns carry a jobs-with-you line in words; the closing line says not to note the job', async () => {
    const d = plainDoor('easy');
    const { relay, backend } = relayWith({ clock: () => evening(d), rolls: [66, 66] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'grab');
    await relay.send('hicks', 'Good night, then.', 'rp');
    const sent = lastUser(backend.reqs.at(-1)!);
    expect(sent).toContain('[done together: Back Door — went well, tonight]');
    expect(sent).not.toMatch(/done together:[^\]]*\d/);
  });

  it('nothing done together, no line', async () => {
    const { relay, backend } = relayWith();
    await relay.send('hicks', 'Evening.', 'rp');
    expect(lastUser(backend.reqs.at(-1)!)).not.toContain('done together');
  });
});

describe('once jobs', () => {
  it('a job marked once never posts again in the playthrough after it ended', async () => {
    const once = job(JOB.replace('tier: 2', 'tier: 1').replace('minutes: 30', 'minutes: 30\nonce: true'));
    expect(once.once).toBe(true);
    const d = plainDoor('easy');
    let now = evening(d);
    const { relay } = relayWith({ book: [once], clock: () => now, rolls: [66, 66] });
    expect(relay.questState('hicks').open[0].once).toBe(true);
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'grab');
    now = evening(d + 3);
    expect(relay.questState('hicks').open.map((o) => o.id)).toEqual([]);
    const again = relayWith({ book: [job(JOB.replace('tier: 2', 'tier: 1'))], clock: () => evening(d + 3) });
    expect(again.relay.questState('hicks').open.map((o) => o.id)).toEqual(['back-door']);
  });
});

describe('jobs: deck effects (deck effects spec 2026-10-30)', () => {
  const gridJob = (tier: 1 | 2 | 3, base = 50) => job(TIER_2_JOB.replace('tier: 2', `tier: ${tier}`).replace(/talk: Talk your way in\. → inside \/ turned \[check cool 50\]/g, `talk: Talk your way in. → inside / turned [check tech ${base} grid]`));
  const atDoor = async (o: Parameters<typeof relayWith>[0] & { tier?: 1 | 2 | 3; base?: number }) => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), book: [gridJob(o.tier ?? 2, o.base)], ...o });
    await r.relay.startQuest('hicks', 'back-door');
    return { ...r, d };
  };

  it('quality against the tier: Stall build (Q2) holds on tier 1 (its armour, once a job); neither on tier 2; outclassed on tier 3 (a SMALLER roll, no extra ALARM)', async () => {
    const even = await atDoor({ tier: 2, rolls: [5] });
    await raw(even.relay, 'door', 'talk');
    expect(even.relay.questState('hicks').active!.costs!.armour).toEqual({ ok: false, left: 0 });
    const t2 = await atDoor({ tier: 1, rolls: [5] });
    await raw(t2.relay, 'door', 'talk');
    expect(t2.relay.questState('hicks').active!.costs!.armour).toEqual({ ok: true, left: 1 });
    const t3 = await atDoor({ tier: 3, rep: 50, rolls: [2], nerve: 1 });
    await raw(t3.relay, 'door', 'talk');
    expect(runOn(t3.db, t3.d)!.pending).toMatchObject({ roll: { kind: 'miss', effect: 'small' } });
    expect(runOn(t3.db, t3.d)!.pending!).not.toHaveProperty('roll.deck');
  });
  it('the card shows how the deck matches the job', async () => {
    const { relay } = await atDoor({ tier: 1 });
    expect(relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!.pool!.deck).toEqual({ match: 'holds', broke: false, hidden: false, chrome: false });
  });

  it('hidden: no deck heat, and no HEAT dealt on the grid check', async () => {
    const { relay, db, d, kit } = await atDoor({ deck: 'quiet-deck', tier: 3, rep: 50, base: 40, rolls: [5] });
    await raw(relay, 'door', 'talk');
    expect((runOn(db, d)!.pending as DicePending).dealt!.map((c) => c.cost)).not.toContain('heat');
    dealAs(db, keyOn(d), ['alarm']);
    await raw(relay, 'door', '!take');
    expect(runOn(db, d)!.alarm).toBe(1);
    expect(kit().heat.karasu ?? 0).toBe(0);
  });
  it('breaker: a wire grid check rolls in the open', async () => {
    const { relay, db, d } = await atDoor({ deck: 'breaker-deck', base: 40, rolls: [2], nerve: 1 });
    await pick(relay, 'door', 'talk');
    expect(runOn(db, d)!.picks.at(-1)!.roll).toMatchObject({ position: 'open', kind: 'miss' });
  });
  it('chrome: RESIST on a grid check rolls one more die', async () => {
    const r = await atDoor({ deck: 'chrome-deck', tier: 3, rep: 50, rolls: [5], nerve: 1 });
    await raw(r.relay, 'door', 'talk');
    expect(r.relay.questState('hicks').active!.costs!.resist).toMatchObject({ dice: 3, ok: true });
  });
});

describe('contact cards (spec 2026-10-31-contact-cards)', () => {
  const contact = (id: string, name: string, spec: ContactCard['spec']): ContactCard => ({ id, name, accent: '#fff', portrait: null, spec });
  const CASS = contact('cass', 'Cass Okafor', 'fence');
  const HICKS = contact('hicks', 'Hicks', 'runner');
  const ROT = contact('mother-rot', 'Mother Rot', 'face');
  const crew = { members: [member('dez', 'runner'), member('moss', 'fence')] };
  const go = async (contacts: string[], o: Parameters<typeof relayWith>[0] & { people?: string[]; held?: ContactCard[] } = {}) => {
    let held = o.held ?? [CASS, HICKS, ROT, contact('nix-direct', 'Nix', 'ears')];
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), crew, contacts: () => held, ...o });
    // Contact cards are on hold for new jobs (programs spec §2.4): a job that brought them is one from before.
    const started = await r.relay.startQuest('hicks', 'back-door', { approach: 'smooth', people: o.people ?? [], favour: false });
    const cards = contacts.flatMap((id) => held.filter((c) => c.id === id));
    if (contacts.length) asOld(r.db, storyDay(evening(d)), { contacts: cards });
    return { ...r, d, started, rewindLeads: () => (held = []) };
  };
  const card = (relay: ChatRelay, beat: string, choice: string, c?: string) => relay.chooseQuest('hicks', { id: 'back-door', beat, choice, ...(c ? { card: c } : {}) });
  const active = (relay: ChatRelay) => relay.questState('hicks').active!;

  it('SETUP offers no contacts while they are on hold (programs spec §2.4)', () => {
    const { relay } = relayWith({ crew, contacts: () => [CASS, HICKS, contact('nix-direct', 'Nix', 'ears')] });
    expect(offerOf(relay)!.contacts).toEqual([]);
  });

  it('a job from before keeps its contact cards', async () => {
    const t = await go(['cass', 'hicks']);
    expect(t.started).toMatchObject({ ok: true });
    expect(runOn(t.db, t.d)!.setup!.contacts).toEqual([CASS, HICKS]);
  });

  it('old run keeps favour and contacts in the hand, with no POCKETS', async () => {
    const t = await go(['cass']);
    asOld(t.db, storyDay(evening(t.d)), { favour: true, contacts: [CASS] });
    const hand = t.relay.questState('hicks').active!.hand!;
    expect(hand.favour).toBe('ready');
    expect(hand.contacts.map((c) => c.id)).toEqual(['cass']);
    expect(hand.pockets).toBeUndefined();
  });

  it('a contact plays once, free; a fence plays at the end; one not brought is not in the hand', async () => {
    const t = await go(['hicks', 'cass'], { rolls: [6, 6] });
    expect(await card(t.relay, 'door', 'talk', 'contact:cass')).toBe('CASS PLAYS AT THE END');
    expect(await card(t.relay, 'door', 'talk', 'contact:mother-rot')).toBe("that card isn't in your hand");
    await card(t.relay, 'door', 'talk', 'contact:hicks');
    expect(runOn(t.db, t.d)!.calls).toEqual([{ beat: 'door', choice: 'talk', card: 'contact:hicks', again: false, at: expect.any(Number) }]);
    expect(await card(t.relay, 'desk', 'grab', 'contact:hicks')).toBe('HICKS IS SPENT');
  });

  it("plays to the trade: a face lifts a cool check, a wire adds a die to it", async () => {
    const lift = await go(['mother-rot'], { rolls: [6] });
    const plays = active(lift.relay).choices.find((c) => c.id === 'talk')!.plays!;
    const base = active(lift.relay).choices.find((c) => c.id === 'talk')!.pool!;
    expect(plays['contact:mother-rot']).toMatchObject({ dice: base.dice, position: 'dark', effect: 'fair', effectRaw: 1 });
    const die = await go(['hicks'], { rolls: [6] });
    expect(active(die.relay).choices.find((c) => c.id === 'talk')!.plays!['contact:hicks']).toMatchObject({ dice: base.dice + 1, position: base.position, effect: 'fair', effectRaw: 1 });
  });

  it('the hand shows contacts brought, used once played', async () => {
    const t = await go(['hicks', 'cass'], { rolls: [6] });
    expect(active(t.relay).hand!.contacts).toEqual([{ ...HICKS, used: false }, { ...CASS, used: false }]);
    await card(t.relay, 'door', 'talk', 'contact:hicks');
    expect(active(t.relay).hand!.contacts[0].used).toBe(true);
  });

  it('a rewound lead: SETUP no longer offers them, a running job keeps the card', async () => {
    const t = await go(['hicks'], { rolls: [6] });
    t.rewindLeads();
    expect(offerOf(t.relay)?.contacts ?? []).toEqual([]);
    expect(active(t.relay).hand!.contacts.map((c) => c.id)).toEqual(['hicks']);
    expect(await card(t.relay, 'door', 'talk', 'contact:hicks')).toMatchObject({ ok: true });
  });

  it('Cass fences at the end: TAKE +1, credited to her, in the debrief', async () => {
    const t = await go(['cass'], { rolls: [6] });
    await card(t.relay, 'door', 'talk');
    await card(t.relay, 'desk', 'skim');
    const run = runOn(t.db, t.d)!;
    expect(run.takeFill).toBe(4);
    expect(run.setup!.fencedBy).toBe('contact:cass');
    expect(questRows(t.db).at(-1)!.quest!.debrief!.crew).toEqual(['CASS FENCED IT · TAKE +1']);
  });

  it('a blown end pays nothing, so nobody fences it (review I1)', async () => {
    const t = await go(['cass'], { rolls: [1] });
    await card(t.relay, 'door', 'talk');
    if (runOn(t.db, t.d)!.pending) await card(t.relay, 'door', '!take');
    const run = runOn(t.db, t.d)!;
    expect(run.done).toBe(true);
    expect(run.setup!.fencedBy).toBeUndefined();
    expect(questRows(t.db).at(-1)!.quest!.debrief!.crew ?? []).not.toContain('CASS FENCED IT · TAKE +1');
  });

  it("fences don't stack: a fence recruit fences, Cass doesn't", async () => {
    const t = await go(['cass'], { rolls: [6], people: ['moss'] });
    await card(t.relay, 'door', 'talk');
    await card(t.relay, 'desk', 'skim');
    const run = runOn(t.db, t.d)!;
    expect(run.takeFill).toBe(4);
    expect(run.setup!.fencedBy).toBe('moss');
    expect(questRows(t.db).at(-1)!.quest!.debrief!.crew).toEqual(['MOSS · MESSY', 'MOSS FENCED IT · TAKE +1']);
  });

  it('a played contact: her line in the debrief, the call she hears, who came', async () => {
    const t = await go(['hicks'], { rolls: [6, 6] });
    await card(t.relay, 'door', 'talk', 'contact:hicks');
    await card(t.relay, 'desk', 'skim');
    expect(questRows(t.db).at(-1)!.quest!.debrief!.crew).toEqual(['HICKS TOOK THE WIRE']);
    const req = t.backend.reqs.at(-1)!;
    expect(req.messages.map((m) => m.content).join('\n')).toContain('(call: Hicks (runner) gets into the system)');
    expect(/\[mission summary — [^\]]*\]/.exec(lastUser(req))![0]).toContain('Hicks went in with them.');
  });
});

describe('crew abilities on the table (crew abilities spec §2)', () => {
  const slot = (ids: string[]) => ({ abilities: ids, slotted: ids });
  const crew = (o: Record<string, string[]> = {}, grades: Record<string, 0 | 1 | 2 | 3> = {}) => ({
    members: [member('dez', 'runner', slot(o.dez ?? []), grades.dez ?? 1), member('mia', 'face', slot(o.mia ?? []), grades.mia ?? 0), member('ash', 'runner', slot(o.ash ?? []), grades.ash ?? 3)],
  });
  const go = async (people: string[], c: ReturnType<typeof crew>, o: Parameters<typeof relayWith>[0] = {}, d = plainDoor('easy')) => {
    const r = relayWith({ clock: () => evening(d), crew: c, ...o });
    expect(await r.relay.startQuest('hicks', 'back-door', { approach: 'quiet', people, favour: false })).toMatchObject({ ok: true });
    return { ...r, d };
  };
  const card = (relay: ChatRelay, beat: string, choice: string, c?: string) => relay.chooseQuest('hicks', { id: 'back-door', beat, choice, ...(c ? { card: c } : {}) });
  const active = (relay: ChatRelay) => relay.questState('hicks').active!;

  it('GO IN snapshots the loadout', async () => {
    const t = await go(['dez', 'mia'], crew({ mia: ['steady-hand'] }));
    expect(runOn(t.db, t.d)!.setup!.abilities).toEqual({ dez: [], mia: ['steady-hand'] });
  });
  it('old run has no ability cards', async () => {
    const t = await go(['dez'], crew());
    expect(runOn(t.db, t.d)!.setup!.abilities).toBeUndefined();
    expect(active(t.relay).hand!.people[0].abilities).toEqual([]);
  });
  it('the hand lists each ability: timing, words, its NERVE', async () => {
    const t = await go(['dez'], crew({ dez: ['cool-head', 'log-wipe'] }));
    expect(active(t.relay).hand!.people[0].abilities).toEqual([
      { id: 'cool-head', label: 'Cool Head', kind: 'cross', timing: 'roll', words: 'COOL CHECKS ONE POSITION BETTER', nerve: 1, afford: true, used: false, playable: false },
      { id: 'log-wipe', label: 'Log Wipe', kind: 'alarm', timing: 'after', words: 'ALARM −1 AFTER A ROLL', nerve: 1, afford: true, used: false, playable: false },
    ]);
    expect(Object.keys(active(t.relay).choices.find((c) => c.id === 'talk')!.plays!)).toContain('dez/cool-head');
  });
  it('ON A ROLL: Cool Head lifts a cool check, and is written as an ability call', async () => {
    const t = await go(['dez'], crew({ dez: ['cool-head'] }), { rolls: [6] });
    expect(await card(t.relay, 'door', 'talk', 'dez/cool-head')).toMatchObject({ ok: true });
    const run = runOn(t.db, t.d)!;
    expect((run.picks[0].roll as { position: string }).position).toBe('dark');
    expect(run.calls).toEqual([{ beat: 'door', choice: 'talk', card: 'dez', ability: 'cool-head', again: false, at: expect.any(Number) }]);
    // Their own call is still free.
    expect(active(t.relay).hand!.people[0]).toMatchObject({ free: 1, risk: null });
  });
  it('an ability that does nothing on this check is refused', async () => {
    const t = await go(['dez'], crew({ dez: ['cool-head', 'log-wipe', 'quick-sale'] }), { rolls: [6] });
    await card(t.relay, 'door', 'talk');
    expect(await card(t.relay, 'desk', 'grab', 'dez/cool-head')).toBe('that card does nothing here');
    expect(await card(t.relay, 'desk', 'grab', 'dez/log-wipe')).toBe("that one goes on a roll that's landed");
    expect(await card(t.relay, 'desk', 'grab', 'dez/quick-sale')).toBe('DEZ PLAYS IT AT THE END');
    expect(await card(t.relay, 'desk', 'grab', 'dez/nope')).toBe("that card isn't in your hand");
  });
  it('a saved miss on GET OUT lands no heat of its own: ALARM 4 leaves 4', async () => {
    const t = await go(['ash'], crew({ ash: ['clean-exit'] }), { rolls: [2], nerve: 1 });
    t.db.setMeta(keyOn(t.d), JSON.stringify({ ...runOn(t.db, t.d)!, alarm: 4, getaway: true, beat: 'getaway', variant: 0 }));
    await raw(t.relay, 'getaway', 'run');
    expect(runOn(t.db, t.d)!.pending).toBeTruthy();
    await raw(t.relay, 'getaway', '!after', 'ash/clean-exit');
    await raw(t.relay, 'getaway', '!take');
    expect(runOn(t.db, t.d)!.done).toBe(true);
    expect(t.kit().heat.karasu).toBe(4);
  });
  it('a miss parks for SAVE even with NERVE short; SAVE makes it a 4–5 and TAKE IT lands the pass', async () => {
    const t = await go(['ash'], crew({ ash: ['clean-exit'] }), { rolls: [2], nerve: 1 });
    await card(t.relay, 'door', 'talk');
    expect(runOn(t.db, t.d)!.pending).toBeTruthy();
    expect(active(t.relay).hand!.people[0].abilities[0]).toMatchObject({ id: 'clean-exit', playable: true });
    expect(await card(t.relay, 'door', '!after', 'ash/clean-exit')).toMatchObject({ ok: true });
    const parked = runOn(t.db, t.d)!.pending as { roll: { saved?: true; pass: boolean; kind: string }; cost: { alarm: number; heat: number } };
    expect(parked.roll).toMatchObject({ saved: true, pass: true, kind: 'cost' });
    // A dealt roll's costs are its deal (roll lifecycle review C1): no fixed cost comes back.
    expect(parked.cost).toEqual({ alarm: 0, heat: 0 });
    await card(t.relay, 'door', '!take');
    const run = runOn(t.db, t.d)!;
    expect(run.beat).toBe('desk');
    expect(run.calls).toEqual([{ beat: 'door', choice: 'talk', card: 'ash', ability: 'clean-exit', again: false, at: expect.any(Number) }]);
    expect(run.takeFill).toBe(1);
  });
  it('LOG WIPE cancels a picked ALARM +1 on the parked roll', async () => {
    const alarmAfter = async (press: boolean) => {
      const t = await go(['dez'], crew({ dez: ['log-wipe'] }), { rolls: [4] });
      await card(t.relay, 'door', 'talk');
      dealAs(t.db, keyOn(t.d), ['alarm']);
      await card(t.relay, 'door', '!cost', 'alarm');
      if (press) expect(await card(t.relay, 'door', '!after', 'dez/log-wipe')).toMatchObject({ ok: true });
      else await card(t.relay, 'door', '!take', 'alarm');
      return runOn(t.db, t.d)!.alarm ?? 0;
    };
    expect(await alarmAfter(false)).toBe(1);
    expect(await alarmAfter(true)).toBe(0);
  });
  it('SECOND WIND gives a NERVE back; refused at full', async () => {
    const t = await go(['dez'], crew({ dez: ['second-wind'] }), { rolls: [4] });
    await card(t.relay, 'door', 'talk');
    expect(await card(t.relay, 'door', '!after', 'dez/second-wind')).toBe('NERVE is full');
    const s = await go(['dez'], crew({ dez: ['second-wind'] }), { rolls: [4], nerve: 3 });
    await card(s.relay, 'door', 'talk');
    const before = s.kit().nerveLeft;
    expect(await card(s.relay, 'door', '!after', 'dez/second-wind')).toMatchObject({ ok: true });
    expect(s.kit().nerveLeft).toBe(before + 1);
  });
  it("review: NERVE +1 can't lift NERVE GONE after the roll's own spend", async () => {
    const t = await go(['dez'], crew({ dez: ['log-wipe', 'second-wind'] }), { rolls: [4], nerve: 2 });
    await t.relay.chooseQuest('hicks', { id: 'back-door', beat: 'door', choice: 'talk', push: true });
    expect(t.kit().nerveGone).toBe(true);
    expect(await card(t.relay, 'door', '!after', 'dez/second-wind')).toBe('NERVE GONE');
    expect(active(t.relay).hand!.people[0].abilities.find((a) => a.id === 'second-wind')!.playable).toBe(false);
  });
  it('a NERVE +2 trade plays at 0 and lifts NERVE GONE; ALARM +1 comes with it', async () => {
    const t = await go(['dez'], crew({ dez: ['wind'] }), { rolls: [2], nerve: 2 });
    await t.relay.chooseQuest('hicks', { id: 'back-door', beat: 'door', choice: 'talk', push: true });
    expect(t.kit().nerveGone).toBe(true);
    expect(active(t.relay).hand!.people[0].abilities.find((a) => a.id === 'wind')!.playable).toBe(true);
    expect(await card(t.relay, 'door', '!after', 'dez/wind')).toMatchObject({ ok: true });
    expect(t.kit()).toMatchObject({ nerveGone: false, nerveLeft: 2 });
    expect((runOn(t.db, t.d)!.pending as { cost: { alarm: number } }).cost.alarm).toBe(1);
  });
  it('review: the NERVE +1 is stamped at the roll, not before it', async () => {
    const t = await go(['dez'], crew({ dez: ['second-wind'] }), { rolls: [4], nerve: 3 });
    await card(t.relay, 'door', 'talk');
    await card(t.relay, 'door', '!after', 'dez/second-wind');
    const run = runOn(t.db, t.d)!;
    expect(run.kit!.at(-1)!.at).toBe((run.pending as { at?: number }).at);
  });
  it('NERVE +1 on a dealt roll at low NERVE; a roll that costs nothing does not park for it', async () => {
    const t = await go(['dez'], crew({ dez: ['second-wind'] }), { rolls: [2], nerve: 1 });
    await card(t.relay, 'door', 'talk');
    expect(active(t.relay).costs).toBeTruthy();
    expect(await card(t.relay, 'door', '!after', 'dez/second-wind')).toMatchObject({ ok: true });
    const clean = await go(['dez'], crew({ dez: ['second-wind'] }), { rolls: [6], nerve: 1 });
    await card(clean.relay, 'door', 'talk');
    expect(runOn(clean.db, clean.d)!.pending ?? null).toBeNull();
  });
  describe('a press beside a call (ability pass spec §1)', () => {
    const both = (relay: ChatRelay, beat: string, choice: string, c: string | undefined, press: string) => relay.chooseQuest('hicks', { id: 'back-door', beat, choice, ...(c ? { card: c } : {}), press });
    const roll = (t: { db: Parameters<typeof runOn>[0]; d: Parameters<typeof runOn>[1] }, i = 0) => runOn(t.db, t.d)!.picks[i].roll as { dice: number; position: string; effect?: string };
    it('a call and another recruit\'s press stack on one roll, both written', async () => {
      const plain = await go(['dez'], crew(), { rolls: [6] });
      await card(plain.relay, 'door', 'talk');
      const t = await go(['dez', 'mia'], crew({ mia: ['steady-hand'] }), { rolls: [6] });
      expect(await both(t.relay, 'door', 'talk', 'dez', 'mia/steady-hand')).toMatchObject({ ok: true });
      expect(roll(t).dice).toBeGreaterThan(roll(plain).dice);
      expect(runOn(t.db, t.d)!.calls!.map((c) => [c.card, c.ability])).toEqual([['dez', undefined], ['mia', 'steady-hand']]);
    });
    it('one recruit acts once a roll', async () => {
      const t = await go(['dez'], crew({ dez: ['steady-hand'] }), { rolls: [6] });
      const before = t.db.getMeta(keyOn(t.d));
      expect(await both(t.relay, 'door', 'talk', 'dez', 'dez/steady-hand')).toBe('DEZ ACTS ONCE A ROLL');
      expect(t.db.getMeta(keyOn(t.d))).toBe(before);
    });
    it('two presses on one roll are refused', async () => {
      const t = await go(['dez', 'mia'], crew({ dez: ['steady-hand'], mia: ['spoof'] }), { rolls: [6] });
      expect(await both(t.relay, 'door', 'talk', 'dez/steady-hand', 'mia/spoof')).toBe('one press a roll');
    });
    it('a press goes with a roll, not after it, and only an ability is a press', async () => {
      const t = await go(['dez', 'mia'], crew({ dez: ['log-wipe'] }), { rolls: [6] });
      expect(await both(t.relay, 'door', 'talk', undefined, 'dez/log-wipe')).toBe("that one goes on a roll that's landed");
      expect(await both(t.relay, 'door', 'talk', undefined, 'mia')).toBe('one press a roll');
    });
    it('NERVE short for the press: refused, nothing spent', async () => {
      const t = await go(['dez', 'mia'], crew({ mia: ['steady-hand'] }), { rolls: [6], nerve: 2 });
      const left = t.kit().nerveLeft;
      expect(left).toBe(2);
      const push = await t.relay.chooseQuest('hicks', { id: 'back-door', beat: 'door', choice: 'talk', push: true, press: 'mia/steady-hand' });
      expect(push).toBe('not enough nerve');
      expect(t.kit().nerveLeft).toBe(left);
    });
    it('each ability plays once per job', async () => {
      const t = await go(['dez'], crew({ dez: ['steady-hand'] }), { rolls: [6] });
      await card(t.relay, 'door', 'talk', 'dez/steady-hand');
      expect(active(t.relay).hand!.people[0].abilities[0].used).toBe(true);
      expect(await card(t.relay, 'desk', 'grab', 'dez/steady-hand')).toBe('DEZ HAS PLAYED THAT');
    });
    it('greed-effect: a step more, and ALARM +1 lands with the roll', async () => {
      const t = await go(['dez'], crew({ dez: ['roofs'] }), { rolls: [6] });
      await card(t.relay, 'door', 'talk', 'dez/roofs');
      expect(roll(t).effect).toBe('big');
      expect(runOn(t.db, t.d)!.alarm).toBe(1);
      expect(runOn(t.db, t.d)!.takeFill).toBe(3);
    });
    it('greed-die: a miss also loses 1 TAKE, a pass doesn\'t', async () => {
      const start = async (rolls: number[]) => {
        const t = await go(['dez'], crew({ dez: ['spoof'] }), { rolls: [6, ...rolls] });
        await card(t.relay, 'door', 'talk');
        const fill = runOn(t.db, t.d)!.takeFill!;
        await card(t.relay, 'desk', 'grab', 'dez/spoof');
        return { t, fill };
      };
      const pass = await start([6]);
      expect(runOn(pass.t.db, pass.t.d)!.takeFill).toBeGreaterThan(pass.fill);
      const miss = await start([2]);
      const p = runOn(miss.t.db, miss.t.d)!.pending as { dealt?: { cost: string }[]; roll: { missTake?: true } } | null;
      expect(p?.roll.missTake).toBe(true);
      dealAs(miss.t.db, keyOn(miss.t.d), ['alarm', 'worse']);
      await card(miss.t.relay, 'desk', '!cost', 'alarm');
      await card(miss.t.relay, 'desk', '!take', 'alarm');
      if (runOn(miss.t.db, miss.t.d)!.pending) {
        await card(miss.t.relay, 'desk', '!cost', 'worse');
        await card(miss.t.relay, 'desk', '!take', 'worse');
      }
      expect(runOn(miss.t.db, miss.t.d)!.takeFill).toBe(miss.fill - 1);
    });
    it('a step of effect with nothing to move is refused, and not offered', async () => {
      const t = await go(['dez'], crew({ dez: ['roofs'] }), { rolls: [6] });
      t.db.setMeta(keyOn(t.d), JSON.stringify({ ...runOn(t.db, t.d)!, alarm: 4, getaway: true, beat: 'getaway', variant: 0 }));
      expect(await raw(t.relay, 'getaway', 'run', 'dez/roofs')).toBe('NOTHING TO TAKE HERE');
      expect(Object.keys(active(t.relay).choices.find((c) => c.id === 'run')!.plays ?? {})).not.toContain('dez/roofs');
    });
    it('setup-position: −1d now, the next checked card a position better, then it\'s gone', async () => {
      const t = await go(['dez'], crew({ dez: ['look'] }), { rolls: [6, 6] });
      const baseline = active(t.relay).choices.find((c) => c.id === 'talk')!.pool!.dice;
      await card(t.relay, 'door', 'talk', 'dez/look');
      expect(roll(t).dice).toBe(baseline - 1);
      expect(runOn(t.db, t.d)!.next).toEqual({ better: true });
      const shown = active(t.relay).choices.find((c) => c.id === 'grab')!.pool!;
      await card(t.relay, 'desk', 'grab');
      expect(roll(t, 1).position).toBe(shown.position);
      expect(runOn(t.db, t.d)!.next).toBeUndefined();
    });
    it('setup-die: a step smaller now, +1d next', async () => {
      const t = await go(['dez'], crew({ dez: ['story'] }), { rolls: [6, 6] });
      await card(t.relay, 'door', 'talk', 'dez/story');
      expect(roll(t).effect).toBe('small');
      expect(runOn(t.db, t.d)!.next).toEqual({ die: true });
      expect(active(t.relay).choices.find((c) => c.id === 'grab')!.pool!.parts).toContainEqual({ label: 'SET UP', dice: 1 });
    });
    it('a setup on the job\'s last roll is lost', async () => {
      const t = await go(['dez'], crew({ dez: ['story'] }), { rolls: [6, 6] });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'desk', 'grab', 'dez/story');
      expect(runOn(t.db, t.d)!.done).toBe(true);
    });
    it('a HAND\'s press lifts tier 2\'s cut, a GREEN\'s doesn\'t', async () => {
      const effect = async (who: string) => {
        const t = await go([who], crew({ dez: ['steady-hand'], mia: ['steady-hand'] }), { rolls: [6], book: [job(TIER_2_JOB)], rep: 20 });
        await card(t.relay, 'door', 'talk', `${who}/steady-hand`);
        return roll(t).effect;
      };
      expect(await effect('dez')).toBeUndefined();
      expect(await effect('mia')).toBe('small');
    });
    it('a setup is used up by the next pick, rolled or not', async () => {
      const t = await go(['dez'], crew(), { rolls: [6, 6] });
      t.db.setMeta(keyOn(t.d), JSON.stringify({ ...runOn(t.db, t.d)!, next: { better: true, die: true } }));
      await card(t.relay, 'door', 'talk');
      expect(runOn(t.db, t.d)!.next).toBeUndefined();
    });
    it('a press shows beside each call on the card', async () => {
      const t = await go(['dez', 'mia'], crew({ mia: ['steady-hand'] }));
      const plays = active(t.relay).choices.find((c) => c.id === 'talk')!.plays!;
      expect(plays.dez.presses!['mia/steady-hand'].dice).toBe(plays.dez.dice + 1);
      expect(plays.mia.presses).toBeUndefined();
    });
  });
  describe('trouble has a shape (approach shapes spec §1)', () => {
    type T = { db: Parameters<typeof runOn>[0]; d: Parameters<typeof runOn>[1] };
    const as = (t: T, approach: 'quiet' | 'smooth' | 'hard') => {
      const run = runOn(t.db, t.d)!;
      t.db.setMeta(keyOn(t.d), JSON.stringify({ ...run, setup: { ...run.setup!, approach } }));
    };
    const waiting = (t: T) => runOn(t.db, t.d)!.pending as DicePending;
    const firsts = (relay: ChatRelay) => active(relay).costs!.dealt.filter((c) => c.first).map((c) => c.cost);

    it('a deal leaves out the approach\'s never cost and leads with its first', async () => {
      const t = await go([], crew(), { rolls: [4] });
      as(t, 'smooth');
      await card(t.relay, 'door', 'talk');
      const dealt = waiting(t).dealt!.map((d) => d.cost);
      expect(dealt).not.toContain('small');
      expect(dealt[0]).toBe('worse');
    });
    it('HARD is never dealt ALARM', async () => {
      const t = await go([], crew(), { rolls: [4] });
      as(t, 'hard');
      await card(t.relay, 'door', 'talk');
      expect(waiting(t).dealt!.map((d) => d.cost)).not.toContain('alarm');
    });
    it('the first pick is refused on another card, then the second is free', async () => {
      const t = await go([], crew(), { rolls: [4] });
      await card(t.relay, 'door', 'talk');
      dealAs(t.db, keyOn(t.d), ['worse', 'alarm', 'small'], 2);
      expect(await card(t.relay, 'door', '!cost', 'worse')).toBe('pick ALARM +1 first');
      expect(await card(t.relay, 'door', '!cost', 'alarm')).toMatchObject({ ok: true });
      expect(await card(t.relay, 'door', '!cost', 'small')).toMatchObject({ ok: true });
    });
    it('the view marks the first card until it is picked', async () => {
      const t = await go([], crew(), { rolls: [4] });
      await card(t.relay, 'door', 'talk');
      dealAs(t.db, keyOn(t.d), ['worse', 'alarm'], 2);
      expect(firsts(t.relay)).toEqual(['alarm']);
      await card(t.relay, 'door', '!cost', 'alarm');
      expect(firsts(t.relay)).toEqual([]);
    });
    it('a first cost that was not dealt leaves the pick free', async () => {
      const t = await go([], crew(), { rolls: [4] });
      as(t, 'hard');
      await card(t.relay, 'door', 'talk');
      dealAs(t.db, keyOn(t.d), ['small', 'worse'], 1);
      expect(firsts(t.relay)).toEqual([]);
      expect(await card(t.relay, 'door', '!cost', 'worse')).toMatchObject({ ok: true });
    });
    it('an AFTER A ROLL ability still plays before the forced card, not after', async () => {
      const before = await go(['dez'], crew({ dez: ['door-hold'] }), { rolls: [4], gamble: 2 });
      await card(before.relay, 'door', 'talk');
      dealAs(before.db, keyOn(before.d), ['alarm', 'worse'], 1);
      expect(await card(before.relay, 'door', '!after', 'dez/door-hold')).toMatchObject({ ok: true });
      const late = await go(['dez'], crew({ dez: ['door-hold'] }), { rolls: [4], gamble: 2 });
      await card(late.relay, 'door', 'talk');
      dealAs(late.db, keyOn(late.d), ['alarm', 'worse'], 1);
      await card(late.relay, 'door', '!cost', 'alarm');
      expect(await card(late.relay, 'door', '!after', 'dez/door-hold')).toBe('before you pick a cost');
    });
    it('Stand Firm cancels the forced pick', async () => {
      const t = await go(['dez'], crew({ dez: ['firm'] }, { dez: 3 }), { rolls: [4] });
      as(t, 'hard');
      await card(t.relay, 'door', 'talk', 'dez/firm');
      dealAs(t.db, keyOn(t.d), ['take', 'worse'], 2);
      expect(await card(t.relay, 'door', '!cost', 'worse')).toBe('pick TAKE −1 first');
      await card(t.relay, 'door', '!cost', 'take');
      expect(waiting(t).settled).toEqual([{ cost: 'take', how: 'ability' }]);
    });
    it('a rerun redeals in shape, and the first pick still stands', async () => {
      const t = await go(['dez'], crew({ dez: ['twice'] }, { dez: 2 }), { rolls: [2], rerun: [4] });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'door', '!after', 'dez/twice');
      const dealt = waiting(t).dealt!.map((d) => d.cost);
      expect(dealt[0]).toBe('alarm');
      expect(dealt).not.toContain('take');
      expect(await card(t.relay, 'door', '!cost', dealt[1])).toBe('pick ALARM +1 first');
    });
    it('a bare TAKE IT takes the first cost', async () => {
      const t = await go([], crew(), { rolls: [2] });
      await card(t.relay, 'door', 'talk');
      expect(waiting(t).dealt![0].cost).toBe('alarm');
      await card(t.relay, 'door', '!take');
      expect(runOn(t.db, t.d)!.alarm ?? 0).toBeGreaterThan(0);
    });
    it('Take the Hit takes the deal from the first cost', async () => {
      const t = await go(['dez'], crew({ dez: ['hit'] }, { dez: 2 }), { rolls: [2] });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'door', '!after', 'dez/hit');
      expect(runOn(t.db, t.d)!.alarm ?? 0).toBe(0);
    });
    it('an ability on a picked ALARM has nothing to act on with HARD', async () => {
      const t = await go(['dez'], crew({ dez: ['log-wipe'] }), { rolls: [4] });
      as(t, 'hard');
      await card(t.relay, 'door', 'talk');
      dealAs(t.db, keyOn(t.d), ['take', 'worse'], 1);
      expect(await card(t.relay, 'door', '!after', 'dez/log-wipe')).toBe('pick ALARM +1 first');
    });
    it('a forced ALARM can be RESISTed', async () => {
      const t = await go([], crew(), { rolls: [4] });
      await card(t.relay, 'door', 'talk');
      dealAs(t.db, keyOn(t.d), ['alarm', 'worse'], 1);
      await card(t.relay, 'door', '!cost', 'alarm');
      await card(t.relay, 'door', '!resist', 'alarm');
      expect(runOn(t.db, t.d)!.alarm ?? 0).toBe(0);
    });
  });
  describe('gambles, trades and the end (ability pass spec §2)', () => {
    const park = (t: { db: Parameters<typeof runOn>[0]; d: Parameters<typeof runOn>[1] }) => runOn(t.db, t.d)!.pending as DicePending;
    const set = (t: { db: Parameters<typeof runOn>[0]; d: Parameters<typeof runOn>[1] }, patch: Record<string, unknown>) => t.db.setMeta(keyOn(t.d), JSON.stringify({ ...runOn(t.db, t.d)!, ...patch }));
    it('gamble-cost, a 4+: a clean 6, costs gone, TAKE IT lands the 6', async () => {
      const t = await go(['dez'], crew({ dez: ['door-hold'] }), { rolls: [4], gamble: 5 });
      await card(t.relay, 'door', 'talk');
      expect(active(t.relay).hand!.people[0].abilities[0]).toMatchObject({ playable: true });
      const before = t.kit().nerveLeft;
      expect(await card(t.relay, 'door', '!after', 'dez/door-hold')).toMatchObject({ ok: true });
      expect(t.kit().nerveLeft).toBe(before - 1);
      expect(park(t)).toMatchObject({ roll: { kind: 'clean', pass: true, gamble: { die: 5, from: 'cost' } } });
      expect(park(t).dealt).toBeUndefined();
      // Nothing left to pay: the way on doesn't say a cost lands.
      expect(active(t.relay).choices).toEqual([{ id: '!take', line: 'CARRY ON' }]);
      await card(t.relay, 'door', '!take');
      expect(runOn(t.db, t.d)!).toMatchObject({ beat: 'desk', takeFill: 2 });
      expect(rollLine(runOn(t.db, t.d)!.picks[0].roll as DiceRoll)).toContain('GAMBLE 5');
    });
    it('gamble-cost, a 1–3: still a 4–5, one more cost to pick, the pass plays', async () => {
      const t = await go(['dez'], crew({ dez: ['door-hold'] }), { rolls: [4], gamble: 2 });
      await card(t.relay, 'door', 'talk');
      dealAs(t.db, keyOn(t.d), ['alarm', 'worse', 'small'], 1);
      await card(t.relay, 'door', '!after', 'dez/door-hold');
      expect(park(t)).toMatchObject({ pick: 2, roll: { kind: 'cost', pass: true, gamble: { die: 2, from: 'cost' } } });
      for (const c of ['alarm', 'worse']) await card(t.relay, 'door', '!cost', c);
      await card(t.relay, 'door', '!take');
      expect(runOn(t.db, t.d)!).toMatchObject({ beat: 'desk', takeFill: 1 });
    });
    it('gamble-cost isn\'t offered where a win gains nothing: a free 4–5 with TAKE full', async () => {
      const t = await go(['dez'], crew({ dez: ['door-hold'] }), { rolls: [4] });
      set(t, { next: { better: true }, takeFill: 4 });
      await card(t.relay, 'door', 'talk');
      expect(runOn(t.db, t.d)!.pending ?? null).toBeNull();
      // With costs to pick it still buys their way out.
      const v = await go(['dez', 'mia'], crew({ dez: ['door-hold'], mia: ['clean-exit'] }), { rolls: [4] });
      set(v, { takeFill: 4 });
      await card(v.relay, 'door', 'talk');
      expect(active(v.relay).hand!.people[0].abilities[0].playable).toBe(true);
    });
    it('a parked free 4–5 with TAKE full refuses the gamble', async () => {
      const t = await go(['dez'], crew({ dez: ['door-hold'] }), { rolls: [4] });
      await card(t.relay, 'door', 'talk');
      const p = park(t);
      set(t, { takeFill: 4, pending: { ...p, pick: 0, dealt: undefined, settled: undefined, roll: { ...p.roll, position: 'dark' } } });
      expect(active(t.relay).hand!.people[0].abilities[0].playable).toBe(false);
      expect(await card(t.relay, 'door', '!after', 'dez/door-hold')).toBe('NOTHING TO GAIN');
    });
    it('gamble-cost lost on a 4–5 with no costs: one is dealt', async () => {
      const t = await go(['dez'], crew({ dez: ['door-hold'] }), { rolls: [4], gamble: 1 });
      set(t, { next: { better: true } });
      await card(t.relay, 'door', 'talk');
      expect(park(t).dealt).toBeUndefined();
      await card(t.relay, 'door', '!after', 'dez/door-hold');
      expect(park(t).pick).toBe(1);
      expect(park(t).dealt!.length).toBeGreaterThan(0);
    });
    it('no gamble on a red card: it isn\'t offered, and a roll doesn\'t wait for one', async () => {
      const red = job(TIER_2_JOB.replace('tier: 2', 'tier: 1\ntake-size: 4').replace(/\[check cool 50\]/g, '[check cool 50 red]'));
      const t = await go(['dez'], crew({ dez: ['word'] }), { rolls: [2], book: [red] });
      await card(t.relay, 'door', 'talk');
      expect(active(t.relay).hand!.people[0].abilities[0].playable).toBe(false);
      expect(await card(t.relay, 'door', '!after', 'dez/word')).toBe('ONE SHOT');
    });
    it('rewind plays it again: the same die and deal', async () => {
      const deal = async () => {
        const t = await go(['dez'], crew({ dez: ['door-hold'] }), { rolls: [4] });
        await card(t.relay, 'door', 'talk');
        await card(t.relay, 'door', '!after', 'dez/door-hold');
        return { roll: park(t).roll, dealt: park(t).dealt?.map((d) => d.cost) };
      };
      expect(await deal()).toEqual(await deal());
    });
    it('gamble-miss, a 4+: a 4–5, and the pass plays', async () => {
      const t = await go(['dez'], crew({ dez: ['word'] }), { rolls: [2], gamble: 6 });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'door', '!after', 'dez/word');
      expect(park(t)).toMatchObject({ roll: { kind: 'cost', pass: true, gamble: { die: 6, from: 'miss' } } });
      for (const c of (park(t).dealt ?? []).slice(0, park(t).pick).map((d) => d.cost)) await card(t.relay, 'door', '!cost', c);
      await card(t.relay, 'door', '!take');
      expect(runOn(t.db, t.d)!.beat).toBe('desk');
      expect(runOn(t.db, t.d)!.takeFill).toBe(1);
    });
    it('gamble-miss, a 1–3: one more cost to pick', async () => {
      const t = await go(['dez'], crew({ dez: ['word'] }), { rolls: [2], gamble: 1 });
      await card(t.relay, 'door', 'talk');
      dealAs(t.db, keyOn(t.d), ['alarm', 'worse', 'small'], 1);
      const pick0 = park(t).pick!;
      await card(t.relay, 'door', '!after', 'dez/word');
      expect(park(t)).toMatchObject({ pick: pick0 + 1, roll: { kind: 'miss', gamble: { die: 1, from: 'miss' } } });
    });
    it('a saved roll gambled is the new result, not the save: review I1', async () => {
      const t = await go(['ash', 'dez'], crew({ ash: ['clean-exit'], dez: ['door-hold'] }), { rolls: [2], gamble: 5 });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'door', '!after', 'ash/clean-exit');
      await card(t.relay, 'door', '!after', 'dez/door-hold');
      expect(park(t).roll.saved).toBeUndefined();
      await card(t.relay, 'door', '!take');
      expect(runOn(t.db, t.d)!.takeFill).toBe(2);
    });
    it('a route\'s own ALARM counts: trade-alarm can clear what the pick will land', async () => {
      const tagged = job(TIER_2_JOB.replace('tier: 2', 'tier: 1\ntake-size: 4').replace(/talk: Talk your way in\. → inside \/ turned \[check cool 50\]/g, 'talk: Talk your way in. → inside / turned [check cool 50, alarm +1]'));
      const t = await go(['dez'], crew({ dez: ['wipe'] }), { rolls: [2], book: [tagged] });
      set(t, { takeFill: 2 });
      await card(t.relay, 'door', 'talk');
      expect(active(t.relay).hand!.people[0].abilities[0].playable).toBe(true);
    });
    it('a gamble goes on its own result, before a cost is picked', async () => {
      const t = await go(['dez'], crew({ dez: ['door-hold'] }), { rolls: [2] });
      await card(t.relay, 'door', 'talk');
      expect(await card(t.relay, 'door', '!after', 'dez/door-hold')).toBe('that does nothing on this roll');
      const u = await go(['dez'], crew({ dez: ['word'] }), { rolls: [2] });
      await card(u.relay, 'door', 'talk');
      await card(u.relay, 'door', '!cost', park(u).dealt![0].cost);
      expect(await card(u.relay, 'door', '!after', 'dez/word')).toBe('before you pick a cost');
      expect(active(u.relay).hand!.people[0].abilities[0].playable).toBe(false);
    });
    it('a gamble on a 4–5 with no costs parks for it', async () => {
      const t = await go(['dez'], crew({ dez: ['door-hold'] }), { rolls: [4] }, plainDoor('easy'));
      t.db.setMeta(keyOn(t.d), JSON.stringify({ ...runOn(t.db, t.d)!, next: { better: true } }));
      await card(t.relay, 'door', 'talk');
      expect(park(t).roll.position).toBe('dark');
      expect(park(t).dealt).toBeUndefined();
      await card(t.relay, 'door', '!after', 'dez/door-hold');
      expect(park(t).roll.gamble).toBeTruthy();
    });
    it('the recruit who called this roll can\'t act after it; another can', async () => {
      const t = await go(['dez', 'mia'], crew({ dez: ['word'], mia: ['word'] }), { rolls: [2] });
      await card(t.relay, 'door', 'talk', 'dez');
      expect(await card(t.relay, 'door', '!after', 'dez/word')).toBe('DEZ ACTS ONCE A ROLL');
      expect(active(t.relay).hand!.people[0].abilities[0].playable).toBe(false);
      expect(await card(t.relay, 'door', '!after', 'mia/word')).toMatchObject({ ok: true });
    });
    it('trade-alarm: ALARM −1 and TAKE −1 as it lands', async () => {
      const t = await go(['dez'], crew({ dez: ['wipe'] }), { rolls: [4] });
      // SMOOTH: its first cost is a next-roll one, so the ALARM this test counts stays out of the picks.
      set(t, { alarm: 1, takeFill: 2, setup: { ...runOn(t.db, t.d)!.setup!, approach: 'smooth' } });
      await card(t.relay, 'door', 'talk');
      expect(await card(t.relay, 'door', '!after', 'dez/wipe')).toMatchObject({ ok: true });
      for (const c of (park(t).dealt ?? []).filter((d) => d.cost === 'worse' || d.cost === 'small').slice(0, 1)) await card(t.relay, 'door', '!cost', c.cost);
      await card(t.relay, 'door', '!take');
      const run = runOn(t.db, t.d)!;
      expect(run.pending ?? null).toBeNull();
      expect(run.alarm).toBe(0);
      expect(run.takeFill).toBe(2);
    });
    it('trade-alarm: not at ALARM 0 or at TAKE 0', async () => {
      const t = await go(['dez'], crew({ dez: ['wipe'] }), { rolls: [2] });
      await card(t.relay, 'door', 'talk');
      expect(active(t.relay).hand!.people[0].abilities[0].playable).toBe(false);
      expect(await card(t.relay, 'door', '!after', 'dez/wipe')).toBe('NO ALARM TO CLEAR');
      const u = await go(['dez'], crew({ dez: ['wipe'] }), { rolls: [2] });
      set(u, { alarm: 1, takeFill: 0 });
      await card(u.relay, 'door', 'talk');
      expect(active(u.relay).hand!.people[0].abilities[0].playable).toBe(false);
      expect(await card(u.relay, 'door', '!after', 'dez/wipe')).toBe('NO TAKE TO TRADE');
    });
    it('trade-alarm: not where the roll fills no TAKE', async () => {
      const t = await go(['dez'], crew({ dez: ['wipe', 'word'] }), { rolls: [2] });
      set(t, { alarm: 4, takeFill: 2, getaway: true, beat: 'getaway', variant: 0 });
      await raw(t.relay, 'getaway', 'run');
      expect(await raw(t.relay, 'getaway', '!after', 'dez/wipe')).toBe('NOTHING TO TAKE HERE');
    });
    it('a clean roll parks for trade-alarm only from ALARM 2', async () => {
      const t = await go(['dez'], crew({ dez: ['wipe'] }), { rolls: [6] });
      set(t, { alarm: 1, takeFill: 1 });
      await card(t.relay, 'door', 'talk');
      expect(runOn(t.db, t.d)!.pending ?? null).toBeNull();
      const u = await go(['dez'], crew({ dez: ['wipe'] }), { rolls: [6] });
      set(u, { alarm: 2, takeFill: 1 });
      await card(u.relay, 'door', 'talk');
      expect(runOn(u.db, u.d)!.pending).toBeTruthy();
    });
    it('trade-nerve: free, NERVE +2 and ALARM +1', async () => {
      const t = await go(['dez'], crew({ dez: ['wind'] }), { rolls: [2], nerve: 1 });
      await card(t.relay, 'door', 'talk');
      const before = t.kit().nerveLeft;
      expect(await card(t.relay, 'door', '!after', 'dez/wind')).toMatchObject({ ok: true });
      expect(t.kit().nerveLeft).toBe(before + 2);
      expect(park(t).cost.alarm).toBe(1);
    });
    it('trade-nerve: stops at full, refused full or at ALARM\'s max', async () => {
      const t = await go(['dez'], crew({ dez: ['wind'] }), { rolls: [2] });
      await card(t.relay, 'door', 'talk');
      expect(await card(t.relay, 'door', '!after', 'dez/wind')).toBe('NERVE is full');
      const u = await go(['dez'], crew({ dez: ['wind', 'word'] }), { rolls: [2], nerve: 2 });
      set(u, { alarm: 4 });
      await card(u.relay, 'door', 'talk');
      expect(active(u.relay).hand!.people[0].abilities[0].playable).toBe(false);
      expect(await card(u.relay, 'door', '!after', 'dez/wind')).toBe('ALARM IS FULL');
    });
    const finish = async (ability: string, patch: Record<string, unknown>, o: Parameters<typeof relayWith>[0] = {}) => {
      const t = await go(['moss'], { members: [member('moss', 'muscle', slot([ability]), 0)] } as ReturnType<typeof crew>, { rolls: [6, 6], ...o });
      await card(t.relay, 'door', 'talk');
      set(t, patch);
      await card(t.relay, 'desk', 'grab');
      return t;
    };
    it('end-take: TAKE +1 and HEAT +1 while TAKE isn\'t full', async () => {
      const full = await finish('sale', { takeFill: 3 });
      const short = await finish('sale', { takeFill: 0 });
      expect(runOn(full.db, full.d)!.setup!.ended ?? []).toEqual([]);
      expect(short.kit().heat.karasu ?? 0).toBe((full.kit().heat.karasu ?? 0) + 1);
      expect(runOn(short.db, short.d)!.takeFill).toBe(3);
      expect(runOn(short.db, short.d)!.setup!.ended).toEqual(['moss/sale']);
    });
    it('end-cool: HEAT −2 and pay −20 %, only with heat to cool', async () => {
      const cold = await finish('thin', {});
      const hot = await finish('thin', { alarm: 1 }, { heat: 3 });
      expect(runOn(cold.db, cold.d)!.setup!.ended ?? []).toEqual([]);
      expect(runOn(hot.db, hot.d)!.setup!.ended).toEqual(['moss/thin']);
      expect(hot.kit().heat.karasu).toBe(2);
      expect(hot.kit().sol).toBeLessThan(cold.kit().sol);
      expect(hot.kit().sol - 0).toBeGreaterThan(0);
    });
    it('a job lost after the WALK card leaves its blown heat whole', () => {
      const run = { picks: [], alarm: 0, setup: { endHeat: -2 } } as unknown as QuestRun;
      expect(heatLeft(run, true)).toBe(2);
      expect(heatLeft(run, false)).toBe(-2);
    });
    it('neither plays on a blown job or a GET OUT', async () => {
      for (const ability of ['sale', 'thin']) {
        const t = await go(['moss'], { members: [member('moss', 'muscle', slot([ability]), 0)] } as ReturnType<typeof crew>, { rolls: [6], heat: 3 });
        set(t, { alarm: 4, getaway: true, beat: 'getaway', variant: 0 });
        await raw(t.relay, 'getaway', 'run');
        expect(runOn(t.db, t.d)!.done).toBe(true);
        expect(runOn(t.db, t.d)!.setup!.ended ?? []).toEqual([]);
      }
    });
  });
  it('after press on a landed roll is refused, nothing written', async () => {
    const t = await go(['dez'], crew({ dez: ['log-wipe'] }), { rolls: [6] });
    const before = t.db.getMeta(keyOn(t.d));
    expect(await card(t.relay, 'door', '!after', 'dez/log-wipe')).toBe("that one goes on a roll that's landed");
    expect(t.db.getMeta(keyOn(t.d))).toBe(before);
  });
  it('the same ability twice on one park is refused', async () => {
    const t = await go(['dez'], crew({ dez: ['log-wipe'] }), { rolls: [2] });
    await card(t.relay, 'door', 'talk');
    dealAs(t.db, keyOn(t.d), ['alarm', 'heat']);
    await card(t.relay, 'door', '!cost', 'alarm');
    await card(t.relay, 'door', '!after', 'dez/log-wipe');
    expect(await card(t.relay, 'door', '!after', 'dez/log-wipe')).toBe('DEZ HAS PLAYED THAT');
  });
  it('an ability loss downs the stack', async () => {
    const t = await go(['dez'], crew({ dez: ['cool-head', 'log-wipe'] }), { rolls: [6] });
    const run = runOn(t.db, t.d)!;
    t.db.setMeta(keyOn(t.d), JSON.stringify({ ...run, calls: [{ beat: 'x', choice: 'y', card: 'dez', ability: 'cool-head', again: true, at: 2, loss: 'hurt' }] }));
    expect(await card(t.relay, 'door', 'talk', 'dez')).toBe('DEZ IS DOWN');
    expect(await card(t.relay, 'door', 'talk', 'dez/cool-head')).toBe('DEZ IS DOWN');
    expect(active(t.relay).hand!.people[0].down).toBe(true);
    expect(active(t.relay).choices.find((c) => c.id === 'talk')!.plays).toEqual({});
  });
  it('QUICK SALE adds TAKE at the end, said in the debrief', async () => {
    const play = async (ids: string[]) => {
      const t = await go(['mia'], crew({ mia: ids }), { rolls: [6] });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'desk', 'skim');
      return { run: runOn(t.db, t.d)!, t };
    };
    expect((await play([])).run.takeFill).toBe(3);
    const { run, t } = await play(['quick-sale']);
    expect(run.takeFill).toBe(4);
    expect(run.setup!.ended).toEqual(['mia/quick-sale']);
    const debrief = t.db.recentMessages('hicks', 20).flatMap((m) => (m.quest?.debrief ? [m.quest.debrief as { crew?: string[] }] : [])).at(-1)!;
    expect(debrief.crew!.some((l) => l.startsWith('MIA · QUICK SALE'))).toBe(true);
  });
  it('SMOOTH IT OVER takes a heat off a MESSY end', async () => {
    const t = await go(['mia'], crew({ mia: ['smooth'] }), { rolls: [6] });
    await card(t.relay, 'door', 'talk');
    await card(t.relay, 'desk', 'skim');
    const run = runOn(t.db, t.d)!;
    expect(run.kit).toContainEqual({ at: expect.any(Number), heat: -1, district: 'karasu' });
    expect(run.setup!.ended).toEqual(['mia/smooth']);
  });
  describe('PRO and VET, on a roll (tier 3 beat play spec §2)', () => {
    const roll = (t: { db: Parameters<typeof runOn>[0]; d: Parameters<typeof runOn>[1] }, i = 0) => runOn(t.db, t.d)!.picks[i].roll as { dice: number; position: string; effect?: string; stat: string };
    const tier3 = () => job(TIER_2_JOB.replace('tier: 2', 'tier: 3'));
    it('Lookout: a step more on this roll, a step smaller on the next, then it clears', async () => {
      const t = await go(['dez'], crew({ dez: ['lookout'] }, { dez: 2 }), { rolls: [6, 6] });
      await card(t.relay, 'door', 'talk', 'dez/lookout');
      expect(roll(t).effect).toBe('big');
      expect(runOn(t.db, t.d)!.next).toEqual({ small: true });
      expect(active(t.relay).choices.find((c) => c.id === 'grab')!.pool!.effect).toBe('small');
      await card(t.relay, 'desk', 'grab');
      expect(roll(t, 1).effect).toBe('small');
    });
    it('Lookout: lost on the last roll, refused at BIG, and where the roll fills no TAKE', async () => {
      const last = await go(['dez'], crew({ dez: ['lookout'] }, { dez: 2 }), { rolls: [6, 6] });
      await card(last.relay, 'door', 'talk');
      await card(last.relay, 'desk', 'grab', 'dez/lookout');
      expect(roll(last, 1).effect).toBe('big');
      const big = await go(['dez'], crew({ dez: ['lookout'] }, { dez: 2 }), { book: [job(JOB.replace(/\[check cool 50\]/g, '[check cool 50, big]'))] });
      expect(await raw(big.relay, 'door', 'talk', 'dez/lookout')).toMatch(/BIG|EFFECT|NOTHING|already/i);
      const out = await go(['dez'], crew({ dez: ['lookout'] }, { dez: 2 }), { rolls: [6] });
      out.db.setMeta(keyOn(out.d), JSON.stringify({ ...runOn(out.db, out.d)!, alarm: 4, getaway: true, beat: 'getaway', variant: 0 }));
      expect(await raw(out.relay, 'getaway', 'run', 'dez/lookout')).toBe('NOTHING TO TAKE HERE');
    });
    it('One More Thing: the roll is on COOL, and a miss lands ALARM +1', async () => {
      const t = await go(['dez'], crew({ dez: ['more'] }, { dez: 2 }), { rolls: [6, 2], stats: { ...HICKS, cool: 9, tech: 2 } });
      await card(t.relay, 'door', 'talk');
      const grab = active(t.relay).choices.find((c) => c.id === 'grab')!;
      expect(grab.pool!.stat).not.toBe('COOL');
      await card(t.relay, 'desk', 'grab', 'dez/more');
      const p = runOn(t.db, t.d)!.pending as { roll: { stat: string }; cost: { alarm: number } };
      expect(p.roll.stat).toBe('COOL');
      expect(p.cost.alarm).toBe(1);
    });
    it('One More Thing: the card says COOL before you play it', async () => {
      const t = await go(['dez'], crew({ dez: ['more'] }, { dez: 2 }), { rolls: [6], stats: { ...HICKS, cool: 9, reflex: 2 } });
      await card(t.relay, 'door', 'talk');
      const grab = active(t.relay).choices.find((c) => c.id === 'grab')!;
      expect(grab.plays!['dez/more']).toMatchObject({ stat: 'COOL', dice: 4 });
    });
    it('an angle: the card says it needs crew, shows a recruit lifting it, and a PRO a step more', async () => {
      const angled = job(TIER_2_JOB.replace('tier: 2', 'tier: 3').replace(/\[check cool 50\]/g, '[check cool 50 angle]'));
      const t = await go(['dez', 'mia'], crew({}, { dez: 2, mia: 1 }), { book: [angled], rep: 50 });
      const talk = active(t.relay).choices.find((c) => c.id === 'talk')!;
      expect(talk.pool!.tier).toEqual({ label: 'ANGLE NEEDS CREW', lifted: false });
      expect(talk.plays!.mia).toMatchObject({ effect: 'fair', tier: { label: 'ANGLE', lifted: true } });
      expect(talk.plays!.dez).toMatchObject({ effect: 'big', tier: { label: 'ANGLE', lifted: true } });
    });
    it('One More Thing does nothing on a COOL check', async () => {
      const t = await go(['dez'], crew({ dez: ['more'] }, { dez: 2 }));
      expect(await raw(t.relay, 'door', 'talk', 'dez/more')).toBe('that card does nothing here');
    });
    it('Calm Voice: the next roll ignores the cut, then it comes back', async () => {
      const t = await go(['dez'], crew({ dez: ['calm'] }, { dez: 1 }), { rolls: [6, 6], book: [tier3()], rep: 50 });
      await card(t.relay, 'door', 'talk', 'dez/calm');
      expect(runOn(t.db, t.d)!.next).toEqual({ noCut: true });
      expect(active(t.relay).choices.find((c) => c.id === 'grab')!.pool!.tier).toEqual({ label: 'INSIDE INFORMATION', lifted: true });
    });
    it('Stand Firm: the first cost picked on each roll is gone, and a miss ends it after its own', async () => {
      const t = await go(['dez'], crew({ dez: ['firm'] }, { dez: 3 }), { rolls: [4, 2] });
      await card(t.relay, 'door', 'talk', 'dez/firm');
      expect(runOn(t.db, t.d)!.firm).toBe(true);
      dealAs(t.db, keyOn(t.d), ['alarm', 'worse'], 1);
      await card(t.relay, 'door', '!cost', 'alarm');
      expect(runOn(t.db, t.d)!.alarm ?? 0).toBe(0);
      await card(t.relay, 'desk', 'grab');
      dealAs(t.db, keyOn(t.d), ['alarm', 'worse']);
      await card(t.relay, 'desk', '!cost', 'alarm');
      await card(t.relay, 'desk', '!cost', 'worse');
      await card(t.relay, 'desk', '!take', 'worse');
      const run = runOn(t.db, t.d)!;
      expect(run.alarm ?? 0).toBe(0);
      expect(run.firm).toBeUndefined();
    });
    it('none of the four goes on a red card', async () => {
      const red = job(JOB.replace(/\[check (\S+) (\d+)/g, '[check $1 $2 red'));
      for (const id of ['lookout', 'more', 'calm', 'firm']) {
        const t = await go(['dez'], crew({ dez: [id] }, { dez: 3 }), { book: [red] });
        expect(await raw(t.relay, 'door', 'talk', `dez/${id}`)).toBe('that card does nothing here');
      }
    });
  });
  describe('PRO and VET, on a waiting roll (tier 3 beat play spec §2)', () => {
    const after = (t: { relay: ChatRelay }, beat: string, id: string, who = 'dez') => t.relay.chooseQuest('hicks', { id: 'back-door', beat, choice: '!after', card: `${who}/${id}` });
    const pendingOf = (t: { db: Parameters<typeof runOn>[0]; d: number }) => runOn(t.db, t.d)!.pending as { roll: { kind: string; faces: number[]; rerun?: true; softened?: true }; dealt?: { cost: string }[]; pick?: number; settled?: { cost: string; how?: string }[]; cost: { alarm: number }; call?: { loss?: string } } | null;
    const blowUp = () => job(JOB.replace('- grab: Take it all. → paid / part [check reflex 50]', '- grab: Take it all. → paid / gone [check reflex 50]').replace('# desk', '## gone\n*It all goes wrong.*\ntake: none\n→ end\n\n# desk'));
    it('Run It Twice: the second result stands, a pass can land a miss and its outcome', async () => {
      const t = await go(['dez'], crew({ dez: ['twice'] }, { dez: 2 }), { rolls: [4], rerun: [2] });
      await card(t.relay, 'door', 'talk');
      expect(await after(t, 'door', 'twice')).toMatchObject({ ok: true });
      const p = pendingOf(t)!;
      expect(p.roll).toMatchObject({ kind: 'miss', rerun: true, faces: [2] });
      expect(p.dealt?.length).toBeGreaterThan(0);
    });
    it('Run It Twice: refused on a 6 and after a gamble, and a rerun takes no gamble', async () => {
      const six = await go(['dez', 'mia'], crew({ dez: ['twice'], mia: ['door-hold'] }, { dez: 2 }), { rolls: [4], rerun: [5] });
      await card(six.relay, 'door', 'talk');
      await after(six, 'door', 'twice');
      expect(await after(six, 'door', 'door-hold', 'mia')).toBe('that does nothing on this roll');
      const clean = await go(['dez', 'mia'], crew({ dez: ['twice'], mia: ['door-hold'] }, { dez: 2 }), { rolls: [4], gamble: 2 });
      await card(clean.relay, 'door', 'talk');
      await after(clean, 'door', 'door-hold', 'mia');
      expect(await after(clean, 'door', 'twice')).toBe('that does nothing on this roll');
    });
    it('Run It Twice: the same seed gives the same dice', async () => {
      const faces = async () => {
        const t = await go(['dez'], crew({ dez: ['twice'] }, { dez: 2 }), { rolls: [4] });
        await card(t.relay, 'door', 'talk');
        await after(t, 'door', 'twice');
        return pendingOf(t)!.roll.faces;
      };
      expect(await faces()).toEqual(await faces());
    });
    it('Saw It Coming: the miss is gone, the card with it, and nothing it dealt lands', async () => {
      const t = await go(['dez'], crew({ dez: ['undo'] }, { dez: 3 }), { rolls: [2] });
      await card(t.relay, 'door', 'talk');
      expect(await after(t, 'door', 'undo')).toMatchObject({ ok: true });
      const run = runOn(t.db, t.d)!;
      expect(run.pending ?? null).toBeNull();
      expect(run.alarm ?? 0).toBe(0);
      expect(run.picks).toHaveLength(0);
      expect(active(t.relay).choices.map((c) => c.id)).not.toContain('talk');
      expect(await raw(t.relay, 'door', 'talk')).toBe('that choice has passed');
    });
    it('Saw It Coming: a press spent stays spent, its ALARM and a NEXT ROLL it used do not land', async () => {
      const t = await go(['dez', 'mia'], crew({ dez: ['undo'], mia: ['roofs'] }, { dez: 3 }), { rolls: [2] });
      t.db.setMeta(keyOn(t.d), JSON.stringify({ ...runOn(t.db, t.d)!, next: { worse: true } }));
      await card(t.relay, 'door', 'talk', 'mia/roofs');
      await after(t, 'door', 'undo');
      const run = runOn(t.db, t.d)!;
      expect(run.alarm ?? 0).toBe(0);
      expect(run.next).toBeUndefined();
      expect((run.calls ?? []).map((c) => c.ability)).toEqual(['roofs', 'undo']);
    });
    it('Saw It Coming: refused off a miss, and with no other card', async () => {
      const pass = await go(['dez'], crew({ dez: ['undo'] }, { dez: 3 }), { rolls: [4] });
      await card(pass.relay, 'door', 'talk');
      expect(await after(pass, 'door', 'undo')).toBe('that does nothing on this roll');
      const one = job(JOB.replace(/- wait: Wait for the shift change\. → inside \[clock \+1h\]/g, '- wait: Wait for the shift change. → inside [needs with=nobody]'));
      const t = await go(['dez'], crew({ dez: ['undo'] }, { dez: 3 }), { rolls: [2], book: [one] });
      await card(t.relay, 'door', 'talk');
      expect(await after(t, 'door', 'undo')).toBe('NO OTHER CARD');
    });
    it('Talk Them Down: a blow-up lands part, messy, with the recruit held', async () => {
      const t = await go(['dez'], crew({ dez: ['down'] }, { dez: 3 }), { rolls: [6, 2], book: [blowUp()] });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'desk', 'grab');
      expect(await after(t, 'desk', 'down')).toMatchObject({ ok: true });
      dealAs(t.db, keyOn(t.d), [], 0);
      await card(t.relay, 'desk', '!take');
      const run = runOn(t.db, t.d)!;
      expect(run.take).toBe('part');
      expect(run.blown ?? false).toBe(false);
      expect((run.calls ?? []).find((c) => c.ability === 'down')!.loss).toBe('held');
      expect(t.kit().sol).toBeGreaterThan(0);
    });
    it('Talk Them Down: a softened roll takes no rerun and no gamble', async () => {
      const t = await go(['dez', 'mia'], crew({ dez: ['down'], mia: ['twice'] }, { dez: 3, mia: 2 }), { rolls: [6, 2], book: [blowUp()] });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'desk', 'grab');
      await after(t, 'desk', 'down');
      expect(await after(t, 'desk', 'twice', 'mia')).toBe('that does nothing on this roll');
      const g = await go(['dez', 'mia'], crew({ dez: ['down'], mia: ['word'] }, { dez: 3 }), { rolls: [6, 2], book: [blowUp()], gamble: 6 });
      await card(g.relay, 'door', 'talk');
      await card(g.relay, 'desk', 'grab');
      await after(g, 'desk', 'down');
      expect(await after(g, 'desk', 'word', 'mia')).toBe('that does nothing on this roll');
    });
    it('Saw It Coming: a loss drawn on the roll goes with it', async () => {
      const t = await go(['dez', 'mia'], crew({ dez: ['undo'], mia: [] }, { dez: 3 }), { rolls: [2] });
      const run = runOn(t.db, t.d)!;
      t.db.setMeta(keyOn(t.d), JSON.stringify({ ...run, pending: { beat: 'door', choice: 'talk', at: 1, roll: { stat: 'COOL', dice: 2, position: 'open', faces: [2, 1], keep: 'high', kind: 'miss', pass: false, costs: [] }, cost: { alarm: 0, heat: 0 }, call: { beat: 'door', choice: 'talk', card: 'mia', again: true, at: 1, loss: 'hurt' } } }));
      expect(await after(t, 'door', 'undo')).toMatchObject({ ok: true });
      expect(runOn(t.db, t.d)!.calls!.find((c) => c.card === 'mia')!.loss).toBeUndefined();
    });
    it('Saw It Coming: a deck that died on the roll is back', async () => {
      const t = await go(['dez'], crew({ dez: ['undo'] }, { dez: 3 }), { rolls: [2] });
      const run = runOn(t.db, t.d)!;
      t.db.setMeta(keyOn(t.d), JSON.stringify({ ...run, deckDead: true, kit: [...(run.kit ?? []), { at: 7, deck: null, lose: ['stall-build'] }], pending: { beat: 'door', choice: 'talk', at: 7, died: 'Stall build', roll: { stat: 'COOL', dice: 2, position: 'open', faces: [2, 1], keep: 'high', kind: 'miss', pass: false, costs: [] }, cost: { alarm: 0, heat: 0 } } }));
      expect(await after(t, 'door', 'undo')).toMatchObject({ ok: true });
      const back = runOn(t.db, t.d)!;
      expect(back.deckDead).toBeUndefined();
      expect((back.kit ?? []).some((e) => e.lose)).toBe(false);
    });
    it('Talk Them Down on a pressed job pays nothing twice', async () => {
      const t = await go(['dez'], crew({ dez: ['down'] }, { dez: 3 }), { rolls: [6, 2], book: [blowUp()] });
      await card(t.relay, 'door', 'talk');
      t.db.setMeta(keyOn(t.d), JSON.stringify({ ...runOn(t.db, t.d)!, push: { stage: 1, pot: 0, from: 0, outcome: 'paid', state: 'playing', log: [] } }));
      const before = t.kit().sol;
      await card(t.relay, 'desk', 'grab');
      await after(t, 'desk', 'down');
      dealAs(t.db, keyOn(t.d), [], 0);
      await card(t.relay, 'desk', '!take');
      expect(t.kit().sol).toBeLessThanOrEqual(before);
    });
    it('a gamble that turns a One More Thing miss into a pass takes its ALARM off', async () => {
      const t = await go(['dez', 'mia'], crew({ dez: ['more'], mia: ['word'] }, { dez: 2 }), { rolls: [6, 2], stats: { ...HICKS, cool: 9, reflex: 2 }, gamble: 6 });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'desk', 'grab', 'dez/more');
      expect(pendingOf(t)!.cost.alarm).toBe(1);
      await after(t, 'desk', 'word', 'mia');
      expect(pendingOf(t)!.cost.alarm).toBe(0);
    });
    it('Talk Them Down: refused where the miss would not blow the job', async () => {
      const t = await go(['dez'], crew({ dez: ['down'] }, { dez: 3 }), { rolls: [6, 2] });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'desk', 'grab');
      expect(await after(t, 'desk', 'down')).toBe('NOT A BLOW-UP');
    });
    it('Take the Hit: no cost lands, the roll goes on, the recruit is hurt', async () => {
      const t = await go(['dez'], crew({ dez: ['hit'] }, { dez: 2 }), { rolls: [2] });
      await card(t.relay, 'door', 'talk');
      dealAs(t.db, keyOn(t.d), ['alarm', 'take'], 2);
      expect(await after(t, 'door', 'hit')).toMatchObject({ ok: true });
      const run = runOn(t.db, t.d)!;
      expect(run.pending ?? null).toBeNull();
      expect(run.alarm ?? 0).toBe(0);
      expect((run.calls ?? []).find((c) => c.ability === 'hit')!.loss).toBe('hurt');
    });
    it('none of the four goes on a red card', async () => {
      const red = job(JOB.replace(/\[check (\S+) (\d+)/g, '[check $1 $2 red'));
      for (const id of ['twice', 'undo', 'down', 'hit']) {
        const t = await go(['dez'], crew({ dez: [id] }, { dez: 3 }), { rolls: [2], book: [red] });
        await card(t.relay, 'door', 'talk');
        expect(await after(t, 'door', id)).toBe('ONE SHOT');
      }
    });
  });
  describe('Clean Exit and the fences (tier 3 beat play spec §2)', () => {
    const patch = (t: { db: Parameters<typeof runOn>[0]; d: number }, o: Record<string, unknown>) => t.db.setMeta(keyOn(t.d), JSON.stringify({ ...runOn(t.db, t.d)!, ...o }));
    /** Up to ALARM 4 by a route's own +1 on the door's roll. */
    const alarmJob = () => job(JOB.replace(/- talk: Talk your way in\. → inside \/ turned \[check cool 50\]/g, '- talk: Talk your way in. → inside / turned [check cool 50, alarm +1]'));
    it('Clean Exit: ALARM stays 3, TAKE −1, no GET OUT, once', async () => {
      const t = await go(['ash'], crew({ ash: ['exit'] }), { rolls: [6], book: [alarmJob()] });
      patch(t, { alarm: 3, takeFill: 2 });
      await card(t.relay, 'door', 'talk');
      const run = runOn(t.db, t.d)!;
      expect(run.alarm).toBe(3);
      expect(run.takeFill).toBe(3);
      expect(run.getaway ?? false).toBe(false);
      expect(run.setup!.held).toBe('ash/exit');
    });
    it('Clean Exit: with TAKE 0, or held once already, GET OUT plays', async () => {
      const none = await go(['ash'], crew({ ash: ['exit'] }), { rolls: [4], book: [alarmJob()] });
      patch(none, { alarm: 3, takeFill: 0 });
      await card(none.relay, 'door', 'talk');
      dealAs(none.db, keyOn(none.d), ['take'], 1);
      await card(none.relay, 'door', '!cost', 'take');
      await card(none.relay, 'door', '!take', 'take');
      expect(runOn(none.db, none.d)!.getaway).toBe(true);
      const twice = await go(['ash'], crew({ ash: ['exit'] }), { rolls: [6], book: [alarmJob()] });
      const r = runOn(twice.db, twice.d)!;
      patch(twice, { alarm: 3, takeFill: 2, setup: { ...r.setup, held: 'ash/exit' } });
      await card(twice.relay, 'door', 'talk');
      expect(runOn(twice.db, twice.d)!.getaway).toBe(true);
    });
    it('Cut a Deal: a part take pays as full, less 25 %, and stays messy', async () => {
      const t = await go(['mia'], crew({ mia: ['deal'] }, { mia: 2 }), { rolls: [6, 2] });
      await card(t.relay, 'door', 'talk');
      patch(t, { takeFill: 0 });
      await card(t.relay, 'desk', 'skim');
      const run = runOn(t.db, t.d)!;
      expect(run.setup).toMatchObject({ payFull: true, payCut: 25 });
      expect(run.take).toBe('part');
      expect(settleTake({ ...run, payCeiling: 400, kit: [] }, BACK, 0).events[0].sol).toBe(300 - 400);
    });
    it('Cut a Deal: nothing where the plain pay is as good', async () => {
      const t = await go(['mia'], crew({ mia: ['deal'] }, { mia: 2 }), { rolls: [6] });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'desk', 'skim');
      const run = runOn(t.db, t.d)!;
      expect(run.takeFill).toBe(3);
      expect(run.setup!.payFull).toBeUndefined();
    });
    it('Cut a Deal: nothing on a full take', async () => {
      const t = await go(['mia'], crew({ mia: ['deal'] }, { mia: 2 }), { rolls: [6, 6] });
      patch(t, { takeFill: 4 });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'desk', 'grab');
      expect(runOn(t.db, t.d)!.setup!.payFull).toBeUndefined();
    });
    it('Paid Off: a full take at ALARM 2 is clean, for −30 %; nothing under ALARM 2', async () => {
      const t = await go(['mia'], crew({ mia: ['paid'] }, { mia: 3 }), { rolls: [6, 6] });
      patch(t, { takeFill: 4, alarm: 2 });
      await card(t.relay, 'door', 'talk');
      await card(t.relay, 'desk', 'grab');
      expect(runOn(t.db, t.d)!.setup).toMatchObject({ paidOff: true, payCut: 30 });
      expect(questRows(t.db).at(-1)!.quest!.debrief!.tier).toBe('clean');
      const calm = await go(['mia'], crew({ mia: ['paid'] }, { mia: 3 }), { rolls: [6, 6] });
      patch(calm, { takeFill: 4 });
      await card(calm.relay, 'door', 'talk');
      await card(calm.relay, 'desk', 'grab');
      expect(runOn(calm.db, calm.d)!.setup!.paidOff).toBeUndefined();
    });
    it('neither plays on a blown job or a GET OUT', async () => {
      const t = await go(['mia'], crew({ mia: ['paid'] }, { mia: 3 }), { rolls: [6, 6] });
      patch(t, { takeFill: 4, alarm: 2, getaway: true, beat: 'getaway', variant: 0 });
      await card(t.relay, 'getaway', 'run');
      expect(runOn(t.db, t.d)!.setup!.paidOff).toBeUndefined();
    });
  });
});

describe('effect and NERVE (effect and NERVE spec 2026-11-02)', () => {
  const tagged = (tag: string) => job(JOB.replace(/talk: Talk your way in\. → inside \/ turned \[check cool 50\]/g, `talk: Talk your way in. → inside / turned [check cool 50, ${tag}]`));
  const slot = (ids: string[]) => ({ abilities: ids, slotted: ids });
  const at = async (o: Parameters<typeof relayWith>[0] = {}, people: string[] = [], abilities: string[] = []) => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), crew: { members: [member('dez', 'runner', slot(abilities), 1)] }, ...o });
    expect(await r.relay.startQuest('hicks', 'back-door', ...(people.length ? [{ approach: 'smooth' as const, people, favour: false }] : []))).toMatchObject({ ok: true });
    return { ...r, d };
  };
  const choose = (relay: ChatRelay, beat: string, choice: string, o: { push?: true | 'dice' | 'effect'; trade?: 'safe' | 'bold'; card?: string } = {}) => relay.chooseQuest('hicks', { id: 'back-door', beat, choice, ...o });
  const talk = (relay: ChatRelay) => relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!;
  const nerve = (t: { kit: () => { nerveLeft: number } }) => t.kit().nerveLeft;

  it('a [big] clean fills TAKE +3; at heat 6 the same card is FAIR and fills +2', async () => {
    const big = await at({ book: [tagged('big')], rolls: [6] });
    expect(talk(big.relay).pool).toMatchObject({ effect: 'big', effectParts: [] });
    await choose(big.relay, 'door', 'talk');
    expect(runOn(big.db, big.d)).toMatchObject({ beat: 'desk', takeFill: 3 });
    expect(runOn(big.db, big.d)!.picks.at(-1)!.roll).toMatchObject({ effect: 'big' });
    const hot = await at({ book: [tagged('big')], rolls: [6], heat: 6 });
    expect(talk(hot.relay).pool).toMatchObject({ effect: 'fair', effectParts: [{ label: 'HEAT 6', step: -1 }] });
    await choose(hot.relay, 'door', 'talk');
    expect(runOn(hot.db, hot.d)!.takeFill).toBe(2);
    expect(runOn(hot.db, hot.d)!.picks.at(-1)!.roll).not.toHaveProperty('effect');
  });

  it('BOLD rolls a position worse for BIG; SAFE in the dark is refused; cards say what they allow', async () => {
    const t = await at({ rolls: [6] });
    expect(talk(t.relay)).toMatchObject({ trade: { safe: null, bold: null }, pushEffect: null });
    expect(await choose(t.relay, 'door', 'talk', { trade: 'bold' })).toMatchObject({ ok: true });
    const roll = runOn(t.db, t.d)!.picks.at(-1)!.roll;
    expect(roll).toMatchObject({ position: 'wire', effect: 'big', trade: 'bold' });
    // The row's record says what was traded and what it filled at.
    expect(questRows(t.db).at(-1)!.text).toContain('— 6, clean · BOLD · BIG.*');
    expect(runOn(t.db, t.d)!.takeFill).toBe(3);
    const dark = await at({ book: [job(JOB.replace(/\[check cool 50\]/g, '[check cool 60]'))], rolls: [6] });
    expect(talk(dark.relay).trade).toEqual({ safe: 'ALREADY IN THE DARK', bold: null });
    expect(await choose(dark.relay, 'door', 'talk', { trade: 'safe' })).toBe('ALREADY IN THE DARK');
  });

  it('PUSH for effect: 2 NERVE, same dice, BIG; push: true is dice; no PUSH of either kind on a red card', async () => {
    const t = await at({ rolls: [6] });
    const before = nerve(t);
    const dice = talk(t.relay).pool!.dice;
    expect(await choose(t.relay, 'door', 'talk', { push: 'effect' })).toMatchObject({ ok: true });
    expect(nerve(t)).toBe(before - 2);
    expect(runOn(t.db, t.d)!.picks.at(-1)!.roll).toMatchObject({ dice, effect: 'big', pushed: true });
    const old = await at({ rolls: [6] });
    await choose(old.relay, 'door', 'talk', { push: true });
    expect(runOn(old.db, old.d)!.picks.at(-1)!.roll).toMatchObject({ dice: dice + 1 });
    expect(runOn(old.db, old.d)!.picks.at(-1)!.roll).not.toHaveProperty('effect');
    const red = await at({ book: [job(JOB.replace(/\[check cool 50\]/g, '[check cool 50 red]'))], rolls: [6] });
    expect(talk(red.relay).pushEffect).toBe("PUSH can't go on a one-shot card");
    expect(await choose(red.relay, 'door', 'talk', { push: 'effect' })).toBe("PUSH can't go on a one-shot card");
    expect(await choose(red.relay, 'door', 'talk', { trade: 'safe' })).toMatchObject({ ok: true });
  });

  it('GET OUT cards have no effect and refuse the trade', async () => {
    const t = await at({ rolls: [2, 6], nerve: 1 });
    t.db.setMeta(keyOn(t.d), JSON.stringify({ ...runOn(t.db, t.d)!, alarm: 3 }));
    await choose(t.relay, 'door', 'talk');
    dealAs(t.db, keyOn(t.d), ['alarm']);
    await choose(t.relay, 'door', '!take');
    expect(runOn(t.db, t.d)!.beat).toBe('getaway');
    const run = t.relay.questState('hicks').active!.choices.find((c) => c.id === 'run')!;
    expect(run.pool).not.toHaveProperty('effect');
    expect(run.trade).toEqual({ safe: 'NOTHING TO TAKE HERE', bold: 'NOTHING TO TAKE HERE' });
    expect(await choose(t.relay, 'getaway', 'run', { trade: 'bold' })).toBe('NOTHING TO TAKE HERE');
  });
  it('a parked BOLD cost lands its TAKE at the effect it was rolled with, after heat moves', async () => {
    const t = await at({ rolls: [5] });
    await choose(t.relay, 'door', 'talk', { trade: 'bold' });
    dealAs(t.db, keyOn(t.d), ['alarm', 'heat']);
    const parked = runOn(t.db, t.d)!;
    t.db.setMeta(keyOn(t.d), JSON.stringify({ ...parked, kit: [...(parked.kit ?? []), { at: evening(t.d) - 1, heat: 9, district: 'karasu' }] }));
    await choose(t.relay, 'door', '!take');
    expect(runOn(t.db, t.d)!.takeFill).toBe(2);
  });
  it('heat reaching 6 mid-job turns the next card SMALLER and says why', async () => {
    const t = await at({ rolls: [5], heat: 5 });
    expect(talk(t.relay).pool!.effect).toBe('fair');
    // BOLD puts it ON THE WIRE: a 4–5 there costs heat +1.
    await choose(t.relay, 'door', 'talk', { trade: 'bold' });
    dealAs(t.db, keyOn(t.d), ['heat', 'alarm']);
    await choose(t.relay, 'door', '!take');
    const grab = t.relay.questState('hicks').active!.choices.find((c) => c.id === 'grab')!;
    expect(grab.pool).toMatchObject({ effect: 'small', effectParts: [{ label: 'HEAT 6', step: -1 }] });
  });

  it('an ON A ROLL ability costs 1 NERVE a press, plays once a job, and is refused with no NERVE', async () => {
    const t = await at({ rolls: [6, 2] }, ['dez'], ['steady-hand']);
    expect(t.relay.questState('hicks').active!.hand!.people[0].abilities[0]).toMatchObject({ id: 'steady-hand', nerve: 1, afford: true });
    const before = nerve(t);
    await choose(t.relay, 'door', 'talk', { card: 'dez/steady-hand' });
    expect(nerve(t)).toBe(before - 1);
    expect(await choose(t.relay, 'desk', 'grab', { card: 'dez/steady-hand' })).toBe('DEZ HAS PLAYED THAT');
    expect(nerve(t)).toBe(before - 1);
    expect(runOn(t.db, t.d)!.calls!.every((c) => c.loss === undefined)).toBe(true);
    // The last NERVE spent on the first press: the job plays out, and the next press is out of reach.
    const broke = await at({ rolls: [6], nerve: 1 }, ['dez'], ['steady-hand', 'cool-head']);
    await choose(broke.relay, 'door', 'talk', { card: 'dez/steady-hand' });
    expect(broke.relay.questState('hicks').active!.hand!.people[0].abilities[1]).toMatchObject({ afford: false });
    expect(await choose(broke.relay, 'desk', 'grab', { card: 'dez/cool-head' })).toBe('that card does nothing here');
  });

  it('an AFTER A ROLL ability costs 1 NERVE at the roll; out of NERVE its card is out of reach; NERVE +1 stays free', async () => {
    const t = await at({ rolls: [4] }, ['dez'], ['log-wipe']);
    await choose(t.relay, 'door', 'talk');
    dealAs(t.db, keyOn(t.d), ['alarm', 'heat'], 2);
    await choose(t.relay, 'door', '!cost', { card: 'alarm' });
    const before = nerve(t);
    expect(await choose(t.relay, 'door', '!after', { card: 'dez/log-wipe' })).toMatchObject({ ok: true });
    expect(nerve(t)).toBe(before - 1);
    const run = runOn(t.db, t.d)!;
    expect(run.kit!.at(-1)).toMatchObject({ nerve: -1, at: (run.pending as { at?: number }).at });
    // The roll's own press takes the last NERVE: LOG WIPE is out of reach.
    const broke = await at({ rolls: [2], nerve: 1 }, ['dez'], ['log-wipe', 'steady-hand']);
    await choose(broke.relay, 'door', 'talk', { card: 'dez/steady-hand' });
    expect(broke.relay.questState('hicks').active!.hand!.people[0].abilities.find((a) => a.id === 'log-wipe')).toMatchObject({ afford: false, playable: false });
    const wind = await at({ rolls: [4], nerve: 3 }, ['dez'], ['second-wind']);
    await choose(wind.relay, 'door', 'talk');
    const w0 = nerve(wind);
    await choose(wind.relay, 'door', '!after', { card: 'dez/second-wind' });
    expect(nerve(wind)).toBe(w0 + 1);
  });
  it('rewind gives back the NERVE a press spent', async () => {
    const t = await at({ rolls: [6, 6] }, ['dez'], ['steady-hand']);
    const opening = t.db.recentMessages('hicks', 50).filter((m) => m.role === 'agent').at(-1)!;
    const before = nerve(t);
    await choose(t.relay, 'door', 'talk', { card: 'dez/steady-hand' });
    expect(nerve(t)).toBe(before - 1);
    await t.relay.rewind('hicks', opening.id);
    expect(nerve(t)).toBe(before);
  });

  it('rewind over an AFTER A ROLL press: NERVE matches the run it restores', async () => {
    // A parked roll writes no line of its own: its writes (PUSH, a press) stamp the line before it, so rewinding to
    // that line brings the roll back parked, its press made and paid for (as PUSH was before abilities cost NERVE).
    const t = await at({ rolls: [4] }, ['dez'], ['log-wipe']);
    const opening = t.db.recentMessages('hicks', 50).filter((m) => m.role === 'agent').at(-1)!;
    const before = nerve(t);
    await choose(t.relay, 'door', 'talk');
    dealAs(t.db, keyOn(t.d), ['alarm', 'heat'], 2);
    await choose(t.relay, 'door', '!cost', { card: 'alarm' });
    await choose(t.relay, 'door', '!after', { card: 'dez/log-wipe' });
    await choose(t.relay, 'door', '!cost', { card: 'heat' });
    await choose(t.relay, 'door', '!take', { card: 'heat' });
    await t.relay.rewind('hicks', opening.id);
    const run = runOn(t.db, t.d)!;
    expect((run.pending as { after?: { ability?: string }[] }).after?.map((c) => c.ability)).toEqual(['log-wipe']);
    expect(nerve(t)).toBe(before - 1);
  });
  it('review: NERVE +1 is out of reach when the roll itself spent the last NERVE', async () => {
    // PUSH (2) and an ON A ROLL press (1) take NERVE 3 to 0: SECOND WIND can't lift NERVE GONE.
    const t = await at({ rolls: [4], nerve: 3 }, ['dez'], ['second-wind', 'steady-hand']);
    expect(await choose(t.relay, 'door', 'talk', { push: 'effect', card: 'dez/steady-hand' })).toMatchObject({ ok: true });
    expect(t.relay.questState('hicks').active!.hand!.people[0].abilities.find((a) => a.id === 'second-wind')!.playable).toBe(false);
  });
  it("an old run's ability loss still downs the stack", async () => {
    const t = await at({ rolls: [6] }, ['dez'], ['steady-hand']);
    const run = runOn(t.db, t.d)!;
    t.db.setMeta(keyOn(t.d), JSON.stringify({ ...run, calls: [{ beat: 'x', choice: 'y', card: 'dez', ability: 'steady-hand', again: true, at: 2, loss: 'hurt' }] }));
    expect(await choose(t.relay, 'door', 'talk', { card: 'dez/steady-hand' })).toBe('DEZ IS DOWN');
  });
});

describe("a roll's life, phase 1 (roll lifecycle spec §1)", () => {
  const slot = (ids: string[]) => ({ abilities: ids, slotted: ids });
  /** The n-th day whose door is the plain, easy one: each a different seed, so a different deal. */
  const plainDay = (n: number) => {
    for (let d = 0, k = 0; d < 400; d++) {
      const x = drawsFor(BACK, keyOn(d));
      if (x.complication !== 'caper-watching' && x.door === 'easy' && k++ === n) return d;
    }
    throw new Error('no day');
  };
  const at = async (o: Parameters<typeof relayWith>[0] & { day?: number } = {}, people: string[] = [], crewOf: CrewMember[] = [], approach: 'quiet' | 'smooth' = 'smooth') => {
    const d = o.day ?? plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), ...(crewOf.length ? { crew: { members: crewOf } } : {}), ...o });
    expect(await r.relay.startQuest('hicks', 'back-door', ...(people.length ? [{ approach, people, favour: false }] : []))).toMatchObject({ ok: true });
    return { ...r, d };
  };
  const go = (relay: ChatRelay, beat: string, choice: string, card?: string) => relay.chooseQuest('hicks', { id: 'back-door', beat, choice, ...(card ? { card } : {}) });
  const active = (relay: ChatRelay) => relay.questState('hicks').active!;
  const pend = (t: { db: Db; d: number }) => runOn(t.db, t.d)!.pending as DicePending;
  const at60 = job(JOB.replace(/\[check cool 50\]/g, '[check cool 60]'));
  const at40 = job(JOB.replace(/\[check cool 50\]/g, '[check cool 40]'));
  const grid = (deck = 'stall-build', tier = 1) => job(JOB.replace('tier: 2', `tier: ${tier}`).replace(/talk: Talk your way in\. → inside \/ turned \[check cool 50\]/g, 'talk: Talk your way in. → inside / turned [check tech 50 grid]'));
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('an OPEN 4–5 deals three costs to pick one; a DARK 4–5 lands; a WIRE miss picks two', async () => {
    const t = await at({ rolls: [5] });
    await go(t.relay, 'door', 'talk');
    expect(pend(t)).toMatchObject({ pick: 1 });
    expect(pend(t).dealt).toHaveLength(3);
    expect(active(t.relay).choices).toEqual([]);
    expect(active(t.relay).costs).toMatchObject({ pick: 1 });
    expect(active(t.relay).costs!.dealt.every((c) => c.by === 'written' && c.line.length > 0)).toBe(true);
    const dark = await at({ rolls: [5], book: [at60] });
    await go(dark.relay, 'door', 'talk');
    expect(runOn(dark.db, dark.d)).toMatchObject({ beat: 'desk', pending: null });
    const wire = await at({ rolls: [5], book: [at40] });
    await go(wire.relay, 'door', 'talk');
    expect(pend(wire).pick).toBe(2);
  });

  it('deals only costs that can bite: no TAKE at TAKE 0, no NEXT ROLL on a last check, no HEAT on a hidden deck', async () => {
    for (let i = 0; i < 6; i++) {
      const miss = await at({ rolls: [2], nerve: 5 - (i % 2) });
      await go(miss.relay, 'door', 'talk');
      expect(pend(miss).dealt!.map((c) => c.cost)).not.toContain('take');
    }
    const last = await at({ rolls: [5] });
    await go(last.relay, 'door', 'wait');
    await go(last.relay, 'desk', 'grab');
    expect(pend(last).dealt!.map((c) => c.cost).filter((c) => c === 'worse' || c === 'small')).toEqual([]);
    const hidden = await at({ rolls: [5], deck: 'quiet-deck', book: [grid('quiet-deck', 2)] });
    await go(hidden.relay, 'door', 'talk');
    expect(pend(hidden).dealt!.map((c) => c.cost)).not.toContain('heat');
  });

  it('pick, then TAKE IT lands the cost and the outcome; picking past the count is refused; STEADY is gone', async () => {
    const t = await at({ rolls: [5] });
    await go(t.relay, 'door', 'talk');
    expect(await go(t.relay, 'door', '!steady')).toBe('STEADY is gone: pick a cost');
    const [first, second] = pend(t).dealt!.map((c) => c.cost);
    expect(await go(t.relay, 'door', '!cost', first)).toMatchObject({ ok: true });
    expect(await go(t.relay, 'door', '!cost', second)).toBe('pick no more');
    expect(await go(t.relay, 'door', '!take', first)).toMatchObject({ ok: true });
    const run = runOn(t.db, t.d)!;
    expect(run).toMatchObject({ beat: 'desk', pending: null });
    expect(run.picks.at(-1)!.roll).toMatchObject({ costs: [{ cost: first, how: 'taken' }] });
    expect(questRows(t.db).at(-1)!.text).toContain(`${COSTS[first].tag} TAKEN`);
    // The line it showed lands in the row (the job column), after the roll's own line.
    expect(questRows(t.db).at(-1)!.text).toContain(`*${(run.picks.at(-1)!.roll as { costs: { line: string }[] }).costs[0].line}*`);
  });

  it('RESIST: EDGE dice set the NERVE; at NERVE 1 a 2 empties it; not on a red card; chrome on the grid rolls one more', async () => {
    const price = async (face: number, nerve = 5) => {
      const t = await at({ rolls: [5, face], nerve });
      await go(t.relay, 'door', 'talk');
      const c = pend(t).dealt![0].cost;
      await go(t.relay, 'door', '!cost', c);
      const before = t.kit().nerveLeft;
      expect(await go(t.relay, 'door', '!resist', c)).toMatchObject({ ok: true });
      return { spent: before - t.kit().nerveLeft, t, c };
    };
    expect((await price(6)).spent).toBe(0);
    expect((await price(5)).spent).toBe(1);
    expect((await price(2)).spent).toBe(2);
    const last = await price(2, 1);
    expect(last.spent).toBe(1);
    expect(last.t.kit().nerveGone).toBe(true);
    expect(runOn(last.t.db, last.t.d)!.picks.at(-1)!.roll).toMatchObject({ costs: [{ cost: last.c, how: 'resisted' }] });
    const red = await at({ rolls: [5], book: [job(JOB.replace(/\[check cool 50\]/g, '[check cool 50 red]'))] });
    await go(red.relay, 'door', 'talk');
    const rc = pend(red).dealt![0].cost;
    await go(red.relay, 'door', '!cost', rc);
    expect(await go(red.relay, 'door', '!resist', rc)).toBe("a one-shot card can't RESIST");
    const chrome = await at({ rolls: [5, 6], deck: 'chrome-deck', book: [grid('chrome-deck', 2)] });
    await go(chrome.relay, 'door', 'talk');
    expect(active(chrome.relay).costs!.resist).toMatchObject({ dice: 3, ok: true });
  });

  it('ARMOUR: a holding deck blocks one cost on the grid, once a job; not off the grid', async () => {
    const t = await at({ rolls: [2], deck: 'breaker-deck', book: [grid()] });
    await go(t.relay, 'door', 'talk');
    expect(active(t.relay).costs!.armour).toEqual({ ok: true, left: 1 });
    dealAs(t.db, keyOn(t.d), ['alarm', 'worse'], 2);
    const [a, b] = pend(t).dealt!.map((c) => c.cost);
    await go(t.relay, 'door', '!cost', a);
    await go(t.relay, 'door', '!cost', b);
    expect(await go(t.relay, 'door', '!armour', a)).toMatchObject({ ok: true });
    expect(runOn(t.db, t.d)!.armourUsed).toBe(true);
    expect(await go(t.relay, 'door', '!armour', b)).toBe('the armour is spent');
    const plain = await at({ rolls: [5] });
    await go(plain.relay, 'door', 'talk');
    expect(active(plain.relay).costs!.armour).toEqual({ ok: false, left: 0 });
  });

  it('NEXT ROLL WORSE makes the next checked card a position worse, then it clears; SMALL a step smaller; a no-roll pick clears it too', async () => {
    const take = async (cost: 'worse' | 'small') => {
      for (let n = 0; n < 40; n++) {
        const t = await at({ rolls: [5], day: plainDay(n) });
        await go(t.relay, 'door', 'talk');
        if (!pend(t).dealt!.some((c) => c.cost === cost)) continue;
        await go(t.relay, 'door', '!cost', cost);
        await go(t.relay, 'door', '!take', cost);
        return t;
      }
      throw new Error(`no deal with ${cost}`);
    };
    const w = await take('worse');
    expect(runOn(w.db, w.d)!.next).toEqual({ worse: true });
    expect(active(w.relay).choices.find((c) => c.id === 'grab')!.pool!.position).toBe('wire');
    await go(w.relay, 'desk', 'skim');
    expect(runOn(w.db, w.d)!.next).toBeUndefined();
    const s = await take('small');
    expect(active(s.relay).choices.find((c) => c.id === 'grab')!.pool).toMatchObject({ effect: 'small', effectParts: [{ label: 'NEXT ROLL', step: -1 }] });
  });

  it('TAKE −1 takes a segment after the roll fills its own', async () => {
    for (let n = 0; n < 40; n++) {
      const t = await at({ rolls: [5], day: plainDay(n) });
      await go(t.relay, 'door', 'talk');
      if (!pend(t).dealt!.some((c) => c.cost === 'take')) continue;
      await go(t.relay, 'door', '!cost', 'take');
      await go(t.relay, 'door', '!take', 'take');
      expect(runOn(t.db, t.d)!.takeFill).toBe(0);
      return;
    }
    throw new Error('no deal with take');
  });

  it('abilities on a dealt roll: a VET save drops the pick count; ALARM −1 settles a picked ALARM +1', async () => {
    const vet = await at({ rolls: [2] }, ['ash'], [member('ash', 'runner', slot(['clean-exit']), 3)]);
    await go(vet.relay, 'door', 'talk');
    dealAs(vet.db, keyOn(vet.d), ['alarm', 'worse', 'small'], 2);
    expect(pend(vet).pick).toBe(2);
    await go(vet.relay, 'door', '!after', 'ash/clean-exit');
    expect(pend(vet).pick).toBe(1);
    for (let n = 0; n < 40; n++) {
      const t = await at({ rolls: [5], day: plainDay(n) }, ['dez'], [member('dez', 'runner', slot(['log-wipe']), 1)], 'quiet');
      await go(t.relay, 'door', 'talk');
      if (!pend(t).dealt!.some((c) => c.cost === 'alarm')) continue;
      await go(t.relay, 'door', '!cost', 'alarm');
      expect(await go(t.relay, 'door', '!after', 'dez/log-wipe')).toMatchObject({ ok: true });
      expect(runOn(t.db, t.d)!.picks.at(-1)!.roll).toMatchObject({ costs: [{ cost: 'alarm', how: 'ability' }] });
      expect(runOn(t.db, t.d)!.alarm ?? 0).toBe(0);
      return;
    }
    throw new Error('no deal with alarm');
  });

  it("the GM's lines replace written ones on costs not yet picked; no GM, written lines and no call", async () => {
    let answer!: (v: { text: string }) => void;
    const gm = { complete: vi.fn(() => new Promise<{ text: string }>((r) => (answer = r))) };
    const t = await at({ rolls: [5], gm });
    await go(t.relay, 'door', 'talk');
    expect(gm.complete).toHaveBeenCalledTimes(1);
    const [a, b] = pend(t).dealt!.map((c) => c.cost);
    const written = pend(t).dealt![0].line;
    await go(t.relay, 'door', '!cost', a);
    answer({ text: JSON.stringify({ lines: Object.fromEntries(pend(t).dealt!.map((c) => [COSTS[c.cost].tag, `The street shifts around you, line ${c.cost.length}.`])) }) });
    await flush();
    await flush();
    const dealt = pend(t).dealt!;
    expect(dealt.find((c) => c.cost === a)).toMatchObject({ line: written, by: 'written' });
    expect(dealt.find((c) => c.cost === b)).toMatchObject({ by: 'gm' });
    const none = await at({ rolls: [5] });
    await go(none.relay, 'door', 'talk');
    expect(pend(none).dealt!.every((c) => c.by === 'written')).toBe(true);
  });

  it('the costs say writing while the GM is out, and stop when it answers', async () => {
    let answer!: (v: { text: string }) => void;
    const gm = { complete: vi.fn(() => new Promise<{ text: string }>((r) => (answer = r))) };
    const t = await at({ rolls: [5], gm });
    await go(t.relay, 'door', 'talk');
    expect(states(t.events).at(-1)!.active!.costs!.writing).toBe(true);
    answer({ text: JSON.stringify({ lines: Object.fromEntries(pend(t).dealt!.map((c) => [COSTS[c.cost].tag, 'The street shifts around you here.'])) }) });
    await flush();
    await flush();
    expect(states(t.events).at(-1)!.active!.costs!.writing).toBeUndefined();
  });
  it('a GM that fails stops writing, and the written lines stand', async () => {
    const gm = { complete: vi.fn(async () => Promise.reject(new Error('down'))) };
    const t = await at({ rolls: [5], gm });
    await go(t.relay, 'door', 'talk');
    await flush();
    await flush();
    const last = states(t.events).at(-1)!.active!.costs!;
    expect(last.writing).toBeUndefined();
    expect(last.dealt.every((c) => c.by === 'written')).toBe(true);
  });
  it('a GM past the hold is dropped: the written line never changes after it shows', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout');
    let answer!: (v: { text: string }) => void;
    const gm = { complete: vi.fn(() => new Promise<{ text: string }>((r) => (answer = r))) };
    const t = await at({ rolls: [5], gm });
    await go(t.relay, 'door', 'talk');
    const hold = timers.mock.calls.find((c) => c[1] === GM_HOLD_MS)![0] as () => void;
    timers.mockRestore();
    hold();
    expect(states(t.events).at(-1)!.active!.costs!.writing).toBeUndefined();
    answer({ text: JSON.stringify({ lines: Object.fromEntries(pend(t).dealt!.map((c) => [COSTS[c.cost].tag, 'The street shifts around you here.'])) }) });
    await flush();
    await flush();
    expect(pend(t).dealt!.every((c) => c.by === 'written')).toBe(true);
  });
  it('a GM answering after the room closed (a LOAD) is dropped quietly, hold timer too: no unhandled error (load in place review I2)', async () => {
    const timers = vi.spyOn(globalThis, 'setTimeout');
    let answer!: (v: { text: string }) => void;
    const gm = { complete: vi.fn(() => new Promise<{ text: string }>((r) => (answer = r))) };
    const t = await at({ rolls: [5], gm });
    await go(t.relay, 'door', 'talk');
    const hold = timers.mock.calls.find((c) => c[1] === GM_HOLD_MS)![0] as () => void;
    timers.mockRestore();
    const tags = pend(t).dealt!.map((c) => COSTS[c.cost].tag);
    dbs.splice(dbs.indexOf(t.db), 1);
    t.db.close();
    answer({ text: JSON.stringify({ lines: Object.fromEntries(tags.map((tag) => [tag, 'The street shifts around you here.'])) }) });
    await flush();
    await flush();
    expect(() => hold()).not.toThrow();
  });
  it('no GM: nothing says writing', async () => {
    const t = await at({ rolls: [5] });
    await go(t.relay, 'door', 'talk');
    expect(states(t.events).at(-1)!.active!.costs!.writing).toBeUndefined();
  });

  it('rewind brings back the same deal and lines without a new GM call', async () => {
    const gm = { complete: vi.fn(async () => ({ text: '{"lines":{}}' })) };
    const t = await at({ rolls: [5, 5], gm });
    const opening = t.db.recentMessages('hicks', 50).filter((m) => m.role === 'agent').at(-1)!;
    await go(t.relay, 'door', 'talk');
    await flush();
    const dealt = pend(t).dealt!;
    await go(t.relay, 'door', '!cost', dealt[0].cost);
    await go(t.relay, 'door', '!take', dealt[0].cost);
    await t.relay.rewind('hicks', opening.id);
    expect(pend(t).dealt).toEqual(dealt);
    expect(gm.complete).toHaveBeenCalledTimes(1);
  });

  it('review: rewind to the line before a landed roll brings it back still to settle, never settled and stuck', async () => {
    const t = await at({ rolls: [2, 2] });
    const opening = t.db.recentMessages('hicks', 50).filter((m) => m.role === 'agent').at(-1)!;
    await go(t.relay, 'door', 'talk');
    const [a, b] = pend(t).dealt!.map((c) => c.cost);
    await go(t.relay, 'door', '!cost', a);
    await go(t.relay, 'door', '!cost', b);
    await go(t.relay, 'door', '!take');
    await t.relay.rewind('hicks', opening.id);
    const back = pend(t);
    expect((back.settled ?? []).every((x) => !x.how)).toBe(true);
    expect(await go(t.relay, 'door', '!take')).toMatchObject({ ok: true });
    expect(runOn(t.db, t.d)!.pending ?? null).toBeNull();
  });

  it('review C1: a VET save on a dealt miss brings back no fixed cost; a resisted pick lands nothing', async () => {
    const vet = await at({ rolls: [2, 6] }, ['ash'], [member('ash', 'runner', slot(['clean-exit']), 3)]);
    await go(vet.relay, 'door', 'talk');
    await go(vet.relay, 'door', '!after', 'ash/clean-exit');
    expect(pend(vet).cost).toEqual({ alarm: 0, heat: 0 });
    dealAs(vet.db, keyOn(vet.d), ['alarm'], 1);
    await go(vet.relay, 'door', '!cost', 'alarm');
    await go(vet.relay, 'door', '!resist', 'alarm');
    expect(runOn(vet.db, vet.d)).toMatchObject({ beat: 'desk', alarm: 0 });
    expect(vet.kit().heat.karasu ?? 0).toBe(0);
  });

  it('review I2: TAKE −1 at a full TAKE still takes a segment', async () => {
    const t = await at({ rolls: [5] });
    t.db.setMeta(keyOn(t.d), JSON.stringify({ ...runOn(t.db, t.d)!, takeFill: 4 }));
    await go(t.relay, 'door', 'talk');
    dealAs(t.db, keyOn(t.d), ['take'], 1);
    await go(t.relay, 'door', '!take');
    expect(runOn(t.db, t.d)!.takeFill).toBe(3);
  });

  it('review I3/I4: no TAKE −1 when a SMALL 4–5 at TAKE 0 fills nothing; no NEXT ROLL when the outcome that plays ends the job', async () => {
    for (let n = 0; n < 6; n++) {
      const small = await at({ rolls: [5], heat: 6, day: plainDay(n) });
      await go(small.relay, 'door', 'talk');
      expect(pend(small).dealt!.map((c) => c.cost)).not.toContain('take');
      // A miss at the door plays 'turned', which ends the job.
      const miss = await at({ rolls: [2], day: plainDay(n) });
      await go(miss.relay, 'door', 'talk');
      expect(pend(miss).dealt!.map((c) => c.cost).filter((c) => c === 'worse' || c === 'small')).toEqual([]);
    }
  });

  it('review M5: a save keeps what is settled and only fills up to the new pick count', async () => {
    const vet = await at({ rolls: [2, 5] }, ['ash'], [member('ash', 'runner', slot(['clean-exit']), 3)], 'quiet');
    await go(vet.relay, 'door', 'talk');
    dealAs(vet.db, keyOn(vet.d), ['alarm', 'heat', 'worse'], 2);
    await go(vet.relay, 'door', '!cost', 'alarm');
    await go(vet.relay, 'door', '!cost', 'heat');
    await go(vet.relay, 'door', '!resist', 'heat');
    await go(vet.relay, 'door', '!after', 'ash/clean-exit');
    // The resisted HEAT fills the new pick of 1: the open ALARM goes back, and the roll lands.
    expect(runOn(vet.db, vet.d)!.pending ?? null).toBeNull();
    expect(runOn(vet.db, vet.d)!.picks.at(-1)!.roll).toMatchObject({ costs: [{ cost: 'heat', how: 'resisted' }] });
    expect(runOn(vet.db, vet.d)!.alarm ?? 0).toBe(0);
  });

  it('a bare TAKE IT (an old client) takes the first dealt costs as dealt', async () => {
    const t = await at({ rolls: [2], book: [at40] });
    await go(t.relay, 'door', 'talk');
    const first = pend(t).dealt!.slice(0, 2).map((c) => c.cost);
    expect(await go(t.relay, 'door', '!take')).toMatchObject({ ok: true });
    expect(runOn(t.db, t.d)!.picks.at(-1)!.roll).toMatchObject({ costs: first.map((cost) => ({ cost, how: 'taken' })) });
  });

  it('a roll waiting from before (no deal) offers TAKE IT and lands its fixed cost', async () => {
    const t = await at({ rolls: [5] });
    await go(t.relay, 'door', 'talk');
    const run = runOn(t.db, t.d)!;
    const { dealt: _d, pick: _p, settled: _s, ...old } = run.pending as DicePending;
    t.db.setMeta(keyOn(t.d), JSON.stringify({ ...run, pending: { ...old, cost: { alarm: 1, heat: 0 } } }));
    expect(active(t.relay).choices.map((c) => c.id)).toEqual(['!take']);
    expect(active(t.relay).costs).toBeUndefined();
    await go(t.relay, 'door', '!take');
    expect(runOn(t.db, t.d)).toMatchObject({ beat: 'desk', alarm: 1 });
  });
});


describe('programs: SETUP and the hand (programs spec §2.1, §2.4)', () => {
  const contact = (id: string, name: string, spec: ContactCard['spec']): ContactCard => ({ id, name, accent: '#fff', portrait: null, spec });
  it('SETUP offers the carried deck and its slots', () => {
    expect(offerOf(relayWith({ deck: 'top-deck' }).relay)!.deck).toEqual({ name: 'Top deck', quality: 4, slots: 3 });
    expect(offerOf(relayWith({ deck: 'meridian' }).relay)!.deck).toEqual({ name: 'Cortex Meridian', quality: 3, slots: 2 });
    expect(offerOf(relayWith({ deck: 'none' }).relay)!.deck).toBeNull();
  });

  it('SETUP puts the favour and contact cards on hold', () => {
    const offer = offerOf(relayWith({ contacts: () => [contact('cass', 'Cass', 'fence')] }).relay)!;
    expect(offer.favour).toBe('ON HOLD');
    expect(offer.contacts).toEqual([]);
  });

  it('GO IN stores the deck at its slots', async () => {
    const t = relayWith({ deck: 'meridian' });
    const d = storyDay(t.relay['deps'].clockNow!() as number);
    await t.relay.startQuest('hicks', 'back-door', { approach: 'quiet', people: [], favour: false });
    expect(runOn(t.db, d)!.setup!.deck).toEqual({ id: 'meridian', quality: 3, slots: 2 });
    const none = relayWith({ deck: 'none' });
    await none.relay.startQuest('hicks', 'back-door', { approach: 'quiet', people: [], favour: false });
    expect(runOn(none.db, d)!.setup!.deck).toEqual({ id: '', quality: 1, slots: 0 });
  });

  it('a new SETUP refuses the favour and contacts', async () => {
    const t = relayWith({ contacts: () => [contact('cass', 'Cass', 'fence')] });
    expect(await t.relay.startQuest('hicks', 'back-door', { approach: 'quiet', people: [], favour: true })).toBe('the favour is on hold');
    expect(await t.relay.startQuest('hicks', 'back-door', { approach: 'quiet', people: [], favour: false, contacts: ['cass'] })).toBe('contact cards are on hold');
  });

  it('the hand lists POCKETS', async () => {
    const t = relayWith({ deck: 'meridian' });
    await t.relay.startQuest('hicks', 'back-door', { approach: 'quiet', people: [], favour: false });
    const pockets = t.relay.questState('hicks').active!.hand!.pockets!;
    expect(pockets).toMatchObject({ deck: { name: 'Cortex Meridian', quality: 3, skin: 'meridian' }, slots: 2, dead: false, loaded: [] });
    expect(pockets.catalog.map((p) => p.id)).toEqual(['solvent', 'leech', 'skeleton-key', 'voicebox', 'sniffer', 'spike', 'scrub', 'firewall']);
  });
});

// Programs tests (programs spec): a job with two TECH checks, started with a plain SETUP.
// Two TECH checks: the door on the wire (base 40, a grid check, a miss still gets in) and the desk in the open.
const PROG = job(JOB.replaceAll('- talk: Talk your way in. → inside / turned [check cool 50]', '- talk: Talk your way in. → inside / inside [check tech 40 grid]').replaceAll('- wait: Wait for the shift change. → inside [clock +1h]', '- wait: Wait for the shift change. → turned [clock +1h]').replace('[check reflex 50]', '[check tech 50]'));
// Below the tier needs a job above the deck: the same job on tier 2.
const PROG_2: QuestEntry = { ...PROG, tier: 2 };
const go = async (o: Parameters<typeof relayWith>[0] = {}) => {
  const d = plainDoor('easy');
  const r = relayWith({ book: [PROG], clock: () => evening(d), ...o });
  expect(await r.relay.startQuest('hicks', 'back-door', { approach: 'smooth', people: [], favour: false })).toMatchObject({ ok: true });
  return { ...r, d: storyDay(evening(d)) };
};
const choose = (relay: ChatRelay, beat: string, choice: string, programs: { load?: string[]; run?: string[] }) =>
  relay.chooseQuest('hicks', { id: 'back-door', beat, choice, programs: { load: programs.load ?? [], run: programs.run ?? [] } });
const settle = (relay: ChatRelay, beat: string) => settleLikeOld(relay, 'back-door', beat);

describe('programs: loading and running on a check (programs spec §1.2–1.5, §2.2)', () => {
  it('loading SOLVENT runs it and fills a slot', async () => {
    const t = await go({ rolls: [6] });
    await choose(t.relay, 'door', 'talk', { load: ['solvent'] });
    const run = runOn(t.db, t.d)!;
    expect(run.programs).toEqual([{ id: 'solvent', at: expect.any(Number), hot: true }]);
    const roll = run.picks[0].roll as { programs?: string[]; position: string };
    expect(roll.programs).toEqual(['solvent']);
    expect(roll.position).toBe('open');
  });

  it('a loaded program runs again on a later check at no cost', async () => {
    const t = await go({ rolls: [6, 6] });
    await choose(t.relay, 'door', 'talk', { load: ['solvent'] });
    const alarm = runOn(t.db, t.d)!.alarm ?? 0;
    await choose(t.relay, 'desk', 'grab', { run: ['solvent'] });
    const run = runOn(t.db, t.d)!;
    expect(run.programs).toHaveLength(1);
    expect((run.picks.at(-1)!.roll as { position: string }).position).toBe('dark');
    expect(run.alarm ?? 0).toBe(alarm);
  });

  it('a full deck refuses LOAD', async () => {
    const t = await go({ deck: 'pocket-deck', rolls: [6] });
    await choose(t.relay, 'door', 'talk', { load: ['solvent'] });
    expect(await choose(t.relay, 'desk', 'grab', { load: ['leech'] })).toBe('NO FREE SLOT');
    expect(await choose(t.relay, 'desk', 'grab', { load: ['leech', 'scrub'] })).toBe('NO FREE SLOT');
  });

  it("running what isn't loaded is refused", async () => {
    const t = await go();
    expect(await choose(t.relay, 'door', 'talk', { run: ['solvent'] })).toBe('NOT LOADED');
  });

  it('a program in load and run is refused', async () => {
    const t = await go();
    expect(await choose(t.relay, 'door', 'talk', { load: ['solvent'], run: ['solvent'] })).toBe('NOTHING TO DO HERE');
    expect(await choose(t.relay, 'door', 'talk', { load: ['solvent', 'solvent'] })).toBe('NOTHING TO DO HERE');
    expect(await choose(t.relay, 'door', 'talk', { load: ['nope'] })).toBe('NOTHING TO DO HERE');
  });

  it('a program that does nothing here is refused with why', async () => {
    const t = await go({ rolls: [6] });
    expect(await choose(t.relay, 'door', 'talk', { load: ['voicebox'] })).toBe('NOTHING TO DO HERE');
    expect(await choose(t.relay, 'door', 'talk', { load: ['firewall'] })).toBe('NOTHING TO DO HERE');
  });

  it('below-tier runs add ALARM', async () => {
    const t = await go({ book: [PROG_2], deck: 'pocket-deck', rolls: [6] });
    await choose(t.relay, 'door', 'talk', { load: ['solvent'] });
    expect(runOn(t.db, t.d)!.alarm).toBe(1);
  });

  it('SCRUB keeps HEAT +1 out of the deal', async () => {
    for (let i = 0; i < 4; i++) {
      const t = await go({ rolls: [2], deck: 'meridian' });
      await choose(t.relay, 'door', 'talk', { load: ['scrub'] });
      const p = runOn(t.db, t.d)!.pending as DicePending;
      expect(p.dealt!.map((x) => x.cost)).not.toContain('heat');
    }
  });

  it('a deck that dies on the loading roll', async () => {
    const t = await go({ rolls: [1, 6] });
    await choose(t.relay, 'door', 'talk', { load: ['solvent'] });
    await settle(t.relay, 'door');
    const run = runOn(t.db, t.d)!;
    expect((run.picks[0].roll as { programs?: string[] }).programs).toEqual(['solvent']);
    expect(run.deckDead).toBe(true);
    expect(await choose(t.relay, 'desk', 'grab', { run: ['solvent'] })).toBe('THE DECK IS DEAD');
  });

  it('rewind before a load frees the slot', async () => {
    const t = await go({ deck: 'pocket-deck', rolls: [6, 6] });
    const opening = t.db.recentMessages('hicks', 50).filter((m) => m.role === 'agent').at(-1)!;
    await choose(t.relay, 'door', 'talk', { load: ['solvent'] });
    expect(runOn(t.db, t.d)!.programs).toHaveLength(1);
    await t.relay.rewind('hicks', opening.id);
    expect(runOn(t.db, t.d)!.programs ?? []).toEqual([]);
    expect(await choose(t.relay, 'door', 'talk', { load: ['scrub'] })).toMatchObject({ ok: true });
  });

  it('a program the rest of the pick already covers is dropped, not refused (final review I1)', async () => {
    const t = await go({ deck: 'pocket-deck', rolls: [6, 6] });
    await choose(t.relay, 'door', 'talk', {});
    const alarm = runOn(t.db, t.d)!.alarm ?? 0;
    // The desk in the open: SAFE takes it into the dark, so SOLVENT would do nothing — it neither loads nor costs ALARM.
    const r = await t.relay.chooseQuest('hicks', { id: 'back-door', beat: 'desk', choice: 'grab', trade: 'safe', programs: { load: ['solvent'], run: [] } });
    expect(r).toMatchObject({ ok: true });
    const run = runOn(t.db, t.d)!;
    expect(run.programs ?? []).toEqual([]);
    expect((run.picks.at(-1)!.roll as { programs?: string[] }).programs).toBeUndefined();
    expect(run.alarm ?? 0).toBe(alarm);
  });

  it('a lacquer ALARM that fills ALARM keeps ALARM +1 out of the deal (Task 5 review M1)', async () => {
    for (let i = 0; i < 3; i++) {
      const t = await go({ book: [PROG_2], deck: 'pocket-deck', rolls: [4] });
      const run = runOn(t.db, t.d)!;
      t.db.setMeta(keyOn(t.d), JSON.stringify({ ...run, alarm: 3 }));
      await choose(t.relay, 'door', 'talk', { load: ['solvent'] });
      const p = runOn(t.db, t.d)!.pending as DicePending;
      expect(p.dealt!.map((x) => x.cost)).not.toContain('alarm');
    }
  });

  it('a load on a roll that parks lands once, through RESIST (Task 5 review)', async () => {
    const t = await go({ book: [PROG_2], deck: 'pocket-deck', rolls: [4, 6, 6, 6, 6] });
    await choose(t.relay, 'door', 'talk', { load: ['solvent'] });
    const p = runOn(t.db, t.d)!.pending as DicePending;
    for (const c of p.dealt!.slice(0, p.pick)) {
      await t.relay.chooseQuest('hicks', { id: 'back-door', beat: 'door', choice: '!cost', card: c.cost });
      await t.relay.chooseQuest('hicks', { id: 'back-door', beat: 'door', choice: '!resist', card: c.cost });
    }
    const run = runOn(t.db, t.d)!;
    expect(run.pending).toBeFalsy();
    expect(run.programs).toHaveLength(1);
    expect((run.picks[0].roll as { programs?: string[] }).programs).toEqual(['solvent']);
    expect(run.alarm).toBe(1);
  });

  it('the choice view previews each program', async () => {
    const t = await go();
    const talk = t.relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!;
    expect(talk.programs!.solvent).toEqual({ position: 'open', effect: 'fair', alarm: 0 });
    expect(talk.programs!.voicebox).toEqual({ why: 'NOTHING TO DO HERE' });
    expect(talk.programs!.firewall).toEqual({ why: 'NOTHING TO DO HERE' });
  });
});

describe('programs: FIREWALL (programs spec §2.3)', () => {
  const raw = (relay: ChatRelay, beat: string, choice: string, card?: string) => relay.chooseQuest('hicks', { id: 'back-door', beat, choice, ...(card ? { card } : {}) });
  // The door clean (loading `load`), then a 4–5 at the desk (in the open: one cost to pick), that cost picked.
  const costed = async (o: Parameters<typeof relayWith>[0] = {}, load: string[] = ['solvent']) => {
    const t = await go({ rolls: [6, 4], ...o });
    await choose(t.relay, 'door', 'talk', { load });
    await settleLikeOld(t.relay, 'back-door', 'door');
    await choose(t.relay, 'desk', 'grab', {});
    const p = runOn(t.db, t.d)!.pending as DicePending;
    await raw(t.relay, 'desk', '!cost', p.dealt![0].cost);
    return { ...t, cost: p.dealt![0].cost };
  };

  it('FIREWALL loads from the cost panel and burns', async () => {
    const t = await costed({ deck: 'meridian' });
    expect(t.relay.questState('hicks').active!.costs!.armour).toEqual({ ok: true, left: 1, load: true });
    await raw(t.relay, 'desk', '!armour', t.cost);
    const run = runOn(t.db, t.d)!;
    expect(run.programs).toEqual([{ id: 'solvent', at: expect.any(Number), hot: true }, { id: 'firewall', at: expect.any(Number), burned: true, hot: true }]);
    expect((run.picks.at(-1)!.roll as { costs?: { how: string }[] }).costs?.[0]?.how).toBe('armour');
  });

  it('FIREWALL is not offered, and refused, on a red card: a one shot stays hard', async () => {
    const red = job(JOB.replaceAll('- talk: Talk your way in. → inside / turned [check cool 50]', '- talk: Talk your way in. → inside / inside [check cool 50 red]').replaceAll('- wait: Wait for the shift change. → inside [clock +1h]', '- wait: Wait for the shift change. → turned [clock +1h]'));
    const t = await go({ book: [red], deck: 'meridian', rolls: [4] });
    await choose(t.relay, 'door', 'talk', {});
    const p = runOn(t.db, t.d)!.pending as DicePending;
    await raw(t.relay, 'door', '!cost', p.dealt![0].cost);
    expect(t.relay.questState('hicks').active!.costs!.armour).toEqual({ ok: false, left: 0 });
    expect(await raw(t.relay, 'door', '!armour', p.dealt![0].cost)).toBe('ONE SHOT');
    expect(runOn(t.db, t.d)!.programs ?? []).toEqual([]);
  });

  it('a loaded FIREWALL is offered without load', async () => {
    const t = await go({ deck: 'meridian', rolls: [4] });
    const run = runOn(t.db, t.d)!;
    t.db.setMeta(keyOn(t.d), JSON.stringify({ ...run, programs: [{ id: 'firewall', at: 1 }] }));
    await choose(t.relay, 'door', 'talk', {});
    const p = runOn(t.db, t.d)!.pending as DicePending;
    await raw(t.relay, 'door', '!cost', p.dealt![0].cost);
    expect(t.relay.questState('hicks').active!.costs!.armour).toEqual({ ok: true, left: 1 });
    await raw(t.relay, 'door', '!armour', p.dealt![0].cost);
    expect(runOn(t.db, t.d)!.programs).toEqual([{ id: 'firewall', at: 1, burned: true }]);
  });

  it('a full deck with no FIREWALL offers none', async () => {
    const t = await costed({ deck: 'pocket-deck' });
    expect(t.relay.questState('hicks').active!.costs!.armour).toEqual({ ok: false, left: 0 });
    expect(await raw(t.relay, 'desk', '!armour', t.cost)).toBe('NO FREE SLOT');
  });

  it('FIREWALL works on a non-grid check', async () => {
    const t = await go({ deck: 'meridian', rolls: [6, 4] });
    await choose(t.relay, 'door', 'talk', {});
    await settleLikeOld(t.relay, 'back-door', 'door');
    await choose(t.relay, 'desk', 'grab', {});
    const p = runOn(t.db, t.d)!.pending as DicePending;
    await raw(t.relay, 'desk', '!cost', p.dealt![0].cost);
    expect(await raw(t.relay, 'desk', '!armour', p.dealt![0].cost)).toMatchObject({ ok: true });
    expect(runOn(t.db, t.d)!.programs).toContainEqual({ id: 'firewall', at: expect.any(Number), burned: true, hot: true });
  });

  it('below-tier firewall adds alarm at the roll', async () => {
    const t = await costed({ book: [PROG_2], deck: 'pocket-deck' }, []);
    await raw(t.relay, 'desk', '!armour', t.cost);
    const run = runOn(t.db, t.d)!;
    // The roll's own position cost settled by FIREWALL, plus the lacquer's ALARM +1; nothing new dealt.
    expect(run.pending).toBeFalsy();
    expect(run.alarm).toBe(1);
  });

  it('a holding deck has no tag on a new job, and keeps it on a job from before', async () => {
    const t = await go({ deck: 'top-deck' });
    const talk = () => t.relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!;
    expect(talk().pool!.deck!.match).toBeNull();
    asOld(t.db, t.d, {});
    expect(talk().pool!.deck!.match).toBe('holds');
  });

  it("old run keeps the holding deck's armour", async () => {
    const t = await go({ deck: 'top-deck', rolls: [4] });
    asOld(t.db, t.d, {});
    await choose(t.relay, 'door', 'talk', {});
    const p = runOn(t.db, t.d)!.pending as DicePending;
    await raw(t.relay, 'door', '!cost', p.dealt![0].cost);
    expect(t.relay.questState('hicks').active!.costs!.armour).toEqual({ ok: true, left: 1 });
    await raw(t.relay, 'door', '!armour', p.dealt![0].cost);
    expect(runOn(t.db, t.d)!.armourUsed).toBe(true);
    expect(runOn(t.db, t.d)!.programs).toBeUndefined();
  });
});

describe('programs: loading at SETUP (programs spec §1.2a)', () => {
  const goWith = async (programs: string[], o: Parameters<typeof relayWith>[0] = {}) => {
    const d = plainDoor('easy');
    const r = relayWith({ book: [PROG], clock: () => evening(d), ...o });
    return { ...r, d: storyDay(evening(d)), r: await r.relay.startQuest('hicks', 'back-door', { approach: 'smooth', people: [], favour: false, programs }) };
  };

  it('SETUP offers the catalog and what the job leans on', () => {
    const offer = offerOf(relayWith({ book: [PROG], deck: 'meridian' }).relay)!;
    expect(offer.programs!.map((p) => p.id)).toEqual(['solvent', 'leech', 'skeleton-key', 'voicebox', 'sniffer', 'spike', 'scrub', 'firewall']);
    expect(offer.leans![0]).toBe('tech');
    expect(offerOf(relayWith({ book: [PROG], deck: 'none' }).relay)!.programs).toBeUndefined();
  });

  it('GO IN loads them for free', async () => {
    const t = await goWith(['solvent', 'firewall'], { deck: 'meridian', rolls: [6] });
    expect(t.r).toMatchObject({ ok: true });
    expect(runOn(t.db, t.d)!.programs).toEqual([{ id: 'solvent', at: expect.any(Number) }, { id: 'firewall', at: expect.any(Number) }]);
    await choose(t.relay, 'door', 'talk', { run: ['solvent'] });
    const run = runOn(t.db, t.d)!;
    expect((run.picks[0].roll as { programs?: string[] }).programs).toEqual(['solvent']);
    expect(run.alarm ?? 0).toBe(0);
  });

  it('a repeat loads once', async () => {
    const t = await goWith(['solvent', 'solvent'], { deck: 'meridian' });
    expect(runOn(t.db, t.d)!.programs).toEqual([{ id: 'solvent', at: expect.any(Number) }]);
  });

  it('GO IN refuses what the deck cannot hold', async () => {
    expect((await goWith(['solvent', 'leech'], { deck: 'pocket-deck' })).r).toBe('NO FREE SLOT');
    expect((await goWith(['solvent'], { deck: 'none' })).r).toBe('NO DECK');
    expect((await goWith(['nope'], { deck: 'meridian' })).r).toBe('NOT A PROGRAM');
  });

  const nerveSpent = (run: QuestRun) => (run.kit ?? []).reduce((n, e) => n + (e.nerve ?? 0), 0);

  it('a mid-job load costs 1 NERVE, no ALARM', async () => {
    const t = await go({ deck: 'meridian', rolls: [6] });
    await choose(t.relay, 'door', 'talk', { load: ['solvent'] });
    const run = runOn(t.db, t.d)!;
    expect(run.alarm ?? 0).toBe(0);
    expect(nerveSpent(run)).toBe(-1);
    expect(run.programs).toEqual([{ id: 'solvent', at: expect.any(Number), hot: true }]);
  });

  it('a SETUP load costs no NERVE', async () => {
    const t = await goWith(['solvent'], { deck: 'meridian', rolls: [6] });
    await choose(t.relay, 'door', 'talk', { run: ['solvent'] });
    expect(nerveSpent(runOn(t.db, t.d)!)).toBe(0);
  });

  it('a mid-job load with no NERVE left after PUSH is refused', async () => {
    const t = await go({ deck: 'meridian', rolls: [6], nerve: 2 });
    expect(await t.relay.chooseQuest('hicks', { id: 'back-door', beat: 'door', choice: 'talk', push: true, programs: { load: ['solvent'], run: [] } })).toBe('not enough nerve');
  });

  it('LOAD FIREWALL from a cost costs 1 NERVE, no ALARM', async () => {
    const t = await go({ deck: 'meridian', rolls: [6, 4] });
    await choose(t.relay, 'door', 'talk', {});
    await settleLikeOld(t.relay, 'back-door', 'door');
    await choose(t.relay, 'desk', 'grab', {});
    const p = runOn(t.db, t.d)!.pending as DicePending;
    await t.relay.chooseQuest('hicks', { id: 'back-door', beat: 'desk', choice: '!cost', card: p.dealt![0].cost });
    await t.relay.chooseQuest('hicks', { id: 'back-door', beat: 'desk', choice: '!armour', card: p.dealt![0].cost });
    const run = runOn(t.db, t.d)!;
    expect(run.alarm ?? 0).toBe(0);
    expect(nerveSpent(run)).toBe(-1);
    expect(run.programs).toContainEqual({ id: 'firewall', at: expect.any(Number), burned: true, hot: true });
  });
});

describe("a route's own ALARM on its card", () => {
  it('a choice that raises ALARM says so before the pick, checked or not', async () => {
    const d = plainDoor('easy');
    const book = [job(JOB.replaceAll('- wait: Wait for the shift change. → inside [clock +1h]', '- wait: Wait for the shift change. → inside [clock +1h, alarm +1]').replaceAll('→ inside / turned [check cool 50]', '→ inside / turned [check cool 50, alarm +1]'))];
    const t = relayWith({ book, clock: () => evening(d) });
    await t.relay.startQuest('hicks', 'back-door', { approach: 'quiet', people: [], favour: false });
    const cards = t.relay.questState('hicks').active!.choices;
    expect(cards.find((c) => c.id === 'wait')!.alarm).toBe(1);
    expect(cards.find((c) => c.id === 'talk')!.alarm).toBe(1);
  });
});

describe('tier cut (tier effect spec)', () => {
  const crew = { members: [member('dez', 'runner'), member('mia', 'face', {}, 0)] };
  const start = async (o: Parameters<typeof relayWith>[0] = {}) => {
    const d = plainDoor('easy');
    const r = relayWith({ book: [job(TIER_2_JOB)], clock: () => evening(d), crew, ...o });
    expect(await r.relay.startQuest('hicks', 'back-door', { approach: 'smooth', people: ['dez', 'mia'], favour: false })).toMatchObject({ ok: true });
    return { ...r, d };
  };
  const talk = (relay: ChatRelay) => relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!;
  const filled = (relay: ChatRelay) => relay.questState('hicks').active!.take!.filled;

  it('a tier 2 roll with no help fills TAKE at SMALL', async () => {
    const t = await start({ rolls: [6] });
    expect(talk(t.relay).pool!.tier).toEqual({ label: 'TIER 2 −1', lifted: false });
    expect(talk(t.relay).pool!.effect).toBe('small');
    await raw(t.relay, 'door', 'talk');
    expect(filled(t.relay)).toBe(1);
  });

  it('a HAND recruit called fills at FAIR', async () => {
    const t = await start({ rolls: [6] });
    expect(talk(t.relay).plays!.dez).toMatchObject({ effect: 'fair', tier: { label: 'DEZ · HAND', lifted: true } });
    await raw(t.relay, 'door', 'talk', 'dez');
    expect(filled(t.relay)).toBe(2);
  });

  it('a GREEN recruit called stays SMALL', async () => {
    const t = await start({ rolls: [6] });
    expect(talk(t.relay).plays!.mia).toMatchObject({ effect: 'small', tier: { label: 'TIER 2 −1', lifted: false } });
    await raw(t.relay, 'door', 'talk', 'mia');
    expect(filled(t.relay)).toBe(1);
  });

  it('a contact card called stays SMALL', async () => {
    const cass: ContactCard = { id: 'cass', name: 'Cass Okafor', accent: '#fff', portrait: null, spec: 'face' };
    const t = await start({ rolls: [6], contacts: () => [cass] });
    asOld(t.db, storyDay(evening(t.d)), { contacts: [cass] });
    expect(talk(t.relay).plays!['contact:cass']).toMatchObject({ effect: 'small' });
  });

  it('a program on a Q2 deck lifts, and its preview says so: VOICEBOX is the lift and its own step', async () => {
    const t = await start({ deck: 'stall-build', rolls: [6] });
    expect(talk(t.relay).programs!.voicebox).toMatchObject({ effect: 'big', tier: { label: 'STALL BUILD Q2', lifted: true } });
    await t.relay.chooseQuest('hicks', { id: 'back-door', beat: 'door', choice: 'talk', programs: { load: ['voicebox'], run: [] } });
    expect(filled(t.relay)).toBe(3);
  });

  it('a program on a Q1 deck leaves the cut', async () => {
    const t = await start({ deck: 'pocket-deck' });
    expect(talk(t.relay).programs!.voicebox).toMatchObject({ effect: 'fair', tier: { label: 'TIER 2 −1', lifted: false } });
  });

  it('a card below SMALL: an effect program fits only with a matching recruit called, and each card previews its own', async () => {
    const t = await start({ deck: 'pocket-deck', heat: 6 });
    expect(talk(t.relay).programs!.voicebox).toHaveProperty('why');
    expect(talk(t.relay).plays!.dez.previews!.voicebox).toMatchObject({ effect: 'fair', tier: { label: 'DEZ · HAND', lifted: true } });
  });

  it('a fragile deck that dies takes the grid lift with it: the next roll is cut', async () => {
    const grid = job(TIER_2_JOB.replaceAll('[check cool 50]', '[check tech 50 grid]').replaceAll('→ inside / turned [check tech 50 grid]', '→ inside / inside [check tech 50 grid]').replaceAll('- wait: Wait for the shift change. → inside [clock +1h]', '- wait: Wait for the shift change. → turned [clock +1h]').replace('[check reflex 50]', '[check tech 50 grid]'));
    const d = plainDoor('easy');
    const r = relayWith({ book: [grid], clock: () => evening(d), crew, deck: 'stall-build', rolls: [1] });
    await r.relay.startQuest('hicks', 'back-door', { approach: 'smooth', people: [], favour: false });
    expect(talk(r.relay).pool!.tier).toEqual({ label: 'STALL BUILD Q2', lifted: true });
    await raw(r.relay, 'door', 'talk');
    await settleLikeOld(r.relay, 'back-door', 'door');
    const grab = r.relay.questState('hicks').active!.choices.find((c) => c.id === 'grab')!;
    expect(grab.pool!.noDeck).toBe(true);
    expect(grab.pool!.tier).toEqual({ label: 'TIER 2 −1', lifted: false });
  });

  it('SAFE on a card SMALL by the cut is refused alone, allowed with a HAND recruit', async () => {
    const t = await start({ rolls: [6] });
    expect(await t.relay.chooseQuest('hicks', { id: 'back-door', beat: 'door', choice: 'talk', trade: 'safe' })).toBe('ALREADY SMALL');
    expect(await t.relay.chooseQuest('hicks', { id: 'back-door', beat: 'door', choice: 'talk', trade: 'safe', card: 'dez' })).toMatchObject({ ok: true });
  });

  it('a parked 4–5 at SMALL fills 0 when it lands, from the stored effect', async () => {
    const t = await start({ rolls: [5] });
    await raw(t.relay, 'door', 'talk');
    const pending = runOn(t.db, t.d)!.pending as DicePending;
    expect(pending.roll).toMatchObject({ kind: 'cost', effect: 'small' });
    await settleLikeOld(t.relay, 'back-door', 'door');
    expect(filled(t.relay)).toBe(0);
  });

  it('GET OUT on a tier 2 job has no tier on its pool', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ book: [job(TIER_2_JOB)], clock: () => evening(d), rolls: [2, 6], nerve: 1 });
    await r.relay.startQuest('hicks', 'back-door');
    r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, alarm: 3 }));
    await pick(r.relay, 'door', 'talk');
    const active = r.relay.questState('hicks').active!;
    expect(active.getaway).toBe(true);
    for (const c of active.choices) expect(c.pool?.tier).toBeUndefined();
  });

  it('the SETUP offer has tierLine on tier 2, none on tier 1', () => {
    expect(offerOf(relayWith({ book: [job(TIER_2_JOB)] }).relay)!.tierLine).toBe('TIER 2 · rolls run SMALL unless HAND crew or a Q2+ deck covers them');
    expect(offerOf(relayWith().relay)!.tierLine).toBeUndefined();
  });
});

describe('alarm becomes heat (tier template spec §2)', () => {
  const heatOf = (run: QuestRun) => (run.kit ?? []).reduce((n, e) => n + (e.heat ?? 0), 0);
  const OUT = JOB.replace('## inside\n*You\'re in.*\n', '## inside\n*You\'re in.*\nheat: +1\n');
  it('a heat: line in a job outcome adds nothing', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ book: [job(OUT)], clock: () => evening(d), rolls: [6] });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    expect(heatOf(runOn(r.db, d)!)).toBe(0);
  });
  it('a grid roll adds no deck heat when it lands', async () => {
    const d = plainDoor('easy');
    const grid = job(JOB.replaceAll('[check cool 50]', '[check tech 50 grid]'));
    const r = relayWith({ book: [grid], clock: () => evening(d), rolls: [6], deck: 'loud-deck' });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    expect(heatOf(runOn(r.db, d)!)).toBe(0);
  });
  // Through to the end: two crits at ALARM `alarm` (door, desk).
  const finish = async (o: Parameters<typeof relayWith>[0] & { alarm?: number } = {}) => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [66, 66], ...o });
    await r.relay.startQuest('hicks', 'back-door');
    if (o.alarm) r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, alarm: o.alarm }));
    const opening = r.db.recentMessages('hicks', 50).filter((m) => m.role === 'agent').at(-1)!;
    await pick(r.relay, 'door', 'talk');
    await pick(r.relay, 'desk', 'grab');
    return { ...r, d, opening };
  };
  it('a clean job at ALARM 1 adds 1 heat in its district, and the debrief says so', async () => {
    const t = await finish({ alarm: 1 });
    expect(t.kit().heat.karasu).toBe(1);
    expect(questRows(t.db).at(-1)!.quest!.debrief).toMatchObject({ tier: 'clean', heat: { district: 'karasu', delta: 1 } });
  });
  it('a job that leaves at ALARM 0 adds none', async () => expect((await finish()).kit().heat.karasu ?? 0).toBe(0));
  it('GET OUT adds the ALARM it ends at', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [2, 6], nerve: 1 });
    await r.relay.startQuest('hicks', 'back-door');
    r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, alarm: 3 }));
    await pick(r.relay, 'door', 'talk');
    await pick(r.relay, 'getaway', 'run');
    expect(r.kit().heat.karasu).toBe(4);
  });
  it('a blown job at ALARM 0 adds 2', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [2], nerve: 1, burner: 0 });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    expect(questRows(r.db).at(-1)!.quest!.debrief!.tier).toBe('blown');
    expect(r.kit().heat.karasu).toBe(Math.max(2, runOn(r.db, d)!.alarm ?? 0));
  });
  it('a blown job with a cover card adds its heat once, when the job ends', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [2], nerve: 1, burner: 1 });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    expect(r.kit().heat.karasu ?? 0).toBe(0);
    await pick(r.relay, 'door', '!burner');
    expect(r.kit().heat.karasu).toBe(Math.max(2, runOn(r.db, d)!.alarm ?? 0));
  });
  it('rewind across the end takes the heat back', async () => {
    const t = await finish({ alarm: 1 });
    expect(t.kit().heat.karasu).toBe(1);
    await t.relay.rewind('hicks', t.opening.id);
    expect(t.kit().heat.karasu ?? 0).toBe(0);
  });
  it('a deck’s heat lands once at the end, however many grid rolls', async () => {
    const d = plainDoor('easy');
    const grid = job(JOB.replaceAll('[check cool 50]', '[check tech 50 grid]').replace('[check reflex 50]', '[check tech 50 grid]'));
    const r = relayWith({ book: [grid], clock: () => evening(d), rolls: [66, 66], deck: 'loud-deck' });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    await pick(r.relay, 'desk', 'grab');
    expect(r.kit().heat.karasu).toBe(2);
  });
  it('no grid roll, no deck heat; a hidden deck adds none', async () => {
    expect((await finish({ deck: 'loud-deck' })).kit().heat.karasu ?? 0).toBe(0);
    const d = plainDoor('easy');
    const grid = job(JOB.replaceAll('[check cool 50]', '[check tech 50 grid]'));
    const r = relayWith({ book: [grid], clock: () => evening(d), rolls: [66, 66], deck: 'quiet-deck' });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'talk');
    await pick(r.relay, 'desk', 'grab');
    expect(r.kit().heat.karasu ?? 0).toBe(0);
  });
  it('SCRUB run on a roll takes 1 off', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [66, 66], deck: 'meridian' });
    await r.relay.startQuest('hicks', 'back-door', { approach: 'smooth', people: [], favour: false });
    r.db.setMeta(keyOn(d), JSON.stringify({ ...runOn(r.db, d)!, alarm: 1 }));
    await r.relay.chooseQuest('hicks', { id: 'back-door', beat: 'door', choice: 'talk', programs: { load: ['scrub'], run: [] } });
    await pick(r.relay, 'desk', 'grab');
    expect(r.kit().heat.karasu ?? 0).toBe(0);
  });
  it('a job from before keeps the heat it took and adds its end ALARM', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [66, 66] });
    await r.relay.startQuest('hicks', 'back-door');
    const run = runOn(r.db, d)!;
    r.db.setMeta(keyOn(d), JSON.stringify({ ...run, alarm: 1, kit: [...(run.kit ?? []), { at: evening(d), heat: 2, district: 'karasu' }] }));
    await pick(r.relay, 'door', 'talk');
    await pick(r.relay, 'desk', 'grab');
    expect(r.kit().heat.karasu).toBe(3);
  });
  it('a cracked terminal takes the tier cut: 1 on a deck below the tier, 2 on a matching one', async () => {
    const fills = async (deck: string) => {
      const d = plainDoor('easy');
      const cracked = job(TIER_2_JOB.replace('tier: 2', 'tier: 2\ntemplate: true').replace('- grab: Take it all. → paid / part [check reflex 50]', '- grab: Take it all. → paid / part [crack 5]'));
      const r = relayWith({ book: [cracked], clock: () => evening(d), rolls: [66], deck });
      await r.relay.startQuest('hicks', 'back-door');
      await pick(r.relay, 'door', 'wait');
      const before = runOn(r.db, d)!.takeFill ?? 0;
      const t = crackSetup({ seed: `${keyOn(d)}|desk|grab`, tag: { kind: 'crack', length: 5, mods: [] }, ctx: { flags: {}, trust: 'mid', warmth: 'mid', with: 'hicks', stats: HICKS, deck: DECKS.find((x) => x.id === deck) ?? null, alarm: 0 }, words: WORDS, stats: HICKS });
      const terminal = makeTerminal(t!);
      await pick(r.relay, 'desk', 'grab', [{ word: terminal.password }]);
      return (runOn(r.db, d)!.takeFill ?? 0) - before;
    };
    expect(await fills('pocket-deck')).toBe(1);
    expect(await fills('stall-build')).toBe(2);
  });
  it('a crack on a job not yet rebuilt still fills 2, and the card says what it fills', async () => {
    const d = plainDoor('easy');
    const cracked = job(TIER_2_JOB.replace('- grab: Take it all. → paid / part [check reflex 50]', '- grab: Take it all. → paid / part [crack 5]'));
    const r = relayWith({ book: [cracked], clock: () => evening(d), deck: 'pocket-deck' });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'wait');
    expect(r.relay.questState('hicks').active!.choices.find((c) => c.id === 'grab')!.crack!.take).toBe(2);
  });
  it('a no-roll pick fills no TAKE on a template job', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ book: [job(JOB.replace('tier: 1', 'template: true\ntier: 1'))], clock: () => evening(d) });
    await r.relay.startQuest('hicks', 'back-door');
    await pick(r.relay, 'door', 'wait');
    expect(runOn(r.db, d)!.takeFill ?? 0).toBe(0);
  });
  it('a waiting roll from before with HEAT +1 dealt settles', async () => {
    const d = plainDoor('easy');
    const r = relayWith({ clock: () => evening(d), rolls: [5] });
    await r.relay.startQuest('hicks', 'back-door');
    await raw(r.relay, 'door', 'talk');
    dealAs(r.db, keyOn(d), ['heat', 'take', 'worse'], 1);
    await raw(r.relay, 'door', '!cost', 'heat');
    await raw(r.relay, 'door', '!take', 'heat');
    expect(runOn(r.db, d)).toMatchObject({ beat: 'desk' });
  });
});

describe('a contract (tier 3 contracts spec §2)', () => {
  const CON = job(CONTRACT.replace('with: [mother-rot]', 'with: [nix-direct]'), 'the-contract');
  const stats = { ...HICKS };
  const start = async (o: Parameters<typeof relayWith>[0] = {}) => {
    let now = evening(3);
    const r = relayWith({ book: [CON, BACK], rep: 50, clock: () => now, stats, ...o });
    expect(await r.relay.startQuest('hicks', 'the-contract')).toMatchObject({ ok: true });
    const id = `the-contract@${r.db.metaWithPrefix('quest.hicks.the-contract@')[0].k.split('@')[1]}`;
    const run = () => parseRun(r.db.getMeta(questKey('hicks', id)))!;
    const pick = (beat: string, choice: string) => r.relay.chooseQuest('hicks', { id: 'the-contract', beat, choice });
    return { ...r, id, run, pick, later: (h: number) => (now += h * 60) };
  };
  const toNight = async (t: Awaited<ReturnType<typeof start>>, results: Record<string, 'clean' | 'messy' | 'blown'> = {}) => {
    await t.pick('offer', 'take');
    const r = t.run();
    t.db.setMeta(questKey('hicks', t.id), JSON.stringify({ ...r, contract: { ...r.contract!, results } }));
    t.later(73);
    await t.relay.playDueQuest('hicks');
  };
  const go = { approach: 'quiet' as const, people: [], favour: false };
  it('a comms: beat says so to the tabs, with no room', async () => {
    const t = await start({ book: [job(CONTRACT.replace('with: [mother-rot]', 'with: [nix-direct]').replace('# offer\n', '# offer\ncomms: yes\n'), 'the-contract'), BACK] });
    expect(t.relay.questState('hicks').active).toMatchObject({ comms: true });
    expect(t.relay.questState('hicks').active!.room).toBeUndefined();
  });

  describe('a guest (guest crew spec §2)', () => {
    const EMBER: ContactCard = { id: 'ember', name: 'Ember Zhou', accent: '#ff4f8b', portrait: null, spec: 'runner' };
    const GUEST = job(CONTRACT.replace('with: [mother-rot]', 'with: [nix-direct]').replace('posts-at: 45', 'lead: teo-debt\nguest: ember VET\nposts-at: 45'), 'the-contract');
    const withEmber = { book: [GUEST, BACK], leads: ['teo-debt'], contacts: () => [EMBER] };
    const offerFor = (t: Awaited<ReturnType<typeof start>>) => t.relay.questState('hicks').open.find((q) => q.id === 'the-contract')?.setup;
    it('is offered at SETUP on its contract', async () => {
      const t = await start(withEmber);
      await toNight(t);
      expect(offerFor(t)?.crew).toEqual([expect.objectContaining({ id: 'guest-ember', name: 'Ember Zhou', spec: 'runner', grade: 3, guest: true, art: '/contacts/ember.webp' })]);
    });
    it('not on a contract with no guest', async () => {
      const t = await start({ contacts: () => [EMBER] });
      await toNight(t);
      expect(offerFor(t)?.crew).toEqual([]);
    });
    it('no card, no guest', async () => {
      const t = await start({ ...withEmber, contacts: () => [] });
      await toNight(t);
      expect(offerFor(t)?.crew).toEqual([]);
    });
    it('no abilities for the trade, no guest', async () => {
      const t = await start({ ...withEmber, contacts: () => [{ ...EMBER, spec: 'fence' }] });
      await toNight(t);
      expect(offerFor(t)?.crew).toEqual([]);
    });
    it('goes in with her abilities and the flag', async () => {
      const t = await start(withEmber);
      await toNight(t);
      expect(await t.relay.startQuest('hicks', 'the-contract', { ...go, people: ['guest-ember'] })).toMatchObject({ ok: true });
      expect(t.run().setup).toMatchObject({ people: ['guest-ember'], guest: { id: 'ember', grade: 3, abilities: ['clean-exit', 'run-it-twice'] }, abilities: { 'guest-ember': ['clean-exit', 'run-it-twice'] } });
      expect(t.run().flags['guest.ember']).toBe('yes');
    });
    it('no flag without her', async () => {
      const t = await start(withEmber);
      await toNight(t);
      await t.relay.startQuest('hicks', 'the-contract', go);
      expect(t.run().flags['guest.ember']).toBeUndefined();
      expect(t.run().setup?.guest).toBeUndefined();
    });
    it('takes a slot', async () => {
      const t = await start(withEmber);
      await toNight(t);
      expect(await t.relay.startQuest('hicks', 'the-contract', { ...go, people: ['a', 'b', 'c', 'guest-ember'] })).toBe('at most 3 people');
    });
    const inWithHer = async (o: Parameters<typeof relayWith>[0] = {}) => {
      const t = await start({ ...withEmber, ...o });
      await toNight(t);
      await t.relay.startQuest('hicks', 'the-contract', { ...go, people: ['guest-ember'] });
      const play = (beat: string, card: string) => t.relay.chooseQuest('hicks', { id: 'the-contract', beat, choice: 'x', card });
      const hand = () => t.relay.questState('hicks').active!.hand!;
      return { ...t, play, hand };
    };
    it('is in the hand, called as a VET', async () => {
      const t = await inWithHer();
      expect(t.hand().people[0]).toMatchObject({ id: 'guest-ember', name: 'Ember Zhou', grade: 3, free: 1, risk: null, guest: true, art: '/contacts/ember.webp' });
      expect(t.hand().people[0].abilities.map((a) => a.id)).toEqual(['clean-exit', 'run-it-twice']);
    });
    it('covers the tier cut', async () => {
      const t = await inWithHer();
      const x = t.relay.questState('hicks').active!.choices.find((c) => c.id === 'x')!;
      expect(x.plays!['guest-ember']).toMatchObject({ tier: { label: 'EMBER · VET', lifted: true } });
    });
    it('refuses a second call', async () => {
      const t = await inWithHer({ rolls: [6, 6, 6] });
      expect(await t.play('night', 'guest-ember')).toMatchObject({ ok: true });
      expect(t.hand().people[0]).toMatchObject({ free: 0, risk: null });
      expect(await t.play('n1', 'guest-ember')).toBe('EMBER IS SPENT');
    });
    const after = (t: Awaited<ReturnType<typeof inWithHer>>, beat: string) => t.relay.chooseQuest('hicks', { id: 'the-contract', beat, choice: '!after', card: 'guest-ember/run-it-twice' });
    it('Run It Twice lights on a waiting roll and the second result stands', async () => {
      const t = await inWithHer({ rolls: [4], rerun: [2] });
      await t.pick('night', 'x');
      expect(t.hand().people[0].abilities.find((a) => a.id === 'run-it-twice')).toMatchObject({ playable: true, used: false });
      expect(await after(t, 'night')).toMatchObject({ ok: true });
      expect((t.run().pending as { roll: { rerun?: true; faces: number[] } }).roll).toMatchObject({ rerun: true, faces: [2] });
    });
    it('Run It Twice plays once, and leaves her call', async () => {
      const t = await inWithHer({ rolls: [4, 4], rerun: [6, 6] });
      await t.pick('night', 'x');
      await after(t, 'night');
      expect(t.hand().people[0]).toMatchObject({ free: 1 });
      expect(t.hand().people[0].abilities.find((a) => a.id === 'run-it-twice')).toMatchObject({ used: true, playable: false });
    });
    it('stays on the job when the lead is rewound', async () => {
      let cards = [EMBER];
      const t = await inWithHer({ contacts: () => cards });
      cards = [];
      expect(t.hand().people.map((p) => p.id)).toEqual(['guest-ember']);
    });
    it('the debrief names her, with no stray id', async () => {
      const t = await inWithHer({ rolls: [6, 6, 6, 6, 6, 6, 6] });
      await t.play('night', 'guest-ember');
      for (const b of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6']) await t.pick(b, 'x');
      const debrief = questRows(t.db).findLast((r) => r.quest?.debrief)!.quest!.debrief!;
      expect(debrief.people).toContainEqual(expect.objectContaining({ name: 'EMBER', art: '/contacts/ember.webp' }));
      expect(JSON.stringify(debrief)).not.toContain('guest-ember');
    });
    it('a beat with a song says so while the run is on it', async () => {
      const SONG = job(CONTRACT.replace('with: [mother-rot]', 'with: [nix-direct]').replace('# offer\n\n*He turns', '# offer\nsong: Spectra Says\n\n*He turns'), 'the-contract');
      const t = await start({ book: [SONG, BACK] });
      expect(t.relay.questState('hicks').active?.song).toBe('Spectra Says');
      await t.pick('offer', 'take');
      expect(t.relay.questState('hicks').active?.song).toBeUndefined();
    });
    it('a running contract keeps its art on ELSEWHERE', async () => {
      const ART = job(CONTRACT.replace('with: [mother-rot]', 'with: [nix-direct]').replace('kind: contract', 'kind: contract\nart: the-contract.webp'), 'the-contract');
      const t = await start({ book: [ART, BACK] });
      await t.pick('offer', 'take');
      expect(t.relay.questState('hicks').arc?.art).toBe('/api/quests/art/the-contract.webp');
    });
    it('a beat with a room says so while the run is on it, with the guest brought', async () => {
      const ROOM = job(CONTRACT.replace('with: [mother-rot]', 'with: [nix-direct]').replace('posts-at: 45', 'lead: teo-debt\nguest: ember VET\nposts-at: 45').replace('# n1\n', '# n1\nroom: nexus/spectra-archive\n'), 'the-contract');
      const t = await inWithHer({ book: [ROOM, BACK], rolls: [6, 6, 6] });
      expect(t.relay.questState('hicks').active?.room).toBeUndefined();
      await t.pick('night', 'x');
      expect(t.relay.questState('hicks').active).toMatchObject({ room: 'nexus/spectra-archive', roomGuest: 'ember' });
      await t.pick('n1', 'x');
      expect(t.relay.questState('hicks').active?.room).toBeUndefined();
    });
    it('a song with a condition plays only when it holds', async () => {
      const SONG = job(CONTRACT.replace('with: [mother-rot]', 'with: [nix-direct]').replace('# offer\n\n*He turns', '# offer\nsong: Spectra Says if played=yes\n\n*He turns'), 'the-contract');
      const t = await start({ book: [SONG, BACK] });
      expect(t.relay.questState('hicks').active?.song).toBeUndefined();
      t.db.setMeta(questKey('hicks', t.id), JSON.stringify({ ...t.run(), flags: { played: 'yes' } }));
      expect(t.relay.questState('hicks').active?.song).toBe('Spectra Says');
    });
    it('the debrief names what she played (final review M2)', async () => {
      const t = await inWithHer({ rolls: [4, 6, 6, 6, 6, 6, 6], rerun: [6] });
      await t.pick('night', 'x');
      await after(t, 'night');
      await t.pick('night', '!take');
      for (const b of ['n1', 'n2', 'n3', 'n4', 'n5', 'n6']) await t.pick(b, 'x');
      const debrief = questRows(t.db).findLast((r) => r.quest?.debrief)!.quest!.debrief!;
      expect(JSON.stringify(debrief)).toContain('EMBER TOOK THE WIRE · RUN IT TWICE');
    });
    it('someone tied to the contact gets met=yes with no rows in their room (final review M6)', async () => {
      const r = relayWith({ book: [CON], rep: 50, tie: 'Lives down the hall.' });
      await r.relay.startQuest('hicks', 'the-contract');
      const key = r.db.metaWithPrefix('quest.hicks.the-contract@')[0].k;
      expect(parseRun(r.db.getMeta(key))!.flags.met).toBe('yes');
    });
    it('a recruit given at the fallout is announced (final review M3)', async () => {
      const GIFT = job(CONTRACT.replace('with: [mother-rot]', 'with: [nix-direct]').replace("*That's that.*\n→ end", "*That's that.*\ngives: recruit face HAND\n→ end"), 'the-contract');
      const t = await start({ book: [GIFT, BACK], rolls: [6, 6, 6, 6, 6, 6, 6] });
      await toNight(t);
      await t.relay.startQuest('hicks', 'the-contract', go);
      for (const b of ['night', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6']) await t.pick(b, 'x');
      t.later(49);
      await t.relay.playDueQuest('hicks');
      await t.pick('fallout', 'nod');
      expect(t.events.some((e) => e.type === 'notice' && e.text.includes('CREW → HIRE'))).toBe(true);
    });
    it('a run from before guests still parses', async () => {
      const t = await start(withEmber);
      await toNight(t);
      await t.relay.startQuest('hicks', 'the-contract', go);
      expect(parseRun(JSON.stringify(t.run()))?.setup?.guest).toBeUndefined();
    });
  });
  it('a stored run gone from the book, with an old big job state, loads and shows no row', () => {
    const r = relayWith({ book: [BACK], rep: 50 });
    const big = { section: 'legwork', started: 0, marks: [], visited: [], clues: [] };
    const key = questKey('hicks', 'north-gate@3');
    r.db.setMeta(key, JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags: {}, done: false, at: 1, big }));
    expect(parseRun(r.db.getMeta(key))).toMatchObject({ beat: null, done: false });
    const s = r.relay.questState('hicks');
    expect(s.changed).toBeNull();
    expect(JSON.stringify(s)).not.toContain('north-gate');
  });
  it('starts with no SETUP, and the offer leaves it waiting', async () => {
    const t = await start();
    expect(t.run().beat).toBe('offer');
    expect(t.run().setup).toBeUndefined();
    await t.pick('offer', 'take');
    expect(t.run()).toMatchObject({ beat: null, done: false, contract: { stage: 'waiting' } });
    expect(t.run().wait).not.toBeNull();
  });
  it('says to send your crew, once, when the offer opens the wait', async () => {
    const t = await start();
    const notes = () => t.events.filter((e) => e.type === 'notice' && e.text.includes('SEND YOUR CREW'));
    t.relay.emitQuestState('hicks');
    expect(notes()).toEqual([]);
    await t.pick('offer', 'take');
    t.relay.emitQuestState('hicks');
    expect(notes()).toMatchObject([{ text: '// THE TEST CONTRACT — SEND YOUR CREW (CREW → ERRANDS)', for: 'quest' }]);
  });
  it("doesn't say it again in a room built later: another room heard it", async () => {
    const t = await start();
    const notes = () => t.events.filter((e) => e.type === 'notice' && e.text.includes('SEND YOUR CREW'));
    t.relay['deps'].quests!.heard = (key: string) => key.startsWith('contractSend.');
    await t.pick('offer', 'take');
    t.relay.emitQuestState('hicks');
    expect(notes()).toEqual([]);
  });
  it("isn't offered under its rep, or again once taken", async () => {
    const low = relayWith({ book: [CON], rep: 44 });
    expect(low.relay.questState('hicks').open.map((o) => o.id)).not.toContain('the-contract');
    const t = await start();
    expect(t.relay.questState('hicks').open.map((o) => o.id)).not.toContain('the-contract');
  });
  it('while it waits: gear, and other jobs', async () => {
    const t = await start({ sol: 5000 });
    await t.pick('offer', 'take');
    expect(t.relay.buy('hicks', 'pocket-deck')).toMatchObject({ ok: true });
    expect(t.relay.questState('hicks').open.map((o) => o.id)).toContain('back-door');
  });
  it("nothing rolls at the wait's end until GO IN", async () => {
    const t = await start();
    await toNight(t);
    expect(t.run()).toMatchObject({ beat: null, contract: { stage: 'night' } });
    expect(t.run().setup).toBeUndefined();
    expect(t.run().takeFill ?? 0).toBe(0);
  });
  it('GO IN: what groundwork left, ALARM capped at 2, the night begins', async () => {
    const t = await start();
    await toNight(t, { boat: 'messy', roof: 'blown' });
    expect(await t.relay.startQuest('hicks', 'the-contract', go)).toMatchObject({ ok: true });
    expect(t.run()).toMatchObject({ beat: 'night', alarm: 2 });
    expect(t.run().flags).toMatchObject({ 'angle.boat': 'yes', seen: 'yes' });
    const h = await start();
    await toNight(h, { boat: 'messy', roof: 'messy' });
    await h.relay.startQuest('hicks', 'the-contract', { ...go, approach: 'hard' });
    expect(h.run().alarm).toBe(2);
  });
  it('TAKE starts at 0 at GO IN, whatever the offer and reports were', async () => {
    const t = await start({ rolls: [6] });
    await toNight(t);
    await t.relay.startQuest('hicks', 'the-contract', go);
    expect(t.run().takeFill).toBe(0);
    await t.pick('night', 'x');
    expect(t.run().takeFill).toBeLessThanOrEqual(2);
  });
  it('a piece landing after the wait ended still counts at GO IN', async () => {
    let reports: Record<string, { band: string; line: string }> = {};
    const crew = { get reports() { return reports; } } as unknown as Partial<CrewState>;
    const t = await start({ crew });
    await toNight(t);
    reports = { [`${t.id}:boat`]: { band: 'blown', line: 'Lost it.' } };
    await t.relay.startQuest('hicks', 'the-contract', go);
    expect(t.run()).toMatchObject({ alarm: 1 });
    expect(t.run().flags.seen).toBe('yes');
  });
  it('GO IN waits for a job at a beat', async () => {
    const t = await start();
    await toNight(t);
    await t.relay.startQuest('hicks', 'back-door', go);
    expect(await t.relay.startQuest('hicks', 'the-contract', go)).toBe('finish what you started first');
  });
  it('the night pays by TAKE, and rep is the tier\'s', async () => {
    const t = await start({ rolls: [6, 6, 6, 6, 6, 6, 6] });
    await toNight(t);
    await t.relay.startQuest('hicks', 'the-contract', go);
    for (const b of ['night', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6']) await t.pick(b, 'x');
    expect(t.run().takeFill).toBeGreaterThan(0);
    expect(t.kit().sol).toBeGreaterThan(0);
  });
  describe('groundwork reports (tier 3 contracts spec §3)', () => {
    const landed = (band: 'clean' | 'messy' | 'blown', id: string) => ({ reports: { [`${id}:boat`]: { band, line: 'Dez went.' } } });
    const open = async (band: 'clean' | 'messy' | 'blown') => {
      let reports: Record<string, { band: string; line: string }> = {};
      const crew = { get reports() { return reports; } } as unknown as Partial<CrewState>;
      const t = await start({ crew });
      await t.pick('offer', 'take');
      reports = landed(band, t.id).reports;
      await t.relay.playDueQuest('hicks');
      return t;
    };
    it('a landed piece plays its report, on its band, and sets the choice', async () => {
      const t = await open('blown');
      expect(t.run()).toMatchObject({ beat: 'report-boat', contract: { reported: ['boat'], results: { boat: 'blown' } } });
      expect(t.relay.questState('hicks').active!.choices.map((c) => c.id)).toEqual(['leave', 'burn']);
      await t.pick('report-boat', 'burn');
      expect(t.run()).toMatchObject({ beat: null, contract: { stage: 'waiting' } });
      expect(t.run().flags['boat-burned']).toBe('yes');
      expect(t.run().wait).not.toBeNull();
    });
    it('says who has a report, once, until it plays', async () => {
      let reports: Record<string, { band: string; line: string }> = {};
      const crew = { get reports() { return reports; } } as unknown as Partial<CrewState>;
      const t = await start({ crew });
      await t.pick('offer', 'take');
      const notes = () => t.events.filter((e) => e.type === 'notice' && e.text.includes('A REPORT IS IN')).map((e) => (e as { text: string }).text);
      t.relay.emitQuestState('hicks');
      expect(notes()).toEqual([]);
      reports = landed('clean', t.id).reports;
      t.relay.emitQuestState('hicks');
      t.relay.emitQuestState('hicks');
      expect(notes()).toEqual([`// THE TEST CONTRACT — A REPORT IS IN. IT'S WITH ${t.relay['deps'].quests!.contactName('nix-direct').toUpperCase()}.`]);
    });
    // The choice cut straight to chat: the table closed and nobody answered it (playtest).
    it('she answers a pick that goes back to the wait', async () => {
      const t = await open('clean');
      await t.pick('report-boat', 'leave');
      const rows = t.db.allMessages('hicks');
      const row = rows.findLast((m) => m.mode === 'quest' && m.role === 'user')!;
      expect(row.quest).toMatchObject({ waiting: true });
      expect(row.quest!.silent).toBeUndefined();
      expect(rows.at(-1)).toMatchObject({ role: 'agent', replyTo: row.id });
    });
    it('a report plays once', async () => {
      const t = await open('clean');
      await t.pick('report-boat', 'leave');
      await t.relay.playDueQuest('hicks');
      expect(t.run().beat).toBeNull();
    });
    it('the wait keeps its hour through a report', async () => {
      const t = await open('clean');
      const from = t.run().contract!.wait!.from;
      await t.pick('report-boat', 'leave');
      expect(t.run().wait!.from).toBe(from);
    });
    it('the last report picked after the hour brings the night: nothing else would (the pick is silent)', async () => {
      const t = await open('clean');
      t.later(73);
      await t.pick('report-boat', 'leave');
      expect(t.run()).toMatchObject({ beat: null, wait: null, contract: { stage: 'night' } });
    });
    it('a report picked before the hour leaves the wait', async () => {
      const t = await open('clean');
      await t.pick('report-boat', 'leave');
      expect(t.run()).toMatchObject({ contract: { stage: 'waiting' } });
    });
    it('a second report comes up on the first one\'s pick', async () => {
      let reports: Record<string, { band: string; line: string }> = {};
      const crew = { get reports() { return reports; } } as unknown as Partial<CrewState>;
      const t = await start({ crew });
      await t.pick('offer', 'take');
      reports = { [`${t.id}:boat`]: { band: 'clean', line: 'Dez went.' }, [`${t.id}:roof`]: { band: 'clean', line: 'Ade went.' } };
      await t.relay.playDueQuest('hicks');
      await t.pick('report-boat', 'leave');
      expect(t.run()).toMatchObject({ beat: 'report-roof', contract: { reported: ['boat', 'roof'] } });
    });
    it('what it brought back reaches the night', async () => {
      const t = await open('messy');
      await t.pick('report-boat', 'leave');
      t.later(73);
      await t.relay.playDueQuest('hicks');
      await t.relay.startQuest('hicks', 'the-contract', go);
      expect(t.run()).toMatchObject({ alarm: 1 });
      expect(t.run().flags['angle.boat']).toBe('yes');
    });
  });
  describe('RUMORS (tier 3 contracts spec §5)', () => {
    const other = () => job(CONTRACT, 'the-contract');
    const rumors = (r: ReturnType<typeof relayWith>) => r.relay.questState('hicks').rumors ?? [];
    describe('opened by a lead', () => {
      const CON_LED = job(CONTRACT.replace('posts-at: 45', 'lead: teo-debt\nposts-at: 45'), 'the-contract');
      const HERE_LED = job(CONTRACT.replace('with: [mother-rot]', 'with: [nix-direct]').replace('posts-at: 45', 'lead: teo-debt\nposts-at: 45'), 'the-contract');
      it('nothing without the lead, whatever your rep', () => {
        expect(rumors(relayWith({ book: [CON_LED], rep: 90 }))).toEqual([]);
      });
      it('with the lead and short of rep: listed with the rep it needs, and not on the board', () => {
        const r = relayWith({ book: [HERE_LED], rep: 30, leads: ['teo-debt'] });
        expect(rumors(r)).toHaveLength(1);
        expect(rumors(r)[0]).toMatchObject({ id: 'the-contract', needs: 45 });
        expect(r.relay.questState('hicks').open.map((q) => q.id)).not.toContain('the-contract');
      });
      it('with the lead and the rep: nothing owed, and it starts', async () => {
        const r = relayWith({ book: [HERE_LED], rep: 45, leads: ['teo-debt'] });
        expect(rumors(r)[0].needs).toBeUndefined();
        expect(await r.relay.startQuest('hicks', 'the-contract')).toMatchObject({ ok: true });
      });
      it("the rep alone doesn't start it", async () => {
        const r = relayWith({ book: [HERE_LED], rep: 90 });
        expect(await r.relay.startQuest('hicks', 'the-contract')).not.toMatchObject({ ok: true });
      });
    });
    it('none under its rep; at it, the rumor and not the pitch', () => {
      expect(rumors(relayWith({ book: [other()], rep: 44 }))).toEqual([]);
      const [row] = rumors(relayWith({ book: [other()], rep: 45 }));
      expect(row).toMatchObject({ id: 'the-contract', line: 'Mother Rot has been asking after you.', contact: 'mother-rot', here: false });
      expect(row.leaving).not.toBeNull();
    });
    it('your best rep anywhere counts, not just its own district', () => {
      const away = job(CONTRACT.replace('starts: haes-noodles', 'starts: second-socket'), 'the-contract');
      expect(rumors(relayWith({ book: [away], rep: 45 }))).toHaveLength(1);
    });
    it('with them at the place: here, and it starts', async () => {
      const r = relayWith({ book: [CON], rep: 45 });
      expect(rumors(r)[0]).toMatchObject({ here: true, leaving: null });
      expect(await r.relay.startQuest('hicks', 'the-contract')).toMatchObject({ ok: true });
      expect(rumors(r)).toEqual([]);
    });
    it('someone who knows them gets met=yes on the offer', async () => {
      const first = await start();
      expect(first.run().flags.met).toBeUndefined();
      const r = relayWith({ book: [CON], rep: 50 });
      r.db.insertMessage('hicks', { id: 'x', role: 'user', text: 'Hi.', toolLines: [], ts: 1, status: 'ok', mode: 'text' });
      await r.relay.startQuest('hicks', 'the-contract');
      const key = r.db.metaWithPrefix('quest.hicks.the-contract@')[0].k;
      expect(parseRun(r.db.getMeta(key))!.flags.met).toBe('yes');
    });
    it('not for the player it belongs to', () => {
      const own = job(CONTRACT.replace('with: [mother-rot]', 'with: [hicks]'), 'the-contract');
      expect(rumors(relayWith({ book: [own], rep: 45 }))).toEqual([]);
    });
    it('reads rep as the boards do, at 06:00', () => {
      const r = relayWith({ book: [other()], rep: 45 });
      const seen: (number | undefined)[] = [];
      const kit = r.relay['deps'].quests!.kit!;
      r.relay['deps'].quests!.kit = (p: string, at?: number) => (seen.push(at), kit(p, at));
      r.relay.questState('hicks');
      expect(seen.filter((a) => a !== undefined).length).toBeGreaterThan(0);
    });
    it('says so once', () => {
      const r = relayWith({ book: [other()], rep: 45 });
      r.relay.emitQuestState('hicks');
      r.relay.emitQuestState('hicks');
      const notes = r.events.filter((e) => e.type === 'notice' && e.text.includes('A RUMOR'));
      expect(notes).toHaveLength(1);
    });
  });
  describe('fallout (tier 3 contracts spec §4)', () => {
    const rolled = async (rolls: number[], gives = '') => {
      const book = gives ? job(CONTRACT.replace('with: [mother-rot]', 'with: [nix-direct]').replace('## done\n*That\'s that.*\n', `## done\n*That's that.*\n${gives}\n`), 'the-contract') : undefined;
      const t = await start({ rolls, ...(book ? { book: [book] } : {}) });
      await toNight(t);
      await t.relay.startQuest('hicks', 'the-contract', go);
      for (const b of ['night', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6']) await t.pick(b, 'x');
      return t;
    };
    it('pay, rep and the debrief land at the night; the run waits on', async () => {
      const t = await rolled([6, 6, 6, 6, 6, 6, 6]);
      expect(t.run()).toMatchObject({ done: false, beat: null, contract: { stage: 'fallout' } });
      expect(t.run().flags.grade).toBe('clean');
      expect(t.kit().sol).toBeGreaterThan(0);
      expect(t.kit().rep.karasu).toBe(65);
      expect(questRows(t.db).filter((r) => r.quest?.debrief)).toHaveLength(1);
    });
    it('it plays after its wait, on the grade, with no second debrief or pay', async () => {
      const t = await rolled([6, 6, 6, 6, 6, 6, 1]);
      dealAs(t.db, questKey('hicks', t.id), [], 0);
      await t.pick('n6', '!take');
      expect(t.run().flags.grade).toBe('blown');
      const sol = t.kit().sol;
      await t.relay.playDueQuest('hicks');
      expect(t.run().beat).toBeNull();
      t.later(49);
      await t.relay.playDueQuest('hicks');
      expect(t.run().beat).toBe('fallout');
      expect(questRows(t.db).at(-1)!.text).toContain('badly');
      await t.pick('fallout', 'nod');
      expect(t.run().done).toBe(true);
      expect(t.kit().sol).toBe(sol);
      expect(questRows(t.db).filter((r) => r.quest?.debrief)).toHaveLength(1);
    });
    it('gives: lands at the fallout, once', async () => {
      const t = await rolled([6, 6, 6, 6, 6, 6, 6], 'gives: deck meridian');
      expect(t.kit().owned).not.toContain('meridian');
      t.later(49);
      await t.relay.playDueQuest('hicks');
      await t.pick('fallout', 'say');
      expect(t.kit().owned).toContain('meridian');
      await t.relay.playDueQuest('hicks');
      expect(t.run().done).toBe(true);
    });
    it('gives: recruit lands when it closes', async () => {
      const t = await rolled([6, 6, 6, 6, 6, 6, 6], 'gives: recruit runner HAND');
      t.later(49);
      await t.relay.playDueQuest('hicks');
      await t.pick('fallout', 'say');
      expect(t.run()).toMatchObject({ done: true, recruit: { spec: 'runner' } });
      expect(t.run().contract!.closedAt).toBeGreaterThan(0);
    });
    it("the room isn't tense through the wait", async () => {
      const t = await rolled([6, 6, 6, 6, 6, 6, 6]);
      t.db.setMeta(questKey('hicks', t.id), JSON.stringify({ ...t.run(), alarm: 2 }));
      expect(t.relay.jobOn('hicks')).toBe(false);
    });
    it('a report still out at the end holds until the fallout is due', async () => {
      let reports: Record<string, { band: string; line: string }> = {};
      const crew = { get reports() { return reports; } } as unknown as Partial<CrewState>;
      const t = await start({ crew, rolls: [6, 6, 6, 6, 6, 6, 6] });
      await toNight(t);
      await t.relay.startQuest('hicks', 'the-contract', go);
      for (const b of ['night', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6']) await t.pick(b, 'x');
      reports = { [`${t.id}:boat`]: { band: 'clean', line: 'Back.' } };
      await t.relay.playDueQuest('hicks');
      expect(t.run().beat).toBeNull();
      t.later(49);
      await t.relay.playDueQuest('hicks');
      expect(t.run().beat).toBe('report-boat');
    });
    it('while it waits: jobs and gear carry on', async () => {
      const t = await rolled([6, 6, 6, 6, 6, 6, 6]);
      expect(t.relay.questState('hicks').open.map((o) => o.id)).toContain('back-door');
    });
  });
  describe('what you and your contact see (tier 3 contracts spec §2, §4)', () => {
    const openRow = (t: { relay: ChatRelay }) => t.relay.questState('hicks').open.find((o) => o.id === 'the-contract');
    it('the offer has no SETUP; the night does, wherever you are', async () => {
      const r = relayWith({ book: [CON], rep: 50 });
      expect(r.relay.questState('hicks').open.find((o) => o.id === 'the-contract')).toMatchObject({ mission: { tier: 3 } });
      expect(r.relay.questState('hicks').open.find((o) => o.id === 'the-contract')!.setup).toBeUndefined();
      const t = await start();
      await toNight(t);
      expect(openRow(t)!.setup).toBeDefined();
    });
    it("the panel counts down to the night, then says it's tonight", async () => {
      const t = await start();
      await t.pick('offer', 'take');
      expect(t.relay.questState('hicks').arc!.next).toMatch(/^The night is in \d+h\.$/);
      t.later(74);
      expect(t.relay.questState('hicks').arc!.next).toBe("It's tonight.");
    });
    it('the panel shows each piece while it waits', async () => {
      const t = await start();
      await t.pick('offer', 'take');
      const s = t.relay.questState('hicks');
      expect(s.waiting).toBeNull();
      expect(s.arc).toMatchObject({ stage: 'waiting', walk: true, pieces: [{ id: 'boat', spec: 'muscle', state: 'open' }, { id: 'roof', spec: 'ears', state: 'open' }, { id: 'goodwill', spec: 'face', state: 'open' }] });
    });
    it('her line says where it stands', () => {
      expect(contractBlock({ title: 'T', stage: 'waiting', left: 120, found: ['boat'], grade: null })).toBe('[job — T: the contract they took from you. The night is in 2h. Groundwork back: boat.]');
      expect(contractBlock({ title: 'T', stage: 'night', left: 0, found: [], grade: null })).toBe("[job — T: the contract they took from you. It's tonight.]");
      expect(contractBlock({ title: 'T', stage: 'fallout', left: 0, found: [], grade: 'messy' })).toBe("[job — T: the contract they took from you. It got done, but it went wrong somewhere. It isn't over yet.]");
    });
  });
  it('the offer gets no setting-out note; the night does', async () => {
    const t = await start();
    const note = (t.relay as unknown as { missionNote(r: unknown): string | null }).missionNote.bind(t.relay);
    expect(note({ quest: { id: 'the-contract', beat: 'offer', run: t.id } })).toBeNull();
    await toNight(t);
    await t.relay.startQuest('hicks', 'the-contract', go);
    expect(note({ quest: { id: 'the-contract', beat: 'night', run: t.id } })).toContain('setting out');
  });
  it('a walked-away contract is no job done together', async () => {
    const t = await start();
    await t.pick('offer', 'take');
    await t.relay.walkAway('hicks', 'the-contract');
    expect((t.relay as unknown as { jobsWithLine(): string | null }).jobsWithLine()).toBeNull();
  });
  describe('The Subtraction, end to end', () => {
    const REAL = job(fs.readFileSync('world/quests/the-subtraction.md', 'utf8').replace('with: [mother-rot]', 'with: [nix-direct]').replace('starts: counting-house', 'starts: haes-noodles'), 'the-subtraction');
    it.each([['finish', 'done-finish', 'sit'], ['go', 'done-go', 'nod'], ['keep', 'done-keep', 'eat']] as const)('the turn %s plays to its fallout', async (turn, _done, last) => {
      let reports: Record<string, { band: string; line: string }> = {};
      const crew = { get reports() { return reports; } } as unknown as Partial<CrewState>;
      let now = evening(3);
      const r = relayWith({ book: [REAL], rep: 50, clock: () => now, crew, rolls: [6, 6, 6, 6, 6, 6, 6] });
      // Her answer to a pick back to the wait ends by playing what's due, in the background.
      const pick = async (beat: string, choice: string) => {
        while (r.relay.busy) await new Promise((res) => setTimeout(res, 0));
        return r.relay.chooseQuest('hicks', { id: 'the-subtraction', beat, choice });
      };
      expect(await r.relay.startQuest('hicks', 'the-subtraction')).toMatchObject({ ok: true });
      const id = r.db.metaWithPrefix('quest.hicks.the-subtraction@')[0].k.slice('quest.hicks.'.length);
      const run = () => parseRun(r.db.getMeta(questKey('hicks', id)))!;
      expect(await pick('offer', 'ask')).toMatchObject({ ok: true });
      expect(await pick('opened', 'yes')).toMatchObject({ ok: true });
      reports = { [`${id}:roof`]: { band: 'clean', line: 'Done.' }, [`${id}:goodwill`]: { band: 'messy', line: 'Done, loud.' } };
      await r.relay.playDueQuest('hicks');
      expect(await pick('report-roof', 'bring')).toMatchObject({ ok: true });
      await r.relay.playDueQuest('hicks');
      expect(await pick('report-goodwill', 'stop')).toMatchObject({ ok: true });
      now += 73 * 60;
      await r.relay.playDueQuest('hicks');
      expect(await r.relay.startQuest('hicks', 'the-subtraction', { approach: 'quiet', people: [], favour: false })).toMatchObject({ ok: true });
      expect(run().alarm).toBe(1);
      for (const [b, c] of [['night', 'pole'], ['fence', 'wire'], ['bays', 'gantry'], ['floor', 'hat'], ['find', 'read']]) expect(await pick(b, c)).toMatchObject({ ok: true });
      expect(run().beat).toBe('turn');
      expect(await pick('turn', turn)).toMatchObject({ ok: true });
      expect(await pick('out', 'run')).toMatchObject({ ok: true });
      expect(await pick('last', 'talk')).toMatchObject({ ok: true });
      expect(run().contract!.stage).toBe('fallout');
      now += 49 * 60;
      await r.relay.playDueQuest('hicks');
      expect(run().beat).toBe('fallout');
      expect(await pick('fallout', last)).toMatchObject({ ok: true });
      expect(run().done).toBe(true);
      if (turn === 'go') expect(run().recruit).toMatchObject({ spec: 'ears' });
      // Outfits as rewards: every ending but the blown one opens Hicks's tie, and the notice says where to wear it.
      expect((run().kit ?? []).some((e) => e.outfit === 'hicks/tie')).toBe(true);
      expect(r.events.some((e) => e.type === 'notice' && e.text === '// NEW OUTFIT · HICKS · TIE (YOU → WARDROBE)')).toBe(true);
      // The fallout has no debrief: its ending row carries the line for the end card.
      expect(questRows(r.db).at(-1)!.quest!.rewards).toEqual(['OUTFIT · HICKS · TIE']);
    });
  });
  it('WALK AWAY: while it waits, for rep; not once in', async () => {
    const t = await start();
    await t.pick('offer', 'take');
    const before = t.kit().rep.karasu ?? 0;
    expect(await t.relay.walkAway('hicks', 'the-contract')).toMatchObject({ ok: true });
    expect(t.run().done).toBe(true);
    expect(t.kit().rep.karasu).toBe(before - 5);
    const n = await start();
    await toNight(n);
    await n.relay.startQuest('hicks', 'the-contract', go);
    expect(await n.relay.walkAway('hicks', 'the-contract')).toBe("you can't walk away now");
  });
});
