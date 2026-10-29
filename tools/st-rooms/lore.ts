// Lowlight's lore book (world/lore/*.md) as a SillyTavern World Info book: one entry per file, triggered by its keys,
// the always-on ones constant. Districts and places (Lowlight's own conditions) don't carry over.
//
// When more triggers than SillyTavern's budget holds, it keeps the highest `order` first, so the order ranks entries by
// what a scene needs most (people, then places, then the city…). Lowlight ranks by how recently a key came up, which
// SillyTavern can't do; this is the nearest plain-field version. No entry's text triggers others, as in Lowlight.

export interface WorldInfoEntry {
  uid: number;
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  selectiveLogic: number;
  addMemo: boolean;
  order: number;
  /** Always in, whatever the budget (the always-on entries). */
  ignoreBudget: boolean;
  position: number;
  disable: boolean;
  excludeRecursion: boolean;
  preventRecursion: boolean;
  delayUntilRecursion: boolean;
  probability: number;
  useProbability: boolean;
  depth: number;
  group: string;
  groupOverride: boolean;
  groupWeight: number;
  scanDepth: null;
  caseSensitive: null;
  matchWholeWords: null;
  useGroupScoring: null;
  automationId: string;
  role: null;
  sticky: number;
  cooldown: number;
  delay: number;
  displayIndex: number;
  vectorized: boolean;
}

/** `---` front matter (key: value lines) and the body after it; no front matter: none, the whole text as body. */
function frontMatter(text: string): { meta: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text.trim() };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2].trim() };
}

/** Budget rank by category (higher is kept first); a category not listed ranks with the city. */
const CATEGORY_ORDER: Record<string, number> = { People: 300, Places: 250, City: 200, Factions: 200, Tech: 150, Culture: 150, 'Across the Water': 100 };
const ALWAYS_ORDER = 1000;
/** Lowlight keeps these to a district or place; SillyTavern fires them anywhere, so they give way to the rest. */
const SCOPED_PENALTY = 25;

const list = (v: string | undefined) =>
  (v ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function worldInfoFrom(files: { name: string; text: string }[]): { entries: Record<string, WorldInfoEntry> } {
  const entries: Record<string, WorldInfoEntry> = {};
  files.forEach((f, uid) => {
    const { meta, body } = frontMatter(f.text);
    const always = meta.always === 'true';
    const scoped = list(meta.districts).length > 0 || list(meta.places).length > 0;
    const order = always ? ALWAYS_ORDER : (CATEGORY_ORDER[meta.category ?? ''] ?? CATEGORY_ORDER.City) - (scoped ? SCOPED_PENALTY : 0);
    entries[String(uid)] = {
      uid,
      key: list(meta.keys),
      keysecondary: [],
      comment: meta.title || f.name.replace(/\.md$/, ''),
      content: body,
      constant: always,
      selective: true,
      selectiveLogic: 0,
      addMemo: true,
      order,
      ignoreBudget: always,
      position: 0,
      disable: false,
      excludeRecursion: false,
      preventRecursion: true,
      delayUntilRecursion: false,
      probability: 100,
      useProbability: true,
      depth: 4,
      group: '',
      groupOverride: false,
      groupWeight: 100,
      scanDepth: null,
      caseSensitive: null,
      matchWholeWords: null,
      useGroupScoring: null,
      automationId: '',
      role: null,
      sticky: 0,
      cooldown: 0,
      delay: 0,
      displayIndex: uid,
      vectorized: false,
    };
  });
  return { entries };
}
