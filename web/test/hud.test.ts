import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Atmosphere } from '../../shared/types';
import { Hud } from '../src/ui/hud';

const atmo = (over: Partial<Atmosphere>): Atmosphere => ({
  ambient: '#101020',
  ambientLevel: 0.3,
  weather: 'none',
  weatherLevel: 0,
  fog: 0,
  timeOfDay: 'night',
  ...over,
});

const huds: Hud[] = [];

function setup() {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const hud = new Hud(root);
  huds.push(hud);
  return { root, hud };
}

describe('Hud', () => {
  afterEach(() => {
    while (huds.length > 0) huds.pop()!.dispose();
    vi.useRealTimers();
  });

  it('shows weather as CLEAR or KIND NN%', () => {
    const { root, hud } = setup();
    const weather = () => root.querySelector('.weather')!.textContent;
    hud.setAtmosphere(atmo({ weather: 'none', weatherLevel: 0.5 }));
    expect(weather()).toBe('CLEAR');
    hud.setAtmosphere(atmo({ weather: 'rain', weatherLevel: 0.8 }));
    expect(weather()).toBe('RAIN 80%');
  });

  it('shows the scene name in caps', () => {
    const { root, hud } = setup();
    hud.setScene('Ribbon Rooftop');
    expect(root.querySelector('.scene')!.textContent).toBe('RIBBON ROOFTOP');
  });

  it('shows local HH:MM and updates the clock every 30 s', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 2, 14, 50));
    const { root } = setup();
    const clock = () => root.querySelector('.clock')!.textContent;
    expect(clock()).toBe('02:14');
    vi.advanceTimersByTime(30_000);
    expect(clock()).toBe('02:15');
  });

  it("the story clock, once the room has one, stands in for local time; null puts local time back", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 2, 14, 50));
    const { root, hud } = setup();
    const clock = () => root.querySelector('.clock')!.textContent;
    hud.setClock(1200);
    expect(clock()).toBe('DAY 1 · THU 20:00');
    vi.advanceTimersByTime(30_000);
    expect(clock()).toBe('DAY 1 · THU 20:00');
    hud.setClock(null);
    expect(clock()).toBe('02:15');
  });

  it('dispose() stops the clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 2, 14, 50));
    const { root, hud } = setup();
    hud.dispose();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(root.querySelector('.clock')!.textContent).toBe('02:14');
  });
});

describe('Hud notice', () => {
  it('shows a visible notice and hides it again', () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const hud = new Hud(root);
    const notice = root.querySelector('.notice') as HTMLElement;
    expect(notice.hidden).toBe(true);
    hud.setNotice('// RENDERER OFFLINE');
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe('// RENDERER OFFLINE');
    hud.setNotice(null);
    expect(notice.hidden).toBe(true);
    hud.dispose();
  });

  it('shows a PEOPLE link that calls back on click and Enter; no JOURNAL, CONTACTS or LEADS', () => {
    const { root, hud } = setup();
    const onClick = vi.fn();
    expect(root.querySelector<HTMLElement>('.hud-people')!.hidden).toBe(true);
    hud.setPeople(onClick);
    expect(root.querySelector('.hud-journal, .hud-contacts, .hud-leads')).toBeNull();
    const link = root.querySelector<HTMLElement>('.hud-people')!;
    expect(link.hidden).toBe(false);
    expect(link.textContent).toBe('PEOPLE');
    link.click();
    const later = vi.fn();
    window.addEventListener('keydown', later);
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(2);
    expect(later).not.toHaveBeenCalled(); // Enter on the link doesn't also turn a feed page
    window.removeEventListener('keydown', later);
  });

});

