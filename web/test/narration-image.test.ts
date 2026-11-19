// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountJobColumn } from '../src/room/job-column';
import { latestQuestStory } from '../src/room/quest-cards';
import { stripImageTokens, withImageTokens } from '../src/room/narration-image';
import { typeIn } from '../src/ui/type-in';
import type { ChatMessage, RowImage } from '../../shared/types';

const MIREK: RowImage = { para: 1, name: 'mirek', url: '/api/extras/local-01' };
const TEXT = 'The pick.\n\n*Mirek is at the wok.*\n\n*The coat rail.*';

let game: HTMLElement;
let feed: HTMLElement;
beforeEach(() => {
  // jsdom has no canvas: the noise draws nothing here (and says nothing about it).
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  document.body.innerHTML = '<div id="game"><div id="feed"></div></div>';
  game = document.getElementById('game')!;
  feed = document.getElementById('feed')!;
});
afterEach(() => vi.useRealTimers());

const row = (text: string, quest: Partial<NonNullable<ChatMessage['quest']>>): ChatMessage =>
  ({ id: 'r1', role: 'user', mode: 'quest', text, toolLines: [], ts: 1, status: 'ok', quest: { id: 'come-up', title: 'Come Up', beat: 'market', ...quest } }) as ChatMessage;

describe('narration image tokens', () => {
  it('a token heads its paragraph, and strips back to the text', () => {
    const t = withImageTokens(TEXT, [MIREK]);
    expect(t.split('\n\n')[1].startsWith('*')).toBe(false);
    expect(t.split('\n\n')[1]).toContain('*Mirek is at the wok.*');
    expect(stripImageTokens(t)).toBe(TEXT);
  });
});

describe('latestQuestStory carries the images', () => {
  it('past a pick line it starts with, and split by a held next beat', () => {
    // The pick line is the row's first paragraph; the story drops it, so mirek's paragraph is its first.
    const s = latestQuestStory([row(TEXT, { pick: { choice: 'stall', line: 'The pick.' }, images: [MIREK] })])!;
    expect(stripImageTokens(s.text)).toBe('*Mirek is at the wok.*\n\n*The coat rail.*');
    expect(s.text.split('\n\n')[0]).not.toBe('*Mirek is at the wok.*');
    // Held: the next beat (mirek's paragraph on) is held back, so `before` has no image and `text` does.
    const h = latestQuestStory([row(TEXT, { images: [MIREK], held: { at: 'The pick.\n\n'.length, clips: 0 } })])!;
    expect(h.before).toBe('The pick.');
    expect(stripImageTokens(h.text)).toBe(TEXT);
    expect(h.text).not.toBe(TEXT);
  });
});

