/**
 * A card in words: rest the pointer on a table card (or long-press it on a phone) and a panel beside it spells out what
 * the card does now. It waits out a dwell, so a click never brings it up. The text is built when it opens, from the same
 * values the card's face draws.
 */
import { GRADES, type Grade, type Specialty } from '../../../../shared/crew-book';
import { APPROACH_COSTS, COSTS, picksFor } from '../../../../shared/costs';
import { deckNotes, EFFECT_NAMES, kindResult, POSITION_NAMES, type Effect, type Pool, type Position } from '../../../../shared/dice';
import { APPROACH_STATS, SPEC_STAT, type Approach } from '../../../../shared/hand';
import { HOT_LOAD_NERVE, type ProgramKind } from '../../../../shared/programs';
import { el } from './el';

export type Info = { title: string; lines: string[] };

/** How long the pointer rests on a card before its panel opens, and a long press on a phone. */
export const DWELL_MS = 700;
export const HOLD_MS = 450;
/** A touch that moves further than this is a drag, not a press. */
const SLOP_PX = 10;
/** After a click the pointer must move this far before a card under it can open: a click redraws cards, and a card drawn under a still pointer counts as hovered. */
const STILL_PX = 4;
/** The most costs a roll deals (roll lifecycle spec §1.2). */
const DEALT = 3;

const routeLine = (n: number) => `This route: ALARM +${n}, whatever the dice.`;
const fills = (effect: Effect, position: Position) => {
  const take = (k: 'crit' | 'clean' | 'cost') => kindResult(k, position, effect).take;
  return `${EFFECT_NAMES[effect]}: a crit fills ${take('crit')} TAKE, a 6 fills ${take('clean')}, a 4–5 fills ${take('cost')}.`;
};
const costs = (p: Position) => {
  const n = (k: 'cost' | 'miss') => picksFor(k, p, DEALT);
  const cost = n('cost');
  const pick = cost ? `a 4–5 makes you pick ${cost} cost${cost > 1 ? 's' : ''}, a miss ${n('miss')}` : `a 4–5 costs nothing, a miss makes you pick ${n('miss')}`;
  return `${POSITION_NAMES[p]}: ${pick}.`;
};
/** What matches tier `t`: `HAND`, `Q2`. */
const gradeFor = (t: number) => GRADES[t - 1];

/** A checked choice as it would roll: `state` is what the card's face resolved, `pool` its parts. */
export function choiceInfo(o: {
  pool: Pool;
  state: { dice: number; position: Position; effect?: Effect; tier?: Pool['tier']; lacquer: number; nerve: number; ran: string[]; extra: string[]; why: string | null };
  tierOf?: number;
  route?: number;
  red?: boolean;
}): Info {
  const { pool, state: s } = o;
  const base = pool.base ?? Math.max(0, pool.dice - pool.parts.reduce((n, x) => n + x.dice, 0));
  const parts = [...pool.parts.map((x) => `${x.dice > 0 ? '+' : '−'}${x.label}`), ...s.extra.map((x) => `+${x}`)];
  const lines = [`${[`${pool.stat} ${base}`, ...parts].join(' ')}. ${s.dice >= 1 ? 'Keep the highest.' : 'No dice: roll two, keep the lower.'}`, costs(s.position)];
  if (s.effect) lines.push(fills(s.effect, s.position));
  if (s.tier?.lifted) lines.push(`Tier cut lifted by ${s.tier.label}.`);
  else if (s.tier?.label === 'ANGLE NEEDS CREW') lines.push(`You know something here. Any recruit on this card lifts the tier cut; a ${gradeFor(o.tierOf ?? 2)} adds a step of effect too.`);
  else if (s.tier) lines.push(`${s.tier.label}: a ${gradeFor(o.tierOf ?? 2)} recruit called on this roll lifts it, or a Q${o.tierOf ?? 2}+ deck running a program or on a grid roll.`);
  const moved = (pool.effectParts ?? []).filter((x) => !x.label.startsWith('TIER '));
  if (moved.length) lines.push(`Effect moved by ${moved.map((x) => `${x.label} ${x.step > 0 ? '+1' : '−1'}`).join(', ')}.`);
  const notes = deckNotes(pool);
  if (notes.length) lines.push(`Deck: ${notes.join(' · ')}.`);
  if (s.ran.length) lines.push(`Runs ${s.ran.join(', ')}.`);
  if (s.lacquer) lines.push(`The lacquer notices: ALARM +${s.lacquer}.`);
  if (s.nerve) lines.push(`Loading costs ${s.nerve} NERVE.`);
  if (o.route) lines.push(routeLine(o.route));
  if (o.red) lines.push('One shot: no PUSH, no programs.');
  if (s.why) lines.push(`Can't go: ${s.why}.`);
  return { title: `${pool.stat} · ${s.dice} DICE`, lines };
}

