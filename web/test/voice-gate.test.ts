// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { voiceGate } from '../src/room/voice-gate';

const setup = (scene: boolean) => {
  let end!: () => void;
  const done = scene ? new Promise<void>((r) => (end = r)) : Promise.resolve();
  const audio = { speak: vi.fn(), hush: vi.fn(), pause: vi.fn(), play: vi.fn() };
  const gate = voiceGate({ inScene: () => scene, sceneDone: () => done, ...audio });
  return { gate, audio, end: () => end() };
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the voice waits out a scene change', () => {
  it('speaks at once with no scene moment', async () => {
    const { gate, audio } = setup(false);
    gate.speak(['/a.ogg']);
    expect(audio.speak).toHaveBeenCalledWith(['/a.ogg'], undefined);
  });

  it('during a scene moment: quiet until the board is back, then the clips', async () => {
    const { gate, audio, end } = setup(true);
    gate.speak(['/a.ogg', '/b.ogg']);
    await flush();
    expect(audio.speak).not.toHaveBeenCalled();
    expect(audio.hush).toHaveBeenCalled();
    end();
    await flush();
    expect(audio.speak).toHaveBeenCalledWith(['/a.ogg', '/b.ogg'], undefined);
  });

  it('a hush or a newer reading while it waits drops the waiting one', async () => {
    const { gate, audio, end } = setup(true);
    gate.speak(['/a.ogg']);
    gate.hush();
    end();
    await flush();
    expect(audio.speak).not.toHaveBeenCalled();
  });

  it("a reading to follow ({ after }) that comes while one waits joins it: the pick's outcome, then the held beat", async () => {
    const { gate, audio, end } = setup(true);
    gate.speak(['/letter.ogg']);
    gate.speak(['/market.ogg'], { after: true });
    end();
    await flush();
    expect(audio.speak).toHaveBeenCalledTimes(1);
    expect(audio.speak).toHaveBeenCalledWith(['/letter.ogg', '/market.ogg'], undefined);
  });

  it('a reading to follow with none waiting, during a change, waits and then follows whatever is reading', async () => {
    const { gate, audio, end } = setup(true);
    gate.speak(['/market.ogg'], { after: true });
    expect(audio.speak).not.toHaveBeenCalled();
    end();
    await flush();
    expect(audio.speak).toHaveBeenCalledWith(['/market.ogg'], { after: true });
  });

  it('pause and play reach the voice, and say whether it is paused', () => {
    const { gate, audio } = setup(false);
    gate.speak(['/a.ogg']);
    gate.pause();
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(gate.paused()).toBe(true);
    gate.play();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(gate.paused()).toBe(false);
  });

  it('a pause during a scene change holds the waiting reading past it, until play', async () => {
    const { gate, audio, end } = setup(true);
    gate.speak(['/letter.ogg']);
    gate.pause();
    end();
    await flush();
    expect(audio.speak).not.toHaveBeenCalled();
    gate.play();
    expect(audio.speak).toHaveBeenCalledWith(['/letter.ogg'], undefined);
  });

  it('a new page (your pick) clears the pause: its reading plays', () => {
    const { gate, audio } = setup(false);
    gate.speak(['/a.ogg']);
    gate.pause();
    gate.speak(['/b.ogg']);
    expect(gate.paused()).toBe(false);
    expect(audio.speak).toHaveBeenLastCalledWith(['/b.ogg'], undefined);
  });

  it('restart reads the last page again from its first clip, and clears a pause', () => {
    const { gate, audio } = setup(false);
    gate.speak(['/a.ogg', '/b.ogg']);
    gate.speak(['/c.ogg'], { after: true });
    gate.pause();
    gate.restart();
    expect(gate.paused()).toBe(false);
    expect(audio.speak).toHaveBeenLastCalledWith(['/a.ogg', '/b.ogg', '/c.ogg'], undefined);
    expect(gate.page()).toEqual(['/a.ogg', '/b.ogg', '/c.ogg']);
  });
});
