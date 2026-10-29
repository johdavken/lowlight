import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapRules } from './map-rules';

describe('mapRules', () => {
  it("takes the Map section up to the next heading, with the game's variables it reads", () => {
    const css = '.a {}\n/* ───────────────────────── Map ───────────────────────── */\n.map-root { color: var(--agent); }\n/* ───────────────────────── Journal ───────────────────────── */\n.journal {}\n';
    const out = mapRules(css);
    expect(out).toContain('.map-root { color: var(--agent); }');
    expect(out).toContain('--agent: #ff4f8b;');
    expect(out).not.toContain('.journal');
    expect(out).not.toContain('.a {}');
  });

  it("finds it in the game's real stylesheet, which defines the map's overlay", () => {
    const out = mapRules(fs.readFileSync(path.join(__dirname, '../../web/src/ui/style.css'), 'utf8'));
    expect(out).toContain('.map-root {');
    expect(out).toContain('@keyframes map-glitch-in');
    expect(out).not.toContain('Journal');
  });

  it('throws when the section is gone, so a renamed heading fails the build instead of shipping an unstyled map', () => {
    expect(() => mapRules('.x {}')).toThrow(/Map section/);
  });
});
