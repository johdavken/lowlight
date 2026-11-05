import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadReadouts, registerMapRoute } from '../src/map-route';

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-map-'));
  file = path.join(dir, 'lowlight.json');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function get() {
  const app = Fastify();
  registerMapRoute(app, file, path.join(dir, 'readouts'));
  return app.inject({ method: 'GET', url: '/api/map' });
}

const valid = {
  version: 1,
  image: '/map/x.webp',
  panelAt: [50, 50],
  districts: [{ id: 'a', name: 'A', label: [1, 1] }],
  places: [],
};

describe('GET /api/map', () => {
  it("adds each place's readout from its file; a place without one stays as it is", async () => {
    const places = [{ id: 'p1', name: 'P one', district: 'a', pin: [2, 2] }, { id: 'p2', name: 'P two', district: 'a', pin: [3, 3] }];
    fs.writeFileSync(file, JSON.stringify({ ...valid, places }));
    fs.mkdirSync(path.join(dir, 'readouts'));
    fs.writeFileSync(path.join(dir, 'readouts', 'p1.md'), "WHAT: A bar.\n\nWHO RUNS IT: Cass's house.\nnot a line\n");
    const res = await get();
    expect(res.json().places).toEqual([{ ...places[0], readout: [{ label: 'WHAT', text: 'A bar.' }, { label: 'WHO RUNS IT', text: "Cass's house." }] }, places[1]]);
  });

  it('every pinned place in the shipped map has a readout', () => {
    const map = JSON.parse(fs.readFileSync('map/lowlight.json', 'utf8')) as { places: { id: string; side?: boolean }[] };
    const readouts = loadReadouts('world/readouts');
    expect(map.places.filter((p) => !p.side && !readouts[p.id]).map((p) => p.id)).toEqual([]);
  });

  it('serves the file as it is', async () => {
    fs.writeFileSync(file, JSON.stringify(valid));
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(valid);
  });

  it('answers 404 when there is no map', async () => {
    const res = await get();
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'no map' });
  });

  it('answers 500 with the problem for broken data', async () => {
    fs.writeFileSync(file, JSON.stringify({ ...valid, districts: [valid.districts[0], valid.districts[0]] }));
    const res = await get();
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('map data is broken');
    expect(res.json().errors[0].path).toBe('districts.1.id');
  });

  it('answers 500 for a file that is not JSON', async () => {
    fs.writeFileSync(file, '{');
    const res = await get();
    expect(res.statusCode).toBe(500);
    expect(res.json().errors[0].path).toBe('');
  });

  it('reads the file on every request', async () => {
    fs.writeFileSync(file, JSON.stringify(valid));
    const app = Fastify();
    registerMapRoute(app, file);
    await app.inject({ method: 'GET', url: '/api/map' });
    fs.writeFileSync(file, JSON.stringify({ ...valid, image: '/map/y.webp' }));
    expect((await app.inject({ method: 'GET', url: '/api/map' })).json().image).toBe('/map/y.webp');
  });
});
