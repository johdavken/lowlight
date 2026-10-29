/** What Studio writes: the content folders and files COMMIT may commit (spec 2026-10-09 BUILD tab §2.1). */
export const STUDIO_PATHS: readonly string[] = ['scenes', 'characters', 'world', 'map', 'art/scenes', 'sounds/CREDITS.md', 'release.json'];

/** Everything else a build is made from: committed outside Studio. */
export const CODE_PATHS: readonly string[] = ['package.json', 'package-lock.json', 'electron-builder.yml', 'vite.config.ts', 'tsconfig.json', 'server', 'web', 'shared', 'desktop', 'tools/release', 'e2e', 'e2e-desktop'];

/** A repo-relative path (forward slashes) inside one of STUDIO_PATHS, by whole segments. */
export function inStudioPaths(file: string): boolean {
  return STUDIO_PATHS.some((p) => file === p || file.startsWith(`${p}/`));
}
