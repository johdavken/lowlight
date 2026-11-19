/**
 * The board's panels (crew rules spec 2026-11-17, mockup crew-board.html): the beat's cards, large. With nobody picked a
 * panel names who has a way there; with a hand card picked it shows that card's way there, the cost in large type and
 * the way's line, or the throw's terms. Ways stay in the order the view gives them, and nothing marks one as better:
 * each cost is coloured by its kind (TAKE, ALARM, HEAT…), never by how it compares.
 */
import type { CrewJobView } from '../../../../shared/types';
import { el } from '../table/el';
import { firstName, type HandCard } from './hand';

export type BoardCard = CrewJobView['cards'][number];
export type BoardWay = BoardCard['ways'][number];
type Clock = CrewJobView['clocks'][number];

/** The throw's terms, said before the pick (crew rules spec, The throw). */
export const THROW_HEAD = 'NOT THEIR TRADE.';
export const THROW_TERMS = "A throw: 4 or more and they do it your way. Less, and it's ALARM +2 and they come back hurt.";

/** What a way sends as `by`: its hand id, or `you:<name>` for one of your named ways. */
export const byOf = (w: BoardWay): string => (w.by === 'you' && w.name ? `you:${w.name}` : w.by);

/** The hand id a `by` names (`you:branch` is you). */
export const handOf = (by: string): string => (by.startsWith('you:') ? 'you' : by);

/** One cost or gain of a way, by its kind. */
export interface CostTerm {
  /** `gain`: a job clock taken down, the one thing a way gives besides TAKE. */
  kind: 'take' | 'alarm' | 'heat' | 'clock' | 'gain' | 'cut' | 'lose' | 'leaves' | 'harm' | 'none';
  text: string;
}

/** A way's costs and gains as the board prints them, in a fixed order of kind. */
export function costTerms(w: BoardWay, clocks: readonly Clock[]): CostTerm[] {
  const out: CostTerm[] = [];
  if (w.take > 0) out.push({ kind: 'take', text: `TAKE +${w.take}` });
  if (w.alarm > 0) out.push({ kind: 'alarm', text: `ALARM +${w.alarm}` });
  if (w.heat > 0) out.push({ kind: 'heat', text: `HEAT +${w.heat}` });
  for (const [id, n] of Object.entries(w.clocks)) {
    const label = clocks.find((c) => c.id === id)?.label ?? id.toUpperCase();
    if (n > 0) out.push({ kind: 'clock', text: `${label} +${n}` });
    else if (n < 0) out.push({ kind: 'gain', text: `${label} −${-n}` });
  }
  if (w.cut > 0) out.push({ kind: 'cut', text: `${w.cut} % OFF THE PAY` });
  // A lose that empties the TAKE is said once, as what it leaves: TAKE → 0, not TAKE −1 beside it.
  if (w.lose > 0 && w.leaves !== 'none') out.push({ kind: 'lose', text: `TAKE −${w.lose}` });
  // What its outcome leaves of your take (`take: none` / `part`), a cost like any other (final review C2).
  if (w.leaves) out.push({ kind: 'leaves', text: w.leaves === 'none' ? 'TAKE → 0' : 'TAKE → PART' });
  if (w.harm) out.push({ kind: 'harm', text: w.harm === 'held' ? 'HELD' : 'HURT' });
  return out.length ? out : [{ kind: 'none', text: 'NOTHING' }];
}

/** Whether a way costs anything beyond what it takes (the stamp after: CLEAN or AT A PRICE). */
export const priced = (w: BoardWay): boolean => w.alarm > 0 || w.heat > 0 || w.cut > 0 || w.lose > 0 || Boolean(w.leaves) || Boolean(w.harm) || Object.values(w.clocks).some((n) => n > 0);

export function costEl(w: BoardWay, clocks: readonly Clock[]): HTMLElement {
  const fx = el('div', 'bw-fx');
  costTerms(w, clocks).forEach((t, i) => {
    if (i) fx.append(' · ');
    fx.append(el('span', `bw-c c-${t.kind}`, t.text));
  });
  return fx;
}

/** Who a way belongs to, as the board names them. */
export function whoOf(by: string, hand: readonly HandCard[], contactName: string | null): string {
  if (by === 'you') return 'YOU';
  if (by === 'contact') return (contactName ?? hand.find((h) => h.kind === 'contact')?.name ?? 'CONTACT').toUpperCase();
  const h = hand.find((x) => x.id === by);
  return h ? (h.kind === 'program' ? h.name.toUpperCase() : firstName(h.name)) : by.toUpperCase();
}

