/**
 * Which sounds are on disk. A build without the restricted sounds (the public repo, spec 2026-10-28
 * open-source release §3) skips the missing ones instead of fetching them for a 404.
 */

/** Thrown for a sound that isn't on disk: the engine stays quiet about it. */
export class MissingSound extends Error {
  constructor(url: string) {
    super(`${url} isn't on disk`);
  }
}

const CHECKED = /^\/(sound|scenes)\//;

/**
 * Asks `load` (once, on the first check) for the decoded urls on disk. A url outside /sound/ and
 * /scenes/ always plays; so does every url when the list can't be had (today's behaviour).
 */
export function createSoundCheck(load: () => Promise<string[]>): (url: string) => Promise<boolean> {
  let list: Promise<Set<string> | null> | null = null;
  return async (url) => {
    const pathname = new URL(url, 'http://x').pathname;
    if (!CHECKED.test(pathname)) return true;
    list ??= load().then(
      (files) => new Set(files),
      () => null,
    );
    const files = await list;
    if (!files) return true;
    // Song urls escape with encodeURIComponent (`,` `#` `&` …), which decodeURI would leave escaped.
    let decoded: string;
    try {
      decoded = pathname.split('/').map(decodeURIComponent).join('/');
    } catch {
      return true; // a malformed escape: let the fetch decide, as before
    }
    return files.has(decoded);
  };
}

/** The game server's list (/api/sound-present). Studio's server has none: a non-OK answer lets everything play. */
export const defaultSoundCheck = createSoundCheck(async () => {
  const res = await fetch('/api/sound-present');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { files: string[] }).files;
});
