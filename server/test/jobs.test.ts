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
import { MISSION_CLOSE, QUEST_INSTRUCTIONS } from '../src/instructions';
import { Journal } from '../src/journal';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import { generateScenes } from '../../tools/gen-placeholders';
import { flagsOf, parseQuestFile, parseRun, questKey, type QuestEntry, type QuestStatus } from '../../shared/quests';
import { JOB, TRAIL } from '../../shared/quests.fixture';
import { foldKit, heatIn, type KitEvent } from '../../shared/mission';
import type { Deck } from '../../shared/gear';
import { edgeMax, type Stats } from '../../shared/stats';
import { storyDay } from '../../shared/board';
import { makeTerminal, parseWords } from '../../shared/crack';
import { crackSetup, drawsFor } from '../src/mission-run';
import { DEFAULT_STATS } from '../../shared/stats';
import { fixerKey, parseFixer, parseStock } from '../../shared/stock';
import type { CrewState } from '../../shared/crew-fold';
import { payFor } from '../src/mission-run';

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
const dbs: Db[] = [];
afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
});

const DECKS: Deck[] = [
  { id: 'stall-build', name: 'Stall build', bonus: 15, heat: 0, traits: ['fragile'], skin: 'slab' },
  { id: 'pocket-deck', name: 'Pocket deck', bonus: 10, heat: 0, traits: [] },
];
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
function relayWith(o: { rolls?: number[]; book?: QuestEntry[]; stats?: Stats; clock?: () => number; burner?: number; rep?: number; sol?: number; crew?: Partial<CrewState>; onLiveClock?: (relay: ChatRelay) => void } = {}) {
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
  ];
  const kit = (p: string, at?: number) =>
    foldKit(
      { deck: 'stall-build', edgeMax: edgeMax(stats), from: 0 },
      [...seed, ...status(p).flatMap((s) => (s.run.kit ?? []) as KitEvent[]), ...parseFixer(db.getMeta(fixerKey(p)))].filter((e) => at === undefined || e.at <= at),
      at ?? clock(),
      { districtOf: () => 'karasu' },
    );
  const quests: NonNullable<ChatRelayDeps['quests']> = {
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
    districtOf: () => 'karasu',
    boardSeed: () => 'pt-1',
    words: () => WORDS,
    stock: () => STOCK,
    crewState: () => (o.crew ? { members: [], prep: {}, scouted: [], taken: [], latest: null, wages: 0, ...o.crew } : null),
  };
  const relay: ChatRelay = new ChatRelay({
    ...(o.onLiveClock ? { onLiveClock: () => o.onLiveClock!(relay) } : {}),
    players: fakePlayers(),
    backend,
    db,
    room: new Room(registry),
    journal: new Journal(db),
    emit: (e) => events.push(e),
    instructions: 'ROOM NOTE',
    quests,
    roll: () => rolls.shift() ?? 50,
    clockNow: clock,
  });
  return { relay, db, events, backend: backend as ReturnType<typeof fakeBackend>, kit: () => kit('hicks') };
}
const lastUser = (r: TurnRequest) => r.messages.at(-1)!.content;
const keyOn = (d: number, id = 'back-door') => questKey('hicks', `${id}@${d}`);
const runOn = (db: Db, d: number, id = 'back-door') => parseRun(db.getMeta(keyOn(d, id)));
const states = (events: ServerEvent[]) => events.filter((e): e is { type: 'quest_state'; state: QuestState } => e.type === 'quest_state').map((e) => e.state);
const questRows = (db: Db) => db.recentMessages('hicks', 50).filter((m) => m.mode === 'quest' && m.role === 'user');
const pick = (relay: ChatRelay, beat: string, choice: string, moves?: ({ word: string } | { bracket: number })[]) =>
  relay.chooseQuest('hicks', { id: 'back-door', beat, choice, ...(moves ? { moves } : {}) });
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
    const one = relayWith({ clock: () => clock, rolls: [10, 10] });
    await one.relay.startQuest('hicks', 'back-door');
    await pick(one.relay, 'door', 'talk');
    await pick(one.relay, 'desk', 'skim');
    expect(runOn(one.db, d)!.done).toBe(true);
    expect(one.relay.questState('hicks').open).toEqual([]);
    clock += 1440;
    expect(one.relay.questState('hicks').open.map((o) => o.id)).toEqual(['back-door']);
  });

  it('a tier 2 job is not posted to a Nobody', () => {
    const { relay } = relayWith({ rep: 0 });
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
    const full = relayWith({ clock: () => evening(d), rolls: [10, 10] });
    await full.relay.startQuest('hicks', 'back-door');
    const pay = runOn(full.db, d)!.pay!;
    expect(pay).toBeGreaterThanOrEqual(350);
    expect(pay).toBeLessThanOrEqual(450);
    await pick(full.relay, 'door', 'talk');
    await pick(full.relay, 'desk', 'grab');
    expect(full.kit().sol).toBe(pay);

    const half = relayWith({ clock: () => evening(d), rolls: [10] });
    await half.relay.startQuest('hicks', 'back-door');
    await pick(half.relay, 'door', 'talk');
    await pick(half.relay, 'desk', 'skim');
    expect(half.kit().sol).toBe(Math.floor(pay / 2));
  });

  it('the active job shows ALARM, EDGE, heat and the pay range', async () => {
    const { relay } = relayWith();
    await relay.startQuest('hicks', 'back-door');
    expect(relay.questState('hicks').active).toMatchObject({ alarm: 0, edge: 2, heat: 0, pay: [350, 450] });
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

    const b = relayWith({ clock: () => now, rolls: [99] });
    await b.relay.startQuest('hicks', 'back-door');
    await pick(b.relay, 'door', 'talk');
    await pick(b.relay, 'door', '!take');
    expect(questRows(b.db).at(-1)!.clock).toBe(now + 30);
  });

  it('a parked check shows the roll it parked on', async () => {
    const d = plainDoor('easy');
    const { relay } = relayWith({ clock: () => evening(d), rolls: [99] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    expect(relay.questState('hicks').active!.rolled).toEqual({ choice: 'talk', chance: 74, rolls: [99] });
  });

  it('ALARM +1 on a resolved fail, on [alarm +1]; odds carry ALARM −10 in why', async () => {
    const d = plainDoor('easy');
    const failed = relayWith({ clock: () => evening(d), rolls: [99] });
    await failed.relay.startQuest('hicks', 'back-door');
    await pick(failed.relay, 'door', 'talk');
    await pick(failed.relay, 'door', '!take');
    expect(runOn(failed.db, d)!.alarm).toBe(1);

    const loud = job(JOB.replace(/→ inside \[clock \+1h\]/g, '→ inside [clock +1h, alarm +1]'));
    const { relay, db } = relayWith({ book: [loud], clock: () => evening(d) });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'wait');
    expect(runOn(db, d)!.alarm).toBe(1);
    const grab = relay.questState('hicks').active!.choices.find((c) => c.id === 'grab')!;
    expect(grab.odds!.why).toContain('ALARM 1 −10');
    expect(grab.odds!.chance).toBe(50 + 7 - 10);
  });

  it('a red check fails straight to its fail outcome with EDGE left', async () => {
    const d = plainDoor('easy');
    const red = job(JOB.replace(/\[check cool 50\]/g, '[check cool 50 red]'));
    const { relay, db } = relayWith({ book: [red], clock: () => evening(d), rolls: [99] });
    await relay.startQuest('hicks', 'back-door');
    expect(relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!.red).toBe(true);
    await pick(relay, 'door', 'talk');
    expect(runOn(db, d)!.pending ?? null).toBeNull();
    expect(questRows(db).at(-1)!.text).toContain('*He turns you round.*');
  });

  it('passive line in the row only when its condition holds, with its marker', async () => {
    const d = plainDoor('easy');
    const text = JOB.replace('*The ledger.*', '*The ledger.*\n[wits 6] *A second ledger under the first.*');
    const sharp = relayWith({ book: [job(text)], clock: () => evening(d), rolls: [10] });
    await sharp.relay.startQuest('hicks', 'back-door');
    await pick(sharp.relay, 'door', 'talk');
    expect(questRows(sharp.db).at(-1)!.text).toContain('⟦WITS⟧ *A second ledger under the first.*');
    const dull = relayWith({ book: [job(text)], clock: () => evening(d), rolls: [10], stats: { ...HICKS, wits: 5 } });
    await dull.relay.startQuest('hicks', 'back-door');
    await pick(dull.relay, 'door', 'talk');
    expect(questRows(dull.db).at(-1)!.text).not.toContain('second ledger');
  });

  it('temper easy gives +10 and EASY MARK +10 in why', async () => {
    const { relay } = relayWith({ clock: () => evening(plainDoor('easy')) });
    await relay.startQuest('hicks', 'back-door');
    const talk = relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!;
    expect(talk.odds).toEqual({ stat: 'COOL', chance: 50 + 14 + 10, noDeck: false, why: ['EASY MARK +10'] });
    const hard = relayWith({ clock: () => evening(plainDoor('hard')) });
    await hard.relay.startQuest('hicks', 'back-door');
    expect(hard.relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!.odds!.chance).toBe(50 + 14 - 10);
  });
});

