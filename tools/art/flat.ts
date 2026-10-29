/**
 * The flat build: a 1536×864 crop of the master, unchanged (no depth split, fill or palette snap),
 * with glow found on the master's own colours and split by each light's box. No file IO.
 */
import { FLAT_FRAME } from '../../shared/frame';
import { findClusters, type BuildSpec, type BuiltLayer, type GlowCluster } from './core';
import { findGlow, glowPreview, splitGlow } from './glow';
import type { Img } from './image';

export type FlatSpec = Required<Pick<BuildSpec, 'cropTop'>> & Pick<BuildSpec, 'minSpeckPx' | 'glow'>;

/** A flat room's speck size is in its own px; 24 at 480 is about 240 at 1536 (3.2² ≈ 10). */
const SPECK_AREA = 10;

export function buildFlat(img: Img, spec: FlatSpec): { layer: BuiltLayer; clusters: GlowCluster[] } {
  const { lights, lightMinLuma = {} } = spec.glow;
  const boxes = Object.entries(lightMinLuma)
    .filter(([id]) => lights[id])
    .map(([id, minLuma]) => ({ rect: lights[id], minLuma }));
  const mask = findGlow(img, spec.glow.minLuma, spec.glow.minChroma, boxes);
  const { general, perLight } = splitGlow(img, mask, lights, 0);
  const clusters = findClusters(img, mask, spec.minSpeckPx * SPECK_AREA, 0, 'room', FLAT_FRAME);
  return {
    layer: { def: { id: 'room', src: 'room.png', parallax: 0 }, img, glowPreview: glowPreview(img, mask), general, perLight },
    clusters,
  };
}
