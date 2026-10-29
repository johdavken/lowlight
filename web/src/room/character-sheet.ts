/**
 * The YOU screen (character sheet, mockup A of 2026-10-16): who you're playing, full screen, in the
 * select screen's file look — figure on the left, name and tagline in her accent, then STATS,
 * CONDITION, SKILLS, SOL and CHROME & GEAR. Nothing behind those sections exists yet: each is drawn
 * desaturated with NOT YET and a line on what it will do, so the sheet doubles as the roadmap.
 * A section comes to life by turning its `live` on and feeding it values. It opens like the MAP (a CRT
 * screen under the keys bar, glitching in and out); Esc or a click on the backdrop closes it.
 * The wardrobe under the figure is live: ‹ › (or ← →) change what you wear, here and in the room.
 * It opens on FILE (spec 2026-10-28): the select screen's bio and facts, or a persona's background, as a quick
 * reference mid-scene; a click on its tab, or Tab on the screen cycle (FILE → SHEET → PEOPLE), turns to SHEET.
 */
import type { Fact, KitView, SpriteRef } from '../../../shared/types';
import type { Deck } from '../../../shared/gear';
import type { StatKey } from '../../../shared/stats';
import './character-sheet.css';
import { openScreen, SCREEN_GLITCH_OUT_MS } from '../ui/screen';

/** Who the sheet is for: the room's persona (name, figure, accent, tagline, outfits and the one worn). */
export interface SheetPlayer {
  name: string;
  sprite: SpriteRef | null;
  accent?: string;
  tagline?: string;
  outfits?: string[];
  /** The outfit worn (saved in the playthrough); absent: the plain sprite. */
  outfit?: string;
  /** The outfit whose picture is the plain sprite, so the wardrobe doesn't list it twice. */
  baseOutfit?: string;
  /** Where an outfit's picture is. */
  outfitUrl?(name: string): string;
  /** Missions (spec 2026-10-18 §4): stats, heat, sol and deck; absent: those rows stay NOT YET. */
  kit?: KitView;
  /** FILE's bio paragraphs: the select screen's, or a persona's background (spec 2026-10-28 §1). */
  bio?: string[];
  /** FILE's facts (none under a persona). */
  facts?: Fact[];
}

interface Row {
  key: string;
  /** Under the row: what it measures, or which stat a skill runs on. */
  sub?: string;
}

/** One block of the sheet; `live: false` draws it desaturated with `planned` under its heading. */
export interface SheetSection {
  id: 'stats' | 'condition' | 'skills' | 'sol' | 'gear';
  title: string;
  /** The scale shown at the heading's right (1–10, 0–5), if any. */
  scale?: string;
  live: boolean;
  /** What the section will do once it's live. */
  planned: string;
  rows: Row[];
}

