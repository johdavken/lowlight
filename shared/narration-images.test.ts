import { describe, expect, it } from 'vitest';
import { drawImages, imageMarkers, isCrewFace, placeImages, stripImageMarkers, type CastFace, type JobImage } from './narration-images';

const TEXT = '{img a} One.\n\n*{img b} Two.*\n\nNo {img c} mid.';

describe('narration images', () => {
  it('finds markers at the start of a paragraph, plain or just inside an opening *', () => {
    expect(imageMarkers(TEXT)).toEqual([
      { id: 'a', para: 0 },
      { id: 'b', para: 1 },
    ]);
  });

  it('strips every marker and the space after it, a mid-paragraph one too', () => {
    expect(stripImageMarkers(TEXT)).toBe('One.\n\n*Two.*\n\nNo mid.');
    expect(stripImageMarkers('Nothing here.')).toBe('Nothing here.');
  });

  it('places each image not yet shown at its first marker, counting paragraphs across the joined sections', () => {
    const texts = ['{img a} A.', '', '{img a} again\n\n{img b} B.'];
    expect(placeImages(texts, new Set())).toEqual({ texts: ['A.', '', 'again\n\nB.'], placed: [{ id: 'a', para: 0 }, { id: 'b', para: 2 }] });
    expect(placeImages(texts, new Set(['a'])).placed).toEqual([{ id: 'b', para: 2 }]);
  });

  it('a crew portrait is any crew-* id', () => {
    expect(isCrewFace('crew-face-01')).toBe(true);
    expect(isCrewFace('local-03')).toBe(false);
  });

  describe('drawImages', () => {
    const extras = [
      { id: 'crew-muscle-01', tags: ['crew', 'man', 'old'] },
      { id: 'local-01', tags: ['local', 'man', 'old'] },
      { id: 'local-02', tags: ['local', 'man', 'old'] },
      { id: 'local-03', tags: ['local', 'man', 'old'] },
    ];
    const seq = (...xs: number[]) => {
      let i = 0;
      return () => xs[i++ % xs.length];
    };
    const images: JobImage[] = [
      { id: 'fixed', source: { kind: 'extra', id: 'local-01' } },
      { id: 'cast', source: { kind: 'cast' } },
      { id: 'one', source: { kind: 'any', tags: ['man', 'old'] } },
      { id: 'two', source: { kind: 'any', tags: ['man', 'old'] } },
    ];
    const cast = new Map<string, CastFace>([['cast', { kind: 'extra', id: 'local-02' }]]);

    it('never a crew portrait nor a face another image uses, never the same twice', () => {
      for (const r of [0, 0.3, 0.6, 0.99]) {
        const d = drawImages(images, cast, extras, seq(r));
        // local-01 and local-02 are taken, crew is out: only local-03 is left, so the second draw finds nothing.
        expect(Object.keys(d)).toEqual(['one']);
        expect(d.one).toBe('local-03');
        expect(d.two).toBeUndefined();
      }
    });

    it('is stable for the same random sequence', () => {
      const more = [...extras, { id: 'local-04', tags: ['man', 'old'] }, { id: 'local-05', tags: ['man', 'old'] }];
      expect(drawImages(images, cast, more, seq(0.5, 0.1))).toEqual(drawImages(images, cast, more, seq(0.5, 0.1)));
      const d = drawImages(images, cast, more, seq(0.5, 0.1));
      expect(d.one).not.toBe(d.two);
      for (const v of Object.values(d)) expect(['local-03', 'local-04', 'local-05']).toContain(v);
    });
  });
});
