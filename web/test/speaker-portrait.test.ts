// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountSpeakerPortrait, PORTRAIT_SWITCH_MS } from '../src/room/speaker-portrait';

let root: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="feed"></div>';
  root = document.getElementById('feed')!;
});
afterEach(() => vi.useRealTimers());

const shown = () => [...root.querySelectorAll<HTMLElement>('.sp-portrait:not(.sp-leaving)')];
const VENN = { name: 'Arlo Venn', url: '/api/extras/sdg-07' };
const LUND = { name: 'Teodora Lund', url: '/api/extras/local-07' };

describe('the speaker portrait (stranger faces, by the subtitles)', () => {
  it('shows the stranger present: their face, framed, and the line moves over for it', () => {
    const p = mountSpeakerPortrait(root);
    p.show(VENN);
    expect(shown().map((e) => e.dataset.name)).toEqual(['Arlo Venn']);
    expect(shown()[0]!.querySelector('img')!.getAttribute('src')).toBe('/api/extras/sdg-07');
    expect(shown()[0]!.querySelectorAll('.sp-corner')).toHaveLength(2);
    expect(root.classList.contains('has-portrait')).toBe(true);
  });

  it('stays solid: nothing dims it while others talk (there is no speaking switch)', () => {
    const p = mountSpeakerPortrait(root);
    p.show(VENN);
    expect(Object.keys(p)).toEqual(['show']);
  });

  it('the same stranger again changes nothing', () => {
    const p = mountSpeakerPortrait(root);
    p.show(VENN);
    const first = shown()[0];
    p.show({ ...VENN });
    expect(shown()[0]).toBe(first);
    expect(root.querySelectorAll('.sp-portrait')).toHaveLength(1);
  });

  it('a different stranger takes over: the old face leaves while the new one comes in, then is gone', () => {
    const p = mountSpeakerPortrait(root);
    p.show(VENN);
    p.show(LUND);
    expect(shown().map((e) => e.dataset.name)).toEqual(['Teodora Lund']);
    expect(root.querySelector('.sp-portrait.sp-leaving')?.getAttribute('data-name')).toBe('Arlo Venn');
    vi.advanceTimersByTime(PORTRAIT_SWITCH_MS + 10);
    expect([...root.querySelectorAll<HTMLElement>('.sp-portrait')].map((e) => e.dataset.name)).toEqual(['Teodora Lund']);
  });

  it('nobody present: the face leaves and the line takes its room back', () => {
    const p = mountSpeakerPortrait(root);
    p.show(VENN);
    p.show(null);
    expect(shown()).toEqual([]);
    expect(root.classList.contains('has-portrait')).toBe(false);
    vi.advanceTimersByTime(PORTRAIT_SWITCH_MS + 10);
    expect(root.querySelectorAll('.sp-portrait')).toHaveLength(0);
  });

  it("a face that won't load shows their initial instead", () => {
    const p = mountSpeakerPortrait(root);
    p.show(VENN);
    shown()[0]!.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(shown()[0]!.querySelector('img')).toBeNull();
    expect(shown()[0]!.querySelector('.sp-initial')!.textContent).toBe('A');
  });

  it('their accent colours the frame, when they have one', () => {
    const p = mountSpeakerPortrait(root);
    p.show({ ...VENN, accent: '#a9c4d6' });
    expect(shown()[0]!.style.getPropertyValue('--sp-c')).toBe('#a9c4d6');
  });
});
