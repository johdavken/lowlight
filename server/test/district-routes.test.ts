import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoreEntry } from '../../shared/lore';
import { registerDistrictRoutes } from '../src/district-routes';

let dir: string;
const MAP = [
  { id: 'karasu', name: 'Karasu' },
  { id: 'strand', name: 'Neon Strand' },
  { id: 'bay', name: 'Lowlight Bay' },
];
// The rooms sit in a folder named for no district (ribbon), so the map's places say where they are.
const PLACES = [
  { scene: 'ribbon/the-tilt', district: 'karasu' },
  { scene: 'ribbon/glass-orchid', district: 'strand' },
  { district: 'karasu' },
];
const E = (id: string, title: string, body: string): LoreEntry => ({ id, title, keys: [], districts: [], places: [], always: false, body });
let lore: LoreEntry[];

async function app() {
  const warn = vi.fn();
  const a = Fastify();
  registerDistrictRoutes(a, { dir, districts: () => MAP, places: () => PLACES, lore: () => lore, warn });
  await a.ready();
  return { a, warn };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'districts-'));
  fs.writeFileSync(path.join(dir, 'karasu.webp'), Buffer.from('RIFFxxxxWEBP'));
  fs.writeFileSync(path.join(dir, 'districts.json'), JSON.stringify({ karasu: { subtitle: 'Old Town · The Ribbon' } }));
  lore = [E('karasu', 'KARASU ', 'Old.\n\nBones.'), E('neon-strand', 'Neon Strand', 'Lights.')];
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('GET /api/districts/:id', () => {
  it('known id returns name, subtitle, lore by title and hasArt', async () => {
    const { a } = await app();
    const res = await a.inject('/api/districts/karasu');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: 'karasu', name: 'Karasu', subtitle: 'Old Town · The Ribbon', lore: 'Old.\n\nBones.', hasArt: true });
  });

  it('no art and no subtitle', async () => {
    const { a } = await app();
    const body = (await a.inject('/api/districts/strand')).json();
    expect(body).toEqual({ id: 'strand', name: 'Neon Strand', lore: 'Lights.', hasArt: false });
    expect('subtitle' in body).toBe(false);
  });

  it('district without a lore entry is 404', async () => {
    const { a } = await app();
    expect((await a.inject('/api/districts/bay')).statusCode).toBe(404);
  });

  it('unknown and path-like ids are 404', async () => {
    const { a } = await app();
    for (const id of ['nowhere', '..%2Fx', 'karasu.webp']) {
      expect((await a.inject(`/api/districts/${id}`)).statusCode).toBe(404);
      expect((await a.inject(`/api/district-art/${id}`)).statusCode).toBe(404);
    }
  });

  it('serves the art as webp', async () => {
    const { a } = await app();
    const res = await a.inject('/api/district-art/karasu');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect((await a.inject('/api/district-art/strand')).statusCode).toBe(404);
  });

  it('broken districts.json gives no subtitle and warns', async () => {
    fs.writeFileSync(path.join(dir, 'districts.json'), JSON.stringify({ karasu: { subtitle: 5 } }));
    const { a, warn } = await app();
    const body = (await a.inject('/api/districts/karasu')).json();
    expect('subtitle' in body).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('duplicate titles use the first and warn', async () => {
    lore = [E('a', 'Karasu', 'First.'), E('b', 'Karasu', 'Second.')];
    const { a, warn } = await app();
    expect((await a.inject('/api/districts/karasu')).json().lore).toBe('First.');
    expect(warn).toHaveBeenCalled();
  });
});

describe('GET /api/districts?scene=', () => {
  const scene = (id: string) => `/api/districts?scene=${encodeURIComponent(id)}`;

  it("a room's district comes from the map place that is that room", async () => {
    const { a } = await app();
    expect((await a.inject(scene('ribbon/the-tilt'))).json().id).toBe('karasu');
    expect((await a.inject(scene('ribbon/glass-orchid'))).json()).toMatchObject({ id: 'strand', name: 'Neon Strand' });
  });

  it('a room no place names falls back to its folder when that is a district', async () => {
    const { a } = await app();
    expect((await a.inject(scene('karasu/new-room'))).json().id).toBe('karasu');
  });

  it('a room in no district is a plain null, not an error (the browser logs every 404)', async () => {
    const { a } = await app();
    for (const url of [scene('ribbon/nowhere'), scene('default/rooftop'), '/api/districts', '/api/districts?scene=a&scene=b']) {
      const res = await a.inject(url);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toBeNull();
    }
  });
});

describe('GET /api/district-list', () => {
  it("every map district's id, name and whether it has art, lore or not, in one list", async () => {
    const { a } = await app();
    const res = await a.inject('/api/district-list');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { id: 'karasu', name: 'Karasu', hasArt: true },
      { id: 'strand', name: 'Neon Strand', hasArt: false },
      { id: 'bay', name: 'Lowlight Bay', hasArt: false },
    ]);
  });
});
