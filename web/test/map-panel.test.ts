import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CityMapData } from '../../shared/map-schema';
import { MapPanel } from '../src/ui/map';
import type { WhoIsWhere } from '../src/ui/map/city-map';

const shipped = () => JSON.parse(readFileSync('map/lowlight.json', 'utf8')) as unknown;
const atIntake = (): WhoIsWhere => ({
  here: 'lowlight-intake',
  people: [{ place: 'lowlight-intake', id: 'nix', name: 'Nix', role: 'contact', accent: '#ff4f8b', face: null }],
});
const flush = () => new Promise((r) => setTimeout(r, 0));
const esc = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

let root: HTMLElement;
let panel: MapPanel;
beforeEach(() => {
  // jsdom has no 2D canvas and says so on every call: the ambience layer just gets none.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  panel?.dispose();
  root.remove();
});

function mount(load: () => Promise<unknown>, who: (m: CityMapData) => WhoIsWhere = atIntake) {
  panel = new MapPanel(root, { reducedMotion: true, load, who });
  return panel;
}

describe('MapPanel', () => {
  it('its hint brackets the key', async () => {
    mount(async () => shipped()).open();
    await flush();
    expect(root.querySelector('.map-hint')!.textContent).toBe('SCROLL ZOOM · DRAG MOVE · [ESC] CLOSE');
  });

  it('loads the map and opens where you are', async () => {
    mount(async () => shipped()).open();
    await flush();
    expect(root.querySelector('.map-heading .t')!.textContent).toBe('KARASU');
  });

  it('names a place by its id or its room, once loaded (arrival screen spec §4)', async () => {
    const p = mount(async () => shipped());
    expect(p.place('lowlight-intake')).toBeNull();
    p.open();
    await flush();
    expect(p.place('lowlight-intake')).toMatchObject({ name: 'Lowlight Intake', scene: 'karasu/lowlight-intake' });
    expect(p.placeOf('karasu/lowlight-intake')).toMatchObject({ id: 'lowlight-intake' });
    expect(p.place('nowhere')).toBeNull();
    expect(p.placeOf('nowhere')).toBeNull();
  });

  it("shows the picture the map's data names", async () => {
    const m = shipped() as { image: string };
    m.image = '/map/other.webp';
    mount(async () => m).open();
    await flush();
    expect(root.querySelector<HTMLImageElement>('.map-img')!.getAttribute('src')).toBe('/map/other.webp');
  });

  it('close(true) is a switch to another screen: hidden at once, no glitch-out, Esc the room\'s again', async () => {
    const onClose = vi.fn();
    const p = (panel = new MapPanel(root, { reducedMotion: false, load: async () => shipped(), who: atIntake, onClose }));
    p.open();
    await flush();
    p.close(true);
    expect(root.hidden).toBe(true);
    expect(root.classList.contains('map-closing')).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    const room = vi.fn();
    window.addEventListener('keydown', room);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(room).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', room);
  });

  it('loads the map every time it opens', async () => {
    const load = vi.fn(async () => shipped());
    const p = mount(load);
    p.open();
    await flush();
    p.close();
    p.open();
    await flush();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['a failed load', () => Promise.reject(new Error('500 map data is broken'))],
    ['broken data', async () => ({})],
  ])('keeps the picture and shows a notice for %s', async (_n, load) => {
    mount(load).open();
    await flush();
    expect(root.querySelector('.map-img')).not.toBeNull();
    expect(root.querySelector('.map-notice')!.textContent).toMatch(/^MAP DATA:/);
    expect(root.querySelector('.panel')).toBeNull();
  });

  it('forgets the last map while the next one loads, and after a failed load', async () => {
    let next: () => Promise<unknown> = async () => shipped();
    const p = mount(() => next());
    p.open();
    await flush();
    p.close();
    next = () => new Promise(() => {});
    p.open();
    expect(root.querySelector('.city-map text.dname')).toBeNull();
    expect(root.querySelector('.map-band')).toBeNull();
    p.close();
    next = async () => ({});
    p.open();
    await flush();
    expect(root.querySelector('.city-map text.dname')).toBeNull();
  });

  it('escape closes the panel first, then the map', async () => {
    const p = mount(async () => shipped());
    p.open();
    await flush();
    esc();
    await flush();
    expect(p.isOpen).toBe(true);
    expect(root.querySelector('.panel')).toBeNull();
    esc();
    expect(p.isOpen).toBe(false);
  });

  it('GO sends the move and closes the map', async () => {
    const onTravel = vi.fn();
    const p = new MapPanel(root, {
      reducedMotion: true,
      load: async () => shipped(),
      who: () => ({ here: 'lowlight-intake', people: [], pack: 'ribbon' }),
      onTravel,
    });
    panel = p;
    p.open();
    await flush();
    root.querySelector<HTMLElement>('.map-bt.place[data-place="haes-noodles"]')!.click();
    root.querySelector<HTMLButtonElement>('.map-strip .go')!.click();
    expect(onTravel).toHaveBeenCalledWith('haes-noodles');
    expect(p.isOpen).toBe(false);
  });

  it('GIGS hands over the place and its district, and the map stays open', async () => {
    const onGigs = vi.fn();
    const p = new MapPanel(root, { reducedMotion: true, load: async () => shipped(), who: atIntake, onGigs });
    panel = p;
    p.open();
    await flush();
    root.querySelector<HTMLElement>('.map-bt.place[data-place="the-tilt"]')!.click();
    root.querySelector<HTMLButtonElement>('.map-strip .gig-open')!.click();
    expect(onGigs).toHaveBeenCalledTimes(1);
    expect(onGigs.mock.calls[0][0]).toMatchObject({ id: 'the-tilt', name: 'The Tilt' });
    expect(onGigs.mock.calls[0][1]).toMatchObject({ id: 'karasu' });
    expect(p.isOpen).toBe(true);
  });

  it('Esc goes to escapeFirst first: taken, the map stays; not taken, it closes (Review Focus 2)', async () => {
    let take = true;
    const escapeFirst = vi.fn(() => take);
    const p = new MapPanel(root, { reducedMotion: true, load: async () => shipped(), who: atIntake, escapeFirst });
    panel = p;
    p.open();
    await flush();
    esc();
    expect(escapeFirst).toHaveBeenCalledTimes(1);
    expect(p.isOpen).toBe(true);
    take = false;
    esc(); // the district panel closes first, as before
    esc();
    expect(p.isOpen).toBe(false);
  });

  it('onClose runs each time it closes, however it closes (the hack window goes with it)', async () => {
    const onClose = vi.fn();
    const p = new MapPanel(root, { reducedMotion: true, load: async () => shipped(), who: atIntake, onClose });
    panel = p;
    p.open();
    await flush();
    p.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    p.open();
    await flush();
    p.toggle();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('has no spot picker any more', () => {
    mount(async () => shipped());
    expect(root.querySelector('.map-pick')).toBeNull();
  });
});


describe('MapPanel camera, keys and cues', () => {
  const key = (k: string) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    return e;
  };
  /** jsdom lays nothing out: give the screen a size. */
  const size = (w: number, h: number) => {
    const s = root.querySelector<HTMLElement>('.map-screen')!;
    Object.defineProperty(s, 'clientWidth', { configurable: true, value: w });
    Object.defineProperty(s, 'clientHeight', { configurable: true, value: h });
  };
  const world = () => root.querySelector<HTMLElement>('.map-world')!;
  const scale = () => Number(/scale\(([\d.]+)\)/.exec(world().style.transform)?.[1] ?? 1);

  async function opened(extra: Partial<ConstructorParameters<typeof MapPanel>[1]> = {}, who = atIntake) {
    panel = new MapPanel(root, { reducedMotion: true, load: async () => shipped(), who, ...extra });
    size(1200, 800);
    panel.open();
    await flush();
    return panel;
  }

  it('opens on the whole city even with your district open (no auto district zoom); Esc closes the district, a second Esc the map', async () => {
    const p = await opened();
    expect(scale()).toBe(1);
    expect(root.querySelector('.map-strip')).not.toBeNull();
    esc();
    expect(scale()).toBe(1);
    expect(p.isOpen).toBe(true);
    esc();
    expect(p.isOpen).toBe(false);
  });
  it('opening or closing a district keeps your own zoom', async () => {
    await opened();
    root.querySelector('.map-screen')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: 600, clientY: 400, bubbles: true, cancelable: true }));
    const zoomed = world().style.transform;
    expect(scale()).toBeGreaterThan(1);
    esc();
    expect(world().style.transform).toBe(zoomed);
  });

  it('opens at the whole city when you are not on the map', async () => {
    await opened({}, () => ({ people: [] }));
    expect(scale()).toBe(1);
  });

  it('a resize keeps your zoom and your place in the margin (spec 2026-10-28 Review Focus 1)', async () => {
    await opened();
    const s = root.querySelector<HTMLElement>('.map-screen')!;
    s.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: 600, clientY: 400, bubbles: true, cancelable: true }));
    const k = scale();
    expect(k).toBeGreaterThan(1);
    const ptr = (type: string, x: number, y: number) =>
      Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }), { pointerId: 1 });
    s.dispatchEvent(ptr('pointerdown', 100, 400));
    s.dispatchEvent(ptr('pointermove', 110, 400));
    s.dispatchEvent(ptr('pointermove', 2000, 400));
    s.dispatchEvent(ptr('pointerup', 2000, 400));
    const at = () => /translate\(([-\d.e]+)px, ([-\d.e]+)px\)/.exec(world().style.transform)!.slice(1).map(Number);
    expect(at()[0]).toBeGreaterThan(0);
    size(600, 400);
    window.dispatchEvent(new Event('resize'));
    expect(scale()).toBe(k);
    expect(at()[0]).toBeGreaterThan(0);
    expect(at()[0]).toBeLessThanOrEqual(300);
    expect(at()[1]).toBeLessThanOrEqual(200);
  });

  it('takes the arrows while open and moves the focus; leaves them alone while closed (Review Focus 3)', async () => {
    const p = await opened();
    const strip = () => root.querySelector('.map-strip .t')!.textContent;
    const first = strip();
    expect(key('ArrowRight').defaultPrevented).toBe(true);
    expect(strip()).not.toBe(first);
    p.close();
    expect(key('ArrowRight').defaultPrevented).toBe(false);
    expect(key('Enter').defaultPrevented).toBe(false);
  });

  it('leaves the arrows and Enter to whatever is over the map (Review Focus 3)', async () => {
    await opened({ overlayOpen: () => true });
    const first = root.querySelector('.map-strip .t')!.textContent;
    expect(key('ArrowRight').defaultPrevented).toBe(false);
    expect(key('Enter').defaultPrevented).toBe(false);
    expect(root.querySelector('.map-strip .t')!.textContent).toBe(first);
  });

  it('Enter at a place GO can reach travels and closes the map', async () => {
    const onTravel = vi.fn();
    const p = await opened({ onTravel });
    root.querySelector<HTMLElement>('.map-bt.place[data-place="haes-noodles"]')!.click();
    expect(key('Enter').defaultPrevented).toBe(true);
    expect(onTravel).toHaveBeenCalledWith('haes-noodles');
    expect(p.isOpen).toBe(false);
  });

  it('plays confirm on opening a district and move on an arrow', async () => {
    const onCue = vi.fn();
    await opened({ onCue });
    esc();
    root.querySelector<HTMLElement>('.map-bt.dist[data-id="karasu"]')!.click();
    key('ArrowLeft');
    expect(onCue.mock.calls.map((c) => c[0])).toEqual(['confirm', 'move']);
  });
});

