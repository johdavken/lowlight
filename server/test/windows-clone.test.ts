import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** A clone on Windows (2026-11-07): Git for Windows checks out CRLF by default, and npm runs scripts in cmd. */
describe('a clone plays on Windows', () => {
  // This test ships in the public repo, which has no tools/public-export: that the export keeps .gitattributes is
  // checked in tools/public-export/select.test.ts.
  it('every text file checks out with LF', () => {
    expect(readFileSync('.gitattributes', 'utf8')).toMatch(/^\* text=auto eol=lf$/m);
  });

  it('no npm script sets a variable the POSIX way (VAR=value cmd fails in cmd and PowerShell)', () => {
    const { scripts } = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    const posix = Object.entries(scripts).filter(([, cmd]) => /(^|&&\s*|;\s*)[A-Z_][A-Z0-9_]*=\S/.test(cmd));
    expect(posix).toEqual([]);
    expect(scripts.start).toContain('--production');
  });
});
