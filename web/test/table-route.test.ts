import { describe, expect, it } from 'vitest';
import { fitTitle, routeEl, wayOf } from '../src/room/table/route';

const beat = (id: string, post?: { id: string; by?: string }) => ({ id, title: id.toUpperCase(), ...(post ? { post } : {}) });
const FORK = { ways: [{ via: 'charm', beats: [beat('lobby'), beat('desk', { id: 'glass' }), beat('floor-front'), beat('closet'), beat('out')] }, { via: 'stairs', beats: [beat('lobby'), beat('stairwell', { id: 'door' }), beat('floor-back'), beat('closet'), beat('out')] }], played: [] as string[] };
const ONE = { ways: [{ via: null, beats: [beat('a'), beat('b'), beat('c')] }], played: ['a'] };
const cls = (n: Element | null) => n?.getAttribute('class') ?? '';

describe('the route over the JOB column (the table in the trace)', () => {
  it('knows which way a run is on once it has played a beat only that way has', () => {
    expect(wayOf(FORK, 'lobby')).toBeNull();
    expect(wayOf({ ...FORK, played: ['lobby'] }, 'stairwell')).toBe(1);
    expect(wayOf({ ...FORK, played: ['lobby', 'desk', 'floor-front'] }, 'closet')).toBe(0);
  });

  it('a job with one way is a ladder: played, here, ahead', () => {
    const el = routeEl(ONE, 'b');
    expect(el.className).toBe('rt-ladder');
    expect([...el.children].map((c) => `${c.textContent}:${c.className}`)).toEqual(['A:f', 'B:on', 'C:']);
  });

  it('at the fork both ways are drawn, the picked card\'s lit and the other dim', () => {
    const el = routeEl(FORK, 'lobby', { pick: 1 });
    expect(el.tagName.toLowerCase()).toBe('svg');
    const paths = [...el.querySelectorAll('path')].map(cls);
    expect(paths).toEqual(['lit', 'dim', 'lit', 'dim']);
    expect(cls(el.querySelector('[data-beat="lobby"]'))).toBe('lit cur');
    expect(el.querySelectorAll('.pst')).toHaveLength(2);
  });

  it('past the fork the way you left is struck and the beat you\'re on is ringed', () => {
    const el = routeEl({ ...FORK, played: ['lobby'] }, 'stairwell');
    expect([...el.querySelectorAll('path')].map(cls)).toEqual(['lit', 'gone', 'lit', 'dim']);
    expect(cls(el.querySelector('[data-beat="desk"]'))).toBe('gone');
    expect(cls(el.querySelector('[data-beat="stairwell"]'))).toBe('lit cur');
    expect(el.querySelector('[data-beat="stairwell"] .now')).not.toBeNull();
  });

  it('a beat a held post covers rings in the crew\'s colour', () => expect(cls(routeEl({ ...FORK, played: ['lobby', 'stairwell', 'floor-back', 'closet'] }, 'out', { hot: true }).querySelector('[data-beat="out"]'))).toBe('hot cur'));

  it('three ways fall back to the ladder of the first', () => {
    const three = { ways: [...FORK.ways, { via: 'roof', beats: [beat('lobby'), beat('roof'), beat('out')] }], played: [] };
    expect(routeEl(three, 'lobby').className).toBe('rt-ladder');
  });

  it('cuts a long title: the THE first, then the end', () => {
    expect(fitTitle('THE DESK', 100)).toBe('THE DESK');
    expect(fitTitle('THE STAIRWELL', 80)).toBe('STAIRWELL');
    expect(fitTitle('THE SERVICE CORRIDOR', 60)).toBe('SERVIC…');
  });
});
