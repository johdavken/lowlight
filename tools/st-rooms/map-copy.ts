// The SillyTavern package carries the rendered city map when there is one (rendered map spec §6): its tiles, manifest and
// lit windows go next to the map's data, and the package's map shows them (the painting when there are none).
import fs from 'node:fs';
import path from 'node:path';

/** Copies web/public/map's tiles/, tiles.json and windows.json into `out`/map; false when there's no render. */
export function copyMapRender(repo: string, out: string): boolean {
  const from = path.join(repo, 'web', 'public', 'map');
  if (!fs.existsSync(path.join(from, 'tiles.json'))) return false;
  const to = path.join(out, 'map');
  fs.mkdirSync(to, { recursive: true });
  for (const f of ['tiles.json', 'windows.json']) if (fs.existsSync(path.join(from, f))) fs.copyFileSync(path.join(from, f), path.join(to, f));
  if (fs.existsSync(path.join(from, 'tiles'))) fs.cpSync(path.join(from, 'tiles'), path.join(to, 'tiles'), { recursive: true });
  return true;
}
