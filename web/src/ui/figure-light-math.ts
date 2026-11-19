/**
 * The figure light's numbers (figure lighting spec §2–3): its defaults, a room's settings filled in
 * with them, the room's lamps moved from window px to stage px, and where the key light stands.
 * Pure, so the shader's inputs are tested without WebGL.
 */
import { parseHex } from '../../../shared/color';
import type { FigureLightDef } from '../../../shared/types';
import type { ScreenLights } from '../renderer';
import type { StageRect } from './game-stage';

/** The defaults, in stage px where they're distances (tuned in the spike at a 1600×900 window). */
export const FIGURE_LIGHT = {
  /** How much of the room's fog stands between her and us (she's in front of the room). */
  fogFront: 0.5,
  /** How far behind her the room's lamps stand. */
  depth: 140,
  /** How much of a lamp's colour lands on her edges turned toward it. */
  rim: 0.9,
  rimPower: 2,
  /** How much of each lamp lights her flat, as the old tint did. */
  flat: 0.75,
  /** How hard the key light shapes her. */
  keyStrength: 0.6,
  /** The automatic key's distance to her side, as a share of her width. */
  keySide: 0.9,
  /** The key's height, as a share of her height down from her top. */
  keyDrop: 0.1,
  /** The key's distance in front of her. */
  keyZ: 260,
  /** The most the multiply can brighten her. */
  ceiling: 1.6,
} as const;

export interface ResolvedKey {
  mode: 'auto' | 'manual' | 'off';
  side?: 'left' | 'right';
  /** Share of her height down from her top. */
  height: number;
  /** A colour set by hand, channels 0..1; absent: the automatic colour. */
  color?: [number, number, number];
  strength: number;
}

export interface ResolvedFigureLight {
  /** Breath fog on each out-breath (an open-air room). */
  breath: boolean;
  depth: number;
  rim: number;
  key: ResolvedKey;
}

/** A room's `figureLight`, every field filled in. */
export function resolveFigureLight(def: FigureLightDef | undefined): ResolvedFigureLight {
  const key = def?.key ?? 'auto';
  const base = { breath: def?.breath ?? false, depth: def?.depth ?? FIGURE_LIGHT.depth, rim: def?.rim ?? FIGURE_LIGHT.rim };
  if (key === 'off') return { ...base, key: { mode: 'off', height: FIGURE_LIGHT.keyDrop, strength: 0 } };
  if (key === 'auto') return { ...base, key: { mode: 'auto', height: FIGURE_LIGHT.keyDrop, strength: def?.keyStrength ?? FIGURE_LIGHT.keyStrength } };
  const color = key.color ? parseHex(key.color) : null;
  return { ...base, key: { mode: 'manual', side: key.side, height: key.height, ...(color ? { color } : {}), strength: key.strength } };
}

/** The renderer's lamps (window px) in stage px: off the bars beside the stage, and the stage's zoom undone. */
export function toStage(sl: ScreenLights, rect: StageRect): ScreenLights {
  return {
    ambient: sl.ambient,
    lights: sl.lights.map((l) => ({ ...l, pos: [(l.pos[0] - rect.left) / rect.scale, (l.pos[1] - rect.top) / rect.scale], radius: l.radius / rect.scale })),
  };
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The key light for a figure at `box` (stage px): where it stands, its colour (brightest channel 1)
 * and how hard it shapes her. Automatic: the lamps reaching her chest, weighted by how much of each
 * reaches it, give its colour and its side (right when none does). Set by hand: its side and height,
 * and its own colour or the automatic one.
 */
export function keyLight(sl: ScreenLights, box: Box, key: ResolvedKey): { pos: [number, number]; hue: [number, number, number]; strength: number } {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height * 0.3;
  const sum: [number, number, number] = [0, 0, 0];
  let side = 0;
  for (const l of sl.lights) {
    const t = Math.min(1, Math.hypot(l.pos[0] - cx, l.pos[1] - cy) / l.radius);
    const f = (1 - t * t * (3 - 2 * t)) ** 2;
    if (f <= 0) continue;
    for (let c = 0; c < 3; c++) sum[c] += l.rgb[c] * f;
    side += (l.pos[0] - cx) * f * (l.rgb[0] + l.rgb[1] + l.rgb[2]);
  }
  const peak = Math.max(sum[0], sum[1], sum[2]);
  const auto: [number, number, number] = peak > 0 ? [sum[0] / peak, sum[1] / peak, sum[2] / peak] : [1, 1, 1];
  const dir = key.mode === 'manual' ? (key.side === 'left' ? -1 : 1) : side < 0 ? -1 : 1;
  return {
    pos: [cx + dir * FIGURE_LIGHT.keySide * box.width, box.top + key.height * box.height],
    hue: key.color ?? auto,
    strength: key.strength,
  };
}
