/**
 * A crew-rules run as the server reads it (spec 2026-11-17 crew rules): the deck it loads from, the hand, and the board's
 * view of the beat (each card's ways as they stand now, with their costs after the beat's mods). Pure functions of the
 * job, the run and what the runner hands in; `JobRunner` calls them at its entry points.
 */
import type { CrewJobView, HeatPart } from '../../shared/types';
import type { Tier } from '../../shared/mission';
import type { CrewMember } from '../../shared/crew-fold';
import type { Deck } from '../../shared/gear';
import { STARTER_DECK } from '../../shared/mission';
import { baseProgramId, FIREWALL, type Program } from '../../shared/programs';
import { beatTitle, chooseVariant, holds, mentionsFlag, outcomeFor, ownedBy, PUSH_ID, readsFlag, shownChoices, type Beat, type Choice, type CondCtx, type QuestEntry, type QuestRun } from '../../shared/quests';
import { crewGrade, HAND_CONTACT, HAND_YOU, landWay, moveClock, moveOf, MOVES, programCard, type BeatMods, type CrewState, type MoveId } from '../../shared/crew-rules';
import { wayKeyText, type Way } from '../../shared/crew-ways';
import { guestId } from '../../shared/contract';
import { barredOn, carriedOn } from './job-rules';
import { guestArt } from './guest';
import { ceilingOf, settleTake, takeOf } from './take-run';
import { jobTakeSize } from '../../shared/dice';

type Hand = CrewJobView['hand'][number];
type CardWay = CrewJobView['cards'][number]['ways'][number];

/** SCRUB's id: ALARM −1 now, on any beat. */
export const SCRUB = 'scrub';
const PLAY_LINES: Record<string, string> = { [FIREWALL]: "One point of ALARM on this beat doesn't land.", [SCRUB]: 'ALARM −1 now.' };

/** The deck a crew-rules job loads programs into: the one carried, or the Pocket deck when the job bars it. */
export function crewDeck(q: QuestEntry, held: Deck | null, decks: readonly Deck[]): Deck | null {
  const carried = carriedOn(q, held);
  if (carried || !held) return carried;
  return decks.find((d) => d.id === STARTER_DECK) ?? null;
}

/** The job's contact when she joins the hand: the one contact it has, and a card somewhere gives her a way. */
export function contactOf(q: QuestEntry): string | null {
  const her = ownedBy(q);
  if (!her) return null;
  const gives = [...q.beats.values()].flat().some((b) => b.choices.some((c) => (c.ways ?? []).some((w) => w.key.kind === 'contact')));
  return gives ? her : null;
}

/** The beat's mods, only while they belong to it. */
const modsOn = (crew: CrewState, beat: string): BeatMods => (crew.modsBeat === beat ? crew.mods : {});

/** The crew state once a pick has played its beat: the beat's mods are done with. */
export const pastBeat = (crew: CrewState): CrewState => ({ ...crew, mods: {}, modsBeat: null });

export interface HandIn {
  /** The roster with the job's guest in it (`crewOn`). */
  members: CrewMember[];
  /** The programs loaded, each by its load id. */
  programs: Program[];
  contact: { id: string; name: string } | null;
  you: { id: string; name: string };
  /** The job's one contact, whether or not a card gives her a way (the board's comms strip); absent: read from `contact`. */
  owner?: { id: string; name: string } | null;
}

/**
 * The hand: you, each recruit brought (the guest among them), each loaded program, then the contact. A recruit's move is
 * offered (`can`) while they're ready; HOLD THE DOOR only on a job whose file reads `door=held` somewhere. The full
 * gating (a beat the move wouldn't change, the way out itself) is the move's own entry's.
 */
