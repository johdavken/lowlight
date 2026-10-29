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
import { MISSION_CLOSE, MISSION_OPEN, QUEST_INSTRUCTIONS } from '../src/instructions';
import { Journal } from '../src/journal';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import { generateScenes } from '../../tools/gen-placeholders';
import { flagsOf, parseQuestFile, parseRun, questKey, type QuestEntry, type QuestStatus } from '../../shared/quests';
import { MISSION, TRAIL } from '../../shared/quests.fixture';
import { foldKit, heatIn, type KitEvent } from '../../shared/mission';
import type { Deck } from '../../shared/gear';
import { edgeMax, type Stats } from '../../shared/stats';

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'missions-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
const dbs: Db[] = [];
afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
});

const DECKS: Deck[] = [
  { id: 'stall-build', name: 'Stall build', bonus: 15, heat: 0, traits: ['fragile'] },
  { id: 'meridian', name: 'Cortex Meridian', bonus: 20, heat: 2, traits: [] },
  { id: 'deaf-meridian', name: 'Deaf Meridian', bonus: 18, heat: 1, traits: [] },
];
const HICKS: Stats = { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 };
const known = { roster: null, places: null, decks: new Set(DECKS.map((d) => d.id)) };
const parsed = parseQuestFile('night-shift', MISSION, known);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.problems));
const NIGHT = parsed.entry;
const trail = parseQuestFile('paper-trail', TRAIL.replace('starts: lowlight-intake', 'starts: haes-noodles'), { roster: null, places: null });
if (!trail.ok) throw new Error('fixture');
// Jobs are keyed by their story day (small jobs plan ruling 2): no clock here, so day 0 (START).
const KEY = questKey('hicks', 'night-shift@0');

/** Hicks (TECH 7, stall build, EDGE 4 → 2 rerolls) on a mission with Nix at Hae's: Ember's bonus never applies. */
function relayWith(o: { rolls?: number[]; book?: QuestEntry[]; deck?: string | null; stats?: Stats; clock?: () => number } = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  dbs.push(db);
  const events: ServerEvent[] = [];
  const backend = fakeBackend(() => reply('Hm.'));
  const rolls = [...(o.rolls ?? [])];
  const stats = o.stats ?? HICKS;
  const contact = 'nix-direct';
  const status = (p: string): QuestStatus[] =>
    db.metaWithPrefix(`quest.${p}.`).flatMap(({ k, v }) => {
      const run = parseRun(v);
      return run ? [{ id: k.slice(`quest.${p}.`.length), contact, run }] : [];
    });
  const kit = (p: string) =>
    foldKit({ deck: o.deck === undefined ? 'stall-build' : o.deck, edgeMax: edgeMax(stats), from: 1200 }, status(p).flatMap((s) => (s.run.kit ?? []) as KitEvent[]), 1200, { districtOf: () => 'karasu' });
  const quests: NonNullable<ChatRelayDeps['quests']> = {
    contact,
    book: () => o.book ?? [NIGHT],
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
    ...(o.clock ? { clockNow: o.clock } : {}),
  });
  return { relay, db, events, backend: backend as ReturnType<typeof fakeBackend>, kit: () => kit('hicks') };
}
const lastUser = (r: TurnRequest) => r.messages.at(-1)!.content;
const run = (db: Db) => parseRun(db.getMeta(KEY));
const states = (events: ServerEvent[]) => events.filter((e): e is { type: 'quest_state'; state: QuestState } => e.type === 'quest_state').map((e) => e.state);
const questRows = (db: Db) => db.recentMessages('hicks', 50).filter((m) => m.mode === 'quest' && m.role === 'user');
const pick = (relay: ChatRelay, beat: string, choice: string) => relay.chooseQuest('hicks', { id: 'night-shift', beat, choice });

