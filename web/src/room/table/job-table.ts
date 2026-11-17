/**
 * A job on the table (the hand spec §5): the beat's choices dealt as cards, your hand along the bottom, TAKE,
 * ALARM and NERVE in the corners. Lift a card from the hand and every choice shows what it would do there; click a
 * choice to roll it with the card (and PUSH, if it's on). STEADY / TAKE IT, the getaway, the cover cards, WALK /
 * PRESS ON and the debrief deal here too. Story quests stay on the quest panel.
 */
import { mountDeduction, type DeductionBoard } from './deduction';
import type { BoardMove } from '../../../../shared/deduction';
import { mountAccounts, type AccountsBoard } from './accounts';
import type { AccountsMove } from '../../../../shared/accounts';
import { CARRY_ON, deckNotes, EFFECT_NAMES, POOL_MAX, POSITION_NAMES, PRESS_NERVE, PUSH_NERVE, tradeRefusal, type Effect, type Pool, type Position, type PushMode, type Trade } from '../../../../shared/dice';
import type { Debrief, ProgramPreview, QuestState } from '../../../../shared/types';
import { debriefEl } from '../debrief';
import { landedTray, settleParked } from '../check-anim';
import { parkedLine } from '../job-moment';
import { passiveLabels } from '../../ui/passive';
import { markLore } from '../../ui/lore-hover';
import { cardEl, mountDeal, trayHead, type TableCard } from './deal';
import { el, graftCue, isPhone, type TableCue } from './el';
import { decodeIn, noise, scrambleIn, WAIT_CHARS } from './decode';
import { mountHand, type HandGroup } from './hand';
import { abilityFace, artFace, backFace, contactFace, crewFace, deckLabel, programFace, slotFace, statPicture } from './faces';
import { abilityCard as abilityOf, MAX_CONTACTS } from '../../../../shared/hand';
import { HOT_LOAD_NERVE } from '../../../../shared/programs';
import { abilityInfo, choiceInfo, contactInfo, favourInfo, mountCardInfo, plainInfo, programInfo, recruitInfo, slotInfo, type Info } from './card-info';
import { programsOn, previewText, tradedSide, type Marked, type Side } from './preview';
import { mountTableShell, piece, type TableShell } from './shell';
import type { TipId, Tips } from './tips';
import { setTip } from '../../ui/hover-tag';
import { odds, resultLines, type CardOn } from '../../../../shared/odds';
import './table-trace.css';
import { routeEl, wayOf } from './route';
import { clearLead, hostRect, traceVia, type Pt } from '../../ui/trace-lead';
import { headLinePoints } from '../../ui/trace-panel';
import { setHints } from '../../landing/hint-line';

type Active = NonNullable<QuestState['active']>;
/** How many beats SO FAR shows: the latest; older ones drop off its top. */
const SO_FAR_ROWS = 4;
type Choice = Active['choices'][number];

/** Whether a quest at a beat plays on the table: any job. */
export function onTable(a: Active | null): boolean {
  return a !== null && a.alarm !== undefined;
}

/**
 * What a quest state does to the table: show a job's beat, deal its debrief, close it for anything else (a desk
 * job's wait, a story quest, an ending without a debrief), or keep it (its debrief is up until CLOSE, or it's shut).
 */
export function tableAction(o: { active: Active | null; debrief: boolean; tableOpen: boolean; tableEnded: boolean }): 'show' | 'end' | 'close' | 'keep' {
  if (onTable(o.active)) return 'show';
  if (o.debrief) return 'end';
  return o.tableOpen && !o.tableEnded ? 'close' : 'keep';
}

export interface JobTable {
  show(a: Active, story?: string): void;
  /** The job ended: its debrief dealt as a card, until CLOSE. `clocks`: TAKE and ALARM as it ended, where the clocks stay. */
  end(title: string, story: string, debrief: HTMLElement, clocks?: Partial<Pick<Debrief, 'take' | 'alarm'>>): void;
  pick(choice: string, text: string): void;
  clearPick(): void;
  close(): void;
  isOpen(): boolean;
  /** Its debrief is up (until CLOSE). */
  ended(): boolean;
  /** The contact is speaking (ride-along replies, 2026-11-08): the moment holds, named, until null. The server refuses a pick meanwhile. */
  hold(name: string | null): void;
  /** The deduction board's line for the last move; false when no board is up (the line goes to the feed). */
  boardSay(text: string): boolean;
  /** The accounts board's line for the last move, under the listener who said it; false when no board is up. */
  accountsSay(text: string, by?: string): boolean;
  /**
   * A key at the table (the trace's key line): arrows move the choice or the cost, Enter rolls or answers, and, with no
   * field focused (`typing` false), 1–9 call crew, P pushes, S and B trade, R resists, F firewalls. True when taken.
   */
  key(key: string, typing: boolean): boolean;
  root: HTMLElement;
}


/** Which Graft tips a beat offers (tips spec §1): the cards it deals decide; tips.ts drops the ones seen. */
export function tipsFor(a: Active): TipId[] {
  const ids = (c: string) => a.choices.some((x) => x.id === c);
  // The job's first ALARM: what it turns into, the first time.
  const heat = (a.alarm ?? 0) > 0;
  // A dealt roll (roll lifecycle spec §1.5): its costs, and RESIST / ARMOUR when they can be used.
  if (a.costs) return [...(heat ? (['heat'] as const) : []), 'costs', ...(a.costs.resist.ok ? (['resist'] as const) : []), ...(a.costs.armour.ok ? (['armour'] as const) : []), 'alarm', 'nerve'];
  if (ids('!take')) return [...(heat ? (['heat'] as const) : []), 'alarm', 'nerve'];
  if (ids('!walk') || ids('!press')) return ['press', 'nerve'];
  const checked = a.choices.some((c) => c.pool);
  // A card that isn't FAIR (effect and NERVE spec §3): what effect is, the first time.
  const effect = a.choices.some((c) => c.pool?.effect && c.pool.effect !== 'fair');
  const callable = a.hand?.people.some((p) => !p.down && (p.free > 0 || p.risk !== null)) ?? false;
  return [
    ...(a.getaway ? (['getaway'] as const) : []),
    'job',
    ...(checked ? (['roll', 'position'] as const) : []),
    // A miss here blows the job (the header's or a card's flag): the first time, what that means. GET OUT has its own.
    ...(!a.getaway && a.choices.some((c) => c.blows) ? (['blows'] as const) : []),
    ...(effect ? (['effect'] as const) : []),
    ...(a.take ? (['take'] as const) : []),
    'alarm',
    'nerve',
    ...(callable ? (['call'] as const) : []),
    ...(loadable(a) ? (['program'] as const) : []),
    // An open post (routes and posts spec §2): what sending someone costs, the first time.
    ...(a.post && !a.post.by ? (['post'] as const) : []),
  ];
}

/** A slot would LOAD here (programs spec §2.6): a free slot, a live deck, and a program some card here can run. */
function loadable(a: Active): boolean {
  const p = a.hand?.pockets;
  if (!p || p.dead || p.loaded.length >= p.slots) return false;
  return p.catalog.some((c) => !p.loaded.some((l) => l.id === c.id) && a.choices.some((x) => { const v = x.programs?.[c.id]; return v !== undefined && !('why' in v); }));
}

/** The hand as cards (§5): the PEOPLE brought, then the favour and the two contact pockets (contact cards spec §3). */
function handGroups(hand: NonNullable<Active['hand']>, nerveLeft = 0, prog?: ProgState): HandGroup[] {
  const people: TableCard[] = hand.people.flatMap((p) => {
    const callable = p.free > 0 || p.risk !== null;
    const first = p.name.split(' ')[0].toUpperCase();
    // Down from a loss: the whole stack face down, the card's back.
    if (p.down) return [{ id: p.id, face: backFace(first, 'DOWN'), state: 'down', stack: p.id }, ...p.abilities.map((a): TableCard => ({ id: `${p.id}/${a.id}`, face: backFace(first, 'DOWN'), state: 'down', stack: p.id, glyph: { kind: a.kind, timing: a.timing, label: a.label } }))];
    // At a post (routes and posts spec §2): away for the job, the card and its abilities locked and dimmed.
    if (p.at) return [{ id: p.id, face: crewFace({ ...p, abilities: [] }, `AT THE ${p.at}`), state: 'locked', stack: p.id, away: true }, ...p.abilities.map((a): TableCard => ({ id: `${p.id}/${a.id}`, face: abilityFace(a, `AT THE ${p.at}`), state: 'locked', stack: p.id, off: true, away: true, glyph: { kind: a.kind, timing: a.timing, label: a.label } }))];
    const note = !callable ? (p.guest ? 'SPENT' : 'PLAYS AT THE END') : p.free > 0 ? '1 FREE' : `AGAIN · RISK 1 IN ${p.risk}`;
    const call: TableCard = { id: p.id, face: crewFace({ ...p, abilities: [] }, note), state: callable ? 'up' : 'locked', stack: p.id };
    // Their abilities (crew abilities spec §2): ON A ROLL lift like a call; AFTER A ROLL light on a parked roll and play on a
    // tap; AT THE END play themselves.
    const abilityCard = (a: (typeof p.abilities)[number]): TableCard => {
      const id = `${p.id}/${a.id}`;
      // What a press costs (effect and NERVE spec §2), and why it's out of reach.
      // `nerveLeft` is what's left after a PUSH that's on (Task 4 review): the server counts both.
      const afford = a.nerve === 0 || (a.afford && a.nerve <= nerveLeft);
      const again = !a.nerve ? 'FREE' : afford ? `${a.nerve} NERVE` : `${a.nerve} NERVE · YOU HAVE ${Math.max(0, nerveLeft)}`;
      if (a.used) return { id, face: backFace(a.label.toUpperCase(), 'PLAYED'), state: 'down', stack: p.id };
      if (a.timing === 'end') return { id, face: abilityFace(a, 'PLAYS AT THE END'), state: 'locked', stack: p.id };
      if (a.timing === 'auto') return { id, face: abilityFace(a, 'PLAYS WHEN IT COMES'), state: 'locked', stack: p.id };
      if (a.timing === 'after') {
        if (a.playable) return { id, face: abilityFace(a, again), state: 'up', stack: p.id, tap: true };
        return afford ? { id, face: abilityFace(a, 'AFTER A ROLL'), state: 'locked', stack: p.id } : { id, face: abilityFace(a, again), state: 'locked', stack: p.id, off: true };
      }
      return afford ? { id, face: abilityFace(a, again), state: 'up', stack: p.id } : { id, face: abilityFace(a, again), state: 'locked', stack: p.id, off: true };
    };
    // Each one's glyph sits under the recruit's card and flips it to that ability.
    const abilities = p.abilities.map((a): TableCard => ({ ...abilityCard(a), glyph: { kind: a.kind, timing: a.timing, label: a.label } }));
    return [call, ...abilities];
  });
  const favour: TableCard =
    hand.favour === 'ready'
      ? { id: 'favour', face: artFace('favour', 'FAVOUR', ['A FRIENDLY FACE'], '+1d'), state: 'up' }
      : hand.favour === 'used'
        ? { id: 'favour', face: backFace('FAVOUR', 'USED'), state: 'down' }
        : { id: 'favour', face: artFace('empty', 'NO FAVOUR'), state: 'empty' };
  // Contact cards (contact cards spec §3): once each; a fence plays itself at the end; the rest of the pockets empty.
  const contacts = Array.from({ length: MAX_CONTACTS }, (_, i): TableCard => {
    const c = hand.contacts[i];
    if (!c) return { id: `c${i + 1}`, face: artFace('empty', 'NO CONTACT'), state: 'empty' };
    const id = `contact:${c.id}`;
    if (c.used) return { id, face: backFace(c.name.split(' ')[0].toUpperCase(), 'USED'), state: 'down' };
    return c.spec === 'fence' ? { id, face: contactFace(c, 'PLAYS AT THE END'), state: 'locked' } : { id, face: contactFace(c, 'ONCE'), state: 'up' };
  });
  return [
    { group: 'PEOPLE', slots: people },
    // The carried deck (programs spec §2.1) in its label, its slots under it; an old run keeps its POCKETS.
    hand.pockets ? { group: 'DECK', label: deckLabel(hand.pockets.deck), slots: pocketCards(hand.pockets, prog ?? NO_PROG) } : { group: 'POCKETS', slots: [favour, ...contacts] },
  ];
}