export function handOf(q: QuestEntry, run: QuestRun, beat: string, o: HandIn): Hand[] {
  const crew = run.crew!;
  const state = (id: string): Hand['state'] => crew.goes[id] ?? 'ready';
  const mods = modsOn(crew, beat);
  const setup = run.setup;
  const you: Hand = { id: HAND_YOU, kind: 'you', name: o.you.name, art: `/contacts/${o.you.id}.webp`, state: 'ready' };
  const recruits = (setup?.people ?? []).flatMap((id): Hand[] => {
    const m = o.members.find((x) => x.recruit.id === id);
    if (!m) return [];
    const r = m.recruit;
    const g = setup?.guest && id === guestId(setup.guest.id) ? setup.guest : null;
    const art = g ? (guestArt(g) ?? null) : r.face ? `/api/extras/${encodeURIComponent(r.face)}` : null;
    const mid = moveOf(r.spec);
    const can = state(id) === 'ready' && (mid !== 'hold-the-door' || mentionsFlag(q, 'door'));
    const move = mid ? { move: { id: mid, name: MOVES[mid].name, line: MOVES[mid].line, art: `/abilities/${MOVES[mid].art}`, can } } : {};
    return [{ id, kind: 'recruit', name: r.name, spec: r.spec, grade: r.grade, art, state: state(id), ...move }];
  });
  const programs = o.programs.map((p): Hand => {
    const id = programCard(p.id);
    const base = baseProgramId(p.id);
    const ready = state(id) === 'ready';
    const can = base === FIREWALL ? ready && !mods.wall : base === SCRUB ? ready && (run.alarm ?? 0) > 0 : false;
    return { id, kind: 'program', name: p.name, art: null, state: state(id), ...(PLAY_LINES[base] ? { play: { line: PLAY_LINES[base], can } } : {}) };
  });
  const contact: Hand[] = o.contact ? [{ id: HAND_CONTACT, kind: 'contact', name: o.contact.name, art: `/contacts/${o.contact.id}.webp`, state: state(HAND_CONTACT) }] : [];
  return [you, ...recruits, ...programs, ...contact];
}

/** Each way key's first way in file order whose `if` holds now. */
export function waysStanding(ways: readonly Way[], ctx: CondCtx): Way[] {
  const seen = new Set<string>();
  return ways.filter((w) => {
    const k = wayKeyText(w.key);
    if (seen.has(k) || !holds(w.when, ctx)) return false;
    seen.add(k);
    return true;
  });
}

/** The cards a run shows at `beat`, as the board does. */
const cardsOn = (run: QuestRun, beat: Beat, ctx: CondCtx): Choice[] => shownChoices(beat, ctx).filter((c) => !barredOn(run, beat.id, c.id));

/** Who in the hand (ready) can take a way: you, each ready recruit of its specialty, each ready loaded program it fits, her. */
function takers(w: Way, hand: Hand[], programs: Program[]): string[] {
  const ready = hand.filter((h) => h.state === 'ready');
  switch (w.key.kind) {
    case 'you':
      return [HAND_YOU];
    case 'spec': {
      const spec = w.key.spec;
      return ready.filter((h) => h.kind === 'recruit' && h.spec === spec).map((h) => h.id);
    }
    case 'program': {
      const want = w.key.id;
      return programs.filter((p) => (want === null || baseProgramId(p.id) === want) && ready.some((h) => h.id === programCard(p.id))).map((p) => programCard(p.id));
    }
    case 'contact':
      return ready.some((h) => h.id === HAND_CONTACT) ? [HAND_CONTACT] : [];
  }
}

/** The beats a run can still reach from `from` (every card's outcomes, any version), nearest first; not a getaway or push. */
function beatsAhead(q: QuestEntry, from: string): string[] {
  const out: string[] = [];
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    for (const b of q.beats.get(id) ?? [])
      for (const c of b.choices)
        for (const to of new Set([c.to, ...(c.ways ?? []).map((w) => w.to)])) {
          const next = q.outcomes.get(to)?.to;
          if (!next || next === 'getaway' || PUSH_ID.test(next) || !q.beats.has(next) || seen.has(next)) continue;
          seen.add(next);
          out.push(next);
          queue.push(next);
        }
  }
  return out;
}

/** A take's rank as a cost: none worst. */
const LEFT = { full: 0, part: 1, none: 2 } as const;

/**
 * What a way leaves of your take, printed as a cost (final review C2): its outcome's `take: none` / `part`, read as it
 * would play (the card's and the way's `set` in, the way's clocks moved). On a getaway reached from a push beat it is a
 * lost push (final review I1): the take drops a step whatever the way, to none from part. A way that ends the job with a
 * `lose` (as it lands, after any settle) at least the TAKE it leaves with empties it: none, and the job is blown.
 */
