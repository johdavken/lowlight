/**
 * The room's light on you, your contact and the speaking cameo card (spec 2026-10-15, figure lighting): on renderer frames, a
 * few times a second, each stage figure is sampled where the room's light falls on it — its left and
 * right side at chest height, and its head — and the result goes on the figure as CSS custom
 * properties its shade and glow layers read (stage.ts, style.css). A figure without a sprite gets
 * one uniform brightness. The lighting itself is the renderer's (`Renderer.lightAt`); this file only
 * turns room light into figure light.
 */
import type { Renderer } from '../renderer';

type RGB = [number, number, number];

/** Never darker than this share of as drawn: faces stay readable in a power cut. */
export const FIGURE_FLOOR = 0.3;
/** Never brighter than this: a lamp warms her, it doesn't wash her out. */
export const FIGURE_CEILING = 1.25;
/** How much of the room's light she takes; the rest stays as drawn (lit art, not a filter). */
export const FIGURE_STRENGTH = 0.75;
/** Room light that leaves a figure as drawn (the room's art is darker than the sprites, so its light runs higher). */
export const NEUTRAL_LIGHT = 1.6;
/** How hard the light above as-drawn adds (a screen blend): at the ceiling, about 15 % — a lamp warms her side, it doesn't paint her. */
export const GLOW_SCALE = 0.6;
/** At most this often (ms): flicker reads, the page doesn't churn. */
const INTERVAL_MS = 66;
/** A channel has to move this much before the figure's properties are written again. */
const STEP = 0.01;

/** Sample points on a figure, as shares of its box. */
const LEFT = [0.25, 0.3] as const;
const RIGHT = [0.75, 0.3] as const;
const HEAD = [0.5, 0.12] as const;
const CENTRE = [0.5, 0.5] as const;

/** A room sample → the figure's light per channel: over the neutral light, mixed toward 1 by strength, clamped to [floor, ceiling]. */
export function figureLight(sample: RGB): RGB {
  return sample.map((c) => {
    const v = FIGURE_STRENGTH * (c / NEUTRAL_LIGHT) + (1 - FIGURE_STRENGTH);
    return Math.max(FIGURE_FLOOR, Math.min(FIGURE_CEILING, v));
  }) as RGB;
}

const SVG = 'http://www.w3.org/2000/svg';
/** A left-to-right ramp, clear to white: lays the right side's light over the left's, as much as x. */
const RAMP =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 1' preserveAspectRatio='none'%3E" +
  "%3ClinearGradient id='g'%3E%3Cstop offset='0' stop-color='%23fff' stop-opacity='0'/%3E%3Cstop offset='1' stop-color='%23fff'/%3E%3C/linearGradient%3E" +
  "%3Crect width='2' height='1' fill='url(%23g)'/%3E%3C/svg%3E";
let lightFilters = 0;

/**
 * The room's light as an SVG filter on her art: the multiply colour (--light-l → --light-r across her)
 * and the add colour (--glow-l → --glow-r), then cut by her own drawn pixels (SourceGraphic). A mask
 * of her images drawn separately lands a device pixel off her art at some window sizes and showed the
 * light's own colour as a pale fringe; the filter can't reach past her. The svg goes inside the element
 * that carries the light properties (a stage figure, a cameo card), so the floods read hers; `prefix`
 * names the filter, made unique here.
 */
