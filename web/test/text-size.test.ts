import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTextSize, loadTextSize, saveTextSize, stepTextSize } from '../src/ui/text-size';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('TEXT SIZE (fixed stage §6)', () => {
  it('is 100 % until one is saved, and keeps what was saved', () => {
    expect(loadTextSize()).toBe(100);
    saveTextSize(130);
    expect(loadTextSize()).toBe(130);
    expect(localStorage.getItem('lowlight.textSize')).toBe('130');
  });

  it('reads anything else as 100 %', () => {
    for (const v of ['abc', '90', '', '150.5']) {
      localStorage.setItem('lowlight.textSize', v);
      expect(loadTextSize()).toBe(100);
    }
  });

  it('storage off: 100 %, and saving never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadTextSize()).toBe(100);
    expect(() => saveTextSize(115)).not.toThrow();
  });

  it('steps 85 → 150 and stops at the ends', () => {
    expect(stepTextSize(100, 1)).toBe(115);
    expect(stepTextSize(100, -1)).toBe(85);
    expect(stepTextSize(150, 1)).toBe(150);
    expect(stepTextSize(85, -1)).toBe(85);
    expect(stepTextSize(115, 3)).toBe(130);
  });

  it('applies as --text-scale on the stage', () => {
    const root = document.createElement('div');
    applyTextSize(root, 130);
    expect(root.style.getPropertyValue('--text-scale')).toBe('1.3');
  });

  it('the reading text scales with it; labels do not', () => {
    const css = (f: string) => readFileSync(f, 'utf8');
    const style = css('web/src/ui/style.css');
    expect(style).toMatch(/\.text \{[^}]*font-size: calc\(15\.5px \* var\(--text-scale, 1\)\)/);
    // The dialogue box's own size (the box sets 17px over .text's 15.5px).
    expect(style).toMatch(/\.feed-root\.feed-stage:not\(\.expanded\) \.msg \.text \{[^}]*font-size: calc\(17px \* var\(--text-scale, 1\)\)/);
    expect(style).toMatch(/\.input textarea \{[^}]*font-size: calc\(16px \* var\(--text-scale, 1\)\)/);
    expect(css('web/src/room/people-screen.css')).toMatch(/\.pe-where \{[^}]*calc\(15px \* var\(--text-scale, 1\)\)/);
    expect(css('web/src/room/people-screen.css')).toMatch(/\.pe-lead-text \{[^}]*calc\(17px \* var\(--text-scale, 1\)\)/);
    expect(style).toMatch(/\.ghost \{[^}]*font-size: 26px/);
    // The briefs a gig is played from (job cards, slip runs, Papers) follow it too.
    expect(css('web/src/ui/gig/gig.css')).toMatch(/\.gig-job-brief \{[^}]*font-size: calc\(12\.5px \* var\(--text-scale, 1\)\)/);
    expect(css('web/src/ui/papers/papers.css')).toMatch(/\.pp-brief \{[^}]*font-size: calc\(12\.5px \* var\(--text-scale, 1\)\)/);
    expect(style).toMatch(/\.gig-brief \{[^}]*font: calc\(13px \* var\(--text-scale, 1\)\)\/1\.55 var\(--mono\)/);
  });
});