export function leavesOf(q: QuestEntry, run: QuestRun, w: Way, cardSets: Record<string, string>, ctx: CondCtx, o: { take?: number; lose?: number } = {}): 'none' | 'part' | null {
  const counts = { ...(ctx.counts ?? {}) };
  for (const [id, n] of Object.entries(w.clocks)) counts[id] = moveClock(counts[id] ?? 0, n, q.clocks?.find((k) => k.id === id)?.size ?? n);
  const flags = { ...ctx.flags, ...cardSets, ...Object.fromEntries(w.sets.map((x) => [x.name, x.value])) };
  const outcome = outcomeFor(q, w.to, { ...ctx, flags, counts });
  if (outcome?.to === 'end' && o.take !== undefined && (o.lose ?? 0) > 0 && (o.lose ?? 0) >= o.take) return 'none';
  const own = outcome?.effects.take;
  const pushed: 'none' | 'part' | null = run.getaway && run.push?.state === 'playing' ? ((run.take ?? 'full') === 'full' ? 'part' : 'none') : null;
  const mine: 'none' | 'part' | null = own === 'none' || own === 'part' ? own : null;
  if (!mine || !pushed) return mine ?? pushed;
  return LEFT[mine] >= LEFT[pushed] ? mine : pushed;
}

/**
 * The board's view of a crew-rules run at `beat`: its clocks, the hand, each card's ways as they stand (costs after the
 * beat's mods, TAKE capped at what can still land) and who would throw, the mods played, and for each beat ahead who unspent has a way there (any way the
 * file writes there, whatever its `if`).
 */
export function crewView(q: QuestEntry, run: QuestRun, beat: Beat, o: HandIn & { ctx: CondCtx }): CrewJobView {
  const crew = run.crew!;
  const mods = modsOn(crew, beat.id);
  // A move is offered only where it would change the beat (`moveRefusal`).
  const hand0 = handOf(q, run, beat.id, o);
  const hand = hand0.map((h) => (h.move ? { ...h, move: { ...h.move, can: h.move.can && moveRefusal(q, run, beat, h.move.id as MoveId, { ctx: o.ctx, hand: hand0, programs: o.programs, mover: h.id }) === null } } : h));
  const recruits = hand.filter((h) => h.kind === 'recruit' && h.state === 'ready');
  const getaway = !!run.getaway;
  const shown = cardsOn(run, beat, o.ctx);
  const nextOf = (to: string): string | null => {
    const n = outcomeFor(q, to, o.ctx)?.to;
    return n && q.beats.has(n) ? n : null;
  };
  const forks = new Set(shown.map((c) => nextOf(c.to)).filter((x) => x !== null)).size > 1;
  // What TAKE can still land (last pass A2): the room left under the job's size, none on a push beat (it fills no TAKE).
  // A way prints its take capped at that, so near a full TAKE it never promises more than lands.
  const room = run.push?.state === 'playing' ? 0 : Math.max(0, jobTakeSize(q) - takeOf(run, q));
  const cards = shown.map((c): CrewJobView['cards'][number] => {
    const leadsTo = forks ? nextOf(c.to) : null;
    const leads = leadsTo ? { leads: beatTitle(chooseVariant(q, leadsTo, o.ctx)?.beat ?? { id: leadsTo }) } : {};
    const kind = c.ways?.length ? {} : c.crack ? { crack: true as const } : { plain: true as const };
    const cardSets = Object.fromEntries(c.tags.flatMap((t) => (t.kind === 'set' ? [[t.name, t.value]] : [])));
    const ways = waysStanding(c.ways ?? [], o.ctx).flatMap((w) => {
      const l = landWay(w, mods, { getaway });
      // On a getaway reached from a push beat the job's take is settled: `lose` and `cut` can't land there (final review I1).
      const settled = getaway && run.push?.state === 'playing';
      // A push beat's `lose` never lands (jobStep): it can't empty the TAKE there.
      const left = leavesOf(q, run, w, cardSets, o.ctx, { take: takeOf(run, q) + Math.min(l.take, room), lose: settled || run.push?.state === 'playing' ? 0 : l.lose });
      // A way that takes a clock down shows only what would land: it stops at 0 (`moveClock`), so at 0 it moves nothing.
      const clocks = Object.fromEntries(Object.entries(l.clocks).map(([id, n]) => [id, n < 0 ? Math.max(n, -(crew.clocks[id] ?? 0)) || 0 : n]));
      return takers(w, hand, o.programs).map((by): CardWay => ({ by, ...(w.key.kind === 'you' && w.key.name ? { name: w.key.name } : {}), line: w.line, take: Math.min(l.take, room), alarm: l.alarm, heat: l.heat, clocks, cut: settled ? 0 : l.cut, lose: settled ? 0 : l.lose, ...(l.harm ? { harm: l.harm } : {}), ...(left ? { leaves: left } : {}) }));
    });
    // Nobody throws on a getaway, or on the beat it leads on to (final review C1): its cards are yours alone.
    const throws = c.ways?.length && !getaway ? recruits.filter((r) => !ways.some((w) => w.by === r.id)).map((r) => r.id) : [];
    return { id: c.id, short: c.short ?? c.id.toUpperCase(), line: c.line, ...leads, ...kind, ways, throws };
  });
  const played = [
    ...(mods.noAlarm ? [{ label: MOVES['cover-story'].name, art: `/abilities/${MOVES['cover-story'].art}` }] : []),
    ...(mods.noHeat ? [{ label: MOVES['loop-the-cams'].name, art: `/abilities/${MOVES['loop-the-cams'].art}` }] : []),
    ...(mods.plusTake ? [{ label: MOVES['listen-in'].name, art: `/abilities/${MOVES['listen-in'].art}` }] : []),
    ...(mods.wall ? [{ label: 'FIREWALL' }] : []),
  ];
  const ahead = Object.fromEntries(
    beatsAhead(q, beat.id).map((id) => {
      const specs = new Set((q.beats.get(id) ?? []).flatMap((b) => b.choices.flatMap((c) => (c.ways ?? []).flatMap((w) => (w.key.kind === 'spec' ? [w.key.spec] : [])))));
      return [id, recruits.filter((r) => r.spec && specs.has(r.spec)).map((r) => r.name.split(' ')[0])];
    }),
  );
  // The job's one contact (`with:`), way or none: the board shows her comms strip only then.
  const her = ownedBy(q);
  const name = her ? (o.owner?.id === her ? o.owner.name : o.contact?.id === her ? o.contact.name : her) : null;
  return { title: beatTitle(beat), clocks: (q.clocks ?? []).map((k) => ({ id: k.id, label: k.label, size: k.size, value: crew.clocks[k.id] ?? 0, ...(k.note ? { note: k.note } : {}) })), hand, cards, mods: played, ahead, ...(her ? { contact: { id: her, name: name! } } : {}) };
}

