import { afterEach, describe, expect, it, vi } from 'vitest';
import { DICE_CUE_LEVEL, DICE_CUE_URL, diceCuePlayer } from '../src/ui/dice/sound';
import { GIG_CUE_LEVEL } from '../src/ui/gig/sound';
import { DiceTray } from '../src/ui/dice/tray';
import { lastBid } from '../../shared/dice/rules';

const NAMES = ['roll', 'bid', 'liar', 'reveal', 'lose-die', 'win', 'lose'] as const;
const key = (k: string) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('the cue table', () => {
  it('cue URLs under /sound/dice/, at the gig cues’ level', () => {
    expect(Object.keys(DICE_CUE_URL).sort()).toEqual([...NAMES].sort());
    for (const n of NAMES) expect(DICE_CUE_URL[n]).toBe(`/sound/dice/${n}.ogg`);
    expect(DICE_CUE_LEVEL).toBe(GIG_CUE_LEVEL);
  });
  it('the player plays a cue by name, and ignores names it doesn’t know', () => {
    const audio = { cue: vi.fn() };
    const play = diceCuePlayer(audio);
    play('dice:liar');
    play('dice:nope');
    play('slip:step');
    expect(audio.cue).toHaveBeenCalledTimes(1);
    expect(audio.cue).toHaveBeenCalledWith('/sound/dice/liar.ogg', DICE_CUE_LEVEL);
  });
});

describe('a game plays its cues', () => {
  let tray: DiceTray | null = null;
  afterEach(() => {
    tray?.destroy();
    tray = null;
    document.body.innerHTML = '';
  });
  const open = (cue: (name: string) => void) => {
    tray = new DiceTray(document.body, {
      her: { name: 'Cass', accent: '#46e3fc', settings: { bluff: 0.15, nerve: 0.45, suspicion: 0.75 } },
      you: 'Hicks',
      reducedMotion: true,
      seed: () => 1,
      onRound: () => {},
      onExpression: () => {},
      onSend: () => {},
      onClose: () => {},
      cue,
    });
    return tray;
  };
  /** Bid when you open, else call LIAR, until the reveal (or the result). */
  const toReveal = (t: DiceTray) => {
    for (let g = 0; g < 60 && !document.querySelector('.dice-reveal'); g++) key(lastBid(t.state()!) ? 'l' : 'Enter');
  };

  it('a scripted round plays roll, bid ×n, liar, reveal, lose-die in order', () => {
    const cues: string[] = [];
    const t = open((n) => cues.push(n));
    key('Enter');
    toReveal(t);
    expect(cues.join(' ')).toMatch(/^dice:roll( dice:bid)+ dice:liar dice:reveal dice:lose-die$/);
  });

  it('the result plays win or lose', () => {
    const cues: string[] = [];
    const t = open((n) => cues.push(n));
    key('Enter');
    for (let g = 0; g < 300 && !document.querySelector('.dice-result'); g++) {
      if (document.querySelector('.dice-reveal')) key('Enter');
      else toReveal(t);
    }
    const won = document.querySelector('.dice-big')!.textContent === 'YOU WIN';
    expect(cues.at(-1)).toBe(won ? 'dice:win' : 'dice:lose');
    expect(cues.filter((c) => c === 'dice:roll').length).toBe(t.state()!.rounds.length);
  });

  it('a cue that throws never breaks the tray', () => {
    const t = open(() => {
      throw new Error('no audio');
    });
    key('Enter');
    toReveal(t);
    expect(document.querySelector('.dice-reveal')).not.toBeNull();
  });
});