describe('the JOB column draws a token as an inline image at its paragraph', () => {
  it('a framed image first in its paragraph, its one hidden character in a box of its own', () => {
    const c = mountJobColumn(feed, game);
    c.show('Come Up', withImageTokens(TEXT, [MIREK]));
    const img = game.querySelector<HTMLElement>('.jc-body .jc-img')!;
    expect(img).not.toBeNull();
    expect(img.querySelector('img')!.getAttribute('src')).toBe('/api/extras/local-01');
    expect(img.querySelector('.jc-img-ch')!.textContent).toBe('￼');
    // Nothing of the token is left as text; the paragraph's words follow the image.
    expect(game.querySelector('.jc-body')!.textContent).not.toContain('/api/extras');
    expect(img.nextSibling?.textContent ?? img.parentElement!.nextSibling?.textContent).toContain('Mirek is at the wok');
  });

  it('the paragraph an image heads has no indent before it (the float starts its line, so the first line wraps too)', () => {
    const c = mountJobColumn(feed, game);
    c.show('Come Up', withImageTokens(TEXT, [MIREK]));
    const img = game.querySelector<HTMLElement>('.jc-img')!;
    let prev: Node | null = img.previousSibling;
    while (prev && prev.textContent === '') prev = prev.previousSibling;
    expect(prev?.textContent?.endsWith('\n')).toBe(true);
  });

  it('a scene picture is a full-width band, not a face beside the text', () => {
    const c = mountJobColumn(feed, game);
    c.show('Come Up', withImageTokens(TEXT, [{ para: 1, name: 'letter', url: '/api/quests/art/come-up-letter.webp', wide: true }]));
    const img = game.querySelector<HTMLElement>('.jc-img')!;
    expect(img.classList.contains('jc-img-scene')).toBe(true);
    expect(img.querySelector('img')!.getAttribute('src')).toBe('/api/quests/art/come-up-letter.webp');
    expect(img.querySelector('.jc-img-ch')!.textContent).toBe('\uFFFC');
  });

  it("a contact's figure is cropped to its head by the crop", () => {
    const c = mountJobColumn(feed, game);
    c.show('Clearance', withImageTokens(TEXT, [{ para: 1, name: 'rue', url: '/api/agents/rue/sprite', crop: { top: 0.05, bottom: 0.4 } }]));
    const img = game.querySelector<HTMLElement>('.jc-img')!;
    expect(img.classList.contains('jc-img-figure')).toBe(true);
    expect(img.style.getPropertyValue('--crop-top')).toBe('0.05');
  });

  it('the same image is the same node across redraws (its decode carries on)', () => {
    const c = mountJobColumn(feed, game);
    c.show('Come Up', withImageTokens(TEXT, [MIREK]));
    const a = game.querySelector('.jc-img');
    c.show('Come Up', withImageTokens(TEXT + '\n\nMore.', [MIREK]));
    expect(game.querySelector('.jc-img')).toBe(a);
  });

  it('a failed load keeps the framed box', () => {
    const c = mountJobColumn(feed, game);
    c.show('Come Up', withImageTokens(TEXT, [MIREK]));
    const img = game.querySelector<HTMLElement>('.jc-img')!;
    img.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(img.isConnected).toBe(true);
    expect(img.classList.contains('jc-img-missing')).toBe(true);
  });
});

describe('the typer steps over an object as one held character', () => {
  const page = () => {
    const root = document.createElement('div');
    document.body.append(root);
    return root;
  };
  const obj = () => Object.assign(document.createElement('span'), { className: 'obj' });

  it("waits `ms × pace` at it, says when it's reached, and finish reaches the rest with 0", () => {
    vi.useFakeTimers();
    const root = page();
    const reached: [string, number][] = [];
    const t = typeIn(root, { reduced: () => false, objects: { selector: '.obj', ms: 600, reach: (el, ms) => reached.push([el.dataset.id!, ms]) } });
    root.textContent = 'a';
    t.changed();
    const one = Object.assign(obj(), { textContent: '￼' });
    one.dataset.id = 'one';
    const two = Object.assign(obj(), { textContent: '￼' });
    two.dataset.id = 'two';
    root.append(one, 'bc', two, 'd');
    t.setTextSpeed(1);
    t.changed();
    // Before the frontier: the object's character is still unshown.
    expect(one.querySelector('[data-tw="rest"]')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(reached).toEqual([['one', 600]]);
    // It holds: nothing more within the 600ms.
    vi.advanceTimersByTime(500);
    expect(root.querySelector('.type-cursor')!.previousSibling).toBe(one);
    expect(t.finish()).toBe(true);
    expect(reached).toEqual([['one', 600], ['two', 0]]);
  });

  it('typing off, reduced motion or INSTANT: nothing is reached with a wait, nothing hides', () => {
    const root = page();
    const reached: number[] = [];
    const t = typeIn(root, { reduced: () => true, objects: { selector: '.obj', ms: 600, reach: (_el, ms) => reached.push(ms) } });
    root.textContent = 'a';
    t.changed();
    root.append(Object.assign(obj(), { textContent: '￼' }), 'b');
    t.changed();
    expect(root.querySelector('[data-tw="rest"]')).toBeNull();
    expect(reached.every((ms) => ms === 0)).toBe(true);
  });
});
