/**
 * The YOU screen (panel 2026-11-04, docs/mockups/you-panel.html): who you're playing, on QUEST's holo pane in your
 * accent, the shared screen's `scr-holo` frame. The figure and wardrobe stand on the left where QUEST has its list; the
 * room you're in, your name and tagline head the right, over four pages: FILE (the select screen's bio and facts, or a
 * persona's background), STATS, STREET (NERVE, then REP and HEAT by district) and KIT (sol, decks, cover). What isn't
 * built yet is drawn dim and marked NOT YET, so the sheet doubles as the roadmap.
 * Esc or a click on the backdrop closes it. ‹ › (or ← →) change what you wear, here and in the room; a click on a tab,
 * or Tab on the screen cycle (FILE → STATS → STREET → KIT → PEOPLE), turns the page.
 */
import type { Fact, KitView, SpriteRef } from '../../../shared/types';
import type { Deck } from '../../../shared/gear';
import { repTier, TIER_NAMES } from '../../../shared/mission';
import { SLOTS } from '../../../shared/programs';
import type { StatKey } from '../../../shared/stats';
import './character-sheet.css';
import { openScreen, SCREEN_GLITCH_OUT_MS } from '../ui/screen';
import { sol } from './crew-ui';

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
  /** Missions (spec 2026-10-18 §4): stats, heat, sol and deck; absent: STATS shows dashes, STREET and KIT say so. */
  kit?: KitView;
  /** FILE's bio paragraphs: the select screen's, or a persona's background (spec 2026-10-28 §1). */
  bio?: string[];
  /** FILE's facts (none under a persona). */
  facts?: Fact[];
  /** The picture of the room you're in, for the banner; absent: a hatch. */
  room?: string;
}

interface Row {
  key: string;
  /** Under the row: what it measures, or which stat a skill runs on. */
  sub: string;
}

const STATS: Row[] = [
  { key: 'BODY', sub: 'Taking a hit, carrying, forcing doors' },
  { key: 'REFLEX', sub: 'Speed, aim, slipping a grab' },
  { key: 'TECH', sub: 'Decks, locks, anything with a circuit' },
  { key: 'COOL', sub: 'Nerve under pressure, lying straight-faced' },
  { key: 'WITS', sub: 'Noticing, remembering, reading a room' },
  { key: 'EDGE', sub: 'Grit. Sets how much NERVE you have each night' },
];

