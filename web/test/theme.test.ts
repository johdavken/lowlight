import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTheme, MenuShuffle, THEME, type MenuSong } from '../src/landing/theme';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const song = (title: string): MenuSong => ({ title, url: `/scenes/p/_music/${encodeURIComponent(title)}.ogg` });
const NIX = song('Nix');
const HAE = song('What Hae Serves');
const RAIN = song('Rain Tape');

describe('MenuShuffle', () => {
  it('opens with the theme, then every other song once, then rounds with the theme in them', () => {
    const shuffle = new MenuShuffle(Math.random);
    shuffle.setSongs([NIX, HAE, RAIN]);
    expect(shuffle.first()).toBe(THEME);
    const firstRound = [shuffle.next(), shuffle.next(), shuffle.next()];
    expect(firstRound.map((s) => s.title).sort()).toEqual(['Nix', 'Rain Tape', 'What Hae Serves']);
    const secondRound = [shuffle.next(), shuffle.next(), shuffle.next(), shuffle.next()];
    expect(secondRound.map((s) => s.title).sort()).toEqual(['Lost in Lowlight', 'Nix', 'Rain Tape', 'What Hae Serves']);
  });

  it('never plays the same song twice in a row across rounds', () => {
    for (let seed = 0; seed < 50; seed++) {
      let x = seed + 1;
      const rng = () => ((x = (x * 16807) % 2147483647) / 2147483647);
      const shuffle = new MenuShuffle(rng);
      shuffle.setSongs([NIX, HAE]);
      let last = shuffle.first();
      for (let i = 0; i < 20; i++) {
        const next = shuffle.next();
        expect(next.url).not.toBe(last.url);
        last = next;
      }
    }
  });

  it('leaves the theme out of the list it is given (it has its own place)', () => {
    const shuffle = new MenuShuffle(() => 0);
    shuffle.setSongs([{ ...THEME }, NIX]);
    shuffle.first();
    expect(shuffle.next()).toBe(NIX);
  });

  it('with no other songs, the theme comes round again', () => {
    const shuffle = new MenuShuffle(Math.random);
    shuffle.first();
    expect(shuffle.next()).toBe(THEME);
  });

  it('starts over from the theme', () => {
    const shuffle = new MenuShuffle(Math.random);
    shuffle.setSongs([NIX, HAE]);
    shuffle.first();
    shuffle.next();
    expect(shuffle.first()).toBe(THEME);
    expect([shuffle.next(), shuffle.next()].map((s) => s.title).sort()).toEqual(['Nix', 'What Hae Serves']);
  });
});

function setup(songs: MenuSong[] = [NIX, HAE]) {
  let ended: (url: string, failed: boolean) => void = () => {};
  const engine = { music: 'playing' as 'playing' | 'loading' | null, musicUrl: null as string | null, context: 'running' };
  const audio = {
    music: vi.fn((url: string | null) => {
      engine.musicUrl = url;
    }),
    state: () => engine,
  };
  const theme = createTheme({ audio, onMusicEnded: (fn) => (ended = fn), songs: Promise.resolve(songs), rng: () => 0 });
  return { theme, audio, engine, end: (url: string, failed = false) => ended(url, failed) };
}

