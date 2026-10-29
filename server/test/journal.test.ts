import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/db';
import { TOOLS } from '../src/tools';
import { JOURNAL_LINE_MAX, Journal, NOTE_CAP, PAGE_MAX, PIN_CAP, PREVIOUSLY_GAP_MS, pageLine, type JournalChange } from '../src/journal';
import type { Note } from '../../shared/types';

let db: Db;
let clock: number;
let journal: Journal;
let changes: JournalChange[];
const P = 'hicks';

beforeEach(() => {
  db = openDb(':memory:', { defaultPlayer: 'hicks' });
  clock = 1_000_000;
  journal = new Journal(db, () => clock);
  changes = [];
  journal.onChange((c) => changes.push(c));
});

const ok = (r: { ok: boolean; text?: string; error?: string }) => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.text!;
};
const err = (r: { ok: boolean; text?: string; error?: string }) => {
  if (r.ok) throw new Error(`expected error, got: ${r.text}`);
  return r.error!;
};
const add = (text: string, pinned = false) => {
  clock += 1;
  return journal.note(P, { text, pinned }, 'agent');
};

describe('Journal note keys', () => {
  it('stores keys on add and rewrite, and keys alone rewrites only keys', () => {
    ok(journal.note(P, { text: 'Teo owes 200', keys: ['Teo', 'debt'] }, 'agent'));
    expect(journal.notes(P)[0].keys).toEqual(['Teo', 'debt']);
    ok(journal.note(P, { id: 'n1', keys: ['Teo'] }, 'agent'));
    expect(journal.notes(P)[0]).toMatchObject({ text: 'Teo owes 200', keys: ['Teo'] });
  });
  it('a note without keys reads back with []', () => {
    ok(add('no keys here'));
    expect(journal.notes(P)[0].keys).toEqual([]);
  });
  it('keys are normalized', () => {
    ok(journal.note(P, { text: 'x', keys: [' Hae ', 'hae', 'it'] }, 'agent'));
    expect(journal.notes(P)[0].keys).toEqual(['Hae']);
  });
});

