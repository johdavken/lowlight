import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { cityPoints, walkPoints } from './city-points';
import { parseCityFile, type CityFileKind } from './city-schema';

const parsed = (kind: CityFileKind, file: string) => {
  const r = parseCityFile(kind, JSON.parse(readFileSync(`map/city/${file}`, 'utf8')));
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};
const paths = (pts: { path: (string | number)[] }[]) => pts.map((p) => p.path.join('.'));

describe('every point and line in a city file, from its schema (spec 2026-10-30 §2)', () => {
  it("the Ribbon's route is one line of all its points", () => {
    const pts = cityPoints('structure', parsed('structure', 'structures/ribbon.json'));
    const route = pts.find((p) => p.path.join('.') === 'route')!;
    expect(route.kind).toBe('line');
    expect(route.pts).toHaveLength((parsed('structure', 'structures/ribbon.json') as { route: unknown[] }).route.length);
  });

  it("the Spine's route", () => {
    expect(paths(cityPoints('structure', parsed('structure', 'structures/spine.json')))).toContain('route');
  });

  it("Velvet's Row", () => {
    const pts = cityPoints('district', parsed('district', 'districts/velvet.json'));
    expect(pts.some((p) => p.kind === 'line' && p.path.at(-1) === 'row')).toBe(true);
  });

  it('a landmark at a point is a point; one at a place is not', () => {
    const pts = cityPoints('landmarks', parsed('landmarks', 'landmarks.json'));
    expect(pts).toEqual([{ path: [0, 'at'], kind: 'point', pts: [[84.3, 20.6]] }]);
  });

  it('render settings hold none', () => {
    expect(cityPoints('render', parsed('render', 'render.json'))).toEqual([]);
  });

  it('a field added to a schema is found with no Studio change', () => {
    const pt = z.tuple([z.number(), z.number()]).describe('pt');
    const schema = z.object({ a: z.object({ b: pt, c: z.array(pt).optional() }), n: z.number() });
    expect(walkPoints(schema, { a: { b: [1, 2], c: [[3, 4], [5, 6]] }, n: 1 })).toEqual([
      { path: ['a', 'b'], kind: 'point', pts: [[1, 2]] },
      { path: ['a', 'c'], kind: 'line', pts: [[3, 4], [5, 6]] },
    ]);
  });
});
