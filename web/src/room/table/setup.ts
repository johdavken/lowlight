/**
 * The SETUP card (the hand spec §1): before a job's first beat, on the table. The pitch with the job's district,
 * your tier and its heat; how you go in (QUIET, SMOOTH, HARD); up to three ready crew in PEOPLE; the favour filling
 * its pocket when your standing allows; up to two contact cards in the other pockets (contact cards spec §2). GO IN or BACK.
 */
import { APPROACHES, MAX_CONTACTS, MAX_PEOPLE, type Approach } from '../../../../shared/hand';
import type { SetupOffer } from '../../../../shared/types';
import { cardEl, trayHead, mountDeal, type TableCard } from './deal';
import { el, type TableCue } from './el';
import { approachInfo, contactInfo, favourInfo, GOES_WRONG, mountCardInfo, programInfo, recruitInfo, slotInfo, type Info } from './card-info';
import { mountTableShell } from './shell';
import type { Tips } from './tips';
import { FORCED_FIRST } from '../../../../shared/costs';
import { approachFace, artFace, contactFace, crewFace, deckLabel, programFace, slotFace } from './faces';

const APPROACH_RULES: Record<Approach, { stats: string; spared: string; first: string }> = {
  quiet: { stats: 'REFLEX · TECH +1d', spared: 'NO TAKE LOSS', first: 'ALARM FIRST' },
  smooth: { stats: 'COOL · WITS +1d', spared: 'NEVER SMALL', first: 'WORSE FIRST' },
  hard: { stats: 'BODY +1d', spared: 'NO ALARM COSTS', first: 'TAKE FIRST' },
};
/** Ready crew cards shown at once; more slide along the same row (four hires pushed the table up a row). */
const READY_SHOWN = 3;


/** SETUP's line under the title: the district, your tier there and its heat (the JOB column carries it too). */
export const setupLine = (offer: SetupOffer) => `${offer.district.replace(/-/g, ' ').toUpperCase()} · ${offer.tier} · HEAT ${offer.heat}`;

export interface SetupCard {
  refuse(text: string): void;
  /** A fresh offer while the card is up (a deck carried on YOU): approach, crew and loads kept where they still fit. */
  update(offer: SetupOffer): void;
  /** Enter and Esc on SETUP (main.ts): what GO IN and BACK do. */
  go(): void;
  back(): void;
  close(): void;
  isOpen(): boolean;
}