describe('Journal notes', () => {
  it('adds n1, n2, … with trimmed text', () => {
    expect(ok(add('  the blue mug is yours now  '))).toBe('noted: n1 "the blue mug is yours now"');
    expect(ok(add('Hae owes us a favour', true))).toBe('noted: n2 "Hae owes us a favour" (pinned)');
    expect(journal.notes(P).map((n) => n.id)).toEqual(['n2', 'n1']);
  });

  it('rewrites a note by id, and pins or unpins it', () => {
    add('first');
    expect(ok(journal.note(P, { id: 'n1', text: 'first, fixed' }, 'agent'))).toBe('updated: n1 "first, fixed"');
    ok(journal.note(P, { id: 'n1', text: 'first, fixed', pinned: true }, 'agent'));
    expect(journal.notes(P)[0]).toMatchObject({ id: 'n1', pinned: true, text: 'first, fixed' });
    ok(journal.note(P, { id: 'n1', text: 'first, fixed', pinned: false }, 'agent'));
    expect(journal.notes(P)[0].pinned).toBe(false);
  });

  it('never reuses an id', () => {
    add('a');
    ok(journal.forget(P, 'n1', 'agent'));
    expect(ok(add('b'))).toBe('noted: n2 "b"');
  });

  it('refuses a ninth pin, naming the current pins, and changes nothing', () => {
    for (let i = 0; i < PIN_CAP; i++) add(`p${i}`, true);
    expect(err(add('one more', true))).toBe(
      'pinned notes are full (8): n1, n2, n3, n4, n5, n6, n7, n8 — unpin one with note(id, pinned: false) first',
    );
    add('plain');
    expect(err(journal.note(P, { id: 'n9', text: 'plain', pinned: true }, 'agent'))).toContain('pinned notes are full (8)');
    expect(journal.notes(P)).toHaveLength(9);
  });

  it('refuses the 201st note', () => {
    for (let i = 0; i < NOTE_CAP; i++) add(`n${i}`);
    expect(err(add('too many'))).toBe('the journal is full (200 notes) — forget or merge some first');
  });

  it('enforces length limits: empty is refused; from the player, too long is refused', () => {
    expect(err(add('   '))).toBe('note text must be 1–280 characters; yours is empty');
    expect(err(journal.note(P, { text: 'x'.repeat(412) }, 'user'))).toBe('note text must be 1–280 characters; yours is 412 — shorten it');
    expect(ok(add('x'.repeat(280)))).toContain('noted: n1');
    expect(err(journal.setRecap(P, 'y'.repeat(601), 'user'))).toBe('recap must be 1–600 characters; yours is 601 — shorten it');
    expect(err(journal.setRecap(P, '  ', 'agent'))).toBe('recap must be 1–600 characters; yours is empty');
  });

  it("from her, too long is cut at a word and saved, and she's told (a refusal made GLM rewrite its reply)", () => {
    const long = `${'word '.repeat(70)}tail`;
    const r = ok(add(long));
    expect(r).toContain('shortened to 280');
    const saved = journal.notes(P)[0]!.text;
    expect(saved.length).toBeLessThanOrEqual(280);
    expect(long.startsWith(saved)).toBe(true);
    expect(saved.endsWith('word')).toBe(true);
    expect(ok(journal.setRecap(P, 'y '.repeat(400), 'agent'))).toContain('shortened to 600');
    expect(ok(journal.setPage(P, 'z '.repeat(800), 'agent'))).toContain('shortened to 1375');
  });

  it('the note and set_recap tools state their limits, and note says ids are given out', () => {
    const tools = Object.fromEntries(TOOLS.map((t) => [t.name, t.description]));
    expect(tools.note).toContain('Up to 280 characters');
    expect(tools.note).toContain('leave id out');
    expect(tools.set_recap).toContain('Up to 600 characters');
  });

  it('names an unknown id', () => {
    // She guessed an id for a new note: tell her ids are given out.
    // From her, an id she made up is a new note (it was what she meant every time it came up).
    expect(ok(journal.note(P, { id: 'n9', text: 'x' }, 'agent'))).toMatch(/^noted: n\d+ "x" — there was no note 'n9', so this is a new one/);
    expect(err(journal.note(P, { id: 'n9', pinned: true }, 'agent'))).toBe("no note 'n9'");
    expect(err(journal.note(P, { id: 'n9', text: 'x' }, 'user'))).toBe("no note 'n9'");
    expect(err(journal.forget(P, 'n9', 'agent'))).toBe("no note 'n9'");
  });

  it('reads pinned first, then newest first, and filters case-insensitively', () => {
    add('the blue mug is yours now');
    add('Hae owes us a favour', true);
    add('the window crack got worse');
    expect(ok(journal.read(P))).toBe(
      ['journal: 3 notes (1 pinned)', 'n2 (you) [pinned] Hae owes us a favour', 'n3 (you) the window crack got worse', 'n1 (you) the blue mug is yours now'].join('\n'),
    );
    expect(ok(journal.read(P, 'MUG'))).toBe(['journal: 1 of 3 notes match "MUG"', 'n1 (you) the blue mug is yours now'].join('\n'));
    expect(ok(journal.read(P, 'zzz'))).toBe('no notes match "zzz"');
  });

  it('forgets a note', () => {
    add('a');
    expect(ok(journal.forget(P, 'n1', 'agent'))).toBe('forgot: n1 "a"');
    expect(journal.notes(P)).toEqual([]);
  });

  it('restores a forgotten note under its old id even when the journal is full (Review Focus 5)', () => {
    add('keep me');
    const original = journal.notes(P)[0];
    ok(journal.forget(P, 'n1', 'user'));
    for (let i = 0; i < NOTE_CAP; i++) add(`f${i}`);
    ok(journal.restore(P, original));
    expect(journal.notes(P).find((n) => n.id === 'n1')).toEqual(original);
    expect(err(journal.restore(P, original))).toBe("note 'n1' already exists");
  });

  it('restore keeps the limits: pin cap, length, and only ids that existed (final review 3)', () => {
    add('was pinned', true);
    const pinned = journal.notes(P)[0];
    ok(journal.forget(P, 'n1', 'user'));
    for (let i = 0; i < PIN_CAP; i++) add(`p${i}`, true);
    ok(journal.restore(P, pinned));
    expect(journal.notes(P).find((n) => n.id === 'n1')).toMatchObject({ pinned: false, text: 'was pinned' });
    expect(journal.notes(P).filter((n) => n.pinned)).toHaveLength(PIN_CAP);
    const forged = { ...pinned, id: 'n500' };
    expect(err(journal.restore(P, forged))).toBe("no note 'n500' to restore");
    expect(err(journal.restore(P, { ...pinned, id: 'x' }))).toBe("no note 'x' to restore");
    ok(journal.forget(P, 'n2', 'user'));
    expect(err(journal.restore(P, { ...pinned, id: 'n2', text: '' }))).toBe('note text must be 1–280 characters');
    expect(err(journal.restore(P, { ...pinned, id: 'n2', text: 'y'.repeat(281) }))).toBe('note text must be 1–280 characters');
    clock = 5_000_000;
    ok(journal.restore(P, { ...pinned, id: 'n2', text: 'back', createdAt: 9e15, updatedAt: 9e15 }));
    expect(journal.notes(P).find((n) => n.id === 'n2')).toMatchObject({ createdAt: 5_000_000, updatedAt: 5_000_000 });
  });

  it('records who edited a note last', () => {
    add('a');
    expect(journal.notes(P)[0].editedBy).toBe('agent');
    ok(journal.note(P, { id: 'n1', text: 'b' }, 'user'));
    expect(journal.notes(P)[0].editedBy).toBe('user');
    ok(journal.note(P, { id: 'n1', text: 'c' }, 'dev'));
    expect(journal.notes(P)[0].editedBy).toBe('user');
  });
});

