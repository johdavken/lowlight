import { afterEach, describe, expect, it, vi } from 'vitest';
import { sceneOptions } from '../src/net/scenario';

afterEach(() => vi.unstubAllGlobals());
const answer = (status: number, body: unknown) => {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
};
const options = [
  { kind: 'history', title: 'A', text: 'a.' },
  { kind: 'business', title: 'B', text: 'b.' },
  { kind: 'chance', title: 'C', text: 'c.' },
];
const pair = { player: { id: 'hicks', name: 'Hicks' }, tie: 'You signed his slip.' };

describe('sceneOptions (three openings for the pair)', () => {
  it('posts the AI and the steer to /api/scenario/draft and resolves the three and the pair', async () => {
    const fetch = answer(200, { options, pair });
    await expect(sceneOptions('nix-direct', 'a bounced fee')).resolves.toEqual({ options, pair });
    expect(fetch).toHaveBeenCalledWith('/api/scenario/draft', expect.objectContaining({ method: 'POST', body: JSON.stringify({ ai: 'nix-direct', steer: 'a bounced fee' }) }));
    answer(200, { options, pair: { player: { id: 'hicks', name: 'Hicks' }, tie: null } });
    await expect(sceneOptions('nix-direct', null)).resolves.toMatchObject({ pair: { tie: null } });
  });

  it("a refusal, a failure or an empty answer rejects with SUGGEST's words", async () => {
    answer(409, { error: 'no-link' });
    await expect(sceneOptions('nix-direct', null)).rejects.toThrow('NO KEY LINKED');
    answer(502, { error: 'failed', kind: 'timeout', why: 'x' });
    await expect(sceneOptions('nix-direct', null)).rejects.toThrow('THE MODEL TOOK TOO LONG');
    answer(200, { options: [], pair });
    await expect(sceneOptions('nix-direct', null)).rejects.toThrow('THE ANSWER CAME BACK EMPTY');
  });
});
