/** The art pipeline's test room: placeholder Ribbon scenes, a lamp-lit procedural master and a stub depth. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateScenes } from '../gen-placeholders';
import type { DepthEstimator } from './depth';
import { blank, writePng, type Img } from './image';

export const SPEC = `---
scene: lowlight-intake
target: lowlight-intake-art
depth: { backFartherThan: 0.7, fgNearerThan: 0.3, force: [] }
minSpeckPx: 4
glow:
  minLuma: 0.62
  minChroma: 0.08
  lights:
    desk_lamp: [73, 131, 40, 30]
---
Test brief.
`;

const VIOLET = [30, 18, 44, 255];

/** Procedural master: dark violet, with a bright lamp bulb at the desk_lamp position (scene 93,146). */
export function fixtureMaster(): Img {
  const m = blank(1536, 1024);
  for (let i = 0; i < 1536 * 1024; i++) m.data.set(VIOLET, i * 4);
  const s = 1536 / 528;
  const bx = Math.round((93 + 24) * s), by = Math.round(146 * s) + 119;
  for (let y = by - 8; y < by + 8; y++) for (let x = bx - 8; x < bx + 8; x++) m.data.set([255, 200, 90, 255], (y * 1536 + x) * 4);
  return m;
}

/** Flat-room fixture colours: the wall never glows, the lamp always does, the screen only under a box threshold. */
export const FLAT_BG = [40, 24, 64, 255]; // OKLab chroma 0.074
export const FLAT_LAMP = [255, 150, 60, 255]; // L 0.77
export const FLAT_SCREEN = [0, 100, 120, 255]; // L 0.46, chroma 0.083

/** 1536×1024 master (×`k`) for a flat room: a 30×30 lamp at (300, 380) and a 60×40 screen at (1000, 400). */
export function flatFixtureMaster(k = 1): Img {
  const img = blank(1536 * k, 1024 * k);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const mx = x / k, my = y / k;
      const lamp = mx >= 300 && mx < 330 && my >= 380 && my < 410;
      const screen = mx >= 1000 && mx < 1060 && my >= 400 && my < 440;
      img.data.set(lamp ? FLAT_LAMP : screen ? FLAT_SCREEN : FLAT_BG, (y * img.w + x) * 4);
    }
  }
  return img;
}

/** A temp project root holding the fixture room, ready for `runGuide` / `runBuild`. */
export async function makeFixtureRoot(prefix = 'art-pipeline-'): Promise<string> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  await generateScenes(path.join(root, 'scenes', 'karasu'));
  fs.mkdirSync(path.join(root, 'art', 'scenes'), { recursive: true });
  fs.writeFileSync(path.join(root, 'art', 'style.md'), 'Test style.');
  fs.writeFileSync(path.join(root, 'art', 'scenes', 'lowlight-intake.md'), SPEC);
  fs.mkdirSync(path.join(root, 'art', 'work', 'lowlight-intake'), { recursive: true });
  writePng(path.join(root, 'art', 'work', 'lowlight-intake', 'master.png'), fixtureMaster());
  return root;
}

/** Depth that runs far (left) → near (right), counting its calls. */
export function fakeDepth(): DepthEstimator & { calls: number } {
  const f = (async (img) => {
    f.calls++;
    const d = new Float32Array(img.w * img.h);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) d[y * img.w + x] = 1 - x / img.w;
    return d;
  }) as DepthEstimator & { calls: number };
  f.calls = 0;
  return f;
}

/**
 * Timeout for a test that runs `builds` full builds of the fixture master. One build is ~0.75 s on an
 * idle machine but measured up to ~4.5 s with two test suites running side by side, so vitest's 5 s
 * default fails such tests under load without anything being wrong.
 */
export const buildsTimeout = (builds: number): number => builds * 8000;
