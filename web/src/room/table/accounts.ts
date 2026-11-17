/**
 * The accounts board on the job table (Two Stories spec 2026-11-10 §5). Its layout is A in docs/mockups/two-stories.html
 * (playtest pick): the two listeners side by side with the eye between them, each with a bust, patience, THEY'VE GOT
 * and their three blanks, and the hand fanned along the bottom, all in the 780px column left of her figure and reply
 * box. It draws the server's view and sends moves; the server judges every one. Only the picked card lives here.
 */
import type { AccountsCardView, AccountsMove, AccountsView } from '../../../../shared/accounts';
import { el, graftCue } from './el';
// The cards' names are typed, as the deduction board's clue cards.
import '@fontsource/special-elite';
import { setTip } from '../../ui/hover-tag';

/** The hand's width (the whole bottom, under the JOB column and the board: 340 + 40 + 760, as the deduction board's)
 * and a card's: the strips share it, never wider apart than a card and a gap. */
const HAND_W = 1140;
const CARD_W = 118;
const SVG = 'http://www.w3.org/2000/svg';

export interface AccountsBoard {
  root: HTMLElement;
  show(v: AccountsView): void;
  /** A press's line under the listener who said it; with no listener (a refusal), under the board. */
  say(text: string, by?: string): void;
  /** She's speaking (ride-along replies): the board takes no moves until she's done, and says who's on the line. */
  hold(name: string | null): void;
  destroy(): void;
}

