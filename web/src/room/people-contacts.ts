/**
 * PEOPLE's body (2026-10-18 spec §2; trace panel 2026-11-15, mockup people-trace.html): the contacts you know in this
 * playthrough as a list on the panel's rail (face, name in their accent, their standing word, `● HERE` on the one
 * you're with, an amber NEW on unread texts; the ones only heard of under HEARD OF), and what the pick opens on the
 * right, in their colour. FILE: name, standing, where they are and their last line, their file (the select screen's
 * bio and facts, spec 2026-10-28 §4), the leads that point to them and their last text; their whole figure stands at
 * the right with the wardrobe under it (‹ › pick what they wear everywhere, AUTO lets the room dress them); GO (or
 * Enter) goes to them. TEXTS: their thread (people-texts.ts). JOURNAL: their page on you and their notes, so only the
 * one you're with has it.
 */
import type { ContactEntry, DeckThread, LeadView } from '../../../shared/types';
import { hhmmOf, minuteOfDay, weekdayOf, weekdayShort } from '../../../shared/clock';
import { stepOutfit } from './character-sheet';
import { setTip } from '../ui/hover-tag';
import { openFigureAdjust, type FigureAdjust, type FigureFit } from './figure-adjust';

/** The right side's three pages. */
export type PeoplePage = 'file' | 'texts' | 'journal';
/**
 * The body: it takes the screen's ↑ / ↓ / Enter (true: handled) and turns its right side's page. `picked`: who the
 * list is on; `select`: puts it on someone; `refresh`: the unread tags and the open page drawn again (a text landed,
 * the deck's threads came in). None of them without a roster.
 */
export type KeyedTab = HTMLElement & {
  handleKey?(e: KeyboardEvent): boolean;
  /** Esc: something of the body's own closed first (ADJUST FIGURE); false leaves it to the screen. */
  escape?(): boolean;
  page?(p: PeoplePage): void;
  picked?(): ContactEntry;
  select?(id: string): boolean;
  refresh?(): void;
};

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