describe('jobs: the end', () => {
  it('clean ending writes debrief tier clean and rep +(5+T) in the job\'s district', async () => {
    const d = plainDoor('easy');
    const { relay, db, kit, backend } = relayWith({ clock: () => evening(d), rolls: [10, 10] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'grab');
    const last = questRows(db).at(-1)!;
    const pay = runOn(db, d)!.pay!;
    expect(last.quest!.debrief).toMatchObject({
      tier: 'clean',
      sol: pay,
      rep: { district: 'karasu', before: 30, after: 37 },
      checks: [
        { line: 'Talk your way in.', stat: 'COOL', chance: 74, rolls: [10] },
        { line: 'Take it all.', stat: 'REFLEX', chance: 57, rolls: [10] },
      ],
    });
    expect(kit().rep.karasu).toBe(37);
    const sent = lastUser(backend.reqs.at(-1)!);
    expect(sent).toContain(MISSION_CLOSE);
    // In words, not numbers (MISSION_CLOSE): the outcome, no alarm, the name gone up.
    expect(sent).toContain('It paid. It went well. Their name in karasu went up.');
    expect(sent).toContain('- Talk your way in. — it worked');
    expect(sent).not.toMatch(/\[mission summary[^\]]*(CLEAN|ALARM|\d)/);
  });

  it('blown ending with a burner held parks with cover cards; !burner halves the loss; debrief.cover is burner; the closing turn then runs', async () => {
    const d = plainDoor('easy');
    const { relay, db, events, kit, backend } = relayWith({ clock: () => evening(d), rolls: [99], stats: { ...HICKS, edge: 0 }, burner: 1 });
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
    const { relay, db, events, kit } = relayWith({ clock: () => evening(d), rolls: [99], stats: { ...HICKS, edge: 0 } });
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
    const { relay, db, kit } = relayWith({ clock: () => evening(d), rolls: [10], burner: 1 });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'skim');
    expect(runOn(db, d)!.done).toBe(true);
    expect(questRows(db).at(-1)!.quest!.debrief).toMatchObject({ tier: 'messy', rep: { before: 30, after: 32 } });
    expect(questRows(db).at(-1)!.quest!.debrief!.cover).toBeUndefined();
    expect(kit().cover.burner).toBe(1);
  });
});

