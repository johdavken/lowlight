import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerPeopleRoutes } from '../src/people-routes';
import { emptyFields } from '../../shared/figure-prompt';

let root: string;
let app: FastifyInstance;
let stub: http.Server;
let calls: { auth?: string; body: { prompt: string; input_references: { image_url: { url: string } }[] } }[];
/** The stub's answer; `hold` keeps it from answering until released. */
let answer: { status: number; json: unknown };
let hold: Promise<void> | null;

const png = (w: number, h: number, rgb: [number, number, number]) => {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < p.data.length; i += 4) p.data.set([...rgb, 255], i);
  return PNG.sync.write(p);
};
const dataUrl = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`;
const SILHOUETTE = png(8, 12, [3, 2, 4]);
const ANCHOR = png(8, 12, [10, 10, 10]);

function key(on: boolean) {
  fs.writeFileSync(path.join(root, 'data', 'settings.json'), JSON.stringify({ version: 1, keys: on ? { openrouter: 'sk-or-test' } : {}, recentModels: [], characterModels: {} }));
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'people-routes-'));
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  key(true);
  for (const [id, file, buf] of [['newcomer', 'newcomer-outfit-plain.png', SILHOUETTE], ['ember', 'ember-outfit-indoors.png', ANCHOR]] as const) {
    fs.mkdirSync(path.join(root, 'characters', id), { recursive: true });
    fs.writeFileSync(path.join(root, 'characters', id, file), buf);
  }
  fs.writeFileSync(path.join(root, 'palette.json'), JSON.stringify({ block: 2, colours: ['#808080', '#c81e1e', '#00ff00'] }));
  calls = [];
  hold = null;
  answer = { status: 200, json: { data: [{ b64_json: png(1024, 1536, [0, 255, 0]).toString('base64') }], usage: { cost: 0.19 } } };
  stub = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', async () => {
      calls.push({ auth: req.headers.authorization, body: JSON.parse(data) });
      if (hold) await hold;
      res.writeHead(answer.status, { 'content-type': 'application/json' }).end(JSON.stringify(answer.json));
    });
  });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
  app = Fastify();
  registerPeopleRoutes(app, {
    dir: path.join(root, 'data', 'people'),
    dataDir: path.join(root, 'data'),
    charactersDir: path.join(root, 'characters'),
    paletteFile: path.join(root, 'palette.json'),
    openrouterBaseUrl: `http://127.0.0.1:${(stub.address() as AddressInfo).port}`,
    originAllowed: (o) => o === undefined || o === 'http://localhost:5173',
  });
});
afterEach(async () => {
  await app.close();
  stub.closeAllConnections();
  await new Promise((r) => stub.close(r));
  fs.rmSync(root, { recursive: true, force: true });
});

const req = async (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) => {
  const r = await app.inject({ method: method as 'GET', url, payload: payload as object | undefined, headers });
  return { status: r.statusCode, body: r.headers['content-type']?.toString().includes('json') ? r.json() : r.rawPayload };
};
const WHO = { name: 'Vee', pronoun: 'she', background: 'From the Spine.', wears: 'a grey quilted jacket, cargo trousers, boots' };
const draft = async () => (await req('POST', '/api/people')).body.id as string;
const fields = { ...emptyFields(), hair: 'cropped, black' };

