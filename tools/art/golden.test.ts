import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from './pipeline';
import { buildsTimeout, fakeDepth, makeFixtureRoot } from './test-fixture';

const GOLDEN = fileURLToPath(new URL('./golden.json', import.meta.url));

/** sha256 of every file the CLI build produces for the fixture room, keyed by path from the root. */
async function buildHashes(): Promise<Record<string, string>> {
  const root = await makeFixtureRoot('art-golden-');
  await runBuild({ scene: 'lowlight-intake', root, depth: fakeDepth(), log: () => {} });
  const out: Record<string, string> = {};
  const add = (rel: string) => (out[rel] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex'));
  const installed = path.join('scenes', 'karasu', 'lowlight-intake-art');
  for (const f of fs.readdirSync(path.join(root, installed)).sort()) add(path.join(installed, f));
  const work = path.join('art', 'work', 'lowlight-intake');
  for (const f of fs.readdirSync(path.join(root, work)).sort()) if (/^(layer|glow-preview)-.*\.png$/.test(f)) add(path.join(work, f));
  fs.rmSync(root, { recursive: true, force: true });
  return out;
}

describe('art build golden output', { timeout: buildsTimeout(1) }, () => {
  it('CLI build output matches golden.json', async () => {
    const hashes = await buildHashes();
    if (process.env.UPDATE_GOLDEN === '1') {
      fs.writeFileSync(GOLDEN, `${JSON.stringify(hashes, null, 2)}\n`);
      return;
    }
    expect(hashes).toEqual(JSON.parse(fs.readFileSync(GOLDEN, 'utf8')));
  });
});
