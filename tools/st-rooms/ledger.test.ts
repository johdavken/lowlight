import { describe, expect, it } from 'vitest';
import type { ResidualAnswer } from '../../server/src/residual';
import { applyAnswer, changeOf, exchangesFor, herReplies, isRecapRun, ledgerOf, withChange, type ChatMessage, type Ledger, type LedgerChange } from './ledger';

const ok = { ok: true } as const;
const change = (c: Partial<LedgerChange>): LedgerChange => ({ notes: [], lights: [], run: ok, ...c });
const add = (id: string, text: string, o: { pin?: boolean; keys?: string[]; about?: 'me' | 'you' } = {}) =>
  ({ op: 'add', id, about: o.about ?? 'you', text, keys: o.keys ?? [], pin: o.pin ?? false }) as const;
const her = (mes: string, c?: LedgerChange) => (c ? withChange({ name: 'Nix', mes }, c) : { name: 'Nix', mes });
const you = (mes: string) => ({ name: 'Hicks', mes, is_user: true });
const answer = (a: Partial<ResidualAnswer>): ResidualAnswer => ({ notes: [], standing: null, lights: [], time: null, plan: null, recap: null, dossier: null, ...a });
const empty: Ledger = { notes: [], recap: null, nextId: 1 };

describe('ledgerOf', () => {
  it('a chat from before the Residual folds to an empty ledger', () => {
    expect(ledgerOf([her('Hi.'), you('Hey.'), her('Rain again.')])).toEqual(empty);
  });

  it('add, rewrite, forget: one note, then none', () => {
    const chat = [her('a', change({ notes: [add('n1', 'Owes Hae.')] })), her('b', change({ notes: [{ op: 'rewrite', id: 'n1', text: 'Paid Hae back.', pin: true }] }))];
    expect(ledgerOf(chat).notes).toMatchObject([{ id: 'n1', text: 'Paid Hae back.', pinned: true, about: 'you', editedBy: 'agent' }]);
    expect(ledgerOf([...chat, her('c', change({ notes: [{ op: 'forget', id: 'n1' }] }))])).toEqual({ notes: [], recap: null, nextId: 2 });
  });

  it('ids are stable across folds, and never reused after a forget', () => {
    const chat = [her('a', change({ notes: [add('n1', 'A.'), add('n2', 'B.')] })), her('b', change({ notes: [{ op: 'forget', id: 'n2' }] }))];
    expect(ledgerOf(chat)).toEqual(ledgerOf(chat));
    expect(ledgerOf(chat).nextId).toBe(3);
  });

  it('a deleted message takes its change with it', () => {
    const chat = [her('a', change({ notes: [add('n1', 'A.')] })), her('b', change({ notes: [add('n2', 'B.')] }))];
    expect(ledgerOf(chat.slice(0, 1)).notes.map((n) => n.id)).toEqual(['n1']);
  });

  it('a swipe folds its own change, and one without a change adds nothing', () => {
    const msg: ChatMessage = { name: 'Nix', mes: 'x', swipe_id: 0, swipe_info: [{ send_date: 'a' }, { send_date: 'b' }] };
    const first = withChange(msg, change({ take: 'a', notes: [add('n1', 'From take one.')] }));
    expect(ledgerOf([first]).notes).toHaveLength(1);
    expect(ledgerOf([{ ...first, swipe_id: 1 }]).notes).toHaveLength(0);
    const second = withChange({ ...first, swipe_id: 1 }, change({ take: 'b', notes: [add('n1', 'From take two.')] }));
    expect(ledgerOf([second]).notes[0].text).toBe('From take two.');
    expect(ledgerOf([{ ...second, swipe_id: 0 }]).notes[0].text).toBe('From take one.');
  });

  it('a recap replaces the last', () => {
    expect(ledgerOf([her('a', change({ recap: 'One.' })), her('b', change({ recap: 'Two.' })), her('c', change({}))]).recap).toBe('Two.');
  });
});

