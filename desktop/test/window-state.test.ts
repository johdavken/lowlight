import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultWindow, fitOnScreen, readWindowState, writeWindowState } from '../window-state';
import { tempUserData } from './helpers';

const FALLBACK = defaultWindow({ width: 1920, height: 1080 });

describe('defaultWindow (fixed stage §5)', () => {
  it('opens at 1600×900 when it fits in 90 % of the work area', () => {
    expect(defaultWindow({ width: 1920, height: 1080 })).toEqual({ width: 1600, height: 900, maximized: false });
  });
  it('takes the largest 16:9 that fits on a smaller screen', () => {
    expect(defaultWindow({ width: 1366, height: 728 })).toEqual({ width: 1164, height: 655, maximized: false });
  });
  it('never goes below the 960×540 minimum', () => {
    expect(defaultWindow({ width: 1000, height: 600 })).toEqual({ width: 960, height: 540, maximized: false });
  });
});

describe('window state', () => {
  it('uses the fallback when there is no file', () => {
    expect(readWindowState(path.join(tempUserData(), 'window.json'), FALLBACK)).toEqual({ width: 1600, height: 900, maximized: false });
  });

  it('clamps a too-small window up to the minimum', () => {
    const f = path.join(tempUserData(), 'window.json');
    fs.writeFileSync(f, JSON.stringify({ width: 400, height: 300, x: 10, y: 20, maximized: false }));
    expect(readWindowState(f, FALLBACK)).toEqual({ width: 960, height: 540, x: 10, y: 20, maximized: false });
  });

  it('survives a damaged file', () => {
    const f = path.join(tempUserData(), 'window.json');
    fs.writeFileSync(f, 'nope');
    expect(readWindowState(f, FALLBACK)).toEqual({ width: 1600, height: 900, maximized: false });
  });

  it('keeps a saved size as the player left it, 16:9 or not', () => {
    const f = path.join(tempUserData(), 'window.json');
    fs.writeFileSync(f, JSON.stringify({ width: 1280, height: 800, maximized: false }));
    expect(readWindowState(f, FALLBACK)).toEqual({ width: 1280, height: 800, maximized: false });
  });

  it('round-trips what it wrote', () => {
    const f = path.join(tempUserData(), 'window.json');
    writeWindowState(f, { width: 1500, height: 900, x: 5, y: 6, maximized: true });
    expect(readWindowState(f, FALLBACK)).toEqual({ width: 1500, height: 900, x: 5, y: 6, maximized: true });
  });
});

describe('fitOnScreen', () => {
  const laptop = [{ x: 0, y: 0, width: 1920, height: 1080 }];
  it('keeps a position that is on a screen', () => {
    expect(fitOnScreen({ width: 1280, height: 800, x: 100, y: 50, maximized: false }, laptop)).toEqual({ width: 1280, height: 800, x: 100, y: 50, maximized: false });
  });
  it('drops a position left on a monitor that is gone, so the window opens centred (review)', () => {
    expect(fitOnScreen({ width: 1280, height: 800, x: 2600, y: 100, maximized: true }, laptop)).toEqual({ width: 1280, height: 800, maximized: true });
  });
  it('keeps a window only partly on screen when enough of it shows to grab', () => {
    expect(fitOnScreen({ width: 1280, height: 800, x: 1700, y: 900, maximized: false }, laptop).x).toBe(1700);
    expect(fitOnScreen({ width: 1280, height: 800, x: 1900, y: 1070, maximized: false }, laptop).x).toBeUndefined();
  });
});

describe('writeWindowState', () => {
  it('never throws: a folder it cannot write to just reports false (minor)', () => {
    const dir = tempUserData();
    fs.chmodSync(dir, 0o555);
    try {
      expect(writeWindowState(path.join(dir, 'window.json'), { width: 1280, height: 800, maximized: false })).toBe(false);
    } finally {
      fs.chmodSync(dir, 0o755);
    }
    expect(writeWindowState(path.join(dir, 'window.json'), { width: 1280, height: 800, maximized: false })).toBe(true);
  });
});
