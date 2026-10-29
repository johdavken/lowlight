import { describe, expect, it } from 'vitest';
import { bandOf, fittingPhotos, parsePhotoReply, photoForModel, photoIdOf, photoPreview, photosLine, type Photo } from './photos';

const hm = (h: number, m = 0) => h * 60 + m;
const p = (id: string, o: Partial<Photo> = {}): Photo => ({ id, file: `photos/${id}.webp`, caption: `${id} caption`, ...o });

describe('hour bands (photos spec §1)', () => {
  it('starts are inclusive', () => {
    expect(bandOf(hm(3, 59))).toBe('night');
    expect(bandOf(hm(4))).toBe('dawn');
    expect(bandOf(hm(6, 59))).toBe('dawn');
    expect(bandOf(hm(7))).toBe('day');
    expect(bandOf(hm(16, 59))).toBe('day');
    expect(bandOf(hm(17))).toBe('evening');
    expect(bandOf(hm(19, 59))).toBe('evening');
    expect(bandOf(hm(20))).toBe('night');
    expect(bandOf(0)).toBe('night');
  });
});

describe('which photos fit (photos spec §2)', () => {
  const roof = p('roof', { at: ['karasu/ribbon-rooftop'] });
  const coat = p('coat', { outfit: 'coat' });
  const dawn = p('dawn', { hours: ['dawn'] });
  const any = p('any');
  const now = { scene: 'karasu/ribbon-rooftop', outfit: 'indoors', minuteOfDay: hm(4, 30) };

  it('each tag on its own', () => {
    expect(fittingPhotos([roof, coat, dawn, any], now).map((x) => x.id)).toEqual(['dawn', 'roof', 'any']);
    expect(fittingPhotos([roof], { ...now, scene: 'karasu/lowlight-intake' })).toEqual([]);
    expect(fittingPhotos([coat], { ...now, outfit: 'coat' }).map((x) => x.id)).toEqual(['coat']);
    expect(fittingPhotos([dawn], { ...now, minuteOfDay: hm(12) })).toEqual([]);
  });

  it('free time: only photos without at or outfit', () => {
    const free = { scene: null, outfit: null, minuteOfDay: hm(4, 30) };
    expect(fittingPhotos([roof, coat, dawn, any], free).map((x) => x.id)).toEqual(['dawn', 'any']);
  });

  it('the most specific first, then by id, at most six', () => {
    const both = p('both', { at: ['karasu/ribbon-rooftop'], hours: ['dawn'] });
    const many = ['g', 'f', 'e', 'd', 'c', 'b'].map((id) => p(id));
    expect(fittingPhotos([...many, both, roof], now).map((x) => x.id)).toEqual(['both', 'roof', 'b', 'c', 'd', 'e']);
  });
});

describe('the prompt line (photos spec §3)', () => {
  it('ids and captions, then the rule; null for none', () => {
    expect(photosLine([p('roof-cranes', { caption: 'selfie on the roof' }), p('desk', { caption: 'the desk at 2am' })])).toBe(
      '[photos you could send: roof-cranes "selfie on the roof" · desk "the desk at 2am" — to send one, put [photo: id] on its own line; at most one; only these]',
    );
    expect(photosLine([])).toBeNull();
  });
});

describe('her reply (photos spec §3)', () => {
  const offered = new Set(['roof-cranes', 'desk']);
  it('a marker line is kept, canonical', () => {
    expect(parsePhotoReply('on the roof\n[Photo:  roof-cranes ]', offered)).toEqual({ text: 'on the roof\n[photo: roof-cranes]', photo: 'roof-cranes', dropped: [] });
  });
  it('an id not offered is dropped, the words stay', () => {
    expect(parsePhotoReply('here\n[photo: beach]', offered)).toEqual({ text: 'here', photo: null, dropped: ['beach'] });
  });
  it('a second photo is dropped', () => {
    expect(parsePhotoReply('[photo: desk]\n[photo: roof-cranes]', offered)).toEqual({ text: '[photo: desk]', photo: 'desk', dropped: ['roof-cranes'] });
  });
  it('a marker inside words is removed, the words kept', () => {
    expect(parsePhotoReply('look [photo: desk] here', offered)).toEqual({ text: 'look here', photo: null, dropped: ['desk'] });
  });
  it('the caption form copied from her history is not a photo (mid review I3)', () => {
    expect(parsePhotoReply('look\n(sent a photo: on the roof)\n*(sent a photo)*', offered).text).toBe('look');
  });
  it('a photo-only reply stays', () => {
    expect(parsePhotoReply('[photo: desk]', offered).text).toBe('[photo: desk]');
  });
  it('photoIdOf reads only a whole-line marker', () => {
    expect(photoIdOf('[photo: desk]')).toBe('desk');
    expect(photoIdOf(' [PHOTO:desk] ')).toBe('desk');
    expect(photoIdOf('see [photo: desk]')).toBeNull();
  });
});

describe('what the model reads (photos spec §4)', () => {
  it('a caption, or none when the photo is gone', () => {
    const caption = (id: string) => (id === 'desk' ? 'the desk at 2am' : null);
    expect(photoForModel('long night\n[photo: desk]', caption)).toBe('long night\n(sent a photo: the desk at 2am)');
    expect(photoForModel('[photo: gone]', caption)).toBe('(sent a photo)');
    expect(photoForModel('no photo here', caption)).toBe('no photo here');
  });
});

describe('the thread list (photos spec §5)', () => {
  it('PHOTO, or PHOTO · her words', () => {
    expect(photoPreview('[photo: desk]')).toBe('PHOTO');
    expect(photoPreview('on the roof\n[photo: desk]')).toBe('PHOTO · on the roof');
    expect(photoPreview('just words')).toBe('just words');
  });
});
