/**
 * Typing over laid-out text (the crew rules' board: its page and her comms line, playtest "one voice"): the text in
 * `root` is drawn whole by its owner, and what has newly arrived past the shown text types in at the box settings' TEXT
 * speed, with its TEXT EFFECT, as the chat box types a reply (feed.ts, typing.ts charDelay and noiseOf). The text past the
 * frontier stays in place, hidden (`unshown`) or worn as glyph noise (`unshown noise`, style.css), so nothing reflows as
 * it types; a block cursor stands at the frontier. The owner calls `changed()` after each redraw.
 *
 * Only new text types: what was shown stays shown (the common start of the old text and the new), and the first text
 * after mount or `reset()` (a reload, the board coming back up) stands whole. INSTANT and reduced motion show it at once.
 */
import type { TextEffect } from './box-prefs';
import { charDelay, noiseOf } from './typing';

export interface TypeIn {
  /** The owner redrew `root`: whatever is new past what was shown types in. */
  changed(): void;
  /** Takes the typing's own marks off before the owner redraws (they'd be carried into nodes it keeps); `changed()` puts them back. */
  strip(): void;
  /** The next text stands whole (nothing on the page yet, or the page coming back). */
  reset(): void;
  /** Shows the rest now; true when something was typing. */
  finish(): boolean;
  typing(): boolean;
  /** The TEXT speed as the box takes it (typing.ts textSpeedScale): a pace scale, 0 for at once. */
  setTextSpeed(scale: number): void;
  setTextEffect(e: TextEffect): void;
}

export interface TypeInOptions {
  reduced(): boolean;
  /** Whether typing is on now (off: every change stands whole, as it always did). */
  active?(): boolean;
  /** Text inside these isn't typed (her noise while she writes): it shows as it is. */
  skip?: string;
  /** Blocks whose words haven't started yet: their label (a ::before) waits with them (`tw-wait`). */
  blocks?: string;
  /** The box that scrolls to keep the cursor in view (default `root`). */
  scroller?: HTMLElement;
  /**
   * Inline objects typed as one character each (narration images): an element matching `selector` holds one character;
   * the typing waits `ms × pace` after it, and `reach(el, ms × pace)` says when the frontier passes it. Whatever shows
   * without being typed past (finish, a page standing whole) is reached with 0.
   */
  objects?: { selector: string; ms: number; reach(el: HTMLElement, ms: number): void };
}

const MARK = 'tw';

