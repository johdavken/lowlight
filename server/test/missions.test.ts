import { dealAs, settleLikeOld } from './settle';
import { facesFor } from '../../shared/dice';
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
import { flagsOf, parseQuestFile, parseRun, type DicePending, questKey, type QuestEntry, type QuestStatus } from '../../shared/quests';
import { MISSION, TRAIL } from '../../shared/quests.fixture';
import { foldKit, heatIn, type KitEvent } from '../../shared/mission';
import type { Deck } from '../../shared/gear';
import { nerveMax, type Stats } from '../../shared/stats';

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
  { id: 'stall-build', name: 'Stall build', quality: 2, heat: 0, traits: ['fragile'] },
  { id: 'meridian', name: 'Cortex Meridian', quality: 3, heat: 2, traits: [] },
  { id: 'deaf-meridian', name: 'Deaf Meridian', quality: 3, heat: 1, traits: [] },
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
function relayWith(o: { rolls?: number[]; nerve?: number; book?: QuestEntry[]; deck?: string | null; stats?: Stats; clock?: () => number } = {}) {
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
    foldKit({ deck: o.deck === undefined ? 'stall-build' : o.deck, nerveMax: nerveMax(stats), from: 1200 }, [...(o.nerve !== undefined ? [{ at: 1199, nerve: o.nerve - nerveMax(stats) }] : []), ...status(p).flatMap((s) => (s.run.kit ?? []) as KitEvent[])], 1200, { districtOf: () => 'karasu' });
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
    rollDice: (n: number, keep: 'high' | 'low') => facesFor(rolls.shift() ?? 6, n, keep),
    ...(o.clock ? { clockNow: o.clock } : {}),
  });
  return { relay, db, events, backend: backend as ReturnType<typeof fakeBackend>, kit: () => kit('hicks') };
}
const lastUser = (r: TurnRequest) => r.messages.at(-1)!.content;
const run = (db: Db) => parseRun(db.getMeta(KEY));
const states = (events: ServerEvent[]) => events.filter((e): e is { type: 'quest_state'; state: QuestState } => e.type === 'quest_state').map((e) => e.state);
const questRows = (db: Db) => db.recentMessages('hicks', 50).filter((m) => m.mode === 'quest' && m.role === 'user');
/** A pick; a costly roll's dealt costs (roll lifecycle spec §1) are then taken as dealt, as a bare TAKE IT does. */
const raw = (relay: ChatRelay, beat: string, choice: string, card?: string) => relay.chooseQuest('hicks', { id: 'night-shift', beat, choice, ...(card ? { card } : {}) });
const pick = async (relay: ChatRelay, beat: string, choice: string) => {
  const r = await relay.chooseQuest('hicks', { id: 'night-shift', beat, choice });
  return (await settleLikeOld(relay, "night-shift", beat)) ?? r;
};

