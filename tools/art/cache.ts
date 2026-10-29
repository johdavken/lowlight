import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CACHE_VERSION = 1;

/** Hash of a step's inputs (buffers hashed by content, everything else by JSON). */
export function stepHash(step: string, inputs: unknown[]): string {
  const h = crypto.createHash('sha256').update(`${CACHE_VERSION}:${step}`);
  for (const input of inputs) h.update(Buffer.isBuffer(input) ? input : JSON.stringify(input));
  return h.digest('hex');
}

/**
 * Runs `run` only when its inputs changed since the last run (or `force`), persisting the result
 * as `<step>.bin` in `workDir` with the input hash in `cache.json`.
 */
export async function cached(
  workDir: string,
  step: string,
  inputs: unknown[],
  run: () => Promise<Buffer>,
  opts: { force: boolean },
): Promise<Buffer> {
  fs.mkdirSync(workDir, { recursive: true });
  const indexFile = path.join(workDir, 'cache.json');
  const dataFile = path.join(workDir, `${step}.bin`);
  const index: Record<string, string> = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {};
  const hash = stepHash(step, inputs);
  if (!opts.force && index[step] === hash && fs.existsSync(dataFile)) return fs.readFileSync(dataFile);
  const data = await run();
  fs.writeFileSync(dataFile, data);
  index[step] = hash;
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
  return data;
}