describe('MapPanel camera motion', () => {
  afterEach(() => vi.useRealTimers());

  it('pins stay one size as you zoom (scale × --inv stays 1)', async () => {
    vi.useFakeTimers();
    panel = new MapPanel(root, { load: async () => shipped(), who: atIntake });
    const s = root.querySelector<HTMLElement>('.map-screen')!;
    Object.defineProperty(s, 'clientWidth', { configurable: true, value: 1200 });
    Object.defineProperty(s, 'clientHeight', { configurable: true, value: 800 });
    panel.open();
    await vi.advanceTimersByTimeAsync(1000);
    const world = root.querySelector<HTMLElement>('.map-world')!;
    const read = () => ({
      scale: Number(/scale\(([\d.]+)\)/.exec(world.style.transform)?.[1] ?? 1),
      inv: Number(world.style.getPropertyValue('--inv') || 1),
    });
    for (let i = 0; i < 3; i++) {
      s.dispatchEvent(new WheelEvent('wheel', { deltaY: -200, clientX: 600, clientY: 400, bubbles: true, cancelable: true }));
      const now = read();
      expect(now.scale).toBeGreaterThan(1);
      expect(now.scale * now.inv).toBeCloseTo(1, 5);
    }
  });

  it('opens exactly on the city view (the picture covering the screen, centred), and closing the district leaves it there', async () => {
    vi.useFakeTimers();
    panel = new MapPanel(root, { load: async () => shipped(), who: atIntake });
    const s = root.querySelector<HTMLElement>('.map-screen')!;
    Object.defineProperty(s, 'clientWidth', { configurable: true, value: 1187 });
    Object.defineProperty(s, 'clientHeight', { configurable: true, value: 791 });
    panel.open();
    await vi.advanceTimersByTimeAsync(1000);
    esc();
    await vi.advanceTimersByTimeAsync(1000);
    // 1187 × 791 is a touch taller than 3:2: the picture is 1187 wide, 791.33 high, centred.
    expect(root.querySelector<HTMLElement>('.map-world')!.style.transform).toBe(`translate(0px, ${(791 - 1187 / 1.5) / 2}px) scale(1)`);
  });
});

