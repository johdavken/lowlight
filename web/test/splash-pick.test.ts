import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN, sessionSplashArt, splashArt } from '../src/landing/splash';

const entry = (id: string) => ({ id, url: `/api/splash-art/${id}.webp`, width: 1600, height: 900, logo: { x: 70, y: 70, width: 700 } });
const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const listing = (ids: string[]) => vi.fn(async () => new Response(JSON.stringify({ splashes: ids.map(entry) }), { status: 200 }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('splashArt', () => {
  it('picks among the listed entries by random()', async () => {
    for (const [r, id] of [[0, 'a'], [0.5, 'b'], [0.99, 'c']] as const) {
      const art = await splashArt({ fetchImpl: listing(['a', 'b', 'c']), random: () => r, local: store(), session: store() });
      expect(art).toEqual({ id, src: `/api/splash-art/${id}.webp`, width: 1600, height: 900, logo: { x: 70, y: 70, width: 700 } });
    }
  });

  it('never the last one shown when two or more; one entry is picked even if it was last', async () => {
    const local = store();
    local.setItem('lowlight.lastSplash', 'b');
    expect((await splashArt({ fetchImpl: listing(['a', 'b', 'c']), random: () => 0.5, local, session: store() })).id).not.toBe('b');
    const one = store();
    one.setItem('lowlight.lastSplash', 'a');
    expect((await splashArt({ fetchImpl: listing(['a']), random: () => 0, local: one, session: store() })).id).toBe('a');
  });

  it('writes the pick to lowlight.lastSplash and the session (for Esc back), and picks anew each time', async () => {
    const local = store();
    const session = store();
    const fetchImpl = listing(['a', 'b']);
    const first = await splashArt({ fetchImpl, random: () => 0.99, local, session });
    expect(local.m.get('lowlight.lastSplash')).toBe(first.id);
    expect(sessionSplashArt(session)).toEqual(first);
    const again = await splashArt({ fetchImpl, random: () => 0, local, session });
    expect(again.id).not.toBe(first.id);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sessionSplashArt(session)).toEqual(again);
  });

  it('the built-in on an error, an HTTP 500, an empty list, or no answer within the timeout', async () => {
    const o = () => ({ random: () => 0, local: store(), session: store() });
    expect(await splashArt({ ...o(), fetchImpl: vi.fn(async () => { throw new Error('down'); }) })).toEqual(BUILT_IN);
    expect(await splashArt({ ...o(), fetchImpl: vi.fn(async () => new Response('x', { status: 500 })) })).toEqual(BUILT_IN);
    expect(await splashArt({ ...o(), fetchImpl: listing([]) })).toEqual(BUILT_IN);
    const hang = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_r, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const p = splashArt({ ...o(), fetchImpl: hang as unknown as typeof fetch, timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toEqual(BUILT_IN);
  });

  it('storage that throws is ignored', async () => {
    const bad = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect((await splashArt({ fetchImpl: listing(['a']), random: () => 0, local: bad, session: bad })).id).toBe('a');
    expect(sessionSplashArt(bad)).toBeNull();
  });
});