export function mountSetup(
  host: HTMLElement,
  o: { offer: SetupOffer; title: string; pitch: string | null; tier: number | null; reduced: boolean; onGo(setup: { approach: Approach; people: string[]; favour: boolean; contacts?: string[]; programs?: string[] }): void; onBack(): void; cue?(name: TableCue): void; tips?: Tips },
): SetupCard {
  const shell = mountTableShell(host);
  shell.root.classList.add('tb-setup');
  let offer = o.offer;
  let approach: Approach = 'quiet';
  const people: string[] = [];
  const contacts: string[] = [];
  // Programs loaded here, free (programs spec §1.2a), and the slot the catalog's tray is open for.
  const loads: string[] = [];
  let fan: string | null = null;
  // POCKETS is the deck (programs spec §2.4): an offer naming it puts the favour and contact cards on hold.
  const decked = offer.deck !== undefined;
  const favour = !decked && offer.favour === null;

  const pitch = el('div', 'ts-pitch');
  // The title on a plate cut like the hand's cards, the tier a chip like a crew grade (mockup setup-frames.html, B).
  const name = el('div', 'tb-name ts-title');
  name.append(el('span', 'ts-title-t', o.title.toUpperCase()), ...(o.tier ? [el('span', 'ts-tier', `TIER ${o.tier}`)] : []));
  pitch.append(name);
  if (o.pitch) pitch.append(el('div', 'ts-line', o.pitch));
  const sub = el('div', 'tb-sub', setupLine(offer));
  pitch.append(sub);
  const refusal = el('div', 'ts-refusal');
  const how = el('div', 'ts-approach');
  how.append(el('div', 'tb-group-label', 'HOW YOU GO IN'));
  const deal = mountDeal(how, {
    reduced: o.reduced,
    cue: o.cue,
    onPick: (id) => {
      approach = id as Approach;
      o.cue?.('move');
      markApproach();
    },
  });
  // HARD's TAKE 1 head start is from tier 2 up (balancing 2026-11-01).
  const hardStart = o.tier !== null && o.tier >= 2 ? 'START TAKE 1 · ALARM 1' : 'START ALARM 1';
  deal.deal(APPROACHES.map((a): TableCard => ({ id: a, face: approachFace(a, a.toUpperCase(), GOES_WRONG[a], { ...APPROACH_RULES[a], ...(FORCED_FIRST ? {} : { first: undefined }), ...(a === 'hard' ? { start: hardStart } : {}) }), state: 'up' })));
  const markApproach = () => {
    for (const c of how.querySelectorAll<HTMLElement>('.tb-card')) c.classList.toggle('chosen', c.dataset.id === approach);
  };
  markApproach();

  // The catalog opens over HOW YOU GO IN, in the same place, so the hand's row stays where it is.
  const stage = el('div', 'ts-stage');
  const tray = el('div', 'ts-tray tb-load-tray g-deck');
  const hand = el('div', 'tb-hand ts-hand');
  const ready = el('div', 'ts-ready');
  const contactRow = el('div', 'ts-ready ts-contacts');
  // GO IN a slab in the cards' cut with its key; BACK a quiet word with its key under it (Enter / Esc, main.ts).
  const go = el('button', 'ts-go', 'GO IN');
  go.append(el('small', 'ts-key', 'ENTER'));
  const back = el('button', 'ts-back');
  back.append(el('kbd', '', 'ESC'), document.createTextNode('BACK'));
  go.type = 'button';
  back.type = 'button';
  const buttons = el('div', 'ts-buttons');
  buttons.append(go, back);


  /** A card's hover panel (card-info.ts). */
  const infoOf = (card: HTMLElement): Info | null => {
    const id = card.dataset.id!;
    const tier = o.tier ?? undefined;
    if ((APPROACHES as readonly string[]).includes(id)) return approachInfo(id as Approach);
    const c = offer.crew.find((x) => x.id === id);
    if (c) return recruitInfo(c, tier ? { tier } : {});
    if (id === 'favour') return favourInfo();
    if (id.startsWith('contact:')) {
      const x = offer.contacts.find((k) => `contact:${k.id}` === id);
      return x ? contactInfo({ ...x, used: false }) : null;
    }
    if (id.startsWith('slot:')) return slotInfo({ setup: true });
    const pid = /^prog(?:-pick)?:(.+)$/.exec(id)?.[1];
    const p = offer.programs?.find((x) => x.id === pid);
    return p ? programInfo(p, { ...(tier ? { tier } : {}), ...(offer.deck ? { quality: offer.deck.quality } : {}) }) : null;
  };
  const info = mountCardInfo(shell.root, infoOf);
  const render = () => {
    info.hide();
    const slots = Array.from({ length: MAX_PEOPLE }, (_, i): TableCard => {
      const c = offer.crew.find((x) => x.id === people[i]);
      return c ? { id: c.id, face: crewFace(c), state: 'up' } : { id: `p${i + 1}`, face: '', state: 'empty' };
    });
    const group = (name: 'PEOPLE' | 'POCKETS' | 'DECK', cards: TableCard[], onTap?: (id: string) => void, label?: string, sub?: string, subClass = 'ts-lean') => {
      const box = el('div', `tb-group g-${name.toLowerCase()}`);
      box.append(el('div', 'tb-group-label', label ?? name));
      if (sub) box.append(el('div', subClass, sub));
      const row = el('div', 'tb-slots');
      for (const c of cards) {
        const b = cardEl(c, `tb-slot${c.state === 'locked' ? ' locked' : ''}${c.id === fan ? ' on' : ''}`);
        if (onTap && c.state === 'up') b.addEventListener('click', () => onTap(c.id));
        row.append(b);
      }
      box.append(row);
      return box;
    };
    // The deck's slots (programs spec §1.2a): what's loaded, then empty slots; an open one lights, the tray lists the rest.
    const catalog = offer.programs ?? [];
    const loaded = loads.flatMap((id) => catalog.filter((p) => p.id === id).map((p): TableCard => ({ id: `prog:${p.id}`, face: programFace(p, 'LOADED'), state: 'up' })));
    const rest = catalog.filter((p) => !loads.includes(p.id));
    const deckCards: TableCard[] = [
      ...loaded,
      ...Array.from({ length: Math.max(0, (offer.deck?.slots ?? 0) - loads.length) }, (_, i): TableCard[] => {
        const id = `slot:${loads.length + i + 1}`;
        return [rest.length ? { id, face: slotFace('LOAD'), state: 'up' } : { id, face: slotFace('EMPTY'), state: 'empty' }];
      }).flat(),
    ];
    const deckTap = (id: string) => {
      if (id.startsWith('slot:')) fan = fan === id ? null : id;
      else if (id.startsWith('prog-pick:')) {
        loads.push(id.slice('prog-pick:'.length));
        fan = null;
      } else if (id.startsWith('prog:')) loads.splice(loads.indexOf(id.slice('prog:'.length)), 1);
      o.cue?.('move');
      render();
      // A phone's table scrolls: the tray opens above the hand, maybe out of sight.
      if (fan) tray.scrollIntoView?.({ block: 'nearest' });
    };
    const leans = offer.leans?.length ? `JOB LEANS ${offer.leans.map((s) => s.toUpperCase()).join(' · ')}` : undefined;
    const pockets: TableCard[] = [
      favour ? { id: 'favour', face: artFace('favour', offer.district.replace(/-/g, ' ').toUpperCase(), ['A FRIENDLY FACE'], '+1d'), state: 'up' } : { id: 'favour', face: artFace('empty', 'NO FAVOUR', [offer.favour ?? '']), state: 'empty' },
      ...Array.from({ length: MAX_CONTACTS }, (_, i): TableCard => {
        const c = offer.contacts.find((x) => x.id === contacts[i]);
        return c ? { id: `contact:${c.id}`, face: contactFace(c), state: 'up' } : { id: `c${i + 1}`, face: artFace('empty', 'NO CONTACT'), state: 'empty' };
      }),
    ];
    hand.replaceChildren(
      group('PEOPLE', slots, (id) => {
        people.splice(people.indexOf(id), 1);
        o.cue?.('move');
        render();
      }, undefined, offer.tierLine, 'ts-tierline'),
      decked ? group('DECK', deckCards, deckTap, offer.barred ? `${offer.barred.toUpperCase()} STAYS HOME` : deckLabel(offer.deck ?? null), leans) : group('POCKETS', pockets, (id) => {
        if (id === 'favour') return;
        contacts.splice(contacts.indexOf(id.slice('contact:'.length)), 1);
        o.cue?.('move');
        render();
      }),
    );
    stage.classList.toggle('picking', fan !== null);
    tray.hidden = fan === null;
    if (fan) {
      const row = el('div', 'tb-slots');
      for (const p of rest) {
        const b = cardEl({ id: `prog-pick:${p.id}`, face: programFace(p), state: 'up' }, 'tb-slot');
        b.addEventListener('click', () => deckTap(`prog-pick:${p.id}`));
        row.append(b);
      }
      tray.replaceChildren(trayHead(), row);
    }
    // Who gave you a lead (contact cards spec §2): tap one into a pocket.
    contactRow.replaceChildren(el('div', 'tb-group-label', 'CONTACTS'));
    for (const c of offer.contacts.filter((x) => !contacts.includes(x.id))) {
      const b = cardEl({ id: `contact:${c.id}`, face: contactFace(c), state: contacts.length >= MAX_CONTACTS ? 'locked' : 'up' }, 'tb-slot');
      b.addEventListener('click', () => {
        if (contacts.length >= MAX_CONTACTS || contacts.includes(c.id)) return;
        contacts.push(c.id);
        o.cue?.('move');
        render();
      });
      contactRow.append(b);
    }
    // One row however many are ready: three show, ‹ › (or the wheel) slide the strip along a card at a time.
    const waiting = offer.crew.filter((x) => !people.includes(x.id));
    const head = el('div', 'tb-group-label ts-ready-head', 'READY CREW');
    const strip = el('div', 'ts-ready-strip');
    const slide = (dir: number) => {
      const card = strip.querySelector<HTMLElement>('.tb-slot');
      if (card) strip.scrollBy({ left: dir * (card.offsetWidth + 6), behavior: o.reduced ? 'auto' : 'smooth' });
    };
    if (waiting.length > READY_SHOWN) {
      for (const [glyph, dir] of [['‹', -1], ['›', 1]] as const) {
        const b = el('button', 'ts-cycle', glyph);
        b.type = 'button';
        b.setAttribute('aria-label', dir < 0 ? 'Earlier crew' : 'More crew');
        b.addEventListener('click', () => {
          o.cue?.('move');
          slide(dir);
        });
        head.append(b);
      }
      head.append(el('span', 'ts-count', `${waiting.length}`));
    }
    strip.addEventListener('wheel', (e) => {
      if (strip.scrollWidth <= strip.clientWidth || !e.deltaY) return;
      e.preventDefault();
      slide(Math.sign(e.deltaY));
    }, { passive: false });
    ready.replaceChildren(head, strip);
    for (const c of waiting) {
      const b = cardEl({ id: c.id, face: crewFace(c), state: people.length >= MAX_PEOPLE ? 'locked' : 'up' }, 'tb-slot');
      b.addEventListener('click', () => {
        if (people.length >= MAX_PEOPLE || people.includes(c.id)) return;
        people.push(c.id);
        o.cue?.('move');
        render();
      });
      strip.append(b);
    }
    if (!offer.crew.length) ready.append(el('div', 'tb-sub', 'NO CREW READY'));
  };
  render();
  const closeFan = () => {
    fan = null;
    render();
  };
  // A tap anywhere but a card closes an open tray.
  shell.root.addEventListener('click', (e) => {
    if (!fan || (e.target instanceof Element && e.target.closest('.tb-slot'))) return;
    closeFan();
  });

  const close = () => {
    // However it closes (BACK, travel, another job, the job leaving the board), its tip goes with it.
    o.tips?.clear();
    shell.close();
    shell.root.remove();
  };
  go.addEventListener('click', () => {
    o.tips?.clear();
    refusal.textContent = '';
    o.cue?.('confirm');
    o.onGo({ approach, people: [...people], favour, ...(contacts.length ? { contacts: [...contacts] } : {}), ...(loads.length ? { programs: [...loads] } : {}) });
  });
  back.addEventListener('click', () => {
    close();
    o.onBack();
  });
  shell.prose('');
  shell.root.querySelector('.tb-prose')!.replaceWith(pitch);
  const mid = el('div', 'ts-mid');
  mid.append(how, buttons);
  stage.append(mid, tray);
  shell.middle.append(stage, refusal);
  shell.bottom.append(hand, ready, ...(!decked && offer.contacts.length ? [contactRow] : []));
  shell.open();
  // Graft tips (tips spec §1): how you go in, who you bring when there's anyone ready, and the favour slot.
  o.tips?.offer(['approach', ...(offer.crew.length ? (['people'] as const) : []), ...(decked ? [] : (['favour'] as const)), ...(decked && (offer.deck?.slots ?? 0) > 0 ? (['program'] as const) : []), ...(offer.tierLine ? (['tier'] as const) : []), ...(!decked && offer.contacts.length ? (['contact'] as const) : [])], shell.root);
  return {
    refuse(text) {
      refusal.textContent = text;
    },
    update(next) {
      offer = next;
      sub.textContent = setupLine(offer);
      // Who's still ready, and the loads the new deck still holds, first loaded first kept.
      people.splice(0, people.length, ...people.filter((id) => offer.crew.some((c) => c.id === id)));
      const kept = loads.filter((id) => offer.programs?.some((p) => p.id === id)).slice(0, offer.deck?.slots ?? 0);
      loads.splice(0, loads.length, ...kept);
      fan = null;
      render();
    },
    close,
    // With the tray open GO IN and BACK are out of sight: both keys close it first.
    go: () => (fan ? closeFan() : go.click()),
    back: () => (fan ? closeFan() : back.click()),
    isOpen: () => !shell.root.hidden && shell.root.isConnected,
  };
}
