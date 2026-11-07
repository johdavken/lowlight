import { describe, expect, it } from 'vitest';
import { FrameCounter } from '../src/renderer/frame-counter';

describe('FrameCounter', () => {
  it('counts drawn frames over the last second, whatever the monitor ticks between them', () => {
    const c = new FrameCounter();
    // 60 drawn frames a second for two seconds: what a 60 cap on a 240 Hz screen draws.
    for (let i = 0; i < 120; i++) c.drew(1 + i * (1000 / 60));
    expect(c.rate(2000)).toBe(60);
  });

  it('reads 0 before anything is drawn and drops to 0 once drawing stops', () => {
    const c = new FrameCounter();
    expect(c.rate(500)).toBe(0);
    for (let i = 0; i < 30; i++) c.drew(i * (1000 / 30));
    expect(c.rate(1000)).toBe(30);
    expect(c.rate(3000)).toBe(0);
  });

  it('reads a full second early on as the rate so far', () => {
    const c = new FrameCounter();
    for (let i = 0; i < 15; i++) c.drew(i * (1000 / 60));
    expect(c.rate(250)).toBe(60);
  });
});
