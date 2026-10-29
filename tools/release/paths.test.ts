import { describe, expect, it } from 'vitest';
import { CODE_PATHS, inStudioPaths, STUDIO_PATHS } from './paths';

describe('Studio paths', () => {
  it('are the content folders and files Studio writes', () => {
    expect(STUDIO_PATHS).toEqual(['scenes', 'characters', 'world', 'map', 'art/scenes', 'sounds/CREDITS.md', 'release.json']);
    expect(CODE_PATHS).toContain('server');
    expect(CODE_PATHS).toContain('vite.config.ts');
  });

  it('inStudioPaths matches whole path segments only', () => {
    expect(inStudioPaths('world/lore/karasu.md')).toBe(true);
    expect(inStudioPaths('sounds/CREDITS.md')).toBe(true);
    expect(inStudioPaths('release.json')).toBe(true);
    expect(inStudioPaths('sounds/other.md')).toBe(false);
    expect(inStudioPaths('scenes-old/x')).toBe(false);
    expect(inStudioPaths('art/work/x.kra')).toBe(false);
    expect(inStudioPaths('server/src/app.ts')).toBe(false);
  });
});
