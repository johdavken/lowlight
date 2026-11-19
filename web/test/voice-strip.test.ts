// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountVoiceStrip } from '../src/room/voice-strip';
import type { VoiceGate } from '../src/room/voice-gate';

let col: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<section class="jc"></section>';
  col = document.querySelector('.jc')!;
});

const setup = (o: { page?: string[]; paused?: boolean; speaking?: boolean; level?: number } = {}) => {
  const state = { page: o.page ?? ['/a.ogg'], paused: o.paused ?? false, speaking: o.speaking ?? true, level: o.level ?? 0.75 };
  const gate = {
    page: () => state.page,
    paused: () => state.paused,
    pause: vi.fn(() => (state.paused = true)),
    play: vi.fn(() => (state.paused = false)),
    restart: vi.fn(),
  } as unknown as VoiceGate;
  const step = vi.fn((n: number) => (state.level = Math.min(1, Math.max(0, Math.round((state.level + 0.05 * n) * 100) / 100))));
  const strip = mountVoiceStrip(col, { gate, speaking: () => state.speaking, level: () => state.level, step });
  strip.refresh();
  const q = (sel: string) => col.querySelector<HTMLElement>(sel)!;
  return { state, gate, step, strip, q };
};

describe("the narrator's controls on the JOB column", () => {
  it('hide with no narration on the page, show with it', () => {
    const { state, strip, q } = setup({ page: [] });
    expect(q('.jc-voice').hidden).toBe(true);
    state.page = ['/a.ogg'];
    strip.refresh();
    expect(q('.jc-voice').hidden).toBe(false);
  });

  it('❚❚ while it reads pauses it; ▶ while paused plays it on', () => {
    const { gate, strip, q } = setup();
    expect(q('.jcv-play').dataset.state).toBe('playing');
    expect(q('.jcv-play').getAttribute('aria-label')).toBe('Pause the narrator');
    q('.jcv-play').click();
    expect(gate.pause).toHaveBeenCalled();
    strip.refresh();
    expect(q('.jcv-play').dataset.state).toBe('paused');
    q('.jcv-play').click();
    expect(gate.play).toHaveBeenCalled();
  });

  it('▶ once the page has finished reading reads it again', () => {
    const { gate, q } = setup({ speaking: false });
    expect(q('.jcv-play').dataset.state).toBe('done');
    q('.jcv-play').click();
    expect(gate.restart).toHaveBeenCalled();
  });

  it('↺ reads the page again from its first clip', () => {
    const { gate, q } = setup();
    q('.jcv-restart').click();
    expect(gate.restart).toHaveBeenCalled();
  });

  it('VOICE shows the level; a click steps it 10 %, past 100 back to 0; the wheel steps it up and down', () => {
    const { step, q } = setup({ level: 0.75 });
    expect(q('.jcv-vol').textContent).toBe('VOICE 75%');
    q('.jcv-vol').click();
    expect(step).toHaveBeenLastCalledWith(2);
    expect(q('.jcv-vol').textContent).toBe('VOICE 85%');
    q('.jcv-vol').dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    expect(step).toHaveBeenLastCalledWith(-2);
    expect(q('.jcv-vol').textContent).toBe('VOICE 75%');
  });

  it('VOICE at 100 % goes round to 0 on a click', () => {
    const { step, q } = setup({ level: 1 });
    q('.jcv-vol').click();
    expect(step).toHaveBeenLastCalledWith(-20);
    expect(q('.jcv-vol').textContent).toBe('VOICE 0%');
  });
});
