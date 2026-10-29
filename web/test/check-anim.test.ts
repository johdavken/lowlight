import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playCheck } from '../src/room/check-anim';
import { missionCuePlayer, MISSION_CUE_URL } from '../src/ui/mission-sound';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

const card = () => {
  const c = document.createElement('div');
  c.className = 'qc-card';
  c.append(Object.assign(document.createElement('span'), { className: 'qc-line', textContent: 'Talk your way in.' }));
  document.body.append(c);
  return c;
};
const run = (o: Partial<Parameters<typeof playCheck>[1]> = {}) => {
  const cues: string[] = [];
  const c = card();
  const done = playCheck(c, { chance: 74, rolls: [31], pass: true, red: false, reduced: false, cue: (n) => cues.push(n), ...o });
  return { c, cues, done };
};

describe('playCheck', () => {
  it('a pass: lock, tick, pass; the card ends is-pass with CLEAN', async () => {
    const { c, cues, done } = run();
    await vi.runAllTimersAsync();
    await done;
    expect(cues).toEqual(['lock', 'tick', 'pass']);
    expect(c.classList.contains('is-pass')).toBe(true);
    expect(c.querySelector('.qc-stamp')!.textContent).toBe('CLEAN');
    expect(c.querySelector('.qc-tick')!.textContent).toBe('31');
  });

  it('a fail then a reroll pass: lock, tick, fail, reroll, tick, pass', async () => {
    const { c, cues, done } = run({ rolls: [88, 23] });
    await vi.runAllTimersAsync();
    await done;
    expect(cues).toEqual(['lock', 'tick', 'fail', 'reroll', 'tick', 'pass']);
    expect(c.classList.contains('is-pass')).toBe(true);
  });

  it('a fail ends is-fail with NO', async () => {
    const { c, done } = run({ rolls: [88], pass: false });
    await vi.runAllTimersAsync();
    await done;
    expect(c.classList.contains('is-fail')).toBe(true);
    expect(c.querySelector('.qc-stamp')!.textContent).toBe('NO');
  });

  it('red: lock, tick, red, and the roll takes 1500 ms', async () => {
    const { cues, done } = run({ rolls: [81], pass: false, red: true });
    let settled = false;
    void done.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(450 + 1400);
    expect(cues).toEqual(['lock', 'tick']);
    expect(settled).toBe(false);
    await vi.runAllTimersAsync();
    await done;
    expect(cues).toEqual(['lock', 'tick', 'red']);
  });

  it('a deck that dies shorts the card and cues dies', async () => {
    const { c, cues, done } = run({ rolls: [97], pass: false, deckDied: true });
    await vi.runAllTimersAsync();
    await done;
    expect(cues.at(-1)).toBe('dies');
    expect(c.classList.contains('shorting')).toBe(true);
  });

  it('a click mid-roll resolves it at once', async () => {
    const { c, cues, done } = run({ rolls: [88, 23] });
    await vi.advanceTimersByTimeAsync(300);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await done;
    expect(cues).toEqual(['lock', 'tick', 'fail', 'reroll', 'tick', 'pass']);
    expect(c.classList.contains('is-pass')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a reroll after a parked fail plays only the new roll: reroll, tick, pass (no lock)', async () => {
    const { cues, done } = run({ rolls: [88, 23], shown: 1 });
    await vi.runAllTimersAsync();
    await done;
    expect(cues).toEqual(['reroll', 'tick', 'pass']);
  });

  it('reduced motion runs with no timers', async () => {
    const { cues, done } = run({ reduced: true, rolls: [88, 23] });
    expect(vi.getTimerCount()).toBe(0);
    await done;
    expect(cues).toEqual(['lock', 'tick', 'fail', 'reroll', 'tick', 'pass']);
  });
});

describe('mission cues', () => {
  it("missionCue('pass') plays /sound/mission/pass.ogg; the reused ones play the game's", () => {
    const audio = { cue: vi.fn() };
    const cue = missionCuePlayer(audio);
    cue('pass');
    expect(audio.cue).toHaveBeenCalledWith('/sound/mission/pass.ogg', expect.any(Number));
    expect(MISSION_CUE_URL.lock).toBe('/sound/gig/select.ogg');
    expect(MISSION_CUE_URL.hover).toBe('/sound/ui/move.ogg');
    expect(MISSION_CUE_URL.clean).toBe('/sound/gig/clean.ogg');
    expect(MISSION_CUE_URL.blown).toBe('/sound/slip/caught.ogg');
  });
});
