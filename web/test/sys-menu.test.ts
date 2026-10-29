import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SysMenu, type SysMenuHandlers } from '../src/ui/sys-menu';

let m: SysMenu;
let h: { [K in keyof SysMenuHandlers]-?: Mock<NonNullable<SysMenuHandlers[K]>> };

const q = (sel: string) => m.el.querySelector<HTMLElement>(sel)!;
const rows = () => [...m.el.querySelectorAll<HTMLElement>('.sys-row')].filter((r) => !r.hidden).map((r) => r.dataset.row);
const value = (row: string) => q(`.sys-row[data-row="${row}"] .sys-value`).textContent;
const lit = (row = 'sound') => m.el.querySelectorAll(`.sys-row[data-row="${row}"] .sys-meter i.on`).length;
const key = (k: string) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};
const wheel = (el: HTMLElement, deltaY: number) => el.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));

beforeEach(() => {
  h = { onVolume: vi.fn(), onMute: vi.fn(), onMusic: vi.fn(), onAmbient: vi.fn(), onTextSpeed: vi.fn(), onTextStep: vi.fn(), onSizeStep: vi.fn(), onFontStep: vi.fn(), onChatKeys: vi.fn(), onModel: vi.fn(), onThinking: vi.fn(), onOpenChange: vi.fn(), onSave: vi.fn() } as typeof h;
  m = new SysMenu(h);
  document.body.append(m.el);
});
afterEach(() => {
  m.dispose();
  m.el.remove();
});

