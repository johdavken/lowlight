/** A room's songs: a shuffled playlist of files in the pack's `_music/` folder. */

/** At most this many songs in a room. */
export const MAX_SONGS = 16;

export interface SceneMusic {
  /** Plain file names in `<pack>/_music/`, no duplicates. */
  songs: string[];
  /** The room's music level (0..1). */
  level?: number;
}

/** As a scene file may hold it: a list, or the old single song. */
export type RawMusic = SceneMusic | { src: string; level?: number };

/** The old `{ src }` as a one-song list; a list as it is. */
export function toSceneMusic(m: RawMusic): SceneMusic {
  if ('songs' in m) return m;
  return { songs: [m.src], ...(m.level !== undefined ? { level: m.level } : {}) };
}
