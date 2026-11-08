/**
 * Your hand (the hand spec §5): PEOPLE then POCKETS along the bottom. Tap a card to lift it (one at a time), tap it
 * again to put it back. Locked pockets wait for spec 3. At phone width the hand scrolls sideways. When a job opens the
 * hand is dealt face down and turns over a card at a time (table.css).
 *
 * A recruit is one card with an index tab hanging off it for each ability they brought (crew abilities spec §2). A tab
 * turns the card over to its back and on to that ability; the same tab again turns it back to the recruit. Whichever side is up
 * lifts or plays as its own card.
 *
 * When a roll waits, a recruit with an AFTER A ROLL ability that can act on it turns over to it by itself, one after
 * another, and turns back once it can't any more (played, or the roll landed). A card you turned yourself stays put.
 */
import { cardEl, type TableCard } from './deal';
import { DEAL_STAGGER_MS, el, FLIP_AT_MS, isPhone, type TableCue } from './el';
import { tabWords } from './tabs';
import { abilityCard } from '../../../../shared/hand';

export interface HandGroup {
  group: 'PEOPLE' | 'POCKETS' | 'DECK';
  /** The label when it says more than the group's name (programs spec §2.1: `DECK · CORTEX MERIDIAN · Q3`); drawn even with no cards. */
  label?: string;
  slots: TableCard[];
}

/** One turn of a card (table.css), and the beat on its back before the second. */
export const TURN_MS = 320;
const BACK_HOLD_MS = 60;
/** Recruits the table turns over at once go one after another. */
const AUTO_STAGGER_MS = 160;