export const SHEET_SECTIONS: SheetSection[] = [
  {
    id: 'stats',
    title: 'STATS',
    scale: '1–10',
    live: false,
    planned: 'Six numbers that set your odds in gigs, slips and checks.',
    rows: [
      { key: 'BODY', sub: 'Taking a hit, carrying, forcing doors' },
      { key: 'REFLEX', sub: 'Speed, aim, slipping a grab' },
      { key: 'TECH', sub: 'Decks, locks, anything with a circuit' },
      { key: 'COOL', sub: 'Nerve under pressure, lying straight-faced' },
      { key: 'WITS', sub: 'Noticing, remembering, reading a room' },
      { key: 'EDGE', sub: 'Luck. Spent to reroll, back with sleep' },
    ],
  },
  {
    id: 'condition',
    title: 'CONDITION',
    live: false,
    planned: 'What the city has done to you lately, and who is watching.',
    rows: [
      { key: 'HEALTH', sub: 'Hurt in a gig or a fight, mended with rest or a ripperdoc' },
      { key: 'THE HUM', sub: 'Chrome load. The MiraGen script keeps it quiet' },
      { key: 'HEAT', sub: 'How hard SDG is looking for you' },
    ],
  },
  {
    id: 'skills',
    title: 'SKILLS',
    scale: '0–5',
    live: false,
    planned: 'What you know how to do. Learned the slow way, or carted in.',
    rows: [
      { key: 'HACKING', sub: 'Tech · lacquer, locks, doors' },
      { key: 'SNEAKING', sub: 'Reflex · guards, cameras, the dead blocks' },
      { key: 'FORGERY', sub: 'Tech · papers, seals, records' },
      { key: 'FAST TALK', sub: 'Cool' },
      { key: 'STREETWISE', sub: 'Wits' },
      { key: 'BRAWL', sub: 'Body' },
    ],
  },
  {
    id: 'sol',
    title: 'SOL',
    live: false,
    planned: 'Money in and out: gig pay, bribes, the script, debts.',
    rows: [
      { key: 'GRID', sub: 'The corps can see it' },
      { key: 'HARD SOL', sub: 'Scrip and coin. Nobody can' },
    ],
  },
  {
    id: 'gear',
    title: 'CHROME & GEAR',
    live: false,
    planned: 'Implants and kit. Every piece of chrome adds to the hum.',
    rows: [{ key: 'CHROME' }, { key: 'JACK' }, { key: 'DECK' }, { key: 'CARRY' }],
  },
];

/**
 * What the wardrobe steps through: her outfits, led by the plain sprite (null) unless one of them
 * already is the plain sprite. Without outfits there's nothing to change.
 */
export function wardrobeOptions(p: Pick<SheetPlayer, 'outfits' | 'baseOutfit'>): (string | null)[] {
  const outfits = p.outfits ?? [];
  if (outfits.length === 0) return [];
  return p.baseOutfit !== undefined && outfits.includes(p.baseOutfit) ? [...outfits] : [null, ...outfits];
}

/** The option worn now: the saved outfit, else the plain sprite (the outfit that is it, if any). */
export function wornOutfit(p: Pick<SheetPlayer, 'outfits' | 'outfit' | 'baseOutfit'>): string | null {
  const outfits = p.outfits ?? [];
  if (p.outfit !== undefined && outfits.includes(p.outfit)) return p.outfit;
  return p.baseOutfit !== undefined && outfits.includes(p.baseOutfit) ? p.baseOutfit : null;
}

/** The option one step from `worn` (‹ is -1, › is +1), wrapping round. */
export function stepOutfit(options: readonly (string | null)[], worn: string | null, dir: -1 | 1): string | null {
  if (options.length === 0) return worn;
  const at = Math.max(0, options.indexOf(worn));
  return options[(at + dir + options.length) % options.length];
}

/** The wardrobe line under the figure: the outfit worn, BASE for the plain sprite, AS YOU ARE with nothing to change. */
export function wardrobeLabel(options: readonly (string | null)[], worn: string | null): string {
  if (options.length === 0) return 'AS YOU ARE';
  return worn === null ? 'BASE' : worn.toUpperCase();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  n.textContent = text;
  return n;
}

function bar(cells: number, on = 0): HTMLElement {
  const b = el('div', 'cs-bar');
  for (let i = 0; i < cells; i++) b.append(el('i', i < on ? 'on' : ''));
  return b;
}

/** A row the kit doesn't fill yet, in a section that's live: dimmed, marked NOT YET. */
const planned = <T extends HTMLElement>(n: T): T => {
  n.classList.add('cs-row-planned');
  n.append(el('span', 'cs-nyet', 'NOT YET'));
  return n;
};

/** What a deck does, on its slot: `Stall build · +15 GRID · HEAT 0 · fragile`. */
const deckText = (d: Deck) => [d.name, `${d.bonus >= 0 ? '+' : ''}${d.bonus} GRID`, `HEAT ${d.heat}`, ...d.traits].join(' · ');

