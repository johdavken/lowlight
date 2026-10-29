import { describe, expect, it } from 'vitest';
import { addNarrated, darkNow, dropUndone, powerOf, type PowerPlace } from '../src/power';

const at = (day: number, h: number, m = 0) => (day - 1) * 1440 + h * 60 + m;
const rates = { _default: 0, karasu: 1 };
const PLACES: Record<string, PowerPlace> = {
  'karasu/noodle-stall': { district: 'karasu', on: null },
  'karasu/ribbon-rooftop': { district: 'karasu', on: 'ribbon' },
  'karasu/back-room': { district: 'karasu', on: null },
  'karasu/pylon-hab': { district: 'karasu', on: 'spine' },
  'spine/listening-post': { district: 'spine', on: 'spine' },
};
const locate = (sceneId: string): PowerPlace | null => PLACES[sceneId] ?? null;
const pt = (outages: object[] = []) => ({ id: 'pt-1', outages: outages as never });

describe('darkNow', () => {
  it('follows the schedule: night dark, day lit', () => {
    expect(darkNow(pt(), at(2, 23), rates).map((o) => o.district)).toEqual(['karasu']);
    expect(darkNow(pt(), at(2, 12), rates)).toEqual([]);
  });
  it('is empty without a playthrough', () => {
    expect(darkNow(null, at(2, 23), rates)).toEqual([]);
  });
});

describe('powerOf', () => {
  it('a Karasu room is dark with its district', () => {
    expect(powerOf(pt(), at(2, 23), rates, locate, 'karasu/noodle-stall')).toMatchObject({ district: 'karasu', outage: { district: 'karasu' } });
  });
  it('a place on the Ribbon goes dark with Karasu (its rooms are Karasu\'s); one standing on the Spine keeps its power', () => {
    expect(powerOf(pt(), at(2, 23), rates, locate, 'karasu/ribbon-rooftop').outage?.district).toBe('karasu');
    expect(powerOf(pt(), at(2, 23), rates, locate, 'karasu/pylon-hab')).toEqual({ district: 'karasu', outage: null });
  });
  it('a room with no place takes its folder', () => {
    expect(powerOf(pt(), at(2, 23), rates, locate, 'velvet/unknown')).toEqual({ district: 'velvet', outage: null });
    expect(powerOf(pt(), at(2, 23), { ...rates, velvet: 1 }, locate, 'velvet/unknown').outage?.district).toBe('velvet');
  });
});

describe('narrator outages', () => {
  it('adds one from the row for 90 minutes, not into a district already dark', () => {
    const day = { _default: 0 };
    const added = addNarrated(pt(), day, locate, { contact: 'nix', row: 'r1', at: at(2, 23), sceneId: 'karasu/noodle-stall' });
    expect(added).toEqual([{ district: 'karasu', from: at(2, 23), to: at(2, 23) + 90, by: 'narrator', contact: 'nix', row: 'r1' }]);
    expect(addNarrated(pt(added!), day, locate, { contact: 'nix', row: 'r2', at: at(2, 23, 30), sceneId: 'karasu/noodle-stall' })).toBeNull();
    // The schedule already has Karasu dark.
    expect(addNarrated(pt(), rates, locate, { contact: 'nix', row: 'r1', at: at(2, 23), sceneId: 'karasu/noodle-stall' })).toBeNull();
  });
  it('adds one on the Ribbon; never on the Spine', () => {
    expect(addNarrated(pt(), { _default: 0 }, locate, { contact: 'nix', row: 'r1', at: at(2, 23), sceneId: 'karasu/ribbon-rooftop' })).toHaveLength(1);
    expect(addNarrated(pt(), { _default: 0 }, locate, { contact: 'nix', row: 'r1', at: at(2, 23), sceneId: 'karasu/pylon-hab' })).toBeNull();
  });
  it('drops a contact\'s outage whose row is gone; keeps others and row-less ones', () => {
    const list = [
      { district: 'karasu', from: 1, to: 91, by: 'narrator', contact: 'nix', row: 'r1' },
      { district: 'velvet', from: 1, to: 91, by: 'narrator', contact: 'cass', row: 'c1' },
      { district: 'marsh', from: 1, to: 91, by: 'narrator', contact: 'nix', row: null },
    ] as const;
    expect(dropUndone(list, 'nix', () => true)).toBeNull();
    expect(dropUndone(list, 'nix', () => false)?.map((o) => o.district)).toEqual(['velvet', 'marsh']);
  });
});

describe('the schedule follows the playthrough\'s seed, not its id (review I3)', () => {
  it('a copy with the same seed has the same night', () => {
    const night = (p: { id: string; seed?: string }) => [20, 22, 0, 2, 4].map((h) => darkNow(p, (h < 6 ? 2 * 1440 : 1440) + h * 60 + 30, { marsh: 0.5 }).length);
    const nights = Array.from({ length: 30 }, (_, i) => night({ id: `pt-${i}`, seed: 'pt-orig' }));
    expect(new Set(nights.map((n) => n.join(''))).size).toBe(1);
  });
});
