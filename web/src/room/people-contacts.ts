/**
 * PEOPLE's CONTACTS tab (2026-10-18 spec §2): a roster of the contacts you know in this playthrough on the left
 * (face, name in her accent, her standing word, `● HERE` on the one you're with), and the selected one's file on
 * the right: her figure, standing, where she is and her last line, her file (the select screen's bio and facts,
 * spec 2026-10-28 §4), and the leads that point to her. GO (or Enter) goes to her.
 */
import type { ContactEntry, LeadView } from '../../../shared/types';

/** A tab that takes the screen's ↑ / ↓ / Enter (true: handled). */
export type KeyedTab = HTMLElement & { handleKey?(e: KeyboardEvent): boolean };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.className = cls;
  if (text) n.textContent = text;
  return n;
}

/** "<place> · "<line>"", the speaker named when it isn't her; "<place> · heard from <Name>" before you've met. */
export function lineFor(c: ContactEntry): string {
  // Her plan's tail follows her place (her plans spec §7): where she is, then where she'll be.
  const where = c.planTail ? `${c.placeName} · ${c.planTail}` : c.placeName;
  if (c.status === 'shared') return `${where} · heard from ${c.sharedBy ?? 'someone'}`;
  if (!c.lastLine) return c.status === 'knows' ? `${where} · from before` : where;
  const who = c.lastLine.speaker === c.name ? '' : `${c.lastLine.speaker}: `;
  return `${where} · ${who}"${c.lastLine.text}"`;
}

/** `T+3 W−1 · last: "paid on time"`: the dev panel's look at her values (a real minus sign; — with no moves). */
export function standingHover(s: NonNullable<ContactEntry['standing']>): string {
  const n = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');
  return `T${n(s.trust)} W${n(s.warmth)} · last: ${s.last === null ? '—' : `"${s.last}"`}`;
}

/** Her face (or initial): a small round picture for the roster. */
function face(c: ContactEntry, cls: string): HTMLElement {
  const initial = () => el('span', `${cls} pe-mono`, c.name.charAt(0).toUpperCase());
  if (!c.portrait) return initial();
  const img = el('img', cls);
  img.alt = '';
  img.src = c.portrait;
  img.addEventListener('error', () => img.replaceWith(initial()), { once: true });
  return img;
}

export function contactsTab(list: ContactEntry[], leads: LeadView[], o: { current: string; dev: boolean; pick(id: string): void }): KeyedTab {
  const root: KeyedTab = el('div', 'pe-contacts');
  if (!list.length) {
    root.append(el('div', 'pe-empty', 'Nobody yet.'));
    return root;
  }
  const roster = el('div', 'pe-roster');
  const file = el('div', 'pe-file');
  let at = Math.max(0, list.findIndex((c) => c.id === o.current));

  const tiles = list.map((c, i) => {
    const t = el('button', 'pe-tile');
    t.type = 'button';
    t.dataset.id = c.id;
    t.style.setProperty('--c', c.accent);
    const text = el('span', 'pe-tile-text');
    text.append(el('b', 'pe-tile-name', c.name.toUpperCase()));
    if (c.standing) text.append(el('span', 'pe-tile-standing', c.standing.word));
    if (c.id === o.current) text.append(el('span', 'pe-here', '● HERE'));
    const inner = el('span', 'pe-tile-in');
    inner.append(face(c, 'pe-face'), text);
    t.append(inner);
    t.addEventListener('click', () => select(i));
    // Tab onto a tile selects it, so Enter (or GO) goes where the file shows.
    t.addEventListener('focus', () => select(i));
    return t;
  });
  roster.append(...tiles);

  function drawFile(c: ContactEntry): void {
    file.style.setProperty('--c', c.accent);
    // Her figure: her sprite, then her portrait, then her initial.
    const fig = el('div', 'pe-fig');
    const mono = () => el('div', 'pe-mono pe-big', c.name.charAt(0).toUpperCase());
    const img = el('img', 'pe-figure');
    img.alt = c.name;
    img.src = `/api/agents/${encodeURIComponent(c.id)}/sprite`;
    img.addEventListener('error', () => {
      if (c.portrait && img.getAttribute('src') !== c.portrait) img.src = c.portrait;
      else img.replaceWith(mono());
    });
    fig.append(img);
    const info = el('div', 'pe-info');
    info.append(el('div', 'pe-name', c.name.toUpperCase()));
    if (c.standing) {
      const word = el('div', 'pe-standing', c.standing.word);
      if (o.dev) word.title = standingHover(c.standing);
      info.append(word);
    }
    // Her deal (arrangement spec 2026-10-20 §3): her terms while it's in force, else that she's stepped back.
    if (c.arrangement) info.append(el('div', 'pe-arrangement', c.arrangement.active ? `YOUR OPERATOR · ${c.arrangement.retainer} A NIGHT · ${c.arrangement.nights === 1 ? 'ONE JOB' : 'TWO JOBS'} A NIGHT` : 'STEPPED BACK'));
    info.append(el('div', 'pe-where', lineFor(c)));
    // Her file (spec 2026-10-28 §4): the select screen's bio and facts, for anyone listed, heard-of ones too.
    const bio = c.bio ?? [];
    const facts = c.facts ?? [];
    if (bio.length || facts.length) info.append(el('div', 'pe-sub', 'FILE'));
    if (bio.length) {
      const b = el('div', 'pe-bio');
      b.append(...bio.map((para) => el('p', '', para)));
      info.append(b);
    }
    if (facts.length) {
      const dl = el('dl', 'pe-facts');
      for (const f of facts) dl.append(el('dt', '', f.label), el('dd', '', f.value));
      info.append(dl);
    }
    const hers = leads.filter((l) => l.to === c.id);
    if (hers.length) {
      info.append(el('div', 'pe-sub', 'LEADS TO HER'));
      const ul = el('ul', 'pe-leads');
      for (const l of hers) ul.append(el('li', l.followed ? 'followed' : '', l.title));
      info.append(ul);
    }
    const go = el('button', 'pe-go', 'GO');
    go.type = 'button';
    if (c.id === o.current) {
      go.disabled = true;
      go.title = "you're here";
    } else go.addEventListener('click', () => o.pick(c.id));
    info.append(go);
    file.replaceChildren(fig, info);
  }

  function select(i: number): void {
    at = Math.min(list.length - 1, Math.max(0, i));
    tiles.forEach((t, j) => t.classList.toggle('on', j === at));
    drawFile(list[at]);
  }

  root.handleKey = (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      select(at + (e.key === 'ArrowUp' ? -1 : 1));
      return true;
    }
    if (e.key === 'Enter') {
      if (list[at].id !== o.current) o.pick(list[at].id);
      return true;
    }
    return false;
  };

  root.append(roster, file);
  select(at);
  return root;
}
