import { describe, expect, it } from 'vitest';
import { earlierOf, flagsOf, summary, type TurnRecord } from './analyze';

const rec = (over: Partial<TurnRecord>): TurnRecord => ({
  contact: 'cass', turn: 1, mode: 'rp', you: 'hi', status: 'ok', end: 'end', text: 'Hey. Sit down.', calls: [], ms: 1000, ...over,
});
const kinds = (t: TurnRecord, earlier: string[] = []) => flagsOf(t, earlier).map((f) => f.kind);

describe('flagsOf', () => {
  it("the Residual's writes count: a note, a light and a recap it made are not misses (scribe spec)", () => {
    expect(kinds(rec({ expect: 'note', calls: [{ name: 'residual:note', args: 'note n3 added', out: 'ok' }] }))).toEqual([]);
    expect(kinds(rec({ expect: 'light', calls: [{ name: 'residual:light', args: 'light lamp 0%', out: 'ok' }] }))).toEqual([]);
    expect(kinds(rec({ expect: 'recap', calls: [{ name: 'residual:recap', args: 'recap saved', out: 'ok' }] }))).toEqual([]);
    expect(kinds(rec({ expect: 'note', calls: [{ name: 'residual', args: '', out: 'residual · nothing to write' }] }))).toEqual(['missed-note']);
  });

  it("counts residual:* and old scribe:* trace names alike (an old run's trace still compares)", () => {
    for (const p of ['residual', 'scribe']) {
      expect(kinds(rec({ expect: 'note', calls: [{ name: `${p}:note`, args: 'note n3 added', out: 'ok' }] })), p).toEqual([]);
      expect(kinds(rec({ expect: 'light', calls: [{ name: `${p}:light`, args: 'light lamp 0%', out: 'ok' }] })), p).toEqual([]);
      expect(kinds(rec({ expect: 'recap', calls: [{ name: `${p}:recap`, args: 'recap saved', out: 'ok' }] })), p).toEqual([]);
      expect(kinds(rec({ expect: 'note', calls: [{ name: `${p}:dossier`, args: 'dossier saved', out: 'ok' }] })), p).toEqual([]);
    }
  });

  it('a plain good turn has no flags', () => {
    expect(kinds(rec({}))).toEqual([]);
  });

  it('an echo: her actions carry two phrases from her last replies, or one of four words or more (Nix, 2026-10-23)', () => {
    const before = ["*The paper lantern's throwing warm light across the wall.*", '*I brush flakes into the sink.*'];
    expect(kinds(rec({ text: "*The paper lantern's throwing warm light across the wall.* Sit.", turn: 3 }), before)).toContain('echo');
    expect(kinds(rec({ text: '*I brush flakes into the sink under the paper lantern.*', turn: 3 }), before)).toContain('echo');
    expect(kinds(rec({ text: '*Under the paper lantern I sit.*', turn: 3 }), before)).not.toContain('echo');
    // A phrase they just used is the scene, and a line she says is hers to say again.
    expect(kinds(rec({ you: '*brush flakes into the sink*', text: '*I brush flakes into the sink.*', turn: 3 }), before)).not.toContain('echo');
    expect(kinds(rec({ text: "The paper lantern's throwing warm light across the wall.", turn: 3 }), before)).not.toContain('echo');
  });

  it('earlierOf: her in-character replies to that contact before the turn, oldest first', () => {
    const rs = [rec({ turn: 1, text: 'a' }), rec({ turn: 2, mode: 'ooc', text: 'b' }), rec({ contact: 'ember', turn: 2, text: 'c' }), rec({ turn: 3, text: 'd' }), rec({ turn: 4, text: 'e' })];
    expect(earlierOf(rs, rs[4])).toEqual(['a', 'd']);
  });

  it('a turn that failed, timed out or came back empty or as actions only', () => {
    expect(kinds(rec({ end: 'timeout', status: null, text: '' }))).toEqual(['failed-turn', 'empty']);
    expect(kinds(rec({ text: '*nods*\n\n*pours a drink*' }))).toEqual(['actions-only']);
  });

  it('a repeated paragraph, or the same sentence twice (Nix after a failed call)', () => {
    const para = 'Hae sets two bowls on the counter without a word, no greens in one, and goes back to the pot.';
    expect(kinds(rec({ text: `${para}\n\nShe already knew.\n\n${para}` }))).toContain('repeat');
    expect(kinds(rec({ text: 'One last night. One, or one that turned into more than one? One last night. One, or one that turned into more than one?' }))).toContain('repeat');
    expect(kinds(rec({ text: 'Fine.\n\nFine.' }))).not.toContain('repeat');
  });

  it('tools talked about in the story', () => {
    for (const text of ['*applies the quiet preset*', '*sets the expression to neutral*', 'Note\'s updated.', '*sets the scene as we head out*']) {
      expect(kinds(rec({ text: `${text} Anyway.` })), text).toContain('tool-talk');
    }
    expect(kinds(rec({ text: '*her expression softens* Anyway.' }))).not.toContain('tool-talk');
  });

  it('failed calls are listed', () => {
    const f = flagsOf(rec({ calls: [{ name: 'note', args: '{}', out: 'error: note text must be 1–280 characters; yours is empty' }] }));
    expect(f).toEqual([{ kind: 'failed-call', detail: 'note: error: note text must be 1–280 characters; yours is empty' }]);
  });

  it('expectations: a light change, a real note, a scene change, a recap; no room change out of character', () => {
    expect(kinds(rec({ expect: 'light' }))).toEqual(['missed-light']);
    expect(kinds(rec({ expect: 'light', calls: [{ name: 'apply_mood', args: '{"name":"late"}', out: 'applied' }] }))).toEqual([]);
    // A note call without text (Ember: id and about only) changes nothing.
    expect(kinds(rec({ expect: 'note', calls: [{ name: 'note', args: '{"id":"n2","about":"you"}', out: 'updated' }] }))).toEqual(['missed-note']);
    expect(kinds(rec({ expect: 'note', calls: [{ name: 'note', args: '{"id":"n2","text":"slipped once"}', out: 'updated' }] }))).toEqual([]);
    expect(kinds(rec({ expect: 'scene' }))).toEqual(['missed-scene']);
    expect(kinds(rec({ expect: 'recap' }))).toEqual(['missed-recap']);
    expect(kinds(rec({ mode: 'ooc', expect: 'no-room-change', calls: [{ name: 'set_light', args: '{}', out: 'applied' }] }))).toEqual(['ooc-room-change']);
  });
});

describe('summary', () => {
  it('a markdown table: one row per flag kind, a column per contact and a total', () => {
    const table = summary([rec({ contact: 'cass', expect: 'light' }), rec({ contact: 'ember', expect: 'light' }), rec({ contact: 'ember', turn: 2 })]);
    expect(table).toContain('| | cass | ember | total |');
    expect(table).toContain('| turns | 1 | 2 | 3 |');
    expect(table).toContain('| missed-light | 1 | 1 | 2 |');
    expect(table).toContain('| repeat | 0 | 0 | 0 |');
  });
});
