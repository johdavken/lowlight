import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import type { SceneDef } from '../../shared/types';
import { sceneSchema } from '../../shared/scene-schema';

export { sceneSchema };

type PngCheck =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'wrong-size'; width: number; height: number }
  | { kind: 'ok'; width: number; height: number };

/**
 * Read a PNG at `filePath` and check it against `expected` size. `allowWiderSameHeight` permits a
 * file that is wider than expected as long as the height matches exactly (used for parallax layers).
 * A missing file and a corrupt/non-PNG file are reported as distinct, non-throwing outcomes.
 */
function checkPngAgainst(
  filePath: string,
  expected: { width: number; height: number },
  allowWiderSameHeight: boolean,
): PngCheck {
  if (!fs.existsSync(filePath)) return { kind: 'missing' };

  let png: PNG;
  try {
    png = PNG.sync.read(fs.readFileSync(filePath));
  } catch {
    return { kind: 'invalid' };
  }

  const { width, height } = png;
  const sameSize = width === expected.width && height === expected.height;
  const wider = allowWiderSameHeight && width >= expected.width && height === expected.height;
  if (!sameSize && !wider) return { kind: 'wrong-size', width, height };
  return { kind: 'ok', width, height };
}

/**
 * Load, validate and register scenes from folders under `dir`. Each folder must contain a
 * `scene.json` plus the layer PNGs it references. Folders starting with `_` are ignored.
 */
/** True if `rel` is a relative path that resolves to somewhere inside `dir`. */
function insideDir(dir: string, rel: string): boolean {
  if (path.isAbsolute(rel) || path.win32.isAbsolute(rel)) return false;
  const fromDir = path.relative(dir, path.resolve(dir, rel));
  return fromDir !== '' && fromDir !== '..' && !fromDir.startsWith(`..${path.sep}`) && !path.isAbsolute(fromDir);
}

/** A bare file name: not empty, no directory parts, not `.` or `..` (dots inside a name are fine). */
function isPlainFileName(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..' && !/[/\\]/.test(name) && !path.isAbsolute(name);
}

export class SceneRegistry {
  private readonly scenes = new Map<string, SceneDef>();

  /** A district with no rooms (yet): nothing to list. */
  static empty(): SceneRegistry {
    return new SceneRegistry();
  }

  static async load(dir: string): Promise<{ registry: SceneRegistry; errors: string[] }> {
    const registry = new SceneRegistry();
    const errors: string[] = [];

    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('_'))
      .map((e) => e.name)
      .sort();

    for (const folder of entries) {
      const sceneDir = path.join(dir, folder);
      const scenePath = path.join(sceneDir, 'scene.json');

      if (!fs.existsSync(scenePath)) {
        errors.push(`scene '${folder}': missing scene.json`);
        continue;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(scenePath, 'utf-8'));
      } catch (err) {
        errors.push(`scene '${folder}': invalid JSON (${(err as Error).message})`);
        continue;
      }

