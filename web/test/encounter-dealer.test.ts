import { describe, expect, it, vi } from 'vitest';
import type { Encounter } from '../../shared/encounter';
import { createDealer } from '../src/room/encounter-dealer';

const SET: Encounter[] = [{ title: 'A', text: 'a.' }, { title: 'B', text: 'b.' }, { title: 'C', text: 'c.' }];

describe('createDealer (minor M5)', () => {
  it('a deal still running is shared: Esc, then DRAW again, pays once', async () => {
    let resolve!: (s: Encounter[]) => void;
    const deal = vi.fn(() => new Promise<Encounter[]>((r) => (resolve = r)));
    const d = createDealer(deal);
    const first = d.load();
    const again = d.load(); // the panel closed and reopened meanwhile
    expect(deal).toHaveBeenCalledTimes(1);
    resolve(SET);
    expect(await first).toBe(SET);
    expect(await again).toBe(SET);
    // Kept for the next open, even though the panel that asked has gone.
    expect(d.cached).toBe(SET);
  });

  it('after it settles, a redraw deals again; clear forgets the set', async () => {
    const deal = vi.fn(async () => SET);
    const d = createDealer(deal);
    await d.load();
    await d.load();
    expect(deal).toHaveBeenCalledTimes(2);
    d.clear();
    expect(d.cached).toBeNull();
  });

  it('a deal running when the moment changes (clear) is not kept', async () => {
    let resolve!: (s: Encounter[]) => void;
    const d = createDealer(() => new Promise<Encounter[]>((r) => (resolve = r)));
    const p = d.load();
    d.clear();
    resolve(SET);
    await p;
    expect(d.cached).toBeNull();
  });

  it('a failed deal is not kept, and the next load tries again', async () => {
    const deal = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(SET);
    const d = createDealer(deal);
    await expect(d.load()).rejects.toThrow('x');
    expect(await d.load()).toBe(SET);
  });
});
