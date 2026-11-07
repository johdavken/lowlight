/**
 * The city map's contents, over the map image: district names and borders and pins (the world, which the camera moves),
 * and the focused place's card (the overlay, fixed on screen). Pins follow the zoom (map pins spec, 2026-10-30): small dots
 * with a dot per person you know when far out, the full name with faces when near, a tag that would cover a more
 * important one hiding to its pin. A district's name zooms the camera to it. Used by the game's MAP and Studio's
 * preview (one host for both, no camera). The game's map is `listed`: no tags, the places down the left (PlaceList), and the
 * card at the foot of the right side with GO on it (map list mock, 2026-11-05).
 */
import { liftPct, toScreen } from '../../../../shared/map-projection';
import type { CityMapData, District, Place } from '../../../../shared/map-schema';
import { placesIn } from '../../../../shared/map-schema';
import type { ExitPlace, SideRoom } from '../../../../shared/exits';
import { el } from './band';
import { districtFrame, type Frame } from './camera';
import { buildFileStrip, buildGo, goBlocked } from './file-strip';
import { drawNames, NAMES_BOX } from './lettering';
import { pathD } from './path';
import { dot, PlaceList, type PlaceThread } from './place-list';
import './map.css';

/** At this zoom and closer, pins carry their names (map pins spec §2); further out they're dots. */
export const NEAR_SCALE = 1.6;
/** The pins' and tags' size on screen at zoom `scale`: small far out, growing as you come in (1 at about 2.3×). */
export const pinSize = (scale: number): number => Math.min(1.2, 0.6 + 0.3 * (scale - 1));
export const tagSize = (scale: number): number => Math.min(1.15, 0.8 + 0.2 * (scale - NEAR_SCALE));

export interface MapPerson {
  place: string;
  /** The room they're in (`pack/scene`), when known: a side room's people show on its row under the pin. */
  room?: string;
  id: string;
  name: string;
  role: 'you' | 'contact' | 'fixed';
  accent: string;
  face: string | null;
}
export interface WhoIsWhere {
  /** The place you're at, if your room is on the map (or a side room's home place). */
  here?: string;
  /** You're in a side room: `here` is its home place, so GO there still goes (room exits spec §4). */
  away?: boolean;
  people: MapPerson[];
  /** She's replying: GO waits. */
  busy?: boolean;
  /** Why GIGS can't open now ('no link', 'needs her direct link'), or null/absent when it can. */
  gigBlock?: string | null;
  /** Each pin's side rooms (`sideRooms`): counted on the pin, listed under it while it's lit. Information only. */
  inside?: Record<string, SideRoom[]>;
  /** Comms (spec 2026-10-20 §1): on the line now, and whether you can go on it (her deal in force). */
  comms?: { on: boolean; can: boolean; /** Her scheduled room now: a plain GO there. */ herAt?: string | null };
}

export type MapCue = 'move' | 'confirm';

export interface CityMapOpts {
  /** Where the band, heading and strip go (fixed on screen); the world host when absent. */
  overlay?: HTMLElement;
  reducedMotion?: boolean;
  /** GO: walk there. Without it, the strip has no GO and Enter does nothing in a district. */
  onTravel?: (placeId: string, comms?: boolean) => void;
  onGigs?: (place: Place, district: District) => void;
  /** A district's name (or border) was clicked: the camera should frame it. */
  onZoomTo?: (frame: Frame) => void;
  /** The focused place changed (a click, the arrows): the camera may bring it into view. Null: none. */
  onFocus?: (place: Place | null) => void;
  onCue?: (cue: MapCue) => void;
  /** The game's map: pins carry no names, a list has the places, and the map's names and borders are only printed. */
  listed?: boolean;
  /** The picked place's row clicked again: the camera should go in to it. */
  onRevisit?: (place: Place) => void;
}

