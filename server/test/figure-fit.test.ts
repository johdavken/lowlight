import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { figureEditsOn, parseFit, readFit, withFit } from '../src/figure-fit';

const HICKS_LIKE = `{
  "name": "Hicks",
  "sprite": {
    "src": "hicks.png",
    "pixel": true,
    "waist": 0.43
  },
  "facts": [{ "label": "A", "text": "b" }],
  "face": { "x": 0.505, "y": 0.085 },
  "standing": { "vouches": "face" }
}
`;

describe('figure fit', () => {
  it("parseFit rounds to Studio's 3 places and refuses waists and faces off the sprite", () => {
    expect(parseFit({ waist: 0.41234, face: { x: 0.5, y: 0.0999 } })).toEqual({ waist: 0.412, face: { x: 0.5, y: 0.1 } });
    expect(typeof parseFit({ waist: 0.7, face: { x: 0.5, y: 0.1 } })).toBe('string');
    expect(typeof parseFit({ waist: 0.4, face: { x: 1.2, y: 0.1 } })).toBe('string');
    expect(typeof parseFit({ waist: 0.4 })).toBe('string');
    expect(typeof parseFit(null)).toBe('string');
  });

  it('withFit changes only sprite.waist and the top-level face, the other lines as they were', () => {
    const out = withFit(HICKS_LIKE, { waist: 0.4, face: { x: 0.5, y: 0.09 } })!;
    expect(JSON.parse(out)).toEqual({ ...JSON.parse(HICKS_LIKE), sprite: { src: 'hicks.png', pixel: true, waist: 0.4 }, face: { x: 0.5, y: 0.09 } });
    expect(out).toContain('"facts": [{ "label": "A", "text": "b" }]');
    expect(out).toContain('"standing": { "vouches": "face" }');
  });

  it("withFit adds a face where there was none, and refuses a figure that isn't her own", () => {
    expect(JSON.parse(withFit('{"name":"Z","sprite":{"src":"z.png"}}', { waist: 0.4, face: { x: 0.5, y: 0.1 } })!)).toEqual({ name: 'Z', sprite: { src: 'z.png', waist: 0.4 }, face: { x: 0.5, y: 0.1 } });
    expect(withFit('{"name":"Twin","extends":"z"}', { waist: 0.4, face: { x: 0.5, y: 0.1 } })).toBeNull();
  });

  it('readFit gives what the file sets, null for what it does not', () => {
    expect(readFit(HICKS_LIKE)).toEqual({ own: true, waist: 0.43, face: { x: 0.505, y: 0.085 } });
    expect(readFit('{"extends":"z"}')).toEqual({ own: false, waist: null, face: null });
  });

  it('figureEditsOn: only a checkout holding Studio, never the launcher or production; the env var decides outright', () => {
    const dev = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-dev-'));
    const pub = fs.mkdtempSync(path.join(os.tmpdir(), 'fit-pub-'));
    fs.mkdirSync(path.join(dev, 'studio', 'server'), { recursive: true });
    try {
      expect(figureEditsOn({}, dev)).toBe(true);
      expect(figureEditsOn({}, pub)).toBe(false);
      expect(figureEditsOn({ LOWLIGHT_LAUNCHER: '1' }, dev)).toBe(false);
      expect(figureEditsOn({ NODE_ENV: 'production' }, dev)).toBe(false);
      expect(figureEditsOn({ LOWLIGHT_FIGURE_EDITS: '1' }, pub)).toBe(true);
      expect(figureEditsOn({ LOWLIGHT_FIGURE_EDITS: '0' }, dev)).toBe(false);
    } finally {
      fs.rmSync(dev, { recursive: true, force: true });
      fs.rmSync(pub, { recursive: true, force: true });
    }
  });
});
