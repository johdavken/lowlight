import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GigWindow, type GigWindowOpts } from '../src/ui/gig/window';
import type { Brief } from '../../shared/gig/brief';
import { DEFAULT_ORIGINS, DEFAULT_REASONS, type PapersData } from '../../shared/papers/data';

// The gig window runs papers only since hack and slip went (2026-11-01); these are its frame's rules.
const brief = (id: string, tier: Brief['tier'], kind?: Brief['kind']): Brief => ({ id, title: `Job ${id}`, tier, ...(kind ? { kind } : {}), place: 'the-tilt', client: 'A courier', target: 'Voltaic · ledger', take: 'one line', text: `Brief for ${id}.` });
const BRIEFS = [brief('h', 'hard', 'papers'), brief('e', 'easy', 'papers'), brief('m', 'medium', 'papers')];
const data: PapersData = { origins: [...DEFAULT_ORIGINS], names: { given: { f: [], m: [], x: ['Ines'] }, family: ['Varga'] }, faces: [], reasons: [...DEFAULT_REASONS] };
const flush = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};
const key = (k: string, extra: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

let host: HTMLElement;
let win: GigWindow;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  win?.destroy();
  host.remove();
});

async function open(over: Partial<GigWindowOpts> = {}) {
  const onSend = vi.fn();
  const onClose = vi.fn();
  win = new GigWindow(host, {
    place: { id: 'the-tilt', name: 'The Tilt', district: 'Karasu' },
    you: 'Hicks',
    contact: 'Nix',
    load: async () => BRIEFS,
    loadPapers: async () => ({ ...data, firstNight: false }),
    onSend,
    onClose,
    reducedMotion: true,
    seed: () => 7,
    ...over,
  });
  await flush();
  return { onSend, onClose };
}
const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const text = (sel: string) => $(sel)?.textContent ?? null;
const buttonText = (t: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === t);
/** Sit down at the first desk and walk away: a result waiting to be sent. */
async function walkedAway(over: Partial<GigWindowOpts> = {}) {
  const r = await open(over);
  key('Enter');
  win.handleEscape();
  buttonText('WALK AWAY')!.click();
  return r;
}

describe('jobs', () => {
  it('deals one job per tier, easy to hard', async () => {
    await open();
    expect([...host.querySelectorAll('.gig-job-title')].map((x) => x.textContent)).toEqual(['Job e', 'Job m', 'Job h']);
  });

  it('hack and slip briefs are never dealt: only the papers card shows', async () => {
    await open({ load: async () => [brief('a', 'easy'), brief('s', 'medium', 'slip'), brief('p', 'hard', 'papers')] });
    expect([...host.querySelectorAll('.gig-job-title')].map((x) => x.textContent)).toEqual(['Job p']);
    expect(text('.gig-job-go')).toBe('SIT DOWN');
  });

  it('a board of hack and slip briefs only reads as nothing posted', async () => {
    await open({ load: async () => [brief('a', 'easy', 'hack'), brief('s', 'medium', 'slip')] });
    expect(text('.gig-empty')).toBe('no jobs posted here tonight');
  });

  it('nothing posted: says so, and Esc closes', async () => {
    const { onClose } = await open({ load: async () => [] });
    expect(text('.gig-empty')).toBe('no jobs posted here tonight');
    expect(text('.gig-empty-close')).toBe('[ESC] CLOSE');
    expect(win.handleEscape()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a failed load reads as nothing posted', async () => {
    await open({ load: () => Promise.reject(new Error('down')) });
    expect(text('.gig-empty')).toBe('no jobs posted here tonight');
  });

  it('the boot line names the forger\'s kit, no deck RAM or slip kit', async () => {
    await open();
    expect(text('.gig-boot')).toContain("forger's kit");
    expect(text('.gig-boot')).not.toMatch(/RAM|charges/);
  });
});

describe('picking a job with the pointer', () => {
  const at = (sel: string, type: string, x: number, y: number) => $(sel)!.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));

  it("a pointer resting where the window opened doesn't pick the card under it; moving over a card does", async () => {
    await open();
    at('.gig-job:nth-child(2)', 'mouseenter', 300, 200);
    at('.gig-job:nth-child(2)', 'mousemove', 300, 200);
    key('Enter');
    expect(text('.gig-where')).toContain('Job e');
    win.destroy();
    await open();
    at('.gig-job:nth-child(2)', 'mousemove', 300, 200);
    at('.gig-job:nth-child(2)', 'mousemove', 310, 204);
    key('Enter');
    expect(text('.gig-where')).toContain('Job m');
  });
});

