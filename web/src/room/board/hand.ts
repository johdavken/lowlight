/**
 * The board's hand (crew rules spec 2026-11-17, mockup crew-board.html): the printed cards along the bottom. Your card
 * first, then each recruit brought, then the programs smaller. A recruit's move is its own card tucked behind theirs.
 * The contact draws no card here: her way is offered from her comms strip.
 */
import type { CrewJobView } from '../../../../shared/types';
import { baseProgramId } from '../../../../shared/programs';
import { rankMark, symbolMark } from '../table/marks';
import { el } from '../table/el';

export type HandCard = CrewJobView['hand'][number];

/** A card that isn't ready, as its strip reads. */
export const STATE_WORD: Record<Exclude<HandCard['state'], 'ready'>, string> = { spent: 'SPENT', door: 'AT THE DOOR', hurt: 'HURT', held: 'HELD' };

/** Where the hand sits on the 1600×900 stage (mockup): people from x 470, the deck from 1330, all at y 586. */
export const HAND_TOP = 586;
const PEOPLE_X = 470;
const PEOPLE_END = 1320;
const PC_W = 204;
const PC_STEP = 212;
export const DECK_X = 1330;
const DECK_END = 1572;
const PROG_W = 126;
const PROG_STEP = 134;

/** The first name, in capitals, as a card prints it. */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0].toUpperCase();

/** Art that failed to load, kept so a redraw draws the fallback at once. */
const failed = new Set<string>();

/** A picture that turns into the name's initial when it's missing or fails: never a broken image. */
export function faceEl(src: string | null, name: string, cls = 'bw-face'): HTMLElement {
  const mono = () => el('span', `${cls} bw-mono`, name.trim().charAt(0).toUpperCase());
  if (!src || failed.has(src)) return mono();
  const img = el('img', cls);
  img.src = src;
  img.alt = '';
  img.addEventListener('error', () => {
    failed.add(src);
    img.replaceWith(mono());
  });
  return img;
}

/** A program's picture (web/public/programs/), the card back if it has none, else nothing. */
export function programArt(handId: string): string {
  return `/programs/${baseProgramId(handId.replace(/^p:/, ''))}.webp`;
}

function programPic(src: string): HTMLElement {
  const img = el('img', 'bw-art');
  img.alt = '';
  const back = '/cards/back.webp';
  img.src = failed.has(src) ? back : src;
  img.addEventListener('error', () => {
    if (img.getAttribute('src') !== back) {
      failed.add(src);
      img.src = back;
    } else img.remove();
  });
  return img;
}

/** Your card's top-left mark: a diamond (mockup ICON.YOU). */
function youMark(): HTMLElement {
  const m = el('span', 'tbc-mark tbc-symbol bw-you-mark');
  m.setAttribute('role', 'img');
  m.setAttribute('aria-label', 'YOU');
  m.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l8 10-8 10-8-10z"/></svg>';
  return m;
}

/** The x of each hand card: people at the mockup's step, closer if more than four; the deck's programs fanned to fit. */
export function handLayout(hand: readonly HandCard[]): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const people = hand.filter((h) => h.kind === 'you' || h.kind === 'recruit');
  const progs = hand.filter((h) => h.kind === 'program');
  const pStep = people.length > 1 ? Math.min(PC_STEP, (PEOPLE_END - PEOPLE_X - PC_W) / (people.length - 1)) : PC_STEP;
  people.forEach((h, i) => out.set(h.id, { x: Math.round(PEOPLE_X + i * pStep), y: HAND_TOP }));
  const gStep = progs.length > 1 ? Math.min(PROG_STEP, (DECK_END - DECK_X - PROG_W) / (progs.length - 1)) : PROG_STEP;
  progs.forEach((h, i) => out.set(h.id, { x: Math.round(DECK_X + i * gStep), y: HAND_TOP }));
  return out;
}

/** A person's printed card (you or a recruit): art to the edge, the marks, the name in serif capitals, two lines. */
export function personCard(h: HandCard, o: { sel: boolean; at: { x: number; y: number } }): HTMLElement {
  const card = el('div', `bw-pc bw-card${h.kind === 'you' ? ' you' : ''}${o.sel ? ' sel' : ''}${h.state !== 'ready' ? ' spent' : ''}`);
  card.dataset.hand = h.id;
  card.setAttribute('role', 'button');
  card.style.left = `${o.at.x}px`;
  card.style.top = `${o.at.y}px`;
  const inner = el('div', 'bw-in');
  inner.append(faceEl(h.art, h.name));
  if (h.kind === 'you') inner.append(youMark());
  else {
    if (h.spec) inner.append(symbolMark(h.spec));
    if (h.grade !== undefined) inner.append(rankMark(h.grade));
  }
  const name = firstName(h.name);
  const nm = el('div', `bw-nm${name.length > 8 ? ' long' : ''}`, name);
  const l1 = el('div', 'bw-l1', h.kind === 'you' ? 'YOU · EVERY BEAT' : `${(h.spec ?? 'CREW').toUpperCase()} · ONE GO`);
  inner.append(nm, l1);
  card.append(inner);
  if (h.state !== 'ready') card.append(el('span', 'bw-st', STATE_WORD[h.state]));
  return card;
}

/** A recruit's move, tucked behind their card: its art, its name along the top, what it does at the foot. */
export function moveCard(h: HandCard, at: { x: number; y: number }, lift = false): HTMLElement {
  const card = el('div', `bw-ab${lift ? ' lift' : ''}`);
  card.dataset.move = h.id;
  card.setAttribute('role', 'button');
  card.style.left = `${at.x + 14}px`;
  card.style.top = `${at.y - 44}px`;
  card.append(moveFace(h));
  return card;
}

/** A move's face (on its card, and rising to the middle when played). */
export function moveFace(h: HandCard): HTMLElement {
  const m = h.move!;
  const inner = el('div', 'bw-in');
  const img = el('img', 'bw-art');
  img.alt = '';
  img.src = m.art;
  img.addEventListener('error', () => img.remove());
  inner.append(img, el('div', 'bw-top', m.name), el('div', 'bw-mfx', `${m.line} Uses ${h.name.trim().split(/\s+/)[0]}'s one go.`));
  return inner;
}

/** A program's smaller card: its picture and name; PLAY on a chip when it can play and is picked. */
export function programCard(h: HandCard, o: { sel: boolean; at: { x: number; y: number }; chip: boolean }): HTMLElement {
  const card = el('div', `bw-prog bw-card program${o.sel ? ' sel' : ''}${h.state !== 'ready' ? ' spent' : ''}`);
  card.dataset.hand = h.id;
  card.setAttribute('role', 'button');
  card.style.left = `${o.at.x}px`;
  card.style.top = `${o.at.y}px`;
  const inner = el('div', 'bw-in');
  inner.append(h.art ? faceEl(h.art, h.name, 'bw-art') : programPic(programArt(h.id)), el('div', 'bw-nm', h.name.toUpperCase()));
  card.append(inner);
  if (o.chip && h.play) {
    const chip = el('button', 'bw-play', 'PLAY');
    chip.type = 'button';
    chip.title = h.play.line;
    card.append(chip);
  }
  if (h.state !== 'ready') card.append(el('span', 'bw-st', STATE_WORD[h.state]));
  return card;
}
