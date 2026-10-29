/** The Intake board's relay harness (Hicks with Nix at the Intake), shared by intake-board and arrangement tests. Registers its own setup hooks. */
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ServerEvent } from '../../../shared/types';
import type { TurnRequest } from '../../src/backend';
import { ChatRelay, type ChatRelayDeps } from '../../src/chat-relay';
import { fakeBackend, reply } from './backend';
import { fakePlayers } from './players';
import { openDb, type Db } from '../../src/db';
import { Journal } from '../../src/journal';
import { Room } from '../../src/room-state';
import { SceneRegistry } from '../../src/scenes';
import { generateScenes } from '../../../tools/gen-placeholders';
import { flagsOf, ownedBy, parseQuestFile, parseRun, questKey, type QuestEntry, type QuestStatus } from '../../../shared/quests';
import { JOB } from '../../../shared/quests.fixture';
import { foldKit, heatIn, type KitEvent } from '../../../shared/mission';
import type { Deck } from '../../../shared/gear';
import { edgeMax, type Stats } from '../../../shared/stats';
import { bandOf, DEFAULT_SHARED_STANDING, parseStored, standingKey } from '../../../shared/standing';
import { trustControl } from '../../src/standing';
import { BURNER, TAKE } from '../../src/mission-run';

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intake-board-'));
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
export const parse = (text: string, id: string): QuestEntry => {
  const r = parseQuestFile(id, text, { roster: null, places: null, decks: new Set(DECKS.map((d) => d.id)) });
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};
/** Back Door as one of Nix's own: tier 1 at the Intake, on her shift, trust its stake. */
export const OWN_TEXT = JOB.replace('title: Back Door', 'title: Held Papers')
  .replace('tier: 2', 'tier: 1')
  .replace('with: [hicks, ember, nix-direct]', 'with: [nix-direct]')
  .replace('starts: haes-noodles', 'starts: lowlight-intake')
  .replace('minutes: 30\n', 'minutes: 30\nposts: 20:00-02:00\ntrust: 1 / 1\npitch: A woman upstairs owes a house.\n');
export const OWN = parse(OWN_TEXT, 'held-papers');

/** The story clock at hh:mm of story day `d` (the day runs 06:00 to 05:59). */
export const at = (hh: number, mm: number, d = 1) => 360 + d * 1440 + ((hh * 60 + mm - 360 + 1440) % 1440);

/** Hicks with `contact` (Nix) at `place` (the Intake), rep 0, on a settable clock. */
export function intakeRelay(o: { book?: QuestEntry[]; clock?: number; contact?: string; place?: string; rolls?: number[]; burner?: number; trust?: number; sol?: number; warmth?: 'low' | 'mid' | 'high' } = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  dbs.push(db);
  const events: ServerEvent[] = [];
  const backend = fakeBackend(() => reply('Hm.'));
  const rolls = [...(o.rolls ?? [])];
  const contact = o.contact ?? 'nix-direct';
  let clock = o.clock ?? at(22, 0);
  let place = o.place ?? 'lowlight-intake';
  const status = (p: string): QuestStatus[] =>
    db.metaWithPrefix(`quest.${p}.`).flatMap(({ k, v }) => {
      const run = parseRun(v);
      return run ? [{ id: k.slice(`quest.${p}.`.length), contact, run }] : [];
    });
  const seed: KitEvent[] = [...(o.burner ? [{ at: 0, cover: { id: 'burner' as const, delta: o.burner } }] : []), ...(o.sol ? [{ at: 0, sol: o.sol }] : [])];
  const kit = (p: string, when?: number) =>
    foldKit({ deck: 'stall-build', edgeMax: edgeMax(HICKS), from: 0 }, [...seed, ...status(p).flatMap((s) => (s.run.kit ?? []) as KitEvent[])].filter((e) => when === undefined || e.at <= when), when ?? clock, {
      districtOf: () => 'karasu',
    });
  const quests: NonNullable<ChatRelayDeps['quests']> = {
    contact,
    book: () => o.book ?? [OWN],
    status,
    placeId: () => place,
    contactName: (id) => (id === 'nix-direct' ? 'Nix' : id),
    placeName: (id) => id,
    ctx: (p) => {
      const k = kit(p);
      // Her trust band as stored (else the harness's start), so trust=high conditions read it.
      return { flags: flagsOf(status(p)), trust: bandOf(parseStored(db.getMeta(standingKey(p)))?.trust ?? (o.trust ?? 0)), warmth: o.warmth ?? 'mid', with: contact, heat: heatIn(k, 'karasu'), deck: DECKS.find((d) => d.id === k.deck) ?? null, stats: HICKS };
    },
    kit,
    decks: () => DECKS,
    districtOf: () => 'karasu',
    boardSeed: () => 'pt-1',
    words: () => [],
  };
  const deps: ChatRelayDeps = {
    players: fakePlayers(),
    backend,
    db,
    room: new Room(registry),
    journal: new Journal(db),
    emit: (e) => events.push(e),
    instructions: 'ROOM NOTE',
    quests,
    roll: () => rolls.shift() ?? 50,
    clockNow: () => clock,
    trust: trustControl({ db, name: 'Nix', start: () => ({ trust: o.trust ?? 0, warmth: 0 }), config: () => null, shared: () => DEFAULT_SHARED_STANDING }),
  };
  const relay = new ChatRelay(deps);
  return {
    relay,
    db,
    deps,
    events,
    backend: backend as ReturnType<typeof fakeBackend>,
    kit: () => kit('hicks'),
    setClock: (c: number) => {
      clock = c;
    },
    setPlace: (p: string) => {
      place = p;
    },
    run: (id = 'held-papers') => parseRun(db.metaWithPrefix(`quest.hicks.${id}@`).at(0)?.v ?? null),
    trustNow: () => parseStored(db.getMeta(standingKey('hicks')))?.trust ?? (o.trust ?? 0),
    jobMoves: () => (parseStored(db.getMeta(standingKey('hicks')))?.moves ?? []).filter((m) => m.job),
    key: (id = 'held-papers') => db.metaWithPrefix(`quest.hicks.${id}@`).at(0)?.k ?? questKey('hicks', id),
  };
}
export const lastUser = (r: TurnRequest) => r.messages.at(-1)!.content;
export const questRows = (db: Db) => db.recentMessages('hicks', 80).filter((m) => m.mode === 'quest' && m.role === 'user');

/** Plays Held Papers to its end: CLEAN (wait, grab passing), MESSY (wait, skim), BLOWN (talk failing, taken or covered). */
export async function play(r: ReturnType<typeof intakeRelay>, tier: 'clean' | 'messy' | 'blown', cover: 'take' | 'burner' = 'take') {
  await r.relay.startQuest('hicks', 'held-papers');
  const go = (beat: string, choice: string) => r.relay.chooseQuest('hicks', { id: 'held-papers', beat, choice });
  if (tier === 'blown') await go(r.run()!.beat!, 'talk');
  else {
    await go(r.run()!.beat!, 'wait');
    await go('desk', tier === 'clean' ? 'grab' : 'skim');
  }
  // A failed roll parks for REROLL: take it; a blown job with cover held parks for the cover cards.
  if (r.run()!.pending) await go(r.run()!.beat!, TAKE);
  if (r.run()!.pendingCover) await go(r.run()!.beat!, cover === 'burner' ? BURNER : TAKE);
  expect(r.run()!.done).toBe(true);
  return questRows(r.db).at(-1)!;
}

