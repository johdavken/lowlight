/**
 * The deduction board on the job table (spec 2026-11-09-deduction-board §4). Its layout is mockup B in
 * docs/mockups/board-layouts.html (playtest pick): AGAINST at the top, the suspects large in the middle with the named
 * one's WHO, HOW and WHY under its portrait and the deductions beside them, the hand flat along the whole bottom above
 * the chat bar (2026-11-11), all left of her figure. It draws the server's view and sends moves; the server judges every
 * one. Only the picks in progress (two cards, a deduction) live here.
 */
import type { Blank } from '../../../../shared/cases';
import type { BoardMove, BoardView } from '../../../../shared/deduction';
import { el, graftCue } from './el';
import { WAIST_LINE } from '../../ui/figure';
// The clue cards' names are typed (clue card mockups, docs/mockups/clue-card-label.html: bare, typewriter).
import '@fontsource/special-elite';
import { setTip } from '../../ui/hover-tag';
import { clearLead, hostRect, traceVia } from '../../ui/trace-lead';

const BLANK_LABEL: Record<Blank, string> = { WHO: 'PUTS YOUR SUSPECT AT THE SCENE', HOW: 'HOW HE REALLY DIED', WHY: "YOUR SUSPECT'S REASON" };
const BLANKS: Blank[] = ['WHO', 'HOW', 'WHY'];
/** How far above the waist line the chest sits, as a share of the figure's box (PATIENCE goes there). */
const CHEST_ABOVE_WAIST = 0.11;
const pairKey = (a: string, b: string) => [a, b].sort().join('|');
/** The hand's width (the whole bottom, under the JOB column and the board: 340 + 40 + 760, the trace table's columns) and a card's: the strips
 * share it, never wider apart than a card and a gap. */
const HAND_W = 1140;
const CARD_W = 120;

export interface DeductionBoard {
  root: HTMLElement;
  show(v: BoardView): void;
  /** The board's line for the last move (a deduction's text, a near miss, a bounce). */
  say(text: string): void;
  /** She's speaking (ride-along replies): the board takes no moves until she's done, and says who's on the line. */
  hold(name: string | null): void;
  /** NOT IN YOUR HAND shown or hidden with the board (it may live outside it, in the JOB column). */
  missing(on: boolean): void;
  destroy(): void;
}

/** THEY CAN'T BOTH BE TRUE's count (playtest 2026-11-11): 3, 2, 1, each this long (0.8 s since 2026-11-12, for the bass hit to land), then the result lands. */
export const COUNT_MS = 800;

/** How long after a wrong verdict the patience it cost sounds. */
const PATIENCE_CUE_MS = 900;

