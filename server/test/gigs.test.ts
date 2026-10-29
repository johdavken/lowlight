import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadGigBriefs, registerGigRoute } from '../src/gigs';

let dir: string;
let gigsDir: string;
let mapFile: string;
const job = (place: string, tier = 'easy') => `---\ntitle: A Job\ntier: ${tier}\nplace: ${place}\nclient: C\ntarget: T\ntake: K\n---\nDo it.\n`;
const map = {
  version: 1,
  image: '/map/x.webp',
  panelAt: [50, 50],
  districts: [{ id: 'a', name: 'A', label: [1, 1] }],
  places: [
    { id: 'bar', name: 'The Bar', district: 'a', pin: [2, 2], gigs: true },
    { id: 'shop', name: 'The Shop', district: 'a', pin: [3, 3] },
  ],
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-gigs-'));
  gigsDir = path.join(dir, 'gigs');
  mapFile = path.join(dir, 'lowlight.json');
  fs.mkdirSync(gigsDir);
  fs.writeFileSync(mapFile, JSON.stringify(map));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('loadGigBriefs', () => {
  it('skips a bad file with one warning, and reads the rest', () => {
    fs.writeFileSync(path.join(gigsDir, 'good.md'), job('bar'));
    fs.writeFileSync(path.join(gigsDir, 'bad.md'), job('nowhere'));
    const warn = vi.fn();
    const briefs = loadGigBriefs(gigsDir, map as never, warn);
    expect(briefs.map((b) => b.id)).toEqual(['good']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('bad.md');
  });
  it('a missing folder has no briefs', () => {
    expect(loadGigBriefs(path.join(dir, 'none'), null, () => {})).toEqual([]);
  });
});

describe('GET /api/gigs', () => {
  const get = (place: string) => {
    const app = Fastify();
    registerGigRoute(app, { gigsDir, mapFile });
    return app.inject({ method: 'GET', url: `/api/gigs?place=${encodeURIComponent(place)}` });
  };
  it("returns the place's briefs, read fresh each time", async () => {
    expect((await get('bar')).json()).toEqual({ briefs: [] });
    fs.writeFileSync(path.join(gigsDir, 'later.md'), job('bar'));
    fs.writeFileSync(path.join(gigsDir, 'other.md'), job('shop'));
    const r = await get('bar');
    expect(r.statusCode).toBe(200);
    expect(r.json().briefs.map((b: { id: string }) => b.id)).toEqual(['later']);
  });
  it('a place with gigs off has none, and an unknown place is a 404', async () => {
    fs.writeFileSync(path.join(gigsDir, 'other.md'), job('shop'));
    expect((await get('shop')).json()).toEqual({ briefs: [] });
    expect((await get('nowhere')).statusCode).toBe(404);
  });
});

describe('the shipped world', () => {
  it("world/gigs/ loads against map/lowlight.json with no warnings, and the Glass Orchid's slips (dealt Under the Cat, its street) come at every tier", () => {
    const real = JSON.parse(fs.readFileSync('map/lowlight.json', 'utf8'));
    expect(real.places.find((p: { id: string }) => p.id === 'under-the-cat').gigs).toBe(true);
    const warn = vi.fn();
    const briefs = loadGigBriefs('world/gigs', real, warn);
    expect(warn).not.toHaveBeenCalled();
    const slips = briefs.filter((b) => b.kind === 'slip');
    // At least one slip per tier (the author adds more through COPY FOR OPUS → IMPORT).
    expect([...new Set(slips.filter((b) => b.place === 'under-the-cat').map((b) => b.tier))].sort()).toEqual(['easy', 'hard', 'medium']);
    expect(slips.some((b) => b.place === 'the-tilt' && b.tier === 'medium')).toBe(true);
  });
});
