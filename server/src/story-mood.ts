/**
 * Moods from story state (spec 2026-10-20-story-moods §3): one contact's room follows the story.
 * A `turn` check applies the mood the rules call for only when their key changed since the last one
 * it acted on (kept in room.db meta, so a restart doesn't re-apply over her own choice); an `enter`
 * check (the room just reset to its defaults) always applies it. Its keys are story meta, so a swipe
 * or rewind takes them back with the room's look.
 */
import { AFTER_JOB_MINUTES, moodFor, type JobState } from '../../shared/story-mood';
import type { Outage } from '../../shared/outage';

const KEY = 'storyMood.key';
/** The outage the room was last put out for (its `from`): absent while it has power. */
const POWER = 'storyMood.power';
/** The last clock time this room saw a job on: the after-job window counts from it. */
const JOB_SEEN = 'storyMood.jobSeen';

export interface StoryMoodDeps {
  room: {
    scene(): { presets: Record<string, unknown>; hours?: { open: string; close: string } };
    applyPreset(a: { name: string; duration?: number }, src: 'world'): { ok: boolean };
    /** The power goes out or comes back (blackouts phase 3 §3). */
    setPower?(a: { out: boolean; duration?: number }, src: 'world'): { ok: boolean };
  };
  /** The outage this room is in now (null: it has power). Absent: blackouts aren't followed. */
  power?(): Outage | null;
  meta: { get(k: string): string | null; set(k: string, v: string): void; delete(k: string): void };
  /** The story clock; null outside a playthrough (then nothing happens). */
  now(): number | null;
  /** Whether a job is under way for `player` (absent: the playthrough's player). */
  jobOn(player?: string): boolean;
  /** Whether she changed the room herself earlier in the turn running now: a new window is noted, not applied over her. */
  herTurnChange?(): boolean;
}

/** How often a running job's time is noted (story minutes): the after-job window counts from the last note. */
const JOB_NOTE_MINUTES = 30;

export class StoryMood {
  constructor(private readonly d: StoryMoodDeps) {}

  /**
   * `turn`: apply on a key change. `enter`: the room just reset, apply. `note`: the room was walked into
   * but changed again since (her own mood in the same round): record the key, apply nothing.
   */
  check(reason: 'turn' | 'enter' | 'note', player?: string): void {
    const now = this.d.now();
    if (now === null) return;
    // The power first (blackouts phase 3 §3): its change acts over any mood; while it's out no mood applies, and her own changes stand.
    if (this.d.power && this.d.room.setPower) {
      const p = this.d.power();
      const want = p ? String(p.from) : null;
      const had = this.d.meta.get(POWER);
      if (want === null) this.d.meta.delete(POWER);
      else this.d.meta.set(POWER, want);
      if (reason === 'note') {
        if (want !== null) return;
      } else if (want !== null) {
        // Walking in resets the room to its painted (lit) look: it goes out again even for the same outage.
        if (reason === 'enter' || want !== had) this.d.room.setPower({ out: true, duration: 3 }, 'world');
        return;
      } else if (had !== null && reason === 'turn') {
        this.d.room.setPower({ out: false, duration: 3 }, 'world');
        // Back to its painted look: the story's mood for now applies, as on walking in.
        reason = 'enter';
      }
    }
    const stored = this.d.meta.get(KEY);
    const on = this.d.jobOn(player);
    const seen = Number(this.d.meta.get(JOB_SEEN) ?? NaN);
    if (on && !(now >= seen && now - seen < JOB_NOTE_MINUTES)) this.d.meta.set(JOB_SEEN, String(now));
    const scene = this.d.room.scene();
    const r = moodFor({ moods: Object.keys(scene.presets), ...(scene.hours ? { hours: scene.hours } : {}), now, job: this.jobState(on, now) });
    if (!r) {
      if (stored !== null) this.d.meta.delete(KEY);
      return;
    }
    if (reason === 'note' || (reason === 'turn' && (r.key === stored || this.d.herTurnChange?.() === true))) {
      if (r.key !== stored) this.d.meta.set(KEY, r.key);
      return;
    }
    this.d.room.applyPreset({ name: r.mood, duration: 3 }, 'world');
    this.d.meta.set(KEY, r.key);
  }

  private jobState(on: boolean, now: number): JobState {
    if (on) return 'on';
    const seen = Number(this.d.meta.get(JOB_SEEN) ?? NaN);
    return Number.isFinite(seen) && now >= seen && now - seen <= AFTER_JOB_MINUTES ? 'after' : null;
  }
}
