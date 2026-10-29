import { describe, expect, it, vi } from 'vitest';
import { connectSocket, socketUrl } from '../src/net/socket';

describe('socketUrl', () => {
  it("says enter=1 on the page's first connect only (a reconnect is not the player walking in)", () => {
    expect(socketUrl({ proto: 'ws:', host: 'h:1', agentId: 'nix', token: 't', player: null, first: true })).toBe('ws://h:1/ws/nix?token=t&enter=1');
    expect(socketUrl({ proto: 'ws:', host: 'h:1', agentId: 'nix', token: 't', player: 'hicks', first: false })).toBe('ws://h:1/ws/nix?token=t&as=hicks');
  });
});

describe('connectSocket enter=1', () => {
  it('keeps enter=1 until a socket opens: a first socket that never opened is retried with it (final review 5)', async () => {
    vi.useFakeTimers();
    const urls: string[] = [];
    const socks: FakeWs[] = [];
    class FakeWs {
      static OPEN = 1;
      readyState = 0;
      onopen: (() => void) | null = null;
      onclose: ((e: { code: number }) => void) | null = null;
      onmessage: ((m: { data: string }) => void) | null = null;
      constructor(url: string) {
        urls.push(url);
        socks.push(this);
      }
    }
    vi.stubGlobal('WebSocket', FakeWs);
    vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ token: 't' }) }));
    connectSocket('nix', null, () => {}, () => {});
    await vi.advanceTimersByTimeAsync(0);
    socks[0]!.onclose!({ code: 1006 }); // never opened
    await vi.advanceTimersByTimeAsync(600);
    expect(urls[1]).toContain('enter=1');
    socks[1]!.onopen!();
    socks[1]!.onclose!({ code: 1006 });
    await vi.advanceTimersByTimeAsync(1100);
    expect(urls[2]).not.toContain('enter=1');
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
