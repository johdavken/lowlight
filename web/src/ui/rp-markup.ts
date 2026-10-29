/**
 * Roleplay markup: `*actions*`; everything outside them is speech (no quotes needed — quotes are
 * just text). The asterisks come back as their own `mark` segments (hidden in the feed, kept in
 * the text). Stateful, so a reply streamed in chunks splits the same as the whole text.
 */
export type SegmentKind = 'plain' | 'action' | 'mark';
export interface Segment {
  kind: SegmentKind;
  text: string;
}

export interface Markup {
  /** Splits the next chunk of text, continuing any action left open by earlier chunks. */
  push(chunk: string): Segment[];
}

export function createMarkup(): Markup {
  let inAction = false;
  return {
    push(chunk) {
      const out: Segment[] = [];
      chunk.split('*').forEach((part, i) => {
        if (i > 0) {
          out.push({ kind: 'mark', text: '*' });
          inAction = !inAction;
        }
        if (part) out.push({ kind: inAction ? 'action' : 'plain', text: part });
      });
      return out;
    },
  };
}
