import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { soundPresent } from '../src/sound-present';

let dir: string;
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function tree(files: string[]): void {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-present-'));
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), 'x');
  }
}

describe('soundPresent', () => {
  it('lists the audio under the web sound folder and the scenes as decoded urls, sorted', () => {
    tree([
      'web/sound/ui/move.ogg',
      'web/sound/music/Lost in Lowlight.ogg',
      'web/sound/.converting-x.ogg',
      'scenes/karasu/noodle-stall/sound/bed.ogg',
      'scenes/karasu/noodle-stall/scene.json',
      'scenes/karasu/_music/Nix.ogg',
    ]);
    expect(soundPresent(path.join(dir, 'web/sound'), path.join(dir, 'scenes'))).toEqual([
      '/scenes/karasu/_music/Nix.ogg',
      '/scenes/karasu/noodle-stall/sound/bed.ogg',
      '/sound/music/Lost in Lowlight.ogg',
      '/sound/ui/move.ogg',
    ]);
  });

  it('a missing folder lists nothing for it', () => {
    tree(['web/sound/ui/move.ogg']);
    expect(soundPresent(path.join(dir, 'web/sound'), path.join(dir, 'nope'))).toEqual(['/sound/ui/move.ogg']);
    expect(soundPresent(path.join(dir, 'nope'), path.join(dir, 'nope'))).toEqual([]);
  });
});