function pips(): HTMLElement {
  const p = el('div', 'cs-pips');
  for (let i = 0; i < 5; i++) p.append(el('i', ''));
  return p;
}

function rowFor(s: SheetSection, r: Row, kit?: KitView): HTMLElement {
  switch (s.id) {
    case 'stats': {
      const v = kit ? kit.stats[r.key.toLowerCase() as StatKey] : undefined;
      const n = el('div', 'cs-stat');
      n.append(el('span', 'cs-k', r.key), el('span', 'cs-v', v !== undefined ? String(v) : '—'), bar(10, v ?? 0));
      if (r.sub) n.append(el('div', 'cs-hint', r.sub));
      return n;
    }
    case 'condition': {
      // Heat where you stand, and the hottest district when it's somewhere else (small jobs spec §2).
      const heat = r.key === 'HEAT' && kit ? kit.heatHere : undefined;
      const elsewhere = r.key === 'HEAT' && kit?.hottest && kit.hottest.heat > (kit.heatHere ?? 0) ? ` · ${kit.hottest.district.toUpperCase()} ${kit.hottest.heat}` : '';
      const n = el('div', `cs-meter cs-${r.key === 'THE HUM' ? 'hum' : r.key === 'HEAT' ? 'heat' : 'health'}`);
      const top = el('div', 'cs-top');
      top.append(el('span', '', r.key), el('span', '', heat !== undefined ? `${heat} / 10${elsewhere}` : '—'));
      const track = el('div', 'cs-track');
      if (heat !== undefined) track.style.setProperty('--fill', `${heat * 10}%`);
      n.append(top, track);
      if (r.sub) n.append(el('div', 'cs-hint', r.sub));
      return kit && heat === undefined ? planned(n) : n;
    }
    case 'skills': {
      const n = el('div', 'cs-skill');
      const text = el('div', '');
      text.append(el('div', 'cs-k', r.key));
      if (r.sub) text.append(el('div', 'cs-sub', r.sub));
      n.append(text, pips());
      return n;
    }
    case 'sol': {
      const total = r.key === 'SOL' && kit ? kit.sol : undefined;
      const n = el('div', `cs-wallet${r.key === 'HARD SOL' ? ' hard' : ''}${total !== undefined ? ' live' : ''}`);
      const amt = el('div', 'cs-amt', total !== undefined ? String(total) : '—');
      amt.append(el('small', '', 'sol'));
      n.append(el('div', 'cs-k', r.key), amt);
      if (r.sub) n.append(el('div', 'cs-sub', r.sub));
      return kit && total === undefined ? planned(n) : n;
    }
    case 'gear': {
      const deck = r.key === 'DECK' && kit;
      // CARRY: the cover you hold (small jobs spec §5).
      const carry = r.key === 'CARRY' && kit;
      const n = el('div', 'cs-slot');
      const sub = deck ? (kit.deck ? deckText(kit.deck) : 'NONE') : carry ? `BURNER ×${kit.cover.burner} · FALL GUY ×${kit.cover['fall-guy']}` : 'Empty slot';
      n.append(el('span', 'cs-k', r.key), el('span', 'cs-sub', sub));
      return kit && !deck && !carry ? planned(n) : n;
    }
  }
}

/** The sections a kit brings alive (missions spec §4): STATS, HEAT, one SOL row and DECK. */
const KIT_SECTIONS: ReadonlySet<SheetSection['id']> = new Set(['stats', 'condition', 'sol', 'gear']);

function section(s0: SheetSection, kit?: KitView): HTMLElement {
  const s = kit && KIT_SECTIONS.has(s0.id) ? { ...s0, live: true, rows: s0.id === 'sol' ? [{ key: 'SOL', sub: 'What you hold' }, ...s0.rows] : s0.rows } : s0;
  const n = el('section', `cs-sec cs-${s.id}${s.live ? '' : ' planned'}`);
  n.dataset.section = s.id;
  const dh = el('div', 'cs-dh');
  dh.append(el('span', '', s.title), el('span', 'cs-scale', s.live ? (s.scale ?? '') : 'NOT YET'));
  const body = el('div', 'cs-body');
  body.append(...s.rows.map((r) => rowFor(s, r, kit)));
  n.append(dh);
  if (!s.live) n.append(el('div', 'cs-planned', s.planned));
  n.append(body);
  return n;
}

