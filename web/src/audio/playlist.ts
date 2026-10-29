/**
 * Which of a room's songs plays, and when: shuffled (every song once a round, the last never first
 * in the next), with a pause of silence between songs, and a song shared by the next room carrying
 * on. Pure: the caller passes the time (the audio clock, so a hidden tab's pause doesn't run out)
 * and carries out the actions.
 */

/** Seconds of silence between two songs: random within this range. */
export const MUSIC_PAUSE: [number, number] = [20, 60];

export type PlaylistAction = { play: string } | { stop: true };

export interface PlaylistState {
  song: string | null;
  phase: 'playing' | 'pause' | 'idle';
  pauseUntil: number | null;
}

export class Playlist {
  /** This visit's songs (a failed one is dropped until the next room change). */
  private songs: string[] = [];
  /** Songs still to play this round, next first. */
  private bag: string[] = [];
  private current: string | null = null;
  private pauseUntil: number | null = null;
  private pause: [number, number];

  constructor(
    private readonly rng: () => number,
    pause: [number, number] = MUSIC_PAUSE,
  ) {
    this.pause = [...pause];
  }

  /** Shortens (or lengthens) the pause between songs (e2e). */
  setPause(min: number, max: number): void {
    this.pause = [min, max];
  }

  /** A room change: a shared song carries on; otherwise a song from the new list starts now. */
  enter(songs: string[], now: number): PlaylistAction | null {
    void now;
    this.songs = [...songs];
    if (this.songs.length === 0) {
      const wasQuiet = this.current === null && this.pauseUntil === null;
      this.reset();
      return wasQuiet ? null : { stop: true };
    }
    if (this.current !== null && this.songs.includes(this.current)) {
      this.bag = this.shuffled(this.songs.filter((s) => s !== this.current));
      return null;
    }
    this.bag = this.shuffled(this.songs);
    return this.playNext();
  }

  /** The current song played to its end: a pause starts. A song that isn't current is ignored. */
  ended(song: string, now: number): void {
    if (song !== this.current) return;
    this.current = null;
    const [min, max] = this.pause;
    this.pauseUntil = now + min + this.rng() * (max - min);
  }

  /** The current song failed to load: it's dropped for this visit; with none left the music stops. */
  failed(song: string, now: number): PlaylistAction | null {
    if (song !== this.current) return null;
    this.songs = this.songs.filter((s) => s !== song);
    this.bag = this.bag.filter((s) => s !== song);
    if (this.songs.length === 0) {
      this.reset();
      return { stop: true };
    }
    this.ended(song, now);
    return null;
  }

  /** Each frame: when the pause is over, the next song. */
  tick(now: number): PlaylistAction | null {
    if (this.pauseUntil === null || now < this.pauseUntil) return null;
    return this.playNext();
  }

  state(): PlaylistState {
    const phase = this.current !== null ? 'playing' : this.pauseUntil !== null ? 'pause' : 'idle';
    return { song: this.current, phase, pauseUntil: this.pauseUntil };
  }

  private playNext(): PlaylistAction | null {
    if (this.bag.length === 0) {
      // A new round; the song that just played doesn't open it (when there's a choice).
      const last = this.lastPlayed;
      this.bag = this.shuffled(this.songs);
      if (this.bag.length > 1 && this.bag[0] === last) [this.bag[0], this.bag[1]] = [this.bag[1], this.bag[0]];
    }
    const song = this.bag.shift();
    if (song === undefined) return null;
    this.current = song;
    this.lastPlayed = song;
    this.pauseUntil = null;
    return { play: song };
  }

  private lastPlayed: string | null = null;

  private reset(): void {
    this.bag = [];
    this.current = null;
    this.pauseUntil = null;
  }

  private shuffled(list: string[]): string[] {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
