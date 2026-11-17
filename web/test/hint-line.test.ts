import { describe, expect, it } from 'vitest';
import { setHints } from '../src/landing/hint-line';

describe('setHints (the front end key line, B TRACE)', () => {
  it('lights each [KEY], dims the dots, and reads exactly as the text it was given', () => {
    const el = document.createElement('div');
    const text = '[↑↓] CHOOSE · [ENTER] JACK IN · TYPE TO SEARCH · [ESC] BACK';
    setHints(el, text);
    expect(el.textContent).toBe(text);
    expect([...el.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['[↑↓]', '[ENTER]', '[ESC]']);
    expect(el.querySelectorAll('i')).toHaveLength(3);
    expect(el.classList.contains('hint-line')).toBe(true);
    setHints(el, '[Y] JACK IN · [N] BACK');
    expect(el.textContent).toBe('[Y] JACK IN · [N] BACK');
    expect(el.querySelectorAll('b')).toHaveLength(2);
  });
});
