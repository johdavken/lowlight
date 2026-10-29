import fs from 'node:fs';
import path from 'node:path';
import { generateScenes } from '../../../tools/gen-placeholders';
import type { Config } from '../../src/config';
import { openSettings } from '../../src/settings';
import { tempDir } from './temp-dir';

export interface FixtureAgent {
  id: string;
  name?: string;
  /** A direct character on OpenRouter (connected): character.json with a backend and identity.md; otherwise she has no mind. */
  direct?: boolean;
  pack?: 'karasu' | 'default';
}

/** Generated scene packs, shared by every fixture root (generation is slow-ish). */
let packsCache: string | null = null;
export async function sharedPacks(): Promise<string> {
  if (packsCache) return packsCache;
  const dir = tempDir('nix-packs-');
  await generateScenes(path.join(dir, 'karasu'), 'karasu');
  await generateScenes(path.join(dir, 'default'), 'default');
  packsCache = dir;
  return dir;
}

/**
 * Characters + a data dir with the given agents, and a Config pointing at it. Direct agents need
 * `openrouterUrl` (a startStubOpenRouter): its key goes in data/settings.json and the config points at it.
 */
export async function makeFixture(agents: FixtureAgent[], scenesDir?: string, o: { openrouterUrl?: string } = {}): Promise<{ root: string; cfg: Config }> {
  const root = tempDir('nix-agents-');
  const charactersDir = path.join(root, 'characters');
  const dataDir = path.join(root, 'data');
  for (const a of agents) {
    const dir = path.join(charactersDir, a.id);
    fs.mkdirSync(dir, { recursive: true });
    // Her rooms: every room the generator writes for that district.
    const rooms = a.pack === 'karasu' ? ['karasu/lowlight-intake', 'karasu/noodle-stall', 'karasu/ribbon-rooftop'] : a.pack === 'default' ? ['default/workspace', 'default/rooftop'] : undefined;
    const json: Record<string, unknown> = { name: a.name ?? a.id.charAt(0).toUpperCase() + a.id.slice(1), ...(rooms ? { rooms } : {}) };
    if (a.direct) {
      json.identity = 'identity.md';
      json.backend = { provider: 'openrouter', model: 'z-ai/glm-5.2' };
      fs.writeFileSync(path.join(dir, 'identity.md'), `You are ${json.name as string}.`);
    }
    fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify(json));
  }
  if (agents.some((a) => a.direct)) {
    if (!o.openrouterUrl) throw new Error('makeFixture: direct agents need openrouterUrl');
    openSettings(dataDir).setKey('openrouter', 'sk-or-fixture-123456');
  }
  const cfg: Config = {
    // No scheduled blackouts: the live map's rates would darken a test's room on a random night (blackouts phase 3).
    outageRates: {},
    port: 0,
    token: 'test-token-123456789',
    dataDir,
    charactersDir,
    scenesDir: scenesDir ?? (await sharedPacks()),
    personaDir: path.join(root, 'persona'),
    loreDir: path.join(root, 'lore'),
    leadsDir: path.join(root, 'leads'),
    webDist: null,
    playthroughsDir: path.join(dataDir, 'playthroughs'),
    autoPlaythrough: true,
    ...(o.openrouterUrl ? { openrouterBaseUrl: o.openrouterUrl } : {}),
  };
  return { root, cfg };
}
