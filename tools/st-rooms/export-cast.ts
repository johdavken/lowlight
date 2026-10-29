// Exports Lowlight's cast to SillyTavern (cast-export.ts does the work).
//   npm run st-cast                                   your SillyTavern: skips cards it already has
//   npm run st-cast -- --replace                      rewrites those cards (and persona pictures) too
//   npm run st-cast -- --user <SillyTavern>/data/default-user
//   npm run st-cast -- --package <dir> --version 1.2.0     into a package folder's cast/ (st-publish does this)
//   --data <dir>: Lowlight's data folder for greetings (default: this checkout's, else the main checkout's)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportCast } from './cast-export';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const pkg = arg('package');
const user = path.resolve(arg('user') ?? path.join(os.homedir(), 'Projects/SillyTavern/data/default-user'));
if (!pkg && !fs.existsSync(path.join(user, 'characters'))) {
  console.error(`No SillyTavern user folder at ${user}`);
  process.exit(1);
}
const { cast, report } = await exportCast({
  repo,
  target: pkg ? { package: path.resolve(pkg) } : { user },
  version: arg('version'),
  replace: process.argv.includes('--replace'),
});
const personas = cast.characters.filter((c) => c.persona).map((c) => c.name);
console.log(
  `Cast → ${pkg ? path.resolve(pkg, 'cast') : user}\n${report.length} characters: ${report.join(', ')}\n${personas.length} personas: ${personas.join(', ')}\n${pkg ? '' : 'Reload SillyTavern to see them.'}`,
);