export function mountAccounts(host: HTMLElement, o: { onMove(m: AccountsMove): void; onCue?(name: 'move' | 'confirm' | 'lock'): void }): AccountsBoard {
  const root = el('div', 'tb-accounts');
  const main = el('div', 'ac-main');
  const top = el('div', 'ac-top');
  const heldBy = el('div', 'ac-heldby');
  heldBy.hidden = true;
  const line = el('div', 'ac-line');
  top.append(heldBy, line);
  const field = el('div', 'ac-field');
  const tell = el('button', 'ac-tell');
  tell.type = 'button';
  const tellSub = el('small', '');
  tell.append('TELL', tellSub);
  // The glass (mockup accounts-hud.html A, playtest pick): a cyan trace in the gap, from the leaking listener's answers
  // up to the eye and across into the other's THEY'VE GOT (drawTrace).
  const trace = document.createElementNS(SVG, 'svg');
  trace.classList.add('ac-trace');
  trace.setAttribute('aria-hidden', 'true');
  field.append(trace);
  // TELL under both columns, centred on the glass: it tells both accounts at once.
  main.append(top, field, tell);
  // The hand: flat along the whole bottom from the JOB column's edge, as the deduction board's.
  const hand = el('div', 'ac-hand');
  const fan = el('div', 'ac-fan');
  hand.append(fan);
  root.append(main, hand);
  host.append(root);

  let view: AccountsView | null = null;
  let sel: string | null = null;
  let holding = false;
  /** Each listener's last line, kept until the next move on that listener. */
  const said = new Map<string, string>();

  const face = (c: AccountsCardView, cls: string): HTMLElement => {
    const b = el('span', `${cls}${c.true ? '' : ' cover'}`);
    b.dataset.k = c.kind;
    const k = el('span', 'ac-k');
    k.append(el('b', 'ac-src', c.source), el('small', 'ac-tf', c.true ? 'TRUE' : 'COVER'));
    b.append(k, el('span', 'ac-ln', c.line));
    return b;
  };

  function column(l: AccountsView['listeners'][number]): HTMLElement {
    const col = el('div', 'ac-col');
    col.dataset.l = l.id;
    if (l.accent) col.style.setProperty('--ac-who', l.accent);
    const who = el('div', 'ac-who');
    let bust: HTMLElement;
    const initial = () => el('span', 'ac-bust', l.name.charAt(0).toUpperCase());
    if (l.portrait) {
      const img = el('img', 'ac-bust');
      img.src = l.portrait;
      img.alt = '';
      img.addEventListener('error', () => img.replaceWith(initial()), { once: true });
      bust = img;
    } else bust = initial();
    const pat = el('span', `ac-pat${l.patience === 0 ? ' gone' : ''}`);
    pat.append(...Array.from({ length: l.patienceMax }, (_, i) => el('i', i < l.patience ? 'on' : '')), el('span', 'ac-patw', 'PATIENCE'));
    setTip(pat, `${l.patience} of ${l.patienceMax} patience left`);
    const nm = el('div', 'ac-nmb');
    nm.append(el('span', 'ac-name', l.name.toUpperCase()), pat);
    who.append(bust, nm);
    // THEY'VE GOT: face down with the source, the unmarked one with none; face up once a press turned it.
    const got = el('div', 'ac-got');
    got.append(el('div', 'ac-lab ac-h dim', "THEY'VE GOT"));
    const row = el('div', 'ac-heldrow');
    // What went up the glass face down reads as one cyan chip, its sources in a run, so a long night keeps the column
    // above TELL (playtest: Kroll's eleven chips ran it under the hand).
    const glassed: string[] = [];
    for (const h of l.holds) {
      const g = h.glass ? ' glass' : '';
      if (h.card) {
        const up = el('div', `ac-held up${g}`);
        up.append(el('b', '', `${h.glass ? 'THE GLASS · ' : ''}${h.card.source}`), el('span', '', h.card.line));
        row.append(up);
      } else if (h.glass) glassed.push(h.source ?? '?');
      else if (h.source === null) row.append(el('div', 'ac-held unmarked', '?'));
      else row.append(el('div', 'ac-held', h.source));
    }
    if (glassed.length) {
      const d = el('div', 'ac-held glass');
      d.append(el('small', '', 'THE GLASS'), document.createTextNode(glassed.join(' · ')));
      row.append(d);
    }
    if (!l.holds.length) row.append(el('div', 'ac-none', 'Nothing yet.'));
    got.append(row);
    // The blanks: a picked card lights the ones it answers; a placed card is taken back by a click; a pinned one stays.
    const blanks = el('div', 'ac-blanks');
    const pick = sel ? view!.hand.find((c) => c.id === sel) : undefined;
    for (const a of l.asks) {
      const hot = !a.card && !a.locked && pick?.fills.includes(a.key);
      const b = el('div', `ac-blank${a.locked ? ' locked' : ''}${a.card ? ' full' : ''}${hot ? ' hot' : ''}`);
      b.dataset.k = a.key;
      // Empty, it asks its question; filled, the card's source and TRUE or COVER over two lines of its words.
      if (a.card) b.append(face(a.card, 'ac-in'));
      else b.append(el('div', 'ac-q', `${a.question}?`));
      if (a.locked) b.append(el('span', 'ac-pin', 'PIN'));
      b.onclick = () => {
        if (holding || a.locked) return;
        if (a.card) {
          said.delete(l.id);
          line.textContent = '';
          o.onMove({ kind: 'take', listener: l.id, blank: a.key });
          o.onCue?.('move');
        } else if (sel && hot) {
          // Only a blank the picked card answers: a misclick keeps the pick, and sends nothing (review).
          said.delete(l.id);
          line.textContent = '';
          o.onMove({ kind: 'place', card: sel, listener: l.id, blank: a.key });
          graftCue('give');
          sel = null;
          draw();
        }
      };
      blanks.append(b);
    }
    const s = said.get(l.id);
    col.append(who, got, blanks, el('div', 'ac-said', s ? `“${s}”` : ''));
    return col;
  }

  /** The glass between them: RECORDING with a thread per card it carried, or DARK in the hours the groundwork found. */
  function eye(v: AccountsView): HTMLElement {
    const e = el('div', `ac-eye${v.eye?.dark ? ' dark' : ''}${v.eye ? '' : ' none'}`);
    if (!v.eye) return e;
    // The eye is a node on the trace, its word down the gap; what went up the glass shows in the other's THEY'VE GOT.
    e.append(el('div', 'ac-ball'), el('div', 'ac-st', v.eye.dark ? 'DARK 01:00–04:00' : 'RECORDING'));
    setTip(e, v.eye.dark ? 'Nothing you tell one reaches the other.' : `What you tell ${v.listeners.find((l) => l.id === v.eye!.from)?.name ?? v.eye.from} goes up the glass.`);
    return e;
  }

  function draw(): void {
    const v = view;
    if (!v) return;
    const [a, b] = v.listeners;
    field.replaceChildren(...(a ? [column(a)] : []), eye(v), ...(b ? [column(b)] : []), trace);
    tell.disabled = !v.tellOpen;
    tellSub.textContent = v.tellOpen ? 'BOTH ACCOUNTS FILLED' : 'FILL BOTH ACCOUNTS';
    // The hand: flat, in fixed strips, so the card under the pointer is decided by x alone (as the deduction board's).
    const n = v.hand.length;
    const step = n > 1 ? Math.min(CARD_W + 12, (HAND_W - CARD_W) / (n - 1)) : 0;
    const lead = 0;
    fan.replaceChildren();
    hand.dataset.n = String(n);
    v.hand.forEach((c, i) => {
      const strip = el('div', 'ac-fs');
      strip.dataset.id = c.id;
      strip.style.left = `${lead + i * step}px`;
      strip.style.width = `${i === n - 1 ? CARD_W : step}px`;
      const card = el('button', `ac-card${c.true ? '' : ' cover'}${c.pressed ? ' pressed' : ''}${sel === c.id ? ' sel' : ''}`);
      card.type = 'button';
      card.tabIndex = -1;
      card.dataset.id = c.id;
      card.dataset.k = c.kind;
      // TRUE or COVER and what it answers sit under its name, where an overlapped card still shows them.
      const ft = el('span', 'ac-ft');
      ft.append(el('span', 'ac-tf', c.true ? 'TRUE' : 'COVER'), el('span', '', ` · ${c.fills.join(' ')}`));
      card.append(el('span', 'ac-src', c.source), ft, el('span', 'ac-ln', c.line));
      strip.onclick = () => {
        if (holding) return;
        sel = sel === c.id ? null : c.id;
        o.onCue?.('move');
        draw();
      };
      strip.append(card);
      fan.append(strip);
    });
    requestAnimationFrame(drawTrace);
  }

  /**
   * The glass, drawn from where the pieces sit (field coordinates, unscaled from the stage's zoom): a stub from each of the
   * leaking listener's answers to a bus down the gap, up to the eye, and an arrow into the other's THEY'VE GOT. A filled
   * answer's stub is lit (it went up the glass); in the dark hours the whole line is dim and dashed.
   */
  function drawTrace(): void {
    const v = view;
    const eyeEl = field.querySelector<HTMLElement>('.ac-eye');
    const fr = field.getBoundingClientRect();
    if (!v?.eye || !eyeEl || !field.offsetWidth || !fr.width) {
      trace.replaceChildren();
      return;
    }
    const k = fr.width / field.offsetWidth;
    const box = (n: Element) => {
      const r = n.getBoundingClientRect();
      return { x: (r.left - fr.left) / k, y: (r.top - fr.top) / k, w: r.width / k, h: r.height / k };
    };
    const px = (n: number) => Math.round(n) + 0.5;
    const fromCol = field.querySelector(`.ac-col[data-l="${v.eye.from}"]`);
    const toGot = field.querySelector(`.ac-col[data-l="${v.eye.to}"] .ac-heldrow`);
    if (!fromCol || !toGot) return trace.replaceChildren();
    const e = box(eyeEl);
    const g = box(toGot);
    const bx = px(e.x + e.w / 2);
    const gy = px(g.y + 9);
    // The eye's node sits level with THEY'VE GOT's first row, its word under it down the gap.
    eyeEl.style.paddingTop = `${Math.max(0, Math.round(gy - e.y - 6))}px`;
    const left = g.x > bx; // the other's column is to the right of the gap
    const gEdge = px(left ? g.x - 6 : g.x + g.w + 6);
    const dark = v.eye.dark;
    const slots = [...fromCol.querySelectorAll('.ac-blank')].map((n) => ({ b: box(n), full: n.classList.contains('full') }));
    const lit = !dark && slots.some((x) => x.full);
    const path = (d: string, c: string) => {
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', c);
      return p;
    };
    const rect = (x: number, y: number, w: number, c: string) => {
      const r = document.createElementNS(SVG, 'rect');
      for (const [a, val] of [['x', x - w / 2], ['y', y - w / 2], ['width', w], ['height', w]] as const) r.setAttribute(a, String(val));
      r.setAttribute('class', c);
      return r;
    };
    const parts: SVGElement[] = [];
    const low = slots.length ? px(Math.max(...slots.map((x) => x.b.y + x.b.h / 2))) : gy;
    parts.push(path(`M${bx} ${gy}V${low}`, `gl${lit ? ' lit' : ''}${dark ? ' dk' : ''}`));
    for (const sl of slots) {
      const y = px(sl.b.y + sl.b.h / 2);
      const nearX = px(sl.b.x > bx ? sl.b.x - 1 : sl.b.x + sl.b.w + 1);
      const c = !dark && sl.full ? ' lit' : '';
      parts.push(path(`M${nearX} ${y}H${bx}`, `gl${c}${dark ? ' dk' : ''}`), rect(bx, y, 3, `gn${c}`));
    }
    const ax = left ? 6 : -6;
    parts.push(path(`M${bx} ${gy}H${gEdge}`, `gl${lit ? ' lit' : ''}${dark ? ' dk' : ''}`));
    if (!dark) parts.push(path(`M${gEdge + ax} ${gy - 4}L${gEdge} ${gy}L${gEdge + ax} ${gy + 4}`, 'gl lit'));
    trace.replaceChildren(...parts);
  }
  const traceObs = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => drawTrace());
  traceObs?.observe(field);

  tell.onclick = () => {
    if (holding || !view?.tellOpen) return;
    o.onMove({ kind: 'tell' });
    graftCue('tell');
  };

  return {
    root,
    show(v) {
      if (view?.id !== v.id) {
        sel = null;
        said.clear();
        line.textContent = '';
      }
      // A listener's patience gone down a step (a new board says nothing).
      if (view && view.listeners.some((l) => (v.listeners.find((x) => x.id === l.id)?.patience ?? l.patience) < l.patience)) graftCue('patience');
      view = v;
      // A pick that's no longer in hand is dropped.
      if (sel && !v.hand.some((c) => c.id === sel)) sel = null;
      draw();
    },
    say(text, by) {
      if (by && view?.listeners.some((l) => l.id === by)) {
        said.set(by, text);
        line.textContent = '';
        draw();
      } else line.textContent = text;
    },
    hold(name) {
      holding = name !== null;
      root.classList.toggle('held', holding);
      heldBy.hidden = !holding;
      heldBy.textContent = holding ? `${name!.toUpperCase()} ON THE LINE` : '';
    },
    destroy() {
      traceObs?.disconnect();
      root.remove();
    },
  };
}