/**
 * The board's view of a crew-rules run on its WALK / PRESS ON card (pressing on spec §1; crew rules spec, The end: PRESS
 * ON works as now, for no NERVE): WALK and, while the file has a push beat left, PRESS ON, as plain panels; the hand as
 * it stands, with no moves (there's no beat to play them on). `walk`: what WALK keeps; `press`: PRESS ON is offered.
 */
export function pushView(q: QuestEntry, run: QuestRun, o: HandIn & { walk: { sol: number; heat: number }; press: boolean; ids: { walk: string; press: string }; fills?: boolean }): CrewJobView {
  const crew = run.crew!;
  const hand = handOf(q, run, '', o).map(({ move: _, ...h }) => h);
  const plain = (id: string, short: string, line: string): CrewJobView['cards'][number] => ({ id, short, line, plain: true, ways: [], throws: [] });
  const cards = [
    plain(o.ids.walk, 'WALK', `${o.walk.sol} SOL · HEAT ${o.walk.heat < 0 ? `−${-o.walk.heat}` : `+${o.walk.heat}`}`),
    // What losing costs (push-run.ts lossEvents): a lost push drops the take a step, and from part that's blown.
    // From full, a getaway on the push beat can be all of it (an outcome that leaves nothing is blown): said only when
    // that beat's ways could fill ALARM (`fills`, final review I1).
    ...(o.press ? [plain(o.ids.press, 'PRESS ON', (run.take ?? 'full') === 'full' ? `One more beat. Lose it, and the pot goes with half the pay${o.fills ? '; fill ALARM, and it can cost all of it' : ''}.` : 'One more beat. Lose it, and the job is blown: no pay at all.')] : []),
  ];
  const her = ownedBy(q);
  const name = her ? (o.owner?.id === her ? o.owner.name : o.contact?.id === her ? o.contact.name : her) : null;
  return { title: 'PRESS ON?', clocks: (q.clocks ?? []).map((k) => ({ id: k.id, label: k.label, size: k.size, value: crew.clocks[k.id] ?? 0, ...(k.note ? { note: k.note } : {}) })), hand, cards, mods: [], ahead: {}, ...(her ? { contact: { id: her, name: name! } } : {}) };
}

