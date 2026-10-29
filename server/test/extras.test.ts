import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { generateScenes } from '../../tools/gen-placeholders';
import { buildApp } from '../src/app';
import { loadExtras } from '../src/extras';
import { makeFixture } from './fixtures/agents';
import { okStep, startStubOpenRouter, type StubOpenRouter } from './fixtures/stub-openrouter';

const tmp: string[] = [];
const mk = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'extras-'));
  tmp.push(d);
  return d;
};
const png = (w = 4, h = 6) => PNG.sync.write(new PNG({ width: w, height: h }));
function library(dir: string, ids: string[]): void {
  for (const id of ids) fs.writeFileSync(path.join(dir, `${id}.png`), png());
  fs.writeFileSync(path.join(dir, 'extras.json'), JSON.stringify(ids.map((id) => ({ id, file: `${id}.png`, tags: ['sdg'] }))));
}
afterAll(() => {
  for (const d of tmp) fs.rmSync(d, { recursive: true, force: true });
});

describe('loadExtras', () => {
  it('reads the library', () => {
    const d = mk();
    library(d, ['sdg-01', 'sdg-02']);
    expect(loadExtras(d, vi.fn()).map((e) => e.id)).toEqual(['sdg-01', 'sdg-02']);
  });
  it('a missing folder or bad json is an empty library, said once', () => {
    const warn = vi.fn();
    expect(loadExtras(path.join(mk(), 'nope'), warn)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    const d = mk();
    fs.writeFileSync(path.join(d, 'extras.json'), '{nope');
    const warn2 = vi.fn();
    expect(loadExtras(d, warn2)).toEqual([]);
    expect(warn2).toHaveBeenCalledTimes(1);
  });
  it('drops a face whose picture is missing', () => {
    const d = mk();
    library(d, ['sdg-01', 'sdg-02']);
    fs.rmSync(path.join(d, 'sdg-02.png'));
    const warn = vi.fn();
    expect(loadExtras(d, warn).map((e) => e.id)).toEqual(['sdg-01']);
    expect(warn).toHaveBeenCalled();
  });
});

describe('GET /api/extras/:id', () => {
  let scenesDir: string;
  let or: StubOpenRouter;
  const apps: { close(): Promise<void> }[] = [];
  beforeAll(async () => {
    scenesDir = mk();
    await generateScenes(scenesDir);
    or = await startStubOpenRouter([], { fallback: okStep('ok') });
  });
  afterEach(async () => {
    while (apps.length) await apps.pop()!.close();
  });
  afterAll(async () => {
    await or.close();
  });
  it('serves a face with an ETag, 304 on a match, 404 for an unknown id', async () => {
    const { cfg } = await makeFixture([{ id: 'nix', direct: true, pack: 'karasu' }], scenesDir, { openrouterUrl: or.url });
    const d = mk();
    library(d, ['sdg-01']);
    cfg.extrasDir = d;
    const app = await buildApp(cfg);
    apps.push(app.app);
    await app.app.listen({ port: 0, host: '127.0.0.1' });
    const a = app.app.server.address();
    if (!a || typeof a === 'string') throw new Error('no address');
    const base = `http://127.0.0.1:${a.port}`;
    const res = await fetch(`${base}/api/extras/sdg-01`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
    const etag = res.headers.get('etag')!;
    expect(etag).toBeTruthy();
    await res.arrayBuffer();
    const again = await fetch(`${base}/api/extras/sdg-01`, { headers: { 'If-None-Match': etag } });
    expect(again.status).toBe(304);
    await again.text();
    const none = await fetch(`${base}/api/extras/sdg-99`);
    expect(none.status).toBe(404);
    await none.text();
  });
});
