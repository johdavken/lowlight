import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyMapRender } from './map-copy';

describe('the package carries the rendered map (spec 2026-10-25 §6)', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'st-map-'));
  it('copies the tiles, manifest and windows when they exist, and skips them when not', () => {
    const repo = tmp(), out = tmp();
    expect(copyMapRender(repo, out)).toBe(false);
    expect(fs.existsSync(path.join(out, 'map', 'tiles.json'))).toBe(false);
    const pub = path.join(repo, 'web', 'public', 'map');
    fs.mkdirSync(path.join(pub, 'tiles', '4'), { recursive: true });
    fs.writeFileSync(path.join(pub, 'tiles', '4', '3_2.webp'), Buffer.from([1]));
    fs.writeFileSync(path.join(pub, 'tiles.json'), '{}');
    fs.writeFileSync(path.join(pub, 'windows.json'), '[]');
    expect(copyMapRender(repo, out)).toBe(true);
    for (const f of ['tiles.json', 'windows.json', 'tiles/4/3_2.webp']) expect(fs.existsSync(path.join(out, 'map', f)), f).toBe(true);
  });
});
