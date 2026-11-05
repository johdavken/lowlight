/** Small pieces the CREW panel's tabs share (crew spec §4). */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
}

/** `1,240`. */
export const sol = (n: number) => n.toLocaleString('en-US');
/** A story-clock minute's time of day, `02:40`. */
export function hhmm(at: number): string {
  const m = ((at % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
/** A recruit's face from extras, or their initial in a ring. */
export function face(r: { face: string | null; name: string }, cls: string): HTMLElement {
  if (r.face) {
    const img = el('img', cls);
    img.src = `/api/extras/${encodeURIComponent(r.face)}`;
    img.alt = '';
    return img;
  }
  return el('span', `${cls} cr-mono`, r.name.trim().charAt(0).toUpperCase());
}

/** A recruit's card picture, the size of SETUP's ready strip (`.cr-card84`). */
export function cardPic(r: { face: string | null; name: string }): HTMLElement {
  const pic = el('span', 'cr-card84');
  pic.append(face(r, 'cr-card84-face'));
  return pic;
}

/** A picture slot: its art, or the quiet hatch when it has none. */
export function artSlot(cls: string, url: string | undefined): HTMLElement {
  const n = el('span', url ? cls : `${cls} cr-noart`);
  if (url) n.style.backgroundImage = `url(${url})`;
  return n;
}

/** Redraws without losing where `[data-keep]` scrollers were: a refresh or a pick rebuilds the tab under them. */
export function keepScroll(root: HTMLElement, redraw: () => void): void {
  const at = new Map([...root.querySelectorAll<HTMLElement>('[data-keep]')].map((n) => [n.dataset.keep, [n.scrollLeft, n.scrollTop]]));
  redraw();
  for (const n of root.querySelectorAll<HTMLElement>('[data-keep]')) {
    const p = at.get(n.dataset.keep);
    if (p) [n.scrollLeft, n.scrollTop] = p;
  }
}
