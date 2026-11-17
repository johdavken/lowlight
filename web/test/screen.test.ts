import { afterEach, describe, expect, it, vi } from 'vitest';
import { openScreen, SCREEN_OUT_MS, TRACE_OUT_MS } from '../src/ui/screen';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const open = (o: Partial<Parameters<typeof openScreen>[1]> = {}) =>
  openScreen(document.body, { title: 'PEOPLE', className: 'scr-holo people-screen', label: 'People', accent: '#ffc56b', ...o });

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

  it('draws its frame on, and off for SCREEN_OUT_MS before it is gone', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const s = open({ onClose });
    expect($('.hf')!.nextElementSibling).toBe($('.scr-frame'));
    expect($('.hf')!.classList.contains('hf-opening')).toBe(true);
    s.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect($('.hf')!.classList.contains('hf-closing')).toBe(true);
    expect(s.root.classList.contains('scr-closing')).toBe(true);
    expect(s.root.isConnected).toBe(true);
    vi.advanceTimersByTime(SCREEN_OUT_MS);
    expect(s.root.isConnected).toBe(false);
  });

  it('close(true) is a switch to another screen: gone at once, no draw-off', () => {
    const onClose = vi.fn();
    const s = open({ onClose });
    s.close(true);
    expect(s.root.isConnected).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reduced motion: no draw-on, gone at once', () => {
    const s = open({ reducedMotion: true });
    expect($('.hf')!.classList.contains('hf-opening')).toBe(false);
    s.close();
    expect(s.root.isConnected).toBe(false);
  });

  it('the trace panel (scr-trace): no frame; it steps off for TRACE_OUT_MS; still under reduced motion', () => {
    vi.useFakeTimers();
    const s = open({ className: 'scr-trace crew-screen' });
    expect($('.hf')).toBeNull();
    expect(s.frame).toBeNull();
    expect(s.root.classList.contains('scr-still')).toBe(false);
    s.close();
    expect(s.root.classList.contains('scr-closing')).toBe(true);
    expect(s.root.isConnected).toBe(true);
    vi.advanceTimersByTime(TRACE_OUT_MS);
    expect(s.root.isConnected).toBe(false);
    const still = open({ className: 'scr-trace crew-screen', reducedMotion: true });
    expect(still.root.classList.contains('scr-still')).toBe(true);
    still.close();
    expect(still.root.isConnected).toBe(false);
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
