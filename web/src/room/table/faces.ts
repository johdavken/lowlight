/**
 * The table's card faces (the hand spec §5): a recruit with the specialty and grade marks over their face, then the name, the
 * card's state and shown traits; the other cards as their picture from `web/public/cards/` in the same frame. In the
 * hand the picture fills the card and the words sit on a fade at its foot (table.css). A card that's out lies face down.
 */
import { GRADES, type Grade, type Specialty, type Timing } from '../../../../shared/crew-book';
import type { ProgramKind } from '../../../../shared/programs';
import type { ContactCard } from '../../../../shared/types';
import { face } from '../crew-ui';
import { rankMark, symbolMark, timingMark } from './marks';
import { el } from './el';

/** A card picture's file (web/public/cards/<name>.webp). */
export type CardArt = 'quiet' | 'smooth' | 'hard' | 'favour' | 'lead' | 'tip' | 'empty' | 'back' | 'steady' | 'take';
const artUrl = (a: CardArt) => `/cards/${a}.webp`;

/** A call card's picture, by the stat it rolls: what you're doing (art/cards/prompt.md, sheet 12). A stat with none shows the black card. */
const STAT_ART: Record<string, string> = { REFLEX: '/cards/stat-reflex.webp', COOL: '/cards/stat-cool.webp', BODY: '/cards/stat-body.webp', WITS: '/cards/stat-wits.webp', TECH: '/cards/stat-tech.webp' };

/** A call card's picture with its stat's symbol over it. */
export function statPicture(stat: string): HTMLElement {
  const side = el('span', 'tb-side');
  const src = STAT_ART[stat];
  if (src) {
    const img = el('img', 'tb-art');
    img.src = src;
    img.alt = '';
    img.addEventListener('error', () => img.remove());
    side.append(img);
  }
  side.append(symbolMark(stat.toLowerCase()));
  return side;
}

/** A printed card: the black border and centred serif of a crew or program card (table.css). A long name wraps at its space, or sets smaller if it has none; a long line sets smaller. */
const printed = (f: HTMLElement): HTMLElement => {
  f.classList.add('tbc-print');
  const name = f.querySelector('.tbc-name');
  const text = name?.textContent ?? '';
  if (text.length > 9) name!.classList.add(text.includes(' ') ? 'wrap' : 'long');
  for (const n of f.querySelectorAll('.tbc-note')) if ((n.textContent?.length ?? 0) > 20) n.classList.add('long');
  return f;
};

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

/** An approach at SETUP: printed on a desktop, with how it goes wrong, then its rules (mockup approach-cards.html, C). */
export function approachFace(art: CardArt, name: string, wrong: string, rules: { stats: string; start?: string; spared: string; first?: string }): HTMLElement {
  const f = artFace(art, name);
  f.classList.add('tbc-print');
  const line = (kind: string, text: string) => el('span', `tbc-note ${kind}`, text);
  f.querySelector('.tbc-body')!.append(el('span', 'tbc-wrong', wrong), line('tbc-stats', rules.stats), ...(rules.start ? [line('tbc-start', rules.start)] : []), line('tbc-spared', rules.spared), ...(rules.first ? [line('tbc-first', rules.first)] : []));
  return f;
}

/** A contact's bust as a card's picture. */
function bust(src: string): HTMLElement {
  const img = el('img', 'tbc-face');
  img.src = src;
  img.alt = '';
  return img;
}

/** A recruit's card: the hire card's portrait panel and name, the card's state line (`1 FREE`), shown traits and slotted abilities' labels (SETUP). */
export function crewFace(r: { name: string; spec: Specialty; grade: Grade; toNext?: number; face: string | null; traits: { label: string; good: boolean }[]; abilities?: string[]; guest?: true; art?: string }, note?: string): HTMLElement {
  const pic = el('span', 'tbc-pic');
  pic.append(symbolMark(r.spec), rankMark(r.grade), r.art ? bust(r.art) : face(r, 'tbc-face'));
  const growth = r.toNext ? `${Math.ceil(r.toNext)} TO ${GRADES[r.grade + 1]}` : null;
  const lines = [note, growth].filter((l): l is string => !!l);
  const state = lines.join(' · ');
  const card = printed(frame(pic, r.name.split(' ')[0].toUpperCase(), [...(r.guest ? ['GUEST'] : []), ...(state.length <= 20 ? [state] : lines)], r.traits, r.abilities));
  // A guest's foil (guest crew spec §4).
  if (r.guest) card.classList.add('tb-foil');
  return card;
}

const TIMING_WORD = { roll: 'ON A ROLL', after: 'AFTER A ROLL', end: 'AT THE END', auto: 'WHEN IT COMES' } as const;

/**
 * An ability's card in a recruit's stack (crew abilities spec §2), printed like the crew's: its picture
 * (web/public/abilities/<id>.webp, cut from art/cards/prompt.md's ability sheets) over its timing's colour, when it plays as
 * the mark, its label, its state line, what it does. Without a picture the colour shows alone.
 */
export function abilityFace(a: { id: string; label: string; timing: Timing; words: string }, note?: string): HTMLElement {
  const pic = el('span', `tbc-pic tbc-ability t-${a.timing}`);
  const img = el('img', 'tbc-art');
  img.src = `/abilities/${a.id}.webp`;
  img.alt = '';
  img.addEventListener('error', () => img.remove());
  pic.append(img, timingMark(a.timing, TIMING_WORD[a.timing]));
  const card = printed(frame(pic, a.label.toUpperCase(), [...(note ? [note] : []), a.words]));
  // What it does runs to a few lines, where a crew card's notes keep to one.
  const words = [...card.querySelectorAll('.tbc-note')].at(-1)!;
  words.classList.remove('long');
  words.classList.add('words');
  return card;
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
export function programFace(p: { id: string; name: string; stat: string; kind: ProgramKind; foil?: true; count?: number }, note?: string): HTMLElement {
  // A foil (owned programs) wears its program's picture, the guest's shimmer and +1D on the corner.
  const pic = programPic(`/programs/${p.foil ? p.id.replace(/^foil:/, '') : p.id}.webp`);
  pic.append(symbolMark(p.stat));
  if (p.foil) pic.append(el('span', 'tbc-grade', '+1D'));
  const foil = p.foil ? [`FOIL${(p.count ?? 1) > 1 ? ` ×${p.count}` : ''} · ONE RUN`] : [];
  const card = printed(frame(pic, p.name, [PROGRAM_WORDS[p.kind], ...foil, ...(note ? [note] : [])]));
  if (p.foil) card.classList.add('tb-foil');
  return card;
}

/** The DECK group's label (programs spec §2.1): the deck carried and its quality, or none. */
export const deckLabel = (deck: { name: string; quality: number } | null): string => (deck ? `DECK · ${deck.name.toUpperCase()} · Q${deck.quality}` : 'DECK · NONE');

/** An empty slot: EMPTY, or LOAD when a program fits a check here (`note` its price mid-job: programs spec §1.2a). */
export function slotFace(word: 'EMPTY' | 'LOAD', note = 'TAP TO SLOT A PROGRAM'): HTMLElement {
  return printed(frame(programPic('/programs/empty.webp'), word, word === 'LOAD' ? [note] : []));
}
