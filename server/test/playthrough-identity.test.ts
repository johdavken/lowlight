import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { copyIdentityOverrides, identityWithOverride, IDENTITY_OVERRIDE } from '../src/playthrough-identity';
import { createPlaythroughs, type LiveDbs, type SaveRequest } from '../src/playthroughs';
import { tempDir } from './fixtures/temp-dir';

const shared = () => 'the shared identity';

describe('identityWithOverride', () => {
  it('reads the shared identity when her folder has no override', () => {
    const dir = tempDir('nix-pid-');
    expect(identityWithOverride(dir, shared)()).toBe('the shared identity');
  });

  it("reads her playthrough's identity.md when there is one, live on each call", () => {
    const dir = tempDir('nix-pid-');
    const identity = identityWithOverride(dir, shared);
    fs.writeFileSync(path.join(dir, IDENTITY_OVERRIDE), 'a different woman');
    expect(identity()).toBe('a different woman');
    fs.writeFileSync(path.join(dir, IDENTITY_OVERRIDE), 'changed again');
    expect(identity()).toBe('changed again');
    fs.rmSync(path.join(dir, IDENTITY_OVERRIDE));
    expect(identity()).toBe('the shared identity');
  });

  it('an empty override is no override', () => {
    const dir = tempDir('nix-pid-');
    fs.writeFileSync(path.join(dir, IDENTITY_OVERRIDE), '  \n');
    expect(identityWithOverride(dir, shared)()).toBe('the shared identity');
  });
});

describe('copyIdentityOverrides', () => {
  it("copies each contact's override, and only those", () => {
    const from = tempDir('nix-pid-');
    const to = tempDir('nix-pid-');
    fs.mkdirSync(path.join(from, 'cass'));
    fs.mkdirSync(path.join(from, 'hicks'));
    fs.writeFileSync(path.join(from, 'cass', IDENTITY_OVERRIDE), 'cass here');
    fs.writeFileSync(path.join(from, 'hicks', 'room.db'), 'db');
    copyIdentityOverrides(from, to);
    expect(fs.readFileSync(path.join(to, 'cass', IDENTITY_OVERRIDE), 'utf8')).toBe('cass here');
    expect(fs.existsSync(path.join(to, 'hicks'))).toBe(false);
  });

  it('a missing source folder copies nothing', () => {
    const to = tempDir('nix-pid-');
    copyIdentityOverrides(path.join(to, 'nope'), to);
    expect(fs.readdirSync(to)).toEqual([]);
  });
});

const NOW = new Date(2026, 9, 7, 21, 40).getTime();
const req: SaveRequest = {
  kind: 'manual',
  trigger: 'manual',
  name: 'a save',
  location: { contactId: 'nix', sceneId: 'karasu/noodle-stall' },
  timeOfDay: 'dusk',
  participants: ['nix'],
  lastLine: { speaker: 'Nix', text: 'Say it, then.' },
};
const dbs = (ids: string[]): LiveDbs =>
  new Map(ids.map((id) => [id, { vacuumInto: (p: string) => fs.writeFileSync(p, `${id}:db`), fingerprint: () => [1] }]));

describe('playthroughs keep identity overrides', () => {
  function setup() {
    const root = tempDir('nix-pt-');
    let n = 0;
    const pts = createPlaythroughs(root, () => NOW, () => String(n++).padStart(4, '0'), () => {});
    const pt = pts.create({ player: 'hicks', startContact: 'nix' });
    // Cass's db is open; Ember's isn't, but her override still belongs to the playthrough.
    for (const c of ['cass', 'ember']) {
      fs.mkdirSync(path.join(pts.charsDir(pt.id), c), { recursive: true });
      fs.writeFileSync(path.join(pts.charsDir(pt.id), c, IDENTITY_OVERRIDE), `${c} override`);
    }
    return { pts, pt };
  }

  it('a save carries them and a fork from it has them', () => {
    const { pts, pt } = setup();
    const save = pts.save(pt.id, req, dbs(['cass']));
    if (save === 'unchanged') throw new Error('unchanged');
    const forked = pts.fork(save.id);
    for (const c of ['cass', 'ember']) {
      expect(fs.readFileSync(path.join(pts.charsDir(forked.id), c, IDENTITY_OVERRIDE), 'utf8')).toBe(`${c} override`);
    }
  });

  it('copyLive carries them', () => {
    const { pts, pt } = setup();
    const copy = pts.copyLive(pt.id, dbs(['cass']), { ...pt, name: 'copy' });
    for (const c of ['cass', 'ember']) {
      expect(fs.readFileSync(path.join(pts.charsDir(copy.id), c, IDENTITY_OVERRIDE), 'utf8')).toBe(`${c} override`);
    }
  });
});
