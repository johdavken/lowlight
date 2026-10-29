import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { STAGE_H, STAGE_W, gameRoot, mountGameStage, stageRect, stageScale } from '../src/ui/game-stage';

const setWindow = (w: number, h: number) => {
  (window as any).innerWidth = w;
  (window as any).innerHeight = h;
};

describe('stage size', () => {
  it('is 1600×900', () => {
    expect([STAGE_W, STAGE_H]).toEqual([1600, 900]);
    expect(stageScale(1920, 1080)).toBe(1.2);
  });
});

describe('stageRect', () => {
  it('fills a 16:9 window', () => expect(stageRect(1920, 1080)).toEqual({ scale: 1.2, left: 0, top: 0, width: 1920, height: 1080 }));
  it('letterboxes 16:10', () => expect(stageRect(1440, 900)).toEqual({ scale: 0.9, left: 0, top: 45, width: 1440, height: 810 }));
  it('pillarboxes 21:9', () => expect(stageRect(2560, 1080)).toEqual({ scale: 1.2, left: 320, top: 0, width: 1920, height: 1080 }));
  it('letterboxes a tall window', () =>
    expect(stageRect(900, 1200)).toEqual({ scale: 0.5625, left: 0, top: 346.875, width: 900, height: 506.25 }));
});

describe('mountGameStage', () => {
  let dispose: (() => void) | null = null;
  afterEach(() => {
    dispose?.();
    dispose = null;
  });

  it('zooms and centres the stage, and follows resize', () => {
    const el = document.createElement('div');
    setWindow(1600, 900);
    const s = mountGameStage(el);
    dispose = s.dispose;
    expect(el.style.zoom).toBe('1');
    expect(el.style.left).toBe('0px');
    expect(el.style.top).toBe('0px');

    setWindow(2560, 1080);
    window.dispatchEvent(new Event('resize'));
    expect(el.style.zoom).toBe('1.2');
    // left on a zoomed element is itself zoomed, so it is written in stage px.
    expect(parseFloat(el.style.left)).toBeCloseTo(320 / 1.2, 6);
    expect(s.rect()).toEqual(stageRect(2560, 1080));
  });

  it('onRect fires on resize until unsubscribed, and dispose stops it', () => {
    const el = document.createElement('div');
    setWindow(1600, 900);
    const s = mountGameStage(el);
    const cb = vi.fn();
    const off = s.onRect(cb);
    setWindow(1440, 900);
    window.dispatchEvent(new Event('resize'));
    expect(cb).toHaveBeenCalledWith(stageRect(1440, 900));
    off();
    window.dispatchEvent(new Event('resize'));
    expect(cb).toHaveBeenCalledTimes(1);

    const cb2 = vi.fn();
    s.onRect(cb2);
    s.dispose();
    window.dispatchEvent(new Event('resize'));
    expect(cb2).not.toHaveBeenCalled();
    expect(el.style.zoom).toBe('0.9');
  });
});

describe('gameRoot', () => {
  it('is #game when the page has one, else the body', () => {
    document.body.innerHTML = '';
    expect(gameRoot()).toBe(document.body);
    document.body.innerHTML = '<div id="game"></div>';
    expect(gameRoot()).toBe(document.getElementById('game'));
    document.body.innerHTML = '';
  });
});

describe('the game page', () => {
  it('holds every game root in #game, with the canvas and dev panel outside', () => {
    const doc = new DOMParser().parseFromString(readFileSync('web/index.html', 'utf8'), 'text/html');
    const game = doc.getElementById('game')!;
    for (const id of ['feed', 'stage-figures', 'whos-here', 'hud', 'input', 'map', 'recap', 'district-intro']) {
      expect(doc.getElementById(id)?.parentElement).toBe(game);
    }
    expect(doc.getElementById('stage')?.parentElement).toBe(doc.body);
    expect(doc.getElementById('devpanel')?.parentElement).toBe(doc.body);
  });

  it('#game stacks above the canvas layer and under the dev panel', () => {
    const html = readFileSync('web/index.html', 'utf8');
    expect(html).toMatch(/#game \{[^}]*z-index: 10;/);
  });

  it('#game clips its overflow, so nothing can scroll the stage (figures hang below it; focus or find would shift the UI)', () => {
    const html = readFileSync('web/index.html', 'utf8');
    expect(html).toMatch(/#game \{[^}]*overflow: clip;/);
    expect(html).not.toMatch(/#game \{[^}]*overflow: hidden;/);
  });

  it('a bug report open on the stage comes over the dev panel', () => {
    const css = readFileSync('web/src/ui/bug-report.css', 'utf8');
    expect(css).toMatch(/body:has\(\.bug-report\) #devpanel \{[^}]*z-index: 5;/);
  });

  it('Hide UI keeps the figures inside #game', () => {
    const css = readFileSync('web/src/ui/style.css', 'utf8');
    expect(css).toContain('body.ui-hidden #game > :not(#stage-figures)');
  });
});
