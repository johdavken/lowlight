/**
 * ADJUST FIGURE on PEOPLE (dev checkouts only, server figure-fit.ts): over her plain sprite, a green dotted waist
 * line to drag to her belt or waistband (where she stands on the stage's line) and the portrait frame to drag over
 * her face (the tile every portrait of her is cut from), with the tile as the game will cut it. SAVE writes both
 * into her character.json; ↑ / ↓ nudge the waist, Enter saves, Esc cancels.
 */
import { figureCrop } from '../../../shared/figure-crop';
import { WAIST_MAX, WAIST_MIN } from '../../../shared/waist';
import { WAIST_LINE } from '../ui/figure';

export interface FigureFit {
  waist: number;
  face: { x: number; y: number };
}

export interface FigureAdjust {
  /** ↑ / ↓ / Enter while it's open (true: taken). */
  key(e: KeyboardEvent): boolean;
  /** Closes it unsaved. */
  cancel(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** A waist the editor opens on when she has none yet: the stage's own line, so she stands as drawn until moved. */
const NO_WAIST = WAIST_LINE;
const NUDGE = 0.002;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
}

export async function loadFit(id: string): Promise<{ waist: number | null; face: { x: number; y: number }; sprite: string; own: boolean }> {
  const r = await fetch(`/api/agents/${encodeURIComponent(id)}/figure`);
  if (!r.ok) throw new Error(`figure ${r.status}`);
  return r.json();
}

async function saveFit(id: string, fit: FigureFit): Promise<FigureFit> {
  const r = await fetch(`/api/agents/${encodeURIComponent(id)}/figure`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fit) });
  const body = (await r.json().catch(() => ({}))) as FigureFit & { error?: string };
  if (!r.ok) throw new Error(body.error ?? `save failed (${r.status})`);
  return body;
}

/**
 * Opens the editor on `img` (her figure in `pic`, fitted by PEOPLE) with `bar` as its controls. `refit` fits the
 * figure again after its picture changes; `done` hears how it ended (the fit saved, or null).
 */
