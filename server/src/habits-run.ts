/**
 * The habits run (spec 2026-10-29 §1): one call reads her last replies and names what she keeps writing, as up to five
 * general rules. Rules are checked one by one; a rule that quotes her is refused, since quoting the phrase primes it.
 */
import { HABITS } from './habits';
import { jsonOf } from './residual';
import type { CompletionMessage } from './turn';

export const HABITS_MAX_TOKENS = 400;
/** Their lines are context, not what's judged: cut short. */
const THEIRS_MAX = 200;

export interface HabitsRunInput {
  self: string;
  player: string;
  /** Her last replies and their lines between, oldest first. */
  lines: { speaker: 'her' | 'them'; text: string }[];
  /** The list in place now. */
  current: string[];
}

export function habitsMessages(i: HabitsRunInput): CompletionMessage[] {
  const system = [
    `You read one writer's recent replies in a roleplay and name what they keep doing. The writer plays ${i.self}; the other person plays ${i.player}. You never write story. You answer with one JSON object.`,
    [
      'Two kinds of habit count:',
      `- Body business: a gesture, a prop or a bit of description that comes back reply after reply, even in other words (fiddling with glasses, a light that keeps being described).`,
      '- Prose shape: how replies are built — the same way of opening or closing, the same rhythm, a stock image.',
    ].join('\n'),
    `What ${i.player} keeps bringing up is the scene, not a habit. Leave out what ${i.self} does (choices, mood, manner): only how it's written.`,
    'Write each habit as a short general rule, at most 90 characters ("No business with his glasses", "Don\'t close on a question"). Never quote the writer\'s words.',
    'At most 5 rules, the most worn first. Keep a current rule that still holds; drop one that no longer does. If nothing is worn, answer an empty list.',
    'Answer only: {"rules": ["…"]}',
  ].join('\n\n');
  const lines = i.lines.map((l) => (l.speaker === 'her' ? `${i.self}: ${l.text}` : `${i.player}: ${l.text.slice(0, THEIRS_MAX)}`));
  const current = i.current.length > 0 ? i.current.map((r) => `- ${r}`).join('\n') : 'none yet';
  const user = `Current rules:\n${current}\n\nRecent replies, oldest first:\n\n${lines.join('\n\n')}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Words, apostrophes kept inside ("doesn't") but not at the ends, where a quote mark sticks ('thumb … rim'). */
const words = (text: string) =>
  (text.toLowerCase().replace(/[’‘]/g, "'").match(/[a-z0-9']+/g) ?? []).map((w) => w.replace(/^'+|'+$/g, '')).filter((w) => w !== '');
const runsOf = (w: string[], n: number) => Array.from({ length: Math.max(0, w.length - n + 1) }, (_, i) => w.slice(i, i + n).join(' '));

/** The rules list in `raw`: `{"rules": [...]}` or a bare array; null when neither reads. */
function rulesOf(raw: string): unknown[] | null {
  // An object answers for itself: without `rules` it's no list, whatever brackets it holds.
  const trimmed = raw.replace(/```(?:json)?/gi, '').trim();
  if (!trimmed.startsWith('[')) {
    try {
      const { v } = jsonOf(raw);
      const rules = typeof v === 'object' && v !== null ? (v as { rules?: unknown }).rules : undefined;
      return Array.isArray(rules) ? rules : null;
    } catch {
      // No object: maybe a bare array in prose, below.
    }
  }
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** The kept rules and each refusal (spec §1.4); null when the answer has no readable list. */
export function parseHabitsAnswer(raw: string, hers: readonly string[]): { rules: string[]; refused: string[] } | null {
  const list = rulesOf(raw);
  if (list === null) return null;
  const quoted = new Set(hers.flatMap((h) => runsOf(words(h), HABITS.quoteWords)));
  const rules: string[] = [];
  const refused: string[] = [];
  list.forEach((r, i) => {
    const n = i + 1;
    if (typeof r !== 'string' || r.trim() === '') return refused.push(`habits: rule ${n} empty`);
    const rule = r.trim();
    if (rule.length > HABITS.maxChars) return refused.push(`habits: rule ${n} too long`);
    if (runsOf(words(rule), HABITS.quoteWords).some((q) => quoted.has(q))) return refused.push(`habits: rule ${n} quotes her`);
    if (rules.length >= HABITS.maxRules) return refused.push(`habits: rule ${n} past five`);
    rules.push(rule);
  });
  return { rules, refused };
}
