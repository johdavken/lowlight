import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Brief } from '../../shared/gig/brief';
import { DEFAULT_ORIGINS, DEFAULT_REASONS, type PapersData } from '../../shared/papers/data';
import { papersBoard, type PapersBoard } from '../../shared/papers/generate';
import { PapersHud, type PapersHudOpts } from '../src/ui/papers/hud';

// The papers board (mockup papers-board.html, D): the desk over the room, its keys, WALK AWAY and the send.
// These are the frame's rules the gig window held until 2026-11-08.
const brief: Brief = { id: 'm', title: 'Desk m', tier: 'medium', kind: 'papers', place: 'ferry-stairs', client: 'A dock family', target: 'Tidal Isle · booth nine', take: 'one crossing', text: 'Brief for m.' };
const data: PapersData = { origins: [...DEFAULT_ORIGINS], names: { given: { f: [], m: [], x: ['Ines'] }, family: ['Varga'] }, faces: [], reasons: [...DEFAULT_REASONS] };
const key = (k: string, extra: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
  document.body.dispatchEvent(e);
  return e;
};

let game: HTMLElement;
let hud: PapersHud | null = null;
beforeEach(() => {
  game = document.createElement('div');
  game.id = 'game';
  document.body.append(game);
});
afterEach(() => {
  hud?.destroy();
  hud = null;
  game.remove();
  vi.useRealTimers();
});

function open(over: Partial<PapersHudOpts> = {}, board: PapersBoard = papersBoard('medium', 42, data)) {
  const onSend = vi.fn();
  const onClose = vi.fn();
  const hint = vi.fn();
  hud = new PapersHud(game, { brief, board, place: { id: 'ferry-stairs', name: 'The Ferry Stairs' }, onSend, onClose, hint, reducedMotion: true, ...over });
  return { onSend, onClose, hint, board };
}
const $ = <T extends Element = HTMLElement>(sel: string) => game.querySelector(sel) as T | null;
const text = (sel: string) => $(sel)?.textContent ?? null;
const buttonText = (t: string) => [...game.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === t);
const walkedAway = () => {
  const r = open();
  key('Escape');
  buttonText('WALK AWAY')!.click();
  return r;
};

describe('the board', () => {
  it('goes up over the room as a HUD table: the stage dims, the desk is in its regions, the prompt shows its keys', () => {
    const { hint } = open();
    const root = $('.tb.hud.pp-hud')!;
    expect(root.hidden).toBe(false);
    expect(game.classList.contains('tb-dim')).toBe(true);
    expect(root.classList.contains('pp-run')).toBe(true);
    expect($('.tb-top .pp-meter')).not.toBeNull();
    expect($('.tb-log .pp-bulletin')).not.toBeNull();
    expect($('.tb-middle .pp-docs')).not.toBeNull();
    expect($('.tb-levers .pp-token')).not.toBeNull();
    expect(game.querySelectorAll('.tb-bottom .pp-field')).toHaveLength(6);
    expect(hint).toHaveBeenLastCalledWith('THE DESK · U UNDO · R RESET · ⏎ HAND OVER · ESC WALK AWAY');
  });

  it('destroyed: gone, the dim lifted, the prompt given back', () => {
    const { hint } = open();
    hud!.destroy();
    expect($('.pp-hud')).toBeNull();
    expect(game.classList.contains('tb-dim')).toBe(false);
    expect(hint).toHaveBeenLastCalledWith(null);
  });
});

describe('walking away', () => {
  it('Esc asks; STAY goes back to the desk, and so does a second Esc', () => {
    open();
    key('Escape');
    expect(text('.pp-confirm p')).toBe('Walk away? The client goes back on the boat.');
    buttonText('STAY')!.click();
    expect($('.pp-confirm')).toBeNull();
    key('Escape');
    key('Escape');
    expect($('.pp-confirm')).toBeNull();
    expect($('.pp-docs')).not.toBeNull();
  });

  it('Esc drops a lifted card before it asks', () => {
    open();
    $('[data-k="field-origin"]')!.click();
    key('Escape');
    expect($('.pp-field.pp-lift')).toBeNull();
    expect($('.pp-confirm')).toBeNull();
  });

  it('WALK AWAY: no read, the client back on the boat, and Enter sends it as back', () => {
    const { onSend, board } = walkedAway();
    expect(text('.pp-verdict-word')).toBe('WALKED AWAY');
    expect(onSend).not.toHaveBeenCalled();
    key('Enter');
    expect(onSend).toHaveBeenCalledWith({ kind: 'papers', place: 'ferry-stairs', brief: 'm', result: 'back', trace: 0, max: board.cap, seed: 42, papers: { overlooked: null } });
  });

  it('Esc does nothing while booth nine reads: there is nothing left to walk away from', () => {
    open({ reducedMotion: false });
    buttonText('HAND OVER')!.click();
    key('Escape');
    expect($('.pp-confirm')).toBeNull();
  });

  it('with the confirm up, u and r never reach the desk behind it', () => {
    open();
    const trade = () => $<HTMLSelectElement>('select[data-doc="id"][data-f="trade"]')!;
    trade().value = 'dock labor';
    trade().dispatchEvent(new Event('change', { bubbles: true }));
    key('Escape');
    (document.activeElement as HTMLElement | null)?.blur();
    key('r');
    key('u');
    buttonText('STAY')!.click();
    expect(trade().value).toBe('dock labor');
  });
});

