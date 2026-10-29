import { describe, expect, it } from 'vitest';
import { inside, ownerAt, toBorder } from './district-lookup';

// The nearest-district lookup (map px), shared by the map tool and the game's live layer (blackouts phase 2 §3).
const sq = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
const districts = [{ border: sq(0, 0, 100) }, { border: [] as [number, number][] }, { border: sq(200, 0, 100) }];

describe('shared district lookup', () => {
  it('inside and toBorder', () => {
    expect(inside([50, 50], sq(0, 0, 100))).toBe(true);
    expect(inside([150, 50], sq(0, 0, 100))).toBe(false);
    expect(toBorder([50, 50], sq(0, 0, 100))).toBeCloseTo(50);
    expect(toBorder([130, 50], sq(0, 0, 100))).toBeCloseTo(30);
  });
  it('ownerAt: inside wins, else the nearest within reach, borderless districts skipped', () => {
    expect(ownerAt([50, 50], districts, 170)).toBe(1);
    expect(ownerAt([250, 50], districts, 170)).toBe(3);
    expect(ownerAt([180, 50], districts, 170)).toBe(3);
    expect(ownerAt([120, 50], districts, 170)).toBe(1);
    expect(ownerAt([150, 500], districts, 170)).toBe(0);
  });
});
