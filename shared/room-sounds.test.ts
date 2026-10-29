import { describe, expect, it } from 'vitest';
import { roomSoundsSchema } from './scene-schema';

const ok = (sounds: unknown) => roomSoundsSchema.safeParse(sounds).success;

describe('roomSoundsSchema', () => {
  it('accepts a sound with every option', () => {
    expect(ok([{ name: 'kettle', src: 'sound/keep/k.ogg', agent: { about: 'the kettle clicking off' }, timer: { min: 3, max: 8 }, onEntry: true, level: 0.4 }])).toBe(true);
  });

  it('accepts a sound that never plays', () => {
    expect(ok([{ name: 'hum-2', src: 'sound/keep/a.ogg' }])).toBe(true);
  });

  it.each([
    ['an uppercase name', [{ name: 'Kettle', src: 'a.ogg' }]],
    ['a doubled dash', [{ name: 'a--b', src: 'a.ogg' }]],
    ['a 33-character name', [{ name: 'a'.repeat(33), src: 'a.ogg' }]],
    ['two sounds named door', [{ name: 'door', src: 'a.ogg' }, { name: 'door', src: 'b.ogg' }]],
    ['a timer under half a minute', [{ name: 'a', src: 'a.ogg', timer: { min: 0.4, max: 8 } }]],
    ['min above max', [{ name: 'a', src: 'a.ogg', timer: { min: 9, max: 8 } }]],
    ['max above an hour', [{ name: 'a', src: 'a.ogg', timer: { min: 1, max: 61 } }]],
    ['an empty about', [{ name: 'a', src: 'a.ogg', agent: { about: '' } }]],
    ['a 121-character about', [{ name: 'a', src: 'a.ogg', agent: { about: 'x'.repeat(121) } }]],
    ['a level above 1', [{ name: 'a', src: 'a.ogg', level: 1.2 }]],
  ])('rejects %s', (_label, sounds) => {
    expect(ok(sounds)).toBe(false);
  });

  it('a duplicate name is reported on the second sound', () => {
    const r = roomSoundsSchema.safeParse([{ name: 'door', src: 'a.ogg' }, { name: 'door', src: 'b.ogg' }]);
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].path).toEqual([1, 'name']);
  });
});
