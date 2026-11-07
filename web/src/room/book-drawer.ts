/**
 * The lore drawer (spec 2026-11-06): BOOK at the right of the room, with the scene still up. RIGHT NOW lists what
 * the conversation has touched, both files and the room's entries; ALL is the whole book, with search. It keeps
 * the cursor in the chat box, so a reply can go on being typed beside it: a click off closes it, as it does the other
 * panels, except on the chat itself. Text goes in through textContent.
 */
import './book-drawer.css';
import { bookNow, searchBook, type BookEntry, type BookHit, type BookNow, type BookPage, type LoreLine, type RecentLine } from '../../../shared/lore';
import type { ChatMessage, Fact } from '../../../shared/types';
import { onClickAway } from '../ui/click-away';
import { el } from './table/el';

export interface BookFile {
  id: string;
  name: string;
  tag: 'YOUR FILE' | 'THEIR FILE';
  bio: string[];
  facts: Fact[];
  /** What only you know, on your own file: a contact's is never sent. */
  secret?: string;
}
export interface BookContext {
  /** Newest first (bookLines), with who wrote each; a plain string is yours. */
  lines: RecentLine[];
  draft: string;
  sceneId: string | null;
  present: string[];
}
export interface BookDrawerOptions {
  /** Your file, the contact's and anyone else's here, fetched on open; a failed one is left out by the caller. */
  files(): Promise<BookFile[]>;
  /** The count for the bar; 0 shows no number. */
  onCount(n: number): void;
  onOpenChange(open: boolean): void;
  /** Where Esc from search sends the cursor. */
  chatBox(): HTMLElement | null;
  /** Something is over the drawer and owns the keys. */
  over(): boolean;
}
export interface BookDrawer {
  load(page: BookPage | null): void;
  update(c: BookContext): void;
  open(): void;
  close(): void;
  toggle(): void;
  readonly isOpen: boolean;
}

export const BOOK_COPY = {
  title: '◆ BOOK',
  esc: 'ESC',
  now: 'RIGHT NOW',
  all: 'ALL',
  said: 'JUST SAID',
  who: "WHO'S TALKING",
  here: 'WHERE YOU ARE',
  find: '⌕ SEARCH THE BOOK',
  failed: '// BOOK UNAVAILABLE',
  none: 'NOTHING IN THE BOOK',
  other: 'OTHER',
  secret: 'ONLY YOU KNOW',
} as const;

/** The lines the drawer reads, newest first: finished, with text, not out of character, not a promised text's hidden row. */
export function bookLines(messages: readonly ChatMessage[]): LoreLine[] {
  return messages
    .filter((m) => m.status === 'ok' && m.text !== '' && m.mode !== 'ooc' && !m.promised)
    .map((m): LoreLine => ({ text: m.text, by: m.role === 'user' ? 'you' : 'them' }))
    .reverse();
}

/** What the drawer is read beside: her lines, the box and the scene keys. A click there isn't a click off. */
const BESIDE = '#feed, #input';

const entrySub = (e: BookEntry, key?: string) => [(e.section ?? e.category)?.toUpperCase(), key ? `"${key}"` : null].filter(Boolean).join(' · ');

