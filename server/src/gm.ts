/**
 * The GM (roll lifecycle spec 2026-11-02 §1.4): one small call per costly roll that writes each dealt cost into the
 * scene, a line apiece. It decides nothing: the code dealt the costs and picks happen on the table. A line that fails
 * the checks, or a call that fails or runs past GM_TIMEOUT_MS, leaves that cost its written line.
 */
import { COSTS, type CostId } from '../../shared/costs';
import type { Position } from '../../shared/dice';
import { jsonOf } from './residual';
import type { CompletionMessage } from './turn';

/** Long enough for GLM's low reasoning (the live check: 4 of 10 ran past 8 s); the cards show written lines meanwhile. */
export const GM_TIMEOUT_MS = 15000;
/** How long a card waits for its line. Past this the written line stands and a late answer is dropped, so words never change under the reader. */
export const GM_HOLD_MS = 8000;
/** The probe's: a little heat for variety. */
export const GM_TEMPERATURE = 0.8;
/** Room for low reasoning and a few short lines (GLM's thinking counts toward the cap). */
export const GM_MAX_TOKENS = 1200;
/** A line's cap after the GM's own 25 (a little slack before it falls back). */
export const GM_MAX_WORDS = 30;
/** Words a line must not use: the game's own, which the tag beside it already says. */
const BANNED = /\b(alarm|take|position|effect|roll|dice|nerve|heat|small|worse|resist|armour|armor)\b/i;

export interface GmComplete {
  complete(messages: CompletionMessage[], o: { maxTokens: number; signal: AbortSignal }): Promise<{ text: string; tokensIn?: number; tokensOut?: number }>;
}

const SYSTEM = `You voice consequences in Lowlight, a dark cyberpunk city RPG. Tone: Neuromancer. Terse, concrete, physical; hard costs, no comfort.
The game's rules have already decided what can go wrong. For each cost you are given, write one line showing that exact cost happening in the scene.
The game prints each cost's tag beside its line, so the player must see that cost, and only that cost, in the line.
Rules for every line:
- At most 25 words, present tense, second person ("you").
- Show the given cost and nothing else: no extra harm, no second problem, no luck that cancels it.
- Don't soften it, apologise for it, or hint it will be fine.
- Never use these words: alarm, take, position, effect, roll, dice, nerve, heat, small, worse, resist, armour.
- Invent concrete detail that fits the scene, but never invent things the player carries or has taken: use only the loot given.
- Nobody has caught you yet: the job goes on after this.
Reply with JSON only: {"lines": {"<tag>": "<line>", ...}}, one entry per tag given.`;

/** The call's messages: the rules, then the scene's facts and each cost's tag and meaning. */
export function gmMessages(o: { title: string; beat: string; choice: string; kind: 'cost' | 'miss'; position: Position; loot: string; take: { filled: number; size: number }; costs: CostId[] }): CompletionMessage[] {
  const result = o.kind === 'miss' ? "It didn't work." : 'It worked, at a cost.';
  const where = { dark: 'in the dark, unseen', open: 'in the open', wire: 'on the wire, exposed' }[o.position];
  const user = [
    `Job: ${o.title}`,
    `Scene: ${o.beat}`,
    `What you did: ${o.choice}`,
    `Result: ${result} You were ${where}.`,
    `Taken so far: ${o.loot} (${o.take.filled} of ${o.take.size})`,
    'The costs (each tag is shown beside its line):',
    ...o.costs.map((c) => `- ${COSTS[c].tag}: ${COSTS[c].meaning}`),
  ].join('\n');
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user },
  ];
}

/** The lines it wrote, by cost, each checked; `rejected`: costs with no usable line (they keep their written one). */
export function gmLines(text: string, costs: CostId[]): { lines: Partial<Record<CostId, string>>; rejected: CostId[] } {
  let got: Record<string, unknown> = {};
  try {
    const v = jsonOf(text).v as { lines?: unknown };
    if (v && typeof v.lines === 'object' && v.lines !== null) got = v.lines as Record<string, unknown>;
  } catch {
    return { lines: {}, rejected: [...costs] };
  }
  const lines: Partial<Record<CostId, string>> = {};
  const rejected: CostId[] = [];
  for (const c of costs) {
    const raw = got[COSTS[c].tag];
    // One italic paragraph in the row (final review M4): no asterisks, no line breaks.
    const line = typeof raw === 'string' ? raw.replace(/\*/g, '').replace(/\s+/g, ' ').trim() : '';
    if (line && line.split(/\s+/).length <= GM_MAX_WORDS && !BANNED.test(line)) lines[c] = line;
    else rejected.push(c);
  }
  return { lines, rejected };
}

/** One call: the usable lines, or nothing on any failure or after GM_TIMEOUT_MS. Logs one `gm:` line. */
export async function askGm(gm: GmComplete, messages: CompletionMessage[], costs: CostId[], log: (line: string) => void): Promise<Partial<Record<CostId, string>>> {
  const started = Date.now();
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), GM_TIMEOUT_MS);
  try {
    const r = await gm.complete(messages, { maxTokens: GM_MAX_TOKENS, signal: timeout.signal });
    const { lines } = gmLines(r.text, costs);
    log(`gm: ${Date.now() - started}ms · in ${r.tokensIn ?? '?'} out ${r.tokensOut ?? '?'} · used ${Object.keys(lines).length}/${costs.length}`);
    return lines;
  } catch (err) {
    log(`gm: ${Date.now() - started}ms · failed (${err instanceof Error ? err.message : String(err)}) · used 0/${costs.length}`);
    return {};
  } finally {
    clearTimeout(timer);
  }
}
