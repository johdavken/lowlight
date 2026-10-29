import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(__dirname, '../src/ui/crack/skins');

describe('skin stylesheets', () => {
  // The base .ct-word.struck fades to 0.35; a skin that also fades its colour would fade twice and lose
  // the struck duds (final review, 2026-10-20). Each skin's struck rule sets its own opacity.
  it('every skin that styles struck words sets their opacity itself', () => {
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.css'))) {
      const rules = fs.readFileSync(path.join(dir, f), 'utf8').split('}').filter((r) => r.includes('.ct-word.struck'));
      for (const r of rules) expect(r, f).toMatch(/opacity:\s*[\d.]+/);
    }
  });
});