export function mountBookDrawer(host: HTMLElement, o: BookDrawerOptions): BookDrawer {
  const layer = el('div', 'lb-layer');
  const root = el('section', 'lb-root');
  root.hidden = true;
  root.setAttribute('aria-label', 'Book');
  const head = el('div', 'lb-head', BOOK_COPY.title);
  head.append(el('span', 'lb-esc', BOOK_COPY.esc));
  const tabs = el('div', 'lb-tabs');
  const tabButton = (t: 'now' | 'all') => {
    const b = el('button', 'lb-tab');
    b.type = 'button';
    b.dataset.tab = t;
    keepCursor(b);
    b.addEventListener('click', () => {
      tab = t;
      list.scrollTop = 0;
      draw();
    });
    tabs.append(b);
    return b;
  };
  /** A click here leaves the cursor where it is. */
  const keepCursor = (b: HTMLElement) => b.addEventListener('mousedown', (e) => e.preventDefault());
  const nowTab = tabButton('now');
  const allTab = tabButton('all');
  const find = el('input', 'lb-find');
  find.type = 'search';
  find.placeholder = BOOK_COPY.find;
  find.setAttribute('aria-label', 'Search the book');
  // Keys typed here are the field's, never the room's (Esc goes first, in the capture listener below).
  find.addEventListener('keydown', (e) => e.stopPropagation());
  find.addEventListener('input', () => {
    query = find.value;
    list.scrollTop = 0;
    drawList();
  });
  const note = el('div', 'lb-note', BOOK_COPY.failed);
  note.hidden = true;
  const list = el('div', 'lb-list');
  root.append(head, tabs, find, note, list);
  layer.append(root);
  host.append(layer);

  let page: BookPage | null = null;
  let failed = false;
  let ctx: BookContext = { lines: [], draft: '', sceneId: null, present: [] };
  let now: BookNow = { said: [], who: [], here: [], count: 0 };
  let files: BookFile[] = [];
  let tab: 'now' | 'all' = 'now';
  let query = '';
  let isOpen = false;
  /** The open row, by key (`e:<entry id>`, `f:<file id>`), and the last row Alt+arrows stood on. */
  let openRow: string | null = null;
  let cursor: string | null = null;
  /** The open row's hit, so it stays up after it stops matching. */
  let held: BookHit | null = null;
  const openCats = new Set<string>();
  /** Which fetch of the files is the latest. */
  let fileCall = 0;
  let offAway: (() => void) | null = null;

  /** What the list shows: an update that leaves this alone leaves the rows alone, and a click in progress with them. */
  const shown = () => [tab, openRow, ...now.said.map((h) => `${h.entry.id}:${h.key}`), '|', ...now.who.map((h) => h.entry.id), '|', ...now.here.map((e) => e.id)].join(' ');

  const compute = () => {
    const at = (ctx.sceneId !== null ? page?.rooms[ctx.sceneId] : undefined) ?? { placeId: null, districtId: null };
    now = bookNow(page?.entries ?? [], { lines: ctx.lines, draft: ctx.draft, present: ctx.present, ...at });
    o.onCount(now.count);
  };

  const row = (key: string, title: string, sub: string, body: () => HTMLElement): HTMLElement[] => {
    const b = el('button', 'lb-row');
    b.type = 'button';
    b.dataset.key = key;
    keepCursor(b);
    b.append(el('span', 'lb-row-title', title));
    if (sub) b.append(el('span', 'lb-row-sub', sub));
    const open = openRow === key;
    b.setAttribute('aria-expanded', String(open));
    b.classList.toggle('on', open);
    b.addEventListener('click', () => pick(key));
    return open ? [b, body()] : [b];
  };
  const entryBody = (e: BookEntry) => {
    const body = el('div', 'lb-body', e.body);
    // A corp's logo heads its entry, in the open row only: the list stays text (lore art, 2026-11-07).
    if (e.art) {
      const img = el('img', 'lb-art');
      img.src = `/api/lore/art/${encodeURIComponent(e.id)}`;
      img.alt = '';
      img.addEventListener('error', () => img.remove());
      // A seal or a stacked logo is near square: at a wide logo's height its small text can't be read.
      img.addEventListener('load', () => img.classList.toggle('lb-art-tall', img.naturalHeight > img.naturalWidth * 0.6));
      body.prepend(img);
    }
    return body;
  };
  const entryRow = (e: BookEntry, key?: string) => row(`e:${e.id}`, e.title, entrySub(e, key), () => entryBody(e));
  /** Inside a fold the fold's head already says what the row's sub would. */
  const foldedRow = (e: BookEntry) => row(`e:${e.id}`, e.title, '', () => entryBody(e));
  const fileRow = (f: BookFile) =>
    row(`f:${f.id}`, f.name, f.tag, () => {
      const body = el('div', 'lb-body');
      body.append(...f.bio.map((p) => el('p', '', p)));
      if (f.facts.length > 0) {
        const dl = el('dl', 'lb-facts');
        for (const fact of f.facts) dl.append(el('dt', '', fact.label), el('dd', '', fact.value));
        body.append(dl);
      }
      if (f.secret) body.append(el('div', 'lb-secret-head', BOOK_COPY.secret), el('p', 'lb-secret', f.secret));
      return body;
    });
  const group = (title: string, rows: HTMLElement[]) => (rows.length > 0 ? [el('div', 'lb-grp', title), ...rows] : []);

  const nowRows = (): HTMLElement[] => {
    const shown = new Set([...now.said, ...now.who].map((h) => h.entry.id).concat(now.here.map((e) => e.id)));
    const said = [...now.said];
    if (held && openRow === `e:${held.entry.id}` && !shown.has(held.entry.id)) said.push(held);
    return [
      ...group(BOOK_COPY.said, said.flatMap((h) => entryRow(h.entry, h.key))),
      ...group(BOOK_COPY.who, [...files.flatMap(fileRow), ...now.who.flatMap((h) => entryRow(h.entry, h.key))]),
      ...group(BOOK_COPY.here, now.here.flatMap((e) => entryRow(e))),
    ];
  };
  const allRows = (): HTMLElement[] => {
    const entries = page?.entries ?? [];
    if (query.trim() !== '') return searchBook(entries, query).flatMap((e) => entryRow(e));
    const cats = new Map<string, BookEntry[]>();
    for (const e of entries) {
      const name = e.category?.toUpperCase() ?? BOOK_COPY.other;
      cats.set(name, [...(cats.get(name) ?? []), e]);
    }
    const titled = (es: BookEntry[]) => [...es].sort((x, y) => x.title.localeCompare(y.title)).flatMap(foldedRow);
    /** A fold's head, with what's under it when it's open. `id` is `<category>` or `<category>/<section>`. */
    const fold = (id: string, label: string, n: number, cls: string, under: () => HTMLElement[]) => {
      const b = el('button', cls, `${label} ${n}`);
      b.type = 'button';
      b.dataset.key = `c:${id}`;
      keepCursor(b);
      const open = openCats.has(id);
      b.setAttribute('aria-expanded', String(open));
      b.addEventListener('click', () => {
        if (!openCats.delete(id)) openCats.add(id);
        drawList();
      });
      return [b, ...(open ? under() : [])];
    };
    return [...cats.keys()].sort().flatMap((name) => {
      const inCat = cats.get(name)!;
      return fold(name, name, inCat.length, 'lb-cat', () => {
        const sections = new Map<string, BookEntry[]>();
        for (const e of inCat) if (e.section) sections.set(e.section.toUpperCase(), [...(sections.get(e.section.toUpperCase()) ?? []), e]);
        const folds = [...sections.keys()].sort().flatMap((s) => {
          const inSection = sections.get(s)!;
          return fold(`${name}/${s}`, s, inSection.length, 'lb-cat lb-sec', () => {
            const rows = el('div', 'lb-in');
            rows.append(...titled(inSection));
            return [rows];
          });
        });
        return [...titled(inCat.filter((e) => !e.section)), ...folds];
      });
    });
  };
  const drawList = () => {
    const top = list.scrollTop;
    list.replaceChildren(...(tab === 'now' ? nowRows() : allRows()));
    list.scrollTop = top;
  };
  const draw = () => {
    nowTab.textContent = now.count > 0 ? `${BOOK_COPY.now} ${now.count}` : BOOK_COPY.now;
    allTab.textContent = `${BOOK_COPY.all} ${page?.entries.length ?? 0}`;
    nowTab.classList.toggle('on', tab === 'now');
    allTab.classList.toggle('on', tab === 'all');
    find.hidden = tab !== 'all' || failed;
    note.hidden = !failed;
    drawList();
  };

  /** Opens `key`, or shuts it if it's the open one. */
  const pick = (key: string) => {
    cursor = key;
    openRow = openRow === key ? null : key;
    held = [...now.said, ...now.who].find((h) => `e:${h.entry.id}` === openRow) ?? null;
    drawList();
    list.querySelector<HTMLElement>('.lb-row.on')?.scrollIntoView?.({ block: 'nearest' });
  };
  /** Alt+↑/↓: the next row or category, opened, with the cursor left where it is. */
  const move = (dir: 1 | -1) => {
    const items = [...list.querySelectorAll<HTMLElement>('.lb-row, .lb-cat')];
    if (items.length === 0) return;
    const at = items.findIndex((b) => b.dataset.key === cursor);
    const next = items[at < 0 ? (dir > 0 ? 0 : items.length - 1) : Math.max(0, Math.min(items.length - 1, at + dir))];
    if (next.dataset.key === cursor) return;
    cursor = next.dataset.key ?? null;
    next.click();
  };

  /** Who's here now: on opening, and when someone comes or goes with the drawer up. Only the latest fetch counts. */
  const fetchFiles = () => {
    const mine = ++fileCall;
    void o.files().then(
      (f) => {
        if (mine !== fileCall || JSON.stringify(f) === JSON.stringify(files)) return;
        files = f;
        if (isOpen) drawList();
      },
      () => {
        if (mine === fileCall) files = [];
      },
    );
  };

  /** Search lets go first: the box can't always take the cursor (WALK OUT hides it), and the next Esc must still close. */
  const leaveFind = () => {
    find.blur();
    o.chatBox()?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (!isOpen || o.over()) return;
    const arrow = e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown');
    if (e.key !== 'Escape' && !arrow) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (arrow) move(e.key === 'ArrowDown' ? 1 : -1);
    else if (e.repeat) return;
    else if (document.activeElement === find) leaveFind();
    else api.close();
  };
  window.addEventListener('keydown', onKey, true);

  const api: BookDrawer = {
    load(p) {
      page = p;
      failed = p === null;
      compute();
      if (isOpen) draw();
    },
    update(c) {
      const moved = c.sceneId !== ctx.sceneId;
      const cameOrWent = c.present.join('\n') !== ctx.present.join('\n');
      if (moved) {
        tab = 'now';
        openRow = null;
        cursor = null;
        held = null;
        list.scrollTop = 0;
      }
      ctx = c;
      const was = shown();
      compute();
      if (isOpen && (shown() !== was || moved)) draw();
      if (isOpen && (moved || cameOrWent)) fetchFiles();
    },
    open() {
      if (isOpen) return;
      isOpen = true;
      root.hidden = false;
      root.classList.remove('lb-flicker');
      void root.offsetWidth;
      root.classList.add('lb-flicker');
      draw();
      offAway = onClickAway(
        (n) => root.contains(n) || (n instanceof Element && n.closest(BESIDE) !== null),
        () => {
          if (!o.over()) api.close();
        },
      );
      o.onOpenChange(true);
      fetchFiles();
    },
    close() {
      if (!isOpen) return;
      if (document.activeElement === find) leaveFind();
      isOpen = false;
      root.hidden = true;
      offAway?.();
      offAway = null;
      o.onOpenChange(false);
    },
    toggle() {
      if (isOpen) api.close();
      else api.open();
    },
    get isOpen() {
      return isOpen;
    },
  };
  return api;
}
