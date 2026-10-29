import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { compareVersions, gateData, markVersion } from '../version-gate';
import { tempUserData, write } from './helpers';

describe('compareVersions', () => {
  it('orders prereleases numerically, and a release after its prereleases', () => {
    expect(compareVersions('0.1.0-preview.2', '0.1.0-preview.10')).toBe(-1);
    expect(compareVersions('0.1.0-preview.10', '0.1.0')).toBe(-1);
    expect(compareVersions('0.2.0-preview.1', '0.1.9')).toBe(1);
    expect(compareVersions('0.1.0-preview.3', '0.1.0-preview.3')).toBe(0);
  });
});

describe('gateData', () => {
  let ud: string;
  beforeEach(() => {
    ud = tempUserData();
  });
  const versionFile = () => path.join(ud, 'version.json');

  it('fresh when there is no data folder', () => {
    expect(gateData(ud, '0.1.0-preview.1')).toEqual({ kind: 'fresh' });
    expect(fs.readdirSync(ud)).toEqual([]);
  });

  it('backs up a data folder with no version.json as unknown, once', () => {
    write(ud, 'data/settings.json', '{}');
    expect(gateData(ud, '0.1.0-preview.1')).toEqual({ kind: 'upgraded', backup: path.join(ud, 'data.backup-unknown') });
    expect(fs.readFileSync(path.join(ud, 'data.backup-unknown/settings.json'), 'utf8')).toBe('{}');
    write(ud, 'data/settings.json', '{"changed":1}');
    gateData(ud, '0.1.0-preview.1');
    expect(fs.readFileSync(path.join(ud, 'data.backup-unknown/settings.json'), 'utf8')).toBe('{}');
  });

  it('backs up data from an older preview under its version', () => {
    write(ud, 'data/playthroughs/index.json', '[]');
    fs.writeFileSync(versionFile(), JSON.stringify({ lastVersion: '0.1.0-preview.1' }));
    expect(gateData(ud, '0.1.0-preview.2')).toEqual({ kind: 'upgraded', backup: path.join(ud, 'data.backup-0.1.0-preview.1') });
    expect(fs.readFileSync(path.join(ud, 'data.backup-0.1.0-preview.1/playthroughs/index.json'), 'utf8')).toBe('[]');
  });

  it('the same version does nothing', () => {
    write(ud, 'data/settings.json', '{}');
    fs.writeFileSync(versionFile(), JSON.stringify({ lastVersion: '0.1.0-preview.2' }));
    expect(gateData(ud, '0.1.0-preview.2')).toEqual({ kind: 'same' });
    expect(fs.readdirSync(ud).sort()).toEqual(['data', 'version.json']);
  });

  it('refuses data written by a newer build, without a backup', () => {
    write(ud, 'data/settings.json', '{}');
    fs.writeFileSync(versionFile(), JSON.stringify({ lastVersion: '0.1.0-preview.3' }));
    expect(gateData(ud, '0.1.0-preview.2')).toEqual({ kind: 'newer', dataVersion: '0.1.0-preview.3' });
    expect(fs.readdirSync(ud).sort()).toEqual(['data', 'version.json']);
  });

  it('a damaged version.json reads as unknown', () => {
    write(ud, 'data/settings.json', '{}');
    fs.writeFileSync(versionFile(), 'not json');
    expect(gateData(ud, '0.1.0-preview.2')).toEqual({ kind: 'upgraded', backup: path.join(ud, 'data.backup-unknown') });
  });

  it('a backup that fails partway leaves no backup folder, so the next launch tries again (review I1)', () => {
    write(ud, 'data/settings.json', '{}');
    write(ud, 'data/locked/room.db', 'db');
    fs.chmodSync(path.join(ud, 'data/locked/room.db'), 0o000);
    try {
      expect(() => gateData(ud, '0.1.0-preview.1')).toThrow();
    } finally {
      fs.chmodSync(path.join(ud, 'data/locked/room.db'), 0o644);
    }
    expect(fs.readdirSync(ud).filter((f) => f.startsWith('data.backup'))).toEqual([]);
    expect(gateData(ud, '0.1.0-preview.1')).toEqual({ kind: 'upgraded', backup: path.join(ud, 'data.backup-unknown') });
    expect(fs.readFileSync(path.join(ud, 'data.backup-unknown/locked/room.db'), 'utf8')).toBe('db');
  });

  it('a leftover partial copy from a crash is replaced, never counted as the backup', () => {
    write(ud, 'data/settings.json', '{"real":1}');
    write(ud, 'data.backup-unknown.partial/half.json', '{}');
    gateData(ud, '0.1.0-preview.1');
    expect(fs.readdirSync(path.join(ud, 'data.backup-unknown')).sort()).toEqual(['settings.json']);
    expect(fs.existsSync(path.join(ud, 'data.backup-unknown.partial'))).toBe(false);
  });

  it('a second unknown-version launch makes a fresh backup instead of trusting the old one (minor)', () => {
    write(ud, 'data/settings.json', '{"first":1}');
    gateData(ud, '0.1.0-preview.1');
    write(ud, 'data/settings.json', '{"second":1}');
    const again = gateData(ud, '0.1.0-preview.1');
    expect(again.kind).toBe('upgraded');
    const backup = (again as { backup: string }).backup;
    expect(path.basename(backup)).toMatch(/^data\.backup-unknown-\d{8}-\d{6}$/);
    expect(fs.readFileSync(path.join(backup, 'settings.json'), 'utf8')).toBe('{"second":1}');
    expect(fs.readFileSync(path.join(ud, 'data.backup-unknown/settings.json'), 'utf8')).toBe('{"first":1}');
  });

  it('a known older version is backed up once, however often it launches before markVersion', () => {
    write(ud, 'data/settings.json', '{}');
    fs.writeFileSync(versionFile(), JSON.stringify({ lastVersion: '0.1.0-preview.1' }));
    gateData(ud, '0.1.0-preview.2');
    gateData(ud, '0.1.0-preview.2');
    expect(fs.readdirSync(ud).filter((f) => f.startsWith('data.backup')).sort()).toEqual(['data.backup-0.1.0-preview.1']);
  });

  it('never writes version.json; markVersion does', () => {
    write(ud, 'data/settings.json', '{}');
    gateData(ud, '0.1.0-preview.1');
    expect(fs.existsSync(versionFile())).toBe(false);
    markVersion(ud, '0.1.0-preview.1');
    expect(JSON.parse(fs.readFileSync(versionFile(), 'utf8'))).toEqual({ lastVersion: '0.1.0-preview.1' });
    expect(gateData(ud, '0.1.0-preview.1')).toEqual({ kind: 'same' });
  });
});
