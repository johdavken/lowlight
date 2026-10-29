/**
 * The game stage (spec 2026-10-16 fixed stage): every game screen lays out on one 1600×900 stage,
 * zoomed to fit the window and centred, so the UI keeps its place on the room at any window shape.
 */
export const STAGE_W = 1600;
export const STAGE_H = 900;

/** `min(w/1600, h/900)`: the largest scale that fits the 1600×900 stage into the window. */
export function stageScale(w: number, h: number): number {
  return Math.min(w / STAGE_W, h / STAGE_H);
}

/** Where the stage sits in the window, in window CSS px. */
export interface StageRect {
  scale: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The stage centred in a `w`×`h` window. */
export function stageRect(w: number, h: number): StageRect {
  const scale = stageScale(w, h);
  const width = STAGE_W * scale;
  const height = STAGE_H * scale;
  return { scale, left: (w - width) / 2, top: (h - height) / 2, width, height };
}

export interface GameStage {
  rect(): StageRect;
  /** Called with the new rect on every resize; returns the unsubscribe. */
  onRect(cb: (r: StageRect) => void): () => void;
  dispose(): void;
}

/**
 * Zooms `el` (the 1600×900 `#game`) to fit the window and centres it, on mount and on resize.
 * CSS `zoom`, not a transform: text lays out at its final size and stays crisp, and
 * `getBoundingClientRect()` and pointer coordinates stay in window px.
 */
export function mountGameStage(el: HTMLElement): GameStage {
  let rect = stageRect(window.innerWidth, window.innerHeight);
  const subs = new Set<(r: StageRect) => void>();
  const apply = () => {
    rect = stageRect(window.innerWidth, window.innerHeight);
    el.style.zoom = String(rect.scale);
    // `left`/`top` on a zoomed element are zoomed too, so they're written in stage px.
    el.style.left = `${rect.left / rect.scale}px`;
    el.style.top = `${rect.top / rect.scale}px`;
  };
  const onResize = () => {
    apply();
    for (const cb of subs) cb(rect);
  };
  apply();
  window.addEventListener('resize', onResize);
  return {
    rect: () => rect,
    onRect(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      subs.clear();
    },
  };
}

/** Where game screens mount: `#game`, or the body where there is none (unit tests). */
export function gameRoot(): HTMLElement {
  return document.getElementById('game') ?? document.body;
}
