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
  const onSit = vi.fn();
  const onClose = vi.fn();
  win = new GigWindow(host, {
    place: { id: 'the-tilt', name: 'The Tilt', district: 'Karasu' },
    you: 'Hicks',
    contact: 'Nix',
    load: async () => BRIEFS,
    loadPapers: async () => ({ ...data, firstNight: false }),
    onSit,
    onClose,
    reducedMotion: true,
    seed: () => 7,
    ...over,
  });
  await flush();
  return { onSit, onClose };
}
const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const text = (sel: string) => $(sel)?.textContent ?? null;
const buttonText = (t: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === t);
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
    const first = await open();
    at('.gig-job:nth-child(2)', 'mouseenter', 300, 200);
    at('.gig-job:nth-child(2)', 'mousemove', 300, 200);
    key('Enter');
    expect(first.onSit.mock.calls[0][0].brief.id).toBe('e');
    win.destroy();
    const second = await open();
    at('.gig-job:nth-child(2)', 'mousemove', 300, 200);
    at('.gig-job:nth-child(2)', 'mousemove', 310, 204);
    key('Enter');
    expect(second.onSit.mock.calls[0][0].brief.id).toBe('m');
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

  it("keys it doesn't use never reach the room behind it (review I2)", async () => {
    await open();
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    for (const k of ['t', 'x', 'Tab']) {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      document.body.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
    }
    expect(behind).not.toHaveBeenCalled();
    window.removeEventListener('keydown', behind);
  });

  it('a held Enter (auto-repeat) never sits down; a fresh press does, once', async () => {
    const { onSit } = await open();
    key('Enter', { repeat: true });
    expect(onSit).not.toHaveBeenCalled();
    key('Enter');
    expect(onSit).toHaveBeenCalledTimes(1);
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