export function typeIn(root: HTMLElement, o: TypeInOptions): TypeIn {
  let pace = 1;
  let effect: TextEffect = 'type';
  let full = '';
  let shown = 0;
  let fresh = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const skipSel = [`[data-${MARK}]`, o.skip].filter(Boolean).join(', ');
  const scroller = o.scroller ?? root;

  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  /** Takes the last paint's wrappers off: the owner's own nodes, as it drew them. */
  const unwrap = () => {
    const marks = root.querySelectorAll<HTMLElement>(`[data-${MARK}]`);
    if (marks.length === 0) return;
    for (const m of marks) {
      if (m.dataset[MARK] === 'cursor') m.remove();
      else m.replaceWith(document.createTextNode(m.dataset.text ?? m.textContent ?? ''));
    }
    root.normalize();
    for (const b of root.querySelectorAll('.tw-wait')) b.classList.remove('tw-wait');
  };
  /** The text nodes that type, in order. */
  const textNodes = (): Text[] => {
    const out: Text[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement?.closest(skipSel) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
    return out;
  };
  const plain = () => textNodes().map((t) => t.data).join('');
  /** Objects already reached, so each is reached once. */
  const reached = new WeakSet<HTMLElement>();
  /** The object the character at `i` sits in, if any. */
  const objectAt = (i: number): HTMLElement | null => {
    if (!o.objects) return null;
    let at = 0;
    for (const t of textNodes()) {
      if (i < at + t.data.length) return t.parentElement?.closest<HTMLElement>(o.objects.selector) ?? null;
      at += t.data.length;
    }
    return null;
  };
  /** Every object not yet reached is reached at once (the page shows whole). */
  const reachAll = () => {
    if (!o.objects) return;
    for (const el of root.querySelectorAll<HTMLElement>(o.objects.selector)) {
      if (reached.has(el)) continue;
      reached.add(el);
      o.objects.reach(el, 0);
    }
  };

  const hidden = (text: string): HTMLElement => {
    const s = document.createElement('span');
    s.dataset[MARK] = 'rest';
    s.dataset.text = text;
    const noise = effect === 'decode' && !o.reduced();
    s.className = noise ? 'unshown noise' : 'unshown';
    if (!noise) {
      s.textContent = text;
      return s;
    }
    s.setAttribute('aria-hidden', 'true');
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        s.append(part);
        continue;
      }
      const w = document.createElement('span');
      w.className = 'nw';
      w.textContent = part;
      w.dataset.n = noiseOf(part);
      s.append(w);
    }
    return s;
  };

  const paint = () => {
    unwrap();
    if (shown >= full.length) return;
    let at = 0;
    let cursorAt: Text | null = null;
    for (const t of textNodes()) {
      const end = at + t.data.length;
      if (end <= shown) {
        at = end;
        continue;
      }
      if (at < shown) {
        // The frontier falls inside this node: the shown part stays, the rest is wrapped, the cursor between.
        const rest = t.splitText(shown - at);
        cursorAt = t;
        rest.replaceWith(hidden(rest.data));
      } else {
        if (!cursorAt) cursorAt = t;
        t.replaceWith(hidden(t.data));
      }
      at = end;
    }
    const cursor = document.createElement('span');
    cursor.className = 'type-cursor';
    cursor.dataset[MARK] = 'cursor';
    cursor.setAttribute('aria-hidden', 'true');
    // At the frontier: after the shown part of the node it falls in, or before the first wrapped run.
    const firstRest = root.querySelector<HTMLElement>(`[data-${MARK}="rest"]`);
    if (cursorAt?.isConnected) cursorAt.after(cursor);
    else firstRest?.before(cursor);
    // A block none of whose words are out yet keeps its label back too.
    if (o.blocks) {
      for (const b of root.querySelectorAll<HTMLElement>(o.blocks)) {
        if (b.querySelector(`[data-${MARK}="rest"]`) && !shownIn(b, skipSel)) b.classList.add('tw-wait');
      }
    }
    follow(cursor);
  };
  /** Keeps the cursor in view: the box scrolls on as the typing runs past its foot. */
  const follow = (cursor: HTMLElement) => {
    if (!cursor.isConnected || scroller.clientHeight === 0) return;
    const box = scroller.getBoundingClientRect();
    const c = cursor.getBoundingClientRect();
    const z = box.height > 0 ? box.height / scroller.clientHeight : 1;
    const over = (c.bottom - box.bottom) / z + 26;
    if (over > 0) scroller.scrollTop += over;
  };
  const tick = () => {
    timer = null;
    if (shown >= full.length) return;
    shown += 1;
    paint();
    let wait = charDelay(full, shown - 1) * pace;
    const el = objectAt(shown - 1);
    if (el && o.objects && !reached.has(el)) {
      reached.add(el);
      wait = o.objects.ms * pace;
      o.objects.reach(el, wait);
    }
    if (shown < full.length) timer = setTimeout(tick, wait);
  };
  const whole = () => o.active?.() === false || pace === 0 || o.reduced();

  return {
    changed() {
      stop();
      unwrap();
      const next = plain();
      const was = full.slice(0, shown);
      full = next;
      if (fresh || whole()) {
        fresh = false;
        shown = full.length;
        reachAll();
        return;
      }
      let p = 0;
      while (p < was.length && was[p] === next[p]) p += 1;
      shown = p;
      // What was already shown before the change stands: an object in it is reached.
      if (o.objects) {
        let at = 0;
        for (const t of textNodes()) {
          if (at >= p) break;
          const el = t.parentElement?.closest<HTMLElement>(o.objects.selector);
          if (el && !reached.has(el)) {
            reached.add(el);
            o.objects.reach(el, 0);
          }
          at += t.data.length;
        }
      }
      paint();
      if (shown < full.length) timer = setTimeout(tick, 0);
    },
    strip() {
      stop();
      unwrap();
    },
    reset() {
      stop();
      unwrap();
      fresh = true;
      full = '';
      shown = 0;
    },
    finish() {
      if (shown >= full.length) return false;
      stop();
      shown = full.length;
      unwrap();
      reachAll();
      return true;
    },
    typing: () => shown < full.length,
    setTextSpeed(scale) {
      pace = scale;
      if (scale === 0) this.finish();
    },
    setTextEffect(e) {
      if (e === effect) return;
      effect = e;
      if (shown < full.length) paint();
    },
  };
}

/** Whether any of `el`'s own words show (not wrapped as unshown, not skipped). */
function shownIn(el: Element, skipSel: string): boolean {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentElement?.closest(skipSel) && (n as Text).data.trim() !== '') return true;
  return false;
}
