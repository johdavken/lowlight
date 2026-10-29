/** The city map: Lowlight at night, flat (no depth effects), shown on a CRT, with its districts and places over it. */
import { bugReportOpen } from './bug-report';
import { insideBorder, parseMap, type CityMapData, type District, type Place } from '../../../shared/map-schema';
import { AmbienceLayer } from './map/ambience-layer';
import { CITY_VIEW, cityView, clampView, coverSize, pinchView, zoomAt, type Point, type Size, type View } from './map/camera';
import { CityMap, type MapCue, type WhoIsWhere } from './map/city-map';
import type { LitWindow } from './map/ambience';
import { BlackoutLayer } from './map/blackout-layer';
import { TileLayer } from './map/tile-layer';
import { ScreenFx } from './map/screen-fx';
import type { Weather } from '../../../shared/types';

export const MAP_URL = '/map/lowlight.webp';
/** The page-swap cue (once the select screen's roster swap). */
export const MAP_CUE_URL = '/sound/ui/page-swap.ogg';
/** 0.9 (the cue's chosen level) under the landing's 0.25 audio scale. */
export const MAP_CUE_LEVEL = 0.9 * 0.25;
/** The glitch-out's length (`map-glitch-out` in style.css); the overlay hides when it ends. */
const GLITCH_OUT_MS = 600;
/** The camera's ease into and out of a district. */
const CAMERA_MS = 700;
/** The picture's shape (w / h) until it has loaded. */
const MAP_ASPECT = 3 / 2;
/** How far the wheel and drag can zoom in on the painting (a district's own fit stops at 3×). */
const USER_MAX_SCALE = 5;
/** On the rendered tiles: 4× anywhere, 8× while looking at a deep-zoom district (spec 2026-10-25 §5). */
const TILE_MAX_SCALE = 4;
const DEEP_MAX_SCALE = 8;
/** A press that moves this far (stage px) is a drag, not a click. */
const DRAG_PX = 4;
/** Ease in-out (cubic), close to the select screen's cubic-bezier(0.7, 0, 0.2, 1). */
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface MapPanelOptions {
  onOpen?: () => void;
  reducedMotion?: boolean;
  /** The map's data, fetched each time the map opens (GET /api/map). */
  load: () => Promise<unknown>;
  /** Where you are and who's there, for this map. */
  who: (map: CityMapData) => WhoIsWhere;
  /** GO: walk you both to a place. The map closes after. Without it, the map has no GO. */
  onTravel?: (placeId: string, comms?: boolean) => void;
  /** GIGS at a gig place: the gig window opens over the map, which stays open. */
  onGigs?: (place: Place, district: District) => void;
  /** Asked first on Esc: true when something over the map (the hack window) took it. */
  escapeFirst?: () => boolean;
  /** The map is closing, however it closes: anything over it (the hack window) goes too. */
  onClose?: () => void;
  /** A menu cue: moving along the band, opening a district. */
  onCue?: (cue: MapCue) => void;
  /** True while something over the map (the hack window) takes the keys: the arrows and Enter are left to it. */
  overlayOpen?: () => boolean;
  /** The folder with the rendered map's tiles.json (default /map/); false: always the painting. */
  tiles?: string | false;
  /** True while the admin panel is open: the map shows blackout switches per district (spec 2026-10-27). */
  dev?: () => boolean;
  /** The city's weather when the map opens: rain falls over the rendered map while it rains. */
  weather?: () => { weather: Weather; level: number };
}

/**
 * The MAP overlay, filling the game stage: the HUD link toggles it, Esc closes (an open district first, back to the city).
 * The picture covers the screen at 1×; scroll zooms about the pointer and dragging moves it; opening a district leaves
 * the camera where it is (no auto district zoom); the arrows move along the band and Enter opens a district or GOes. It glitches in each time it opens and
 * out each time it closes (neither under reduced motion), and calls `onOpen` (the page-swap cue). The screen sits under scanlines,
 * a rolling bar, a faint animated fuzz and a vignette, like looking at a CRT.
 */
