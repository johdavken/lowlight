/** The deck catalog (missions spec §1): world/gear/decks.md, read once at startup (restart after editing). */
import fs from 'node:fs';
import path from 'node:path';
import { parseDecks, type Deck } from '../../shared/gear';
import { parseStock, type StockItem } from '../../shared/stock';
import { parseWords } from '../../shared/crack';

export const DEFAULT_GEAR_DIR = './world/gear';

/** The decks in `dir`/decks.md; each bad block warns and is skipped; a missing file has none. */
export function loadDecks(dir: string, warn: (m: string) => void): Deck[] {
  let text: string;
  try {
    text = fs.readFileSync(path.join(dir, 'decks.md'), 'utf8');
  } catch {
    return [];
  }
  const r = parseDecks(text);
  for (const p of r.problems) warn(`decks: ${p}; skipping it`);
  return r.decks;
}

/** The fixers' stock (small jobs spec §5): world/gear/stock.md; each bad line warns and is skipped; a missing file has none. */
export function loadStock(dir: string, decks: Deck[], warn: (m: string) => void): Record<string, StockItem[]> {
  let text: string;
  try {
    text = fs.readFileSync(path.join(dir, 'stock.md'), 'utf8');
  } catch {
    return {};
  }
  const r = parseStock(text, new Set(decks.map((d) => d.id)));
  for (const p of r.problems) warn(`stock: ${p}; skipping it`);
  return r.byPlace;
}

/** The terminal words (small jobs spec §4): world/gear/words.md, every length in one list; a short length warns; a missing file has none. */
export function loadWords(dir: string, warn: (m: string) => void): string[] {
  let text: string;
  try {
    text = fs.readFileSync(path.join(dir, 'words.md'), 'utf8');
  } catch {
    return [];
  }
  const r = parseWords(text);
  for (const p of r.warnings) warn(`words: ${p}`);
  return Object.values(r.byLength).flat();
}
