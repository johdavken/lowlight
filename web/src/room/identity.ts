/** Routing and per-agent identity for the room page. */
import type { Location } from '../../../shared/types';

const AGENT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const LAST_AGENT_KEY = 'nix-room.lastAgent';
export const LAST_MATCH_KEY = 'lowlight.lastMatch';

export interface Match {
  player: string;
  ai: string;
  /** From before her model was a server setting: read and ignored. */
  model?: string | null;
}

export type Route = { kind: 'landing' } | { kind: 'room'; id: string } | { kind: 'solo' } | { kind: 'deck' };

/** `/` → landing, `/room/<id>` → that room, bare `/room` → the last room visited (else landing). */
export function routeFromPath(pathname: string, lastAgent: string | null): Route {
  if (/^\/solo\/?$/.test(pathname)) return { kind: 'solo' };
  if (/^\/deck\/?$/.test(pathname)) return { kind: 'deck' };
  const m = /^\/room(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!m) return { kind: 'landing' };
  const id = m[1] !== undefined ? decodeURIComponent(m[1]) : lastAgent;
  return id && AGENT_ID_RE.test(id) ? { kind: 'room', id } : { kind: 'landing' };
}

/** The `?as=` param, when it's a well-formed agent id; else null (missing or invalid). */
export function playerFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get('as');
  return id && AGENT_ID_RE.test(id) ? id : null;
}

export function lastAgent(): string | null {
  try {
    return localStorage.getItem(LAST_AGENT_KEY);
  } catch {
    return null;
  }
}

export function rememberAgent(id: string): void {
  try {
    localStorage.setItem(LAST_AGENT_KEY, id);
  } catch {
    // per-viewer convenience only
  }
}

/**
 * The last dial-in's matchup, cached in this browser. Only a fallback: the server's active
 * playthrough (its player and location) is the truth; NEW GAME just starts its cursors here.
 */
export function lastMatch(): Match | null {
  try {
    const stored = localStorage.getItem(LAST_MATCH_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    // Validate shape
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (!('player' in parsed) || !('ai' in parsed)) return null;

    // Validate player and ai are valid agent IDs
    if (typeof parsed.player !== 'string' || !AGENT_ID_RE.test(parsed.player)) return null;
    if (typeof parsed.ai !== 'string' || !AGENT_ID_RE.test(parsed.ai)) return null;

    // Her model is a server setting now: an older match's `model` is dropped.
    return { player: parsed.player, ai: parsed.ai };
  } catch {
    return null;
  }
}

export function rememberMatch(m: Match): void {
  try {
    localStorage.setItem(LAST_MATCH_KEY, JSON.stringify(m));
  } catch {
    // per-viewer convenience only
  }
}

/** Esc with nothing else to close (feed collapsed, dev panel shut) goes back to the dial-in. */
export function shouldReturnToDialIn(e: KeyboardEvent, s: { feedExpanded: boolean; devPanelOpen: boolean; journalOpen: boolean }): boolean {
  return e.key === 'Escape' && !e.defaultPrevented && !s.feedExpanded && !s.devPanelOpen && !s.journalOpen;
}

/** The room's chrome hotkeys: Alt+Y you (the sheet), Alt+S save, Alt+C contacts, Alt+L leads, Alt+T title, Alt+H hide the UI. */
export type ChromeKey = 'you' | 'save' | 'people' | 'contacts' | 'leads' | 'journal' | 'quest' | 'crew' | 'title' | 'hide';
const CHROME_KEYS: Record<string, ChromeKey> = { KeyY: 'you', KeyS: 'save', KeyP: 'people', KeyC: 'contacts', KeyL: 'leads', KeyJ: 'journal', KeyQ: 'quest', KeyK: 'crew', KeyT: 'title', KeyH: 'hide' };

/**
 * The chrome action a key asks for: Alt+S, Alt+C or Alt+T (like the prompt's Alt+M), from anywhere,
 * the chat prompt included, unless a modal (save prompt, contacts, map, journal, recap) is up.
 * The physical key counts (`e.code`): Alt+letter types a symbol on some layouts.
 */
export function chromeKey(e: KeyboardEvent, modalOpen: boolean): ChromeKey | null {
  if (modalOpen || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return null;
  return CHROME_KEYS[e.code] ?? null;
}

/**
 * Runs `run` for each chrome hotkey on `target`, in the capture phase (ahead of the chat prompt);
 * a handled key goes no further. Returns the remover.
 */
export function listenChromeKeys(target: Window, o: { modalOpen(): boolean; run(k: ChromeKey): void }): () => void {
  const onKey = (e: KeyboardEvent) => {
    const k = chromeKey(e, o.modalOpen());
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    o.run(k);
  };
  target.addEventListener('keydown', onKey, true);
  return () => target.removeEventListener('keydown', onKey, true);
}

const SKIP_INTRO_KEY = 'lowlight.skipIntro';

/** A skip older than this is stale: the reload that set it never loaded, and the next room is a real arrival. */
const SKIP_INTRO_MS = 30_000;

/** The next room page this tab loads skips the district screen (a reload from inside the room). */
export function markSkipIntro(storage: Pick<Storage, 'setItem'> = sessionStorage, now = Date.now()): void {
  try {
    storage.setItem(SKIP_INTRO_KEY, String(now));
  } catch {
    // No storage: the next room shows its district screen, nothing worse.
  }
}

/** Whether this room page skips the district screen, once: reading it clears it. */
export function takeSkipIntro(storage: Pick<Storage, 'getItem' | 'removeItem'> = sessionStorage, now = Date.now()): boolean {
  try {
    const at = storage.getItem(SKIP_INTRO_KEY);
    // '1' is the e2e fixtures' (and older pages') flag: no age, always honoured.
    const skip = at === '1' || (at !== null && now - Number(at) >= 0 && now - Number(at) < SKIP_INTRO_MS);
    storage.removeItem(SKIP_INTRO_KEY);
    return skip;
  } catch {
    return false;
  }
}

const FLASH_KEY = 'nix.flash';
type FlashStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A notice for the next room page this tab loads (it survives the navigation a branch makes). */
export function setFlash(text: string, storage: FlashStore = sessionStorage): void {
  try {
    storage.setItem(FLASH_KEY, text);
  } catch {
    // No storage (private window, blocked): the notice is lost, the branch isn't.
  }
}

/** The waiting notice, once: reading it clears it. */
export function takeFlash(storage: FlashStore = sessionStorage): string | null {
  try {
    const text = storage.getItem(FLASH_KEY);
    if (text !== null) storage.removeItem(FLASH_KEY);
    return text;
  } catch {
    return null;
  }
}

/**
 * A page the browser brings back from its cache (Back from /solo) is frozen as it was left (its
 * socket gone, mid-navigation): reload it, so it connects as a room opened fresh.
 */
export function reloadOnRestore(win: Window, reload: () => void = () => win.location.reload()): void {
  win.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) reload();
  });
}

