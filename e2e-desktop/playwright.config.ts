import { defineConfig } from '@playwright/test';

/** The packaged-app smoke test (spec 2026-10-09 preview build §6.1 step 7): run after `npm run package:linux`. */
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
});
