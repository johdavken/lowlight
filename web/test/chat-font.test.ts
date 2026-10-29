import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyChatFont, loadChatFont, saveChatFont, stepChatFont } from '../src/ui/chat-font';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('FONT (SYS)', () => {
  it('is Plex Mono until one is saved, and keeps what was saved', () => {
    expect(loadChatFont()).toBe('plex');
    saveChatFont('chakra');
    expect(loadChatFont()).toBe('chakra');
    expect(localStorage.getItem('lowlight.chatFont')).toBe('chakra');
  });

  it('reads anything else, or storage off, as Plex Mono', () => {
    localStorage.setItem('lowlight.chatFont', 'comic');
    expect(loadChatFont()).toBe('plex');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadChatFont()).toBe('plex');
    expect(() => saveChatFont('sharetech')).not.toThrow();
  });

  it('steps round the four', () => {
    expect(stepChatFont('plex', 1)).toBe('chakra');
    expect(stepChatFont('sharetech', 1)).toBe('plex');
    expect(stepChatFont('plex', -1)).toBe('sharetech');
  });

  it('applies as --chat-font on the stage; the transcript reads it, the names in it keep Plex', () => {
    const root = document.createElement('div');
    applyChatFont(root, 'baskerville');
    expect(root.style.getPropertyValue('--chat-font')).toContain('Libre Baskerville');
    const style = readFileSync('web/src/ui/style.css', 'utf8');
    expect(style).toMatch(/\.text \{[^}]*font-family: var\(--chat-font, var\(--mono\)\)/);
    expect(style).toMatch(/\.beat-name \{ font-family: var\(--mono\)/);
  });
});