/** The place your room is, by its `pack/scene` link: the first one, if two share it. */
export function hereFor(map: CityMapData, sceneRef: string | null, exits?: ReadonlyMap<string, ExitPlace>, inside?: Record<string, SideRoom[]>): string | undefined {
  if (!sceneRef) return undefined;
  const place = map.places.find((p) => p.scene === sceneRef);
  if (place && !place.side) return place.id;
  // A side room stands at its home: the place whose room has the way in (room exits spec §4);
  // one further in (a side room's side room), at the pin whose list has it.
  const home = exits?.get(sceneRef)?.home;
  if (home) return home;
  const has = (rooms: SideRoom[]): boolean => rooms.some((r) => r.room === sceneRef || has(r.inside));
  return Object.entries(inside ?? {}).find(([, rooms]) => has(rooms))?.[0];
}

/** The map as the player sees it: side places have no pin and no tile (room exits spec §4a). */
const pinned = (map: CityMapData): CityMapData => (map.places.some((p) => p.side) ? { ...map, places: map.places.filter((p) => !p.side) } : map);

const NS = 'http://www.w3.org/2000/svg';
/** The SVG's own units: 1000 × 1000 stretched over the image, so map % × 10. */
const toSvg = (x: number, y: number): [number, number] => [x * 10, y * 10];

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export class CityMap {
  private readonly root: HTMLElement;
  private readonly svg: SVGSVGElement;
  /** The district names, printed along their arcs (3:2, so the letters keep their shape). */
  private readonly names: SVGSVGElement;
  private readonly layer: HTMLElement;
  private readonly over: HTMLElement;
  private map: CityMapData | null = null;
  private who: WhoIsWhere = { people: [] };
  /** The place whose card is open (a click or the arrows), or null. */
  private _focus: string | null = null;
  /** The hovered pin. */
  private hovered: string | null = null;
  /** The camera's zoom (1 in Studio, which has none). */
  private scale = 1;
  /** A tag layout waiting for the next frame. */
  private layoutFrame = 0;
  /** A pan's look at whether the picked tag still fits (fitFocus). */
  private fitFrame = 0;
  /** The places down the left, on a `listed` map. */
  private readonly list: PlaceList | null = null;

  constructor(
    host: HTMLElement,
    private readonly opts: CityMapOpts = {},
  ) {
    const still = opts.reducedMotion ? ' map-still' : '';
    this.root = el('div', `city-map${still}`);
    this.svg = svgEl('svg', { class: 'city-lines', viewBox: '0 0 1000 1000', preserveAspectRatio: 'none' });
    this.names = svgEl('svg', { class: 'city-names', viewBox: `0 0 ${NAMES_BOX.w} ${NAMES_BOX.h}`, preserveAspectRatio: 'none' });
    this.names.addEventListener('click', (e) => {
      if (opts.listed) return;
      const t = (e.target as Element).closest<SVGElement>('text.dname.has');
      if (!t) return;
      e.stopPropagation();
      this.zoomTo(t.dataset.id!);
    });
    this.layer = el('div', 'city-labels');
    this.root.append(this.svg, this.names, this.layer);
    host.append(this.root);
    this.over = el('div', `city-map map-overlay${still}`);
    (opts.overlay ?? host).append(this.over);
    if (opts.listed) {
      this.root.classList.add('listed');
      this.over.classList.add('listed');
      this.list = new PlaceList({
        onPick: (id) => {
          this.select(id);
          this.opts.onCue?.('move');
        },
        onRevisit: (id) => {
          const p = this.map?.places.find((x) => x.id === id);
          if (!p) return;
          this.opts.onCue?.('confirm');
          this.opts.onRevisit?.(p);
        },
        onHot: (id) => this.heat(id),
        onDistrict: (id) => this.lightDistrict(id),
        onFold: () => this.opts.onCue?.('move'),
        onResize: () => this.fitFocus(),
      });
      this.over.append(this.list.el);
    }
    this.setScale(1);
  }

  /** The place whose card is open, or null. */
  get focus(): string | null {
    return this._focus;
  }

  /** Raised places' heights (map px), when the rendered map is showing. */
  private heights: Record<string, number> = {};

  /** Draws the map with no card open. `heights`: map px up for places on a structure (the rendered map's manifest). */
  render(map: CityMapData, who: WhoIsWhere, heights?: Record<string, number>): void {
    this.heights = heights ?? {};
    this.map = pinned(map);
    this.who = who;
    this.hovered = null;
    this._focus = null;
    this.draw();
  }

  /** Redraws with a changed map (Studio's preview after an edit): the card stays while its place still exists. */
  update(map: CityMapData, who: WhoIsWhere): void {
    if (!this.map) return this.render(map, who);
    this.map = pinned(map);
    this.who = who;
    this.hovered = null;
    if (!this.map.places.some((p) => p.id === this._focus)) this._focus = null;
    this.draw();
  }

  /** The camera's zoom: far out the pins are dots, near they carry names (laid out next frame, so an ease costs one pass a frame). */
  setScale(scale: number): void {
    // A pan doesn't change which tags overlap: only a new zoom lays them out again (review M5). It can carry the
    // picked tag to the edge, though: that one looks again.
    if (scale === this.scale && this.root.style.getPropertyValue('--pz')) {
      if ((this._focus || this.list) && !this.fitFrame) this.fitFrame = requestAnimationFrame(() => ((this.fitFrame = 0), this.fitFocus()));
      return;
    }
    this.scale = scale;
    const far = scale < NEAR_SCALE;
    this.root.classList.toggle('far', far);
    this.root.style.setProperty('--pz', String(pinSize(scale)));
    this.root.style.setProperty('--tz', String(tagSize(scale)));
    if (far) for (const p of this.layer.querySelectorAll('.pin.crowded')) p.classList.remove('crowded');
    this.scheduleLayout();
  }

  /** Opens `id`'s card (null closes it). */
  select(id: string | null): void {
    if (id === this._focus) return;
    this._focus = id;
    this.refresh();
    this.paintCard();
    this.opts.onFocus?.(id ? (this.map?.places.find((p) => p.id === id) ?? null) : null);
  }

  /** The next (1) or previous (-1) place, district by district, wrapping; from none, your place or the first. */
  move(delta: 1 | -1): void {
    const ids = this.order();
    if (!ids.length) return;
    const i = ids.indexOf(this._focus ?? '');
    const next = i < 0 ? (this.who.here && ids.includes(this.who.here) ? this.who.here : ids[0]) : ids[(i + delta + ids.length) % ids.length];
    if (next === this._focus) return; // one place: nothing moves, so no cue
    this.select(next);
    this.opts.onCue?.('move');
  }

  /** Enter: GO to the place whose card is open, when GO can go. */
  enter(): boolean {
    if (!this.map || !this._focus) return false;
    const p = this.map.places.find((x) => x.id === this._focus);
    if (!p || !this.opts.onTravel || p.inviteOnly || goBlocked(p, this.who)) return false;
    this.opts.onTravel(p.id);
    return true;
  }

  /** Esc: closes the card and true; false with none open (the camera or the map is next). */
  handleEscape(): boolean {
    if (this._focus === null) return false;
    this.select(null);
    return true;
  }

  /** Frames a district: the camera eases to it (map pins spec §3). */
  zoomTo(districtId: string): void {
    if (!this.map) return;
    const f = districtFrame(this.map, districtId);
    if (!f) return;
    this.opts.onCue?.('confirm');
    this.opts.onZoomTo?.(f);
  }

  /** Empties the map and forgets the card (before a new map loads, or when one fails to). */
  clear(): void {
    cancelAnimationFrame(this.layoutFrame);
    cancelAnimationFrame(this.fitFrame);
    this.layoutFrame = 0;
    this.fitFrame = 0;
    this.map = null;
    this.who = { people: [] };
    this._focus = null;
    this.hovered = null;
    this.svg.replaceChildren();
    this.names.replaceChildren();
    this.layer.replaceChildren();
    this.over.querySelector('.map-strip')?.remove();
    if (!this.list) this.over.replaceChildren();
    this.root.classList.remove('dimmed');
    this.list?.clear();
  }

  dispose(): void {
    cancelAnimationFrame(this.layoutFrame);
    cancelAnimationFrame(this.fitFrame);
    this.list?.dispose();
    this.root.remove();
    this.over.remove();
  }

  /** Every place, district by district in map order: what the arrows walk. */
  private order(): string[] {
    return this.threads().flatMap((t) => t.places.map((p) => p.id));
  }

  /** The districts with places, in map order; on a `listed` map yours comes first, as the list has it. */
  private threads(): PlaceThread[] {
    const map = this.map;
    if (!map) return [];
    const all = map.districts.map((district) => ({ district, places: placesIn(map, district.id) })).filter((t) => t.places.length);
    if (!this.list) return all;
    const home = (t: PlaceThread) => t.places.some((p) => p.id === this.who.here);
    return [...all.filter(home), ...all.filter((t) => !home(t))];
  }

  private draw(): void {
    if (!this.map) return;
    this.paintWorld();
    this.list?.render(this.threads(), this.who);
    this.paintCard();
    this.scheduleLayout();
  }

  /** The focus or hover moved: classes in place (the tags print once per draw). */
  private refresh(): void {
    for (const pin of this.layer.querySelectorAll<HTMLElement>('.pin')) {
      const id = pin.dataset.place!;
      pin.classList.toggle('focus', id === this._focus);
      pin.classList.toggle('on', id === this.hovered || id === this._focus);
    }
    this.scheduleLayout();
  }

  /** A row hovered: its pin pulses. */
  private heat(id: string | null): void {
    for (const pin of this.layer.querySelectorAll<HTMLElement>('.pin')) pin.classList.toggle('hot', pin.dataset.place === id);
  }

  /** A district's name hovered in the list: its border and name light, its pins stand out from the rest. */
  private lightDistrict(id: string | null): void {
    this.root.classList.toggle('dimmed', id !== null);
    for (const p of this.svg.querySelectorAll<SVGPathElement>('path.dpoly')) p.classList.toggle('lit', p.dataset.id === id);
    for (const t of this.names.querySelectorAll<SVGElement>('text.dname')) t.classList.toggle('lit', t.dataset.id === id);
    const inIt = new Set(this.map?.places.filter((p) => p.district === id).map((p) => p.id));
    for (const pin of this.layer.querySelectorAll<HTMLElement>('.pin')) pin.classList.toggle('in', inIt.has(pin.dataset.place!));
  }

  private hover(id: string | null, district: string | null): void {
    this.list?.hot(id);
    this.hovered = id;
    // Classes only: hovering through a crowd shows the hovered tag (CSS) without reshuffling the rest (review M6).
    for (const pin of this.layer.querySelectorAll<HTMLElement>('.pin')) pin.classList.toggle('on', pin.dataset.place === id || pin.dataset.place === this._focus);
    // A hovered pin lights its district's border (the painting's).
    for (const p of this.svg.querySelectorAll<SVGPathElement>('path.dpoly')) p.classList.toggle('open', p.dataset.id === district);
  }

  private scheduleLayout(): void {
    if (this.layoutFrame) return;
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      this.layoutTags();
    });
  }

  /**
   * Near, every tag shows unless it would cover one more important (map pins spec §2): yours, places with people,
   * the card's, then the rest in map order. A hidden tag shows again on hover (CSS) or further in.
   */
  layoutTags(): void {
    this.fitFocus();
    const pins = [...this.layer.querySelectorAll<HTMLElement>('.pin')];
    for (const p of pins) p.classList.remove('crowded');
    if (this.scale < NEAR_SCALE) return;
    const rank = (pin: HTMLElement) => {
      const id = pin.dataset.place!;
      return id === this.who.here ? 0 : pin.classList.contains('peopled') ? 1 : id === this._focus ? 2 : 3;
    };
    const placed: DOMRect[] = [];
    const pad = 3;
    for (const pin of pins.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p)) {
      const tag = pin.querySelector<HTMLElement>('.map-ntag');
      if (!tag) continue;
      const r = tag.getBoundingClientRect();
      if (!r.width) continue;
      const hit = placed.some((q) => r.left - pad < q.right && r.right + pad > q.left && r.top - pad < q.bottom && r.bottom + pad > q.top);
      if (hit) pin.classList.add('crowded');
      else placed.push(r);
    }
  }

  private paintWorld(): void {
    const map = this.map!;
    this.svg.replaceChildren(svgEl('defs', {}));
    this.svg.firstChild!.appendChild(glowFilter());
    this.layer.replaceChildren();
    const hasPlaces = new Set(this.list ? [] : map.places.map((p) => p.district));
    for (const d of map.districts) {
      const has = hasPlaces.has(d.id);
      if (d.border) this.drawBorder(d, has);
    }
    drawNames(this.names, map.districts, { has: (id) => hasPlaces.has(id) });
    for (const d of map.districts) {
      for (const p of placesIn(map, d.id)) {
        const h = this.heights[p.id];
        // A raised place's stem, from its pin down to the ground (a sibling, so its height is a share of the map's).
        if (h) {
          const stem = el('div', 'pin-stem');
          stem.dataset.place = p.id;
          const [x, y] = toScreen(p.pin, h);
          Object.assign(stem.style, { left: `${x}%`, top: `${y}%`, height: `${liftPct(h)}%` });
          this.layer.append(stem);
        }
        this.layer.append(this.pin(p, d));
      }
    }
  }

  private pin(p: Place, d: District): HTMLElement {
    const pin = el('div', 'pin');
    pin.dataset.place = p.id;
    // A finger-sized target round the diamond, whatever the zoom (review I2: far-out pins on a phone).
    pin.append(el('span', 'hit'));
    if (this.list) pin.append(el('span', 'ping'), el('span', 'ping'));
    const [px, py] = toScreen(p.pin, this.heights[p.id] ?? 0);
    pin.style.left = `${px}%`;
    pin.style.top = `${py}%`;
    if (this.who.here === p.id) pin.classList.add('here');
    pin.classList.toggle('focus', p.id === this._focus);
    pin.classList.toggle('on', p.id === this._focus);
    // Jobs can be run from here: an amber ring.
    if (p.gigs) pin.append(el('span', 'gig-ring'));
    const inside = this.who.inside?.[p.id] ?? [];
    const sideIds = new Set(flatRooms(inside).map((r) => r.room));
    const here = this.who.people.filter((x) => x.place === p.id);
    const atPin = here.filter((x) => !x.room || !sideIds.has(x.room));
    if (here.length) pin.classList.add('peopled');
    // Far out: a dot per person you know, beside the pin (side rooms' people too: they're here).
    if (here.length) {
      const who = el('span', 'who');
      for (const m of here) who.append(dot(m));
      pin.append(who);
    }
    pin.addEventListener('mouseenter', () => this.hover(p.id, d.id));
    pin.addEventListener('mouseleave', () => this.hover(null, null));
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      this.select(p.id);
    });
    if (this.list) return pin;
    // Near (and on hover far out): the name, with the faces of who's at the pin.
    const tag = el('span', 'map-ntag');
    const inner = el('span', 'in');
    const faces = el('span', 'faces');
    for (const m of atPin) faces.append(face(m));
    inner.append(faces, el('span', 'nm', p.name));
    if (sideIds.size) inner.append(el('span', 'sub', `+${sideIds.size}`));
    tag.append(inner);
    pin.append(tag);
    // The rooms inside drop down under the tag while its card is open (CSS), each with who's in it. Information only: no GO.
    if (sideIds.size) pin.append(insideList(inside, here));
    return pin;
  }

  private drawBorder(d: District, has: boolean): void {
    const dAttr = pathD(d.border!, toSvg);
    this.svg.append(svgEl('path', { d: dAttr, class: 'dhalo' }));
    const poly = svgEl('path', { d: dAttr, class: `dpoly${has ? ' has' : ''}`, 'data-id': d.id });
    if (has)
      poly.addEventListener('click', (e) => {
        e.stopPropagation();
        this.zoomTo(d.id);
      });
    this.svg.append(poly);
  }

  /** The picked pin's tag, with GO past its name, turns to the pin's left when it would run off the screen's right. */
  private fitFocus(): void {
    if (this.list) return this.clearNames();
    const pin = this.layer.querySelector<HTMLElement>('.pin.focus');
    for (const p of this.layer.querySelectorAll('.pin.flip')) if (p !== pin) p.classList.remove('flip');
    const tag = pin?.querySelector<HTMLElement>('.map-ntag');
    if (!pin || !tag) return;
    pin.classList.remove('flip');
    const o = this.over.getBoundingClientRect();
    if (!o.width) return;
    const go = tag.querySelector<HTMLElement>('.map-go')?.getBoundingClientRect();
    const right = Math.max(tag.getBoundingClientRect().right, go?.right ?? 0);
    pin.classList.toggle('flip', right > o.right - 12);
  }

  /** On a `listed` map, the printed names the list or the card would sit on step back. */
  private clearNames(): void {
    const card = this.over.querySelector('.map-strip')?.getBoundingClientRect();
    const boxes = card ? [card, this.list!.box()] : [this.list!.box()];
    for (const t of this.names.querySelectorAll('text.dname')) {
      const r = t.getBoundingClientRect();
      t.classList.toggle('under', boxes.some((b) => r.right > b.left - 10 && r.left < b.right + 10 && r.bottom > b.top - 10 && r.top < b.bottom + 10));
    }
  }

  /** The focused place's card, replaced (it prints in again), and GO on its tag (in the card on a `listed` map); none without a focus. */
  private paintCard(): void {
    this.over.querySelector('.map-strip')?.remove();
    for (const g of this.layer.querySelectorAll('.map-go')) g.remove();
    this.list?.pick(this._focus);
    if (!this.map || !this._focus) return;
    const place = this.map.places.find((p) => p.id === this._focus);
    const district = place && this.map.districts.find((x) => x.id === place.district);
    if (!place || !district) return;
    if (this.list) {
      const inside = this.who.inside?.[place.id] ?? [];
      const go = this.opts.onTravel ? buildGo(place, this.who, this.opts.onTravel) : undefined;
      const people = this.who.people.filter((x) => x.place === place.id);
      this.over.append(buildFileStrip({ place, district, who: this.who, onGigs: this.opts.onGigs, listed: { go, inside: inside.length ? insideList(inside, people) : undefined } }));
      this.fitFocus();
      return;
    }
    const strip = buildFileStrip({ place, district, who: this.who, onGigs: this.opts.onGigs });
    const pinEl = this.layer.querySelector<HTMLElement>(`.pin[data-place="${place.id}"]`);
    if (this.opts.onTravel) pinEl?.querySelector('.map-ntag')?.append(buildGo(place, this.who, this.opts.onTravel));
    this.fitFocus();
    // The card stands on the side of the screen away from the pin (review I1: where the pin is on screen, not on the map).
    const r = pinEl?.getBoundingClientRect();
    const o = this.over.getBoundingClientRect();
    const right = r && o.width ? r.left - o.left > o.width / 2 : place.pin[0] > 50;
    if (right) strip.classList.add('left');
    this.over.append(strip);
  }
}

