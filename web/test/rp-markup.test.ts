import { describe, expect, it } from 'vitest';
import { createMarkup, type Segment } from '../src/ui/rp-markup';

const all = (...chunks: string[]): Segment[] => {
  const m = createMarkup();
  return chunks.flatMap((c) => m.push(c));
};

describe('RP markup: *actions*; everything else is speech', () => {
  it('splits actions (asterisks kept as marks) from the rest', () => {
    expect(all('*leans in* Hey. Then nothing.')).toEqual([
      { kind: 'mark', text: '*' },
      { kind: 'action', text: 'leans in' },
      { kind: 'mark', text: '*' },
      { kind: 'plain', text: ' Hey. Then nothing.' },
    ]);
  });

  it('carries an open action across streamed chunks', () => {
    expect(all('*lea', 'ns* He', 'y.')).toEqual([
      { kind: 'mark', text: '*' },
      { kind: 'action', text: 'lea' },
      { kind: 'action', text: 'ns' },
      { kind: 'mark', text: '*' },
      { kind: 'plain', text: ' He' },
      { kind: 'plain', text: 'y.' },
    ]);
  });

  it('quotes are just text, inside or outside an action', () => {
    expect(all('*says "hi" softly* Nobody says "nothing exciting".')).toEqual([
      { kind: 'mark', text: '*' },
      { kind: 'action', text: 'says "hi" softly' },
      { kind: 'mark', text: '*' },
      { kind: 'plain', text: ' Nobody says "nothing exciting".' },
    ]);
  });

  it('text without markup is one plain segment', () => {
    expect(all("Quiet's earned.")).toEqual([{ kind: 'plain', text: "Quiet's earned." }]);
  });
});
