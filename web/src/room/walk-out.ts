/**
 * WALK OUT (go solo, spec 2026-10-10 §1): after LEAVE, once her goodbye has landed, the input bar
 * offers to walk out. Worked out from the feed, so a reload shows it again — except for a goodbye
 * already walked out on (back from solo, her goodbye is still the newest line until she greets you).
 */
import type { ChatMessage } from '../../../shared/types';

const WALKED_OUT_KEY = 'lowlight.walkedOut';
const WALKED_OUT_MAX = 20;
type Store = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Whether the newest shown line is her finished reply to a LEAVE line (greet and scene rows are never shown), not yet walked out on.
 * Not for LET HER GO: the server sent you solo with her goodbye, so there was never a WALK OUT to remember.
 */
export function walkOutDue(messages: ChatMessage[], walked: ReadonlySet<string> = new Set()): boolean {
  const last = messages.findLast((m) => !(m.role === 'user' && m.mode === 'greet') && m.mode !== 'scene');
  if (!last || last.role !== 'agent' || last.status !== 'ok' || last.mode !== 'end' || !last.replyTo || walked.has(last.id)) return false;
  return messages.some((m) => m.id === last.replyTo && m.role === 'user' && m.leave === true && m.parting !== 'her');
}

/** Whether her greeting may go: due, and not while WALK OUT stands (a reload after LEAVE: you never left). */
export function greetAllowed(greetDue: boolean, messages: ChatMessage[], walked: ReadonlySet<string>): boolean {
  return greetDue && !walkOutDue(messages, walked);
}

/** The goodbyes walked out on in this browser (a per-viewer convenience: unreadable storage is none). */
export function walkedOut(local: Store | undefined = globalThis.localStorage): Set<string> {
  try {
    const v: unknown = JSON.parse(local?.getItem(WALKED_OUT_KEY) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Remembers walking out on goodbye `id` (the newest few). */
export function markWalkedOut(id: string, local: Store | undefined = globalThis.localStorage): void {
  const ids = [...walkedOut(local)].filter((x) => x !== id);
  ids.push(id);
  try {
    local?.setItem(WALKED_OUT_KEY, JSON.stringify(ids.slice(-WALKED_OUT_MAX)));
  } catch {
    // Storage off: WALK OUT may show again on the way back in, until she greets you.
  }
}