/** The table's programs for the next roll (programs spec §2.1): marked to load, loaded ones to run, the slot whose fan is open, what fits here. */
interface ProgState {
  load: string[];
  run: string[];
  fan: string | null;
  fits: (id: string) => boolean;
  /** NERVE left for one more mid-job load (§1.2a), after PUSH and the loads marked. */
  canLoad: boolean;
}
const NO_PROG: ProgState = { load: [], run: [], fan: null, fits: () => false, canLoad: false };

/** What a LOAD can take here: what fits a check and isn't loaded or marked yet (programs spec §2.1). */
function loadOffer(p: NonNullable<NonNullable<Active['hand']>['pockets']>, prog: ProgState) {
  const taken = new Set([...p.loaded.map((l) => l.id), ...prog.load]);
  return p.catalog.filter((c) => c.kind !== 'firewall' && !taken.has(c.id) && prog.fits(c.id));
}

/**
 * The deck's slots (programs spec §2.1), a card each — what's loaded (lit where it fits a
 * check here, dim where not, face down BURNED or DEAD), what's marked to load, and the empty ones (LOAD when something
 * fits; an open one lights while the tray over the moment lists what fits).
 */
function pocketCards(p: NonNullable<NonNullable<Active['hand']>['pockets']>, prog: ProgState): TableCard[] {
  if (!p.deck) return [];
  const loaded = p.loaded.map((l): TableCard => {
    const id = `prog:${l.id}`;
    if (p.dead) return { id, face: backFace(l.name, 'DEAD'), state: 'down' };
    if (l.burned) return { id, face: backFace(l.name, 'BURNED'), state: 'down' };
    const on = prog.run.includes(l.id);
    return prog.fits(l.id) ? { id, face: programFace(l, on ? 'RUNS' : 'LOADED'), state: 'up', tap: true, ...(on ? { on: true as const } : {}) } : { id, face: programFace(l, 'LOADED'), state: 'locked' };
  });
  const marked = prog.load.flatMap((pid) => p.catalog.filter((c) => c.id === pid).map((c): TableCard => ({ id: `prog:${c.id}`, face: programFace(c, 'LOADS'), state: 'up', tap: true, on: true })));
  const offer = loadOffer(p, prog);
  const empty = Array.from({ length: Math.max(0, p.slots - loaded.length - marked.length) }, (_, i): TableCard[] => {
    const id = `slot:${loaded.length + marked.length + i + 1}`;
    if (p.dead) return [{ id, face: backFace('SLOT', 'DEAD'), state: 'down' }];
    if (!offer.length) return [{ id, face: slotFace('EMPTY'), state: 'empty' }];
    return [prog.canLoad ? { id, face: slotFace('LOAD', `HOT SLOT · ${HOT_LOAD_NERVE} NERVE`), state: 'up', tap: true, ...(prog.fan === id ? { on: true as const } : {}) } : { id, face: slotFace('LOAD', 'NO NERVE'), state: 'locked' }];
  }).flat();
  return [...loaded, ...marked, ...empty];
}

/** A pool's line on its card, as the quest panel gave it: `TECH ●●● +RUE ● −NO DECK ○ · IN THE OPEN`. */
const poolText = (p: NonNullable<Choice['pool']>) => {
  const base = p.base ?? Math.max(0, p.dice - p.parts.reduce((n, x) => n + x.dice, 0));
  const parts = p.parts.map((x) => (x.dice > 0 ? ` +${x.label} ●` : ` −${x.label} ○`)).join('');
  return [`${p.stat} ${base > 0 ? '●'.repeat(base) : '0D'}${parts}`, POSITION_NAMES[p.position], ...(p.effect ? [EFFECT_NAMES[p.effect]] : []), ...deckNotes(p)].join(' · ');
};

/** Every rolled card on this beat blows the job on a miss (a crack's lockout): the header says so once. */
export function allBlow(a: Active): boolean {
  const rolled = a.choices.filter((c) => c.pool || c.crack);
  return rolled.length > 0 && rolled.every((c) => c.blows);
}

const POS_WORD = { dark: 'DARK', open: 'OPEN', wire: 'WIRE' } as const;

/** The programs marked on a card (programs spec §2.1), and the effect the server previews for a pool that shows none. */
type ProgMod = { on: Marked[]; from?: Effect };
const EFFECT_ORDER: readonly Effect[] = ['small', 'fair', 'big'];
/** An effect a step up per effect program; `given` when it's the server's preview already (one step in). */
const stepEffect = (e: Effect | undefined, n: number, given: boolean): Effect | undefined => (e === undefined ? undefined : EFFECT_ORDER[Math.min(2, EFFECT_ORDER.indexOf(e) + (given ? Math.max(0, n - 1) : n))]);

/** A row of dice as the rail's cells: one per die, in its source's colour; a minus die is an empty dashed cell. */
const cells = (n: number, cls: string) => {
  const row = el('span', 'tb-cells');
  for (let i = 0; i < n; i++) row.append(el('i', cls));
  return row;
};

/**
 * What a card would roll, from its pool or a lifted card's play, with the rail's trade and PUSH and the marked programs.
 * The face and the hover panel both read this, so they can't disagree.
 */
function cardState(pool: NonNullable<Choice['pool']>, lifted: string | null, play0: Side | undefined, mod: { trade: Trade | null; push: PushMode | null; prog?: ProgMod }) {
  // SAFE / BOLD and PUSH from the rail (effect and NERVE spec §3), on the lifted card's play or the pool itself.
  const from = lifted ? play0 : pool;
  const traded = from && (mod.trade || mod.push) ? tradedSide(from, mod) : null;
  const play = traded && !traded.why ? traded.side : play0;
  const why = traded?.why ?? null;
  // Marked programs (programs spec §2.1), judged as the server will: a position step, an effect step, the tier's lift (tier effect spec §2).
  const rolled = play ?? pool;
  const on = programsOn({ position: rolled.position, effect: rolled.effect, effectRaw: rolled.effectRaw, tier: from?.tier ?? pool.tier, path: from?.path ?? pool.path }, mod.prog?.on ?? [], traded && !traded.why ? mod.trade : null);
  const { position: pos, tier } = on;
  const effect = on.effect ?? stepEffect(mod.prog?.from, on.ran.filter((x) => x.kind === 'effect').length, true);
  const lacquer = on.ran.reduce((n, x) => n + x.alarm, 0);
  const nerve = on.ran.filter((x) => x.load).length * HOT_LOAD_NERVE;
  // A foil's die (owned programs), up to the pool's cap.
  const rolls = play?.dice ?? pool.dice;
  const foil = Math.max(0, Math.min(POOL_MAX - rolls, on.ran.filter((x) => x.foil).length));
  return { play, why, pos, tier, effect, lacquer, nerve, on, foil, dice: rolls + foil };
}

/**
 * A checked choice's face (mockup position-cards.html, C1): a printed card like the crew's, its stat's picture, then (into
 * the body it returns, after the line the caller puts first) the flags row, the tray of dice by source with the count, the
 * position and effect, and its sources as tabs hanging off the foot. The position's colour edges the picture. A lifted card
 * shows what it would do: its dice blink in, the position moves. On a phone, or asking THAT'S MY CHOICE, the picture stands
 * down the left of a wide card (table.css).
 * The pool also reads as words for screen readers (`.tb-odds`).
 */
function callFace(f: HTMLElement, pool: NonNullable<Choice['pool']>, lifted: string | null, play0: Side | undefined, mod: { trade: Trade | null; push: PushMode | null; prog?: ProgMod } = { trade: null, push: null }, extra: { on?: CardOn; word?: string; /** The lifted recruit's first name, for the dice's names. */ caller?: string } = {}): HTMLElement {
  const base = pool.base ?? Math.max(0, pool.dice - pool.parts.reduce((n, x) => n + x.dice, 0));
  const { play, why, pos, tier, effect, lacquer, nerve, foil, dice } = cardState(pool, lifted, play0, mod);
  f.classList.add('tb-call');
  f.classList.toggle('none', (Boolean(lifted) && !play) || why !== null);
  f.dataset.pos = pos;
  const side = statPicture(pool.stat);
  // The trace's head (mockup graft-trace.html): the position's words and piece over the picture, the stat's name on it.
  const posWord = el('span', 'tb-pos');
  posWord.append(el('span', '', POSITION_NAMES[pos]), piece(pos, 'tb-pos-piece'));
  side.append(posWord, el('span', 'tb-statname', (play?.stat ?? pool.stat).toUpperCase()));
  const body = el('span', 'tb-main');
  const flags = el('span', 'tb-flags');
  if (play && play.position !== pool.position) flags.append(el('span', 'tb-tag move', `${POS_WORD[pool.position]} → ${POS_WORD[play.position]}`));
  for (const n of deckNotes(pool)) flags.append(el('span', 'tb-tag', n));
  if (tier) flags.append(el('span', `tb-tag tier${tier.lifted ? ' lifted' : ''}`, tier.label));
  if (lifted && !play) flags.append(el('span', 'tb-tag', 'NO CARD HERE'));
  if (why) flags.append(el('span', 'tb-tag', why));
  if (lacquer) flags.append(el('span', 'tb-tag lacquer', `ALARM +${lacquer}`));
  if (nerve) flags.append(el('span', 'tb-tag hot', `LOAD · ${nerve} NERVE`));
  const tray = el('span', 'tb-tray');
  tray.append(el('span', 'tb-stat', pool.stat), cells(base, 'k-stat'));
  for (const x of pool.parts) tray.append(cells(1, x.dice > 0 ? `k-${x.kind ?? 'mod'}` : 'minus'));
  const more = play ? play.dice - pool.dice : 0;
  // What the lifted card adds, and what PUSH adds on top of it (or alone): each die in its own colour.
  const fromCall = lifted && play0 ? Math.max(0, Math.min(more, play0.dice - pool.dice)) : 0;
  const fromPush = Math.max(0, more - fromCall);
  if (fromCall > 0) tray.append(cells(fromCall, 'k-people lift'));
  if (fromPush > 0) tray.append(cells(fromPush, `${mod.push === 'dice' ? 'k-push' : 'k-people'} lift`));
  if (more < 0) tray.append(cells(-more, 'minus'));
  if (foil > 0) tray.append(cells(foil, 'k-pocket lift'));
  const sum = el('span', 'tb-sum', String(dice));
  sum.append(el('small', '', 'D'));
  tray.append(sum);
  // The dice's names under them, each in its die's colour (the trace table; mockup graft-trace.html): the stat's own,
  // then what adds or takes one, then what the lifted card or PUSH would add.
  const names = el('span', 'tb-names');
  if (base > 0) names.append(el('span', 'tb-src k-stat', (play?.stat ?? pool.stat).toUpperCase()));
  for (const x of pool.parts) names.append(el('span', `tb-src ${x.dice > 0 ? `k-${x.kind ?? 'mod'}` : 'minus'}`, `${x.dice > 0 ? '+' : '−'}${x.label}`));
  if (fromCall > 0) names.append(el('span', 'tb-src lift k-people', `+${extra.caller ?? 'CALL'}`));
  if (fromPush > 0) names.append(mod.push === 'dice' ? el('span', 'tb-src lift k-push', '+PUSH') : el('span', 'tb-src lift k-people', `+${extra.caller ?? 'CALL'}`));
  if (foil > 0) names.append(el('span', 'tb-src k-pocket lift', '+FOIL'));
  const foot = el('span', 'tb-foot');
  foot.append(flags, tray, names);
  const say = el('span', 'tb-say');
  say.append(el('span', 'tb-side-word', POS_WORD[pos]));
  if (effect) say.append(el('span', `tb-eff ${effect}`, EFFECT_NAMES[effect]));
  // The odds and what each result does here (shared/odds.ts): the same rules the roll lands by. A card the lifted card or
  // the trade can't go on shows neither.
  const dead = (Boolean(lifted) && !play) || why !== null;
  if (!dead) {
    const o = odds(dice);
    const bar = el('span', 'tb-oddsbar');
    bar.setAttribute('aria-label', `A 6: ${o.clean} in 100. A 4–5: ${o.cost}. A miss: ${o.miss}.`);
    for (const [cls, n, word] of [['clean', o.clean, 'CLEAN'], ['cost', o.cost, 'COST'], ['miss', o.miss, 'MISS']] as const) {
      const seg = el('i', cls);
      seg.style.flexGrow = String(Math.max(1, n));
      seg.append(el('span', '', n >= 12 ? `${word} ${n}` : String(n)));
      bar.append(seg);
    }
    const res = el('span', 'tb-res');
    for (const l of resultLines({ position: pos, ...(effect ? { effect } : {}), ...(extra.on ? { on: extra.on } : {}) })) {
      const row = el('span', `tb-res-row r${l.key[0]}`);
      const text = el('span', 'tb-res-text');
      text.append(el('b', '', l.gain), ` ${l.rest}`);
      row.append(el('span', 'tb-res-k', l.key), text);
      res.append(row);
    }
    foot.append(bar, res);
  }
  const go = el('span', 'tb-go');
  go.append(el('span', 'tb-key', extra.word ?? `ROLL ${(play?.stat ?? pool.stat).toUpperCase()}`));
  // EFFECT and the key on one row at the card's foot; a narrow card wraps the key under it rather than over it.
  const act = el('span', 'tb-act');
  act.append(say, go);
  foot.append(act);
  const preview = play ? previewText(play.stat ?? pool.stat, pool, play) : null;
  const words = preview ?? (lifted ? `${poolText(pool)} · NO CARD HERE` : poolText(pool));
  body.append(foot, el('span', `tb-odds sr${preview ? ' preview' : ''}${lifted && !preview ? ' none' : ''}`, words));
  const tabs = el('span', 'tb-srcs');
  for (const x of pool.parts) tabs.append(el('span', `tb-src ${x.dice > 0 ? `k-${x.kind ?? 'mod'}` : 'minus'}`, `${x.dice > 0 ? '+' : '−'}${x.label}`));
  f.append(side, body);
  if (tabs.childElementCount) f.append(tabs);
  return body;
}