export function mountDeduction(host: HTMLElement, o: { onMove(m: BoardMove): void; /** `n`: the number shown, on a `count`. */ onCue?(name: 'move' | 'confirm' | 'lock' | 'count' | 'result', n?: number): void; /** One of Nix's barks to play (The Fourteenth voice script). */ onBark?(url: string): void; /** No count under reduced motion: the result lands at once. */ reduced?(): boolean; /** Where DEDUCTIONS and NOT IN YOUR HAND stand (the trace table: the JOB column's region, under the beat's words); without it they stay beside the suspects. */ side?: HTMLElement; /** The side's list changed height (the JOB column above it is sized from what's left). */ onResize?(): void }): DeductionBoard {
  const root = el('div', 'tb-dboard');
  const clock = el('div', 'dd-patience');
  const x = el('div', 'dd-slot');
  const y = el('div', 'dd-slot');
  const press = el('button', 'dd-press', "THEY CAN'T BOTH BE TRUE");
  press.type = 'button';
  const vs = el('div', 'dd-vs');
  const verdict = el('div', 'dd-verdict');
  const held = el('div', 'dd-held');
  held.hidden = true;
  let holding = false;
  // The middle column holds the clock, the claim and the board's line, so the top half fits above the hand (playtest).
  // The count over AGAINST while a pair is judged (playtest: a beat before the result, as in a courtroom).
  const count = el('div', 'dd-count');
  count.hidden = true;
  vs.append(clock, held, el('b', '', 'AGAINST'), press, verdict, count);
  // PATIENCE leaves the middle column for her chest when she's on the stage (playtest 2026-11-12): her temper, on her.
  root.append(clock);
  // A pinned card keeps its whole picture; its words print under its slot, larger, where the two are compared.
  const xCap = el('div', 'dd-cap');
  const yCap = el('div', 'dd-cap');
  const side = (slot: HTMLElement, cap: HTMLElement) => {
    const w = el('div', 'dd-sw');
    w.append(slot, cap);
    // The whole slot unpins (the trace board shows a pinned card as its words, not as a card).
    w.onclick = (e) => {
      const i = w === against.firstElementChild ? 0 : 1;
      // Only where the slot shows the words (the trace board); a phone's slot holds the card, which unpins itself.
      if (!o.side || holding || counting || !picks[i] || (e.target as HTMLElement).closest('.dd-card')) return;
      picks = picks.filter((_, j) => j !== i);
      draw();
    };
    return w;
  };
  const against = el('div', 'dd-against');
  against.append(side(x, xCap), vs, side(y, yCap));
  const hand = el('div', 'dd-hand');
  // The case field: the suspects (the named one opens its blanks), a hint while nobody is named, the deductions beside.
  const sus = el('div', 'dd-sus');
  const hint = el('div', 'dd-hint', 'NAME A SUSPECT: THEIR WHO, HOW AND WHY OPEN UNDER THEM');
  const left = el('div', 'dd-left');
  left.append(sus, hint);
  const deds = el('div', 'dd-deds');
  // ACCUSE sits in the named suspect's card; with nobody named (patience gone) it waits under the deductions.
  const accuse = el('button', 'dd-accuse', 'ACCUSE');
  accuse.type = 'button';
  const dcol = el('div', 'dd-dcol');
  dcol.append(el('div', 'dd-h', 'DEDUCTIONS'), deds);
  const field = el('div', 'dd-field');
  // The leaders (mockup boards-trace.html): from each filed deduction to the blank it fills, and from each pinned card
  // to its slot, drawn on the table (drawTrace).
  field.append(left);
  (o.side ?? field).append(dcol);
  const main = el('div', 'dd-main');
  main.append(against, field);
  const missing = el('div', 'dd-missing');
  // NOT IN YOUR HAND under the deductions: in the JOB column it printed over the beat's words (playtest).
  dcol.append(missing);
  root.append(main, hand);
  host.append(root);

  let view: BoardView | null = null;
  // A count under way: the board takes no moves, keeps the two cards pinned, and holds what the server says (its next
  // board, the verdict) until the count lands, so the answer never shows early.
  let counting = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let heldView: BoardView | null = null;
  let heldSay: string | null = null;
  let picks: string[] = [];
  let dsel: string | null = null;

  const cardEl = (id: string): HTMLButtonElement => {
    const c = view!.hand.find((h) => h.id === id)!;
    const b = el('button', 'dd-card');
    b.type = 'button';
    b.dataset.id = id;
    b.dataset.k = c.kind;
    // The card as the accounts board's (playtest 2026-11-12): no picture, a dark face in the HUD's cut outline with a
    // stripe of its kind down the left, its source typed, its kind under it, its line always showing.
    b.append(el('span', 'dd-nm', c.source), el('span', 'dd-ft', c.kind.toUpperCase()), el('span', 'dd-line', c.line));
    return b;
  };

  /** WHO, HOW and WHY for the named suspect's card: a picked deduction files into the one clicked. */
  function blanksEl(v: BoardView): HTMLElement {
    const box = el('div', 'dd-blanks');
    for (const b of BLANKS) {
      const row = el('div', 'dd-blank');
      row.dataset.b = b;
      // The word alone beside its slot; an empty slot asks its question (mockup accuse-panel.html D, playtest pick).
      const q = el('div', 'dd-q', b);
      setTip(q, BLANK_LABEL[b]);
      const d = v.blanks[b];
      const slot = el('div', `dd-bslot${d ? ' full' : dsel ? ' hot' : ''}`);
      if (d) {
        const t = el('span', 'dd-t');
        t.append(el('span', 'dd-k', d), document.createTextNode(v.filed.find((f) => f.id === d)?.text ?? ''));
        slot.append(t);
      } else slot.textContent = BLANK_LABEL[b];
      slot.onclick = () => {
        if (dsel) {
          o.onMove({ kind: 'file', deduction: dsel, blank: b });
          dsel = null;
          graftCue('filed');
        } else if (d) o.onMove({ kind: 'unfile', blank: b });
        draw();
      };
      row.append(q, slot);
      box.append(row);
    }
    return box;
  }

  function draw(): void {
    const v = view;
    if (!v) return;
    clock.replaceChildren(...Array.from({ length: v.patienceMax }, (_, i) => el('i', i < v.patienceMax - v.patience ? 'f' : '')), el('span', '', 'PATIENCE'));
    for (const [slot, cap, i] of [[x, xCap, 0], [y, yCap, 1]] as const) {
      const id = picks[i];
      slot.replaceChildren();
      cap.replaceChildren();
      if (id) {
        const card = v.hand.find((h) => h.id === id)!;
        cap.append(el('span', 'dd-cap-src', card.source), el('span', 'dd-cap-line', card.line));
        slot.parentElement!.dataset.k = card.kind;
        const c = cardEl(id);
        c.onclick = () => {
          picks = picks.filter((p) => p !== id);
          draw();
        };
        slot.append(c);
      } else {
        slot.append(el('span', 'dd-empty', 'THIS'));
        delete slot.parentElement!.dataset.k;
      }
    }
    press.disabled = picks.length < 2 || v.patience === 0;
    // The hand: flat along the bottom from its left edge (playtest 2026-11-11: no fan), in fixed strips, so the card under
    // the pointer is decided by x alone and a lifted card never slides out from under it (playtest: the cards flickered).
    // A big hand overlaps evenly. Picking a card marks the ones already tried with it.
    const pick = picks[0] ?? null;
    const n = v.hand.length;
    const step = n > 1 ? Math.min(CARD_W + 12, (HAND_W - CARD_W) / (n - 1)) : 0;
    const lead = 0;
    hand.replaceChildren();
    hand.dataset.n = String(n);
    v.hand.forEach((c, i) => {
      const strip = el('div', 'dd-fs');
      strip.dataset.id = c.id;
      strip.style.left = `${lead + i * step}px`;
      strip.style.width = `${i === n - 1 ? CARD_W : step}px`;
      const b = cardEl(c.id);
      b.tabIndex = -1;
      if (picks.includes(c.id)) b.classList.add('used');
      const t = pick && pick !== c.id ? v.tried[pairKey(pick, c.id)] : undefined;
      if (t) b.append(el('span', `dd-badge ${t}`, t === 'filed' ? 'FILED' : 'TRIED'));
      strip.onclick = () => {
        if (holding || v.patience === 0 || picks.includes(c.id) || picks.length >= 2) return;
        picks = [...picks, c.id];
        o.onCue?.('move');
        draw();
      };
      strip.append(b);
      hand.append(strip);
    });
    // The suspects: the named one widens and holds WHO, HOW and WHY under its portrait, with ACCUSE.
    sus.replaceChildren();
    for (const s of v.suspects) {
      const on = v.suspect === s.name;
      const card = el('div', `dd-suspect${on ? ' on' : ''}`);
      const b = el('button', 'dd-pick');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(on));
      const img = el('img', '');
      img.src = `/api/extras/${s.face}`;
      img.alt = '';
      b.append(img, el('span', 'dd-nm', s.name), el('span', 'dd-rl', s.role));
      setTip(b, s.role);
      b.onclick = () => o.onMove({ kind: 'name', suspect: on ? null : s.name });
      if (on) {
        // The named card: the portrait with ACCUSE as a bar under it, the blanks beside (mockup accuse-panel.html D).
        const pcol = el('div', 'dd-pcol');
        pcol.append(b, accuse);
        card.append(pcol, blanksEl(v));
      } else card.append(b);
      sus.append(card);
    }
    hint.hidden = v.suspect !== null;
    // First in the column with nobody named, so a long list of deductions never scrolls it out of sight (playtest).
    if (v.suspect === null) dcol.prepend(accuse);
    deds.replaceChildren();
    if (!v.filed.length) deds.append(el('div', 'dd-ded dim', "Two cards that can't both be true make a deduction."));
    const placed = new Set(Object.values(v.blanks));
    for (const f of v.filed) {
      const b = el('button', `dd-ded${dsel === f.id ? ' sel' : ''}${placed.has(f.id) ? ' placed' : ''}`);
      b.type = 'button';
      b.dataset.id = f.id;
      b.append(el('span', 'dd-k', f.id), document.createTextNode(f.text));
      b.onclick = () => {
        dsel = dsel === f.id ? null : f.id;
        draw();
      };
      deds.append(b);
    }
    accuse.disabled = !v.accuseOpen;
    missing.replaceChildren();
    if (v.missing.length) {
      missing.append(el('div', 'dd-h', 'NOT IN YOUR HAND'));
      for (const m of v.missing) {
        const row = el('div', 'dd-mc');
        const w = el('span', 'dd-w', m.n && m.n > 1 ? `${m.source} · ${m.n} CARDS` : m.source);
        w.append(el('small', '', m.missed));
        row.append(el('span', 'dd-back'), w);
        missing.append(row);
      }
    }
    requestAnimationFrame(() => {
      drawTrace();
      placeClock();
    });
  }

  /**
   * PATIENCE over the chest of the figure on the right (the contact, at the board), where `WAIST_LINE` puts every waist
   * at the same share of the figure's box: the chest a little above it. With no figure up it keeps its place over AGAINST.
   */
  function placeClock(): void {
    const fig = document.querySelector<HTMLElement>('.stage-figure.stage-right');
    const fr = fig?.getBoundingClientRect();
    const par = (clock.offsetParent as HTMLElement | null) ?? null;
    if (!fig || !fr || !fr.width || !fr.height || getComputedStyle(fig).display === 'none' || !par) {
      if (clock.parentElement !== vs) vs.prepend(clock);
      clock.classList.remove('on-fig');
      return;
    }
    if (clock.parentElement !== root) root.append(clock);
    clock.classList.add('on-fig');
    const pr = (clock.offsetParent as HTMLElement).getBoundingClientRect();
    const k = pr.width / (clock.offsetParent as HTMLElement).offsetWidth || 1;
    clock.style.left = `${Math.round((fr.left + fr.width / 2 - pr.left) / k)}px`;
    clock.style.top = `${Math.round((fr.top + fr.height * (WAIST_LINE - CHEST_ABOVE_WAIST) - pr.top) / k)}px`;
  }

  /** The leaders' keys on the table, so the ones that ended are taken off. */
  let leads: string[] = [];
  const dropLeads = (): void => {
    for (const k of leads) clearLead(host, k);
    leads = [];
  };
  /**
   * The leaders (mockup boards-trace.html), on the table's own pixels: an amber one from each filed deduction to the
   * blank it fills, in its own lane between the two columns; a cyan one from each pinned card up onto the hand's rail,
   * out to the board's edge and into its slot's side. Only where there's a layout (never in a unit test's page).
   */
  function drawTrace(): void {
    const v = view;
    const next: string[] = [];
    if (v && !root.hidden && host.offsetWidth > 0 && !host.classList.contains('phone')) {
      const mid = (r: { top: number; height: number }) => Math.round(r.top + r.height / 2);
      const col = hostRect(host, dcol);
      BLANKS.forEach((b, i) => {
        const d = v.blanks[b];
        const from = d ? [...deds.querySelectorAll<HTMLElement>('.dd-ded')].find((n) => n.dataset.id === d) : null;
        const to = sus.querySelector<HTMLElement>(`.dd-blank[data-b="${b}"] .dd-bslot`);
        if (!from || !to) return;
        const f = hostRect(host, from);
        const t = hostRect(host, to);
        // A deduction scrolled out of its column has no place to start from.
        if (!f.width || !t.width || mid(f) < col.top || mid(f) > col.bottom || t.left - f.right < 24) return;
        const x = Math.round(f.right + 10 + i * 6);
        const key = `dd-file-${b}`;
        traceVia(host, key, [[Math.round(f.right + 3), mid(f)], [x, mid(f)], [x, mid(t)], [Math.round(hostRect(host, to.parentElement!).left - 20), mid(t)]], 'var(--t-amber, #ffc56b)');
        next.push(key);
      });
      const h = hostRect(host, hand);
      picks.forEach((id, i) => {
        const card = [...hand.querySelectorAll<HTMLElement>('.dd-fs')].find((n) => n.dataset.id === id)?.querySelector<HTMLElement>('.dd-card');
        const slot = against.children[i === 0 ? 0 : 2] as HTMLElement | undefined;
        if (!card || !slot) return;
        const c = hostRect(host, card);
        const s = hostRect(host, slot);
        if (!c.width || !s.width) return;
        const cx = Math.round(c.left + c.width / 2);
        // Over the hand's head (CLUES stands 22px above the cards), each on its own line.
        const rail = Math.round(h.top - 32 - i * 4);
        const edge = Math.round(i === 0 ? s.left - 16 : s.right + 16);
        if (rail < mid(s)) return;
        const key = `dd-pin-${i}`;
        traceVia(host, key, [[cx, Math.round(c.top - 3)], [cx, rail], [edge, rail], [edge, mid(s)], [Math.round(i === 0 ? s.left - 3 : s.right + 3), mid(s)]], 'var(--t-nerve, #7fe9ff)');
        next.push(key);
      });
    }
    for (const k of leads) if (!next.includes(k)) clearLead(host, k);
    leads = next;
  }
  // The pieces move with the stage's size, a font arriving, the deductions column's length: redraw on any of those.
  const traceObs = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => drawTrace());
  traceObs?.observe(field);
  traceObs?.observe(sus);
  traceObs?.observe(dcol);
  // A deduction filed or a card gone missing changes the list's height, never the region's: say so.
  if (o.side && typeof ResizeObserver !== 'undefined') new ResizeObserver(() => o.onResize?.()).observe(dcol);
  dcol.addEventListener('scroll', () => drawTrace(), { passive: true });
  const onResize = () => placeClock();
  addEventListener('resize', onResize);

  press.onclick = () => {
    if (holding || counting || picks.length < 2) return;
    o.onMove({ kind: 'pair', a: picks[0], b: picks[1] });
    o.onCue?.('lock');
    if (o.reduced?.()) {
      picks = [];
      draw();
      return;
    }
    // 3, 2, 1 over AGAINST, the pair still in its slots; then what the server said lands at once.
    counting = true;
    root.classList.add('counting');
    verdict.textContent = '';
    verdict.className = 'dd-verdict';
    draw();
    const tick = (n: number) => {
      count.hidden = false;
      count.textContent = String(n);
      count.classList.remove('tick');
      void count.offsetWidth;
      count.classList.add('tick');
      o.onCue?.('count', n);
    };
    tick(3);
    timers.push(setTimeout(() => tick(2), COUNT_MS), setTimeout(() => tick(1), 2 * COUNT_MS));
    timers.push(setTimeout(land, 3 * COUNT_MS));
  };
  /** The count is over: the pair leaves its slots, and the board and verdict the server sent (held till now) land. */
  function land(): void {
    timers.forEach(clearTimeout);
    timers = [];
    counting = false;
    root.classList.remove('counting');
    count.hidden = true;
    picks = [];
    const v = heldView;
    const text = heldSay;
    heldView = null;
    heldSay = null;
    // A filed deduction lands in amber, a bounce or a near miss in red.
    const hit = !!v && !!view && v.filed.length > view.filed.length;
    o.onCue?.('result');
    if (v) graftCue(hit ? 'verdict-right' : 'verdict-wrong');
    // Patience going with a wrong one sounds after the verdict, not under it.
    if (v && view && v.patience < view.patience) timers.push(setTimeout(() => graftCue('patience'), PATIENCE_CUE_MS));
    if (v) apply(v);
    else draw();
    if (text !== null) {
      verdict.textContent = text;
      verdict.className = `dd-verdict stamp ${hit ? 'hit' : 'miss'}`;
    }
  }
  accuse.onclick = () => {
    if (holding || counting || !view?.accuseOpen) return;
    graftCue('accuse');
    o.onMove({ kind: 'accuse' });
  };

  /** The last clip each group played, so the same one doesn't play twice running. */
  const lastClip: Record<string, string> = {};
  function bark(prev: BoardView, v: BoardView): void {
    const g = barkGroup(prev, v);
    const clips = g ? v.barks?.clips[g] : undefined;
    if (!g || !clips?.length) return;
    const pool = clips.length > 1 ? clips.filter((c) => c !== lastClip[g]) : clips;
    const url = pool[Math.floor(Math.random() * pool.length)];
    lastClip[g] = url;
    o.onBark?.(url);
  }

  /** A board from the server, drawn (its bark set off by what changed). */
  function apply(v: BoardView): void {
    const prev = view;
    const fresh = view?.case !== v.case;
    view = v;
    // A move that changed the board may set off a bark; a board just shown (a reload, a new case) says nothing.
    if (prev && !fresh) bark(prev, v);
    if (fresh) {
      picks = [];
      dsel = null;
      verdict.textContent = '';
    }
    // A pick that's no longer in hand, or a deduction no longer filed, is dropped.
    picks = picks.filter((p) => v.hand.some((h) => h.id === p));
    if (dsel && !v.filed.some((f) => f.id === dsel)) dsel = null;
    draw();
  }

  return {
    root,
    show(v) {
      // Mid count, the next board waits for it to land; a new case (a reload, another job) ends the count.
      if (counting && view?.case === v.case) {
        heldView = v;
        return;
      }
      if (counting) {
        timers.forEach(clearTimeout);
        timers = [];
        counting = false;
        root.classList.remove('counting');
        count.hidden = true;
        heldView = null;
        heldSay = null;
      }
      apply(v);
    },
    say(text) {
      if (counting) {
        heldSay = text;
        return;
      }
      verdict.textContent = text;
      verdict.className = 'dd-verdict';
    },
    missing(on) {
      missing.hidden = !on;
      // In the JOB column's region the whole list goes with the board.
      if (o.side) dcol.hidden = !on;
      if (!on) dropLeads();
    },
    hold(name) {
      holding = name !== null;
      root.classList.toggle('held', holding);
      held.hidden = !holding;
      held.textContent = holding ? `${name!.toUpperCase()} ON THE LINE` : '';
    },
    destroy() {
      timers.forEach(clearTimeout);
      traceObs?.disconnect();
      removeEventListener('resize', onResize);
      dropLeads();
      root.remove();
      dcol.remove();
      missing.remove();
    },
  };
}

/**
 * Which of a case's bark groups a change of board sets off (The Fourteenth voice script): a lost box of patience is
 * bounce1 the first time and bounce2 after, and gone when the last goes; a newly filed deduction is clash, or the group
 * the case names for it (`barks:` in the case file, The Fourteenth's kat) the first time one of that group's files.
 */
export function barkGroup(prev: BoardView, v: BoardView): string | null {
  if (v.patience < prev.patience) return v.patience === 0 ? 'gone' : v.patienceMax - v.patience === 1 ? 'bounce1' : 'bounce2';
  const had = new Set(prev.filed.map((f) => f.id));
  const added = v.filed.filter((f) => !had.has(f.id)).map((f) => f.id);
  if (!added.length) return null;
  for (const [g, ids] of Object.entries(v.barks?.on ?? {})) if (added.some((id) => ids.includes(id)) && !ids.some((id) => had.has(id))) return g;
  return 'clash';
}
