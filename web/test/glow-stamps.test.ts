import { describe, expect, it, vi } from 'vitest';
import { GlowStamps, stampSize } from '../src/ui/map/glow-stamps';

/** Canvases that count how many were made and record each gradient's stops. */
function maker() {
  const stops: [number, string][][] = [];
  const make = vi.fn(() => {
    const mine: [number, string][] = [];
    stops.push(mine);
    return {
      width: 0,
      height: 0,
      getContext: () => ({ createRadialGradient: () => ({ addColorStop: (at: number, c: string) => mine.push([at, c]) }), fillRect() {} }),
    } as unknown as HTMLCanvasElement;
  });
  return { make, stops };
}
const target = () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D & { drawImage: ReturnType<typeof vi.fn> };

describe('stampSize', () => {
  it('takes the next power of two across the light', () => {
    expect(stampSize(5)).toBe(16);
    expect(stampSize(8)).toBe(16);
    expect(stampSize(9)).toBe(32);
  });
  it('never makes one smaller than 8 or larger than 256', () => {
    expect(stampSize(1)).toBe(8);
    expect(stampSize(5000)).toBe(256);
  });
});

describe('GlowStamps', () => {
  it('stamps across the light, centred on it', () => {
    const { make } = maker();
    const g = target();
    new GlowStamps(make).draw(g, 'glow', '#fff', 100, 50, 10, 1);
    expect(g.drawImage).toHaveBeenCalledWith(expect.anything(), 90, 40, 20, 20);
  });

  it('makes a look, colour and size once', () => {
    const { make } = maker();
    const s = new GlowStamps(make);
    const g = target();
    s.draw(g, 'glow', '#fff', 0, 0, 10, 1);
    s.draw(g, 'glow', '#fff', 40, 40, 10, 1);
    expect(make).toHaveBeenCalledTimes(1);
    s.draw(g, 'glow', '#f00', 0, 0, 10, 1);
    s.draw(g, 'puff', '#fff', 0, 0, 10, 1);
    s.draw(g, 'glow', '#fff', 0, 0, 40, 1);
    expect(make).toHaveBeenCalledTimes(4);
    expect(g.drawImage).toHaveBeenCalledTimes(5);
  });

  it('sizes a stamp by device pixels', () => {
    const { make } = maker();
    const s = new GlowStamps(make);
    const g = target();
    s.draw(g, 'glow', '#fff', 0, 0, 10, 1);
    s.draw(g, 'glow', '#fff', 0, 0, 10, 2);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('keeps each look\'s fade', () => {
    const { make, stops } = maker();
    const s = new GlowStamps(make);
    const g = target();
    s.draw(g, 'glow', '#abc', 0, 0, 4, 1);
    s.draw(g, 'puff', '#abc', 0, 0, 4, 1);
    s.draw(g, 'dim', '', 0, 0, 4, 1);
    expect(stops).toEqual([
      [[0, '#abc'], [0.25, '#abc'], [1, 'rgba(0,0,0,0)']],
      [[0, '#abc'], [1, 'rgba(0,0,0,0)']],
      [[0, 'rgba(8,5,16,1)'], [1, 'rgba(8,5,16,0)']],
    ]);
  });

  it('starts over past its limit, so a painting of many colours cannot grow it for ever', () => {
    const { make } = maker();
    const s = new GlowStamps(make);
    const g = target();
    for (let i = 0; i <= 512; i++) s.draw(g, 'glow', `rgb(${i},0,0)`, 0, 0, 4, 1);
    s.draw(g, 'glow', 'rgb(0,0,0)', 0, 0, 4, 1);
    expect(make).toHaveBeenCalledTimes(514);
  });

  it('draws nothing without a 2D canvas', () => {
    const g = target();
    new GlowStamps(() => ({ getContext: () => null }) as unknown as HTMLCanvasElement).draw(g, 'glow', '#fff', 0, 0, 4, 1);
    expect(g.drawImage).not.toHaveBeenCalled();
  });
});