describe('Hud fit (one bar: tighten, cut long names, then drop weather, then the clock)', () => {
  // A fake layout: the bar's content is `need` px wide at full size; the snug type saves 40px, the
  // tight type 80px, then the weather 120px more (with its dot), the clock 90px, and the screens
  // cut to a letter 50px. The bar is `room` px.
  let room = 0;
  const need = 1000;
  const saved: Array<[string, PropertyDescriptor]> = [];
  function stub(prop: 'scrollWidth' | 'clientWidth', get: (this: HTMLElement) => number) {
    saved.push([prop, Object.getOwnPropertyDescriptor(Element.prototype, prop)!]);
    Object.defineProperty(Element.prototype, prop, { configurable: true, get });
  }
  afterEach(() => {
    // Newest first: a test that stubs twice must end on the real getters, not its first stub.
    for (const [prop, desc] of saved.splice(0).reverse()) Object.defineProperty(Element.prototype, prop, desc);
    while (huds.length > 0) huds.pop()!.dispose();
  });
  function fitHud(width: number) {
    room = width;
    stub('clientWidth', function () {
      return this.classList.contains('hud-bar') ? room : 0;
    });
    stub('scrollWidth', function () {
      if (!this.classList.contains('hud-bar')) return 0;
      const saved = { full: 0, snug: 40, tight: 80, 'no-weather': 200, 'no-clock': 290, short: 340 }[this.dataset.fit ?? 'full']!;
      const used = need - saved;
      return Math.max(room, used);
    });
    const { root, hud } = setup();
    const bar = root.querySelector<HTMLElement>('.hud-bar')!;
    return { root, hud, bar };
  }

  it('both groups sit in one bar', () => {
    const { bar } = fitHud(1200);
    expect(bar.querySelector('.hud-left')).not.toBeNull();
    expect(bar.querySelector('.hud-right')).not.toBeNull();
  });

  it('everything shows while it fits', () => {
    const { bar } = fitHud(1200);
    expect(bar.dataset.fit).toBe('full');
  });

  it('short of room, the type tightens before anything goes', () => {
    expect(fitHud(970).bar.dataset.fit).toBe('snug');
    expect(fitHud(930).bar.dataset.fit).toBe('tight');
  });

  it('tight and still short, the weather goes first', () => {
    const { bar } = fitHud(850);
    expect(bar.dataset.fit).toBe('no-weather');
  });

  it('shorter still, the clock goes too; the rest stays', () => {
    const { bar } = fitHud(750);
    expect(bar.dataset.fit).toBe('no-clock');
  });

  it('narrowest, PEOPLE and YOU shorten to their Alt keys; wide again, they come back', () => {
    const { hud, root, bar } = fitHud(680);
    hud.setPeople(() => {});
    hud.setYou(() => {});
    expect(bar.dataset.fit).toBe('short');
    expect(root.querySelector('.hud-people')!.textContent).toBe('P');
    expect(root.querySelector('.hud-you')!.textContent).toBe('Y');
    room = 1200;
    window.dispatchEvent(new Event('resize'));
    expect(bar.dataset.fit).toBe('full');
    expect(root.querySelector('.hud-people')!.textContent).toBe('PEOPLE');
  });

  it('a window made wide again brings them back', () => {
    const { bar } = fitHud(750);
    room = 1200;
    window.dispatchEvent(new Event('resize'));
    expect(bar.dataset.fit).toBe('full');
  });

  it('the room name keeps its full text as a tooltip', () => {
    const { root, hud } = fitHud(1200);
    hud.setScene('Lowlight Intake');
    expect(root.querySelector<HTMLElement>('.scene')!.title).toBe('LOWLIGHT INTAKE');
  });

  it('short of room, the screens drop to their letters, no underline', () => {
    const { hud, root, bar } = fitHud(680);
    hud.setPeople(() => {});
    expect(bar.dataset.fit).toBe('short');
    expect(root.querySelector('.hud-people')!.textContent).toBe('P');
    expect(root.querySelector('.hud-people u')).toBeNull();
  });
});

