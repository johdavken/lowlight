/**
 * Whether a key press is the job table's to take (the table in the trace, review 2026-11-15). The table listens early
 * (capture, on the window), ahead of anything opened later, so everything that can stand over the table has to be named
 * here: a screen or panel, the crack terminal, a hidden UI, the bug report. A draft in the prompt keeps every key; an
 * empty prompt keeps the letters and digits (`typing`); a reply's waiting page keeps its Enter; and a control that
 * answers Enter itself (a cost, an answer, THAT'S MY CHOICE, CLOSE) keeps that too.
 */
export interface TableKeyEvent {
  key: string;
  defaultPrevented: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
  repeat: boolean;
}

export function tableKeyGate(e: TableKeyEvent, o: { /** Something is open over the table, or the UI is hidden. */ blocked: boolean; /** A reply's next page waits on Enter. */ pageWaiting: boolean; /** The focused field's text, when a field has the focus. */ field: string | null; /** The target answers its own Enter. */ ownsEnter: boolean }): { typing: boolean } | null {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return null;
  if (e.repeat && !e.key.startsWith('Arrow')) return null;
  if (o.blocked) return null;
  if (o.field !== null && o.field !== '') return null;
  if (e.key === 'Enter' && (o.pageWaiting || o.ownsEnter)) return null;
  return { typing: o.field !== null };
}
