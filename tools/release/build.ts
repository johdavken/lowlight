import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import { build } from 'esbuild';

const ICON_SIZE = 512;

/** CommonJS dependencies bundled into ESM still call require(); give them one. */
const REQUIRE_BANNER = "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);";

/** The app's own icon, when there is one: a square PNG (Windows' .ico needs at least 256 px). */
const ICON_FILE = path.join('desktop', 'icon.png');
const ICON_MIN = 256;

/**
 * build/icon.png, which electron-builder makes the AppImage and Windows icons from: desktop/icon.png
 * when there is one, else the logo centred on a transparent square.
 */
export function renderIcon(root: string): void {
  const own = path.join(root, ICON_FILE);
  if (fs.existsSync(own)) {
    const { width, height } = PNG.sync.read(fs.readFileSync(own));
    if (width !== height || width < ICON_MIN) throw new Error(`desktop/icon.png must be a square PNG of at least ${ICON_MIN} px (it is ${width}×${height})`);
    fs.mkdirSync(path.join(root, 'build'), { recursive: true });
    fs.copyFileSync(own, path.join(root, 'build', 'icon.png'));
    return;
  }
  const svg = fs.readFileSync(path.join(root, 'web', 'public', 'lowlight-logo.svg'), 'utf8');
  const logo = new Resvg(svg, { fitTo: { mode: 'width', value: ICON_SIZE } }).render();
  // A logo taller than wide is fitted by height instead.
  const fitted = logo.height > ICON_SIZE ? new Resvg(svg, { fitTo: { mode: 'height', value: ICON_SIZE } }).render() : logo;
  const square = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}"><image x="${(ICON_SIZE - fitted.width) / 2}" y="${(ICON_SIZE - fitted.height) / 2}" width="${fitted.width}" height="${fitted.height}" href="data:image/png;base64,${fitted.asPng().toString('base64')}"/></svg>`;
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), new Resvg(square).render().asPng());
}

/**
 * Builds everything a desktop package needs (spec §6.1 step 4): the front end (without the dev-only
 * `_audition` sounds), the server bundled into one ESM file, the Electron entry and preload when they
 * exist, and the app icon.
 */
export async function buildAll(root: string): Promise<void> {
  execFileSync('npx', ['vite', 'build'], { cwd: root, stdio: 'inherit' });
  fs.rmSync(path.join(root, 'dist', 'web', '_audition'), { recursive: true, force: true });

  await build({
    entryPoints: [path.join(root, 'server', 'src', 'start.ts')],
    outfile: path.join(root, 'dist', 'server', 'start.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: ['electron'],
    banner: { js: REQUIRE_BANNER },
    logLevel: 'warning',
  });

  const desktop = [
    { entry: 'main.ts', out: 'main.mjs', format: 'esm' as const },
    { entry: 'preload.ts', out: 'preload.cjs', format: 'cjs' as const },
  ];
  for (const d of desktop) {
    const entry = path.join(root, 'desktop', d.entry);
    if (!fs.existsSync(entry)) {
      console.log(`build: no desktop/${d.entry} yet; skipped`);
      continue;
    }
    await build({
      entryPoints: [entry],
      outfile: path.join(root, 'dist', 'desktop', d.out),
      bundle: true,
      platform: 'node',
      format: d.format,
      target: 'node24',
      // The server is its own bundle, loaded at runtime from ../server/start.mjs.
      external: ['electron', '../server/start.mjs'],
      ...(d.format === 'esm' ? { banner: { js: REQUIRE_BANNER } } : {}),
      logLevel: 'warning',
    });
  }

  renderIcon(root);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  buildAll(process.cwd()).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