describe('a change belongs to its take', () => {
  it("a new swipe that SillyTavern copied the old take's extra onto shows no change", () => {
    const first: ChatMessage = withChange<ChatMessage>({ name: 'Nix', mes: 'take one', swipe_id: 0, swipe_info: [{}] }, change({ take: 0, notes: [add('n1', 'From take one.')] }));
    // SillyTavern keeps extra on a new swipe and clones it into the new swipe_info entry.
    const second = { ...first, swipe_id: 1, mes: 'take two', swipe_info: [...first.swipe_info!, { extra: structuredClone(first.extra) }] };
    expect(changeOf(second)).toBeNull();
    expect(ledgerOf([second]).notes).toHaveLength(0);
    expect(ledgerOf([{ ...second, swipe_id: 0 }]).notes).toHaveLength(1);
  });
});

describe('a take is its own, by its date, not its place', () => {
  const taken = (date: string, c: LedgerChange) => ({ send_date: date, extra: { lowlight_ledger: c } });
  it('deleting an earlier swipe keeps a later take\'s change', () => {
    const c = change({ take: 'b', notes: [add('n1', 'From take two.')] });
    const msg: ChatMessage = { name: 'Nix', mes: 'two', swipe_id: 0, swipe_info: [taken('b', c)] };
    expect(changeOf(msg)).toEqual(c);
  });
  it("a new swipe with the old take's change copied in, at the same place, shows none", () => {
    const c = change({ take: 'b', notes: [add('n1', 'Old.')] });
    const msg: ChatMessage = { name: 'Nix', mes: 'new', swipe_id: 1, swipe_info: [{ send_date: 'a' }, taken('c', c)] };
    expect(changeOf(msg)).toBeNull();
  });
});

describe('changeOf / withChange', () => {
  it('writes the message and its current swipe', () => {
    const c = change({ recap: 'R.' });
    const out: ChatMessage = withChange<ChatMessage>({ swipe_id: 1, swipe_info: [{}, {}] }, c);
    expect(out.extra?.lowlight_ledger).toEqual(c);
    expect(out.swipe_info?.[1].extra?.lowlight_ledger).toEqual(c);
    expect(out.swipe_info?.[0].extra).toBeUndefined();
    expect(changeOf(out)).toEqual(c);
  });
});

