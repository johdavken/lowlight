import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { generateScenes } from '../gen-placeholders';
import { SceneRegistry } from '../../server/src/scenes';
import type { SceneDef } from '../../shared/types';
import { buildGuide, compositeScene, computeBand, GUIDE_INSTRUCTION } from './guide';
import { scaleNearest, type Img } from './image';
import type { ArtSpec } from './spec';
import { tempDir } from '../../server/test/fixtures/temp-dir';

let dir: string;
let scene: SceneDef;
const spec = { brief: 'Her office above the noodle stall.' } as ArtSpec;

beforeAll(async () => {
  dir = tempDir('art-guide-');
  await generateScenes(dir);
  const { registry } = await SceneRegistry.load(dir);
  scene = registry.get('lowlight-intake')!;
});

const row = (img: Img, y: number) => [...img.data.slice(y * img.w * 4, (y + 1) * img.w * 4)];

describe('guide', () => {
  it('computes the scene band for lowlight-intake (widest layer 528)', () => {
    const b = computeBand(scene);
    expect(b.widest).toBe(528);
    expect(b.s).toBeCloseTo(1536 / 528);
    expect(b.h).toBe(785);
    expect(b.top).toBe(119);
  });

  it('shifts the band down the master by bandShift rows, and refuses to leave the 1024-row canvas', () => {
    expect(computeBand(scene, 120).top).toBe(239);
    expect(computeBand(scene, -119).top).toBe(0);
    expect(computeBand(scene, 120).h).toBe(785);
    expect(() => computeBand(scene, 121)).toThrow(/bandShift 121 .* -119 \.\. 120/);
    expect(() => computeBand(scene, -120)).toThrow(/bandShift/);
  });

  it('builds a 1536×1024 guide: band = scaled composite, edges extended above and below', () => {
    const { guide, band } = buildGuide(path.join(dir, 'lowlight-intake'), scene, spec, 'STYLE TEXT');
    expect([guide.w, guide.h]).toEqual([1536, 1024]);
    const comp = scaleNearest(compositeScene(path.join(dir, 'lowlight-intake'), scene), 1536, band.h);
    expect(row(guide, band.top + 10)).toEqual(row(comp, 10));
    expect(row(guide, 0)).toEqual(row(comp, 0));
    expect(row(guide, 1023)).toEqual(row(comp, band.h - 1));
    let transparent = 0;
    for (let i = 3; i < guide.data.length; i += 4) if (guide.data[i] !== 255) transparent++;
    expect(transparent).toBe(0);
  });

  it('centers narrower layers inside the widest frame, edge-extended so the guide has no side bars', () => {
    const comp = compositeScene(path.join(dir, 'lowlight-intake'), scene);
    expect([comp.w, comp.h]).toEqual([528, 270]);
    // room is 500 wide → 14 px each side would be bare black without edge extension
    const i = (100 * comp.w + 2) * 4;
    expect([...comp.data.slice(i, i + 3)]).not.toEqual([0, 0, 0]);
  });

  it('writes a prompt with the style, the brief and the fixed instruction', () => {
    const { prompt } = buildGuide(path.join(dir, 'lowlight-intake'), scene, spec, 'STYLE TEXT');
    expect(prompt).toContain('STYLE TEXT');
    expect(prompt).toContain('Her office above the noodle stall.');
    expect(prompt).toContain(GUIDE_INSTRUCTION);
  });
});
