import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoxSettings } from '../src/ui/box-settings';
import { BOX_DEFAULTS, type BoxPrefs } from '../src/ui/box-prefs';

let root: HTMLElement;
let bs: BoxSettings;
const q = (sel: string) => root.querySelector<HTMLElement>(sel)!;
const rows = () => [...root.querySelectorAll<HTMLElement>('.bs-row')].map((r) => r.dataset.row);
const focused = () => q('.bs-row.on').dataset.row;
const key = (k: string, o: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
  window.dispatchEvent(e);
  return e;
};

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.className = '';
  root = document.createElement('div');
  root.className = 'feed-root feed-stage';
  document.body.append(root);
  bs = new BoxSettings(root);
});
afterEach(() => bs.dispose());

describe('BoxSettings (the box settings key)', () => {
  it('a key and a closed panel in the feed root; the rows in two sections, in the mockup order', () => {
    expect(root.querySelector('button.bs-key')).not.toBeNull();
    expect(bs.panel.hidden).toBe(true);
    expect(q('.bs-plate').textContent).toBe('CHAT');
    expect([...root.querySelectorAll('.bs-sec')].map((s) => s.textContent)).toEqual(['TEXT', 'LINE']);
    expect(rows()).toEqual(['text', 'size', 'font', 'auto', 'effect', 'colour', 'glass', 'line', 'keys']);
    expect([...root.querySelectorAll('.bs-label')].map((l) => l.textContent)).toEqual(['TEXT', 'TEXT SIZE', 'FONT', 'AUTO PAGE', 'TEXT EFFECT', 'COLOUR', 'SHADE', 'SPEAKER LINE', 'CHAT KEYS']);
  });

  it('the key opens and closes it, and says so (aria-expanded); Esc and a click elsewhere close it', () => {
    const k = q('button.bs-key');
    expect(k.getAttribute('aria-haspopup')).toBe('menu');
    k.click();
    expect(bs.isOpen).toBe(true);
    expect(k.getAttribute('aria-expanded')).toBe('true');
    expect(k.classList.contains('on')).toBe(true);
    k.click();
    expect(bs.isOpen).toBe(false);
    bs.open();
    expect(key('Escape').defaultPrevented).toBe(true);
    expect(bs.isOpen).toBe(false);
    bs.open();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(bs.isOpen).toBe(false);
    bs.open();
    q('.bs-row[data-row="size"]').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(bs.isOpen).toBe(true);
  });

  it('its keys are taken only while open; ↑ ↓ move, the menu names the focused row', () => {
    expect(key('ArrowDown').defaultPrevented).toBe(false);
    bs.open();
    expect(focused()).toBe('text');
    expect(key('ArrowDown').defaultPrevented).toBe(true);
    expect(focused()).toBe('size');
    expect(document.getElementById(bs.panel.getAttribute('aria-activedescendant')!)!.dataset.row).toBe('size');
    key('ArrowUp');
    key('ArrowUp');
    expect(focused()).toBe('text');
    for (let i = 0; i < 20; i++) key('ArrowDown');
    expect(focused()).toBe('keys');
    expect(key('a').defaultPrevented).toBe(false);
  });

  it('an Alt chord, the archive or a walk-out closes it and lets the key by', () => {
    bs.open();
    expect(key('s', { altKey: true }).defaultPrevented).toBe(false);
    expect(bs.isOpen).toBe(false);
    bs.open();
    root.classList.add('expanded');
    expect(key('ArrowDown').defaultPrevented).toBe(false);
    expect(bs.isOpen).toBe(false);
    root.classList.remove('expanded');
    bs.open();
    document.documentElement.classList.add('walking-out');
    expect(key('ArrowDown').defaultPrevented).toBe(false);
    expect(bs.isOpen).toBe(false);
  });

  it('TEXT, TEXT SIZE, FONT, CHAT KEYS: words and ‹ › pick, ← → step, and their values show', () => {
    const speed = { onPick: vi.fn(), onStep: vi.fn() };
    const size = vi.fn();
    const font = vi.fn();
    const keys = vi.fn();
    bs.setTextSpeedControl(speed);
    bs.setTextSizeControl(size);
    bs.setChatFontControl(font);
    bs.setChatKeysControl(keys);
    bs.showTextSpeed('fast');
    bs.showTextSize(115);
    bs.showChatFont('baskerville');
    bs.showChatKeys('glyphs');
    expect(q('i[data-speed].on').textContent).toBe('FAST');
    expect(q('.bs-row[data-row="size"] .bs-num').textContent).toBe('115%');
    expect(q('.bs-font').textContent).toBe('BASKERVILLE');
    expect(q('.bs-font').style.fontFamily).toContain('Libre Baskerville');
    q('i[data-speed="slow"]').click();
    expect(speed.onPick).toHaveBeenCalledWith('slow');
    q('.bs-row[data-row="size"] .bs-step[data-step="1"]').click();
    expect(size).toHaveBeenLastCalledWith(1);
    q('.bs-row[data-row="font"] .bs-step[data-step="-1"]').click();
    expect(font).toHaveBeenLastCalledWith(-1);
    q('i[data-keys="labels"]').click();
    expect(keys).toHaveBeenLastCalledWith('labels');
    bs.open();
    key('ArrowRight');
    expect(speed.onStep).toHaveBeenLastCalledWith(1);
    key('ArrowDown');
    key('ArrowLeft');
    expect(size).toHaveBeenLastCalledWith(-1);
    key('ArrowDown');
    key('ArrowRight');
    expect(font).toHaveBeenLastCalledWith(1);
    for (let i = 0; i < 6; i++) key('ArrowDown');
    key('Enter');
    expect(keys).toHaveBeenLastCalledWith('labels');
  });

  it('the box rows report the whole set changed: auto page, effect, colour, glass, line', () => {
    const picks: BoxPrefs[] = [];
    bs.setPrefsControl((p) => {
      picks.push(p);
      bs.showPrefs(p);
    });
    bs.showPrefs(BOX_DEFAULTS);
    expect(q('i[data-auto].on').textContent).toBe('OFF');
    expect(q('i[data-colour].on').textContent).toBe('SPEAKER');
    expect(q('.bs-pct').textContent).toBe('60%');
    q('i[data-auto="fast"]').click();
    q('i[data-colour="cyan"]').click();
    q('i[data-line="off"]').click();
    q('i[data-effect="decode"]').click();
    expect(picks.at(-1)).toEqual({ colour: 'cyan', glass: 60, autoPage: 'fast', line: false, effect: 'decode' });
    expect(q('i[data-colour].on').dataset.colour).toBe('cyan');
    bs.open();
    for (let i = 0; i < 6; i++) key('ArrowDown');
    expect(focused()).toBe('glass');
    key('ArrowRight');
    expect(picks.at(-1)!.glass).toBe(70);
    key('ArrowUp');
    key('ArrowLeft');
    expect(picks.at(-1)!.colour).toBe('pink'); // one swatch back from cyan
    key('ArrowDown');
    key('ArrowDown');
    key('Enter');
    expect(picks.at(-1)!.line).toBe(true);
    key('ArrowUp');
    key('ArrowUp');
    key('ArrowUp');
    expect(focused()).toBe('effect');
    key('ArrowLeft');
    expect(picks.at(-1)!.effect).toBe('type');
  });

  it('at INSTANT, DECODE is struck out and the TEXT EFFECT tip says why; a typing speed brings it back (playtest)', () => {
    const decode = () => q('i[data-effect="decode"]');
    bs.showTextSpeed('instant');
    expect(decode().classList.contains('struck')).toBe(true);
    bs.open();
    q('.bs-row[data-row="effect"]').dispatchEvent(new MouseEvent('mouseenter'));
    expect(q('.bs-tip').textContent).toContain('INSTANT');
    bs.showTextSpeed('fast');
    expect(decode().classList.contains('struck')).toBe(false);
    expect(q('.bs-tip').textContent).toContain('glyph noise');
  });

  it('a row that needs words explains itself in the foot', () => {
    bs.open();
    expect(q('.bs-foot').textContent).toContain('ESC CLOSE');
    q('.bs-row[data-row="effect"]').dispatchEvent(new MouseEvent('mouseenter'));
    expect(q('.bs-foot').textContent).toContain('glyph noise');
  });

  it('a press on the bar (a screen, SYS) closes it, so the screen opening over it has the keys (review)', () => {
    const bar = document.createElement('div');
    bar.className = 'hud-bar';
    const you = document.createElement('span');
    bar.append(you);
    document.body.append(bar);
    bs.open();
    you.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(bs.isOpen).toBe(false);
  });

  it('a line half typed in the prompt keeps its Enter and arrows; Esc still closes (review)', () => {
    const ta = document.createElement('textarea');
    document.body.append(ta);
    bs.open();
    ta.value = 'hello';
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ta.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    const left = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
    ta.dispatchEvent(left);
    expect(left.defaultPrevented).toBe(false);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    ta.dispatchEvent(esc);
    expect(bs.isOpen).toBe(false);
  });

  it('it closes as the box goes (the archive), not only at the next key (review)', async () => {
    bs.open();
    root.classList.add('expanded');
    await Promise.resolve();
    expect(bs.isOpen).toBe(false);
  });

  it('at a table the box is empty but the panel stays: it lives on the JOB column there (playtest 2026-11-11)', async () => {
    const table = document.createElement('div');
    table.className = 'tb hud';
    document.body.append(table);
    root.classList.add('box-empty');
    bs.open();
    await Promise.resolve();
    expect(bs.isOpen).toBe(true);
    expect(key('ArrowDown').defaultPrevented).toBe(true);
    // No table: an empty box takes the panel with it.
    table.remove();
    expect(key('ArrowDown').defaultPrevented).toBe(false);
    expect(bs.isOpen).toBe(false);
  });

  it('dispose takes it away and lets the keys go', () => {
    bs.open();
    bs.dispose();
    expect(root.querySelector('.bs-key, .bs-panel')).toBeNull();
    expect(key('ArrowDown').defaultPrevented).toBe(false);
  });
});
