/**
 * PEOPLE's LOOSE ENDS tab (cipher spec §2.8): the small things you noticed that point somewhere, grouped by what
 * they point to but never naming it, and the truths you learned with what pointed to them. Read-only.
 */
import type { LooseClue, LooseEndsView } from '../../../shared/types';
import { formatClock } from '../../../shared/clock';
import type { KeyedTab } from './people-contacts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function line(c: LooseClue): HTMLElement {
  const row = el('div', 'pe-loose-line');
  row.append(el('span', 'pe-loose-text', c.text), el('span', 'pe-loose-where', `${c.place} · ${formatClock(c.at)}`));
  return row;
}

export function looseEndsTab(v: LooseEndsView): KeyedTab {
  const root: KeyedTab = el('div', 'pe-loose-tab');
  if (v.open.length === 0 && v.solved.length === 0) {
    root.append(el('div', 'pe-empty', "Nothing you've noticed yet."));
    return root;
  }
  for (const group of v.open) {
    const g = el('div', 'pe-loose-group');
    g.append(...group.map(line));
    root.append(g);
  }
  if (v.solved.length > 0) root.append(el('div', 'pe-sub', 'SOLVED'));
  for (const s of v.solved) {
    const card = el('div', 'pe-loose-solved');
    card.append(el('div', 'pe-loose-truth', s.truth));
    if (s.clues.length > 0) card.append(el('div', 'pe-loose-label', 'WHAT POINTED TO IT'), ...s.clues.map(line));
    root.append(card);
  }
  return root;
}
