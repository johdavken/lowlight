/**
 * PEOPLE's body (2026-10-18 spec §2; panel 2026-11-04): a roster of the contacts you know in this playthrough on the
 * left (face, name in her accent, her standing word, `● HERE` on the one you're with), and the selected one on the
 * right. FILE: her whole figure down the left with her wardrobe under it (‹ › pick what she wears everywhere, AUTO lets
 * her room dress her), then standing, where she is and her last line, her file (the select screen's bio and facts, spec
 * 2026-10-28 §4), and the leads that point to her; GO (or Enter) goes to her. JOURNAL: her page on you and her notes,
 * so only the one you're with has it.
 */
import type { ContactEntry, LeadView } from '../../../shared/types';
import { stepOutfit } from './character-sheet';

/** The right side's two pages. */
export type PeoplePage = 'file' | 'journal';
/** The body: it takes the screen's ↑ / ↓ / Enter (true: handled) and turns its right side's page. Neither without a roster. */
export type KeyedTab = HTMLElement & { handleKey?(e: KeyboardEvent): boolean; page?(p: PeoplePage): void };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
}

/** "<place> · "<line>"", the speaker named when it isn't her; "<place> · heard from <Name>" before you've met. */
export function lineFor(c: ContactEntry): string {
  // Her plan's tail follows her place (her plans spec §7): where she is, then where she'll be.
  const where = c.planTail ? `${c.placeName} · ${c.planTail}` : c.placeName;
  if (c.status === 'shared') return `${where} · heard from ${c.sharedBy ?? 'someone'}`;
  if (!c.lastLine) return c.status === 'knows' ? `${where} · from before` : where;
  const who = c.lastLine.speaker === c.name ? '' : `${c.lastLine.speaker}: `;
  return `${where} · ${who}"${c.lastLine.text}"`;
}

/** `T+3 W−1 · last: "paid on time"`: the dev panel's look at her values (a real minus sign; — with no moves). */
export function standingHover(s: NonNullable<ContactEntry['standing']>): string {
  const n = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');
  return `T${n(s.trust)} W${n(s.warmth)} · last: ${s.last === null ? '—' : `"${s.last}"`}`;
}

/** What PEOPLE's wardrobe steps through: AUTO (null, her room dresses her), then her outfits; none without outfits. */
export function contactWardrobe(c: Pick<ContactEntry, 'outfits'>): (string | null)[] {
  return c.outfits?.length ? [null, ...c.outfits] : [];
}

/** The outfit her figure shows: the one picked, else her room's, else null (her plain sprite). */
export function shownOutfit(c: Pick<ContactEntry, 'sceneOutfit'>, pick: string | null): string | null {
  return pick ?? c.sceneOutfit ?? null;
}

/** Where the figure sits across a sprite's frame (fractions of its width), by its pixels; null when unreadable. */
const spans = new Map<string, { w: number; cx: number } | null>();
function figureSpan(img: HTMLImageElement): { w: number; cx: number } | null {
  const key = img.currentSrc || img.src;
  if (spans.has(key)) return spans.get(key)!;
  let span: { w: number; cx: number } | null = null;
  try {
    const W = 64;
    const H = Math.max(1, Math.round((W * img.naturalHeight) / img.naturalWidth));
    const ctx = Object.assign(document.createElement('canvas'), { width: W, height: H }).getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, W, H);
      const a = ctx.getImageData(0, 0, W, H).data;
      let lo = W;
      let hi = -1;
      for (let x = 0; x < W; x++)
        for (let y = 0; y < H; y++)
          if (a[(y * W + x) * 4 + 3] > 8) {
            lo = Math.min(lo, x);
            hi = Math.max(hi, x);
            break;
          }
      if (hi >= lo) span = { w: (hi - lo + 1) / W, cx: (lo + hi + 1) / 2 / W };
    }
  } catch {
    span = null;
  }
  spans.set(key, span);
  return span;
}

/** Her figure as tall as the column lets it stand without losing her sides, centred on her, not on the frame. */
function fitFigure(img: HTMLImageElement, pic: HTMLElement): void {
  const W = pic.clientWidth;
  const H = pic.clientHeight;
  const span = W && H && img.naturalWidth ? figureSpan(img) : null;
  if (!span) return;
  const aspect = img.naturalWidth / img.naturalHeight;
  const h = Math.min(H, W / (aspect * span.w));
  img.style.height = `${h}px`;
  img.style.left = `${W / 2 - span.cx * h * aspect}px`;
  img.style.transform = 'none';
}