describe('the send', () => {
  it('a handed-over run sends its seed, cap and booth nine, once, from LEAVE THE DESK', () => {
    const { onSend, hint } = open();
    $('.pp-token')!.click();
    game.querySelectorAll<HTMLButtonElement>('.pp-booth')[0].click();
    buttonText('HAND OVER')!.click();
    expect(hint).toHaveBeenLastCalledWith('THE DESK · ⏎ LEAVE THE DESK');
    buttonText('LEAVE THE DESK')!.click();
    key('Enter');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0]).toMatchObject({ kind: 'papers', seed: 42, papers: { overlooked: 0 } });
    expect(buttonText('LEAVE THE DESK')!.disabled).toBe(true);
  });

  it('Esc never drops a result waiting to go: its button is the only way out', () => {
    const { onSend, onClose } = walkedAway();
    key('Escape');
    expect(onClose).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('a held Enter never sends; a fresh press does', () => {
    const { onSend } = walkedAway();
    key('Enter', { repeat: true });
    expect(onSend).not.toHaveBeenCalled();
    key('Enter');
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('a refusal offers SEND AGAIN, and then Esc may leave', () => {
    const { onSend, onClose } = walkedAway();
    key('Enter');
    hud!.showRefusal("that run doesn't add up");
    expect(text('.pp-refusal')).toBe("that run doesn't add up");
    buttonText('SEND AGAIN')!.click();
    expect(onSend).toHaveBeenCalledTimes(2);
    hud!.showRefusal('wait for her to finish');
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('no answer after ten seconds: SEND AGAIN; destroyed while waiting, the timer does nothing', () => {
    vi.useFakeTimers();
    walkedAway();
    key('Enter');
    vi.advanceTimersByTime(9_999);
    expect($('.pp-refusal')).toBeNull();
    vi.advanceTimersByTime(1);
    expect(text('.pp-refusal')).toBe('no answer — check the link and send again');
    hud!.destroy();
    walkedAway();
    key('Enter');
    hud!.destroy();
    expect(() => vi.advanceTimersByTime(20_000)).not.toThrow();
  });
});

describe('the keys', () => {
  it("keys it doesn't use never reach the room, Esc never reaches the pause menu", () => {
    open();
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    for (const k of ['t', 'x', 'Escape']) {
      const e = key(k);
      expect(e.defaultPrevented).toBe(true);
    }
    // Esc at the desk asked to walk away; it never reached the pause menu behind.
    expect($('.pp-confirm')).not.toBeNull();
    expect(behind).not.toHaveBeenCalled();
    window.removeEventListener('keydown', behind);
  });

  it('the chat prompt gives up its focus, and keys aimed at it are still the desk’s (review: finding 1)', () => {
    const bar = document.createElement('div');
    bar.id = 'input';
    const ta = bar.appendChild(document.createElement('textarea'));
    document.body.append(bar);
    try {
      ta.focus();
      open();
      expect(document.activeElement).not.toBe(ta);
      $('[data-k="field-trade"]')!.click();
      game.querySelector<HTMLButtonElement>('.pp-opt:not(.pp-true)')!.click();
      ta.focus();
      const u = new KeyboardEvent('keydown', { key: 'u', bubbles: true, cancelable: true });
      ta.dispatchEvent(u);
      expect(u.defaultPrevented).toBe(true);
      expect($('.pp-risk')!.textContent).toBe('0');
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      ta.dispatchEvent(esc);
      expect(esc.defaultPrevented).toBe(true);
      expect($('.pp-confirm')).not.toBeNull();
    } finally {
      bar.remove();
    }
  });

  it('u and r work the desk from a focused board button; its Enter stays its own (review 2: finding 1)', () => {
    open();
    $('[data-k="field-trade"]')!.click();
    game.querySelector<HTMLButtonElement>('.pp-opt:not(.pp-true)')!.click();
    const reset = $('[data-k="reset"]')!;
    reset.focus();
    const u = new KeyboardEvent('keydown', { key: 'u', bubbles: true, cancelable: true });
    reset.dispatchEvent(u);
    expect(u.defaultPrevented).toBe(true);
    expect($('.pp-risk')!.textContent).toBe('0');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    $('[data-k="reset"]')!.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
  });

  it('a refusal said at once (no link) is not overwritten by the answer timer', () => {
    vi.useFakeTimers();
    const r = walkedAway();
    r.onSend.mockImplementation(() => hud!.showRefusal('no link'));
    key('Enter');
    vi.advanceTimersByTime(20_000);
    expect(text('.pp-refusal')).toBe('no link');
  });

  it('Tab and Enter in a select stay the select’s', () => {
    open();
    const sel = $<HTMLSelectElement>('select[data-f="trade"]')!;
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    sel.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    sel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect($('.pp-booth-view')).toBeNull();
  });

  it('u, r and Enter work the desk from anywhere on the board', () => {
    open();
    $('[data-k="field-trade"]')!.click();
    game.querySelector<HTMLButtonElement>('.pp-opt:not(.pp-true)')!.click();
    (document.activeElement as HTMLElement | null)?.blur();
    expect($('.pp-risk')!.textContent).not.toBe('0');
    key('u');
    expect($('.pp-risk')!.textContent).toBe('0');
    key('Enter');
    expect($('.pp-booth-view')).not.toBeNull();
  });
});
