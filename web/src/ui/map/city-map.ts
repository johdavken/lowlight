/**
 * The city map's contents, over the map image: district names and borders and pins (the world, which the camera moves),
 * and the rail band, the district heading and the focused place's file strip (the overlay, fixed on screen).
 * Used by the game's MAP and Studio's preview (one host for both, no camera).
 */
import { liftPct, toScreen } from '../../../../shared/map-projection';
import type { CityMapData, District, Place } from '../../../../shared/map-schema';
import { placesIn } from '../../../../shared/map-schema';
import type { ExitPlace, SideRoom } from '../../../../shared/exits';
import { bandDistricts, buildDistrictBand, buildPlaceBand, el, placeNumber } from './band';
import { districtFrame, type Frame } from './camera';
import { buildFileStrip, goBlocked } from './file-strip';
import { drawNames, NAMES_BOX } from './lettering';
import { pathD } from './path';
import './map.css';

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
  /** A big job's marked places still to visit, each with its line (big jobs spec §2). */
  jobMarks?: Record<string, string>;
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
  /** The frame the camera should show: a district's, or null for the whole city. */
  onFrame?: (frame: Frame | null) => void;
  onCue?: (cue: MapCue) => void;
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
  private _openId: string | null = null;
  /** The focused tile: a district at the city, a place inside one. */
  private _focus: string | null = null;
  /** The hovered tile or pin, the same way. */
  private hovered: string | null = null;

  constructor(
    host: HTMLElement,
    private readonly opts: CityMapOpts = {},
  ) {
    const still = opts.reducedMotion ? ' map-still' : '';
    this.root = el('div', `city-map${still}`);
    this.svg = svgEl('svg', { class: 'city-lines', viewBox: '0 0 1000 1000', preserveAspectRatio: 'none' });
    this.names = svgEl('svg', { class: 'city-names', viewBox: `0 0 ${NAMES_BOX.w} ${NAMES_BOX.h}`, preserveAspectRatio: 'none' });
    this.names.addEventListener('click', (e) => {
      const t = (e.target as Element).closest<SVGElement>('text.dname.has');
      if (!t) return;
      e.stopPropagation();
      this.openDistrict(t.dataset.id!);
    });
    this.layer = el('div', 'city-labels');
    this.root.append(this.svg, this.names, this.layer);
    host.append(this.root);
    this.over = el('div', `city-map map-overlay${still}`);
    (opts.overlay ?? host).append(this.over);
  }

  /** The open district, or null at the city. */
  get openId(): string | null {
    return this._openId;
  }
  /** The focused place inside the open district. */
  get openPlace(): string | null {
    return this._openId ? this._focus : null;
  }
  /** The focused band tile: a district id at the city, a place id inside one. */
  get focus(): string | null {
    return this._focus;
  }

  /** Draws the map and opens where you are: your district, your place on file (the city, when you're not on the map). */
  /** `heights`: map px up for places on a structure (the rendered map's manifest); their pins stand at that height. */
  /** Raised places' heights (map px), when the rendered map is showing. */
  private heights: Record<string, number> = {};

  render(map: CityMapData, who: WhoIsWhere, heights?: Record<string, number>): void {
    this.heights = heights ?? {};
    map = pinned(map);
    this.map = map;
    this.who = who;
    this.hovered = null;
    const here = who.here ? map.places.find((p) => p.id === who.here) : undefined;
    this._openId = here?.district ?? null;
    this._focus = here?.id ?? this.firstTile();
    this.draw();
  }

  /** Redraws with a changed map (Studio's preview after an edit): what's open and focused stays while it still exists. */
  update(map: CityMapData, who: WhoIsWhere): void {
    if (!this.map) return this.render(map, who);
    map = pinned(map);
    this.map = map;
    this.who = who;
    this.hovered = null;
    if (this._openId && !placesIn(map, this._openId).length) this._openId = null;
    if (!this.tiles().includes(this._focus ?? '')) this._focus = this.firstTile();
    this.draw();
  }

  /** Opens a district (null: back to the city, that district's tile focused), with `place` on file or a sensible one. */
  openDistrict(id: string | null, place: string | null = null): void {
    if (!this.map) return;
    this.hovered = null;
    if (id === null) {
      const was = this._openId;
      this._openId = null;
      this._focus = was && this.tiles().includes(was) ? was : this.firstTile();
      return this.draw();
    }
    const places = placesIn(this.map, id);
    if (!places.length) return;
    const changed = id !== this._openId;
    this._openId = id;
    const here = places.find((p) => p.id === this.who.here)?.id;
    this._focus = places.some((p) => p.id === place) ? place : (here ?? places[0].id);
    if (changed) this.opts.onCue?.('confirm');
    this.draw();
  }

  /** The next (1) or previous (-1) band tile, wrapping. */
  move(delta: 1 | -1): void {
    const ids = this.tiles();
    if (!ids.length) return;
    const i = ids.indexOf(this._focus ?? '');
    const next = ids[(i + delta + ids.length) % ids.length];
    if (next === this._focus) return; // one tile: nothing moves, so no cue
    this.setFocus(next);
    this.opts.onCue?.('move');
  }

  /** Enter: opens the focused district at the city; GO to the focused place inside one, when GO can go. */
  enter(): boolean {
    if (!this.map || !this._focus) return false;
    if (!this._openId) {
      this.openDistrict(this._focus);
      return true;
    }
    const p = this.map.places.find((x) => x.id === this._focus);
    if (!p || !this.opts.onTravel || p.inviteOnly || goBlocked(p, this.who)) return false;
    this.opts.onTravel(p.id);
    return true;
  }

  /** Esc: back to the city and true; false at the city (nothing left to close here). */
  handleEscape(): boolean {
    if (this._openId === null) return false;
    this.openDistrict(null);
    return true;
  }

  /** Empties the map and forgets what was open (before a new map loads, or when one fails to). */
  clear(): void {
    this.map = null;
    this.who = { people: [] };
    this._openId = null;
    this._focus = null;
    this.hovered = null;
    this.svg.replaceChildren();
    this.names.replaceChildren();
    this.layer.replaceChildren();
    this.over.replaceChildren();
  }

  dispose(): void {
    this.root.remove();
    this.over.remove();
  }

  /** The band's ids, in order: districts at the city, the open district's places inside it. */
  private tiles(): string[] {
    if (!this.map) return [];
    return this._openId ? placesIn(this.map, this._openId).map((p) => p.id) : bandDistricts(this.map).map((d) => d.id);
  }

  /** At the city: your district's tile, else the first. */
  private firstTile(): string | null {
    const ids = this.tiles();
    if (!this._openId && this.map && this.who.here) {
      const d = this.map.places.find((p) => p.id === this.who.here)?.district;
      if (d && ids.includes(d)) return d;
    }
    return ids[0] ?? null;
  }

  private setFocus(id: string): void {
    this._focus = id;
    this.refresh();
    this.paintStrip();
  }

  /** Everything, for a new view (open, back, render, update): reports the camera's frame. */
  private draw(): void {
    if (!this.map) return;
    this.paintWorld();
    this.paintOverlay();
    this.opts.onFrame?.(this._openId ? districtFrame(this.map, this._openId) : null);
  }

  /** A focus or hover change inside one view: classes in place, so the band doesn't print again (setFocus reprints the strip). */
  private refresh(): void {
    const lit = (id: string) => id === this._focus || id === this.hovered;
    for (const t of this.over.querySelectorAll<HTMLElement>('.map-bt.dist:not(.open), .map-bt.place')) {
      const id = t.dataset.id ?? t.dataset.place!;
      t.classList.toggle('focus', id === this._focus);
    }
    // The open district's tags only: another district's pin lights itself on hover alone.
    for (const tag of this.layer.querySelectorAll<HTMLElement>('.pin.open .map-ntag')) {
      const id = tag.closest<HTMLElement>('.pin')!.dataset.place!;
      tag.classList.toggle('full', lit(id));
      tag.closest('.pin')!.classList.toggle('on', lit(id));
      tag.closest('.pin')!.classList.toggle('focus', id === this._focus);
    }
    if (!this._openId) {
      for (const p of this.svg.querySelectorAll<SVGPathElement>('path.dpoly')) p.classList.toggle('open', p.dataset.id === this.hovered);
    }
  }

  private hover(id: string | null): void {
    this.hovered = id;
    this.refresh();
  }

  private paintWorld(): void {
    const map = this.map!;
    const open = this._openId;
    this.svg.replaceChildren(svgEl('defs', {}));
    this.svg.firstChild!.appendChild(glowFilter());
    this.layer.replaceChildren();
    const hasPlaces = new Set(map.places.map((p) => p.district));
    for (const d of map.districts) {
      const has = hasPlaces.has(d.id);
      if (d.border) this.drawBorder(d, has);
    }
    drawNames(this.names, map.districts, { has: (id) => hasPlaces.has(id) });
    for (const d of map.districts) {
      placesIn(map, d.id).forEach((p, i) => {
        const h = this.heights[p.id];
        // A raised place's stem, from its pin down to the ground (a sibling, so its height is a share of the map's).
        if (h) {
          const stem = el('div', 'pin-stem');
          stem.dataset.place = p.id;
          const [x, y] = toScreen(p.pin, h);
          Object.assign(stem.style, { left: `${x}%`, top: `${y}%`, height: `${liftPct(h)}%` });
          this.layer.append(stem);
        }
        this.layer.append(this.pin(p, d, i, d.id === open));
      });
    }
    this.root.classList.toggle('zoomed', open !== null);
  }

  private pin(p: Place, d: District, i: number, inOpen: boolean): HTMLElement {
    const pin = el('div', 'pin');
    pin.dataset.place = p.id;
    const [px, py] = toScreen(p.pin, this.heights[p.id] ?? 0);
    pin.style.left = `${px}%`;
    pin.style.top = `${py}%`;
    if (this.who.here === p.id) pin.classList.add('here');
    // Jobs can be run from here: an amber ring.
    if (p.gigs) pin.append(el('span', 'gig-ring'));
    // A big job has something for you here (big jobs spec §2).
    if (this.who.jobMarks?.[p.id]) pin.append(el('span', 'job-mark'));
    if (inOpen) {
      const lit = p.id === this._focus || p.id === this.hovered;
      pin.classList.add('open');
      pin.classList.toggle('on', lit);
      // Its side rooms drop down only while it's focused: one list at a time, whatever the mouse is over.
      pin.classList.toggle('focus', p.id === this._focus);
      const tag = el('span', `map-ntag${lit ? ' full' : ''}`);
      const inner = el('span', 'in');
      const dots = el('span', 'dots');
      const inside = this.who.inside?.[p.id] ?? [];
      const sideIds = new Set(flatRooms(inside).map((r) => r.room));
      const here = this.who.people.filter((x) => x.place === p.id);
      for (const m of here.filter((x) => !x.room || !sideIds.has(x.room))) dots.append(dot(m));
      inner.append(el('span', 'n', placeNumber(i)), el('span', 'nm', p.name), dots);
      if (sideIds.size) inner.append(el('span', 'sub', `+${sideIds.size}`));
      tag.append(inner);
      pin.append(tag);
      // The rooms inside drop down under the tag while the pin is focused (CSS), each with who's in it. Information only: no GO.
      if (sideIds.size) {
        pin.append(insideList(inside, here));
        // Clear of the band and the file strip: a pin low in the frame opens its list upward, and one on the
        // strip's side (the strip stands opposite the district, see drawStrip) opens it away from the strip.
        const f = districtFrame(this.map!, d.id);
        if (f) {
          pin.classList.toggle('inside-up', p.pin[1] > (f.y0 + f.y1) / 2);
          const stripRight = f.x0 + f.x1 <= 100;
          pin.classList.toggle('inside-left', stripRight && p.pin[0] > (f.x0 + f.x1) / 2);
        }
      }
    }
    if (inOpen) {
      pin.addEventListener('mouseenter', () => this.hover(p.id));
      pin.addEventListener('mouseleave', () => this.hover(null));
    } else {
      // Any other pin names itself while hovered (spec 2026-10-28 §1); at the city it lights its district too.
      const tag = el('span', 'map-ntag');
      const inner = el('span', 'in');
      inner.append(el('span', 'nm', p.name));
      tag.append(inner);
      pin.append(tag);
      const lit = (on: boolean) => {
        pin.classList.toggle('on', on);
        tag.classList.toggle('full', on);
        if (!this._openId) this.hover(on ? d.id : null);
      };
      pin.addEventListener('mouseenter', () => lit(true));
      pin.addEventListener('mouseleave', () => lit(false));
    }
    pin.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this._openId === d.id) this.setFocus(p.id);
      else this.openDistrict(d.id, p.id);
    });
    return pin;
  }

  private drawBorder(d: District, has: boolean): void {
    const dAttr = pathD(d.border!, toSvg);
    const open = d.id === this._openId;
    const dim = this._openId !== null && !open;
    this.svg.append(svgEl('path', { d: dAttr, class: 'dhalo' }));
    const poly = svgEl('path', { d: dAttr, class: `dpoly${has ? ' has' : ''}${open ? ' open' : ''}${dim ? ' dim' : ''}`, 'data-id': d.id });
    if (open) poly.setAttribute('filter', 'url(#map-glow)');
    if (has)
      poly.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!open) this.openDistrict(d.id);
      });
    this.svg.append(poly);
  }

  private paintOverlay(): void {
    const map = this.map!;
    this.over.replaceChildren();
    const d = this._openId ? map.districts.find((x) => x.id === this._openId)! : null;
    if (d) {
      const head = el('div', 'map-heading');
      head.append(el('div', 't', d.name.toUpperCase()));
      if (d.area) head.append(el('div', 's', d.area));
      this.over.append(head);
      this.over.append(
        buildPlaceBand({
          district: d,
          places: placesIn(map, d.id),
          who: this.who,
          focus: this._focus,
          onBack: () => this.openDistrict(null),
          onFocus: (id) => this.setFocus(id),
          onHover: (id) => this.hover(id),
        }),
      );
    } else {
      const here = this.who.here ? map.places.find((p) => p.id === this.who.here)?.district : undefined;
      this.over.append(
        buildDistrictBand({
          districts: bandDistricts(map),
          counts: new Map(map.districts.map((x) => [x.id, placesIn(map, x.id).length])),
          hereDistrict: here,
          focus: this._focus,
          onOpen: (id) => this.openDistrict(id),
          onHover: (id) => this.hover(id),
        }),
      );
    }
    this.paintStrip();
  }

  /** The focused place's file, replaced (it prints in again); none at the city. */
  private paintStrip(): void {
    this.over.querySelector('.map-strip')?.remove();
    if (!this.map || !this._openId) return;
    const district = this.map.districts.find((x) => x.id === this._openId)!;
    const places = placesIn(this.map, district.id);
    const index = places.findIndex((p) => p.id === this._focus);
    if (index < 0) return;
    const strip = buildFileStrip({ place: places[index], index, district, who: this.who, onTravel: this.opts.onTravel, onGigs: this.opts.onGigs });
    // A district in the map's right half meets the map's edge there, where the camera can't move it out from under the strip.
    const f = districtFrame(this.map, district.id);
    if (f && f.x0 + f.x1 > 100) strip.classList.add('left');
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

const dot = (m: MapPerson): HTMLElement => {
  const b = el('b', '');
  b.style.setProperty('--c', m.accent);
  return b;
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
