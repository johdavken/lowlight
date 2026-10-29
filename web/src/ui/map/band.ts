/** The map's band along the bottom, in the select screen's tile language: districts at city view, a district's places inside it. */
import { placesIn, type CityMapData, type District, type Place } from '../../../../shared/map-schema';
import type { WhoIsWhere } from './city-map';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Two-digit place numbers, as on the pins. */
export const placeNumber = (i: number) => String(i + 1).padStart(2, '0');

/** The districts that have places, most places first; ties in map order. */
export function bandDistricts(map: CityMapData): District[] {
  const count = (d: District) => placesIn(map, d.id).length;
  return map.districts
    .map((d, i) => ({ d, i, n: count(d) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.d);
}

/** A skewed tile; its contents sit in an un-skewed span. */
function tile(cls: string, ...kids: Node[]): HTMLElement {
  const t = el('div', `map-bt ${cls}`);
  const inner = el('span', 'in');
  inner.append(...kids);
  t.append(inner);
  return t;
}

function hoverable(t: HTMLElement, id: string, onHover: (id: string | null) => void): void {
  t.addEventListener('mouseenter', () => onHover(id));
  t.addEventListener('mouseleave', () => onHover(null));
}

export interface DistrictBandOpts {
  districts: District[];
  counts: Map<string, number>;
  hereDistrict?: string;
  focus: string | null;
  onOpen(id: string): void;
  onHover(id: string | null): void;
}

export function buildDistrictBand(o: DistrictBandOpts): HTMLElement {
  const band = el('div', 'map-band');
  o.districts.forEach((d, i) => {
    const t = tile('dist', el('span', 'nm', d.name.toUpperCase()), el('span', 'ct', String(o.counts.get(d.id) ?? 0)));
    t.dataset.id = d.id;
    t.style.setProperty('--i', String(i));
    if (d.id === o.hereDistrict) t.classList.add('here');
    if (d.id === o.focus) t.classList.add('focus');
    t.addEventListener('click', (e) => {
      e.stopPropagation();
      o.onOpen(d.id);
    });
    hoverable(t, d.id, o.onHover);
    band.append(t);
  });
  return band;
}

export interface PlaceBandOpts {
  district: District;
  places: Place[];
  who: WhoIsWhere;
  focus: string | null;
  onBack(): void;
  onFocus(placeId: string): void;
  onHover(placeId: string | null): void;
}

export function buildPlaceBand(o: PlaceBandOpts): HTMLElement {
  const band = el('div', 'map-band');
  const back = tile('map-back', el('span', 'nm', '◂ LOWLIGHT'), el('span', 'k', 'ESC'));
  back.title = 'Back to the city (Esc)';
  back.addEventListener('click', (e) => {
    e.stopPropagation();
    o.onBack();
  });
  const dist = tile('dist open', el('span', 'nm', o.district.name.toUpperCase()), el('span', 'ct', String(o.places.length)));
  band.append(back, dist);
  o.places.forEach((p, i) => {
    const kids: Node[] = [el('span', 'n', placeNumber(i)), el('span', 'nm', p.name)];
    if (p.gigs) kids.push(el('span', 'gt', 'GIGS'));
    const dots = el('span', 'dots');
    for (const m of o.who.people.filter((x) => x.place === p.id)) {
      const b = el('b', '');
      b.style.setProperty('--c', m.accent);
      dots.append(b);
    }
    kids.push(dots);
    const t = tile('place', ...kids);
    t.dataset.place = p.id;
    t.style.setProperty('--i', String(i + 2));
    if (o.who.here === p.id) t.classList.add('here');
    if (o.focus === p.id) t.classList.add('focus');
    t.addEventListener('click', (e) => {
      e.stopPropagation();
      o.onFocus(p.id);
    });
    hoverable(t, p.id, o.onHover);
    band.append(t);
  });
  return band;
}
