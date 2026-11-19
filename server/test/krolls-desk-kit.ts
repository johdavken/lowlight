/**
 * Kroll's desk (spec 2026-11-18 Kroll's desk): what every test of her jobs shares. Not a test file itself.
 *
 * A new job's test file (one per job, so jobs can be written in parallel):
 *
 *   import { describe, expect, it } from 'vitest';
 *   import { jobShape, play, useKrollsDesk } from './krolls-desk-kit';
 *   useKrollsDesk();                                         // the scene registry and db cleanup, once per file
 *   jobShape('countersign', { id: 'price', label: 'HER PRICE', size: 3 });   // the shape every job of hers keeps
 *   describe('Countersign', () => {
 *     it('a clean run ...', async () => {
 *       const r = await play('countersign', { people: ['mia'], picks: [['dock', 'gate', 'you'], ...], trust: 4 });
 *       expect(r.trust).toBe(5);                             // r: run, tier, clocks, trust, rep, db, backend
 *     });
 *   });
 *
 * `play` moves the file onto the test relay (`onRelay`): `with: [adebayo]`, `· trust adebayo` and `view adebayo`
 * become the relay's contact, `starts: sdg-floor` a place in Nexus. Kroll's starting trust is 4 unless `trust` says
 * otherwise (the game starts her at 1, from Soren's `knows.adebayo`: a test says the trust it needs), and her band in
 * the job's conditions (`trust>=high`) is the one her trust stands in now. The crew on offer is `CREW`: bo (muscle), mia
 * (face), ash (ears), dez (runner), fen (fence); every program is owned; the decks are world/gear's.
 *
 * A gated job starts through its real `after:`: `flags` seeds a done run before it carrying them (`kroll_one`), as Come
 * Up's end would. `draw` forces a `draw <name>:` line to one value, `day` plays it on that story night, and `on` plays
 * it on a relay you already have (several jobs, one save), whose book must hold it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChatRelay, type ChatRelayDeps } from '../src/chat-relay';
import { fakeBackend, reply } from './fixtures/backend';
import { fakePlayers } from './fixtures/players';
import { openDb, type Db } from '../src/db';
import { Journal } from '../src/journal';
import { Room } from '../src/room-state';
import { SceneRegistry } from '../src/scenes';
import { generateScenes } from '../../tools/gen-placeholders';
import { beatDominance, flagsOf, parseQuestFile, parseRun, questKey, type Beat, type QuestEntry, type QuestRun, type QuestStatus } from '../../shared/quests';
import { foldKit, heatIn, type KitEvent } from '../../shared/mission';
import type { Deck } from '../../shared/gear';
import { parsePrograms } from '../../shared/programs';
import { nerveMax, type Stats } from '../../shared/stats';
import { facesFor } from '../../shared/dice';
import type { CrewMember } from '../../shared/crew-fold';
import type { Specialty } from '../../shared/crew-book';
import type { Way } from '../../shared/crew-ways';
import { bandOf, DEFAULT_SHARED_STANDING, parseStored, standingKey } from '../../shared/standing';
import { parseDecks } from '../../shared/gear';
import { DAY, START } from '../../shared/clock';
import { trustControl } from '../src/standing';

let tmpDir: string;
let registry: SceneRegistry;
const dbs: Db[] = [];
/** Registers the file's hooks: placeholder scenes for the relay's room, and closing each test's db. Call once per test file. */
export function useKrollsDesk(): void {
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'krolls-desk-'));
    await generateScenes(tmpDir);
    registry = (await SceneRegistry.load(tmpDir)).registry;
  });
  afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  afterEach(() => {
    while (dbs.length) dbs.pop()!.close();
  });
}

/** The decks in world/gear/decks.md: Soren carries the field deck, and an ending may give another. */
export const DECKS: Deck[] = parseDecks(fs.readFileSync('world/gear/decks.md', 'utf8')).decks;
export const PROGRAMS = parsePrograms(fs.readFileSync('world/gear/programs.md', 'utf8')).programs;
export const SOREN: Stats = { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 };
export const known = { roster: null, places: null, decks: new Set(DECKS.map((d) => d.id)) };