/** RECOMMENDED's tag (Kroll's desk spec): `RECOMMENDED`, or `RECOMMENDED · FROM 09:00` (`FROM MON 09:00` past a day) while she's away from her place. */
export function recommendedTag(r: NonNullable<ContactEntry['recommended']>): string {
  return r.from ? `RECOMMENDED · FROM ${r.from.toUpperCase()}` : 'RECOMMENDED';
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

/** Their face (or initial), in the list's outlined tile. */
function face(c: ContactEntry): HTMLElement {
  const box = el('span', 'pe-face tp-face');
  const initial = () => el('span', 'pe-mono', c.name.charAt(0).toUpperCase());
  if (!c.portrait) {
    box.append(initial());
    return box;
  }
  const img = el('img', '');
  img.alt = '';
  img.src = c.portrait;
  img.addEventListener('error', () => img.replaceWith(initial()), { once: true });
  box.append(img);
  return box;
}

/** HER / HIM / THEM for a head, from the pronoun their texts carry; THEM when it isn't known. */
const OBJECT: Record<string, string> = { she: 'HER', he: 'HIM', they: 'THEM' };

export function contactsTab(
  all: ContactEntry[],
  leads: LeadView[],
  o: {
    current: string;
    dev: boolean;
    pick(id: string): void;
    /** Who the list opens on (a text's sender); else the one you're with. */
    start?: string | null;
    /** What JOURNAL shows. */
    journal?: HTMLElement;
    /** What TEXTS shows for the pick: their thread, or the line saying they have no number. */
    texts?(c: ContactEntry): HTMLElement;
    /** Who has texted you unseen. */
    unread?(): ReadonlySet<string>;
    /** Their newest text, and their pronoun, once the deck's threads are in. */
    thread?(id: string): Pick<DeckThread, 'last' | 'pronoun'> | null;
    /** A contact was selected; `here`: she's the one you're with. */
    onSelect?(here: boolean, c: ContactEntry): void;
    /** Her outfit was picked (null: AUTO); a rejection puts the last pick back. */
    onOutfit?(id: string, outfit: string | null): Promise<void> | void;
    /** ADJUST FIGURE under the wardrobe (dev checkouts only, figure-adjust.ts). */
    figureEdits?: boolean;
    /** Her waist and portrait centre were saved into her character.json. */
    onFit?(id: string, fit: FigureFit): void;
  },
): KeyedTab {
  const root: KeyedTab = el('div', 'pe-contacts');
  if (!all.length) {
    root.append(el('div', 'pe-empty', 'Nobody yet.'));
    return root;
  }
  // The ones only heard of stand last, under their own head.
  // (Not the one you're with, however you came to know them.)
  const onlyHeard = (c: ContactEntry) => c.status === 'shared' && c.id !== o.current;
  const list = [...all.filter((c) => !onlyHeard(c)), ...all.filter(onlyHeard)];
  const heard = list.filter(onlyHeard).length;
  const roster = el('div', 'pe-roster tp-list');
  const right = el('div', 'pe-right');
  let page: PeoplePage = 'file';
  const first = o.start ? list.findIndex((c) => c.id === o.start) : -1;
  let at = first >= 0 ? first : Math.max(0, list.findIndex((c) => c.id === o.current));

  const tiles = list.map((c, i) => {
    const t = el('button', `pe-tile tp-row${onlyHeard(c) ? ' pe-heard' : ''}`);
    t.type = 'button';
    t.dataset.id = c.id;
    t.style.setProperty('--c', c.accent);
    const text = el('span', 'pe-tile-text');
    text.append(el('b', 'pe-tile-name', c.name.toUpperCase()));
    if (c.standing) text.append(el('span', 'pe-tile-standing', c.standing.word));
    if (c.id === o.current) text.append(el('span', 'pe-here', '● HERE'));
    else text.append(el('span', 'pe-tile-where', onlyHeard(c) ? `HEARD FROM ${(c.sharedBy ?? 'someone').toUpperCase()}` : c.placeName));
    t.append(face(c), text);
    t.addEventListener('click', () => {
      if (i !== at) select(i);
    });
    // Focus onto a row selects it, so Enter (or GO) goes where the file shows.
    t.addEventListener('focus', () => {
      if (i !== at) select(i);
    });
    return t;
  });
  for (const [i, t] of tiles.entries()) {
    if (heard > 0 && i === list.length - heard) {
      const h = el('div', 'pe-grp tp-head quiet', 'HEARD OF');
      h.append(el('small', '', String(heard)));
      roster.append(h);
    }
    roster.append(t);
  }
  /** The amber NEW on whoever has texted unseen. */
  function tags(): void {
    const unread = o.unread?.() ?? new Set<string>();
    for (const [i, t] of tiles.entries()) {
      const name = t.querySelector('.pe-tile-name')!;
      const had = name.querySelector('.pe-new');
      const has = unread.has(list[i].id);
      if (has && !had) name.append(el('span', 'pe-new tp-tag', 'NEW'));
      else if (!has) had?.remove();
    }
  }

  /** Her figure and wardrobe, standing at the right of her file. */
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
    if (options.length < 2) return withAdjust(fig, c, pic, img, null);
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
    return withAdjust(fig, c, pic, img, wardrobe);
  }

  /** The editor open on the file shown (null: none); a new file or page drops it unsaved. */
  let adjust: FigureAdjust | null = null;

  /** ADJUST FIGURE under her wardrobe, when this checkout may write her file and she has a figure of her own. */
  function withAdjust(fig: HTMLElement, c: ContactEntry, pic: HTMLElement, img: HTMLImageElement, wardrobe: HTMLElement | null): HTMLElement {
    adjust = null;
    if (!o.figureEdits || !c.portrait) return fig;
    // Its own strip, just above her figure's top right: the foot's row is the wardrobe's, YOU'RE HERE's and GO's.
    const open = el('button', 'pe-adjust', 'ADJUST FIGURE');
    open.type = 'button';
    const bar = el('div', 'fa-bar');
    bar.hidden = true;
    open.addEventListener('click', () => {
      if (adjust) return;
      open.hidden = true;
      if (wardrobe) wardrobe.hidden = true;
      adjust = openFigureAdjust({
        id: c.id,
        pic,
        img,
        bar,
        refit: () => {
          if (!img.classList.contains('pe-flat')) fitFigure(img, pic);
        },
        done: (saved) => {
          adjust = null;
          open.hidden = false;
          if (wardrobe) wardrobe.hidden = false;
          if (!saved) return;
          // Her tiles are cut again by the server: the roster's own face fetched anew.
          const tileImg = tiles[list.indexOf(c)]?.querySelector<HTMLImageElement>('.pe-face img');
          if (tileImg && c.portrait) tileImg.src = `${c.portrait}${c.portrait.includes('?') ? '&' : '?'}v=${Date.now()}`;
          o.onFit?.(c.id, saved);
        },
      });
    });
    fig.append(bar, open);
    return fig;
  }

  /** The name and the line under it: what every page opens with, and where the pick's leader lands. */
  function top(c: ContactEntry, withLine: boolean): HTMLElement[] {
    const out: HTMLElement[] = [el('h2', 'pe-name tp-name', c.name.toUpperCase())];
    if (!withLine) return out;
    const line = el('div', 'pe-line tp-role');
    if (c.standing) line.append(el('b', '', c.standing.word), ' · ');
    line.append(c.id === o.current ? el('span', 'pe-here', '● HERE') : c.placeName);
    out.push(line);
    return out;
  }

  function fileView(c: ContactEntry): HTMLElement {
    const file = el('div', 'pe-file tp-file');
    const info = el('div', 'pe-info');
    info.append(...top(c, false));
    if (c.standing) {
      const word = el('div', 'pe-standing', c.standing.word);
      if (o.dev) setTip(word, standingHover(c.standing));
      info.append(word);
    }
    // Her deal (arrangement spec 2026-10-20 §3): her terms while it's in force, else that she's stepped back.
    if (c.arrangement) info.append(el('div', 'pe-arrangement', c.arrangement.active ? `YOUR OPERATOR · ${c.arrangement.cut}% A JOB · ${['ONE JOB', 'TWO JOBS', 'THREE JOBS'][c.arrangement.nights - 1]} A NIGHT` : 'STEPPED BACK'));
    info.append(el('div', 'pe-where', lineFor(c)));
    const body = el('div', 'pe-body');
    // Her file (spec 2026-10-28 §4): the select screen's bio and facts, for anyone listed, heard-of ones too.
    const bio = c.bio ?? [];
    const facts = c.facts ?? [];
    if (bio.length || facts.length) body.append(el('div', 'pe-sub tp-head', 'FILE'));
    if (bio.length) {
      const b = el('div', 'pe-bio tp-prose');
      b.append(...bio.map((para) => el('p', '', para)));
      body.append(b);
    }
    if (facts.length) {
      const dl = el('dl', 'pe-facts tp-rows');
      for (const f of facts) dl.append(el('dt', '', f.label), el('dd', '', f.value));
      body.append(dl);
    }
    const thread = o.thread?.(c.id) ?? null;
    const hers = leads.filter((l) => l.to === c.id);
    if (hers.length) {
      body.append(el('div', 'pe-sub tp-head', `LEADS TO ${OBJECT[thread?.pronoun ?? ''] ?? 'THEM'}`));
      const ul = el('ul', 'pe-leads');
      for (const l of hers) {
        const li = el('li', l.followed ? 'followed' : '');
        li.append(el('span', '', l.title));
        if (l.followed) li.append(el('span', 'pe-lead-end', 'FOLLOWED'));
        ul.append(li);
      }
      body.append(ul);
    }
    const last = el('div', 'pe-lastbox');
    lastText(c, last);
    body.append(last);
    const foot = el('div', 'pe-foot');
    const go = el('button', 'pe-go tp-key go', 'GO');
    go.type = 'button';
    if (c.id === o.current) {
      go.disabled = true;
      setTip(go, "you're here");
      foot.append(el('span', 'pe-why', "YOU'RE HERE"));
    } else {
      go.textContent = `GO TO ${c.name.toUpperCase()}`;
      go.addEventListener('click', () => o.pick(c.id));
    }
    foot.append(go);
    const side = el('div', 'pe-side');
    side.append(info, body);
    file.append(side, figure(c), foot);
    return file;
  }

  /** LAST TEXT, in its own box at the foot of the file: a text landing redraws only this (not the scroll, the figure or the wardrobe). */
  function lastText(c: ContactEntry, box: HTMLElement): void {
    const last = o.thread?.(c.id)?.last ?? null;
    if (!last) return box.replaceChildren();
    const unread = o.unread?.().has(c.id) ?? false;
    const row = el('div', 'pe-last');
    row.append(el('span', 'pe-last-at', `${weekdayShort(weekdayOf(last.clock)).toUpperCase()} ${hhmmOf(minuteOfDay(last.clock))}`), el('span', 'pe-last-text', last.text), el('span', `pe-last-end${unread ? ' new' : ''}`, unread ? 'NEW' : last.mine ? 'YOURS' : ''));
    box.replaceChildren(el('div', 'pe-sub tp-head', 'LAST TEXT'), row);
  }

  /** The right side for the open page, in the pick's colour. */
  function draw(): void {
    adjust?.cancel();
    const c = list[at];
    right.style.setProperty('--c', c.accent);
    right.dataset.page = page;
    if (page === 'file') return right.replaceChildren(fileView(c));
    const wrap = el('div', `pe-${page === 'texts' ? 'thread' : 'journal'} tp-file`);
    wrap.append(...top(c, true));
    const inner = page === 'texts' ? o.texts?.(c) : o.journal;
    if (inner) wrap.append(inner);
    right.replaceChildren(wrap);
  }

  function select(i: number): void {
    const to = Math.min(list.length - 1, Math.max(0, i));
    const moved = to !== at;
    at = to;
    tiles.forEach((t, j) => t.classList.toggle('on', j === at));
    // In a stranger's room the one you're with isn't listed: JOURNAL stays theirs whoever is picked.
    const here = list[at].id === o.current || !list.some((c) => c.id === o.current);
    // Another's journal isn't yours to read: their file comes up (the screen's tab follows, from onSelect).
    if (moved && page === 'journal' && !here) page = 'file';
    draw();
    o.onSelect?.(here, list[at]);
  }

  root.page = (p) => {
    page = p;
    // JOURNAL is the one you're with: asked for by key from another's file, she comes up.
    const here = list.findIndex((c) => c.id === o.current);
    if (p === 'journal' && here >= 0 && here !== at) return select(here);
    draw();
  };
  root.picked = () => list[at];
  root.select = (id) => {
    const i = list.findIndex((c) => c.id === id);
    if (i < 0) return false;
    if (i !== at) select(i);
    return true;
  };
  root.refresh = () => {
    tags();
    // The file's LAST TEXT follows, and nothing else of it; a thread or a journal on screen is left alone.
    const box = page === 'file' ? right.querySelector<HTMLElement>('.pe-lastbox') : null;
    if (box) lastText(list[at], box);
  };

  root.escape = () => {
    if (!adjust) return false;
    adjust.cancel();
    return true;
  };
  root.handleKey = (e) => {
    if (adjust?.key(e)) return true;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      select(at + (e.key === 'ArrowUp' ? -1 : 1));
      tiles[at].scrollIntoView?.({ block: 'nearest' });
      return true;
    }
    if (e.key === 'Enter') {
      if (page === 'file' && list[at].id !== o.current) o.pick(list[at].id);
      return true;
    }
    return false;
  };

  root.append(roster, right);
  tags();
  select(at);
  return root;
}