describe('missions: setting out', () => {
  it('open rows mark missions', () => {
    const { relay } = relayWith();
    expect(relay.questState('hicks').open).toEqual([{ id: 'night-shift', title: 'Night Shift', pitch: NIGHT.pitch, timed: false, mission: { pay: 400, tier: 1, range: [400, 400] } }]);
  });

  it('start runs one reply with MISSION_OPEN', async () => {
    const { relay, backend } = relayWith();
    await relay.startQuest('hicks', 'night-shift');
    expect(backend.reqs).toHaveLength(1);
    const sent = lastUser(backend.reqs[0]);
    expect(sent).toContain(MISSION_OPEN);
    expect(sent).not.toContain(QUEST_INSTRUCTIONS);
    expect(sent).toContain('Night Shift');
    expect(sent).toContain('stall build');
  });

  it('cards carry odds', async () => {
    const { relay } = relayWith();
    await relay.startQuest('hicks', 'night-shift');
    const active = relay.questState('hicks').active!;
    expect(active.choices[0]).toEqual({ id: 'roof', line: 'Loop the cameras from the roof.', odds: { stat: 'TECH', chance: 74, noDeck: false, why: ['GRID', 'STALL BUILD +15'] } });
    expect(active.choices[1]).toEqual({ id: 'walk', line: 'Walk in with a forged work order.', odds: { stat: 'COOL', chance: 64, noDeck: false, why: [] } });
  });

  it('with no deck a grid card says so', async () => {
    const { relay } = relayWith({ deck: null });
    await relay.startQuest('hicks', 'night-shift');
    expect(relay.questState('hicks').active!.choices[0].odds).toEqual({ stat: 'TECH', chance: 34, noDeck: true, why: ['GRID', 'NO DECK −25'] });
  });
});

describe('missions: checks', () => {
  it('a pass posts the result line and the next beat, no reply', async () => {
    const { relay, db, backend } = relayWith({ rolls: [30] });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    expect(backend.reqs).toHaveLength(1);
    const row = questRows(db).at(-1)!;
    expect(row.text).toBe('You loop the cameras from the roof.\n\n*TECH 74% — clean.*\n\n*You\'re in.*\n\n*The manifest is on the screen.*');
    expect(row.quest!.pick).toEqual({ choice: 'roof', line: 'You loop the cameras from the roof.', roll: { stat: 'TECH', chance: 74, rolls: [30], pass: true } });
    expect(run(db)!.picks.at(-1)).toEqual({ beat: 'door', choice: 'roof', roll: { stat: 'TECH', chance: 74, rolls: [30], pass: true } });
  });

  it('a fail with edge shows reroll cards and writes no row', async () => {
    const { relay, db, events } = relayWith({ rolls: [80] });
    await relay.startQuest('hicks', 'night-shift');
    const before = questRows(db).length;
    await pick(relay, 'door', 'roof');
    expect(questRows(db)).toHaveLength(before);
    expect(states(events).at(-1)!.active!.choices).toEqual([
      { id: '!reroll', line: 'REROLL (EDGE 2 LEFT)' },
      { id: '!take', line: 'TAKE IT' },
    ]);
    expect(run(db)!.pending).toEqual({ beat: 'door', choice: 'roof', stat: 'TECH', chance: 74, rolls: [80] });
  });

  it('reroll spends edge and resolves', async () => {
    const { relay, db, kit } = relayWith({ rolls: [80, 30] });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    await pick(relay, 'door', '!reroll');
    expect(run(db)!.picks.at(-1)!.roll).toEqual({ stat: 'TECH', chance: 74, rolls: [80, 30], pass: true });
    expect(run(db)!.kit).toContainEqual(expect.objectContaining({ edge: -1 }));
    expect(run(db)!.pending ?? null).toBeNull();
    expect(kit().edgeLeft).toBe(1);
    expect(questRows(db).at(-1)!.text).toContain('*TECH 74% — clean.*');
  });

  it('take it posts the fail outcome and adds heat 1', async () => {
    const { relay, db, kit } = relayWith({ rolls: [80] });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    await pick(relay, 'door', '!take');
    const row = questRows(db).at(-1)!;
    expect(row.text).toContain('*TECH 74% — no.*\n\n*The camera turns.*');
    expect(row.quest!.pick!.roll).toEqual({ stat: 'TECH', chance: 74, rolls: [80], pass: false });
    expect(heatIn(kit(), 'karasu')).toBe(3); // the outcome's +2, the fail's +1
  });

  it('a fail with no edge left goes straight to the fail outcome', async () => {
    const { relay, db } = relayWith({ rolls: [80], stats: { ...HICKS, edge: 0 } });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    expect(questRows(db).at(-1)!.text).toContain('*TECH 74% — no.*');
  });

  it('grid check adds the deck heat on pass and on fail', async () => {
    const pass = relayWith({ rolls: [30], deck: 'meridian' });
    await pass.relay.startQuest('hicks', 'night-shift');
    await pick(pass.relay, 'door', 'roof');
    expect(heatIn(pass.kit(), 'karasu')).toBe(2);
    const fail = relayWith({ rolls: [99], deck: 'meridian', stats: { ...HICKS, edge: 0 } });
    await fail.relay.startQuest('hicks', 'night-shift');
    await pick(fail.relay, 'door', 'roof');
    expect(heatIn(fail.kit(), 'karasu')).toBe(2 + 2 + 1); // the deck, the outcome, the fail
  });

  it('fragile deck dies on 96+', async () => {
    const { relay, db, kit } = relayWith({ rolls: [97], stats: { ...HICKS, edge: 0 } });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    expect(kit().deck).toBeNull();
    expect(questRows(db).at(-1)!.text).toContain('*The Stall build dies.*');
  });

  it('a stale card during a reroll has passed', async () => {
    const { relay } = relayWith({ rolls: [80] });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    expect(await pick(relay, 'door', 'walk')).toBe('that choice has passed');
    expect(await pick(relay, 'desk', '!reroll')).toBe('that choice has passed');
  });

  it('pick-checked choice rolls (a typed line confirmed onto a checked card)', async () => {
    const { relay, db } = relayWith({ rolls: [30] });
    await relay.startQuest('hicks', 'night-shift');
    await relay.chooseQuest('hicks', { id: 'night-shift', beat: 'door', choice: 'roof', said: 'I take the roof.' });
    expect(questRows(db).at(-1)!.quest!.pick!.roll).toEqual({ stat: 'TECH', chance: 74, rolls: [30], pass: true });
  });
});

