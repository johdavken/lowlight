import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CityMapData } from '../../shared/map-schema';
import { CityMap, hereFor, NEAR_SCALE, pinSize, tagSize, type WhoIsWhere } from '../src/ui/map/city-map';
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
let frames: Frame[];
let focused: (string | null)[];
let cues: string[];
let travel = vi.fn<(placeId: string) => void>();
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = host) => root.querySelector<T>(sel);
const $$ = (sel: string, root: ParentNode = host) => [...root.querySelectorAll<HTMLElement>(sel)];
const click = (el: Element | null) => el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const hover = (el: Element | null, on: boolean) => el!.dispatchEvent(new MouseEvent(on ? 'mouseenter' : 'mouseleave'));
const label = (id: string) => host.querySelector<SVGTextElement>(`svg.city-names text.dname[data-id="${id}"]`);
const pin = (id: string) => $(`.pin[data-place="${id}"]`);

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  frames = [];
  focused = [];
  cues = [];
  travel = vi.fn<(placeId: string) => void>();
});
afterEach(() => {
  cm?.dispose();
  host.remove();
});

function mount(here?: string, extra: Partial<WhoIsWhere> = {}, m = map(), opts: { reducedMotion?: boolean; overlay?: HTMLElement } = {}) {
  cm = new CityMap(host, { onTravel: travel, onZoomTo: (f) => frames.push(f), onFocus: (p) => focused.push(p?.id ?? null), onCue: (c) => cues.push(c), ...opts });
  cm.render(m, who(here, extra));
  return m;
}

