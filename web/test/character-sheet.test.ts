import { afterEach, describe, expect, it, vi } from 'vitest';
import { openCharacterSheet, SHEET_GLITCH_OUT_MS, SHEET_SECTIONS, stepOutfit, wardrobeLabel, wardrobeOptions, wornOutfit, type SheetSection } from '../src/room/character-sheet';

const hicks = {
  name: 'Hicks',
  sprite: { url: '/api/persona/sprite?as=hicks', crop: { top: 0, bottom: 0.5 }, pixel: true as const },
  accent: '#3dff7a',
  tagline: 'Netrunner. Old Town born.',
  outfits: ['outdoors', 'home'],
  outfitUrl: (n: string) => `/api/agents/hicks/outfit/${n}`,
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

  it('every section is planned for now: NOT YET, what it will do, and no made-up values', () => {
    openCharacterSheet(document.body, { player: hicks });
    const secs = [...document.querySelectorAll<HTMLElement>('.cs-sec')];
    expect(secs.map((s) => s.dataset.section)).toEqual(['stats', 'condition', 'skills', 'sol', 'gear']);
    for (const s of secs) {
      expect(s.classList.contains('planned')).toBe(true);
      expect(s.querySelector('.cs-scale')!.textContent).toBe('NOT YET');
      expect(s.querySelector('.cs-planned')!.textContent).not.toBe('');
    }
    const keys = [...document.querySelectorAll('.cs-skills .cs-k')].map((n) => n.textContent);
    expect(keys.slice(0, 3)).toEqual(['HACKING', 'SNEAKING', 'FORGERY']);
    expect([...document.querySelectorAll('.cs-stats .cs-v')].every((n) => n.textContent === '—')).toBe(true);
  });

  it('a live section drops NOT YET and shows its scale', () => {
    const sections: SheetSection[] = SHEET_SECTIONS.map((s) => (s.id === 'skills' ? { ...s, live: true } : s));
    openCharacterSheet(document.body, { player: hicks, sections });
    const skills = document.querySelector<HTMLElement>('.cs-skills')!;
    expect(skills.classList.contains('planned')).toBe(false);
    expect(skills.querySelector('.cs-scale')!.textContent).toBe('0–5');
    expect(skills.querySelector('.cs-planned')).toBeNull();
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

  it('opens like the MAP: a // YOU heading over a CRT screen that glitches in', () => {
    openCharacterSheet(document.body, { player: hicks });
    expect(document.querySelector('.scr-head')!.textContent).toBe('// YOU[ESC] CLOSE');
    const screen = document.querySelector<HTMLElement>('.scr-screen')!;
    expect(screen.classList.contains('scr-glitch-in')).toBe(true);
    expect([...screen.children].map((c) => c.className)).toEqual(['scr-scroll', 'scr-scan', 'scr-roll', 'scr-vignette']);
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

describe('FILE and SHEET (spec 2026-10-28 §3)', () => {
  const filed = {
    ...hicks,
    bio: ['Grew up in Old Town.', 'Netrunner.'],
    facts: [{ label: 'KNOWN FOR', value: 'Finding the gap.' }],
  };
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
  const page = () => $('.cs-page-tab.on').dataset.page;
  it('opens on FILE: the bio paragraphs and the facts, SHEET hidden', () => {
    openCharacterSheet(document.body, { player: filed });
    expect(page()).toBe('file');
    expect([...document.querySelectorAll('.cs-bio p')].map((p) => p.textContent)).toEqual(['Grew up in Old Town.', 'Netrunner.']);
    expect($('.cs-facts dt').textContent).toBe('KNOWN FOR');
    expect($('.cs-facts dd').textContent).toBe('Finding the gap.');
    expect($('.cs-filepage').hidden).toBe(false);
    expect($('.cs-cols').hidden).toBe(true);
  });

  it('turnPage: forward from FILE to SHEET, back from SHEET to FILE; past either end it says no (the cycle goes on)', () => {
    const sheet = openCharacterSheet(document.body, { player: filed });
    expect(sheet.turnPage(-1)).toBe(false);
    expect(page()).toBe('file');
    expect(sheet.turnPage(1)).toBe(true);
    expect(page()).toBe('sheet');
    expect($('.cs-cols').hidden).toBe(false);
    expect($('.cs-cols [data-section="stats"]')).not.toBeNull();
    expect($('.cs-filepage').hidden).toBe(true);
    expect(sheet.turnPage(1)).toBe(false);
    expect(page()).toBe('sheet');
    expect(sheet.turnPage(-1)).toBe(true);
    expect(page()).toBe('file');
  });

  it('page: sheet opens it on SHEET (the cycle coming back into YOU), and turnPage(-1) goes on to FILE', () => {
    const sheet = openCharacterSheet(document.body, { player: filed, page: 'sheet' });
    expect(page()).toBe('sheet');
    expect($('.cs-filepage').hidden).toBe(true);
    expect(sheet.turnPage(-1)).toBe(true);
    expect(page()).toBe('file');
  });

  it('a click on a page tab shows that page', () => {
    openCharacterSheet(document.body, { player: filed });
    $<HTMLButtonElement>('.cs-page-tab[data-page="sheet"]').click();
    expect(page()).toBe('sheet');
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
