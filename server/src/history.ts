/**
 * The conversation Lowlight sends her model each turn: the room note as the system message, the
 * room's own recent history (what's on screen), then the new turn. Lowlight owns the history, so
 * edits, deletes and swipes take effect on her next reply.
 */
import type { ChatMessage } from '../../shared/types';
import type { CompletionMessage } from './turn';
import { GREET_PLACEHOLDER, endSceneText } from './instructions';
import { encounterText } from '../../shared/encounter';
import { gigText } from '../../shared/gig/brief';
import { diceText } from '../../shared/dice/text';
import { questRowText } from '../../shared/quests';
import { oneLine } from './persona';
import { SUMMARY_LINE } from './summary';

/** The relay reads at most this many of a pair's newest messages to build a turn (and the summary works over the same window). */
export const HISTORY_WINDOW = 500;
/** At most this many history messages go with a turn… */
export const HISTORY_MAX_MESSAGES = 40;
/** …and at most this many characters of them (whole messages; older continuity rides in the journal and recap). */
export const HISTORY_MAX_CHARS = 32_000;
/**
 * Past the budget, the history's start moves this many messages at a time instead of one per
 * turn: between jumps every turn begins exactly like the last, so the provider's prompt cache
 * still covers the history.
 */
export const HISTORY_STEP = 20;
/** The hidden last line of a KEEP GOING turn. Never stored or shown. */
export const CONTINUE_INSTRUCTION =
  "(Continue your previous reply exactly where it stopped. Don't repeat any of it, don't restart, don't add commentary.)";

/**
 * The new turn. `blocks`: what changes turn to turn (lore, her page, standing, leads, the mode's note), sent
 * with this message rather than in the system one so the provider's cache covers system + history (scribe spec §7).
 */
/** `head`: lines ahead of the blocks (the room and what everyone wears), far from their words. */
export type Turn = { kind: 'reply'; head?: string[]; contextLines: string[]; text: string; blocks?: string[] } | { kind: 'continue'; blocks?: string[] };

/** A stored line as her model reads it in the history (also what the Residual reads); null when it isn't sent. */
export function toCompletion(m: ChatMessage): CompletionMessage | null {
  // The opening scene reaches her as the [scene] block, never as a line of the conversation.
  if (m.mode === 'scene') return null;
  // An end line is never dropped for being empty — it's the placeholder marking where the scene ended.
  if (m.role === 'user' && m.mode === 'end') return m.status === 'failed' ? null : { role: 'user', content: endSceneText(m.text, m.parting === 'her' ? 'her' : m.leave === true) };
  // Likewise a greet line: it's where the user walked in.
  if (m.role === 'user' && m.mode === 'greet') return m.status === 'failed' ? null : { role: 'user', content: GREET_PLACEHOLDER };
  // An event that cut in: where it happened, in her history as an [event] line.
  if (m.role === 'user' && m.mode === 'encounter') return m.status === 'failed' ? null : { role: 'user', content: encounterText({ title: m.encounter?.title ?? '', text: m.text }, oneLine) };
  // A quest's beat or pick: its [quest] line, word for word as shown.
  if (m.role === 'user' && m.mode === 'quest') return m.status === 'failed' ? null : { role: 'user', content: questRowText({ title: m.quest?.title ?? '', text: m.text, run: m.quest?.run }, oneLine) };
  // A finished gig run: its [gig] line, from the row's snapshot.
  if (m.role === 'user' && m.mode === 'gig') return m.status === 'failed' || !m.gig ? null : { role: 'user', content: gigText(m.gig) };
  // A finished liar's dice game: its [dice] line, from the row's snapshot.
  if (m.role === 'user' && m.mode === 'dice') return m.status === 'failed' || !m.dice ? null : { role: 'user', content: diceText(m.dice) };
  // An empty line (a reply that only used tools) says nothing, and some providers refuse it.
  if (m.text.trim().length === 0) return null;
  if (m.role === 'user') {
    if (m.status === 'failed') return null;
    return { role: 'user', content: m.mode === 'ooc' ? `(OOC) ${m.text}` : m.text };
  }
  return m.status === 'ok' ? { role: 'assistant', content: m.text } : null;
}

const fits = (from: CompletionMessage[]) =>
  from.length <= HISTORY_MAX_MESSAGES && from.reduce((sum, m) => sum + m.content.length, 0) <= HISTORY_MAX_CHARS;

/**
 * Where the sent history begins: the earliest multiple of HISTORY_STEP from which the rest fits
 * the budget. When even the last step doesn't fit (a few very long lines), the newest whole
 * messages that fit, as many as possible.
 */
export function historyStart(usable: CompletionMessage[]): number {
  for (let start = 0; start < usable.length; start += HISTORY_STEP) {
    if (fits(usable.slice(start))) return start;
  }
  let start = usable.length;
  while (start > 0 && fits(usable.slice(start - 1))) start--;
  return start;
}

/** `history` is the room's messages before this turn, oldest first. */
export function buildMessages(input: {
  instructions: string;
  history: ChatMessage[];
  turn: Turn;
  summary?: { text: string; through: string; prev?: { text: string; through: string } } | null;
  /** A text turn (deck spec §3): the summary always leads, since it's how a text knows how the last scene went. */
  alwaysSummary?: boolean;
}): CompletionMessage[] {
  const sent = input.history.map((m) => ({ id: m.id, c: toCompletion(m) })).filter((x): x is { id: string; c: CompletionMessage } => x.c !== null);
  const usable = sent.map((x) => x.c);
  const start = historyStart(usable);
  const kept = usable.slice(start);
  // The rolling summary (scribe spec §6): once the line it runs to has dropped out, it stands in for what did.
  // The newest summary whose last line has dropped out; while the newest still runs into what's sent, the one before it.
  const dropped = (through: string) => !sent.slice(start).some((x) => x.id === through);
  const s = input.summary && dropped(input.summary.through) ? input.summary : input.summary?.prev && dropped(input.summary.prev.through) ? input.summary.prev : null;
  if (s && (start > 0 || input.alwaysSummary)) {
    const line = SUMMARY_LINE(s.text);
    // Some providers refuse two user turns in a row: it joins a first kept line of the user's.
    if (kept[0]?.role === 'user') kept[0] = { role: 'user', content: `${line}\n\n${kept[0].content}` };
    else kept.unshift({ role: 'user', content: line });
  }
  const blocks = input.turn.blocks?.length ? `${input.turn.blocks.join('\n\n')}\n\n` : '';
  const last: CompletionMessage =
    input.turn.kind === 'reply'
      ? { role: 'user', content: `${input.turn.head?.length ? `${input.turn.head.join('\n')}\n\n` : ''}${blocks}${input.turn.contextLines.join('\n')}\n\n${input.turn.text}` }
      : { role: 'user', content: `${blocks}${CONTINUE_INSTRUCTION}` };
  return [{ role: 'system', content: input.instructions }, ...kept, last];
}
