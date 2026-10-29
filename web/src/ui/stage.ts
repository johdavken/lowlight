import type { Crop } from '../../../shared/types';
import { figureBox } from './figure';
import { lightFilter } from './stage-light';

/** What a figure shows, in order of preference: a sprite, her portrait, a monogram, a silhouette. */
export type FigureSource =
  /** `height`: how tall she stands, as a share of the full figure height (absent: 1); the figure shrinks from its bottom edge. */
  /** `pixel`: snapped art (Studio SNAP), drawn with hard pixels. */
  | { kind: 'sprite'; url: string; crop: Crop; height?: number; pixel?: boolean; expressions?: Record<string, string>; outfits?: Record<string, string> }
  | { kind: 'portrait'; url: string }
  | { kind: 'monogram'; letter: string }
  | { kind: 'silhouette' };

/** Where a figure stands: you on the left, your contact on the right (everyone else is in the who's-here strip). */
export type Side = 'left' | 'right';
const SIDES: Side[] = ['left', 'right'];

/** The outfit a scene puts her in: its entry in her scene map, or null (her plain sprite). */
export function outfitFor(byScene: Record<string, string> | undefined, sceneId: string | null): string | null {
  return byScene && sceneId !== null && Object.hasOwn(byScene, sceneId) ? byScene[sceneId] : null;
}

/**
 * A sprite figure's layers: the plain sprite, the expressions and outfits whose image loaded, and
 * the face and outfit wanted. The face draws over the outfit (or over the sprite when none applies).
 */
interface Faces {
  /** The resolved sprite's url; null while resolving or when the figure isn't a sprite. */
  sprite: string | null;
  loaded: Map<string, string>;
  wanted: string | null;
  outfits: Map<string, string>;
  wantedOutfit: string | null;
}

function cssUrl(url: string): string {
  return `url("${url.replace(/[\\"]/g, '\\$&').replace(/[\n\r\f]/g, '')}")`;
}

/** What a successful probe learned about the image: its width / height. */
type Probed = { aspect: number };
const MASTER_ASPECT = 2 / 3;

/**
 * Loads an image to see whether it's there (a sprite that 404s falls back instead of showing a
 * broken image) and how it's proportioned (a sprite that isn't 2:3 isn't stretched).
 */
function probeImage(url: string): Promise<Probed | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ aspect: img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : MASTER_ASPECT });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * The visual-novel stage: the player's figure on the left, the speaking agent's on the right, each a whole
 * sprite standing up from the floor behind the box. The speaker is lit, the listener dimmed; while she
 * streams her figure breathes. Sizes come from CSS (`--fig-full`, `--fig-h`); the crop sets per-unit-height multipliers.
 */
function setArt(fig: HTMLElement, images: string): void {
  fig.querySelector<HTMLElement>('.stage-art')!.style.backgroundImage = images;
}

export class Stage {
  private readonly figures: Record<Side, HTMLElement>;
  private readonly tokens: Record<Side, number> = { left: 0, right: 0 };
  private readonly probe: (url: string) => Promise<Probed | null>;
  /** Each sprite's own width / height, so a live re-crop keeps it. */
  private readonly aspects: Record<Side, number> = { left: MASTER_ASPECT, right: MASTER_ASPECT };
  private readonly faces: Record<Side, Faces> = {
    left: { sprite: null, loaded: new Map(), wanted: null, outfits: new Map(), wantedOutfit: null },
    right: { sprite: null, loaded: new Map(), wanted: null, outfits: new Map(), wantedOutfit: null },
  };

  constructor(
    private readonly root: HTMLElement,
    opts: { probe?: (url: string) => Promise<Probed | null> } = {},
  ) {
    this.probe = opts.probe ?? probeImage;
    root.classList.add('stage');
    const make = (side: Side) => {
      const fig = document.createElement('div');
      fig.className = `stage-figure stage-${side}`;
      fig.setAttribute('role', 'img');
      const art = document.createElement('div');
      art.className = 'stage-art';
      // The room's light on her (stage-light.ts): a filter on her art, read by style.css for sprites.
      const light = lightFilter(`stage-light-${side}`);
      fig.style.setProperty('--fig-filter', `url(#${light.id})`);
      fig.append(art, light.svg);
      return fig;
    };
    this.figures = { left: make('left'), right: make('right') };
    root.append(this.figures.left, this.figures.right);
  }

  setLeft(src: FigureSource | FigureSource[], name: string, accent: string): void {
    this.set('left', Array.isArray(src) ? src : [src], name, accent);
  }

  setRight(src: FigureSource | FigureSource[], name: string, accent: string): void {
    this.set('right', Array.isArray(src) ? src : [src], name, accent);
  }

  /**
   * Marks `side`'s figure as the speaker; null marks neither (a speaker with no figure: someone in
   * the strip, an encounter's stranger). The mark changes nothing on screen (spec 2026-10-15): the
   * dialogue box shows who's speaking, and room lighting falls on the figures as they are.
   */
  setSpeaker(side: Side | null): void {
    for (const s of SIDES) this.figures[s].classList.toggle('speaking', s === side);
  }

  /** Re-crops a sprite figure live (the dev panel's STAGE sliders). */
  setCrop(side: Side, crop: Crop): void {
    const fig = this.figures[side];
    fig.dataset.cropTop = String(crop.top);
    fig.dataset.cropBottom = String(crop.bottom);
    this.applyCrop(fig, crop, this.aspects[side]);
  }

