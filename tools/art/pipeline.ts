import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SceneRegistry } from '../../server/src/scenes';
import { isFlat } from '../../shared/frame';
import type { Hex, SceneDef } from '../../shared/types';
import { cached } from './cache';
import { depthToPng, transformersDepth, type DepthEstimator } from './depth';
import { buildRoom } from './core';
import { GlowLock } from './glow';
import { buildGuide, computeBand } from './guide';
import { writePng } from './image';
import { buildSceneJson, installBuild, promoteScene, sceneSoundFiles } from './install';
import { loadMaster } from './master';
import { loadArtSpec, readSpecPack, type ArtSpec } from './spec';

export const BUILD_STEPS = ['depth', 'split', 'fill', 'pixel', 'glow', 'install'] as const;
export type Step = (typeof BUILD_STEPS)[number];

interface Common {
  scene: string;
  /** Project root (defaults to the current directory). */
  root?: string;
  log?: (msg: string) => void;
}

const PALETTE_FILE = fileURLToPath(new URL('../palette.json', import.meta.url));

function paths(root: string, scene: string) {
  const work = path.join(root, 'art', 'work', scene);
  const spec = path.join(root, 'art', 'scenes', `${scene}.md`);
  return {
    scenesDir: path.join(root, 'scenes', fs.existsSync(spec) ? readSpecPack(spec) : 'karasu'),
    work,
    style: path.join(root, 'art', 'style.md'),
    spec,
    master: path.join(work, 'master.png'),
    lock: path.join(root, 'art', 'scenes', `${scene}.glow-lock.json`),
  };
}

async function loadSource(root: string, scene: string): Promise<{ source: SceneDef; spec: ArtSpec }> {
  const p = paths(root, scene);
  const { registry } = await SceneRegistry.load(p.scenesDir);
  const source = registry.get(scene);
  if (!source) throw new Error(`unknown scene '${scene}'; available: ${registry.list().map((s) => s.id).join(', ')}`);
  if (isFlat(source.resolution)) throw new Error(`'${scene}' is a flat room; rebuild it in Scene Studio`);
  if (!fs.existsSync(p.spec)) throw new Error(`no art spec at ${p.spec}`);
  return { source, spec: loadArtSpec(p.spec, source) };
}

/** Stage `guide`: writes guide.png, prompt.txt and guide.json for the ChatGPT handoff. */
export async function runGuide(opts: Common): Promise<void> {
  const root = opts.root ?? process.cwd();
  const log = opts.log ?? console.log;
  const p = paths(root, opts.scene);
  const { source, spec } = await loadSource(root, opts.scene);
  const { guide, band, prompt } = buildGuide(path.join(p.scenesDir, source.id), source, spec, fs.readFileSync(p.style, 'utf8'));
  fs.mkdirSync(p.work, { recursive: true });
  writePng(path.join(p.work, 'guide.png'), guide);
  fs.writeFileSync(path.join(p.work, 'prompt.txt'), prompt);
  fs.writeFileSync(path.join(p.work, 'guide.json'), JSON.stringify(band, null, 2));
  log(`wrote ${path.relative(root, p.work)}/guide.png and prompt.txt
next: in ChatGPT, upload guide.png, paste prompt.txt, then save the image you like as ${path.relative(root, p.master)}
then: npm run art -- ${opts.scene} --stage build`);
}

/** Stage `build`: master → depth → split → fill → pixel → glow → install. */
export async function runBuild(
  opts: Common & { from?: Step; force?: boolean; overwriteGlow?: boolean; depth?: DepthEstimator },
): Promise<void> {
  const root = opts.root ?? process.cwd();
  const log = opts.log ?? console.log;
  const p = paths(root, opts.scene);
  const { source, spec } = await loadSource(root, opts.scene);
  const band = computeBand(source, spec.bandShift);
  const img = loadMaster(p.master, band);

  // depth — the only slow step, so the only cached one.
  const forceDepth = Boolean(opts.force) || opts.from === 'depth';
  const estimator = opts.depth ?? transformersDepth();
  const depthBuf = await cached(p.work, 'depth', [fs.readFileSync(p.master), band], async () => {
    log('depth: running Depth Anything V2 (first run downloads the model)…');
    const d = await estimator(img);
    return Buffer.from(d.buffer, d.byteOffset, d.byteLength);
  }, { force: forceDepth });
  const depth = new Float32Array(depthBuf.buffer.slice(depthBuf.byteOffset, depthBuf.byteOffset + depthBuf.byteLength));
  writePng(path.join(p.work, 'depth.png'), depthToPng(depth, img.w, img.h));

  const palette = JSON.parse(fs.readFileSync(PALETTE_FILE, 'utf8')) as Hex[];
  const { layers: built } = buildRoom({ band: img, bandInfo: band, layers: source.layers, spec, depth, palette });
  for (const layer of built) {
    writePng(path.join(p.work, `layer-${layer.def.id}.png`), layer.img);
    writePng(path.join(p.work, `glow-preview-${layer.def.id}.png`), layer.glowPreview);
  }

  // install
  const lock = new GlowLock(p.lock);
  const { errors, generated } = await installBuild({
    scenesDir: p.scenesDir,
    stagingDir: path.join(p.work, '.install'),
    target: spec.target,
    built,
    sceneJson: (defs) => buildSceneJson(source, spec, defs),
    extraFiles: sceneSoundFiles(source, path.join(p.scenesDir, source.id)),
    lock,
    overwriteGlow: Boolean(opts.overwriteGlow),
    glowLights: Object.keys(spec.glow.lights),
    lightIds: source.lights.map((l) => l.id),
    // A rebuild drops maps an earlier build generated that this one no longer makes (a light whose box
    // moved or went); only hand-made maps carry over.
    dropStaleGenerated: true,
    log,
  });
  if (errors.length > 0) {
    throw new Error(`install failed; scenes/ left untouched:\n  ${errors.join('\n  ')}`);
  }
  for (const [name, bytes] of generated) lock.record(`${spec.target}/${name}`, bytes);
  lock.save();
  log(`installed scenes/${spec.target} — restart the dev server, then switch to it in the dev panel to compare`);
}

/** `--promote`: the art scene replaces the original (the old one is moved into art/work, not deleted). */
export function runPromote(opts: Common & { target: string }): void {
  const root = opts.root ?? process.cwd();
  const p = paths(root, opts.scene);
  const { replacedTo } = promoteScene(p.scenesDir, p.work, opts.scene, opts.target);
  (opts.log ?? console.log)(`promoted scenes/${opts.target} → scenes/${opts.scene}; previous version moved to ${path.relative(root, replacedTo)}`);
}
