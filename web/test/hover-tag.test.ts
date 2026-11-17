import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installHoverTags, setTip, splitCap, TAG_DWELL_MS } from '../src/ui/hover-tag';

const fire = (n: Element, type: string, init: MouseEventInit = {}) => n.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));

describe('setTip', () => {
  it('moves the words off the native tooltip into the tag, and screen readers hear them', () => {
    const b = document.createElement('button');
    b.title = 'old';
    setTip(b, 'REGENERATE (Alt+R)');
    expect(b.hasAttribute('title')).toBe(false);
    expect(b.dataset.tip).toBe('REGENERATE (Alt+R)');
    expect(b.getAttribute('aria-description')).toBe('REGENERATE (Alt+R)');
    setTip(b, null);
    expect(b.dataset.tip).toBeUndefined();
    expect(b.hasAttribute('aria-description')).toBe(false);
  });
});

describe('splitCap', () => {
  it('a trailing shortcut comes apart; other brackets stay', () => {
    expect(splitCap('REGENERATE (Alt+R)')).toEqual({ words: 'REGENERATE', cap: 'Alt+R' });
    expect(splitCap('Walk out on your own (Enter)')).toEqual({ words: 'Walk out on your own', cap: 'Enter' });
    expect(splitCap('Two left (of three)')).toEqual({ words: 'Two left (of three)', cap: null });
  });
});

describe('installHoverTags', () => {
  let host: HTMLElement;
  let b: HTMLButtonElement;
  let off: () => void;
  const tag = () => host.querySelector<HTMLElement>('.hv-tag')!;
  beforeEach(() => {
    vi.useFakeTimers();
    host = document.body.appendChild(document.createElement('div'));
    b = host.appendChild(document.createElement('button'));
    b.append(document.createElement('span'));
    setTip(b, 'TITLE (Alt+T)');
    off = installHoverTags(host);
  });
  afterEach(() => {
    off();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('shows after the dwell, with the shortcut dim beside the words and a leader', () => {
    fire(b.firstElementChild!, 'pointerover');
    vi.advanceTimersByTime(TAG_DWELL_MS - 1);
    expect(tag().hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(tag().hidden).toBe(false);
    expect(tag().firstChild!.textContent).toBe('TITLE');
    expect(tag().querySelector('.hv-cap')!.textContent).toBe('Alt+T');
    expect(host.querySelector('svg[data-lead="tag"] path')).not.toBeNull();
  });
  it('moving inside the control keeps it; leaving, a press or Escape hides it and its leader', () => {
    fire(b, 'pointerover');
    vi.advanceTimersByTime(TAG_DWELL_MS);
    fire(b, 'pointerout', { relatedTarget: b.firstElementChild });
    expect(tag().hidden).toBe(false);
    fire(b, 'pointerout', { relatedTarget: host });
    expect(tag().hidden).toBe(true);
    expect(host.querySelector('svg[data-lead="tag"]')!.childElementCount).toBe(0);
    fire(host, 'pointerover');
    fire(b, 'pointerover');
    vi.advanceTimersByTime(TAG_DWELL_MS);
    fire(b, 'pointerdown');
    expect(tag().hidden).toBe(true);
    fire(host, 'pointerover');
    fire(b, 'pointerover');
    vi.advanceTimersByTime(TAG_DWELL_MS);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tag().hidden).toBe(true);
  });
  it('a control without words shows nothing', () => {
    setTip(b, null);
    fire(b, 'pointerover');
    vi.advanceTimersByTime(TAG_DWELL_MS);
    expect(tag().hidden).toBe(true);
  });
});
