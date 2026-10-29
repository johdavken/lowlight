/**
 * Cracking a terminal (small jobs spec §4): a memory dump with words hidden in junk, Fallout's likeness
 * rules, and bracket pairs that strike duds or reset tries. Pure and seeded: the server and the browser
 * build the same terminal from the same seed, and the server scores the moves (plan ruling 3).
 */
import { rng } from './gig/generate';
import type { DeckSkin } from './gear';

/** The terminal's look (deck skins spec): the deck's skin, or `corp` for a corporate terminal. */
export type TerminalSkin = DeckSkin | 'corp';

export const DUMP_LINES = 32;
export const DUMP_WIDTH = 12;
const JUNK = '!"#$%&\'*+,-./:;=?@\\^_|~';
const PAIRS = ['[]', '()', '{}', '<>'];

export interface Terminal {
  lines: string[];
  words: { word: string; line: number; col: number }[];
  brackets: { line: number; from: number; to: number }[];
  password: string;
  /** Duds struck before the first move (a strong deck). */
  struck: string[];
  /** One letter of the password shown (a ghost deck). */
  ghost: { index: number; letter: string } | null;
  hint: string | null;
  tries: number;
  /** The order brackets strike duds in. */
  dudOrder: string[];
}

export type Move = { word: string } | { bracket: number };

export interface Played {
  state: 'open' | 'granted' | 'locked';
  log: { move: Move; likeness?: number; removed?: string; reset?: true }[];
  triesLeft: number;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const candidates = (length: number) => (length <= 6 ? 10 : length === 7 ? 12 : 14);

/** Letters equal and in the same place. */
export function likeness(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) n++;
  return n;
}

/** The word list (world/gear/words.md): `## 5` … `## 9`, one upper-case word a line. Warns when a length has under 14. */
export function parseWords(text: string): { byLength: Record<number, string[]>; warnings: string[] } {
  const byLength: Record<number, string[]> = { 5: [], 6: [], 7: [], 8: [], 9: [] };
  const warnings: string[] = [];
  let at: number | null = null;
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    const h = /^##\s+(\d)$/.exec(t);
    if (h) {
      at = Number(h[1]);
      if (!(at in byLength)) warnings.push(`## ${at}: lengths are 5–9`);
      continue;
    }
    if (!t || t.startsWith('#') || at === null || !(at in byLength)) continue;
    if (!/^[A-Z]+$/.test(t) || t.length !== at) warnings.push(`'${t}' isn't ${at} upper-case letters`);
    else if (!byLength[at].includes(t)) byLength[at].push(t);
  }
  for (const n of [5, 6, 7, 8, 9]) if (byLength[n].length < 14) warnings.push(`only ${byLength[n].length} words of ${n} letters (14 needed)`);
  return { byLength, warnings };
}

/** What a terminal is built from: the server sends it with a crack card, and both sides build the same one. */
export interface TerminalSetup {
  seed: string;
  length: 5 | 6 | 7 | 8 | 9;
  words: string[];
  extraBracket: boolean;
  strikeOne: boolean;
  ghost: boolean;
  hint: string | null;
  tries: number;
  /** The look only: never read by the draw or the scoring (absent: `green`). */
  skin?: TerminalSkin;
  /** The held deck's name, for the skins that show it (null: none). */
  deck?: string | null;
}