describe('missions: the end', () => {
  it('effects append one event; end runs one reply with MISSION_CLOSE and the summary', async () => {
    const { relay, db, backend, kit } = relayWith({ rolls: [30, 20] });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    await pick(relay, 'desk', 'wipe');
    expect(run(db)!.done).toBe(true);
    expect(backend.reqs).toHaveLength(2);
    const sent = lastUser(backend.reqs[1]);
    expect(sent).toContain(MISSION_CLOSE);
    // The summary says each pick and the pay in words: MISSION_CLOSE says never to mention odds, rolls or numbers.
    expect(sent).toMatch(/\[mission summary — [^\n]*:\n- [^\n]* — it worked\n- [^\n]* — it worked\nIt paid\./);
    expect(sent).not.toMatch(/\[mission summary[^\]]*(%|\d)/);
    expect(kit()).toMatchObject({ sol: 400, deck: 'deaf-meridian' });
    expect(run(db)!.kit!.filter((e) => e.sol === 400)).toHaveLength(1);
  });
});

describe('missions: rewind', () => {
  it('rewind restores a pending reroll and refunds edge', async () => {
    const { relay, db, events, kit } = relayWith({ rolls: [80, 30] });
    await relay.startQuest('hicks', 'night-shift');
    const opening = db.recentMessages('hicks', 50).filter((m) => m.role === 'agent').at(-1)!;
    await pick(relay, 'door', 'roof');
    await pick(relay, 'door', '!reroll');
    expect(kit().edgeLeft).toBe(1);
    await relay.rewind('hicks', opening.id);
    expect(run(db)!.pending).toMatchObject({ choice: 'roof', rolls: [80] });
    expect(states(events).at(-1)!.active!.choices.map((c) => c.id)).toEqual(['!reroll', '!take']);
    expect(kit().edgeLeft).toBe(2);
  });
});

describe('quests are unchanged', () => {
  it('a quest still runs a reply after every pick, with no odds', async () => {
    const { relay, backend } = relayWith({ book: [trail.entry] });
    await relay.startQuest('hicks', 'paper-trail');
    const active = relay.questState('hicks').active!;
    expect(active.choices.every((c) => !('odds' in c))).toBe(true);
    await relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'hand' });
    expect(backend.reqs).toHaveLength(2);
    expect(lastUser(backend.reqs[1])).toContain(QUEST_INSTRUCTIONS);
  });
});

