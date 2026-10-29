import { describe, expect, it } from 'vitest';
import { speakerBeats, type Beat, type Other } from './beats';

/** Each beat as [who, marker, body]. */
const parts = (t: string, beats: Beat[]) => beats.map((b) => [b.who, t.slice(b.start, b.bodyStart), t.slice(b.bodyStart, b.end)]);
const HAE = [{ id: 'hae', name: 'Hae' }];
const split = (t: string, others: Other[] = HAE, contact = 'Nix') => speakerBeats(t, others, contact);

describe('speakerBeats', () => {
  it('gives nothing for no text', () => {
    expect(split('')).toEqual([]);
  });

  it('a marker copied with its pronoun (Hae (she):) is still hers', () => {
    for (const t of ['Hae (she): Eat.', '**Hae (she):** Eat.', '**Hae** (she): Eat.', '*Hae* (she): Eat.', '**Hae** (she):** Eat.']) {
      const beats = split(t);
      expect(beats.map((b) => b.who)).toEqual(['other']);
      expect(t.slice(beats[0].bodyStart, beats[0].end)).toBe('Eat.');
    }
  });

  it('keeps a reply without markers as one contact beat', () => {
    const t = '*nods* Fine.';
    expect(parts(t, split(t))).toEqual([['contact', '', t]]);
  });

  it('splits contact, resident, contact, the blank lines going with the beat before', () => {
    const t = 'Fine.\n\nHae: Two bowls.\n\nThanks.';
    const beats = split(t);
    expect(beats.map((b) => b.who)).toEqual(['contact', 'other', 'contact']);
    expect(parts(t, beats).map(([w, m, b]) => [w, m, (b as string).trim()])).toEqual([
      ['contact', '', 'Fine.'],
      ['other', 'Hae: ', 'Two bowls.'],
      ['contact', '', 'Thanks.'],
    ]);
    expect(beats[0].start).toBe(0);
    for (let i = 0; i < beats.length - 1; i++) expect(beats[i].end).toBe(beats[i + 1].start);
    expect(beats.at(-1)!.end).toBe(t.length);
  });

  it.each(['**Hae:** x', '**Hae**: x', '*Hae:* x', 'HAE: x', '  Hae: x'])('takes %j as her marker', (t) => {
    const beats = split(t);
    expect(beats).toHaveLength(1);
    expect(beats[0].who).toBe('other');
    expect(t.slice(beats[0].bodyStart, beats[0].end)).toBe('x');
  });

  it('leaves a name mid-paragraph alone', () => {
    const t = 'She said Hae: no.';
    expect(parts(t, split(t))).toEqual([['contact', '', t]]);
  });

  it("strips the contact's own marker", () => {
    const t = 'Nix: Hi.\n\nHae: Yo.';
    const p = parts(t, split(t));
    expect(p[0][1]).toBe('Nix: ');
    expect(p[1][1]).toBe('Hae: ');
  });

  it('merges her paragraphs that follow each other, keeping every marker', () => {
    const t = 'Hae: a\n\nHae: b';
    const beats = split(t);
    expect(beats).toHaveLength(1);
    expect(t.slice(beats[0].start, beats[0].bodyStart)).toBe('Hae: ');
    expect(beats[0].end).toBe(t.length);
    expect(beats[0].markers.map(([a, b]) => t.slice(a, b))).toEqual(['Hae: ', 'Hae: ']);
  });

  it('a beat without a marker has none', () => {
    expect(split('Fine.')[0].markers).toEqual([]);
  });

  it('with no others, a Hae marker is plain text', () => {
    const t = 'Hae: hi';
    expect(parts(t, split(t, []))).toEqual([['contact', '', t]]);
  });

  it('decides a partial marker only once it completes', () => {
    expect(split('x\n\nHa').at(-1)!.who).toBe('contact');
    expect(split('x\n\nHae').at(-1)!.who).toBe('contact');
    const t = 'x\n\nHae:';
    const last = split(t).at(-1)!;
    expect(last.who).toBe('other');
    expect(t.slice(last.bodyStart, last.end)).toBe('');
  });

  it('needs the colon right after the name', () => {
    expect(split('Haeun: hi')[0].who).toBe('contact');
  });
});

describe('speakerBeats with a stranger', () => {
  it('splits three speakers in one reply', () => {
    const t = '*sets it down*\n\nCourier: Print here.\n\nHae: Not at my counter.\n\nFine.';
    expect(parts(t, speakerBeats(t, HAE, 'Nix', 'Courier'))).toEqual([
      ['contact', '', '*sets it down*\n\n'],
      ['stranger', 'Courier: ', 'Print here.\n\n'],
      ['other', 'Hae: ', 'Not at my counter.\n\n'],
      ['contact', '', 'Fine.'],
    ]);
  });

  it('a stranger with no resident here; markdown markers too', () => {
    const t = 'Hm.\n\n**Old Man Wen:** Still taking cases?';
    expect(parts(t, speakerBeats(t, [], 'Nix', 'Old Man Wen'))).toEqual([
      ['contact', '', 'Hm.\n\n'],
      ['stranger', '**Old Man Wen:** ', 'Still taking cases?'],
    ]);
  });

  it("a stranger whose name starts like the resident's never takes her paragraphs", () => {
    const t = 'Hae: Bowls.\n\nHa: Ha.';
    expect(speakerBeats(t, HAE, 'Nix', 'Ha').map((b) => b.who)).toEqual(['other', 'stranger']);
  });
});

describe('speakerBeats with several others', () => {
  const both = [...HAE, { id: 'silas', name: 'Silas' }];

  it('two others and a stranger, each beat carrying its id', () => {
    const t = 'Hi.\n\nHae: Two bowls.\n\nSilas: Not hungry.\n\nCourier: Package.';
    const beats = speakerBeats(t, both, 'Nix', 'Courier');
    expect(beats.map((b) => b.who)).toEqual(['contact', 'other', 'other', 'stranger']);
    expect(beats.map((b) => b.id)).toEqual([undefined, 'hae', 'silas', undefined]);
  });

  it('the longer name wins a shared prefix', () => {
    const others = [{ id: 'sil', name: 'Sil' }, { id: 'silas', name: 'Silas' }];
    expect(speakerBeats('Silas: hm.', others, 'Nix')[0].id).toBe('silas');
    expect(speakerBeats('Sil: hm.', others, 'Nix')[0].id).toBe('sil');
  });

  it("merges one other's paragraphs, never two others'", () => {
    expect(speakerBeats('Silas: a\n\nSilas: b', both, 'Nix').map((b) => b.id)).toEqual(['silas']);
    expect(speakerBeats('Silas: a\n\nHae: b', both, 'Nix').map((b) => b.id)).toEqual(['silas', 'hae']);
  });

  it('no others and no stranger: one contact beat, markers and all', () => {
    const t = 'Silas: hi';
    expect(speakerBeats(t, [], 'Nix')).toEqual([{ who: 'contact', start: 0, bodyStart: 0, end: t.length, markers: [] }]);
  });
});
