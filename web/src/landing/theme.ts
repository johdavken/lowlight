/**
 * The splash and dial-in music: the theme first ("Lost in Lowlight", or the one Studio's SPLASH tab
 * picked: spec 2026-10-12 menu theme), then every other song in the game once, shuffled, then all of
 * them (the theme too), never the same song twice in a row, with a short gap between songs. Each page
 * load starts over with the theme. Gone in a room.
 */
import { BUILT_IN_THEME } from '../../../shared/splash';


/** A song's title (its file name without `.ogg`) and where it's fetched from. */
export interface MenuSong {
  title: string;
  url: string;
}

/** The built-in theme. */
export const THEME: MenuSong = { ...BUILT_IN_THEME };
/** Level × the music slider, the same on the splash and the dial-in. */
export const THEME_LEVEL = 1;
/** Fade-in when the splash's keypress starts it. */
export const THEME_IN_SECONDS = 0.6;
/** Fade-out before navigating into a room (a full page load cuts it off otherwise). */
export const THEME_LEAVE_SECONDS = 0.5;
/** Seconds of silence between two songs: random within this range. */
export const MENU_GAP: [number, number] = [2, 4];

/** Which song is next: the theme, then the rest once each, shuffled, then rounds of everything. */
export class MenuShuffle {
  private songs: MenuSong[] = [];
  private theme: MenuSong = THEME;
  /** Songs that failed to load, by URL. */
  private dropped = new Set<string>();
  private bag: MenuSong[] = [];
  /** The first round (the songs other than the theme) has been dealt. */
  private dealt = false;
  private last: MenuSong | null = null;

  constructor(private readonly rng: () => number) {}

  /** The game's songs (the theme is left out if listed; it has its own place). */
  setSongs(songs: MenuSong[]): void {
    this.songs = songs;
  }

  /** The chosen theme; the built-in then rotates with the others. */
  setTheme(song: MenuSong): void {
    this.theme = song;
  }

  /** Every song but the theme (and those that failed). */
  private get others(): MenuSong[] {
    const all = this.theme.url === THEME.url ? this.songs : [THEME, ...this.songs];
    // A pack's copy of the built-in theme (same title) is the theme too.
    const twin = (s: MenuSong) => this.theme.url === THEME.url && s.title === THEME.title;
    return all.filter((s) => s.url !== this.theme.url && !twin(s) && !this.dropped.has(s.url));
  }

  /** Starts over: the theme. */
  first(): MenuSong {
    this.bag = [];
    this.dealt = false;
    this.last = this.theme;
    return this.theme;
  }

  next(): MenuSong {
    if (this.bag.length === 0) {
      const theme = this.dropped.has(this.theme.url) ? [] : [this.theme];
      this.bag = this.shuffled(this.dealt ? [...theme, ...this.others] : this.others);
      this.dealt = true;
      // A round never opens with the song that just played (when there's a choice).
      if (this.bag.length > 1 && this.bag[0].url === this.last?.url) [this.bag[0], this.bag[1]] = [this.bag[1], this.bag[0]];
    }
    const song = this.bag.shift() ?? this.theme;
    this.last = song;
    return song;
  }

  /** A song that failed to load: out for the rest of the page. */
  drop(song: MenuSong): void {
    this.dropped.add(song.url);
    this.bag = this.bag.filter((s) => s.url !== song.url);
  }

  private shuffled(list: MenuSong[]): MenuSong[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

type MusicFn = (url: string | null, level: number, seconds: number, opts?: { loop?: boolean }) => void;

/** Plays the menu's songs through the page's audio; `title()` is what the PLAYING label shows. */
export function createTheme(deps: {
  audio: { music: MusicFn; state(): { music?: 'loading' | 'playing' | 'error' | null; musicUrl?: string | null; context?: string } };
  /** The engine's "a song played out (or failed)" event. */
  onMusicEnded(fn: (url: string, failed: boolean) => void): void;
  /** The game's songs; until (or unless) they arrive, only the theme plays. */
  songs: Promise<MenuSong[]>;
  /** The theme Studio picked: the first song waits for it; a failure plays the built-in. None: the built-in, at once. */
  theme?: Promise<MenuSong>;
  rng?: () => number;
  timers?: { set(fn: () => void, ms: number): unknown; clear(id: unknown): void };
}) {
  const { audio } = deps;
  const rng = deps.rng ?? Math.random;
  const timers = deps.timers ?? { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as number) };
  const shuffle = new MenuShuffle(rng);
  deps.songs.then(
    (songs) => shuffle.setSongs(songs),
    () => {},
  );
  let current: MenuSong | null = null;
  let gap: unknown = null;
  /** The theme is known; until then a start waits in `pending` (its fade-in seconds). */
  let ready = deps.theme === undefined;
  let pending: number | null = null;
  deps.theme
    ?.then(
      (song) => shuffle.setTheme(song),
      () => {},
    )
    .then(() => {
      ready = true;
      if (pending !== null) start(pending);
    });

  const stopGap = () => {
    if (gap !== null) timers.clear(gap);
    gap = null;
  };
  const play = (song: MenuSong, seconds: number) => {
    stopGap();
    current = song;
    audio.music(song.url, THEME_LEVEL, seconds, { loop: false });
  };
  const start = (seconds: number) => {
    pending = ready ? null : seconds;
    if (ready) play(shuffle.first(), seconds);
  };

  deps.onMusicEnded((url, failed) => {
    if (!current || url !== current.url) return;
    const ended = current;
    current = null;
    if (failed) {
      shuffle.drop(ended);
      // The theme itself failing with nothing else to play: silence, not a retry loop.
      const next = shuffle.next();
      if (next.url !== ended.url) play(next, THEME_IN_SECONDS);
      return;
    }
    const [min, max] = MENU_GAP;
    gap = timers.set(() => {
      gap = null;
      play(shuffle.next(), THEME_IN_SECONDS);
    }, (min + rng() * (max - min)) * 1000);
  });

  return {
    /** Full on the splash: plays as soon as the browser allows sound (at once, or on the first key). */
    splash(): void {
      start(THEME_IN_SECONDS);
    },
    /** The splash's keypress: starts the song if sound was blocked; it carries on into the list. */
    splashDismissed(): void {
      if (current) audio.music(current.url, THEME_LEVEL, THEME_IN_SECONDS, { loop: false });
    },
    /** On the dial-in (no splash this session, or a page restored from the back/forward cache): from the theme again. */
    dialIn(seconds: number): void {
      start(seconds);
    },
    /** Fades out; resolves when it's silent, so the page can navigate. */
    leave(): Promise<void> {
      stopGap();
      pending = null;
      if (current) audio.music(current.url, 0, THEME_LEAVE_SECONDS, { loop: false });
      current = null;
      return new Promise((resolve) => setTimeout(resolve, THEME_LEAVE_SECONDS * 1000));
    },
    /** The song heard right now (playing, with sound running), or null: loading, in a gap, or no sound yet. */
    title(): string | null {
      const s = audio.state();
      return current && s.context === 'running' && s.music === 'playing' && s.musicUrl === current.url ? current.title : null;
    },
  };
}
