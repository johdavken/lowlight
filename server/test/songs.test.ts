import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { beatSongs, districtSongFiles, gameSongs } from '../src/songs';

let dir: string;
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function pack(name: string, files: string[]): void {
  fs.mkdirSync(path.join(dir, name, '_music'), { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(dir, name, '_music', f), 'ogg');
}

describe('gameSongs', () => {
  it('lists every pack\'s songs by title, with their urls', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'game-songs-'));
    pack('ribbon', ['What Hae Serves.ogg', 'Nix.ogg']);
    pack('default', ['Rain Tape (2).ogg']);
    fs.mkdirSync(path.join(dir, 'lowlight', 'splash'), { recursive: true });
    expect(gameSongs(dir)).toEqual([
      { title: 'Nix', url: '/scenes/ribbon/_music/Nix.ogg' },
      { title: 'Rain Tape (2)', url: '/scenes/default/_music/Rain%20Tape%20(2).ogg' },
      { title: 'What Hae Serves', url: '/scenes/ribbon/_music/What%20Hae%20Serves.ogg' },
    ]);
  });

  it('skips files that aren\'t songs, songs still converting, and a name another pack already has', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'game-songs-'));
    pack('a', ['Nix.ogg', 'notes.txt', '.converting-abc.ogg']);
    pack('b', ['Nix.ogg']);
    expect(gameSongs(dir)).toEqual([{ title: 'Nix', url: '/scenes/a/_music/Nix.ogg' }]);
  });

  it('is empty without a scenes folder', () => {
    dir = path.join(os.tmpdir(), 'game-songs-missing');
    expect(gameSongs(dir)).toEqual([]);
  });
});

describe('beatSongs', () => {
  it('lists the tracks in _beats, which the game\'s song list leaves out', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beat-songs-'));
    pack('nexus', ['Nix.ogg']);
    fs.mkdirSync(path.join(dir, 'nexus', '_beats'));
    for (const f of ['Old Reel.ogg', 'notes.txt', '.converting-abc.ogg']) fs.writeFileSync(path.join(dir, 'nexus', '_beats', f), 'ogg');
    expect(beatSongs(dir)).toEqual([{ title: 'Old Reel', url: '/scenes/nexus/_beats/Old%20Reel.ogg' }]);
    expect(gameSongs(dir).map((s) => s.title)).toEqual(['Nix']);
  });

  it('is empty without a scenes folder', () => {
    dir = path.join(os.tmpdir(), 'beat-songs-missing');
    expect(beatSongs(dir)).toEqual([]);
  });
});

describe('districtSongFiles', () => {
  const warnings: string[] = [];
  const read = () => districtSongFiles(path.join(dir, 'districts'), path.join(dir, 'scenes'), (m) => warnings.push(m));
  const write = (text: string) => fs.writeFileSync(path.join(dir, 'districts', 'districts.json'), text);

  beforeEach(() => {
    warnings.length = 0;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nix-district-songs-'));
    fs.mkdirSync(path.join(dir, 'districts'));
    fs.mkdirSync(path.join(dir, 'scenes', 'spine', '_music'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'scenes', 'spine', '_music', 'Road.ogg'), 'ogg');
  });

  it("keeps a song that's in the district's _music", () => {
    write(JSON.stringify({ spine: { subtitle: 'The Road', song: 'Road.ogg' }, karasu: { subtitle: 'Old Town' } }));
    expect(read()).toEqual({ spine: 'Road.ogg' });
    expect(warnings).toEqual([]);
  });

  it("warns about and drops one that isn't, or that points elsewhere", () => {
    write(JSON.stringify({ spine: { song: 'Gone.ogg' }, marsh: { song: '../spine/_music/Road.ogg' } }));
    expect(read()).toEqual({});
    expect(warnings).toHaveLength(2);
  });

  it('warns about a song that is not text', () => {
    write(JSON.stringify({ spine: { song: 5 } }));
    expect(read()).toEqual({});
    expect(warnings).toHaveLength(1);
  });

  it('survives a missing file and a broken one', () => {
    expect(read()).toEqual({});
    expect(warnings).toEqual([]);
    write('{');
    expect(read()).toEqual({});
    expect(warnings).toHaveLength(1);
  });
});
