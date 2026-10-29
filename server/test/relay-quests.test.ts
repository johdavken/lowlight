import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { QuestState, ServerEvent } from '../../shared/types';
import type { Backend, TurnRequest } from '../src/backend';
import { ChatRelay, type ChatRelayDeps } from '../src/chat-relay';
import { fakeBackend, reply } from './fixtures/backend';
import { fakePlayers } from './fixtures/players';
import { openDb, type Db } from '../src/db';
import { QUEST_INSTRUCTIONS } from '../src/instructions';
import { Journal } from '../src/journal';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import { generateScenes } from '../../tools/gen-placeholders';
import { flagsOf, parseQuestFile, parseRun, questKey, type QuestEntry, type QuestStatus } from '../../shared/quests';
import { TRAIL, WAITS } from '../../shared/quests.fixture';
import type { Band } from '../../shared/standing';
import type { Extra } from '../../shared/extras';

const LIBRARY: Extra[] = [
  { id: 'sdg-01', file: 'sdg-01.png', tags: ['sdg'] },
  { id: 'sdg-02', file: 'sdg-02.png', tags: ['sdg'] },
  { id: 'dock-01', file: 'dock-01.png', tags: ['dock'] },
];

let tmpDir: string;
let registry: SceneRegistry;
beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-quests-'));
  await generateScenes(tmpDir);
  registry = (await SceneRegistry.load(tmpDir)).registry;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
const dbs: Db[] = [];
afterEach(() => {
  while (dbs.length) dbs.pop()!.close();
});

const parsed = parseQuestFile('paper-trail', TRAIL, { roster: null, places: null });
if (!parsed.ok) throw new Error('fixture');
const QUEST = parsed.entry;
const KEY = questKey('hicks', 'paper-trail');

function relayWith(o: { extras?: Extra[]; book?: QuestEntry[]; trust?: Band; place?: string | null; clock?: number; backend?: Backend; contact?: string; others?: () => QuestStatus[] } = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'hicks' });
  dbs.push(db);
  const events: ServerEvent[] = [];
  const backend = o.backend ?? fakeBackend(() => reply('Hm.'));
  let book = o.book ?? [QUEST];
  const contact = o.contact ?? 'hicks';
  let place = o.place === undefined ? 'lowlight-intake' : o.place;
  let clock = o.clock;
  const status = (p: string): QuestStatus[] => [
    ...db.metaWithPrefix(`quest.${p}.`).flatMap(({ k, v }) => {
      const run = parseRun(v);
      return run ? [{ id: k.slice(`quest.${p}.`.length), contact, run }] : [];
    }),
    ...(o.others?.() ?? []),
  ];
  const quests: NonNullable<ChatRelayDeps['quests']> = {
    contact,
    book: () => book,
    status,
    placeId: () => place,
    contactName: (id) => (id === 'nix-direct' ? 'Nix' : id),
    placeName: (id) => (id === 'lowlight-intake' ? 'Lowlight Intake' : id),
    ctx: (p) => ({ flags: flagsOf(status(p)), trust: o.trust ?? 'mid', warmth: 'mid', with: 'hicks' }),
    extras: () => o.extras ?? LIBRARY,
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
    ...(o.clock !== undefined ? { clockNow: () => clock! } : {}),
  });
  return {
    relay,
    db,
    events,
    backend: backend as ReturnType<typeof fakeBackend>,
    setBook: (b: QuestEntry[]) => (book = b),
    setClock: (c: number) => (clock = c),
    setPlace: (p: string | null) => (place = p),
  };
}
const lastUser = (r: TurnRequest) => r.messages.at(-1)!.content;
const run = (db: Db) => parseRun(db.getMeta(KEY));
const states = (events: ServerEvent[]) => events.filter((e): e is { type: 'quest_state'; state: QuestState } => e.type === 'quest_state').map((e) => e.state);
const rows = (db: Db) => db.recentMessages('hicks', 50);

