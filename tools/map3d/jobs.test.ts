import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { cropTile, planJobs } from './jobs';

const now = new Map([['1/0_0', 'a'], ['1/1_0', 'b'], ['1/2_0', 'c']]);
const all = () => true;

describe('planJobs', () => {
  it('only changed prints render', () => {
    expect(planJobs(now, { '1/0_0': 'a', '1/1_0': 'x', '1/2_0': 'c' }, false, all)).toEqual({ render: ['1/1_0'], keep: ['1/0_0', '1/2_0'] });
  });
  it('--all renders everything', () => {
    expect(planJobs(now, { '1/0_0': 'a', '1/1_0': 'b', '1/2_0': 'c' }, true, all).render).toEqual(['1/0_0', '1/1_0', '1/2_0']);
  });
  it('a print missing from before renders', () => {
    expect(planJobs(now, { '1/0_0': 'a', '1/1_0': 'b' }, false, all).render).toEqual(['1/2_0']);
  });
  it('a tile whose file is gone renders again', () => {
    expect(planJobs(now, { '1/0_0': 'a', '1/1_0': 'b', '1/2_0': 'c' }, false, (k) => k !== '1/0_0').render).toEqual(['1/0_0']);
  });
});

describe('cropTile', () => {
  it('returns a 512x512 webp of the middle', async () => {
    const red = { r: 255, g: 0, b: 0 };
    const png = await sharp({ create: { width: 640, height: 640, channels: 3, background: red } })
      .composite([{ input: await sharp({ create: { width: 512, height: 512, channels: 3, background: { r: 0, g: 255, b: 0 } } }).png().toBuffer(), left: 64, top: 64 }])
      .png()
      .toBuffer();
    const out = await cropTile(png, 64, 82);
    const meta = await sharp(out).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 512, 512]);
    const { data } = await sharp(out).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(data[1]!).toBeGreaterThan(200);
    expect(data[0]!).toBeLessThan(60);
  });
});

describe('after Blender runs', () => {
  it('a job Blender never reported as rendered is missing, even if an old PNG exists', async () => {
    const { unrendered } = await import('./jobs');
    expect(unrendered(['1/0_0', '1/1_0'], ['TILE 1/0_0 812', 'NOTE x', ''])).toEqual(['1/1_0']);
  });
  it('a level is current only when every tile matches the prints rendered for it', async () => {
    const { currentLevels } = await import('./jobs');
    const now = new Map([['1/0_0', 'a'], ['1/1_0', 'b'], ['4/0_0', 'c']]);
    expect(currentLevels(now, { '1/0_0': 'a', '1/1_0': 'b', '4/0_0': 'old' }, () => true)).toEqual([1]);
    expect(currentLevels(now, { '1/0_0': 'a', '1/1_0': 'b', '4/0_0': 'c' }, (k) => k !== '1/1_0')).toEqual([4]);
  });
});

describe('blackout passes (spec 2026-10-27)', () => {
  it('dark and mask passes at 1×, 2× and 4× only', async () => {
    const { darkLevels, passesFor } = await import('./jobs');
    expect(darkLevels([1, 2, 4, 8])).toEqual([1, 2, 4]);
    expect(passesFor(2)).toEqual(['lit', 'dark', 'mask']);
    expect(passesFor(8)).toEqual(['lit']);
  });
  it('a dark-level tile whose mask is gone renders again; an 8× tile needs only its lit tile', async () => {
    const { outputsExist } = await import('./jobs');
    const has = (dir: string, key: string) => !(dir === 'tiles-mask' && key === '2/0_0');
    expect(planJobs(new Map([['2/0_0', 'a'], ['2/1_0', 'b'], ['8/0_0', 'c']]), { '2/0_0': 'a', '2/1_0': 'b', '8/0_0': 'c' }, false, (k) => outputsExist(k, has)).render).toEqual(['2/0_0']);
    expect(outputsExist('8/0_0', (dir) => dir === 'tiles')).toBe(true);
  });
  it('cropMask keeps the exact district values: no blending, no resize', async () => {
    const { cropMask } = await import('./jobs');
    const left = await sharp({ create: { width: 266, height: 532, channels: 3, background: { r: 16, g: 0, b: 0 } } }).png().toBuffer();
    const png = await sharp({ create: { width: 532, height: 532, channels: 3, background: { r: 24, g: 0, b: 0 } } }).composite([{ input: left, left: 0, top: 0 }]).png().toBuffer();
    const out = await cropMask(png, 10);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([512, 512]);
    const reds = new Set<number>();
    for (let i = 0; i < data.length; i += info.channels) reds.add(data[i]!);
    expect([...reds].sort((a, b) => a - b)).toEqual([16, 24]);
  });
});

describe('cropMask with every district index', () => {
  it('17 stripes 8 apart (indices 1–17) come back exact', async () => {
    const { cropMask } = await import('./jobs');
    const raw = Buffer.alloc(532 * 532 * 3);
    for (let y = 0; y < 532; y++) for (let x = 0; x < 532; x++) raw[(y * 532 + x) * 3] = (1 + Math.floor((x * 17) / 532)) * 8;
    const out = await cropMask(await sharp(raw, { raw: { width: 532, height: 532, channels: 3 } }).png().toBuffer(), 10);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    for (let x = 0; x < 512; x++) expect(data[x * info.channels]).toBe((1 + Math.floor(((x + 10) * 17) / 532)) * 8);
  });
});

describe('staleTiles (blackouts phase 2 §4)', () => {
  it('lists the tiles on disk that no level wants any more', async () => {
    const { staleTiles } = await import('./jobs');
    expect(staleTiles(['1/0_0', '1/0_1', '8/3_3'], new Set(['1/0_0']))).toEqual(['1/0_1', '8/3_3']);
    expect(staleTiles([], new Set(['1/0_0']))).toEqual([]);
  });
});
