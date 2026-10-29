import { afterEach, describe, expect, it, vi } from 'vitest';
import { STAGE_H, STAGE_W, glitchIn, glitchOut, mountStage, stageScale } from '../src/landing/stage';

describe('stageScale', () => {
  it('fits 1600×900 into the window', () => {
    expect(stageScale(1920, 1080)).toBe(1.2);
    expect(stageScale(1600, 1200)).toBe(1);
    expect(stageScale(800, 900)).toBe(0.5);
  });
});

describe('mountStage', () => {
  let cleanup: (() => void) | null = null;
  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it('is a plain 1600×900 layer: the game stage does the scaling (fixed stage §4)', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const host = document.getElementById('host')!;
    (window as any).innerWidth = 1600;
    (window as any).innerHeight = 900;
    const { el, dispose } = mountStage(host);
    cleanup = dispose;
    expect(el.classList.contains('select-stage')).toBe(true);
    expect(host.contains(el)).toBe(true);
    expect(el.style.width).toBe(`${STAGE_W}px`);
    expect(el.style.height).toBe(`${STAGE_H}px`);
    expect(el.style.transform).toBe('');

    (window as any).innerWidth = 3200;
    (window as any).innerHeight = 1800;
    window.dispatchEvent(new Event('resize'));
    expect(el.style.transform).toBe('');
  });

  it('dispose removes the listener and the element', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const host = document.getElementById('host')!;
    (window as any).innerWidth = 1600;
    (window as any).innerHeight = 900;
    const { el, dispose } = mountStage(host);
    dispose();
    expect(host.contains(el)).toBe(false);
    (window as any).innerWidth = 3200;
    (window as any).innerHeight = 1800;
    window.dispatchEvent(new Event('resize'));
    expect(el.style.transform).toBe('');
  });
});

describe('glitchIn', () => {
  it('adds glitch-in with delays <= maxDelay', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    const rng = () => 0.5;
    glitchIn([a, b], { reducedMotion: false, maxDelay: 0.4, rng });
    expect(a.classList.contains('glitch-in')).toBe(true);
    expect(b.classList.contains('glitch-in')).toBe(true);
    expect(a.style.animationDelay).toBe('0.20s');
    expect(b.style.animationDelay).toBe('0.20s');
  });

  it('removes and re-adds the class so a repeat retriggers the animation', () => {
    const a = document.createElement('div');
    a.classList.add('glitch-in');
    glitchIn([a], { reducedMotion: false, rng: () => 0 });
    expect(a.classList.contains('glitch-in')).toBe(true);
    expect(a.style.animationDelay).toBe('0.00s');
  });

  /** An `animationend` for `name` (jsdom has no AnimationEvent constructor everywhere). */
  const animationEnd = (name: string, bubbles = false) => {
    const e = new Event('animationend', { bubbles });
    Object.defineProperty(e, 'animationName', { value: name });
    return e;
  };

  it('drops the class and the delay once its own glitch-in ends, so a later shake cannot replay it', () => {
    const a = document.createElement('div');
    const child = document.createElement('span');
    a.append(child);
    glitchIn([a], { reducedMotion: false, rng: () => 0.5 });
    a.dispatchEvent(animationEnd('shake'));
    child.dispatchEvent(animationEnd('glitch-in', true)); // a child's own glitch-in bubbling up
    expect(a.classList.contains('glitch-in')).toBe(true);
    expect(a.style.animationDelay).not.toBe('');
    a.dispatchEvent(animationEnd('glitch-in'));
    expect(a.classList.contains('glitch-in')).toBe(false);
    expect(a.style.animationDelay).toBe('');
    // A replay re-arms the cleanup.
    glitchIn([a], { reducedMotion: false, rng: () => 0.5 });
    expect(a.classList.contains('glitch-in')).toBe(true);
    a.dispatchEvent(animationEnd('glitch-in'));
    expect(a.classList.contains('glitch-in')).toBe(false);
  });

  it('does nothing with reduced motion', () => {
    const a = document.createElement('div');
    glitchIn([a], { reducedMotion: true, rng: () => 0.9 });
    expect(a.classList.contains('glitch-in')).toBe(false);
    expect(a.style.animationDelay).toBe('');
  });
});

describe('glitchOut', () => {
  it('resolves after 600 ms', async () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    const p = glitchOut(el, { reducedMotion: false });
    expect(el.classList.contains('glitch-out')).toBe(true);
    let done = false;
    p.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(599);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    vi.useRealTimers();
  });

  it('resolves at once with reduced motion', async () => {
    const el = document.createElement('div');
    await glitchOut(el, { reducedMotion: true });
    expect(el.classList.contains('glitch-out')).toBe(true);
  });
});