/**
 * Whether a pick on `beat` could fill ALARM from the run's ALARM now (`max`): the ALARM of a standing way someone in
 * the hand can take, with its card's own, or a throw's (a ready recruit with no way on a ways card).
 */
export function couldFill(q: QuestEntry, run: QuestRun, beat: Beat, o: HandIn & { ctx: CondCtx; max: number }): boolean {
  const hand = handOf(q, run, beat.id, o);
  const recruits = hand.filter((h) => h.kind === 'recruit' && h.state === 'ready');
  const worst = cardsOn(run, beat, o.ctx).reduce((n, c) => {
    const ways = waysStanding(c.ways ?? [], o.ctx);
    const own = Math.max(0, ...ways.filter((w) => takers(w, hand, o.programs).length > 0).map((w) => w.alarm)) + cardAlarm(c);
    const thrown = ways.length > 0 && recruits.some((r) => !ways.some((w) => takers(w, hand, o.programs).includes(r.id))) ? THROW_ALARM : 0;
    return Math.max(n, own, thrown);
  }, 0);
  return (run.alarm ?? 0) + worst >= o.max;
}

/** Whether a beat reads `flag` anywhere: its versions (cards, ways, views) or an outcome its cards can play. */
function beatReads(q: QuestEntry, id: string, flag: string, value: string): boolean {
  const versions = q.beats.get(id) ?? [];
  const outcomes = versions.flatMap((b) => b.choices.flatMap((c) => [c.to, ...(c.fail ? [c.fail] : []), ...(c.ways ?? []).map((w) => w.to)])).flatMap((o) => {
    const out = q.outcomes.get(o);
    return out ? [out, ...(out.versions ?? []).flatMap((v) => q.outcomes.get(v.id) ?? [])] : [];
  });
  return readsFlag([versions, outcomes], flag, value);
}

/**
 * The ALARM a pick lands on a beat, all of it (a way's, the card's own `[alarm]`, a failed throw's, a crack's lockout),
 * under the beat's mods: COVER STORY stops all of it, FIREWALL one point (and is used only when it stops one).
 */
export function alarmOnBeat(n: number, mods: BeatMods): { alarm: number; wallUsed: boolean } {
  if (n <= 0 || mods.noAlarm) return { alarm: 0, wallUsed: false };
  return mods.wall ? { alarm: n - 1, wallUsed: true } : { alarm: n, wallUsed: false };
}

/** The crew with a FIREWALL that stopped a point spent: the first loaded one not spent yet. */
export function wallSpent(crew: CrewState, programs: readonly Program[]): CrewState {
  const wall = programs.find((p) => baseProgramId(p.id) === FIREWALL && !crew.goes[programCard(p.id)]);
  return wall ? { ...crew, goes: { ...crew.goes, [programCard(wall.id)]: 'spent' } } : crew;
}

/** A card's own `[alarm]` tags, landing on any pick of it. */
export const cardAlarm = (c: Choice): number => c.tags.reduce((n, t) => n + (t.kind === 'alarm' ? t.delta : 0), 0);

/**
 * Why a recruit's move can't be played on this beat; null when it can. A move must change the beat. COVER STORY: ALARM
 * could land here, from a standing way with ALARM, a card's own `[alarm]`, a [crack] card's lockout, or a throw (a ready
 * recruit other than the mover with no way on a ways card). LOOP THE CAMS: a standing way with HEAT. LISTEN IN: one that
 * fills TAKE with room for its +1 under the job's size. None already played on this beat. HOLD THE DOOR needs a beat ahead that reads `door=held`, so it's never
 * played on the way out itself.
 */
