import { describe, expect, it, vi } from 'vitest';
import { GlProgram } from 'pixi.js';
import { LightingFilter } from '../src/renderer/lighting';

describe('LightingFilter precision', () => {
  it('asks for highp: mediump overflows distance() past ~256 px and cut big lights to a disc (Chromium, the Low Roller wheel)', () => {
    const from = vi.spyOn(GlProgram, 'from');
    new LightingFilter();
    expect(from).toHaveBeenCalledWith(expect.objectContaining({ name: 'nix-lighting', preferredFragmentPrecision: 'highp' }));
    from.mockRestore();
  });
});
