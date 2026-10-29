import { afterEach, describe, expect, it } from 'vitest';
import { charDelay, indentParagraphs, loadTextSpeed, paceFromSearch, renderFrontier, saveTextSpeed, stepTextSpeed, textSpeedScale } from '../src/ui/typing';
import type { Segment } from '../src/ui/rp-markup';

describe('charDelay', () => {
  it('is 1000/60 ms for a plain character', () => expect(charDelay('ab', 0)).toBeCloseTo(1000 / 60));
  it('pauses after a sentence end followed by space or the end, not inside an ellipsis', () => {
    expect(charDelay('Hi. Yo', 2)).toBeCloseTo(1000 / 60 + 180);
    expect(charDelay('Hi?', 2)).toBeCloseTo(1000 / 60 + 180);
    expect(charDelay('...', 0)).toBeCloseTo(1000 / 60);
  });
  it('pauses after every em dash and longer after a newline', () => {
    expect(charDelay('a—b', 1)).toBeCloseTo(1000 / 60 + 180);
    expect(charDelay('a\nb', 1)).toBeCloseTo(1000 / 60 + 300);
  });
  it('pauses after a sentence end followed by any whitespace, not just a space', () => {
    expect(charDelay('Hi.\nYo', 2)).toBeCloseTo(1000 / 60 + 180);
  });
  it('stretches the pace and its pauses together by `scale`', () => {
    expect(charDelay('ab', 0, 2)).toBeCloseTo(2000 / 60);
    expect(charDelay('Hi. Yo', 2, 2)).toBeCloseTo(2 * (1000 / 60 + 180));
  });
});

describe('text speed', () => {
  afterEach(() => localStorage.clear());
  it('slow, normal, fast and instant scale the pace by 2, 1, 0.5 and 0', () => {
    expect(['slow', 'normal', 'fast', 'instant'].map((s) => textSpeedScale(s as never))).toEqual([2, 1, 0.5, 0]);
  });
  it('is normal until one is saved, and comes back as saved (per browser)', () => {
    expect(loadTextSpeed()).toBe('normal');
    saveTextSpeed('fast');
    expect(loadTextSpeed()).toBe('fast');
  });
  it('a broken saved value reads as normal', () => {
    localStorage.setItem('lowlight.textSpeed', 'warp');
    expect(loadTextSpeed()).toBe('normal');
  });
  it('the wheel steps and stops at the ends', () => {
    expect(stepTextSpeed('fast', 1)).toBe('instant');
    expect(stepTextSpeed('instant', 1)).toBe('instant');
    expect(stepTextSpeed('slow', -1)).toBe('slow');
    expect(stepTextSpeed('normal', -1)).toBe('slow');
  });
});

describe('paceFromSearch', () => {
  it('turns ?cps=N into a scale against the normal 60', () => {
    expect(paceFromSearch('?cps=30')).toBeCloseTo(2);
    expect(paceFromSearch('?as=hicks&cps=120')).toBeCloseTo(0.5);
  });
  it('is 1 with no cps, or one that is not a positive number', () => {
    for (const s of ['', '?as=hicks', '?cps=', '?cps=0', '?cps=-5', '?cps=fast']) expect(paceFromSearch(s)).toBe(1);
  });
});

describe('renderFrontier', () => {
  const segs: Segment[] = [{ kind: 'action', text: '*nods*' }, { kind: 'plain', text: ' Hello' }];
  it('keeps the whole text in the DOM, hides past the frontier, and puts the cursor there', () => {
    const div = document.createElement('div');
    renderFrontier(div, segs, 4);
    expect(div.textContent).toBe('*nods* Hello');
    const visible = [...div.querySelectorAll('span:not(.unshown):not(.type-cursor)')].map((s) => s.textContent).join('');
    expect(visible).toBe('*nod');
    expect([...div.querySelectorAll('.unshown')].map((s) => s.textContent).join('')).toBe('s* Hello');
    expect(div.querySelector('.unshown.act')).not.toBeNull(); // hidden action text keeps its styling (same layout)
    expect(div.querySelector('.type-cursor')!.previousSibling!.textContent).toBe('*nod');
    expect(div.querySelector('.type-cursor')!.getAttribute('aria-hidden')).toBe('true');
  });
  it('null shows everything with no cursor', () => {
    const div = document.createElement('div');
    renderFrontier(div, segs, null);
    expect(div.querySelector('.unshown, .type-cursor')).toBeNull();
    expect(div.textContent).toBe('*nods* Hello');
  });
});

describe('paragraphs indent instead of a blank line', () => {
  const segs = (...parts: Array<[Segment['kind'], string]>): Segment[] => parts.map(([kind, text]) => ({ kind, text }));
  const shape = (el: HTMLElement) =>
    [...el.childNodes].map((n) => (n instanceof HTMLElement ? `<${n.className}:${n.textContent}>` : n.textContent)).join('');

  it('keeps one newline, hides the rest of the run, and opens the next paragraph with an indent', () => {
    const el = document.createElement('div');
    renderFrontier(el, segs(['plain', 'One.\n\nTwo.\n \n\n  Three.\nStill three.']), null);
    expect(el.textContent).toBe('One.\n\nTwo.\n \n\n  Three.\nStill three.');
    expect(shape(el)).toBe('One.\n<para-gap:\n><para-indent:>Two.\n<para-gap: \n\n  ><para-indent:>Three.\nStill three.');
  });

  it('works across segments and the typing frontier, keeping every character in order', () => {
    const el = document.createElement('div');
    const s = segs(['action', 'She sets it down.\n'], ['plain', '\n"Eat."']);
    for (const shown of [null, 0, 17, 18, 19, 25]) {
      renderFrontier(el, s, shown);
      expect(el.textContent).toBe('She sets it down.\n\n"Eat."');
      expect(el.querySelectorAll('.para-gap')).toHaveLength(1);
      expect(el.querySelector('.para-gap')!.textContent).toBe('\n');
      expect(el.querySelectorAll('.para-indent')).toHaveLength(1);
    }
  });

  it('an action paragraph: the indent goes before its hidden *, not inside it', () => {
    const el = document.createElement('div');
    renderFrontier(el, segs(['plain', 'Eat.\n\n'], ['mark', '*'], ['action', 'She nods.'], ['mark', '*']), null);
    expect(shape(el)).toBe('Eat.\n<para-gap:\n><para-indent:><mk:*><act:She nods.><mk:*>');
  });

  it('no indent after a trailing blank line, and nothing to do without one', () => {
    const el = document.createElement('div');
    el.textContent = 'Line.\n\n';
    indentParagraphs(el);
    expect(el.querySelector('.para-indent')).toBeNull();
    expect(el.querySelector('.para-gap')!.textContent).toBe('\n');
    el.textContent = 'A.\nB.';
    indentParagraphs(el);
    expect(el.innerHTML).toBe('A.\nB.');
  });
});
