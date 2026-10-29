/**
 * PEOPLE's LEADS tab (2026-10-18 spec §2): the leads you hold on the left (the face of who each points to, or
 * a ? before you've met them; followed ones under FOLLOWED, dimmed), and the selected lead in full on the right.
 * Read-only.
 */
import type { LeadView } from '../../../shared/types';
import type { KeyedTab } from './people-contacts';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function face(l: LeadView): HTMLElement {
  if (!l.met || !l.portrait) return el('span', 'pe-face pe-mono pe-unknown', '?');
  const img = el('img', 'pe-face');
  img.alt = '';
  img.src = l.portrait;
  img.addEventListener('error', () => img.replaceWith(el('span', 'pe-face pe-mono', l.toName.charAt(0).toUpperCase())), { once: true });
  return img;
}

export function leadsTab(list: LeadView[]): KeyedTab {
  const root: KeyedTab = el('div', 'pe-leads-tab');
  if (!list.length) {
    root.append(el('div', 'pe-empty', 'No leads yet. People tell you things; the useful ones end up here.'));
    return root;
  }
  const ordered = [...list.filter((l) => !l.followed), ...list.filter((l) => l.followed)];
  const side = el('div', 'pe-leadlist');
  const detail = el('div', 'pe-lead-detail');
  let at = 0;

  const cards = ordered.map((l, i) => {
    const b = el('button', `pe-lead${l.followed ? ' followed' : ''}`);
    b.type = 'button';
    b.dataset.id = l.id;
    const inner = el('span', 'pe-lead-in');
    inner.append(face(l), el('span', 'pe-lead-name', l.title));
    b.append(inner);
    b.addEventListener('click', () => select(i));
    return b;
  });
  cards.forEach((c, i) => {
    if (i > 0 && ordered[i].followed && !ordered[i - 1].followed) side.append(el('div', 'pe-sub', 'FOLLOWED'));
    else if (i === 0 && ordered[0].followed) side.append(el('div', 'pe-sub', 'FOLLOWED'));
    side.append(c);
  });

  function select(i: number): void {
    at = Math.min(ordered.length - 1, Math.max(0, i));
    cards.forEach((c, j) => c.classList.toggle('on', j === at));
    const l = ordered[at];
    detail.replaceChildren(
      el('div', 'pe-lead-title', l.title),
      el('div', 'pe-lead-text', l.details),
      el('div', 'pe-lead-to', `→ ${l.toName.toUpperCase()}${l.place ? ` · ${l.place}` : ''}`),
    );
    detail.classList.toggle('followed', l.followed);
  }

  root.handleKey = (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;
    select(at + (e.key === 'ArrowUp' ? -1 : 1));
    return true;
  };

  root.append(side, detail);
  select(0);
  return root;
}