describe('people routes', () => {
  it('GET lists saved people (no drafts) and whether an OpenRouter key is linked', async () => {
    const id = await draft();
    expect((await req('GET', '/api/people')).body).toEqual({ people: [], key: true });
    await req('PUT', `/api/people/${id}`, WHO);
    const listed = (await req('GET', '/api/people')).body;
    expect(listed.people.map((p: { name: string }) => p.name)).toEqual(['Vee']);
    key(false);
    expect((await req('GET', '/api/people')).body.key).toBe(false);
  });

  it('writes are refused from another origin', async () => {
    expect((await req('POST', '/api/people', undefined, { origin: 'http://evil.example' })).status).toBe(403);
  });

  it('PUT refuses a bad WHO and an unknown person', async () => {
    const id = await draft();
    expect(await req('PUT', `/api/people/${id}`, { ...WHO, name: '' })).toEqual({ status: 400, body: { error: 'bad-who' } });
    expect((await req('PUT', '/api/people/p-1794679903078-000000', WHO)).status).toBe(404);
    expect((await req('PUT', '/api/people/nope', WHO)).status).toBe(404);
  });

  it('generate with no key is a 400 no-key, and calls nothing', async () => {
    key(false);
    const id = await draft();
    expect(await req('POST', `/api/people/${id}/generate`, { fields })).toEqual({ status: 400, body: { error: 'no-key' } });
    expect(calls).toEqual([]);
  });

  it('generate sends the anchor then the silhouette, keeps the raw and the cleaned take', async () => {
    const id = await draft();
    await req('PUT', `/api/people/${id}`, WHO);
    const r = await req('POST', `/api/people/${id}/generate`, { fields });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ take: expect.stringMatching(/^[0-9]{13}-[0-9a-f]{6}$/), cost: 0.19 });
    expect(calls[0].auth).toBe('Bearer sk-or-test');
    expect(calls[0].body.input_references.map((i) => i.image_url.url)).toEqual([dataUrl(ANCHOR), dataUrl(SILHOUETTE)]);
    expect(calls[0].body.prompt).toContain('a woman');
    expect(calls[0].body.prompt).toContain('cropped, black');
    const takes = (await req('GET', `/api/people/${id}/takes`)).body.takes;
    expect(takes.map((t: { take: string }) => t.take)).toEqual([r.body.take]);
    const cleaned = await req('GET', `/api/people/${id}/take/${r.body.take}`);
    expect(cleaned.status).toBe(200);
    // The green backdrop is cut: the corner is see-through.
    expect(PNG.sync.read(cleaned.body as Buffer).data[3]).toBe(0);
  });

  it('a second generate for the same person while one is on its way is a 409 busy, and costs nothing', async () => {
    const id = await draft();
    let release!: () => void;
    hold = new Promise((r) => (release = r));
    const first = req('POST', `/api/people/${id}/generate`, { fields });
    for (let i = 0; i < 100 && calls.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    expect(await req('POST', `/api/people/${id}/generate`, { fields })).toEqual({ status: 409, body: { error: 'busy' } });
    release();
    expect((await first).status).toBe(200);
    expect(calls.length).toBe(1);
    // Once it's back, the next one goes.
    expect((await req('POST', `/api/people/${id}/generate`, { fields })).status).toBe(200);
  });

  it('a missing palette or stand-in is refused before anything is paid for', async () => {
    const id = await draft();
    fs.rmSync(path.join(root, 'palette.json'));
    expect(await req('POST', `/api/people/${id}/generate`, { fields })).toEqual({ status: 500, body: { error: 'no-palette' } });
    expect(calls).toEqual([]);
  });

  it('OpenRouter failing is a 502 with its reason, and leaves no take', async () => {
    const id = await draft();
    answer = { status: 402, json: { error: { message: 'Insufficient credits' } } };
    expect(await req('POST', `/api/people/${id}/generate`, { fields })).toEqual({ status: 502, body: { error: 'generate-failed', message: 'Insufficient credits' } });
    expect((await req('GET', `/api/people/${id}/takes`)).body.takes).toEqual([]);
  });

  it('keep: a missing take is 404, before WHO is 409, then the figure, its picture and thumb', async () => {
    const id = await draft();
    const { take } = (await req('POST', `/api/people/${id}/generate`, { fields })).body;
    const fit = { take, face: { x: 0.5, y: 0.1 }, waist: 0.4, fields };
    expect((await req('POST', `/api/people/${id}/keep`, fit)).body).toEqual({ error: 'no-wears' });
    await req('PUT', `/api/people/${id}`, WHO);
    expect((await req('POST', `/api/people/${id}/keep`, { ...fit, take: '1794679903078-000000' })).status).toBe(404);
    const kept = await req('POST', `/api/people/${id}/keep`, fit);
    expect(kept.status).toBe(200);
    expect(kept.body).toMatchObject({ id, figure: true });
    expect((await req('GET', `/api/people/${id}/figure.png`)).status).toBe(200);
    expect((await req('GET', `/api/people/${id}/thumb`)).status).toBe(200);
  });

  it('DELETE takes drops the unkept takes; DELETE removes the person', async () => {
    const id = await draft();
    await req('POST', `/api/people/${id}/generate`, { fields });
    expect((await req('DELETE', `/api/people/${id}/takes`)).status).toBe(200);
    expect((await req('GET', `/api/people/${id}/takes`)).body.takes).toEqual([]);
    expect((await req('DELETE', `/api/people/${id}`)).status).toBe(200);
    expect((await req('GET', `/api/people/${id}/takes`)).status).toBe(404);
  });

  it('a person with no figure has no figure.png, and its thumb is the silhouette\'s', async () => {
    const id = await draft();
    await req('PUT', `/api/people/${id}`, WHO);
    expect((await req('GET', `/api/people/${id}/figure.png`)).status).toBe(404);
    expect((await req('GET', `/api/people/${id}/thumb`)).status).toBe(200);
  });
});