describe('Hud fit order: the type tightens before a name is cut', () => {
  const saved: Array<[string, PropertyDescriptor]> = [];
  afterEach(() => {
    for (const [prop, desc] of saved.splice(0)) Object.defineProperty(Element.prototype, prop, desc);
    while (huds.length > 0) huds.pop()!.dispose();
  });

  it('a room name cut at full size tightens the bar; one cut only when tight is let be', () => {
    // The bar always fits (its names shrink); the room name is cut at full and snug size only.
    for (const prop of ['scrollWidth', 'clientWidth'] as const) {
      saved.push([prop, Object.getOwnPropertyDescriptor(Element.prototype, prop)!]);
      Object.defineProperty(Element.prototype, prop, {
        configurable: true,
        get(this: HTMLElement) {
          if (!this.classList.contains('scene')) return 100;
          const fit = this.closest<HTMLElement>('.hud-bar')?.dataset.fit;
          return prop === 'scrollWidth' && (fit === 'full' || fit === 'snug') ? 160 : 100;
        },
      });
    }
    const { root, hud } = setup();
    hud.setScene('A Very Long Room Name Indeed');
    expect(root.querySelector<HTMLElement>('.hud-bar')!.dataset.fit).toBe('tight');
  });

  it('PEOPLE sits between YOU and MAP, says Alt+P, and calls its handler; no SAVE or DICE in the bar', () => {
    const { root, hud } = setup();
    const onPeople = vi.fn();
    hud.setYou(() => {});
    hud.setPeople(onPeople);
    hud.setSave(() => {});
    hud.setMapLink(() => {});
    const labels = [...root.querySelectorAll<HTMLElement>('.hud-you, .hud-people, .hud-map')].map((b) => b.className.split(' ')[0]);
    expect(labels).toEqual(['hud-you', 'hud-people', 'hud-map']);
    expect(root.querySelector('.hud-save, .hud-dice')).toBeNull();
    const people = root.querySelector<HTMLElement>('.hud-people')!;
    expect(people.title).toBe('People (Alt+P)');
    people.click();
    expect(onPeople).toHaveBeenCalledTimes(1);
  });

  it('setOpen lights the open screen\'s word (YOU, PEOPLE or MAP), one at a time', () => {
    const { root, hud } = setup();
    hud.setYou(() => {});
    hud.setPeople(() => {});
    hud.setMapLink(() => {});
    const lit = () => [...root.querySelectorAll<HTMLElement>('.hud-right .open')].map((b) => b.className.split(' ')[0]);
    expect(lit()).toEqual([]);
    hud.setOpen('people');
    expect(lit()).toEqual(['hud-people']);
    hud.setOpen('map');
    expect(lit()).toEqual(['hud-map']);
    hud.setOpen(null);
    expect(lit()).toEqual([]);
  });
});

