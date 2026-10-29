import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CRACK_CUE_URL, crackCueLevel, crackCuePlayer, cuesForMove, type CrackCue } from '../src/ui/crack/sound';
import { GIG_CUE_LEVEL } from '../src/ui/gig/sound';
import type { Played } from '../../shared/crack';
import { audioStatus } from '../../tools/release/credits';

const NAMES: CrackCue[] = ['open', 'hover', 'guess', 'wrong', 'last', 'dud', 'reset', 'granted', 'locked', 'leave'];

describe('the cue table', () => {
  it('a sound for every moment, at the gig cues level, hover at half', () => {
    expect(Object.keys(CRACK_CUE_URL).sort()).toEqual([...NAMES].sort());
    // On disk, or a restricted cue the public repo holds back (spec 2026-10-28 open-source release).
    const restricted = audioStatus(fs.readFileSync(path.join(__dirname, '../../sounds/CREDITS.md'), 'utf8'));
    for (const n of NAMES) {
      const onDisk = fs.existsSync(path.join(__dirname, '../public', CRACK_CUE_URL[n]));
      expect(onDisk || restricted(`web/public${CRACK_CUE_URL[n]}`) === 'restricted', CRACK_CUE_URL[n]).toBe(true);
    }
    expect(CRACK_CUE_URL.locked).toBe('/sound/mission/heat.ogg');
    for (const n of NAMES) expect(crackCueLevel(n)).toBe(n === 'hover' ? GIG_CUE_LEVEL * 0.5 : GIG_CUE_LEVEL);
  });
  it('the player plays a cue by name', () => {
    const audio = { cue: vi.fn() };
    crackCuePlayer(audio)('granted');
    expect(audio.cue).toHaveBeenCalledWith(CRACK_CUE_URL.granted, GIG_CUE_LEVEL);
  });
});

describe('cuesForMove', () => {
  const played = (state: Played['state'], triesLeft: number, last: Played['log'][number]): Played => ({ state, triesLeft, log: [last] });
  it('words: wrong, last try, granted, locked', () => {
    expect(cuesForMove({ word: 'A' }, played('open', 3, { move: { word: 'A' }, likeness: 1 }))).toEqual(['guess', 'wrong']);
    expect(cuesForMove({ word: 'A' }, played('open', 1, { move: { word: 'A' }, likeness: 1 }))).toEqual(['guess', 'last']);
    expect(cuesForMove({ word: 'A' }, played('granted', 2, { move: { word: 'A' } }))).toEqual(['guess', 'granted']);
    expect(cuesForMove({ word: 'A' }, played('locked', 0, { move: { word: 'A' }, likeness: 0 }))).toEqual(['guess', 'locked']);
  });
  it('brackets: dud, reset, nothing', () => {
    expect(cuesForMove({ bracket: 0 }, played('open', 4, { move: { bracket: 0 }, removed: 'X' }))).toEqual(['guess', 'dud']);
    expect(cuesForMove({ bracket: 0 }, played('open', 4, { move: { bracket: 0 }, reset: true }))).toEqual(['guess', 'reset']);
    expect(cuesForMove({ bracket: 0 }, played('open', 4, { move: { bracket: 0 } }))).toEqual(['guess']);
  });
});
