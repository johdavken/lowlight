import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderIcon } from './build';
import { awkwardTemp } from './fixture';

let root: string;
const png = (w: number, h: number) => PNG.sync.write(new PNG({ width: w, height: h }));
const icon = () => PNG.sync.read(fs.readFileSync(path.join(root, 'build', 'icon.png')));

beforeEach(() => {
  root = awkwardTemp('icon');
  fs.mkdirSync(path.join(root, 'web', 'public'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '..', '..', 'web', 'public', 'lowlight-logo.svg'), path.join(root, 'web', 'public', 'lowlight-logo.svg'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the app icon', () => {
  it('is desktop/icon.png when there is one', () => {
    fs.mkdirSync(path.join(root, 'desktop'), { recursive: true });
    fs.writeFileSync(path.join(root, 'desktop', 'icon.png'), png(512, 512));
    renderIcon(root);
    expect(fs.readFileSync(path.join(root, 'build', 'icon.png'))).toEqual(fs.readFileSync(path.join(root, 'desktop', 'icon.png')));
  });

  it('falls back to the logo on a 512 square', () => {
    renderIcon(root);
    expect([icon().width, icon().height]).toEqual([512, 512]);
  });

  it('refuses an icon that is not a square of at least 256', () => {
    fs.mkdirSync(path.join(root, 'desktop'), { recursive: true });
    for (const [w, h] of [[512, 400], [128, 128]]) {
      fs.writeFileSync(path.join(root, 'desktop', 'icon.png'), png(w, h));
      expect(() => renderIcon(root)).toThrow(/desktop\/icon\.png must be a square PNG of at least 256/);
    }
  });
});

it('the committed desktop/icon.png is a usable icon', () => {
  const file = PNG.sync.read(fs.readFileSync(path.join(__dirname, '..', '..', 'desktop', 'icon.png')));
  expect(file.width).toBe(file.height);
  expect(file.width).toBeGreaterThanOrEqual(256);
});
