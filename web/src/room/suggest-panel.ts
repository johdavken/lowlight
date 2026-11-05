/**
 * SUGGEST's lines on DRAW's modal (cards-panel.ts), in cyan: her model's three drafts of your next
 * line (PLAIN / PUSH / TURN) at once. Enter sends the chosen one as your line, E puts it in the box
 * to edit, R drafts three more, Esc leaves the box as it was. Text goes in through textContent.
 */
import type { SuggestDraft } from '../net/suggest';
import { CardsPanel, el } from './cards-panel';

export const SUGGEST_COPY = {
  title: 'YOUR LINE',
  loading: '// DRAFTING THREE LINES…',
  failed: (why: string) => `// NO LINES — ${why}`,
  redraw: '↻ REDRAW',
  cancel: '[ESC] CANCEL',
  hints: '[▲▼] CHOOSE · [ENTER] SEND · [E] EDIT · [R] REDRAW · [ESC] CANCEL',
  steer: (s: string) => `STEER: ${s}`,
} as const;

/** Each angle's picture (art/cards/sheet-03.png, cut like the table cards). */
export const ANGLE_ART: Record<string, string> = { PLAIN: '/suggest/plain.webp', PUSH: '/suggest/push.webp', TURN: '/suggest/turn.webp' };

/** A few words on each angle, beside its name. */
export const ANGLE_WHAT: Record<string, string> = { PLAIN: 'the likely move', PUSH: 'presses harder', TURN: 'goes somewhere else' };

/** A line with its *actions* in italics (as text, never HTML). */
export function withActions(text: string): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const [i, part] of text.split(/\*([^*\n]+)\*/).entries()) f.append(i % 2 === 1 ? el('em', '', part) : document.createTextNode(part));
  return f;
}

export interface SuggestPanelOptions {
  header: string;
  model?: string;
  /** What was typed in the box, shown under the header (null: nothing). */
  steer: string | null;
  cached: SuggestDraft[] | null;
  load(): Promise<SuggestDraft[]>;
  onSend(text: string): void;
  onEdit(text: string): void;
  onCancel(): void;
  onCache(drafts: SuggestDraft[]): void;
}

export function openSuggestPanel(host: HTMLElement, o: SuggestPanelOptions): CardsPanel<SuggestDraft> {
  return new CardsPanel<SuggestDraft>(host, {
    copy: SUGGEST_COPY,
    hostClass: 'suggest-host',
    header: o.header,
    ...(o.model ? { model: o.model } : {}),
    ...(o.steer ? { note: SUGGEST_COPY.steer(o.steer) } : {}),
    cached: o.cached,
    load: o.load,
    card: (d) => {
      const angle = d.angle ?? 'LINE';
      const what = ANGLE_WHAT[angle];
      const art = ANGLE_ART[angle];
      return { title: angle, ...(what ? { sub: what } : {}), ...(art ? { art } : {}), text: withActions(d.text) };
    },
    // The route's errors are already in the hint's words (net/suggest.ts).
    failed: (err) => SUGGEST_COPY.failed(err instanceof Error && err.message ? err.message : 'SOMETHING WENT WRONG'),
    onPlay: (d) => o.onSend(d.text),
    onCancel: o.onCancel,
    onCache: o.onCache,
    extraKey: (k, d) => {
      if (k !== 'e' && k !== 'E') return false;
      o.onEdit(d.text);
      return true;
    },
  });
}
