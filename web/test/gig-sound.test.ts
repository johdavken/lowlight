import { afterEach, describe, expect, it, vi } from 'vitest';
import { GIG_CUE_LEVEL, GIG_CUE_URL, GIG_MUSIC_LEVEL, GIG_MUSIC_URL, TABLE_MUSIC_URL, gigCuePlayer } from '../src/ui/gig/sound';
import { GigWindow, type GigWindowOpts } from '../src/ui/gig/window';
import { DEFAULT_ORIGINS, DEFAULT_REASONS, type PapersData } from '../../shared/papers/data';
import type { Brief } from '../../shared/gig/brief';

describe('the cue table', () => {
  it('jack-in and jack-out under /sound/gig/, at the page swap level; the window and table music', () => {
    expect(Object.keys(GIG_CUE_URL).sort()).toEqual(['jack-in', 'jack-out']);
    for (const n of ['jack-in', 'jack-out'] as const) expect(GIG_CUE_URL[n]).toBe(`/sound/gig/${n}.ogg`);
    expect(GIG_CUE_LEVEL).toBeCloseTo(0.9 * 0.25 * 1.4);
    expect(GIG_MUSIC_URL).toBe('/sound/gig/fast-drying-lacquer.ogg');
    expect(TABLE_MUSIC_URL).toBe('/sound/gig/on-the-wire.ogg');
    expect(GIG_MUSIC_LEVEL).toBe(0.7);
  });
  it('the player plays a cue by name', () => {
    const audio = { cue: vi.fn() };
    gigCuePlayer(audio)('jack-in');
    expect(audio.cue).toHaveBeenCalledWith('/sound/gig/jack-in.ogg', GIG_CUE_LEVEL);
  });
});

describe('the window plays its cues', () => {
  const brief: Brief = { id: 'e', title: 'Job', tier: 'easy', kind: 'papers', place: 'p', client: 'c', target: 't', take: 'k', text: 'b' };
  const data: PapersData = { origins: [...DEFAULT_ORIGINS], names: { given: { f: [], m: [], x: ['Ines'] }, family: ['Varga'] }, faces: [], reasons: [...DEFAULT_REASONS] };
  let win: GigWindow | null = null;
  afterEach(() => win?.destroy());

  async function open(cue: GigWindowOpts['cue']) {
    win = new GigWindow(document.body, { place: { id: 'p', name: 'P', district: 'D' }, you: 'Y', contact: 'C', load: async () => [brief], loadPapers: async () => ({ ...data, firstNight: false }), onSend: () => {}, onClose: () => {}, reducedMotion: true, seed: () => 7, cue });
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
    return win;
  }

  it('jack-in on open, jack-out once on close however it goes', async () => {
    const cue = vi.fn();
    const w = await open(cue);
    expect(cue.mock.calls[0]).toEqual(['jack-in']);
    cue.mockClear();
    w.destroy();
    w.destroy();
    expect(cue.mock.calls).toEqual([['jack-out']]);
  });

  it('a cue that throws breaks nothing', async () => {
    const w = await open(() => {
      throw new Error('no audio');
    });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(document.querySelector('.gig-tbar')!.textContent).toContain('DESK');
    w.handleEscape();
  });
});
