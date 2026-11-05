import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KitView } from '../../shared/types';
import { openCharacterSheet, SHEET_GLITCH_OUT_MS, stepOutfit, wardrobeLabel, wardrobeOptions, wornOutfit } from '../src/room/character-sheet';

const hicks = {
  name: 'Hicks',
  sprite: { url: '/api/persona/sprite?as=hicks', crop: { top: 0, bottom: 0.5 }, pixel: true as const },
  accent: '#3dff7a',
  tagline: 'Netrunner. Old Town born.',
  outfits: ['outdoors', 'home'],
  outfitUrl: (n: string) => `/api/agents/hicks/outfit/${n}`,
};

const stall = { id: 'stall-build', name: 'Stall build', quality: 2 as const, heat: 0, traits: ['fragile' as const] };
const slate = { id: 'dock-slate', name: 'Dock slate', quality: 1 as const, heat: 0, traits: [] };
const kit: KitView = {
  deck: stall,
  owned: [stall, slate],
  sol: 1240,
  heat: 5,
  heatHere: 3,
  here: 'karasu',
  heatBy: { karasu: 3, strand: 5 },
  hottest: { district: 'strand', heat: 5 },
  rep: { karasu: 38, velvet: 21, strand: 9, spine: 0 },
  cover: { burner: 2, 'fall-guy': 1 },
  nerveLeft: 3,
  nerveMax: 4,
  stats: { body: 4, reflex: 6, tech: 7, cool: 7, wits: 6, edge: 4 },
  crewLatest: null,
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('the wardrobe', () => {
  it('steps through her outfits, led by the plain sprite unless one of them is it', () => {
    expect(wardrobeOptions({ outfits: ['work', 'home'] })).toEqual([null, 'work', 'home']);
    expect(wardrobeOptions({ outfits: ['outdoors', 'home'], baseOutfit: 'outdoors' })).toEqual(['outdoors', 'home']);
    expect(wardrobeOptions({ outfits: [] })).toEqual([]);
    expect(wardrobeOptions({})).toEqual([]);
  });

  it('wears the saved outfit, else the plain sprite (or the outfit that is it); an unknown saved one reads as none', () => {
    expect(wornOutfit({ outfits: ['work', 'home'], outfit: 'home' })).toBe('home');
    expect(wornOutfit({ outfits: ['work', 'home'] })).toBeNull();
    expect(wornOutfit({ outfits: ['outdoors', 'home'], baseOutfit: 'outdoors' })).toBe('outdoors');
    expect(wornOutfit({ outfits: ['work'], outfit: 'gone' })).toBeNull();
  });

  it('‹ › wrap round', () => {
    const opts = [null, 'work', 'home'];
    expect(stepOutfit(opts, null, 1)).toBe('work');
    expect(stepOutfit(opts, 'home', 1)).toBeNull();
    expect(stepOutfit(opts, null, -1)).toBe('home');
    expect(stepOutfit([], null, 1)).toBeNull();
  });

  it('the label is the outfit worn, BASE for the plain sprite, AS YOU ARE with nothing to change', () => {
    expect(wardrobeLabel([null, 'work'], 'work')).toBe('WORK');
    expect(wardrobeLabel([null, 'work'], null)).toBe('BASE');
    expect(wardrobeLabel([], null)).toBe('AS YOU ARE');
  });
});

describe('openCharacterSheet', () => {
  it('shows the name, tagline, accent and figure (pixel art stays pixelated)', () => {
    openCharacterSheet(document.body, { player: hicks });
    const sheet = document.querySelector<HTMLElement>('.character-sheet')!;
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.style.getPropertyValue('--cs-side')).toBe('#3dff7a');
    expect(sheet.querySelector('.cs-name')!.textContent).toBe('HICKS');
    expect(sheet.querySelector('.cs-tagline')!.textContent).toBe('Netrunner. Old Town born.');
    const img = sheet.querySelector<HTMLImageElement>('.cs-img')!;
    expect(img.getAttribute('src')).toBe('/api/persona/sprite?as=hicks');
    expect(img.classList.contains('pixel')).toBe(true);
  });

  it('a persona with no tagline or figure leaves both out', () => {
    openCharacterSheet(document.body, { player: { name: 'Vee', sprite: null } });
    expect(document.querySelector('.cs-tagline')).toBeNull();
    expect(document.querySelector('.cs-img')).toBeNull();
    expect(document.querySelector('.cs-mono')!.textContent).toBe('V');
  });

  it('with no kit the stats show no made-up values, and STREET and KIT have nothing to say', () => {
    openCharacterSheet(document.body, { player: hicks, page: 'stats' });
    expect([...document.querySelectorAll('[data-section="stats"] .cs-v')].every((n) => n.textContent === '—')).toBe(true);
    expect(document.querySelector('.cs-strip')!.textContent).toBe('');
    document.querySelector<HTMLButtonElement>('.cs-page-tab[data-page="street"]')!.click();
    expect(document.querySelector('.cs-nofile')!.textContent).toBe('Nothing on you yet.');
    document.querySelector<HTMLButtonElement>('.cs-page-tab[data-page="kit"]')!.click();
    expect(document.querySelector('.cs-nofile')!.textContent).toBe('Nothing on you yet.');
  });

  it('what is not built yet says NOT YET: skills, condition, chrome, and the grid and hard purses', () => {
    openCharacterSheet(document.body, { player: { ...hicks, kit }, page: 'stats' });
    const skills = document.querySelector<HTMLElement>('[data-section="skills"]')!;
    expect(skills.classList.contains('planned')).toBe(true);
    expect(skills.querySelector('.cs-scale')!.textContent).toBe('NOT YET');
    expect([...skills.querySelectorAll('.cs-k')].slice(0, 3).map((n) => n.firstChild!.textContent)).toEqual(['HACKING', 'SNEAKING', 'FORGERY']);
    document.querySelector<HTMLButtonElement>('.cs-page-tab[data-page="street"]')!.click();
    expect(document.querySelector('[data-section="condition"]')!.classList.contains('planned')).toBe(true);
    document.querySelector<HTMLButtonElement>('.cs-page-tab[data-page="kit"]')!.click();
    expect(document.querySelector('[data-section="chrome"]')!.classList.contains('planned')).toBe(true);
    expect([...document.querySelectorAll('.cs-wallet')].map((w) => w.classList.contains('live'))).toEqual([true, false, false]);
  });

  it('the pane: ◆ YOU, the strip with sol and NERVE, and the room as the banner', () => {
    openCharacterSheet(document.body, { player: { ...hicks, kit, room: '/scenes/karasu/the-tilt/room.png' } });
    expect(document.querySelector('.character-sheet')!.classList.contains('scr-holo')).toBe(true);
    expect(document.querySelector('.scr-head')!.textContent).toBe('◆ YOUSOL 1,240 · NERVE 3/4ESC');
    expect(document.querySelector<HTMLElement>('.cs-art')!.style.backgroundImage).toContain('/scenes/karasu/the-tilt/room.png');
  });

  it('with no room the banner is a hatch', () => {
    openCharacterSheet(document.body, { player: hicks });
    expect(document.querySelector('.cs-art')!.classList.contains('cs-noart')).toBe(true);
  });

  it('STATS: each number and its bar', () => {
    openCharacterSheet(document.body, { player: { ...hicks, kit }, page: 'stats' });
    const tech = [...document.querySelectorAll('.cs-stat')].find((n) => n.querySelector('.cs-k')!.textContent === 'TECH')!;
    expect(tech.querySelector('.cs-v')!.textContent).toBe('7');
    expect(tech.querySelectorAll('.cs-bar i.on')).toHaveLength(7);
  });

  it('STREET: NERVE, then the district here first and the rest by rep, leaving out any with neither rep nor heat', () => {
    openCharacterSheet(document.body, { player: { ...hicks, kit }, page: 'street' });
    expect(document.querySelector('.cs-top')!.textContent).toBe('NERVE3 / 4');
    const rows = [...document.querySelectorAll('.cs-dist:not(.cs-dist-head)')];
    expect(rows.map((r) => r.querySelector('.cs-dist-name')!.textContent)).toEqual(['KARASU', 'VELVET', 'STRAND']);
    expect(rows[0].classList.contains('here')).toBe(true);
    expect(rows[2].querySelector('.cs-rep-n')!.textContent).toBe('9');
    expect(rows[2].querySelector('.cs-heat-n')!.textContent).toBe('5');
    expect(rows[1].querySelector('.cs-heat-n')!.classList.contains('none')).toBe(true);
    expect(document.querySelector('[data-section="districts"]')!.textContent).toContain('KARASU HOLDS YOU AS KNOWN.');
  });

  it('STREET off the map: no row is here and no tier is named', () => {
    openCharacterSheet(document.body, { player: { ...hicks, kit: { ...kit, here: null } }, page: 'street' });
    expect(document.querySelector('.cs-dist.here')).toBeNull();
    expect(document.querySelector('[data-section="districts"]')!.textContent).not.toContain('HOLDS YOU');
  });

  it('KIT: the decks with their terms, CARRY on the ones left at home, cover by name', () => {
    const onCarry = vi.fn();
    openCharacterSheet(document.body, { player: { ...hicks, kit }, page: 'kit', onCarry });
    expect(document.querySelector('.cs-wallet.live .cs-amt')!.firstChild!.textContent).toBe('1,240');
    const on = document.querySelector('.cs-deck.on')!;
    expect(on.querySelector('.cs-deck-name')!.textContent).toBe('Stall build');
    expect(on.querySelector('.cs-deck-terms')!.textContent).toBe('Q2 · 2 SLOTS · HEAT 0 · FRAGILE');
    expect(on.querySelector('.cs-carry')).toBeNull();
    document.querySelector<HTMLButtonElement>('.cs-carry')!.click();
    expect(onCarry).toHaveBeenCalledWith('dock-slate');
    expect(document.querySelector('[data-section="cover"]')!.textContent).toContain('BURNER×2');
  });

  it('a refusal survives turning away from KIT and back, and a fresh kit clears it', () => {
    const sheet = openCharacterSheet(document.body, { player: { ...hicks, kit }, page: 'stats' });
    sheet.refusal('Not mid-job.');
    sheet.turnPage(1);
    sheet.turnPage(1);
    expect(document.querySelector('.cs-deck-why')!.textContent).toBe('Not mid-job.');
    sheet.setKit({ ...kit, sol: 900 });
    expect(document.querySelector('.cs-deck-why')!.textContent).toBe('');
  });

  it('a fresh kit redraws the page up and the strip; a refusal shows under the decks', () => {
    const sheet = openCharacterSheet(document.body, { player: { ...hicks, kit }, page: 'kit' });
    sheet.setKit({ ...kit, deck: slate, sol: 900 });
    expect(document.querySelector('.cs-deck.on .cs-deck-name')!.textContent).toBe('Dock slate');
    expect(document.querySelector('.cs-strip')!.textContent).toBe('SOL 900 · NERVE 3/4');
    sheet.refusal('Not mid-job.');
    expect(document.querySelector('.cs-deck-why')!.textContent).toBe('Not mid-job.');
  });

  it('the wardrobe is live: it names the outfit worn and the figure wears it', () => {
    openCharacterSheet(document.body, { player: { ...hicks, outfit: 'home', baseOutfit: 'outdoors' } });
    const w = document.querySelector<HTMLElement>('.cs-wardrobe')!;
    expect(w.classList.contains('planned')).toBe(false);
    expect(w.textContent).not.toContain('NOT YET');
    expect(w.querySelector('.cs-outfit')!.textContent).toBe('HOME');
    expect(w.querySelector('.cs-scale')!.textContent).toBe('2/2');
    expect(document.querySelector('.cs-img')!.getAttribute('src')).toBe('/api/agents/hicks/outfit/home');
  });

  it('‹ › and ← → change the outfit, tell onOutfit, and dress the figure; the plain sprite is null', () => {
    const onOutfit = vi.fn();
    openCharacterSheet(document.body, { player: { ...hicks, outfits: ['work', 'home'] }, onOutfit });
    const label = () => document.querySelector('.cs-outfit')!.textContent;
    const src = () => document.querySelector('.cs-img')!.getAttribute('src');
    expect(label()).toBe('BASE');
    expect(src()).toBe('/api/persona/sprite?as=hicks');
    document.querySelectorAll<HTMLButtonElement>('.cs-arrow')[1].click();
    expect(label()).toBe('WORK');
    expect(src()).toBe('/api/agents/hicks/outfit/work');
    const ev = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(label()).toBe('BASE');
    expect(src()).toBe('/api/persona/sprite?as=hicks');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(label()).toBe('HOME');
    expect(onOutfit.mock.calls).toEqual([['work'], [null], ['home']]);
  });

  it('an outfit that does not save goes back to the last one', async () => {
    openCharacterSheet(document.body, { player: { ...hicks, outfits: ['work', 'home'] }, onOutfit: () => Promise.reject(new Error('no-playthrough')) });
    document.querySelectorAll<HTMLButtonElement>('.cs-arrow')[1].click();
    expect(document.querySelector('.cs-outfit')!.textContent).toBe('WORK');
    await new Promise((r) => setTimeout(r));
    expect(document.querySelector('.cs-outfit')!.textContent).toBe('BASE');
  });

  it('with no outfits the arrows are off and the label says AS YOU ARE', () => {
    const onOutfit = vi.fn();
    openCharacterSheet(document.body, { player: { name: 'Vee', sprite: null }, onOutfit });
    expect(document.querySelector('.cs-outfit')!.textContent).toBe('AS YOU ARE');
    expect([...document.querySelectorAll<HTMLButtonElement>('.cs-arrow')].every((b) => b.disabled)).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(onOutfit).not.toHaveBeenCalled();
  });

  it('comes up with the shared screen: glitch-in, and the screen holds the page', () => {
    openCharacterSheet(document.body, { player: hicks });
    const screen = document.querySelector<HTMLElement>('.scr-screen')!;
    expect(screen.classList.contains('scr-glitch-in')).toBe(true);
    expect(screen.querySelector('.cs-pages')).not.toBeNull();
  });

  it('Esc closes it (and goes no further): onClose at once, gone once the glitch-out has run', () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      const sheet = openCharacterSheet(document.body, { player: hicks, onClose });
      const later = vi.fn();
      window.addEventListener('keydown', later);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
      window.removeEventListener('keydown', later);
      expect(later).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(document.querySelector('.scr-screen')!.classList.contains('scr-glitch-out')).toBe(true);
      expect(document.querySelector('.character-sheet')!.classList.contains('scr-closing')).toBe(true);
      vi.advanceTimersByTime(SHEET_GLITCH_OUT_MS);
      expect(document.querySelector('.character-sheet')).toBeNull();
      sheet.close();
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a click on the backdrop closes it; a click on the screen does not', () => {
    const onClose = vi.fn();
    openCharacterSheet(document.body, { player: hicks, onClose, reducedMotion: true });
    document.querySelector<HTMLElement>('.scr-screen')!.click();
    expect(onClose).not.toHaveBeenCalled();
    document.querySelector<HTMLElement>('.character-sheet')!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reduced motion: no glitch, and it goes at once', () => {
    const sheet = openCharacterSheet(document.body, { player: hicks, reducedMotion: true });
    expect(document.querySelector('.scr-screen')!.classList.contains('scr-glitch-in')).toBe(false);
    sheet.close();
    expect(document.querySelector('.character-sheet')).toBeNull();
  });
});

