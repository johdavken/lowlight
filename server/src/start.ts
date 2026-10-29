import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config';
import { isConnected, loadAgents } from './agents';
import { buildApp } from './app';
import { migrateToPlaythroughs } from './migrate-playthroughs';
import { importLegacySettings } from './migrate-settings';
import { openSettings } from './settings';
import { createPlaythroughs } from './playthroughs';
import { completeSceneId } from './room-state';
import { roomRegistry } from './rooms';
import { loadPacks } from './scenes';

const HEALTH_POLL_MS = 30_000;


/**
 * Starts the game server on 127.0.0.1 from `env` (see config.ts; NIX_ROOM_PORT=0 takes a free port) and
 * resolves once it listens. `npm run dev`/`npm start` call it from main.ts; the desktop app from its main process.
 */
export async function start(env: NodeJS.ProcessEnv, log: (line: string) => void = (l) => console.log(l)): Promise<{ url: string; close(): Promise<void> }> {
  // The player's settings (key, models, the room token): set in the game, kept in data/settings.json.
  const settings = openSettings(env.DATA_DIR ?? './data', (m) => console.warn(m));
  const cfg = loadConfig(env, { generatedToken: () => settings.roomToken() });
  if (env.NODE_ENV === 'production') {
    cfg.webDist = env.WEB_DIST ?? 'dist/web';
  }

  // One-time import of the per-contact databases as playthroughs (a no-op once any playthrough exists).
  const contactIds = fs.existsSync(cfg.dataDir)
    ? fs.readdirSync(cfg.dataDir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(cfg.dataDir, e.name, 'room.db'))).map((e) => e.name)
    : [];
  if (contactIds.length > 0) {
    // A room saved before rooms had full names is completed as her room would (the app warns about packs and agents itself).
    const rooms = roomRegistry(await loadPacks(cfg.scenesDir));
    const records = loadAgents({ charactersDir: cfg.charactersDir, dataDir: cfg.dataDir, rooms, openrouterBaseUrl: cfg.openrouterBaseUrl, warn: () => {} });
    const completeScene = (contactId: string, sceneId: string) => {
      const info = records.find((r) => r.info.id === contactId)?.info;
      return info ? completeSceneId(sceneId, (id) => rooms.has(id), info.legacyDistrict, info.startRoom) : sceneId;
    };
    const onRoster = (contactId: string) => records.some((r) => r.info.id === contactId);
    migrateToPlaythroughs(cfg.dataDir, createPlaythroughs(cfg.playthroughsDir), contactIds, (m) => log(`[migrate] ${m}`), completeScene, onRoster);
  }

  // One-time import of data/backends.json and each contact's model choice (a no-op once data/settings.json exists).
  if (!settings.exists()) {
    const rooms = roomRegistry(await loadPacks(cfg.scenesDir));
    const records = loadAgents({ charactersDir: cfg.charactersDir, dataDir: cfg.dataDir, rooms, openrouterBaseUrl: cfg.openrouterBaseUrl, warn: () => {} });
    const playthroughs = createPlaythroughs(cfg.playthroughsDir);
    const active = playthroughs.active();
    importLegacySettings({
      dataDir: cfg.dataDir,
      settings,
      charsDir: active ? playthroughs.charsDir(active.id) : null,
      defaultModel: (id) => records.find((r) => r.info.id === id)?.direct?.defaultModel ?? null,
      log,
    });
  }

  const built = await buildApp(cfg, { settings });
  const { app } = built;

  // Bring every connected agent's room up front, so her link status is known straight away.
  for (const rec of built.agents()) {
    if (!isConnected(rec)) continue;
    // Log and carry on: one agent's broken room must not keep the others offline.
    await built.runtime(rec.info.id).catch((err: Error) => console.error(`agent ${rec.info.id}: room failed to open: ${err.message}`));
  }
  const checkAll = () => Promise.all(built.runtimes().map((rt) => rt.checkHealth()));
  await checkAll();
  const healthTimer = setInterval(() => {
    void checkAll();
  }, HEALTH_POLL_MS);

  await app.listen({ port: cfg.port, host: '127.0.0.1' });
  const address = app.server.address();
  const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : cfg.port}`;
  const connected = built.agents().filter(isConnected).map((a) => a.info.id);
  log(`Nix Room listening on ${url} — rooms: ${connected.join(', ') || 'none connected yet'}`);

  let closed: Promise<void> | null = null;
  return {
    url,
    close() {
      closed ??= (async () => {
        clearInterval(healthTimer);
        await built.close();
      })();
      return closed;
    },
  };
}