      const result = sceneSchema.safeParse(raw);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const at = issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
          errors.push(`scene '${folder}': ${issue.message}${at}`);
        }
        continue;
      }

      const scene: SceneDef = result.data;
      // Venue hours that didn't read (story moods spec §5) were dropped by the schema: the room loads without them.
      if (scene.hours === undefined && typeof raw === 'object' && raw !== null && 'hours' in raw) errors.push(`scene '${folder}': hours ignored: open and close must be HH:MM`);

      if (scene.id !== folder) {
        errors.push(`scene '${folder}': id '${scene.id}' does not match folder name`);
        continue;
      }

      const lightIds = new Set(scene.lights.map((l) => l.id));
      let hasBlockingError = false;
      for (const [presetId, preset] of Object.entries(scene.presets)) {
        for (const lightId of Object.keys(preset.lights ?? {})) {
          if (!lightIds.has(lightId)) {
            errors.push(
              `scene '${folder}': preset '${presetId}' references unknown light '${lightId}'`,
            );
            hasBlockingError = true;
          }
        }
      }
      if (hasBlockingError) continue;

      // Layer files must stay inside the scene folder: no absolute paths, nothing climbing out
      // via `..` (scene folders may later be written by Nix herself). The same goes for a sound bed.
      if (scene.sound?.bed && !insideDir(sceneDir, scene.sound.bed.src)) {
        errors.push(`scene '${folder}': sound bed '${scene.sound.bed.src}' points outside the scene folder`);
        hasBlockingError = true;
      }
      for (const s of scene.sound?.sounds ?? []) {
        if (!insideDir(sceneDir, s.src)) {
          errors.push(`scene '${folder}': sound '${s.name}' points outside the scene folder`);
          hasBlockingError = true;
        }
      }
      // Songs are shared by the pack: plain file names in `<pack>/_music/`.
      for (const song of scene.sound?.music?.songs ?? []) {
        if (!isPlainFileName(song)) {
          errors.push(`scene '${folder}': music '${song}' must be a file name in the pack's _music folder`);
          hasBlockingError = true;
        } else if (!fs.existsSync(path.join(dir, '_music', song))) {
          errors.push(`scene '${folder}': music '${song}' is not in ${path.join(dir, '_music')}`);
          hasBlockingError = true;
        }
      }
      for (const layer of scene.layers) {
        const paths: [string, string | undefined][] = [
          ['src', layer.src],
          ['emissive', layer.emissive],
          ...Object.entries(layer.emissiveLights ?? {}).map(([id, p]): [string, string] => [`emissiveLights.${id}`, p]),
        ];
        for (const [kind, p] of paths) {
          if (p !== undefined && !insideDir(sceneDir, p)) {
            errors.push(`scene '${folder}': layer '${layer.id}' ${kind} '${p}' points outside the scene folder`);
            hasBlockingError = true;
          }
        }
        for (const id of Object.keys(layer.emissiveLights ?? {})) {
          if (!lightIds.has(id)) {
            errors.push(`scene '${folder}': layer '${layer.id}' emissiveLights references unknown light '${id}'`);
            hasBlockingError = true;
          }
        }
      }
      if (hasBlockingError) continue;

      const [resWidth, resHeight] = scene.resolution;
      for (const layer of scene.layers) {
        const layerPath = path.join(sceneDir, layer.src);
        const expectedLayerSize = { width: resWidth, height: resHeight };
        const layerCheck = checkPngAgainst(layerPath, expectedLayerSize, layer.parallax > 0);

        let layerSize: { width: number; height: number } | undefined;
        switch (layerCheck.kind) {
          case 'missing':
            errors.push(`scene '${folder}': missing layer file '${layer.src}'`);
            break;
          case 'invalid':
            errors.push(`scene '${folder}': layer '${layer.id}' is not a valid PNG`);
            hasBlockingError = true;
            break;
          case 'wrong-size':
            errors.push(
              `scene '${folder}': layer '${layer.id}' is ${layerCheck.width}x${layerCheck.height}, expected ${resWidth}x${resHeight}`,
            );
            hasBlockingError = true;
            break;
          case 'ok':
            layerSize = { width: layerCheck.width, height: layerCheck.height };
            break;
        }

        // Glow maps (the general one and any per-light ones) must match their layer's actual size
        // when known, otherwise the scene's resolution (e.g. when the layer file itself is missing).
        const expectedEmissiveSize = layerSize ?? expectedLayerSize;
        const glowFiles = [layer.emissive, ...Object.values(layer.emissiveLights ?? {})].filter(
          (f): f is string => f !== undefined,
        );
        for (const file of glowFiles) {
          const emissiveCheck = checkPngAgainst(path.join(sceneDir, file), expectedEmissiveSize, false);
          switch (emissiveCheck.kind) {
            case 'missing':
              errors.push(`scene '${folder}': missing layer file '${file}'`);
              break;
            case 'invalid':
              errors.push(`scene '${folder}': emissive '${file}' is not a valid PNG`);
              hasBlockingError = true;
              break;
            case 'wrong-size':
              errors.push(
                `scene '${folder}': emissive '${file}' is ${emissiveCheck.width}x${emissiveCheck.height}, expected ${expectedEmissiveSize.width}x${expectedEmissiveSize.height}`,
              );
              hasBlockingError = true;
              break;
            case 'ok':
              break;
          }
        }
      }
      if (hasBlockingError) continue;

      registry.scenes.set(scene.id, scene);
    }

    if (registry.scenes.size === 0) {
      // Say why: with a single scene (an install's staging folder) its errors are the whole story.
      throw new Error(`no valid scenes in ${dir}${errors.length > 0 ? `:\n  ${errors.join('\n  ')}` : ''}`);
    }

    return { registry, errors };
  }

  get(id: string): SceneDef | undefined {
    return this.scenes.get(id);
  }

  list(): SceneDef[] {
    return [...this.scenes.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  first(): SceneDef {
    const [scene] = this.list();
    if (!scene) throw new Error('SceneRegistry has no scenes');
    return scene;
  }
}

/** Loads every scene pack (each subfolder of `scenesDir` not starting with `_` or `.`). */
export async function loadPacks(scenesDir: string): Promise<Map<string, { registry: SceneRegistry; errors: string[] }>> {
  const packs = new Map<string, { registry: SceneRegistry; errors: string[] }>();
  if (!fs.existsSync(scenesDir)) return packs;
  for (const entry of fs.readdirSync(scenesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    // One district with no valid rooms (a new folder, a broken scene) never takes the others down: it's reported.
    try {
      packs.set(entry.name, await SceneRegistry.load(path.join(scenesDir, entry.name)));
    } catch (err) {
      packs.set(entry.name, { registry: SceneRegistry.empty(), errors: [(err as Error).message] });
    }
  }
  return packs;
}
