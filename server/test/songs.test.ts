import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { gameSongs } from '../src/songs';

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