/** Where a `world-changed` event sends the room: the solo screen, the new location's contact, or the title. */
export function worldChangedPath(location: Location | null, solo = false): string {
  if (solo) return '/solo';
  return location ? `/room/${encodeURIComponent(location.contactId)}` : '/';
}

/** A direct contact's key trouble is fixed in the game, at select. */
export const RELINK_LINE = 'Relink at select (TITLE → contact).';

/**
 * Full-screen notice for a room that can't be used yet, with what fixes it: for a key that's
 * missing or rejected (linked in the game), the way back to select. One at a time.
 */
export function showRoomNotice(
  root: HTMLElement,
  p: { id: string; name: string; reason: 'not-connected' | 'unknown' | 'key-rejected' | 'no-mind' | 'no-link' },
): HTMLElement {
  const existing = root.querySelector<HTMLElement>('.room-notice');
  if (existing) return existing;
  const box = document.createElement('div');
  box.className = 'room-notice';
  const title = document.createElement('div');
  title.className = 'notice-title';
  const body = document.createElement('div');
  body.className = 'notice-body';
  if (p.reason === 'no-link' || p.reason === 'key-rejected') {
    title.textContent = p.reason === 'no-link' ? '// NO LINK' : '// KEY REJECTED';
    body.textContent = RELINK_LINE;
  } else if (p.reason === 'unknown') {
    title.textContent = '// NO SUCH CHARACTER';
    body.textContent = `There is no character called "${p.id}".`;
  } else if (p.reason === 'no-mind') {
    title.textContent = '// NO MIND ATTACHED';
    body.textContent = `${p.name} is a character you can play as, not one you can talk to.`;
  } else {
    title.textContent = '// NOT CONNECTED';
    body.textContent = `${p.name} isn't connected to the room. The file at select says why.`;
  }
  box.append(title, body);
  const back = document.createElement('a');
  back.className = 'notice-back';
  back.href = '/';
  back.textContent = '‹ DIAL-IN';
  box.append(back);
  root.append(box);
  return box;
}
