import { describe, expect, it } from 'vitest';
import { playPath } from '../src/landing/route';

describe('playPath', () => {
  it('the solo screen when solo, else the location contact, else the start contact', () => {
    expect(playPath({ solo: true, location: { contactId: 'cass', sceneId: 'x' }, startContact: 'nix' })).toBe('/solo');
    expect(playPath({ location: { contactId: 'cass', sceneId: 'x' }, startContact: 'nix' })).toBe('/room/cass');
    expect(playPath({ location: null, startContact: 'nix' })).toBe('/room/nix');
  });
});