/** A choice with no dice (mockup call-cards.html, D): the call card's frame without the picture; NO ROLL where the tray would be. */
function plainFace(f: HTMLElement, noCard: boolean, noRoll: boolean, word = 'DO IT', sure?: NonNullable<Choice['sure']>, alarm = 0): HTMLElement {
  f.classList.add('tb-plain');
  f.classList.toggle('none', noCard);
  const body = el('span', 'tb-main');
  const flags = el('span', 'tb-flags');
  if (noCard) flags.append(el('span', 'tb-tag', 'NO CARD HERE'));
  const foot = el('span', 'tb-foot');
  foot.append(flags);
  // Where a call card has its dice: a choice that rolls nothing says so.
  if (noRoll) foot.append(el('span', 'tb-noroll', 'NO ROLL'));
  // And where a call card has its odds and its three results: the one thing this card does, for certain (the trace table).
  if (noRoll && sure) {
    f.classList.add('tb-sure');
    const bar = el('span', 'tb-oddsbar');
    bar.setAttribute('aria-label', 'No dice: it happens.');
    const seg = el('i', 'clean');
    seg.append(el('span', '', 'SURE 100'));
    bar.append(seg);
    const res = el('span', 'tb-res');
    const row = (cls: string, key: string, gain: string, rest = '') => {
      const r = el('span', `tb-res-row ${cls}`);
      const text = el('span', 'tb-res-text');
      text.append(el('b', '', gain), rest ? ` ${rest}` : '');
      r.append(el('span', 'tb-res-k', key), text);
      res.append(r);
    };
    row('r6', 'TAKE', sure.take > 0 ? `+${sure.take} TAKE.` : 'No TAKE.', sure.take > 0 ? 'No dice, no cost.' : 'It costs nothing either.');
    if (alarm) row('r4', 'ALARM', `ALARM ${alarm > 0 ? '+' : '−'}${Math.abs(alarm)}.`, 'Whatever else happens.');
    if (sure.blown) row('r1', 'ENDS', 'THE JOB IS BLOWN.');
    else if (sure.left) row('r4', 'ENDS', sure.left === 'part' ? 'You keep half the take.' : 'You lose the take.');
    if (sure.pay) row('r6', 'PAYS', sure.pay === 'full' ? 'In full.' : 'Half.');
    if (sure.minutes) row('', 'TIME', `${sure.minutes} min.`);
    if (sure.then) row('', 'THEN', sure.then === 'THE END' ? 'The job ends.' : sure.then);
    foot.append(bar, res);
  }
  const go = el('span', 'tb-go');
  go.append(el('span', 'tb-key', word));
  foot.append(go);
  body.append(foot);
  f.append(body);
  return body;
}

/** Which of a forked job's two ways this beat is on alone; null on a shared beat, or with no fork. */
const forkWay = (a: Active): number | null => {
  const ways = a.route?.ways ?? [];
  if (ways.length !== 2) return null;
  const on = ways.map((w) => w.beats.some((b) => b.id === a.beat));
  return on[0] === on[1] ? null : on[0] ? 0 : 1;
};

