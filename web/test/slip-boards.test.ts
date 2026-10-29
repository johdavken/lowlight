import { afterEach, describe, expect, it, vi } from 'vitest';
import { slipBoards } from '../src/ui/slip/boards';
import { generateSlip } from '../../shared/slip/generate';
import type { SlipBoard } from '../../shared/slip/rules';

afterEach(() => vi.unstubAllGlobals());

describe('slipBoards', () => {
  it('without Worker: resolves the same board as generateSlip', async () => {
    expect(typeof (globalThis as { Worker?: unknown }).Worker).toBe('undefined');
    expect(await slipBoards()('easy', 3)).toEqual(generateSlip('easy', 3));
  });

  it('tries seed+1..seed+5 when one comes back null; null after 6', async () => {
    const seen: number[] = [];
    const board = generateSlip('easy', 3)!;
    const gen = (_t: string, seed: number) => (seen.push(seed), seed === 12 ? board : null);
    expect(await slipBoards(gen)('easy', 10)).toBe(board);
    expect(seen).toEqual([10, 11, 12]);
    seen.length = 0;
    expect(await slipBoards(() => (seen.push(0), null))('easy', 1)).toBeNull();
    expect(seen).toHaveLength(6);
  });

  it('with a Worker: two requests answered in reverse order resolve to their own boards', async () => {
    const workers: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      sent: { id: number; tier: string; seed: number }[] = [];
      constructor() {
        workers.push(this);
      }
      postMessage(m: { id: number; tier: string; seed: number }) {
        this.sent.push(m);
      }
      reply(m: { id: number; board: SlipBoard | null }) {
        this.onmessage?.({ data: m } as MessageEvent);
      }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const get = slipBoards();
    const a = get('easy', 3);
    const b = get('medium', 11);
    const w = workers[0];
    expect(w.sent.map((m) => [m.tier, m.seed])).toEqual([
      ['easy', 3],
      ['medium', 11],
    ]);
    const boardA = generateSlip('easy', 3);
    const boardB = generateSlip('medium', 11);
    w.reply({ id: w.sent[1].id, board: boardB });
    w.reply({ id: w.sent[0].id, board: boardA });
    expect(await a).toEqual(boardA);
    expect(await b).toEqual(boardB);
  });

  it('dispose terminates the worker and settles anything pending with null', async () => {
    const workers: { terminated: boolean; sent: unknown[] }[] = [];
    class FakeWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      terminated = false;
      sent: unknown[] = [];
      constructor() {
        workers.push(this);
      }
      postMessage(m: unknown) {
        this.sent.push(m);
      }
      terminate() {
        this.terminated = true;
      }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const get = slipBoards();
    const pending = get('easy', 3);
    get.dispose();
    expect(workers[0].terminated).toBe(true);
    expect(await pending).toBeNull();
  });

  it('a worker that errors settles its requests with null, and later boards come from this thread', async () => {
    const workers: { onerror: ((e: Event) => void) | null; sent: unknown[] }[] = [];
    class FakeWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      sent: unknown[] = [];
      constructor() {
        workers.push(this);
      }
      postMessage(m: unknown) {
        this.sent.push(m);
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', FakeWorker);
    const gen = slipBoards();
    const pending = gen('easy', 3);
    await Promise.resolve();
    workers[0].onerror!(new Event('error'));
    // The first seed came back null, so it moves on to the next ones, now made here.
    expect(await pending).toEqual(generateSlip('easy', 4));
    expect(await gen('medium', 11)).toEqual(generateSlip('medium', 11));
  });
});
