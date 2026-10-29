import { describe, expect, it } from 'vitest';
import { WEARS_MAX, resolveOutfitWears } from '../src/character';

const OUTFITS = { indoors: '/c/a.png', home: '/c/h.png' };

function run(raw: unknown) {
  const warnings: string[] = [];
  return { out: resolveOutfitWears(raw, OUTFITS, (m) => warnings.push(m)), warnings };
}

describe('resolveOutfitWears', () => {
  it('keeps a line for a resolved outfit', () => {
    expect(run({ indoors: 'black top' })).toEqual({ out: { indoors: 'black top' }, warnings: [] });
  });

  it('drops a line for an unknown outfit and a non-string line, one warning each', () => {
    const { out, warnings } = run({ outdoors: 'coat', home: 7 });
    expect(out).toEqual({});
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("'outdoors'");
    expect(warnings[1]).toContain("'home'");
  });

  it('drops an empty or blank line without a warning', () => {
    expect(run({ indoors: '', home: '   ' })).toEqual({ out: {}, warnings: [] });
  });

  it('keeps a line on one line, with ] turned to )', () => {
    expect(run({ indoors: 'line one\n  line two ]' }).out).toEqual({ indoors: 'line one line two )' });
  });

  it('caps a long line at WEARS_MAX on a whole word', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const line = run({ indoors: long }).out.indoors!;
    expect(WEARS_MAX).toBe(200);
    expect(line.length).toBeLessThanOrEqual(200);
    expect(long.startsWith(`${line} `)).toBe(true);
  });

  it('warns once and ignores a map that is not an object; nothing set is nothing', () => {
    expect(run(['x']).out).toEqual({});
    expect(run(['x']).warnings).toHaveLength(1);
    expect(run('x').warnings).toHaveLength(1);
    expect(run(undefined)).toEqual({ out: {}, warnings: [] });
  });
});
