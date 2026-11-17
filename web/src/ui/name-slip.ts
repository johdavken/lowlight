import { GLYPHS } from '../room/table/decode';

/**
 * The name slip (playtest, 2026-11-16): now and then one letter of the speaker's name over the box flickers through a
 * few of the decode's glyphs and snaps back, a bad signal rather than an event. The real letter stays in place, made
 * transparent, and the glyph is painted over it (::after, style.css), so the name never changes width. The whole name
 * jerks a few px sideways on the first two frames, a horizontal hold slipping.
 */
export const SLIP_EVERY_MS: readonly [number, number] = [3000, 8000];
export const SLIP_FRAME_MS = 60;
/** How far the name can jerk sideways, either way, and for how many frames. */
export const SHIFT_PX = 5;
export const SHIFT_FRAMES = 2;

const pick = (s: string, r: () => number) => s[Math.floor(r() * s.length)];

/** The contact's names on screen in the box (the archive open hides them, so it slips nothing). */
function shownNames(root: HTMLElement): HTMLElement[] {
  if (root.classList.contains('expanded')) return [];
  return [...root.querySelectorAll<HTMLElement>('.msg.agent .meta .name')].filter((n) => n.getClientRects().length > 0 && /\S/.test(n.textContent ?? ''));
}

/** One letter of `name` flickers `frames` times, then the name is its own text again. Resolves when it's done. */
export async function slipOnce(name: HTMLElement, r: () => number = Math.random, wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms))): Promise<void> {
  const text = name.textContent ?? '';
  const letters = [...text].map((c, i) => (/\S/.test(c) ? i : -1)).filter((i) => i >= 0);
  if (!letters.length || name.querySelector('.slip')) return;
  const at = letters[Math.floor(r() * letters.length)];
  const chars = [...text];
  const slip = document.createElement('span');
  slip.className = 'slip';
  slip.textContent = chars[at];
  name.replaceChildren(chars.slice(0, at).join(''), slip, chars.slice(at + 1).join(''));
  const frames = 3 + Math.floor(r() * 3);
  for (let k = 0; k < frames; k++) {
    slip.dataset.n = pick(GLYPHS, r);
    name.style.setProperty('--slip-x', k < SHIFT_FRAMES ? `${Math.round((r() * 2 - 1) * SHIFT_PX)}px` : '0px');
    await wait(SLIP_FRAME_MS);
  }
  name.style.removeProperty('--slip-x');
  // Only if nothing redrew the name meanwhile.
  if (slip.parentNode === name) name.textContent = text;
}

/** Starts the slips on the box's names; returns the stop. Nothing runs when motion is reduced. */
export function startNameSlip(root: HTMLElement, reducedMotion: boolean): () => void {
  if (reducedMotion) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const next = () => {
    const [lo, hi] = SLIP_EVERY_MS;
    timer = setTimeout(async () => {
      const names = shownNames(root);
      if (names.length && !document.hidden) await slipOnce(names[names.length - 1]);
      if (timer !== null) next();
    }, lo + Math.random() * (hi - lo));
  };
  next();
  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}