describe('missions: setting out', () => {
  it('open rows mark missions', () => {
    const { relay } = relayWith();
    expect(relay.questState('hicks').open).toEqual([{ id: 'night-shift', title: 'Night Shift', pitch: NIGHT.pitch, timed: false, mission: { pay: 400, tier: 1, range: [400, 400] }, setup: { district: 'unknown', tier: 'NOBODY', heat: 0, favour: 'ON HOLD', crew: [], contacts: [], deck: { name: 'Stall build', quality: 2, slots: 2 }, programs: [], leans: ['tech', 'cool'] } }]);
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

  it('cards carry their pool: dice and position (the table spec §1)', async () => {
    const { relay } = relayWith();
    await relay.startQuest('hicks', 'night-shift');
    const active = relay.questState('hicks').active!;
    expect(active.choices[0]).toMatchObject({ id: 'roof', line: 'Loop the cameras from the roof.', pool: { stat: 'TECH', base: 3, dice: 4, parts: [{ label: 'STALL BUILD', dice: 1, kind: 'pocket' }], position: 'open', noDeck: false, deck: { match: 'holds', broke: false, hidden: false, chrome: false }, effect: 'fair', effectRaw: 1, effectParts: [] }, trade: { safe: null, bold: null }, pushEffect: null });
    expect(active.choices[1]).toMatchObject({ id: 'walk', line: 'Walk in with a forged work order.', pool: { stat: 'COOL', base: 3, dice: 3, parts: [], position: 'open', noDeck: false, effect: 'fair', effectRaw: 1, effectParts: [] }, trade: { safe: null, bold: null }, pushEffect: null });
  });

  it('with no deck a grid card says so', async () => {
    const { relay } = relayWith({ deck: null });
    await relay.startQuest('hicks', 'night-shift');
    expect(relay.questState('hicks').active!.choices[0].pool).toMatchObject({ stat: 'TECH', base: 3, dice: 2, parts: [{ label: 'NO DECK', dice: -1, kind: 'pocket' }], position: 'open', noDeck: true, effect: 'fair', effectRaw: 1, effectParts: [] });
  });
});

describe('missions: checks', () => {
  it('a pass posts the result line and the next beat, no reply', async () => {
    const { relay, db, backend } = relayWith({ rolls: [6] });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    expect(backend.reqs).toHaveLength(1);
    const row = questRows(db).at(-1)!;
    expect(row.text).toBe('You loop the cameras from the roof.\n\n*TECH 4d · IN THE OPEN — 6, clean.*\n\n*You\'re in.*\n\n*The manifest is on the screen.*');
    expect(row.quest!.pick).toMatchObject({ choice: 'roof', line: 'You loop the cameras from the roof.', roll: { stat: 'TECH', dice: 4, position: 'open', faces: [6, 1, 1, 1], keep: 'high', kind: 'clean', pass: true } });
    expect(run(db)!.picks.at(-1)).toMatchObject({ beat: 'door', choice: 'roof', roll: { stat: 'TECH', dice: 4, position: 'open', faces: [6, 1, 1, 1], keep: 'high', kind: 'clean', pass: true } });
  });

  it('a miss deals its costs and writes no row', async () => {
    const { relay, db, events } = relayWith({ rolls: [2] });
    await relay.startQuest('hicks', 'night-shift');
    const before = questRows(db).length;
    await raw(relay, 'door', 'roof');
    expect(questRows(db)).toHaveLength(before);
    expect(states(events).at(-1)!.active!.choices).toEqual([]);
    expect(states(events).at(-1)!.active!.costs).toMatchObject({ pick: 2 });
    expect(run(db)!.pending).toMatchObject({ beat: 'door', choice: 'roof', roll: { stat: 'TECH', dice: 4, position: 'open', faces: [2, 1, 1, 1], keep: 'high', kind: 'miss', pass: false }, cost: { alarm: 0, heat: 0 }, died: 'Stall build', pick: 2 });
    // The death names its deck (review I2), and the save keeps the name.
    expect(run(db)!.kit).toContainEqual(expect.objectContaining({ deck: null, lose: ['stall-build'] }));
  });
  it('RESIST spends NERVE by its dice and drops the costs; the fail outcome still plays', async () => {
    const { relay, db, kit } = relayWith({ rolls: [2, 5, 5] });
    await relay.startQuest('hicks', 'night-shift');
    await raw(relay, 'door', 'roof');
    dealAs(db, KEY, ['alarm', 'heat']);
    for (const c of ['alarm', 'heat']) await raw(relay, 'door', '!cost', c);
    for (const c of ['alarm', 'heat']) await raw(relay, 'door', '!resist', c);
    expect(run(db)!.picks.at(-1)!.roll).toMatchObject({ kind: 'miss', costs: [{ cost: 'alarm', how: 'resisted' }, { cost: 'heat', how: 'resisted' }] });
    expect(run(db)!.pending ?? null).toBeNull();
    expect(run(db)!.alarm ?? 0).toBe(0);
    expect(kit().nerveLeft).toBe(3);
    expect(heatIn(kit(), 'karasu')).toBe(0); // resisted, and a job's outcome adds none
    expect(questRows(db).at(-1)!.text).toContain('*TECH 4d · IN THE OPEN — 2, no · ALARM +1 RESISTED · HEAT +1 RESISTED.*\n\n*The Stall build dies.*\n\n*The camera turns.*');
  });
  it('TAKE IT posts the fail outcome and lands the heat it took', async () => {
    const { relay, db, kit } = relayWith({ rolls: [2] });
    await relay.startQuest('hicks', 'night-shift');
    await raw(relay, 'door', 'roof');
    dealAs(db, KEY, ['heat', 'alarm']);
    await raw(relay, 'door', '!take');
    const row = questRows(db).at(-1)!;
    expect(row.text).toContain('*TECH 4d · IN THE OPEN — 2, no · HEAT +1 TAKEN · ALARM +1 TAKEN.*\n\n*HEAT +1*\n\n*ALARM +1*\n\n*The Stall build dies.*\n\n*The camera turns.*');
    expect(row.quest!.pick!.roll).toMatchObject({ kind: 'miss', pass: false });
    expect(heatIn(kit(), 'karasu')).toBe(1); // a roll from before: the heat taken
  });
  it('a grid check keeps the deck heat for the job’s end, on pass and on fail', async () => {
    for (const rolls of [[6], [2]]) {
      const t = relayWith({ rolls, deck: 'meridian', nerve: 1 });
      await t.relay.startQuest('hicks', 'night-shift');
      await raw(t.relay, 'door', 'roof');
      expect(heatIn(t.kit(), 'karasu')).toBe(0);
      expect((run(t.db)!.pending as DicePending | undefined)?.roll ?? run(t.db)!.picks.at(-1)!.roll).toMatchObject({ deckHeat: 2 });
    }
  });
  it('a fragile deck dies on a miss that shows a 1', async () => {
    const { relay, db, kit } = relayWith({ rolls: [2], nerve: 1 });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    expect(kit().deck).toBeNull();
    expect(questRows(db).at(-1)!.text).toContain('*The Stall build dies.*');
  });

  it('a stale card during a reroll has passed', async () => {
    const { relay } = relayWith({ rolls: [2] });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    expect(await pick(relay, 'door', 'walk')).toBe('that choice has passed');
    expect(await pick(relay, 'desk', '!reroll')).toBe('that choice has passed');
  });

  it('pick-checked choice rolls (a typed line confirmed onto a checked card)', async () => {
    const { relay, db } = relayWith({ rolls: [6] });
    await relay.startQuest('hicks', 'night-shift');
    await relay.chooseQuest('hicks', { id: 'night-shift', beat: 'door', choice: 'roof', said: 'I take the roof.' });
    expect(questRows(db).at(-1)!.quest!.pick!.roll).toMatchObject({ stat: 'TECH', dice: 4, kind: 'clean', pass: true });
  });
});

describe('missions: the end', () => {
  it('effects append one event; end runs one reply with MISSION_CLOSE and the summary', async () => {
    const { relay, db, backend, kit } = relayWith({ rolls: [6, 6] });
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
  it('rewind restores a waiting roll with its deal, still to settle', async () => {
    const { relay, db, events, kit } = relayWith({ rolls: [2] });
    await relay.startQuest('hicks', 'night-shift');
    const opening = db.recentMessages('hicks', 50).filter((m) => m.role === 'agent').at(-1)!;
    await raw(relay, 'door', 'roof');
    const dealt = (run(db)!.pending as DicePending).dealt;
    await raw(relay, 'door', '!take');
    expect(run(db)!.pending ?? null).toBeNull();
    await relay.rewind('hicks', opening.id);
    expect(run(db)!.pending).toMatchObject({ choice: 'roof', roll: { kind: 'miss' }, dealt });
    expect(states(events).at(-1)!.active!.costs).toBeTruthy();
    expect(kit().nerveLeft).toBe(5);
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
  it("gives each roll's kept face in order, then the last again; 66 is two sixes; unset or unreadable is undefined", () => {
    const r = rollsFromEnv({ NIX_TEST_ROLLS: '2, 66, 5' })!;
    expect([r(), r(), r(), r()]).toEqual([2, 66, 5, 5]);
    expect(rollsFromEnv({})).toBeUndefined();
    expect(rollsFromEnv({ NIX_TEST_ROLLS: 'x,0,7' })).toBeUndefined();
    expect(rollsFromEnv({ NIX_TEST_ROLLS: '80' })).toBeUndefined();
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
  it('I1: a parked roll still resolves when its own roll hid the choice', async () => {
    const book = [variant(MISSION.replace('[check tech 45 grid · ember +15]', '[check tech 40 grid · ember +15, needs heat<=1]'))];
    const { relay, db } = relayWith({ book, deck: 'meridian', rolls: [5] });
    await relay.startQuest('hicks', 'night-shift');
    await raw(relay, 'door', 'roof');
    expect(run(db)!.pending).toBeTruthy();
    dealAs(db, KEY, ['heat', 'alarm']);
    expect(await raw(relay, 'door', '!take')).toEqual({ ok: true, text: 'ok' });
    expect(run(db)!.picks.at(-1)!.roll!.pass).toBe(true);
  });
  it('I2: a mission that ends on a wait-resumed row gets the closing note', async () => {
    let clock = 1200;
    const text = MISSION.replace("## inside\n*You're in.*\n→ desk", "## inside\n*You're in.*\n→ desk\nwait: after +1h · by +2h else gone").concat('\n## gone\n*Too late.*\n→ end\n');
    const { relay, backend } = relayWith({ book: [variant(text)], rolls: [6], clock: () => clock });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    clock += 600;
    await relay.playDueQuest('hicks');
    const sent = lastUser(backend.reqs.at(-1)!);
    expect(sent).toContain(MISSION_CLOSE);
    expect(sent).not.toContain(MISSION_OPEN);
  });

  it('I3: REGENERATE and RETRY refuse a mission beat in between', async () => {
    const { relay, db, backend } = relayWith({ rolls: [6] });
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
    const { relay, kit } = relayWith({ book: [variant(text)], rolls: [6], clock: () => clock });
    await relay.startQuest('hicks', 'night-shift');
    await pick(relay, 'door', 'roof');
    clock += 600;
    await relay.playDueQuest('hicks');
    expect(heatIn(kit(), 'karasu')).toBe(0); // a job's outcome adds no heat (tier template spec §2)
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

