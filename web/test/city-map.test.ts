import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CityMapData } from '../../shared/map-schema';
import { CityMap, hereFor, type WhoIsWhere } from '../src/ui/map/city-map';
import type { Frame } from '../src/ui/map/camera';
import { setHerPronoun } from '../src/room/her-copy';

// These rooms' contact is a she (the page learns it from her portrait event).
setHerPronoun('she');

const sq = (x: number, y: number) => [
  { x, y, i: null, o: null },
  { x: x + 10, y, i: null, o: null },
  { x: x + 10, y: y + 10, i: null, o: null },
];

const map = (): CityMapData => ({
  version: 1,
  image: '/map/x.webp',
  districts: [
    { id: 'a', name: 'Aye', area: 'Area A', label: [10, 10], border: sq(5, 5) },
    { id: 'b', name: 'Bee', area: 'Area B', label: [40, 10], border: sq(35, 5) },
    { id: 'c', name: 'Sea', label: [70, 70] },
  ],
  places: [
    { id: 'a1', name: 'A one', district: 'a', pin: [7, 7], scene: 'p/a1' },
    { id: 'a2', name: 'A two', district: 'a', pin: [9, 9] },
    { id: 'b1', name: 'B one', district: 'b', pin: [37, 7], scene: 'p/b1' },
  ],
});

const who = (here?: string, extra: Partial<WhoIsWhere> = {}): WhoIsWhere => ({
  here,
  people: here
    ? [
        { place: here, id: 'hicks', name: 'Hicks', role: 'you', accent: '#7fe9ff', face: null },
        { place: here, id: 'nix', name: 'Nix', role: 'contact', accent: '#ff4f8b', face: '/nix.png' },
      ]
    : [],
  ...extra,
});

let host: HTMLElement;
let cm: CityMap;
let frames: (Frame | null)[];
let cues: string[];
let travel = vi.fn<(placeId: string) => void>();
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = host) => root.querySelector<T>(sel);
const $$ = (sel: string, root: ParentNode = host) => [...root.querySelectorAll<HTMLElement>(sel)];
const click = (el: Element | null) => el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const hover = (el: Element | null, on: boolean) => el!.dispatchEvent(new MouseEvent(on ? 'mouseenter' : 'mouseleave'));
const label = (id: string) => host.querySelector<SVGTextElement>(`svg.city-names text.dname[data-id="${id}"]`);
const pin = (id: string) => $(`.pin[data-place="${id}"]`);
const bandTiles = () => $$('.map-band .map-bt.dist:not(.open) .nm').map((n) => n.textContent);

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  frames = [];
  cues = [];
  travel = vi.fn<(placeId: string) => void>();
});
afterEach(() => {
  cm?.dispose();
  host.remove();
});

function mount(here?: string, extra: Partial<WhoIsWhere> = {}, m = map(), opts: { reducedMotion?: boolean; overlay?: HTMLElement } = {}) {
  cm = new CityMap(host, { onTravel: travel, onFrame: (f) => frames.push(f), onCue: (c) => cues.push(c), ...opts });
  cm.render(m, who(here, extra));
  return m;
}

