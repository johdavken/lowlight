import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { photoMoment, resolvePhotos } from '../src/photos';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function folder(files: string[]): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'photos-'));
  dirs.push(d);
  fs.mkdirSync(path.join(d, 'photos'));
  for (const f of files) fs.writeFileSync(path.join(d, 'photos', f), 'x');
  return d;
}
const scenes = new Set(['karasu/ribbon-rooftop', 'karasu/lowlight-intake']);
const outfits = ['indoors', 'home'];

describe("a character's photo pool (photos spec §1)", () => {
  it('a good entry round-trips, its file in photos/', () => {
    const d = folder(['roof-cranes.webp']);
    const warns: string[] = [];
    const raw = [{ id: 'roof-cranes', caption: 'on the roof', at: ['karasu/ribbon-rooftop'], outfit: 'indoors', hours: ['dawn', 'night'] }];
    expect(resolvePhotos(d, raw, outfits, scenes, (m) => warns.push(m))).toEqual([
      { id: 'roof-cranes', file: path.join(d, 'photos', 'roof-cranes.webp'), caption: 'on the roof', at: ['karasu/ribbon-rooftop'], outfit: 'indoors', hours: ['dawn', 'night'] },
    ]);
    expect(warns).toEqual([]);
  });

  it('each bad entry is dropped with a warning', () => {
    const d = folder(['a.webp', 'b.webp', 'c.webp', 'd.webp', 'e.webp', 'f.webp', 'q.webp']);
    const warns: string[] = [];
    const raw = [
      'nope',
      { id: 'Bad Id', caption: 'x' },
      { id: 'a', caption: 'x' },
      { id: 'a', caption: 'again' },
      { id: 'missing', caption: 'x' },
      { id: 'b', caption: '' },
      { id: 'c', caption: 'x'.repeat(161) },
      { id: 'd', caption: 'x', at: ['nowhere/room'] },
      { id: 'e', caption: 'x', outfit: 'tux' },
      { id: 'f', caption: 'x', hours: ['noon'] },
      { id: 'q', caption: 'the "roof" [night]' },
    ];
    expect(resolvePhotos(d, raw, outfits, scenes, (m) => warns.push(m)).map((p) => p.id)).toEqual(['a']);
    expect(warns).toEqual([
      'photos[0]: not an object; dropped',
      "photos[1]: bad id 'Bad Id' (lower-case words joined by -); dropped",
      "photos[3]: 'a' appears twice; dropped",
      'photos[4]: no file missing.webp; dropped',
      'photos[5]: no caption; dropped',
      'photos[6]: caption over 160 characters; dropped',
      "photos[7]: unknown scene 'nowhere/room'; dropped",
      "photos[8]: 'tux' isn't one of her outfits; dropped",
      "photos[9]: unknown hours 'noon' (night, dawn, day, evening); dropped",
      'photos[10]: caption has " [ or ] (they would break her photos line); dropped',
    ]);
  });

  it('at most 40', () => {
    const ids = Array.from({ length: 41 }, (_, i) => `p${i}`);
    const d = folder(ids.map((i) => `${i}.webp`));
    const warns: string[] = [];
    expect(resolvePhotos(d, ids.map((id) => ({ id, caption: 'x' })), outfits, scenes, (m) => warns.push(m))).toHaveLength(40);
    expect(warns).toEqual(['photos[40]: past the 40th; dropped']);
  });

  it('absent or not a list: none', () => {
    const warns: string[] = [];
    expect(resolvePhotos(folder([]), undefined, outfits, scenes, (m) => warns.push(m))).toEqual([]);
    expect(resolvePhotos(folder([]), { a: 1 }, outfits, scenes, (m) => warns.push(m))).toEqual([]);
    expect(warns).toEqual(['photos: not a list; ignored']);
  });
});

describe('her moment for photos (photos spec §2)', () => {
  const sprite = { file: '/c/out.png', outfits: { outdoors: '/c/out.png', indoors: '/c/in.png' }, outfitByScene: { 'karasu/lowlight-intake': 'indoors' } };
  it('a scheduled place: its outfit, else her default outfit; the hour band', () => {
    expect(photoMoment(sprite, 'karasu/lowlight-intake', 1440 + 22 * 60)).toEqual({ scene: 'karasu/lowlight-intake', outfit: 'indoors', band: 'night', minuteOfDay: 22 * 60 });
    expect(photoMoment(sprite, 'karasu/ribbon-rooftop', 4 * 60 + 30)).toMatchObject({ outfit: 'outdoors', band: 'dawn' });
  });
  it('free: no scene, no outfit', () => {
    expect(photoMoment(sprite, null, 19 * 60)).toEqual({ scene: null, outfit: null, band: 'evening', minuteOfDay: 19 * 60 });
  });
});
