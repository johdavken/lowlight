import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { allGiven, DEFAULT_ORIGINS, DEFAULT_REASONS } from '../../shared/papers/data';
import { firstNightSeen, loadPapersData, markFirstNightSeen, registerPapersRoutes } from '../src/papers';

let dir: string;
let papersDir: string;
let dataDir: string;
const lore = new Set(['tidal-isle', 'neon-strand']);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-papers-'));
  papersDir = path.join(dir, 'papers');
  dataDir = path.join(dir, 'data');
  fs.mkdirSync(path.join(papersDir, 'faces'), { recursive: true });
  fs.mkdirSync(dataDir);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('loadPapersData', () => {
  it('missing files mean the defaults, and the faces in the folder', () => {
    fs.writeFileSync(path.join(papersDir, 'faces', 'o40-01.jpg'), 'jpg');
    const warn = vi.fn();
    const d = loadPapersData(papersDir, lore, warn);
    expect(d.origins).toEqual(DEFAULT_ORIGINS);
    expect(d.reasons).toEqual(DEFAULT_REASONS);
    expect(d.names).toEqual({ given: { f: [], m: [], x: [] }, family: [] });
    expect(d.faces).toEqual([{ id: 'o40-01', band: 'over 40', looks: ['over 40'] }]);
    expect(warn).not.toHaveBeenCalled();
  });
  it('bad JSON warns once and falls back', () => {
    fs.writeFileSync(path.join(papersDir, 'origins.json'), '{nope');
    const warn = vi.fn();
    expect(loadPapersData(papersDir, lore, warn).origins).toEqual(DEFAULT_ORIGINS);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('origins.json');
  });
  it('reads every file it finds', () => {
    fs.writeFileSync(path.join(papersDir, 'origins.json'), JSON.stringify([{ name: 'A' }, { name: 'B' }, { name: 'C', lore: 'tidal-isle' }]));
    fs.writeFileSync(path.join(papersDir, 'names.json'), JSON.stringify({ given: ['Ines'], family: ['Varga'] }));
    fs.writeFileSync(path.join(papersDir, 'faces', 'mid-01.jpg'), 'jpg');
    fs.writeFileSync(path.join(papersDir, 'faces.json'), JSON.stringify([{ id: 'mid-01', looks: ['25–40', 'over 40'] }]));
    fs.writeFileSync(path.join(papersDir, 'reasons.json'), JSON.stringify([{ match: { kind: 'ban' }, text: 'Shut.', lore: 'tidal-isle' }]));
    const d = loadPapersData(papersDir, lore, () => {});
    expect(d.origins.map((o) => o.name)).toEqual(['A', 'B', 'C']);
    expect(d.names.given).toEqual({ f: [], m: [], x: ['Ines'] });
    expect(d.faces[0].looks).toEqual(['25–40', 'over 40']);
    expect(d.reasons).toEqual([{ match: { kind: 'ban' }, text: 'Shut.', lore: 'tidal-isle' }]);
  });
});

describe('face file names (final review, finding 2)', () => {
  it('a photo the face route would not serve is skipped with a warning', () => {
    for (const f of ['o40-01.jpg', 'o40-1.jpg', 'u25-new.jpg']) fs.writeFileSync(path.join(papersDir, 'faces', f), 'jpg');
    const warn = vi.fn();
    expect(loadPapersData(papersDir, lore, warn).faces.map((f) => f.id)).toEqual(['o40-01']);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.map((c) => c[0]).join(' ')).toContain('o40-1.jpg');
  });
});

describe('the first-night marker', () => {
  it('is unseen until marked', () => {
    expect(firstNightSeen(dataDir)).toBe(false);
    markFirstNightSeen(dataDir);
    expect(firstNightSeen(dataDir)).toBe(true);
  });
});

describe('routes', () => {
  async function app() {
    const a = Fastify();
    registerPapersRoutes(a, { papersDir, dataDir, loreIds: () => lore });
    await a.ready();
    return a;
  }
  it('GET /api/papers says whether the first night is still to come', async () => {
    const a = await app();
    const first = (await a.inject({ method: 'GET', url: '/api/papers' })).json();
    expect(first.firstNight).toBe(true);
    expect(first.origins).toEqual(DEFAULT_ORIGINS);
    markFirstNightSeen(dataDir);
    expect((await a.inject({ method: 'GET', url: '/api/papers' })).json().firstNight).toBe(false);
  });
  it('serves a face as a jpeg, and nothing else', async () => {
    fs.writeFileSync(path.join(papersDir, 'faces', 'u25-03.jpg'), 'jpg-bytes');
    fs.writeFileSync(path.join(dir, 'secret.jpg'), 'no');
    const a = await app();
    const ok = await a.inject({ method: 'GET', url: '/api/papers/faces/u25-03.jpg' });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['content-type']).toBe('image/jpeg');
    expect(ok.body).toBe('jpg-bytes');
    for (const bad of ['..%2Fsecret.jpg', 'u25-03.png', 'x-01.jpg', 'u25-99.jpg']) expect((await a.inject({ method: 'GET', url: `/api/papers/faces/${bad}` })).statusCode).toBe(404);
  });
});

describe('the shipped world/papers', () => {
  it('loads with no warnings, with all 48 faces', () => {
    const ids = new Set(fs.readdirSync('world/lore').filter((n) => n.endsWith('.md')).map((n) => n.slice(0, -3)));
    const warn = vi.fn();
    const d = loadPapersData('world/papers', ids, warn);
    expect(warn).not.toHaveBeenCalled();
    expect(d.faces).toHaveLength(48);
    expect(allGiven(d.names.given).length).toBeGreaterThanOrEqual(30);
    expect(d.names.family.length).toBeGreaterThanOrEqual(30);
    expect(d.reasons).toEqual(DEFAULT_REASONS);
  });
  it('every Ferry Stairs tier has a papers brief', () => {
    const briefs = fs.readdirSync('world/gigs').filter((n) => n.endsWith('.md')).map((n) => fs.readFileSync(path.join('world/gigs', n), 'utf8'));
    const papers = briefs.filter((t) => /\nkind: papers\n/.test(t));
    for (const tier of ['easy', 'medium', 'hard']) expect(papers.some((t) => t.includes('place: ferry-stairs') && t.includes(`tier: ${tier}`))).toBe(true);
    expect(papers.some((t) => t.includes('place: the-tilt'))).toBe(true);
  });
});
