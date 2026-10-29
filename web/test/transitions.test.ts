import { describe, expect, it } from 'vitest';
import { Transitions } from '../src/renderer/transitions';

function setup() {
  const log = { fade: [] as number[], glitch: [] as number[] };
  const tr = new Transitions({ setFade: (a) => log.fade.push(a), setGlitch: (a) => log.glitch.push(a) });
  return { tr, log };
}

/** Advances the transition clock in 1/60 s frames, letting promise callbacks run between frames. */
async function advance(tr: Transitions, seconds: number): Promise<void> {
  for (let t = 0; t < seconds; t += 1 / 60) {
    tr.update(1 / 60);
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe('Transitions', () => {
  it('fade goes 0→1, swaps at full black, then 1→0, over 1.2 s', async () => {
    const { tr, log } = setup();
    let fadeAtSwap = -1;
    let done = false;
    void tr
      .playTransition('fade', async () => {
        fadeAtSwap = log.fade[log.fade.length - 1];
      })
      .then(() => (done = true));
    await advance(tr, 0.55);
    expect(fadeAtSwap).toBe(-1);
    await advance(tr, 0.1);
    expect(fadeAtSwap).toBe(1);
    await advance(tr, 0.5);
    expect(done).toBe(false);
    await advance(tr, 0.1);
    expect(done).toBe(true);
    expect(log.fade[log.fade.length - 1]).toBe(0);
    expect(Math.max(...log.glitch)).toBe(0);
  });

  it('glitch peaks at the swap and finishes in 0.6 s', async () => {
    const { tr, log } = setup();
    let glitchAtSwap = -1;
    let done = false;
    void tr
      .playTransition('glitch', async () => {
        glitchAtSwap = log.glitch[log.glitch.length - 1];
      })
      .then(() => (done = true));
    await advance(tr, 0.25);
    expect(glitchAtSwap).toBe(-1);
    await advance(tr, 0.37);
    expect(glitchAtSwap).toBe(1);
    expect(done).toBe(true);
    expect(log.glitch[log.glitch.length - 1]).toBe(0);
    expect(Math.max(...log.fade)).toBe(0);
  });

  it('runs back-to-back transitions one at a time', async () => {
    const { tr } = setup();
    const order: string[] = [];
    void tr.playTransition('glitch', async () => void order.push('a'));
    void tr.playTransition('glitch', async () => void order.push('b'));
    await advance(tr, 0.4);
    expect(order).toEqual(['a']);
    await advance(tr, 0.7);
    expect(order).toEqual(['a', 'b']);
  });

  it('still fades back in when the swap fails', async () => {
    const { tr, log } = setup();
    const p = tr.playTransition('fade', async () => {
      throw new Error('load failed');
    });
    const settled = p.catch((e: Error) => e.message);
    await advance(tr, 1.4);
    expect(await settled).toBe('load failed');
    expect(log.fade[log.fade.length - 1]).toBe(0);
  });
});