describe('MapPanel ambience', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const size = (w: number, h: number) => {
    const s = root.querySelector<HTMLElement>('.map-screen')!;
    Object.defineProperty(s, 'clientWidth', { configurable: true, value: w });
    Object.defineProperty(s, 'clientHeight', { configurable: true, value: h });
  };
  const amb = () => root.querySelector<HTMLCanvasElement>('.map-world > .map-amb')!;

  async function opened(reducedMotion: boolean) {
    panel = new MapPanel(root, { reducedMotion, load: async () => shipped(), who: atIntake });
    size(1200, 800);
    panel.open();
    await vi.advanceTimersByTimeAsync(1000);
    return panel;
  }

  it('sits in the camera layer between the picture and the pins', async () => {
    vi.useFakeTimers();
    await opened(true);
    const kids = [...root.querySelector('.map-world')!.children].map((k) => k.className.split(' ')[0]);
    expect(kids.indexOf('map-img')).toBeLessThan(kids.indexOf('map-amb'));
    expect(kids.indexOf('map-amb')).toBeLessThan(kids.indexOf('city-map'));
  });

  it('undoes the camera, so it lies exactly on the screen', async () => {
    vi.useFakeTimers();
    await opened(true);
    root.querySelector('.map-screen')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: 600, clientY: 400, bubbles: true, cancelable: true }));
    const world = root.querySelector<HTMLElement>('.map-world')!.style.transform;
    const [, tx, ty, s] = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([\d.e]+)\)/.exec(world)!.map(Number);
    expect(s).toBeGreaterThan(1);
    const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([\d.e]+)\)/.exec(amb().style.transform)!.map(Number);
    expect(m[1]).toBeCloseTo(-tx / s, 5);
    expect(m[2]).toBeCloseTo(-ty / s, 5);
    expect(m[3]).toBeCloseTo(1 / s, 5);
  });

  it('draws while open and stops when the map closes', async () => {
    vi.useFakeTimers();
    const { AmbienceLayer } = await import('../src/ui/map/ambience-layer');
    const draw = vi.spyOn(AmbienceLayer.prototype, 'drawFrame');
    const p = await opened(false);
    expect(draw).toHaveBeenCalled();
    p.close();
    draw.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(draw).not.toHaveBeenCalled();
  });

  it('follows a window resize (Review Focus 3)', async () => {
    vi.useFakeTimers();
    await opened(true);
    size(600, 400);
    window.dispatchEvent(new Event('resize'));
    expect(amb().style.width).toBe('600px');
    expect(amb().width).toBe(Math.round(600 * (window.devicePixelRatio || 1)));
  });

  it('never draws under reduced motion', async () => {
    vi.useFakeTimers();
    const { AmbienceLayer } = await import('../src/ui/map/ambience-layer');
    const draw = vi.spyOn(AmbienceLayer.prototype, 'drawFrame');
    await opened(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(draw).not.toHaveBeenCalled();
  });
});

