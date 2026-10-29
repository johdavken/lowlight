import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/db';
import { Journal } from '../src/journal';
import { JOBS_APART } from '../src/instructions';
import { standingControl, storedStanding } from '../src/standing';
import { DEFAULT_SHARED_STANDING } from '../../shared/standing';
import { applyScribe, parseScribeAnswer, scribeMessages, timeSkip, SCRIBE_KEY_BATCH, type ScribeAnswer, type ScribeInput } from '../src/scribe';
import type { ChatMessage } from '../../shared/types';

const P = 'hicks';
let db: Db;
let journal: Journal;
let lights: { id: string; intensity: number }[];

const msg = (id: string, ts: number, over: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: 'agent', text: 't', toolLines: [], ts, status: 'ok', ...over });
const empty: ScribeAnswer = { notes: [], standing: null, lights: [], time: null, plan: null, recap: null, dossier: null };
const deps = () => ({
  journal,
  player: P,
  standing: standingControl({ db, player: () => P, start: () => ({ trust: 0, warmth: 0 }), config: () => null, shared: () => DEFAULT_SHARED_STANDING }),
  setLight: (id: string, intensity: number) => {
    if (id !== 'lamp') return { ok: false as const, error: `no light '${id}'` };
    lights.push({ id, intensity });
    return { ok: true as const, text: 'applied' };
  },
  db,
});

beforeEach(() => {
  db = openDb(':memory:', { defaultPlayer: P });
  journal = new Journal(db, () => 1);
  lights = [];
  db.insertMessage(P, msg('u1', 1000, { role: 'user' }));
  db.insertMessage(P, msg('a1', 2000));
});

describe('parseScribeAnswer', () => {
  it('parses fenced', () => {
    expect(parseScribeAnswer('```json\n{"notes":[]}\n```').answer).toEqual(empty);
  });
  it('parses prose-wrapped', () => {
    const r = parseScribeAnswer('Here: {"notes":[],"standing":{"trust":1,"warmth":0,"reason":"paid"}} done');
    expect(r.answer!.standing).toEqual({ trust: 1, warmth: 0, reason: 'paid' });
  });
  it('truncated answer writes nothing', () => {
    const r = parseScribeAnswer('{"notes":[{"op":"add"');
    expect(r.answer).toBeNull();
    expect(r.refused[0]).toMatch(/not JSON/);
  });
  it('drops a bad item, keeps the rest', () => {
    const r = parseScribeAnswer('{"notes":[{"op":"add","about":"you","text":"ok","keys":["Teo"],"pin":false},{"op":"explode"}],"lights":[{"id":"lamp"}]}');
    expect(r.answer!.notes).toHaveLength(1);
    expect(r.answer!.lights).toEqual([]);
    expect(r.refused.some((x) => x.startsWith('notes[1]'))).toBe(true);
    expect(r.refused.some((x) => x.startsWith('lights[0]'))).toBe(true);
  });
  describe('small JSON slips (hand-check 2026-10-20)', () => {
    // GLM's live answer: no comma between a note's "keys" and its "pin".
    const live = [
      '{',
      '  "notes": [',
      '    {"op": "add", "about": "you", "text": "Sat in the corner till two, cold tea, said nothing.",',
      '     "keys": ["corner", "cold tea", "quiet", "stayed"]',
      '     "pin": false}',
      '  ],',
      '  "standing": null,',
      '  "lights": [],',
      '  "time": {"until": "02:00"},',
      '  "recap": null,',
      '  "dossier": null',
      '}',
    ].join('\n');
    it('a missing comma before the next key is put back; notes and time kept', () => {
      const r = parseScribeAnswer(live);
      expect(r.answer!.notes).toEqual([{ op: 'add', about: 'you', text: 'Sat in the corner till two, cold tea, said nothing.', keys: ['corner', 'cold tea', 'quiet', 'stayed'], pin: false }]);
      expect(r.answer!.time).toEqual({ until: '02:00' });
      expect(r.refused).toEqual(['answer: JSON repaired (missing comma)']);
    });
    it('a missing comma after a number, true, null or a closed object is put back', () => {
      const r = parseScribeAnswer('{"standing": {"trust": 1, "warmth": 0, "reason": "paid"}\n"lights": [{"id": "lamp", "intensity": 0.5}\n],\n"recap": null\n"dossier": "x"}');
      expect(r.answer).toMatchObject({ standing: { trust: 1 }, lights: [{ id: 'lamp', intensity: 0.5 }], dossier: 'x' });
    });
    it('trailing commas are dropped', () => {
      const r = parseScribeAnswer('{"notes": [],\n"lights": [{"id": "lamp", "intensity": 1},],\n"time": {"until": "02:00",},\n}');
      expect(r.answer!.lights).toEqual([{ id: 'lamp', intensity: 1 }]);
      expect(r.answer!.time).toEqual({ until: '02:00' });
      expect(r.refused).toEqual(['answer: JSON repaired (trailing comma)']);
    });
    it('text inside a string is never changed', () => {
      const r = parseScribeAnswer('{"recap": "she said \\"wait\\"\\n\\"go\\": ,}"\n"dossier": "a,]"}');
      expect(r.answer).toMatchObject({ recap: 'she said "wait"\n"go": ,}', dossier: 'a,]' });
    });
    it('an answer cut off at the cap still writes nothing, wherever it stops', () => {
      for (const n of [1, 20, 60, 120, 200, live.length - 30, live.length - 1]) {
        const r = parseScribeAnswer(live.slice(0, n));
        expect(r.answer, `cut at ${n}`).toBeNull();
        expect(r.refused).toEqual(['answer: not JSON']);
      }
    });
    it('a refusal in prose is still null', () => {
      const r = parseScribeAnswer("I can't help with that request.");
      expect(r.answer).toBeNull();
      expect(r.refused).toEqual(['answer: not JSON']);
    });
    it('other broken JSON is not guessed at', () => {
      expect(parseScribeAnswer('{"notes": [] "lights": []}').answer).toBeNull(); // no newline between: left alone
      expect(parseScribeAnswer("{'notes': []}").answer).toBeNull();
    });
  });
  it('a bad standing or recap is refused, not fatal', () => {
    const r = parseScribeAnswer('{"notes":[],"standing":{"trust":"lots"},"recap":5}');
    expect(r.answer).toMatchObject({ standing: null, recap: null });
    expect(r.refused).toHaveLength(2);
  });
});