describe('the frame', () => {
  it('on the jobs screen, one Esc closes; the title bar button does what Esc does', async () => {
    const { onClose } = await open();
    expect(win.handleEscape()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    win.destroy();
    const again = await open();
    $<HTMLButtonElement>('.gig-jackout')!.click();
    expect(again.onClose).toHaveBeenCalledTimes(1);
  });

  it('destroyed mid-run (the map closed under it): gone, nothing sent', async () => {
    const { onSend } = await open();
    key('Enter');
    win.destroy();
    expect(host.querySelector('.gig-window')).toBeNull();
    key('Enter');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('Esc on the result screen never drops the result; the only way out is its [ENTER] button (review I1)', async () => {
    const { onSend, onClose } = await walkedAway();
    expect(win.handleEscape()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect($<HTMLButtonElement>('.gig-jackout')!.hidden).toBe(true);
    expect(onSend).not.toHaveBeenCalled();
    key('Enter');
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('after a refusal, Esc may drop it (spec §8)', async () => {
    const { onClose } = await walkedAway();
    key('Enter');
    win.showRefusal('wait for her to finish');
    expect($<HTMLButtonElement>('.gig-jackout')!.hidden).toBe(false);
    win.handleEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keys it doesn't use never reach the room behind it (review I2)", async () => {
    await open();
    key('Enter');
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    for (const k of ['t', 'x', 'Enter']) {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    }
    expect(behind).not.toHaveBeenCalled();
    window.removeEventListener('keydown', behind);
  });

  it('a held Enter (auto-repeat) never sends; a fresh press does', async () => {
    const { onSend } = await walkedAway();
    key('Enter', { repeat: true });
    expect(onSend).not.toHaveBeenCalled();
    key('Enter');
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('no answer after sending: back to SEND AGAIN, and Esc can leave', async () => {
    const { onSend, onClose } = await walkedAway();
    vi.useFakeTimers();
    try {
      key('Enter');
      expect(onSend).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(9_999);
      expect(text('.gig-refusal')).toBeNull();
      vi.advanceTimersByTime(1);
      expect(text('.gig-refusal')).toBe('no answer — check the link and send again');
      expect(text('.gig-send')).toBe('[ENTER] SEND AGAIN');
      win.handleEscape();
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('destroyed while waiting: the timer does nothing', async () => {
    await walkedAway();
    vi.useFakeTimers();
    try {
      key('Enter');
      win.destroy();
      expect(() => vi.advanceTimersByTime(20_000)).not.toThrow();
      expect(host.querySelector('.gig-refusal')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('the scanlines cover the whole window: they sit outside the scrolling part', async () => {
    await open();
    expect($('.gig-term > .gig-scan')).not.toBeNull();
    expect($('.gig-term > .gig-scroll > .gig-view')).not.toBeNull();
  });

  it('a short stage: the window scrolls inside itself (no narrow layout on the fixed stage)', () => {
    const css = readFileSync('web/src/ui/gig/gig.css', 'utf8');
    expect(css).toMatch(/\.gig-term\s*\{[^}]*max-height:\s*calc\(900px/);
    expect(css).toMatch(/\.gig-scroll\s*\{[^}]*overflow:\s*auto/);
  });
});
