/**
 * A card in words: rest the pointer on a table card (or long-press it on a phone) and a panel beside it spells out what
 * the card does now. It waits out a dwell, so a click never brings it up. The text is built when it opens, from the same
 * values the card's face draws.
 */
import { GRADES, type Grade, type Specialty } from '../../../../shared/crew-book';
import { APPROACH_COSTS, COSTS, FORCED_FIRST, picksFor } from '../../../../shared/costs';
import { deckNotes, EFFECT_NAMES, kindResult, POSITION_NAMES, type Effect, type Pool, type Position } from '../../../../shared/dice';
import { APPROACH_STATS, SPEC_STAT, type Approach } from '../../../../shared/hand';
import { HOT_LOAD_NERVE, type ProgramKind } from '../../../../shared/programs';
import { clearLead, hostRect, traceLead } from '../../ui/trace-lead';
import { el } from './el';
import { litNodes } from './tips';

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
/** Between a card and its panel: room for the leader (overlay-hud.html B TRACE). */
const LEAD_GAP = 34;
/** How far down the card's edge the leader leaves from. */
const LEAD_Y = 40;

/** A line's key, when it opens on one in capitals ("IN THE OPEN: …", "FAIR: …"): drawn in pixel caps beside the rest. */
export function splitKey(line: string): { key: string | null; text: string } {
  const m = /^([A-Z][A-Z0-9 ·'’+−-]*[A-Z0-9]): (.+)$/su.exec(line);
  return m ? { key: m[1], text: m[2] } : { key: null, text: line };
}

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
  /** A miss here blows the job. */
  blows?: boolean;
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
  if (o.blows) lines.push('A miss here blows the job: no take, no pay, and costs can\'t save it.');
  if (s.why) lines.push(`Can't go: ${s.why}.`);
  return { title: `${pool.stat} · ${s.dice} DICE`, lines };
}

/** A choice with no roll: a crack, or a route with its own ALARM; null: the card says it all. */
export function plainInfo(c: { crack?: { length: number; tries: number; take?: number }; alarm?: number; blows?: true }, takes: boolean): Info | null {
  if (c.crack) return { title: 'CRACK', lines: [`A terminal: ${c.crack.length}-letter words, ${c.crack.tries} tries. ${takes ? `A win fills ${c.crack.take ?? 2} TAKE, a lockout raises ALARM.` : 'A lockout raises ALARM.'}`, ...(c.alarm ? [routeLine(c.alarm)] : []), ...(c.blows ? ['A lockout here blows the job: no take, no pay.'] : [])] };
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
  lines: [`+1d on ${APPROACH_STATS[a].map((s) => s.toUpperCase()).join(' · ')}.`, `Never dealt ${COSTS[APPROACH_COSTS[a].never].tag}.${FORCED_FIRST ? ` ${COSTS[APPROACH_COSTS[a].first].tag} comes first.` : ''}`, GOES_WRONG[a]],
});

export const favourInfo = (plays?: string[], used = false): Info => ({ title: 'THE FAVOUR', lines: used ? ['Used.'] : ['+1d, once.', ...here(plays)] });

const KIND_WORDS: Record<ProgramKind, string> = { position: 'a step out of danger', effect: 'a step more effect', quiet: 'takes 1 off the heat you leave with', firewall: 'cancels one cost, not on the wire' };