describe('SysMenu', () => {
  it('narrator thinking: shown with MODEL, the saved word lit, a click or ← → picks', () => {
    m.showModel('SONNET 5.5');
    m.showThinking('auto');
    expect([...m.el.querySelectorAll('i[data-think]')].map((i) => i.textContent)).toEqual(['AUTO', 'OFF', 'LOW', 'MEDIUM']);
    expect(q('i[data-think].on').textContent).toBe('AUTO');
    q('i[data-think="medium"]').click();
    expect(h.onThinking).toHaveBeenLastCalledWith('medium');
    m.open();
    while (q('.sys-row.on').dataset.row !== 'think') key('ArrowDown');
    key('ArrowRight');
    expect(h.onThinking).toHaveBeenLastCalledWith('off');
    key('ArrowLeft');
    expect(h.onThinking).toHaveBeenLastCalledWith('medium');
    m.showThinking('low');
    expect(q('i[data-think].on').textContent).toBe('LOW');
    m.showModel(null);
    expect(rows()).not.toContain('think');
    expect(q('.sys-row.on').dataset.row).toBe('link');
  });


  it('SAVE: hidden until showSave; then the first row, Enter saves and closes; busy it waits', () => {
    m.showSave(true);
    m.open();
    expect(rows()[0]).toBe('save');
    expect(q('.sys-row.on').dataset.row).toBe('save');
    m.showSaveBusy('Nix');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(m.isOpen).toBe(true);
    expect(h.onSave).not.toHaveBeenCalled();
    m.showSaveBusy(null);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(m.isOpen).toBe(false);
    expect(h.onSave).toHaveBeenCalledTimes(1);
  });

  it('opens on the SOUND row with every row, in order; MODEL hidden until a label', () => {
    expect(m.isOpen).toBe(false);
    expect(m.el.hidden).toBe(true);
    m.open();
    expect(m.isOpen).toBe(true);
    expect(rows()).toEqual(['sound', 'text', 'size', 'font', 'keys', 'link']);
    m.showModel('GLM 5.2');
    expect(rows()).toEqual(['sound', 'text', 'size', 'font', 'keys', 'model', 'think', 'link']);
    expect(q('.hud-model').textContent).toBe('GLM 5.2 ›');
    expect(q('.sys-row.on').dataset.row).toBe('sound');
    expect(q('.sys-foot').textContent).toBe('← → OR SCROLL TO CHANGE · ESC CLOSES');
    expect([...m.el.querySelectorAll('.sys-label')].map((l) => l.textContent)).toEqual(['SAVE', 'SOUND', 'MUSIC', 'AMBIENT', 'TEXT', 'TEXT SIZE', 'FONT', 'CHAT KEYS', 'MODEL', 'NARRATOR THINKING', 'LINK']);
    m.showModel(null);
    expect(rows()).toEqual(['sound', 'text', 'size', 'font', 'keys', 'link']);
  });

  it('sound: ten cells lit by volume, MUTED, CLICK FOR SOUND while locked', () => {
    expect(m.el.querySelectorAll('.sys-row[data-row="sound"] .sys-meter i').length).toBe(10);
    m.showSound({ kind: 'on', volume: 0.6, muted: false, music: 1, ambient: 1 });
    expect(lit()).toBe(6);
    expect(value('sound')).toBe('60%');
    m.showSound({ kind: 'on', volume: 0.6, muted: true, music: 1, ambient: 1 });
    expect(value('sound')).toBe('MUTED');
    m.showSound({ kind: 'locked' });
    expect(value('sound')).toBe('CLICK FOR SOUND');
  });

  it('text: the set speed is lit; a click on a word picks it', () => {
    m.showTextSpeed('fast');
    expect([...m.el.querySelectorAll('i[data-speed]')].map((i) => i.textContent)).toEqual(['SLOW', 'NORMAL', 'FAST', 'INSTANT']);
    expect(q('i[data-speed].on').textContent).toBe('FAST');
    q('i[data-speed="instant"]').click();
    expect(h.onTextSpeed).toHaveBeenCalledWith('instant');
  });

  it('text size: shows the size; ↓ from TEXT reaches it, ← → and the wheel step it (fixed stage §6)', () => {
    m.showTextSize(115);
    expect(value('size')).toBe('‹ 115% ›');
    m.open();
    key('ArrowDown');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('size');
    key('ArrowRight');
    expect(h.onSizeStep).toHaveBeenLastCalledWith(1);
    key('ArrowLeft');
    expect(h.onSizeStep).toHaveBeenLastCalledWith(-1);
    wheel(q('.sys-row[data-row="size"]'), -100);
    expect(h.onSizeStep).toHaveBeenCalledTimes(3);
  });

  it('text size: a click on ‹ steps it down, on › up (final review)', () => {
    m.showTextSize(100);
    m.open();
    q('.sys-size .sys-step[data-step="1"]').click();
    expect(h.onSizeStep).toHaveBeenLastCalledWith(1);
    q('.sys-size .sys-step[data-step="-1"]').click();
    expect(h.onSizeStep).toHaveBeenLastCalledWith(-1);
    expect(value('size')).toBe('‹ 100% ›');
    expect(m.isOpen).toBe(true);
  });

  it('font: shows its name in its own face; ↓ from TEXT SIZE reaches it, ← → ‹ › and the wheel step it', () => {
    m.showChatFont('baskerville');
    expect(value('font')).toBe('‹ BASKERVILLE ›');
    expect(q('.sys-font-name').style.fontFamily).toContain('Libre Baskerville');
    m.open();
    key('ArrowDown');
    key('ArrowDown');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('font');
    key('ArrowRight');
    expect(h.onFontStep).toHaveBeenLastCalledWith(1);
    key('ArrowLeft');
    expect(h.onFontStep).toHaveBeenLastCalledWith(-1);
    wheel(q('.sys-row[data-row="font"]'), -100);
    q('.sys-font .sys-step[data-step="-1"]').click();
    expect(h.onFontStep).toHaveBeenCalledTimes(4);
    expect(h.onFontStep).toHaveBeenLastCalledWith(-1);
    expect(m.isOpen).toBe(true);
  });

  it('link: OK, DOWN, SIGNAL LOST', () => {
    m.showLink('ok');
    expect(value('link')).toBe('OK');
    m.showLink('down');
    expect(value('link')).toBe('DOWN');
    m.showLink('lost');
    expect(value('link')).toBe('SIGNAL LOST');
  });

  it('keys while open: ↓ ↑ move rows (skipping a hidden MODEL), ← → change, Enter mutes or opens MODEL, Esc closes', () => {
    m.open();
    key('ArrowRight');
    expect(h.onVolume).toHaveBeenLastCalledWith(1);
    key('ArrowLeft');
    expect(h.onVolume).toHaveBeenLastCalledWith(-1);
    key('Enter');
    expect(h.onMute).toHaveBeenCalledTimes(1);
    key('ArrowDown');
    key('ArrowRight');
    expect(h.onTextStep).toHaveBeenLastCalledWith(1);
    key('ArrowLeft');
    expect(h.onTextStep).toHaveBeenLastCalledWith(-1);
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('size');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('font');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('keys');
    key('ArrowRight');
    expect(h.onChatKeys).toHaveBeenLastCalledWith('labels');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('link');
    m.showModel('GLM 5.2');
    key('ArrowUp');
    expect(q('.sys-row.on').dataset.row).toBe('think');
    key('ArrowUp');
    expect(q('.sys-row.on').dataset.row).toBe('model');
    key('Enter');
    expect(h.onModel).toHaveBeenCalledTimes(1);
    expect(m.isOpen).toBe(false);
    m.open();
    key('Escape');
    expect(m.isOpen).toBe(false);
  });

  it('its keys are taken from the prompt while open, and left alone while closed', () => {
    expect(key('Enter').defaultPrevented).toBe(false);
    expect(key('ArrowDown').defaultPrevented).toBe(false);
    m.open();
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter']) expect(key(k).defaultPrevented).toBe(true);
    expect(key('a').defaultPrevented).toBe(false);
    const altArrow = new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(altArrow);
    expect(altArrow.defaultPrevented).toBe(false);
    expect(m.isOpen).toBe(false); // an Alt chord closes it (review I1)
    m.open();
    expect(key('Escape').defaultPrevented).toBe(true);
    expect(m.isOpen).toBe(false);
    expect(key('Escape').defaultPrevented).toBe(false);
  });

  it('the wheel over SOUND steps the volume, over TEXT the speed (+1 up)', () => {
    m.open();
    wheel(q('.sys-row[data-row="sound"]'), -100);
    wheel(q('.sys-row[data-row="sound"]'), 100);
    expect(h.onVolume.mock.calls).toEqual([[1], [-1]]);
    wheel(q('.sys-row[data-row="text"]'), -100);
    expect(h.onTextStep).toHaveBeenLastCalledWith(1);
  });

  it('a click on SOUND mutes; a click on MODEL closes and opens the MODEL menu; clicks inside never reach the document', () => {
    const doc = vi.fn();
    document.addEventListener('click', doc);
    m.showModel('GLM 5.2');
    m.open();
    q('.sys-row[data-row="sound"]').click();
    expect(h.onMute).toHaveBeenCalledTimes(1);
    q('.sys-row[data-row="model"]').click();
    expect(m.isOpen).toBe(false);
    expect(h.onModel).toHaveBeenCalledTimes(1);
    expect(doc).not.toHaveBeenCalled();
    document.removeEventListener('click', doc);
  });

  it("an Alt chord (a screen's shortcut) closes it and goes on untouched (review I1)", () => {
    m.open();
    const altS = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', altKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(altS);
    expect(m.isOpen).toBe(false);
    expect(altS.defaultPrevented).toBe(false);
    expect(key('Enter').defaultPrevented).toBe(false);
  });

  it('tells onOpenChange when it opens and closes, however it closes', () => {
    m.open();
    key('Escape');
    m.open();
    m.close();
    expect(h.onOpenChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('while open its keys come before key handlers added after it — the dice table, a panel (final review I1)', () => {
    const later = vi.fn((e: KeyboardEvent) => e.stopImmediatePropagation());
    window.addEventListener('keydown', later, true);
    m.open();
    key('ArrowRight');
    key('Escape');
    window.removeEventListener('keydown', later, true);
    expect(h.onVolume).toHaveBeenCalledWith(1);
    expect(m.isOpen).toBe(false);
    expect(later).not.toHaveBeenCalled();
  });

  it('the menu names its focused row for screen readers (aria-activedescendant)', () => {
    m.open();
    const active = () => document.getElementById(m.el.getAttribute('aria-activedescendant')!)!;
    expect(active().dataset.row).toBe('sound');
    key('ArrowDown');
    expect(active().dataset.row).toBe('text');
  });

  it('no sound at all (hidden): the SOUND row goes, and the menu opens on TEXT', () => {
    m.showSound({ kind: 'hidden' });
    m.open();
    expect(rows()).toEqual(['text', 'size', 'font', 'keys', 'link']);
    expect(q('.sys-row.on').dataset.row).toBe('text');
    key('ArrowUp');
    expect(q('.sys-row.on').dataset.row).toBe('text');
    m.showSound({ kind: 'on', volume: 0.5, muted: false, music: 1, ambient: 1 });
    expect(rows()).toEqual(['sound', 'music', 'ambient', 'text', 'size', 'font', 'keys', 'link']);
  });

  it('music and ambient: own meters and percentages, only while sound plays; ← → and the wheel step them', () => {
    m.showSound({ kind: 'locked' });
    m.open();
    expect(rows()).toEqual(['sound', 'text', 'size', 'font', 'keys', 'link']);
    m.showSound({ kind: 'on', volume: 0.6, muted: true, music: 0.3, ambient: 0.85 });
    expect(rows()).toEqual(['sound', 'music', 'ambient', 'text', 'size', 'font', 'keys', 'link']);
    expect([...m.el.querySelectorAll('.sys-label')].slice(1, 4).map((l) => l.textContent)).toEqual(['SOUND', 'MUSIC', 'AMBIENT']);
    expect(lit('music')).toBe(3);
    expect(value('music')).toBe('30%');
    expect(lit('ambient')).toBe(9);
    expect(value('ambient')).toBe('85%');
    key('ArrowDown');
    expect(q('.sys-row.on').dataset.row).toBe('music');
    key('ArrowRight');
    expect(h.onMusic).toHaveBeenLastCalledWith(1);
    key('Enter');
    expect(h.onMute).not.toHaveBeenCalled();
    key('ArrowDown');
    key('ArrowLeft');
    expect(h.onAmbient).toHaveBeenLastCalledWith(-1);
    wheel(q('.sys-row[data-row="music"]'), 100);
    expect(h.onMusic).toHaveBeenLastCalledWith(-1);
    wheel(q('.sys-row[data-row="ambient"]'), -100);
    expect(h.onAmbient).toHaveBeenLastCalledWith(1);
    // Sound lost while focused on AMBIENT: the focus moves to a row still on show.
    m.showSound({ kind: 'hidden' });
    expect(q('.sys-row.on').dataset.row).toBe('text');
  });

  it('toggle opens and closes; dispose stops its keys', () => {
    m.toggle();
    expect(m.isOpen).toBe(true);
    m.toggle();
    expect(m.isOpen).toBe(false);
    m.open();
    m.dispose();
    expect(key('ArrowRight').defaultPrevented).toBe(false);
  });
});
