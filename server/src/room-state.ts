import type { Atmosphere, LightDef, RoomState, Source, Transition, Weather } from '../../shared/types';
import { applyPresetTo } from '../../shared/presets';
import { WEATHER_MOODS } from '../../shared/city-weather';
import { BLACKOUT_MOODS } from '../../shared/outage';
import { withBase } from '../../shared/light-share';
import { normalizeHex } from '../../shared/color';
import type { SceneDef } from '../../shared/types';
import { currentSceneId } from '../../shared/scene-aliases';

/** Where rooms come from: the city's room registry, or one district's scenes (tests, tools). */
export interface RoomScenes {
  get(id: string): SceneDef | undefined;
  list(): SceneDef[];
  first(): SceneDef;
  /** A full name, or a bare folder only one room has (the city's registry; a district's scenes just look it up). */
  resolve?(name: string): { ok: true; id: string } | { ok: false; error: string };
}

/** Whose room this is: her rooms (where she takes you herself), where she starts, and how districts are named. */
export interface RoomOptions {
  mine: string[];
  start: string;
  /** Her old pack: completes a saved room id from before rooms. */
  legacyDistrict: string | null;
  districtName(district: string): string;
}

export type Result = { ok: true; text: string } | { ok: false; error: string };

export interface RoomOp {
  tool: string;
  args: Record<string, unknown>;
}

export interface RoomChange {
  state: RoomState;
  duration: number;
  source: Source;
  transition?: Transition;
  op: RoomOp;
}

const DEFAULT_DURATION = 1.5;
const WEATHER_VALUES: Weather[] = ['none', 'rain', 'snow', 'ash', 'dust'];
const TRANSITION_VALUES: Transition[] = ['fade', 'glitch'];

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * A 0–1 level from a tool call. The room line shows levels as percentages, so models often send 25
 * for 25%: anything from 2 to 100 is read as a percentage (with a note); the rest is clamped.
 */
