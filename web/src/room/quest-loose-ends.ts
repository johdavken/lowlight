/**
 * QUEST's LOOSE ENDS tab (cipher spec §2.8; on QUEST since 2026-11-04): the small things you noticed that point somewhere, grouped by what
 * they point to but never naming it, and the truths you learned with what pointed to them. Read-only.
 */
import type { LooseClue, LooseEndsView } from '../../../shared/types';
import { formatClock } from '../../../shared/clock';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function line(c: LooseClue): HTMLElement {
  const row = el('div', 'ql-loose-line');
  row.append(el('span', 'ql-loose-text', c.text), el('span', 'ql-loose-where', `${c.place} · ${formatClock(c.at)}`));
  return row;
}

export function looseEndsTab(v: LooseEndsView): HTMLElement {
  const root = el('div', 'ql-loose-tab');
  if (v.open.length === 0 && v.solved.length === 0) {
    root.append(el('div', 'ql-none', "Nothing you've noticed yet."));
    return root;
  }
  for (const group of v.open) {
    const g = el('div', 'ql-loose-group');
    g.append(...group.map(line));
    root.append(g);
  }
  if (v.solved.length > 0) root.append(el('div', 'ql-group', 'SOLVED'));
  for (const s of v.solved) {
    const card = el('div', 'ql-loose-solved');
    card.append(el('div', 'ql-loose-truth', s.truth));
    if (s.clues.length > 0) card.append(el('div', 'ql-loose-label', 'WHAT POINTED TO IT'), ...s.clues.map(line));
    root.append(card);
  }
  return root;
}