describe('the pages', () => {
  const filed = {
    ...hicks,
    bio: ['Grew up in Old Town.', 'Netrunner.'],
    facts: [{ label: 'KNOWN FOR', value: 'Finding the gap.' }],
  };
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
  const page = () => $('.cs-page-tab.on').dataset.page;
  it('opens on FILE: the bio paragraphs and the facts, the other pages not drawn', () => {
    openCharacterSheet(document.body, { player: filed });
    expect(page()).toBe('file');
    expect([...document.querySelectorAll('.cs-bio p')].map((p) => p.textContent)).toEqual(['Grew up in Old Town.', 'Netrunner.']);
    expect($('.cs-facts dt').textContent).toBe('KNOWN FOR');
    expect($('.cs-facts dd').textContent).toBe('Finding the gap.');
    expect(document.querySelector('.cs-cols')).toBeNull();
  });

  it('turnPage: FILE → STATS → STREET → KIT and back; past either end it says no (the cycle goes on)', () => {
    const sheet = openCharacterSheet(document.body, { player: filed });
    expect(sheet.turnPage(-1)).toBe(false);
    expect(page()).toBe('file');
    for (const to of ['stats', 'street', 'kit']) {
      expect(sheet.turnPage(1)).toBe(true);
      expect(page()).toBe(to);
    }
    expect(sheet.turnPage(1)).toBe(false);
    expect(page()).toBe('kit');
    for (const to of ['street', 'stats', 'file']) {
      expect(sheet.turnPage(-1)).toBe(true);
      expect(page()).toBe(to);
    }
    expect($('.cs-filepage')).not.toBeNull();
  });

  it('page: kit opens it on KIT (the cycle coming back into YOU), and turnPage(-1) goes back to STREET', () => {
    const sheet = openCharacterSheet(document.body, { player: filed, page: 'kit' });
    expect(page()).toBe('kit');
    expect(sheet.turnPage(-1)).toBe(true);
    expect(page()).toBe('street');
  });

  it('a click on a page tab shows that page', () => {
    openCharacterSheet(document.body, { player: filed });
    $<HTMLButtonElement>('.cs-page-tab[data-page="stats"]').click();
    expect(page()).toBe('stats');
    expect($('.cs-cols [data-section="stats"]')).not.toBeNull();
    $<HTMLButtonElement>('.cs-page-tab[data-page="file"]').click();
    expect(page()).toBe('file');
  });

  it('with no bio and no facts FILE says No file.', () => {
    openCharacterSheet(document.body, { player: hicks });
    expect($('.cs-filepage').textContent).toBe('No file.');
    expect(document.querySelector('.cs-bio')).toBeNull();
    expect(document.querySelector('.cs-facts')).toBeNull();
  });

  it('a bio without facts leaves the FACTS column out', () => {
    openCharacterSheet(document.body, { player: { ...hicks, bio: ['Just this.'] } });
    expect(document.querySelector('.cs-bio')).not.toBeNull();
    expect(document.querySelector('.cs-facts')).toBeNull();
  });

  it('← → still dress you on FILE', () => {
    const onOutfit = vi.fn();
    openCharacterSheet(document.body, { player: { ...filed, outfits: ['work', 'home'] }, onOutfit });
    expect(page()).toBe('file');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(onOutfit).toHaveBeenCalledWith('home');
  });
});
