import { defineConfig } from 'vitest/config';

// The suite boots real servers, runs ffmpeg and generates boards in parallel: tests that take ~2 s
// alone can pass vitest's 5 s default when everything runs at once, and a different few time out
// each run. 20 s keeps real hangs failing while load alone doesn't.
const testTimeout = 20_000;

export default defineConfig({
  test: {
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
