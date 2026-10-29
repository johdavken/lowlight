import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig room token', () => {
  it('uses the generated token when NIX_ROOM_TOKEN is unset', () => {
    expect(loadConfig({}, { generatedToken: () => 'g'.repeat(43) }).token).toBe('g'.repeat(43));
  });

  it('the env token wins over the generator', () => {
    let asked = false;
    const cfg = loadConfig({ NIX_ROOM_TOKEN: 'e'.repeat(16) }, { generatedToken: () => ((asked = true), 'g'.repeat(43)) });
    expect(cfg.token).toBe('e'.repeat(16));
    expect(asked).toBe(false);
  });

  it('still throws with neither', () => {
    expect(() => loadConfig({})).toThrow('NIX_ROOM_TOKEN must be at least 16 characters');
  });

  it('a short env token still throws', () => {
    expect(() => loadConfig({ NIX_ROOM_TOKEN: 'short' }, { generatedToken: () => 'g'.repeat(43) })).toThrow('NIX_ROOM_TOKEN must be at least 16 characters');
  });
});

describe('loadConfig bug reports', () => {
  const T = { NIX_ROOM_TOKEN: 't'.repeat(16) };
  it('reads the relay, log, version and build', () => {
    const cfg = loadConfig({ ...T, BUG_RELAY_URL: 'https://r.workers.dev', LOG_FILE: '/logs/server.log', APP_VERSION: '9.9.9', APP_BUILD: 'test-1' });
    expect(cfg).toMatchObject({ bugRelayUrl: 'https://r.workers.dev', logFile: '/logs/server.log', appVersion: '9.9.9', appBuild: 'test-1', reportsDir: '/logs' });
  });
  it('without them: no relay, no log, package.json version, reports under data', () => {
    const cfg = loadConfig({ ...T, DATA_DIR: '/d' });
    expect(cfg).toMatchObject({ bugRelayUrl: null, logFile: null, appBuild: null, reportsDir: '/d/bug-reports' });
    expect(cfg.appVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('loadConfig and Hermes', () => {
  it('HERMES_* variables are ignored', () => {
    const cfg = loadConfig({ NIX_ROOM_TOKEN: 'x'.repeat(16), HERMES_HOME: '/x', HERMES_API_KEY: 'k', HERMES_BASE_URL: 'http://127.0.0.1:8642' });
    expect(Object.keys(cfg).filter((k) => /hermes/i.test(k))).toEqual([]);
  });
});

describe('loadConfig allowed hosts', () => {
  const T = { NIX_ROOM_TOKEN: 't'.repeat(16) };
  it('reads NIX_ROOM_ALLOWED_HOSTS as a comma list, trimmed and lowercased', () => {
    expect(loadConfig({ ...T, NIX_ROOM_ALLOWED_HOSTS: ' Omarken.tail.ts.net, , box.local ' }).allowedHosts).toEqual(['omarken.tail.ts.net', 'box.local']);
  });
  it('is empty when unset', () => {
    expect(loadConfig(T).allowedHosts).toEqual([]);
  });
});
