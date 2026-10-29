import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openSettings, readRecentModels, readSettingsKeys, SETTINGS_FILE } from '../src/settings';
import { MODEL_PICKS } from '../src/default-models';
import { tempDir } from './fixtures/temp-dir';

const file = (d: string) => path.join(d, SETTINGS_FILE);

describe('settings', () => {
  it('starts empty with no file and writes nothing until a change', () => {
    const d = tempDir('nix-set-');
    const s = openSettings(d);
    expect(s.exists()).toBe(false);
    expect(s.key('openrouter')).toBeNull();
    expect(s.recentModels()).toEqual([]);
    expect(s.characterModel('nix')).toBeNull();
    expect(fs.existsSync(file(d))).toBe(false);
  });

  it('setKey persists with mode 0600', () => {
    const d = tempDir('nix-set-');
    openSettings(d).setKey('openrouter', 'sk-or-1');
    const again = openSettings(d);
    expect(again.exists()).toBe(true);
    expect(again.key('openrouter')).toBe('sk-or-1');
    expect(fs.statSync(file(d)).mode & 0o777).toBe(0o600);
  });

  it('deleteKey removes it', () => {
    const d = tempDir('nix-set-');
    const s = openSettings(d);
    s.setKey('openrouter', 'sk-or-1');
    s.deleteKey('openrouter');
    expect(openSettings(d).key('openrouter')).toBeNull();
  });

  it('two writes in a row both survive', () => {
    const d = tempDir('nix-set-');
    const s = openSettings(d);
    s.setKey('openrouter', 'sk-or-1');
    s.pushRecent('a/b');
    const again = openSettings(d);
    expect(again.key('openrouter')).toBe('sk-or-1');
    expect(again.recentModels()).toEqual(['a/b']);
  });

  it('pushRecent dedupes, puts newest first, caps at 8', () => {
    const d = tempDir('nix-set-');
    const s = openSettings(d);
    for (let i = 0; i < 10; i++) s.pushRecent(`m${i}`);
    s.pushRecent('m3');
    expect(s.recentModels()).toEqual(['m3', 'm9', 'm8', 'm7', 'm6', 'm5', 'm4', 'm2']);
    expect(openSettings(d).recentModels()).toEqual(['m3', 'm9', 'm8', 'm7', 'm6', 'm5', 'm4', 'm2']);
  });

  it('narratorThinking is auto by default, persists, and auto leaves no field', () => {
    const d = tempDir('nix-set-');
    const s = openSettings(d);
    expect(s.narratorThinking()).toBe('auto');
    s.setNarratorThinking('low');
    expect(openSettings(d).narratorThinking()).toBe('low');
    s.setNarratorThinking('auto');
    expect(openSettings(d).narratorThinking()).toBe('auto');
    expect(JSON.parse(fs.readFileSync(file(d), 'utf8'))).not.toHaveProperty('narratorThinking');
  });

  it('an unknown narratorThinking in the file reads as auto', () => {
    const d = tempDir('nix-set-');
    fs.writeFileSync(file(d), JSON.stringify({ version: 1, keys: {}, recentModels: [], characterModels: {}, narratorThinking: 'high' }));
    expect(openSettings(d).narratorThinking()).toBe('auto');
  });

  it('setCharacterModel(id, null) deletes the entry', () => {
    const d = tempDir('nix-set-');
    const s = openSettings(d);
    s.setCharacterModel('nix', 'x/y');
    expect(openSettings(d).characterModel('nix')).toBe('x/y');
    s.setCharacterModel('nix', null);
    expect(openSettings(d).characterModel('nix')).toBeNull();
  });

  it('roomToken is generated once, 43 chars base64url, and stable across re-open', () => {
    const d = tempDir('nix-set-');
    const t = openSettings(d).roomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(openSettings(d).roomToken()).toBe(t);
  });

  it('a bad file is quarantined, not overwritten', () => {
    const d = tempDir('nix-set-');
    fs.writeFileSync(file(d), '{nope');
    const logs: string[] = [];
    const s = openSettings(d, (m) => logs.push(m));
    expect(s.exists()).toBe(false);
    expect(s.key('openrouter')).toBeNull();
    const bad = fs.readdirSync(d).filter((f) => f.startsWith('settings.json.bad-'));
    expect(bad).toHaveLength(1);
    expect(fs.readFileSync(path.join(d, bad[0]!), 'utf8')).toBe('{nope');
    expect(fs.existsSync(file(d))).toBe(false);
    expect(logs.some((m) => m.includes('settings.json') && !m.includes('{nope'))).toBe(true);
  });

  it('wrong shape (array) is quarantined too', () => {
    const d = tempDir('nix-set-');
    fs.writeFileSync(file(d), '[1,2]');
    const s = openSettings(d, () => {});
    expect(s.exists()).toBe(false);
    expect(fs.readdirSync(d).some((f) => f.startsWith('settings.json.bad-'))).toBe(true);
  });

  it('the write is atomic: no temp file is left behind', () => {
    const d = tempDir('nix-set-');
    const s = openSettings(d);
    s.setKey('openrouter', 'sk-or-1');
    s.pushRecent('a/b');
    expect(fs.readdirSync(d)).toEqual([SETTINGS_FILE]);
  });

  it('importLegacy writes everything at once', () => {
    const d = tempDir('nix-set-');
    openSettings(d).importLegacy({ keys: { openrouter: 'sk-or-1', other: 'k2' }, recentModels: ['a/b', 'c/d'], characterModels: { nix: 'x/y' } });
    const s = openSettings(d);
    expect(s.key('other')).toBe('k2');
    expect(s.recentModels()).toEqual(['a/b', 'c/d']);
    expect(s.characterModel('nix')).toBe('x/y');
  });

  it('readSettingsKeys reports presence only', () => {
    const d = tempDir('nix-set-');
    openSettings(d).setKey('openrouter', 'sk-or-secret');
    const keys = readSettingsKeys(d);
    expect(keys).toEqual({ openrouter: true });
    expect(JSON.stringify(keys)).not.toContain('sk-or-secret');
  });

  it('the read-only helpers never write or quarantine', () => {
    const d = tempDir('nix-set-');
    fs.writeFileSync(file(d), '{nope');
    expect(readSettingsKeys(d)).toEqual({});
    expect(readRecentModels(d)).toEqual([]);
    expect(fs.readdirSync(d)).toEqual([SETTINGS_FILE]);
  });

  it('MODEL_PICKS are the three ids in order', () => {
    expect(MODEL_PICKS.map((p) => p.id)).toEqual(['z-ai/glm-5.2', 'deepseek/deepseek-v4-pro-0813', 'anthropic/claude-sonnet-5.5']);
    for (const p of MODEL_PICKS) expect(p.why.length).toBeGreaterThan(0);
  });
});