describe('jobs: cracking', () => {
  const cracked = job(JOB.replace('- grab: Take it all. → paid / part [check reflex 50]', '- grab: Take it all. → paid / part [crack 6]'));
  async function atDesk(rolls: number[] = [10]) {
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
    expect(active.choices.find((c) => c.id === 'grab')!.crack).toEqual({ length: 6, tries: 5 });
    expect(active.crack!.grab).toMatchObject({ length: 6, tries: 5, extraBracket: true, strikeOne: false, ghost: false, skin: 'slab', deck: 'Stall build' });
  });

  it('a corp terminal shows CORP whatever the deck; the deck still counts', async () => {
    const iced = job(JOB.replace('- grab: Take it all. → paid / part [check reflex 50]', '- grab: Take it all. → paid / part [crack 6 corp]'));
    const d = plainDoor('easy');
    const r = relayWith({ book: [iced], clock: () => evening(d), rolls: [10] });
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

    const lost = await atDesk();
    const t2 = makeTerminal(lost.relay.questState('hicks').active!.crack!.grab);
    const wrong = t2.words.map((w) => w.word).filter((w) => w !== t2.password).slice(0, t2.tries);
    await pick(lost.relay, 'desk', 'grab', wrong.map((word) => ({ word })));
    expect(questRows(lost.db).at(-1)!.text).toContain('*Some of it.*');
    expect(runOn(lost.db, lost.d)!.picks.at(-1)!.crack).toMatchObject({ state: 'locked' });
    expect(runOn(lost.db, lost.d)!.alarm).toBe(1);
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
    const { relay, db } = relayWith({ clock: () => clock, rolls: [10] });
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
    const { relay, db } = relayWith({ book: [cracked], clock: () => evening(d), rolls: [10, 10] });
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
        { id: 'pocket-deck', name: 'Pocket deck', price: 600, tier: 1, state: 'short' },
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

  it('buying cover adds one; buying a deck replaces yours with a trade-in', () => {
    const { relay, kit } = relayWith({ sol: 2000 });
    expect(relay.buy('hicks', 'burner')).toEqual({ ok: true, text: 'ok' });
    expect(kit()).toMatchObject({ sol: 1500, cover: { burner: 1 } });
    expect(relay.buy('hicks', 'pocket-deck')).toEqual({ ok: true, text: 'ok' });
    // The stall build isn't stocked here: a quarter of 300 back.
    expect(kit()).toMatchObject({ sol: 1500 - 600 + 75, deck: 'pocket-deck' });
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
    const { relay, db } = relayWith({ book: [cracked], clock: () => evening(d), rolls: [10] });
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
    const { relay, db } = relayWith({ clock: () => clock, rolls: [10] });
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
    const { relay, db } = relayWith({ book: [midway], clock: () => evening(d), rolls: [10, 10] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'grab');
    expect(questRows(db).at(-1)!.quest!.debrief!.tier).toBe('messy');
  });
  it('a blown line partway blows the job', async () => {
    const d = plainDoor('easy');
    const blownMid = job(JOB.replace("## inside\n*You're in.*\n→ desk", "## inside\n*You're in.*\nblown\n→ desk"));
    const { relay, db } = relayWith({ book: [blownMid], clock: () => evening(d), rolls: [10, 10] });
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
    const { relay } = relayWith({ book: [prepped], clock: () => clock, rolls: [10] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'wait');
    expect(relay.questState('hicks').active!.choices.find((c) => c.id === 'grab')!.odds!.why).toContain('+15 YOU CASED IT');
    await pick(relay, 'desk', 'skim');
    clock = evening(d2);
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    expect(relay.questState('hicks').active!.choices.find((c) => c.id === 'grab')!.odds!.why).not.toContain('+15 YOU CASED IT');
  });

  it('I2: the take keeps the worst one seen (a later take: full or part never lifts a none)', async () => {
    const d = plainDoor('easy');
    const worst = job(JOB.replace("## inside\n*You're in.*\n→ desk", "## inside\n*You're in.*\ntake: none\n→ desk"));
    const { relay, db } = relayWith({ book: [worst], clock: () => evening(d), rolls: [10, 10] });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    await pick(relay, 'desk', 'grab');
    expect(questRows(db).at(-1)!.quest!.debrief!.tier).toBe('blown');
  });

  it('I3: the cover cards come with the blowing pick: its text, its roll, and the debrief so far', async () => {
    const d = plainDoor('easy');
    const { relay } = relayWith({ clock: () => evening(d), rolls: [99], stats: { ...HICKS, edge: 0 }, burner: 1 });
    await relay.startQuest('hicks', 'back-door');
    await pick(relay, 'door', 'talk');
    const blown = relay.questState('hicks').active!.blown!;
    expect(blown.text).toContain('*He turns you round.*');
    expect(blown.pick).toMatchObject({ choice: 'talk', roll: { rolls: [99], pass: false } });
    expect(blown.debrief).toMatchObject({ tier: 'blown', rep: { district: 'karasu', before: 30, after: 18 } });
    expect(blown.debrief.cover).toBeUndefined();
  });

  it('a beat row she never answers is marked silent; the rows she answers are not', async () => {
    const d = plainDoor('easy');
    const { relay, db } = relayWith({ clock: () => evening(d), rolls: [10, 10] });
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
  const grab = (relay: ChatRelay) => relay.questState('hicks').active!.choices.find((c) => c.id === 'grab')!.odds!.why;
  const talk = (relay: ChatRelay) => relay.questState('hicks').active!.choices.find((c) => c.id === 'talk')!.odds!.why;

  it('prep flags join the run', async () => {
    const d = plain();
    const { relay, db } = relayWith({ clock: () => evening(d), crew: { prep: { [`back-door@${d}`]: { cased: 'clean' } } } });
    await relay.startQuest('hicks', 'back-door');
    expect(runOn(db, d)!.flags.cased).toBe('clean');
  });

  it('default CASED +10 on the first checked pick only', async () => {
    const d = plain();
    const { relay } = relayWith({ clock: () => evening(d), rolls: [1], crew: { prep: { [`back-door@${d}`]: { cased: 'clean' } } } });
    await relay.startQuest('hicks', 'back-door');
    expect(talk(relay)).toContain('CASED +10');
    await pick(relay, 'door', 'talk');
    expect(grab(relay)).not.toContain('CASED +10');
  });

  it('no default when the job mentions cased, or when the case was messy', async () => {
    const d = plain();
    const mentioned = job(JOB.replace('[check reflex 50]', '[check reflex 50 · if cased +15 "you cased it"]'));
    const a = relayWith({ book: [mentioned], clock: () => evening(d), crew: { prep: { [`back-door@${d}`]: { cased: 'clean' } } } });
    await a.relay.startQuest('hicks', 'back-door');
    expect(talk(a.relay)).not.toContain('CASED +10');
    const b = relayWith({ clock: () => evening(d), crew: { prep: { [`back-door@${d}`]: { cased: 'messy' } } } });
    await b.relay.startQuest('hicks', 'back-door');
    expect(talk(b.relay)).not.toContain('CASED +10');
  });

  it('default RECORDS +10 on grid checks only', async () => {
    const d = plain();
    const gridJob = job(JOB.replace('[check reflex 50]', '[check tech 50 grid]'));
    const { relay } = relayWith({ book: [gridJob], clock: () => evening(d), rolls: [1], crew: { prep: { [`back-door@${d}`]: { records: 'clean' } } } });
    await relay.startQuest('hicks', 'back-door');
    expect(talk(relay)).not.toContain('RECORDS +10');
    await pick(relay, 'door', 'wait');
    expect(grab(relay)).toContain('RECORDS +10');
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

describe('jobOn (story moods spec §2)', () => {
  it('a run with ALARM 1 is a job on; none before it, none once it has ended', async () => {
    const d = plainDoor('easy');
    const loud = job(JOB.replace(/→ inside \[clock \+1h\]/g, '→ inside [clock +1h, alarm +1]'));
    const { relay } = relayWith({ book: [loud], clock: () => evening(d), rolls: [10, 10] });
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
