// A sprite's outline filled with one colour (character creator spec 2026-11-14): the newcomer stand-in's plain figure
// and the start image for every made person's take, so no face or feature of the sprite it came from survives.
//   npx tsx tools/art/silhouette.ts <in.png> <out.png> [#rrggbb]
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { fileURLToPath } from 'node:url';

export function silhouette(png: PNG, fill: [number, number, number]): PNG {
  const out = new PNG({ width: png.width, height: png.height });
  png.data.copy(out.data);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    out.data[i] = fill[0];
    out.data[i + 1] = fill[1];
    out.data[i + 2] = fill[2];
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [input, output, hex = '#030204'] = process.argv.slice(2);
  if (!input || !output) throw new Error('usage: silhouette.ts <in.png> <out.png> [#rrggbb]');
  const n = parseInt(hex.replace('#', ''), 16);
  const png = PNG.sync.read(fs.readFileSync(input));
  fs.writeFileSync(output, PNG.sync.write(silhouette(png, [(n >> 16) & 255, (n >> 8) & 255, n & 255])));
}
