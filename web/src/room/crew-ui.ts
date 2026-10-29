/** Small pieces the CREW screen's tabs share (crew spec §4). */

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
