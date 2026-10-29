import { describe, expect, it, vi } from 'vitest';
import { PAPERS_CUE_URL, PAPERS_MUSIC_URL, papersCuePlayer } from '../src/ui/papers/sound';

describe('papers sound', () => {
  it('every cue is an optional file under /sound/papers/', () => {
    expect(Object.keys(PAPERS_CUE_URL).sort()).toEqual(['back', 'blind', 'check', 'clean', 'close', 'fail', 'note', 'paper', 'pick', 'refuse', 'slide', 'stamp']);
    for (const [n, url] of Object.entries(PAPERS_CUE_URL)) expect(url).toBe(`/sound/papers/${n}.ogg`);
    expect(PAPERS_MUSIC_URL).toBe('/sound/papers/desk.ogg');
  });
  it('the player plays a cue by name', () => {
    const cue = vi.fn();
    papersCuePlayer({ cue })('slide');
    expect(cue).toHaveBeenCalledWith('/sound/papers/slide.ogg', expect.any(Number));
  });
});
