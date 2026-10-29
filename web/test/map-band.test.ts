import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { placesIn, type CityMapData } from '../../shared/map-schema';
import type { WhoIsWhere } from '../src/ui/map/city-map';
import { bandDistricts, buildDistrictBand, buildPlaceBand, placeNumber } from '../src/ui/map/band';
import { buildFileStrip } from '../src/ui/map/file-strip';
import { setHerPronoun } from '../src/room/her-copy';

setHerPronoun('she');

const map = (): CityMapData => ({
  version: 1,
  image: '/map/x.webp',
  districts: [
    { id: 'c', name: 'Sea', label: [70, 70] },
    { id: 'b', name: 'Bee', area: 'Area B', label: [40, 10] },
    { id: 'a', name: 'Aye', area: 'Area A', label: [10, 10] },
  ],
  places: [
    { id: 'a1', name: 'A one', district: 'a', pin: [7, 7], scene: 'p/a1' },
    { id: 'a2', name: 'A two', district: 'a', pin: [9, 9], gigs: true },
    { id: 'a3', name: 'A three', district: 'a', pin: [8, 6], scene: 'p/a3' },
    { id: 'b1', name: 'B one', district: 'b', pin: [37, 7], scene: 'p/b1' },
  ],
});

const two = (place: string): WhoIsWhere['people'] => [
  { place, id: 'hicks', name: 'Hicks', role: 'you', accent: '#7fe9ff', face: null },
  { place, id: 'nix', name: 'Nix', role: 'contact', accent: '#ff4f8b', face: '/nix.png' },
];

let host: HTMLElement;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector<T>(sel);
const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
const click = (el: Element | null) => el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const hover = (el: Element | null, on: boolean) => el!.dispatchEvent(new MouseEvent(on ? 'mouseenter' : 'mouseleave'));

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => host.remove());

it('placeNumber is two digits from 01', () => {
  expect(placeNumber(0)).toBe('01');
  expect(placeNumber(9)).toBe('10');
});

