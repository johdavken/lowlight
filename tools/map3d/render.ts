// npm run map-render [--all] [--only <scale>]: renders the city map from data (spec 2026-10-25 §3).
// Generates the city, works out which tiles changed, has Blender (headless Eevee) render those with a margin, crops them to
// 512 px WebP under web/public/map/tiles/, and writes the manifest (tiles.json) and the lit windows (windows.json).
// At 1×–4× each tile also gets a lights-off copy (tiles-dark/) and its district mask (tiles-mask/) for blackouts (spec 2026-10-27).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { MAP_H, MAP_W } from '../../shared/map-projection';
import { tileGrid, tileRect, TILE, type TileManifest } from '../../shared/map-tiles';
import { generate } from './generate';
import { cropMask, cropTile, currentLevels, darkLevels, outputsExist, passesFor, planJobs, staleTiles, unrendered, type TileDir } from './jobs';
import { loadCity } from './load';
import { fingerprints, tilesNeeded } from './tiles';
import { currentDataHash, pixelVersion, renderVersions } from './versions';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const out = path.join(root, 'tools', 'map3d', 'out');
const pub = path.join(root, 'web', 'public', 'map');
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const blender = process.env.BLENDER ?? 'blender';

const city = loadCity(root);
const versionLine = spawnSync(blender, ['--version'], { encoding: 'utf8' }).stdout?.split('\n')[0] ?? '';
if (!versionLine) {
  console.error(`Blender not found (${blender}). Set BLENDER to its path.`);
  process.exit(1);
}
const blenderVersion = /Blender (\S+)/.exec(versionLine)?.[1] ?? versionLine;
let all = process.argv.includes('--all');
if (!blenderVersion.startsWith(city.render.blender)) {
  console.warn(`Blender ${blenderVersion}, not ${city.render.blender}: the render may look different, so every tile renders again.`);
  all = true;
}
const only = arg('only') ? Number(arg('only')) : null;

console.log('Generating the city…');
const { geometry, windows, deepAreas } = generate(city);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'geometry.json'), JSON.stringify(geometry));
fs.writeFileSync(path.join(out, 'render.json'), JSON.stringify(city.render));

const deep = city.map.districts.filter((d) => city.styles[d.id]?.deepZoom && d.border).map((d) => d.border!);
if (only !== null && !city.render.levels.includes(only)) {
  console.error(`--only ${arg('only')}: the levels are ${city.render.levels.join(', ')}.`);
  process.exit(1);
}
const allNeeded = tilesNeeded(city.render, deep, deepAreas);
const v = renderVersions(root);
// Every level's prints (so the manifest only lists levels rendered from the current data); this run renders `only`'s.
const allPrints = fingerprints(geometry, city.render, allNeeded, `${v.render}:${pixelVersion(root)}:${blenderVersion}`);
const prints = new Map([...allPrints].filter(([k]) => only === null || k.startsWith(`${only}/`)));
const printsFile = path.join(out, 'prints.json');
const prev = fs.existsSync(printsFile) ? (JSON.parse(fs.readFileSync(printsFile, 'utf8')) as Record<string, string>) : {};
const tileFile = (key: string, dir: TileDir = 'tiles') => path.join(pub, dir, ...key.split('/')) + (dir === 'tiles-mask' ? '.png' : '.webp');
const has = (dir: TileDir, key: string) => fs.existsSync(tileFile(key, dir));
const plan = planJobs(prints, prev, all, (k) => outputsExist(k, has));
console.log(`${prints.size} tiles: ${plan.render.length} to render, ${plan.keep.length} unchanged.`);

const m = city.render.margin;
const jobs = plan.render.map((k) => {
  const [s, key] = k.split('/') as [string, string];
  const scale = Number(s);
  const [c, r] = key.split('_').map(Number) as [number, number];
  const rect = tileRect(scale, c, r);
  return { id: k, cx: ((rect.x + rect.w / 2) / 100) * MAP_W, cy: ((rect.y + rect.h / 2) / 100) * MAP_H, size: (TILE + 2 * m) / scale, px: TILE + 2 * m, passes: passesFor(scale) };
});
fs.writeFileSync(path.join(out, 'jobs.json'), JSON.stringify(jobs));

