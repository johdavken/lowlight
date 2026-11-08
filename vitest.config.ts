import { defineConfig } from 'vitest/config';

// The suite boots real servers, runs ffmpeg and generates boards in parallel: tests that take ~2 s
// alone can pass vitest's 5 s default when everything runs at once, and a different few time out
// each run. 20 s keeps real hangs failing while load alone doesn't.
const testTimeout = 20_000;

// Vitest's default is one worker per core minus one, and each of those also starts ffmpeg and
// servers, so one run (two when several checkouts test at once) pins every core. Half the cores
// keeps the machine usable; VITEST_WORKERS (a count or a percentage) overrides it for one run.
const maxWorkers = process.env.VITEST_WORKERS ?? '50%';

export default defineConfig({
  test: {
    maxWorkers,
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          testTimeout,
          include: [
            'shared/**/*.test.ts',
            'server/test/**/*.test.ts',
            'tools/**/*.test.ts',
            'studio/test/**/*.node.test.ts',
            'desktop/test/**/*.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          testTimeout,
          include: ['web/test/**/*.test.ts', 'studio/test/**/*.dom.test.ts'],
          passWithNoTests: true,
        },
      },
    ],
  },
});