describe('applyAnswer', () => {
  const lights = new Set(['desk-lamp']);
  const names = ['Nix', 'Hicks'];

  it('gives adds the next id', () => {
    const c = applyAnswer({ ...empty, nextId: 3 }, answer({ notes: [{ op: 'add', about: 'me', text: 'Moved the safe.', keys: ['safe'], pin: false }] }), lights, names);
    expect(c.notes).toEqual([add('n3', 'Moved the safe.', { about: 'me', keys: ['safe'] })]);
    expect(c.run).toEqual({ ok: true });
  });

  it('refuses an unknown id and an unknown light; past 8 pins a note is kept unpinned; a long note is cut at a word', () => {
    const pins = Array.from({ length: 8 }, (_, i) => ({ id: `n${i + 1}`, text: 'P.', pinned: true, createdAt: 0, updatedAt: 0, editedBy: 'agent' as const, about: 'you' as const, keys: [] }));
    const long = `${'word '.repeat(60)}end`;
    const c = applyAnswer(
      { notes: pins, recap: null, nextId: 9 },
      answer({
        notes: [
          { op: 'rewrite', id: 'n99', text: 'X.' },
          { op: 'add', about: 'you', text: 'Pinned too.', keys: [], pin: true },
          { op: 'add', about: 'you', text: long, keys: [], pin: false },
          { op: 'add', about: 'you', text: 'Kept.', keys: [], pin: false },
        ],
        lights: [{ id: 'nope', intensity: 0.2 }, { id: 'desk-lamp', intensity: 1.4 }],
      }),
      lights,
      names,
    );
    expect(c.notes.map((n) => n.op === 'add' && [n.id, n.pin])).toEqual([['n9', false], ['n10', false], ['n11', false]]);
    const cut = (c.notes[1] as { text: string }).text;
    expect(cut.length).toBeLessThanOrEqual(280);
    expect(long.startsWith(cut)).toBe(true);
    expect(cut.endsWith(' ')).toBe(false);
    expect(c.lights).toEqual([{ id: 'desk-lamp', intensity: 1 }]);
    expect(c.run).toEqual({ ok: true, refused: 2 });
  });

  it('a rewrite that would pin past 8 keeps its text, unpinned', () => {
    const pins = Array.from({ length: 8 }, (_, i) => ({ id: `n${i + 1}`, text: 'P.', pinned: true, createdAt: 0, updatedAt: 0, editedBy: 'agent' as const, about: 'you' as const, keys: [] }));
    const l = { notes: [...pins, { ...pins[0], id: 'n9', pinned: false }], recap: null, nextId: 10 };
    expect(applyAnswer(l, answer({ notes: [{ op: 'rewrite', id: 'n9', text: 'New.', pin: true }] }), lights, names).notes).toEqual([{ op: 'rewrite', id: 'n9', text: 'New.' }]);
  });

  it("drops her and your names from keys, as the game's notes do", () => {
    const c = applyAnswer(empty, answer({ notes: [{ op: 'add', about: 'you', text: 'Owes Hae.', keys: ['Nix', 'noodles'], pin: false }] }), lights, names);
    expect(c.notes[0]).toMatchObject({ keys: ['noodles'] });
  });

  it('a rewrite of a note forgotten in an earlier message is refused', () => {
    const l = ledgerOf([her('a', change({ notes: [add('n1', 'A.')] })), her('b', change({ notes: [{ op: 'forget', id: 'n1' }] }))]);
    expect(applyAnswer(l, answer({ notes: [{ op: 'rewrite', id: 'n1', text: 'B.' }] }), lights, names).notes).toEqual([]);
  });

  it('ignores standing, time, plan and dossier', () => {
    const c = applyAnswer(empty, answer({ standing: { trust: 1, warmth: 1, reason: 'r' }, time: { until: '23:00' }, dossier: 'Page.' }), lights, names);
    expect(c).toEqual({ notes: [], lights: [], run: { ok: true } });
  });

  it('keeps a recap on a recap run, cut at a word to 600 characters', () => {
    expect(applyAnswer(empty, answer({ recap: 'Where things stand.' }), lights, names, { recap: true }).recap).toBe('Where things stand.');
    const long = `${'word '.repeat(130)}end`;
    const recap = applyAnswer(empty, answer({ recap: long }), lights, names, { recap: true }).recap!;
    expect(recap.length).toBeLessThanOrEqual(600);
    expect(long.startsWith(recap)).toBe(true);
  });

  it('ignores a recap on an ordinary turn, so it never replaces the whole chat\'s', () => {
    expect(applyAnswer(empty, answer({ recap: 'Just this turn.' }), lights, names).recap).toBeUndefined();
  });
});

describe('the recap run and exchanges', () => {
  const chat = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? you(`y${i}`) : her(`h${i}`)));

  it('counts her replies, not yours or hidden ones', () => {
    expect(herReplies([...chat.slice(0, 4), { name: 'Nix', mes: 'hidden', is_system: true }], 4)).toBe(2);
  });

  it('her 10th and 20th replies are recap runs, the 9th is not', () => {
    const long = [...chat, ...chat];
    expect(isRecapRun(long, 17)).toBe(false);
    expect(isRecapRun(long, 19)).toBe(true);
    expect(isRecapRun(long, 39)).toBe(true);
  });

  it('exchanges start after the last message with a change, up to this one', () => {
    const c = [you('a'), her('b', change({})), you('c'), { name: 'Nix', mes: 'hidden', is_system: true }, her('d')];
    expect(exchangesFor(c, 4)).toEqual([{ speaker: 'Hicks', text: 'c' }, { speaker: 'Nix', text: 'd' }]);
  });

  it('a failed run leaves its lines for the next one', () => {
    const c = [you('a'), her('b', change({})), you('c'), her('d', change({ run: { ok: false, why: 'not JSON' } })), you('e'), her('f')];
    expect(exchangesFor(c, 5).map((e) => e.text)).toEqual(['c', 'd', 'e', 'f']);
  });

  it('exchanges keep the newest 12', () => {
    const got = exchangesFor(chat, 19);
    expect(got).toHaveLength(12);
    expect(got.at(-1)).toEqual({ speaker: 'Nix', text: 'h19' });
  });
});