const lines: string[] = [];
if (jobs.length) {
  // A PNG left from an earlier run must never stand in for one this run didn't make.
  for (const j of jobs) for (const dir of ['png', 'png-dark', 'png-mask']) fs.rmSync(path.join(out, dir, ...j.id.split('/')) + '.png', { force: true });
  const t0 = Date.now();
  await new Promise<void>((resolve, reject) => {
    const p = spawn(blender, ['-b', '--factory-startup', '--python-exit-code', '1', '-P', path.join(root, 'tools', 'map3d', 'blender', 'render.py'), '--', out], { stdio: ['ignore', 'pipe', 'pipe'] });
    let done = 0;
    let tail = '';
    p.stdout.on('data', (b: Buffer) => {
      const text = b.toString();
      tail = (tail + text).slice(-4000);
      for (const line of text.split('\n')) {
        lines.push(line);
        if (line.startsWith('TILE ')) {
          done++;
          if (done % 25 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length} tiles (${Math.round((Date.now() - t0) / 1000)} s)`);
        } else if (line.startsWith('NOTE ')) console.log(`  ${line.slice(5)}`);
      }
    });
    p.stderr.on('data', (b: Buffer) => (tail = (tail + b.toString()).slice(-4000)));
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Blender exited ${code}\n${tail}`))));
  });
  const lost = unrendered(jobs.map((j) => j.id), lines);
  if (lost.length) {
    console.error(`Blender didn't render ${lost.length} tiles (e.g. ${lost.slice(0, 5).join(', ')}); nothing was changed.`);
    process.exit(1);
  }
  for (const j of jobs) {
    const png = path.join(out, 'png', ...j.id.split('/')) + '.png';
    if (!fs.existsSync(png)) continue;
    fs.mkdirSync(path.dirname(tileFile(j.id)), { recursive: true });
    fs.writeFileSync(tileFile(j.id), await cropTile(fs.readFileSync(png), m, city.render.webpQuality));
    const dark = path.join(out, 'png-dark', ...j.id.split('/')) + '.png';
    const mask = path.join(out, 'png-mask', ...j.id.split('/')) + '.png';
    // A re-rendered tile's old dark copy and mask go first: if its dark pass failed, the level isn't current any more.
    for (const dir of ['tiles-dark', 'tiles-mask'] as const) fs.rmSync(tileFile(j.id, dir), { force: true });
    if (j.passes.includes('dark') && fs.existsSync(dark) && fs.existsSync(mask)) {
      fs.mkdirSync(path.dirname(tileFile(j.id, 'tiles-dark')), { recursive: true });
      fs.mkdirSync(path.dirname(tileFile(j.id, 'tiles-mask')), { recursive: true });
      fs.writeFileSync(tileFile(j.id, 'tiles-dark'), await cropTile(fs.readFileSync(dark), m, city.render.webpQuality));
      fs.writeFileSync(tileFile(j.id, 'tiles-mask'), await cropMask(fs.readFileSync(mask), m));
    }
  }
}

const missing = [...prints.keys()].filter((k) => !has('tiles', k));
if (missing.length) {
  console.error(`${missing.length} tiles are missing after the render, e.g. ${missing.slice(0, 5).join(', ')}.`);
  process.exit(1);
}
// The prints now on disk: this run's tiles, and earlier runs' for levels a --only run didn't touch.
const saved = { ...prev, ...Object.fromEntries(prints) };
// The manifest lists only levels whose every tile is on disk and was rendered from the current data.
const current = currentLevels(allPrints, saved, (k) => has('tiles', k));
// Blackouts: the dark levels whose every tile has its dark copy and mask from the current data.
const darkCurrent = currentLevels(allPrints, saved, (k) => outputsExist(k, has)).filter((s) => darkLevels(city.render.levels).includes(s) && current.includes(s));
const levels = allNeeded
  .filter((n) => current.includes(n.scale))
  .map((n) => ({ scale: n.scale, ...tileGrid(n.scale), tiles: n.keys.length === tileGrid(n.scale).cols * tileGrid(n.scale).rows ? ('all' as const) : n.keys }));
const manifest: TileManifest = {
  version: 1,
  size: [MAP_W, MAP_H],
  tile: TILE,
  levels,
  deep: city.map.districts.filter((d) => city.styles[d.id]?.deepZoom).map((d) => d.id),
  deepAreas,
  dataHash: currentDataHash(root, city),
  blender: blenderVersion,
  pinHeights: geometry.pinHeights,
  rendered: new Date().toISOString(),
  ...(darkCurrent.length && { dark: { levels: darkCurrent }, mask: { districts: geometry.districts.map((d) => d.id) } }),
};
fs.mkdirSync(pub, { recursive: true });
// Dark copies and masks no dark level wants (an older render's levels or tiles).
const wantedDark = new Set(allNeeded.filter((n) => darkLevels(city.render.levels).includes(n.scale)).flatMap((n) => n.keys.map((k) => `${n.scale}/${k}`)));
let removed = 0;
for (const dir of ['tiles-dark', 'tiles-mask'] as const) {
  const base = path.join(pub, dir);
  if (!fs.existsSync(base)) continue;
  const present = fs.readdirSync(base).flatMap((s) => (fs.statSync(path.join(base, s)).isDirectory() ? fs.readdirSync(path.join(base, s)).map((f) => `${s}/${f.replace(/\.(webp|png)$/, '')}`) : []));
  for (const k of staleTiles(present, wantedDark)) {
    fs.rmSync(tileFile(k, dir), { force: true });
    removed++;
  }
}
if (removed) console.log(`Removed ${removed} stale dark/mask tiles.`);
fs.writeFileSync(path.join(pub, 'windows.json'), JSON.stringify(windows));
fs.writeFileSync(path.join(pub, 'tiles.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(printsFile, JSON.stringify(saved));
console.log(`Done: ${levels.map((l) => `${l.scale}×`).join(' ')} in web/public/map/tiles.json, ${windows.length} lit windows.`);
