/**
 * The notice on the splash (docs/mockups/splash-notice.html): a message set in Studio, in a
 * scrolling panel placed on the art. Keys, the wheel and the rail scroll it; touch scrolls it natively.
 */
import { parseNotice, type SplashNotice, type SplashPanel } from '../../../shared/splash';
import './splash-notice.css';

/** What the game shows of a notice. */
export type NoticeText = Omit<SplashNotice, 'on'>;

export interface NoticePanel {
  el: HTMLElement;
  set(notice: NoticeText, panel: SplashPanel): void;
  /** Scrolls for a key; false when the key isn't a scrolling one. */
  key(key: string): boolean;
  scrollBy(dy: number): void;
  destroy(): void;
}

const LINE = 64;
/** A page keeps this much of the last one in view. */
const PAGE_KEEP = 40;

const el = (tag: string, cls: string, text?: string) => {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

export function mountNotice(host: HTMLElement, o: { print: boolean; after?: Promise<void> }): NoticePanel {
  const wrap = el('div', 'sn-wrap');
  if (o.print && o.after) {
    // Under the opening card: held back, so it prints when the card has gone.
    wrap.classList.add('held');
    void o.after.then(() => wrap.classList.replace('held', 'print'));
  } else if (o.print) wrap.classList.add('print');
  const title = el('h2', 'sn-title');
  const tag = el('span', 'sn-tag');
  const scroll = el('div', 'sn-scroll');
  scroll.setAttribute('role', 'region');
  const rail = el('div', 'sn-rail');
  rail.setAttribute('aria-hidden', 'true');
  const body = el('div', 'sn-body');
  body.append(scroll, rail);
  const inner = el('div', 'sn-in');
  const head = el('header', 'sn-head');
  head.append(title, tag);
  inner.append(head, body, el('div', 'sn-foot', '[↑↓] SCROLL'));
  const panel = el('section', 'sn-panel');
  panel.append(inner);
  wrap.append(panel);
  host.append(wrap);

  const sync = () => {
    const thumb = rail.querySelector('b');
    if (!thumb || !scroll.scrollHeight) return;
    const railH = rail.clientHeight;
    thumb.style.top = `${(scroll.scrollTop / scroll.scrollHeight) * railH}px`;
    thumb.style.height = `${(scroll.clientHeight / scroll.scrollHeight) * railH}px`;
    const top = scroll.scrollTop;
    const bottom = top + scroll.clientHeight;
    for (const t of rail.querySelectorAll('i')) t.classList.toggle('lit', Number(t.dataset.end) > top && Number(t.dataset.at) < bottom);
    body.classList.toggle('at-end', bottom >= scroll.scrollHeight - 2);
  };
  /** The ticks, at each entry's place in the text as it's laid out now. */
  const buildRail = () => {
    const railH = rail.clientHeight;
    const ticks = [...scroll.querySelectorAll<HTMLElement>('.sn-entry')].map((e) => {
      const t = document.createElement('i');
      if (e.dataset.alt) t.className = 'alt';
      t.dataset.at = String(e.offsetTop);
      t.dataset.end = String(e.offsetTop + e.offsetHeight);
      t.style.top = `${scroll.scrollHeight ? (e.offsetTop / scroll.scrollHeight) * (railH - 2) : 0}px`;
      return t;
    });
    rail.replaceChildren(...ticks, document.createElement('b'));
    sync();
  };

  let text: string | null = null;
  const render = (t: string) => {
    scroll.replaceChildren();
    parseNotice(t).forEach((s, i) => {
      // Every second section takes the amber: Fixes, in patch notes.
      const alt = i % 2 === 1;
      if (s.title) scroll.append(el('h3', `sn-sec${alt ? ' alt' : ''}`, s.title));
      for (const e of s.entries) {
        const entry = el('article', 'sn-entry');
        if (alt) entry.dataset.alt = '1';
        if (e.head) entry.append(el('h4', '', e.head));
        if (e.body) entry.append(el('p', '', e.body));
        scroll.append(entry);
      }
    });
  };

  // The rail: a click or drag puts that part of the text in view.
  const toPointer = (e: PointerEvent) => {
    const r = rail.getBoundingClientRect();
    if (r.height) scroll.scrollTop = ((e.clientY - r.top) / r.height) * scroll.scrollHeight - scroll.clientHeight / 2;
  };
  const endRail = () => {
    window.removeEventListener('pointermove', toPointer);
    window.removeEventListener('pointerup', endRail);
    window.removeEventListener('pointercancel', endRail);
  };
  rail.addEventListener('pointerdown', (e) => {
    toPointer(e);
    window.addEventListener('pointermove', toPointer);
    window.addEventListener('pointerup', endRail);
    window.addEventListener('pointercancel', endRail);
  });
  scroll.addEventListener('scroll', sync, { passive: true });
  // The panel resized, or its fonts arrived: the text moved under the ticks.
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(buildRail);
  observer?.observe(scroll);
  void document.fonts?.ready.then(buildRail);

  return {
    el: wrap,
    set(n, p) {
      title.textContent = n.title;
      tag.textContent = n.tag;
      scroll.setAttribute('aria-label', n.title);
      Object.assign(wrap.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.width}px`, height: `${p.height}px` });
      if (n.text !== text) {
        text = n.text;
        render(n.text);
        scroll.scrollTop = 0;
      }
      buildRail();
    },
    key(key) {
      const page = scroll.clientHeight - PAGE_KEEP;
      const step = ({ ArrowDown: LINE, ArrowUp: -LINE, PageDown: page, PageUp: -page } as Record<string, number>)[key];
      if (step !== undefined) scroll.scrollTop += step;
      else if (key === 'Home') scroll.scrollTop = 0;
      else if (key === 'End') scroll.scrollTop = scroll.scrollHeight;
      else return false;
      return true;
    },
    scrollBy(dy) {
      scroll.scrollTop += dy;
    },
    destroy() {
      endRail();
      observer?.disconnect();
      wrap.remove();
    },
  };
}
