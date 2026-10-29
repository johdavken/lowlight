import fs from 'node:fs';
import path from 'node:path';
import { SceneRegistry } from '../../server/src/scenes';
import type { LayerDef, SceneDef } from '../../shared/types';
import { PNG } from 'pngjs';
import type { BuiltLayer } from './core';
import type { GlowLock } from './glow';
import { toPNG, writePng, type Img } from './image';
import type { ArtSpec } from './spec';

/** A layer as installed: its def plus the glow-map files scene.json names. */
export interface InstalledLayer {
  def: LayerDef;
  emissive?: string;
  emissiveLights?: Record<string, string>;
}

const ART_SUFFIX = ' (art)';

/** The installed scene's scene.json: the source scene's lights/presets/defaults with the new layers. */
export function buildSceneJson(
  source: SceneDef,
  spec: ArtSpec,
  layers: InstalledLayer[],
): SceneDef {
  // An art spec's rectangle (480 px) wins; otherwise the source's own shapes carry over.
  const weather = spec.weatherRegion ? { weatherRegion: spec.weatherRegion } : source.weatherArea ? { weatherArea: source.weatherArea } : {};
  return {
    id: spec.target,
    name: `${source.name}${ART_SUFFIX}`,
    description: source.description,
    resolution: source.resolution,
    layers: layers.map(({ def, emissive, emissiveLights }) => ({
      id: def.id,
      src: def.src,
      parallax: def.parallax,
      ...(emissive ? { emissive } : {}),
      ...(emissiveLights && Object.keys(emissiveLights).length > 0 ? { emissiveLights } : {}),
    })),
    lights: source.lights,
    defaults: source.defaults,
    presets: source.presets,
    ...weather,
    // New art keeps how the room sounds: indoor rain, its bed, its hum and its song.
    ...(source.sound ? { sound: structuredClone(source.sound) } : {}),
  };
}

/** The room's own sound files (its bed and its one-off sounds) still in the source scene folder, for `extraFiles`. */
export function sceneSoundFiles(source: SceneDef, sourceDir: string): Record<string, Buffer> {
  const out: Record<string, Buffer> = {};
  for (const src of [source.sound?.bed?.src, ...(source.sound?.sounds ?? []).map((s) => s.src)]) {
    if (!src || out[src]) continue;
    const file = path.join(sourceDir, src);
    if (fs.existsSync(file)) out[src] = fs.readFileSync(file);
  }
  return out;
}

/**
 * Writes the scene into a staging folder, validates it with the same SceneRegistry the server
 * uses, and only then swaps it into `scenesDir/<target>`. Returns the registry errors (empty = ok);
 * on any error `scenesDir` is left untouched.
 */
