import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, test, vi } from 'vitest';
import { createNormalCache } from '../src/normal-cache';
import { normalMapPng } from '../src/normal-map';
import { tempDir } from './fixtures/temp-dir';

function sprite(dir: string): string {
  const png = new PNG({ width: 16, height: 16 });
  for (let i = 0; i < 16 * 16; i++) png.data.set([100, 100, 100, 255], i * 4);
  const file = path.join(dir, 'sprite.png');
  fs.writeFileSync(file, PNG.sync.write(png));
  return file;
}

describe('createNormalCache', () => {
  test('makes a map once and serves the cached file after', async () => {
    const dir = tempDir('normal-cache-');
    const make = vi.fn(normalMapPng);
    const cache = createNormalCache(path.join(dir, 'cache'), make);
    const src = sprite(dir);
    const a = await cache.file(src, { px: 1 });
    const b = await cache.file(src, { px: 1 });
    expect(a).toBe(b);
    expect(make).toHaveBeenCalledTimes(1);
    expect(PNG.sync.read(fs.readFileSync(a!)).width).toBe(16);
  });

  test('concurrent requests share one generation', async () => {
    const dir = tempDir('normal-cache-');
    const make = vi.fn(normalMapPng);
    const cache = createNormalCache(path.join(dir, 'cache'), make);
    const src = sprite(dir);
    const [a, b] = await Promise.all([cache.file(src, { px: 1 }), cache.file(src, { px: 1 })]);
    expect(a).toBe(b);
    expect(make).toHaveBeenCalledTimes(1);
  });

  test('a changed source makes a new map', async () => {
    const dir = tempDir('normal-cache-');
    const make = vi.fn(normalMapPng);
    const cache = createNormalCache(path.join(dir, 'cache'), make);
    const src = sprite(dir);
    const a = await cache.file(src, { px: 1 });
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(src, later, later);
    const b = await cache.file(src, { px: 1 });
    expect(b).not.toBe(a);
    expect(make).toHaveBeenCalledTimes(2);
  });

  test('different options are different files', async () => {
    const dir = tempDir('normal-cache-');
    const cache = createNormalCache(path.join(dir, 'cache'));
    const src = sprite(dir);
    expect(await cache.file(src, { px: 1 })).not.toBe(await cache.file(src, { px: 2 }));
  });

  test('null when the source is missing', async () => {
    const dir = tempDir('normal-cache-');
    const cache = createNormalCache(path.join(dir, 'cache'));
    expect(await cache.file(path.join(dir, 'gone.png'), { px: 1 })).toBeNull();
  });
});