describe('CityMap', () => {
  it('opens with no card, every pin drawn, no band or heading (map pins spec §1)', () => {
    mount('b1');
    expect(cm.focus).toBeNull();
    expect($$('.pin').map((p) => p.dataset.place)).toEqual(['a1', 'a2', 'b1']);
    expect(pin('b1')!.classList.contains('here')).toBe(true);
    expect($('.map-strip')).toBeNull();
    expect($('.map-band')).toBeNull();
    expect($('.map-heading')).toBeNull();
  });

  it('shows districts with places as clickable, the rest as labels only', () => {
    mount();
    expect(label('a')!.classList.contains('has')).toBe(true);
    expect(label('c')!.classList.contains('has')).toBe(false);
    expect($$('path.dpoly.has')).toHaveLength(2);
    click(label('c'));
    expect(frames).toEqual([]);
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
    ['its name', () => label('a')],
    ['its border', () => $('path.dpoly.has[data-id="a"]')],
  ])('%s asks the camera to frame the district (map pins spec §3), with the confirm cue', (_n, target) => {
    mount();
    click(target());
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ x0: expect.any(Number), x1: expect.any(Number) });
    expect(frames[0].x0).toBeLessThan(7);
    expect(frames[0].x1).toBeGreaterThan(9);
    expect(cues).toEqual(['confirm']);
    // Nothing else changes: no card, every pin as it was.
    expect(cm.focus).toBeNull();
  });

  it('GO rides on the picked pin\'s tag, not the card, and moves with the pick', () => {
    mount('a1');
    click(pin('b1'));
    expect($('.map-strip .go')).toBeNull();
    expect($$('.map-go')).toHaveLength(1);
    expect($('.map-go', pin('b1')!.querySelector('.map-ntag')!)!.textContent).toBe('GO');
    click($('.map-go .go'));
    expect(travel).toHaveBeenLastCalledWith('b1');
    click(pin('a1'));
    expect($$('.map-go')).toHaveLength(1);
    expect($<HTMLButtonElement>('.map-go .go', pin('a1')!)!.disabled).toBe(true);
  });

  it("the card shows the place's readout as dossier lines; none without one", () => {
    const m = map();
    m.places[0] = { ...m.places[0], readout: [{ label: 'WHAT', text: 'A bar.' }, { label: 'WATCH FOR', text: 'The door.' }] };
    mount('a1', {}, m);
    click(pin('a1'));
    expect($$('.map-strip .readout dt').map((d) => d.textContent)).toEqual(['WHAT', 'WATCH FOR']);
    expect($$('.map-strip .readout dd').map((d) => d.textContent)).toEqual(['A bar.', 'The door.']);
    click(pin('b1'));
    expect($('.map-strip .readout')).toBeNull();
  });

  it('a pin click opens its card (name, district, who is there) and lights its tag', () => {
    mount('a1');
    click(pin('a1'));
    expect(cm.focus).toBe('a1');
    expect(focused).toEqual(['a1']);
    expect($('.map-strip .t')!.textContent).toBe('A ONE');
    expect($('.map-strip .s')!.textContent).toBe('AYE');
    expect(pin('a1')!.classList.contains('focus')).toBe(true);
    expect(pin('a1')!.classList.contains('on')).toBe(true);
    click(pin('b1'));
    expect(cm.focus).toBe('b1');
    expect(pin('a1')!.classList.contains('focus')).toBe(false);
    expect($$('.map-strip')).toHaveLength(1);
  });

  it('a place on the right half has its card on the left', () => {
    const m = map();
    m.places.push({ id: 'r1', name: 'R one', district: 'b', pin: [80, 50], scene: 'p/r1' });
    mount(undefined, {}, m);
    click(pin('r1'));
    expect($('.map-strip')!.classList.contains('left')).toBe(true);
    click(pin('a1'));
    expect($('.map-strip')!.classList.contains('left')).toBe(false);
  });

  it('the card stands away from where the pin is on screen, not on the map (review I1)', () => {
    const overlay = document.createElement('div');
    document.body.append(overlay);
    mount(undefined, {}, map(), { overlay });
    overlay.querySelector<HTMLElement>('.map-overlay')!.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1600, bottom: 900, width: 1600, height: 900, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    // a1 is at map x 7 %, but zoomed in it sits on the screen's right.
    pin('a1')!.getBoundingClientRect = () => ({ left: 1200, top: 400, right: 1200, bottom: 400, width: 0, height: 0, x: 1200, y: 400, toJSON: () => ({}) }) as DOMRect;
    click(pin('a1'));
    expect(overlay.querySelector('.map-strip')!.classList.contains('left')).toBe(true);
    pin('b1')!.getBoundingClientRect = () => ({ left: 300, top: 400, right: 300, bottom: 400, width: 0, height: 0, x: 300, y: 400, toJSON: () => ({}) }) as DOMRect;
    click(pin('b1'));
    expect(overlay.querySelector('.map-strip')!.classList.contains('left')).toBe(false);
    cm.dispose();
    overlay.remove();
  });

  it('every pin has a finger-sized target that does not shrink with the zoom (review I2)', () => {
    mount();
    expect($$('.pin > .hit')).toHaveLength(3);
  });

  it('every tag carries the full name, with faces (or a dot) of who is at the pin', () => {
    mount('a1');
    expect(pin('a1')!.querySelector('.map-ntag .nm')!.textContent).toBe('A one');
    expect(pin('b1')!.querySelector('.map-ntag .nm')!.textContent).toBe('B one');
    const faces = pin('a1')!.querySelector('.map-ntag .faces')!;
    // Hicks has no face: a dot in his colour; Nix has one.
    expect(faces.querySelector('b')).not.toBeNull();
    expect(faces.querySelector('img.pface')!.getAttribute('src')).toBe('/nix.png');
    expect(pin('a1')!.classList.contains('peopled')).toBe(true);
    expect(pin('a2')!.classList.contains('peopled')).toBe(false);
  });

  it('far out a dot per person sits beside the pin (map pins spec §2)', () => {
    mount('a1');
    expect($$('.who b', pin('a1')!).map((b) => b.style.getPropertyValue('--c'))).toEqual(['#7fe9ff', '#ff4f8b']);
    expect(pin('a2')!.querySelector('.who')).toBeNull();
  });

  it('setScale: far below NEAR_SCALE, near from it; pins and tags size with the zoom', () => {
    mount('a1');
    const root = $('.city-map')!;
    cm.setScale(1);
    expect(root.classList.contains('far')).toBe(true);
    expect(Number(root.style.getPropertyValue('--pz'))).toBeCloseTo(pinSize(1));
    cm.setScale(NEAR_SCALE);
    expect(root.classList.contains('far')).toBe(false);
    cm.setScale(3);
    expect(Number(root.style.getPropertyValue('--pz'))).toBeGreaterThan(pinSize(1));
    expect(Number(root.style.getPropertyValue('--tz'))).toBeGreaterThan(tagSize(NEAR_SCALE));
  });

  it('hover lights the pin (its name shows far out) and its district border', () => {
    mount();
    hover(pin('a1'), true);
    expect(pin('a1')!.classList.contains('on')).toBe(true);
    expect($('path.dpoly[data-id="a"]')!.classList.contains('open')).toBe(true);
    hover(pin('a1'), false);
    expect(pin('a1')!.classList.contains('on')).toBe(false);
    expect($('path.dpoly[data-id="a"]')!.classList.contains('open')).toBe(false);
  });

  describe('crowded tags (map pins spec §2)', () => {
    // jsdom lays nothing out: each tag gets a box, a1's and a2's overlapping, b1's clear.
    const boxes: Record<string, [number, number, number, number]> = { a1: [100, 100, 200, 120], a2: [150, 110, 250, 130], b1: [400, 100, 500, 120] };
    const lay = () => {
      for (const [id, [l, t, r, b]] of Object.entries(boxes)) {
        const tag = pin(id)!.querySelector('.map-ntag')!;
        tag.getBoundingClientRect = () => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t, x: l, y: t, toJSON: () => ({}) }) as DOMRect;
      }
      cm.layoutTags();
    };
    const crowded = () => $$('.pin.crowded').map((p) => p.dataset.place);

    it('far out nothing is crowded (tags show on hover only)', () => {
      mount();
      cm.setScale(1);
      lay();
      expect(crowded()).toEqual([]);
    });

    it('near, the later of two overlapping tags hides; yours wins over map order', () => {
      mount();
      cm.setScale(2);
      lay();
      expect(crowded()).toEqual(['a2']);
      cm.dispose();
      host.replaceChildren();
      mount('a2');
      cm.setScale(2);
      lay();
      expect(crowded()).toEqual(['a1']);
    });

    it('zooming back out clears the crowding at once (review M4)', () => {
      mount();
      cm.setScale(2);
      lay();
      expect(crowded()).toEqual(['a2']);
      cm.setScale(1);
      expect(crowded()).toEqual([]);
    });

    it('hovering a pin lights it without reshuffling the other tags (review M6)', () => {
      mount();
      cm.setScale(2);
      lay();
      hover(pin('a2'), true);
      expect(pin('a2')!.classList.contains('on')).toBe(true);
      lay();
      expect(crowded()).toEqual(['a2']);
    });

    it('a place with people wins over one without; the card wins over the rest', () => {
      mount(undefined, { people: [{ place: 'a2', id: 'nix', name: 'Nix', role: 'contact', accent: '#ff4f8b', face: null }] });
      cm.setScale(2);
      lay();
      expect(crowded()).toEqual(['a1']);
      cm.dispose();
      host.replaceChildren();
      mount();
      cm.setScale(2);
      click(pin('a2'));
      lay();
      expect(crowded()).toEqual(['a1']);
    });
  });

  it('move() walks every place district by district and wraps; from none it starts at yours', () => {
    mount('a2');
    cm.move(1);
    expect(cm.focus).toBe('a2');
    cm.move(1);
    expect(cm.focus).toBe('b1');
    cm.move(1);
    expect(cm.focus).toBe('a1');
    cm.move(-1);
    expect(cm.focus).toBe('b1');
    expect(cues).toEqual(['move', 'move', 'move', 'move']);
  });

  it('enter() travels to the place whose card is open, once; nothing without a card', () => {
    mount('a1');
    expect(cm.enter()).toBe(false);
    click(pin('b1'));
    expect(cm.enter()).toBe(true);
    expect(travel).toHaveBeenCalledWith('b1');
  });

  it('handleEscape() closes the card and says so; with none it reports nothing', () => {
    mount('a1');
    click(pin('a1'));
    expect(cm.handleEscape()).toBe(true);
    expect(cm.focus).toBeNull();
    expect($('.map-strip')).toBeNull();
    expect(focused.at(-1)).toBeNull();
    expect(cm.handleEscape()).toBe(false);
  });

  it('select(null) closes the card (a click on the map)', () => {
    mount();
    click(pin('a1'));
    cm.select(null);
    expect($('.map-strip')).toBeNull();
  });

  it('update() keeps the card while its place exists, else closes it', () => {
    const m = mount('a1');
    click(pin('a2'));
    cm.update(m, who('a1'));
    expect(cm.focus).toBe('a2');
    cm.update({ ...m, places: m.places.filter((p) => p.id !== 'a2') }, who('a1'));
    expect(cm.focus).toBeNull();
    expect($('.map-strip')).toBeNull();
  });

  it('clear() empties the map and forgets the card', () => {
    mount('a1');
    click(pin('a1'));
    cm.clear();
    expect(cm.focus).toBeNull();
    expect($('.pin')).toBeNull();
    expect($('.map-strip')).toBeNull();
  });

  it('marks itself still under reduced motion (no printing)', () => {
    mount(undefined, {}, map(), { reducedMotion: true });
    expect($('.city-map')!.classList.contains('map-still')).toBe(true);
  });

  it('with an overlay host the card goes there and the pins stay in the world', () => {
    const overlay = document.createElement('div');
    document.body.append(overlay);
    mount('a1', {}, map(), { overlay });
    click(pin('a1'));
    expect(overlay.querySelector('.map-strip')).not.toBeNull();
    expect($('.map-strip')).toBeNull();
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

  it('move() with one place plays no cue (nothing moves)', () => {
    const m = map();
    m.places = [m.places[0]];
    mount('a1', {}, m);
    cm.move(1);
    expect(cues).toEqual(['move']);
    cm.move(1);
    expect(cues).toEqual(['move']);
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

    it('drops the list down under the tag while its card is open, nested by the way in', () => {
      mount('a1', { inside });
      expect($$('.pin.focus .map-inside')).toHaveLength(0);
      click(pin('a1'));
      expect($$('.pin.focus .map-inside')).toHaveLength(1);
      const rows = $$('.map-inside li', pin('a1')!);
      expect(rows.map((r) => r.querySelector('.nm')!.textContent)).toEqual(['Back Room', 'Cellar']);
      expect(rows.map((r) => r.dataset.depth)).toEqual(['1', '2']);
      click(pin('a2'));
      expect(pin('a1')!.classList.contains('focus')).toBe(false);
    });

    it("shows people in a side room on that room's row, not the pin's", () => {
      mount('a1', {
        inside,
        people: [
          { place: 'a1', room: 'p/back', id: 'nix', name: 'Nix', role: 'contact', accent: '#ff4f8b', face: null },
          { place: 'a1', room: 'p/a1', id: 'hae', name: 'Hae', role: 'fixed', accent: '#ffaa00', face: null },
        ],
      });
      const tag = pin('a1')!.querySelector('.map-ntag > .in > .faces')!;
      expect(tag.children).toHaveLength(1);
      const back = $$('.map-inside li', pin('a1')!)[0];
      expect(back.querySelectorAll('.dots b')).toHaveLength(1);
    });

    it('is information only: a row has no GO and clicking it travels nowhere', () => {
      mount('a1', { inside });
      click(pin('a1'));
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
    cm = new CityMap(host, { onTravel: travel });
    cm.render(map(), who('a1'), { a1: 26.7 });
    expect(parseFloat(pin('a1')!.style.top)).toBeCloseTo(7 - liftPct(26.7), 6);
    const stem = $('.pin-stem[data-place="a1"]')!;
    expect(parseFloat(stem.style.top)).toBeCloseTo(7 - liftPct(26.7), 6);
    expect(parseFloat(stem.style.height)).toBeCloseTo(liftPct(26.7), 6);
  });
  it('Level 4 stands above Level 2 at nearby places', () => {
    cm = new CityMap(host, { onTravel: travel });
    cm.render(map(), who('a1'), { a1: 26.7, a2: 9.7 });
    expect(parseFloat(pin('a1')!.style.top) - 7).toBeLessThan(parseFloat(pin('a2')!.style.top) - 9);
  });
  it('painting mode: raised places stay on the ground', () => {
    cm = new CityMap(host, { onTravel: travel });
    cm.render(map(), who('a1'));
    expect(pin('a1')!.style.top).toBe('7%');
    expect($('.pin-stem')).toBeNull();
  });
});
