import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadResidents, residentInfo, sceneResidents } from '../src/residents';

const CHARACTERS = path.join(__dirname, '..', '..', 'characters');
let root: string;
const warnings: string[] = [];
const warn = (m: string) => warnings.push(m);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'residents-'));
  warnings.length = 0;
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function folder(id: string, character: object): void {
  fs.mkdirSync(path.join(root, id), { recursive: true });
  fs.writeFileSync(path.join(root, id, 'character.json'), JSON.stringify(character));
}

describe('loadResidents', () => {
  it('loads Hae from the real characters folder', () => {
    const hae = loadResidents(CHARACTERS, warn).get('hae')!;
    expect(hae).toBeDefined();
    expect(hae.name).toBe('Hae');
    expect(hae.accent).toBe('#ff8a3c');
    expect(hae.sprite.outfitByScene).toEqual({ 'karasu/noodle-stall': 'work2' });
    expect(Object.keys(hae.sprite.expressions)).toEqual(['happy', 'annoyed', 'concerned', 'angry']);
    expect(hae.voice()).toContain('Hae');
    expect(hae.face).toEqual({ x: 0.47, y: 0.16 });
    expect(warnings).toEqual([]);
  });

  it('only loads fixed characters', () => {
    const residents = loadResidents(CHARACTERS, warn);
    expect(residents.has('nix')).toBe(false);
    expect(residents.has('cass')).toBe(false);
  });

  it('skips a fixed character without a sprite, with a warning', () => {
    folder('ghost', { name: 'Ghost', kind: 'fixed' });
    expect(loadResidents(root, warn).has('ghost')).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('ghost');
  });

  it('ignores a folder without kind, silently', () => {
    folder('plain', { name: 'Plain' });
    expect(loadResidents(root, warn).size).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('resolves her outfitWears for her outfits', () => {
    fs.mkdirSync(path.join(root, 'stall'), { recursive: true });
    for (const f of ['s.png', 'w.png']) fs.copyFileSync(path.join(CHARACTERS, 'ember', 'ember-happy.png'), path.join(root, 'stall', f));
    folder('stall', { name: 'Stall', kind: 'fixed', sprite: { src: 's.png' }, outfits: { work: 'w.png' }, outfitWears: { work: 'apron' } });
    expect(loadResidents(root, warn).get('stall')!.sprite.outfitWears).toEqual({ work: 'apron' });
  });

  it('reads her voice each time it is asked', () => {
    fs.cpSync(path.join(CHARACTERS, 'hae'), path.join(root, 'hae'), { recursive: true });
    const hae = loadResidents(root, warn).get('hae')!;
    fs.writeFileSync(path.join(root, 'hae', 'voice.md'), 'NEW VOICE');
    expect(hae.voice()).toBe('NEW VOICE');
  });
});

describe('residentInfo', () => {
  it('points her images at the residents routes', () => {
    const info = residentInfo(loadResidents(CHARACTERS, warn).get('hae')!);
    expect(info.id).toBe('hae');
    expect(info.sprite.url).toBe('/api/residents/hae/sprite');
    expect(info.sprite.outfits!.work2).toBe('/api/residents/hae/outfit/work2');
    expect(info.sprite.expressions!.happy).toBe('/api/residents/hae/sprite/happy');
    expect(info.sprite.outfitByScene).toEqual({ 'karasu/noodle-stall': 'work2' });
    expect(info.thumb).toBe('/api/residents/hae/thumb');
  });
});

describe('a resident\'s snapped art', () => {
  it('reaches her info as pixel: true', () => {
    fs.cpSync(path.join(CHARACTERS, 'hae'), path.join(root, 'hae'), { recursive: true });
    const file = path.join(root, 'hae', 'character.json');
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    const { pixel: _, ...smooth } = c.sprite;
    fs.writeFileSync(file, JSON.stringify({ ...c, sprite: smooth }));
    expect(residentInfo(loadResidents(root, warn).get('hae')!).sprite).not.toHaveProperty('pixel');
    fs.writeFileSync(file, JSON.stringify({ ...c, sprite: { ...c.sprite, pixel: true } }));
    expect(residentInfo(loadResidents(root, warn).get('hae')!).sprite.pixel).toBe(true);
  });
});

describe('a resident\'s stage height', () => {
  it('reaches her info like a contact\'s', () => {
    fs.cpSync(path.join(CHARACTERS, 'hae'), path.join(root, 'hae'), { recursive: true });
    const file = path.join(root, 'hae', 'character.json');
    const c = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...c, sprite: { ...c.sprite, height: 0.9 } }));
    expect(residentInfo(loadResidents(root, warn).get('hae')!).sprite.height).toBe(0.9);
  });
});

describe('sceneResidents', () => {
  const residents = () => loadResidents(CHARACTERS, warn);
  const scene = (id: string, resident?: { character: string; scale: number }) => ({ id, ...(resident ? { resident } : {}) });

  it('maps each scene naming a loaded resident to her', () => {
    const map = sceneResidents([scene('noodle-stall', { character: 'hae', scale: 0.78 }), scene('rooftop')], residents(), warn);
    expect([...map.keys()]).toEqual(['noodle-stall']);
    expect(map.get('noodle-stall')!.name).toBe('Hae');
    expect(warnings).toEqual([]);
  });

  it('a room named in full finds her (the city-wide map)', () => {
    const map = sceneResidents([scene('karasu/noodle-stall', { character: 'hae', scale: 0.78 })], residents(), warn);
    expect(map.get('karasu/noodle-stall')!.name).toBe('Hae');
  });

  it('drops a resident that is not a fixed character, with one warning', () => {
    const map = sceneResidents([scene('bar', { character: 'nix', scale: 0.78 })], residents(), warn);
    expect(map.size).toBe(0);
    expect(warnings).toEqual(["scene 'bar': resident 'nix' isn't a fixed character; ignoring it"]);
  });
});
