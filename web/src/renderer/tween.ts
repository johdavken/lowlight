import { lerpOklab } from '../../../shared/color';
import type { LightDef, RoomState } from '../../../shared/types';

const MAX_DURATION = 10;

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function clone(s: RoomState): RoomState {
  return {
    sceneId: s.sceneId,
    lights: s.lights.map((l) => ({ ...l, pos: [l.pos[0], l.pos[1]] as [number, number] })),
    atmosphere: { ...s.atmosphere },
  };
}

/**
 * Room state eased (ease-in-out, colors in OKLab) from wherever it currently is toward the latest target.
 * - `retarget` mid-tween restarts from the currently sampled value, so there is never a jump.
 * - Discrete fields (`weather`, `timeOfDay`) switch at the start of a tween; a changed weather's level
 *   fades in from 0, and a changed timeOfDay's tint strength (`timeOfDayLevel`) fades in from 0.
 * - A `sceneId` change is never tweened: the state snaps (the renderer reloads the scene).
 */
export class TweenedState {
  private from: RoomState;
  private to: RoomState;
  private start = 0;
  private duration = 0;
  private weatherChanged = false;
  /** timeOfDay tint strength at the start of the current tween. */
  private todFrom = 1;

  constructor(initial: RoomState) {
    this.from = clone(initial);
    this.to = clone(initial);
  }

  retarget(next: RoomState, durationSec: number, nowSec: number): void {
    const current = this.sample(nowSec);
    const d = Math.max(0, Math.min(MAX_DURATION, Number.isFinite(durationSec) ? durationSec : 0));
    const snap = d === 0 || next.sceneId !== current.sceneId;
    this.weatherChanged = !snap && next.atmosphere.weather !== current.atmosphere.weather;
    const todChanged = !snap && next.atmosphere.timeOfDay !== current.atmosphere.timeOfDay;
    this.todFrom = snap ? 1 : todChanged ? 0 : this.timeOfDayLevel(nowSec);
    this.from = current;
    this.to = clone(next);
    this.start = nowSec;
    this.duration = snap ? 0 : d;
  }

  settled(nowSec: number): boolean {
    return this.progress(nowSec) >= 1;
  }

  /** Strength (0..1) of the timeOfDay tint: fades in from 0 after a timeOfDay change, otherwise 1. */
  timeOfDayLevel(nowSec: number): number {
    return lerp(this.todFrom, 1, easeInOut(this.progress(nowSec)));
  }

  sample(nowSec: number): RoomState {
    const p = this.progress(nowSec);
    if (p >= 1) return clone(this.to);
    const e = easeInOut(p);
    const a = this.from.atmosphere;
    const b = this.to.atmosphere;
    const fromById = new Map(this.from.lights.map((l) => [l.id, l]));
    const lights: LightDef[] = this.to.lights.map((t) => {
      const f = fromById.get(t.id) ?? { ...t, intensity: 0 };
      return {
        ...t,
        pos: [lerp(f.pos[0], t.pos[0], e), lerp(f.pos[1], t.pos[1], e)],
        color: lerpOklab(f.color, t.color, e),
        intensity: lerp(f.intensity, t.intensity, e),
        base: lerp(f.base ?? f.intensity, t.base ?? t.intensity, e),
        radius: lerp(f.radius, t.radius, e),
        flicker: lerp(f.flicker, t.flicker, e),
      };
    });
    return {
      sceneId: this.to.sceneId,
      lights,
      atmosphere: {
        ambient: lerpOklab(a.ambient, b.ambient, e),
        ambientLevel: lerp(a.ambientLevel, b.ambientLevel, e),
        weather: b.weather,
        weatherLevel: lerp(this.weatherChanged ? 0 : a.weatherLevel, b.weatherLevel, e),
        fog: lerp(a.fog, b.fog, e),
        timeOfDay: b.timeOfDay,
      },
    };
  }

  private progress(nowSec: number): number {
    if (this.duration <= 0) return 1;
    return Math.max(0, Math.min(1, (nowSec - this.start) / this.duration));
  }
}