describe('starting a quest', () => {
  it('adds the first beat as a quest row, writes the run stamped to it, and runs her turn with the block', async () => {
    const { relay, db, events, backend } = relayWith();
    expect(relay.questState('hicks')).toEqual({ open: [{ id: 'paper-trail', title: 'Paper Trail', pitch: null, timed: false }], active: null, changed: null, waiting: null, elsewhere: [] });
    await relay.startQuest('hicks', 'paper-trail');
    const row = rows(db).find((m) => m.mode === 'quest' && m.role === 'user')!;
    expect(row.text).toBe('*Boots on the stairs.*\n\n"Evening," he says.');
    expect(row.quest).toEqual({ id: 'paper-trail', title: 'Paper Trail', beat: 'sentinel', stranger: { name: 'Arlo Venn', voice: 'an SDG Sentinel: polite, patient, never raises his voice' } });
    expect(run(db)).toMatchObject({ beat: 'sentinel', picks: [], flags: {}, done: false });
    expect(db.writes().find((w) => w.key === KEY)!.messageId).toBe(row.id);
    const sent = lastUser(backend.reqs[0]);
    // The beat is told once, as the row's line: the block points at it instead of saying it again.
    expect(sent).toContain('[quest — Paper Trail. Where it stands: the [quest — Paper Trail: …] line at the end of this message, which they have just read\n');
    expect(sent.split('Boots on the stairs')).toHaveLength(2);
    expect(sent).toContain(QUEST_INSTRUCTIONS);
    expect(sent).toContain('[quest — Paper Trail: *Boots on the stairs.*');
    expect(states(events).at(-1)!.active).toEqual({
      id: 'paper-trail',
      title: 'Paper Trail',
      beat: 'sentinel',
      choices: [
        { id: 'hand', line: 'Hand it over.' },
        { id: 'stall', line: 'Stall him till morning.' },
        { id: 'deny', line: "Say there's no ledger." },
      ],
    });
  });

  it("refuses a quest that isn't open here", async () => {
    const { relay, db } = relayWith({ place: 'haes-noodles' });
    expect(await relay.startQuest('hicks', 'paper-trail')).toBe("that quest isn't open here");
    expect(rows(db)).toEqual([]);
  });

  it('puts the block on later turns while the cards are up, and not on OOC', async () => {
    const { relay, backend } = relayWith();
    await relay.startQuest('hicks', 'paper-trail');
    await relay.send('hicks', 'What do we do?');
    expect(lastUser(backend.reqs[1])).toContain('[quest — Paper Trail. Where it stands: *Boots on the stairs.*');
    await relay.send('hicks', 'quick question', 'ooc');
    expect(lastUser(backend.reqs[2])).not.toContain('[quest —');
  });

  it('gives no block with no quest active', async () => {
    const { relay, backend } = relayWith();
    await relay.send('hicks', 'hi');
    expect(lastUser(backend.reqs[0])).not.toContain('[quest —');
  });
});

describe('choosing', () => {
  it('with a typed line: one row of the line, the outcome and the next beat; the run moves and gains the flag', async () => {
    const { relay, db } = relayWith();
    await relay.startQuest('hicks', 'paper-trail');
    await relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'hand', said: '*slides it over* Take it.' });
    const pick = rows(db).filter((m) => m.mode === 'quest' && m.role === 'user').at(-1)!;
    expect(pick.text).toBe("*slides it over* Take it.\n\n*He thanks you like he means it.*\n\n*Venn is back.*");
    expect(pick.quest).toEqual({ id: 'paper-trail', title: 'Paper Trail', beat: 'return', pick: { choice: 'hand', line: '*slides it over* Take it.' } });
    expect(run(db)).toMatchObject({ beat: 'return', picks: [{ beat: 'sentinel', choice: 'hand' }], flags: { ledger: 'given' }, done: false });
  });

  it('with a card click: the choice line in the second person', async () => {
    const { relay, db } = relayWith();
    await relay.startQuest('hicks', 'paper-trail');
    await relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'stall' });
    expect(rows(db).filter((m) => m.mode === 'quest' && m.role === 'user').at(-1)!.text.startsWith('You stall him till morning.\n\n')).toBe(true);
  });

  it('moves the clock by the tag on top of the row', async () => {
    const { relay, db } = relayWith({ clock: 1200 });
    await relay.startQuest('hicks', 'paper-trail');
    await relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'stall' });
    expect(rows(db).filter((m) => m.mode === 'quest' && m.role === 'user').at(-1)!.clock).toBe(1200 + 10 + 360);
  });

  it('ends: done, no beat, no cards', async () => {
    const { relay, db } = relayWith();
    await relay.startQuest('hicks', 'paper-trail');
    await relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'hand' });
    await relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'return', choice: 'run' });
    expect(run(db)).toMatchObject({ beat: null, done: true });
    expect(rows(db).filter((m) => m.mode === 'quest' && m.role === 'user').at(-1)!.quest!.beat).toBeNull();
    expect(relay.questState('hicks')).toEqual({ open: [], active: null, changed: null, waiting: null, elsewhere: [] });
  });

  it('refuses a stale beat or a hidden choice, and writes nothing (Review Focus 1)', async () => {
    const { relay, db } = relayWith({ trust: 'low' });
    await relay.startQuest('hicks', 'paper-trail');
    const before = rows(db).length;
    expect(await relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'return', choice: 'run' })).toBe('that choice has passed');
    expect(await relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'deny' })).toBe('that choice has passed');
    expect(rows(db)).toHaveLength(before);
    expect(run(db)!.beat).toBe('sentinel');
  });

  it('a run whose beat is gone from the file shows no cards and says so (Review Focus 2)', async () => {
    const { relay, setBook } = relayWith();
    await relay.startQuest('hicks', 'paper-trail');
    const renamed = parseQuestFile('paper-trail', TRAIL.replaceAll('sentinel', 'doorway'), { roster: null, places: null });
    if (!renamed.ok) throw new Error('fixture');
    setBook([renamed.entry]);
    expect(relay.questState('hicks')).toEqual({ open: [], active: null, changed: 'Paper Trail has changed since you started it', waiting: null, elsewhere: [] });
    expect(await relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'hand' })).toBe('that choice has passed');
  });
});

