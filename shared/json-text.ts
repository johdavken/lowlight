/**
 * Writing a hand-formatted JSON file back without reformatting it: each top-level value that didn't change
 * keeps its exact text from the file (a one-line `face`, compact `facts` rows); only changed or new keys are
 * written fresh, 2-space indented. So a one-field edit is a one-line diff.
 */

/** The file's top-level keys, each with its value's exact source text; null when the text can't be read so. */
function topLevel(text: string): Map<string, string> | null {
  const out = new Map<string, string>();
  let i = text.indexOf('{');
  if (i < 0) return null;
  i++;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i]!)) i++;
  };
  /** Past a string starting at `i` (on its opening quote). */
  const skipString = () => {
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    i++;
  };
  for (;;) {
    ws();
    if (text[i] === '}') return out;
    if (text[i] !== '"') return null;
    const keyStart = i;
    skipString();
    const key = JSON.parse(text.slice(keyStart, i)) as string;
    ws();
    if (text[i] !== ':') return null;
    i++;
    ws();
    const start = i;
    let depth = 0;
    while (i < text.length) {
      const c = text[i]!;
      if (c === '"') {
        skipString();
        continue;
      }
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        if (depth === 0) break;
        depth--;
      } else if (c === ',' && depth === 0) break;
      i++;
    }
    if (i >= text.length) return null;
    out.set(key, text.slice(start, i).trimEnd());
    if (text[i] === ',') i++;
  }
}

const fresh = (v: unknown) => JSON.stringify(v, null, 2).replace(/\n/g, '\n  ');

/** `value` as file text, keeping `original`'s text for every top-level value that's unchanged. */
export function writeKeepingForm(original: string | null, value: Record<string, unknown>): string {
  let kept: Map<string, string> | null = null;
  let was: Record<string, unknown> = {};
  if (original !== null) {
    try {
      was = JSON.parse(original) as Record<string, unknown>;
      kept = topLevel(original);
    } catch {
      kept = null;
    }
  }
  const entries = Object.entries(value).map(([k, v]) => {
    const same = kept?.has(k) && JSON.stringify(was[k]) === JSON.stringify(v);
    return `  ${JSON.stringify(k)}: ${same ? kept!.get(k) : fresh(v)}`;
  });
  return entries.length ? `{\n${entries.join(',\n')}\n}\n` : '{}\n';
}
