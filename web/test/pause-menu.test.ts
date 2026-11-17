import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPauseMenu, type SettingsPage } from '../src/room/pause-menu';

/** A stand-in for the HUD's SYS page: a `.sys-menu` it moves into the host, and its watchers. */
function fakeSettings() {
  const el = document.createElement('div');
  el.className = 'sys-menu';
  el.hidden = true;
  const watchers = new Set<(open: boolean) => void>();
  const set = (open: boolean) => {
    if (el.hidden === !open) return;
    el.hidden = !open;
    if (!open) el.remove();
    for (const w of [...watchers]) w(open);
  };
  const page: SettingsPage & { el: HTMLElement } = {
    el,
    open: vi.fn((host: HTMLElement) => {
      host.append(el);
      set(true);
    }),
    close: vi.fn(() => set(false)),
    watch: (cb) => {
      watchers.add(cb);
      return () => watchers.delete(cb);
    },
  };
  return page;
}

const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
const rows = () => [...document.querySelectorAll<HTMLElement>('.pause-row')];
const on = () => document.querySelector<HTMLElement>('.pause-row.on')?.dataset.row;

function open(o: Partial<Parameters<typeof openPauseMenu>[1]> = {}) {
  const h = {
    where: 'THE NOODLE STALL · SAT 05:30 · WITH CASS',
    onSave: vi.fn(),
    onLoad: vi.fn(),
    settings: fakeSettings(),
    onTitle: vi.fn(),
    onClose: vi.fn(),
    reducedMotion: true,
    ...o,
  };
  const menu = openPauseMenu(document.body, h);
  menus.push(menu);
  return { h, menu };
}
const menus: { close(): void }[] = [];

afterEach(() => {
  for (const m of menus.splice(0)) m.close();
  document.body.replaceChildren();
});