/** A program's card: what it does, how it stands against the tier, and `plays`, where it would run on this beat. */
export function programInfo(p: { name: string; stat: string; kind: ProgramKind; line: string; foil?: true; count?: number }, o: { tier?: number; quality?: number; plays?: string[]; nerve?: number; dead?: boolean; burned?: boolean }): Info {
  if (o.dead) return { title: p.name, lines: [p.line, 'The deck is dead: nothing runs.'] };
  if (o.burned) return { title: p.name, lines: [p.line, 'Burned: used up on this job.'] };
  const lines = [p.line, `${p.stat === 'any' ? 'Any roll' : `On ${p.stat.toUpperCase()}`}: ${KIND_WORDS[p.kind]}.`];
  const lifts = p.kind === 'position' || p.kind === 'effect';
  if (o.tier !== undefined && o.quality !== undefined) {
    if (o.quality < o.tier) lines.push(`Below the job’s tier: each run costs ALARM +1${lifts ? ', and it lifts no cut' : ''}.`);
    else if (lifts && o.tier >= 2) lines.push('Lifts the tier cut on any roll it runs on.');
  }
  if (o.nerve) lines.push(`Loading mid-job costs ${o.nerve} NERVE.`);
  // A foil (owned programs): one run with a die more, then gone.
  if (p.foil) lines.push(`Foil: its one run rolls a die more, then it's gone${(p.count ?? 1) > 1 ? ` (you hold ${p.count})` : ''}.`);
  return { title: p.foil ? `${p.name} · FOIL` : p.name, lines: [...lines, ...here(o.plays)] };
}

/** An empty program slot. */
export const slotInfo = (o: { setup: boolean; dead?: boolean }): Info => ({ title: 'LOAD', lines: [o.dead ? 'The deck is dead: nothing loads.' : o.setup ? 'Load a program here, free.' : `Load a program mid-job: ${HOT_LOAD_NERVE} NERVE.`] });

/**
 * The panel on `root`: `lookup` says what a card (a `button[data-id]`) shows, read when the panel opens. `hide` closes it
 * and drops a dwell under way, for a table that's changing.
 */
export function mountCardInfo(root: HTMLElement, lookup: (card: HTMLElement) => Info | null): { hide(): void } {
  const panel = el('div', 'tb-info hv-frame');
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
    clearLead(root, 'card');
  };
  /** Beside the card, the side with room, else under it, kept inside the root (a phone's table scrolls); a leader from the card's edge to the panel. */
  const place = (card: HTMLElement) => {
    const c = hostRect(root, card);
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const right = c.right + LEAD_GAP;
    const left = c.left - LEAD_GAP - w;
    const beside = right + w <= root.offsetWidth ? right : left >= 0 ? left : null;
    const x = Math.max(0, beside ?? Math.min(c.left, root.offsetWidth - w));
    const want = beside === null ? c.bottom + LEAD_GAP : c.top + 6;
    const y = Math.max(root.scrollTop, Math.min(want, root.scrollTop + root.offsetHeight - h));
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    if (beside === null) {
      const at = Math.min(Math.max(c.left + c.width / 2, x + 14), x + w - 14);
      traceLead(root, 'card', [c.left + c.width / 2, c.bottom + 1], [at, y - 1]);
    } else {
      const fromY = c.top + Math.min(LEAD_Y, c.height / 2);
      const toY = Math.min(Math.max(fromY, y + 14), y + h - 14);
      traceLead(root, 'card', beside === right ? [c.right + 1, fromY] : [c.left - 2, fromY], beside === right ? [x - 1, toY] : [x + w, toY]);
    }
  };
  const open = (card: HTMLElement): boolean => {
    const info = card.isConnected && card.dataset.state !== 'empty' ? lookup(card) : null;
    if (!info) return false;
    // In the HUD trace (style.css .hv-*): a pixel head, the first line the white gist, the rest rows keyed in caps where
    // they open on a key, the HUD's words in their colours.
    const [first, ...rest] = info.lines;
    const rows = el('div', 'tb-info-rows hv-rows');
    for (const l of rest) {
      const { key, text } = splitKey(l);
      const t = el('div', key ? 'tb-info-line hv-t' : 'tb-info-line hv-t full');
      t.append(...litNodes(text));
      if (key) rows.append(el('span', 'hv-k', key));
      rows.append(t);
    }
    const gist = first === undefined ? [] : [el('div', 'tb-info-line tb-info-gist hv-gist')];
    gist[0]?.append(...litNodes(first!));
    panel.replaceChildren(el('div', 'tb-info-title hv-head', info.title), ...gist, ...(rest.length ? [rows] : []));
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