const SKILLS: Row[] = [
  { key: 'HACKING', sub: 'Tech' },
  { key: 'SNEAKING', sub: 'Reflex' },
  { key: 'FORGERY', sub: 'Tech' },
  { key: 'FAST TALK', sub: 'Cool' },
  { key: 'STREETWISE', sub: 'Wits' },
  { key: 'BRAWL', sub: 'Body' },
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

function track(cls: string, fill: number): HTMLElement {
  const t = el('div', `cs-track ${cls}`);
  t.style.setProperty('--fill', `${Math.max(0, Math.min(100, fill))}%`);
  return t;
}

/** A district id as the table writes it: `the-spine` → `THE SPINE`. */
const districtName = (id: string) => id.replace(/-/g, ' ').toUpperCase();

/** What a deck does, under its name: `Q2 · 2 SLOTS · HEAT 0 · FRAGILE`. */
const deckText = (d: Deck) => [`Q${d.quality}`, `${SLOTS[d.quality]} ${SLOTS[d.quality] === 1 ? 'SLOT' : 'SLOTS'}`, `HEAT ${d.heat}`, ...d.traits.map((t) => t.toUpperCase())].join(' · ');

/** A block of a page: a heading, its note at the right, then what's in it. */
function sec(id: string, title: string, note: string, ...body: HTMLElement[]): HTMLElement {
  const n = el('section', 'cs-sec');
  n.dataset.section = id;
  const dh = el('div', 'cs-dh');
  dh.append(el('span', '', title), el('span', 'cs-scale', note));
  n.append(dh, ...body);
  return n;
}

/** A block not built yet: grey, dim, tagged NOT YET. */
function planned(id: string, title: string, ...body: HTMLElement[]): HTMLElement {
  const n = sec(id, title, 'NOT YET', ...body);
  n.classList.add('planned');
  return n;
}

function emptyRow(key: string, value: string): HTMLElement {
  const n = el('div', 'cs-slot');
  n.append(el('span', '', key), el('span', '', value));
  return n;
}

/** STATS: the six numbers, and the skills to come. */
function statsPage(kit?: KitView): HTMLElement {
  const stats = STATS.map((r) => {
    const v = kit?.stats[r.key.toLowerCase() as StatKey];
    const n = el('div', 'cs-stat');
    n.append(el('span', 'cs-k', r.key), el('span', 'cs-v', v !== undefined ? String(v) : '—'), bar(10, v ?? 0), el('div', 'cs-hint', r.sub));
    return n;
  });
  const skills = SKILLS.map((r) => {
    const n = el('div', 'cs-skill');
    const text = el('div', 'cs-k', r.key);
    text.append(el('small', '', r.sub));
    const pips = el('div', 'cs-pips');
    for (let i = 0; i < 5; i++) pips.append(el('i', ''));
    n.append(text, pips);
    return n;
  });
  const n = el('div', 'cs-cols');
  n.append(sec('stats', 'STATS', '1–10', ...stats), planned('skills', 'SKILLS', el('div', 'cs-line', 'What you know how to do. Learned the slow way, or carted in.'), ...skills));
  return n;
}

/** Where the city has you: the district you stand in first, then the rest with any rep or heat, best known first. */
function districtRows(kit: KitView): { id: string; rep: number; heat: number }[] {
  // An older server sends no heatBy: only the district here and the hottest are known.
  const heatOf = (d: string) => kit.heatBy?.[d] ?? (d === kit.here ? kit.heatHere : d === kit.hottest?.district ? kit.hottest.heat : 0);
  const ids = new Set([...Object.keys(kit.rep ?? {}), ...Object.keys(kit.heatBy ?? {}), ...(kit.hottest ? [kit.hottest.district] : [])]);
  const rows = [...ids].filter((d) => d !== kit.here).map((id) => ({ id, rep: kit.rep?.[id] ?? 0, heat: heatOf(id) }));
  const known = rows.filter((r) => r.rep > 0 || r.heat > 0).sort((a, b) => b.rep - a.rep || b.heat - a.heat || a.id.localeCompare(b.id));
  return kit.here ? [{ id: kit.here, rep: kit.rep?.[kit.here] ?? 0, heat: heatOf(kit.here) }, ...known] : known;
}

/** STREET: NERVE tonight, REP and HEAT by district, and what's still to come of your condition. */
function streetPage(kit: KitView): HTMLElement {
  const nerve = el('div', 'cs-meter');
  const top = el('div', 'cs-top');
  top.append(el('span', '', 'NERVE'), el('span', '', `${kit.nerveLeft} / ${kit.nerveMax}`));
  nerve.append(top, track('cs-nerve', kit.nerveMax > 0 ? (kit.nerveLeft / kit.nerveMax) * 100 : 0));

  const head = el('div', 'cs-dist cs-dist-head');
  head.append(el('span', ''), el('span', '', 'REP'), el('span', ''), el('span', '', 'HEAT'), el('span', ''));
  const rows = districtRows(kit).map((r) => {
    const n = el('div', `cs-dist${r.id === kit.here ? ' here' : ''}`);
    n.append(el('span', 'cs-dist-name', districtName(r.id)), track('cs-rep', r.rep), el('span', 'cs-rep-n', String(r.rep)), track('cs-heat', r.heat * 10), el('span', `cs-heat-n${r.heat ? '' : ' none'}`, String(r.heat)));
    return n;
  });
  const here = kit.here ? `${districtName(kit.here)} HOLDS YOU AS ${TIER_NAMES[repTier(kit.rep?.[kit.here] ?? 0) - 1]}. ` : '';

  const n = el('div', 'cs-street');
  n.append(
    sec('tonight', 'TONIGHT', '', nerve, el('div', 'cs-line', 'Spent to push a roll or steady a cost on a job; back at 06:00.')),
    sec('districts', 'DISTRICTS', '20 KNOWN · 45 TRUSTED · 75 A NAME', ...(rows.length ? [head, ...rows] : []), el('div', 'cs-line cs-after', `${here}Heat cools at 06:00; as it climbs, jobs there turn harder and favours dry up.`)),
    planned('condition', 'CONDITION', emptyRow('HEALTH', '—'), emptyRow('THE HUM', '—')),
  );
  return n;
}

function purse(label: string, amount: string, note?: string): HTMLElement {
  const n = el('div', `cs-wallet${note ? ' live' : ''}`);
  const k = el('div', 'cs-k', label);
  const amt = el('div', 'cs-amt', amount);
  if (note) amt.append(el('small', '', note));
  else k.append(el('span', 'cs-nyet', 'NOT YET'));
  n.append(k, amt);
  return n;
}

/** KIT: sol, the decks you own with CARRY, cover, and the chrome to come. */
function kitPage(kit: KitView, onCarry?: (id: string) => void): HTMLElement {
  const wallet = el('div', 'cs-wallets');
  wallet.append(purse('SOL', sol(kit.sol), 'WHAT YOU HOLD'), purse('GRID', '—'), purse('HARD SOL', '—'));

  const decks = kit.owned.map((d) => {
    const on = d.id === kit.deck?.id;
    const n = el('div', `cs-deck${on ? ' on' : ''}`);
    const text = el('div', '');
    text.append(el('div', 'cs-deck-name', d.name), el('div', 'cs-deck-terms', deckText(d)));
    n.append(text);
    if (on) n.append(el('span', 'cs-carried', 'CARRIED'));
    else {
      const b = el('button', 'cs-carry', 'CARRY');
      b.type = 'button';
      b.addEventListener('click', () => onCarry?.(d.id));
      n.append(b);
    }
    return n;
  });
  if (decks.length === 0) decks.push(el('div', 'cs-line', 'NONE'));

  const cover = el('div', 'cs-chips');
  for (const [name, n] of [['BURNER', kit.cover.burner], ['FALL GUY', kit.cover['fall-guy']]] as const) {
    const chip = el('span', 'cs-chip', name);
    chip.append(el('b', '', `×${n}`));
    cover.append(chip);
  }

  const n = el('div', 'cs-kit');
  n.append(
    sec('sol', 'SOL', '', wallet),
    sec('decks', 'DECKS', `${kit.owned.length} OWNED`, ...decks, el('div', 'cs-deck-why')),
    sec('cover', 'COVER', '', cover),
    planned('chrome', 'CHROME', emptyRow('CHROME', 'Empty slot'), emptyRow('JACK', 'Empty slot')),
  );
  return n;
}

/** The FILE page: BIO over FACTS (each only when there is some), or `No file.`. */
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

/** YOU's pages, in Tab's order. */
export const SHEET_PAGES = ['file', 'stats', 'street', 'kit'] as const;
export type SheetPage = (typeof SHEET_PAGES)[number];

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
    /** CARRY on a deck you own: the swap is asked for; setKit shows it once it lands, refusal if not. */
    onCarry?(deck: string): void;
    /** The page it opens on: FILE, unless the screen cycle comes back into YOU (Shift+Tab), which lands on KIT. */
    page?: SheetPage;
    /** No glitch in or out: it shows and goes at once. */
    reducedMotion?: boolean;
  },
): {
  close(instant?: boolean): void;
  /** The screen cycle's Tab: a page on (1) or back (-1); false past either end, so the cycle moves on. */
  turnPage(dir: 1 | -1): boolean;
  /** A fresh kit: every page it feeds redrawn (a deck carried, bought or lost while it's up). */
  setKit(kit: KitView): void;
  /** A refused CARRY, said under the decks. */
  refusal(text: string): void;
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

  const art = el('div', p.room ? 'cs-art' : 'cs-art cs-noart');
  if (p.room) art.style.backgroundImage = `url("${p.room}")`;
  const main = el('div', 'cs-in');
  main.append(el('div', 'cs-name', p.name.toUpperCase()));
  if (p.tagline) main.append(el('div', 'cs-tagline', p.tagline));
  const page = el('div', 'cs-page');
  main.append(page);
  const file = el('div', 'cs-file');
  file.append(art, main);

  let kit = p.kit;
  // A refused CARRY: kept off the page, so it's still there if KIT is turned away from; a fresh kit clears it.
  let refused = '';
  const pageFile = filePage(p);
  // A page's content: the kit's three are drawn again with each fresh kit, FILE only once.
  const nothing = () => el('div', 'cs-nofile', 'Nothing on you yet.');
  const draw = (to: SheetPage): HTMLElement => {
    if (to === 'file') return pageFile;
    if (to === 'stats') return statsPage(kit);
    if (!kit) return nothing();
    if (to === 'street') return streetPage(kit);
    const n = kitPage(kit, o.onCarry);
    n.querySelector('.cs-deck-why')!.textContent = refused;
    return n;
  };
  const pages = el('nav', 'cs-pages');
  const pageTab = (id: SheetPage) => {
    const b = el('button', 'cs-page-tab', id.toUpperCase());
    b.type = 'button';
    b.dataset.page = id;
    b.addEventListener('click', () => showPage(id));
    return b;
  };
  const pageTabs = SHEET_PAGES.map(pageTab);
  pages.append(...pageTabs, el('span', 'cs-next', '[TAB] NEXT'));
  let at: SheetPage = 'file';
  const showPage = (to: SheetPage) => {
    at = to;
    for (const b of pageTabs) b.classList.toggle('on', b.dataset.page === to);
    page.replaceChildren(draw(to));
    page.scrollTop = 0;
  };

  const wrap = el('div', 'cs-wrap');
  wrap.append(figure, file);
  const screen = openScreen(host, {
    title: 'YOU',
    className: 'scr-holo character-sheet',
    label: `Character sheet: ${p.name}`,
    reducedMotion: o.reducedMotion,
    onClose: () => {
      window.removeEventListener('keydown', onKey, true);
      o.onClose?.();
    },
  });
  if (p.accent) screen.root.style.setProperty('--cs-side', p.accent);
  const strip = el('div', 'cs-strip');
  const showStrip = () => {
    strip.textContent = kit ? `SOL ${sol(kit.sol)} · NERVE ${kit.nerveLeft}/${kit.nerveMax}` : '';
  };
  screen.head.replaceChildren(el('span', '', '◆ YOU'), strip, el('span', 'cs-esc', 'ESC'));
  screen.body.append(pages, wrap);
  showStrip();
  showPage(o.page ?? 'file');

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
    const to = SHEET_PAGES[SHEET_PAGES.indexOf(at) + dir];
    if (!to) return false;
    showPage(to);
    return true;
  }

  const setKit = (next: KitView) => {
    kit = next;
    refused = '';
    showStrip();
    if (at !== 'file') {
      const top = page.scrollTop;
      page.replaceChildren(draw(at));
      page.scrollTop = top;
    }
  };
  const refusal = (text: string) => {
    refused = text;
    const why = page.querySelector('.cs-deck-why');
    if (why) why.textContent = text;
  };
  return { close, turnPage, setKit, refusal };
}
