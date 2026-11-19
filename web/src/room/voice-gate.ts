/**
 * The narrator, between the page and the room's audio.
 * - It waits out a scene change: a job's narration doesn't start while the board has stepped back for a new room (its
 *   name holding over it), only once the board is back. A hush, or a newer reading, drops one still waiting; a reading
 *   meant to follow (`after`, a ride-along's held next beat) joins the one waiting instead.
 * - It keeps the page's clips (what the JOB column's controls act on): pause holds the reading where it is (one still
 *   waiting stays held past the scene change), play goes on, restart reads the page again from its first clip. A new
 *   page (a pick) clears a pause.
 */
export interface VoiceGate {
  speak(urls: readonly string[], o?: { after?: boolean }): void;
  hush(): void;
  pause(): void;
  play(): void;
  restart(): void;
  paused(): boolean;
  /** The page's narration: every clip it reads (empty: none, the controls hide). */
  page(): readonly string[];
}

export function voiceGate(o: {
  inScene(): boolean;
  sceneDone(): Promise<void>;
  speak(urls: readonly string[], o?: { after?: boolean }): void;
  hush(): void;
  pause?(): void;
  play?(): void;
  /** Something the controls show changed (the page, the pause). */
  changed?(): void;
}): VoiceGate {
  /** The reading waiting for the board to be back; `after`: it follows whatever is reading then. */
  let waiting: { urls: string[]; after: boolean } | null = null;
  /** A waiting reading the scene change let go of while paused: it plays on play. */
  let held: { urls: string[]; after: boolean } | null = null;
  let page: string[] = [];
  let isPaused = false;
  const changed = () => o.changed?.();
  const start = (w: { urls: string[]; after: boolean }) => o.speak(w.urls, w.after ? { after: true } : undefined);
  const wait = (w: { urls: string[]; after: boolean }) => {
    waiting = w;
    void o.sceneDone().then(() => {
      if (waiting !== w) return;
      waiting = null;
      if (isPaused) held = w;
      else start(w);
    });
  };
  const gate: VoiceGate = {
    speak(urls, opts) {
      const after = opts?.after === true;
      page = after ? [...page, ...urls] : [...urls];
      if (!after && isPaused) isPaused = false;
      held = null;
      changed();
      if (after && waiting) return void waiting.urls.push(...urls);
      if (!o.inScene()) {
        waiting = null;
        return o.speak(urls, opts);
      }
      // Nothing new reads over the change: a fresh reading stops whatever was reading, and both wait for the board.
      if (!after) o.hush();
      wait({ urls: [...urls], after });
    },
    hush() {
      waiting = null;
      held = null;
      page = [];
      isPaused = false;
      o.hush();
      changed();
    },
    pause() {
      if (isPaused || !page.length) return;
      isPaused = true;
      o.pause?.();
      changed();
    },
    play() {
      if (!isPaused) return;
      isPaused = false;
      if (held) {
        const h = held;
        held = null;
        start(h);
      } else o.play?.();
      changed();
    },
    restart() {
      if (!page.length) return;
      const all = [...page];
      isPaused = false;
      held = null;
      waiting = null;
      o.speak(all, undefined);
      changed();
    },
    paused: () => isPaused,
    page: () => page,
  };
  return gate;
}
