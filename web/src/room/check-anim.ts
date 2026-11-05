/**
 * A job's roll on its card (the table spec §4): the card locks, the dice tumble, they land on their faces, the
 * kept die lights (both sixes on a crit) and the card stamps CRIT, CLEAN, COST or MISS. A red card locks and rolls
 * slower and lands heavier. A click or a key anywhere lands it at once; with reduced motion it lands at once.
 * The landed result then stays up for HOLD_MS before the table moves on, and the next click or key moves on now.
 * On the job table (not on a phone) the dice are the table's pixel dice (pixel-dice.ts): the other cards fade, the card
 * slides left and the dice roll into the room it leaves, tapping on every bounce, with the stamp beside them.
 * A roll that waits for STEADY / TAKE IT keeps its card, dice and stamp up (job-table.ts parks them); a save played on
 * it glitches the dice to the 4–5 it became and the stamp from MISS to COST (glitchSave).
 * Under the stamp, what the roll did in words (rollLine): through or failed, TAKE, ALARM and heat, so a save's gain reads.
 */
import { kindResult, type Effect } from '../../../shared/dice';
import type { DiceRoll } from '../../../shared/quests';
import { rollPixelDice, type PixelRoll } from './table/pixel-dice';

export const LOCK_MS = 180;
export const RED_LOCK_MS = 450;
export const ROLL_MS = 700;
export const RED_ROLL_MS = 1500;
const DIES_MS = 950;
/** How long the landed dice and stamp stay up before the next beat deals over them. */
export const HOLD_MS = 1800;
/** A roll that waits stays up anyway: a beat on the stamp before STEADY / TAKE IT deal beside it. */
export const PARKED_HOLD_MS = 450;
/** How long a save's glitch runs on the dice and the stamp. */
export const GLITCH_MS = 520;
const TICK_EVERY = 60;

const STAMP = { crit: 'CRIT', clean: 'CLEAN', cost: 'COST', miss: 'MISS' } as const;
const OUTCOME = { crit: 'is-pass', clean: 'is-pass', cost: 'is-cost', miss: 'is-fail' } as const;
type Kind = keyof typeof STAMP;

/**
 * What a roll did, under its stamp: `THROUGH · +1 TAKE · ALARM +1`, `FAILED · ALARM +1 · HEAT +1`. `cost` is the ALARM
 * and heat it lands (a parked roll's as the server holds it, after a deck or ALARM −1; else rollCost). The heat is the
 * district's (the HEAT tip says what it does).
 */
export function rollLine(kind: Kind, cost: { alarm: number; heat: number }, effect?: Effect): string {
  // TAKE at the roll's effect (effect and NERVE spec §3): a SMALL 4–5 fills nothing, so no TAKE word.
  const r = kindResult(kind, 'dark', effect);
  return [r.pass ? 'THROUGH' : 'FAILED', ...(r.take ? [`+${r.take} TAKE`] : []), ...(cost.alarm ? [`ALARM ${cost.alarm > 0 ? '+' : '−'}${Math.abs(cost.alarm)}`] : []), ...(cost.heat ? [`HEAT +${cost.heat}`] : [])].join(' · ');
}
/** A landed roll's ALARM and heat from what it recorded: its position, a deck that held or was outclassed, a hidden deck, STEADY. */
export function rollCost(r: Pick<DiceRoll, 'kind' | 'position' | 'deck' | 'hidden' | 'steadied' | 'costs'>): { alarm: number; heat: number } {
  if (r.steadied) return { alarm: 0, heat: 0 };
  // A dealt roll (roll lifecycle spec §1.5): only the costs it took.
  if (r.costs) {
    const took = (c: string) => r.costs!.filter((x) => x.cost === c && x.how === 'taken').length;
    return { alarm: took('alarm'), heat: took('heat') };
  }
  const base = kindResult(r.kind, r.position);
  const alarm = r.deck === 'held' && r.kind === 'cost' ? 0 : r.deck === 'outclassed' && r.kind === 'miss' ? base.alarm + 1 : base.alarm;
  return { alarm, heat: r.hidden ? 0 : base.heat };
}
/** The line's element beside a stamp (empty until the roll lands). */
const sayEl = (text = '') => el('span', 'qc-says', text);

/** Each table tray's dice, so a save can glitch them after the roll's animation is over. */
const trays = new WeakMap<HTMLElement, PixelRoll>();