/** The owner kind of a way (a class for its colour of name, nothing else). */
const ownerKind = (by: string, hand: readonly HandCard[]): string => hand.find((h) => h.id === by)?.kind ?? (by === 'contact' ? 'contact' : 'you');

/** A way's row on a panel: who, what it costs, its line. Its classes say only whose it is. */
export function wayRow(w: BoardWay, o: { hand: readonly HandCard[]; clocks: readonly Clock[]; contactName: string | null }): HTMLElement {
  const row = el('div', `bw-way bw-by-${ownerKind(w.by, o.hand)}`);
  row.dataset.by = byOf(w);
  row.setAttribute('role', 'button');
  row.tabIndex = -1;
  const who = whoOf(w.by, o.hand, o.contactName);
  row.append(el('div', 'bw-n', w.by === 'you' && w.name ? `${who} · ${w.name.toUpperCase()}` : who), costEl(w, o.clocks), el('div', 'bw-t', w.line));
  return row;
}

/** One keyboard / click target on the panels: pick a plain card, send someone, or nothing yet. */
export type Target = { card: string; act: 'pick' } | { card: string; act: 'send'; by: string } | { card: string; act: 'none' };

/** A picked hand card's ways on a card (the view's order), and whether it would throw there. */
export function waysFor(c: BoardCard, picked: HandCard | null): { ways: BoardWay[]; throws: boolean } {
  if (!picked) return { ways: [], throws: false };
  return { ways: c.ways.filter((w) => w.by === picked.id), throws: c.throws.includes(picked.id) };
}

/** Every target on the panels, in order: a plain or crack card's pick; the picked card's ways, or its throw. */
export function targets(cards: readonly BoardCard[], picked: HandCard | null): Target[] {
  return cards.flatMap((c): Target[] => {
    if (c.plain || c.crack) return [{ card: c.id, act: 'pick' }];
    if (!picked) return [{ card: c.id, act: 'none' }];
    const f = waysFor(c, picked);
    if (f.ways.length) return f.ways.map((w) => ({ card: c.id, act: 'send', by: byOf(w) }));
    if (f.throws) return [{ card: c.id, act: 'send', by: picked.id }];
    return [];
  });
}

/** A panel, drawn for who's picked. `at`: the keyboard's target on it (the row's `by`, or true for the panel). */
export function panelEl(c: BoardCard, o: { picked: HandCard | null; hand: readonly HandCard[]; clocks: readonly Clock[]; contactName: string | null; at: string | true | null }): HTMLElement {
  const p = el('div', `bw-panel${c.plain || c.crack ? ' plain' : ''}${o.picked && !c.plain && !c.crack ? ' armed' : ''}${o.at !== null ? ' at' : ''}`);
  p.dataset.card = c.id;
  p.setAttribute('role', 'button');
  p.append(el('div', 'bw-art'), el('h2', '', c.short), el('div', 'bw-line', c.line));
  if (c.leads) p.append(el('div', 'bw-leads', `LEADS TO ${c.leads}`));
  const slot = el('div', 'bw-slot');
  if (c.plain || c.crack) {
    p.append(el('div', 'bw-who', c.crack ? 'CRACK IT · THE WORD TERMINAL' : 'NOBODY NEEDED'));
    slot.append(c.crack ? 'CRACK' : 'PICK', el('br', ''), 'IT');
  } else if (!o.picked) {
    const names = [...new Set(c.ways.map((w) => whoOf(w.by, o.hand, o.contactName)))];
    p.append(el('div', 'bw-who', `CAN DO IT · ${names.join(' · ')}`));
    slot.append('PICK', el('br', ''), 'SOMEONE');
  } else {
    const pre = el('div', 'bw-pre');
    const f = waysFor(c, o.picked);
    if (f.ways.length) {
      if (f.ways.length > 1) pre.classList.add('many');
      for (const w of f.ways) {
        const row = wayRow(w, o);
        if (o.at === byOf(w)) row.classList.add('at');
        pre.append(row);
      }
    } else if (f.throws) {
      const t = el('div', 'bw-throw');
      t.append(el('div', 'bw-n', firstName(o.picked.name)), el('div', 'bw-fx bw-throw-head', THROW_HEAD), ' ', el('div', 'bw-t', THROW_TERMS));
      pre.append(t);
    } else pre.append(el('div', 'bw-none', `NO WAY HERE FOR ${whoOf(o.picked.id, o.hand, o.contactName)}`));
    p.append(pre);
    if (f.ways.length || f.throws) slot.append('SEND', el('br', ''), whoOf(o.picked.id, o.hand, o.contactName));
  }
  p.append(slot);
  return p;
}
