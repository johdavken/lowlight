import { describe, expect, it } from 'vitest';
import { toSceneMusic } from './music';

describe('toSceneMusic', () => {
  it('turns the old single song into a list', () => {
    expect(toSceneMusic({ src: 'a.ogg', level: 0.4 })).toEqual({ songs: ['a.ogg'], level: 0.4 });
    expect(toSceneMusic({ src: 'a.ogg' })).toEqual({ songs: ['a.ogg'] });
  });

  it('keeps a list', () => {
    expect(toSceneMusic({ songs: ['a.ogg', 'b.ogg'] })).toEqual({ songs: ['a.ogg', 'b.ogg'] });
  });
});