describe('quest state follows the room (review fix)', () => {
  it('is sent again after any turn when what the room shows changed, and not when it did not', async () => {
    let trust: Band = 'low';
    const { relay, events } = relayWith();
    const ctxOf = (relay as unknown as { deps: { quests: { ctx: (p: string) => unknown } } }).deps.quests;
    const base = ctxOf.ctx.bind(ctxOf);
    ctxOf.ctx = (p: string) => ({ ...(base(p) as object), trust });
    await relay.startQuest('hicks', 'paper-trail');
    expect(states(events).at(-1)!.active!.choices.map((c) => c.id)).toEqual(['hand', 'stall']);
    const before = states(events).length;
    await relay.send('hicks', 'small talk');
    expect(states(events)).toHaveLength(before);
    trust = 'mid';
    await relay.send('hicks', 'you can trust me');
    expect(states(events).at(-1)!.active!.choices.map((c) => c.id)).toEqual(['hand', 'stall', 'deny']);
  });

  it('a regenerate of her reply to a quest row keeps the run at its beat (Review Focus 5)', async () => {
    const { relay, db } = relayWith();
    await relay.startQuest('hicks', 'paper-trail');
    const her = rows(db).filter((m) => m.role === 'agent').at(-1)!;
    await relay.regenerate('hicks', her.id);
    expect(run(db)!.beat).toBe('sentinel');
    await relay.swipe('hicks', her.id, 0);
    expect(run(db)!.beat).toBe('sentinel');
  });
});

describe('the pick check input', () => {
  it('is the beat as one line and the shown choices; null with no quest at a beat', async () => {
    const { relay } = relayWith({ trust: 'low' });
    expect(relay.questCheck('hicks')).toBeNull();
    await relay.startQuest('hicks', 'paper-trail');
    expect(relay.questCheck('hicks')).toEqual({
      beat: '*Boots on the stairs.* "Evening," he says.',
      choices: [
        { id: 'hand', line: 'Hand it over.' },
        { id: 'stall', line: 'Stall him till morning.' },
      ],
    });
  });
});

describe('rewind (Review Focus 5)', () => {
  it('to the beat row keeps the quest at that beat; to before a pick brings the old cards back', async () => {
    const { relay, db, events } = relayWith();
    await relay.send('hicks', 'hello');
    await relay.startQuest('hicks', 'paper-trail');
    const beatRow = rows(db).find((m) => m.mode === 'quest' && m.role === 'user')!;
    await relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'hand' });
    expect(run(db)!.beat).toBe('return');
    await relay.rewind('hicks', beatRow.id);
    expect(run(db)!.beat).toBe('sentinel');
    expect(states(events).at(-1)!.active!.beat).toBe('sentinel');
    const first = rows(db).find((m) => m.text === 'hello')!;
    await relay.rewind('hicks', first.id);
    expect(run(db)).toBeNull();
    expect(states(events).at(-1)!.open).toEqual([{ id: 'paper-trail', title: 'Paper Trail', pitch: null, timed: false }]);
  });
});

