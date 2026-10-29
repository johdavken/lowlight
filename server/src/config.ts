import fs from 'node:fs';
import path from 'node:path';

export interface Config {
  port: number;
  /** Browser token: guards /api/bootstrap → /ws. */
  token: string;
  /** The player's data: settings.json (the model link) and playthroughs/ (git-ignored). */
  dataDir: string;
  /** Optional per-agent overrides: characters/<id>/character.json. */
  charactersDir: string;
  /** Scene packs: scenes/<pack>/<scene>/. */
  scenesDir: string;
  /** persona/persona.json (git-ignored): names the default player only; who you are is per playthrough. */
  personaDir: string;
  /** The lore book: world/lore/<id>.md (read once at startup). */
  loreDir: string;
  /** Leads: world/leads/<id>.md (read once at startup). Default ./world/leads. */
  leadsDir?: string;
  /** Quest lines: world/quests/<id>.md (read once at startup). Default ./world/quests. */
  questsDir?: string;
  /** Stranger faces: world/extras/ (extras.json and its PNGs; read once at startup). Default ./world/extras. */
  extrasDir?: string;
  /** The deck catalog: world/gear/decks.md (missions spec §1; read once at startup). Default ./world/gear. */
  gearDir?: string;
  /** The crew tables: world/crew/*.md (crew spec §1–§2; read once at startup). Default ./world/crew. */
  crewDir?: string;
  /** `world/standing.json`: Standing's shared words and band lines (spec 2026-10-13). */
  standingFile?: string;
  /** Gig briefs: world/gigs/<id>.md (read fresh on each request). Default ./world/gigs. */
  gigsDir?: string;
  /** Papers' data: origins, names, faces, reasons (Papers spec §6). */
  papersDir?: string;
  /** The splash library: world/splash/ (splashes.json and its images), read per request. Default ./world/splash. */
  splashDir?: string;
  /** The district load screen's art and subtitles: world/districts/ (<id>.webp, districts.json), read per request. Default ./world/districts. */
  districtsDir?: string;
  /** Art prompts (art/scenes/<room>.md): what each room's art shows, for scenario cards' narrator. Default ./art/scenes. */
  artScenesDir?: string;
  webDist: string | null;
  /** The game's shared sounds; unset, `<webDist>/sound`, or web/public/sound in dev. */
  webSoundDir?: string;
  /** The city map's data (districts, borders, places). Default ./map/lowlight.json. */
  mapFile?: string;
  /** Where OpenRouter is reached (tests point it at a stub). Default OPENROUTER_BASE_URL. */
  openrouterBaseUrl?: string;
  /** Playthroughs: index.json and one folder per playthrough. Default <dataDir>/playthroughs. */
  playthroughsDir: string;
  /** Tests and e2e only: at boot with no active playthrough, create and activate one. */
  autoPlaythrough?: boolean;
  /** Where bug reports are sent (BUG_RELAY_URL; the desktop build sets it). Unset: reports are only saved. */
  bugRelayUrl?: string | null;
  /** The game's log, whose tail rides with a bug report (LOG_FILE; the desktop app's server.log). */
  logFile?: string | null;
  /** The game's version (APP_VERSION; default: package.json's). */
  appVersion?: string;
  /** A test build's tag (APP_BUILD). */
  appBuild?: string | null;
  /** Where unsent bug reports are saved: LOG_FILE's folder, else <dataDir>/bug-reports. */
  reportsDir?: string;
  /** Host names accepted besides loopback (NIX_ROOM_ALLOWED_HOSTS, comma list): a tailnet name for play from a phone. */
  allowedHosts?: string[];
  /** Districts kept dark day and night (NIX_ROOM_OUTAGES, comma list): for live checks of blackouts on a scratch server, never for play. */
  forcedOutages?: string[];
  /** Blackout rates in place of map/city/districts/ (tests: `{}` for none). */
  outageRates?: Record<string, number>;
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const DEFAULT_PORT = 7700;
export const DEFAULT_MAP_FILE = './map/lowlight.json';
export const DEFAULT_GIGS_DIR = './world/gigs';
export const DEFAULT_PAPERS_DIR = './world/papers';

/**
 * Loads and validates server config from the environment. Throws on an invalid value. NIX_ROOM_TOKEN
 * is optional when `generatedToken` is given (the game's own, kept in data/settings.json).
 */
export function loadConfig(env: NodeJS.ProcessEnv, opts: { generatedToken?: () => string } = {}): Config {
  const token = env.NIX_ROOM_TOKEN ?? opts.generatedToken?.() ?? '';
  if (token.length < 16) {
    throw new Error('NIX_ROOM_TOKEN must be at least 16 characters');
  }
  const port = env.NIX_ROOM_PORT ? Number(env.NIX_ROOM_PORT) : DEFAULT_PORT;
  const dataDir = env.DATA_DIR ?? './data';
  return {
    port,
    token,
    dataDir,
    charactersDir: env.CHARACTERS_DIR ?? './characters',
    scenesDir: env.SCENES_DIR ?? './scenes',
    personaDir: env.PERSONA_DIR ?? './persona',
    loreDir: env.LORE_DIR ?? './world/lore',
    leadsDir: env.LEADS_DIR ?? './world/leads',
    questsDir: env.QUESTS_DIR ?? './world/quests',
    extrasDir: env.EXTRAS_DIR ?? './world/extras',
    gearDir: env.GEAR_DIR ?? './world/gear',
    crewDir: env.CREW_DIR ?? './world/crew',
    standingFile: env.STANDING_FILE ?? './world/standing.json',
    gigsDir: env.GIGS_DIR ?? DEFAULT_GIGS_DIR,
    papersDir: env.PAPERS_DIR ?? DEFAULT_PAPERS_DIR,
    splashDir: env.SPLASH_DIR ?? './world/splash',
    districtsDir: env.DISTRICTS_DIR ?? './world/districts',
    webDist: null,
    webSoundDir: env.WEB_SOUND_DIR || undefined,
    mapFile: env.MAP_FILE ?? DEFAULT_MAP_FILE,
    artScenesDir: env.ART_SCENES_DIR,
    openrouterBaseUrl: env.OPENROUTER_BASE_URL ?? OPENROUTER_BASE_URL,
    playthroughsDir: env.PLAYTHROUGHS_DIR ?? path.join(dataDir, 'playthroughs'),
    bugRelayUrl: env.BUG_RELAY_URL || null,
    logFile: env.LOG_FILE || null,
    appVersion: env.APP_VERSION || packageVersion(),
    appBuild: env.APP_BUILD || null,
    allowedHosts: (env.NIX_ROOM_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
    forcedOutages: (env.NIX_ROOM_OUTAGES ?? '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
    reportsDir: env.LOG_FILE ? path.dirname(env.LOG_FILE) : path.join(dataDir, 'bug-reports'),
  };
}

/** The repo's package.json version (npm run dev); '0.0.0' when it can't be read. */
function packageVersion(): string {
  try {
    return (JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
