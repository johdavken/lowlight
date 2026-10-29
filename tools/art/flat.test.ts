import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildFlat, type FlatSpec } from './flat';
import { writePng, type Img } from './image';
import { loadFlatMaster } from './master';
import { flatFixtureMaster as master } from './test-fixture';
import { tempDir } from '../../server/test/fixtures/temp-dir';

function saved(img: Img): string {
  const f = path.join(tempDir('art-flat-'), 'master.png');
  writePng(f, img);
  return f;
}

const spec = (over: Partial<FlatSpec['glow']> = {}): FlatSpec => ({
  cropTop: 80,
  minSpeckPx: 24,
  glow: { minLuma: 0.62, minChroma: 0.08, lights: {}, ...over },
});

const opaque = (img: Img | undefined) => {
  let n = 0;
  if (img) for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 0) n++;
  return n;
};

describe('buildFlat', () => {
  it('crops 864 rows at cropTop and keeps the master colours', () => {
    const m = master();
    const { layer } = buildFlat(loadFlatMaster(saved(m), 80), spec());
    expect([layer.img.w, layer.img.h]).toEqual([1536, 864]);
    const at = (img: Img, x: number, y: number) => [...img.data.subarray((y * img.w + x) * 4, (y * img.w + x) * 4 + 4)];
    expect(at(layer.img, 315, 315)).toEqual(at(m, 315, 395));
    expect(layer.def).toEqual({ id: 'room', src: 'room.png', parallax: 0 });
  });

  it('finds the lamp with the room threshold and not the dim screen', () => {
    const { clusters } = buildFlat(loadFlatMaster(saved(master()), 80), spec());
    expect(clusters).toHaveLength(1);
    const [x, y, w, h] = clusters[0].box;
    expect(x <= 300 && y <= 300 && x + w > 300 && y + h > 300).toBe(true);
  });

  it('a box threshold claims the dim screen for its light', () => {
    const { layer } = buildFlat(
      loadFlatMaster(saved(master()), 80),
      spec({ lights: { screens: [990, 310, 80, 60] }, lightMinLuma: { screens: 0.3 } }),
    );
    expect(opaque(layer.perLight.screens)).toBeGreaterThanOrEqual(2000);
    expect(opaque(layer.general ?? undefined)).toBe(900); // only the lamp, always on
  });

  it('scales a 3072×2048 master to 1536 wide before cropping (Review Focus 3)', () => {
    const small = buildFlat(loadFlatMaster(saved(master()), 80), spec()).layer.img;
    const big = buildFlat(loadFlatMaster(saved(master(2)), 80), spec()).layer.img;
    let worst = 0;
    for (let i = 0; i < small.data.length; i++) worst = Math.max(worst, Math.abs(small.data[i] - big.data[i]));
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('refuses cropTop outside 0 .. 160', () => {
    const f = saved(master());
    expect(() => loadFlatMaster(f, 161)).toThrow('cropTop must be 0 .. 160');
    expect(() => loadFlatMaster(f, -1)).toThrow('cropTop must be 0 .. 160');
  });
});
