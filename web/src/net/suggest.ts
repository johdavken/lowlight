/** SUGGEST's route: her model drafts the player's next line for the chat box (never sent). */
import { narratorKind, type NarratorKind } from '../../../shared/narrator';

/** Why no line came, as the input's hint says it (short, in its capitals). */
const REFUSED: Record<string, string> = {
  'no-link': 'NO KEY LINKED',
  'key-rejected': 'KEY REJECTED',
  'no-credit': 'NO CREDIT ON THE KEY',
  busy: 'WAIT FOR THE REPLY',
};
const FAILED: Record<NarratorKind, string> = {
  timeout: 'THE MODEL TOOK TOO LONG',
  'too-long': 'THE ANSWER DIDN’T FIT',
  'bad-answer': 'THE ANSWER CAME BACK EMPTY',
  busy: 'THE MODEL IS UNREACHABLE',
  refused: 'THE MODEL REFUSED',
  unknown: 'SOMETHING WENT WRONG',
};

/** Where the line is said, on the arrival screen (spec 2026-10-27 §4): the move about to be made. */
export type SuggestTravel = { from: string | null; to: string; comms: boolean; /** Off comms, back to where she is. */ back?: boolean };

/** The player's next line, steered by what's typed (or null). Rejects with an Error whose message is the hint's words. */
export function suggestLine(ai: string, steer: string | null, travel?: SuggestTravel): Promise<string> {
  return draft('/api/suggest', { ai, steer, ...(travel ? { travel } : {}) });
}

/** A narrator draft from `url` (SUGGEST, or the arrival screen's opening): its text, or an Error in the hint's words. */
export async function draft(url: string, body: object): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('THE GAME SERVER IS UNREACHABLE');
  }
  const b = (await res.json().catch(() => ({}))) as { text?: unknown; error?: unknown; kind?: unknown; why?: unknown };
  if (res.ok && typeof b.text === 'string') return b.text;
  const error = typeof b.error === 'string' ? b.error : '';
  if (error === 'failed') {
    if (typeof b.why === 'string' && b.why) console.warn(`[suggest] ${b.why}`);
    throw new Error(FAILED[narratorKind(b.kind)]);
  }
  throw new Error(REFUSED[error] ?? FAILED.unknown);
}
