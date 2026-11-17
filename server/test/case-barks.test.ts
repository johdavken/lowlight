import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { caseBarks } from '../src/cases';

// The case's recorded barks (The Fourteenth voice script): world/cases/voice/<case>/<group>[-<take>].ogg, by group.
let dir = '';
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('caseBarks', () => {
  it('groups a case\'s clips by name before the take, as urls, in order', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'barks-'));
    fs.mkdirSync(path.join(dir, 'voice', 'mini'), { recursive: true });
    for (const f of ['bounce1-b.ogg', 'bounce1-a.ogg', 'kat.ogg', 'notes.txt', 'Bad Name.ogg']) fs.writeFileSync(path.join(dir, 'voice', 'mini', f), '');
    expect(caseBarks(dir, 'mini')).toEqual({ bounce1: ['/api/cases/voice/mini/bounce1-a.ogg', '/api/cases/voice/mini/bounce1-b.ogg'], kat: ['/api/cases/voice/mini/kat.ogg'] });
    expect(caseBarks(dir, 'none')).toEqual({});
  });
  it("The Fourteenth ships its five groups", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'barks-'));
    const b = caseBarks('world/cases', 'the-fourteenth');
    expect(Object.keys(b).sort()).toEqual(['bounce1', 'bounce2', 'clash', 'gone', 'kat']);
    expect(b.bounce1).toHaveLength(3);
    expect(b.kat).toHaveLength(1);
  });
});
