import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Runs `npm run <script>` only when its inputs changed since the last e2e build of `outDir`. The
 * key is every input file's path, size and mtime (no reads, so it's quick), kept in `outDir` next
 * to what it built; any other build into `outDir` (`npm run build`, vite's emptyOutDir) wipes it,
 * so the next e2e run builds again. `E2E_REBUILD=1` builds regardless.
 *
 * Inputs over-include on purpose (a whole folder when a few files are imported): a needless build
 * costs seconds, a stale one tests the wrong page.
 */
export function buildOnce(script: string, outDir: string, inputs: string[]): void {
  const stamp = path.join(outDir, '.e2e-build-key');
  const key = inputKey(inputs);
  const last = fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8') : '';
  if (process.env.E2E_REBUILD !== '1' && last === key && fs.existsSync(path.join(outDir, 'index.html'))) {
    console.log(`e2e: ${script} is up to date (E2E_REBUILD=1 to force)`);
    return;
  }
  execFileSync('npm', ['run', script], { stdio: 'inherit' });
  fs.writeFileSync(stamp, key);
}

function inputKey(inputs: string[]): string {
  const hash = createHash('sha256');
  const walk = (p: string): void => {
    if (!fs.existsSync(p)) return void hash.update(`${p}\0missing\n`);
    const st = fs.statSync(p);
    if (!st.isDirectory()) return void hash.update(`${p}\0${st.size}\0${st.mtimeMs}\n`);
    for (const name of fs.readdirSync(p).sort()) if (name !== 'node_modules') walk(path.join(p, name));
  };
  for (const p of inputs) walk(p);
  return hash.digest('hex');
}

/** The game page (`npm run build`, vite.config.ts: root web/, imports ../shared). */
export const buildWeb = (): void => buildOnce('build', 'dist/web', ['web', 'shared', 'vite.config.ts', 'package-lock.json']);

/** Scene Studio's page (`npm run build:studio`: studio/web imports web/src, shared, studio/server types, tools/release). */
export const buildStudio = (): void =>
  buildOnce('build:studio', 'dist/studio', ['studio', 'web/src', 'web/public', 'shared', 'tools/release', 'package-lock.json']);
