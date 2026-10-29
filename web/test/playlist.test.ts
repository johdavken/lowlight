import { describe, expect, it } from 'vitest';
import { MUSIC_PAUSE, Playlist } from '../src/audio/playlist';
import { seededRng } from '../src/renderer/effects/lightning';

const ABC = ['a', 'b', 'c'];
const playing = (p: Playlist) => p.state().song!;
/** Ends the current song at `t` and runs past its pause; returns the next song and the time. */
function next(p: Playlist, t: number): [string, number] {
  p.ended(playing(p), t);
  const until = p.state().pauseUntil!;
  const act = p.tick(until);
  if (!act || !('play' in act)) throw new Error('no song after the pause');
  return [act.play, until];
}

describe('Playlist', () => {
  it('enter starts a random song from the list', () => {
    const p = new Playlist(seededRng(1));
    const act = p.enter(ABC, 0);
    expect(act && 'play' in act && ABC.includes(act.play)).toBe(true);
    expect(p.state().phase).toBe('playing');
    expect(MUSIC_PAUSE).toEqual([20, 60]);
  });

  it('every song plays once per round', () => {
    const p = new Playlist(seededRng(2));
    p.enter(ABC, 0);
    let t = 0;
    const played = [playing(p)];
    for (let i = 0; i < 29; i++) {
      let s: string;
      [s, t] = next(p, t + 100);
      played.push(s);
    }
    for (let r = 0; r < 10; r++) expect([...played.slice(r * 3, r * 3 + 3)].sort()).toEqual(ABC);
  });

  it('the last song never opens the next round', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const p = new Playlist(seededRng(seed));
      p.enter(ABC, 0);
      let t = 0, last = playing(p);
      for (let i = 0; i < 200; i++) {
        let s: string;
        [s, t] = next(p, t + 100);
        expect(s).not.toBe(last);
        last = s;
      }
    }
  });

  it('pauses last 20–60 s', () => {
    const p = new Playlist(seededRng(3));
    p.enter(ABC, 0);
    for (let i = 0; i < 50; i++) {
      p.ended(playing(p), 100);
      const until = p.state().pauseUntil!;
      expect(p.state().phase).toBe('pause');
      expect(until).toBeGreaterThanOrEqual(120);
      expect(until).toBeLessThanOrEqual(160);
      expect(p.tick(until - 0.01)).toBeNull();
      expect(p.tick(until)).toMatchObject({ play: expect.any(String) });
    }
  });

  it('a one-song room plays, pauses, plays', () => {
    const p = new Playlist(seededRng(4));
    expect(p.enter(['a'], 0)).toEqual({ play: 'a' });
    expect(next(p, 200)[0]).toBe('a');
  });

  it('a shared song carries on', () => {
    const p = new Playlist(seededRng(5));
    p.enter(['b'], 0);
    expect(p.enter(['b', 'd'], 10)).toBeNull();
    expect(playing(p)).toBe('b');
    expect(next(p, 300)[0]).toBe('d');
  });

  it('a song not on the new list is replaced at once', () => {
    const p = new Playlist(seededRng(6));
    p.enter(['a'], 0);
    const act = p.enter(['d', 'e'], 5);
    expect(act && 'play' in act && ['d', 'e'].includes(act.play)).toBe(true);
  });

  it('a change during a pause starts a song at once', () => {
    const p = new Playlist(seededRng(7));
    p.enter(['a'], 0);
    p.ended('a', 100);
    expect(p.enter(['d'], 105)).toEqual({ play: 'd' });
    expect(p.state()).toMatchObject({ phase: 'playing', song: 'd', pauseUntil: null });
  });

  it('an empty list stops and idles', () => {
    const p = new Playlist(seededRng(8));
    p.enter(['a'], 0);
    expect(p.enter([], 1)).toEqual({ stop: true });
    expect(p.state()).toEqual({ song: null, phase: 'idle', pauseUntil: null });
    expect(p.tick(1000)).toBeNull();
  });

  it("ended for a song that isn't current is ignored (Review Focus 2)", () => {
    const p = new Playlist(seededRng(9));
    p.enter(['b'], 0);
    p.ended('a', 50);
    expect(p.state()).toMatchObject({ phase: 'playing', song: 'b' });
  });

  it('setPause shortens the pause', () => {
    const p = new Playlist(seededRng(10));
    p.setPause(1, 1);
    p.enter(['a'], 0);
    p.ended('a', 10);
    expect(p.state().pauseUntil).toBe(11);
  });

  it('a failed song is skipped for the visit', () => {
    const p = new Playlist(seededRng(11));
    p.setPause(1, 1);
    p.enter(['a', 'b'], 0);
    const first = playing(p);
    const other = first === 'a' ? 'b' : 'a';
    expect(p.failed(first, 1)).toBeNull();
    expect(p.state().phase).toBe('pause');
    let t = 1;
    for (let i = 0; i < 10; i++) {
      let s: string;
      [s, t] = next(p, t + 10);
      if (i === 0) expect(s).toBe(other);
      expect(s).toBe(other);
    }
  });

  it('when every song has failed the music stops', () => {
    const p = new Playlist(seededRng(12));
    p.setPause(1, 1);
    p.enter(['a', 'b'], 0);
    p.failed(playing(p), 1);
    const act = p.tick(p.state().pauseUntil!);
    expect(act).toMatchObject({ play: expect.any(String) });
    expect(p.failed(playing(p), 3)).toEqual({ stop: true });
    expect(p.state().phase).toBe('idle');
  });
});
