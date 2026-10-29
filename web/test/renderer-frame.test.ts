import { describe, expect, it } from 'vitest';
import { frameAfterLoad } from '../src/renderer/layers';
import type { SceneDef } from '../../shared/types';

const scene = (resolution: [number, number]) => ({ id: 'x', resolution }) as SceneDef;

describe('frameAfterLoad (Review Focus 1)', () => {
  it('takes the loaded room size when its load wins', () => {
    expect(frameAfterLoad([480, 270], scene([1536, 864]), true)).toEqual([1536, 864]);
  });

  it('a load that loses the token never changes the frame', () => {
    expect(frameAfterLoad([480, 270], scene([1536, 864]), false)).toEqual([480, 270]);
  });
});