function glowFilter(): SVGFilterElement {
  const f = svgEl('filter', { id: 'map-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' });
  const blur = svgEl('feGaussianBlur', { stdDeviation: 2.2, result: 'b' });
  const merge = svgEl('feMerge', {});
  merge.append(svgEl('feMergeNode', { in: 'b' }), svgEl('feMergeNode', { in: 'SourceGraphic' }));
  f.append(blur, merge);
  return f;
}

/** A person's face in a tag (a dot in their colour when they have none). */
const face = (m: MapPerson): HTMLElement => {
  if (!m.face) return dot(m);
  const img = el('img', 'pface');
  img.src = m.face;
  img.alt = '';
  img.style.setProperty('--c', m.accent);
  img.addEventListener('error', () => img.replaceWith(dot(m)));
  return img;
};

const flatRooms = (rooms: SideRoom[], depth = 1): (SideRoom & { depth: number })[] =>
  rooms.flatMap((r) => [{ ...r, depth }, ...flatRooms(r.inside, depth + 1)]);

/** The rooms inside a pin, nested by the way in, each with the dots of who's in it. */
function insideList(rooms: SideRoom[], people: MapPerson[]): HTMLElement {
  const ul = el('ul', 'map-inside');
  for (const r of flatRooms(rooms)) {
    const li = el('li', '');
    li.dataset.depth = String(r.depth);
    const dots = el('span', 'dots');
    for (const m of people.filter((x) => x.room === r.room)) dots.append(dot(m));
    li.append(el('span', 'nm', r.name), dots);
    ul.append(li);
  }
  return ul;
}
