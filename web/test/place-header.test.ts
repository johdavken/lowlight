import { describe, expect, it } from 'vitest';
import { placeHeader } from '../src/room/place-header';

const NAMES: Record<string, string> = { 'spine/soren-hab': "Soren's Hab", 'spine/long-haul': 'The Long Haul' };

const header = () => {
  const shown: string[] = [];
  const h = placeHeader((n) => shown.push(n), (id) => NAMES[id]);
  return { h, last: () => shown.at(-1) };
};

describe('the HUD place name on a job beat', () => {
  it("names her room when there's no beat room", () => {
    const { h, last } = header();
    h.room('spine/soren-hab');
    expect(last()).toBe("Soren's Hab");
  });

  it("keeps the beat's room through her room's updates (a turn, a clock tick)", () => {
    const { h, last } = header();
    h.room('spine/soren-hab');
    h.beat('spine/long-haul');
    expect(last()).toBe('The Long Haul');
    h.room('spine/soren-hab');
    expect(last()).toBe('The Long Haul');
  });

  it('goes back to her room when the run leaves the beat room', () => {
    const { h, last } = header();
    h.room('spine/soren-hab');
    h.beat('spine/long-haul');
    h.beat(null);
    expect(last()).toBe("Soren's Hab");
  });

  it('a move while on the beat room shows once the beat ends', () => {
    const { h, last } = header();
    h.room('spine/soren-hab');
    h.beat('spine/long-haul');
    h.room('karasu/zhou-flat');
    expect(last()).toBe('The Long Haul');
    h.beat(null);
    expect(last()).toBe('karasu/zhou-flat');
  });
});
