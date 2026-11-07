import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { artStore, artWork } from './store';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'art-store-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the art store', () => {
  it('is art/ when the root has no .art-store (a fresh clone, a worktree, a test root)', () => {
    expect(artStore(root)).toBe(path.join(root, 'art'));
    expect(artWork(root)).toBe(path.join(root, 'art', 'work'));
  });

  it('is the absolute folder .art-store names', () => {
    fs.writeFileSync(path.join(root, '.art-store'), '/mnt/somewhere/lowlight-art\n');
    expect(artStore(root)).toBe('/mnt/somewhere/lowlight-art');
    expect(artWork(root)).toBe('/mnt/somewhere/lowlight-art/work');
  });

  it('reads a relative path against the root, skipping blank and # lines', () => {
    fs.writeFileSync(path.join(root, '.art-store'), '# where the masters live\n\n  ../store  \n');
    expect(artStore(root)).toBe(path.resolve(root, '../store'));
  });

  it('an empty .art-store is the old layout', () => {
    fs.writeFileSync(path.join(root, '.art-store'), '\n');
    expect(artStore(root)).toBe(path.join(root, 'art'));
  });
});
