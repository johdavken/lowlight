/**
 * A room's one-off sounds over time: each `onEntry` sound once, shortly after walking in, and each
 * timed sound after a random wait in its [min, max] minutes, again and again. Times are whatever
 * clock the caller ticks it with (room audio uses the audio clock, which stands still while the tab
 * is hidden, so nothing piles up). It only decides what is due; `play` makes the sound.
 */
import type { RoomSoundDef, SceneDef } from '../../../shared/types';
import { sceneDir } from '../scene-paths';

/** After walking in, so an entry sound lands after the transition rather than under it. */
export const ENTRY_DELAY_SECONDS = 1.5;
/** An unlock this soon after walking in still plays the room's entry sounds. */
export const ENTRY_GRACE_SECONDS = 10;
const DEFAULT_LEVEL = 0.5;
/** The schema's shortest wait. */
const MIN_TIMER_MINUTES = 0.5;

/** What makes a timed sound's wait: a change to any of these restarts it. */
const timerKey = (s: RoomSoundDef) => JSON.stringify([s.name, s.src, s.timer?.min, s.timer?.max]);

export class RoomSounds {
  private sounds = new Map<string, RoomSoundDef>();
  private dir = '';
  /** When each timed sound plays next, by name, with the definition its wait was drawn for. */
  private timers = new Map<string, { at: number; key: string }>();
  /** Entry sounds still to play (by name), and when. */
  private entries: { name: string; at: number }[] = [];

  constructor(private readonly deps: { play(url: string, level: number): void; rng: () => number }) {}

  /** Walking into `scene` at `now`: what was waiting is dropped; its timers start, and its entry sounds too when `entry`. */
  enter(scene: SceneDef, base: string, now: number, opts: { entry: boolean }): void {
    this.leave();
    this.define(scene, base);
    for (const s of this.sounds.values()) if (s.timer) this.schedule(s, now);
    if (opts.entry) for (const s of this.sounds.values()) if (s.onEntry) this.entries.push({ name: s.name, at: now + ENTRY_DELAY_SECONDS });
  }

  /** The same room with a new definition (a Studio edit, a reinstall): only what changed restarts. */
  update(scene: SceneDef, base: string, now: number): void {
    this.define(scene, base);
    for (const [name, t] of this.timers) {
      const s = this.sounds.get(name);
      if (!s?.timer || timerKey(s) !== t.key) this.timers.delete(name);
    }
    for (const s of this.sounds.values()) if (s.timer && !this.timers.has(s.name)) this.schedule(s, now);
    this.entries = this.entries.filter((e) => this.sounds.get(e.name)?.onEntry);
  }

  /** Plays everything due by `now`; a timed sound then waits again from `now`. */
  tick(now: number): void {
    const due = this.entries.filter((e) => e.at <= now);
    this.entries = this.entries.filter((e) => e.at > now);
    for (const e of due) this.play(e.name);
    for (const [name, t] of this.timers) {
      if (t.at > now) continue;
      const s = this.sounds.get(name)!;
      this.play(name);
      this.schedule(s, now);
    }
  }

  leave(): void {
    this.sounds.clear();
    this.timers.clear();
    this.entries = [];
  }

  /** Plays the room's sound `name` now (the agent's); false when the room has none by that name. */
  play(name: string): boolean {
    const s = this.sounds.get(name);
    if (!s) return false;
    this.deps.play(`${this.dir}${s.src}`, s.level ?? DEFAULT_LEVEL);
    return true;
  }

  private define(scene: SceneDef, base: string): void {
    this.dir = sceneDir(scene, base);
    this.sounds = new Map((scene.sound?.sounds ?? []).map((s) => [s.name, s]));
  }

  /** Entry sounds not played yet are dropped (heard too late, they'd no longer be walking in); timers carry on. */
  dropEntries(): void {
    this.entries = [];
  }

  private schedule(s: RoomSoundDef, now: number): void {
    const { min, max } = s.timer!;
    // A timer still being typed in Studio (0 to 0, an empty field) waits until it's valid: it'd play every frame.
    if (!(Number.isFinite(min) && Number.isFinite(max) && min >= MIN_TIMER_MINUTES && max >= min)) {
      this.timers.delete(s.name);
      return;
    }
    this.timers.set(s.name, { at: now + 60 * (min + this.deps.rng() * (max - min)), key: timerKey(s) });
  }
}
