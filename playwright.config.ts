import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { E2E_GPU, E2E_WORKERS, STUDIO_PORT, gamePort } from './e2e/ports';

/**
 * This worker's game server (the config loads again in every worker, after Playwright sets its
 * index; in the runner it's slot 0's). Each worker has a server, and so a world, of its own.
 */
const PORT = gamePort();

/** Scene Studio is private: the public repo has no studio/, so its server and project go too. */
const STUDIO = fs.existsSync(new URL('./studio', import.meta.url));

/** WebGL for the browsers: the GPU through Vulkan, or swiftshader (see E2E_GPU in e2e/ports.ts). */
const GL_ARGS = E2E_GPU
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan']
  : ['--use-angle=swiftshader'];

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  timeout: 60_000,
  // Test by test across workers: a server has one active playthrough, so each worker gets a server
  // of its own (e2e/serve-all.ts), and a NEW GAME in one can't switch the world under another's
  // room. Tests on one worker still run one after another on its server. Set the count with
  // E2E_WORKERS (see e2e/ports.ts), not --workers: a worker past the last server has nowhere to go.
  fullyParallel: true,
  workers: E2E_WORKERS,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: [
    {
      // A single command, not `npm run build && npx tsx e2e/serve.ts`: with `&&`, Playwright has
      // to spawn a shell to sequence the two commands, and that shell doesn't exec into the final
      // one — it stays alive waiting on it, so a signal to the shell doesn't necessarily reach the
      // still-running grandchild. serve-all.ts builds in-process (skipped when the page's sources
      // are unchanged), starts one e2e/serve.ts per worker, waits on their exits at shutdown, and
      // says `e2e servers ready` once every one answers.
      command: 'npx tsx e2e/serve-all.ts',
      url: `http://127.0.0.1:${gamePort(0)}/api/bootstrap`,
      wait: { stdout: /e2e servers ready/ },
      reuseExistingServer: false,
      timeout: 120_000,
      // Without this, Playwright skips SIGTERM entirely and SIGKILLs the process group on
      // teardown (see launchProcess's `attemptToGracefullyClose` in playwright-core, which throws
      // "skip graceful shutdown" unless this is set) — SIGKILL can't be caught, so serve.ts's own
      // shutdown handler (which removes its temp DB dir) never got to run. This makes Playwright
      // send SIGTERM to the process group first and wait up to 10s before falling back to SIGKILL.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    ...(STUDIO ? [studioServer()] : []),
  ],
  projects: [
    {
      name: 'chromium',
      testIgnore: 'studio.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        // The PixiJS renderer requires WebGL (see renderer/index.ts): GL_ARGS above.
        launchOptions: {
          args: GL_ARGS,
        },
      },
    },
    ...(STUDIO ? [studioProject()] : []),
  ],
});

function studioServer() {
  return {
    // Scene Studio: its own server and built page (stub depth, throwaway root).
    command: 'npx tsx e2e/studio-serve.ts',
    url: `http://127.0.0.1:${STUDIO_PORT}/api/packs`,
    reuseExistingServer: false,
    timeout: 60_000,
    gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 10_000 },
  };
}

function studioProject() {
  return {
    name: 'studio',
    testMatch: 'studio.spec.ts',
    // One Studio server and one throwaway root for the whole file: its tests stay in order on one worker.
    fullyParallel: false,
    use: {
      ...devices['Desktop Chrome'],
      baseURL: `http://127.0.0.1:${STUDIO_PORT}`,
      viewport: { width: 1600, height: 900 },
      launchOptions: { args: GL_ARGS },
    },
  };
}