describe('placeholder answers (final review I1)', () => {
  it('a copied template line is refused: text or keys that are only dots', () => {
    const r = parseScribeAnswer('{"notes":[{"op":"add","about":"you","text":"…","keys":["…"],"pin":false},{"op":"rewrite","id":"n3","text":"...","pin":true},{"op":"add","about":"you","text":"real","keys":["...","Teo"]}]}');
    expect(r.answer!.notes).toEqual([{ op: 'add', about: 'you', text: 'real', keys: ['Teo'], pin: false }]);
    expect(r.refused).toHaveLength(2);
  });
});

describe('applyScribe', () => {
  const at = { messageId: 'a1', take: 0, kind: 'turn' as const };

  it('applies under the given stamp while another reply is open', () => {
    db.insertMessage(P, msg('u2', 3000, { role: 'user' }));
    db.insertMessage(P, msg('a2', 4000));
    db.setReplyStamp({ messageId: 'a2', take: 0 });
    applyScribe(deps(), { ...empty, notes: [{ op: 'add', about: 'you', text: 'Teo owes', keys: ['Teo'], pin: true }] }, at);
    const noteRows = db.writes().filter((w) => w.kind === 'note');
    expect(noteRows.at(-1)).toMatchObject({ messageId: 'a1', take: 0 });
    expect(db.stamp()).toEqual({ messageId: 'a2', take: 0 });
    expect(journal.notes(P)[0]).toMatchObject({ text: 'Teo owes', keys: ['Teo'], pinned: true });
  });

  it('rewrite and forget with an unknown id are refused', () => {
    const r = applyScribe(deps(), { ...empty, notes: [{ op: 'rewrite', id: 'n9', text: 'x' }, { op: 'forget', id: 'n8' }] }, at);
    expect(r.refused).toEqual([expect.stringMatching(/^rewrite n9 refused/), expect.stringMatching(/^forget n8 refused/)]);
    expect(journal.notes(P)).toEqual([]);
  });

  it('a pin past 8 saves unpinned and says so', () => {
    for (let i = 0; i < 8; i++) journal.note(P, { text: `pin ${i}`, pinned: true }, 'agent');
    const r = applyScribe(deps(), { ...empty, notes: [{ op: 'add', about: 'you', text: 'ninth', keys: [], pin: true }] }, at);
    expect(journal.notes(P).find((n) => n.text === 'ninth')!.pinned).toBe(false);
    expect(r.refused).toEqual([expect.stringMatching(/pin.*full \(8\)/)]);
  });

  it('standing over ±1 is clamped; both 0 is no move; standing once per reply (pace fix 2026-10-16)', () => {
    const d = deps();
    const r0 = applyScribe(d, { ...empty, standing: { trust: 0, warmth: 0, reason: 'nothing' } }, at);
    expect(r0.applied).toEqual([]);
    const r1 = applyScribe(d, { ...empty, standing: { trust: 5, warmth: -3, reason: 'a lot' } }, at);
    expect(storedStanding(db, P, null)!.moves.at(-1)).toMatchObject({ trust: 1, warmth: -1, messageId: 'a1', take: 0 });
    expect(r1.applied).toEqual(['standing trust +1 warmth -1']);
    const r2 = applyScribe(d, { ...empty, standing: { trust: 1, warmth: 0, reason: 'again' } }, at);
    expect(r2.refused).toEqual(['standing refused: already moved for this reply']);
  });

  it('after a move, standing waits 4 of her replies before it moves again (pace fix 2026-10-16)', () => {
    for (let i = 2; i <= 6; i++) {
      db.insertMessage(P, msg(`u${i}`, i * 2000 - 1000, { role: 'user' }));
      db.insertMessage(P, msg(`a${i}`, i * 2000));
    }
    const d = deps();
    const move = (id: string) => applyScribe(d, { ...empty, standing: { trust: 1, warmth: 0, reason: 'x' } }, { ...at, messageId: id });
    expect(move('a1').applied).toEqual(['standing trust +1 warmth 0']);
    for (const id of ['a2', 'a3', 'a4']) expect(move(id).refused).toEqual(['standing refused: too soon after the last move']);
    expect(move('a5').applied).toEqual(['standing trust +1 warmth 0']);
    expect(move('a6').refused).toEqual(['standing refused: too soon after the last move']);
    expect(storedStanding(db, P, null)!.trust).toBe(2);
  });

  it("a new take of the reply that moved isn't held back by its own old move", () => {
    const d = deps();
    applyScribe(d, { ...empty, standing: { trust: 1, warmth: 0, reason: 'x' } }, at);
    expect(applyScribe(d, { ...empty, standing: { trust: 0, warmth: 1, reason: 'y' } }, { ...at, take: 1 }).applied).toEqual(['standing trust 0 warmth +1']);
  });

  it('a standing move that changes her word reports the new word; one that keeps it says nothing', () => {
    const words: string[] = [];
    const control = standingControl({ db, player: () => P, start: () => ({ trust: 4, warmth: 4 }), config: () => null, shared: () => DEFAULT_SHARED_STANDING });
    applyScribe({ ...deps(), standing: control, standingShifted: (w) => words.push(w) }, { ...empty, standing: { trust: 1, warmth: 1, reason: 'saved her' } }, at);
    expect(words).toEqual([DEFAULT_SHARED_STANDING.words['high-high']]);
    applyScribe({ ...deps(), standing: control, standingShifted: (w) => words.push(w) }, { ...empty, standing: { trust: 1, warmth: 0, reason: 'again' } }, { ...at, messageId: 'u1' });
    expect(words).toHaveLength(1);
  });

  it('a recap is written on any turn (they part without END SCENE); the dossier only on an end', () => {
    const r = applyScribe(deps(), { ...empty, recap: 'we talked', dossier: 'he pays debts' }, at);
    expect(journal.recap(P).text).toBe('we talked');
    expect(journal.page(P).text).toBeNull();
    expect(r.applied).toEqual(['recap saved']);
    expect(r.refused).toEqual(['dossier ignored: not an end turn']);
    applyScribe(deps(), { ...empty, recap: 'we talked', dossier: 'he pays debts' }, { ...at, kind: 'end' });
    expect(journal.recap(P).text).toBe('we talked');
    expect(journal.page(P).text).toBe('he pays debts');
  });

  it('an unknown light id is refused, a known one applied', () => {
    const r = applyScribe(deps(), { ...empty, lights: [{ id: 'lamp', intensity: 0 }, { id: 'sun', intensity: 1 }] }, at);
    expect(lights).toEqual([{ id: 'lamp', intensity: 0 }]);
    expect(r.applied).toEqual(['light lamp 0%']);
    expect(r.refused).toEqual(["light sun refused: no light 'sun'"]);
  });

  it('a rewrite with keys alone rekeys the note', () => {
    journal.note(P, { text: 'Teo owes' }, 'agent');
    applyScribe(deps(), { ...empty, notes: [{ op: 'rewrite', id: 'n1', keys: ['Teo', 'debt'] }] }, at);
    expect(journal.notes(P)[0]).toMatchObject({ text: 'Teo owes', keys: ['Teo', 'debt'] });
  });
});

