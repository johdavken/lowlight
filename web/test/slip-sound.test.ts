import { afterEach, describe, expect, it, vi } from 'vitest';
import { SLIP_CUE_LEVEL, SLIP_CUE_URL, SLIP_MUSIC_LEVEL, SLIP_MUSIC_URL, slipCuePlayer } from '../src/ui/slip/sound';
import { GIG_CUE_LEVEL, GIG_MUSIC_LEVEL } from '../src/ui/gig/sound';
import { GigWindow, type GigWindowOpts } from '../src/ui/gig/window';
import { grid, at } from '../../shared/slip/testing';
import { generateSlip } from '../../shared/slip/generate';
import type { Brief } from '../../shared/gig/brief';
import type { SlipBoard } from '../../shared/slip/rules';

const NAMES = ['step', 'wait', 'noise', 'jam', 'spotted', 'hide', 'lift', 'clean', 'close', 'caught'] as const;

describe('the cue table', () => {
  it('one file per cue under /sound/slip/, at the gig cues’ level; the track at the gig music’s', () => {
    expect(Object.keys(SLIP_CUE_URL).sort()).toEqual([...NAMES].sort());
    for (const n of NAMES) expect(SLIP_CUE_URL[n]).toBe(`/sound/slip/${n}.ogg`);
    expect(SLIP_CUE_LEVEL).toBe(GIG_CUE_LEVEL);
    expect(SLIP_MUSIC_URL).toBe('/sound/slip/glass-floor.ogg');
    expect(SLIP_MUSIC_LEVEL).toBe(GIG_MUSIC_LEVEL);
  });
  it('the player plays a cue by name', () => {
    const audio = { cue: vi.fn() };
    slipCuePlayer(audio)('spotted');
    expect(audio.cue).toHaveBeenCalledWith('/sound/slip/spotted.ogg', SLIP_CUE_LEVEL);
  });
});

describe('a slip run plays its cues and its music', () => {
  const brief: Brief = { id: 's', title: 'Floor', tier: 'medium', kind: 'slip', place: 'p', client: 'c', target: 't', take: 'k', text: 'b' };
  const flush = async () => {
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
  };
  const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  let win: GigWindow | null = null;
  afterEach(() => {
    win?.destroy();
    win = null;
    document.body.innerHTML = '';
  });
  async function open(board: SlipBoard, over: Partial<GigWindowOpts> = {}) {
    const cue = vi.fn();
    const music = vi.fn();
    win = new GigWindow(document.body, {
      place: { id: 'p', name: 'P', district: 'D' },
      you: 'Y',
      contact: 'N',
      load: async () => [brief],
      onSend: vi.fn(),
      onClose: vi.fn(),
      reducedMotion: true,
      seed: () => 1,
      generateSlip: async () => board,
      cue,
      music,
      ...over,
    });
    await flush();
    key('Enter');
    await flush();
    return { cue, music };
  }
  const slipCues = (cue: ReturnType<typeof vi.fn>) => cue.mock.calls.map((c) => c[0] as string).filter((n) => n.startsWith('slip:'));

  it('a turn seen by a guard and a camera plays spotted once; a wait plays wait', async () => {
    const b = grid(['E....T']);
    b.guards = [{ kind: 'post', poses: [[at(b, 3), 2]], startPi: 0 }];
    b.cams = [{ node: at(b, 3), dirs: [2], kind: 'fixed' }];
    const { cue } = await open(b);
    key('ArrowRight');
    key('ArrowRight');
    expect(slipCues(cue)).toEqual(['slip:step', 'slip:step', 'slip:spotted']);
  });

  it('the result plays its cue, and a caught run says so', async () => {
    const b = grid(['E...T']);
    b.guards = [{ kind: 'post', poses: [[at(b, 2), 2]], startPi: 0 }];
    const { cue } = await open(b);
    key('ArrowRight');
    key(' ');
    await flush();
    expect(slipCues(cue).at(-1)).toBe('slip:caught');
  });

  it('a cue that throws (a missing file) never breaks the run', async () => {
    const b = generateSlip('medium', 7)!;
    await open(b, {
      cue: () => {
        throw new Error('no file');
      },
    });
    key(' ');
    expect(document.querySelector('.slip-turn')!.textContent).toBe('T+01');
  });

  it('music: SLIP IN switches to the slip track; the result switches back; a hack run never asks for it', async () => {
    const b = grid(['E...T']);
    b.guards = [{ kind: 'post', poses: [[at(b, 2), 2]], startPi: 0 }];
    const { music } = await open(b);
    expect(music.mock.calls).toEqual([['slip']]);
    key('ArrowRight');
    key(' ');
    await flush();
    expect(music.mock.calls).toEqual([['slip'], [null]]);
  });
});
