/**
 * The table's card faces (the hand spec §5): a recruit with the specialty and grade over their face, then the name, the
 * card's state and shown traits; the other cards as their picture from `web/public/cards/` in the same frame. In the
 * hand the picture fills the card and the words sit on a fade at its foot (table.css). A card that's out lies face down.
 */
import { GRADES, type Grade, type Specialty, type Timing } from '../../../../shared/crew-book';
import type { ProgramKind } from '../../../../shared/programs';
import type { ContactCard } from '../../../../shared/types';
import { face } from '../crew-ui';
import { el } from './el';

/** A card picture's file (web/public/cards/<name>.webp). */
export type CardArt = 'quiet' | 'smooth' | 'hard' | 'favour' | 'lead' | 'tip' | 'empty' | 'back' | 'steady' | 'take';
const artUrl = (a: CardArt) => `/cards/${a}.webp`;

function frame(pic: HTMLElement, name: string, lines: string[], traits: { label: string; good: boolean }[] = [], abilities: string[] = []): HTMLElement {
  const f = el('span', 'tbc');
  const body = el('span', 'tbc-body');
  body.append(el('span', 'tbc-name', name));
  for (const l of lines) if (l) body.append(el('span', 'tbc-note', l));
  for (const t of traits) body.append(el('span', `tbc-tr${t.good ? '' : ' bad'}`, `${t.good ? '+' : '−'} ${t.label.toUpperCase()}`));
  for (const a of abilities) body.append(el('span', 'tbc-ab', `◆ ${a.toUpperCase()}`));
  f.append(pic, body);
  return f;
}

/** A recruit's card: the hire card's portrait panel and name, the card's state line (`1 FREE`), shown traits and slotted abilities' labels (SETUP). */
export function crewFace(r: { name: string; spec: Specialty; grade: Grade; toNext?: number; face: string | null; traits: { label: string; good: boolean }[]; abilities?: string[] }, note?: string): HTMLElement {
  const pic = el('span', 'tbc-pic');
  pic.append(el('span', 'tbc-spec', r.spec.toUpperCase()), el('span', 'tbc-grade', GRADES[r.grade]), face(r, 'tbc-face'));
  const growth = r.toNext ? `${Math.ceil(r.toNext)} TO ${GRADES[r.grade + 1]}` : null;
  return frame(pic, r.name.split(' ')[0].toUpperCase(), [...(note ? [note] : []), ...(growth ? [growth] : [])], r.traits, r.abilities);
}

const TIMING_WORD = { roll: 'ON A ROLL', after: 'AFTER A ROLL', end: 'AT THE END', auto: 'WHEN IT COMES' } as const;

/**
 * An ability's card in a recruit's stack (crew abilities spec §2): its picture (web/public/abilities/<id>.webp, cut from
 * art/cards/prompt.md's ability sheets) over its timing's colour, when it plays as the chip, its label, what it does, its
 * state line. Without a picture the colour shows alone.
 */
export function abilityFace(a: { id: string; label: string; timing: Timing; words: string }, note?: string): HTMLElement {
  const pic = el('span', `tbc-pic tbc-ability t-${a.timing}`);
  const img = el('img', 'tbc-art');
  img.src = `/abilities/${a.id}.webp`;
  img.alt = '';
  img.addEventListener('error', () => img.remove());
  pic.append(img, el('span', 'tbc-spec', TIMING_WORD[a.timing]));
  return frame(pic, a.label.toUpperCase(), [a.words, ...(note ? [note] : [])]);
}

/**
 * A contact's card (contact cards spec §3): her card art (web/public/contacts/<id>.webp, cut from art/cards/contacts),
 * else her portrait, else her initial, in her colour, `CASS · FENCE`, and its state line.
 */
export function contactFace(c: ContactCard, note?: string): HTMLElement {
  const pic = el('span', 'tbc-pic tbc-contact');
  pic.style.setProperty('--c', c.accent);
  pic.append(el('span', 'tbc-spec', 'CONTACT'));
  const initial = () => el('span', 'tbc-face cr-mono', c.name.trim().charAt(0).toUpperCase());
  const img = el('img', 'tbc-face');
  img.src = `/contacts/${c.id}.webp`;
  img.alt = '';
  img.addEventListener('error', () => {
    if (c.portrait && img.getAttribute('src') !== c.portrait) img.src = c.portrait;
    else img.replaceWith(initial());
  });
  pic.append(img);
  return frame(pic, `${c.name.split(' ')[0].toUpperCase()} · ${c.spec.toUpperCase()}`, note ? [note] : []);
}

/** A picture card: its art with a label (top left) and a chip (top right), then its name and lines. */
export function artFace(art: CardArt, name: string, lines: string[] = [], chip?: string, tag?: string): HTMLElement {
  const pic = el('span', `tbc-pic art-${art}`);
  const img = el('img', 'tbc-art');
  img.src = artUrl(art);
  img.alt = '';
  img.addEventListener('error', () => img.remove());
  pic.append(img);
  if (tag) pic.append(el('span', 'tbc-spec', tag));
  if (chip) pic.append(el('span', 'tbc-grade', chip));
  return frame(pic, name, lines);
}

/** A card lying face down (a recruit who's down, a used favour): the whole back, its name and why on a strip. */
export function backFace(name: string, note: string): HTMLElement {
  const f = el('span', 'tbc tbc-back');
  const img = el('img', 'tbc-art');
  img.src = artUrl('back');
  img.alt = '';
  const strip = el('span', 'tbc-strip');
  strip.append(el('span', 'tbc-name', name), el('span', 'tbc-note', note));
  f.append(img, strip);
  return f;
}

/** What a program does, as its card says it (programs spec §1.4). */
const PROGRAM_WORDS: Record<ProgramKind, string> = { position: 'BETTER POSITION', effect: 'BIGGER EFFECT', quiet: '−1 HEAT', firewall: 'CANCELS A COST' };
/** A picture from `web/public/programs/` (sheet 10b); the card back if one is missing. */
function programPic(src: string): HTMLElement {
  const pic = el('span', 'tbc-pic tbc-prog');
  const img = el('img', 'tbc-art');
  img.src = src;
  img.alt = '';
  img.addEventListener('error', () => {
    if (img.getAttribute('src') !== artUrl('back')) img.src = artUrl('back');
    else img.remove();
  });
  pic.append(img);
  return pic;
}

/** A program's card (programs spec §2.1): its picture, its stat, its name, what it does and the card's state. */
export function programFace(p: { id: string; name: string; stat: string; kind: ProgramKind }, note?: string): HTMLElement {
  const pic = programPic(`/programs/${p.id}.webp`);
  pic.append(el('span', 'tbc-spec', p.stat.toUpperCase()));
  return frame(pic, p.name, [PROGRAM_WORDS[p.kind], ...(note ? [note] : [])]);
}

/** The DECK group's label (programs spec §2.1): the deck carried and its quality, or none. */
export const deckLabel = (deck: { name: string; quality: number } | null): string => (deck ? `DECK · ${deck.name.toUpperCase()} · Q${deck.quality}` : 'DECK · NONE');

/** An empty slot: EMPTY, or LOAD when a program fits a check here (`note` its price mid-job: programs spec §1.2a). */
export function slotFace(word: 'EMPTY' | 'LOAD', note = 'TAP TO SLOT A PROGRAM'): HTMLElement {
  return frame(programPic('/programs/empty.webp'), word, word === 'LOAD' ? [note] : []);
}
