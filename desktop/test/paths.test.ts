import path from 'node:path';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import { desktopFolders, readBugRelay, serverEnv, userDataFolder } from '../paths';

const ud = path.join('/home', 'Jöhn Smith', '.config', 'Lowlight');
const content = path.join('/opt', 'Low light', 'resources', 'content');
const web = path.join('/opt', 'Low light', 'resources', 'web');

describe('desktopFolders', () => {
  it('puts data and logs under userData', () => {
    expect(desktopFolders(ud, content, web)).toEqual({ data: path.join(ud, 'data'), logs: path.join(ud, 'logs'), content, webDist: web, userData: ud });
  });
});

describe('serverEnv', () => {
  it('points every folder at the app, never passes a token or a fixed port', () => {
    const env = serverEnv(desktopFolders(ud, content, web), { PATH: '/bin', NIX_ROOM_PORT: '7700', NIX_ROOM_TOKEN: 't'.repeat(20), DATA_DIR: '/elsewhere', DISTRICTS_DIR: '/elsewhere', LEADS_DIR: '/elsewhere', QUESTS_DIR: '/elsewhere', CREW_DIR: '/elsewhere' });
    expect(env).toMatchObject({
      PATH: '/bin',
      DATA_DIR: path.join(ud, 'data'),
      SCENES_DIR: path.join(content, 'scenes'),
      CHARACTERS_DIR: path.join(content, 'characters'),
      PERSONA_DIR: path.join(content, 'persona'),
      MAP_FILE: path.join(content, 'map', 'lowlight.json'),
      LORE_DIR: path.join(content, 'world', 'lore'),
      LEADS_DIR: path.join(content, 'world', 'leads'),
      QUESTS_DIR: path.join(content, 'world', 'quests'),
      EXTRAS_DIR: path.join(content, 'world', 'extras'),
      GEAR_DIR: path.join(content, 'world', 'gear'),
      CREW_DIR: path.join(content, 'world', 'crew'),
      STANDING_FILE: path.join(content, 'world', 'standing.json'),
      SPLASH_DIR: path.join(content, 'world', 'splash'),
      GIGS_DIR: path.join(content, 'world', 'gigs'),
      PAPERS_DIR: path.join(content, 'world', 'papers'),
      DISTRICTS_DIR: path.join(content, 'world', 'districts'),
      ART_SCENES_DIR: path.join(content, 'art', 'scenes'),
      WEB_DIST: web,
      NIX_ROOM_PORT: '0',
      NODE_ENV: 'production',
    });
    expect(env.LEGACY_DIR).toBeUndefined();
    expect(env.NIX_ROOM_TOKEN).toBeUndefined();
  });

  it("a player's own PAPERS_DIR never reaches the packaged server", () => {
    const f = desktopFolders(ud, content, web);
    expect(serverEnv(f, { PAPERS_DIR: '/elsewhere' }).PAPERS_DIR).toBe(path.join(content, 'world', 'papers'));
  });

  it('keeps OPENROUTER_BASE_URL only under LOWLIGHT_TEST', () => {
    const f = desktopFolders(ud, content, web);
    expect(serverEnv(f, { OPENROUTER_BASE_URL: 'http://evil' }).OPENROUTER_BASE_URL).toBeUndefined();
    expect(serverEnv(f, { OPENROUTER_BASE_URL: 'http://127.0.0.1:9/v1', LOWLIGHT_TEST: '1' }).OPENROUTER_BASE_URL).toBe('http://127.0.0.1:9/v1');
  });

  it('drops every other server setting from the environment', () => {
    const env = serverEnv(desktopFolders(ud, content, web), { PLAYTHROUGHS_DIR: '/x', CHARACTERS_DIR: '/y', OPENROUTER_API_KEY: 'sk-or-real' });
    expect(env.PLAYTHROUGHS_DIR).toBeUndefined();
    expect(env.CHARACTERS_DIR).toBe(path.join(content, 'characters'));
    expect(env.OPENROUTER_API_KEY).toBeUndefined();
  });
});

describe('userDataFolder', () => {
  it('the installed app uses Lowlight; an unpackaged run keeps its own Lowlight-dev, so a dev build never stamps the patron saves (review)', () => {
    const appData = path.join('/home', 'Jöhn Smith', '.config');
    expect(userDataFolder(appData, true)).toBe(path.join(appData, 'Lowlight'));
    expect(userDataFolder(appData, false)).toBe(path.join(appData, 'Lowlight-dev'));
  });
});

describe('serverEnv bug reports', () => {
  const f = desktopFolders(ud, content, web);
  it('sets the version, build, relay and log file', () => {
    const env = serverEnv(f, {}, { version: '0.1.0-preview.2', build: 'test-1', bugRelay: 'https://r.workers.dev' });
    expect(env).toMatchObject({ APP_VERSION: '0.1.0-preview.2', APP_BUILD: 'test-1', BUG_RELAY_URL: 'https://r.workers.dev', LOG_FILE: path.join(ud, 'logs', 'server.log') });
  });
  it('leaves out an unset build and relay, and a player can never set them', () => {
    const env = serverEnv(f, { BUG_RELAY_URL: 'https://evil', APP_BUILD: 'x', APP_VERSION: '6.6.6', LOG_FILE: '/etc/passwd' }, { version: '1.0.0', build: null, bugRelay: null });
    expect(env.BUG_RELAY_URL).toBeUndefined();
    expect(env.APP_BUILD).toBeUndefined();
    expect(env.APP_VERSION).toBe('1.0.0');
    expect(env.LOG_FILE).toBe(path.join(ud, 'logs', 'server.log'));
  });
});

describe('readBugRelay', () => {
  it('reads report.json in the content folder; null when missing, broken or not https', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-'));
    expect(readBugRelay(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, 'report.json'), '{ nope');
    expect(readBugRelay(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ bugRelay: 'http://plain' }));
    expect(readBugRelay(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ bugRelay: 'https://r.workers.dev' }));
    expect(readBugRelay(dir)).toBe('https://r.workers.dev');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
