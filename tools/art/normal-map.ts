/**
 * A stage sprite's normal map, by hand, for looking at it (the game's server makes its own on request:
 * server/src/normal-map.ts).
 *
 *   npx tsx tools/art/normal-map.ts characters/rue/rue-outfit-work.png [--px 2] [--round 70] [--smooth 12] [--detail 6] [--blur 3]
 *
 * Writes `<name>.normal.png` beside it. Don't commit the result.
 */
import fs from 'node:fs';
import { NORMAL_MAP_DEFAULTS, normalMapPng } from '../../server/src/normal-map';

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}

const src = process.argv[2];
if (!src) throw new Error('usage: normal-map.ts <sprite.png> [--px 2] [--round 70] [--smooth 12] [--detail 6] [--blur 3]');
const opts = {
  px: (arg('px', 2) === 1 ? 1 : 2) as 1 | 2,
  round: arg('round', NORMAL_MAP_DEFAULTS.round),
  smooth: arg('smooth', NORMAL_MAP_DEFAULTS.smooth),
  detail: arg('detail', NORMAL_MAP_DEFAULTS.detail),
  blur: arg('blur', NORMAL_MAP_DEFAULTS.blur),
};
const dest = src.replace(/\.png$/i, '.normal.png');
void normalMapPng(fs.readFileSync(src), opts).then((png) => {
  fs.writeFileSync(dest, png);
  console.log(`wrote ${dest} (${JSON.stringify(opts)})`);
});
