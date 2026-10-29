import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../src');
const UNIT = /-?\d*\.?\d+(vw|vh|vmin|vmax)\b/g;

describe('game stylesheets (spec 2026-10-16 fixed stage §2)', () => {
  it('use no viewport units: the game lays out in 1600×900 stage px', () => {
    const found: string[] = [];
    for (const f of fs.readdirSync(SRC, { recursive: true }) as string[]) {
      if (!f.endsWith('.css')) continue;
      const css = fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(UNIT)) found.push(`${f}: ${m[0]}`);
    }
    expect(found).toEqual([]);
  });

  it('have no window-size media queries: the stage is always 1600×900', () => {
    const found: string[] = [];
    for (const f of fs.readdirSync(SRC, { recursive: true }) as string[]) {
      if (!f.endsWith('.css')) continue;
      const css = fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/@media[^{]*\b(min-|max-)?(width|height|aspect-ratio)\b[^{]*/g)) found.push(`${f}: ${m[0].trim()}`);
    }
    expect(found).toEqual([]);
  });
});
