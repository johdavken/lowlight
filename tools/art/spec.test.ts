import { describe, expect, it } from 'vitest';
import { parseArtSpec } from './spec';
import type { SceneDef } from '../../shared/types';

const source = {
  id: 'lowlight-intake',
  lights: [{ id: 'desk_lamp' }, { id: 'monitor' }, { id: 'window_neon' }],
} as unknown as SceneDef;

const doc = (front: string, brief = 'Her office above the noodle stall.') => `---\n${front}\n---\n\n${brief}\n`;
const base = `scene: lowlight-intake
target: lowlight-intake-art
depth:
  backFartherThan: 0.62
  fgNearerThan: 0.18
  force:
    - { layer: back, rect: [266, 67, 164, 90] }
glow:
  minLuma: 0.62
  minChroma: 0.08
  lights:
    desk_lamp: [73, 131, 40, 30]`;

describe('parseArtSpec', () => {
  it('parses front matter and the brief after the closing ---', () => {
    const s = parseArtSpec(doc(base), source);
    expect(s.target).toBe('lowlight-intake-art');
    expect(s.depth.force[0]).toEqual({ layer: 'back', rect: [266, 67, 164, 90] });
    expect(s.glow.lights.desk_lamp).toEqual([73, 131, 40, 30]);
    expect(s.brief).toBe('Her office above the noodle stall.');
  });

  it('accepts an optional minDepth on a force rect', () => {
    const s = parseArtSpec(doc(base.replace('rect: [266, 67, 164, 90] }', 'rect: [266, 67, 164, 90], minDepth: 0.9 }')), source);
    expect(s.depth.force[0].minDepth).toBe(0.9);
  });

  it('defaults bandShift to 0 and accepts a whole number of master rows', () => {
    expect(parseArtSpec(doc(base), source).bandShift).toBe(0);
    expect(parseArtSpec(doc(base.replace('glow:', 'bandShift: 120\nglow:')), source).bandShift).toBe(120);
  });

  it('accepts an optional maxDepth on a force rect', () => {
    const s = parseArtSpec(doc(base.replace('rect: [266, 67, 164, 90] }', 'rect: [266, 67, 164, 90], maxDepth: 0.5 }')), source);
    expect(s.depth.force[0].maxDepth).toBe(0.5);
  });

  it('applies defaults', () => {
    const s = parseArtSpec(
      doc(`scene: lowlight-intake\ntarget: x-art\ndepth: { backFartherThan: 0.6, fgNearerThan: 0.2 }\nglow: { minLuma: 0.6, minChroma: 0.1 }`),
      source,
    );
    expect(s.minSpeckPx).toBe(24);
    expect(s.depth.force).toEqual([]);
    expect(s.glow.lights).toEqual({});
  });

  it('rejects a force rect outside the 480×270 frame, naming the field', () => {
    expect(() => parseArtSpec(doc(base.replace('[266, 67, 164, 90]', '[400, 67, 164, 90]')), source)).toThrow(/depth\.force\.0\.rect/);
  });

  it('rejects an unknown glow light, naming it', () => {
    expect(() => parseArtSpec(doc(base.replace('desk_lamp:', 'lamp:')), source)).toThrow(/glow\.lights\.lamp/);
  });

  it('rejects backFartherThan <= fgNearerThan', () => {
    expect(() => parseArtSpec(doc(base.replace('backFartherThan: 0.62', 'backFartherThan: 0.1')), source)).toThrow(/art spec: depth/);
  });

  it('accepts skyFartherThan beyond backFartherThan', () => {
    const spec = parseArtSpec(doc(base.replace('backFartherThan: 0.62', 'backFartherThan: 0.62\n  skyFartherThan: 0.9')), source);
    expect(spec.depth.skyFartherThan).toBe(0.9);
  });

  it('rejects skyFartherThan <= backFartherThan', () => {
    expect(() => parseArtSpec(doc(base.replace('backFartherThan: 0.62', 'backFartherThan: 0.62\n  skyFartherThan: 0.5')), source)).toThrow(
      'art spec: depth: skyFartherThan must be greater than backFartherThan',
    );
  });

  it('rejects target === scene', () => {
    expect(() => parseArtSpec(doc(base.replace('target: lowlight-intake-art', 'target: lowlight-intake')), source)).toThrow(/art spec: target/);
  });

  it('rejects a document without front matter', () => {
    expect(() => parseArtSpec('just a brief', source)).toThrow(/front matter/);
  });
});