/** The FILE page: BIO and FACTS side by side (each only when there is some), or `No file.`. */
function filePage(p: Pick<SheetPlayer, 'bio' | 'facts'>): HTMLElement {
  const n = el('div', 'cs-filepage');
  const bio = p.bio ?? [];
  const facts = p.facts ?? [];
  if (bio.length === 0 && facts.length === 0) {
    n.append(el('div', 'cs-nofile', 'No file.'));
    return n;
  }
  const head = (text: string) => {
    const h = el('div', 'cs-dh');
    h.append(el('span', '', text));
    return h;
  };
  if (bio.length > 0) {
    const b = el('section', 'cs-bio');
    b.append(head('BIO'), ...bio.map((para) => el('p', '', para)));
    n.append(b);
  }
  if (facts.length > 0) {
    const f = el('section', 'cs-facts');
    const dl = el('dl', '');
    for (const fact of facts) dl.append(el('dt', '', fact.label), el('dd', '', fact.value));
    f.append(head('FACTS'), dl);
    n.append(f);
  }
  return n;
}

/** YOU's two pages (spec 2026-10-28 §3). */
export type SheetPage = 'file' | 'sheet';

/** How long the glitch-out runs before the sheet is gone (the shared screen's). */
export const SHEET_GLITCH_OUT_MS = SCREEN_GLITCH_OUT_MS;