export const read = (id: string) => fs.readFileSync(`world/quests/${id}.md`, 'utf8');
/**
 * A job of hers moved onto the test relay's player, contact and place: her lines, her clock's judge and `with:` become
 * the relay's contact. `forSoren` keeps its `for: soren` (it lists as his own job, for him alone) and its story opening, as the game reads it.
 */
export const onRelay = (text: string, o: { forSoren?: boolean } = {}) =>
  text
    .replace(/^for: soren\n/m, o.forSoren ? 'for: soren\n' : '')
    // A story opening needs its `for:`: without it, the opening lines go too.
    .replace(/^opening(-view)?: .*\n/gm, (l) => (o.forSoren ? l : ''))
    .replace(/^with: \[adebayo\]$/m, 'with: [nix-direct]')
    .replace(/^starts: sdg-floor$/m, 'starts: haes-noodles')
    .replace(/· trust adebayo( · "[^"]*")?$/m, '· trust nix-direct$1')
    .replace(/^view adebayo( if [^:]+)?:/gm, 'view nix-direct$1:');
export const entryOf = (id: string, text: string): QuestEntry => {
  const r = parseQuestFile(id, text, known);
  if (!r.ok) throw new Error(JSON.stringify(r.problems));
  return r.entry;
};

/** A ready recruit of a specialty. */
export function member(id: string, spec: Specialty): CrewMember {
  return {
    recruit: { id, name: `${id[0].toUpperCase()}${id.slice(1)} Vance`, face: null, origin: 'spine', spec, grade: 1, traits: [], hidden: null, pitch: '', wage: 40 },
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
    hired: { at: 0, place: 'long-haul' },
  };
}
/** One recruit of each specialty a job can ask for. */
export const CREW = [member('bo', 'muscle'), member('mia', 'face'), member('ash', 'ears'), member('dez', 'runner'), member('fen', 'fence')];

/** Kroll's trust in Soren where the game starts it: Soren's `knows.adebayo` (trust 1). A test that needs another says so. */
export const KROLL_START = 1;
/** Where the relay's places are: her desk's stand-in in Nexus, Rue's hab (Arrears) on the Spine. */
const DISTRICTS: Record<string, string> = { 'haes-noodles': 'nexus', 'rue-hab': 'spine' };
/** The key of the done run `flags` seeds: no job's id, so its flags pass through as another job's would. */
export const SEEDED = 'seeded@0';

/**
 * Soren with Kroll as the relay's contact: her trust in him starts where her file puts it unless told otherwise, the
 * job's start place in Nexus. `flags`: a done run before the job carrying them. `day`: the story clock on that night
 * (`clock.now` moves it on), and the kit as it stood at the time asked, as the game folds it. `heard`: every contact's
 * `text:` job has been told. `at.place` is where Soren stands (`haes-noodles`, or `rue-hab`).
 */
export function relayWith(book: QuestEntry[], o: { trust?: number; flags?: Record<string, string>; day?: number; heard?: boolean; /** The stranger portraits, for `image … any` draws (narration images). */ extras?: { id: string; file: string; tags: string[] }[]; /** A job's GO IN page clip (voiced job beats), by job id. */ setupVoice?: (quest: string) => string | null } = {}) {
  const db = openDb(':memory:', { defaultPlayer: 'soren' });
  dbs.push(db);
  const backend = fakeBackend(() => reply('Hm.'));
  const contact = 'nix-direct';
  const at = { place: 'haes-noodles' };
  const clocked = o.day !== undefined;
  const clock = { now: START + (o.day ?? 0) * DAY };
  if (o.flags) db.setMeta(questKey('soren', SEEDED), JSON.stringify({ beat: null, variant: 0, wait: null, picks: [], flags: o.flags, done: true, at: 1, day: 0, endDay: 0 }));
  const status = (p: string): QuestStatus[] =>
    db.metaWithPrefix(`quest.${p}.`).flatMap(({ k, v }) => {
      const run = parseRun(v);
      return run ? [{ id: k.slice(`quest.${p}.`.length), contact, run }] : [];
    });
  /** Kit events written outside a run (`seed`): a night's rep the test stands in for. */
  const seeded: KitEvent[] = [];
  const kit = (p: string, when?: number) => {
    const events = [...seeded, ...status(p).flatMap((s) => (s.run.kit ?? []) as KitEvent[])];
    // On a clocked relay the kit is what it was at the time asked (the board's 06:00), as the game's is.
    const upTo = clocked && when !== undefined ? events.filter((e) => e.at <= when) : events;
    return foldKit({ deck: 'field-deck', nerveMax: nerveMax(SOREN), from: 1200, programs: PROGRAMS.map((x) => x.id) }, upTo, clocked ? Math.max(1200, when ?? clock.now) : 1200, { districtOf: () => 'nexus' });
  };
  /** Her trust in him now: her standing row, else where it started. */
  const trustNow = (p: string) => parseStored(db.getMeta(standingKey(p)))?.trust ?? o.trust ?? KROLL_START;
  const quests: NonNullable<ChatRelayDeps['quests']> = {
    contact,
    book: () => book,
    status,
    placeId: () => at.place,
    contactName: (id) => id,
    contactPronoun: () => 'she',
    placeName: (id) => id,
    ctx: (p) => {
      const k = kit(p);
      return { flags: flagsOf(status(p)), trust: bandOf(trustNow(p)), warmth: 'mid', with: contact, heat: heatIn(k, 'spine'), deck: DECKS.find((d) => d.id === k.deck) ?? null, stats: SOREN };
    },
    kit,
    decks: () => DECKS,
    programs: () => PROGRAMS,
    crewState: () => ({ members: CREW, prep: {}, scouted: [], taken: [], latest: null, wages: 0 }),
    crewTraits: () => [],
    words: () => [],
    districtOf: (placeId) => DISTRICTS[placeId] ?? null,
    // A job's hire is drawn as one fixed face, so a `gives:` ending's {hire} can be read back.
    jobRecruit: (j) => ({ ...member('hire', j.spec).recruit, id: `r-${j.runKey}`, name: 'Saida Rahm', grade: j.grade }),
    ...(o.heard ? { heard: () => true } : {}),
    ...(o.extras ? { extras: () => o.extras! } : {}),
    ...(o.setupVoice ? { setupVoice: o.setupVoice } : {}),
  };
  const relay = new ChatRelay({
    players: fakePlayers(),
    backend,
    db,
    room: new Room(registry),
    journal: new Journal(db),
    emit: () => {},
    instructions: 'ROOM NOTE',
    quests,
    rollDice: (n: number, keep: 'high' | 'low') => facesFor(6, n, keep),
    trust: trustControl({ db, name: 'Kroll', start: () => ({ trust: o.trust ?? KROLL_START, warmth: 0 }), config: () => null, shared: () => DEFAULT_SHARED_STANDING }),
    ...(clocked ? { clockNow: () => clock.now } : {}),
  });
  /** Writes kit events outside any run (a night's rep the test stands in for). */
  const seed = (...events: KitEvent[]) => void seeded.push(...events);
  /** The ids listed for Soren where he stands now. */
  const listed = () => relay.questState('soren').open.map((q) => q.id);
  return { relay, db, backend, clock, at, seed, listed, trust: () => trustNow('soren') };
}
export type DeskRelay = ReturnType<typeof relayWith>;

/** A pick: the beat, the card, and who does it (`you`, `you:<name>`, a recruit's id, `p:<program>`, `contact`). */
export type Pick = [beat: string, card: string, by: string];

/** A job's text with each `draw <name>:` line in `draw` forced to that one value. */
export const forceDraw = (text: string, draw: Record<string, string> = {}) =>
  Object.entries(draw).reduce((t, [name, v]) => t.replace(new RegExp(`^draw ${name}: .*$`, 'm'), `draw ${name}: ${v} | ${v}`), text);

/** Plays a job of hers from GO IN to its end through the relay, and reads back what the end left. */
export async function play(
  id: string,
  o: {
    people?: string[];
    programs?: string[];
    picks: Pick[];
    trust?: number;
    flags?: Record<string, string>;
    draw?: Record<string, string>;
    day?: number;
    on?: DeskRelay;
    /** Moves (a recruit's or a program's card) played on their beat before its pick. */
    moves?: [beat: string, card: string][];
    /** A move the beat refuses (nothing for it to change) is skipped, not a failure. */
    tryMoves?: boolean;
    /** A run that ALARM 4 sends to the getaway leaves the rest of its picks and goes out through `getaway`'s card, by you. */
    getaway?: string;
  },
) {
  const t = o.on ?? relayWith([entryOf(id, forceDraw(onRelay(read(id)), o.draw))], { trust: o.trust, flags: o.flags, ...(o.day !== undefined ? { day: o.day } : {}) });
  if (o.on && o.day !== undefined) t.clock.now = START + o.day * DAY;
  const { relay, db, backend } = t;
  const before = o.on ? t.trust() : (o.trust ?? KROLL_START);
  const jobMoves = () => (parseStored(db.getMeta(standingKey('soren')))?.moves ?? []).filter((m) => m.job);
  const movesBefore = jobMoves().length;
  const key = questKey('soren', `${id}@${o.day ?? 0}`);
  const at = () => parseRun(db.getMeta(key));
  expect(await relay.startQuest('soren', id, { crew: true, people: o.people ?? [], programs: o.programs ?? [] })).not.toBeTypeOf('string');
  for (const [beat, choice, by] of o.picks) {
    if (o.getaway && at()?.beat === 'getaway') break;
    for (const [mb, card] of o.moves ?? [])
      if (mb === beat) {
        const moved = await relay.crewMove('soren', { id, beat, card });
        if (!o.tryMoves) expect(moved, `${beat} move ${card}`).not.toBeTypeOf('string');
      }
    expect(await relay.chooseQuest('soren', { id, beat, choice, by }), `${beat} ${choice} ${by}`).not.toBeTypeOf('string');
  }
  if (o.getaway && !at()?.done && at()?.beat === 'getaway') expect(await relay.chooseQuest('soren', { id, beat: 'getaway', choice: o.getaway, by: 'you' })).not.toBeTypeOf('string');
  const run: QuestRun = at()!;
  const kitEvents = (run.kit ?? []) as KitEvent[];
  const standing = parseStored(db.getMeta(standingKey('soren')));
  // The newest debrief: on a shared relay, this run's.
  const debrief = db.recentMessages('soren', 80).filter((m) => m.mode === 'quest' && m.quest?.debrief).at(-1)?.quest?.debrief;
  return {
    run,
    db,
    backend,
    tier: debrief?.tier,
    clocks: run.crew?.clocks ?? {},
    /** Her trust after the run; with no standing row written, the trust she started at. Read `moves` to tell a move from none. */
    trust: standing?.trust ?? before,
    /** The standing moves the job wrote (the judging clock's), as [trust delta, reason]; [] when none was written. */
    moves: jobMoves().slice(movesBefore).map((m) => [m.trust, m.reason] as const),
    rep: kitEvents.flatMap((e) => (e.rep ? [[e.rep.district, e.rep.delta] as const] : [])),
    /** The HEAT the run's kit landed, every district's. */
    heat: kitEvents.reduce((n, e) => n + (e.heat ?? 0), 0),
    /** The decks the run's kit gave (an ending's `gives: deck`). */
    decks: kitEvents.flatMap((e) => (typeof e.deck === 'string' ? [e.deck] : [])),
  };
}

/** Every version of every beat, the getaway among them. */
export const allBeats = (q: QuestEntry): Beat[] => [...q.beats.values()].flat();
export const waysOf = (b: Beat): Way[] => b.choices.flatMap((c) => c.ways ?? []);
/** The flags a card or a way sets, by name. */
export const setsOf = (b: Beat): Set<string> => new Set(b.choices.flatMap((c) => [...c.tags.flatMap((t) => (t.kind === 'set' ? [t.name] : [])), ...(c.ways ?? []).flatMap((w) => w.sets.map((s) => s.name))]));
/** Whether every way out of a card sets `flag`, by the card's own `set` or its own. */
export const cardSets = (c: Beat['choices'][number], flag: string): boolean =>
  c.tags.some((t) => t.kind === 'set' && t.name === flag) || ((c.ways ?? []).length > 0 && c.ways!.every((w) => w.sets.some((s) => s.name === flag)));

/**
 * The ways out of a job that leave `flag` unset: each a path of `beat card by` steps to an end. Walks every card, way and
 * missed throw (the card's own `set` with its first `you` way's outcome; nobody throws on the getaway or after it), every
 * beat and outcome version whose flag conditions hold (other conditions are taken as able to hold), and the getaway after
 * any pick that doesn't end the job. [] when every exit sets it.
 */
export function exitsWithout(q: QuestEntry, flag: string): string[][] {
  type Cond = NonNullable<Beat['when']>[number];
  const holdsOn = (when: Cond[] | null | undefined, flags: Record<string, string>) =>
    (when ?? []).every((c) => (c.kind === 'flag' ? (c.op === '=' ? flags[c.name] === c.value : flags[c.name] !== c.value) : c.kind === 'set' ? flags[c.name] !== undefined : true));
  const outcomesOf = (to: string, flags: Record<string, string>) => {
    const o = q.outcomes.get(to);
    if (!o) return [];
    return [...(o.versions ?? []).filter((v) => holdsOn(v.when, flags)).map((v) => q.outcomes.get(v.id)!), o];
  };
  const bad: string[][] = [];
  const seen = new Set<string>();
  const walk = (id: string, flags: Record<string, string>, path: string[], away = id === 'getaway') => {
    const key = `${id}|${away}|${JSON.stringify(Object.entries(flags).sort())}`;
    if (seen.has(key) || bad.length > 20) return;
    seen.add(key);
    for (const b of (q.beats.get(id) ?? []).filter((v) => holdsOn(v.when, flags)))
      for (const c of b.choices) {
        const own = Object.fromEntries(c.tags.flatMap((t) => (t.kind === 'set' ? [[t.name, t.value]] : [])));
        const ways = (c.ways ?? []).map((w) => ({ by: w.key.kind === 'you' ? `you${w.key.name ? `:${w.key.name}` : ''}` : w.key.kind, to: w.to, sets: { ...own, ...Object.fromEntries(w.sets.map((x) => [x.name, x.value])) } }));
        const you = (c.ways ?? []).find((w) => w.key.kind === 'you' && w.when === null);
        const steps = c.ways?.length ? [...ways, ...(you && !away ? [{ by: 'a missed throw', to: you.to, sets: own }] : [])] : [{ by: 'plain', to: c.to, sets: own }];
        for (const st of steps) {
          const now = { ...flags, ...st.sets };
          const here = [...path, `${b.id} ${c.id} ${st.by}`];
          for (const o of outcomesOf(st.to, now)) {
            if (o.to === 'end') {
              if (now[flag] === undefined) bad.push(here);
              continue;
            }
            walk(o.to, now, here, away);
            // ALARM 4 can send a pick that doesn't end the job to the getaway.
            if (!away && q.beats.has('getaway')) walk('getaway', now, [...here, '(ALARM 4)'], true);
          }
        }
      }
  };
  walk(q.first, {}, []);
  return bad;
}

/**
 * What every job at Kroll's desk keeps (spec "Designing with clocks", plan constraints). `second` is the asset's clock.
 */
export function jobShape(id: string, second: { id: string; label: string; size: number }, o: { /** Come Up's: every way out sets `kroll_one`, the flag her other jobs open on. */ setsKrollOne?: boolean; /** Flags every way out sets, however it ends (`exitsWithout`): what a later job's `after:` reads. */ exitsSet?: string[] } = {}) {
  describe(`${id}: the shape of a job at Kroll's desk`, () => {
    const parsed = parseQuestFile(id, read(id), known);
    const q = parsed.ok ? parsed.entry : (null as unknown as QuestEntry);
    const main = () => allBeats(q).filter((b) => b.id !== 'getaway');

    it('parses with no problems and no warnings', () => {
      expect(parsed.ok ? parsed.warnings : parsed.problems).toEqual([]);
    });

    it("the front matter every job of hers carries", () => {
      expect(q).toMatchObject({ kind: 'mission', tier: 1, rules: 'crew', for: 'soren', with: ['adebayo'], starts: 'sdg-floor' });
      expect(q.clocks).toMatchObject([
        { id: 'sees', label: 'WHAT KROLL SEES', size: 3, trust: 'adebayo' },
        { id: second.id, label: second.label, size: second.size },
      ]);
      // Each says what it is under it on the board.
      for (const c of q.clocks!) expect(c.note).toBeTruthy();
      expect(q.trust).toBeNull();
    });

    it('every beat passes the dominance check, every version of it', () => {
      for (const b of allBeats(q)) expect(beatDominance(b, q.outcomes), b.id).toEqual([]);
    });

    it('every beat has her view, and every card of ways a `you` way with no `if`', () => {
      for (const b of allBeats(q)) {
        expect(b.views.some((v) => v.contact === 'adebayo'), b.id).toBe(true);
        for (const c of b.choices.filter((c) => c.ways?.length)) expect(c.ways!.some((w) => w.key.kind === 'you' && w.when === null), `${b.id} ${c.id}`).toBe(true);
      }
    });

    it('a getaway with ways', () => {
      const g = q.beats.get('getaway') ?? [];
      expect(g.length).toBeGreaterThan(0);
      expect(g.flatMap(waysOf).length).toBeGreaterThan(0);
    });

    it('one contact way', () => {
      expect(allBeats(q).flatMap(waysOf).filter((w) => w.key.kind === 'contact')).toHaveLength(1);
    });

    for (const clock of ['sees', second.id])
      it(`${clock}: at least two beats with a way that raises it, at least one with a way that lowers it`, () => {
        const ups = new Set(main().filter((b) => waysOf(b).some((w) => (w.clocks[clock] ?? 0) > 0)).map((b) => b.id));
        const downs = new Set(main().filter((b) => waysOf(b).some((w) => (w.clocks[clock] ?? 0) < 0)).map((b) => b.id));
        expect(ups.size, [...ups].join()).toBeGreaterThanOrEqual(2);
        expect(downs.size).toBeGreaterThanOrEqual(1);
      });

    it("a way gated on a recruit's specialty, and one gated on a flag an earlier beat set", () => {
      const ways = main().flatMap(waysOf);
      expect(ways.some((w) => w.key.kind === 'spec')).toBe(true);
      const setBefore = (b: Beat, flag: string) => {
        const order = [...q.beats.keys()];
        return order.slice(0, order.indexOf(b.id)).some((id) => q.beats.get(id)!.some((x) => setsOf(x).has(flag)));
      };
      const gated = main().filter((b) => waysOf(b).some((w) => w.when?.some((c) => c.kind === 'flag' && setBefore(b, c.name))));
      expect(gated.length).toBeGreaterThan(0);
    });

    it('a double play: a way that takes both clocks down, or one down with the other still', () => {
      const ways = main().flatMap(waysOf);
      const down = (w: Way, a: string, b: string) => (w.clocks[a] ?? 0) < 0 && (w.clocks[b] ?? 0) <= 0;
      expect(ways.some((w) => down(w, 'sees', second.id) || down(w, second.id, 'sees'))).toBe(true);
    });

    for (const flag of o.exitsSet ?? [])
      it(`every way out sets ${flag}, a missed throw and the getaway included`, () => {
        expect(exitsWithout(q, flag)).toEqual([]);
      });

    if (o.setsKrollOne)
      it('every card out of the job (an ending, the getaway) sets kroll_one', () => {
        const ends = allBeats(q).filter((b) => waysOf(b).some((w) => q.outcomes.get(w.to)?.to === 'end') || b.choices.some((c) => q.outcomes.get(c.to)?.to === 'end'));
        expect(ends.map((b) => b.id)).toContain('getaway');
        for (const b of ends) for (const c of b.choices) expect(cardSets(c, 'kroll_one'), `${b.id} ${c.id}`).toBe(true);
      });
  });
}
