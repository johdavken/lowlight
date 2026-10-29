import { describe, expect, it } from 'vitest';
import { Sprite } from 'pixi.js';
import { createFrameTexture, setSmooth } from '../src/renderer/frame-texture';

describe('createFrameTexture', () => {
  it('a sprite showing it draws at the new size after a resize (480 → flat → 480)', () => {
    const rt = createFrameTexture(480, 270);
    const view = new Sprite(rt);
    const drawn = () => {
      const b = view.getLocalBounds();
      return [b.width, b.height];
    };
    expect(drawn()).toEqual([480, 270]);
    rt.resize(1536, 864);
    expect(drawn()).toEqual([1536, 864]);
    rt.resize(480, 270);
    expect(drawn()).toEqual([480, 270]);
  });
});

describe('setSmooth', () => {
  it('switches the filtering and tells the GPU (a styleChange)', () => {
    const rt = createFrameTexture(480, 270);
    let changes = 0;
    rt.source.on('styleChange', () => changes++);
    setSmooth(rt.source, true);
    expect(rt.source.style.scaleMode).toBe('linear');
    expect(changes).toBe(1);
    setSmooth(rt.source, false);
    expect(rt.source.style.scaleMode).toBe('nearest');
    expect(changes).toBe(2);
  });
});