describe('Journal line', () => {
  it('is null when empty', () => {
    expect(journal.journalLine(P, [])).toBeNull();
  });

  it('lists pins and counts the rest', () => {
    add('the blue mug is yours now', true);
    add('Hae owes us a favour', true);
    add('a');
    add('b');
    add('c');
    expect(journal.journalLine(P, [])).toBe('[journal (pinned): n2 (you) Hae owes us a favour · n1 (you) the blue mug is yours now · 3 more notes]');
  });

  it('is singular for one more note, and has no tail without unpinned notes', () => {
    add('pin', true);
    expect(journal.journalLine(P, [])).toBe('[journal (pinned): n1 (you) pin]');
    add('x');
    expect(journal.journalLine(P, [])).toBe('[journal (pinned): n1 (you) pin · 1 more note]');
  });

  it('says so when nothing is pinned, and flattens newlines', () => {
    add('line one\nline two');
    expect(journal.journalLine(P, [])).toBe('[journal: 1 note]');
    ok(journal.note(P, { id: 'n1', text: 'line one\nline two', pinned: true }, 'agent'));
    expect(journal.journalLine(P, [])).toBe('[journal (pinned): n1 (you) line one line two]');
  });

  const keyed = (text: string, keys: string[], pinned = false) => {
    clock += 1;
    return ok(journal.note(P, { text, keys, pinned }, 'agent'));
  };

  it('pins first, then up to 5 unpinned notes whose keys came up, most recent mention first', () => {
    keyed('the stall closes at four', [], true); // n1
    keyed('Teo owes Mother Rot 200', ['Teo']); // n2
    keyed('the valve is cracked', ['valve']); // n3
    keyed('Ines keeps the water', ['Ines']); // n4
    for (let i = 0; i < 5; i++) keyed(`rain note ${i}`, ['rain']); // n5..n9
    const line = journal.journalLine(P, ['tell me about the valve', 'Teo called', 'rain again'])!;
    expect(line.startsWith('[journal (pinned): n1 (you) the stall closes at four · came up: n3 (you) the valve is cracked · n2 (you) Teo owes Mother Rot 200 · n5 ')).toBe(true);
    const came = line.slice(line.indexOf('came up: ') + 9).split(' · ').filter((p) => /^n\d+ /.test(p));
    expect(came).toHaveLength(5);
    expect(line.endsWith(' · 3 more notes]')).toBe(true);
  });

  it('without pins the matches still come back; the line never names read_notes', () => {
    keyed('Teo owes', ['Teo']);
    keyed('other', []);
    expect(journal.journalLine(P, ['where is Teo'])).toBe('[journal: came up: n1 (you) Teo owes · 1 more note]');
    expect(journal.journalLine(P, ['nothing'])).toBe('[journal: 2 notes]');
  });

  it('caps the line at 2400 chars, dropping matched notes before pins', () => {
    for (let i = 0; i < 8; i++) keyed(`${'p'.repeat(270)} ${i}`, [], true);
    for (let i = 0; i < 5; i++) keyed(`${'m'.repeat(270)} ${i}`, ['rain']);
    const line = journal.journalLine(P, ['rain'])!;
    expect(line.length).toBeLessThanOrEqual(JOURNAL_LINE_MAX);
    expect((line.match(/p{270}/g) ?? []).length).toBe(8);
  });
});