export function openCharacterSheet(
  host: HTMLElement,
  o: {
    player: SheetPlayer;
    /** Called as soon as it starts closing (the room's chrome is free again). */
    onClose?(): void;
    /** The player picked another outfit (null: the plain sprite); a rejection puts the last one back. */
    onOutfit?(outfit: string | null): Promise<void> | void;
    sections?: SheetSection[];
    /** The page it opens on: FILE, unless the screen cycle comes back into YOU (Shift+Tab), which lands on SHEET. */
    page?: SheetPage;
    /** No glitch in or out: it shows and goes at once. */
    reducedMotion?: boolean;
  },
): {
  close(instant?: boolean): void;
  /** The screen cycle's Tab: FILE → SHEET (1) or SHEET → FILE (-1); false past either end, so the cycle moves on. */
  turnPage(dir: 1 | -1): boolean;
} {
  const p = o.player;

  const figure = el('div', 'cs-figure');
  figure.append(el('div', 'cs-mono', p.name.charAt(0).toUpperCase()));
  const options = wardrobeOptions(p);
  let worn = wornOutfit(p);
  const pictureOf = (o: string | null) => (o !== null && p.outfitUrl ? p.outfitUrl(o) : p.sprite?.url);
  let img: HTMLImageElement | null = null;
  if (p.sprite) {
    img = el('img', `cs-img${p.sprite.pixel ? ' pixel' : ''}`);
    img.src = pictureOf(worn) ?? p.sprite.url;
    img.alt = p.name;
    // An outfit that won't load shows the plain sprite; the plain sprite failing leaves the monogram.
    img.addEventListener('error', () => {
      if (img && p.sprite && img.getAttribute('src') !== p.sprite.url) img.src = p.sprite.url;
      else img?.remove();
    });
    figure.append(img);
  }
  // The wardrobe: ‹ › (or ← →) step through her outfits; the choice is saved in the playthrough.
  const wardrobe = el('div', 'cs-wardrobe');
  const label = el('span', 'cs-outfit', wardrobeLabel(options, worn));
  const count = el('span', 'cs-scale');
  const arrow = (text: string, dir: -1 | 1) => {
    const b = el('button', 'cs-arrow', text);
    b.type = 'button';
    b.setAttribute('aria-label', dir < 0 ? 'Previous outfit' : 'Next outfit');
    b.disabled = options.length < 2;
    b.addEventListener('click', () => step(dir));
    return b;
  };
  const show = () => {
    label.textContent = wardrobeLabel(options, worn);
    count.textContent = options.length > 1 ? `${options.indexOf(worn) + 1}/${options.length}` : '';
    const src = pictureOf(worn);
    if (img && src) img.src = src;
  };
  const step = (dir: -1 | 1) => {
    if (options.length < 2) return;
    const was = worn;
    worn = stepOutfit(options, worn, dir);
    show();
    const now = worn;
    void Promise.resolve(o.onOutfit?.(now)).catch(() => {
      // Not saved: back to what she had on, unless she's stepped on since.
      if (worn !== now) return;
      worn = was;
      show();
    });
  };
  wardrobe.append(arrow('‹', -1), label, arrow('›', 1), count);
  show();
  figure.append(wardrobe);

  const file = el('div', 'cs-file');
  file.append(el('div', 'cs-name', p.name.toUpperCase()));
  if (p.tagline) file.append(el('div', 'cs-tagline', p.tagline));
  const sections = o.sections ?? SHEET_SECTIONS;
  const by = (id: SheetSection['id']) => sections.filter((s) => s.id === id).map((s) => section(s, p.kit));
  const left = el('div', 'cs-col');
  left.append(...by('stats'), ...by('condition'));
  const right = el('div', 'cs-col');
  right.append(...by('skills'), ...by('sol'), ...by('gear'));
  const cols = el('div', 'cs-cols');
  cols.append(left, right);
  // FILE and SHEET (spec 2026-10-28 §3): every open starts on FILE; a click on a tab, or turnPage (the cycle's Tab), turns.
  const pageFile = filePage(p);
  const pages = el('div', 'cs-pages');
  const pageTab = (id: SheetPage, text: string) => {
    const b = el('button', 'cs-page-tab');
    b.type = 'button';
    b.dataset.page = id;
    b.append(el('span', '', text));
    b.addEventListener('click', () => showPage(id));
    return b;
  };
  const pageTabs = [pageTab('file', 'FILE'), pageTab('sheet', 'SHEET')];
  pages.append(...pageTabs, el('span', 'cs-scale', '[TAB] NEXT'));
  let page: SheetPage = 'file';
  const showPage = (to: SheetPage) => {
    page = to;
    for (const b of pageTabs) b.classList.toggle('on', b.dataset.page === to);
    pageFile.hidden = to !== 'file';
    cols.hidden = to !== 'sheet';
  };
  showPage(o.page ?? 'file');
  file.append(pages, pageFile, cols);

  const wrap = el('div', 'cs-wrap');
  wrap.append(figure, file);
  // Opened like the MAP, on the shared screen: a CRT screen under the keys bar, glitching in and out.
  const screen = openScreen(host, {
    title: 'YOU',
    className: 'character-sheet',
    label: `Character sheet: ${p.name}`,
    reducedMotion: o.reducedMotion,
    onClose: () => {
      window.removeEventListener('keydown', onKey, true);
      o.onClose?.();
    },
  });
  if (p.accent) screen.root.style.setProperty('--cs-side', p.accent);
  screen.body.append(wrap);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Capture phase too: the arrows dress her, they don't move the prompt's caret behind the sheet.
      e.preventDefault();
      e.stopPropagation();
      step(e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (e.key !== 'Escape') return;
    // Capture phase: Esc closes the sheet and goes no further (not back to the dial-in).
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  window.addEventListener('keydown', onKey, true);

  function close(instant = false): void {
    screen.close(instant);
  }

  function turnPage(dir: 1 | -1): boolean {
    const to = dir > 0 ? 'sheet' : 'file';
    if (page === to) return false;
    showPage(to);
    return true;
  }

  return { close, turnPage };
}
