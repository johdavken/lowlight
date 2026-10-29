import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSoundCheck, defaultSoundCheck } from '../src/audio/present';

afterEach(() => vi.unstubAllGlobals());

describe('createSoundCheck', () => {
  const listed = ['/sound/ui/move.ogg', '/sound/music/Lost in Lowlight.ogg', '/scenes/karasu/noodle-stall/sound/bed.ogg'];

  it('answers from the list for /sound/ and /scenes/ urls', async () => {
    const check = createSoundCheck(async () => listed);
    expect(await check('/sound/ui/move.ogg')).toBe(true);
    expect(await check('/sound/ui/lock.ogg')).toBe(false);
    expect(await check('/scenes/karasu/noodle-stall/sound/bed.ogg')).toBe(true);
    expect(await check('/scenes/karasu/noodle-stall/sound/gone.ogg')).toBe(false);
  });

  it('decodes a url before looking it up (Review Focus 1)', async () => {
    const check = createSoundCheck(async () => listed);
    expect(await check('/sound/music/Lost%20in%20Lowlight.ogg')).toBe(true);
  });

  it('decodes what encodeURIComponent escapes: commas, hashes, ampersands (review: Important 1)', async () => {
    const check = createSoundCheck(async () => ['/scenes/karasu/_music/Rain, Again #2 & More.ogg']);
    expect(await check(`/scenes/karasu/_music/${encodeURIComponent('Rain, Again #2 & More.ogg')}`)).toBe(true);
  });

  it('a malformed escape plays rather than throwing', async () => {
    const check = createSoundCheck(async () => []);
    expect(await check('/sound/bad%E0%A4%A.ogg')).toBe(true);
  });

  it('never blocks a url outside /sound/ and /scenes/', async () => {
    const check = createSoundCheck(async () => []);
    expect(await check('/api/splash/x.ogg')).toBe(true);
  });

  it('a list that fails to load lets everything play (Review Focus 2)', async () => {
    const check = createSoundCheck(() => Promise.reject(new Error('offline')));
    expect(await check('/sound/ui/move.ogg')).toBe(true);
  });

  it('loads the list once', async () => {
    const load = vi.fn(async () => listed);
    const check = createSoundCheck(load);
    await Promise.all([check('/sound/ui/move.ogg'), check('/sound/ui/lock.ogg'), check('/sound/x.ogg')]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('the default check treats a 404 from the server (Studio has no route) as everything present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    expect(await defaultSoundCheck('/sound/ui/move.ogg')).toBe(true);
  });
});
