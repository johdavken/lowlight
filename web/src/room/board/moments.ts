/**
 * The board's moments (crew rules spec 2026-11-17, Moments; mockup crew-board.html): the card sent flies to its panel
 * and stays until the beat changes, a stamp lands (CLEAN, AT A PRICE, HURT), the clocks that moved light, ALARM shakes
 * the board, and a move's card rises to the middle for about a second before it drops into the beat's header. Under
 * reduced motion: no flight, no shake, no rise.
 */
import { el } from '../table/el';

/** The card's flight to its panel (board.css `.bw-flying`'s transition). */
export const FLY_MS = 320;
/** How long the beat that was played holds with its stamp before the next one comes in. */
export const STAMP_HOLD_MS = 1100;
/** The shake's length (board.css `bw-shake`). */
const SHAKE_MS = 300;
/** A move's card in the middle (board.css `bw-rise`), and how long it stands there without the rise. */
const RISE_MS = 1500;
const STILL_MS = 1000;

/**
 * The scene moment (a beat in another room): the board fades out (board.css `.bw-scene`), the room changes, the new
 * room holds clear with its name, the board fades back. Under reduced motion it hides and shows with no fade, and the
 * name holds the shorter time.
 */
export const SCENE_OUT_MS = 200;
export const SCENE_HOLD_MS = 2000;
export const SCENE_STILL_MS = 1200;
export const SCENE_BACK_MS = 300;
/** The longest a moment stays, whatever the room does (no renderer, a scene that never loads): the board comes back. */
export const SCENE_GIVE_UP_MS = 10_000;

export type Stamp ='CLEAN' | 'AT A PRICE' | 'HURT' | 'HELD';

/** A layout position inside `root` from offsets (the stage's zoom doesn't enter, as shell.ts publishLog). */
function offsetIn(n: HTMLElement, root: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let at: HTMLElement | null = n;
  while (at && at !== root) {
    x += at.offsetLeft;
    y += at.offsetTop;
    at = at.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/**
 * The sent card flies into its panel's slot and stays there (it's redrawn away when the next beat comes in). Under
 * reduced motion it's simply there.
 */
export function fly(card: HTMLElement, slot: HTMLElement, root: HTMLElement, reduced: boolean): void {
  const to = offsetIn(slot, root);
  card.classList.add(reduced ? 'bw-placed' : 'bw-flying');
  // Centred on the slot and scaled about its centre to fit it, whatever the card's size: a recruit's 204 × 272 card
  // scales down, a program's 126 × 168 up (playtest: a played program sat small in the slot's corner).
  const w = card.offsetWidth || 204;
  const h = card.offsetHeight || 272;
  const s = Math.round(Math.min(slot.offsetWidth / w, slot.offsetHeight / h) * 1000) / 1000;
  card.style.left = `${to.x + (slot.offsetWidth - w) / 2}px`;
  card.style.top = `${to.y + (slot.offsetHeight - h) / 2}px`;
  card.style.transform = `scale(${s})`;
}

/** The stamp on a panel. */
export function stamp(panel: HTMLElement, word: Stamp, reduced: boolean): void {
  panel.querySelector('.bw-stamp')?.remove();
  const s = el('div', `bw-stamp s-${word === 'AT A PRICE' ? 'price' : word.toLowerCase()}${reduced ? ' still' : ' in'}`, word);
  panel.append(s);
  if (!reduced) {
    const f = el('div', 'bw-flash in');
    panel.append(f);
  }
}

/** The board shakes (ALARM up, someone hurt). */
export function shake(board: HTMLElement, reduced: boolean): void {
  if (reduced) return;
  board.classList.remove('shake');
  void board.offsetWidth;
  board.classList.add('shake');
  setTimeout(() => board.classList.remove('shake'), SHAKE_MS + 100);
}

/** A move's card rises to the middle over a dimmed board, holds, and goes; under reduced motion it stands, then goes. */
export function rise(box: HTMLElement, face: HTMLElement, reduced: boolean): void {
  box.replaceChildren(face);
  box.classList.remove('in', 'still');
  void box.offsetWidth;
  box.classList.add(reduced ? 'still' : 'in');
  setTimeout(() => box.classList.remove('in', 'still'), reduced ? STILL_MS : RISE_MS);
}
