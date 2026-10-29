import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyChatKeys, foldArrow, loadChatKeys, loadFold, saveChatKeys, saveFold } from '../src/ui/chat-keys';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const throwing = (method: 'getItem' | 'setItem') =>
  vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new Error('storage off');
  });

describe('chat keys (SYS → CHAT KEYS)', () => {
  it('glyphs by default, labels once saved', () => {
    expect(loadChatKeys()).toBe('glyphs');
    saveChatKeys('labels');
    expect(loadChatKeys()).toBe('labels');
  });

  it('a stored value that is neither falls back to glyphs', () => {
    localStorage.setItem('lowlight.chatKeys', 'icons');
    expect(loadChatKeys()).toBe('glyphs');
  });

  it('storage off: glyphs, and saving never throws (Review Focus 2)', () => {
    throwing('getItem');
    throwing('setItem');
    expect(loadChatKeys()).toBe('glyphs');
    expect(() => saveChatKeys('labels')).not.toThrow();
  });

  it('applyChatKeys puts exactly one of keys-glyphs / keys-labels on the root', () => {
    const div = document.createElement('div');
    applyChatKeys(div, 'labels');
    expect(div.classList.contains('keys-labels')).toBe(true);
    expect(div.classList.contains('keys-glyphs')).toBe(false);
    applyChatKeys(div, 'glyphs');
    expect(div.classList.contains('keys-glyphs')).toBe(true);
    expect(div.classList.contains('keys-labels')).toBe(false);
  });
});

describe('fold state', () => {
  it('nothing folded by default; a fold round-trips', () => {
    expect(loadFold()).toEqual({ line: false, scene: false });
    saveFold({ line: true, scene: false });
    expect(loadFold()).toEqual({ line: true, scene: false });
  });

  it('junk in storage reads as nothing folded (Review Focus 2)', () => {
    localStorage.setItem('lowlight.chatFold', '{bad json');
    expect(loadFold()).toEqual({ line: false, scene: false });
    localStorage.setItem('lowlight.chatFold', '{"line":"yes","scene":true}');
    expect(loadFold()).toEqual({ line: false, scene: true });
  });

  it('storage off: nothing folded, saving never throws', () => {
    throwing('getItem');
    throwing('setItem');
    expect(loadFold()).toEqual({ line: false, scene: false });
    expect(() => saveFold({ line: true, scene: true })).not.toThrow();
  });
});

describe('foldArrow', () => {
  it('the line stack folds under ◂, saves, and a new arrow starts folded', () => {
    const stack = document.createElement('div');
    const arrow = foldArrow(stack, 'line');
    expect(arrow.textContent).toBe('◂');
    expect(arrow.classList.contains('fold')).toBe(true);
    expect(stack.classList.contains('folded')).toBe(false);
    expect(arrow.getAttribute('aria-expanded')).toBe('true');
    arrow.click();
    expect(stack.classList.contains('folded')).toBe(true);
    expect(arrow.getAttribute('aria-expanded')).toBe('false');
    expect(arrow.title).toBe('Show the line options');
    expect(loadFold().line).toBe(true);
    const again = document.createElement('div');
    foldArrow(again, 'line');
    expect(again.classList.contains('folded')).toBe(true);
  });

  it('the scene stack has ▸ and its own state', () => {
    const stack = document.createElement('div');
    const arrow = foldArrow(stack, 'scene');
    expect(arrow.textContent).toBe('▸');
    expect(arrow.title).toBe('Hide the scene actions');
    arrow.click();
    expect(loadFold()).toEqual({ line: false, scene: true });
  });
});