describe('CityMap', () => {
  it('opens where you are, with your place on file', () => {
    mount('b1');
    expect(cm.openId).toBe('b');
    expect(cm.openPlace).toBe('b1');
    expect($('.map-heading .t')!.textContent).toBe('BEE');
    expect($('.map-heading .s')!.textContent).toBe('Area B');
    expect($('.map-strip .t')!.textContent).toBe('B ONE');
    expect(frames.at(-1)).not.toBeNull();
    expect($$('.pin.here')).toHaveLength(1);
    expect(cues).toEqual([]);
  });

  it('opens at the city when you are not on the map: the band lists districts, no heading, no strip', () => {
    mount(undefined);
    expect(cm.openId).toBeNull();
    expect(bandTiles()).toEqual(['AYE', 'BEE']);
    expect($('.map-heading')).toBeNull();
    expect($('.map-strip')).toBeNull();
    expect(frames.at(-1)).toBeNull();
    expect(cm.focus).toBe('a');
  });

  it('shows districts with places as openable, the rest as labels only', () => {
    mount();
    expect(label('a')!.classList.contains('has')).toBe(true);
    expect(label('c')!.classList.contains('has')).toBe(false);
    expect($$('path.dpoly.has')).toHaveLength(2);
    click(label('c'));
    expect(cm.openId).toBeNull();
  });

  it('prints each name along its path, with no area line or old label (district names spec §2)', () => {
    mount();
    expect([...host.querySelectorAll('svg.city-names text.dname textPath')].map((t) => t.textContent)).toEqual(['Aye', 'Bee', 'Sea']);
    expect($('.district')).toBeNull();
    expect(host.querySelector('svg.city-names')!.textContent).not.toContain('Area');
  });

  it('the names lie under the pins, so a pin under a name takes its click (Review Focus 5)', () => {
    mount();
    const names = host.querySelector('svg.city-names')!;
    expect(names.compareDocumentPosition(pin('a1')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    ['its band tile', () => $('.map-bt.dist[data-id="a"]')],
    ['its border', () => $('path.dpoly.has[data-id="a"]')],
    ['its name', () => label('a')],
  ])('%s opens a district: confirm cue, numbered pins, other pins at full strength', (_n, target) => {
    mount();
    click(target());
    expect(cm.openId).toBe('a');
    expect(cm.openPlace).toBe('a1');
    expect(cues).toEqual(['confirm']);
    expect(frames.at(-1)).toMatchObject({ x0: expect.any(Number) });
    expect($$('.pin .map-ntag .n').map((n) => n.textContent)).toEqual(['01', '02']);
    expect($$('.pin.faded')).toHaveLength(0);
    // The open district's name stays (district names spec §3).
    expect(label('a')!.classList.contains('hide')).toBe(false);
    expect($$('path.dpoly.dim').map((p) => p.dataset.id)).toEqual(['b']);
  });

  it('a pin in another district shows its name on hover, without a number (spec 2026-10-28 §1)', () => {
    mount('a1');
    hover(pin('b1'), true);
    expect(pin('b1')!.classList.contains('on')).toBe(true);
    expect(pin('b1')!.querySelector('.map-ntag.full .nm')!.textContent).toBe('B one');
    expect(pin('b1')!.querySelector('.map-ntag .n')).toBeNull();
    expect(cm.openId).toBe('a');
    hover(pin('b1'), false);
    expect(pin('b1')!.classList.contains('on')).toBe(false);
    expect(pin('b1')!.querySelector('.map-ntag.full')).toBeNull();
  });

  it('at the city a pin shows its own name on hover and still lights its district', () => {
    mount();
    hover(pin('a1'), true);
    expect(pin('a1')!.classList.contains('on')).toBe(true);
    expect(pin('a1')!.querySelector('.map-ntag.full .nm')!.textContent).toBe('A one');
    expect($('path.dpoly[data-id="a"]')!.classList.contains('open')).toBe(true);
  });

  it("a focus move leaves another district's hovered pin lit (Review Focus 5)", () => {
    mount('a1');
    hover(pin('b1'), true);
    cm.move(1);
    expect(pin('b1')!.classList.contains('on')).toBe(true);
    expect(pin('a1')!.classList.contains('on')).toBe(false);
  });

  it('a pin click opens its district with that place on file', () => {
    mount();
    click(pin('a2'));
    expect(cm.openId).toBe('a');
    expect(cm.openPlace).toBe('a2');
    expect($('.map-strip .t')!.textContent).toBe('A TWO');
  });

  it('move() walks the places and wraps; only the focused pin shows its name', () => {
    mount('a1');
    cm.move(1);
    expect(cm.openPlace).toBe('a2');
    expect($('.map-strip .t')!.textContent).toBe('A TWO');
    expect($$('.pin .map-ntag.full').map((t) => t.closest<HTMLElement>('.pin')!.dataset.place)).toEqual(['a2']);
    expect($$('.map-bt.place.focus').map((t) => t.dataset.place)).toEqual(['a2']);
    cm.move(1);
    expect(cm.openPlace).toBe('a1');
    cm.move(-1);
    expect(cm.openPlace).toBe('a2');
    expect(cues).toEqual(['move', 'move', 'move']);
  });

  it('move() at the city walks the district tiles', () => {
    mount();
    cm.move(1);
    expect(cm.focus).toBe('b');
    expect($$('.map-bt.dist.focus').map((t) => t.dataset.id)).toEqual(['b']);
    cm.move(1);
    expect(cm.focus).toBe('a');
  });

  it('a focus change keeps the band (its tiles do not print again)', () => {
    mount('a1');
    const band = $('.map-band');
    cm.move(1);
    expect($('.map-band')).toBe(band);
  });

  it('hovering a place tile shows its pin name; leaving hides it unless focused', () => {
    mount('a1');
    hover($('.map-bt.place[data-place="a2"]'), true);
    expect(pin('a2')!.querySelector('.map-ntag')!.classList.contains('full')).toBe(true);
    hover($('.map-bt.place[data-place="a2"]'), false);
    expect(pin('a2')!.querySelector('.map-ntag')!.classList.contains('full')).toBe(false);
    expect(pin('a1')!.querySelector('.map-ntag')!.classList.contains('full')).toBe(true);
  });

  it('hovering a place tile or pin leaves the file strip as it is (it prints only on a focus change)', () => {
    mount('a1');
    const strip = $('.map-strip');
    hover($('.map-bt.place[data-place="a2"]'), true);
    hover(pin('a2'), true);
    hover(pin('a2'), false);
    expect($('.map-strip')).toBe(strip);
  });

  it('at the city, hovering a pin lights its district border', () => {
    mount();
    hover(pin('b1'), true);
    expect($('path.dpoly[data-id="b"]')!.classList.contains('open')).toBe(true);
    hover(pin('b1'), false);
    expect($('path.dpoly[data-id="b"]')!.classList.contains('open')).toBe(false);
  });

  it('at the city, hovering a district tile lights its border', () => {
    mount();
    hover($('.map-bt.dist[data-id="b"]'), true);
    expect($('path.dpoly[data-id="b"]')!.classList.contains('open')).toBe(true);
    hover($('.map-bt.dist[data-id="b"]'), false);
    expect($('path.dpoly[data-id="b"]')!.classList.contains('open')).toBe(false);
  });

  it('enter() at the city opens the focused district', () => {
    mount();
    expect(cm.enter()).toBe(true);
    expect(cm.openId).toBe('a');
  });

  it('enter() in a district travels to the focused place, once', () => {
    mount('a1');
    cm.openDistrict('b');
    expect(cm.enter()).toBe(true);
    expect(travel).toHaveBeenCalledTimes(1);
    expect(travel).toHaveBeenCalledWith('b1');
  });

  it.each([
    ['where you are', 'a1', {}, map()],
    ['with no room', 'a2', {}, map()],
    ['while she replies', 'b1', { busy: true }, map()],
    ['at an invite-only place', 'b1', {}, (() => { const m = map(); m.places[2].inviteOnly = true; return m; })()],
  ] as const)('enter() does not travel %s (Review Focus 4)', (_n, place, extra, m) => {
    mount('a1', extra, m);
    cm.openDistrict(m.places.find((p) => p.id === place)!.district, place);
    expect(cm.enter()).toBe(false);
    expect(travel).not.toHaveBeenCalled();
  });

  it('handleEscape() goes back to the city with that district focused, then reports nothing', () => {
    mount('b1');
    expect(cm.handleEscape()).toBe(true);
    expect(cm.openId).toBeNull();
    expect(cm.focus).toBe('b');
    expect(frames.at(-1)).toBeNull();
    expect(cm.handleEscape()).toBe(false);
  });

  it('puts the file strip on the left for a district in the map\'s right half, so the camera keeps it clear', () => {
    const m = map();
    m.places[2].pin = [80, 7];
    mount('a1', {}, m);
    expect($('.map-strip')!.classList.contains('left')).toBe(false);
    cm.openDistrict('b');
    expect($('.map-strip')!.classList.contains('left')).toBe(true);
    cm.move(1);
    expect($('.map-strip')!.classList.contains('left')).toBe(true);
  });

  it('the ◂ LOWLIGHT tile goes back to the city', () => {
    mount('a1');
    click($('.map-back'));
    expect(cm.openId).toBeNull();
    expect(bandTiles()).toEqual(['AYE', 'BEE']);
  });

  it('update() keeps the open district and focus', () => {
    mount('a1');
    cm.move(1);
    const m = map();
    m.districts[0].name = 'Aye two';
    cm.update(m, who('a1'));
    expect(cm.openId).toBe('a');
    expect(cm.openPlace).toBe('a2');
    expect($('.map-heading .t')!.textContent).toBe('AYE TWO');
  });

  it('update() goes to the city when the open district is gone (Review Focus 5)', () => {
    mount('b1');
    const m = map();
    m.districts.splice(1, 1);
    m.places.splice(2, 1);
    expect(() => cm.update(m, who())).not.toThrow();
    expect(cm.openId).toBeNull();
    expect(label('b')).toBeNull();
    expect(frames.at(-1)).toBeNull();
  });

  it('update() refocuses the first place when the focused one is gone (Review Focus 5)', () => {
    mount('a1');
    cm.move(1);
    const m = map();
    m.places.splice(1, 1);
    expect(() => cm.update(m, who('a1'))).not.toThrow();
    expect(cm.openPlace).toBe('a1');
  });

  it('clear() empties the map and forgets what was open', () => {
    mount('a1');
    cm.clear();
    expect(cm.openId).toBeNull();
    expect($('.pin')).toBeNull();
    expect($('.map-band')).toBeNull();
  });

  it('marks itself still under reduced motion (no printing)', () => {
    mount('a1', {}, map(), { reducedMotion: true });
    expect($$('.city-map.map-still').length).toBeGreaterThan(0);
  });

  it('with an overlay host, the heading, band and strip go there and the pins stay in the world', () => {
    const overlay = document.createElement('div');
    document.body.append(overlay);
    mount('a1', {}, map(), { overlay });
    expect($('.map-band', overlay)).not.toBeNull();
    expect($('.map-strip', overlay)).not.toBeNull();
    expect($('.map-heading', overlay)).not.toBeNull();
    expect($('.map-band')).toBeNull();
    expect($('.pin')).not.toBeNull();
    cm.dispose();
    expect(overlay.childElementCount).toBe(0);
    overlay.remove();
  });

  it('marks gig places with a ring on the pin', () => {
    const m = map();
    m.places[0].gigs = true;
    mount(undefined, {}, m);
    expect(pin('a1')!.querySelector('.gig-ring')).not.toBeNull();
    expect(pin('b1')!.querySelector('.gig-ring')).toBeNull();
  });

  it('hereFor takes the first place linked to the room', () => {
    const m = map();
    m.places[1].scene = 'p/a1';
    expect(hereFor(m, 'p/a1')).toBe('a1');
    expect(hereFor(m, 'p/none')).toBeUndefined();
    expect(hereFor(m, null)).toBeUndefined();
  });

  it('a side place draws no pin and has no tile (room exits spec §4a)', () => {
    const m = map();
    m.places[1].side = true;
    mount(undefined, {}, m);
    expect(pin('a2')).toBeNull();
    expect(pin('a1')).not.toBeNull();
  });

  it('hereFor puts you at an exit room\'s or side place\'s home (room exits spec §4)', () => {
    const m = map();
    const exits = new Map([['p/side', { placeId: 'side', districtId: 'a', home: 'a1', name: 'Side' }], ['p/lost', { placeId: 'lost', districtId: 'a', home: null, name: 'Lost' }]]);
    expect(hereFor(m, 'p/side', exits)).toBe('a1');
    expect(hereFor(m, 'p/lost', exits)).toBeUndefined();
    expect(hereFor(m, 'p/b1', exits)).toBe('b1');
    m.places[2].side = true;
    const sideHome = new Map([['p/b1', { placeId: 'b1', districtId: 'b', home: 'a1', name: 'B one' }]]);
    expect(hereFor(m, 'p/b1', sideHome)).toBe('a1');
  });

  it("hereFor puts you in a room two steps in at the pin whose list has it (a side room's side room)", () => {
    const m = map();
    const exits = new Map([['p/deep', { placeId: 'deep', districtId: 'a', home: null, name: 'Deep' }]]);
    const inside = { a1: [{ room: 'p/mid', name: 'Mid', inside: [{ room: 'p/deep', name: 'Deep', inside: [] }] }] };
    expect(hereFor(m, 'p/deep', exits)).toBeUndefined();
    expect(hereFor(m, 'p/deep', exits, inside)).toBe('a1');
    expect(hereFor(m, 'p/nowhere', exits, inside)).toBeUndefined();
  });

  it('move() in a one-place district plays no cue (nothing moves)', () => {
    mount('b1');
    cm.move(1);
    expect(cues).toEqual([]);
  });

  it('pins carry no browser tooltip (the name tag shows the name)', () => {
    mount('a1');
    expect(pin('a1')!.hasAttribute('title')).toBe(false);
  });

  describe('side rooms on the pin', () => {
    const inside = { a1: [{ room: 'p/back', name: 'Back Room', inside: [{ room: 'p/cellar', name: 'Cellar', inside: [] }] }] };

    it('labels a pin with how many rooms are inside it; a pin with none has no label', () => {
      mount('a1', { inside });
      expect(pin('a1')!.querySelector('.map-ntag .sub')!.textContent).toBe('+2');
      expect(pin('a2')!.querySelector('.sub')).toBeNull();
    });

    it('drops the list down under the tag while the pin is lit, nested by the way in', () => {
      mount('a1', { inside });
      expect($$('.pin.focus .map-inside')).toHaveLength(1);
      const rows = $$('.map-inside li', pin('a1')!);
      expect(rows.map((r) => r.querySelector('.nm')!.textContent)).toEqual(['Back Room', 'Cellar']);
      expect(rows.map((r) => r.dataset.depth)).toEqual(['1', '2']);
      cm.move(1);
      expect($$('.pin.focus .map-inside')).toHaveLength(0);
    });

    it('shows one list at a time: the focused pin\'s, not a hovered one\'s', () => {
      mount('a1', { inside: { ...inside, a2: [{ room: 'p/attic', name: 'Attic', inside: [] }] } });
      hover(pin('a2'), true);
      expect(pin('a2')!.classList.contains('on')).toBe(true);
      expect($$('.pin.focus .map-inside')).toHaveLength(1);
      expect(pin('a1')!.classList.contains('focus')).toBe(true);
      cm.move(1);
      expect(pin('a2')!.classList.contains('focus')).toBe(true);
      expect(pin('a1')!.classList.contains('focus')).toBe(false);
    });

    it('opens a low pin\'s list upward, and one on the file strip\'s side away from the strip', () => {
      // District A's frame runs y 7–9 and x 7–9; its strip stands on the right (the district is in the map's left half).
      mount('a1', { inside: { ...inside, a2: [{ room: 'p/attic', name: 'Attic', inside: [] }] } });
      expect(pin('a1')!.classList.contains('inside-up')).toBe(false);
      expect(pin('a1')!.classList.contains('inside-left')).toBe(false);
      expect(pin('a2')!.classList.contains('inside-up')).toBe(true);
      expect(pin('a2')!.classList.contains('inside-left')).toBe(true);
    });

    it('a pin in a district on the right opens its list rightward, the strip being on the left', () => {
      const m = map();
      m.districts.push({ id: 'r', name: 'Arr', area: 'Area R', label: [80, 10], border: sq(75, 5) });
      m.places.push({ id: 'r1', name: 'R one', district: 'r', pin: [78, 7], scene: 'p/r1' }, { id: 'r2', name: 'R two', district: 'r', pin: [82, 9], scene: 'p/r2' });
      mount('r1', { inside: { r2: [{ room: 'p/attic', name: 'Attic', inside: [] }] } }, m);
      expect($('.map-strip')!.classList.contains('left')).toBe(true);
      expect(pin('r2')!.classList.contains('inside-up')).toBe(true);
      expect(pin('r2')!.classList.contains('inside-left')).toBe(false);
    });

    it("shows people in a side room on that room's row, not the pin's", () => {
      mount('a1', {
        inside,
        people: [
          { place: 'a1', room: 'p/back', id: 'nix', name: 'Nix', role: 'contact', accent: '#ff4f8b', face: null },
          { place: 'a1', room: 'p/a1', id: 'hae', name: 'Hae', role: 'fixed', accent: '#ffaa00', face: null },
        ],
      });
      const tag = pin('a1')!.querySelector('.map-ntag > .in > .dots')!;
      expect(tag.children).toHaveLength(1);
      const back = $$('.map-inside li', pin('a1')!)[0];
      expect(back.querySelectorAll('.dots b')).toHaveLength(1);
    });

    it('is information only: a row has no GO and clicking it travels nowhere', () => {
      mount('a1', { inside });
      const row = $('.map-inside li', pin('a1')!)!;
      expect(row.querySelector('button')).toBeNull();
      click(row);
      expect(travel).not.toHaveBeenCalled();
    });
  });
});

describe('CityMap raised pins (rendered map spec §5)', () => {
  it('a raised pin sits above its ground point with a stem down to it', async () => {
    const { liftPct } = await import('../../shared/map-projection');
    cm = new CityMap(host, { onTravel: travel, onFrame: (f) => frames.push(f) });
    cm.render(map(), who('a1'), { a1: 26.7 });
    expect(parseFloat(pin('a1')!.style.top)).toBeCloseTo(7 - liftPct(26.7), 6);
    const stem = $('.pin-stem[data-place="a1"]')!;
    expect(parseFloat(stem.style.top)).toBeCloseTo(7 - liftPct(26.7), 6);
    expect(parseFloat(stem.style.height)).toBeCloseTo(liftPct(26.7), 6);
  });
  it('Level 4 stands above Level 2 at nearby places', () => {
    cm = new CityMap(host, { onTravel: travel, onFrame: (f) => frames.push(f) });
    cm.render(map(), who('a1'), { a1: 26.7, a2: 9.7 });
    expect(parseFloat(pin('a1')!.style.top) - 7).toBeLessThan(parseFloat(pin('a2')!.style.top) - 9);
  });
  it('painting mode: raised places stay on the ground', () => {
    cm = new CityMap(host, { onTravel: travel, onFrame: (f) => frames.push(f) });
    cm.render(map(), who('a1'));
    expect(pin('a1')!.style.top).toBe('7%');
    expect($('.pin-stem')).toBeNull();
  });
});
