import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { diceSettings, loadCharacter } from '../src/character';

describe('diceSettings', () => {
  it("reads Cass's and Nix's seed values", () => {
    expect(diceSettings(loadCharacter(path.resolve('characters/cass')))).toEqual({ bluff: 0.15, nerve: 0.45, suspicion: 0.75 });
    expect(diceSettings(loadCharacter(path.resolve('characters/nix-direct')))).toEqual({ bluff: 0.4, nerve: 0.6, suspicion: 0.4 });
  });
  it('a missing block gives the defaults; out of range clamps; a bad value takes the default', () => {
    expect(diceSettings(null)).toEqual({ bluff: 0.25, nerve: 0.5, suspicion: 0.5 });
    expect(diceSettings({ dice: { bluff: 7, nerve: -1, suspicion: 'high' } } as never)).toEqual({ bluff: 1, nerve: 0, suspicion: 0.5 });
  });
});
