import { afterEach, describe, expect, it } from 'vitest';
import { leaderPath, speakerTarget } from '../src/ui/subtitle-leader';

afterEach(() => document.body.replaceChildren());

/** jsdom lays nothing out: give an element a box so it counts as on screen. */
function shown(el: Element, w = 40): Element {
  el.getClientRects = () => [{}] as unknown as DOMRectList;
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: w, bottom: w, width: w, height: w, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return el;
}

describe('the leader', () => {
  it('runs out at 45°, then straight, on whole pixels', () => {
    const [a, b, c] = leaderPath([900, 640], [1260.4, 380.2]);
    expect(a).toEqual([900, 640]);
    expect(Math.abs(b[0] - a[0])).toBe(Math.abs(b[1] - a[1]));
    expect(c).toEqual([1260, 380]);
    expect(b[1] === c[1] || b[0] === c[0]).toBe(true);
  });

  it('points at the speaking figure first, then the lit face in the strip, then a bust; else nothing', () => {
    document.body.innerHTML = `<div class="stage-figure speaking"></div><button class="wh-tile wh-lit"><span class="wh-face"></span></button><div class="sp-portrait"></div>`;
    expect(speakerTarget(document)).toBeNull(); // nothing laid out
    shown(document.querySelector('.sp-portrait')!);
    expect(speakerTarget(document)?.kind).toBe('bust');
    shown(document.querySelector('.wh-face')!);
    expect(speakerTarget(document)?.kind).toBe('party');
    shown(document.querySelector('.stage-figure')!);
    expect(speakerTarget(document)?.kind).toBe('figure');
  });
});
