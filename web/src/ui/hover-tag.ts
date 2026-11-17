/**
 * Small tags in the HUD trace (mockup overlay-hud.html B TRACE, 2026-11-13), in place of the browser's own tooltips: a
 * control says what it is, or why it's shut, in a pixel tag over it with a short leader. `setTip` marks a control; one
 * tag on the stage serves them all. A trailing shortcut, "(Alt+R)", shows dim beside the words.
 */
import { clearLead, hostRect, traceLead } from './trace-lead';

/** How long the pointer rests on a control before its tag shows. */
export const TAG_DWELL_MS = 250;
/** Between the control and its tag: the leader. */
const GAP = 10;

/** Marks `el` with its tag's words (null: none). Screen readers hear them as its description; the native tooltip goes. */
export function setTip(el: HTMLElement, text: string | null | undefined): void {
  el.removeAttribute('title');
  if (text) {
    el.dataset.tip = text;
    el.setAttribute('aria-description', text);
  } else {
    delete el.dataset.tip;
    el.removeAttribute('aria-description');
  }
}

/** The words and a trailing shortcut in brackets: `REGENERATE (Alt+R)` → `REGENERATE`, `Alt+R`. */
export function splitCap(text: string): { words: string; cap: string | null } {
  const m = /^(.*\S)\s+\(((?:Alt|Ctrl|Shift|Enter|Esc)[^()]*)\)$/su.exec(text);
  return m ? { words: m[1], cap: m[2] } : { words: text, cap: null };
}

/** The one tag for every `[data-tip]` under `host`. Returns its removal. */
export function installHoverTags(host: HTMLElement): () => void {
  const tag = document.createElement('div');
  tag.className = 'hv-tag';
  tag.hidden = true;
  tag.setAttribute('role', 'tooltip');
  tag.setAttribute('aria-hidden', 'true');
  host.append(tag);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let over: HTMLElement | null = null;

  const tipOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('[data-tip]') : null);
  const hide = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    tag.hidden = true;
    clearLead(host, 'tag');
  };
  const show = (el: HTMLElement) => {
    const text = el.dataset.tip;
    if (!text || !el.isConnected) return;
    const { words, cap } = splitCap(text);
    tag.replaceChildren(words);
    if (cap) {
      const c = document.createElement('span');
      c.className = 'hv-cap';
      c.textContent = cap;
      tag.append(c);
    }
    tag.hidden = false;
    // Over the control, else under it; lined up with its left edge, kept inside the host.
    const r = hostRect(host, el);
    const w = tag.offsetWidth;
    const h = tag.offsetHeight;
    const above = r.top - GAP - h >= 0;
    const x = Math.max(4, Math.min(r.left, host.offsetWidth - w - 4));
    const y = above ? r.top - GAP - h : Math.min(r.bottom + GAP, host.offsetHeight - h);
    tag.style.left = `${x}px`;
    tag.style.top = `${y}px`;
    const mid = Math.min(Math.max(r.left + r.width / 2, x + 6), x + w - 6);
    traceLead(host, 'tag', [mid, above ? r.top - 1 : r.bottom], [mid, above ? y + h : y - 1]);
  };
  const enter = (e: Event) => {
    const el = tipOf(e.target);
    if (el === over) return;
    hide();
    over = el;
    if (el) timer = setTimeout(() => show(el), TAG_DWELL_MS);
  };
  const leave = (e: Event) => {
    const to = tipOf((e as MouseEvent).relatedTarget ?? null);
    if (to && to === over) return;
    over = null;
    hide();
  };
  const focus = (e: Event) => {
    const el = tipOf(e.target);
    if (!el || !(e.target as Element).matches(':focus-visible')) return;
    hide();
    over = el;
    show(el);
  };
  const press = () => {
    hide();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') hide();
  };
  host.addEventListener('pointerover', enter);
  host.addEventListener('pointerout', leave);
  host.addEventListener('focusin', focus);
  host.addEventListener('focusout', leave);
  host.addEventListener('pointerdown', press, true);
  host.addEventListener('wheel', press, { passive: true });
  window.addEventListener('keydown', key);
  return () => {
    hide();
    host.removeEventListener('pointerover', enter);
    host.removeEventListener('pointerout', leave);
    host.removeEventListener('focusin', focus);
    host.removeEventListener('focusout', leave);
    host.removeEventListener('pointerdown', press, true);
    host.removeEventListener('wheel', press);
    window.removeEventListener('keydown', key);
    tag.remove();
  };
}