export class MapPanel {
  private readonly screen: HTMLElement;
  private readonly city: CityMap;
  private readonly notice: HTMLElement;
  private readonly img: HTMLImageElement;
  /** What the camera moves: the picture and the city's borders, names and pins. */
  private readonly world: HTMLElement;
  /** The map's life (signs, stacks, traffic, windows), between the picture and the pins, undoing the camera. */
  private readonly ambience: AmbienceLayer;
  /** The rendered map's tiles, when there's a render (null: tiles turned off). */
  private readonly tiles: TileLayer | null;
  /** Blackouts over the tiles (spec 2026-10-27), and the districts asked to be dark (kept across opens). */
  private readonly blackout: BlackoutLayer | null;
  private darkIds: string[] = [];
  /** The blackout switches, under the heading while the admin panel is open. */
  private readonly devStrip: HTMLElement;
  /** Rain, grain, vignette and fringe over the rendered map (spec 2026-10-25 §5). */
  private readonly fx: ScreenFx;
  /** Whether the tiles are showing (else the painting). */
  private tilesOn = false;
  /** The map's data last loaded (its districts tell which are deep-zoom). */
  private mapData: CityMapData | null = null;
  private readonly overlay: HTMLElement;
  /** Where the camera is now, and its running ease (stepped here, so the pins' counter-scale moves with it frame by frame). */
  private view: View = CITY_VIEW;
  private easing = 0;
  // A resize keeps the player's zoom, only clamped so the map still covers the screen.
  private readonly onResize = () => this.setView(clampView(this.view, this.mapSize(), this.screenSize()));
  /** Bumped per open, so a slow load never draws over a later one. */
  private loads = 0;
  // The bug report over this takes the keys (its own listener comes later on window).
  private readonly onKey = (e: KeyboardEvent) => void (!bugReportOpen() && this.handleKey(e));
  /** A press on the map, and whether it has become a drag (the click after a drag is swallowed). */
  private drag: { id: number; x: number; y: number; view: View; moved: boolean } | null = null;
  /** The fingers down on the map (two at most): screen px, and window px for a drag that carries on; two make a pinch (spec 2026-10-28 §4). */
  private pts = new Map<number, Point & { cx: number; cy: number }>();
  private pinch: { a: number; b: number; view: View; mid: Point; dist: number } | null = null;
  private readonly onDown = (e: PointerEvent) => this.pointerDown(e);
  private readonly onMove = (e: PointerEvent) => this.pointerMove(e);
  private readonly onUp = (e: PointerEvent) => this.pointerUp(e);
  private readonly onWheel = (e: WheelEvent) => this.wheel(e);
  /** Set while the glitch-out plays; the overlay is still shown but counts as closed. */
  private closing: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly opts: MapPanelOptions,
  ) {
    root.classList.add('map-root');
    root.hidden = true;
    this.screen = el('div', 'map-screen');
    const img = (this.img = el('img', 'map-img'));
    // The default until the map's data names its picture (and if the data can't be read).
    img.src = MAP_URL;
    img.alt = 'Map of Lowlight';
    img.draggable = false;
    img.addEventListener('load', this.onResize);
    this.notice = el('div', 'map-notice');
    this.notice.hidden = true;
    this.world = el('div', 'map-world');
    this.ambience = new AmbienceLayer({ reducedMotion: opts.reducedMotion });
    this.world.append(img, this.ambience.canvas);
    this.tiles = opts.tiles === false ? null : new TileLayer(this.world, { base: opts.tiles ?? '/map/' });
    if (this.tiles) this.tiles.el.hidden = true;
    this.blackout = this.tiles ? new BlackoutLayer(this.world, { base: opts.tiles || '/map/' }) : null;
    this.overlay = el('div', 'map-overlay-host');
    this.fx = new ScreenFx({ reducedMotion: opts.reducedMotion });
    this.fx.canvas.hidden = true;
    this.screen.append(this.world, this.fx.canvas, this.overlay);
    const onTravel = opts.onTravel;
    this.city = new CityMap(this.world, {
      overlay: this.overlay,
      // (No onFrame: opening or closing a district no longer moves the camera.)
      onCue: opts.onCue,
      reducedMotion: opts.reducedMotion,
      onTravel: onTravel
        ? (placeId, comms) => {
            if (comms) onTravel(placeId, true);
            else onTravel(placeId);
            this.close();
          }
        : undefined,
      onGigs: opts.onGigs,
    });
    this.screen.append(this.notice, el('div', 'map-fuzz'), el('div', 'map-scan'), el('div', 'map-roll'), el('div', 'map-vignette'));
    const head = el('header', 'map-head');
    head.append(el('span', 'map-title', '// MAP'), el('span', 'map-hint', 'SCROLL ZOOM · DRAG MOVE · [ESC] CLOSE'));
    this.devStrip = el('div', 'map-dev');
    this.devStrip.hidden = true;
    head.append(this.devStrip);
    const frame = el('div', 'map-frame');
    frame.append(head, this.screen);
    root.append(frame);
    root.addEventListener('click', (e) => {
      if (e.target === root) this.close();
    });
    // Capture phase, like the journal: Esc must not reach the room's own Esc handling (back to dial-in).
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    this.screen.addEventListener('pointerdown', this.onDown);
    this.screen.addEventListener('pointermove', this.onMove);
    this.screen.addEventListener('pointerup', this.onUp);
    this.screen.addEventListener('pointercancel', this.onUp);
    this.screen.addEventListener('wheel', this.onWheel, { passive: false });
  }

  get isOpen(): boolean {
    return !this.root.hidden && this.closing === null;
  }

  open(): void {
    if (this.isOpen) return;
    this.stopClosing();
    this.root.hidden = false;
    this.opts.onOpen?.();
    this.play('map-glitch-in');
    // Nothing from the last opening shows while this one loads (or if it fails): pins, panel, nor its zoom.
    this.city.clear();
    cancelAnimationFrame(this.easing);
    this.drag = null;
    this.pinch = null;
    this.pts.clear();
    this.setView(cityView(this.mapSize(), this.screenSize()));
    void this.loadCity();
    this.ambience.start();
  }

  /** A place by its id, from the map as last loaded (null before it loads, or for no such place): the arrival screen names where GO goes. */
  place(id: string): Place | null {
    return this.mapData?.places.find((p) => p.id === id) ?? null;
  }

  /** The place a room is, from the map as last loaded: where GO leaves from. */
  placeOf(sceneId: string): Place | null {
    return this.mapData?.places.find((p) => p.scene === sceneId) ?? null;
  }

  /** Fetches the map's data and draws it; broken or missing data leaves the picture and a one-line notice. */
  private async loadCity(): Promise<void> {
    const n = ++this.loads;
    let problem: string | null = null;
    try {
      const parsed = parseMap(await this.opts.load());
      if (n !== this.loads) return;
      if (parsed.ok) {
        const map = parsed.map;
        this.mapData = map;
        if (this.img.getAttribute('src') !== map.image) this.img.src = map.image;
        const windows = await this.loadTiles(map);
        if (n !== this.loads) return;
        this.city.render(map, this.opts.who(map), this.tilesOn ? this.tiles?.manifest?.pinHeights : undefined);
        this.ambience.setLift(this.tilesOn);
        this.ambience.setMap(map, this.img, windows);
        this.applyCamera();
      }
      else problem = parsed.errors.map((e) => `${e.path || 'file'}: ${e.message}`).join(' · ');
    } catch (e) {
      problem = (e as Error).message;
    }
    if (n !== this.loads) return;
    if (problem !== null) this.ambience.clearMap();
    this.notice.hidden = problem === null;
    this.notice.textContent = problem === null ? '' : `MAP DATA: ${problem}`;
  }

  /**
   * Shows the rendered tiles when there's a usable render, and returns its lit windows; otherwise the painting.
   * A first tile that fails to load switches back to the painting (spec 2026-10-25 §5).
   */
  private async loadTiles(map: CityMapData): Promise<LitWindow[] | undefined> {
    if (!this.tiles) return undefined;
    const manifest = await this.tiles.load();
    this.blackout?.setManifest(manifest);
    // Districts already dark when the map opens are dark at once.
    this.blackout?.set(this.blackoutFor(this.darkIds), true);
    this.renderDev();
    if (!manifest) {
      this.useTiles(false);
      return undefined;
    }
    void this.tiles.firstTileFailed().then((failed) => {
      if (failed && this.tilesOn) {
        this.useTiles(false);
        this.city.render(map, this.opts.who(map));
        this.ambience.setLift(false);
        this.ambience.setMap(map, this.img);
        this.applyCamera();
      }
    });
    const base = this.opts.tiles || '/map/';
    const windows = await fetch(`${base}windows.json`)
      .then((r) => (r.ok ? (r.json() as Promise<LitWindow[]>) : undefined))
      .catch(() => undefined);
    this.useTiles(true);
    return Array.isArray(windows) ? windows : undefined;
  }

  private useTiles(on: boolean): void {
    this.tilesOn = on;
    // The rendered map draws no district borders (the city shows where they are); the painting keeps them.
    this.root.classList.toggle('map-rendered', on);
    this.img.hidden = on;
    if (this.tiles) this.tiles.el.hidden = !on;
    if (!on) this.blackout?.setManifest(null);
    // Windows and signs go out with their district on the rendered map (blackouts phase 2).
    this.ambience.setDarkness(on ? this.blackout : null);
    // The screen effects belong to the rendered map; the painting keeps its own look.
    this.fx.canvas.hidden = !on;
    if (on && this.isOpen) {
      const w = this.opts.weather?.() ?? { weather: 'none' as const, level: 0 };
      this.fx.setWeather(w.weather, w.level);
      this.fx.start();
    } else this.fx.stop();
  }

  /**
   * How far the user can zoom in now: on tiles, 8× while a deep-zoom district covers part of the middle of the view
   * (its central half), else 4×. The middle, not just the centre point: a district near the map's edge can't always be centred.
   */
  private maxScale(view: View = this.view): number {
    if (!this.tilesOn) return USER_MAX_SCALE;
    const deep = this.tiles?.manifest?.deep ?? [];
    const map = this.mapSize(), screen = this.screenSize();
    if (!map.w || !map.h) return TILE_MAX_SCALE;
    const toMap = (x: number, y: number): [number, number] => [((x - view.tx) / view.scale / map.w) * 100, ((y - view.ty) / view.scale / map.h) * 100];
    const [x0, y0] = toMap(screen.w / 4, screen.h / 4), [x1, y1] = toMap((3 * screen.w) / 4, (3 * screen.h) / 4);
    const inBox = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const covers = (b: { x: number; y: number }[]) =>
      b.some((a) => inBox(a.x, a.y)) || ([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [(x0 + x1) / 2, (y0 + y1) / 2]] as [number, number][]).some((p) => insideBorder(p, b as never));
    const areas = (this.tiles?.manifest?.deepAreas ?? []).map((poly) => poly.map(([x, y]) => ({ x, y, i: null, o: null })));
    const inDeep = (this.mapData?.districts ?? []).some((d) => deep.includes(d.id) && d.border && covers(d.border)) || areas.some((a) => covers(a));
    return inDeep ? DEEP_MAX_SCALE : TILE_MAX_SCALE;
  }

  /** Past the limit where the view is now (it left a deep-zoom district): back to the limit about the screen's centre. */
  private keepLimit(): void {
    const max = this.maxScale();
    if (this.view.scale <= max + 1e-9) return;
    const screen = this.screenSize();
    this.moveCamera(zoomAt(this.view, max / this.view.scale, { x: screen.w / 2, y: screen.h / 2 }, this.mapSize(), screen, max));
  }

  /** `instant`: a switch to another screen; hidden at once, no glitch-out. */
  close(instant = false): void {
    if (!this.isOpen) return;
    this.opts.onClose?.();
    this.ambience.stop();
    this.fx.stop();
    if (this.opts.reducedMotion || instant) {
      this.root.hidden = true;
      return;
    }
    this.play('map-glitch-out');
    this.root.classList.add('map-closing');
    this.closing = setTimeout(() => {
      this.closing = null;
      this.root.hidden = true;
      this.root.classList.remove('map-closing');
      this.screen.classList.remove('map-glitch-out');
    }, GLITCH_OUT_MS);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Blacks out exactly these districts on the rendered map, animating the change. The Spine and the Ribbon have their
   * own power (the player's default, 2026-10-27) and ids the render doesn't know are ignored. */
  setBlackout(ids: string[]): void {
    this.darkIds = [...ids];
    this.blackout?.set(this.blackoutFor(ids), !!this.opts.reducedMotion);
  }

  /** One switch per district the render can black out (dev only: nothing blacks out by itself in phase 1). */
  /** The districts last blacked out (e2e). */
  get darkDistricts(): string[] {
    return [...this.darkIds];
  }

  /** How many windows and signs the map's live layer drew last frame (e2e). */
  get gridLights(): number {
    return this.ambience.gridLights;
  }

  /** The admin panel opened or closed while the map may be open: its blackout switches follow. */
  refreshDev(): void {
    this.renderDev();
  }

  private renderDev(): void {
    const ids = this.blackoutFor(this.blackout?.known ?? []);
    this.devStrip.replaceChildren();
    this.devStrip.hidden = !this.opts.dev?.() || !ids.length;
    if (this.devStrip.hidden) return;
    this.devStrip.append(el('span', 'map-dev-label', 'BLACKOUT'));
    for (const id of ids) {
      const b = el('button', 'map-dev-switch', id.toUpperCase());
      b.type = 'button';
      b.dataset.id = id;
      b.classList.toggle('on', this.darkIds.includes(id));
      b.addEventListener('click', () => {
        this.setBlackout(this.darkIds.includes(id) ? this.darkIds.filter((d) => d !== id) : [...this.darkIds, id]);
        b.classList.toggle('on', this.darkIds.includes(id));
      });
      this.devStrip.append(b);
    }
  }

  private blackoutFor(ids: string[]): string[] {
    const known = this.blackout?.known ?? [];
    return ids.filter((id) => id !== 'spine' && id !== 'ribbon' && known.includes(id));
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    this.img.removeEventListener('load', this.onResize);
    cancelAnimationFrame(this.easing);
    this.ambience.dispose();
    this.fx.dispose();
    this.tiles?.dispose();
    this.blackout?.dispose();
    this.loads++;
    this.city.dispose();
    this.stopClosing();
  }

  /** Restarts one glitch on the screen (removing the other); nothing under reduced motion. */
  private play(cls: 'map-glitch-in' | 'map-glitch-out'): void {
    this.screen.classList.remove('map-glitch-in', 'map-glitch-out');
    if (this.opts.reducedMotion) return;
    void this.screen.offsetWidth; // force reflow so re-adding the class restarts the animation
    this.screen.classList.add(cls);
  }

  private stopClosing(): void {
    if (this.closing === null) return;
    clearTimeout(this.closing);
    this.closing = null;
    this.root.classList.remove('map-closing');
  }

  /** The screen's inner box in css px, fractions kept (clientWidth rounds, which shifts glows by up to 1.5 px at 3×). */
  private screenSize(): { w: number; h: number } {
    const r = this.screen.getBoundingClientRect();
    if (!r.width) return { w: this.screen.clientWidth, h: this.screen.clientHeight };
    // Rects are in window px; on the zoomed game stage everything else here is in stage px.
    const z = this.zoom();
    return { w: r.width / z - this.screen.clientLeft * 2, h: r.height / z - this.screen.clientTop * 2 };
  }

  /** The map at the city view: the picture covering the screen, its shape kept. */
  private mapSize(): Size {
    const m = this.tilesOn ? this.tiles?.manifest : null;
    if (m) return coverSize(this.screenSize(), m.size[0] / m.size[1]);
    const { naturalWidth: w, naturalHeight: h } = this.img;
    return coverSize(this.screenSize(), w && h ? w / h : MAP_ASPECT);
  }

  /** A point on the screen, in the screen's own px (as the view's tx/ty). */
  private screenPoint(e: MouseEvent): { x: number; y: number } {
    const r = this.screen.getBoundingClientRect();
    const z = this.zoom();
    return { x: (e.clientX - r.left) / z - this.screen.clientLeft, y: (e.clientY - r.top) / z - this.screen.clientTop };
  }

  /** The band, heading and strip keep their own clicks and wheel. */
  private onOverlay(target: EventTarget | null): boolean {
    return target instanceof Node && target !== this.overlay && this.overlay.contains(target);
  }

  /** Scroll zooms about the pointer. */
  private wheel(e: WheelEvent): void {
    if (!this.isOpen || this.onOverlay(e.target) || !e.deltaY) return;
    e.preventDefault();
    cancelAnimationFrame(this.easing);
    const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const factor = Math.exp(-Math.max(-200, Math.min(200, px)) * 0.0015);
    this.setView(zoomAt(this.view, factor, this.screenPoint(e), this.mapSize(), this.screenSize(), this.maxScale()));
    this.keepLimit();
  }

  private pointerDown(e: PointerEvent): void {
    if (!this.isOpen || e.button !== 0 || this.onOverlay(e.target)) return;
    // A pointer already down pressing again lost its release (let go off the map, or the window lost focus): start over.
    if (this.pts.has(e.pointerId)) {
      this.pts.clear();
      this.pinch = null;
      this.drag = null;
      this.screen.classList.remove('map-dragging');
    }
    if (this.pts.size >= 2) return;
    this.pts.set(e.pointerId, { ...this.screenPoint(e), cx: e.clientX, cy: e.clientY });
    const d = this.drag;
    if (!d) {
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, view: this.view, moved: false };
      return;
    }
    // A second finger: the drag becomes a pinch, from where the camera is now; its end is swallowed like a drag's.
    cancelAnimationFrame(this.easing);
    const a = this.pts.get(d.id)!, b = this.pts.get(e.pointerId)!;
    this.pinch = { a: d.id, b: e.pointerId, view: this.view, mid: midpoint(a, b), dist: Math.hypot(b.x - a.x, b.y - a.y) };
    this.startDragging(d);
    this.screen.setPointerCapture?.(e.pointerId);
  }

  /** Past DRAG_PX the press becomes a drag: the camera stops easing and follows the pointer. Two fingers pinch. */
  private pointerMove(e: PointerEvent): void {
    if (this.pts.has(e.pointerId)) this.pts.set(e.pointerId, { ...this.screenPoint(e), cx: e.clientX, cy: e.clientY });
    const p = this.pinch;
    if (p) {
      if (e.pointerId !== p.a && e.pointerId !== p.b) return;
      const a = this.pts.get(p.a)!, b = this.pts.get(p.b)!;
      const now = { mid: midpoint(a, b), dist: Math.hypot(b.x - a.x, b.y - a.y) };
      // Never below the scale now while the fingers are down: off a deep district the limit eases back on release
      // (keepLimit), rather than snapping between 8x and 4x as the view's middle crosses its edge.
      this.setView(pinchView(p.view, p, now, this.mapSize(), this.screenSize(), Math.max(this.maxScale(), this.view.scale)));
      return;
    }
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const z = this.zoom();
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) / z < DRAG_PX) return;
      cancelAnimationFrame(this.easing);
      // From where the camera is now (it may have been easing) and the pointer now, so nothing jumps.
      d.x = e.clientX;
      d.y = e.clientY;
      this.startDragging(d);
    }
    const v = { ...d.view, tx: d.view.tx + (e.clientX - d.x) / z, ty: d.view.ty + (e.clientY - d.y) / z };
    this.setView(clampView(v, this.mapSize(), this.screenSize()));
  }

  private startDragging(d: NonNullable<MapPanel['drag']>): void {
    d.view = this.view;
    if (d.moved) return;
    d.moved = true;
    this.screen.setPointerCapture?.(d.id);
    this.screen.classList.add('map-dragging');
  }

  private pointerUp(e: PointerEvent): void {
    if (!this.pts.delete(e.pointerId)) return;
    if (this.screen.hasPointerCapture?.(e.pointerId)) this.screen.releasePointerCapture(e.pointerId);
    const p = this.pinch;
    if (p) {
      this.pinch = null;
      // One finger left: it carries on as a drag from here, with no jump.
      const [left] = [...this.pts];
      if (left) {
        const [id, at] = left;
        this.drag = { id, x: at.cx, y: at.cy, view: this.view, moved: true };
        return;
      }
    }
    const d = this.drag;
    // A pinch's last finger ends it whichever finger the drag named.
    if (!d || (e.pointerId !== d.id && !p)) return;
    this.drag = null;
    if (!d.moved) return;
    this.screen.classList.remove('map-dragging');
    this.keepLimit();
    // The click that ends a drag must not open a district or pick a pin.
    const swallow = (c: Event) => {
      c.stopPropagation();
      c.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, true), 0);
  }

  /** The game stage's zoom on the screen (1 off the stage, or where the browser doesn't say). */
  private zoom(): number {
    return (this.screen as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1;
  }

  /** The whole city, fitted to the screen: on opening, a load, and a resize (the player's zoom starts from here). */
  private applyCamera(): void {
    const { w, h } = this.screenSize();
    this.moveCamera(w && h ? cityView(this.mapSize(), { w, h }) : CITY_VIEW);
  }

  /** Eases the camera to `to` (at once under reduced motion), setting the transform and --inv together each frame. */
  private moveCamera(to: View): void {
    cancelAnimationFrame(this.easing);
    const from = this.view;
    if (this.opts.reducedMotion || (from.scale === to.scale && from.tx === to.tx && from.ty === to.ty)) return this.setView(to);
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / CAMERA_MS);
      const e = ease(k);
      const at = (a: number, b: number) => a + (b - a) * e;
      if (k === 1) return this.setView(to);
      this.setView({ scale: at(from.scale, to.scale), tx: at(from.tx, to.tx), ty: at(from.ty, to.ty) });
      this.easing = requestAnimationFrame(step);
    };
    this.easing = requestAnimationFrame(step);
  }

  private setView(v: View): void {
    this.view = v;
    const map = this.mapSize();
    this.world.style.width = `${map.w}px`;
    this.world.style.height = `${map.h}px`;
    this.world.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.scale})`;
    this.world.style.setProperty('--inv', String(1 / v.scale));
    // The survey grid past the city's edges (spec 2026-10-28 §3): lines every 10 % and 2.5 % of the map, on the camera.
    const W = map.w * v.scale, H = map.h * v.scale;
    this.screen.style.backgroundSize = [10, 10, 40, 40].map((n) => `${W / n}px ${H / n}px`).join(', ');
    // One position: CSS repeats it for every layer.
    this.screen.style.backgroundPosition = `${v.tx}px ${v.ty}px`;
    // The ambience canvas undoes the camera, so it lies on the screen at screen resolution and draws from the view.
    this.ambience.canvas.style.transform = `translate(${-v.tx / v.scale}px, ${-v.ty / v.scale}px) scale(${1 / v.scale})`;
    this.ambience.setView(v, this.screenSize(), map);
    if (this.tilesOn) {
      this.tiles?.update(v, map, this.screenSize(), (window.devicePixelRatio || 1) * this.zoom());
      this.blackout?.update(v, map, this.screenSize(), (window.devicePixelRatio || 1) * this.zoom());
    }
  }

  private handleKey(e: KeyboardEvent): void {
    // Ctrl/Alt/Meta+Enter and keys mid-composition (IME) belong to someone else.
    const plain = !(e.ctrlKey || e.altKey || e.metaKey || e.isComposing);
    if (plain && this.isOpen && !this.opts.overlayOpen?.()) {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key] as 1 | -1 | undefined;
      if (step || e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (step) this.city.move(step);
        else this.city.enter();
        return;
      }
    }
    // Still shown while it glitches out: a second Esc then must not reach the room either.
    if (!this.root.hidden && e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.closing === null && this.opts.escapeFirst?.()) return;
      if (this.closing !== null || !this.city.handleEscape()) this.close();
    }
  }
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
