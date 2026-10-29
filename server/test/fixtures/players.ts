import type { Player } from '../../src/players';

/** A stand-in roster: every id resolves to a plain player (name = id, no lines), unless overridden. */
export function fakePlayers(defaultId = 'hicks', overrides: Record<string, Partial<Player>> = {}): { defaultId: string; resolve(id: string): Player } {
  return {
    defaultId,
    resolve: (id: string) => ({ id, name: id, pronoun: 'they', line: null, whosHere: null, sprite: null, ...overrides[id] }),
  };
}