export function mountJobTable(host: HTMLElement, o: { onChoose(choice: string, o: { push?: PushMode; trade?: Trade; card?: string; press?: string; /** A recruit sent to this beat's post (routes and posts spec §2). */ post?: string; programs?: { load: string[]; run: string[] }; said?: string }): void; onTalk(text: string): void; onHover?(): void; /** `step`: the count's number, on a `count`. */ cue?(name: TableCue, step?: number): void; reduced(): boolean; tips?: Tips; /** Where the hand ends moved (`--hud-hand-r`): her box follows it, so her line re-pages. */ onHandEdge?(): void; /** A move on the deduction board (spec 2026-11-09 §3). */ onBoard?(move: BoardMove): void; /** One of the board's recorded barks to play (The Fourteenth voice script). */ onBark?(url: string): void; /** A move on the accounts board (Two Stories spec §3). */ onAccounts?(move: AccountsMove): void; /** The table went up or came down (the bar lights JOBS while it's up). */ onUp?(up: boolean): void }): JobTable {
  const shell = mountTableShell(host, { hud: true });
  shell.root.classList.add('tb-job');
  let active: Active | null = null;
  // The deduction board (spec 2026-11-09 §4): on a board beat it takes the moment, the levers and the hand.
  let dboard: DeductionBoard | null = null;
  const showBoard = (a: Active | null) => {
    const on = Boolean(a?.board) && !ended;
    shell.root.classList.toggle('tb-deduction', on);
    if (on) {
      dboard ??= mountDeduction(shell.root, { onMove: (m) => o.onBoard?.(m), onCue: (n, step) => o.cue?.(n, step), onBark: (url) => o.onBark?.(url), reduced: o.reduced, side: isPhone(host) ? undefined : (shell.log ?? undefined), onResize: () => shell.publishLog() });
      dboard.root.hidden = false;
      dboard.missing(true);
      dboard.show(a!.board!);
      // The board can arrive while she's still speaking (her reply to the pick that brought it).
      dboard.hold(heldBy !== null ? heldBy : null);
    } else if (dboard) {
      dboard.root.hidden = true;
      dboard.missing(false);
    }
    queueTrace();
  };
  // The accounts board (Two Stories spec §5): on an accounts beat it takes the moment, the levers and the hand.
  let aboard: AccountsBoard | null = null;
  const showAccounts = (a: Active | null) => {
    const on = Boolean(a?.accounts) && !ended;
    shell.root.classList.toggle('tb-accounting', on);
    if (on) {
      aboard ??= mountAccounts(shell.root, { onMove: (m) => o.onAccounts?.(m), onCue: (n) => o.cue?.(n) });
      aboard.root.hidden = false;
      aboard.show(a!.accounts!);
      aboard.hold(heldBy !== null ? heldBy : null);
    } else if (aboard) aboard.root.hidden = true;
    queueTrace();
  };
  // PUSH's mode and the trade (effect and NERVE spec §3, mockup effect-rail.html A): both go with the next pick.
  let pushMode: PushMode | null = null;
  // A cost pick or settle is on its way: the cost controls wait for the next show (final review I3).
  let costSent = false;
  let trade: Trade | null = null;
  // Programs for the next roll (programs spec §2.1): marked to load, loaded ones to run, and the slot whose fan is open.
  let progLoad: string[] = [];
  let progRun: string[] = [];
  let fan: string | null = null;
  // The job whose hand was last dealt: a new job deals it again, face down.
  let dealtFor: string | null = null;
  let lit: { choice: string; text: string } | null = null;
  let ended = false;
  // Who's speaking while the moment holds (ride-along replies): no pick, cost or ability goes until they're done.
  let heldBy: string | null = null;
  const heldNote = el('div', 'tb-held-note');
  heldNote.hidden = true;
  const applyHold = () => {
    const on = heldBy !== null && !ended;
    shell.root.classList.toggle('tb-held', on);
    heldNote.textContent = on ? `${heldBy!.toUpperCase()} ON THE LINE` : '';
    heldNote.hidden = !on;
    dboard?.hold(on ? heldBy : null);
    aboard?.hold(on ? heldBy : null);
    if (!heldNote.isConnected) shell.root.querySelector('.tb-middle')?.prepend(heldNote);
  };

  const head = el('div', 'tb-head');
  const strip = el('div', 'tb-strip');
  const art = el('img', 'tb-art');
  art.alt = '';
  art.hidden = true;
  art.addEventListener('error', () => (art.hidden = true));
  // PUSH sits in the rail after NERVE, the stack it spends: its chip, and what it buys, off → +1D → +EFFECT → off.
  const pushBtn = el('button', 'tb-push');
  pushBtn.type = 'button';
  const pushWord = el('span', 'tb-push-word', '+1D');
  pushBtn.append(piece('push', 'tb-chip'), el('span', 'tb-push-word', 'PUSH'), pushWord);
  const showPush = () => {
    pushBtn.classList.toggle('on', pushMode !== null);
    pushBtn.setAttribute('aria-pressed', String(pushMode !== null));
    pushWord.textContent = pushMode === 'effect' ? '+EFFECT' : '+1D';
    const pushWords = `PUSH ${pushMode === 'effect' ? '+EFFECT' : '+1D'} · ${PUSH_NERVE} NERVE`;
    setTip(pushBtn, pushWords);
    pushBtn.setAttribute('aria-label', pushWords);
  };
  showPush();
  // Turning PUSH on or off changes what a press can pay for: the hand and the cards follow.
  const remod = () => {
    settleFan();
    if (active?.hand) hand.show(handGroups(active.hand, (active.nerve?.left ?? 0) - (pushMode ? PUSH_NERVE : 0), progState()), { dealIn: false });
    showClocks();
    placePost();
    showTray();
    showTrade();
    renderCards();
  };
  // LOAD's list stands over the moment, as SETUP's tray does: the hand's row stays put.
  const tray = el('div', 'tb-load-tray g-deck');
  tray.hidden = true;
  shell.middle.append(tray);
  // The moment comes back under the pointer as the tray closes: the second click of a double-click mustn't roll.
  let trayShutAt = 0;
  const TRAY_GUARD_MS = 300;
  /** A slot's tray stays open only while there's something to load: a lifted card or a spent NERVE can empty it. */
  const settleFan = () => {
    const pockets = active?.hand?.pockets;
    if (fan && (!pockets || !progState().canLoad || !loadOffer(pockets, progState()).length)) fan = null;
  };
  const showTray = () => {
    const pockets = active?.hand?.pockets;
    if (!tray.hidden && !fan) trayShutAt = performance.now();
    tray.hidden = !fan || !pockets;
    if (tray.hidden || !pockets) return;
    const row = el('div', 'tb-slots');
    for (const c of loadOffer(pockets, progState())) {
      const b = cardEl({ id: `prog-pick:${c.id}`, face: programFace(c), state: 'up' }, 'tb-slot');
      b.addEventListener('click', () => progTap(`prog-pick:${c.id}`));
      row.append(b);
    }
    tray.replaceChildren(trayHead(), row);
  };
  document.addEventListener('keydown', (e) => {
    if (!fan || e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    fan = null;
    remod();
  }, true);
  // A tap anywhere but a card closes an open fan (programs spec §2.1).
  document.addEventListener('click', (e) => {
    if (!fan || (e.target instanceof Element && e.target.closest('.tb-slot'))) return;
    fan = null;
    remod();
  });
  pushBtn.addEventListener('click', () => {
    o.tips?.clear();
    pushMode = pushMode === null ? 'dice' : pushMode === 'dice' && active?.choices.some((c) => c.pool?.effect) ? 'effect' : null;
    showPush();
    remod();
  });
  // SAFE and BOLD stacked beside PUSH: one or neither lit; a click on the lit one puts it back.
  const tradeBox = el('div', 'tb-trade');
  const tradeBtn = (t: Trade, hint: string) => {
    const b = el('button', `tb-${t}`, t.toUpperCase());
    b.type = 'button';
    b.dataset.hint = hint;
    b.addEventListener('click', () => {
      o.tips?.clear();
      trade = trade === t ? null : t;
      showTrade();
      renderCards();
    });
    return b;
  };
  const safeBtn = tradeBtn('safe', 'SAFE · A POSITION BETTER, A STEP LESS');
  const boldBtn = tradeBtn('bold', 'BOLD · A POSITION WORSE, A STEP MORE');
  tradeBox.append(safeBtn, boldBtn);
  /**
   * Lit as chosen; off with the reason when no card here can take it (the first card's reason), each card as a lifted
   * card would play it (final review I1). A lit one stays clickable, so it can always be put back (final review M1);
   * out of the rail, the trade goes.
   */
  const showTrade = () => {
    const lifted = hand.lifted();
    const pools = active?.choices.flatMap((c) => (!c.pool ? [] : lifted ? (playOn(c) ? [playOn(c)!] : []) : [c.pool])) ?? [];
    tradeBox.hidden = !(active?.choices.some((c) => c.pool?.effect) ?? false);
    if (tradeBox.hidden) trade = null;
    for (const [b, t] of [[safeBtn, 'safe'], [boldBtn, 'bold']] as const) {
      const whys = pools.map((p) => tradeRefusal(p, t));
      const off = whys.length > 0 && whys.every((w) => w !== null);
      b.disabled = off && trade !== t;
      setTip(b, off ? whys[0]! : b.dataset.hint!);
      b.classList.toggle('on', trade === t);
      b.setAttribute('aria-pressed', String(trade === t));
    }
  };
  const extra = el('div', 'tb-extra');
  // The deal stays quiet: the job moment already sounds a new beat (main.ts).
  const deal = mountDeal(shell.middle, { reduced: o.reduced(), cue: (n) => n !== 'beat' && o.cue?.(n), onPick: (id) => choose(id) });
  // HUD (mockup graft-layouts.html A): the title and its strip lead the top bar; the picture and the prose open the log.
  const title = el('div', 'tb-top-l');
  title.append(head, strip);
  shell.top!.prepend(title);
  shell.log!.prepend(art);
  // The trace (mockup graft-trace.html): over the JOB column, the job's line, its route and the beat's name; the column
  // stands in what's left (`tb-log-at`, shell.ts publishLog).
  const routeBox = el('div', 'tb-route');
  // SO FAR, under the column: what each beat already played came to (the view's `soFar`).
  const soFarBox = el('div', 'tb-sofar');
  shell.log!.append(routeBox, el('div', 'tb-log-at'), soFarBox);
  const showSoFar = () => {
    const rows = (active && !ended ? (active.soFar ?? []) : []).slice(-SO_FAR_ROWS);
    soFarBox.hidden = rows.length === 0;
    if (rows.length === 0) return soFarBox.replaceChildren();
    const head = el('div', 'tb-sofar-head', 'SO FAR');
    soFarBox.replaceChildren(
      head,
      ...rows.map((r) => {
        const row = el('div', 'tb-sofar-row');
        const moved = el('span', 'tb-sofar-moved');
        if (r.take) moved.append(el('b', r.take > 0 ? 'take' : 'take loss', `TAKE ${r.take > 0 ? '+' : '−'}${Math.abs(r.take)}`));
        if (r.alarm) moved.append(el('b', r.alarm > 0 ? 'alarm' : 'alarm off', `ALARM ${r.alarm > 0 ? '+' : '−'}${Math.abs(r.alarm)}`));
        row.append(el('span', 'tb-sofar-beat', r.title), el('span', 'tb-sofar-line', r.line), moved);
        if (r.costs?.length) row.append(el('span', 'tb-sofar-costs', r.costs.join(' · ')));
        return row;
      }),
    );
  };
  // The choice Enter rolls (keys.ts): the first card until the pointer or the arrows move it.
  let sel: string | null = null;
  const showSel = () => {
    const ids = active?.choices.map((c) => c.id) ?? [];
    if (!sel || !ids.includes(sel)) sel = ids[0] ?? null;
    for (const b of deal.root.querySelectorAll<HTMLElement>(':scope > .tb-card')) b.classList.toggle('sel', b.dataset.id === sel);
  };
  /**
   * The trace's lines (mockup graft-trace.html): the head line from its ring under the job's name and the clocks, climbing
   * into the bar's run under JOBS; the left rail turning along the hand's row; a leader from each lifted or marked row
   * to every card it changes. Drawn in the table's box, on the stage's pixels.
   */
  let leads: string[] = [];
  const drawTrace = () => {
    const root = shell.root;
    const drop = () => {
      for (const k of ['head', 'rail', ...leads]) clearLead(root, k);
      leads = [];
    };
    if (root.hidden || root.offsetWidth === 0 || isPhone(host)) return drop();
    // A board (deduction, accounts) keeps the head line and the rail, turning along its own hand; its leaders are its own.
    const boardHand = root.matches('.tb-deduction, .tb-accounting') ? root.querySelector<HTMLElement>('.tb-dboard:not([hidden]) .dd-hand, .tb-accounts:not([hidden]) .ac-hand') : null;
    const top = hostRect(root, shell.top!);
    const y = Math.round(top.bottom);
    const x = Math.round(top.left - 28);
    const kon = root.parentElement?.querySelector('.hud-trace .kon.job');
    const k = kon ? hostRect(root, kon) : null;
    const run: Pt | null = k && k.width > 0 ? [k.left, (k.top + k.bottom) / 2] : null;
    traceVia(root, 'head', headLinePoints([x, y], run, root.offsetWidth - 60));
    if (root.matches('.tb-deduction, .tb-accounting')) {
      for (const kOld of leads) clearLead(root, kOld);
      leads = [];
      if (!boardHand) return clearLead(root, 'rail');
      const hb = hostRect(root, boardHand);
      // It turns in at the hand's head (CLUES, YOUR ACCOUNTS), which stands 22px over the cards.
      const hy = Math.round(hb.top - 14);
      traceVia(root, 'rail', [[x, y + 6], [x, hy], [Math.round(hb.left - 8), hy]]);
      return;
    }
    const bottom = hostRect(root, shell.bottom);
    const railY = Math.round(bottom.top + 2);
    const ends = [...shell.bottom.children].map((c) => hostRect(root, c)).filter((r) => r.width > 0).map((r) => r.right);
    traceVia(root, 'rail', [[x, y + 6], [x, railY], [Math.round(Math.max(bottom.left + 200, ...ends)), railY]]);
    // Leaders: what's lifted (a call, a press) and each program marked to run or load, to the cards they change.
    const next: string[] = [];
    const a = active;
    const cardOf = (id: string) => deal.root.querySelector<HTMLElement>(`:scope > .tb-card[data-id="${CSS.escape(id)}"]`);
    /** A leader from a hand slot up to the rail, along it, and up into the foot of each target; `name`: its keys' stem. */
    const from = (slot: HTMLElement | null, color: string, hits: (HTMLElement | null)[], lane: number, name = 'lift') => {
      if (!slot || !hits.length) return;
      const s = hostRect(root, slot.querySelector('.tbc-pic, .tbc') ?? slot);
      const p: Pt = [Math.round(s.left + s.width / 2), Math.round(s.top - 4)];
      hits.forEach((card, i) => {
        if (!card) return;
        const c = hostRect(root, card);
        const q: Pt = [Math.round(c.left + c.width * (0.16 + 0.14 * lane)), Math.round(c.bottom + 3)];
        const rail = railY - 4 - lane * 4;
        const sx = q[0] >= p[0] ? 1 : -1;
        const [up, dn] = [p[1] - rail, rail - q[1]];
        if (up < 0 || dn < 0) return;
        const key = `${name}-${lane}-${i}`;
        traceVia(root, key, [p, [p[0] + sx * up, rail], [q[0] - sx * dn, rail], q], color);
        next.push(key);
      });
    };
    const slotOf = (id: string) => hand.root.querySelector<HTMLElement>(`.tb-slot[data-id="${CSS.escape(id)}"]`);
    if (a && !ended && !a.costs) {
      const lifted = hand.lifted();
      if (lifted) from(slotOf(lifted), 'var(--k-people)', a.choices.filter((c) => c.pool && playOn(c)).map((c) => cardOf(c.id)), 0);
      [...progLoad, ...progRun].forEach((p, i) => from(slotOf(`prog:${p}`), 'var(--k-pocket)', a.choices.filter((c) => fitsOn(c, p)).map((c) => cardOf(c.id)), 1 + i));
    }
    if (a && !ended) {
      // An offer on the waiting roll: from whoever's it is to its box.
      [...deal.root.querySelectorAll<HTMLElement>(':scope > .tb-offers .tb-offer')].forEach((box, i) => from(slotOf(box.dataset.who ?? ''), 'var(--k-people)', [box], i, 'offer'));
      // A held post: from the POST key along the rail and up the left to its beat on the route.
      const held = a.route?.ways.flatMap((w) => w.beats).find((b) => b.post?.by);
      const node = held ? routeBox.querySelector(`[data-beat="${CSS.escape(held.id)}"]`) : null;
      const mark = node?.querySelector('.pst') ?? node;
      // From the POST key while it's up (the post's own beat); later, from whoever holds it, on their row.
      const holder = held?.post?.by ? a.hand?.people.find((p) => p.name === held.post!.by) : undefined;
      const start = postEl.isConnected && postEl.offsetWidth > 0 ? postEl : holder ? (slotOf(holder.id)?.querySelector<HTMLElement>('.tbc-pic, .tbc') ?? null) : null;
      if (mark && start) {
        const f = hostRect(root, start);
        const t = hostRect(root, mark);
        const p: Pt = [Math.round(f.left + 12), Math.round(f.top - 3)];
        const q: Pt = [Math.round((t.left + t.right) / 2), Math.round(t.bottom + 4)];
        const lx = x + 10;
        const ry = railY - 10;
        if (q[0] > lx && ry > q[1] + (q[0] - lx) && p[1] >= ry) {
          traceVia(root, 'post', [p, [p[0], ry], [lx, ry], [lx, q[1] + (q[0] - lx)], q], 'var(--k-people)');
          next.push('post');
        }
      }
    }
    for (const kOld of leads) if (!next.includes(kOld)) clearLead(root, kOld);
    leads = next;
  };
  let traceRaf = 0;
  const queueTrace = () => {
    if (typeof requestAnimationFrame !== 'function') return;
    cancelAnimationFrame(traceRaf);
    traceRaf = requestAnimationFrame(drawTrace);
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(queueTrace).observe(shell.root);
  const hudTrace = host.querySelector('.hud-trace');
  if (hudTrace && typeof MutationObserver === 'function') new MutationObserver(queueTrace).observe(hudTrace, { childList: true });
  // The table's own key line (mockup graft-trace.html), over the input's: only the keys that do something now.
  const keyLine = el('div', 'tb-keys');
  shell.root.append(keyLine);
  let costAt = 0;
  // A pick sent and not yet answered by a new state.
  let pickSent = false;
  const pickable = () => [...deal.root.querySelectorAll<HTMLElement>(':scope > .tb-costs .tb-cost.pickable')];
  const showKeys = () => {
    const a = active;
    if (!a || shell.root.hidden || isPhone(host) || heldBy !== null || a.board || a.accounts) return void keyLine.replaceChildren();
    if (ended) return setHints(keyLine, '[ENTER] CLOSE');
    const parts: string[] = [];
    if (a.costs) {
      const open = deal.root.querySelector(':scope > .tb-costs .tb-cost-btn');
      if (open) {
        parts.push('[ENTER] TAKE IT');
        if (deal.root.querySelector(':scope > .tb-costs .tb-cost-btn.resist:not(:disabled)')) parts.push('[R] RESIST');
        if (deal.root.querySelector(':scope > .tb-costs .tb-cost-btn.armour:not(:disabled)')) parts.push('[F] FIREWALL');
      } else if (pickable().length) parts.push('[↑↓] COST', '[ENTER] PICK IT');
    } else if (a.choices.length) {
      const picked = a.choices.find((c) => c.id === sel);
      if (a.choices.length > 1) parts.push('[←→] CHOICE');
      const crew = a.hand?.people.filter((p) => !p.down && !p.at && (p.free > 0 || p.risk !== null)).length ?? 0;
      if (crew && a.choices.some((c) => c.pool)) parts.push(`[1${crew > 1 ? `–${crew}` : ''}] CALL CREW`);
      if (!pushBtn.hidden) parts.push('[P] PUSH');
      if (!tradeBox.hidden) parts.push('[S] SAFE', '[B] BOLD');
      if (a.post && !a.post.by && postEl.isConnected) parts.push('[O] POST');
      if (hand.lifted()) parts.push('[ESC] PUT BACK');
      parts.push(`[ENTER] ${picked?.pool ? (a.choices.some((c) => c.leads) ? 'ROLL, AND GO THAT WAY' : 'ROLL') : picked?.crack ? 'CRACK IT' : 'DO IT'}`);
    }
    setHints(keyLine, parts.join(' · '));
    pickable().forEach((n, i) => n.classList.toggle('kb', i === costAt % Math.max(1, pickable().length)));
  };
  const key = (k: string, typing: boolean): boolean => {
    const a = active;
    if (shell.root.hidden || isPhone(host)) return false;
    if (ended) {
      if (k !== 'Enter' || !close.isConnected) return false;
      close.click();
      return true;
    }
    // A pick on its way (its roll is playing): the next key is the animation's, not a second pick (review).
    if (!a || a.board || a.accounts || heldBy !== null || pickSent) return false;
    const letter = typing ? '' : k.toLowerCase();
    const press = (n: HTMLElement | null | undefined): boolean => {
      if (!n || !n.isConnected || (n as HTMLButtonElement).disabled || n.hidden || n.closest('[hidden]')) return false;
      n.click();
      return true;
    };
    if (a.costs) {
      const box = deal.root.querySelector<HTMLElement>(':scope > .tb-costs');
      if (box?.querySelector('.tb-cost-btn')) {
        if (k === 'Enter') return press(box.querySelector<HTMLElement>('.tb-cost-btn.take'));
        if (letter === 'r') return press(box.querySelector<HTMLElement>('.tb-cost-btn.resist'));
        if (letter === 'f') return press(box.querySelector<HTMLElement>('.tb-cost-btn.armour'));
        return false;
      }
      const list = pickable();
      if (!list.length) return false;
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        costAt = (costAt + (k === 'ArrowDown' ? 1 : list.length - 1)) % list.length;
        o.cue?.('move');
        showKeys();
        return true;
      }
      return k === 'Enter' ? press(list[costAt % list.length]) : false;
    }
    if (!a.choices.length) return false;
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      if (a.choices.length < 2) return false;
      const i = Math.max(0, a.choices.findIndex((c) => c.id === sel));
      sel = a.choices[(i + (k === 'ArrowRight' ? 1 : a.choices.length - 1)) % a.choices.length].id;
      o.cue?.('move');
      showSel();
      showRoute();
      showKeys();
      return true;
    }
    if (k === 'Enter') {
      // A card asking THAT'S MY CHOICE answers on its own buttons.
      if (lit || !sel) return false;
      choose(sel);
      return true;
    }
    if (k === 'Escape') {
      if (!hand.lifted() && !postArmed) return false;
      postArmed = false;
      hand.drop();
      remod();
      showPost();
      return true;
    }
    // The digits count the recruits who can be called, as the key line does.
    if (/^[1-9]$/.test(letter)) return press([...hand.root.querySelectorAll<HTMLElement>('.g-people .tb-crew-stack > .tb-slot[data-state="up"], .g-people .tb-slots > .tb-slot[data-state="up"]')][Number(letter) - 1]);
    if (letter === 'p') return press(pushBtn);
    if (letter === 's') return press(safeBtn);
    if (letter === 'b') return press(boldBtn);
    return false;
  };
  const showRoute = () => {
    const a = active;
    if (!a || ended) {
      showSoFar();
      return routeBox.replaceChildren();
    }
    const role = el('div', 'tb-role');
    const pay = a.pay && a.pay[1] > 0 ? `${a.pay[0] === a.pay[1] ? a.pay[0] : `${a.pay[0]}–${a.pay[1]}`} SOL` : '';
    role.append(...(a.tier ? [el('b', '', `TIER ${a.tier}`), ' · '] : []), `HEAT ${a.heat ?? 0}`, ...(pay ? [' · ', pay] : []), ...(a.push && a.push.pot > 0 ? [' · ', `POT +${a.push.pot} SOL`] : []));
    const here = a.route?.ways.flatMap((w) => w.beats).find((b) => b.id === a.beat);
    const parts: (HTMLElement | SVGElement)[] = [role];
    if (a.route) {
      // Before the fork, the way the selected card leads is the lit one.
      const lead = a.choices.find((c) => c.id === sel)?.leads;
      const pick = lead ? a.route.ways.findIndex((w) => w.beats.some((b) => b.title === lead)) : -1;
      const harm = a.choices.find((c) => c.on?.harm)?.on;
      parts.push(routeEl(a.route, a.beat, { pick: pick < 0 ? null : pick, hot: Boolean(harm) }));
      const note = el('div', 'rt-note');
      const held = a.route.ways.flatMap((w) => w.beats).find((b) => b.post?.by)?.post;
      const way = wayOf(a.route, a.beat);
      const open = a.route.ways.filter((_, i) => way === null || i === way).some((w) => w.beats.some((b) => b.post && !b.post.by && !a.route!.played.includes(b.id)));
      if (harm?.harm) note.append(`A MISS HERE ${harm.miss === 'part' ? 'KEEPS HALF' : harm.miss === 'none' ? 'LOSES THE TAKE' : 'KEEPS THE TAKE'} · `, el('b', '', `${firstOf(harm.harm.who)} ${harm.harm.harm === 'held' ? 'IS HELD' : 'TAKES THE HIT'}`));
      else if (held?.by) note.append(el('b', '', firstOf(held.by)), ` HOLDS THE ${held.id.toUpperCase().replace(/-/g, ' ')}`);
      else if (open) note.append(el('i', ''), 'A POST: ONE OF YOURS CAN STAY THERE');
      parts.push(note);
    }
    parts.push(el('div', 'tb-beat', a.getaway ? 'GET OUT' : a.push ? 'PRESS ON?' : (here?.title ?? a.beat.replace(/^!/, '').replace(/-/g, ' ').toUpperCase())));
    routeBox.replaceChildren(...parts);
    showSoFar();
    shell.publishLog();
  };
  shell.middle.append(extra);
  /**
   * Where the hand ends on the stage (2026-11-08), as `--hud-hand-r`: the contact's box widens left up to it
   * (job-column.css). The row's content is centred, so its right edge moves with every card; nothing in it: 0.
   */
  let handEdge = -1;
  const publishHand = () => {
    queueTrace();
    if (shell.root.hidden) return;
    const box = shell.root.getBoundingClientRect();
    const k = shell.root.offsetWidth ? box.width / shell.root.offsetWidth : 1;
    const rights = [...shell.bottom.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => r.right);
    const edge = rights.length ? Math.round(shell.root.offsetLeft + (Math.max(...rights) - box.left) / k) : 0;
    if (edge === handEdge) return;
    handEdge = edge;
    host.style.setProperty('--hud-hand-r', `${edge}px`);
    o.onHandEdge?.();
  };
  let lastClocks: Parameters<TableShell['corners']>[0] = {};
  /**
   * The clocks, with the pips about to change blinking (mockup graft-trace.html): the ALARM a waiting roll will land and
   * the TAKE it earned, and the NERVE an armed PUSH will spend.
   */
  function showClocks(): void {
    const a = active;
    if (!a || ended) return;
    const rolled = a.rolled && 'kind' in a.rolled ? a.rolled : null;
    // ALARM as it will land: the roll's own, the card's (a route's `alarm +n`) and each ALARM +1 already taken.
    const alarm = rolled ? (rolled.cost?.alarm ?? 0) + (a.choices.find((c) => c.id === rolled.choice)?.alarm ?? 0) + (a.costs?.dealt.filter((d) => d.cost === 'alarm' && d.settled === 'taken').length ?? 0) : 0;
    const soon = { take: rolled?.take ?? 0, alarm: Math.max(0, alarm), nerve: pushMode && !rolled ? PUSH_NERVE : 0 };
    shell.corners({ ...lastClocks, ...(soon.take || soon.alarm || soon.nerve ? { soon } : {}) });
  }
  const close = el('button', 'tb-close', 'CLOSE');
  close.type = 'button';
  close.addEventListener('click', () => {
    ended = false;
    o.tips?.clear();
    shell.close();
    o.onUp?.(false);
    drawTrace();
  });
  /** What the lifted card, and a press beside it, would make this choice's roll; none: they can't play here (or nothing's lifted). */
  const playOn = (c: Choice | undefined) => {
    const lifted = hand.lifted();
    const play = lifted ? c?.plays?.[lifted] : undefined;
    const press = hand.press();
    return press ? play?.presses?.[press] : play;
  };
  // The beat's post (routes and posts spec §2): a strip over the cards. Armed (a click, or O), the next recruit tapped in
  // the hand is marked to go; the mark rides in with the pick. Until then it's only here, so it can be taken back.
  let postArmed = false;
  let postMark: string | null = null;
  const postEl = el('button', 'tb-post');
  postEl.type = 'button';
  const canGo = (id: string) => active?.hand?.people.some((p) => p.id === id && !p.guest && !p.down && !p.at) ?? false;
  const firstOf = (id: string) => active?.hand?.people.find((p) => p.id === id)?.name.split(' ')[0].toUpperCase() ?? id.toUpperCase();
  const showPost = () => {
    const p = active && !ended && !active.costs && !active.choices.some((c) => c.id.startsWith('!')) ? active.post : undefined;
    if (!p) {
      postArmed = false;
      postMark = null;
      postEl.remove();
      postNote.remove();
      return;
    }
    if (p.by || (postMark && !canGo(postMark))) postMark = null;
    if (p.by) postArmed = false;
    postEl.classList.toggle('armed', postArmed);
    postEl.classList.toggle('marked', postMark !== null);
    postEl.classList.toggle('held', Boolean(p.by));
    const state = p.by ? `${firstOf(p.by)} HOLDS IT` : postMark ? `${firstOf(postMark)} GOES · TAP TO TAKE BACK` : postArmed ? 'PICK WHO GOES' : 'SEND SOMEONE · O';
    postEl.replaceChildren(
      el('span', 'tb-post-word', `POST${p.suits ? ` · SUITS ${p.suits.toUpperCase()}` : ''}`),
      el('span', 'tb-post-line', p.line),
      el('span', 'tb-post-gives', p.gives),
      ...(p.by ? [] : [el('span', 'tb-post-cost', 'NO CALL OR ABILITY FOR THE REST OF THE JOB')]),
      el('span', 'tb-post-state', state),
    );
    setTip(postEl, `${p.line} ${p.gives}${p.by ? '' : ' Whoever goes makes no call and plays no ability for the rest of the job.'}`);
    postNote.textContent = p.gives;
    placePost();
  };
  // Where the post stands: at the head of the crew's rail (the hand redraws its groups, so it's put back after each),
  // over the cards on a phone or with nobody to send.
  const postNote = el('span', 'tb-post-note');
  const placePost = () => {
    if (!active?.post || ended || active.costs || active.choices.some((c) => c.id.startsWith('!'))) return void postNote.remove();
    const label = isPhone(host) ? null : shell.bottom.querySelector<HTMLElement>('.g-people > .tb-group-label');
    if (label) {
      if (postEl.parentElement !== label) label.append(postEl, postNote);
    } else if (postEl.parentElement !== shell.middle) {
      postNote.remove();
      shell.middle.prepend(postEl);
    }
  };
  const armPost = () => {
    if (!active?.post || active.post.by || heldBy !== null) return;
    o.tips?.clear();
    if (postMark) postMark = null;
    else postArmed = !postArmed;
    showPost();
  };
  postEl.addEventListener('click', armPost);
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'o' && e.key !== 'O') || e.repeat || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || ended || shell.root.hidden || !shell.root.isConnected || !postEl.isConnected) return;
    if (e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(e.target.tagName))) return;
    armPost();
  });
  const hand = mountHand(shell.bottom, {
    // A lifted card can change which programs fit, so the deck follows it.
    onLift: (id) => {
      // Someone marked for the post and then lifted is called instead.
      if (id && postMark && (id === postMark || id.startsWith(`${postMark}/`))) {
        postMark = null;
        showPost();
      }
      if (active?.hand?.pockets) return remod();
      showTrade();
      renderCards();
    },
    // An armed post takes the recruit whose card is tapped, whatever that card's state (a fence's is locked): marked, not
    // lifted. A tap on anything else is a tap like any other, and the post stays armed.
    onPick: (id) => {
      if (!postArmed || !canGo(id)) return false;
      postArmed = false;
      postMark = id;
      // Their own call or ability, if it's up, goes back: they can't be called and sent on one pick.
      const up = [hand.lifted(), hand.press()].some((c) => c === id || c?.startsWith(`${id}/`));
      showPost();
      if (up) hand.drop();
      return true;
    },
    // An AFTER A ROLL ability on the parked roll plays at once (crew abilities spec §2).
    onTap: (card) => {
      if (heldBy !== null) return;
      if (progTap(card)) return;
      o.cue?.('ability');
      o.onChoose('!after', { card });
    },
    cue: o.cue,
  });
  // The hand's width (cards come and go, it steps away for a debrief) moves where it ends: each thing in the row is watched.
  if (typeof ResizeObserver === 'function') {
    const sizes = new ResizeObserver(publishHand);
    const watch = () => [...shell.bottom.children].forEach((c) => sizes.observe(c));
    watch();
    if (typeof MutationObserver === 'function') new MutationObserver(() => (watch(), publishHand())).observe(shell.bottom, { childList: true });
  }
  // ON THE ROLL (the trace): the levers stand at the end of the hand's rail as cut keys; a phone keeps them in the levers' region.
  const onroll = el('div', 'tb-onroll');
  const onrollKeys = el('div', 'tb-onroll-keys');
  const onrollNote = el('span', 'tb-onroll-note', `PUSH · ${PUSH_NERVE} NERVE`);
  onroll.append(el('div', 'tb-onroll-head', 'ON THE ROLL'), onrollKeys);
  const placeLevers = () => {
    const home = isPhone(host) ? shell.levers! : onrollKeys;
    if (pushBtn.parentElement !== home) home.append(pushBtn, tradeBox);
    if (home === onrollKeys) {
      if (!onrollNote.isConnected) onrollKeys.append(onrollNote);
      if (!onroll.isConnected) shell.bottom.append(onroll);
    } else onroll.remove();
    onrollNote.hidden = pushBtn.hidden;
    onroll.hidden = hand.root.hidden || (pushBtn.hidden && tradeBox.hidden);
  };
  placeLevers();

  // A program fits this beat when some card here can run it (the server's preview says so).
  const previewsOn = (c: Choice | undefined) => {
    const lifted = hand.lifted();
    return (lifted && playOn(c)?.previews) || c?.programs;
  };
  const fitsOn = (c: Choice | undefined, id: string) => {
    const p = previewsOn(c)?.[id];
    return p !== undefined && !('why' in p);
  };
  const progState = (): ProgState => ({ load: progLoad, run: progRun, fan, fits: (id) => active?.choices.some((c) => fitsOn(c, id)) ?? false, canLoad: (active?.nerve?.left ?? 0) - (pushMode ? PUSH_NERVE : 0) - (progLoad.length + 1) * HOT_LOAD_NERVE >= 0 });
  /** A tap in POCKETS (programs spec §2.1): LOAD opens its fan, a fan card marks a load, a marked or loaded program toggles. */
  const progTap = (card: string): boolean => {
    if (card.startsWith('slot:')) fan = fan === card ? null : card;
    else if (card.startsWith('prog-pick:')) {
      progLoad = [...progLoad, card.slice('prog-pick:'.length)];
      fan = null;
      o.tips?.clear();
      o.cue?.('load');
      remod();
      return true;
    } else if (card.startsWith('prog:')) {
      const id = card.slice('prog:'.length);
      if (progLoad.includes(id)) progLoad = progLoad.filter((x) => x !== id);
      else progRun = progRun.includes(id) ? progRun.filter((x) => x !== id) : [...progRun, id];
    } else return false;
    o.tips?.clear();
    o.cue?.('move');
    remod();
    return true;
  };

  const choose = (id: string, said?: string) => {
    const a = active;
    if (!a || ended || heldBy !== null || id.startsWith('!debrief') || performance.now() - trayShutAt < TRAY_GUARD_MS) return;
    const c = a.choices.find((x) => x.id === id);
    if (!c) return;
    const lifted = hand.lifted();
    const card = lifted && playOn(c) ? lifted : undefined;
    const press = card ? hand.press() : null;
    const push = pushMode && c.pool && !c.red ? pushMode : null;
    const traded = c.pool && trade ? trade : null;
    // A card the trade or PUSH +EFFECT can't go on says why on its face: it isn't picked (the server would refuse it).
    if (c.pool && (traded || push)) {
      const from = card ? playOn(c)! : c.pool;
      if (tradedSide(from, { trade: traded, push }).why) return;
    }
    // Only the programs that do something on this card go with it (programs spec §2.2).
    const load = progLoad.filter((p) => fitsOn(c, p));
    const run = progRun.filter((p) => fitsOn(c, p));
    // Whoever's marked for the post goes with this pick (routes and posts spec §2).
    // Not someone called or pressing on this same pick: the server would refuse the lot.
    const busy = (c: string | null | undefined) => Boolean(c && postMark && (c === postMark || c.startsWith(`${postMark}/`)));
    const sent = a.post && !a.post.by && !id.startsWith('!') && !busy(card) && !busy(press) ? postMark : null;
    postMark = null;
    postArmed = false;
    showPost();
    pushMode = null;
    trade = null;
    progLoad = [];
    progRun = [];
    fan = null;
    showTray();
    showPush();
    showTrade();
    hand.drop();
    o.tips?.clear();
    // The pick sounds as what it is: the way out, a cost taken, a push, an ability pressed beside it, a program run, a call.
    o.cue?.(id === '!walk' ? 'walk' : id === '!press' ? 'press-on' : id === '!take' ? 'take' : push ? 'push' : press ? 'ability' : sent ? 'post' : run.length ? 'program' : load.length ? 'load' : c.pool ? 'call' : 'confirm');
    pickSent = !id.startsWith('!');
    o.onChoose(id, { ...(push ? { push } : {}), ...(traded ? { trade: traded } : {}), ...(card ? { card } : {}), ...(press ? { press } : {}), ...(sent ? { post: sent } : {}), ...(load.length || run.length ? { programs: { load, run } } : {}), ...(said !== undefined ? { said } : {}) });
  };

  /** What the marked programs do on a choice (programs spec §2.1): their kinds' steps and the lacquer's ALARM. */
  const progOn = (c: Choice): ProgMod | undefined => {
    const on = [...progLoad, ...progRun].filter((p) => fitsOn(c, p));
    if (!on.length) return undefined;
    const kinds = active?.hand?.pockets?.catalog ?? [];
    const kind = (p: string) => kinds.find((x) => x.id === p)?.kind;
    const previews = on.map((p) => previewsOn(c)![p] as Exclude<ProgramPreview, { why: string }>);
    const name = (p: string) => kinds.find((x) => x.id === p)?.name;
    const foil = (p: string) => kinds.find((x) => x.id === p)?.foil;
    return { on: on.map((p, i) => ({ name: name(p), kind: kind(p)!, ...(previews[i].tier ? { tier: previews[i].tier } : {}), alarm: previews[i].alarm, load: progLoad.includes(p), ...(foil(p) ? { foil: true as const } : {}) })), from: previews.find((x) => x.effect)?.effect };
  };

  /** What the rail and the marked programs do to a choice's card. */
  const faceMod = (c: Choice) => ({ trade, push: c.red ? null : pushMode, prog: progOn(c) });

  /** A card's hover panel (card-info.ts): read when it opens, from what its face draws. */
  const infoOf = (card: HTMLElement): Info | null => {
    const a = active;
    if (!a) return null;
    const id = card.dataset.id!;
    if (card.dataset.choice !== undefined) return choiceCardInfo(a, id);
    const plays = (cid: string) => a.choices.flatMap((c) => {
      const p = c.pool && c.plays?.[cid];
      return p ? [`${c.pool!.stat} · ${p.dice}D · ${POS_WORD[p.position]}${p.effect ? ` · ${EFFECT_NAMES[p.effect]}` : ''}`] : [];
    });
    const h = a.hand;
    if (!h) return null;
    const person = h.people.find((p) => p.id === id);
    if (person) return recruitInfo(person, { tier: a.tier, free: person.free, risk: person.risk, down: person.down, plays: plays(id) });
    const ab = abilityOf(id);
    const ability = ab && h.people.find((p) => p.id === ab.rid)?.abilities.find((x) => x.id === ab.ability);
    if (ability) return abilityInfo(ability, plays(id));
    if (id === 'favour') return h.favour ? favourInfo(plays(id), h.favour === 'used') : null;
    if (id.startsWith('contact:')) {
      const c = h.contacts.find((x) => `contact:${x.id}` === id);
      return c ? contactInfo(c, plays(id)) : null;
    }
    const pk = h.pockets;
    if (!pk) return null;
    if (id.startsWith('slot:')) return slotInfo({ setup: false, dead: pk.dead });
    const pid = /^prog(?:-pick)?:(.+)$/.exec(id)?.[1];
    const p = pk.catalog.find((x) => x.id === pid);
    if (!p) return null;
    const runs = a.choices.flatMap((c) => {
      const v = previewsOn(c)?.[p.id];
      return c.pool && v && !('why' in v) ? [`${c.pool.stat} · ${POS_WORD[v.position]}${v.effect ? ` · ${EFFECT_NAMES[v.effect]}` : ''}`] : [];
    });
    return programInfo(p, { tier: a.tier, ...(pk.deck ? { quality: pk.deck.quality } : {}), plays: runs, dead: pk.dead, burned: pk.loaded.some((l) => l.id === p.id && l.burned), ...(id.startsWith('prog-pick:') ? { nerve: HOT_LOAD_NERVE } : {}) });
  };
  const choiceCardInfo = (a: Active, id: string): Info | null => {
    const c = a.choices.find((x) => x.id === id);
    if (!c) return null;
    if (!c.pool) return plainInfo(c, a.take !== undefined && !a.getaway && !a.pressing);
    const lifted = hand.lifted();
    const play0 = playOn(c);
    const mod = faceMod(c);
    const s = cardState(c.pool, lifted, play0, mod);
    const caller = a.hand?.people.find((p) => p.id === lifted)?.name.split(' ')[0].toUpperCase() ?? 'CALL';
    const extra = [...(play0 && play0.dice > c.pool.dice ? [caller] : []), ...(mod.push === 'dice' && !s.why && (play0 || !lifted) ? ['PUSH'] : [])];
    return choiceInfo({ pool: c.pool, state: { dice: s.dice, position: s.pos, effect: s.effect, tier: s.tier, lacquer: s.lacquer, nerve: s.nerve, ran: s.on.ran.flatMap((x) => (x.name ? [x.name] : [])), extra, why: s.why ?? (lifted && !play0 ? 'NO CARD HERE' : null) }, ...(a.tier ? { tierOf: a.tier } : {}), ...(c.alarm ? { route: c.alarm } : {}), ...(c.red ? { red: true } : {}), ...(c.blows ? { blows: true } : {}) });
  };
  const info = mountCardInfo(shell.root, infoOf);

  /** A choice's face: its line, its pool (or the lifted card's preview), its flags, and a held line's buttons. */
  const choiceFace = (a: Active, c: Choice): HTMLElement => {
    const f = el('span', 'tb-face');
    // After a costly roll, STEADY and TAKE IT are picture cards: the price (`STEADY (2 NERVE)`) on the chip.
    if (c.id === '!steady' || (c.id === '!take' && c.line !== CARRY_ON)) {
      const price = /\((\d+) NERVE\)/.exec(c.line)?.[1];
      f.append(c.id === '!steady' ? artFace('steady', 'STEADY', ['NO ALARM, NO HEAT'], price ? `${price} NERVE` : undefined) : artFace('take', 'TAKE IT', ['THE COST LANDS']));
      return f;
    }
    // Nothing left to pay: the smothered alarm, and no word of a cost.
    if (c.id === '!take' && c.line === CARRY_ON) {
      const card = artFace('steady', CARRY_ON, ['NOTHING TO PAY']);
      card.classList.add('tb-free');
      f.append(card);
      return f;
    }
    // WALK and PRESS ON are pictures (sheet 9), worded like the answers to a cost: the word, then what it means.
    if (c.id === '!walk' || c.id === '!press') {
      f.append(el('span', 'tb-panel-word', c.id === '!walk' ? 'WALK' : 'PRESS ON'), el('small', 'tb-panel-sub', c.id === '!walk' ? c.line.replace(/^WALK\s*—\s*/, '') : `RISK IT · ${PRESS_NERVE} NERVE`));
      return f;
    }
    const lifted = hand.lifted();
    // A checked choice is a card like the hand's (mockup call-cards.html, D); the rest keep their plain face.
    // The rest (no dice) take the same frame: the line, then its tags at the foot.
    // What this card's outcomes do beyond the roll, with the holder at a post named (shared/odds.ts).
    const on: CardOn | undefined = c.on ? { ...c.on, ...(c.on.harm ? { harm: { ...c.on.harm, who: firstOf(c.on.harm.who) } } : {}) } : c.blows ? { blown: true } : undefined;
    const body = c.pool ? callFace(f, c.pool, lifted, playOn(c), faceMod(c), { ...(on ? { on } : {}), ...(lifted ? { caller: active?.hand?.people.find((p) => p.id === lifted)?.name.split(' ')[0].toUpperCase() ?? 'CALL' } : {}) }) : plainFace(f, lifted !== null && !c.id.startsWith('!'), !c.id.startsWith('!') && !c.crack, c.crack ? 'CRACK IT' : c.id === '!take' ? 'TAKE IT' : 'DO IT', c.sure, c.alarm ?? 0);
    body.prepend(el('span', 'tb-line', c.line));
    // The route's own ALARM lands on the pick, whatever the dice: shown first among the flags.
    if (c.alarm) body.querySelector('.tb-flags')?.prepend(el('span', 'tb-tag route', `ALARM +${c.alarm}`));
    const flags = body.querySelector<HTMLElement>('.tb-flags')!;
    // On a fork (routes and posts spec §1), where this card leads: the last line of its foot.
    if (c.leads) {
      const leads = el('span', 'tb-leads', `LEADS TO ${c.leads}`);
      body.querySelector('.tb-line')!.after(leads);
      // The post on that way and who of yours suits it (the route's own beats, by their titles).
      const there = a.route?.ways.flatMap((w) => w.beats).find((b) => b.title === c.leads && b.post && !b.post.by)?.post;
      if (there) {
        const fit = there.suits ? a.hand?.people.find((p) => p.spec === there.suits && !p.guest && !p.down && !p.at) : undefined;
        leads.after(el('span', 'tb-leads-post', `A POST THERE: THE ${there.id.toUpperCase().replace(/-/g, ' ')}${there.suits ? ` · SUITS ${fit ? fit.name.split(' ')[0].toUpperCase() : `A ${there.suits.toUpperCase()}`}` : ''}`));
      }
    }
    if (c.red) flags.append(el('span', 'tb-flag red', 'ONE SHOT'));
    // Only some cards here blow the job on a miss: those say so. When all do, the header does (allBlow).
    if (c.blows && !allBlow(a)) flags.append(el('span', 'tb-flag red blows', c.crack ? 'LOCKOUT BLOWS IT' : 'MISS BLOWS IT'));
    if (c.crack) flags.append(el('span', 'tb-flag', `CRACK · ${c.crack.length} LETTERS · ${c.crack.tries} TRIES`));
    if (!flags.childElementCount) flags.remove();
    if (lit?.choice === c.id) {
      const said = lit.text;
      body.append(el('span', 'tb-said', `“${said}”`), el('span', 'tb-sub', 'That sounds like this one. Is it your choice?'));
      const row = el('span', 'tb-actions');
      const yes = el('button', 'tb-confirm', "THAT'S MY CHOICE");
      const no = el('button', 'tb-talk', 'JUST TALKING');
      yes.type = 'button';
      no.type = 'button';
      yes.addEventListener('click', (e) => {
        e.stopPropagation();
        choose(c.id, said);
      });
      no.addEventListener('click', (e) => {
        e.stopPropagation();
        lit = null;
        renderCards();
        o.onTalk(said);
      });
      row.append(yes, no);
      body.append(row);
    }
    return f;
  };

  /**
   * A roll waiting on STEADY / TAKE IT stays up (crew abilities: a save glitches it): the card that rolled and its dice
   * and stamp move into a row of their own at the front of the deal. After a reload there's no card left from the roll:
   * the dice and stamp alone, landed. A row kept up shows this roll as it now is (a save's glitch may not have played
   * here); one from another roll goes.
   */
  const parkRoll = (rolled: Extract<NonNullable<Active['rolled']>, { faces: number[] }>): HTMLElement => {
    const kept = deal.root.querySelector<HTMLElement>(':scope > .tb-parked');
    // The line under the stamp follows the cost as it stands (a save, ALARM −1).
    const line = parkedLine(rolled);
    if (kept?.dataset.choice === rolled.choice) {
      settleParked(kept, { ...rolled, line });
      return kept;
    }
    kept?.remove();
    const row = el('div', `tb-parked${rolled.faces.length >= 4 ? ' many' : ''}`);
    row.dataset.choice = rolled.choice;
    const card = [...deal.root.querySelectorAll<HTMLElement>(':scope > .tb-card')].find((c) => c.dataset.id === rolled.choice);
    const tray = deal.root.querySelector<HTMLElement>(':scope > .tb-roll');
    // Where they stood in the roll's animation, so they glide to the row rather than jump.
    const before = [card, tray].map((n) => n?.getBoundingClientRect());
    if (card) {
      card.style.translate = '';
      card.classList.remove('dealt');
      row.append(card);
    }
    if (tray) {
      tray.style.left = '';
      tray.style.top = '';
      row.append(tray);
    } else if (!card?.querySelector('.qc-dice')) row.append(landedTray({ ...rolled, line }));
    queueMicrotask(() => glide([card ?? null, tray], before));
    return row;
  };
  /** FLIP: each node starts where it was (`before`) and slides to where it is now. */
  const glide = (nodes: (HTMLElement | null)[], before: (DOMRect | undefined)[]) => {
    if (o.reduced()) return;
    nodes.forEach((n, i) => {
      const b = before[i];
      if (!n || !b || !n.isConnected) return;
      const now = n.getBoundingClientRect();
      const dx = b.left - now.left;
      const dy = b.top - now.top;
      if (!dx && !dy) return;
      // The card also shrinks to its waiting size (table.css), from its top left corner.
      const scale = n.classList.contains('tb-card') && now.width > 0 && now.height > 0 ? `${b.width / now.width} ${b.height / now.height}` : '1';
      n.animate([{ translate: `${dx}px ${dy}px`, scale, transformOrigin: '0 0' }, { translate: '0 0', scale: '1', transformOrigin: '0 0' }], { duration: 350, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' });
    });
  };

  const renderCards = () => {
    info.hide();
    const a = active;
    if (!a || ended) return;
    const rolled = a.rolled && 'faces' in a.rolled ? a.rolled : null;
    // Faces change in place (a lift shouldn't re-deal): rebuild only when the set of choices changed.
    const ids = a.choices.map((c) => c.id).join('|');
    const cards = [...deal.root.querySelectorAll<HTMLElement>(':scope > .tb-card')];
    const parkedNow = deal.root.querySelector(':scope > .tb-parked') !== null;
    if (cards.map((c) => c.dataset.id).join('|') !== ids || parkedNow !== Boolean(rolled)) {
      const parked = rolled ? parkRoll(rolled) : null;
      deal.deal(a.choices.map((c): TableCard => ({ id: c.id, face: choiceFace(a, c), state: 'up' })));
      if (parked) deal.root.prepend(parked);
      for (const b of deal.root.querySelectorAll<HTMLElement>(':scope > .tb-card')) {
        b.dataset.choice = b.dataset.id;
        b.classList.toggle('cover', b.dataset.id === '!burner' || b.dataset.id === '!fall-guy');
        b.classList.toggle('pic', b.dataset.id === '!steady' || b.dataset.id === '!take');
        b.classList.toggle('art-panel', b.dataset.id === '!walk' || b.dataset.id === '!press');
        const pos = b.querySelector<HTMLElement>(':scope > .tb-face')?.dataset.pos;
        if (pos) b.dataset.pos = pos;
        b.addEventListener('mouseenter', () => o.onHover?.());
        b.addEventListener('pointerenter', () => {
          if (sel === b.dataset.id) return;
          sel = b.dataset.id ?? null;
          showSel();
          showRoute();
        });
      }
    } else {
      for (const b of cards) {
        // Only the face: a roll's dice tray and stamp (check-anim.ts) stay on the card.
        const next = choiceFace(a, a.choices.find((c) => c.id === b.dataset.id)!);
        const old = b.querySelector(':scope > .tb-face');
        if (old) old.replaceWith(next);
        else b.prepend(next);
        // A lifted card can move the position: the card's colour follows.
        if (next.dataset.pos) b.dataset.pos = next.dataset.pos;
      }
      const parked = rolled ? parkRoll(rolled) : null;
      if (parked && deal.root.firstElementChild !== parked) deal.root.prepend(parked);
    }
    // A dealt roll's costs (roll lifecycle spec §1.5, mockup cost-cards.html A) beside its waiting row, redrawn each time;
    // focus on a cost comes back to it (final review I2).
    const old = deal.root.querySelector<HTMLElement>(':scope > .tb-costs');
    const focused = old?.contains(document.activeElement) ? (document.activeElement as HTMLElement).closest<HTMLElement>('.tb-cost')?.dataset.cost : undefined;
    // Where the old row stood, for a pick's slide (below), in layout pixels: the old row stays there while it fades.
    const oldAt = old ? { left: old.offsetLeft, top: old.offsetTop, width: old.offsetWidth, focus: old.dataset.focus } : null;
    const oldCards = new Map([...(old?.querySelectorAll<HTMLElement>('.tb-cost') ?? [])].map((n) => [n.dataset.cost!, n.getBoundingClientRect()] as const));
    if (!a.costs) decoding.clear();
    // What a recruit can play on the waiting roll, before you pick (mockup graft-trace.html): under the roll, over its costs.
    deal.root.querySelector(':scope > .tb-offers')?.remove();
    const offers = offersEl(a);
    if (offers) deal.root.querySelector(':scope > .tb-parked')?.after(offers);
    if (a.costs) {
      const box = costsEl(a.costs);
      const row = deal.root.querySelector(':scope > .tb-offers') ?? deal.root.querySelector(':scope > .tb-parked');
      if (row) row.after(box);
      else deal.root.prepend(box);
      // A new row waits for the roll's card to shrink out of its way (glide, above).
      if (!old && !o.reduced()) box.animate([{ opacity: 0 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { duration: 500 });
      // A fresh pick: the cards left over fade where they stood, the picked one slides to the front (playtest).
      const pick = box.dataset.focus;
      if (old && oldAt && pick && pick !== oldAt.focus && !o.reduced()) {
        // No longer the row (a later render, a tip, a test looks for .tb-costs): a ghost of it while it fades.
        old.classList.replace('tb-costs', 'tb-costs-leaving');
        Object.assign(old.style, { left: `${oldAt.left}px`, top: `${oldAt.top}px`, width: `${oldAt.width}px` });
        old.querySelector<HTMLElement>(`.tb-cost[data-cost="${pick}"]`)?.style.setProperty('visibility', 'hidden');
        old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' }).finished.then(() => old.remove(), () => old.remove());
        const card = box.querySelector<HTMLElement>(`.tb-cost[data-cost="${pick}"]`);
        glide([card], [oldCards.get(pick)]);
        box.classList.add('tb-costs-branching');
      } else old?.remove();
      // Focus in the row stays in it: on the same card if it's still to pick, else on the first answer of a pick.
      if (focused) {
        const again = box.querySelector<HTMLElement>(`.tb-cost[data-cost="${focused}"]`);
        (again?.tabIndex === 0 ? again : box.querySelector<HTMLElement>('.tb-cost-btn:not(:disabled)'))?.focus();
      }
    } else old?.remove();
    passiveLabels(deal.root);
    showSel();
    showKeys();
    queueTrace();
  };

  /** Costs showing noise: each decodes once, when its line comes. */
  const decoding = new Set<string>();
  /** `THIS ROLL +1 · COST −1 · LEAVES 0/4`: the roll's gain, the cost and any other loss on it, and the TAKE it lands at. */
  const takeSums = (t: NonNullable<NonNullable<Active['costs']>['dealt'][number]['take']>): HTMLElement => {
    const box = el('span', 'tb-cost-take');
    if (t.earned > 0) box.append(el('span', 'gain', `THIS ROLL +${t.earned}`));
    box.append(el('span', 'loss', 'COST −1'));
    if (t.other > 0) box.append(el('span', 'loss', `ALSO −${t.other}`));
    box.append(el('span', 'after', `LEAVES ${t.after}/${t.size}`));
    return box;
  };
  /**
   * The dealt costs as cards: a free one picks; a settled one says how. A picked one stands alone at the front with its
   * answers branching off it as panels (TAKE IT, RESIST, FIREWALL), the rest out of the row until it's settled.
   */
  const costsEl = (c: NonNullable<Active['costs']>): HTMLElement => {
    const box = el('div', 'tb-costs');
    const picked = c.dealt.filter((d) => d.picked).length;
    box.append(el('div', 'tb-costs-head', `PICK ${c.pick} · ${picked} PICKED`));
    const row = el('div', 'tb-costs-row');
    const HOW = { taken: 'TAKEN', resisted: 'RESISTED', armour: 'FIREWALLED', ability: 'CANCELLED' } as const;
    // One send per show (final review I3): a double click or a second card before the pick shows sends nothing more.
    const send = (choice: string, cost: (typeof c.dealt)[number]['cost']) => (e: Event) => {
      e.stopPropagation();
      if (costSent || heldBy !== null) return;
      costSent = true;
      o.tips?.clear();
      o.cue?.(choice === '!take' ? 'take' : choice === '!resist' ? 'resist' : choice === '!armour' ? 'firewall' : 'confirm');
      o.onChoose(choice, { card: cost });
    };
    const costCard = (d: (typeof c.dealt)[number]) => {
      const card = el('div', `tb-cost${d.picked ? ' picked' : ''}${d.settled ? ' settled' : ''}`);
      card.dataset.cost = d.cost;
      // The GM's line is on its way: noise stands in, so the words never change under the reader, and it decodes once.
      const held = c.writing && !d.picked;
      const line = held ? el('span', 'tb-cost-line wait') : el('span', `tb-cost-line${d.by === 'gm' ? ' gm' : ''}`, d.line);
      if (held) {
        decoding.add(d.cost);
        if (o.reduced()) line.textContent = noise(WAIT_CHARS);
        else scrambleIn(line);
      } else if (decoding.delete(d.cost) && !d.picked && !o.reduced()) decodeIn(line, d.line);
      card.append(el('span', 'tb-cost-tag', d.tag), line);
      // TAKE −1's sums (2026-11-08, playtest): at TAKE 0 an unmoving meter read as free; it takes back what this roll earned.
      if (d.take && (!d.settled || d.settled === 'taken')) card.append(takeSums(d.take));
      if (d.first) card.append(el('span', 'tb-cost-first', `${active?.hand?.approach.toUpperCase() ?? ''} FIRST`));
      return card;
    };
    const open = c.dealt.find((d) => d.picked && !d.settled);
    if (open) {
      box.dataset.focus = open.cost;
      row.classList.add('focus');
      row.append(costCard(open));
      const panel = (cls: string, words: string, choice: string, small: string) => {
        const b = el('button', `tb-cost-btn tb-cost-panel ${cls}`);
        b.type = 'button';
        b.append(el('span', 'tb-cost-panel-word', words), el('small', '', small));
        b.addEventListener('click', send(choice, open.cost));
        row.append(b);
        return b;
      };
      panel('take', 'TAKE IT', '!take', 'IT HAPPENS');
      const resist = panel('resist', 'RESIST', '!resist', `EDGE ${'●'.repeat(c.resist.dice)} · 0–2 NERVE`);
      resist.disabled = !c.resist.ok;
      if (c.resist.why) setTip(resist, c.resist.why);
      // FIREWALL (programs spec §2.3): from a free slot, or loaded; an old run's holding deck as before.
      if (c.armour.ok) panel('armour', 'FIREWALL', '!armour', c.armour.load ? `LOAD FIREWALL · 1 SLOT · ${HOT_LOAD_NERVE} NERVE` : active?.hand?.pockets ? `FIREWALL LOADED · ${c.armour.left} LEFT` : `DECK HOLDS · ${c.armour.left} LEFT`);
      // On the wire nothing shields you (2026-11-08): it's there, but off, and says why.
      else if (c.armour.why) {
        const off = panel('armour', 'FIREWALL', '!armour', `${c.armour.why} · NOTHING SHIELDS YOU`);
        off.disabled = true;
        setTip(off, c.armour.why);
      }
      box.append(row);
      return box;
    }
    // The approach's own cost is the only first pick while FORCED_FIRST holds (approach shapes spec §1).
    const forced = c.dealt.some((d) => d.first);
    for (const d of c.dealt) {
      const card = costCard(d);
      if (d.settled) {
        const nerve = d.settled === 'resisted' && d.nerve !== undefined ? (d.nerve > 0 ? ` · −${d.nerve} NERVE` : d.nerve < 0 ? ' · +1 NERVE' : ' · FREE') : '';
        const how = el('span', 'tb-cost-how', `${HOW[d.settled]}${nerve}`);
        if (d.faces) how.append(el('span', 'tb-cost-dice', d.faces.join(' ')));
        card.append(how);
      } else if (picked < c.pick && (!forced || d.first)) {
        card.classList.add('pickable');
        card.tabIndex = 0;
        card.setAttribute('role', 'button');
        card.addEventListener('click', send('!cost', d.cost));
        // Enter or Space picks a focused card (final review I2).
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            send('!cost', d.cost)(e);
          }
        });
      } else if (forced) card.classList.add('waits');
      row.append(card);
    }
    box.append(row);
    return box;
  };

  /**
   * The offer box: each AFTER A ROLL ability a recruit can play on the waiting roll now, with whose it is, what it does
   * and a PLAY key (the chip on their row does the same). Null with no roll waiting or nothing to play.
   */
  const offersEl = (a: Active): HTMLElement | null => {
    if (!a.rolled || isPhone(host)) return null;
    const can = (a.hand?.people ?? []).flatMap((p) => p.abilities.filter((x) => x.timing === 'after' && x.playable).map((x) => ({ p, x })));
    if (can.length === 0) return null;
    const box = el('div', 'tb-offers');
    box.append(el('div', 'tb-offers-head', 'BEFORE YOU PICK'));
    for (const { p, x } of can) {
      const card = `${p.id}/${x.id}`;
      const offer = el('div', 'tb-offer');
      offer.dataset.card = card;
      offer.dataset.who = p.id;
      const play = el('button', 'tb-offer-play', 'PLAY');
      play.type = 'button';
      play.setAttribute('aria-label', `Play ${x.label}`);
      play.addEventListener('click', () => {
        if (heldBy !== null) return;
        o.cue?.('ability');
        o.onChoose('!after', { card });
      });
      offer.append(el('span', 'tb-offer-who', `${p.name.split(' ')[0].toUpperCase()}${x.nerve ? ` · ${x.nerve} NERVE` : ''}`), el('div', 'tb-offer-name', x.label), el('div', 'tb-offer-words', x.words), play);
      box.append(offer);
    }
    return box;
  };

  const render = () => {
    const a = active!;
    lastClocks = { ...(a.take ? { take: a.take } : {}), alarm: a.alarm ?? 0, ...(a.nerve ? { nerve: a.nerve } : {}) };
    showClocks();
    head.replaceChildren(el('span', 'tb-title', a.title.toUpperCase()));
    if (a.choices.some((c) => c.id === '!burner' || c.id === '!fall-guy')) head.append(el('span', 'tb-flag red', 'BLOWN'));
    if (a.push) head.append(el('span', 'tb-flag', `PRESS ON?${a.push.pot > 0 ? ` · POT +${a.push.pot} SOL` : ''}`));
    if (a.getaway) head.append(el('span', 'tb-flag red', 'GET OUT'));
    else if (allBlow(a)) head.append(el('span', 'tb-flag red blows', 'A MISS BLOWS IT'));
    // HEAT in the job's district, the pay range, a push's pot (the table spec §4).
    strip.replaceChildren(
      el('span', 'tb-heat', `HEAT ${a.heat ?? 0}`),
      ...(a.pay && a.pay[1] > 0 ? [el('span', 'tb-pay', `PAY ${a.pay[0] === a.pay[1] ? a.pay[0] : `${a.pay[0]}–${a.pay[1]}`} SOL`)] : []),
      ...(a.push && a.push.pot > 0 ? [el('span', 'tb-pot', `POT +${a.push.pot} SOL`)] : []),
    );
    // The quest's picture, muted above its title.
    if (a.art && art.getAttribute('src') !== a.art) art.src = a.art;
    art.hidden = !a.art;
    const canPush = (a.nerve?.left ?? 0) >= PUSH_NERVE && a.choices.some((c) => c.pool && !c.red);
    if (!canPush) pushMode = null;
    showClocks();
    pushBtn.hidden = !canPush;
    showPush();
    showTrade();
    // A blown job waiting on cover (USE BURNER / TAKE IT) plays nothing from the hand: it steps away, as at the debrief,
    // so the BLOWN preview below the cards has the room (playtest: it ran under the hand).
    hand.root.hidden = !a.hand || Boolean(a.blown);
    settleFan();
    if (a.hand) {
      hand.show(handGroups(a.hand, (a.nerve?.left ?? 0) - (pushMode ? PUSH_NERVE : 0), progState()), { dealIn: dealtFor !== a.id && !o.reduced() });
      dealtFor = a.id;
    }
    showTray();
    extra.replaceChildren(...(a.blown ? [debriefEl(a.blown.debrief, { cue: () => {}, reduced: true })] : []));
    showPost();
    renderCards();
    placeLevers();
    showRoute();
  };

  return {
    root: shell.root,
    show(a, story) {
      // The job forked and this beat is down one of its two ways: the points thrown.
      if (active && active.id === a.id && !ended && forkWay(active) === null && forkWay(a) !== null) graftCue('fork');
      const fresh = !active || active.id !== a.id || active.beat !== a.beat || ended;
      // A new job starts with nothing lifted, PUSH off and no trade.
      if (!active || active.id !== a.id) {
        pushMode = null;
        trade = null;
        hand.drop();
      }
      // Marked programs are for this beat's roll (programs spec §2.1): a new beat or job clears them.
      if (fresh) {
        postArmed = false;
        postMark = null;
        progLoad = [];
        progRun = [];
        fan = null;
      }
      if (fresh) sel = null;
      if (!a.costs) costAt = 0;
      pickSent = false;
      active = a;
      ended = false;
      costSent = false;
      lit = null;
      close.remove();
      if (fresh) {
        deal.clear();
        o.tips?.clear();
      }
      shell.prose(story ?? '');
      const prose = shell.root.querySelector<HTMLElement>('.tb-prose')!;
      passiveLabels(prose);
      markLore(prose);
      shell.open();
      o.onUp?.(true);
      render();
      showBoard(a);
      showAccounts(a);
      shell.publishLog();
      publishHand();
      o.tips?.offer(tipsFor(a), shell.root);
    },
    end(title, story, node, clocks) {
      info.hide();
      ended = true;
      // The post goes with the beat (routes and posts spec §2): nothing to send anyone to at a debrief.
      showPost();
      showBoard(null);
      showAccounts(null);
      // The debrief and CLOSE never hold (review I1): her closing line can run while you read it.
      applyHold();
      fan = null;
      showTray();
      lit = null;
      // The clocks stay as the job ended (mockup graft-results.html D): the debrief's word on the last roll, NERVE as last shown.
      shell.corners({ ...lastClocks, ...(clocks?.take ? { take: clocks.take } : {}), ...(clocks?.alarm !== undefined ? { alarm: clocks.alarm } : {}) });
      lastClocks = {};
      head.replaceChildren(el('span', 'tb-title', title.toUpperCase()), el('span', 'tb-flag', 'THE END'));
      strip.replaceChildren();
      art.hidden = true;
      shell.prose(story);
      pushBtn.hidden = true;
      tradeBox.hidden = true;
      hand.root.hidden = true;
      placeLevers();
      showRoute();
      extra.replaceChildren();
      (isPhone(host) ? extra : shell.levers!).append(close);
      deal.deal([{ id: '!debrief', face: node, state: 'up' }]);
      const card = deal.root.querySelector('.tb-card');
      card?.classList.add('tb-debrief');
      // A blown job's debrief is stamped with the seal.
      if (node.classList.contains('db-blown')) card?.append(piece('blown', 'tb-seal'));
      shell.open();
      o.onUp?.(true);
      queueTrace();
      showKeys();
      o.tips?.clear();
      o.tips?.offer(['debrief'], shell.root);
    },
    pick(choice, text) {
      lit = { choice, text };
      renderCards();
    },
    clearPick() {
      if (!lit) return;
      lit = null;
      renderCards();
    },
    close() {
      if (!shell.root.hidden) o.cue?.('clear');
      active = null;
      ended = false;
      showBoard(null);
      showAccounts(null);
      fan = null;
      showTray();
      o.tips?.clear();
      shell.close();
      o.onUp?.(false);
      drawTrace();
    },
    isOpen: () => !shell.root.hidden,
    accountsSay(text, by) {
      if (!aboard || aboard.root.hidden) return false;
      aboard.say(text, by);
      return true;
    },
    boardSay(text) {
      if (!dboard || dboard.root.hidden) return false;
      dboard.say(text);
      return true;
    },
    hold(name) {
      heldBy = name;
      applyHold();
      showKeys();
    },
    key,
    ended: () => ended && !shell.root.hidden,
  };
}
