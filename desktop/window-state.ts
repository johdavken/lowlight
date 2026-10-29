import fs from 'node:fs';

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

export const MIN_WIDTH = 960;
export const MIN_HEIGHT = 540;

/**
 * A first run's window (fixed stage spec §5): 16:9 like the game's stage, 1600×900 when that fits
 * in 90 % of the work area, else the largest 16:9 that does, never below the minimum.
 */
export function defaultWindow(workArea: { width: number; height: number }): WindowState {
  const height = Math.max(MIN_HEIGHT, Math.min(900, Math.floor(Math.min(0.9 * workArea.height, (0.9 * workArea.width * 9) / 16))));
  return { width: Math.round((height * 16) / 9), height, maximized: false };
}

/** The window's last size and place (spec §5.1); `fallback` when the file is missing or damaged. */
export function readWindowState(file: string, fallback: WindowState): WindowState {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<WindowState>;
    const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    if (!num(raw.width) || !num(raw.height)) return { ...fallback };
    return {
      width: Math.max(MIN_WIDTH, Math.round(raw.width)),
      height: Math.max(MIN_HEIGHT, Math.round(raw.height)),
      ...(num(raw.x) && num(raw.y) ? { x: Math.round(raw.x), y: Math.round(raw.y) } : {}),
      maximized: raw.maximized === true,
    };
  } catch {
    return { ...fallback };
  }
}

/** Saves the window's place; false when it can't (an unwritable folder), never a throw — it runs while quitting. */
export function writeWindowState(file: string, state: WindowState): boolean {
  try {
    fs.writeFileSync(file, `${JSON.stringify(state)}\n`);
    return true;
  } catch {
    return false;
  }
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How much of the window must show on some screen to keep its saved place: enough to grab its title bar. */
const GRAB_W = 100;
const GRAB_H = 40;

/** Drops a saved place that no screen shows enough of (a monitor unplugged since), so the window opens centred. */
export function fitOnScreen(state: WindowState, workAreas: Rect[]): WindowState {
  if (state.x === undefined || state.y === undefined) return state;
  const { x, y } = state;
  const shows = workAreas.some((a) => {
    const w = Math.min(x + state.width, a.x + a.width) - Math.max(x, a.x);
    const h = Math.min(y + state.height, a.y + a.height) - Math.max(y, a.y);
    return w >= GRAB_W && h >= GRAB_H;
  });
  if (shows) return state;
  const { x: _x, y: _y, ...rest } = state;
  return rest;
}
