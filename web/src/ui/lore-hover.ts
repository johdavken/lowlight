/**
 * Lore words (feedback 2026-10-19): a lore entry's keys in her lines and the quest panel's story are
 * marked, and hovering (focusing, tapping) one shows a small card with the entry's title and its first
 * two sentences — the on-the-street version where there is one, so insider lore never spoils. Each
 * entry is marked once per line. The glossary comes from GET /api/lore/glossary.
 */
import { loreKeyMatches, type GlossaryEntry } from '../../../shared/lore';

let entries = new Map<string, GlossaryEntry>();
/** Lowercased key → the entries with that key, as written (its capitals count: lore picking spec §1). */
let byKey = new Map<string, { id: string; key: string }[]>();
let pattern: RegExp | null = null;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function setGlossary(glossary: readonly GlossaryEntry[]): void {
  entries = new Map(glossary.map((g) => [g.id, g]));
  byKey = new Map();
  for (const g of glossary) for (const key of g.keys) byKey.set(key.toLowerCase(), [...(byKey.get(key.toLowerCase()) ?? []), { id: g.id, key }]);
  const keys = [...byKey.keys()].sort((a, b) => b.length - a.length).map(escape);
  atKeys = [...byKey.keys()].sort((a, b) => b.length - a.length).map((lower) => ({ lower, re: new RegExp(`${escape(lower)}(?![\\p{L}\\p{N}])`, 'iuy') }));
  // Whole words: no letter or digit on either side (so "Cortexian" isn't "Cortex").
  pattern = keys.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${keys.join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
}

/** Each key on its own, matched at a position (sticky), longest first: for when the longest match fails its capitals. */
let atKeys: { lower: string; re: RegExp }[] = [];

/**
 * The entry and words at `from`: marked text is hers or the game's, so a capitalised key keeps its capitals
 * (lore picking spec §1: "a shelf" isn't the Shelf). When the longest key there fails that, a shorter one starting
 * at the same place may not ("Freight Runners" fails as "freight runners", "freight" doesn't).
 */
function strictAt(text: string, from: number, longest: string): { id: string; word: string } | null {
  const tryKey = (lower: string, word: string) => {
    const id = byKey.get(lower)?.find((k) => loreKeyMatches(k.key, word, true))?.id;
    return id ? { id, word } : null;
  };
  const first = tryKey(longest.toLowerCase(), longest);
  if (first) return first;
  for (const k of atKeys) {
    if (k.lower.length >= longest.length) continue;
    k.re.lastIndex = from;
    const m = k.re.exec(text);
    const hit = m ? tryKey(k.lower, m[0]) : null;
    if (hit) return hit;
  }
  return null;
}

/** Text that stays unmarked: a marked word, a passive line's label, a control. */
const SKIP = '.lore-word, .qr-passive, button, a, input, textarea';

/** Marks the lore words in `root` (one per entry, first come); safe to call again on the same text. */
export function markLore(root: HTMLElement): void {
  if (!pattern) return;
  const done = new Set([...root.querySelectorAll<HTMLElement>('.lore-word')].map((n) => n.dataset.lore!));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentElement?.closest(SKIP) ?? null) !== null ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  for (const node of nodes) {
    const text = node.data;
    const hits: { from: number; to: number; id: string }[] = [];
    pattern.lastIndex = 0;
    for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
      const hit = strictAt(text, m.index, m[1]);
      // None here: a key inside what matched may still be one ("freight runners" holds "runners").
      if (!hit) {
        pattern.lastIndex = m.index + 1;
        continue;
      }
      pattern.lastIndex = m.index + hit.word.length;
      if (done.has(hit.id)) continue;
      done.add(hit.id);
      hits.push({ from: m.index, to: m.index + hit.word.length, id: hit.id });
    }
    if (!hits.length) continue;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const h of hits) {
      if (h.from > at) frag.append(text.slice(at, h.from));
      const word = document.createElement('span');
      word.className = 'lore-word';
      word.dataset.lore = h.id;
      word.tabIndex = 0;
      word.textContent = text.slice(h.from, h.to);
      frag.append(word);
      at = h.to;
    }
    if (at < text.length) frag.append(text.slice(at));
    node.replaceWith(frag);
  }
}

/** The one card for every lore word under `host`: hover, focus or tap shows it by the word; leaving, blur or Escape hides it. Returns its removal. */
export function installLoreCard(host: HTMLElement): () => void {
  const card = document.createElement('div');
  card.className = 'lore-card';
  card.hidden = true;
  card.setAttribute('role', 'tooltip');
  const title = document.createElement('div');
  title.className = 'lore-card-title';
  const body = document.createElement('div');
  body.className = 'lore-card-text';
  card.append(title, body);
  host.append(card);
  let showing: HTMLElement | null = null;

  const wordOf = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('.lore-word') : null);
  const show = (word: HTMLElement) => {
    const g = entries.get(word.dataset.lore ?? '');
    if (!g) return;
    title.textContent = g.title;
    body.textContent = g.text;
    card.hidden = false;
    showing = word;
    // Above the word, kept inside the host; the stage may be zoomed, so screen offsets are scaled back to its own px.
    const h = host.getBoundingClientRect();
    const w = word.getBoundingClientRect();
    const z = host.offsetWidth > 0 ? h.width / host.offsetWidth : 1;
    card.style.left = `${Math.max(0, Math.min((w.left - h.left) / z, host.offsetWidth - card.offsetWidth))}px`;
    card.style.top = `${Math.max(0, (w.top - h.top) / z - card.offsetHeight - 8)}px`;
  };
  const hide = () => {
    card.hidden = true;
    showing = null;
  };
  const over = (e: Event) => {
    const w = wordOf(e.target);
    if (w) show(w);
  };
  const out = (e: Event) => {
    if (wordOf(e.target)) hide();
  };
  const click = (e: Event) => {
    const w = wordOf(e.target);
    if (!w) return;
    if (showing === w && !card.hidden) hide();
    else show(w);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !card.hidden) hide();
  };
  host.addEventListener('mouseover', over);
  host.addEventListener('mouseout', out);
  host.addEventListener('focusin', over);
  host.addEventListener('focusout', out);
  host.addEventListener('click', click);
  window.addEventListener('keydown', key);
  return () => {
    host.removeEventListener('mouseover', over);
    host.removeEventListener('mouseout', out);
    host.removeEventListener('focusin', over);
    host.removeEventListener('focusout', out);
    host.removeEventListener('click', click);
    window.removeEventListener('keydown', key);
    card.remove();
  };
}