export function lightFilter(prefix: string): { id: string; svg: SVGSVGElement } {
  const id = `${prefix}-${++lightFilters}`;
  const el = (tag: string, attrs: Record<string, string>) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const svg = el('svg', { class: 'stage-light-fx', width: '0', height: '0', 'aria-hidden': 'true' }) as SVGSVGElement;
  const filter = el('filter', { id, x: '0', y: '0', width: '1', height: '1', primitiveUnits: 'objectBoundingBox', 'color-interpolation-filters': 'sRGB' });
  const ramp = el('feImage', { href: RAMP, x: '0', y: '0', width: '1', height: '1', preserveAspectRatio: 'none', result: 'ramp' });
  const across = (left: string, right: string, out: string) => [
    el('feFlood', { style: `flood-color: var(${left})`, result: `${out}-l` }),
    el('feFlood', { style: `flood-color: var(${right})` }),
    el('feComposite', { in2: 'ramp', operator: 'in' }),
    el('feComposite', { in2: `${out}-l`, operator: 'over', result: out }),
  ];
  filter.append(
    ramp,
    ...across('--light-l', '--light-r', 'shade'),
    ...across('--glow-l', '--glow-r', 'glow'),
    el('feBlend', { in: 'shade', in2: 'SourceGraphic', mode: 'multiply', result: 'shaded' }),
    el('feBlend', { in: 'glow', in2: 'shaded', mode: 'screen' }),
    el('feComposite', { in2: 'SourceGraphic', operator: 'in' }),
  );
  svg.append(filter);
  return { id, svg };
}

const byte = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255);
const rgb = (c: RGB) => `rgb(${byte(c[0])}, ${byte(c[1])}, ${byte(c[2])})`;

/** The multiply part (each channel up to 1) and the add part (the light above 1, scaled by GLOW_SCALE), as CSS colours. */
export function lightCss(v: RGB): { shade: string; glow: string } {
  return {
    shade: rgb(v.map((c) => Math.min(c, 1)) as RGB),
    glow: rgb(v.map((c) => Math.max(0, c - 1) * GLOW_SCALE) as RGB),
  };
}

const mean = (...xs: RGB[]): RGB => [0, 1, 2].map((i) => xs.reduce((s, x) => s + x[i], 0) / xs.length) as RGB;
/** Worth writing: nothing written yet, a different kind of figure (one brightness vs two sides), or a channel moved. */
const moved = (a: number[] | undefined, b: number[]) => !a || a.length !== b.length || a.some((x, i) => Math.abs(x - b[i]) > STEP);

export class StageLight {
  private last = -Infinity;
  /** What each figure was last given (left then right, or its one brightness). */
  private readonly written = new WeakMap<HTMLElement, number[]>();
  private readonly off: () => void;
  private readonly now: () => number;

  constructor(
    private readonly renderer: Pick<Renderer, 'lightAt' | 'onFrame'>,
    private readonly figures: () => HTMLElement[],
    opts: { now?: () => number } = {},
  ) {
    this.now = opts.now ?? (() => performance.now());
    this.off = renderer.onFrame(() => this.frame());
  }

  dispose(): void {
    this.off();
  }

  private frame(): void {
    const t = this.now();
    if (t - this.last < INTERVAL_MS) return;
    this.last = t;
    for (const fig of this.figures()) this.light(fig);
  }

  private sample(box: DOMRect, at: readonly [number, number]): RGB | null {
    return this.renderer.lightAt(box.left + at[0] * box.width, box.top + at[1] * box.height);
  }

  private light(fig: HTMLElement): void {
    const box = fig.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    if (fig.dataset.kind !== 'sprite') {
      const c = this.sample(box, CENTRE);
      if (!c) return;
      const v = figureLight(c);
      const luma = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      if (!moved(this.written.get(fig), [luma])) return;
      this.written.set(fig, [luma]);
      fig.style.setProperty('--fig-light', String(Math.round(luma * 100) / 100));
      return;
    }
    const l = this.sample(box, LEFT);
    const r = this.sample(box, RIGHT);
    const h = this.sample(box, HEAD);
    // Between rooms (nothing shaded yet) she keeps the light she had.
    if (!l || !r || !h) return;
    const head = figureLight(h);
    const left = mean(figureLight(l), figureLight(l), head);
    const right = mean(figureLight(r), figureLight(r), head);
    const both = [...left, ...right];
    if (!moved(this.written.get(fig), both)) return;
    this.written.set(fig, both);
    const L = lightCss(left);
    const R = lightCss(right);
    fig.style.setProperty('--light-l', L.shade);
    fig.style.setProperty('--light-r', R.shade);
    fig.style.setProperty('--glow-l', L.glow);
    fig.style.setProperty('--glow-r', R.glow);
  }
}