describe('EXPORT FOR SILLYTAVERN', () => {
  it('a name beyond Latin-1 still downloads: a plain fallback and the UTF-8 name', async () => {
    const id = await draft();
    await req('PUT', `/api/people/${id}`, { name: 'Mei 美玲', pronoun: 'she', background: '', wears: '' });
    const pic = await app.inject({ method: 'GET', url: `/api/people/${id}/export.png` });
    expect(pic.statusCode).toBe(200);
    expect(pic.headers['content-disposition']).toBe(`attachment; filename="Mei.png"; filename*=UTF-8''${encodeURIComponent('Mei 美玲')}.png`);
  });

  it('the figure as an attached PNG named for them, and their persona text with # Wearing', async () => {
    const id = await draft();
    const { take } = (await req('POST', `/api/people/${id}/generate`, { fields })).body;
    await req('PUT', `/api/people/${id}`, { ...WHO, name: 'Vee Okafor' });
    await req('POST', `/api/people/${id}/keep`, { take, face: { x: 0.5, y: 0.1 }, waist: 0.4, fields });
    const pic = await app.inject({ method: 'GET', url: `/api/people/${id}/export.png` });
    expect(pic.statusCode).toBe(200);
    expect(pic.headers['content-type']).toBe('image/png');
    expect(pic.headers['content-disposition']).toBe(`attachment; filename="Vee Okafor.png"; filename*=UTF-8''Vee%20Okafor.png`);
    expect(pic.rawPayload.equals(fs.readFileSync(path.join(root, 'data', 'people', id, 'figure.png')))).toBe(true);
    const text = await app.inject({ method: 'GET', url: `/api/people/${id}/export.txt` });
    expect(text.headers['content-disposition']).toBe(`attachment; filename="Vee Okafor.txt"; filename*=UTF-8''Vee%20Okafor.txt`);
    expect(text.body).toBe('Vee Okafor (she/her).\n\nFrom the Spine.\n\n# Wearing\n\na grey quilted jacket, cargo trousers, boots\n');
  });

  it('someone with no figure exports the silhouette and no # Wearing; a name that isn\'t a safe file name is cleaned', async () => {
    const id = await draft();
    await req('PUT', `/api/people/${id}`, { name: 'Ash/"x"', pronoun: 'they', background: '', wears: '' });
    const pic = await app.inject({ method: 'GET', url: `/api/people/${id}/export.png` });
    expect(pic.rawPayload.equals(SILHOUETTE)).toBe(true);
    expect(pic.headers['content-disposition']).toBe(`attachment; filename="Ash x.png"; filename*=UTF-8''Ash%20x.png`);
    const text = await app.inject({ method: 'GET', url: `/api/people/${id}/export.txt` });
    expect(text.body).toBe('Ash/"x" (they/them).\n');
  });
});
