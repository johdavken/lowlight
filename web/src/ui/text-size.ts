/** The reading text's size (spec 2026-10-16 fixed stage §6): SYS → TEXT SIZE, kept per browser. */
const SIZES = [85, 100, 115, 130, 150] as const;
export type TextSize = (typeof SIZES)[number];
const SIZE_KEY = 'lowlight.textSize';

/** The saved size; 100 % when none is saved, it isn't one of the steps, or storage is off. */
export function loadTextSize(): TextSize {
  try {
    const v = Number(localStorage.getItem(SIZE_KEY));
    return (SIZES as readonly number[]).includes(v) ? (v as TextSize) : 100;
  } catch {
    return 100;
  }
}

export function saveTextSize(s: TextSize): void {
  try {
    localStorage.setItem(SIZE_KEY, String(s));
  } catch {
    // Storage off: the size holds for this page only.
  }
}

/** One step bigger (+) or smaller (−), stopping at the ends. */
export function stepTextSize(s: TextSize, d: number): TextSize {
  return SIZES[Math.max(0, Math.min(SIZES.length - 1, SIZES.indexOf(s) + Math.sign(d)))];
}

/** Sets `--text-scale` on `root` (the game stage): the reading text's font sizes multiply by it. */
export function applyTextSize(root: HTMLElement, s: TextSize): void {
  root.style.setProperty('--text-scale', String(s / 100));
}