describe('Recap', () => {
  it('is unseen until marked, and unseen again after a newer recap', () => {
    expect(journal.recap(P)).toEqual({ text: null, at: null, seen: false });
    expect(ok(journal.setRecap(P, 'we closed the stall at dawn', 'agent'))).toBe('recap saved');
    expect(journal.recap(P)).toEqual({ text: 'we closed the stall at dawn', at: clock, seen: false });
    journal.markRecapSeen(P);
    expect(journal.recap(P).seen).toBe(true);
    clock += 10;
    ok(journal.setRecap(P, 'later', 'agent'));
    expect(journal.recap(P).seen).toBe(false);
  });

  it('rides along only after a 6-hour gap', () => {
    expect(journal.previouslyLine(P, clock - PREVIOUSLY_GAP_MS)).toBeNull(); // no recap yet
    ok(journal.setRecap(P, 'we closed the stall at dawn', 'agent'));
    expect(journal.previouslyLine(P, null)).toBeNull();
    expect(journal.previouslyLine(P, clock - PREVIOUSLY_GAP_MS + 1)).toBeNull();
    expect(journal.previouslyLine(P, clock - PREVIOUSLY_GAP_MS)).toBe('[previously: we closed the stall at dawn]');
  });

  it('forced (a greeting), rides along with no gap, and with no last activity', () => {
    expect(journal.previouslyLine(P, clock - 60_000, true)).toBeNull(); // still needs a recap
    ok(journal.setRecap(P, 'we closed the stall at dawn', 'agent'));
    expect(journal.previouslyLine(P, clock - 60_000, true)).toBe('[previously: we closed the stall at dawn]');
    expect(journal.previouslyLine(P, null, true)).toBe('[previously: we closed the stall at dawn]');
    expect(journal.previouslyLine(P, clock - 60_000)).toBeNull();
  });
});

describe('Change events', () => {
  it('carry the quiet feed line, and never fire for a failed call', () => {
    add('a');
    add('b', true);
    ok(journal.note(P, { id: 'n1', text: 'a', pinned: true }, 'agent'));
    ok(journal.note(P, { id: 'n1', text: 'a2' }, 'agent'));
    ok(journal.note(P, { id: 'n1', text: 'a2', pinned: false }, 'agent'));
    ok(journal.forget(P, 'n2', 'agent'));
    ok(journal.setRecap(P, 'r', 'agent'));
    err(journal.forget(P, 'n9', 'agent'));
    expect(changes.map((c) => [c.kind, c.line])).toEqual([
      ['notes', '// NOTED'],
      ['notes', '// PINNED'],
      ['notes', '// PINNED'],
      ['notes', '// NOTE UPDATED'],
      ['notes', '// NOTE UPDATED'],
      ['notes', '// FORGOT A NOTE'],
      ['recap', '// RECAP SAVED'],
    ]);
    expect(changes[0]).toMatchObject({ by: 'agent', source: 'agent' });
  });

  it('report the editor for the player and dev actions', () => {
    journal.note(P, { text: 'x' }, 'user');
    journal.setRecap(P, 'r', 'dev');
    journal.markRecapSeen(P);
    expect(changes[0]).toMatchObject({ by: 'user', source: 'user' });
    expect(changes[1]).toMatchObject({ kind: 'recap', line: '// RECAP SAVED', by: 'user', source: 'dev' });
    expect(changes[2]).toMatchObject({ kind: 'recap', line: null });
  });
});

describe('Note type', () => {
  it('is what the panel needs', () => {
    add('x');
    const n: Note = journal.notes(P)[0];
    expect(Object.keys(n).sort()).toEqual(['about', 'createdAt', 'editedBy', 'id', 'keys', 'pinned', 'text', 'updatedAt']);
  });
});