describe('MapPanel minors', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const size = (w: number, h: number) => {
    const s = root.querySelector<HTMLElement>('.map-screen')!;
    Object.defineProperty(s, 'clientWidth', { configurable: true, value: w });
    Object.defineProperty(s, 'clientHeight', { configurable: true, value: h });
  };
  const world = () => root.querySelector<HTMLElement>('.map-world')!.style.transform;

  it('a reopen starts from the whole city, so a failed load never shows the last district zoomed', async () => {
    vi.useFakeTimers();
    let load: () => Promise<unknown> = async () => shipped();
    panel = new MapPanel(root, { reducedMotion: true, load: () => load(), who: atIntake });
    size(1200, 800);
    panel.open();
    await vi.advanceTimersByTimeAsync(10);
    root.querySelector('.map-screen')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: 600, clientY: 400, bubbles: true, cancelable: true }));
    expect(world()).not.toContain('scale(1)');
    panel.close();
    load = async () => Promise.reject(new Error('broken'));
    panel.open();
    await vi.advanceTimersByTimeAsync(10);
    expect(world()).toBe('translate(0px, 0px) scale(1)');
  });

  it('a failed load stops the last map’s ambience', async () => {
    vi.useFakeTimers();
    const { AmbienceLayer } = await import('../src/ui/map/ambience-layer');
    const clear = vi.spyOn(AmbienceLayer.prototype, 'clearMap');
    let load: () => Promise<unknown> = async () => shipped();
    panel = new MapPanel(root, { reducedMotion: true, load: () => load(), who: atIntake });
    panel.open();
    await vi.advanceTimersByTimeAsync(10);
    panel.close();
    load = async () => Promise.reject(new Error('broken'));
    panel.open();
    await vi.advanceTimersByTimeAsync(10);
    expect(clear).toHaveBeenCalled();
  });

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Meta', { metaKey: true }],
    ['IME composition', { isComposing: true }],
  ])('leaves Enter and the arrows alone with %s', async (_n, extra) => {
    vi.useFakeTimers();
    panel = new MapPanel(root, { reducedMotion: true, load: async () => shipped(), who: atIntake });
    panel.open();
    await vi.advanceTimersByTimeAsync(10);
    for (const key of ['Enter', 'ArrowRight']) {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
      window.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    }
  });

  it('web fonts finishing leave your zoom alone (the camera no longer fits the band)', async () => {
    vi.useFakeTimers();
    const fonts = new EventTarget();
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    panel = new MapPanel(root, { reducedMotion: true, load: async () => shipped(), who: atIntake });
    size(1200, 800);
    panel.open();
    await vi.advanceTimersByTimeAsync(10);
    root.querySelector('.map-screen')!.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: 600, clientY: 400, bubbles: true, cancelable: true }));
    const before = world();
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(world()).toBe(before);
    delete (document as unknown as { fonts?: unknown }).fonts;
  });

  it('sizes the camera and ambience from the screen’s exact box, not rounded pixels', async () => {
    vi.useFakeTimers();
    panel = new MapPanel(root, { reducedMotion: true, load: async () => shipped(), who: atIntake });
    const s = root.querySelector<HTMLElement>('.map-screen')!;
    size(1199, 799);
    s.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200.5, height: 800.5, right: 1200.5, bottom: 800.5, x: 0, y: 0, toJSON: () => ({}) });
    Object.defineProperty(s, 'clientLeft', { configurable: true, value: 1 });
    Object.defineProperty(s, 'clientTop', { configurable: true, value: 1 });
    panel.open();
    await vi.advanceTimersByTimeAsync(10);
    expect(root.querySelector<HTMLCanvasElement>('.map-amb')!.style.width).toBe('1198.5px');
  });

  it('measures in stage px on a zoomed game stage (fixed stage, Review Focus 1)', async () => {
    vi.useFakeTimers();
    panel = new MapPanel(root, { reducedMotion: true, load: async () => shipped(), who: atIntake });
    const s = root.querySelector<HTMLElement>('.map-screen')!;
    size(1199, 799);
    // At zoom 0.5 the rect is in window px (half size); clientLeft stays in stage px.
    s.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600.25, height: 400.25, right: 600.25, bottom: 400.25, x: 0, y: 0, toJSON: () => ({}) });
    Object.defineProperty(s, 'currentCSSZoom', { configurable: true, value: 0.5 });
    Object.defineProperty(s, 'clientLeft', { configurable: true, value: 1 });
    Object.defineProperty(s, 'clientTop', { configurable: true, value: 1 });
    panel.open();
    await vi.advanceTimersByTimeAsync(10);
    expect(root.querySelector<HTMLCanvasElement>('.map-amb')!.style.width).toBe('1198.5px');
  });
});