export function moveRefusal(q: QuestEntry, run: QuestRun, beat: Beat, id: MoveId, o: { ctx: CondCtx; hand: Hand[]; programs: Program[]; mover: string }): string | null {
  const crew = run.crew!;
  const mods = modsOn(crew, beat.id);
  if (id === 'hold-the-door') {
    if (run.flags.door === 'held') return 'THE DOOR IS ALREADY HELD';
    return beatsAhead(q, beat.id).some((b) => beatReads(q, b, 'door', 'held')) ? null : 'NO DOOR AHEAD TO HOLD';
  }
  const cards = cardsOn(run, beat, o.ctx);
  const standing = cards.map((c) => ({ c, ways: waysStanding(c.ways ?? [], o.ctx) }));
  const plain = { ...mods, noAlarm: undefined, wall: undefined };
  const landed = standing.flatMap((x) => x.ways.map((w) => landWay(w, plain, { getaway: !!run.getaway })));
  if (id === 'cover-story') {
    if (mods.noAlarm) return 'NOTHING HERE FOR IT TO CHANGE';
    const recruits = o.hand.filter((h) => h.kind === 'recruit' && h.state === 'ready' && h.id !== o.mover);
    const throws = !run.getaway && standing.some((x) => x.ways.length > 0 && recruits.some((r) => !x.ways.some((w) => takers(w, o.hand, o.programs).includes(r.id))));
    const risk = landed.some((l) => l.alarm > 0) || cards.some((c) => cardAlarm(c) > 0 || c.crack) || throws;
    return risk ? null : 'NOTHING HERE FOR IT TO CHANGE';
  }
  // LISTEN IN's +1 must still fit under the job's size on some standing way: not at TAKE full, not where every way
  // already reaches the cap, not on a push beat (it fills no TAKE).
  const room = run.push?.state === 'playing' ? 0 : jobTakeSize(q) - takeOf(run, q);
  const changes = id === 'loop-the-cams' ? !mods.noHeat && landed.some((l) => l.heat > 0) : !mods.plusTake && landed.some((l) => l.take > 0 && l.take < room);
  return changes ? null : 'NOTHING HERE FOR IT TO CHANGE';
}

/** A card sent: the way it plays, who does it, their hand card, and whether it's a throw (no way for their specialty). */
export interface Sent {
  way: Way;
  by: string;
  hand: Hand;
  thrown: boolean;
}

/**
 * Who `by` sends at card `c`, and by which way: `you` (your first standing way) or `you:<name>`, a recruit, a loaded
 * program or the contact, each ready and with a way standing for them; a recruit with none throws, by the card's first
 * standing `you` way, except on a getaway. A string is why not.
 */
export function sentOn(q: QuestEntry, run: QuestRun, beat: Beat, c: Choice, by: string | undefined, o: HandIn & { ctx: CondCtx }): Sent | string {
  if (by === undefined || by === '') return 'PICK WHO DOES IT';
  const hand = handOf(q, run, beat.id, o);
  const standing = waysStanding(c.ways ?? [], o.ctx);
  const firstYou = standing.find((w) => w.key.kind === 'you');
  if (by === HAND_YOU || by.startsWith(`${HAND_YOU}:`)) {
    const name = by.slice(HAND_YOU.length + 1);
    const way = by === HAND_YOU ? firstYou : standing.find((w) => w.key.kind === 'you' && w.key.name === name);
    return way ? { way, by: HAND_YOU, hand: hand[0], thrown: false } : "YOU'VE NO WAY LIKE THAT HERE";
  }
  const h = hand.find((x) => x.id === by && x.kind !== 'you');
  if (!h) return "THAT CARD ISN'T IN YOUR HAND";
  if (h.state !== 'ready') return `${h.name.split(' ')[0].toUpperCase()} ${h.state === 'door' ? 'IS AT THE DOOR' : h.state === 'spent' ? 'HAS GONE ALREADY' : `IS ${h.state.toUpperCase()}`}`;
  const way = standing.find((w) => takers(w, hand, o.programs).includes(by));
  if (way) return { way, by, hand: h, thrown: false };
  // No throws on a getaway (final review C1).
  if (h.kind === 'recruit' && firstYou && !run.getaway) return { way: firstYou, by, hand: h, thrown: true };
  return 'NO WAY FOR THAT CARD HERE';
}

/** A sent hand card as `crewPickLine` takes it: a recruit by first name, a program by its name in capitals. */
export function crewPickBy(h: Pick<Hand, 'kind' | 'name'>): { by: Hand['kind']; name?: string } {
  if (h.kind === 'recruit') return { by: 'recruit', name: h.name.split(' ')[0] };
  if (h.kind === 'program') return { by: 'program', name: h.name.toUpperCase() };
  return { by: h.kind };
}

