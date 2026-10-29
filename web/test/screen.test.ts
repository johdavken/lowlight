import { afterEach, describe, expect, it, vi } from 'vitest';
import { openScreen, SCREEN_GLITCH_OUT_MS } from '../src/ui/screen';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const open = (o: Partial<Parameters<typeof openScreen>[1]> = {}) =>
  openScreen(document.body, { title: 'PEOPLE', className: 'people-screen', label: 'People', accent: '#ffc56b', ...o });

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('openScreen', () => {
  it('builds the frame: head, CRT layers, accent, dialog role', () => {
    const s = open();
    expect(s.head.textContent).toBe('// PEOPLE[ESC] CLOSE');
    for (const c of ['.scr-scan', '.scr-roll', '.scr-vignette']) expect($(c)).not.toBeNull();
    expect(s.root.classList.contains('people-screen')).toBe(true);
    expect(s.root.style.getPropertyValue('--screen-accent')).toBe('#ffc56b');
    expect(s.root.getAttribute('role')).toBe('dialog');
    expect(s.root.getAttribute('aria-label')).toBe('People');
    expect($('.scr-scroll')).toBe(s.body);
  });

  it('glitches in, and out over 600 ms before it is gone', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const s = open({ onClose });
    expect($('.scr-screen')!.classList.contains('scr-glitch-in')).toBe(true);
    s.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect($('.scr-screen')!.classList.contains('scr-glitch-out')).toBe(true);
    expect(s.root.classList.contains('scr-closing')).toBe(true);
    expect(s.root.isConnected).toBe(true);
    vi.advanceTimersByTime(SCREEN_GLITCH_OUT_MS);
    expect(s.root.isConnected).toBe(false);
  });

  it('close(true) is a switch to another screen: gone at once, no glitch-out', () => {
    const onClose = vi.fn();
    const s = open({ onClose });
    s.close(true);
    expect(s.root.isConnected).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reduced motion: no glitch, gone at once', () => {
    const s = open({ reducedMotion: true });
    expect($('.scr-screen')!.classList.contains('scr-glitch-in')).toBe(false);
    s.close();
    expect(s.root.isConnected).toBe(false);
  });

  it('a backdrop click closes; a click inside does not; canClose false keeps it open', () => {
    let may = false;
    const s = open({ reducedMotion: true, canClose: () => may });
    s.body.click();
    expect(s.isOpen).toBe(true);
    s.root.click();
    expect(s.isOpen).toBe(true);
    may = true;
    s.root.click();
    expect(s.isOpen).toBe(false);
  });

  it('close twice calls onClose once; isOpen follows', () => {
    const onClose = vi.fn();
    const s = open({ reducedMotion: true, onClose });
    expect(s.isOpen).toBe(true);
    s.close();
    s.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(s.isOpen).toBe(false);
  });
});