describe('menu music', () => {
  it('the splash plays the theme once, full, fading in', () => {
    const { theme, audio } = setup();
    theme.splash();
    expect(audio.music).toHaveBeenCalledExactlyOnceWith(THEME.url, 1, 0.6, { loop: false });
  });

  it('the splash keypress keeps the same song going, at the same level', () => {
    const { theme, audio } = setup();
    theme.splash();
    theme.splashDismissed();
    expect(audio.music).toHaveBeenLastCalledWith(THEME.url, 1, 0.6, { loop: false });
    expect(audio.music).toHaveBeenCalledTimes(2);
  });

  it('after the theme ends, a short gap, then a game song', async () => {
    const { theme, audio, end } = setup();
    await Promise.resolve();
    theme.splash();
    end(THEME.url);
    vi.advanceTimersByTime(1999);
    expect(audio.music).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(audio.music).toHaveBeenLastCalledWith(expect.stringMatching(/^\/scenes\//), 1, 0.6, { loop: false });
  });

  it('a song that fails to load is skipped at once', async () => {
    const { theme, audio, end } = setup();
    await Promise.resolve();
    theme.dialIn(0);
    end(THEME.url, true);
    expect(audio.music).toHaveBeenCalledTimes(2);
    expect(audio.music.mock.calls[1][0]).not.toBe(THEME.url);
  });

  it('an end of a song that is no longer current is ignored', () => {
    const { theme, audio, end } = setup();
    theme.dialIn(0);
    end('/scenes/p/_music/Other.ogg');
    vi.advanceTimersByTime(10_000);
    expect(audio.music).toHaveBeenCalledTimes(1);
  });

  it('coming back to the dial-in starts over with the theme', async () => {
    const { theme, audio, end } = setup();
    await Promise.resolve();
    theme.dialIn(0);
    end(THEME.url);
    vi.advanceTimersByTime(4000);
    theme.dialIn(0.6);
    expect(audio.music).toHaveBeenLastCalledWith(THEME.url, 1, 0.6, { loop: false });
  });

  it('leaving fades the song out, cancels the gap, and resolves after the fade', async () => {
    const { theme, audio, end } = setup();
    theme.dialIn(0);
    end(THEME.url);
    const left = vi.fn();
    void theme.leave().then(left);
    expect(audio.music).toHaveBeenCalledTimes(1);
    theme.dialIn(0);
    void theme.leave().then(left);
    expect(audio.music).toHaveBeenLastCalledWith(THEME.url, 0, 0.5, { loop: false });
    vi.advanceTimersByTime(10_000);
    expect(audio.music).toHaveBeenCalledTimes(3);
    await vi.runAllTimersAsync();
    expect(left).toHaveBeenCalled();
  });

  it('the title shows only while the song is heard', () => {
    const { theme, engine, end } = setup();
    expect(theme.title()).toBeNull();
    theme.splash();
    expect(theme.title()).toBe('Lost in Lowlight');
    engine.context = 'suspended';
    expect(theme.title()).toBeNull();
    engine.context = 'running';
    engine.music = 'loading';
    expect(theme.title()).toBeNull();
    engine.music = 'playing';
    end(THEME.url);
    expect(theme.title()).toBeNull();
  });
});

describe('a chosen theme (spec 2026-10-12 menu theme)', () => {
  it('opens with the chosen theme; the built-in joins the others, and the chosen song is not dealt twice', () => {
    const shuffle = new MenuShuffle(Math.random);
    shuffle.setSongs([NIX, HAE, RAIN]);
    shuffle.setTheme(HAE);
    expect(shuffle.first()).toBe(HAE);
    const firstRound = [shuffle.next(), shuffle.next(), shuffle.next()];
    expect(firstRound.map((s) => s.title).sort()).toEqual(['Lost in Lowlight', 'Nix', 'Rain Tape']);
    const secondRound = [shuffle.next(), shuffle.next(), shuffle.next(), shuffle.next()];
    expect(secondRound.map((s) => s.title).sort()).toEqual(['Lost in Lowlight', 'Nix', 'Rain Tape', 'What Hae Serves']);
  });

  it('waits for the theme before the first song, then plays it', async () => {
    let pick: (s: MenuSong) => void = () => {};
    const audio = { music: vi.fn(), state: () => ({ music: 'playing' as const, musicUrl: null, context: 'running' }) };
    const theme = createTheme({ audio, onMusicEnded: () => {}, songs: Promise.resolve([NIX]), theme: new Promise<MenuSong>((r) => (pick = r)), rng: () => 0 });
    theme.splash();
    theme.splashDismissed();
    expect(audio.music).not.toHaveBeenCalled();
    pick(RAIN);
    await Promise.resolve();
    await Promise.resolve();
    expect(audio.music).toHaveBeenCalledExactlyOnceWith(RAIN.url, 1, 0.6, { loop: false });
  });

  it('a theme that never comes (a failed fetch) plays the built-in; leaving first plays nothing', async () => {
    const audio = { music: vi.fn(), state: () => ({ music: 'playing' as const, musicUrl: null, context: 'running' }) };
    const failed = createTheme({ audio, onMusicEnded: () => {}, songs: Promise.resolve([]), theme: Promise.reject(new Error('down')) });
    failed.dialIn(0);
    await vi.runAllTimersAsync();
    expect(audio.music).toHaveBeenCalledExactlyOnceWith(THEME.url, 1, 0, { loop: false });
    const audio2 = { music: vi.fn(), state: audio.state };
    const left = createTheme({ audio: audio2, onMusicEnded: () => {}, songs: Promise.resolve([]), theme: Promise.resolve(RAIN) });
    left.dialIn(0);
    void left.leave();
    await vi.runAllTimersAsync();
    expect(audio2.music).not.toHaveBeenCalled();
  });
});

describe('a chosen theme, same titles (review)', () => {
  it('another pack’s song with the theme’s title still rotates', () => {
    const shuffle = new MenuShuffle(() => 0);
    const other = { title: 'Nix', url: '/scenes/velvet/_music/Nix.ogg' };
    shuffle.setSongs([NIX, other]);
    shuffle.setTheme(NIX);
    shuffle.first();
    expect([shuffle.next(), shuffle.next()].map((s) => s.url).sort()).toEqual([THEME.url, other.url].sort());
  });
});