describe('district band', () => {
  it('lists districts with places, most places first', () => {
    expect(bandDistricts(map()).map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('ties keep map order', () => {
    const m = map();
    m.places = m.places.filter((p) => p.id === 'a1' || p.id === 'b1');
    expect(bandDistricts(m).map((d) => d.id)).toEqual(['b', 'a']);
  });

  function mount(over: Partial<Parameters<typeof buildDistrictBand>[0]> = {}) {
    const m = map();
    const o = {
      districts: bandDistricts(m),
      counts: new Map(m.districts.map((d) => [d.id, placesIn(m, d.id).length])),
      hereDistrict: 'b',
      focus: 'a',
      onOpen: vi.fn(),
      onHover: vi.fn(),
      ...over,
    };
    host.append(buildDistrictBand(o));
    return o;
  }

  it('shows names and counts, yours with an edge, the focus marked', () => {
    mount();
    expect($('.map-band')).not.toBeNull();
    expect($$('.map-bt.dist .nm').map((n) => n.textContent)).toEqual(['AYE', 'BEE']);
    expect($$('.map-bt.dist .ct').map((n) => n.textContent)).toEqual(['3', '1']);
    expect($$('.map-bt.dist.here').map((t) => t.dataset.id)).toEqual(['b']);
    expect($$('.map-bt.dist.focus').map((t) => t.dataset.id)).toEqual(['a']);
  });

  it('a click opens, hovering reports the district', () => {
    const o = mount();
    click($('.map-bt.dist[data-id="b"]'));
    expect(o.onOpen).toHaveBeenCalledWith('b');
    hover($('.map-bt.dist[data-id="b"]'), true);
    expect(o.onHover).toHaveBeenLastCalledWith('b');
    hover($('.map-bt.dist[data-id="b"]'), false);
    expect(o.onHover).toHaveBeenLastCalledWith(null);
  });
});

describe('place band', () => {
  function mount(focus: string | null = 'a2') {
    const m = map();
    const o = {
      district: m.districts[2],
      places: placesIn(m, 'a'),
      who: { here: 'a1', people: two('a1') } as WhoIsWhere,
      focus,
      onBack: vi.fn(),
      onFocus: vi.fn(),
      onHover: vi.fn(),
    };
    host.append(buildPlaceBand(o));
    return o;
  }

  it('starts with ◂ LOWLIGHT [ESC], then the district, then its places numbered', () => {
    mount();
    const tiles = $$('.map-band > .map-bt');
    expect(tiles[0].classList.contains('map-back')).toBe(true);
    expect(tiles[0].textContent).toContain('◂ LOWLIGHT');
    expect(tiles[0].textContent).toContain('ESC');
    expect(tiles[1].classList.contains('open')).toBe(true);
    expect(tiles[1].querySelector('.nm')!.textContent).toBe('AYE');
    expect($$('.map-bt.place .n').map((n) => n.textContent)).toEqual(['01', '02', '03']);
    expect($$('.map-bt.place .nm').map((n) => n.textContent)).toEqual(['A one', 'A two', 'A three']);
  });

  it('marks gigs, people, yours and the focus', () => {
    mount();
    expect($$('.map-bt.place').map((t) => t.querySelector('.gt')?.textContent ?? null)).toEqual([null, 'GIGS', null]);
    expect($$('.map-bt.place[data-place="a1"] .dots b')).toHaveLength(2);
    expect($$('.map-bt.place.here').map((t) => t.dataset.place)).toEqual(['a1']);
    expect($$('.map-bt.place.focus').map((t) => t.dataset.place)).toEqual(['a2']);
  });

  it('back, focus and hover report out', () => {
    const o = mount();
    click($('.map-back'));
    expect(o.onBack).toHaveBeenCalled();
    click($('.map-bt.place[data-place="a3"]'));
    expect(o.onFocus).toHaveBeenCalledWith('a3');
    hover($('.map-bt.place[data-place="a3"]'), true);
    expect(o.onHover).toHaveBeenLastCalledWith('a3');
    hover($('.map-bt.place[data-place="a3"]'), false);
    expect(o.onHover).toHaveBeenLastCalledWith(null);
  });
});

describe('file strip', () => {
  const travel = vi.fn();
  const jack = vi.fn();
  beforeEach(() => {
    travel.mockReset();
    jack.mockReset();
  });
  function mount(place: string, who: Partial<WhoIsWhere> = {}, opts: { travel?: boolean; gigs?: boolean } = { travel: true, gigs: true }, m = map()) {
    const p = m.places.find((x) => x.id === place)!;
    const district = m.districts.find((d) => d.id === p.district)!;
    host.replaceChildren(
      buildFileStrip({
        place: p,
        index: placesIn(m, district.id).indexOf(p),
        district,
        who: { people: [], ...who },
        ...(opts.travel && { onTravel: travel }),
        ...(opts.gigs && { onGigs: jack }),
      }),
    );
    return { p, district };
  }
  const go = () => $<HTMLButtonElement>('.map-strip .go');
  const gigs = () => $<HTMLButtonElement>('.map-strip .gig-open');

  it('names the place, its number and district, and who is there', () => {
    mount('a2', { people: two('a2') });
    expect($('.map-strip .t')!.textContent).toBe('A TWO');
    expect($('.map-strip .s')!.textContent).toBe('02 · AYE');
    expect($$('.map-strip .chip .tag').map((t) => t.textContent)).toEqual(['· YOU', '· CONTACT']);
  });

  it("says which side room someone is in, from the pin's list", () => {
    mount('a2', {
      people: [{ place: 'a2', room: 'p/back', id: 'vesna', name: 'Vesna', role: 'fixed', accent: '#a0f', face: null }, ...two('a2')],
      inside: { a2: [{ room: 'p/x', name: 'X', inside: [{ room: 'p/back', name: 'Back Room', inside: [] }] }] },
    });
    expect($$('.map-strip .chip .tag').map((t) => t.textContent)).toEqual(['· FIXED · IN BACK ROOM', '· YOU', '· CONTACT']);
  });

  it('says when nobody is there', () => {
    mount('a3');
    expect($('.map-strip .none')!.textContent).toBe('nobody here');
  });

  it('GO travels to the place', () => {
    mount('a1');
    expect(go()!.textContent).toBe('GO');
    click(go());
    expect(travel).toHaveBeenCalledWith('a1');
  });

  it('has no GO without onTravel', () => {
    mount('a1', {}, { gigs: true });
    expect(go()).toBeNull();
  });

  it.each([
    ['where you are', 'a1', { here: 'a1' }, "you're here"],
    ['with no room', 'a2', {}, 'no room yet'],
    ['while she replies', 'a1', { busy: true }, 'wait for her'],
  ] as const)('GO is disabled %s', (_n, place, extra, title) => {
    mount(place, extra);
    expect(go()!.disabled).toBe(true);
    expect(go()!.title).toBe(title);
    click(go());
    expect(travel).not.toHaveBeenCalled();
  });

  it('from a side room, GO to its home place is open: you stand there, but you are not in its room (final review I1)', () => {
    mount('a1', { here: 'a1', away: true });
    expect(go()!.disabled).toBe(false);
    click(go());
    expect(travel).toHaveBeenCalledWith('a1');
  });

  it('shows a lock instead of GO for an invite-only place', () => {
    const m = map();
    m.places[3].inviteOnly = true;
    mount('b1', {}, { travel: true, gigs: true }, m);
    expect($('.map-strip .invite')!.textContent).toBe('🔒 invite only');
    expect(go()).toBeNull();
  });

  it('GIGS works where there is no room, while GO cannot go', () => {
    const { p, district } = mount('a2');
    expect(go()!.disabled).toBe(true);
    click(gigs());
    expect(jack).toHaveBeenCalledWith(p, district);
  });

  it.each([
    ['while she replies', { busy: true }, 'wait for her'],
    ['with no link', { gigBlock: 'no link' }, 'no link'],
  ] as const)('GIGS is disabled %s', (_n, extra, title) => {
    mount('a2', extra);
    expect(gigs()!.disabled).toBe(true);
    expect(gigs()!.title).toBe(title);
    click(gigs());
    expect(jack).not.toHaveBeenCalled();
  });

  it('has no GIGS without onGigs, nor at a place without gigs', () => {
    mount('a2', {}, { travel: true });
    expect(gigs()).toBeNull();
    mount('a1');
    expect(gigs()).toBeNull();
  });
});