const el = (tag: string, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** Which faces count: both sixes on a crit, else the one die kept. */
export function keptIndexes(faces: number[], keep: 'high' | 'low', kind: string): number[] {
  if (kind === 'crit') return faces.flatMap((f, i) => (f === 6 ? [i] : [])).slice(0, 2);
  const target = keep === 'high' ? Math.max(...faces) : Math.min(...faces);
  return [faces.indexOf(target)];
}

/** Room kept right of the dice for the stamp (CLEAN, MISS) when the tray has to shrink to fit. */
const STAMP_ROOM = 170;

/**
 * The roll's card slides left so the card and the dice sit centred in the deal; the dice go just after it. Dice that
 * would run past the deal (five or more beside a wide card) shrink until they and the stamp fit, so they never stand
 * on what's beside the deal (the HUD's levers, playtest).
 */
function beside(deal: HTMLElement, card: HTMLElement, roll: PixelRoll): void {
  const canvas = roll.root.firstElementChild as HTMLElement;
  const gap = 12;
  const room = deal.clientWidth - card.offsetWidth - gap - STAMP_ROOM;
  const scale = room > 0 && roll.restWidth > room ? Math.max(0.6, room / roll.restWidth) : 1;
  if (scale < 1) roll.root.style.zoom = String(scale);
  const trayH = (parseFloat(canvas.style.height) || 0) * scale;
  const rest = roll.restWidth * scale;
  // Shrunk, the row starts at the deal's edge, so the stamp ends at the other.
  const left = scale < 1 ? 0 : Math.max(0, (deal.clientWidth - (card.offsetWidth + gap + rest)) / 2);
  card.style.translate = `${Math.round(left - card.offsetLeft)}px 0`;
  // The tray's own place is in its zoomed pixels.
  roll.root.style.left = `${Math.round((left + card.offsetWidth + gap) / scale)}px`;
  // The dice's floor a little above the card's foot.
  roll.root.style.top = `${Math.round((card.offsetTop + card.offsetHeight - 14 - trayH * 0.87) / scale)}px`;
}

export function playCheck(
  card: HTMLElement,
  o: {
    faces: number[];
    keep: 'high' | 'low';
    kind: 'crit' | 'clean' | 'cost' | 'miss';
    red: boolean;
    reduced: boolean;
    cue(name: 'lock' | 'tick' | 'land-crit' | 'land-clean' | 'land-cost' | 'land-miss' | 'reroll' | 'red' | 'dies' | 'tap', o?: { level: number; rate: number }): void;
    deckDied?: boolean;
    /** How long the landed result stays up before the table moves on (HOLD_MS). */
    hold?: number;
    /** What the roll did, in words (rollLine), under the stamp once it lands. */
    line?: string | null;
  },
): Promise<void> {
  let fast = o.reduced;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const pending = new Set<() => void>();
  const wait = (ms: number) =>
    fast
      ? Promise.resolve()
      : new Promise<void>((r) => {
          const t = setTimeout(() => {
            timers.delete(t);
            pending.delete(r);
            r();
          }, ms);
          timers.add(t);
          pending.add(r);
        });
  let roll: PixelRoll | null = null;
  const finish = () => {
    fast = true;
    roll?.land();
    for (const t of timers) clearTimeout(t);
    timers.clear();
    for (const r of [...pending]) r();
    pending.clear();
  };
  // The hold after landing: its own timer, so a click that landed the roll doesn't also skip it.
  let landed = false;
  const held: { end: (() => void) | null } = { end: null };
  const hold = () =>
    new Promise<void>((r) => {
      const t = setTimeout(() => held.end?.(), o.hold ?? HOLD_MS);
      held.end = () => {
        clearTimeout(t);
        held.end = null;
        r();
      };
    });
  const skip = () => (landed ? held.end?.() : finish());
  document.addEventListener('click', skip, true);
  document.addEventListener('keydown', skip, true);

  // On the table, the pixel dice beside the card; else the tray of dice under the card's line. Then the stamp.
  const deal = card.closest('.tb:not(.phone)') ? card.closest<HTMLElement>('.tb-deal') : null;
  card.querySelector('.qc-dice')?.remove();
  card.querySelector(':scope > .qc-stamp')?.remove();
  card.querySelector(':scope > .qc-says')?.remove();
  deal?.querySelector(':scope > .tb-roll')?.remove();
  const dice = deal ? [] : o.faces.map(() => el('span', 'qc-die', '·'));
  const stamp = el('span', 'qc-stamp');
  const says = sayEl();
  if (!deal) {
    const tray = el('div', 'qc-dice');
    tray.append(...dice);
    card.append(tray, stamp, says);
  }

  return (async () => {
    try {
      card.classList.add('is-locked');
      if (o.red) card.classList.add('is-red');
      o.cue('lock');
      await wait(o.red ? RED_LOCK_MS : LOCK_MS);
      o.cue('tick');
      const dur = o.red ? RED_ROLL_MS : ROLL_MS;
      if (deal) {
        roll = rollPixelDice({ faces: o.faces, red: o.red, reduced: fast, tap: (level, rate) => o.cue('tap', { level, rate }) });
        trays.set(roll.root, roll);
        roll.root.append(stamp, says);
        deal.append(roll.root);
        beside(deal, card, roll);
        await roll.landed;
      } else if (!fast) {
        card.classList.add('is-rolling');
        // The dice tumble on noise until they land.
        for (let t = 0; t < dur && !fast; t += TICK_EVERY) {
          for (const d of dice) d.textContent = String(1 + Math.floor(Math.random() * 6));
          await wait(Math.min(TICK_EVERY, dur - t));
        }
        card.classList.remove('is-rolling');
      }
      dice.forEach((d, i) => (d.textContent = String(o.faces[i])));
      const lit = keptIndexes(o.faces, o.keep, o.kind);
      for (const i of lit) dice[i]?.classList.add('kept');
      roll?.light(lit, o.kind === 'miss' ? 'miss' : 'kept', o.kind !== 'crit');
      const outcome = OUTCOME[o.kind];
      card.classList.add(outcome);
      roll?.root.classList.add(outcome);
      // A red roll lands hard: the table shakes.
      const tb = deal && o.red && !o.reduced ? deal.closest<HTMLElement>('.tb') : null;
      if (tb) {
        tb.classList.remove('tb-shake');
        void tb.offsetWidth;
        tb.classList.add('tb-shake');
        const off = (e: AnimationEvent) => {
          if (e.target !== tb) return;
          tb.classList.remove('tb-shake');
          tb.removeEventListener('animationend', off);
        };
        tb.addEventListener('animationend', off);
      }
      stamp.textContent = STAMP[o.kind];
      says.textContent = o.line ?? '';
      o.cue(o.red ? 'red' : `land-${o.kind}`);
      if (o.deckDied) {
        card.classList.add('shorting');
        o.cue('dies');
        await wait(DIES_MS);
      }
      landed = true;
      await hold();
    } finally {
      held.end?.();
      finish();
      roll?.stop();
      document.removeEventListener('click', skip, true);
      document.removeEventListener('keydown', skip, true);
    }
  })();
}

/** A waiting roll's dice and stamp, already landed: the table after a reload, when the roll's animation didn't play here. */
export function landedTray(o: { faces: number[]; keep: 'high' | 'low'; kind: Kind; line?: string | null }): HTMLElement {
  const roll = rollPixelDice({ faces: o.faces, red: false, reduced: true });
  trays.set(roll.root, roll);
  roll.light(keptIndexes(o.faces, o.keep, o.kind), o.kind === 'miss' ? 'miss' : 'kept', o.kind !== 'crit');
  roll.root.classList.add(OUTCOME[o.kind]);
  roll.root.append(el('span', 'qc-stamp', STAMP[o.kind]), sayEl(o.line ?? ''));
  roll.stop();
  return roll.root;
}

/**
 * A parked roll's dice, stamp and colour brought to `o` at once when they show something else: a save whose glitch
 * didn't play on this tab (the table re-rendered first), so the row never keeps the miss it no longer is.
 */
export function settleParked(parked: HTMLElement, o: { faces: number[]; keep: 'high' | 'low'; kind: Kind; line?: string | null }): void {
  const tray = parked.querySelector<HTMLElement>('.tb-roll');
  const card = parked.querySelector<HTMLElement>('.tb-card');
  const outcome = OUTCOME[o.kind];
  if (tray && (tray.querySelector('canvas')?.dataset.faces !== o.faces.join(',') || !tray.classList.contains(outcome))) tray.replaceWith(landedTray(o));
  const dice = tray ? [] : [...(card?.querySelectorAll<HTMLElement>('.qc-die') ?? [])];
  if (dice.length === o.faces.length) {
    const lit = keptIndexes(o.faces, o.keep, o.kind);
    dice.forEach((d, i) => {
      d.textContent = String(o.faces[i]);
      d.classList.toggle('kept', lit.includes(i));
    });
    const stamp = card!.querySelector('.qc-stamp');
    if (stamp) stamp.textContent = STAMP[o.kind];
  }
  const says = parked.querySelector('.qc-says');
  if (says && o.line !== undefined) says.textContent = o.line ?? '';
  if (card && !card.classList.contains(outcome)) {
    card.classList.remove('is-pass', 'is-cost', 'is-fail');
    card.classList.add(outcome);
  }
}

/** Letters a glitching stamp flickers through before it settles. */
const NOISE = '#%&/\\<>_=01';

/**
 * A save on a waiting miss (crew abilities spec §2): the dice that changed glitch to their new faces (the kept one a 5)
 * while the stamp scrambles from MISS to COST, then the dice light as kept, the card and stamp turn the cost's colour and
 * the cost lands. `parked` holds the roll's card and its table tray (or, on a phone, the card's own dice).
 */
export async function glitchSave(parked: HTMLElement, o: { to: number[]; keep: 'high' | 'low'; reduced: boolean; cue(name: 'glitch' | 'land-clean' | 'land-cost' | 'land-miss'): void; /** A gamble's new result (ability pass spec §2); a save goes to a cost. */ kind?: Kind; /** The cost's line (rollLine): it scrambles in with the stamp. */ line?: string | null }): Promise<void> {
  const tray = parked.querySelector<HTMLElement>('.tb-roll');
  const roll = tray ? trays.get(tray) : undefined;
  const card = parked.querySelector<HTMLElement>('.tb-card');
  const stamp = (tray ?? card)?.querySelector<HTMLElement>('.qc-stamp') ?? null;
  const says = (tray ?? card)?.querySelector<HTMLElement>('.qc-says') ?? null;
  // No line given (a phone row from before the line): what's there stays.
  const lineTo = o.line ?? null;
  const dice = tray ? [] : [...(card?.querySelectorAll<HTMLElement>('.qc-die') ?? [])];
  const ms = o.reduced ? 0 : GLITCH_MS;
  const kind = o.kind ?? 'cost';
  const target = STAMP[kind];
  o.cue('glitch');
  for (const n of [tray, card]) n?.classList.add('is-glitching');
  const from = dice.map((d) => d.textContent ?? '');
  const changed = dice.flatMap((d, i) => (from[i] !== String(o.to[i]) ? [i] : []));
  const noise = () => NOISE[Math.floor(Math.random() * NOISE.length)];
  // The stamp settles a letter at a time, left to right, over the glitch; a phone's dice flicker on noise.
  const t0 = performance.now();
  const scramble = new Promise<void>((resolve) => {
    if (!ms) return resolve();
    const timer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const settled = Math.floor(k * target.length);
      if (stamp) stamp.textContent = target.slice(0, settled) + Array.from({ length: target.length - settled }, noise).join('');
      // The line under it scrambles in the same way: what the save bought.
      const said = lineTo ? Math.floor(k * lineTo.length) : 0;
      if (says && lineTo) says.textContent = lineTo.slice(0, said) + Array.from({ length: lineTo.length - said }, () => (Math.random() < 0.3 ? ' ' : noise())).join('');
      for (const i of changed) dice[i].textContent = String(1 + Math.floor(Math.random() * 6));
      if (k >= 1) {
        clearInterval(timer);
        resolve();
      }
    }, 50);
  });
  await Promise.all([roll?.glitch(o.to, ms) ?? Promise.resolve(), scramble]);
  const lit = keptIndexes(o.to, o.keep, kind);
  dice.forEach((d, i) => {
    d.textContent = String(o.to[i]);
    d.classList.toggle('kept', lit.includes(i));
  });
  roll?.light(lit, 'kept', true);
  if (stamp) stamp.textContent = target;
  if (says && lineTo) says.textContent = lineTo;
  for (const n of [tray, card]) {
    n?.classList.remove('is-glitching', 'is-pass', 'is-cost', 'is-fail');
    n?.classList.add(OUTCOME[kind]);
  }
  o.cue(kind === 'miss' ? 'land-miss' : kind === 'cost' ? 'land-cost' : 'land-clean');
}
