/**
 * The map's soft lights, drawn once and stamped: making a radial gradient for every lit window on every frame was the
 * largest cost left on the map. One small canvas per look, colour and size, kept for as long as the layer lives.
 */

/** A light (solid to a quarter of the way, then fading), a window going dark, and a puff of steam or smoke. */
export type GlowKind = 'glow' | 'dim' | 'puff';

const STOPS: Record<GlowKind, (color: string) => [number, string][]> = {
  glow: (c) => [[0, c], [0.25, c], [1, 'rgba(0,0,0,0)']],
  dim: () => [[0, 'rgba(8,5,16,1)'], [1, 'rgba(8,5,16,0)']],
  puff: (c) => [[0, c], [1, 'rgba(0,0,0,0)']],
};

const MIN_STAMP = 8;
const MAX_STAMP = 256;
/** The painting's windows take their colours from the picture, so there can be many: past this the cache starts over. */
const MAX_STAMPS = 512;

/**
 * A stamp's width for a light of `radius` device px: the next power of two across, so it only ever shrinks by up to half.
 * One big stamp shrunk to a few pixels would lose the light's soft edge.
 */
export function stampSize(radius: number): number {
  let size = MIN_STAMP;
  while (size < radius * 2 && size < MAX_STAMP) size *= 2;
  return size;
}

export class GlowStamps {
  private readonly stamps = new Map<string, HTMLCanvasElement | null>();

  constructor(private readonly makeCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')) {}

  /** Stamps a light of radius `r` (css px) at `x`, `y`, with `g`'s alpha and blending; `dpr` is device px per css px. */
  draw(g: CanvasRenderingContext2D, kind: GlowKind, color: string, x: number, y: number, r: number, dpr: number): void {
    const stamp = this.stamp(kind, color, stampSize(r * dpr));
    if (stamp) g.drawImage(stamp, x - r, y - r, r * 2, r * 2);
  }

  private stamp(kind: GlowKind, color: string, size: number): HTMLCanvasElement | null {
    const key = `${kind}|${color}|${size}`;
    const had = this.stamps.get(key);
    if (had !== undefined) return had;
    if (this.stamps.size >= MAX_STAMPS) this.stamps.clear();
    const c = this.makeCanvas();
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (g) {
      const mid = size / 2;
      const grad = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
      for (const [at, stop] of STOPS[kind](color)) grad.addColorStop(at, stop);
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
    }
    const made = g ? c : null;
    this.stamps.set(key, made);
    return made;
  }
}
