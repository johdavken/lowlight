import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerMapRoute } from '../src/map-route';

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-map-'));
  file = path.join(dir, 'lowlight.json');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

async function get() {
  const app = Fastify();
  registerMapRoute(app, file);
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
