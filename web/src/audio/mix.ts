import { sceneDir } from '../scene-paths';
import type { RoomState, SceneDef } from '../../../shared/types';
import { idSeed } from '../renderer/glow-alpha';

/** One neon/electric light's buzz. `level` is before the per-frame flicker crackle. */
export interface NeonVoice {
  id: string;
  level: number;
  flicker: number;
  seed: number;
  pan: number;
}

/** What the room should sound like right now: target levels per voice (0..1) and a few settings. */
export interface Mix {
  /** `heavy` 0..1 blends the recorded rain from the light loop to the heavy one. */
  rain: { level: number; indoor: boolean; heavy: number };
  /** `gust` 0..1 is how strongly the wind sweeps; `crackle` 0..1 adds ash crackle. */
  wind: { level: number; gust: number; crackle: number; indoor: boolean };
  /** `fallback` is the hum to play if the scene's bed fails to load. */
  hum: { level: number; fallback: number };
  bed: { url: string; level: number } | null;
  neon: NeonVoice[];
  /** High-shelf cut from fog, in dB (0 to −9). */
  fogDb: number;
}

export const SILENT: Mix = {
  rain: { level: 0, indoor: false, heavy: 0 },
  wind: { level: 0, gust: 0.3, crackle: 0, indoor: false },
  hum: { level: 0, fallback: 0.3 },
  bed: null,
  neon: [],
  fogDb: 0,
};

const OUTDOOR_WIND_FLOOR = 0.15;
const INDOOR_RAIN = 0.6;
const INDOOR_WIND = 0.3;
const NEON_LEVEL = 0.12;
const NEON_CAP = 8;
const FOG_DB = -9;
const BED_LEVEL = 0.5;
const HUM_FALLBACK = 0.3;

/** A place's song plays under the room at this level (× the MUSIC slider) unless the scene says otherwise. */
export const SCENE_MUSIC_LEVEL = 0.3;
/** Scene songs never cut: a change (or a restore) fades over at least this long. */
export const SCENE_MUSIC_FADE_SECONDS = 1.2;

/** A song's url in the pack's `_music/` folder. */
export function songUrl(base: string, song: string): string {
  return `${base}_music/${encodeURIComponent(song)}`;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The room's sound, from its state alone: weather sets rain and wind, the scene sets indoor
 * muffling, room tone (synthesized hum or a recorded bed) and which lights buzz, fog dulls the
 * highs. Pure — the engine glides to whatever this returns.
 */
export function soundMix(state: RoomState, scene: SceneDef, base: string): Mix {
  const sound = scene.sound ?? {};
  const indoor = sound.indoor === true;
  const { weather, weatherLevel, fog } = state.atmosphere;

  const rainLevel = weather === 'rain' ? weatherLevel ** 0.8 * (indoor ? INDOOR_RAIN : 1) : 0;

  const weatherWind = weather === 'dust' ? weatherLevel : weather === 'snow' ? 0.3 * weatherLevel : weather === 'ash' ? 0.4 * weatherLevel : 0;
  const windLevel = indoor ? INDOOR_WIND * weatherWind : Math.max(OUTDOOR_WIND_FLOOR, weatherWind);

  const bed = sound.bed ? { url: `${sceneDir(scene, base)}${sound.bed.src}`, level: sound.bed.level ?? BED_LEVEL } : null;
  const hum = sound.hum ?? 0;

  const tagged = new Set(scene.lights.filter((l) => l.sound === 'neon').map((l) => l.id));
  const width = scene.resolution[0] || 1;
  const neon = state.lights
    .filter((l) => tagged.has(l.id))
    .slice(0, NEON_CAP)
    .map((l) => ({
      id: l.id,
      level: NEON_LEVEL * l.intensity,
      flicker: l.flicker,
      seed: idSeed(l.id),
      pan: (l.pos[0] / width) * 1.2 - 0.6,
    }));

  return {
    rain: { level: rainLevel, indoor, heavy: weather === 'rain' ? smoothstep(0.3, 0.8, weatherLevel) : 0 },
    wind: { level: windLevel, gust: weather === 'dust' ? 1 : 0.3, crackle: weather === 'ash' ? weatherLevel : 0, indoor },
    hum: { level: bed ? 0 : hum, fallback: hum || HUM_FALLBACK },
    bed,
    neon,
    fogDb: FOG_DB * fog,
  };
}
