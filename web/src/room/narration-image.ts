/**
 * Images in the narration (spec 2026-11-18), in the JOB column. A row's images ride in the column's text as tokens at
 * the start of their paragraphs (latestQuestStory puts them in, so a held split or a pick line cut keeps them where they
 * belong); the column swaps each for an inline framed image. The typer types an image as one held character, and on
 * the board it decodes in: noise blocks in the column's decode colour that clear into the picture.
 */
import type { RowImage } from '../../../shared/types';

const OPEN = '';
const SEP = '';
const CLOSE = '';
const TOKEN = /([^]*)([^]*)([^]*)/g;
const PARA = /(\n[ \t]*\n)/;
/** The one character the typer steps over for an image. */
export const IMAGE_CHAR = '￼';
/** How long an image takes to decode at NORMAL text speed (scaled by TEXT SPEED). */
export const IMAGE_MS = 600;
/** Noise block size, px. */
const BLOCK = 8;

/** The third part says how it's framed: a figure's crop, `wide` for a scene picture, or nothing (a portrait). */
const tokenOf = (i: RowImage) => `${OPEN}${i.url}${SEP}${i.name}${SEP}${i.wide ? 'wide' : i.crop ? `${i.crop.top},${i.crop.bottom}` : ''}${CLOSE}`;

/** The text with each image's token at the start of its paragraph (paragraphs split on a blank line). */
export function withImageTokens(text: string, images: readonly RowImage[]): string {
  if (!images.length) return text;
  const parts = text.split(PARA);
  for (const i of images) {
    const at = i.para * 2;
    // A cut that ends on a blank line leaves an empty last paragraph: the image belongs to the text past the cut.
    if (at < parts.length && parts[at].trim()) parts[at] = tokenOf(i) + parts[at];
  }
  return parts.join('');
}

/** An indent before a paragraph's image token goes: the image must be the first thing on its line. */
export const unindentImages = (text: string, indent: string): string => text.split(`\n${indent}${OPEN}`).join(`\n${OPEN}`);

/** The text with its image tokens gone: anywhere it's shown as plain prose. */
export const stripImageTokens = (text: string): string => (text.includes(OPEN) ? text.replace(TOKEN, '') : text);

/** A framed inline image: full size from the start; a failed load keeps the frame. */
function imageEl(url: string, name: string, crop: string): HTMLElement {
  const box = document.createElement('span');
  box.className = 'jc-img';
  box.dataset.img = name;
  const ch = document.createElement('span');
  ch.className = 'jc-img-ch';
  ch.textContent = IMAGE_CHAR;
  const img = document.createElement('img');
  img.alt = '';
  img.src = url;
  img.addEventListener('error', () => box.classList.add('jc-img-missing'));
  const [top, bottom] = crop.split(',');
  if (crop === 'wide') box.classList.add('jc-img-scene');
  else if (top && bottom) {
    box.classList.add('jc-img-figure');
    box.style.setProperty('--crop-top', top);
    box.style.setProperty('--crop-bottom', bottom);
  }
  const noise = document.createElement('canvas');
  noise.className = 'jc-img-noise';
  box.append(ch, img, noise);
  return box;
}

/**
 * Swaps every token in `root`'s text for its image element, reusing the element an earlier draw made for the same
 * image (`cache`), so a decode under way carries on through a redraw.
 */
export function placeImageTokens(root: HTMLElement, cache: Map<string, HTMLElement>): void {
  const texts: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n as Text).data.includes(OPEN)) texts.push(n as Text);
  for (const t of texts) {
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of t.data.matchAll(TOKEN)) {
      if (m.index! > last) frag.append(t.data.slice(last, m.index));
      const key = `${m[2]}\n${m[1]}`;
      let el = cache.get(key);
      if (!el) {
        el = imageEl(m[1], m[2], m[3]);
        cache.set(key, el);
      }
      frag.append(el);
      last = m.index! + m[0].length;
    }
    if (last < t.data.length) frag.append(t.data.slice(last));
    t.replaceWith(frag);
  }
}

/** The noise over an image, in the column's decode colour, drawn whole. */
function paintNoise(c: HTMLCanvasElement, box: HTMLElement): CanvasRenderingContext2D | null {
  const ctx = c.getContext?.('2d') ?? null;
  if (!ctx) return null;
  const scene = box.classList.contains('jc-img-scene');
  c.width = box.clientWidth || (scene ? 400 : 80);
  c.height = box.clientHeight || (scene ? 150 : 108);
  const colour = getComputedStyle(box).getPropertyValue('--hf-c').trim() || '#ff4d4d';
  for (let y = 0; y < c.height; y += BLOCK)
    for (let x = 0; x < c.width; x += BLOCK) {
      ctx.globalAlpha = 0.25 + Math.random() * 0.75;
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, BLOCK - 1, BLOCK - 1);
    }
  ctx.globalAlpha = 1;
  return ctx;
}

/** Fills an image's noise in, ready for the typing to reach it (decode effect). */
export function primeImage(box: HTMLElement): void {
  const c = box.querySelector<HTMLCanvasElement>('canvas.jc-img-noise');
  if (c && !box.dataset.primed) {
    box.dataset.primed = '1';
    paintNoise(c, box);
  }
}

/** The noise clears into the picture block by block, in a scattered order, over `ms` (0: at once). */
export function decodeImage(box: HTMLElement, ms: number): void {
  const c = box.querySelector<HTMLCanvasElement>('canvas.jc-img-noise');
  if (!c) return;
  const ctx = ms > 0 ? (c.getContext?.('2d') ?? null) : null;
  if (!ctx) {
    c.remove();
    box.classList.remove('decoding');
    return;
  }
  if (!box.dataset.primed) primeImage(box);
  box.classList.add('decoding');
  const cells: [number, number][] = [];
  for (let y = 0; y < c.height; y += BLOCK) for (let x = 0; x < c.width; x += BLOCK) cells.push([x, y]);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const start = performance.now();
  let cleared = 0;
  const frame = (now: number) => {
    if (!c.isConnected && !box.isConnected) return;
    const due = Math.min(cells.length, Math.ceil(((now - start) / ms) * cells.length));
    for (; cleared < due; cleared++) ctx.clearRect(cells[cleared][0], cells[cleared][1], BLOCK, BLOCK);
    if (cleared < cells.length) requestAnimationFrame(frame);
    else {
      c.remove();
      box.classList.remove('decoding');
    }
  };
  requestAnimationFrame(frame);
}