export async function installScene(
  scenesDir: string,
  stagingDir: string,
  target: string,
  files: Record<string, Img | Buffer>,
  sceneJson: SceneDef,
): Promise<string[]> {
  fs.rmSync(stagingDir, { recursive: true, force: true });
  const staged = path.join(stagingDir, target);
  fs.mkdirSync(staged, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    const file = path.join(staged, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (Buffer.isBuffer(data)) fs.writeFileSync(file, data);
    else writePng(file, data);
  }
  fs.writeFileSync(path.join(staged, 'scene.json'), `${JSON.stringify(sceneJson, null, 2)}\n`);
  // A scene's song lives in the pack's `_music/`, so validate against the real pack's songs. Only
  // `staged` moves into the pack, so this link is never installed.
  const music = path.join(scenesDir, '_music');
  if (fs.existsSync(music)) fs.symlinkSync(path.resolve(music), path.join(stagingDir, '_music'), 'dir');

  let errors: string[];
  try {
    errors = (await SceneRegistry.load(stagingDir)).errors;
  } catch (err) {
    errors = [err instanceof Error ? err.message : String(err)];
  }
  if (errors.length > 0) return errors;

  const dest = path.join(scenesDir, target);
  const old = path.join(stagingDir, `${target}.previous`);
  if (fs.existsSync(dest)) fs.renameSync(dest, old);
  fs.renameSync(staged, dest);
  fs.rmSync(stagingDir, { recursive: true, force: true });
  return [];
}

/**
 * Replaces `scenes/<source>` with `scenes/<target>` (id rewritten, "(art)" dropped). The old
 * scene is moved to `<workDir>/replaced-<timestamp>/`, never deleted.
 */
export function promoteScene(scenesDir: string, workDir: string, source: string, target: string): { replacedTo: string } {
  const targetDir = path.join(scenesDir, target);
  const sourceDir = path.join(scenesDir, source);
  if (!fs.existsSync(targetDir)) throw new Error(`nothing to promote: ${targetDir} does not exist — run --stage build first`);
  fs.mkdirSync(workDir, { recursive: true });
  const replacedTo = path.join(workDir, `replaced-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  if (fs.existsSync(sourceDir)) fs.renameSync(sourceDir, replacedTo);
  fs.renameSync(targetDir, sourceDir);
  const jsonFile = path.join(sourceDir, 'scene.json');
  const json = JSON.parse(fs.readFileSync(jsonFile, 'utf8')) as SceneDef;
  json.id = source;
  if (json.name.endsWith(ART_SUFFIX)) json.name = json.name.slice(0, -ART_SUFFIX.length);
  fs.writeFileSync(jsonFile, `${JSON.stringify(json, null, 2)}\n`);
  return { replacedTo };
}

/**
 * Installs a built room into `scenesDir/<target>`: layers, glow maps (keeping hand-edited ones
 * unless `overwriteGlow`, and carrying over installed maps this build no longer produces) and
 * `sceneJson(layers)`. Validates before touching `scenesDir`. Returns the registry errors (empty =
 * installed) and the generated glow-map bytes, for the caller to record in the glow lock.
 */
export async function installBuild(opts: {
  scenesDir: string;
  stagingDir: string;
  target: string;
  built: BuiltLayer[];
  sceneJson: (layers: InstalledLayer[]) => SceneDef;
  lock: GlowLock;
  overwriteGlow: boolean;
  /** Lights with a glow box (their per-light maps are placed). */
  glowLights: string[];
  /** All the scene's light ids (carried-over maps may belong to any of them). */
  lightIds: string[];
  /** Other files the room needs (a sound bed), by file name. */
  extraFiles?: Record<string, Buffer>;
  /** The lock keys a map may have been generated under (default `<target>/<name>`). */
  lockKeys?: (name: string) => string[];
  /**
   * Re-art: installed maps a build generated but this one doesn't produce are dropped instead of
   * carried over (only hand-made ones carry over; none at all with `overwriteGlow`).
   */
  dropStaleGenerated?: boolean;
  log: (m: string) => void;
}): Promise<{ errors: string[]; generated: Map<string, Buffer>; kept: string[]; dropped: string[] }> {
  const { target, lock, log } = opts;
  const keys = opts.lockKeys ?? ((name: string) => [`${target}/${name}`]);
  const kept: string[] = [];
  const dropped: string[] = [];
  /**
   * A hand-made map that can't be shown any more: its layer is gone from this build, or it is not
   * that layer's size (made for the old art, e.g. a room converted to flat). Dropped and reported;
   * Studio has already copied the old room aside.
   */
  const misfit = (name: string, bytes: Buffer): boolean => {
    const layer = opts.built.find((l) => name.startsWith(`${l.def.id}_e`));
    const { width, height } = pngSize(bytes);
    if (layer && width === layer.img.w && height === layer.img.h) return false;
    dropped.push(name);
    log(`dropped ${name} (${layer ? `${width}×${height}; its layer is ${layer.img.w}×${layer.img.h}` : 'its layer is gone'})`);
    return true;
  };
  const targetDir = path.join(opts.scenesDir, target);
  const files: Record<string, Img | Buffer> = {};
  const generated = new Map<string, Buffer>();
  const defs: InstalledLayer[] = [];
  for (const layer of opts.built) {
    files[layer.def.src] = layer.img;
    const entry: InstalledLayer = { def: layer.def };
    const place = (name: string, map: Img | null): boolean => {
      const installed = path.join(targetDir, name);
      if (!opts.overwriteGlow && fs.existsSync(installed) && !lock.isGenerated(keys(name), installed) && !misfit(name, fs.readFileSync(installed))) {
        files[name] = fs.readFileSync(installed);
        kept.push(name);
        log(`kept hand-edited ${name} (use --overwrite-glow to replace)`);
        return true;
      }
      if (!map) return false;
      const bytes = PNG.sync.write(toPNG(map));
      files[name] = bytes;
      generated.set(name, bytes);
      return true;
    };
    if (place(`${layer.def.id}_e.png`, layer.general)) entry.emissive = `${layer.def.id}_e.png`;
    for (const id of opts.glowLights) {
      const name = `${layer.def.id}_e_${id}.png`;
      if (place(name, layer.perLight[id] ?? null)) (entry.emissiveLights ??= {})[id] = name;
    }
    defs.push(entry);
  }

  // Glow maps already installed that this build doesn't produce (painted for a light with no
  // candidates, or for a light dropped from the spec) are carried over, never silently deleted.
  if (fs.existsSync(targetDir)) {
    const lightIds = new Set(opts.lightIds);
    for (const name of fs.readdirSync(targetDir)) {
      if (!/_e(_[^.]+)?\.png$/.test(name) || name in files || dropped.includes(name)) continue;
      const installed = path.join(targetDir, name);
      if (opts.dropStaleGenerated && (opts.overwriteGlow || lock.isGenerated(keys(name), installed))) {
        log(`dropped ${name} (made for the old art; this build doesn't produce it)`);
        continue;
      }
      if (misfit(name, fs.readFileSync(installed))) continue;
      if (opts.dropStaleGenerated) kept.push(name);
      files[name] = fs.readFileSync(installed);
      const entry = defs.find((d) => name.startsWith(`${d.def.id}_e`));
      const lightId = entry ? name.slice(`${entry.def.id}_e_`.length, -'.png'.length) : '';
      if (entry && name === `${entry.def.id}_e.png`) entry.emissive = name;
      else if (entry && lightIds.has(lightId)) (entry.emissiveLights ??= {})[lightId] = name;
      log(`kept ${name} (not produced by this build)${entry && (entry.emissive === name || entry.emissiveLights?.[lightId] === name) ? '' : ' — not referenced by scene.json'}`);
    }
  }

  Object.assign(files, opts.extraFiles ?? {});
  const errors = await installScene(opts.scenesDir, opts.stagingDir, target, files, opts.sceneJson(defs));
  return { errors, generated, kept, dropped };
}

/** A PNG's size from its IHDR header (bytes 16–23), without decoding it. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