describe('Dossiers and the journal', () => {
  const Q = 'cass';
  const noteAs = (player: string, text: string, extra: { pinned?: boolean; about?: 'me' | 'you' } = {}) => {
    clock += 1;
    return journal.note(player, { text, ...extra }, 'agent');
  };

  it('note defaults to about "you" (dossier of the given player); about "me" writes a journal note', () => {
    ok(noteAs(P, 'the blue mug is yours'));
    ok(noteAs(P, 'the lamp flickers', { about: 'me' }));
    expect(journal.notes(P).map((n) => [n.id, n.about])).toEqual([
      ['n2', 'me'],
      ['n1', 'you'],
    ]);
    expect(db.listNotes(null).map((n) => n.id)).toEqual(['n2']);
    expect(journal.notes(Q).map((n) => n.id)).toEqual(['n2']);
  });

  it('journalLine labels (me)/(you) and never shows another pair', () => {
    ok(noteAs(P, 'the lamp flickers', { about: 'me', pinned: true }));
    ok(noteAs(P, 'the blue mug is yours', { pinned: true }));
    ok(noteAs(Q, 'cass hates the rain', { pinned: true }));
    expect(journal.journalLine(P, [])).toBe('[journal (pinned): n2 (you) the blue mug is yours · n1 (me) the lamp flickers]');
    expect(journal.journalLine(Q, [])).toBe('[journal (pinned): n3 (you) cass hates the rain · n1 (me) the lamp flickers]');
  });

  it('read_notes lists journal + this pair, labelled', () => {
    ok(noteAs(P, 'the lamp flickers', { about: 'me' }));
    ok(noteAs(P, 'the blue mug is yours', { pinned: true }));
    ok(noteAs(Q, 'cass hates the rain'));
    expect(ok(journal.read(P))).toBe(['journal: 2 notes (1 pinned)', 'n2 (you) [pinned] the blue mug is yours', 'n1 (me) the lamp flickers'].join('\n'));
    expect(ok(journal.read(Q))).toBe(['journal: 2 notes (0 pinned)', 'n3 (you) cass hates the rain', 'n1 (me) the lamp flickers'].join('\n'));
    expect(ok(journal.read(Q, 'mug'))).toBe('no notes match "mug"');
  });

  it("forget on another pair's id → \"no note 'nX'\"", () => {
    ok(noteAs(P, 'the blue mug is yours'));
    expect(err(journal.forget(Q, 'n1', 'agent'))).toBe("no note 'n1'");
    // The same as a made-up id: a new note in Q's dossier; P's n1 is never touched.
    expect(ok(journal.note(Q, { id: 'n1', text: 'stolen' }, 'agent'))).toContain("there was no note 'n1', so this is a new one");
    expect(journal.notes(P).map((n) => n.text)).toEqual(['the blue mug is yours']);
    expect(err(journal.note(Q, { id: 'n1', text: 'stolen' }, 'user'))).toBe("no note 'n1'");
  });

  it("restore of another pair's deleted note is refused (Review Focus 4)", () => {
    ok(noteAs(P, 'the blue mug is yours'));
    const original = journal.notes(P)[0];
    ok(journal.forget(P, 'n1', 'user'));
    expect(err(journal.restore(Q, original))).toBe("no note 'n1'");
    expect(err(journal.restore(Q, { ...original, about: 'me' }))).toBe("no note 'n1'");
    expect(journal.notes(Q)).toEqual([]);
    ok(journal.restore(P, original));
    expect(journal.notes(P)).toEqual([original]);
  });

  it("restore of an id that lives in another pair is refused, not thrown (Task 1 review)", () => {
    ok(noteAs(P, 'the blue mug is yours'));
    const original = journal.notes(P)[0];
    expect(err(journal.restore(Q, original))).toBe("no note 'n1'");
    expect(err(journal.restore(P, original))).toBe("note 'n1' already exists");
  });

  it('restore with no record goes by about: "me" → the journal, "you" → this pair (after a restart)', () => {
    ok(noteAs(P, 'the lamp flickers', { about: 'me' }));
    ok(noteAs(P, 'the blue mug is yours'));
    const [mine, yours] = [journal.notes(P).find((n) => n.id === 'n1')!, journal.notes(P).find((n) => n.id === 'n2')!];
    ok(journal.forget(P, 'n1', 'user'));
    ok(journal.forget(P, 'n2', 'user'));
    const fresh = new Journal(db, () => clock);
    ok(fresh.restore(Q, mine));
    ok(fresh.restore(Q, yours));
    expect(db.listNotes(null).map((n) => n.id)).toEqual(['n1']);
    expect(journal.notes(Q).map((n) => [n.id, n.about]).sort()).toEqual([
      ['n1', 'me'],
      ['n2', 'you'],
    ]);
    expect(journal.notes(P).map((n) => n.id)).toEqual(['n1']);
  });

  it('restore requires a valid about (Task 1 review)', () => {
    ok(noteAs(P, 'the blue mug is yours'));
    const original = journal.notes(P)[0];
    ok(journal.forget(P, 'n1', 'user'));
    expect(err(journal.restore(P, { ...original, about: undefined } as unknown as Note))).toBe("no note 'n1' to restore");
    expect(err(journal.restore(P, { ...original, about: 'them' } as unknown as Note))).toBe("no note 'n1' to restore");
    expect(journal.notes(P)).toEqual([]);
  });

  it('a journal note forgotten by one pair can be restored by another (journal notes are shared)', () => {
    ok(noteAs(P, 'the lamp flickers', { about: 'me' }));
    const original = journal.notes(P)[0];
    ok(journal.forget(P, 'n1', 'user'));
    ok(journal.restore(Q, original));
    expect(db.listNotes(null)).toEqual([original]);
  });

  it('editing a note with about moves it between journal and this pair', () => {
    ok(noteAs(P, 'the blue mug is yours', { pinned: true }));
    expect(ok(journal.note(P, { id: 'n1', about: 'me' }, 'user'))).toBe('updated: n1 "the blue mug is yours" (pinned)');
    expect(journal.notes(Q).map((n) => [n.id, n.about, n.pinned])).toEqual([['n1', 'me', true]]);
    ok(journal.note(Q, { id: 'n1', about: 'you' }, 'user'));
    expect(journal.notes(Q).map((n) => [n.id, n.about])).toEqual([['n1', 'you']]);
    expect(journal.notes(P)).toEqual([]);
    expect(err(journal.note(P, { id: 'n1', about: 'me' }, 'user'))).toBe("no note 'n1'");
  });

  it("caps count what one pair sees (journal + that pair)", () => {
    for (let i = 0; i < PIN_CAP; i++) ok(noteAs(Q, `q${i}`, { pinned: true }));
    ok(noteAs(P, 'pinned for hicks', { pinned: true }));
    ok(noteAs(P, 'shared', { about: 'me' }));
    expect(err(journal.note(Q, { id: `n${PIN_CAP + 2}`, pinned: true }, 'agent'))).toContain('pinned notes are full (8)');
    ok(journal.note(P, { id: `n${PIN_CAP + 2}`, pinned: true }, 'agent'));
  });

  it('recap is per pair: set/recap/markRecapSeen; unseenRecaps lists only unseen', () => {
    ok(journal.setRecap(P, 'we closed the stall at dawn', 'agent'));
    ok(journal.setRecap(Q, 'cass left in the rain', 'agent'));
    expect(journal.recap(P).text).toBe('we closed the stall at dawn');
    expect(journal.recap(Q).text).toBe('cass left in the rain');
    expect(journal.recap('nobody')).toEqual({ text: null, at: null, seen: false });
    expect(db.getMeta(`recap.${Q}.text`)).toBe('cass left in the rain');
    expect(journal.unseenRecaps()).toEqual({ [P]: 'we closed the stall at dawn', [Q]: 'cass left in the rain' });
    journal.markRecapSeen(P);
    expect(journal.recap(P).seen).toBe(true);
    expect(journal.recap(Q).seen).toBe(false);
    expect(journal.unseenRecaps()).toEqual({ [Q]: 'cass left in the rain' });
    expect(journal.previouslyLine(Q, clock - PREVIOUSLY_GAP_MS)).toBe('[previously: cass left in the rain]');
    expect(journal.previouslyLine('nobody', clock - PREVIOUSLY_GAP_MS)).toBeNull();
  });

  it('onChange carries player null for journal notes and the pair for dossier notes and recaps', () => {
    ok(noteAs(P, 'mine', { about: 'me' }));
    ok(noteAs(P, 'yours'));
    ok(journal.note(P, { id: 'n2', text: 'yours, fixed' }, 'agent'));
    ok(journal.note(P, { id: 'n1', text: 'mine, fixed' }, 'agent'));
    ok(journal.note(P, { id: 'n2', about: 'me' }, 'user'));
    ok(journal.note(Q, { id: 'n2', about: 'you' }, 'user'));
    ok(journal.forget(Q, 'n2', 'user'));
    ok(journal.restore(Q, { ...journal.notes(Q)[0], id: 'n2', text: 'back' }));
    ok(journal.forget(P, 'n1', 'agent'));
    ok(journal.setRecap(Q, 'r', 'agent'));
    journal.markRecapSeen(Q);
    expect(changes.map((c) => [c.kind, c.player])).toEqual([
      ['notes', null],
      ['notes', P],
      ['notes', P],
      ['notes', null],
      ['notes', null],
      ['notes', null],
      ['notes', Q],
      ['notes', Q],
      ['notes', null],
      ['recap', Q],
      ['recap', Q],
    ]);
  });
});

