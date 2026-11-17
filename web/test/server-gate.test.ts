import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GATE_QUIET_MS, GATE_RETRY_MS, waitForGame } from '../src/landing/server-gate';

const ok = () => Promise.resolve(new Response('{}', { status: 200 }));
const down = () => Promise.reject(new TypeError('fetch failed'));
const screen = () => document.querySelector('.game-starting');

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="host"></div>';
});
afterEach(() => vi.useRealTimers());

describe('waitForGame', () => {
  it('a server that answers at once: no screen, resolves straight away', async () => {
    const fetchImpl = vi.fn(ok) as unknown as typeof fetch;
    let done = false;
    void waitForGame(document.getElementById('host')!, { fetchImpl }).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    await vi.advanceTimersByTimeAsync(GATE_QUIET_MS * 2);
    expect(screen()).toBeNull();
  });

  it('a starting server: THE GAME IS STARTING with a timer, retries, and the screen goes when it answers', async () => {
    let up = false;
    const fetchImpl = vi.fn(() => (up ? ok() : down())) as unknown as typeof fetch;
    let done = false;
    void waitForGame(document.getElementById('host')!, { fetchImpl }).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(screen()?.textContent).toContain('THE GAME IS STARTING');
    await vi.advanceTimersByTimeAsync(GATE_RETRY_MS * 3);
    expect(done).toBe(false);
    expect(document.querySelector('.gs-time')!.textContent).toBe('0:03');
    expect((fetchImpl as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBeGreaterThanOrEqual(3);
    up = true;
    await vi.advanceTimersByTimeAsync(GATE_RETRY_MS);
    expect(done).toBe(true);
    expect(screen()).toBeNull();
  });

  it('counts a proxy error (Vite answering 502 while the server is down) as not up yet', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(() => (++calls < 3 ? Promise.resolve(new Response('', { status: 502 })) : ok())) as unknown as typeof fetch;
    let done = false;
    void waitForGame(document.getElementById('host')!, { fetchImpl }).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(GATE_RETRY_MS * 3);
    expect(done).toBe(true);
    expect(calls).toBe(3);
  });
});
