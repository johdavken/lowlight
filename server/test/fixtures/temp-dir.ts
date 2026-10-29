/** Temp folders for tests: each one made here is removed when its test file finishes. */
import { afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const made: string[] = [];

// Registered at import, so it attaches to the importing test file (vitest evaluates modules per file).
afterAll(() => {
  while (made.length) fs.rmSync(made.pop()!, { recursive: true, force: true });
});

/** `fs.mkdtempSync` under the OS temp dir (prefix like 'art-guide-'), removed after the file's tests. */
export function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}
