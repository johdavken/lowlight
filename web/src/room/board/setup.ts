/**
 * GO IN on the board (crew rules spec 2026-11-17, The board → GO IN): before a crew-rules job's first beat. The roster's
 * ready recruits as printed cards to bring, up to MAX_PEOPLE (a job's guest among them, as the offer gives them), and the
 * deck's slots to load from owned programs. No approaches, no favour, no contact cards. The story page (the JOB column,
 * main.ts) holds the pitch.
 *
 * It never marks, sorts or colours who to bring: cards keep the offer's order, and nothing is lit until the player
 * picks or steps the keys onto it.
 */
import type { SetupOffer } from '../../../../shared/types';
import { MAX_PEOPLE } from '../../../../shared/hand';
import { el } from '../table/el';
import { personCard, programCard, type HandCard } from './hand';

/** The job GO IN is up for, and its offer (the setup offer `questState` carries). */
export interface GoInJob {
  id: string;
  title: string;
  tier: number | null;
  pay?: [number, number] | null;
  offer: SetupOffer;
}

export interface GoInPicks {
  /** Who's brought, in the order they were picked. */
  people: string[];
  /** What's loaded, in load order. */
  programs: string[];
}

/** One thing the keys step onto: a recruit to bring, or a program to load. */
export type GoInItem = { kind: 'bring' | 'load'; id: string };

/** What ←→ step through: the recruits, then the programs, in the offer's order. */
export function goInItems(offer: SetupOffer): GoInItem[] {
  return [...offer.crew.map((c) => ({ kind: 'bring' as const, id: c.id })), ...(offer.deck ? (offer.programs ?? []) : []).map((p) => ({ kind: 'load' as const, id: p.id }))];
}

/** A fresh offer (someone back, someone gone, a new deck): the picks it still holds, first picked first kept. */
export function keepPicks(offer: SetupOffer, picks: GoInPicks): GoInPicks {
  const slots = offer.deck?.slots ?? 0;
  return {
    people: picks.people.filter((id) => offer.crew.some((c) => c.id === id)).slice(0, MAX_PEOPLE),
    programs: picks.programs.filter((id) => offer.programs?.some((p) => p.id === id)).slice(0, offer.deck ? slots : 0),
  };
}

/** Brings or leaves a recruit, loads or unloads a program; the refusal's words when it can't (the board says them). */
export function toggle(offer: SetupOffer, picks: GoInPicks, item: GoInItem): string | null {
  const list = item.kind === 'bring' ? picks.people : picks.programs;
  const i = list.indexOf(item.id);
  if (i >= 0) {
    list.splice(i, 1);
    return null;
  }
  if (item.kind === 'bring') {
    if (!offer.crew.some((c) => c.id === item.id)) return null;
    if (list.length >= MAX_PEOPLE) return `at most ${MAX_PEOPLE} people`;
  } else {
    if (!offer.deck || !offer.programs?.some((p) => p.id === item.id)) return null;
    if (list.length >= offer.deck.slots) return 'NO FREE SLOT';
  }
  list.push(item.id);
  return null;
}

/** Where GO IN sits on the 1600×900 stage: who to bring from x 470, the deck from 1180, both from y 172. */
const BRING_X = 470;
const BRING_END = 1150;
const CARD_W = 204;
const CARD_STEP = 212;
/** Four or more to bring: smaller cards (board.css `.bw-bring.small`), so four sit side by side before the deck. */
const SMALL_W = 164;
const SMALL_STEP = 172;
const DECK_X = 1180;
const DECK_END = 1572;
const PROG_W = 126;
const PROG_STEP = 134;
const ROW_Y = 172;
const OWNED_Y = 392;

const fan = (n: number, from: number, to: number, w: number, step: number) => (n > 1 ? Math.min(step, (to - from - w) / (n - 1)) : step);

/** A recruit on the offer as a hand card: their crew face (a guest's own art), as the run's hand draws them. */
function recruitCard(c: SetupOffer['crew'][number]): HandCard {
  const art = c.guest ? (c.art ?? null) : c.face ? `/api/extras/${encodeURIComponent(c.face)}` : null;
  return { id: c.id, kind: 'recruit', name: c.name, spec: c.spec, grade: c.grade, art, state: 'ready' };
}