describe('time (time backstop 2026-10-20)', () => {
  it('parses until; a bad until is refused per item; null or missing is no skip', () => {
    expect(parseScribeAnswer('{"time":{"until":"01:15"}}').answer!.time).toEqual({ until: '01:15' });
    for (const bad of ['{"time":{"until":"25:00"}}', '{"time":{"until":"1:15"}}', '{"time":{"until":75}}', '{"time":{}}']) {
      const p = parseScribeAnswer(bad);
      expect(p.answer!.time).toBeNull();
      expect(p.refused[0]).toMatch(/^time:/);
    }
    expect(parseScribeAnswer('{"time":null}').answer!.time).toBeNull();
    expect(parseScribeAnswer('{}').answer!.time).toBeNull();
  });

  it('guards: under 30 ignored, 30 and 12 h apply, past 12 h refused, an earlier hour refused', () => {
    // playtest c7f7d4ac: Day 3 19:10 → Day 4 01:15.
    expect(timeSkip(4030, '01:15')).toEqual({ minutes: 365 });
    expect(timeSkip(4030, '19:30')).toEqual({ ignored: 'under 30 min' });
    expect(timeSkip(4030, '19:40')).toEqual({ minutes: 30 });
    expect(timeSkip(4030, '07:10')).toEqual({ minutes: 720 });
    expect(timeSkip(4030, '07:11')).toEqual({ refused: 'over 12 h' });
    // An earlier hour named in passing (Review Focus 4).
    expect(timeSkip(4030, '18:00')).toEqual({ refused: 'over 12 h' });
    // She already passed to 21:35 and the scribe names the same night (Review Focus 3).
    expect(timeSkip(1295, '21:40')).toEqual({ ignored: 'under 30 min' });
  });

  it('applies through passTime under the reply; refusals and no clock are reported, not applied', () => {
    const at = { messageId: 'a1', take: 0, kind: 'turn' as const };
    const passed: number[] = [];
    const ok = { ...deps(), passTime: (m: number) => (passed.push(m), { ok: true as const, text: '' }) };
    const a = { ...empty, time: { until: '01:15' } };
    expect(applyScribe(ok, a, { ...at, clock: 4030 }).applied).toContain('time +365 → Day 4, Sun 01:15');
    expect(passed).toEqual([365]);

    const late = { ...deps(), passTime: () => ({ ok: false as const, error: 'too late' }) };
    expect(applyScribe(late, a, { ...at, clock: 4030 }).refused).toContain('time refused: too late');

    const ignored = applyScribe(ok, { ...empty, time: { until: '19:20' } }, { ...at, clock: 4030 });
    expect(ignored.refused).toContain('time ignored: under 30 min');
    expect(applyScribe(ok, { ...empty, time: { until: '18:00' } }, { ...at, clock: 4030 }).refused).toContain('time refused: over 12 h');

    // No clock on the reply (Review Focus 5), or time doesn't apply: nothing either way.
    const none = applyScribe(ok, a, { ...at, clock: null });
    expect([...none.applied, ...none.refused].filter((x) => x.startsWith('time'))).toEqual([]);
    const off = applyScribe(deps(), a, { ...at, clock: 4030 });
    expect([...off.applied, ...off.refused].filter((x) => x.startsWith('time'))).toEqual([]);
    expect(passed).toEqual([365]);
  });
});