/** Her face (or initial): a small round picture for the roster. */
function face(c: ContactEntry, cls: string): HTMLElement {
  const initial = () => el('span', `${cls} pe-mono`, c.name.charAt(0).toUpperCase());
  if (!c.portrait) return initial();
  const img = el('img', cls);
  img.alt = '';
  img.src = c.portrait;
  img.addEventListener('error', () => img.replaceWith(initial()), { once: true });
  return img;
}

export function contactsTab(
  list: ContactEntry[],
  leads: LeadView[],
  o: {
    current: string;
    dev: boolean;
    pick(id: string): void;
    /** What JOURNAL shows. */
    journal?: HTMLElement;
    /** A contact was selected; `here`: she's the one you're with. */
    onSelect?(here: boolean): void;
    /** Her outfit was picked (null: AUTO); a rejection puts the last pick back. */
    onOutfit?(id: string, outfit: string | null): Promise<void> | void;
  },
): KeyedTab {
  const root: KeyedTab = el('div', 'pe-contacts');
  if (!list.length) {
    root.append(el('div', 'pe-empty', 'Nobody yet.'));
    return root;
  }
  const roster = el('div', 'pe-roster');
  const file = el('div', 'pe-file');
  const right = el('div', 'pe-right');
  right.append(file);
  let at = Math.max(0, list.findIndex((c) => c.id === o.current));

  const tiles = list.map((c, i) => {
    const t = el('button', 'pe-tile');
    t.type = 'button';
    t.dataset.id = c.id;
    t.style.setProperty('--c', c.accent);
    const text = el('span', 'pe-tile-text');
    text.append(el('b', 'pe-tile-name', c.name.toUpperCase()));
    if (c.standing) text.append(el('span', 'pe-tile-standing', c.standing.word));
    if (c.id === o.current) text.append(el('span', 'pe-here', '● HERE'));
    const inner = el('span', 'pe-tile-in');
    inner.append(face(c, 'pe-face'), text);
    t.append(inner);
    t.addEventListener('click', () => select(i));
    // Tab onto a tile selects it, so Enter (or GO) goes where the file shows.
    t.addEventListener('focus', () => select(i));
    return t;
  });
  roster.append(...tiles);

  /** Her figure and wardrobe, down the left of her file. */
  function figure(c: ContactEntry): HTMLElement {
    const fig = el('div', 'pe-fig');
    const pic = el('div', 'pe-pic');
    const id = encodeURIComponent(c.id);
    const sprite = `/api/agents/${id}/sprite`;
    const urlOf = (o: string | null) => (o === null ? sprite : `/api/agents/${id}/outfit/${encodeURIComponent(o)}`);
    let pick: string | null = c.outfit ?? null;
    // Her whole sprite (in what she has on), then her plain sprite, then her portrait, then her initial.
    const mono = () => el('div', 'pe-mono pe-big', c.name.charAt(0).toUpperCase());
    const img = el('img', 'pe-figure');
    img.alt = c.name;
    img.src = urlOf(shownOutfit(c, pick));
    img.addEventListener('error', () => {
      const at = img.getAttribute('src');
      if (at !== sprite && !img.classList.contains('pe-flat')) img.src = sprite;
      else if (c.portrait && at !== c.portrait) {
        img.removeAttribute('style');
        img.src = c.portrait;
        img.classList.add('pe-flat');
      } else img.replaceWith(mono());
    });
    // Each picture (an outfit stepped to, a fallback) is fitted once it's in.
    img.addEventListener('load', () => {
      if (!img.classList.contains('pe-flat')) fitFigure(img, pic);
    });
    pic.append(img);
    fig.append(pic);
    const options = contactWardrobe(c);
    if (options.length < 2) return fig;
    // The wardrobe: ‹ › step AUTO → each outfit; the pick is kept in the playthrough and worn everywhere.
    const wardrobe = el('div', 'pe-wardrobe');
    const row = el('div', 'pe-ward-row');
    const label = el('span', 'pe-outfit');
    const sub = el('div', 'pe-ward-sub');
    const show = () => {
      label.textContent = pick === null ? 'AUTO' : pick.toUpperCase();
      sub.textContent = `${pick === null ? 'THE ROOM PICKS' : 'WORN EVERYWHERE'} · ${options.indexOf(pick) + 1}/${options.length}`;
      if (!img.classList.contains('pe-flat')) img.src = urlOf(shownOutfit(c, pick));
    };
    const step = (dir: -1 | 1) => {
      const was = pick;
      pick = stepOutfit(options, pick, dir);
      c.outfit = pick ?? undefined;
      show();
      const now = pick;
      void Promise.resolve(o.onOutfit?.(c.id, now)).catch(() => {
        // Not saved: back to what she had on, unless it's been stepped on since.
        if (pick !== now) return;
        pick = was;
        c.outfit = was ?? undefined;
        show();
      });
    };
    const arrow = (text: string, dir: -1 | 1) => {
      const b = el('button', 'pe-arrow', text);
      b.type = 'button';
      b.setAttribute('aria-label', dir < 0 ? 'Previous outfit' : 'Next outfit');
      b.addEventListener('click', () => step(dir));
      return b;
    };
    row.append(arrow('‹', -1), label, arrow('›', 1));
    wardrobe.append(row, sub);
    show();
    fig.append(wardrobe);
    return fig;
  }

  function drawFile(c: ContactEntry): void {
    file.style.setProperty('--c', c.accent);
    const fig = figure(c);
    const info = el('div', 'pe-info');
    info.append(el('div', 'pe-name', c.name.toUpperCase()));
    if (c.standing) {
      const word = el('div', 'pe-standing', c.standing.word);
      if (o.dev) word.title = standingHover(c.standing);
      info.append(word);
    }
    // Her deal (arrangement spec 2026-10-20 §3): her terms while it's in force, else that she's stepped back.
    if (c.arrangement) info.append(el('div', 'pe-arrangement', c.arrangement.active ? `YOUR OPERATOR · ${c.arrangement.cut}% A JOB · ${['ONE JOB', 'TWO JOBS', 'THREE JOBS'][c.arrangement.nights - 1]} A NIGHT` : 'STEPPED BACK'));
    info.append(el('div', 'pe-where', lineFor(c)));
    const body = el('div', 'pe-body');
    // Her file (spec 2026-10-28 §4): the select screen's bio and facts, for anyone listed, heard-of ones too.
    const bio = c.bio ?? [];
    const facts = c.facts ?? [];
    if (bio.length || facts.length) body.append(el('div', 'pe-sub', 'FILE'));
    if (bio.length) {
      const b = el('div', 'pe-bio');
      b.append(...bio.map((para) => el('p', '', para)));
      body.append(b);
    }
    if (facts.length) {
      const dl = el('dl', 'pe-facts');
      for (const f of facts) dl.append(el('dt', '', f.label), el('dd', '', f.value));
      body.append(dl);
    }
    const hers = leads.filter((l) => l.to === c.id);
    if (hers.length) {
      body.append(el('div', 'pe-sub', 'LEADS TO HER'));
      const ul = el('ul', 'pe-leads');
      for (const l of hers) ul.append(el('li', l.followed ? 'followed' : '', l.title));
      body.append(ul);
    }
    const go = el('button', 'pe-go', 'GO');
    go.type = 'button';
    if (c.id === o.current) {
      go.disabled = true;
      go.title = "you're here";
    } else go.addEventListener('click', () => o.pick(c.id));
    const foot = el('div', 'pe-foot');
    foot.append(go);
    const side = el('div', 'pe-side');
    side.append(info, body, foot);
    file.replaceChildren(fig, side);
  }

  function select(i: number): void {
    at = Math.min(list.length - 1, Math.max(0, i));
    tiles.forEach((t, j) => t.classList.toggle('on', j === at));
    drawFile(list[at]);
    // In a stranger's room the one you're with isn't listed: JOURNAL stays theirs whoever is picked.
    o.onSelect?.(list[at].id === o.current || !list.some((c) => c.id === o.current));
  }

  root.page = (p) => {
    // JOURNAL is the one you're with: asked for by key from another's file, she comes up.
    const here = list.findIndex((c) => c.id === o.current);
    if (p === 'journal' && here >= 0 && here !== at) select(here);
    right.replaceChildren(p === 'journal' && o.journal ? o.journal : file);
  };

  root.handleKey = (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      select(at + (e.key === 'ArrowUp' ? -1 : 1));
      return true;
    }
    if (e.key === 'Enter') {
      if (list[at].id !== o.current) o.pick(list[at].id);
      return true;
    }
    return false;
  };

  root.append(roster, right);
  select(at);
  return root;
}
