/** The game map's places, down the left over the picture: each district a thread its name folds, as on a forum. */
import type { District, Place } from '../../../../shared/map-schema';
import { el } from './band';
import type { MapPerson, WhoIsWhere } from './city-map';

export interface PlaceThread {
  district: District;
  places: Place[];
}

export interface PlaceListOpts {
  /** A row clicked: the place is picked. */
  onPick: (id: string) => void;
  /** The picked place's row clicked again: the camera goes in to it. */
  onRevisit: (id: string) => void;
  /** The pointer over a row (null: off it): its pin pulses. */
  onHot: (id: string | null) => void;
  /** The pointer over a district's name (null: off it): its border lights. */
  onDistrict: (id: string | null) => void;
  /** A thread folded or unfolded. */
  onFold: () => void;
  /** The list's height changed. */
  onResize: () => void;
}

/** How far a row keeps from the top and foot of the list, where it fades out (stage px). */
const CLEAR_TOP = 100;
const CLEAR_FOOT = 80;
/** A thread's unfolding (`.kids` in map.css): a row can't be scrolled to until it's done. */
const UNFOLD_MS = 190;

/** A person's dot, in their colour. */
export const dot = (m: MapPerson): HTMLElement => {
  const b = el('b', '');
  b.style.setProperty('--c', m.accent);
  return b;
};

const dotsFor = (people: MapPerson[]): HTMLElement => {
  const dots = el('span', 'dots');
  dots.append(...people.map(dot));
  return dots;
};

export class PlaceList {
  readonly el = el('div', 'map-places');
  private readonly head = el('div', 'map-places-head', '◆ LOWLIGHT');
  private readonly threads = el('div', 'map-threads');
  private picked: string | null = null;
  private revealing = 0;

  constructor(private readonly opts: PlaceListOpts) {
    this.el.append(this.head, this.threads);
    this.el.addEventListener('click', (e) => this.click(e));
    this.el.addEventListener('mouseover', (e) => this.over(e));
    this.el.addEventListener('mouseleave', () => {
      opts.onHot(null);
      opts.onDistrict(null);
    });
    this.el.addEventListener('transitionend', () => opts.onResize());
  }

  /** Draws the threads with only your district's open. */
  render(threads: PlaceThread[], who: WhoIsWhere): void {
    this.picked = null;
    this.threads.replaceChildren(...threads.map((t) => this.thread(t, who)));
  }

  /** Where the title and rows reach on screen, for the district names they'd sit on. */
  box(): { left: number; right: number; top: number; bottom: number } {
    const { left, right, bottom } = this.threads.getBoundingClientRect();
    return { left, right, bottom, top: this.head.getBoundingClientRect().top };
  }

  /** Marks `id` picked: its thread unfolds and its row comes into the clear. */
  pick(id: string | null): void {
    this.picked = id;
    for (const r of this.threads.querySelectorAll<HTMLElement>('.row')) r.classList.toggle('on', r.dataset.place === id);
    const row = id ? this.row(id) : null;
    const thread = row?.closest('.thr') ?? null;
    for (const t of this.threads.querySelectorAll('.thr')) t.classList.toggle('picked', t === thread);
    if (!row || !thread) return;
    thread.classList.add('open');
    this.reveal(row);
  }

  /** A pin hovered: its row lights, or its district's name while the thread is shut. */
  hot(id: string | null): void {
    const row = id ? this.row(id) : null;
    const thread = row?.closest('.thr');
    for (const r of this.threads.querySelectorAll('.row')) r.classList.toggle('hot', r === row);
    for (const t of this.threads.querySelectorAll('.thr')) t.classList.toggle('hot', t === thread && !t.classList.contains('open'));
    if (row && thread?.classList.contains('open')) this.reveal(row);
  }

  clear(): void {
    clearTimeout(this.revealing);
    this.picked = null;
    this.threads.replaceChildren();
  }

  dispose(): void {
    clearTimeout(this.revealing);
  }

  private row(id: string): HTMLElement | null {
    return this.threads.querySelector<HTMLElement>(`.row[data-place="${id}"]`);
  }

  private thread({ district, places }: PlaceThread, who: WhoIsWhere): HTMLElement {
    const people = (id: string) => who.people.filter((m) => m.place === id);
    const thr = el('div', 'thr');
    thr.dataset.district = district.id;
    const home = places.some((p) => p.id === who.here);
    thr.classList.toggle('open', home);
    const name = this.button('group');
    const dots = dotsFor(places.flatMap((p) => people(p.id)));
    // Shut, it still says you're in there.
    if (home) dots.prepend(el('u', ''));
    name.append(el('i', 'tw'), el('span', 'nm', district.name.toUpperCase()), el('em', '', String(places.length)), dots);
    const kids = el('div', 'kids');
    const inner = el('div', '');
    const rail = this.button('rail');
    rail.setAttribute('aria-label', `Fold ${district.name}`);
    inner.append(rail);
    for (const p of places) {
      const row = this.button('row');
      row.dataset.place = p.id;
      row.append(el('span', 't', p.name));
      if (p.id === who.here) row.append(el('span', 'h', '● HERE'));
      row.append(dotsFor(people(p.id)));
      inner.append(row);
    }
    kids.append(inner);
    thr.append(name, kids);
    return thr;
  }

  /** Off the Tab order: the map's own keys walk the places, and Enter is GO. */
  private button(cls: string): HTMLButtonElement {
    const b = el('button', cls);
    b.type = 'button';
    b.tabIndex = -1;
    return b;
  }

  private click(e: MouseEvent): void {
    const t = e.target as Element;
    const fold = t.closest('.group, .rail');
    if (fold) {
      fold.closest('.thr')!.classList.toggle('open');
      this.opts.onFold();
      this.opts.onResize();
      return;
    }
    const id = t.closest<HTMLElement>('.row')?.dataset.place;
    if (!id) return;
    if (id === this.picked) this.opts.onRevisit(id);
    else this.opts.onPick(id);
  }

  private over(e: MouseEvent): void {
    // A tap's mouseover has no mouseleave to end it.
    if (window.matchMedia?.('(hover: none)').matches) return;
    const t = e.target as Element;
    this.opts.onHot(t.closest<HTMLElement>('.row')?.dataset.place ?? null);
    this.opts.onDistrict(t.closest('.group')?.closest<HTMLElement>('.thr')?.dataset.district ?? null);
  }

  /** Scrolls `row` out of the list's fades, once its thread has opened. */
  private reveal(row: HTMLElement): void {
    clearTimeout(this.revealing);
    this.revealing = window.setTimeout(() => {
      const r = row.getBoundingClientRect(), box = this.el.getBoundingClientRect();
      // Rects are in window px; the list scrolls in stage px.
      const z = box.height / (this.el.offsetHeight || box.height || 1);
      const top = (r.top - box.top) / z, foot = (r.bottom - box.top) / z;
      if (top < CLEAR_TOP) this.el.scrollTop += top - CLEAR_TOP - 20;
      else if (foot > this.el.clientHeight - CLEAR_FOOT) this.el.scrollTop += foot - this.el.clientHeight + CLEAR_FOOT + 30;
    }, UNFOLD_MS);
  }
}
