/**
 * A job on the table (the hand spec §5): the beat's choices dealt as cards, your hand along the bottom, TAKE,
 * ALARM and NERVE in the corners. Lift a card from the hand and every choice shows what it would do there; click a
 * choice to roll it with the card (and PUSH, if it's on). STEADY / TAKE IT, the getaway, the cover cards, WALK /
 * PRESS ON and the debrief deal here too. Story quests stay on the quest panel.
 */
import { deckNotes, EFFECT_NAMES, POSITION_NAMES, PRESS_NERVE, PUSH_NERVE, tradeRefusal, type Effect, type Pool, type Position, type PushMode, type Trade } from '../../../../shared/dice';
import type { Debrief, ProgramPreview, QuestState } from '../../../../shared/types';
import { debriefEl } from '../debrief';
import { landedTray, settleParked } from '../check-anim';
import { parkedLine } from '../job-moment';
import { passiveLabels } from '../../ui/passive';
import { markLore } from '../../ui/lore-hover';
import { cardEl, mountDeal, trayHead, type TableCard } from './deal';
import { el, isPhone, type TableCue } from './el';
import { mountHand, type HandGroup } from './hand';
import { abilityFace, artFace, backFace, contactFace, crewFace, deckLabel, programFace, slotFace } from './faces';
import { abilityCard as abilityOf, MAX_CONTACTS } from '../../../../shared/hand';
import { HOT_LOAD_NERVE } from '../../../../shared/programs';
import { abilityInfo, choiceInfo, contactInfo, favourInfo, mountCardInfo, plainInfo, programInfo, recruitInfo, slotInfo, type Info } from './card-info';
import { programsOn, previewText, tradedSide, type Marked, type Side } from './preview';
import { mountTableShell, piece, type TableShell } from './shell';
import type { TipId, Tips } from './tips';

type Active = NonNullable<QuestState['active']>;
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
    ...(checked ? (['roll', 'position'] as const) : []),
    ...(effect ? (['effect'] as const) : []),
    ...(a.take ? (['take'] as const) : []),
    'alarm',
    'nerve',
    ...(callable ? (['call'] as const) : []),
    ...(loadable(a) ? (['program'] as const) : []),
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
    const note = !callable ? 'PLAYS AT THE END' : p.free > 0 ? '1 FREE' : `AGAIN · RISK 1 IN ${p.risk}`;
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
  return { play, why, pos, tier, effect, lacquer, nerve, on };
}

/**
 * A checked choice's face (mockup call-cards.html, D): its position's picture down the left, then (into the body it
 * returns, after the line the caller puts first) the flags row, the tray of dice by source with the count, and its
 * sources as tabs hanging off the foot. A lifted card shows what it would do: its dice blink in, the position moves.
 * The pool also reads as words for screen readers (`.tb-odds`).
 */
