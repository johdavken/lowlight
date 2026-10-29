import { afterEach, describe, expect, it, vi } from 'vitest';
import { sceneDraft } from '../src/net/scenario';

afterEach(() => vi.unstubAllGlobals());
const answer = (status: number, body: unknown) => {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
};

describe('sceneDraft (arrival screen spec §3)', () => {
  it('posts the AI and the steer to /api/scenario/draft and resolves the text', async () => {
    const fetch = answer(200, { text: 'Rain.' });
    await expect(sceneDraft('nix-direct', 'a bounced fee')).resolves.toBe('Rain.');
    expect(fetch).toHaveBeenCalledWith('/api/scenario/draft', expect.objectContaining({ method: 'POST', body: JSON.stringify({ ai: 'nix-direct', steer: 'a bounced fee' }) }));
  });

  it("a refusal or a failure rejects with SUGGEST's words", async () => {
    answer(409, { error: 'no-link' });
    await expect(sceneDraft('nix-direct', null)).rejects.toThrow('NO KEY LINKED');
    answer(502, { error: 'failed', kind: 'timeout', why: 'x' });
    await expect(sceneDraft('nix-direct', null)).rejects.toThrow('THE MODEL TOOK TOO LONG');
  });
});