describe('scribeMessages', () => {
  const input = (over: Partial<ScribeInput> = {}): ScribeInput => ({
    kind: 'turn',
    self: { name: 'Nix', pronoun: 'she' },
    player: { id: P, name: 'Hicks' },
    roomLine: '[room: the stall]',
    standing: 'trust 0 · warmth 0 (a stranger)',
    notes: [],
    exchanges: [
      { speaker: 'Hicks', text: 'I paid off the debt.' },
      { speaker: 'Nix', text: 'All of it?' },
    ],
    recap: 'old recap',
    page: 'old page',
    ...over,
  });

  it('lists unkeyed notes (at most 10) to key', () => {
    for (let i = 0; i < 12; i++) journal.note(P, { text: `unkeyed ${i}` }, 'agent');
    const [, user] = scribeMessages(input({ notes: journal.notes(P) }));
    const block = user.content.slice(user.content.indexOf('Give keywords to these notes'));
    expect((block.match(/\bn\d+\b/g) ?? []).length).toBe(SCRIBE_KEY_BATCH);
  });

  it('on a turn, asks for a recap only when they part or the night ends', () => {
    const [system] = scribeMessages(input());
    expect(system.content).toContain('RECAP: only if this turn ends the night');
    expect(system.content).not.toContain('DOSSIER:');
  });

  it('keeps jobs and quests apart', () => {
    const [system] = scribeMessages(input());
    expect(system.content).toContain(JOBS_APART);
  });

  it('includes the old recap and page only on an end', () => {
    expect(scribeMessages(input())[1].content).not.toContain('old recap');
    const end = scribeMessages(input({ kind: 'end' }))[1].content;
    expect(end).toContain('old recap');
    expect(end).toContain('old page');
  });

  it('a reply with a clock gets the clock line, the TIME section and time in the template; one without gets none (time backstop)', () => {
    const [sys, user] = scribeMessages(input({ clock: 4030 }));
    expect(user.content).toContain('[clock: Day 3, Sat 19:10]');
    expect(sys.content).toContain('TIME:');
    // Only an hour the story has reached, never one planned for later (final review I2).
    expect(sys.content).toContain('not a time planned, promised or mentioned for later');
    expect(sys.content).toContain('{"notes":[],"standing":null,"lights":[],"time":null,"recap":null,"dossier":null}');
    const [sys0, user0] = scribeMessages(input({ clock: null }));
    expect(user0.content).not.toContain('[clock:');
    expect(sys0.content).not.toContain('TIME:');
    expect(sys0.content).not.toContain('"time"');
  });

  it('the answer template is the empty answer; no example op names a real-looking id (final review I1)', () => {
    const [system] = scribeMessages(input());
    expect(system.content).toContain('{"notes":[],"standing":null,"lights":[],"recap":null,"dossier":null}');
    expect(system.content).not.toMatch(/"id":"n\d/);
  });

  it('asks for no names of the two of them and no everyday words as keywords (final review I6)', () => {
    const [system] = scribeMessages(input());
    expect(system.content).toContain("not Nix's or Hicks's names");
  });

  it('asks for one fact per note, standing only for what still matters next week, keywords as said (hand-check 2026-10-16)', () => {
    const [system] = scribeMessages(input());
    expect(system.content).toContain('One fact per note: a new fact is a new note');
    expect(system.content).toContain('Leave it null unless');
    expect(system.content).toContain('something Hicks said or did, never what Nix or anyone else did');
    expect(system.content).toContain('written the way they would be said');
  });

  it('standing: the reason before the sign, lies and dodges go down, trust and warmth apart, ±1 only (pace fix 2026-10-16)', () => {
    const [system] = scribeMessages(input());
    expect(system.content).toContain('Decide the reason first, then its sign');
    expect(system.content).toContain('a lie, a dodge, hiding something');
    expect(system.content).toContain('Trust and warmth usually move apart');
    expect(system.content).toContain('Each is -1, 0 or +1');
    expect(system.content).not.toContain('±2');
    expect(system.content).toContain('{"reason":"a few words","trust":n,"warmth":n}');
  });

  it('names who spoke and says it never writes story', () => {
    const [system, user] = scribeMessages(input());
    expect(system.role).toBe('system');
    expect(system.content).toContain('You never write story');
    expect(user.content).toContain('Hicks: I paid off the debt.');
    expect(user.content).toContain('Nix: All of it?');
  });
});