describe('waits (quest waits spec §3)', () => {
  const parsedW = parseQuestFile('paper-trail', WAITS, { roster: null, places: null });
  if (!parsedW.ok) throw new Error('fixture');
  const W = { entry: parsedW.entry };
  const D = 1440;
  const at = (day: number, hhmm: number) => (day - 1) * D + hhmm;
  /** Started and HAND picked at Day 1 21:00: the run waits for 06:00 at the Intake, by 12:00. */
  async function parked(o: Parameters<typeof relayWith>[0] = {}) {
    const r = relayWith({ book: [W.entry], clock: at(1, 21 * 60), ...o });
    await r.relay.startQuest('hicks', 'paper-trail');
    await r.relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'hand' });
    return r;
  }
  const userRows = (db: Db) => rows(db).filter((m) => m.mode === 'quest' && m.role === 'user');

  it('a pick into a wait writes the pick and the outcome only, and parks the run', async () => {
    const { db, relay, backend } = await parked();
    expect(userRows(db).at(-1)!.text).toBe('You hand it over.\n\n*He thanks you like he means it.*');
    expect(userRows(db).at(-1)!.quest).toMatchObject({ beat: null, waiting: true });
    expect(run(db)).toMatchObject({ beat: null, done: false, wait: { to: 'return', at: 'lowlight-intake', from: at(2, 360), by: at(2, 720), else: 'gone' } });
    expect(relay.questState('hicks')).toMatchObject({ active: null, waiting: { id: 'paper-trail', next: 'The Sentinel said morning. Be at the Intake.', at: 'Lowlight Intake', from: at(2, 360), by: at(2, 720), ready: false } });
    await relay.send('hicks', 'So we wait.');
    const sent = lastUser(backend.reqs.at(-1)!);
    expect(sent).toContain("[on your mind — Paper Trail: The Sentinel said morning. Be at the Intake. You know it's coming");
    expect(sent).not.toContain('Where it stands');
  });

  it('says whether you are where it waits (the panel offers WAIT UNTIL only there)', async () => {
    const { relay, setPlace } = await parked();
    expect(relay.questState('hicks').waiting!.here).toBe(true);
    setPlace('haes-noodles');
    expect(relay.questState('hicks').waiting!.here).toBe(false);
  });

  it('lists a timed quest with its pitch', () => {
    const p = parseQuestFile('paper-trail', WAITS.replace('after: null', 'after: null\npitch: One page.'), { roster: null, places: null });
    if (!p.ok) throw new Error('fixture');
    expect(relayWith({ book: [p.entry] }).relay.questState('hicks').open).toEqual([{ id: 'paper-trail', title: 'Paper Trail', pitch: 'One page.', timed: true }]);
  });

  it('plays the beat when due, choosing its version then, and keeps that version', async () => {
    const { db, relay, setClock } = await parked();
    expect(await relay.playDueQuest('hicks')).toBeNull();
    setClock(at(2, 361));
    await relay.playDueQuest('hicks');
    expect(userRows(db).at(-1)!.text).toBe('*Venn is back, with the page.*');
    expect(run(db)).toMatchObject({ beat: 'return', variant: 0, wait: null });
    expect(relay.questState('hicks').active!.choices.map((c) => c.id)).toEqual(['ask', 'out2']);
  });

  it('waits while elsewhere, and plays the missed path past the deadline anywhere', async () => {
    const { db, relay, setClock, setPlace } = await parked();
    setPlace('haes-noodles');
    setClock(at(2, 400));
    expect(await relay.playDueQuest('hicks')).toBeNull();
    setClock(at(2, 721));
    await relay.playDueQuest('hicks');
    expect(userRows(db).at(-1)!.text).toBe('*A card in the door.*');
    expect(run(db)).toMatchObject({ done: true, beat: null, wait: null });
  });

  it('a turn whose reply crosses the time plays the beat right after it', async () => {
    const { relay, backend, setClock } = await parked();
    const before = backend.reqs.length;
    setClock(at(2, 365));
    await relay.send('hicks', 'Morning already.');
    await new Promise((r) => setTimeout(r, 20));
    expect(backend.reqs.length).toBe(before + 2);
    expect(lastUser(backend.reqs.at(-1)!)).toContain('*Venn is back, with the page.*');
  });

  it('OOC and goodbye turns never pull the beat in (review I2)', async () => {
    const { relay, backend, setClock } = await parked();
    setClock(at(2, 365));
    for (const [text, mode] of [['how do I save?', 'ooc'], ['Goodnight.', 'end']] as const) {
      const before = backend.reqs.length;
      expect((await relay.send('hicks', text, mode)).ok).toBe(true);
      await new Promise((r) => setTimeout(r, 20));
      expect(backend.reqs.length).toBe(before + 1);
    }
  });

  it('WAIT stops at the moment the quest waits for, while you are where it happens (final review I1)', async () => {
    const { relay, setClock, setPlace } = await parked();
    setClock(at(2, 60));
    expect(relay.questWaitStop('hicks')).toBe(at(2, 360));
    setPlace('haes-noodles');
    expect(relay.questWaitStop('hicks')).toBeNull();
    setPlace('lowlight-intake');
    setClock(at(2, 400));
    expect(relay.questWaitStop('hicks')).toBeNull();
  });

  it('two calls at once play it once (Review Focus 1)', async () => {
    const { db, relay, setClock } = await parked();
    setClock(at(2, 361));
    const n = userRows(db).length;
    await Promise.all([relay.playDueQuest('hicks'), relay.playDueQuest('hicks')]);
    expect(userRows(db)).toHaveLength(n + 1);
  });

  it('elsewhere: a run in another contact\'s room waits there and is listed here (Review Focus 2)', async () => {
    const waiting = { id: 'paper-trail', contact: 'nix-direct', run: { beat: null, variant: 0, wait: { to: 'return', from: 0, at: null, ready: false, by: null, else: null, next: 'Be at the Intake.' }, picks: [], flags: {}, done: false, at: 1 } };
    const { relay, db } = relayWith({ book: [W.entry], clock: 5000, others: () => [waiting] });
    expect(await relay.playDueQuest('hicks')).toBeNull();
    expect(userRows(db)).toHaveLength(0);
    expect(relay.questState('hicks').elsewhere).toEqual([{ id: 'paper-trail', title: 'Paper Trail', contact: 'nix-direct', contactName: 'Nix', next: 'Be at the Intake.' }]);
  });

  it('rewind back across the due row parks it again; with the clock back before the hour it waits, past it it plays again (Review Focus 3)', async () => {
    const { db, relay, setClock } = await parked();
    const herReply = rows(db).filter((m) => m.role === 'agent').at(-1)!;
    setClock(at(2, 361));
    await relay.playDueQuest('hicks');
    await relay.rewind('hicks', herReply.id);
    expect(run(db)).toMatchObject({ beat: null, wait: { to: 'return' } });
    // The clock a rewind leaves: back before the hour (no WAIT), the wait holds.
    setClock(at(1, 22 * 60));
    expect(await relay.playDueQuest('hicks')).toBeNull();
    // A WAIT is never rewound (story clock spec), so past the hour the beat comes again.
    setClock(at(2, 361));
    await relay.playDueQuest('hicks');
    expect(run(db)).toMatchObject({ beat: 'return', wait: null });
  });

  it('a file whose waited-for beat is gone says it changed, and plays nothing (Review Focus 5)', async () => {
    const { relay, setBook, setClock } = await parked();
    const renamed = parseQuestFile('paper-trail', WAITS.replaceAll('return', 'comeback'), { roster: null, places: null });
    if (!renamed.ok) throw new Error('fixture');
    setBook([renamed.entry]);
    setClock(at(2, 361));
    expect(relay.questState('hicks').changed).toBe('Paper Trail has changed since you started it');
    expect(await relay.playDueQuest('hicks')).toBeNull();
  });

  it('a ready wait plays only on CONTINUE', async () => {
    const R = parseQuestFile('paper-trail', WAITS.replace('wait: until 06:00 · at lowlight-intake · by 12:00 else gone', 'wait: ready').replace('\n## gone\n*A card in the door.*\n→ end\n', ''), { roster: null, places: null });
    if (!R.ok) throw new Error(JSON.stringify(R.problems));
    const r = relayWith({ book: [R.entry], clock: 1200 });
    await r.relay.startQuest('hicks', 'paper-trail');
    await r.relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'hand' });
    expect(await r.relay.playDueQuest('hicks')).toBeNull();
    expect(r.relay.questState('hicks').waiting!.ready).toBe(true);
    // The story clock has moved past the pick (her reply and the row carry it on).
    r.setClock(1300);
    await r.relay.playDueQuest('hicks', { ready: true });
    expect(run(r.db)).toMatchObject({ beat: 'return', wait: null });
  });
});