export function openFigureAdjust(o: {
  id: string;
  pic: HTMLElement;
  img: HTMLImageElement;
  bar: HTMLElement;
  refit(): void;
  done(saved: FigureFit | null): void;
}): FigureAdjust {
  const { pic, img, bar } = o;
  const wasSrc = img.getAttribute('src');
  let start: FigureFit | null = null;
  let fit: FigureFit | null = null;
  let closed = false;
  let saving = false;

  const layer = el('div', 'fa-layer');
  const frame = el('div', 'fa-frame');
  frame.title = 'Portrait: drag over her face';
  frame.append(el('span', 'fa-tag', 'PORTRAIT'));
  const waist = el('div', 'fa-waist');
  waist.title = 'Waist: drag to her belt or waistband';
  const handle = el('span', 'fa-handle');
  handle.append(el('span', 'fa-tag', 'WAIST'));
  waist.append(handle);
  layer.append(frame, waist);

  const tile = el('div', 'fa-tile');
  const read = el('span', 'fa-read');
  const status = el('span', 'fa-status');
  const button = (text: string, cls: string, fn: () => void) => {
    const b = el('button', `fa-btn ${cls}`, text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  };
  const save = button('SAVE', 'fa-save', () => void doSave());
  const reset = button('RESET', '', () => {
    if (!start) return;
    fit = { waist: start.waist, face: { ...start.face } };
    draw();
  });
  const cancelBtn = button('CANCEL', '', () => close(null));
  const info = el('div', 'fa-info');
  info.append(read, status);
  bar.replaceChildren(tile, info, el('div', 'fa-btns'));
  bar.lastElementChild!.append(reset, cancelBtn, save);
  bar.hidden = false;
  pic.classList.add('fa-on');
  status.textContent = 'LOADING…';

  /** The crop as shares of her picture, for her face. */
  const crop = () => figureCrop(fit!.face, img.naturalWidth || undefined, img.naturalHeight || undefined);

  /** The layer over the picture as it's drawn, the frame, line and tile where the fit puts them. */
  function draw(): void {
    if (!fit || closed) return;
    layer.style.left = `${img.offsetLeft}px`;
    layer.style.top = `${img.offsetTop}px`;
    layer.style.width = `${img.offsetWidth}px`;
    layer.style.height = `${img.offsetHeight}px`;
    const c = crop();
    Object.assign(frame.style, { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` });
    waist.style.top = `${fit.waist * 100}%`;
    tile.style.backgroundImage = `url("${img.currentSrc || img.src}")`;
    tile.style.backgroundSize = `${100 / c.w}% auto`;
    tile.style.backgroundPosition = `${c.w < 1 ? (c.x / (1 - c.w)) * 100 : 0}% ${c.h < 1 ? (c.y / (1 - c.h)) * 100 : 0}%`;
    read.textContent = `WAIST ${fit.waist.toFixed(3)} · FACE ${fit.face.x.toFixed(3)}, ${fit.face.y.toFixed(3)}`;
    const changed = !!start && (fit.waist !== start.waist || fit.face.x !== start.face.x || fit.face.y !== start.face.y);
    save.disabled = saving || !changed;
    reset.disabled = saving || !changed;
  }

  /** A pointer's place as shares of her picture. */
  const at = (e: PointerEvent) => {
    const r = layer.getBoundingClientRect();
    return { x: (e.clientX - r.left) / (r.width || 1), y: (e.clientY - r.top) / (r.height || 1) };
  };
  function drag(target: HTMLElement, move: (p: { x: number; y: number }, from: { x: number; y: number }) => void): void {
    target.addEventListener('pointerdown', (e) => {
      if (!fit || saving) return;
      e.preventDefault();
      e.stopPropagation();
      target.setPointerCapture?.(e.pointerId);
      const from = at(e);
      const snap = { waist: fit.waist, face: { ...fit.face } };
      const onMove = (m: PointerEvent) => {
        fit = { waist: snap.waist, face: { ...snap.face } };
        move(at(m), from);
        draw();
      };
      const onUp = () => {
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        target.removeEventListener('pointercancel', onUp);
      };
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
    });
  }
  drag(waist, (p) => {
    fit!.waist = r3(clamp(p.y, WAIST_MIN, WAIST_MAX));
  });
  drag(frame, (p, from) => {
    // The frame's centre is her face; kept where the whole frame fits on her picture.
    const c = crop();
    fit!.face = {
      x: r3(clamp(fit!.face.x + (p.x - from.x), c.w / 2, 1 - c.w / 2)),
      y: r3(clamp(fit!.face.y + (p.y - from.y), c.h / 2, 1 - c.h / 2)),
    };
  });

  const onLoad = () => {
    o.refit();
    draw();
  };
  img.addEventListener('load', onLoad);
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  resize?.observe(pic);

  async function doSave(): Promise<void> {
    if (!fit || saving || save.disabled) return;
    saving = true;
    status.textContent = 'SAVING…';
    draw();
    try {
      const kept = await saveFit(o.id, fit);
      if (!closed) close(kept);
    } catch (e) {
      saving = false;
      status.textContent = e instanceof Error ? e.message.toUpperCase() : 'NOT SAVED';
      draw();
    }
  }

  function close(saved: FigureFit | null): void {
    if (closed) return;
    closed = true;
    resize?.disconnect();
    img.removeEventListener('load', onLoad);
    layer.remove();
    pic.classList.remove('fa-on');
    bar.replaceChildren();
    bar.hidden = true;
    // Back to what she had on.
    if (wasSrc !== null && img.getAttribute('src') !== wasSrc) img.src = wasSrc;
    o.done(saved);
  }

  void loadFit(o.id).then(
    (f) => {
      if (closed) return;
      if (!f.own) {
        status.textContent = "HER FIGURE IS HER BASE CHARACTER'S: FIT IT THERE";
        return;
      }
      start = { waist: f.waist ?? NO_WAIST, face: { ...f.face } };
      fit = { waist: start.waist, face: { ...start.face } };
      status.textContent = f.waist === null ? 'NO WAIST SET YET' : '';
      pic.append(layer);
      // Her portraits are cut from her plain sprite, so that's what she's fitted on.
      if (img.getAttribute('src') !== f.sprite) img.src = f.sprite;
      else onLoad();
    },
    () => {
      if (!closed) status.textContent = "COULDN'T READ HER FIGURE";
    },
  );

  return {
    key(e) {
      if (e.key === 'Enter') {
        void doSave();
        return true;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (fit && !saving) {
          fit.waist = r3(clamp(fit.waist + (e.key === 'ArrowUp' ? -NUDGE : NUDGE), WAIST_MIN, WAIST_MAX));
          draw();
        }
        return true;
      }
      return false;
    },
    cancel: () => close(null),
  };
}