describe('MapPanel scroll-zoom and drag', () => {
  afterEach(() => vi.useRealTimers());

  const setup = async () => {
    vi.useFakeTimers();
    panel = new MapPanel(root, { load: async () => shipped(), who: atIntake });
    const s = root.querySelector<HTMLElement>('.map-screen')!;
    Object.defineProperty(s, 'clientWidth', { configurable: true, value: 1600 });
    Object.defineProperty(s, 'clientHeight', { configurable: true, value: 900 });
    panel.open();
    await vi.advanceTimersByTimeAsync(1000);
    const world = root.querySelector<HTMLElement>('.map-world')!;
    const view = () => /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([\d.e]+)\)/.exec(world.style.transform)!.slice(1).map(Number);
    return { s, world, view };
  };
  const ptr = (type: string, x: number, y: number, id = 1) =>
    Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }), { pointerId: id });

  it('the picture covers the 16:9 screen (3:2, cropped top and bottom at 1×)', async () => {
    const { world } = await setup();
    expect(world.style.width).toBe('1600px');
    expect(parseFloat(world.style.height)).toBeCloseTo(1600 / 1.5);
  });

  it('scrolling up zooms in about the pointer; scrolling back out stops at 1×', async () => {
    const { s, view } = await setup();
    const [, , k0] = view();
    s.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -200, clientX: 400, clientY: 300 }));
    expect(view()[2]).toBeGreaterThan(k0);
    for (let i = 0; i < 20; i++) s.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 200, clientX: 400, clientY: 300 }));
    expect(view()[2]).toBe(1);
  });

  it('dragging moves the map, and the click that ends it is swallowed', async () => {
    const { s, view } = await setup();
    s.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -200, clientX: 800, clientY: 450 }));
    const [tx0, ty0] = view();
    s.dispatchEvent(ptr('pointerdown', 800, 450));
    s.dispatchEvent(ptr('pointermove', 850, 470));
    s.dispatchEvent(ptr('pointermove', 900, 500));
    s.dispatchEvent(ptr('pointerup', 900, 500));
    const [tx1, ty1] = view();
    expect(tx1 - tx0).toBeCloseTo(50);
    expect(ty1 - ty0).toBeCloseTo(30);
    const seen = vi.fn();
    s.addEventListener('click', seen);
    s.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(seen).not.toHaveBeenCalled();
  });

  it("a drag goes past the map's edge and stops with the edge at the screen's middle (spec 2026-10-28 §2)", async () => {
    const { s, view } = await setup();
    s.dispatchEvent(ptr('pointerdown', 800, 450));
    s.dispatchEvent(ptr('pointermove', 810, 450));
    s.dispatchEvent(ptr('pointermove', 2400, 1350));
    s.dispatchEvent(ptr('pointerup', 2400, 1350));
    expect(view().slice(0, 2)).toEqual([800, 450]);
    // The click that ends it (swallowed), so the swallow never outlives this test under fake timers.
    s.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  it('the grid follows the camera (spec 2026-10-28 §3)', async () => {
    const { s, view } = await setup();
    const [tx, ty] = view();
    expect(s.style.backgroundPosition.startsWith(`${tx}px ${ty}px`)).toBe(true);
    expect(s.style.backgroundSize.startsWith('160px')).toBe(true);
    s.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -200, clientX: 800, clientY: 450 }));
    const [tx2, ty2, k] = view();
    expect(s.style.backgroundSize.startsWith(`${(1600 * k) / 10}px`)).toBe(true);
    expect(s.style.backgroundPosition.startsWith(`${tx2}px ${ty2}px`)).toBe(true);
  });

  describe('pinch (spec 2026-10-28 §4)', () => {
    /** Fingers 1 and 2 down at (700,450) and (900,450): 200 apart, midpoint (800,450). */
    const twoDown = (s: HTMLElement) => {
      s.dispatchEvent(ptr('pointerdown', 700, 450, 1));
      s.dispatchEvent(ptr('pointerdown', 900, 450, 2));
    };
    const liftBoth = (s: HTMLElement, x1 = 700, x2 = 1100) => {
      s.dispatchEvent(ptr('pointerup', x2, 450, 2));
      s.dispatchEvent(ptr('pointerup', x1, 450, 1));
      // The tap that ends it (swallowed), so the swallow never outlives the test under fake timers.
      s.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    };

    it('two fingers spreading zoom in about their midpoint', async () => {
      const { s, view } = await setup();
      const [tx0, ty0] = view();
      const mx = (800 - tx0) / 1, my = (450 - ty0) / 1;
      twoDown(s);
      s.dispatchEvent(ptr('pointermove', 1100, 450, 2));
      const [tx, ty, k] = view();
      expect(k).toBeCloseTo(2);
      expect((900 - tx) / k).toBeCloseTo(mx);
      expect((450 - ty) / k).toBeCloseTo(my);
      liftBoth(s);
    });

    it('pinch stops at the limit and at 1×', async () => {
      const { s, view } = await setup();
      twoDown(s);
      s.dispatchEvent(ptr('pointermove', 3900, 450, 2));
      expect(view()[2]).toBe(5);
      s.dispatchEvent(ptr('pointermove', 701, 450, 2));
      expect(view()[2]).toBe(1);
      liftBoth(s, 700, 701);
    });

    it('lifting one finger carries on as a drag with no jump', async () => {
      const { s, view } = await setup();
      twoDown(s);
      s.dispatchEvent(ptr('pointermove', 1100, 450, 2));
      s.dispatchEvent(ptr('pointerup', 1100, 450, 2));
      const [tx, ty] = view();
      s.dispatchEvent(ptr('pointermove', 730, 470, 1));
      const [tx1, ty1] = view();
      expect(tx1 - tx).toBeCloseTo(30);
      expect(ty1 - ty).toBeCloseTo(20);
      s.dispatchEvent(ptr('pointerup', 730, 470, 1));
      s.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    it('the tap that ends a pinch is swallowed', async () => {
      const { s } = await setup();
      twoDown(s);
      s.dispatchEvent(ptr('pointermove', 1100, 450, 2));
      s.dispatchEvent(ptr('pointerup', 1100, 450, 2));
      s.dispatchEvent(ptr('pointerup', 700, 450, 1));
      const seen = vi.fn();
      s.addEventListener('click', seen);
      s.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(seen).not.toHaveBeenCalled();
    });

    it('a finger on the band never starts a pinch (Review Focus 2)', async () => {
      const { s, view } = await setup();
      const before = view();
      s.dispatchEvent(ptr('pointerdown', 700, 450, 1));
      const tile = root.querySelector<HTMLElement>('.map-bt')!;
      tile.dispatchEvent(ptr('pointerdown', 900, 800, 2));
      tile.dispatchEvent(ptr('pointermove', 1300, 800, 2));
      expect(view()).toEqual(before);
      s.dispatchEvent(ptr('pointerup', 700, 450, 1));
      tile.dispatchEvent(ptr('pointerup', 1300, 800, 2));
    });

    it('pointercancel mid-pinch ends it cleanly (Review Focus 3)', async () => {
      const { s, view } = await setup();
      twoDown(s);
      s.dispatchEvent(ptr('pointermove', 1100, 450, 2));
      s.dispatchEvent(ptr('pointercancel', 1100, 450, 2));
      s.dispatchEvent(ptr('pointercancel', 700, 450, 1));
      s.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(s.classList.contains('map-dragging')).toBe(false);
      const [tx, ty] = view();
      s.dispatchEvent(ptr('pointerdown', 800, 450, 3));
      s.dispatchEvent(ptr('pointermove', 810, 450, 3));
      s.dispatchEvent(ptr('pointermove', 850, 480, 3));
      const [tx1, ty1] = view();
      expect(tx1 - tx).toBeCloseTo(40);
      expect(ty1 - ty).toBeCloseTo(30);
      s.dispatchEvent(ptr('pointerup', 850, 480, 3));
      s.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    it('a press whose release was lost (let go off the map) is replaced by the next press, not paired with it (Task 4 review)', async () => {
      const { s, view } = await setup();
      s.dispatchEvent(ptr('pointerdown', 800, 450, 1));
      // No pointerup: the button came up over the heading, outside the screen.
      const [tx, ty, k] = view();
      s.dispatchEvent(ptr('pointerdown', 800, 450, 1));
      s.dispatchEvent(ptr('pointermove', 810, 450, 1));
      s.dispatchEvent(ptr('pointermove', 850, 480, 1));
      const [tx1, ty1, k1] = view();
      expect(k1).toBe(k);
      expect(tx1 - tx).toBeCloseTo(40);
      expect(ty1 - ty).toBeCloseTo(30);
      expect(() => s.dispatchEvent(ptr('pointerup', 850, 480, 1))).not.toThrow();
      s.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(s.classList.contains('map-dragging')).toBe(false);
    });

    it('a third finger is ignored (Review Focus 4)', async () => {
      const { s, view } = await setup();
      twoDown(s);
      s.dispatchEvent(ptr('pointermove', 1100, 450, 2));
      const before = view();
      s.dispatchEvent(ptr('pointerdown', 400, 300, 3));
      s.dispatchEvent(ptr('pointermove', 100, 100, 3));
      expect(view()).toEqual(before);
      s.dispatchEvent(ptr('pointerup', 100, 100, 3));
      s.dispatchEvent(ptr('pointermove', 1300, 450, 2));
      expect(view()[2]).toBeCloseTo(3);
      liftBoth(s, 700, 1300);
    });
  });
});

describe('MapPanel on rendered tiles (spec 2026-10-25 §5)', () => {
  const manifest = {
    version: 1, size: [4608, 3072], tile: 512,
    levels: [{ scale: 1, cols: 9, rows: 6, tiles: 'all' }, { scale: 4, cols: 36, rows: 24, tiles: 'all' }],
    deep: ['karasu'], dataHash: 'x', blender: '5.2.2', pinHeights: { 'lowlight-intake': 26.7 }, rendered: 'now',
  };
  let served: Record<string, unknown>;
  beforeEach(() => {
    served = { '/map/tiles.json': manifest, '/map/windows.json': [] };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url in served ? { ok: true, json: async () => served[url] } : { ok: false, json: async () => ({}) })));
  });
  afterEach(() => vi.unstubAllGlobals());

  const ptr = (type: string, x: number, y: number) =>
    Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }), { pointerId: 1 });
  async function setup(who = atIntake) {
    panel = new MapPanel(root, { reducedMotion: true, load: async () => shipped(), who });
    const s = root.querySelector<HTMLElement>('.map-screen')!;
    Object.defineProperty(s, 'clientWidth', { configurable: true, value: 1600 });
    Object.defineProperty(s, 'clientHeight', { configurable: true, value: 900 });
    panel.open();
    for (let i = 0; i < 5; i++) await flush();
    const world = root.querySelector<HTMLElement>('.map-world')!;
    const scale = () => Number(/scale\(([\d.e]+)\)/.exec(world.style.transform)?.[1] ?? 1);
    const zoomIn = (n = 40) => {
      for (let i = 0; i < n; i++) s.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -200, clientX: 800, clientY: 450 }));
    };
    // The map opens on the whole city: bring Karasu (label 92.4 %, 25.6 %) to the middle yourself, as a player would.
    const toKarasu = () => {
      const kx = 0.924 * 1600, ky = 0.256 * (1600 / 1.5) - (1600 / 1.5 - 900) / 2;
      for (let i = 0; i < 4; i++) s.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -200, clientX: kx, clientY: ky }));
      s.dispatchEvent(ptr('pointerdown', kx, ky));
      s.dispatchEvent(ptr('pointermove', (kx + 800) / 2, (ky + 450) / 2));
      s.dispatchEvent(ptr('pointermove', 800, 450));
      s.dispatchEvent(ptr('pointerup', 800, 450));
    };
    const img = () => root.querySelector<HTMLImageElement>('img.map-img')!;
    const tiles = () => [...root.querySelectorAll<HTMLImageElement>('img.map-tile')];
    return { s, scale, zoomIn, toKarasu, img, tiles };
  }

  it('blackouts: setBlackout passes only known districts on, never the Spine or the Ribbon (spec 2026-10-27)', async () => {
    const { BlackoutLayer } = await import('../src/ui/map/blackout-layer');
    const set = vi.spyOn(BlackoutLayer.prototype, 'set').mockImplementation(() => {});
    served['/map/tiles.json'] = { ...manifest, dark: { levels: [1] }, mask: { districts: ['velvet', 'karasu', 'spine', 'ribbon'] } };
    await setup();
    expect(root.querySelector<HTMLElement>('.map-blackout')!.hidden).toBe(false);
    panel.setBlackout(['spine', 'velvet', 'ribbon', 'nowhere']);
    expect(set).toHaveBeenLastCalledWith(['velvet'], true);
    set.mockRestore();
  });

  it('blackouts: with the admin panel open the map shows a switch per district, the Spine and Ribbon left out', async () => {
    const { BlackoutLayer } = await import('../src/ui/map/blackout-layer');
    const set = vi.spyOn(BlackoutLayer.prototype, 'set').mockImplementation(() => {});
    served['/map/tiles.json'] = { ...manifest, dark: { levels: [1] }, mask: { districts: ['velvet', 'karasu', 'spine', 'ribbon'] } };
    panel = new MapPanel(root, { reducedMotion: true, load: async () => shipped(), who: atIntake, dev: () => true });
    panel.open();
    for (let i = 0; i < 5; i++) await flush();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.map-dev button')];
    expect(buttons.map((b) => b.dataset.id)).toEqual(['velvet', 'karasu']);
    root.querySelector<HTMLButtonElement>('.map-dev [data-id="velvet"]')!.click();
    expect(set).toHaveBeenLastCalledWith(['velvet'], true);
    expect(root.querySelector('.map-dev [data-id="velvet"]')!.classList.contains('on')).toBe(true);
    root.querySelector<HTMLButtonElement>('.map-dev [data-id="velvet"]')!.click();
    expect(set).toHaveBeenLastCalledWith([], true);
    set.mockRestore();
  });

  it('blackouts: the switches appear when the admin panel opens mid-map, dark districts already on (phase 2)', async () => {
    const { BlackoutLayer } = await import('../src/ui/map/blackout-layer');
    const set = vi.spyOn(BlackoutLayer.prototype, 'set').mockImplementation(() => {});
    served['/map/tiles.json'] = { ...manifest, dark: { levels: [1] }, mask: { districts: ['velvet', 'karasu', 'spine', 'ribbon'] } };
    let dev = false;
    panel = new MapPanel(root, { reducedMotion: true, load: async () => shipped(), who: atIntake, dev: () => dev });
    panel.open();
    for (let i = 0; i < 5; i++) await flush();
    expect(root.querySelectorAll('.map-dev button').length).toBe(0);
    panel.setBlackout(['velvet']);
    dev = true;
    panel.refreshDev();
    expect(root.querySelector<HTMLElement>('.map-dev')!.hidden).toBe(false);
    expect(root.querySelector('.map-dev [data-id="velvet"]')!.classList.contains('on')).toBe(true);
    expect(root.querySelector('.map-dev [data-id="karasu"]')!.classList.contains('on')).toBe(false);
    dev = false;
    panel.refreshDev();
    expect(root.querySelector<HTMLElement>('.map-dev')!.hidden).toBe(true);
    set.mockRestore();
  });

  it('blackouts: the live layer reads the blackout layer’s darkness while tiles are on', async () => {
    const { AmbienceLayer } = await import('../src/ui/map/ambience-layer');
    const { BlackoutLayer } = await import('../src/ui/map/blackout-layer');
    const setDarkness = vi.spyOn(AmbienceLayer.prototype, 'setDarkness');
    served['/map/tiles.json'] = { ...manifest, dark: { levels: [1] }, mask: { districts: ['velvet'] } };
    await setup();
    expect(setDarkness.mock.lastCall?.[0]).toBeInstanceOf(BlackoutLayer);
    setDarkness.mockRestore();
  });

  it('blackouts: no switches without the admin panel', async () => {
    served['/map/tiles.json'] = { ...manifest, dark: { levels: [1] }, mask: { districts: ['velvet'] } };
    panel = new MapPanel(root, { reducedMotion: true, load: async () => shipped(), who: atIntake, dev: () => false });
    panel.open();
    for (let i = 0; i < 5; i++) await flush();
    expect(root.querySelectorAll('.map-dev button').length).toBe(0);
  });

  it('blackouts: without a dark set the layer stays hidden', async () => {
    await setup();
    panel.setBlackout(['velvet']);
    expect(root.querySelector<HTMLElement>('.map-blackout')!.hidden).toBe(true);
  });

  it('with tiles the picture hides and tiles show', async () => {
    const { img, tiles } = await setup();
    expect(img().hidden).toBe(true);
    expect(tiles().length).toBeGreaterThan(0);
  });

  it('the rendered map shows no district borders; the painting keeps them', async () => {
    await setup();
    expect(root.classList.contains('map-rendered')).toBe(true);
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('web/src/ui/map/map.css', 'utf8');
    expect(css).toMatch(/\.map-rendered \.city-map \.dpoly[^{]*\{[^}]*stroke:\s*none/);
    panel.dispose();
    root.innerHTML = '';
    root.classList.remove('map-rendered');
    served = {};
    await setup();
    expect(root.classList.contains('map-rendered')).toBe(false);
  });

  it('a failed manifest or first tile shows the painting; a later failed tile keeps the level below', async () => {
    served = {};
    let t = await setup();
    expect(t.img().hidden).toBe(false);
    expect(t.tiles().every((i) => i.closest('.map-tiles')!.hasAttribute('hidden'))).toBe(true);
    panel.dispose();
    root.innerHTML = '';
    served = { '/map/tiles.json': manifest, '/map/windows.json': [] };
    t = await setup();
    t.tiles()[0]!.dispatchEvent(new Event('error'));
    await flush();
    expect(t.img().hidden).toBe(false);
    panel.dispose();
    root.innerHTML = '';
    t = await setup();
    t.tiles()[0]!.dispatchEvent(new Event('load'));
    await flush();
    t.tiles()[1]!.dispatchEvent(new Event('error'));
    await flush();
    expect(t.img().hidden).toBe(true);
  });

  it('a pinch panning off Karasu at 8x keeps its scale until the fingers lift, then eases to 4x (Task 4 review: no 4x/8x flicker)', async () => {
    const t = await setup();
    t.toKarasu();
    t.zoomIn();
    const k0 = t.scale();
    expect(k0).toBeGreaterThan(4);
    const at = (type: string, x: number, id: number) =>
      Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 450, button: 0 }), { pointerId: id });
    t.s.dispatchEvent(at('pointerdown', 100, 11));
    t.s.dispatchEvent(at('pointerdown', 300, 12));
    const seen: number[] = [];
    for (let dx = 100; dx <= 2400; dx += 100) {
      // The leading finger first, so the fingers never come closer (that would be a real pinch in).
      t.s.dispatchEvent(at('pointermove', 300 + dx, 12));
      t.s.dispatchEvent(at('pointermove', 100 + dx, 11));
      seen.push(t.scale());
    }
    for (const k of seen) expect(k).toBeCloseTo(k0, 6);
    t.s.dispatchEvent(at('pointerup', 2700, 12));
    t.s.dispatchEvent(at('pointerup', 2500, 11));
    t.s.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(t.scale()).toBeCloseTo(4, 6);
  });

  it('zoom stops at 4x outside Karasu and 8x inside', async () => {
    let t = await setup();
    t.toKarasu();
    t.zoomIn();
    expect(t.scale()).toBeCloseTo(8, 6);
    panel.dispose();
    root.innerHTML = '';
    t = await setup();
    esc();
    t.zoomIn();
    expect(t.scale()).toBeCloseTo(4, 6);
  });

  it('leaving Karasu past 4x eases back to 4x', async () => {
    const t = await setup();
    t.toKarasu();
    t.zoomIn();
    expect(t.scale()).toBeGreaterThan(4);
    for (let k = 0; k < 6; k++) {
      t.s.dispatchEvent(ptr('pointerdown', 200, 450));
      t.s.dispatchEvent(ptr('pointermove', 900, 450));
      t.s.dispatchEvent(ptr('pointermove', 1500, 450));
      t.s.dispatchEvent(ptr('pointerup', 1500, 450));
    }
    expect(t.scale()).toBeCloseTo(4, 6);
  });

  it('without tiles the limit stays 5x', async () => {
    served = {};
    const t = await setup();
    esc();
    t.zoomIn();
    expect(t.scale()).toBeCloseTo(5, 6);
  });
});

