import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecapCard, createRecapGate } from '../src/ui/recap';

let cards: RecapCard[] = [];
afterEach(() => {
  for (const c of cards) c.dispose();
  cards = [];
});

function setup() {
  document.body.innerHTML = '';
  const prompt = document.createElement('textarea');
  const root = document.createElement('div');
  document.body.append(prompt, root);
  const onSeen = vi.fn();
  const card = new RecapCard(root, onSeen);
  cards.push(card);
  return { root, prompt, onSeen, card };
}

describe('RecapCard', () => {
  it('shows // PREVIOUSLY, the text as text, and PRESS ANY KEY', () => {
    const { root, card } = setup();
    expect(card.visible).toBe(false);
    card.show('we closed the <b>stall</b> at dawn');
    expect(card.visible).toBe(true);
    expect(root.querySelector('.recap-title')!.textContent).toBe('// PREVIOUSLY');
    expect(root.querySelector('.recap-text')!.textContent).toBe('we closed the <b>stall</b> at dawn');
    expect(root.querySelector('.recap-text b')).toBeNull();
    expect(root.querySelector('.recap-hint')!.textContent).toBe('PRESS ANY KEY');
  });

  it("the dismissing key never reaches the prompt or later listeners, and onSeen fires once (Review Focus 4)", () => {
    const { prompt, onSeen, card } = setup();
    const later = vi.fn();
    window.addEventListener('keydown', later);
    prompt.focus();
    card.show('recap');
    const e = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    prompt.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(later).not.toHaveBeenCalled();
    expect(card.visible).toBe(false);
    expect(onSeen).toHaveBeenCalledTimes(1);
    prompt.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }));
    expect(later).toHaveBeenCalledTimes(1);
    expect(onSeen).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', later);
  });

  it('a click on the card or the dim backdrop dismisses it', () => {
    const { root, onSeen, card } = setup();
    card.show('recap');
    (root.querySelector('.recap-card') as HTMLElement).click();
    expect(card.visible).toBe(false);
    card.show('recap');
    root.click();
    expect(card.visible).toBe(false);
    expect(onSeen).toHaveBeenCalledTimes(2);
  });

  it('a lone modifier (the Alt of Alt+Tab) or a Ctrl/Meta shortcut leaves it up and passes through (final review 10)', () => {
    const { prompt, onSeen, card } = setup();
    card.show('recap');
    for (const k of ['Alt', 'Shift', 'Control', 'Meta']) {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      prompt.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    }
    const reload = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, bubbles: true, cancelable: true });
    prompt.dispatchEvent(reload);
    expect(reload.defaultPrevented).toBe(false);
    expect(card.visible).toBe(true);
    expect(onSeen).not.toHaveBeenCalled();
  });
});

describe('recap gate', () => {
  const ev = (text: string | null, seen: boolean) => ({ type: 'recap' as const, text, at: text ? 1 : null, seen });

  it('greets with an unseen recap only in the sync after (re)connecting', () => {
    const gate = createRecapGate();
    gate.onConnect();
    expect(gate.onEvent(ev('r', false))).toBe('r');
    // She writes a new recap while the player is still here: it waits for his next dial-in.
    expect(gate.onEvent(ev('newer', false))).toBeNull();
    gate.onConnect();
    expect(gate.onEvent(ev('newer', false))).toBe('newer');
  });

  it('never greets with a seen or missing recap', () => {
    const gate = createRecapGate();
    gate.onConnect();
    expect(gate.onEvent(ev('r', true))).toBeNull();
    gate.onConnect();
    expect(gate.onEvent(ev(null, false))).toBeNull();
  });
});