describe('Hud Keys bar and SYS', () => {
  afterEach(() => {
    while (huds.length > 0) huds.pop()!.dispose();
    document.body.innerHTML = '';
  });
  const q = (root: HTMLElement, sel: string) => root.querySelector<HTMLElement>(sel)!;
  let onSave2 = vi.fn();
  function setup2() {
    onSave2 = vi.fn();
    const { root, hud } = setup();
    hud.setSave(onSave2);
    return { root, hud, sys: q(root, '.hud-sys') };
  }
  function full() {
    const { root, hud } = setup();
    hud.setBackLink(() => {});
    hud.setYou(() => {});
    hud.setPeople(() => {});
    hud.setSave(() => {});
    hud.setMapLink(() => {});
    return { root, hud, sys: q(root, '.hud-sys') };
  }

  it('SAVE is the first row of SYS: Enter or a click saves (SYS closes); Alt+S still saves', () => {
    const { root, hud, sys } = setup2();
    sys.click();
    const row = q(root, '.sys-row[data-row="save"]');
    expect(row.hidden).toBe(false);
    expect(row.textContent).toBe('SAVEALT+S');
    expect(q(root, '.sys-row.on').dataset.row).toBe('save');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(onSave2).toHaveBeenCalledTimes(1);
    expect(q(root, '.sys-menu').hidden).toBe(true);
    sys.click();
    row.click();
    expect(onSave2).toHaveBeenCalledTimes(2);
    hud.pressSave();
    expect(onSave2).toHaveBeenCalledTimes(3);
  });

  it('while she replies the SAVE row reads WAIT FOR <NAME> and does nothing', () => {
    const { root, hud, sys } = setup2();
    hud.setSaveBusy('Nix');
    sys.click();
    const row = q(root, '.sys-row[data-row="save"]');
    expect(row.querySelector('.sys-value')!.textContent).toBe('WAIT FOR NIX');
    row.click();
    expect(onSave2).not.toHaveBeenCalled();
    hud.setSaveBusy(null);
    expect(row.querySelector('.sys-value')!.textContent).toBe('ALT+S');
  });

  it('without setSave there is no SAVE row', () => {
    const { root } = setup();
    expect(q(root, '.sys-row[data-row="save"]').hidden).toBe(true);
  });

  it('the right side, in order: texts (promised texts spec §6), notice, YOU, PEOPLE, QUEST, CREW, MAP, SYS', () => {
    const { root } = full();
    expect([...q(root, '.hud-right').children].map((c) => c.className.split(' ')[0])).toEqual([
      'hud-texts', 'notice', 'hud-you', 'hud-people', 'hud-quest', 'hud-crew', 'hud-map', 'hud-sys',
    ]);
    expect(root.querySelector('.hud-sound, .hud-speed, .hud-bar .hud-model')).toBeNull();
  });

  it('each screen with a shortcut underlines its letter, names the chord and carries its key', () => {
    const { root } = full();
    for (const [cls, k, t] of [['hud-people', 'P', 'People (Alt+P)'], ['hud-you', 'Y', 'You (Alt+Y)']]) {
      expect(q(root, `.${cls}`).dataset.key).toBe(k);
      expect(q(root, `.${cls}`).title).toBe(t);
      expect(q(root, `.${cls} u`).textContent).toBe(k);
    }
    expect(q(root, '.hud-back').textContent).toBe('‹');
    expect(q(root, '.hud-back').dataset.key).toBe('T');
    expect(q(root, '.hud-back').title).toBe('Title (Alt+T)');
    expect(q(root, '.hud-map').dataset.key).toBeUndefined();
  });

  it('holding Alt lights the keycaps; letting go or leaving the window puts them out', () => {
    const { root } = full();
    const bar = q(root, '.hud-bar');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' }));
    expect(bar.classList.contains('alt-held')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }));
    expect(bar.classList.contains('alt-held')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' }));
    window.dispatchEvent(new Event('blur'));
    expect(bar.classList.contains('alt-held')).toBe(false);
  });

  it('SYS: the link light, SYS / LINK DOWN / SIGNAL LOST, red when down; the LINK row follows, open or closed', () => {
    const { root, hud, sys } = full();
    const label = () => q(root, '.sys-name').textContent;
    hud.setLink('ok');
    expect(label()).toBe('SYS');
    expect(q(root, '.hud-sys .link').dataset.status).toBe('ok');
    expect(sys.classList.contains('down')).toBe(false);
    sys.click();
    expect(q(root, '.sys-menu').hidden).toBe(false);
    hud.setLink('down');
    expect(label()).toBe('LINK DOWN');
    expect(sys.classList.contains('down')).toBe(true);
    expect(q(root, '.sys-row[data-row="link"] .sys-value').textContent).toBe('DOWN');
    hud.setLink('lost');
    expect(label()).toBe('SIGNAL LOST');
    hud.setLink('socket-down');
    expect(label()).toBe('LINK DOWN');
    expect(q(root, '.hud-sys .link').dataset.status).toBe('down');
  });

  it('SYS shows ♪ until the sound starts; the wheel over the closed button steps the volume; SOUND row follows', () => {
    const { root, hud, sys } = full();
    const onToggle = vi.fn();
    const onWheel = vi.fn();
    hud.setSoundControl({ onToggle, onWheel, onMusic: vi.fn(), onAmbient: vi.fn() });
    hud.showSound({ kind: 'locked' });
    expect(q(root, '.sys-note').textContent).toBe('♪');
    expect(sys.title).toContain('Click anywhere for sound');
    hud.showSound({ kind: 'on', volume: 0.6, muted: false, music: 1, ambient: 1 });
    expect(q(root, '.sys-note').textContent).toBe('');
    expect(q(root, '.sys-row[data-row="sound"] .sys-value').textContent).toBe('60%');
    const up = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    sys.dispatchEvent(up);
    expect(onWheel).toHaveBeenLastCalledWith(1);
    expect(up.defaultPrevented).toBe(true);
    sys.click();
    q(root, '.sys-row[data-row="sound"]').click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('a click on SYS opens the menu, again closes it; a click elsewhere or opening a screen closes it', () => {
    const { root, sys } = full();
    const menu = () => q(root, '.sys-menu');
    sys.click();
    expect(menu().hidden).toBe(false);
    sys.click();
    expect(menu().hidden).toBe(true);
    sys.click();
    document.body.click();
    expect(menu().hidden).toBe(true);
    sys.click();
    q(root, '.hud-people').click();
    expect(menu().hidden).toBe(true);
  });

  it('a click on SYS still reaches the document (so the MODEL menu closes), without closing SYS (review M2)', () => {
    const { root, sys } = full();
    const doc = vi.fn();
    document.addEventListener('click', doc);
    sys.click();
    expect(doc).toHaveBeenCalledTimes(1);
    expect(q(root, '.sys-menu').hidden).toBe(false);
    document.removeEventListener('click', doc);
  });

  it('focus moving elsewhere (Tab, a save field) closes SYS (review M3)', () => {
    const { root, sys } = full();
    const field = document.createElement('input');
    document.body.append(field);
    sys.click();
    sys.focus();
    expect(q(root, '.sys-menu').hidden).toBe(false);
    field.focus();
    expect(q(root, '.sys-menu').hidden).toBe(true);
  });

  it('SYS says whether it is open (aria-expanded); Space opens it too (review M4)', () => {
    const { root, sys } = full();
    expect(sys.getAttribute('aria-expanded')).toBe('false');
    sys.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(q(root, '.sys-menu').hidden).toBe(false);
    expect(sys.getAttribute('aria-expanded')).toBe('true');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(sys.getAttribute('aria-expanded')).toBe('false');
  });

  it('a lost Alt release (no keyup, no blur): the next key or mouse move without Alt clears the underlines', () => {
    const { root } = full();
    const bar = q(root, '.hud-bar');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }));
    expect(bar.classList.contains('alt-held')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));
    expect(bar.classList.contains('alt-held')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }));
    window.dispatchEvent(new MouseEvent('pointermove', { altKey: false }));
    expect(bar.classList.contains('alt-held')).toBe(false);
  });

  it('SYS closes on a pointerdown elsewhere, even over something that keeps its clicks to itself', () => {
    const { root, sys } = full();
    const greedy = document.createElement('div');
    greedy.addEventListener('click', (e) => e.stopPropagation());
    document.body.append(greedy);
    sys.click();
    expect(q(root, '.sys-menu').hidden).toBe(false);
    greedy.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(q(root, '.sys-menu').hidden).toBe(true);
  });

  it('a mouse press on SYS keeps keyboard focus where it was (typing still goes to the prompt)', () => {
    const { sys } = full();
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    sys.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });

  it('setModel(null) hides the MODEL row; setModel(label, fn) shows it and its click runs fn', () => {
    const { root, hud, sys } = full();
    const row = () => q(root, '.sys-row[data-row="model"]');
    hud.setModel(null, null);
    expect(row().hidden).toBe(true);
    const fn = vi.fn();
    hud.setModel('GLM 5.2', fn);
    expect(row().hidden).toBe(false);
    expect(q(root, '.hud-model').textContent).toBe('GLM 5.2 ›');
    sys.click();
    row().click();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(q(root, '.sys-menu').hidden).toBe(true);
    hud.setModel('SONNET 5.5', null);
    expect(row().hidden).toBe(true);
  });

  it('setTextSpeedControl: a speed word calls onPick, ← → on TEXT call onStep', () => {
    const { root, hud, sys } = full();
    const onPick = vi.fn();
    const onStep = vi.fn();
    hud.setTextSpeedControl({ onPick, onStep });
    hud.showTextSpeed('fast');
    expect(q(root, 'i[data-speed].on').textContent).toBe('FAST');
    q(root, 'i[data-speed="slow"]').click();
    expect(onPick).toHaveBeenCalledWith('slow');
    sys.click();
    // SAVE, then SOUND, then TEXT.
    for (let i = 0; i < 2; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('CHAT KEYS sits under FONT, FONT under TEXT SIZE: a word picks it, ← → switch to the other (subtitle chat box §7)', () => {
    const { root, hud, sys } = full();
    const onPick = vi.fn();
    hud.setChatKeysControl(onPick);
    hud.showChatKeys('glyphs');
    const row = q(root, '.sys-row[data-row="keys"]');
    expect(row.previousElementSibling).toBe(q(root, '.sys-row[data-row="font"]'));
    expect(q(root, '.sys-row[data-row="font"]').previousElementSibling).toBe(q(root, '.sys-row[data-row="size"]'));
    expect(row.querySelector('.sys-label')!.textContent).toBe('CHAT KEYS');
    expect(q(root, 'i[data-keys].on').textContent).toBe('GLYPHS');
    q(root, 'i[data-keys="labels"]').click();
    expect(onPick).toHaveBeenLastCalledWith('labels');
    sys.click();
    // SAVE is the first row now: one more step down to CHAT KEYS.
    for (let i = 0; i < 5; i++) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    expect(row.classList.contains('on')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    expect(onPick).toHaveBeenLastCalledWith('labels');
    hud.showChatKeys('labels');
    expect(q(root, 'i[data-keys].on').textContent).toBe('LABELS');
    expect(q(root, 'i[data-keys="glyphs"]').classList.contains('on')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }));
    expect(onPick).toHaveBeenLastCalledWith('glyphs');
  });
});

