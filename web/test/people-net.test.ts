import { afterEach, describe, expect, it, vi } from 'vitest';
import { peopleApi } from '../src/net/people';

afterEach(() => vi.unstubAllGlobals());
const answer = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })));

describe('the people client says what went wrong in words', () => {
  it.each([
    [409, { error: 'busy' }, /already on its way/i],
    [400, { error: 'no-key' }, /OpenRouter key/i],
    [400, { error: 'bad-who' }, /name/i],
    [500, { error: 'no-palette' }, /palette/i],
    [502, { error: 'generate-failed', message: 'Insufficient credits' }, /Insufficient credits/],
  ])('%i %j', async (status, body, words) => {
    answer(status, body);
    await expect(peopleApi.generate('p-1794679903080-aaaaaa', {} as never)).rejects.toThrow(words);
  });
});
