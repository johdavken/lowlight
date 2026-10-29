import { describe, expect, it } from 'vitest';
import { resolveRoomPlayer } from '../src/room/room-player';
import type { PersonaInfo } from '../../shared/types';

const persona = (id: string, name = 'Cass'): PersonaInfo => ({ id, name, sprite: null });

describe('resolveRoomPlayer (Review Focus 5)', () => {
  it('a valid ?as= that matches the resolved persona needs no URL fix', async () => {
    const r = await resolveRoomPlayer('?as=cass', async (as) => {
      expect(as).toBe('cass');
      return { persona: persona('cass') };
    });
    expect(r).toEqual({ player: 'cass', persona: persona('cass'), search: null });
  });

  it('a missing ?as= resolves to the default and writes it into the URL, keeping other params', async () => {
    const r = await resolveRoomPlayer('?foo=bar', async (as) => {
      expect(as).toBeNull();
      return { persona: persona('you', 'Jo') };
    });
    expect(r.player).toBe('you');
    expect(r.search).toBe('?foo=bar&as=you');
  });

  it('an unknown ?as= falls back to the default and corrects the URL', async () => {
    const r = await resolveRoomPlayer('?as=nope', async () => ({ persona: persona('you', 'Jo') }));
    expect(r.player).toBe('you');
    expect(r.search).toBe('?as=you');
  });

  it('no persona at all, no `as` in the URL: connect without `as` and leave the URL alone', async () => {
    expect(await resolveRoomPlayer('?foo=bar', async () => ({ persona: null }))).toEqual({ player: null, persona: null, search: null });
    expect(await resolveRoomPlayer('', async () => ({ persona: null }))).toEqual({ player: null, persona: null, search: null });
  });

  it('no persona at all with an `as` in the URL (valid-looking or not): connect without `as` and drop it, keeping other params', async () => {
    expect(await resolveRoomPlayer('?as=nope', async () => ({ persona: null }))).toEqual({ player: null, persona: null, search: '' });
    expect(await resolveRoomPlayer('?foo=bar&as=Bad%20Id&x=1', async () => ({ persona: null }))).toEqual({ player: null, persona: null, search: '?foo=bar&x=1' });
  });

  it('a failed persona fetch keeps the URL\'s valid player', async () => {
    const r = await resolveRoomPlayer('?as=cass', async () => {
      throw new Error('network down');
    });
    expect(r).toEqual({ player: 'cass', persona: null, search: null });
  });

  it('a failed persona fetch with no valid as connects without as', async () => {
    const r1 = await resolveRoomPlayer('?as=Bad%20Id', async () => {
      throw new Error('network down');
    });
    expect(r1).toEqual({ player: null, persona: null, search: null });

    const r2 = await resolveRoomPlayer('', async () => {
      throw new Error('network down');
    });
    expect(r2).toEqual({ player: null, persona: null, search: null });
  });
});