const programHand = (p: NonNullable<SetupOffer['programs']>[number]): HandCard => ({ id: `p:${p.id}`, kind: 'program', name: p.count && p.count > 1 ? `${p.name} ×${p.count}` : p.name, art: null, state: 'ready' });

/** GO IN's middle: the cards to bring, the deck's slots and what can load into them, GO IN and BACK. */
export function goInEl(job: GoInJob, picks: GoInPicks, at: GoInItem | null): HTMLElement {
  const { offer } = job;
  const box = el('div', 'bw-goin');
  const isAt = (kind: GoInItem['kind'], id: string) => at?.kind === kind && at.id === id;
  box.append(el('div', 'bw-goin-head', ['GO IN', offer.district.replace(/-/g, ' ').toUpperCase(), offer.tier, `HEAT ${offer.heat}`].join(' · ')));
  // Who to bring: only when someone's ready (a job with nobody shows the deck alone).
  if (offer.crew.length) {
    const small = offer.crew.length > MAX_PEOPLE;
    const bring = el('div', `bw-bring${small ? ' small' : ''}`);
    bring.append(el('div', 'bw-lab', `WHO YOU BRING · ${picks.people.length} / ${MAX_PEOPLE}`));
    const step = small ? fan(offer.crew.length, BRING_X, BRING_END, SMALL_W, SMALL_STEP) : fan(offer.crew.length, BRING_X, BRING_END, CARD_W, CARD_STEP);
    offer.crew.forEach((c, i) => {
      const card = personCard(recruitCard(c), { sel: picks.people.includes(c.id), at: { x: Math.round(BRING_X + i * step), y: ROW_Y } });
      delete card.dataset.hand;
      card.dataset.bring = c.id;
      if (c.guest) card.classList.add('guest');
      if (isAt('bring', c.id)) card.classList.add('at');
      bring.append(card);
    });
    box.append(bring);
  }
  // The deck: its slots, what's loaded in them, and what you own to load.
  const deck = el('div', 'bw-deck');
  const head = el('div', 'bw-lab deck', offer.deck ? `THE DECK · ${offer.deck.name.toUpperCase()}` : 'NO DECK');
  deck.append(head);
  if (offer.barred) deck.append(el('div', 'bw-deck-note', `${offer.barred.toUpperCase()} STAYS HOME`));
  if (offer.deck) {
    const slots = offer.deck.slots;
    const sStep = fan(slots, DECK_X, DECK_END, PROG_W, PROG_STEP);
    for (let i = 0; i < slots; i++) {
      const slot = el('div', 'bw-dslot');
      slot.style.left = `${Math.round(DECK_X + i * sStep)}px`;
      slot.style.top = `${ROW_Y}px`;
      const id = picks.programs[i];
      const p = id ? offer.programs?.find((x) => x.id === id) : undefined;
      if (p) {
        const card = programCard(programHand(p), { sel: false, at: { x: 0, y: 0 }, chip: false });
        card.dataset.unload = p.id;
        slot.append(card);
      } else slot.textContent = 'EMPTY';
      deck.append(slot);
    }
    const owned = offer.programs ?? [];
    if (owned.length) {
      deck.append(Object.assign(el('div', 'bw-lab deck bw-owned'), { textContent: 'LOAD FROM' }));
      const oStep = fan(owned.length, DECK_X, DECK_END, PROG_W, PROG_STEP);
      owned.forEach((p, i) => {
        const card = programCard(programHand(p), { sel: picks.programs.includes(p.id), at: { x: Math.round(DECK_X + i * oStep), y: OWNED_Y }, chip: false });
        delete card.dataset.hand;
        card.dataset.load = p.id;
        card.title = p.line;
        if (isAt('load', p.id)) card.classList.add('at');
        deck.append(card);
      });
    } else deck.append(Object.assign(el('div', 'bw-deck-note bw-owned'), { textContent: 'NOTHING TO LOAD' }));
  }
  box.append(deck);
  const go = el('button', 'bw-go', 'GO IN');
  go.type = 'button';
  go.append(el('small', '', '[ENTER]'));
  const back = el('button', 'bw-back', 'BACK');
  back.type = 'button';
  back.append(el('small', '', '[ESC]'));
  box.append(go, back);
  return box;
}
