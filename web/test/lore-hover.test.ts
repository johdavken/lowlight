import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installLoreCard, markLore, setGlossary } from '../src/ui/lore-hover';

const GLOSSARY = [
  { id: 'cortex-global', title: 'Cortex Global', keys: ['Cortex', 'Cortex Global'], text: 'They own the lights.' },
  { id: 'aegis', title: 'Aegis Solutions', keys: ['Aegis'], text: 'Cheaper than SDG.' },
];
const line = (text: string) => {
  const p = document.createElement('div');
  p.textContent = text;
  document.body.append(p);
  return p;
};
const marks = (n: HTMLElement) => [...n.querySelectorAll<HTMLElement>('.lore-word')].map((m) => [m.dataset.lore, m.textContent]);

beforeEach(() => setGlossary(GLOSSARY));
afterEach(() => {
  setGlossary([]);
  document.body.innerHTML = '';
});

describe('markLore', () => {
  it('marks each entry once per line, longest key first, ignoring case, whole words only', () => {
    const p = line('Cortex Global runs it. cortex again, and Aegis. Cortexian is not a word here.');
    markLore(p);
    expect(marks(p)).toEqual([
      ['cortex-global', 'Cortex Global'],
      ['aegis', 'Aegis'],
    ]);
    expect(p.textContent).toBe('Cortex Global runs it. cortex again, and Aegis. Cortexian is not a word here.');
  });

  it('marks inside italics, leaves passive labels and marked words alone, and marks again idempotently', () => {
    const p = document.createElement('div');
    p.innerHTML = '<span class="qr-passive">AEGIS ·</span> <em>An Aegis van.</em>';
    document.body.append(p);
    markLore(p);
    markLore(p);
    expect(marks(p)).toEqual([['aegis', 'Aegis']]);
    expect(p.querySelector('em .lore-word')).not.toBeNull();
  });

  it('does nothing with no glossary', () => {
    setGlossary([]);
    const p = line('Aegis.');
    markLore(p);
    expect(marks(p)).toEqual([]);
  });
});

describe('the lore card', () => {
  it('shows the title and text on hover or focus, and goes on leave or Escape', () => {
    const off = installLoreCard(document.body);
    const p = line('An Aegis van.');
    markLore(p);
    const word = p.querySelector<HTMLElement>('.lore-word')!;
    word.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const card = document.querySelector<HTMLElement>('.lore-card')!;
    expect(card.hidden).toBe(false);
    expect(card.querySelector('.lore-card-title')!.textContent).toBe('Aegis Solutions');
    expect(card.querySelector('.lore-card-text')!.textContent).toBe('Cheaper than SDG.');
    word.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    expect(card.hidden).toBe(true);
    word.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(card.hidden).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(card.hidden).toBe(true);
    off();
    expect(document.querySelector('.lore-card')).toBeNull();
  });

  it('a tap toggles it (touch has no hover)', () => {
    installLoreCard(document.body);
    const p = line('An Aegis van.');
    markLore(p);
    const word = p.querySelector<HTMLElement>('.lore-word')!;
    word.click();
    expect(document.querySelector<HTMLElement>('.lore-card')!.hidden).toBe(false);
    word.click();
    expect(document.querySelector<HTMLElement>('.lore-card')!.hidden).toBe(true);
  });
});
