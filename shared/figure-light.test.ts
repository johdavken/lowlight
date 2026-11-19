import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sceneSchema } from './scene-schema';

// The live stall, without any figureLight of its own (each test sets its own).
const stall = () => {
  const { figureLight: _live, ...s } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scenes', 'karasu', 'noodle-stall', 'scene.json'), 'utf8'));
  return s;
};

describe('figureLight in scene.json (figure lighting spec §3)', () => {
  it('a room without it has none', () => {
    expect(sceneSchema.parse(stall()).figureLight).toBeUndefined();
  });

  it('keeps an automatic key with its strength, depth and rim', () => {
    const figureLight = { key: 'auto', keyStrength: 0.4, depth: 200, rim: 1.5 };
    expect(sceneSchema.parse({ ...stall(), figureLight }).figureLight).toEqual(figureLight);
  });

  it('keeps a manual key, its colour normalised', () => {
    const figureLight = { key: { side: 'left', height: 0.2, color: '#FF8800', strength: 0.8 } };
    expect(sceneSchema.parse({ ...stall(), figureLight }).figureLight).toEqual({ key: { side: 'left', height: 0.2, color: '#ff8800', strength: 0.8 } });
  });

  it('refuses depth 700, rim 3, a height past 1 and an unknown field', () => {
    for (const figureLight of [{ depth: 700 }, { rim: 3 }, { key: { side: 'left', height: 1.5, strength: 0.5 } }, { glow: 1 }]) {
      expect(sceneSchema.safeParse({ ...stall(), figureLight }).success, JSON.stringify(figureLight)).toBe(false);
    }
  });

  it('keeps breath, and refuses a breath that isn\'t a switch', () => {
    expect(sceneSchema.parse({ ...stall(), figureLight: { breath: true } }).figureLight).toEqual({ breath: true });
    expect(sceneSchema.safeParse({ ...stall(), figureLight: { breath: 'yes' } }).success).toBe(false);
  });

  it('the open-air rooms breathe fog; Rue\'s hab (enclosed) and indoor rooms don\'t', () => {
    const OPEN = [
      'karasu/dead-blocks', 'karasu/hicks-gallery', 'karasu/intake-back-alley', 'karasu/noodle-stall', 'karasu/public-landing', 'karasu/ribbon-rooftop',
      'default/rooftop', 'spine/catwalk', 'spine/deck-market', 'spine/oksanas-counter', 'strand/low-roller', 'strand/old-pier', 'tidal/ferry-stairs', 'velvet/under-the-cat',
    ];
    const read = (id: string) => sceneSchema.parse(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scenes', id, 'scene.json'), 'utf8')));
    for (const id of OPEN) expect(read(id).figureLight?.breath, id).toBe(true);
    for (const id of ['spine/rue-hab', 'karasu/zhou-flat', 'karasu/second-socket']) expect(read(id).figureLight?.breath, id).toBeUndefined();
  });
});
