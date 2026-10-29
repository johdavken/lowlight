/** The tool calls the scratch server logged (NIX_TOOL_TRACE) since `from`, a byte offset: the file's size before the turn. */
import fs from 'node:fs';

export function traceLines(file: string, from: number): { name: string; args: string; out: string }[] {
  if (!fs.existsSync(file)) return [];
  // Slice the bytes, not the text: tool results hold → and ·, which are more than one byte.
  return fs
    .readFileSync(file)
    .subarray(from)
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { name: string; args: string; out: string })
    .map(({ name, args, out }) => ({ name, args, out }));
}

/** Waits (polling every `every` ms, at most `limitMs`) for the Residual's run-end line after `from`; whether it came. */
export async function waitForResidual(file: string, from: number, limitMs: number, every = 200): Promise<boolean> {
  const until = Date.now() + limitMs;
  for (;;) {
    if (traceLines(file, from).some((c) => c.name === 'residual')) return true;
    if (Date.now() >= until) return false;
    await new Promise((r) => setTimeout(r, every));
  }
}
