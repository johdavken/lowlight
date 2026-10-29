import { isFlat, type FrameSize } from '../../../shared/frame';

/** Render resolution of a 480 room (the default); flat rooms render at their own `resolution`. */
export const RENDER_W = 480;
export const RENDER_H = 270;

/**
 * Converts a CSS length to device pixels. Rounds rather than floors: some headless browsers
 * report a `devicePixelRatio` that is numerically just under its true value (e.g.
 * `0.9999999962747097` instead of `1`), and flooring a whole CSS pixel's worth of noise away
 * costs a full `integerScale` step (4x becomes 3x) for no visible reason.
 */
export function devicePixels(cssLength: number, dpr: number): number {
  return Math.max(1, Math.round(cssLength * dpr));
}

/**
 * Largest whole-number upscale of a `w`×`h` image that fits the window (never below 1), and the
 * offsets that centre it. Integer scaling keeps every art pixel the same size on screen.
 */
export function integerScale(
  winW: number,
  winH: number,
  w = RENDER_W,
  h = RENDER_H,
): { scale: number; x: number; y: number } {
  const scale = Math.max(1, Math.floor(Math.min(winW / w, winH / h)));
  return {
    scale,
    x: Math.floor((winW - w * scale) / 2),
    y: Math.floor((winH - h * scale) / 2),
  };
}

/** Largest uniform (unrounded) scale of a `w`×`h` frame that fits the window, centred. */
export function fitScale(winW: number, winH: number, w: number, h: number): { scale: number; x: number; y: number } {
  const scale = Math.min(winW / w, winH / h);
  return { scale, x: Math.floor((winW - w * scale) / 2), y: Math.floor((winH - h * scale) / 2) };
}

/**
 * How a room's frame sits in the window: 480 rooms in whole steps with hard pixel edges, flat rooms
 * filling the window with smooth filtering.
 */
/** A point on screen (CSS px) → the render texture (room px), undoing the view's device-pixel scale and offset. */
export function screenToRender(cssX: number, cssY: number, dpr: number, view: { scale: number; x: number; y: number }): [number, number] {
  return [(cssX * dpr - view.x) / view.scale, (cssY * dpr - view.y) / view.scale];
}

export function frameView(res: FrameSize, winW: number, winH: number): { scale: number; x: number; y: number; smooth: boolean } {
  if (isFlat(res)) return { ...fitScale(winW, winH, res[0], res[1]), smooth: true };
  return { ...integerScale(winW, winH, res[0], res[1]), smooth: false };
}

/**
 * How a room's frame sits on the game stage (spec 2026-10-16 fixed stage §3), in canvas device px:
 * `frameView` inside the stage's rect, offset by where the stage sits in the window.
 */
export function stageView(
  res: FrameSize,
  stage: { left: number; top: number; width: number; height: number },
  dpr: number,
): { scale: number; x: number; y: number; smooth: boolean } {
  const v = frameView(res, devicePixels(stage.width, dpr), devicePixels(stage.height, dpr));
  return { ...v, x: v.x + Math.round(stage.left * dpr), y: v.y + Math.round(stage.top * dpr) };
}

/** How bright the bars' blurred copy of the room is. */
export const BACKDROP_BRIGHTNESS = 0.35;

/** Device px of bar too thin to bother filling. */
const BACKDROP_GAP = 2;

/**
 * The blurred copy of the room that fills the bars: the frame scaled to cover the whole `w`×`h`
 * canvas, centred. Hidden when the room's own view (if given) already covers the canvas, and when
 * it's off (`enabled` false: Studio, where rooms are tuned, keeps plain black around them).
 */
export function backdropView(
  res: FrameSize,
  w: number,
  h: number,
  view?: { scale: number; x: number; y: number },
  enabled = true,
): { scale: number; x: number; y: number; show: boolean } {
  const scale = Math.max(w / res[0], h / res[1]);
  // A gap of up to 2 device px (the stage rounds to whole device px) isn't worth a full-canvas blur.
  const g = BACKDROP_GAP;
  const covered = !!view && view.x <= g && view.y <= g && view.x + res[0] * view.scale >= w - g && view.y + res[1] * view.scale >= h - g;
  return { scale, x: (w - res[0] * scale) / 2, y: (h - res[1] * scale) / 2, show: enabled && !covered };
}

/**
 * The BlurFilter strength that blurs by `devicePx`: Pixi counts strength in the filter texture's
 * texels, which at `resolution` 0.5 are 2 device px each.
 */
export function backdropBlurStrength(devicePx: number, resolution: number): number {
  return devicePx * resolution;
}

/** The parallax's pointer target: −1…1 across `rect` (window css px), held at the edge outside it. */
export function parallaxTarget(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  const axis = (v: number, start: number, size: number) => (size > 0 ? Math.max(-1, Math.min(1, ((v - start) / size) * 2 - 1)) : 0);
  return { x: axis(clientX, rect.left, rect.width), y: axis(clientY, rect.top, rect.height) };
}