/** What a sent card lands: the crew state after it, the TAKE, ALARM and TAKE lost, the flags it sets, and a recruit's fall. */
export interface SentLanding {
  crew: CrewState;
  take: number;
  alarm: number;
  lose: number;
  sets: Record<string, string>;
  loss: { card: string; loss: 'hurt' | 'held' } | null;
}

/** A failed throw's ALARM. */
export const THROW_ALARM = 2;

/**
 * A sent card as it lands on the beat (crew rules spec): the way's own tags after the beat's mods; FIREWALL spent when it
 * stopped a point; the clocks moved, up to their size and down to 0; who did it spent (or hurt or held by the way, a fall through `fall`).
 * A throw that isn't `through` lands nothing of the way: ALARM +2 and the recruit hurt. The beat's mods are done with.
 */
export function landSent(q: QuestEntry, run: QuestRun, beat: string, s: Sent, o: { through: boolean; fall: (rid: string) => 'hurt' | 'held'; programs: Program[]; cardAlarm: number }): SentLanding {
  const crew0 = run.crew!;
  const mods = modsOn(crew0, beat);
  const missed = s.thrown && !o.through;
  // Every point of ALARM the pick lands goes under the beat's mods together; landWay's own handling of them is bypassed.
  const l = landWay(s.way, { ...mods, noAlarm: undefined, wall: undefined }, { getaway: !!run.getaway });
  const a = alarmOnBeat(missed ? THROW_ALARM : l.alarm + o.cardAlarm, mods);
  const walled = a.wallUsed ? wallSpent(crew0, o.programs) : crew0;
  const goes = { ...walled.goes };
  if (missed) {
    goes[s.by] = 'hurt';
    return { crew: pastBeat({ ...walled, goes }), take: 0, alarm: a.alarm, lose: 0, sets: {}, loss: { card: s.by, loss: 'hurt' } };
  }
  const clocks = { ...crew0.clocks };
  for (const [id, n] of Object.entries(l.clocks)) {
    clocks[id] = moveClock(clocks[id] ?? 0, n, q.clocks?.find((k) => k.id === id)?.size ?? n);
  }
  // A way's harm falls on the recruit who did it; you, a program or the contact take none.
  const fell = l.harm && s.hand.kind === 'recruit' ? (l.harm === 'held' ? o.fall(s.by) : 'hurt') : null;
  if (s.by !== HAND_YOU) goes[s.by] = fell ?? 'spent';
  return {
    crew: pastBeat({ ...walled, goes, clocks, cut: crew0.cut + l.cut, heat: crew0.heat + l.heat }),
    take: l.take,
    alarm: a.alarm,
    lose: l.lose,
    sets: Object.fromEntries(s.way.sets.map((x) => [x.name, x.value])),
    loss: fell ? { card: s.by, loss: fell } : null,
  };
}

/** What a move or a beat program changes on the run. */
export type Moved = Pick<QuestRun, 'crew'> & Partial<Pick<QuestRun, 'flags' | 'alarm'>>;

/**
 * A recruit's move or a program's own use, played on this beat (crew rules spec, Moves and Programs): COVER STORY, LOOP
 * THE CAMS and LISTEN IN set this beat's mods; HOLD THE DOOR sets `door=held` and leaves the recruit at the door; FIREWALL
 * goes up for this beat, spent only when it stops a point; SCRUB takes ALARM 1 off now. A string is why not.
 */
