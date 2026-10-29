import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { start } from '../src/start';

/** Every file under `dir`, relative to it. */
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name)));
}

describe('start(env)', () => {
  let root: string;
  let dataDir: string;
  let legacyDir: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-start-'));
    dataDir = path.join(root, 'data');
    legacyDir = path.join(root, 'legacy');
    fs.mkdirSync(legacyDir);
    // The repo's own content; only the player's folders are temporary. No HERMES_HOME: Hermes off.
    env = { DATA_DIR: dataDir, LEGACY_DIR: legacyDir, PERSONA_DIR: path.join(root, 'persona'), NIX_ROOM_PORT: '0', NODE_ENV: 'test' };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('boots on a free port and serves bootstrap', async () => {
    const s = await start(env, () => {});
    try {
      expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(s.url).not.toMatch(/:7700$/);
      expect((await fetch(`${s.url}/api/bootstrap`)).status).toBeLessThan(500);
    } finally {
      await s.close();
    }
  });

  it('boots with HERMES_* variables set, and they change nothing', async () => {
    const s = await start({ ...env, HERMES_HOME: path.join(root, 'hermes'), HERMES_API_KEY: 'k', HERMES_BASE_URL: 'http://127.0.0.1:1' }, () => {});
    try {
      expect((await fetch(`${s.url}/api/bootstrap`)).status).toBeLessThan(500);
      expect(fs.existsSync(path.join(root, 'hermes'))).toBe(false);
    } finally {
      await s.close();
    }
  });

  it('frees its port on close', async () => {
    const s = await start(env, () => {});
    const port = Number(new URL(s.url).port);
    await s.close();
    await expect(
      new Promise<void>((ok, no) => {
        const srv = net.createServer().once('error', no).listen(port, '127.0.0.1', () => srv.close(() => ok()));
      }),
    ).resolves.toBeUndefined();
  });

  it('first run on an empty data folder writes settings.json and no legacy or Hermes files', async () => {
    const s = await start(env, () => {});
    await s.close();
    const files = walk(dataDir);
    expect(files).toContain('settings.json');
    // The lobby's rooms live under playthroughs/; nothing at the old per-agent spots (data/<id>/room.db, agent.json, backends.json).
    expect(files.filter((f) => !f.startsWith(`playthroughs${path.sep}`) && /\.db(-|$)|backends\.json|agent\.json/.test(f))).toEqual([]);
    expect(fs.readdirSync(legacyDir)).toEqual([]);
  });
});

describe('loadConfig ART_SCENES_DIR', () => {
  it('reads room narration from ART_SCENES_DIR', () => {
    expect(loadConfig({ NIX_ROOM_TOKEN: 'x'.repeat(16), ART_SCENES_DIR: '/tmp/a b/scenes' }).artScenesDir).toBe('/tmp/a b/scenes');
  });
});