describe('stranger faces (stranger faces spec §5)', () => {
  const VENN = /(stranger: Arlo Venn[^\n]*\n)/;
  /** TRAIL with `face` under Venn on the first beat, and (when `later`) Venn back on the return beat with `later` as its face line. */
  function book(face: string, later?: string): QuestEntry[] {
    let text = TRAIL.replace(VENN, `$1${face}\n`);
    if (later !== undefined) text = text.replace('# return\n', `# return\nstranger: Arlo Venn — polite${later ? `\n${later}` : ''}\n`);
    const p = parseQuestFile('paper-trail', text, { roster: null, places: null });
    if (!p.ok) throw new Error(JSON.stringify(p.problems));
    return [p.entry];
  }
  const questRows = (db: Db) => rows(db).filter((m) => m.mode === 'quest' && m.role === 'user');

  it('a fixed face goes on the row and into the run', async () => {
    const { relay, db } = relayWith({ book: book('face: sdg-01') });
    await relay.startQuest('hicks', 'paper-trail');
    expect(questRows(db).at(-1)!.quest!.stranger!.face).toBe('sdg-01');
    expect(run(db)!.faces).toEqual({ 'Arlo Venn': 'sdg-01' });
  });

  it('any face with a tag is drawn once, and kept on a later beat with no face: line', async () => {
    const { relay, db } = relayWith({ book: book('face: any sdg', '') });
    await relay.startQuest('hicks', 'paper-trail');
    const drawn = questRows(db).at(-1)!.quest!.stranger!.face!;
    expect(['sdg-01', 'sdg-02']).toContain(drawn);
    await relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'hand' });
    expect(questRows(db).at(-1)!.quest!.stranger).toMatchObject({ name: 'Arlo Venn', face: drawn });
    expect(run(db)!.faces).toEqual({ 'Arlo Venn': drawn });
  });

  it('any face with a tag on a later beat keeps the face drawn, and redraws one the tag no longer fits', async () => {
    const kept = relayWith({ book: book('face: any sdg', 'face: any sdg') });
    await kept.relay.startQuest('hicks', 'paper-trail');
    const drawn = questRows(kept.db).at(-1)!.quest!.stranger!.face!;
    await kept.relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'hand' });
    expect(questRows(kept.db).at(-1)!.quest!.stranger!.face).toBe(drawn);
    const moved = relayWith({ book: book('face: dock-01', 'face: any sdg') });
    await moved.relay.startQuest('hicks', 'paper-trail');
    await moved.relay.chooseQuest('hicks', { id: 'paper-trail', beat: 'sentinel', choice: 'hand' });
    expect(['sdg-01', 'sdg-02']).toContain(questRows(moved.db).at(-1)!.quest!.stranger!.face);
  });

  it('no face: line and none drawn: the row has no face', async () => {
    const { relay, db } = relayWith();
    await relay.startQuest('hicks', 'paper-trail');
    expect(questRows(db).at(-1)!.quest!.stranger).not.toHaveProperty('face');
    expect(run(db)!.faces ?? {}).toEqual({});
  });

  it('rewinding past START takes the drawn face with the run', async () => {
    const { relay, db } = relayWith({ book: book('face: any sdg') });
    await relay.send('hicks', 'hello');
    await relay.startQuest('hicks', 'paper-trail');
    expect(run(db)!.faces!['Arlo Venn']).toBeDefined();
    await relay.rewind('hicks', rows(db).find((m) => m.text === 'hello')!.id);
    expect(run(db)).toBeNull();
    expect(questRows(db)).toHaveLength(0);
  });
});
