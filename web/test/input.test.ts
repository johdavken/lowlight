import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountInput } from '../src/ui/input';
import { her, setHerPronoun } from '../src/room/her-copy';

// These rooms' contact is a she (the page learns it from her portrait event).
setHerPronoun('she');

function setup() {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const send = vi.fn();
  const handle = mountInput(root, send);
  const ta = root.querySelector('textarea')!;
  const key = (init: KeyboardEventInit) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    ta.dispatchEvent(e);
    return e;
  };
  return { root, send, handle, ta, key };
}

describe('mountInput', () => {
  it('Enter sends trimmed text and clears the field', () => {
    const { send, ta, key } = setup();
    ta.value = '  it is quiet tonight \n';
    const e = key({ key: 'Enter' });
    expect(e.defaultPrevented).toBe(true);
    expect(send).toHaveBeenCalledWith('it is quiet tonight', 'rp');
    expect(ta.value).toBe('');
  });

  it('Enter on whitespace-only text does not send', () => {
    const { send, ta, key } = setup();
    ta.value = '   \n\t ';
    key({ key: 'Enter' });
    expect(send).not.toHaveBeenCalled();
  });

  it('Shift+Enter is left to insert a newline', () => {
    const { send, ta, key } = setup();
    ta.value = 'line one';
    const e = key({ key: 'Enter', shiftKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('while busy, Enter does nothing but the field stays editable', () => {
    const { send, ta, key, handle, root } = setup();
    handle.setBusy(true);
    expect(ta.disabled).toBe(false);
    expect(ta.readOnly).toBe(false);
    expect(root.querySelector('.input')!.classList.contains('busy')).toBe(true);
    ta.value = 'draft';
    const e = key({ key: 'Enter' });
    expect(e.defaultPrevented).toBe(true);
    expect(send).not.toHaveBeenCalled();
    expect(ta.value).toBe('draft');

    handle.setBusy(false);
    key({ key: 'Enter' });
    expect(send).toHaveBeenCalledWith('draft', 'rp');
  });
});

describe('mountInput refit (TEXT SIZE, final review)', () => {
  it('re-measures the draft when the text size changes', () => {
    const { ta, handle } = setup();
    ta.style.lineHeight = '36px';
    let content = 36;
    Object.defineProperty(ta, 'scrollHeight', { configurable: true, get: () => content });
    handle.refit();
    expect(ta.style.height).toBe('36px');
    content = 108; // three lines at the new size
    handle.refit();
    expect(ta.style.height).toBe('108px');
  });

  it("the input's line box grows with the text size, so descenders aren't cut", () => {
    const css = readFileSync('web/src/ui/style.css', 'utf8');
    const rule = css.slice(css.indexOf('.input textarea {'), css.indexOf('}', css.indexOf('.input textarea {')));
    expect(rule).toContain('line-height: calc(24px * var(--text-scale, 1));');
    expect(rule).toContain('height: calc(24px * var(--text-scale, 1));');
  });
});

describe('mountInput restoreDraft', () => {
  it('puts a refused draft back into an empty field', () => {
    const { ta, handle } = setup();
    handle.restoreDraft('second thought');
    expect(ta.value).toBe('second thought');
  });

  it('keeps anything typed since, after the restored draft', () => {
    const { ta, handle } = setup();
    ta.value = 'and more';
    handle.restoreDraft('second thought');
    expect(ta.value).toBe('second thought\nand more');
  });

  it('clearDraft empties the field (a held quest line was chosen or sent)', () => {
    const { ta, handle } = setup();
    ta.value = 'Come back in the morning.';
    handle.clearDraft();
    expect(ta.value).toBe('');
  });

  it('takeDraft hands back the typed line, trimmed, and empties the field (LET HER GO carries it)', () => {
    const { ta, handle } = setup();
    ta.value = '  See you at nine.  ';
    expect(handle.takeDraft()).toBe('See you at nine.');
    expect(ta.value).toBe('');
    expect(handle.takeDraft()).toBe('');
  });
});

// Window listeners outlive a test's DOM: a bar left in WALK OUT would take the next test's Enter.
const open: { setWalkOut(on: boolean): void }[] = [];
afterEach(() => {
  for (const h of open.splice(0)) h.setWalkOut(false);
});

describe('mountInput LEAVE and WALK OUT', () => {
  function mount() {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const send = vi.fn();
    const onWalkOut = vi.fn();
    const handle = mountInput(root, send, { onWalkOut });
    open.push(handle);
    return { root, send, onWalkOut, handle, ta: root.querySelector('textarea')! };
  }

  it('LEAVE sends the draft as a leave end line and clears it; disabled while busy', () => {
    const { root, send, handle, ta } = mount();
    const btn = root.querySelector('button.leave-scene') as HTMLButtonElement;
    expect(btn.textContent).toBe('LEAVE');
    ta.value = 'see you';
    btn.click();
    expect(send).toHaveBeenCalledWith('see you', 'end', { leave: true });
    expect(ta.value).toBe('');
    send.mockClear();
    handle.setBusy(true);
    expect(btn.disabled).toBe(true);
    btn.click();
    expect(send).not.toHaveBeenCalled();
  });

  it('setWalkOut shows WALK OUT in place of the field; it calls onWalkOut, Enter too; stay brings the field back', () => {
    const { root, onWalkOut, handle, ta } = mount();
    handle.setWalkOut(true);
    const walk = root.querySelector('button.walk-out-btn') as HTMLButtonElement;
    expect(walk.textContent).toBe('WALK OUT');
    expect(walk.hidden).toBe(false);
    expect((root.querySelector('.field') as HTMLElement).hidden).toBe(true);
    walk.click();
    expect(onWalkOut).toHaveBeenCalledTimes(1);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    // The click, then Enter from the field (it bubbles) and from anywhere.
    expect(onWalkOut).toHaveBeenCalledTimes(3);
    (root.querySelector('button.walk-out-stay') as HTMLButtonElement).click();
    expect(walk.hidden).toBe(true);
    expect((root.querySelector('.field') as HTMLElement).hidden).toBe(false);
  });
});

describe('mountInput WALK OUT keys (final review 2, 3)', () => {
  function mount() {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onWalkOut = vi.fn();
    const onStay = vi.fn();
    const handle = mountInput(root, vi.fn(), { onWalkOut, onStay });
    open.push(handle);
    return { root, onWalkOut, onStay, handle };
  }
  const enter = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

  it("doesn't take focus, so Enter can still turn her goodbye's pages", () => {
    const { root, handle } = mount();
    handle.setWalkOut(true);
    expect(document.activeElement).not.toBe(root.querySelector('button.walk-out-btn'));
  });

  it('Enter another handler took (a page turn) does not walk out', () => {
    const { onWalkOut, handle } = mount();
    handle.setWalkOut(true);
    const take = (e: Event) => e.preventDefault();
    window.addEventListener('keydown', take, { capture: true });
    enter();
    window.removeEventListener('keydown', take, { capture: true });
    expect(onWalkOut).not.toHaveBeenCalled();
  });

  it('Enter in another field, or on a button outside the bar, does not walk out', () => {
    const { onWalkOut, handle } = mount();
    handle.setWalkOut(true);
    const field = document.createElement('input');
    const other = document.createElement('button');
    document.body.append(field, other);
    field.focus();
    enter();
    other.focus();
    enter();
    expect(onWalkOut).not.toHaveBeenCalled();
    other.blur();
    enter();
    expect(onWalkOut).toHaveBeenCalledTimes(1);
  });

  it('stay tells the room, so it can keep WALK OUT away for that goodbye', () => {
    const { root, onStay, handle } = mount();
    handle.setWalkOut(true);
    (root.querySelector('button.walk-out-stay') as HTMLButtonElement).click();
    expect(onStay).toHaveBeenCalledTimes(1);
  });
});

describe('mountInput END SCENE', () => {
  it('END SCENE sends the prompt text with mode end and clears it; empty is allowed', () => {
    const { send, ta, root } = setup();
    const btn = root.querySelector('button.end-scene') as HTMLButtonElement;
    ta.value = 'one last word';
    btn.click();
    expect(send).toHaveBeenCalledWith('one last word', 'end');
    expect(ta.value).toBe('');

    send.mockClear();
    btn.click();
    expect(send).toHaveBeenCalledWith('', 'end');
  });

  it('Alt+E does the same from anywhere; both do nothing while busy', () => {
    const { send, ta, handle, root } = setup();
    const btn = root.querySelector('button.end-scene') as HTMLButtonElement;
    ta.value = 'closing line';
    const e = new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', altKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(send).toHaveBeenCalledWith('closing line', 'end');
    expect(ta.value).toBe('');

    send.mockClear();
    handle.setBusy(true);
    expect(btn.disabled).toBe(true);
    ta.value = 'should not send';
    btn.click();
    const e2 = new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', altKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(e2);
    expect(send).not.toHaveBeenCalled();
    expect(ta.value).toBe('should not send');
  });

  it('out of character, the hint brackets ALT+M', () => {
    const { root } = setup();
    (root.querySelector('.input button.mode') as HTMLButtonElement).click();
    expect(root.querySelector('.input .hint')!.textContent).toContain('[ALT+M] ROLEPLAY');
  });

  it('ending a scene leaves the RP/OOC mode as it was', () => {
    const { root, send, ta, key } = setup();
    const bar = root.querySelector('.input')!;
    const sel = bar.querySelector('button.mode') as HTMLButtonElement;
    sel.click();
    expect(sel.textContent).toBe('OOC');
    const btn = root.querySelector('button.end-scene') as HTMLButtonElement;
    ta.value = 'done here';
    btn.click();
    expect(send).toHaveBeenCalledWith('done here', 'end');
    expect(sel.textContent).toBe('OOC');
    expect(bar.classList.contains('mode-ooc')).toBe(true);
    ta.value = 'back to normal';
    key({ key: 'Enter' });
    expect(send).toHaveBeenCalledWith('back to normal', 'ooc');
  });
});

describe('mountInput roleplay / OOC selector', () => {
  it('starts in roleplay: an RP chip leads the line (no > prompt), purple bar class', () => {
    const { root } = setup();
    const bar = root.querySelector('.input')!;
    const sel = bar.querySelector('button.mode') as HTMLButtonElement;
    expect(sel.textContent).toBe('RP');
    expect(bar.firstElementChild).toBe(sel);
    expect(bar.querySelector('.prompt')).toBeNull();
    expect(bar.classList.contains('mode-rp')).toBe(true);
    expect(bar.classList.contains('mode-ooc')).toBe(false);
  });

  it('clicking the selector switches to [OOC], green bar class, and the mode goes with the message', () => {
    const { root, send, ta, key } = setup();
    const bar = root.querySelector('.input')!;
    const sel = bar.querySelector('button.mode') as HTMLButtonElement;
    sel.click();
    expect(sel.textContent).toBe('OOC');
    expect(bar.classList.contains('mode-ooc')).toBe(true);
    expect(bar.querySelector('.hint')!.textContent).toContain('OUT OF CHARACTER');
    ta.value = 'is the app ok?';
    key({ key: 'Enter' });
    expect(send).toHaveBeenCalledWith('is the app ok?', 'ooc');
    sel.click();
    expect(sel.textContent).toBe('RP');
  });

  it('Alt+M toggles the mode from anywhere and is not typed', () => {
    const { root, ta } = setup();
    const bar = root.querySelector('.input')!;
    const e = new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', altKey: true, bubbles: true, cancelable: true });
    ta.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(bar.classList.contains('mode-ooc')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'µ', code: 'KeyM', altKey: true, bubbles: true }));
    expect(bar.classList.contains('mode-rp')).toBe(true);
  });

  it('honours an initial mode and reports changes', () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onModeChange = vi.fn();
    mountInput(root, vi.fn(), { initialMode: 'ooc', onModeChange });
    const sel = root.querySelector('button.mode') as HTMLButtonElement;
    expect(sel.textContent).toBe('OOC');
    sel.click();
    expect(onModeChange).toHaveBeenCalledWith('rp');
  });
});

describe('DICE in the scene stack', () => {
  function diceSetup() {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onDice = vi.fn();
    const handle = mountInput(root, vi.fn(), { onDice });
    const btn = root.querySelector('button.dice') as HTMLButtonElement;
    return { root, onDice, handle, btn };
  }

  it('sits above DRAW with a die glyph; a click opens the dice table', () => {
    const { root, onDice, btn } = diceSetup();
    const keys = [...root.querySelectorAll<HTMLElement>('.scene-keys button.key')];
    expect(keys.map((b) => b.dataset.key)).toEqual(['suggest', 'dice', 'draw', 'end', 'leave']);
    expect(btn.querySelector('svg.glyph rect')).not.toBeNull();
    expect(btn.title).toBe("Liar's dice");
    btn.click();
    expect(onDice).toHaveBeenCalledTimes(1);
  });

  it('blocked, it is disabled with the reason as its title, and does nothing', () => {
    const { onDice, handle, btn } = diceSetup();
    handle.setDiceBlock('wait for her');
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('wait for her');
    btn.click();
    expect(onDice).not.toHaveBeenCalled();
    handle.setDiceBlock(null);
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(onDice).toHaveBeenCalledTimes(1);
  });
});

describe('SUGGEST', () => {
  function suggestSetup(suggest = vi.fn(async (_steer: string | null) => '*I sit.* "Fine."')) {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const send = vi.fn();
    const handle = mountInput(root, send, { suggest });
    const btn = root.querySelector('button.suggest') as HTMLButtonElement;
    const ta = root.querySelector('textarea')!;
    const hint = () => root.querySelector('.hint')!.textContent;
    return { root, send, handle, btn, ta, suggest, hint };
  }
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('Alt+G drafts into the empty box, unsent, and is not typed', async () => {
    const { ta, send, suggest, btn } = suggestSetup();
    expect(btn.title).toContain('Alt+G');
    const e = new KeyboardEvent('keydown', { key: 'g', code: 'KeyG', altKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    await settle();
    expect(suggest).toHaveBeenCalledWith(null);
    expect(ta.value).toBe('*I sit.* "Fine."');
    expect(send).not.toHaveBeenCalled();
  });

  it('what is typed is the steer, and the draft replaces it', async () => {
    const { ta, btn, suggest } = suggestSetup();
    ta.value = '  tell her no ';
    btn.click();
    await settle();
    expect(suggest).toHaveBeenCalledWith('tell her no');
    expect(ta.value).toBe('*I sit.* "Fine."');
  });

  it('while drafting it pulses and says so; a second press waits; typing meanwhile is kept after the draft', async () => {
    let finish: (s: string) => void = () => {};
    const suggest = vi.fn(() => new Promise<string>((r) => (finish = r)));
    const { ta, btn, hint } = suggestSetup(suggest);
    ta.value = 'steer';
    btn.click();
    expect(btn.classList.contains('working')).toBe(true);
    expect(hint()).toBe('// DRAFTING YOUR LINE');
    btn.click();
    expect(suggest).toHaveBeenCalledTimes(1);
    ta.value = 'steer and more';
    finish('Draft.');
    await settle();
    expect(ta.value).toBe('Draft.\nand more');
    expect(btn.classList.contains('working')).toBe(false);
    expect(hint()).toContain('[ENTER] SEND');
  });

  it('a draft that lands after a send is dropped', async () => {
    let finish: (s: string) => void = () => {};
    const { ta, btn, send } = suggestSetup(vi.fn(() => new Promise<string>((r) => (finish = r))));
    btn.click();
    ta.value = 'sent anyway';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(send).toHaveBeenCalledWith('sent anyway', 'rp');
    finish('Too late.');
    await settle();
    expect(ta.value).toBe('');
  });

  it('a failure leaves the box alone and says why in the hint for a while', async () => {
    vi.useFakeTimers();
    const { ta, btn, hint } = suggestSetup(vi.fn(async () => Promise.reject(new Error('NO CREDIT ON THE KEY'))));
    ta.value = 'my steer';
    btn.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(ta.value).toBe('my steer');
    expect(hint()).toBe('// NO LINE: NO CREDIT ON THE KEY');
    await vi.advanceTimersByTimeAsync(5000);
    expect(hint()).toContain('[ENTER] SEND');
    vi.useRealTimers();
  });

  it('waits while she transmits, in OOC, or without her link', () => {
    const { root, handle, btn, suggest } = suggestSetup();
    handle.setBusy(true);
    expect([btn.disabled, btn.title]).toEqual([true, 'Wait for her to finish.']);
    handle.setBusy(false);
    (root.querySelector('button.mode') as HTMLButtonElement).click();
    expect([btn.disabled, btn.title]).toEqual([true, 'Suggestions are for roleplay.']);
    (root.querySelector('button.mode') as HTMLButtonElement).click();
    handle.setDraw({ ok: false, why: 'No key.' });
    expect([btn.disabled, btn.title]).toEqual([true, 'No key.']);
    btn.click();
    expect(suggest).not.toHaveBeenCalled();
  });
});

describe('◆ DRAW', () => {
  function drawSetup() {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const onDraw = vi.fn();
    const handle = mountInput(root, vi.fn(), { onDraw });
    const btn = root.querySelector('button.draw') as HTMLButtonElement;
    const altD = () => {
      const e = new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', altKey: true, bubbles: true, cancelable: true });
      window.dispatchEvent(e);
      return e;
    };
    return { root, onDraw, handle, btn, altD };
  }

  it('sits before END SCENE; its click and Alt+D call onDraw; Alt+D is not typed', () => {
    const { root, onDraw, btn, altD } = drawSetup();
    expect(btn.textContent).toBe('◆ DRAW');
    expect([...root.querySelectorAll('.scene-keys button.key')].map((b) => b.textContent)).toEqual(['SUGGEST', 'DICE', '◆ DRAW', 'END SCENE', 'LEAVE']);
    expect(btn.title).toContain('Alt+D');
    btn.click();
    expect(altD().defaultPrevented).toBe(true);
    expect(onDraw).toHaveBeenCalledTimes(2);
  });

  it("disabled by setDraw, it doesn't draw, and its title is the why (Review Focus 5)", () => {
    const { onDraw, handle, btn, altD } = drawSetup();
    handle.setDraw({ ok: false, why: 'Encounters need her direct link.' });
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe('Encounters need her direct link.');
    btn.click();
    altD();
    expect(onDraw).not.toHaveBeenCalled();
    handle.setDraw({ ok: true });
    altD();
    expect(onDraw).toHaveBeenCalledTimes(1);
  });

  it("a why set before her portrait follows her pronoun once it arrives (final review 2)", () => {
    const { handle, btn } = drawSetup();
    handle.setDraw({ ok: false, why: () => her().encounters.noCredit });
    setHerPronoun('he');
    handle.setAgentName('Hicks');
    expect(btn.title).toBe('No credit on his key: top it up to have events dealt.');
    expect(handle.drawWhyNot()).toBe('No credit on his key: top it up to have events dealt.');
    setHerPronoun('she');
  });

  it('while she transmits, or in OOC, it does nothing and says why (Review Focus 5)', () => {
    const { root, onDraw, handle, btn, altD } = drawSetup();
    handle.setBusy(true);
    expect([btn.disabled, btn.title]).toEqual([true, 'Wait for her to finish.']);
    altD();
    handle.setBusy(false);
    (root.querySelector('button.mode') as HTMLButtonElement).click();
    expect([btn.disabled, btn.title]).toEqual([true, 'Encounters are for roleplay.']);
    altD();
    expect(onDraw).not.toHaveBeenCalled();
  });
});

describe('the hint makes room for END SCENE', () => {
  // A fake layout: the bar is `room` px; its content needs 900px with the whole idle hint shown,
  // less each part that's hidden (by its width below). The field keeps at least 160px when it fits.
  const width: Record<string, number> = { '[ENTER] SEND': 110, '[SHIFT+ENTER] NEWLINE': 190, '[ALT+M] MODE': 110, '[`] ADMIN': 80 };
  let room = 0;
  const saved: Array<[string, PropertyDescriptor]> = [];
  afterEach(() => {
    for (const [prop, desc] of saved.splice(0)) Object.defineProperty(Element.prototype, prop, desc);
  });
  function fitBar(w: number) {
    room = w;
    const need = (bar: Element) =>
      900 - [...bar.querySelectorAll<HTMLElement>('.hint-part')].filter((p) => p.hidden).reduce((s, p) => s + (width[p.textContent!] ?? 0), 0);
    const fake: Record<string, (this: HTMLElement) => number> = {
      clientWidth() {
        if (this.classList.contains('input')) return room;
        if (this.classList.contains('field')) return Math.max(0, room - need(this.closest('.input')!) + 160);
        return 0;
      },
      scrollWidth() {
        return this.classList.contains('input') ? Math.max(room, need(this)) : 0;
      },
    };
    for (const prop of ['clientWidth', 'scrollWidth']) {
      saved.push([prop, Object.getOwnPropertyDescriptor(Element.prototype, prop)!]);
      Object.defineProperty(Element.prototype, prop, { configurable: true, get: fake[prop] });
    }
    const s = setup();
    const shown = () => [...s.root.querySelectorAll<HTMLElement>('.hint-part')].filter((p) => !p.hidden).map((p) => p.textContent);
    return { ...s, shown };
  }

  it('shows the whole hint while it fits', () => {
    expect(fitBar(1000).shown()).toEqual(['[ENTER] SEND', '[SHIFT+ENTER] NEWLINE', '[ALT+M] MODE', '[`] ADMIN']);
  });

  it('drops SHIFT+ENTER NEWLINE, then ALT+M MODE, then ENTER SEND, then ` ADMIN', () => {
    expect(fitBar(850).shown()).toEqual(['[ENTER] SEND', '[ALT+M] MODE', '[`] ADMIN']);
    expect(fitBar(650).shown()).toEqual(['[ENTER] SEND', '[`] ADMIN']);
    expect(fitBar(550).shown()).toEqual(['[`] ADMIN']);
    expect(fitBar(300).shown()).toEqual([]);
  });

  it('never hides END SCENE', () => {
    const { root } = fitBar(300);
    expect(root.querySelector<HTMLElement>('.end-scene')!.hidden).toBe(false);
  });

  it('a wider window brings the parts back', () => {
    const { shown } = fitBar(550);
    room = 1000;
    window.dispatchEvent(new Event('resize'));
    expect(shown()).toEqual(['[ENTER] SEND', '[SHIFT+ENTER] NEWLINE', '[ALT+M] MODE', '[`] ADMIN']);
  });
});

describe('the scene stack (spec 2026-10-16 subtitle chat box §6)', () => {
  beforeEach(() => localStorage.clear());

  it('DRAW, END SCENE and LEAVE live in .scene-keys beside the bar, then the fold arrow', () => {
    const { root } = setup();
    const stack = root.querySelector<HTMLElement>('.scene-keys')!;
    expect(stack.getAttribute('role')).toBe('toolbar');
    expect(stack.getAttribute('aria-label')).toBe('Scene actions');
    for (const cls of ['draw', 'end-scene', 'leave-scene']) {
      expect(stack.querySelector(`button.${cls}`)).not.toBeNull();
      expect(root.querySelector(`.input button.${cls}`)).toBeNull();
    }
    expect(stack.lastElementChild!.classList.contains('fold')).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('button.end-scene')!.title).toContain('Alt+E');
  });

  it('Alt+D and Alt+E still work with the stack folded', () => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const send = vi.fn();
    const onDraw = vi.fn();
    mountInput(root, send, { onDraw });
    root.querySelector<HTMLButtonElement>('.scene-keys .fold')!.click();
    expect(root.querySelector('.scene-keys')!.classList.contains('folded')).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', altKey: true, bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', code: 'KeyE', altKey: true, bubbles: true, cancelable: true }));
    expect(onDraw).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('', 'end');
  });

  it('WALK OUT hides the stack; stay brings it back still folded, and it still unfolds (Review Focus 3)', () => {
    const { root, handle } = setup();
    const stack = root.querySelector<HTMLElement>('.scene-keys')!;
    stack.querySelector<HTMLButtonElement>('.fold')!.click();
    handle.setWalkOut(true);
    expect(stack.hidden).toBe(true);
    root.querySelector<HTMLButtonElement>('button.walk-out-stay')!.click();
    expect(stack.hidden).toBe(false);
    expect(stack.classList.contains('folded')).toBe(true);
    stack.querySelector<HTMLButtonElement>('.fold')!.click();
    expect(stack.classList.contains('folded')).toBe(false);
    handle.setWalkOut(false);
  });
});

describe('WALK OUT stands in for both stacks (final review)', () => {
  it('marks the page while WALK OUT is up, so the line stack hides too; stay clears it', () => {
    const { root, handle } = setup();
    handle.setWalkOut(true);
    expect(document.documentElement.classList.contains('walking-out')).toBe(true);
    root.querySelector<HTMLButtonElement>('button.walk-out-stay')!.click();
    expect(document.documentElement.classList.contains('walking-out')).toBe(false);
    handle.setWalkOut(true);
    handle.setWalkOut(false);
    expect(document.documentElement.classList.contains('walking-out')).toBe(false);
  });

  it('the stylesheet hides the line stack while walking out', () => {
    const css = readFileSync('web/src/ui/style.css', 'utf8');
    expect(css).toMatch(/\.walking-out \.line-keys[^{]*\{[^}]*display:\s*none/);
  });
});
