import { describe, expect, it } from 'vitest';
import { branchName } from './branch-name';

describe('branchName', () => {
  it('counts the games already branched from this one', () => {
    expect(branchName({ id: 'pt-1', name: 'Main' }, [])).toBe('Main — branch 1');
    const all = [
      { forkedFrom: { playthrough: 'pt-1', save: 'sv-1', name: 'Keep' } },
      { forkedFrom: { playthrough: 'pt-1', message: { contactId: 'nix', messageId: 'm1', excerpt: 'x' }, name: 'Main' } },
      { forkedFrom: { playthrough: 'pt-2', save: 'sv-2', name: 'Other' } },
      { forkedFrom: null },
    ];
    expect(branchName({ id: 'pt-1', name: 'Main' }, all)).toBe('Main — branch 3');
  });
});
