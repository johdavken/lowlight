import { afterEach, describe, expect, it, vi } from 'vitest';
import { GIG_CUE_LEVEL, GIG_CUE_URL, GIG_MUSIC_LEVEL, GIG_MUSIC_URL, gigCuePlayer } from '../src/ui/gig/sound';
import { GigWindow, type GigWindowOpts } from '../src/ui/gig/window';
import { generate } from '../../shared/gig/generate';
import { solve } from '../../shared/gig/solve';
import type { Brief } from '../../shared/gig/brief';

const NAMES = ['jack-in', 'select', 'probe', 'enter', 'breach', 'trap', 'cache', 'key', 'watch', 'pull', 'clean', 'close', 'traced', 'jack-out'] as const;

describe('the cue table', () => {
  it('one file per cue under /sound/gig/, at the page swap level', () => {
    expect(Object.keys(GIG_CUE_URL).sort()).toEqual([...NAMES].sort());
    for (const n of NAMES) expect(GIG_CUE_URL[n]).toBe(`/sound/gig/${n}.ogg`);
    // About 3 dB over the page swap's level (the gig's sound is a little quiet overall).
    expect(GIG_CUE_LEVEL).toBeCloseTo(0.9 * 0.25 * 1.4);
    expect(GIG_MUSIC_URL).toBe('/sound/gig/fast-drying-lacquer.ogg');
    // Foreground, like the title theme: well above a room song's 0.3 ("can barely hear it").
    expect(GIG_MUSIC_LEVEL).toBe(0.7);
  });
  it('the player plays a cue by name', () => {
    const audio = { cue: vi.fn() };
    gigCuePlayer(audio)('trap');
    expect(audio.cue).toHaveBeenCalledWith('/sound/gig/trap.ogg', GIG_CUE_LEVEL);
  });
});

describe('the window plays its cues', () => {
  const brief: Brief = { id: 'e', title: 'Job', tier: 'easy', place: 'p', client: 'c', target: 't', take: 'k', text: 'b' };
  const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  let win: GigWindow | null = null;
  afterEach(() => win?.destroy());

  async function open(cue: GigWindowOpts['cue']) {
    win = new GigWindow(document.body, { place: { id: 'p', name: 'P', district: 'D' }, you: 'Y', contact: 'C', load: async () => [brief], onSend: () => {}, onClose: () => {}, reducedMotion: true, seed: () => 7, cue });
    await new Promise((r) => setTimeout(r, 0));
    return win;
  }

  it('jack-in on open, select on Tab, each action its own cues in order, the outcome, jack-out on close', async () => {
    const cue = vi.fn();
    const w = await open(cue);
    expect(cue.mock.calls[0]).toEqual(['jack-in']);
    key('Enter');
    cue.mockClear();
    const b = generate('easy', 7);
    for (const id of solve(b).path!.slice(1)) {
      document.querySelector(`g.gig-node[data-id="${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      key('e');
    }
    key('Enter');
    const played = cue.mock.calls.map((c) => c[0]);
    expect(played.filter((c) => c === 'select')).toHaveLength(solve(b).path!.length - 1);
    expect(played.slice(-2)).toEqual(['pull', 'clean']);
    expect(played.filter((c) => ['enter', 'breach'].includes(c)).length).toBe(solve(b).path!.length - 1);
    cue.mockClear();
    // However the window goes (sent, Esc, the map closing), it powers down once.
    w.destroy();
    w.destroy();
    expect(cue.mock.calls).toEqual([['jack-out']]);
  });

  it('a cue that throws breaks nothing', async () => {
    const w = await open(() => {
      throw new Error('no audio');
    });
    key('Enter');
    expect(document.querySelector('.gig-run-title')!.textContent).toBe('Job');
    key('Tab');
    key('e');
    expect(document.querySelectorAll('g.gig-node.gig-held').length).toBe(2);
    w.handleEscape();
    w.handleEscape();
  });
});
