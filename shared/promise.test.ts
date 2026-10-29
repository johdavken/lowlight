import { describe, expect, it } from 'vitest';
import { deckReadKey, parsePromise, promiseDue, promiseExpired, promiseKey, promiseTriesKey, PROMISE_SCAN_STEP, PROMISE_TRIES, PROMISE_WINDOW, type TextPromise } from './promise';

const DAY2 = 1440;
const at = (h: number, m = 0) => DAY2 + h * 60 + m;
const home = (p: Partial<TextPromise> = {}): TextPromise => ({ when: { place: 'karasu/nix-home' }, about: "that she's home", from: 'r1', since: at(4), ...p });

describe('promised texts (spec 2026-10-23 §3)', () => {
  it('keys and limits', () => {
    expect([promiseKey('hicks'), promiseTriesKey('hicks'), deckReadKey('hicks')]).toEqual(['promise.hicks', 'promisetries.hicks', 'deckread.hicks']);
    expect([PROMISE_SCAN_STEP, PROMISE_WINDOW, PROMISE_TRIES]).toEqual([15, 1440, 3]);
  });

  it('a time promise is due once the clock reaches it', () => {
    const p = home({ when: { at: at(22) } });
    expect(promiseDue(p, at(21, 59), () => null)).toBeNull();
    expect(promiseDue(p, at(22), () => null)).toBe(at(22));
    expect(promiseDue(p, at(23, 30), () => null)).toBe(at(22));
  });

  it("a place promise is due at the first step she's there: 04:00 → 20:00 finds 05:00", () => {
    const placeAt = (t: number) => (t >= at(5) && t < at(18) ? 'karasu/nix-home' : 'karasu/intake');
    expect(promiseDue(home(), at(20), placeAt)).toBe(at(5));
  });

  it("not there yet: null; there only now: now", () => {
    expect(promiseDue(home(), at(4, 40), () => 'karasu/intake')).toBeNull();
    expect(promiseDue(home(), at(4, 7), (t) => (t === at(4, 7) ? 'karasu/nix-home' : 'karasu/intake'))).toBe(at(4, 7));
  });

  it('expired after 24 story hours', () => {
    expect(promiseExpired(home(), at(4) + 1440)).toBe(false);
    expect(promiseExpired(home(), at(4) + 1441)).toBe(true);
  });

  it('parsePromise reads a good one and rejects bad shapes', () => {
    expect(parsePromise(JSON.stringify(home()))).toEqual(home());
    expect(parsePromise(JSON.stringify(home({ when: { at: at(22) } })))).toEqual(home({ when: { at: at(22) } }));
    for (const bad of [null, '', '{', '{}', JSON.stringify({ ...home(), when: {} }), JSON.stringify({ ...home(), since: 'x' }), JSON.stringify({ ...home(), about: 3 })]) expect(parsePromise(bad)).toBeNull();
  });
});

describe('her day, for the scribe (deck controls spec §1)', () => {
  it('lists her blocks by place and hours, in order from midnight, with days when set', async () => {
    const { dayWords } = await import('./promise');
    const blocks = [
      { from: 1200, to: 240, room: 'intake' },
      { from: 300, to: 1080, room: 'home' },
      { from: 1080, to: 1140, room: 'tilt', days: [4, 5] },
    ];
    const name = (r: string) => ({ intake: 'Lowlight Intake', home: "Nix's apartment", tilt: 'the Tilt' })[r] ?? r;
    expect(dayWords(blocks, name)).toBe("Nix's apartment 05:00–18:00 · the Tilt 18:00–19:00 (Fri, Sat) · Lowlight Intake 20:00–04:00");
    expect(dayWords([], name)).toBeNull();
  });
});

describe('the places she can promise to text from (deck controls e2e finding)', () => {
  it("adds the rooms of her day that aren't map places, named by the room", async () => {
    const { promisePlaces } = await import('./promise');
    const map = [{ id: 'karasu/the-tilt', name: 'The Tilt' }];
    const blocks = [
      { from: 300, to: 1080, room: 'karasu/nix-apartment' },
      { from: 1080, to: 1140, room: 'karasu/the-tilt' },
    ];
    expect(promisePlaces(map, blocks, (r) => (r === 'karasu/nix-apartment' ? "Nix's Apartment" : r))).toEqual([
      { id: 'karasu/the-tilt', name: 'The Tilt' },
      { id: 'karasu/nix-apartment', name: "Nix's Apartment" },
    ]);
  });
});