/** A choice with no roll: a crack, or a route with its own ALARM; null: the card says it all. */
export function plainInfo(c: { crack?: { length: number; tries: number; take?: number }; alarm?: number }, takes: boolean): Info | null {
  if (c.crack) return { title: 'CRACK', lines: [`A terminal: ${c.crack.length}-letter words, ${c.crack.tries} tries. ${takes ? `A win fills ${c.crack.take ?? 2} TAKE, a lockout raises ALARM.` : 'A lockout raises ALARM.'}`, ...(c.alarm ? [routeLine(c.alarm)] : [])] };
  return c.alarm ? { title: 'THIS ROUTE', lines: [routeLine(c.alarm)] } : null;
}

const specLine = (spec: Specialty) => {
  const own = SPEC_STAT[spec];
  return own ? `On ${own.toUpperCase()}: a step out of danger (+1d if you’re already in the dark). Elsewhere +1d.` : 'Plays at the end: TAKE +1, unless the job blew or went to GET OUT. Fences don’t stack.';
};
const here = (plays: string[] | undefined) => (plays ?? []).map((x) => `Here: ${x}`);

/** A recruit's card, at SETUP or in the hand: `plays` are their pools on this beat's choices. */
export function recruitInfo(r: { name: string; spec: Specialty; grade: Grade; traits: { label: string; good: boolean }[] }, o: { tier?: number; free?: number; risk?: number | null; down?: boolean; plays?: string[] }): Info {
  const lines = [specLine(r.spec)];
  if ((o.tier ?? 1) >= 2 && SPEC_STAT[r.spec]) lines.push(r.grade + 1 >= o.tier! ? 'Lifts the tier cut on the roll you call them on.' : `Below tier ${o.tier}: only ${gradeFor(o.tier!)} or better lifts the cut.`);
  for (const t of r.traits) lines.push(`${t.good ? '+' : '−'} ${t.label}`);
  if (o.down) lines.push('Down: out of this job.');
  else if (o.free) lines.push(`${o.free} free call${o.free > 1 ? 's' : ''}.`);
  else if (o.risk) lines.push(`Called again: on a miss, a 1 in ${o.risk} risk to them.`);
  return { title: `${r.name} · ${r.spec} · ${GRADES[r.grade]}`.toUpperCase(), lines: [...lines, ...here(o.plays)] };
}

/** An ability's card: its words, and what a press costs. */
export const abilityInfo = (a: { label: string; words: string; nerve: number; used?: boolean }, plays?: string[]): Info => ({ title: a.label.toUpperCase(), lines: a.used ? [a.words, 'Played.'] : [a.words, ...(a.nerve ? [`A press costs ${a.nerve} NERVE.`] : []), ...here(plays)] });
/** A contact card: their trade, played once. */
export const contactInfo = (c: { name: string; spec: Specialty; used: boolean }, plays?: string[]): Info => ({ title: c.name.toUpperCase(), lines: [specLine(c.spec), c.used ? 'Played.' : 'Plays once, free. Blow the job after and they trust you less.', ...here(plays)] });
export const GOES_WRONG: Record<Approach, string> = {
  quiet: 'Nothing gets broken, but you get heard.',
  smooth: 'The lie gets harder to hold.',
  hard: "You're already loud. You break what you came for.",
};
/** An approach's card at SETUP (approach shapes spec §1). */
export const approachInfo = (a: Approach): Info => ({
  title: a.toUpperCase(),
  lines: [`+1d on ${APPROACH_STATS[a].map((s) => s.toUpperCase()).join(' · ')}.`, `Never dealt ${COSTS[APPROACH_COSTS[a].never].tag}. ${COSTS[APPROACH_COSTS[a].first].tag} comes first.`, GOES_WRONG[a]],
});

export const favourInfo = (plays?: string[], used = false): Info => ({ title: 'THE FAVOUR', lines: used ? ['Used.'] : ['+1d, once.', ...here(plays)] });

const KIND_WORDS: Record<ProgramKind, string> = { position: 'a step out of danger', effect: 'a step more effect', quiet: 'takes 1 off the heat you leave with', firewall: 'cancels one cost' };

/** A program's card: what it does, how it stands against the tier, and `plays`, where it would run on this beat. */
export function programInfo(p: { name: string; stat: string; kind: ProgramKind; line: string }, o: { tier?: number; quality?: number; plays?: string[]; nerve?: number; dead?: boolean; burned?: boolean }): Info {
  if (o.dead) return { title: p.name, lines: [p.line, 'The deck is dead: nothing runs.'] };
  if (o.burned) return { title: p.name, lines: [p.line, 'Burned: used up on this job.'] };
  const lines = [p.line, `${p.stat === 'any' ? 'Any roll' : `On ${p.stat.toUpperCase()}`}: ${KIND_WORDS[p.kind]}.`];
  const lifts = p.kind === 'position' || p.kind === 'effect';
  if (o.tier !== undefined && o.quality !== undefined) {
    if (o.quality < o.tier) lines.push(`Below the job’s tier: each run costs ALARM +1${lifts ? ', and it lifts no cut' : ''}.`);
    else if (lifts && o.tier >= 2) lines.push('Lifts the tier cut on any roll it runs on.');
  }
  if (o.nerve) lines.push(`Loading mid-job costs ${o.nerve} NERVE.`);
  return { title: p.name, lines: [...lines, ...here(o.plays)] };
}

