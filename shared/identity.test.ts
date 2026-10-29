import { describe, expect, it } from 'vitest';
import { oldProfileIdentity } from './identity';

describe('oldProfileIdentity', () => {
  it('an old "<server>:<profile>" identity is one', () => {
    expect(oldProfileIdentity('agent:nix')).toBe(true);
  });
  it('a file in her folder is not, even one with a colon further in', () => {
    expect(oldProfileIdentity('identity.md')).toBe(false);
    expect(oldProfileIdentity('notes/v2:draft.md')).toBe(false);
  });
  it('anything that is not a string is not', () => {
    expect(oldProfileIdentity(undefined)).toBe(false);
    expect(oldProfileIdentity(3)).toBe(false);
  });
});
