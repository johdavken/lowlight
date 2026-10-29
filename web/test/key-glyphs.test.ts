import { describe, expect, it } from 'vitest';
import { keyButton, keyGlyph, type KeyId } from '../src/ui/key-glyphs';

const IDS: KeyId[] = ['regenerate', 'continue', 'edit', 'delete', 'branch', 'draw', 'end', 'leave'];

describe('key glyphs', () => {
  it('every key has an aria-hidden svg with something drawn in it', () => {
    for (const id of IDS) {
      const svg = keyGlyph(id);
      expect(svg.tagName.toLowerCase()).toBe('svg');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('viewBox')).toBe('0 0 16 16');
      expect(svg.children.length).toBeGreaterThan(0);
    }
  });

  it('no two keys share a glyph', () => {
    expect(new Set(IDS.map((i) => keyGlyph(i).outerHTML)).size).toBe(IDS.length);
  });

  it('keyButton: glyph + label, the label is its text, name and title', () => {
    const b = keyButton('end', 'END SCENE', 'End the scene (Alt+E)');
    expect(b.type).toBe('button');
    expect(b.classList.contains('key')).toBe(true);
    expect(b.dataset.key).toBe('end');
    expect(b.textContent).toBe('END SCENE');
    expect(b.getAttribute('aria-label')).toBe('END SCENE');
    expect(b.title).toBe('End the scene (Alt+E)');
    expect(b.querySelector('svg.glyph')).not.toBeNull();
    expect(b.querySelector('.lb')!.textContent).toBe('END SCENE');
  });

  it('keyButton: the title is the label when none is given', () => {
    expect(keyButton('delete', 'DELETE').title).toBe('DELETE');
  });
});
