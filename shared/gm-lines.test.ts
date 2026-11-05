import { describe, expect, it } from 'vitest';
import { parseGmLines, writtenLine } from './gm-lines';

describe("the GM's written lines (roll lifecycle spec §1.4)", () => {
  const FILE = '# alarm\n- A log fills in your name.\n- Somewhere a phone rings once.\n\n# take\n- The envelope tears.\n';
  it('reads a heading per cost and a bullet per line; a cost with no lines warns', () => {
    const r = parseGmLines(FILE);
    expect(r.lines).toEqual({ alarm: ['A log fills in your name.', 'Somewhere a phone rings once.'], take: ['The envelope tears.'] });
    expect(r.warnings).toEqual(['no lines for heat', 'no lines for worse', 'no lines for small']);
  });
  it('writtenLine is seeded, and falls back to a built-in line', () => {
    const { lines } = parseGmLines(FILE);
    expect(writtenLine(lines, 'alarm', 'a')).toBe(writtenLine(lines, 'alarm', 'a'));
    expect(new Set(Array.from({ length: 20 }, (_, i) => writtenLine(lines, 'alarm', `s${i}`))).size).toBe(2);
    expect(writtenLine(lines, 'heat', 'a').length).toBeGreaterThan(0);
  });
  it('the shipped file has lines for every cost', () => {
    const fs = require('node:fs') as typeof import('node:fs');
    expect(parseGmLines(fs.readFileSync('world/gm/costs.md', 'utf8')).warnings).toEqual([]);
  });
});