/** An empty program slot. */
export const slotInfo = (o: { setup: boolean; dead?: boolean }): Info => ({ title: 'LOAD', lines: [o.dead ? 'The deck is dead: nothing loads.' : o.setup ? 'Load a program here, free.' : `Load a program mid-job: ${HOT_LOAD_NERVE} NERVE.`] });

/**
 * The panel on `root`: `lookup` says what a card (a `button[data-id]`) shows, read when the panel opens. `hide` closes it
 * and drops a dwell under way, for a table that's changing.
 */
export function mountCardInfo(root: HTMLElement, lookup: (card: HTMLElement) => Info | null): { hide(): void } {
  const panel = el('div', 'tb-info');
  panel.hidden = true;
  panel.setAttribute('role', 'tooltip');
  root.append(panel);
  let timer: ReturnType<typeof setTimeout> | null = null;
  // The card the pointer is on; the id of one a click spent, quiet until the pointer leaves it (the click may redraw it, so not
  // the element); and where that click was.
  let over: HTMLElement | null = null;
  let spent: string | null = null;
  let clickAt: { x: number; y: number } | null = null;
  // A touch press under way, and a click still to come from a long press that opened the panel.
  let pressAt: { x: number; y: number } | null = null;
  let held: HTMLElement | null = null;
  let swallow = false;
  const cardOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('button[data-id]') : null);
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const hide = () => {
    stop();
    over = null;
    panel.hidden = true;
  };
  /** Beside the card, the side with room, else under it, kept inside the root; a zoomed stage's offsets are scaled back to its own px, and a phone's table scrolls. */
  const place = (card: HTMLElement) => {
    const r = root.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const z = root.offsetWidth > 0 ? r.width / root.offsetWidth : 1;
    const gap = 10;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const right = (c.right - r.left) / z + gap;
    const left = (c.left - r.left) / z - gap - w;
    const beside = right + w <= root.offsetWidth ? right : left >= 0 ? left : null;
    const top = (beside === null ? (c.bottom - r.top) / z + gap : (c.top - r.top) / z) + root.scrollTop;
    panel.style.left = `${Math.max(0, beside ?? Math.min((c.left - r.left) / z, root.offsetWidth - w))}px`;
    panel.style.top = `${Math.max(root.scrollTop, Math.min(top, root.scrollTop + root.offsetHeight - h))}px`;
  };
  const open = (card: HTMLElement): boolean => {
    const info = card.isConnected && card.dataset.state !== 'empty' ? lookup(card) : null;
    if (!info) return false;
    panel.replaceChildren(el('div', 'tb-info-title', info.title), ...info.lines.map((l) => el('div', 'tb-info-line', l)));
    panel.hidden = false;
    place(card);
    return true;
  };
  const touch = (e: Event) => (e as PointerEvent).pointerType === 'touch';
  /** The mouse on a card: start its dwell, unless a click left it spent or the pointer hasn't moved since one. */
  const arm = (e: Event) => {
    if (touch(e)) return;
    const p = e as PointerEvent;
    if (clickAt) {
      if (Math.hypot(p.clientX - clickAt.x, p.clientY - clickAt.y) <= STILL_PX) return;
      clickAt = null;
    }
    const card = cardOf(e.target);
    if (card === over) return;
    hide();
    over = card;
    if (card?.dataset.id !== spent) spent = null;
    if (card && spent === null) timer = setTimeout(() => void open(card), DWELL_MS);
  };
  root.addEventListener('pointerover', arm);
  root.addEventListener('pointerout', (e) => {
    if (touch(e)) return;
    const to = cardOf((e as PointerEvent).relatedTarget);
    if (to && to === over) return;
    hide();
    if (to?.dataset.id !== spent) spent = null;
    clickAt = null;
  });
  root.addEventListener('pointerdown', (e) => {
    const card = cardOf(e.target);
    hide();
    swallow = false;
    const p = e as PointerEvent;
    if (!touch(e)) {
      spent = card?.dataset.id ?? null;
      clickAt = { x: p.clientX, y: p.clientY };
      return;
    }
    pressAt = { x: p.clientX, y: p.clientY };
    held = card;
    if (card) timer = setTimeout(() => {
      swallow = open(card);
    }, HOLD_MS);
  });
  root.addEventListener('pointermove', (e) => {
    arm(e);
    const p = e as PointerEvent;
    if (touch(e) && pressAt && Math.hypot(p.clientX - pressAt.x, p.clientY - pressAt.y) > SLOP_PX) {
      pressAt = null;
      hide();
    }
  });
  const lift = (e: Event) => {
    if (!touch(e)) return;
    pressAt = null;
    hide();
  };
  root.addEventListener('pointerup', lift);
  root.addEventListener('pointercancel', lift);
  // A long press's own click isn't a pick.
  root.addEventListener(
    'click',
    (e) => {
      if (!swallow) return;
      swallow = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );
  // Android's own long-press menu can come before the hold is up: the panel takes its place.
  root.addEventListener('contextmenu', (e) => {
    if (pressAt && held && panel.hidden) {
      stop();
      swallow = open(held);
    }
    if (!panel.hidden) e.preventDefault();
  });
  return { hide };
}
