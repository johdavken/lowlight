import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { importLegacySettings } from '../src/migrate-settings';
import { openSettings, SETTINGS_FILE } from '../src/settings';
import { openDb } from '../src/db';
import { tempDir } from './fixtures/temp-dir';

const DEFAULTS: Record<string, string> = { 'nix-direct': 'z-ai/glm-5.2', cass: 'z-ai/glm-5.2' };
const defaultModel = (id: string) => DEFAULTS[id] ?? null;

function roomDb(charsDir: string, id: string, model: string | null) {
  fs.mkdirSync(path.join(charsDir, id), { recursive: true });
  const db = openDb(path.join(charsDir, id, 'room.db'), { defaultPlayer: 'you' });
  if (model) db.setMeta('backend.model', model);
  db.close();
}

function run(dataDir: string, charsDir: string | null, logs: string[] = []) {
  importLegacySettings({ dataDir, settings: openSettings(dataDir, () => {}), charsDir, defaultModel, log: (m) => logs.push(m) });
}

describe('importLegacySettings', () => {
  it('imports backends.json keys and models, then renames it', () => {
    const d = tempDir('nix-mig-set-');
    fs.writeFileSync(path.join(d, 'backends.json'), JSON.stringify({ openrouter: { apiKey: 'sk-or-1' }, other: { apiKey: 'k2' }, models: ['a/b', 'c/d'] }));
    run(d, null);
    const s = openSettings(d);
    expect(s.key('openrouter')).toBe('sk-or-1');
    expect(s.key('other')).toBe('k2');
    expect(s.recentModels()).toEqual(['a/b', 'c/d']);
    expect(fs.existsSync(path.join(d, 'backends.json'))).toBe(false);
    expect(fs.existsSync(path.join(d, 'backends.json.imported'))).toBe(true);
  });

  it('imports per-character model meta that differs from her default', () => {
    const d = tempDir('nix-mig-set-');
    const chars = path.join(d, 'pt', 'chars');
    roomDb(chars, 'nix-direct', 'x/y');
    roomDb(chars, 'cass', 'z-ai/glm-5.2');
    roomDb(chars, 'hicks', null);
    run(d, chars);
    const s = openSettings(d);
    expect(s.characterModel('nix-direct')).toBe('x/y');
    expect(s.characterModel('cass')).toBeNull();
    expect(s.characterModel('hicks')).toBeNull();
  });

  it('is a no-op when settings.json already exists', () => {
    const d = tempDir('nix-mig-set-');
    openSettings(d).setKey('openrouter', 'sk-or-new');
    fs.writeFileSync(path.join(d, 'backends.json'), JSON.stringify({ openrouter: { apiKey: 'sk-or-old' } }));
    run(d, null);
    expect(openSettings(d).key('openrouter')).toBe('sk-or-new');
    expect(fs.existsSync(path.join(d, 'backends.json'))).toBe(true);
  });

  it('a broken backends.json changes nothing', () => {
    const d = tempDir('nix-mig-set-');
    fs.writeFileSync(path.join(d, 'backends.json'), '{ "openrouter": ');
    const logs: string[] = [];
    run(d, null, logs);
    expect(fs.existsSync(path.join(d, 'backends.json'))).toBe(true);
    expect(fs.existsSync(path.join(d, SETTINGS_FILE))).toBe(false);
    expect(logs.some((m) => m.includes('backends.json'))).toBe(true);
  });

  it('no backends.json and no playthrough → nothing written', () => {
    const d = tempDir('nix-mig-set-');
    run(d, null);
    expect(fs.existsSync(path.join(d, SETTINGS_FILE))).toBe(false);
  });
});