/** A terminal from `seed`: candidates drawn from `words` (all `length` letters), placed in junk with bracket pairs. */
export function makeTerminal(o: TerminalSetup): Terminal {
  const r = rng(hash(o.seed));
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const shuffle = <T,>(xs: T[]) => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pool = shuffle([...new Set(o.words.filter((w) => w.length === o.length))]);
  const chosen = pool.slice(0, Math.min(candidates(o.length), pool.length));
  const grid = Array.from({ length: DUMP_LINES }, () => Array.from({ length: DUMP_WIDTH }, () => pick([...JUNK])));
  const used = Array.from({ length: DUMP_LINES }, () => Array<boolean>(DUMP_WIDTH).fill(false));
  const free = (line: number, from: number, to: number) => {
    for (let c = Math.max(0, from - 1); c <= Math.min(DUMP_WIDTH - 1, to + 1); c++) if (used[line][c]) return false;
    return true;
  };
  const words: Terminal['words'] = [];
  for (const word of chosen) {
    for (let tries = 0; tries < 200; tries++) {
      const line = Math.floor(r() * DUMP_LINES);
      const col = Math.floor(r() * (DUMP_WIDTH - o.length + 1));
      if (!free(line, col, col + o.length - 1)) continue;
      for (let i = 0; i < o.length; i++) {
        grid[line][col + i] = word[i];
        used[line][col + i] = true;
      }
      words.push({ word, line, col });
      break;
    }
  }
  const brackets: Terminal['brackets'] = [];
  const wanted = 3 + (o.extraBracket ? 1 : 0);
  for (let tries = 0; brackets.length < wanted && tries < 500; tries++) {
    const line = Math.floor(r() * DUMP_LINES);
    const span = 2 + Math.floor(r() * 4);
    const from = Math.floor(r() * (DUMP_WIDTH - span));
    const to = from + span;
    if (!free(line, from, to)) continue;
    const pair = pick(PAIRS);
    grid[line][from] = pair[0];
    grid[line][to] = pair[1];
    for (let c = from + 1; c < to; c++) if (PAIRS.join('').includes(grid[line][c])) grid[line][c] = '.';
    for (let c = from; c <= to; c++) used[line][c] = true;
    brackets.push({ line, from, to });
  }
  const placed = words.map((w) => w.word);
  const password = pick(placed);
  const dudOrder = shuffle(placed.filter((w) => w !== password));
  const struck = o.strikeOne && dudOrder.length ? [dudOrder.shift()!] : [];
  const gi = Math.floor(r() * o.length);
  return {
    lines: grid.map((l) => l.join('')),
    words,
    brackets,
    password,
    struck,
    ghost: o.ghost ? { index: gi, letter: password[gi] } : null,
    hint: o.hint,
    tries: o.tries,
    dudOrder,
  };
}

/** The moves played in order: wrong words cost a try; brackets 1, 2 and 4 strike a dud, the 3rd resets tries once. */
export function playTerminal(t: Terminal, moves: Move[]): Played {
  const log: Played['log'] = [];
  const out = new Set(t.struck);
  const guessed = new Set<string>();
  const usedBrackets = new Set<number>();
  let tries = t.tries;
  let state: Played['state'] = 'open';
  let resetDone = false;
  for (const move of moves) {
    if (state !== 'open') break;
    if ('word' in move) {
      if (!t.words.some((w) => w.word === move.word) || out.has(move.word) || guessed.has(move.word)) continue;
      guessed.add(move.word);
      if (move.word === t.password) {
        log.push({ move });
        state = 'granted';
        continue;
      }
      tries--;
      out.add(move.word);
      log.push({ move, likeness: likeness(move.word, t.password) });
      if (tries <= 0) state = 'locked';
    } else {
      if (move.bracket < 0 || move.bracket >= t.brackets.length || usedBrackets.has(move.bracket)) continue;
      usedBrackets.add(move.bracket);
      if (usedBrackets.size === 3 && !resetDone) {
        resetDone = true;
        tries = t.tries;
        log.push({ move, reset: true });
        continue;
      }
      const dud = t.dudOrder.find((w) => !out.has(w));
      if (dud) {
        out.add(dud);
        log.push({ move, removed: dud });
      } else log.push({ move });
    }
  }
  return { state, log, triesLeft: tries };
}

/** A crew member's hint (small jobs spec §4): a letter the dud has and the password lacks. */
export function hintLine(contact: 'ember' | 'silas' | 'hicks', dud: string, password: string): string {
  const letter = [...dud].find((c) => !password.includes(c)) ?? dud[0];
  return `${contact[0].toUpperCase()}${contact.slice(1)}: not the one with the ${letter}`;
}
