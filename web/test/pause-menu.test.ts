import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPauseMenu } from '../src/room/pause-menu';

const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
const rows = () => [...document.querySelectorAll<HTMLElement>('.pause-row')];
const on = () => document.querySelector<HTMLElement>('.pause-row.on')?.dataset.row;

function open(o: Partial<Parameters<typeof openPauseMenu>[1]> = {}) {
  const h = {
    where: 'THE NOODLE STALL · SAT 05:30 · WITH CASS',
    onSave: vi.fn(),
    onLoad: vi.fn(),
    onSettings: vi.fn(),
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
    for (const f of [o.h.onSave, o.h.onLoad, o.h.onSettings, o.h.onTitle]) expect(f).not.toHaveBeenCalled();
    expect(o.h.onClose).toHaveBeenCalledExactlyOnceWith(true);
    o = open();
    key('Escape');
    expect(o.menu.isOpen).toBe(false);
    expect(o.h.onClose).toHaveBeenCalledExactlyOnceWith(true);
    o = open();
    document.querySelector<HTMLElement>('.pause-menu')!.click();
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
});
