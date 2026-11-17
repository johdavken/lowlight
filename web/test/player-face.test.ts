import { describe, expect, it } from 'vitest';
import { playerFace, setPlayerFace } from '../src/net/player-face';

describe('playerFace', () => {
  it("the persona's own face for the player only; the character's otherwise", () => {
    setPlayerFace('rue', null);
    expect(playerFace('rue')).toBe('/api/agents/rue/thumb');
    setPlayerFace('rue', '/api/persona/thumb?pt=pt-20261112-aaaa&v=1');
    expect(playerFace('rue')).toBe('/api/persona/thumb?pt=pt-20261112-aaaa&v=1');
    expect(playerFace('nix')).toBe('/api/agents/nix/thumb');
    setPlayerFace('rue', null);
    expect(playerFace('rue')).toBe('/api/agents/rue/thumb');
  });
});
