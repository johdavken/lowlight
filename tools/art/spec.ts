import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { SceneDef } from '../../shared/types';
import type { BuildSpec, Rect } from './core';

export type { Rect } from './core';

/** An art spec file: which scene it re-arts, where it installs, the brief, and the build settings. */
export interface ArtSpec extends BuildSpec {
  /** Scene pack the source and target scenes live in (`scenes/<pack>/`). */
  pack: string;
  scene: string;
  target: string;
  brief: string;
  /** Master rows to move the scene band down (+) or up (−) from the guide's centered band. */
  bandShift: number;
}

const FRAME_W = 480;
const FRAME_H = 270;
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

const rect = z
  .tuple([z.number().int(), z.number().int(), z.number().int().positive(), z.number().int().positive()])
  .refine(([x, y, w, h]) => x >= 0 && y >= 0 && x + w <= FRAME_W && y + h <= FRAME_H, {
    message: `rect must lie inside the ${FRAME_W}×${FRAME_H} frame`,
  });
const unit = z.number().min(0).max(1);

const schema = z.object({
  pack: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).default('karasu'),
  scene: z.string().min(1),
  target: z.string().min(1),
  depth: z.object({
    backFartherThan: unit,
    fgNearerThan: unit,
    skyFartherThan: unit.optional(),
    force: z.array(z.object({ layer: z.string().min(1), rect, minDepth: unit.optional(), maxDepth: unit.optional() })).default([]),
  }),
  bandShift: z.number().int().default(0),
  minSpeckPx: z.number().int().nonnegative().default(24),
  glow: z.object({ minLuma: unit, minChroma: z.number().min(0), lights: z.record(z.string(), rect).default({}) }),
  weatherRegion: rect.optional(),
});

/** Parses an art spec document (YAML front matter + free-text brief) against its source scene. */
export function parseArtSpec(text: string, sourceScene: SceneDef): ArtSpec {
  const m = FRONT_MATTER.exec(text);
  if (!m) throw new Error('art spec: missing YAML front matter (--- … ---) at the top of the file');
  const result = schema.safeParse(parseYaml(m[1]));
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`art spec: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  const spec = { ...result.data, brief: m[2].trim() } as ArtSpec;
  if (spec.depth.backFartherThan <= spec.depth.fgNearerThan) {
    throw new Error('art spec: depth: backFartherThan must be greater than fgNearerThan');
  }
  if (spec.depth.skyFartherThan !== undefined && spec.depth.skyFartherThan <= spec.depth.backFartherThan) {
    throw new Error('art spec: depth: skyFartherThan must be greater than backFartherThan');
  }
  if (spec.target === spec.scene) throw new Error('art spec: target: must differ from scene');
  const lightIds = new Set(sourceScene.lights.map((l) => l.id));
  for (const id of Object.keys(spec.glow.lights)) {
    if (!lightIds.has(id)) {
      throw new Error(`art spec: glow.lights.${id}: unknown light; available: ${[...lightIds].join(', ')}`);
    }
  }
  return spec;
}

export function loadArtSpec(file: string, sourceScene: SceneDef): ArtSpec {
  return parseArtSpec(fs.readFileSync(file, 'utf8'), sourceScene);
}

/** The `pack:` field of an art spec file, read before its source scene is known (default karasu). */
export function readSpecPack(file: string): string {
  const m = FRONT_MATTER.exec(fs.readFileSync(file, 'utf8'));
  const pack = m ? (parseYaml(m[1]) as { pack?: unknown } | null)?.pack : undefined;
  return typeof pack === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(pack) ? pack : 'karasu';
}