export function mountHand(host: HTMLElement, o: { onLift(id: string | null): void; onTap?(id: string): void; cue?(name: TableCue): void }): { show(groups: HandGroup[], o?: { dealIn?: boolean }): void; lifted(): string | null; press(): string | null; drop(): void; root: HTMLElement } {
  const root = el('div', 'tb-hand');
  host.append(root);
  let lifted: string | null = null;
  // An ON A ROLL ability lifted beside a call (ability pass spec §1).
  let press: string | null = null;
  let last: HandGroup[] = [];
  // The deal-in's flip cues still to come; a new render stops them.
  let flips: ReturnType<typeof setTimeout>[] = [];
  // Per recruit: the card shown (their id, or one of their abilities'), and how many half turns the card has made.
  const shown = new Map<string, string>();
  const turns = new Map<string, number>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  // Per recruit, a card part way through a turn: a redraw puts this same card back so the turn runs on through its back
  // (playtest: a lift redraws the hand on a job with a deck, and the card jumped to the ability unseen). `to` is where
  // it's headed; a redraw that wants it elsewhere draws afresh.
  const turning = new Map<string, { flip: HTMLElement; to: string; turn(next: HTMLElement): void; resume(): void }>();
  // Per recruit, their cards as last drawn, so a turn's second half puts up the card as it stands now.
  const stackCards = new Map<string, TableCard[]>();
  // Per recruit, turning their card to `to` with the turn's two halves (set as each stack is drawn).
  const turners = new Map<string, (to: string) => void>();
  // Recruits the table turned over to a ready ability, and the abilities it has offered while they stay ready.
  const auto = new Set<string>();
  const offered = new Set<string>();
  const lift = (id: string | null, beside: string | null = null) => {
    lifted = id;
    press = beside;
    for (const s of root.querySelectorAll<HTMLElement>('.tb-slot')) s.classList.toggle('lifted', s.dataset.id === id || s.dataset.id === beside);
    if (id) o.cue?.('move');
    o.onLift(id);
  };
  /** A tap on a card in the hand: it lifts alone, or beside a call from another recruit; tapped again it goes back. */
  const tapCard = (id: string) => {
    if (id === press) return lift(lifted);
    if (id === lifted) return lift(press);
    const a = abilityCard(id);
    const held = lifted ? abilityCard(lifted) : null;
    if (lifted && a && !held && a.rid !== lifted) return lift(lifted, id);
    if (lifted && !a && held && held.rid !== id) return lift(id, lifted);
    if (!a && press && abilityCard(press)?.rid !== id) return lift(id, press);
    lift(id);
  };
  const slotEl = (s: TableCard, cls: string): HTMLElement => {
    const b = cardEl(s, `tb-slot${s.state === 'locked' ? ' locked' : ''}${cls}`);
    if (s.id === lifted || s.id === press) b.classList.add('lifted');
    if (s.tap) b.classList.add('tb-after');
    b.addEventListener('click', () => {
      if (s.state !== 'up' && s.state !== 'lifted') return;
      if (s.tap) return o.onTap?.(s.id);
      tapCard(s.id);
    });
    return b;
  };
  const cardBack = (cls: string) => {
    const b = el('span', `tb-slot tb-cardback${cls}`);
    const img = el('img', 'tbc-art');
    img.src = '/cards/back.webp';
    img.alt = '';
    b.append(img);
    return b;
  };
  /** One recruit's card and its tabs: `cards` is their call, then their abilities. */
  const stackEl = (id: string, cards: TableCard[]): HTMLElement => {
    const box = el('div', 'tb-crew-stack');
    box.dataset.stack = id;
    const front = cards[0];
    const abilities = cards.filter((c) => c.glyph);
    // Nothing to turn over to: the recruit's card alone.
    if (abilities.length === 0) {
      box.append(slotEl(front, ''));
      return box;
    }
    const down = front.state === 'down';
    stackCards.set(id, cards);
    const face = (cid: string) => {
      const now = stackCards.get(id) ?? cards;
      return now.find((c) => c.id === cid) ?? now[0];
    };
    // A card part way through a turn stays the same card; otherwise it's drawn where its turns left it.
    const card =
      turning.get(id) ??
      (() => {
        const t = turns.get(id) ?? 0;
        const flip = el('div', 'tb-flip');
        const inner = el('div', 'tb-flip-in');
        inner.style.transform = `rotateY(${t * 180}deg)`;
        // The side facing you holds the shown card; the other holds the back until the next turn.
        const up = t % 2;
        const sides: HTMLElement[] = [0, 1].map((i) => (i === up ? slotEl(face(shown.get(id) ?? front.id), i ? ' tb-side-b' : '') : cardBack(i ? ' tb-side-b' : '')));
        inner.append(...sides);
        flip.append(inner);
        // When the half turn under way started, so a redraw can pick it up where it was.
        let at = -Infinity;
        const turn = (next: HTMLElement) => {
          const n = (Number(inner.dataset.turns ?? t) || 0) + 1;
          inner.dataset.turns = String(n);
          const i = n % 2;
          if (i) next.classList.add('tb-side-b');
          sides[i].replaceWith(next);
          sides[i] = next;
          inner.style.transitionDelay = '';
          inner.style.transform = `rotateY(${n * 180}deg)`;
          at = performance.now();
        };
        // Put back into a redrawn hand, the card has lost its transition and would snap to where the half turn ends
        // (playtest: a tab on a lifted recruit drops the lift, the hand redraws, and the card jumped to its back unseen).
        // Run the half turn again from its start, a negative delay putting it as far along as it had got.
        const resume = () => {
          const gone = performance.now() - at;
          if (gone >= TURN_MS) return;
          const n = Number(inner.dataset.turns) || 0;
          inner.style.transition = 'none';
          inner.style.transform = `rotateY(${(n - 1) * 180}deg)`;
          void inner.offsetWidth;
          inner.style.transition = '';
          inner.style.transitionDelay = `${-Math.round(gone)}ms`;
          inner.style.transform = `rotateY(${n * 180}deg)`;
        };
        return { flip, to: shown.get(id) ?? front.id, turn, resume };
      })();
    box.append(card.flip);
    const tabs = el('div', 'tb-tabs');
    const turnTo = (to: string) => {
      shown.set(id, to);
      // Two half turns: over to the back, then on to the card. The card is held through a redraw until both are done.
      turns.set(id, (turns.get(id) ?? 0) + 2);
      for (const x of tabs.children) x.classList.toggle('on', (x as HTMLElement).dataset.id === to);
      clearTimeout(pending.get(id));
      turning.set(id, { ...card, to });
      card.turn(cardBack(''));
      pending.set(
        id,
        setTimeout(() => {
          o.cue?.('flip');
          card.turn(slotEl(face(to), ''));
          pending.set(
            id,
            setTimeout(() => {
              pending.delete(id);
              turning.delete(id);
            }, TURN_MS),
          );
        }, TURN_MS + BACK_HOLD_MS),
      );
      // A lift belongs to the side that was up (the redraw a lift can start keeps this card turning).
      if (lifted && cards.some((c) => c.id === lifted)) lift(press);
      if (press && cards.some((c) => c.id === press)) lift(lifted);
    };
    turners.set(id, turnTo);
    for (const a of abilities) {
      const g = el('button', `tb-tab t-${a.glyph!.timing}${a.tap ? ' ready' : ''}${a.state === 'down' ? ' used' : ''}${a.off ? ' off' : ''}${(shown.get(id) ?? front.id) === a.id ? ' on' : ''}`);
      g.type = 'button';
      g.dataset.id = a.id;
      g.title = a.glyph!.label.toUpperCase();
      g.setAttribute('aria-label', g.title);
      g.disabled = down;
      g.append(el('i', 'tb-tab-dot'), document.createTextNode(tabWords(a.glyph!.kind, a.glyph!.label)));
      g.addEventListener('click', () => {
        // Turned by hand: the table leaves it be.
        auto.delete(id);
        turnTo((shown.get(id) ?? front.id) === a.id ? front.id : a.id);
      });
      tabs.append(g);
    }
    box.append(tabs);
    return box;
  };
  /**
   * Which recruits the table turns, and to what: one showing their own card with an AFTER A ROLL ability ready that it
   * hasn't offered yet turns to it; one it turned whose ability isn't ready any more turns to another ready one, or back.
   */
  const autoTurns = (slots: TableCard[]): [string, string][] => {
    const ready = slots.filter((s) => s.tap && s.state === 'up').map((s) => s.id);
    for (const id of offered) if (!ready.includes(id)) offered.delete(id);
    const moves: [string, string][] = [];
    for (const front of slots) {
      const rid = front.id;
      if (front.stack !== rid || front.state === 'down') continue;
      const mine = slots.filter((s) => s.stack === rid && ready.includes(s.id)).map((s) => s.id);
      const cur = shown.get(rid) ?? rid;
      const fresh = mine.find((x) => !offered.has(x));
      if (auto.has(rid) && !mine.includes(cur)) moves.push([rid, fresh ?? rid]);
      else if (!auto.has(rid) && cur === rid && fresh) moves.push([rid, fresh]);
    }
    return moves;
  };
  const render = (dealIn = false) => {
    let i = 0;
    for (const t of flips) clearTimeout(t);
    flips = [];
    // A turn under way runs on unless the card is now wanted elsewhere (turned back, gone down, a new deal).
    for (const [id, c] of turning) {
      if ((shown.get(id) ?? id) === c.to) continue;
      clearTimeout(pending.get(id));
      pending.delete(id);
      turning.delete(id);
    }
    root.classList.toggle('scroll-x', isPhone(host));
    // Six cards in the row: a recruit and their abilities count as one.
    root.classList.toggle('tuck', last.flatMap((g) => g.slots).filter((s) => !s.stack || s.id === s.stack).length >= 6);
    root.replaceChildren(
      // A group with nothing in it (no crew brought) isn't drawn, unless its label says something (DECK · NONE).
      ...last.filter((g) => g.slots.length > 0 || g.label).map((g) => {
        const box = el('div', `tb-group g-${g.group.toLowerCase()}`);
        box.append(el('div', 'tb-group-label', g.label ?? g.group));
        const row = el('div', 'tb-slots');
        const stacks = new Map<string, TableCard[]>();
        for (const s of g.slots) {
          if (s.stack) {
            if (!stacks.has(s.stack)) stacks.set(s.stack, []);
            stacks.get(s.stack)!.push(s);
            if (stacks.get(s.stack)!.length > 1) continue;
          }
          const b = s.stack ? stackEl(s.stack, g.slots.filter((x) => x.stack === s.stack)) : slotEl(s, '');
          // A text pocket still says why it's locked (a picture card carries it as its chip).
          if (s.state === 'locked' && g.group === 'POCKETS' && typeof s.face === 'string') b.append(el('span', 'tb-lock', 'SPEC 3'));
          if (dealIn) {
            const card = b.matches('.tb-slot') ? b : b.querySelector<HTMLElement>('.tb-slot:not(.tb-cardback)')!;
            card.classList.add('dealt-down');
            card.style.setProperty('--i', String(i));
            // A face-up card sounds as it turns over; a face-down or empty one stays quiet.
            if (s.state !== 'down' && s.state !== 'empty') flips.push(setTimeout(() => o.cue?.('flip'), i * DEAL_STAGGER_MS + FLIP_AT_MS));
            i++;
          }
          row.append(b);
        }
        box.append(row);
        return box;
      }),
    );
    for (const c of turning.values()) if (c.flip.isConnected) c.resume();
  };
  return {
    root,
    show(groups, so) {
      last = groups;
      // A new job's hand is dealt recruit side up.
      if (so?.dealIn) {
        shown.clear();
        turns.clear();
        for (const t of pending.values()) clearTimeout(t);
        pending.clear();
        turning.clear();
      }
      if (so?.dealIn) {
        auto.clear();
        offered.clear();
      }
      const slots = groups.flatMap((g) => g.slots);
      // A lifted card that can no longer play (face down, gone) drops back.
      const can = (id: string | null) => slots.some((s) => s.id === id && (s.state === 'up' || s.state === 'lifted'));
      if (lifted && !can(lifted)) lifted = null;
      if (press && (!lifted || !can(press))) press = null;
      const moves = autoTurns(slots);
      // An ability that's played (or gone) turns its recruit back over; a recruit down shows their back. One the table
      // turns back itself (moves) shows the side it's leaving first.
      for (const [rid, cid] of shown) {
        if (moves.some(([m]) => m === rid)) continue;
        const c = slots.find((s) => s.id === cid);
        const front = slots.find((s) => s.id === rid);
        if (!c || !front || c.state === 'down' || front.state === 'down') shown.delete(rid);
      }
      render(so?.dealIn);
      moves.forEach(([rid, to], k) => {
        const from = shown.get(rid) ?? rid;
        flips.push(
          setTimeout(() => {
            // Turned by hand meanwhile: that stands.
            if ((shown.get(rid) ?? rid) !== from) return;
            if (to === rid) auto.delete(rid);
            else {
              auto.add(rid);
              offered.add(to);
            }
            turners.get(rid)?.(to);
          }, k * AUTO_STAGGER_MS),
        );
      });
    },
    lifted: () => lifted,
    press: () => press,
    /** Put a lifted card back without a cue (it was just played). */
    drop() {
      lifted = null;
      press = null;
      for (const s of root.querySelectorAll<HTMLElement>('.tb-slot.lifted')) s.classList.remove('lifted');
    },
  };
}
