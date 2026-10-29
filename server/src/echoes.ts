/**
 * What she keeps writing: phrases that turn up in two or more of her last few replies. GLM fills a quiet scene by
 * reworking its own last replies — the paper lantern in all eight, "I brush flakes off my fingers into the sink" twice
 * word for word (Nix's apartment, 2026-10-23) — and `unrepeated` only catches a repeat inside one reply.
 */

/** Her replies looked at, newest last. */
export const ECHO_WINDOW = 4;
/** Phrases named at most. */
export const ECHO_MAX = 8;
const LONGEST = 8;

/** Words that don't make a phrase hers on their own ("into the", "and i'm"). */
const COMMON = new Set(
  (
    "the a an and or but so of to in on at by for from with into onto over under off out up down about as is was are be been " +
    "i i'm i've i'd i'll me my mine you you're your yours he he's him his she she's her hers it it's its they them their we us our " +
    'this that that\'s these those there there\'s here what who how when where then than just not no don\'t do does did have has had ' +
    "can can't could would will one two all some any more like still now too very back again get got let's if"
  ).split(' '),
);

/** Her *actions*, as runs of words that don't cross a sentence, an action's edge or a dash: her lines may come back. */
function runs(text: string): string[][] {
  return (text.match(/\*[^*]+\*/g) ?? [])
    .join('\n')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[*.!?…\n—–;:,()"“”]+/)
    .map((s) => s.match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? [])
    .filter((w) => w.length > 0);
}

/** Every phrase of 2..LONGEST words in `text`, once each. */
function phrases(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of runs(text)) {
    for (let n = 2; n <= LONGEST; n++) for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  }
  return out;
}

/**
 * A phrase worth naming: one long word that isn't common ("three hours late"), and a two-word one with no common word
 * at all ("paper lantern", not "i look" or "my thumb").
 */
const meaningful = (phrase: string) => {
  const w = phrase.split(' ');
  if (!w.some((x) => x.length >= 5 && !COMMON.has(x))) return false;
  return w.length > 2 || w.every((x) => x.length >= 3 && !COMMON.has(x));
};
/** Joining words at either end ("the paper lantern", "and i'm barefoot") say no more without them. */
const LOOSE = new Set(['the', 'a', 'an', 'and', 'but', 'or', 'so', 'then', 'of', 'to', 'in', 'on', 'at', 'with', 'as']);
const trimmed = (phrase: string) => {
  const w = phrase.split(' ');
  while (w.length > 0 && LOOSE.has(w[0])) w.shift();
  while (w.length > 0 && LOOSE.has(w[w.length - 1])) w.pop();
  return w.join(' ');
};

/** They brought it up: two words of it side by side, neither common ("brush flakes", "paper lantern"), are in their lines. */
const brought = (phrase: string, asked: string) => {
  const w = phrase.split(' ');
  return w.slice(1).some((x, i) => [w[i], x].every((y) => y.length >= 3 && !COMMON.has(y)) && asked.includes(` ${w[i]} ${x} `));
};

/**
 * The phrases in the *actions* of two or more of `replies` (her last few, oldest first), longest first; a phrase inside
 * a longer one is left out, and so is one in `theirs` (their last lines: what they bring up is the scene).
 */
export function echoes(replies: readonly string[], theirs: readonly string[] = []): string[] {
  const asked = ` ${theirs.join(' ').toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']+/g, ' ')} `;
  const recent = replies.slice(-ECHO_WINDOW).filter((t) => t.trim() !== '');
  if (recent.length < 2) return [];
  const count = new Map<string, number>();
  for (const r of recent) {
    const seen = new Set<string>();
    for (const p of phrases(r)) {
      const t = trimmed(p);
      if (t.includes(' ')) seen.add(t);
    }
    for (const t of seen) count.set(t, (count.get(t) ?? 0) + 1);
  }
  const repeated = [...count.entries()]
    .filter(([, c]) => c >= 2)
    .map(([p]) => p)
    .sort((a, b) => b.split(' ').length - a.split(' ').length || (count.get(b) ?? 0) - (count.get(a) ?? 0));
  // A phrase inside a longer repeat is that repeat: named with it, or left out with it when they brought it up.
  const covered: string[] = [];
  const kept: string[] = [];
  for (const p of repeated) {
    if (covered.some((k) => ` ${k} `.includes(` ${p} `))) continue;
    const theirs = brought(p, asked);
    if (theirs) covered.push(p);
    if (theirs || !meaningful(p)) continue;
    covered.push(p);
    kept.push(p);
    if (kept.length === ECHO_MAX) break;
  }
  return kept;
}

/** Whether `phrase` (as `echoes` gives it) is in `text`'s *actions*. */
export function inActions(text: string, phrase: string): boolean {
  return runs(text).some((w) => ` ${w.join(' ')} `.includes(` ${phrase} `));
}

/** The turn's line naming what she's been repeating, or null when she hasn't. */
export function echoLine(replies: readonly string[], theirs: readonly string[] = []): string | null {
  const said = echoes(replies, theirs);
  if (said.length === 0) return null;
  return `[you keep writing these — ${said.map((p) => `"${p}"`).join(', ')}. Leave them out of this reply; write what's new in this moment instead.]`;
}
