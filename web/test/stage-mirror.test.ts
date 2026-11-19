import { beforeEach, describe, expect, it } from 'vitest';
import { contactMirror, loadMirror, saveMirror } from '../src/ui/stage-mirror';

describe('SYS → MIRROR picks over her default', () => {
  beforeEach(() => localStorage.clear());

  it('with no pick, her default (her file) holds', () => {
    expect(loadMirror('hae', true)).toBe(true);
    expect(loadMirror('nix', false)).toBe(false);
    expect(loadMirror('nix')).toBe(false);
  });

  it('a pick here beats her default either way', () => {
    saveMirror('hae', false);
    saveMirror('nix', true);
    expect(loadMirror('hae', true)).toBe(false);
    expect(loadMirror('nix', false)).toBe(true);
  });

  it('reads the old list of mirrored contacts as picks of on', () => {
    localStorage.setItem('lowlight.mirror', JSON.stringify(['nix']));
    expect(loadMirror('nix', false)).toBe(true);
    expect(loadMirror('cass', true)).toBe(true);
    saveMirror('cass', false);
    expect(loadMirror('nix', false)).toBe(true);
    expect(loadMirror('cass', true)).toBe(false);
    expect(localStorage.getItem('lowlight.mirror')).toBeNull();
  });
});

describe('your contact in the middle beside a resident', () => {
  it('shows the other way from her setting', () => {
    expect(contactMirror(true, false)).toBe(true);
    expect(contactMirror(true, true)).toBe(false);
    expect(contactMirror(false, false)).toBe(false);
    expect(contactMirror(false, true)).toBe(true);
  });
});
