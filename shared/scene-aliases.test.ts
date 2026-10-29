import { describe, expect, it } from 'vitest';
import { currentSceneId } from './scene-aliases';

describe('currentSceneId', () => {
  const cases: [string, string][] = [
    ['ribbon/glass-orchid', 'velvet/glass-orchid'],
    ['ribbon/the-tilt', 'karasu/the-tilt'],
    ['ribbon/ribbon-rooftop', 'karasu/ribbon-rooftop'],
    ['noodle-stall', 'noodle-stall'],
    ['karasu/the-tilt', 'karasu/the-tilt'],
    ['default/workspace', 'default/workspace'],
    ['velvet/glass-orchid', 'velvet/glass-orchid'],
  ];

  it('translates old ribbon/ ids; exact beats prefix; others pass through', () => {
    for (const [from, to] of cases) expect(currentSceneId(from)).toBe(to);
  });

  it('is idempotent', () => {
    for (const [from] of cases) expect(currentSceneId(currentSceneId(from))).toBe(currentSceneId(from));
  });

  it('only its own entries count (no inherited keys)', () => {
    expect(currentSceneId('constructor')).toBe('constructor');
    expect(currentSceneId('toString')).toBe('toString');
  });
});