describe('rollsFromEnv', async () => {
  const { rollsFromEnv } = await import('../src/mission-run');
  it('rolls the list in order, then the last again; unset is undefined', () => {
    const r = rollsFromEnv({ NIX_TEST_ROLLS: '80, 30' })!;
    expect([r(), r(), r()]).toEqual([80, 30, 30]);
    expect(rollsFromEnv({})).toBeUndefined();
    expect(rollsFromEnv({ NIX_TEST_ROLLS: 'x,0,101' })).toBeUndefined();
  });
});

describe('her prompt carries the kit', () => {
  it('contextLines includes the kit line', async () => {
    const { relay, backend } = relayWith();
    await relay.send('hicks', 'hey');
    expect(lastUser(backend.reqs[0])).toContain('hicks carries a stall build. Heat 0 of 10 here.');
  });
});

const variant = (text: string) => {
  const r = parseQuestFile('night-shift', text, known);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};

describe('review fixes (Task 5)', () => {
  it('I1: a reroll still resolves when its own roll hid the choice', async () => {
    const book = [variant(MISSION.replace('[check tech 45 grid · ember +15]', '[check tech 45 grid · ember +15, needs heat<=1]'))];
    const { relay, db } = relayWith({ book, deck: 'meridian', rolls: [99, 10] });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    expect(run(db)!.pending).toBeTruthy();
    expect(await pick(relay, 'door', '!reroll')).toEqual({ ok: true, text: 'ok' });
    expect(run(db)!.picks.at(-1)!.roll!.pass).toBe(true);
  });

  it('I2: a mission that ends on a wait-resumed row gets the closing note', async () => {
    let clock = 1200;
    const text = MISSION.replace("## inside\n*You're in.*\n→ desk", "## inside\n*You're in.*\n→ desk\nwait: after +1h · by +2h else gone").concat('\n## gone\n*Too late.*\n→ end\n');
    const { relay, backend } = relayWith({ book: [variant(text)], rolls: [10], clock: () => clock });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    clock += 600;
    await relay.playDueQuest('hicks');
    const sent = lastUser(backend.reqs.at(-1)!);
    expect(sent).toContain(MISSION_CLOSE);
    expect(sent).not.toContain(MISSION_OPEN);
  });

  it('I3: REGENERATE and RETRY refuse a mission beat in between', async () => {
    const { relay, db, backend } = relayWith({ rolls: [10] });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    const mid = questRows(db).at(-1)!;
    expect(await relay.regenerate('hicks', mid.id)).toEqual({ ok: false, error: 'mission-beat' });
    expect(await relay.retry('hicks', mid.id)).toEqual({ ok: false, error: 'mission-beat' });
    expect(backend.reqs).toHaveLength(1);
  });
});

describe('final review fixes', () => {
  it('I1: an outcome reached by a wait applies its effects', async () => {
    let clock = 1200;
    const text = MISSION.replace("## inside\n*You're in.*\n→ desk", "## inside\n*You're in.*\n→ desk\nwait: after +1h · by +2h else missed").concat('\n## missed\n*Too late.*\nheat: +2\n→ end\n');
    const { relay, kit } = relayWith({ book: [variant(text)], rolls: [10], clock: () => clock });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    clock += 600;
    await relay.playDueQuest('hicks');
    expect(heatIn(kit(), 'karasu')).toBe(2);
  });
});

describe('the quest picture', () => {
  it('the active quest carries its picture url; none without one', async () => {
    const book = [variant(MISSION.replace('pay: 400\n---', 'pay: 400\nart: night-shift.png\n---'))];
    const { relay } = relayWith({ book });
    await relay.startQuest('hicks', 'night-shift');
    expect(relay.questState('hicks').active!.art).toBe('/api/quests/art/night-shift.png');
    const plain = relayWith();
    await plain.relay.startQuest('hicks', 'night-shift');
    expect('art' in plain.relay.questState('hicks').active!).toBe(false);
  });
});