describe('dossier page', () => {
  it('is per pair: set, read back with at/by, and another pair sees nothing', () => {
    clock = 2_000;
    expect(ok(journal.setPage('cass', '  Cass tends bar.  ', 'agent'))).toBe('dossier updated (15/1375)');
    expect(journal.page('cass')).toEqual({ text: 'Cass tends bar.', at: 2_000, by: 'agent' });
    expect(journal.page('hicks')).toEqual({ text: null, at: null, by: null });
  });

  it('accepts exactly 1375 characters after trimming and refuses 1376 (Review Focus 3)', () => {
    expect(ok(journal.setPage(P, `  ${'x'.repeat(1375)}\n`, 'agent'))).toBe('dossier updated (1375/1375)');
    expect(err(journal.setPage(P, 'y'.repeat(1376), 'user'))).toBe('the dossier page must be 1–1375 characters');
    expect(journal.page(P).text).toBe('x'.repeat(1375));
    expect(PAGE_MAX).toBe(1375);
  });

  it('refuses an empty page from her; from the user an empty page clears it', () => {
    ok(journal.setPage(P, 'something', 'agent'));
    expect(err(journal.setPage(P, '   ', 'agent'))).toBe('the dossier page must be 1–1375 characters');
    expect(ok(journal.setPage(P, ' \n ', 'user'))).toBe('dossier page cleared');
    expect(journal.page(P)).toEqual({ text: null, at: null, by: null });
    for (const part of ['text', 'at', 'by']) expect(db.getMeta(`page.${P}.${part}`)).toBeNull();
  });

  it('records who wrote it', () => {
    ok(journal.setPage(P, 'mine', 'user'));
    expect(journal.page(P).by).toBe('user');
  });

  it('emits a page change with the pair, and the // DOSSIER UPDATED line for her writes only', () => {
    ok(journal.setPage('cass', 'hers', 'agent'));
    ok(journal.setPage('cass', 'yours', 'user'));
    ok(journal.setPage('cass', '', 'user'));
    expect(changes.map((c) => [c.kind, c.player, c.line])).toEqual([
      ['page', 'cass', '// DOSSIER UPDATED'],
      ['page', 'cass', null],
      ['page', 'cass', null],
    ]);
  });

  it('pageLine: a tie stands in for an empty page only; her own page wins (Review Focus 1)', () => {
    expect(pageLine('Hicks', null, 'Court.\nStill comes weekly]')).toBe('[your dossier on Hicks: Court. Still comes weekly)]');
    expect(pageLine('Hicks', 'Her own.', 'Court.')).toBe('[your dossier on Hicks: Her own.]');
    expect(pageLine('Hicks', null)).toBe('[your dossier on Hicks: empty]');
  });

  it('pageLine: the exact empty nudge, including for the default "You" (Review Focus 5)', () => {
    expect(pageLine('You', null)).toBe('[your dossier on You: empty]');
  });

  it('pageLine: a filled page is one bracketed line (newlines → spaces, ] → )) (Review Focus 1)', () => {
    expect(pageLine('Cass', 'Tends bar.\n\n  Hard to rattle ]x[.')).toBe('[your dossier on Cass: Tends bar. Hard to rattle )x[.]');
  });

  it('a page-only pair does not add an unseen recap', () => {
    ok(journal.setPage('vex', 'only a page', 'agent'));
    expect(journal.unseenRecaps()).toEqual({});
  });
});