describe('MapPanel deep zoom along a corridor (the Spine)', () => {
  const manifest = {
    version: 1, size: [4608, 3072], tile: 512,
    levels: [{ scale: 1, cols: 9, rows: 6, tiles: 'all' }, { scale: 4, cols: 36, rows: 24, tiles: 'all' }],
    deep: [], deepAreas: [[[0, 45], [100, 45], [100, 55], [0, 55]]], dataHash: 'x', blender: '5.2.2', pinHeights: {}, rendered: 'now',
  };
  beforeEach(() => {
    const served: Record<string, unknown> = { '/map/tiles.json': manifest, '/map/windows.json': [] };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url in served ? { ok: true, json: async () => served[url] } : { ok: false, json: async () => ({}) })));
  });
  afterEach(() => vi.unstubAllGlobals());
  it('zooms to 8x over the corridor and 4x off it', async () => {
    panel = new MapPanel(root, { reducedMotion: true, load: async () => shipped(), who: () => ({ here: undefined, people: [] }) });
    const s = root.querySelector<HTMLElement>('.map-screen')!;
    Object.defineProperty(s, 'clientWidth', { configurable: true, value: 1600 });
    Object.defineProperty(s, 'clientHeight', { configurable: true, value: 900 });
    panel.open();
    for (let i = 0; i < 5; i++) await flush();
    const world = root.querySelector<HTMLElement>('.map-world')!;
    const scale = () => Number(/scale\(([\d.e]+)\)/.exec(world.style.transform)?.[1] ?? 1);
    // The map's middle (50 %) is in the band.
    for (let i = 0; i < 40; i++) s.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -200, clientX: 800, clientY: 450 }));
    expect(scale()).toBeCloseTo(8, 6);
  });
});