function unit(x: number, field: string, notes: string[]): number {
  if (x >= 2 && x <= 100) {
    notes.push(`${field} ${x} read as ${x}%`);
    return x / 100;
  }
  const clamped = clamp(x, 0, 1);
  if (clamped !== x) notes.push(`${field} clamped to ${clamped}`);
  return clamped;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

/** Deep-freeze a plain object/array tree (atoms, arrays, objects only — no cycles). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

function freezeState(state: RoomState): RoomState {
  return deepFreeze({
    sceneId: state.sceneId,
    lights: state.lights.map((l) => ({ ...l })),
    atmosphere: { ...state.atmosphere },
  });
}

/**
 * The room with its power out (blackouts phase 3 §3): its first blackout mood (the weather kept), or, with none, every
 * light at 0 but window light from outside and a screen's own light.
 */
export function powerOutState(state: RoomState, scene: Pick<SceneDef, 'presets' | 'effects'>): { state: RoomState; mood: string | null } {
  const mood = BLACKOUT_MOODS.find((m) => scene.presets[m]) ?? null;
  if (mood) {
    const { weather: _w, weatherLevel: _l, ...keepsWeather } = scene.presets[mood]!;
    return { state: applyPresetTo(state, keepsWeather), mood };
  }
  const screens = new Set((scene.effects ?? []).flatMap((e) => (e.kind === 'screen' ? [e.light] : [])));
  return { state: { ...state, lights: state.lights.map((l) => (l.outside || screens.has(l.id) ? l : { ...l, intensity: 0 })) }, mood: null };
}

/** Build the default room state for a scene: its own lights and atmosphere defaults. */
function defaultStateFor(sceneId: string, scenes: RoomScenes): RoomState {
  const scene = scenes.get(sceneId) ?? scenes.first();
  return {
    sceneId: scene.id,
    lights: withBase(scene.lights),
    atmosphere: { ...scene.defaults },
  };
}

/**
 * Reconcile a saved state against the registry: fall back to the first scene's defaults if the
 * saved scene no longer exists, and keep the scene's current light list, carrying over saved
 * values for lights that still exist and dropping any that were removed.
 */
/**
 * A saved room id as it reads now: one saved before rooms had full names (a bare `noodle-stall`) is
 * in her old district — her `legacyDistrict`, else her start room's district.
 */
export function completeSceneId(stored: string, has: (id: string) => boolean, legacyDistrict: string | null, start: string): string {
  const sceneId = currentSceneId(stored);
  const legacy = legacyDistrict ?? (start.includes('/') ? start.split('/')[0]! : null);
  // Completed from an old district (a `scenePack: ribbon`), it's aliased again.
  return !has(sceneId) && !sceneId.includes('/') && legacy ? currentSceneId(`${legacy}/${sceneId}`) : sceneId;
}

function restoreState(saved: RoomState, scenes: RoomScenes, start: string, completed: string): RoomState {
  const scene = scenes.get(completed);
  if (!scene) return defaultStateFor(start, scenes);

  // Only the mutable appearance fields carry over from a save — geometry (pos, radius, label)
  // always comes from the scene's current definition, so edits to the scene aren't shadowed by
  // stale saved values.
  const savedById = new Map(saved.lights.map((l) => [l.id, l]));
  const lights = scene.lights.map((defLight) => {
    const savedLight = savedById.get(defLight.id);
    return savedLight
      ? { ...defLight, color: savedLight.color, intensity: savedLight.intensity, flicker: savedLight.flicker, base: savedLight.base ?? defLight.intensity }
      : { ...defLight, base: defLight.intensity };
  });

  return {
    sceneId: scene.id,
    lights,
    atmosphere: { ...scene.defaults, ...saved.atmosphere },
  };
}

function lightLabel(light: LightDef): string {
  return `${light.id} "${light.label}" ${light.color} ${pct(light.intensity)}${light.outside ? ' outside' : ''}`;
}

/**
 * What changed in the room between `before` (what she was last shown) and `now`, as the summary words it: the scene
 * when she's somewhere else, else each light whose colour or level moved, then ambient, weather and fog. Null when
 * nothing did. The turn's line near their words (2026-10-23: the whole room line there every turn put the paper lantern
 * in eight replies running).
 */
export function roomChanges(before: RoomState, now: RoomState): string | null {
  if (before.sceneId !== now.sceneId) return `[since your last reply: you're in ${now.sceneId} now]`;
  const changed: string[] = [];
  for (const l of now.lights) {
    const was = before.lights.find((b) => b.id === l.id);
    if (was && (was.color !== l.color || pct(was.intensity) !== pct(l.intensity))) changed.push(lightLabel(l));
  }
  const a = now.atmosphere;
  const b = before.atmosphere;
  if (a.ambient !== b.ambient || pct(a.ambientLevel) !== pct(b.ambientLevel)) changed.push(`ambient ${a.ambient} ${pct(a.ambientLevel)}`);
  if (a.weather !== b.weather || (a.weather !== 'none' && pct(a.weatherLevel) !== pct(b.weatherLevel))) changed.push(a.weather === 'none' ? 'clear' : `${a.weather} ${pct(a.weatherLevel)}`);
  if (pct(a.fog) !== pct(b.fog)) changed.push(`fog ${pct(a.fog)}`);
  return changed.length > 0 ? `[since your last reply: ${changed.join(', ')}]` : null;
}

export class Room {
  private current: RoomState;
  private readonly listeners = new Set<(c: RoomChange) => void>();

  /** Without options, every scene is hers and she starts in the first (one district's scenes, as in tests and tools). */
  private readonly o: RoomOptions;

  constructor(
    private readonly scenes: RoomScenes,
    saved?: RoomState | null,
    o?: RoomOptions,
  ) {
    const own = o ?? { mine: scenes.list().map((s) => s.id), start: scenes.first().id, legacyDistrict: null, districtName: (d) => d };
    // Public rooms (Hae's stall) are everyone's places: any contact can take you there herself.
    const open = scenes.list().filter((s) => s.public && !own.mine.includes(s.id)).map((s) => s.id);
    this.o = open.length > 0 ? { ...own, mine: [...own.mine, ...open] } : own;
    const start = scenes.get(this.o.start) ? this.o.start : scenes.first().id;
    this.current = freezeState(
      saved
        ? restoreState(saved, scenes, start, completeSceneId(saved.sceneId, (id) => scenes.get(id) !== undefined, this.o.legacyDistrict, this.o.start))
        : defaultStateFor(start, scenes),
    );
  }

  /** A scene by its id (any room in the city), for naming it. */
  findScene(id: string): SceneDef | undefined {
    return this.scenes.get(id);
  }

  get state(): RoomState {
    return this.current;
  }

  scene() {
    const scene = this.scenes.get(this.current.sceneId);
    if (!scene) throw new Error(`room state references unknown scene '${this.current.sceneId}'`);
    return scene;
  }

  /** The ways out of the room you're in (room exits spec §3): rooms anyone here can take you to, in file order. */
  exitsHere(): { scene: SceneDef; way: string }[] {
    return (this.scene().exits ?? []).flatMap((e) => {
      const scene = this.scenes.get(e.to);
      return scene ? [{ scene, way: e.way }] : [];
    });
  }

  /** Her rooms, plus the one she's in when she was walked somewhere else: where she can take you. */
  listScenes(): SceneDef[] {
    const ids = this.o.mine.includes(this.current.sceneId) ? this.o.mine : [...this.o.mine, this.current.sceneId];
    return ids.map((id) => this.scenes.get(id)).filter((s): s is SceneDef => s !== undefined);
  }

  summary(): string {
    const scene = this.scene();
    const { atmosphere, lights } = this.current;
    const weatherText = atmosphere.weather === 'none' ? 'clear' : `${atmosphere.weather} ${pct(atmosphere.weatherLevel)}`;
    const lightsText = lights.map(lightLabel).join(', ');
    // "moods", not "presets": the word in front of her every turn leaked into the story ("Quiet preset ought to do it", 2026-10-14).
    const presets = Object.keys(scene.presets).join(', ') || 'none';
    const where = scene.district ? `, ${this.o.districtName(scene.district)}` : '';
    // Her other places, with ids, so taking them somewhere is one go_to call (GLM skipped the list_scenes round).
    // A room that's a way out of here shows once, as a way out, even when it's also hers.
    const exits = this.exitsHere();
    const exitIds = new Set(exits.map((e) => e.scene.id));
    const others = this.listScenes().filter((s) => s.id !== scene.id && !exitIds.has(s.id));
    const places = others.length > 0 ? ` · places: ${others.map((s) => `${s.id} "${s.name}"`).join(', ')}` : '';
    const ways = exits.length > 0 ? ` · ways out: ${exits.map((e) => `${e.scene.id} "${e.scene.name}" (${e.way})`).join(', ')}` : '';
    return `[room: ${scene.id} "${scene.name}"${where} · ambient ${atmosphere.ambient} ${pct(atmosphere.ambientLevel)} · ${weatherText} · fog ${pct(atmosphere.fog)} · lights: ${lightsText} · moods: ${presets}${places}${ways}]`;
  }

  describe(): string {
    const scene = this.scene();
    const { atmosphere, lights } = this.current;
    const weatherText = atmosphere.weather === 'none' ? 'clear' : `${atmosphere.weather} ${pct(atmosphere.weatherLevel)}`;
    const lightLines = lights
      .map((l) => `  - ${l.id} (${l.label}): ${l.color}, intensity ${pct(l.intensity)}, flicker ${pct(l.flicker)}`)
      .join('\n');
    const presetNames = Object.keys(scene.presets).join(', ') || 'none';
    const sounds = (scene.sound?.sounds ?? []).filter((s) => s.agent).map((s) => `${s.name} (${s.agent!.about})`);
    return [
      `Scene: ${scene.name} (${scene.id})`,
      scene.description,
      `Ambient ${atmosphere.ambient} ${pct(atmosphere.ambientLevel)}, ${weatherText}, fog ${pct(atmosphere.fog)}, ${atmosphere.timeOfDay}.`,
      `Lights:`,
      lightLines,
      `Presets: ${presetNames}`,
      ...(sounds.length > 0 ? [`Sounds you can play: ${sounds.join(', ')}.`] : []),
    ].join('\n');
  }

  /**
   * Puts the room back to a saved state (what a rebuild left in the database; null = the start
   * room's default), the way the constructor reads one. A change goes out as `restore` from the
   * user: a new scene fades in, anything else eases over. Returns whether anything changed.
   */
  restore(saved: RoomState | null): boolean {
    const start = this.scenes.get(this.o.start) ? this.o.start : this.scenes.first().id;
    const next = saved
      ? restoreState(saved, this.scenes, start, completeSceneId(saved.sceneId, (id) => this.scenes.get(id) !== undefined, this.o.legacyDistrict, this.o.start))
      : defaultStateFor(start, this.scenes);
    if (JSON.stringify(next) === JSON.stringify(this.current)) return false;
    const moved = next.sceneId !== this.current.sceneId;
    this.emit('restore', {}, next, moved ? 1.2 : DEFAULT_DURATION, 'user', moved ? 'fade' : undefined);
    return true;
  }

  onChange(fn: (c: RoomChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(
    tool: string,
    args: Record<string, unknown>,
    nextState: RoomState,
    duration: number,
    source: Source,
    transition?: Transition,
  ): void {
    this.current = freezeState(nextState);
    const change: RoomChange = {
      state: this.current,
      duration,
      source,
      op: { tool, args },
    };
    if (transition !== undefined) change.transition = transition;
    for (const listener of this.listeners) listener(change);
  }

  /** Success text for a change: what was applied, then the room as it now is, so Nix can see it landed. */
  private applied(what: string): Result {
    return { ok: true, text: `applied: ${what}\nroom now: ${this.summary()}` };
  }

  private clampDuration(duration: number | undefined, args: Record<string, unknown>, notes: string[]): number {
    if (duration === undefined) return DEFAULT_DURATION;
    const clamped = clamp(duration, 0, 10);
    args.duration = clamped;
    if (clamped !== duration) notes.push(`duration clamped to ${clamped}`);
    return clamped;
  }

  setScene(a: { id: string; transition?: Transition }, src: Source): Result {
    const found = this.scenes.resolve ? this.scenes.resolve(a.id) : this.scenes.get(a.id) ? { ok: true as const, id: a.id } : { ok: false as const, error: '' };
    const scene = found.ok ? this.scenes.get(found.id) : undefined;
    if (!scene) {
      if (!found.ok && found.error.includes('is more than one room')) return { ok: false, error: found.error };
      return { ok: false, error: `unknown scene '${a.id}'; yours: ${this.listScenes().map((s) => s.id).join(', ')}` };
    }
    // She takes you to her own places and through the room's ways out (and can stay where she is); the map and the dev panel go anywhere.
    if (src === 'agent' && !this.o.mine.includes(scene.id) && scene.id !== this.current.sceneId && !this.exitsHere().some((e) => e.scene.id === scene.id)) {
      return { ok: false, error: "that's not one of your places; they can walk you both there on the map" };
    }
    if (a.transition !== undefined && !TRANSITION_VALUES.includes(a.transition)) {
      return { ok: false, error: `unknown transition '${a.transition}'; valid: ${TRANSITION_VALUES.join(', ')}` };
    }

    const transition = a.transition ?? 'fade';
    const nextState = defaultStateFor(scene.id, this.scenes);
    const duration = transition === 'glitch' ? 0.6 : 1.2;
    const args: Record<string, unknown> = { id: scene.id, transition };

    this.emit('go_to', args, nextState, duration, src, transition);
    return this.applied(`scene → ${scene.name}`);
  }

  setLight(
    a: { light_id: string; color?: string; intensity?: number; flicker?: number; duration?: number },
    src: Source,
  ): Result {
    // Nix sees both ids and labels in the room line; accept either (labels case-insensitively).
    const wanted = a.light_id.trim().toLowerCase();
    const light =
      this.current.lights.find((l) => l.id === a.light_id) ??
      this.current.lights.find((l) => l.label.toLowerCase() === wanted);
    if (!light) {
      const ids = this.current.lights.map((l) => `${l.id} ("${l.label}")`).join(', ');
      return { ok: false, error: `unknown light '${a.light_id}'; available: ${ids}` };
    }

    let color = light.color;
    let intensity = light.intensity;
    let flicker = light.flicker;
    const args: Record<string, unknown> = { light_id: light.id };
    const notes: string[] = [];

    if (a.color !== undefined) {
      const normalized = normalizeHex(a.color);
      if (!normalized) return { ok: false, error: `color must be #rrggbb, got '${a.color}'` };
      color = normalized;
      args.color = color;
    }
    if (a.intensity !== undefined) {
      intensity = unit(a.intensity, 'intensity', notes);
      args.intensity = intensity;
    }
    if (a.flicker !== undefined) {
      flicker = unit(a.flicker, 'flicker', notes);
      args.flicker = flicker;
    }
    const duration = this.clampDuration(a.duration, args, notes);

    const nextLight: LightDef = { ...light, color, intensity, flicker };
    const nextState: RoomState = {
      ...this.current,
      lights: this.current.lights.map((l) => (l.id === light.id ? nextLight : l)),
    };

    this.emit('set_light', args, nextState, duration, src);
    const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';
    return this.applied(`${light.label} → ${color} · ${pct(intensity)} · flicker ${pct(flicker)}${suffix}`);
  }

  setAmbient(a: { color?: string; level?: number; duration?: number }, src: Source): Result {
    const atmosphere = this.current.atmosphere;
    let ambient = atmosphere.ambient;
    let ambientLevel = atmosphere.ambientLevel;
    const args: Record<string, unknown> = {};
    const notes: string[] = [];

    if (a.color !== undefined) {
      const normalized = normalizeHex(a.color);
      if (!normalized) return { ok: false, error: `color must be #rrggbb, got '${a.color}'` };
      ambient = normalized;
      args.color = ambient;
    }
    if (a.level !== undefined) {
      ambientLevel = unit(a.level, 'level', notes);
      args.level = ambientLevel;
    }
    const duration = this.clampDuration(a.duration, args, notes);

    const nextState: RoomState = {
      ...this.current,
      atmosphere: { ...atmosphere, ambient, ambientLevel },
    };

    this.emit('set_ambient', args, nextState, duration, src);
    const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';
    return this.applied(`ambient → ${ambient} · ${pct(ambientLevel)}${suffix}`);
  }

  setAtmosphere(
    a: { weather?: Weather; weather_level?: number; fog?: number; duration?: number },
    src: Source,
  ): Result {
    const atmosphere = this.current.atmosphere;
    let weather = atmosphere.weather;
    let weatherLevel = atmosphere.weatherLevel;
    let fog = atmosphere.fog;
    const args: Record<string, unknown> = {};
    const notes: string[] = [];

    if (a.weather !== undefined) {
      if (!WEATHER_VALUES.includes(a.weather)) {
        return { ok: false, error: `unknown weather '${a.weather}'; valid: ${WEATHER_VALUES.join(', ')}` };
      }
      weather = a.weather;
      args.weather = weather;
    }
    if (a.weather_level !== undefined) {
      weatherLevel = unit(a.weather_level, 'weather_level', notes);
      args.weather_level = weatherLevel;
    }
    if (a.fog !== undefined) {
      fog = unit(a.fog, 'fog', notes);
      args.fog = fog;
    }
    const duration = this.clampDuration(a.duration, args, notes);

    const nextState: RoomState = {
      ...this.current,
      atmosphere: { ...atmosphere, weather, weatherLevel, fog },
    };

    this.emit('set_atmosphere', args, nextState, duration, src);
    const weatherText = weather === 'none' ? 'clear' : `${weather} ${pct(weatherLevel)}`;
    const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';
    return this.applied(`atmosphere → ${weatherText} · fog ${pct(fog)}${suffix}`);
  }

  /** The power goes out or comes back (blackouts phase 3 §3): one change, a `power` op; back is the painted lights and look, the weather kept. */
  setPower(a: { out: boolean; duration?: number }, src: Source): Result {
    const scene = this.scene();
    const args: Record<string, unknown> = { state: a.out ? 'out' : 'back' };
    const duration = this.clampDuration(a.duration, {}, []);
    if (a.out) {
      const { state, mood } = powerOutState(this.current, scene);
      if (mood) args.mood = mood;
      this.emit('power', args, state, duration, src);
      return this.applied(`power out${mood ? ` (mood ${mood})` : ''}`);
    }
    const { weather, weatherLevel } = this.current.atmosphere;
    // Every painted light, the street through the window too: a blackout mood may have dimmed it (review I1).
    const painted = withBase(scene.lights);
    const lights = this.current.lights.map((l) => painted.find((p) => p.id === l.id) ?? l);
    this.emit('power', args, { ...this.current, lights, atmosphere: { ...scene.defaults, weather, weatherLevel } }, duration, src);
    return this.applied('power back');
  }

  applyPreset(a: { name: string; duration?: number }, src: Source): Result {
    const scene = this.scene();
    const preset = scene.presets[a.name];
    if (!preset) {
      const names = Object.keys(scene.presets).join(', ') || 'none';
      return { ok: false, error: `unknown mood '${a.name}'; available: ${names}` };
    }

    const args: Record<string, unknown> = { name: a.name };
    const notes: string[] = [];
    const duration = this.clampDuration(a.duration, args, notes);

    // City weather (spec §3): only a weather mood changes the weather; any other keeps the room's (the city's).
    const { weather: _w, weatherLevel: _l, ...keepsWeather } = preset;
    const nextState: RoomState = applyPresetTo(this.current, WEATHER_MOODS.includes(a.name) ? preset : keepsWeather);

    this.emit('apply_mood', args, nextState, duration, src);
    const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';
    return this.applied(`mood → ${a.name}${suffix}`);
  }
}