  /**
   * Shows a sprite figure with one of its expressions (null = the plain face), drawn over the
   * current outfit. A name it doesn't have, or whose image failed to load, shows the plain face;
   * asked for before the figure has resolved, it applies once it does. Other figure kinds ignore
   * it. Instant, same crop.
   */
  setExpression(side: Side, name: string | null): void {
    this.faces[side].wanted = name;
    this.applyFace(side);
  }

  /**
   * Dresses a sprite figure in one of its outfits (null = the plain sprite), keeping the face. A
   * name it doesn't have, or whose image failed to load, shows the sprite; asked for before the
   * figure has resolved, it applies once it does. Instant, same crop.
   */
  setOutfit(side: Side, name: string | null): void {
    this.faces[side].wantedOutfit = name;
    this.applyFace(side);
  }

  dispose(): void {
    for (const s of SIDES) this.tokens[s]++;
  }

  private set(side: Side, chain: FigureSource[], name: string, accent: string): void {
    const fig = this.figures[side];
    fig.setAttribute('aria-label', name);
    fig.style.setProperty('--fig-accent', accent);
    const token = ++this.tokens[side];
    const faces = this.faces[side];
    faces.sprite = null;
    faces.loaded = new Map();
    faces.outfits = new Map();
    void this.resolve(chain).then(async ({ src, aspect }) => {
      if (token !== this.tokens[side]) return;
      // The outfit she should be wearing loads before the first paint, so a page load or reconnect
      // never flashes the plain sprite first.
      const want = faces.wantedOutfit;
      const wantedUrl = src.kind === 'sprite' && want !== null && src.outfits && Object.hasOwn(src.outfits, want) ? src.outfits[want] : null;
      if (wantedUrl !== null && (await this.probe(wantedUrl))) {
        if (token !== this.tokens[side]) return;
        faces.outfits.set(want!, wantedUrl);
      }
      if (token !== this.tokens[side]) return;
      this.aspects[side] = aspect;
      this.render(fig, src, aspect);
      if (src.kind !== 'sprite') return;
      faces.sprite = src.url;
      this.applyFace(side);
      // Each face is checked on its own (in parallel): one that 404s is left out, not shown broken.
      for (const [name, url] of Object.entries(src.expressions ?? {})) {
        void this.probe(url).then((ok) => {
          if (token !== this.tokens[side] || !ok) return;
          faces.loaded.set(name, url);
          if (faces.wanted === name) this.applyFace(side);
        });
      }
      for (const [name, url] of Object.entries(src.outfits ?? {})) {
        void this.probe(url).then((ok) => {
          if (token !== this.tokens[side] || !ok) return;
          faces.outfits.set(name, url);
          if (faces.wantedOutfit === name) this.applyFace(side);
        });
      }
    });
  }

  /**
   * Draws the wanted face over the wanted outfit (each falling back to the sprite's own) as stacked
   * backgrounds on one element, so both share the crop. Nothing until the figure resolves to a sprite.
   */
  private applyFace(side: Side): void {
    const { sprite, loaded, wanted, outfits, wantedOutfit } = this.faces[side];
    if (sprite === null) return;
    const base = (wantedOutfit !== null && outfits.get(wantedOutfit)) || sprite;
    const face = wanted !== null ? loaded.get(wanted) : undefined;
    setArt(this.figures[side], face ? `${cssUrl(face)}, ${cssUrl(base)}` : cssUrl(base));
  }

  private async resolve(chain: FigureSource[]): Promise<{ src: FigureSource; aspect: number }> {
    for (const src of chain) {
      if (src.kind === 'monogram' || src.kind === 'silhouette') return { src, aspect: MASTER_ASPECT };
      const probed = await this.probe(src.url);
      if (probed) return { src, aspect: probed.aspect };
    }
    return { src: { kind: 'silhouette' }, aspect: MASTER_ASPECT };
  }

  private render(fig: HTMLElement, src: FigureSource, aspect: number): void {
    const art = fig.querySelector<HTMLElement>('.stage-art')!;
    fig.dataset.kind = src.kind;
    fig.style.setProperty('--fig-height', String(src.kind === 'sprite' ? (src.height ?? 1) : 1));
    fig.style.setProperty('--fig-aspect', String(aspect));
    if (src.kind === 'sprite' && src.pixel) fig.dataset.pixel = '';
    else delete fig.dataset.pixel;
    art.textContent = '';
    setArt(fig, '');
    art.style.removeProperty('--portrait');
    if (src.kind === 'sprite') {
      setArt(fig, cssUrl(src.url));
      this.applyCrop(fig, src.crop, aspect);
    } else if (src.kind === 'portrait') {
      art.style.setProperty('--portrait', cssUrl(src.url));
      this.applyCrop(fig, { top: 0, bottom: 1 }, 1);
    } else {
      if (src.kind === 'monogram') art.textContent = src.letter;
      this.applyCrop(fig, { top: 0, bottom: 1 }, 1);
    }
  }

  private applyCrop(fig: HTMLElement, crop: Crop, aspect: number): void {
    const b = figureBox(crop, 1, aspect);
    fig.style.setProperty('--fig-w', String(b.width));
    fig.style.setProperty('--fig-bw', String(b.bgWidth));
    fig.style.setProperty('--fig-bh', String(b.bgHeight));
    fig.style.setProperty('--fig-by', String(b.bgY));
  }
}
