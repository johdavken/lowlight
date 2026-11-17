import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLYPHS } from '../src/room/table/decode';

const at = (f: string) => resolve(__dirname, '../src/ui', f);
const css = readFileSync(at('style.css'), 'utf8');

describe("the decode's shipped Chinese font (style.css 'Lowlight Han', tools/decode-font.sh)", () => {
  it('covers exactly the decode glyphs, so a new glyph means a rebuilt font', () => {
    const face = css.match(/@font-face\s*{[^}]*'Lowlight Han'[^}]*}/)?.[0] ?? '';
    const range = face.match(/unicode-range:\s*([^;]+);/)?.[1] ?? '';
    const listed = range.split(',').map((u) => String.fromCodePoint(parseInt(u.trim().slice(2), 16)));
    expect(listed.sort()).toEqual([...GLYPHS].sort());
  });
  it('is a woff2 next to its OFL licence, and stands in the mono stack', () => {
    const font = readFileSync(at('fonts/lowlight-han.woff2'));
    expect(font.subarray(0, 4).toString('latin1')).toBe('wOF2');
    expect(readFileSync(at('fonts/OFL-NotoSansCJK.txt'), 'utf8')).toContain('SIL Open Font License');
    expect(css).toMatch(/--mono: 'IBM Plex Mono', 'Lowlight Han'/);
  });
});
