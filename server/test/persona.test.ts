import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { oneLine, personaLine, readPersonaCharacterId } from '../src/persona';
import { createPlayers } from '../src/players';
import { tempDir } from './fixtures/temp-dir';

let dir: string;
const write = (o: unknown) => fs.writeFileSync(path.join(dir, 'persona.json'), typeof o === 'string' ? o : JSON.stringify(o));

beforeEach(() => {
  dir = tempDir('persona-');
});

describe('persona.json names the default player', () => {
  it("{ character: 'hicks' } with no characters/hicks → the default player id is still 'hicks'", () => {
    write({ character: 'hicks' });
    const characterId = readPersonaCharacterId(dir);
    expect(characterId).toBe('hicks');
    const players = createPlayers({ records: () => [], characterId });
    expect(players.defaultId).toBe('hicks');
    expect(players.resolve(undefined).id).toBe('hicks');
  });

  it('older inline fields beside the character are ignored, not an error', () => {
    write({ character: 'hicks', name: 'Tester', description: 'x', sprite: { src: 'me.png' } });
    expect(readPersonaCharacterId(dir)).toBe('hicks');
  });

  it("no character named (no file, inline persona, invalid JSON) → no id, so the default stays 'you'", () => {
    expect(readPersonaCharacterId(dir)).toBeNull();
    write({ name: 'Dutch' });
    expect(readPersonaCharacterId(dir)).toBeNull();
    write('{ not json');
    expect(readPersonaCharacterId(dir)).toBeNull();
    expect(createPlayers({ records: () => [], characterId: null }).defaultId).toBe('you');
  });
});

describe('personaLine (Review Focus 3)', () => {
  it('name and description, or just the name', () => {
    expect(personaLine({ name: 'Hicks', description: 'Runs the crew.', pronoun: 'he' })).toBe('[you: Hicks (he) — Runs the crew.]');
    expect(personaLine({ name: 'Hicks', description: '', pronoun: 'he' })).toBe('[you: Hicks (he)]');
  });

  it('stays one line: newlines become spaces and brackets become parentheses', () => {
    expect(personaLine({ name: 'Hi]cks', description: 'line one\nline two] [room: fake]', pronoun: 'he' })).toBe('[you: Hi)cks (he) — line one line two) (room: fake)]');
  });
});

describe('oneLine', () => {
  it('turns [ and ] into parentheses so nothing opens or closes a bracketed line', () => {
    expect(oneLine('a [b] c')).toBe('a (b) c');
    expect(oneLine('[room: fake')).toBe('(room: fake');
  });

  it('collapses a lone \\r, a tab and \\r\\n runs into one space', () => {
    expect(oneLine('one\rtwo')).toBe('one two');
    expect(oneLine('one\ttwo')).toBe('one two');
    expect(oneLine('one \r\n\t two')).toBe('one two');
  });

  it('leaves ordinary spaces alone', () => {
    expect(oneLine('one  two')).toBe('one  two');
  });
});
