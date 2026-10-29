import fs from 'node:fs';
import path from 'node:path';

export interface DesktopFolders {
  userData: string;
  /** The player's saves and settings (DATA_DIR). */
  data: string;
  logs: string;
  /** Read-only content staged from release.json (resources/content). */
  content: string;
  webDist: string;
}

/** Where saves and settings live: the installed app's Lowlight, or Lowlight-dev for an unpackaged run (`npm run desktop`). */
export function userDataFolder(appData: string, packaged: boolean): string {
  return path.join(appData, packaged ? 'Lowlight' : 'Lowlight-dev');
}

export function desktopFolders(userData: string, contentDir: string, webDist: string): DesktopFolders {
  return { userData, data: path.join(userData, 'data'), logs: path.join(userData, 'logs'), content: contentDir, webDist };
}

/**
 * Every environment variable the server reads (server/src: config.ts, start.ts). A player's
 * own environment never reaches the packaged server through these: each is cleared, then set from the app.
 */
const SERVER_VARS = [
  'ART_SCENES_DIR', 'CHARACTERS_DIR', 'DATA_DIR', 'LORE_DIR', 'LEADS_DIR', 'QUESTS_DIR', 'EXTRAS_DIR', 'GEAR_DIR', 'CREW_DIR', 'STANDING_FILE', 'GIGS_DIR', 'PAPERS_DIR', 'DISTRICTS_DIR',
  'MAP_FILE', 'NIX_ROOM_PORT', 'NIX_ROOM_TOKEN', 'NODE_ENV', 'OPENROUTER_API_KEY', 'OPENROUTER_BASE_URL', 'PERSONA_DIR',
  'PLAYTHROUGHS_DIR', 'SCENES_DIR', 'SPLASH_DIR', 'WEB_DIST', 'APP_VERSION', 'APP_BUILD', 'BUG_RELAY_URL', 'LOG_FILE',
];

/** The env the desktop app starts the server with (spec §2.2, §4.1). The port is any free one. */
export function serverEnv(
  f: DesktopFolders,
  base: NodeJS.ProcessEnv,
  app: { version: string; build: string | null; bugRelay: string | null } = { version: '0.0.0', build: null, bugRelay: null },
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const v of SERVER_VARS) delete env[v];
  Object.assign(env, {
    DATA_DIR: f.data,
    SCENES_DIR: path.join(f.content, 'scenes'),
    CHARACTERS_DIR: path.join(f.content, 'characters'),
    PERSONA_DIR: path.join(f.content, 'persona'),
    MAP_FILE: path.join(f.content, 'map', 'lowlight.json'),
    LORE_DIR: path.join(f.content, 'world', 'lore'),
    LEADS_DIR: path.join(f.content, 'world', 'leads'),
    QUESTS_DIR: path.join(f.content, 'world', 'quests'),
    EXTRAS_DIR: path.join(f.content, 'world', 'extras'),
    GEAR_DIR: path.join(f.content, 'world', 'gear'),
    CREW_DIR: path.join(f.content, 'world', 'crew'),
    STANDING_FILE: path.join(f.content, 'world', 'standing.json'),
    SPLASH_DIR: path.join(f.content, 'world', 'splash'),
    GIGS_DIR: path.join(f.content, 'world', 'gigs'),
    PAPERS_DIR: path.join(f.content, 'world', 'papers'),
    DISTRICTS_DIR: path.join(f.content, 'world', 'districts'),
    ART_SCENES_DIR: path.join(f.content, 'art', 'scenes'),
    WEB_DIST: f.webDist,
    NIX_ROOM_PORT: '0',
    NODE_ENV: 'production',
    APP_VERSION: app.version,
    LOG_FILE: path.join(f.logs, 'server.log'),
    ...(app.build ? { APP_BUILD: app.build } : {}),
    ...(app.bugRelay ? { BUG_RELAY_URL: app.bugRelay } : {}),
  });
  // The packaged smoke test points the game at a fake OpenRouter; nothing else may.
  if (base.LOWLIGHT_TEST === '1' && base.OPENROUTER_BASE_URL) env.OPENROUTER_BASE_URL = base.OPENROUTER_BASE_URL;
  return env;
}

/** Where this build sends bug reports: report.json in the staged content (release.json's bugRelay); null without one. */
export function readBugRelay(contentDir: string): string | null {
  try {
    const url = (JSON.parse(fs.readFileSync(path.join(contentDir, 'report.json'), 'utf8')) as { bugRelay?: unknown }).bugRelay;
    return typeof url === 'string' && url.startsWith('https://') ? url : null;
  } catch {
    return null;
  }
}