describe('the texts signal (promised texts spec §6)', () => {
  afterEach(() => {
    while (huds.length > 0) huds.pop()!.dispose();
    vi.restoreAllMocks();
  });
  it('NIX · 1 TEXT, 2 TEXTS · NIX, HICKS, and nothing when there are none', () => {
    const { root, hud } = setup();
    const el = () => root.querySelector<HTMLElement>('.hud-texts')!;
    expect(el().hidden).toBe(true);
    hud.setTexts([{ id: 'nix', name: 'Nix' }]);
    expect(el().hidden).toBe(false);
    expect(el().textContent).toBe('NIX · 1 TEXT');
    hud.setTexts([{ id: 'nix', name: 'Nix' }, { id: 'hicks', name: 'Hicks' }]);
    expect(el().textContent).toBe('2 TEXTS · NIX, HICKS');
    hud.setTexts([]);
    expect(el().hidden).toBe(true);
  });
  it('Enter on it opens the deck too (final review M1)', () => {
    const { root, hud } = setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    hud.setTexts([{ id: 'nix', name: 'Nix' }]);
    root.querySelector<HTMLElement>('.hud-texts')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(open).toHaveBeenCalledWith('/deck', '_blank');
  });
  it('the bar refits when it appears (final review M2)', () => {
    const { hud } = setup();
    const fit = vi.spyOn(hud as unknown as { fit(): void }, 'fit');
    hud.setTexts([{ id: 'nix', name: 'Nix' }, { id: 'hicks', name: 'Hicks' }]);
    expect(fit).toHaveBeenCalled();
  });
  it('a click opens the deck in a new tab', () => {
    const { root, hud } = setup();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    hud.setTexts([{ id: 'nix', name: 'Nix' }]);
    root.querySelector<HTMLElement>('.hud-texts')!.click();
    expect(open).toHaveBeenCalledWith('/deck', '_blank');
  });

  it("shows KARASU · POWER OUT while your room's district is dark (blackouts phase 3 §4)", () => {
    const { root, hud } = setup();
    const line = () => root.querySelector<HTMLElement>('.hud-power')!;
    expect(line().hidden).toBe(true);
    hud.setPower({ name: 'Karasu' });
    expect(line().hidden).toBe(false);
    expect(line().textContent).toBe('KARASU · POWER OUT');
    hud.setPower(null);
    expect(line().hidden).toBe(true);
  });
});