export function moveOn(q: QuestEntry, run: QuestRun, beat: Beat, card: string, o: HandIn & { ctx: CondCtx }): Moved | string {
  const crew = run.crew!;
  const hand = handOf(q, run, beat.id, o);
  const h = hand.find((x) => x.id === card && x.kind !== 'you');
  if (!h) return "THAT CARD ISN'T IN YOUR HAND";
  const first = h.name.split(' ')[0].toUpperCase();
  if (h.state !== 'ready') return `${first} ${h.state === 'door' ? 'IS AT THE DOOR' : h.state === 'spent' ? 'HAS GONE ALREADY' : `IS ${h.state.toUpperCase()}`}`;
  const mods = modsOn(crew, beat.id);
  const onBeat = (add: BeatMods, goes = crew.goes): CrewState => ({ ...crew, goes, mods: { ...mods, ...add }, modsBeat: beat.id });
  if (h.kind === 'recruit') {
    const id = h.spec ? moveOf(h.spec) : null;
    if (!id) return `${first} HAS NO MOVE`;
    const why = moveRefusal(q, run, beat, id, { ctx: o.ctx, hand, programs: o.programs, mover: card });
    if (why) return why;
    if (id === 'hold-the-door') return { crew: { ...crew, goes: { ...crew.goes, [card]: 'door' } }, flags: { ...run.flags, door: 'held' } };
    const spent = { ...crew.goes, [card]: 'spent' as const };
    return { crew: onBeat(id === 'cover-story' ? { noAlarm: true } : id === 'loop-the-cams' ? { noHeat: true } : { plusTake: true }, spent) };
  }
  if (h.kind === 'program') {
    const base = baseProgramId(card.slice(programCard('').length));
    if (base === FIREWALL) return mods.wall ? 'FIREWALL IS ALREADY UP' : { crew: onBeat({ wall: true }) };
    if (base === SCRUB) return (run.alarm ?? 0) > 0 ? { crew: { ...crew, goes: { ...crew.goes, [card]: 'spent' } }, alarm: (run.alarm ?? 0) - 1 } : 'NO ALARM TO SCRUB';
    return 'THAT PROGRAM ONLY WORKS ON A CARD';
  }
  return 'SHE HAS NO MOVE: SEND HER AT A CARD';
}

/** Whether anyone on a crew-rules run is hurt or held. */
export const harmedOn = (crew: CrewState): boolean => Object.values(crew.goes).some((g) => g === 'hurt' || g === 'held');

/**
 * A crew-rules run's grade (crew rules spec, The end) by `crewGrade`, from the run as its end settled it: TAKE 0 is
 * `take: none`, and `take` is full only once TAKE reached the job's size (`settleTake`), so it stands for the size here.
 */
export function crewTier(run: QuestRun): Tier {
  const fill = run.take === 'none' ? 0 : (run.takeFill ?? 0);
  return crewGrade({ take: fill, size: run.take === 'full' ? fill : fill + 1, alarm: run.alarm ?? 0, blown: run.blown === true, harmed: harmedOn(run.crew!) });
}

/**
 * The HEAT a crew-rules run leaves (crew rules spec, Clocks, amended 2026-11-18): every `heat N` that landed, ON THE
 * NIGHT, and nothing else. No blown floor (last pass A1: it landed HEAT no card printed), the ALARM you leave with
 * doesn't become HEAT, and no deck heat. Crew traits that add heat on a messy job land beside it, from the crew fold.
 */
export function crewHeatParts(run: QuestRun): HeatPart[] {
  const night = run.crew?.heat ?? 0;
  return night !== 0 ? [{ label: 'ON THE NIGHT', n: night }] : [];
}

/** The percent the ways' `cut` takes off the pay, all of it at most. */
export const crewCut = (run: QuestRun): number => Math.min(100, run.crew?.cut ?? 0);

/** A crew-rules run with its ways' `cut` on the pay, beside any other cut (`settleTake` takes it after TAKE scales the pay). */
export function withCrewCut(run: QuestRun): QuestRun {
  const pct = crewCut(run);
  return pct && run.setup ? { ...run, setup: { ...run.setup, payCut: Math.min(100, (run.setup.payCut ?? 0) + pct) } } : run;
}

/** What the ways' `cut` took at the end, for the debrief: its percent and the sol, the pay as TAKE scaled it with and without it. */
export function cutTaken(run: QuestRun, q: QuestEntry): { pct: number; amount: number } | null {
  const pct = crewCut(run);
  if (!pct || !run.setup) return null;
  // As the end settled it: a getaway before the paying outcome scales the drawn pay.
  const unpaid = run.getaway ? (run.pay ?? 0) : 0;
  const payAt = (cut: number) => ceilingOf(run) + settleTake({ ...run, setup: { ...run.setup!, payCut: cut } }, q, 0, unpaid).events.reduce((n, e) => n + (e.sol ?? 0), 0);
  const cut = run.setup.payCut ?? 0;
  return { pct, amount: payAt(Math.max(0, cut - pct)) - payAt(cut) };
}

/** A run whose job changed rules under it (crew rules spec, Saves): a Graft run on a crew-rules file, or a crew run on a Graft one. */
export const rulesChanged = (q: QuestEntry, run: QuestRun): boolean => (q.rules === 'crew') !== (run.crew !== undefined);