function callFace(f: HTMLElement, pool: NonNullable<Choice['pool']>, lifted: string | null, play0: Side | undefined, mod: { trade: Trade | null; push: PushMode | null; prog?: ProgMod } = { trade: null, push: null }): HTMLElement {
  const base = pool.base ?? Math.max(0, pool.dice - pool.parts.reduce((n, x) => n + x.dice, 0));
  const { play, why, pos, tier, effect, lacquer, nerve } = cardState(pool, lifted, play0, mod);
  f.classList.add('tb-call');
  f.classList.toggle('none', (Boolean(lifted) && !play) || why !== null);
  f.dataset.pos = pos;
  const side = el('span', 'tb-side');
  side.append(piece(pos, 'tb-pos'), el('span', 'tb-side-word', POS_WORD[pos]));
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
  if (more > 0) tray.append(cells(more, 'k-people lift'));
  if (more < 0) tray.append(cells(-more, 'minus'));
  const sum = el('span', 'tb-sum', String(play?.dice ?? pool.dice));
  sum.append(el('small', '', 'D'));
  tray.append(sum);
  const foot = el('span', 'tb-foot');
  foot.append(flags, tray);
  if (effect) foot.append(el('span', `tb-eff ${effect}`, EFFECT_NAMES[effect]));
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
function plainFace(f: HTMLElement, noCard: boolean, noRoll: boolean): HTMLElement {
  f.classList.add('tb-plain');
  f.classList.toggle('none', noCard);
  const body = el('span', 'tb-main');
  const flags = el('span', 'tb-flags');
  if (noCard) flags.append(el('span', 'tb-tag', 'NO CARD HERE'));
  const foot = el('span', 'tb-foot');
  foot.append(flags);
  // Where a call card has its dice: a choice that rolls nothing says so.
  if (noRoll) foot.append(el('span', 'tb-noroll', 'NO ROLL'));
  body.append(foot);
  f.append(body);
  return body;
}

export function mountJobTable(host: HTMLElement, o: { onChoose(choice: string, o: { push?: PushMode; trade?: Trade; card?: string; press?: string; programs?: { load: string[]; run: string[] }; said?: string }): void; onTalk(text: string): void; onHover?(): void; cue?(name: TableCue): void; reduced(): boolean; tips?: Tips }): JobTable {
  const shell = mountTableShell(host, { hud: true });
  shell.root.classList.add('tb-job');
  let active: Active | null = null;
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
    pushBtn.title = `PUSH ${pushMode === 'effect' ? '+EFFECT' : '+1D'} · ${PUSH_NERVE} NERVE`;
    pushBtn.setAttribute('aria-label', pushBtn.title);
  };
  showPush();
  // Turning PUSH on or off changes what a press can pay for: the hand and the cards follow.
  const remod = () => {
    settleFan();
    if (active?.hand) hand.show(handGroups(active.hand, (active.nerve?.left ?? 0) - (pushMode ? PUSH_NERVE : 0), progState()), { dealIn: false });
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
      b.title = off ? whys[0]! : b.dataset.hint!;
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
  shell.middle.append(extra);
  // The JOB column (job-column.ts) stands in the log region while this table is up: its place, as layout pixels on the
  // stage (offsets, so the stage's zoom doesn't enter), for job-column.css.
  const publishLog = () => {
    const log = shell.log!;
    if (shell.root.hidden) return;
    host.style.setProperty('--hud-log-x', `${shell.root.offsetLeft + log.offsetLeft}px`);
    host.style.setProperty('--hud-log-y', `${shell.root.offsetTop + log.offsetTop}px`);
    host.style.setProperty('--hud-log-w', `${log.offsetWidth}px`);
    host.style.setProperty('--hud-log-h', `${log.offsetHeight}px`);
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(publishLog).observe(shell.log!);
  let lastClocks: Parameters<TableShell['corners']>[0] = {};
  const close = el('button', 'tb-close', 'CLOSE');
  close.type = 'button';
  close.addEventListener('click', () => {
    ended = false;
    o.tips?.clear();
    shell.close();
  });
  /** What the lifted card, and a press beside it, would make this choice's roll; none: they can't play here (or nothing's lifted). */
  const playOn = (c: Choice | undefined) => {
    const lifted = hand.lifted();
    const play = lifted ? c?.plays?.[lifted] : undefined;
    const press = hand.press();
    return press ? play?.presses?.[press] : play;
  };
  const hand = mountHand(shell.bottom, {
    // A lifted card can change which programs fit, so the deck follows it.
    onLift: () => {
      if (active?.hand?.pockets) return remod();
      showTrade();
      renderCards();
    },
    // An AFTER A ROLL ability on the parked roll plays at once (crew abilities spec §2).
    onTap: (card) => {
      if (progTap(card)) return;
      o.cue?.('confirm');
      o.onChoose('!after', { card });
    },
    cue: o.cue,
  });
  shell.levers!.append(pushBtn, tradeBox);

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
    if (!a || ended || id.startsWith('!debrief') || performance.now() - trayShutAt < TRAY_GUARD_MS) return;
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
    o.cue?.('confirm');
    o.onChoose(id, { ...(push ? { push } : {}), ...(traded ? { trade: traded } : {}), ...(card ? { card } : {}), ...(press ? { press } : {}), ...(load.length || run.length ? { programs: { load, run } } : {}), ...(said !== undefined ? { said } : {}) });
  };

  /** What the marked programs do on a choice (programs spec §2.1): their kinds' steps and the lacquer's ALARM. */
  const progOn = (c: Choice): ProgMod | undefined => {
    const on = [...progLoad, ...progRun].filter((p) => fitsOn(c, p));
    if (!on.length) return undefined;
    const kinds = active?.hand?.pockets?.catalog ?? [];
    const kind = (p: string) => kinds.find((x) => x.id === p)?.kind;
    const previews = on.map((p) => previewsOn(c)![p] as Exclude<ProgramPreview, { why: string }>);
    const name = (p: string) => kinds.find((x) => x.id === p)?.name;
    return { on: on.map((p, i) => ({ name: name(p), kind: kind(p)!, ...(previews[i].tier ? { tier: previews[i].tier } : {}), alarm: previews[i].alarm, load: progLoad.includes(p) })), from: previews.find((x) => x.effect)?.effect };
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
    return choiceInfo({ pool: c.pool, state: { dice: s.play?.dice ?? c.pool.dice, position: s.pos, effect: s.effect, tier: s.tier, lacquer: s.lacquer, nerve: s.nerve, ran: s.on.ran.flatMap((x) => (x.name ? [x.name] : [])), extra, why: s.why ?? (lifted && !play0 ? 'NO CARD HERE' : null) }, ...(a.tier ? { tierOf: a.tier } : {}), ...(c.alarm ? { route: c.alarm } : {}), ...(c.red ? { red: true } : {}) });
  };
  const info = mountCardInfo(shell.root, infoOf);

  /** A choice's face: its line, its pool (or the lifted card's preview), its flags, and a held line's buttons. */
  const choiceFace = (a: Active, c: Choice): HTMLElement => {
    const f = el('span', 'tb-face');
    // After a costly roll, STEADY and TAKE IT are picture cards: the price (`STEADY (2 NERVE)`) on the chip.
    if (c.id === '!steady' || c.id === '!take') {
      const price = /\((\d+) NERVE\)/.exec(c.line)?.[1];
      f.append(c.id === '!steady' ? artFace('steady', 'STEADY', ['NO ALARM, NO HEAT'], price ? `${price} NERVE` : undefined) : artFace('take', 'TAKE IT', ['THE COST LANDS']));
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
    const body = c.pool ? callFace(f, c.pool, lifted, playOn(c), faceMod(c)) : plainFace(f, lifted !== null && !c.id.startsWith('!'), !c.id.startsWith('!') && !c.crack);
    body.prepend(el('span', 'tb-line', c.line));
    // The route's own ALARM lands on the pick, whatever the dice: shown first among the flags.
    if (c.alarm) body.querySelector('.tb-flags')?.prepend(el('span', 'tb-tag route', `ALARM +${c.alarm}`));
    const flags = body.querySelector<HTMLElement>('.tb-flags')!;
    if (c.red) flags.append(el('span', 'tb-flag red', 'ONE SHOT'));
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
      n.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 350, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' });
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
      for (const b of deal.root.querySelectorAll<HTMLElement>('.tb-card')) {
        b.dataset.choice = b.dataset.id;
        b.classList.toggle('cover', b.dataset.id === '!burner' || b.dataset.id === '!fall-guy');
        b.classList.toggle('pic', b.dataset.id === '!steady' || b.dataset.id === '!take');
        b.classList.toggle('art-panel', b.dataset.id === '!walk' || b.dataset.id === '!press');
        const pos = b.querySelector<HTMLElement>(':scope > .tb-face')?.dataset.pos;
        if (pos) b.dataset.pos = pos;
        b.addEventListener('mouseenter', () => o.onHover?.());
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
    if (a.costs) {
      const box = costsEl(a.costs);
      const row = deal.root.querySelector(':scope > .tb-parked');
      if (row) row.after(box);
      else deal.root.prepend(box);
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
      if (costSent) return;
      costSent = true;
      o.tips?.clear();
      o.cue?.('confirm');
      o.onChoose(choice, { card: cost });
    };
    const costCard = (d: (typeof c.dealt)[number]) => {
      const card = el('div', `tb-cost${d.picked ? ' picked' : ''}${d.settled ? ' settled' : ''}`);
      card.dataset.cost = d.cost;
      card.append(el('span', 'tb-cost-tag', d.tag), el('span', `tb-cost-line${d.by === 'gm' ? ' gm' : ''}`, d.line));
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
      if (c.resist.why) resist.title = c.resist.why;
      // FIREWALL (programs spec §2.3): from a free slot, or loaded; an old run's holding deck as before.
      if (c.armour.ok) panel('armour', 'FIREWALL', '!armour', c.armour.load ? `LOAD FIREWALL · 1 SLOT · ${HOT_LOAD_NERVE} NERVE` : active?.hand?.pockets ? `FIREWALL LOADED · ${c.armour.left} LEFT` : `DECK HOLDS · ${c.armour.left} LEFT`);
      box.append(row);
      return box;
    }
    for (const d of c.dealt) {
      const card = costCard(d);
      if (d.settled) {
        const nerve = d.settled === 'resisted' && d.nerve !== undefined ? (d.nerve > 0 ? ` · −${d.nerve} NERVE` : d.nerve < 0 ? ' · +1 NERVE' : ' · FREE') : '';
        const how = el('span', 'tb-cost-how', `${HOW[d.settled]}${nerve}`);
        if (d.faces) how.append(el('span', 'tb-cost-dice', d.faces.join(' ')));
        card.append(how);
      } else if (picked < c.pick) {
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
      }
      row.append(card);
    }
    box.append(row);
    return box;
  };

  const render = () => {
    const a = active!;
    lastClocks = { ...(a.take ? { take: a.take } : {}), alarm: a.alarm ?? 0, ...(a.nerve ? { nerve: a.nerve } : {}) };
    shell.corners(lastClocks);
    head.replaceChildren(el('span', 'tb-title', a.title.toUpperCase()));
    if (a.choices.some((c) => c.id === '!burner' || c.id === '!fall-guy')) head.append(el('span', 'tb-flag red', 'BLOWN'));
    if (a.push) head.append(el('span', 'tb-flag', `PRESS ON?${a.push.pot > 0 ? ` · POT +${a.push.pot} SOL` : ''}`));
    if (a.getaway) head.append(el('span', 'tb-flag red', 'GET OUT'));
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
    pushBtn.hidden = !canPush;
    showPush();
    showTrade();
    hand.root.hidden = !a.hand;
    settleFan();
    if (a.hand) {
      hand.show(handGroups(a.hand, (a.nerve?.left ?? 0) - (pushMode ? PUSH_NERVE : 0), progState()), { dealIn: dealtFor !== a.id && !o.reduced() });
      dealtFor = a.id;
    }
    showTray();
    extra.replaceChildren(...(a.blown ? [debriefEl(a.blown.debrief, { cue: () => {}, reduced: true })] : []));
    renderCards();
  };

  return {
    root: shell.root,
    show(a, story) {
      const fresh = !active || active.id !== a.id || active.beat !== a.beat || ended;
      // A new job starts with nothing lifted, PUSH off and no trade.
      if (!active || active.id !== a.id) {
        pushMode = null;
        trade = null;
        hand.drop();
      }
      // Marked programs are for this beat's roll (programs spec §2.1): a new beat or job clears them.
      if (fresh) {
        progLoad = [];
        progRun = [];
        fan = null;
      }
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
      render();
      publishLog();
      o.tips?.offer(tipsFor(a), shell.root);
    },
    end(title, story, node, clocks) {
      info.hide();
      ended = true;
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
      extra.replaceChildren();
      (isPhone(host) ? extra : shell.levers!).append(close);
      deal.deal([{ id: '!debrief', face: node, state: 'up' }]);
      const card = deal.root.querySelector('.tb-card');
      card?.classList.add('tb-debrief');
      // A blown job's debrief is stamped with the seal.
      if (node.classList.contains('db-blown')) card?.append(piece('blown', 'tb-seal'));
      shell.open();
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
      active = null;
      ended = false;
      fan = null;
      showTray();
      o.tips?.clear();
      shell.close();
    },
    isOpen: () => !shell.root.hidden,
    ended: () => ended && !shell.root.hidden,
  };
}