describe('the pause menu', () => {
  it('lists RESUME · SAVE · LOAD · SETTINGS · TITLE with RESUME lit, and where you are', () => {
    open();
    expect(rows().map((r) => r.dataset.row)).toEqual(['resume', 'save', 'load', 'settings', 'title']);
    expect(on()).toBe('resume');
    expect(document.querySelector('.pause-where')!.textContent).toBe('THE NOODLE STALL · SAT 05:30 · WITH CASS');
  });

  it('stands on the trace: no holo frame, the key line at its foot', () => {
    open();
    expect(document.querySelector('.pause-menu .hf')).toBeNull();
    expect(document.querySelector('.pause-keys')!.textContent).toBe('[↑↓] MOVE · [ENTER] PICK · [ESC] RESUME');
    expect(document.querySelector('.pause-keys b')!.textContent).toBe('[↑↓]');
  });

  it('↑↓ move (wrapping), Enter picks; each row closes the menu and calls its handler', () => {
    const { h, menu } = open();
    key('ArrowDown');
    expect(on()).toBe('save');
    key('ArrowUp');
    key('ArrowUp');
    expect(on()).toBe('title');
    key('Enter');
    expect(h.onTitle).toHaveBeenCalledTimes(1);
    expect(menu.isOpen).toBe(false);
    expect(h.onClose).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('a click on a row picks it', () => {
    const { h } = open();
    rows()[2].click();
    expect(h.onLoad).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.pause-menu')).toBeNull();
  });

  it('RESUME, Esc and a backdrop click just close it', () => {
    let o = open();
    key('Enter');
    expect(o.menu.isOpen).toBe(false);
    for (const f of [o.h.onSave, o.h.onLoad, o.h.settings.open, o.h.onTitle]) expect(f).not.toHaveBeenCalled();
    expect(o.h.onClose).toHaveBeenCalledExactlyOnceWith(true);
    o = open();
    key('Escape');
    expect(o.menu.isOpen).toBe(false);
    expect(o.h.onClose).toHaveBeenCalledExactlyOnceWith(true);
    o = open();
    const backdrop = document.querySelector<HTMLElement>('.pause-menu')!;
    backdrop.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    backdrop.click();
    expect(o.menu.isOpen).toBe(false);
    expect(o.h.onClose).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('closing it from outside is not a resume', () => {
    const { h, menu } = open();
    menu.close();
    expect(h.onClose).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('its keys go no further while open, and stop once closed', () => {
    open();
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    key('ArrowDown');
    key('Escape');
    expect(behind).not.toHaveBeenCalled();
    key('ArrowDown');
    expect(behind).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', behind);
  });

  it('SAVE while she is replying says who to wait for and stays shut; it asks again when picked', () => {
    let busy: string | null = 'Cass';
    const { h } = open({ saveBlockedBy: () => busy });
    expect(rows()[1].querySelector('small')!.textContent).toBe('WAIT FOR CASS');
    rows()[1].click();
    expect(h.onSave).not.toHaveBeenCalled();
    expect(document.querySelector('.pause-menu')).not.toBeNull();
    busy = null;
    rows()[1].click();
    expect(h.onSave).toHaveBeenCalledTimes(1);
  });

  it('a reply starting after it opened: SAVE then reads WAIT FOR and stays', () => {
    let busy: string | null = null;
    const { h } = open({ saveBlockedBy: () => busy });
    busy = 'Nix';
    rows()[1].click();
    expect(h.onSave).not.toHaveBeenCalled();
    expect(rows()[1].querySelector('small')!.textContent).toBe('WAIT FOR NIX');
  });

  it('browser shortcuts (Ctrl/Meta chords, F-keys) pass through', () => {
    open();
    const r = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, cancelable: true });
    window.dispatchEvent(r);
    expect(r.defaultPrevented).toBe(false);
    const f5 = new KeyboardEvent('keydown', { key: 'F5', cancelable: true });
    window.dispatchEvent(f5);
    expect(f5.defaultPrevented).toBe(false);
    expect(document.querySelector('.pause-menu')).not.toBeNull();
  });

  it('a click that lands outside after a press inside (the panel grew under it) does not resume', () => {
    const { menu } = open();
    document.querySelector('.pause-row')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    document.querySelector<HTMLElement>('.pause-menu')!.click();
    expect(menu.isOpen).toBe(true);
  });

  it('SETTINGS is a page in the panel: SYS opens inside it, Esc (SYS shutting) goes back to the rows on SETTINGS', () => {
    const { h, menu } = open();
    const sys = h.settings as ReturnType<typeof fakeSettings>;
    rows()[3].click();
    expect(menu.isOpen).toBe(true);
    expect(sys.open).toHaveBeenCalledExactlyOnceWith(document.querySelector('.pause-settings'));
    expect(document.querySelector('.pause-settings .sys-menu')).toBe(sys.el);
    expect(document.querySelector('.pause-title')!.textContent).toBe('SETTINGS');
    expect(document.querySelector<HTMLElement>('.pause-rows')!.hidden).toBe(true);
    expect(document.querySelector('.pause-keys')!.textContent).toBe('[↑↓] MOVE · [←→] CHANGE · [ENTER] PICK · [ESC] BACK');
    // SYS takes its own keys first; the pause lets the rest stop with it and does nothing with them.
    key('ArrowDown');
    key('Enter');
    expect(h.onSave).not.toHaveBeenCalled();
    sys.close();
    expect(menu.isOpen).toBe(true);
    expect(document.querySelector('.pause-title')!.textContent).toBe('PAUSED');
    expect(on()).toBe('settings');
    expect(document.querySelector('.pause-keys')!.textContent).toBe('[↑↓] MOVE · [ENTER] PICK · [ESC] RESUME');
    key('Escape');
    expect(menu.isOpen).toBe(false);
  });

  it("on: 'settings' opens straight on SETTINGS; closing PAUSED shuts SYS too", () => {
    const { h, menu } = open({ on: 'settings' });
    expect(h.settings.open).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.pause-title')!.textContent).toBe('SETTINGS');
    menu.close();
    expect(h.settings.close).toHaveBeenCalledTimes(1);
    expect(h.onClose).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('settingsOnly (SYS over a table or a screen): no rows, and SYS shutting closes it as a resume', () => {
    const { h, menu } = open({ settingsOnly: true });
    expect(document.querySelector<HTMLElement>('.pause-rows')!.hidden).toBe(true);
    expect(document.querySelector('.pause-keys')!.textContent).toBe('[↑↓] MOVE · [←→] CHANGE · [ENTER] PICK · [ESC] CLOSE');
    h.settings.close();
    expect(menu.isOpen).toBe(false);
    expect(h.onClose).toHaveBeenCalledExactlyOnceWith(true);
  });
});

describe('the pause menu sounds', () => {
  it('a row step on each arrow, a pick on SAVE, TITLE its own, and nothing for RESUME (the close has its sound)', () => {
    const cues: string[] = [];
    const send = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    open({ onCue: (n) => cues.push(n) });
    send('ArrowDown');
    send('ArrowUp');
    send('Enter');
    expect(cues).toEqual(['row', 'row']);
    open({ onCue: (n) => cues.push(n) });
    send('ArrowDown');
    send('Enter');
    expect(cues).toEqual(['row', 'row', 'row', 'pick']);
    open({ onCue: (n) => cues.push(n) });
    send('ArrowUp');
    send('Enter');
    expect(cues.slice(4)).toEqual(['row', 'title']);
  });
});
